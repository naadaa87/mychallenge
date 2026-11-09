// 마이챌린지(마챌) API — Cloudflare Pages Functions + D1
// 모든 경로는 /api/* 로 들어온다. 규칙은 MC-02~MC-05 문서를 따른다.

import {
  HttpError, bad, unauth, forbid, notfound, json, readJson, parseJ, J, nowIso, today,
  one, all, run, insert, getSettings, hashPassword, verifyPassword, randomToken, inviteCode,
  sessionCookie, clearCookie, currentUser, requireUser, requireStaff, requireLevel, isStaff, lvlAtLeast,
  addPoints, pointsOf, maybeAutoPromote, setLevel, grantBadge, badgeCount, notify, notifyStaff, audit,
  str, must, intv, getCookie, COOKIE, HttpError as HttpErr, markCookie, jsonWithCookies,
} from '../_lib/util.js';
import { POLICY_VERSION } from '../_site/config.js';
import { LEVELS, LEVEL_NAMES, FIELDS, ROLES, ROLE_WEIGHTS, BADGE_NAMES, levelIndex, quarterOf } from '../_lib/rules.js';
import { computeSettlement, buildPayouts, RULE_VERSION } from '../_lib/settlement.js';

const routes = [];
const on = (method, pattern, handler) => routes.push({ method, parts: pattern.split('/').filter(Boolean), handler });

function match(parts, pathParts) {
  if (parts.length !== pathParts.length) return null;
  const params = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(':')) params[parts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    else if (parts[i] !== pathParts[i]) return null;
  }
  return params;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathParts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const db = env.DB;
  if (!db) return json({ error: 'D1 바인딩(DB)이 설정되지 않았습니다. README의 배포 안내를 확인하세요.' }, 500);
  try {
    for (const r of routes) {
      if (r.method !== request.method) continue;
      const params = match(r.parts, pathParts);
      if (!params) continue;
      const settings = await getSettings(db);
      const user = await currentUser(db, request);
      const ctx = { db, env, request, url, params, query: Object.fromEntries(url.searchParams), user, settings };
      const result = await r.handler(ctx);
      if (result instanceof Response) return result;
      return json(result ?? { ok: true });
    }
    return json({ error: '없는 API 경로입니다' }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...(e.extra || {}) }, e.status);
    console.error(e);
    return json({ error: '서버 오류: ' + (e.message || e) }, 500);
  }
}

// ---------- 공통 로더 ----------
async function loadChallenge(db, id) {
  const c = await one(db, 'SELECT c.*, u.nickname AS leader_nickname, r.name AS round_name, r.start_date AS round_start, r.end_date AS round_end FROM challenges c JOIN users u ON u.id = c.leader_id LEFT JOIN rounds r ON r.id = c.round_id WHERE c.id = ?', id);
  if (!c) throw notfound('챌린지를 찾을 수 없습니다');
  c.proposal = parseJ(c.proposal, {}); c.review = parseJ(c.review, null); c.public_numbers = parseJ(c.public_numbers, {});
  return c;
}
async function membership(db, cid, uid) { if (!uid) return null; return one(db, 'SELECT * FROM group_members WHERE challenge_id = ? AND user_id = ?', cid, uid); }
async function activeMembers(db, cid) {
  return all(db, "SELECT gm.*, u.nickname, u.level FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.challenge_id = ? AND gm.status = 'active' ORDER BY CASE gm.role WHEN 'leader' THEN 0 ELSE 1 END, gm.joined_at", cid);
}
async function latestAgreement(db, cid) {
  const a = await one(db, 'SELECT * FROM agreements WHERE challenge_id = ? ORDER BY version DESC LIMIT 1', cid);
  if (a) { a.clauses = parseJ(a.clauses, {}); a.signatures = await all(db, 'SELECT s.user_id, s.signed_at, u.nickname FROM signatures s JOIN users u ON u.id = s.user_id WHERE s.agreement_id = ?', a.id); }
  return a;
}
function canWriteGroup(user, m) { return isStaff(user) || (m && m.status === 'active'); }
function isLeaderOf(user, c, m) { return isStaff(user) || c.leader_id === user.id || (m && m.role === 'leader' && m.status === 'active'); }
function canSeeLogs(user, m, settings) { return isStaff(user) || (m && m.status === 'active') || lvlAtLeast(user, settings.visibility.group_logs); }
const levelName = l => LEVEL_NAMES[l] || l;

// =====================================================================
// 공개
// =====================================================================
on('GET', '/public/status', async ({ db }) => {
  const c = await one(db, 'SELECT COUNT(*) AS c FROM users');
  return { setup_needed: (c?.c || 0) === 0 };
});

on('GET', '/public/stats', async ({ db }) => {
  const members = await one(db, "SELECT COUNT(*) AS c FROM users WHERE status = 'active' AND level <> 'L0'");
  const active = await one(db, "SELECT COUNT(*) AS c FROM challenges WHERE stage IN ('active','settling')");
  const dist = await all(db, "SELECT stage, public_numbers FROM challenges WHERE stage IN ('closed','stopped')");
  let with_sales = 0, without_sales = 0, stopped = 0;
  for (const d of dist) { if (d.stage === 'stopped') stopped++; else if (parseJ(d.public_numbers, {})?.has_sales) with_sales++; else without_sales++; }
  const papers = await one(db, "SELECT COUNT(*) AS c FROM papers WHERE status IN ('approved','published')");
  const first_sales = await one(db, "SELECT COUNT(DISTINCT user_id) AS c FROM badges WHERE code = 'first_sale' AND revoked_at IS NULL");
  return { members: members?.c || 0, active_challenges: active?.c || 0, closed: { with_sales, without_sales, stopped }, papers: papers?.c || 0, first_sales: first_sales?.c || 0 };
});

on('GET', '/public/levels', async ({ settings }) => ({ levels: LEVELS.map(l => ({ code: l, name: LEVEL_NAMES[l] })), rules: settings.levels, visibility: settings.visibility, points: settings.points }));

on('GET', '/public/papers', async ({ db }) => {
  const rows = await all(db, "SELECT p.id, p.form, p.private_fields, p.published_at, c.title, c.field_code FROM papers p JOIN challenges c ON c.id = p.challenge_id WHERE p.status IN ('approved','published') AND p.publish_scope = 'public' ORDER BY p.published_at DESC LIMIT 50");
  return rows.map(r => paperSummary(r));
});

// 일정 시각은 운영진이 입력한 한국 시각(KST) 그대로 저장한다. 비교도 KST 기준으로.
const KST_NOW = "datetime('now','+9 hours')";
on('GET', '/public/events', async ({ db }) => all(db, `SELECT id, type, title, starts_at, location, min_level FROM events WHERE starts_at >= ${KST_NOW} ORDER BY starts_at LIMIT 10`));

const clientIp = request => request.headers.get('cf-connecting-ip') || null;
async function recordConsents(db, request, subjectType, subjectId, kinds) {
  for (const k of kinds) await run(db, 'INSERT INTO consents (subject_type, subject_id, kind, version, ip) VALUES (?,?,?,?,?)', subjectType, subjectId, k, POLICY_VERSION, clientIp(request));
}

on('POST', '/apply', async ({ db, request }) => {
  const b = await readJson(request);
  must(b.name, '이름'); must(b.email, '이메일');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) throw bad('이메일 형식을 확인해 주세요');
  if (!b.consent_privacy) throw bad('개인정보 수집·이용에 동의해야 신청할 수 있습니다');
  if (!b.consent_public) throw bad('결과 공개 원칙에 동의해야 신청할 수 있습니다');
  const dup = await one(db, "SELECT id FROM applications WHERE email = ? AND status = 'pending'", b.email.toLowerCase());
  if (dup) throw bad('이미 접수된 신청이 있습니다. 운영본부의 연락을 기다려 주세요');
  const form = {};
  for (const k of ['job', 'years', 'hours_weekday', 'hours_weekend', 'experience', 'interests', 'why_group', 'share_opinion', 'side_job_check', 'consent_public', 'can_attend', 'give', 'referrer', 'question']) form[k] = str(b[k], 1000);
  const id = await insert(db, 'INSERT INTO applications (name, email, phone, form) VALUES (?,?,?,?)', str(b.name, 50), b.email.toLowerCase(), str(b.phone, 30), J(form));
  await recordConsents(db, request, 'application', id, ['privacy', 'public_results']);
  await notifyStaff(db, '새 가입 신청', `${b.name}님이 지원했습니다.`, '#/admin/applications');
  return { ok: true, id };
});

// =====================================================================
// 인증·내 정보
// =====================================================================
on('POST', '/setup', async ({ db, request }) => {
  const c = await one(db, 'SELECT COUNT(*) AS c FROM users');
  if ((c?.c || 0) > 0) throw forbid('이미 초기 설정이 끝났습니다');
  const b = await readJson(request);
  must(b.email, '이메일'); must(b.password, '비밀번호'); must(b.name, '이름');
  if (String(b.password).length < 8) throw bad('비밀번호는 8자 이상이어야 합니다');
  const id = await insert(db, "INSERT INTO users (email, password_hash, name, nickname, level, role, onboarded) VALUES (?,?,?,?,'L5','staff',1)", b.email.toLowerCase(), await hashPassword(b.password), str(b.name, 50), str(b.nickname || b.name, 30));
  await run(db, "INSERT INTO level_history (user_id, from_level, to_level, reason) VALUES (?, NULL, 'L5', '초기 운영자')", id);
  await grantBadge(db, id, 'founder', id);
  await audit(db, id, 'setup', 'users:' + id);
  return login(db, id);
});

async function login(db, userId) {
  const token = randomToken(32);
  const exp = new Date(Date.now() + 30 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  await run(db, 'INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)', token, userId, exp);
  await run(db, "UPDATE users SET last_seen_at = datetime('now') WHERE id = ?", userId);
  return jsonWithCookies({ ok: true }, [sessionCookie(token), markCookie(true)]);
}

on('POST', '/auth/register', async ({ db, request }) => {
  const b = await readJson(request);
  must(b.invite_code, '초대 코드'); must(b.email, '이메일'); must(b.password, '비밀번호'); must(b.name, '이름'); must(b.nickname, '닉네임');
  if (String(b.password).length < 8) throw bad('비밀번호는 8자 이상이어야 합니다');
  if (!b.agree_terms || !b.agree_privacy) throw bad('이용약관과 개인정보 수집·이용에 동의해야 가입할 수 있습니다');
  const app = await one(db, "SELECT * FROM applications WHERE invite_code = ? AND status = 'approved'", String(b.invite_code).trim().toUpperCase());
  if (!app) throw bad('초대 코드가 올바르지 않거나 이미 사용됐습니다');
  if (app.email !== String(b.email).toLowerCase()) throw bad('지원서에 적은 이메일로 가입해 주세요');
  const dup = await one(db, 'SELECT id FROM users WHERE email = ?', app.email);
  if (dup) throw bad('이미 가입된 이메일입니다');
  const form = parseJ(app.form, {});
  const id = await insert(db, "INSERT INTO users (email, password_hash, name, nickname, phone, level, interests) VALUES (?,?,?,?,?,'L0',?)", app.email, await hashPassword(b.password), str(b.name, 50), str(b.nickname, 30), str(b.phone || app.phone, 30), str(form.interests, 200));
  await run(db, "UPDATE applications SET status = 'joined' WHERE id = ?", app.id);
  await recordConsents(db, request, 'user', id, ['terms', 'privacy']);
  await run(db, "INSERT INTO level_history (user_id, from_level, to_level, reason) VALUES (?, NULL, 'L0', '가입')", id);
  if (form.referrer) {
    const ref = await one(db, 'SELECT id FROM users WHERE nickname = ? OR email = ?', form.referrer, form.referrer);
    if (ref) await run(db, 'INSERT INTO notifications (user_id, title, body) VALUES (?,?,?)', ref.id, '추천한 분이 가입했습니다', '온보딩을 마치고 챌린저가 되면 추천 포인트가 적립됩니다.');
  }
  return login(db, id);
});

const LOGIN_WINDOW = "datetime('now','-15 minutes')";
on('POST', '/auth/login', async ({ db, request }) => {
  const b = await readJson(request);
  const email = String(b.email || '').trim().toLowerCase();
  const ip = clientIp(request);
  const byEmail = (await one(db, `SELECT COUNT(*) AS c FROM login_attempts WHERE email = ? AND created_at >= ${LOGIN_WINDOW}`, email))?.c || 0;
  const byIp = ip ? ((await one(db, `SELECT COUNT(*) AS c FROM login_attempts WHERE ip = ? AND created_at >= ${LOGIN_WINDOW}`, ip))?.c || 0) : 0;
  if (byEmail >= 10 || byIp >= 30) throw new HttpErr(429, '로그인 시도가 너무 많습니다. 15분 뒤에 다시 시도해 주세요');
  const u = await one(db, 'SELECT id, password_hash, status FROM users WHERE email = ?', email);
  if (!u || !(await verifyPassword(String(b.password || ''), u.password_hash))) {
    await run(db, 'INSERT INTO login_attempts (email, ip) VALUES (?,?)', email, ip);
    await run(db, "DELETE FROM login_attempts WHERE created_at < datetime('now','-1 day')");
    throw unauth('이메일 또는 비밀번호가 맞지 않습니다');
  }
  if (u.status === 'removed') throw forbid('이용이 제한된 계정입니다');
  await run(db, 'DELETE FROM login_attempts WHERE email = ?', email);
  return login(db, u.id);
});

on('POST', '/auth/logout', async ({ db, request }) => {
  const t = getCookie(request, COOKIE);
  if (t) await run(db, 'DELETE FROM sessions WHERE token = ?', t);
  return jsonWithCookies({ ok: true }, [clearCookie(), markCookie(false)]);
});

// 회원 탈퇴: 개인정보는 지우고, 다른 사람과 함께 만든 기록(합의서·장부·정산)은 이름 없이 남긴다
on('POST', '/me/withdraw', async ({ db, request, user }) => {
  requireUser(user);
  const b = await readJson(request);
  const row = await one(db, 'SELECT password_hash, email FROM users WHERE id = ?', user.id);
  if (!(await verifyPassword(String(b.password || ''), row.password_hash))) throw bad('비밀번호가 맞지 않습니다');
  const busy = await one(db, "SELECT c.title FROM group_members gm JOIN challenges c ON c.id = gm.challenge_id WHERE gm.user_id = ? AND gm.status IN ('active','applied') AND c.stage IN ('recruiting','agreement','active','settling') LIMIT 1", user.id);
  if (busy) throw bad(`참여 중인 챌린지(${busy.title})가 있어 지금은 탈퇴할 수 없습니다. 그룹장 또는 운영본부와 먼저 정리해 주세요`);
  const leading = await one(db, "SELECT title FROM challenges WHERE leader_id = ? AND stage IN ('proposed','review','recruiting','agreement','active','settling') LIMIT 1", user.id);
  if (leading) throw bad(`그룹장으로 이끄는 챌린지(${leading.title})가 끝나지 않았습니다. 종료 또는 중단 처리 뒤에 탈퇴할 수 있습니다`);
  const unpaid = await one(db, "SELECT COUNT(*) AS c FROM settlement_payouts WHERE user_id = ? AND status IN ('pending','held')", user.id);
  if ((unpaid?.c || 0) > 0) throw bad('아직 지급이 끝나지 않은 정산이 있습니다. 지급을 받은 뒤 탈퇴해 주세요');
  if (user.role === 'staff') {
    const staff = await one(db, "SELECT COUNT(*) AS c FROM users WHERE role = 'staff' AND status = 'active'");
    if ((staff?.c || 0) <= 1) throw bad('마지막 운영진 계정은 탈퇴할 수 없습니다. 다른 운영진을 먼저 지정해 주세요');
  }
  const ghostEmail = `withdrawn-${user.id}-${randomToken(4)}@deleted.invalid`;
  await run(db, "UPDATE users SET email = ?, name = '탈퇴회원', nickname = ?, phone = NULL, bio = NULL, asset_diag = NULL, interests = NULL, password_hash = ?, status = 'removed', role = 'member' WHERE id = ?", ghostEmail, '탈퇴회원' + user.id, await hashPassword(randomToken(16)), user.id);
  const apps = await all(db, 'SELECT id FROM applications WHERE email = ?', row.email);
  await run(db, "UPDATE applications SET name = '탈퇴회원', email = ?, phone = NULL, form = '{}' WHERE email = ?", ghostEmail, row.email);
  await run(db, "UPDATE consents SET ip = NULL WHERE subject_type = 'user' AND subject_id = ?", user.id);
  for (const a of apps) await run(db, "UPDATE consents SET ip = NULL WHERE subject_type = 'application' AND subject_id = ?", a.id);
  await run(db, 'DELETE FROM sessions WHERE user_id = ?', user.id);
  await run(db, 'DELETE FROM notifications WHERE user_id = ?', user.id);
  await audit(db, user.id, 'user.withdraw', 'users:' + user.id);
  return jsonWithCookies({ ok: true }, [clearCookie(), markCookie(false)]);
});

async function meSummary(db, settings, u) {
  const pts = await pointsOf(db, u.id);
  const badges = await all(db, 'SELECT id, code, created_at, evidence FROM badges WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at', u.id);
  const unread = await one(db, 'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL', u.id);
  const groups = await all(db, "SELECT c.id, c.title, c.stage, c.type, c.field_code, gm.role, gm.status AS member_status FROM group_members gm JOIN challenges c ON c.id = gm.challenge_id WHERE gm.user_id = ? AND gm.status IN ('active','applied') ORDER BY c.updated_at DESC", u.id);
  const progress = await levelProgress(db, settings, u, pts, badges);
  return { ...u, asset_diag: parseJ(u.asset_diag, null), level_name: levelName(u.level), points: pts, badges: badges.map(b => ({ ...b, name: BADGE_NAMES[b.code] || b.code })), unread: unread?.c || 0, groups, progress };
}

async function levelProgress(db, settings, u, pts, badges) {
  const count = code => badges.filter(b => b.code === code).length;
  const next = LEVELS[levelIndex(u.level) + 1];
  if (!next) return { next: null, items: [] };
  const items = [];
  const ev = await one(db, "SELECT COUNT(*) AS c FROM registrations WHERE user_id = ? AND status = 'attended'", u.id);
  const days = await one(db, "SELECT (julianday('now') - julianday(created_at)) AS d FROM users WHERE id = ?", u.id);
  if (next === 'L1') items.push({ label: '오리엔테이션 이수 · 원칙 동의', done: !!u.onboarded, cur: u.onboarded ? 1 : 0, goal: 1 });
  if (next === 'L2') {
    const r = settings.levels.L2;
    items.push({ label: `활동 포인트 ${r.points}점`, done: pts.total >= r.points, cur: pts.total, goal: r.points });
    if (r.require_asset_diag) items.push({ label: '자기 자산 진단 제출', done: !!u.asset_diag, cur: u.asset_diag ? 1 : 0, goal: 1 });
    items.push({ label: `마챌데이·세미나 ${r.require_event}회 참석`, done: (ev?.c || 0) >= r.require_event, cur: ev?.c || 0, goal: r.require_event });
    items.push({ label: `가입 후 ${r.min_days}일 경과`, done: (days?.d || 0) >= r.min_days, cur: Math.floor(days?.d || 0), goal: r.min_days });
  }
  if (next === 'L3') {
    items.push({ label: '라운드 1회 완주 (데모데이 발표 + 페이퍼)', done: count('completion') >= 1, cur: count('completion'), goal: 1, or: true });
    items.push({ label: '또는 첫 외부 매출 인증', done: count('first_sale') >= 1, cur: count('first_sale'), goal: 1, or: true });
  }
  if (next === 'L4') {
    items.push({ label: '라운드 2회 완주', done: count('completion') >= 2, cur: count('completion'), goal: 2 });
    items.push({ label: '리더 교육 이수 + 운영본부 면담 (심사에서 확인)', done: false, cur: 0, goal: 1, manual: true });
  }
  if (next === 'L5') {
    items.push({ label: '그룹장으로 성공 챌린지 2건', done: count('leader_completion') >= 2, cur: count('leader_completion'), goal: 2, or: true });
    items.push({ label: '또는 3개월 연속 외부 매출 인증', done: count('repeat_sale') >= 1, cur: count('repeat_sale'), goal: 1, or: true });
  }
  const orItems = items.filter(i => i.or), andItems = items.filter(i => !i.or && !i.manual);
  const eligible = andItems.every(i => i.done) && (orItems.length === 0 || orItems.some(i => i.done));
  return { next, next_name: levelName(next), items, eligible, auto: next === 'L2' || next === 'L1' };
}

on('GET', '/me', async ({ db, settings, user }) => meSummary(db, settings, requireUser(user)));
// 로그인 여부 확인용 — 비로그인도 200으로 응답해 콘솔에 401이 찍히지 않게 한다
on('GET', '/session', async ({ db, settings, user }) => ({ user: user ? await meSummary(db, settings, user) : null }));

on('POST', '/me/onboarding', async ({ db, settings, request, user }) => {
  requireUser(user);
  const b = await readJson(request);
  if (!b.agree) throw bad('마챌 원칙에 동의해야 합니다');
  const answers = b.quiz || {};
  const correct = answers.q1 === 'b' && answers.q2 === 'a' && answers.q3 === 'b';
  if (!correct) throw bad('확인 문항을 다시 읽어 주세요. 원칙을 이해한 뒤 넘어갈 수 있습니다', { wrong: true });
  await run(db, 'UPDATE users SET onboarded = 1 WHERE id = ?', user.id);
  if (user.level === 'L0') { await setLevel(db, user.id, 'L1', '오리엔테이션 이수', null); await notify(db, user.id, '챌린저가 되셨습니다', '세미나·스터디 참여와 커피챗이 열렸습니다. 먼저 자기 자산 진단을 적어 보세요.', '#/me'); }
  const app = await one(db, "SELECT form FROM applications WHERE email = ? AND status = 'joined'", user.email);
  const ref = parseJ(app?.form, {})?.referrer;
  if (ref) { const r = await one(db, 'SELECT id FROM users WHERE nickname = ? OR email = ?', ref, ref); if (r) await addPoints(db, settings, r.id, 'referral', 'user', user.id); }
  return { ok: true };
});

on('PUT', '/me/password', async ({ db, request, user }) => {
  requireUser(user);
  const b = await readJson(request);
  const row = await one(db, 'SELECT password_hash FROM users WHERE id = ?', user.id);
  if (!(await verifyPassword(String(b.current || ''), row.password_hash))) throw bad('지금 비밀번호가 맞지 않습니다');
  if (String(b.next || '').length < 8) throw bad('새 비밀번호는 8자 이상이어야 합니다');
  await run(db, 'UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(String(b.next)), user.id);
  const t = getCookie(request, COOKIE);
  await run(db, 'DELETE FROM sessions WHERE user_id = ? AND token <> ?', user.id, t || '');
  return { ok: true };
});

on('PUT', '/me/profile', async ({ db, request, user }) => {
  requireUser(user);
  const b = await readJson(request);
  await run(db, 'UPDATE users SET nickname = COALESCE(?, nickname), phone = COALESCE(?, phone), interests = COALESCE(?, interests), bio = COALESCE(?, bio), has_business = COALESCE(?, has_business) WHERE id = ?',
    str(b.nickname, 30), str(b.phone, 30), str(b.interests, 200), str(b.bio, 500), b.has_business == null ? null : (b.has_business ? 1 : 0), user.id);
  return { ok: true };
});

on('POST', '/me/asset-diag', async ({ db, settings, request, user }) => {
  requireUser(user);
  const b = await readJson(request);
  const diag = {}; for (const k of ['time', 'money', 'skills', 'experience', 'relations', 'space', 'goal']) diag[k] = str(b[k], 1000);
  if (!diag.time || !diag.skills) throw bad('시간과 기술 항목은 꼭 적어 주세요');
  await run(db, 'UPDATE users SET asset_diag = ? WHERE id = ?', J(diag), user.id);
  const promoted = await maybeAutoPromote(db, settings, user.id);
  return { ok: true, promoted };
});

on('GET', '/me/points', async ({ db, settings, user }) => {
  requireUser(user);
  const rows = await all(db, 'SELECT action, points, ref_type, ref_id, created_at FROM points_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', user.id);
  return { totals: await pointsOf(db, user.id), rows: rows.map(r => ({ ...r, label: settings.points[r.action]?.label || r.action })) };
});

on('GET', '/me/notifications', async ({ db, user }) => { requireUser(user); return all(db, 'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', user.id); });
on('POST', '/me/notifications/read', async ({ db, request, user }) => {
  requireUser(user);
  const b = await readJson(request);
  if (b.all) await run(db, "UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL", user.id);
  else if (b.id) await run(db, "UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND id = ?", user.id, intv(b.id, 'id'));
  return { ok: true };
});

on('POST', '/me/promotion', async ({ db, settings, request, user }) => {
  requireUser(user);
  const b = await readJson(request);
  const me = await meSummary(db, settings, user);
  const next = me.progress.next;
  if (!next || levelIndex(next) < 3) throw bad('L3(어치버)부터 신청으로 승급합니다. 그 아래는 조건을 채우면 자동으로 오릅니다');
  const dup = await one(db, "SELECT id FROM promotion_requests WHERE user_id = ? AND status = 'pending'", user.id);
  if (dup) throw bad('이미 심사 중인 신청이 있습니다');
  const id = await insert(db, 'INSERT INTO promotion_requests (user_id, target_level, note, evidence) VALUES (?,?,?,?)', user.id, next, str(b.note, 1000), str(b.evidence, 1000));
  await notifyStaff(db, `승급 신청: ${user.nickname} → ${levelName(next)}`, me.progress.eligible ? '필수 조건 충족' : '필수 조건 미충족 (확인 필요)', '#/admin/promotions');
  return { ok: true, id };
});

// =====================================================================
// 대시보드
// =====================================================================
on('GET', '/dashboard', async ({ db, settings, user }) => {
  requireUser(user);
  const me = await meSummary(db, settings, user);
  const tasks = [];
  for (const g of me.groups.filter(g => g.member_status === 'active')) {
    const a = await latestAgreement(db, g.id);
    if (a && ['draft', 'signing'].includes(a.status) && !a.signatures.some(s => s.user_id === user.id)) tasks.push({ type: 'sign', text: `${g.title} 합의서에 서명해 주세요`, link: `#/groups/${g.id}/agreement` });
    const ck = await one(db, 'SELECT ci.id, ci.week_no FROM checkins ci WHERE ci.challenge_id = ? AND NOT EXISTS (SELECT 1 FROM checkin_entries e WHERE e.checkin_id = ci.id AND e.user_id = ?) ORDER BY ci.week_no DESC LIMIT 1', g.id, user.id);
    if (ck) tasks.push({ type: 'checkin', text: `${g.title} ${ck.week_no}주차 체크인을 제출해 주세요`, link: `#/groups/${g.id}/checkin` });
    const st = await one(db, "SELECT s.id FROM settlements s WHERE s.challenge_id = ? AND s.status IN ('confirming','disputed') AND NOT EXISTS (SELECT 1 FROM settlement_confirmations sc WHERE sc.settlement_id = s.id AND sc.user_id = ?) LIMIT 1", g.id, user.id);
    if (st) tasks.push({ type: 'settlement', text: `${g.title} 정산표를 확인해 주세요`, link: `#/settlements/${st.id}` });
  }
  const events = await all(db, `SELECT id, type, title, starts_at, location FROM events WHERE starts_at >= datetime('now','+6 hours') ORDER BY starts_at LIMIT 5`);
  const notis = await all(db, 'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', user.id);
  const feed = await feedItems(db, 8);
  return { me, tasks, events, notifications: notis, feed };
});

// =====================================================================
// 라운드
// =====================================================================
on('GET', '/rounds', async ({ db }) => all(db, 'SELECT * FROM rounds ORDER BY start_date DESC'));
on('POST', '/admin/rounds', async ({ db, request, user }) => {
  requireStaff(user); const b = await readJson(request);
  must(b.name, '라운드 이름'); must(b.start_date, '시작일'); must(b.end_date, '종료일');
  const id = await insert(db, 'INSERT INTO rounds (name, start_date, end_date, status) VALUES (?,?,?,?)', str(b.name, 50), b.start_date, b.end_date, b.status || 'planning');
  await audit(db, user.id, 'round.create', 'rounds:' + id, b);
  return { ok: true, id };
});
on('PUT', '/admin/rounds/:id', async ({ db, request, user, params }) => {
  requireStaff(user); const b = await readJson(request);
  await run(db, 'UPDATE rounds SET name = COALESCE(?, name), start_date = COALESCE(?, start_date), end_date = COALESCE(?, end_date), status = COALESCE(?, status) WHERE id = ?', str(b.name, 50), b.start_date || null, b.end_date || null, b.status || null, params.id);
  await audit(db, user.id, 'round.update', 'rounds:' + params.id, b);
  return { ok: true };
});

// =====================================================================
// 챌린지 보드
// =====================================================================
on('GET', '/challenges', async ({ db, settings, user, query }) => {
  requireLevel(user, settings.visibility.card, '챌린저부터 챌린지 보드를 볼 수 있습니다');
  const where = []; const p = [];
  if (query.stage) { where.push('c.stage = ?'); p.push(query.stage); }
  if (query.field) { where.push('c.field_code = ?'); p.push(query.field); }
  if (query.round) { where.push('c.round_id = ?'); p.push(query.round); }
  if (query.type) { where.push('c.type = ?'); p.push(query.type); }
  if (!isStaff(user)) { where.push("c.stage NOT IN ('proposed','review','rejected')"); }
  const rows = await all(db, `SELECT c.id, c.title, c.type, c.field_code, c.stage, c.round_id, c.leader_id, c.summary, c.public_numbers, c.updated_at, u.nickname AS leader_nickname, r.name AS round_name,
      (SELECT COUNT(*) FROM group_members gm WHERE gm.challenge_id = c.id AND gm.status = 'active') AS member_count,
      (SELECT status FROM group_members gm WHERE gm.challenge_id = c.id AND gm.user_id = ?) AS my_status
    FROM challenges c JOIN users u ON u.id = c.leader_id LEFT JOIN rounds r ON r.id = c.round_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.updated_at DESC LIMIT 200`, user.id, ...p);
  return rows.map(r => ({ ...r, public_numbers: parseJ(r.public_numbers, {}), field_name: FIELDS[r.field_code] || r.field_code }));
});

on('POST', '/challenges', async ({ db, settings, request, user }) => {
  requireUser(user);
  const b = await readJson(request);
  const type = ['solo', 'group', 'official'].includes(b.type) ? b.type : 'group';
  must(b.title, '제목'); if (!FIELDS[b.field_code]) throw bad('분야 코드를 선택해 주세요');
  if (type === 'solo') requireLevel(user, 'L1');
  if (type === 'group') requireLevel(user, settings.visibility.propose, '그룹 챌린지 제안은 리더 등급부터 할 수 있습니다');
  if (type === 'official') requireStaff(user);
  const proposal = {};
  for (const k of ['pain', 'product', 'first_sale_plan', 'roles_needed', 'budget', 'preset', 'ownership', 'assets', 'conflict_check', 'after_round', 'goal']) proposal[k] = str(b.proposal?.[k], 2000);
  const stage = type === 'solo' ? 'active' : (type === 'official' ? 'recruiting' : 'review');
  const id = await insert(db, 'INSERT INTO challenges (title, type, field_code, stage, round_id, leader_id, summary, proposal, public_numbers) VALUES (?,?,?,?,?,?,?,?,?)',
    str(b.title, 80), type, b.field_code, stage, b.round_id ? intv(b.round_id, '라운드') : null, user.id, str(b.summary, 500), J(proposal), J({ has_sales: false, customers_band: '0', hours: 0 }));
  await run(db, "INSERT INTO group_members (challenge_id, user_id, role, role_weight, status, joined_at) VALUES (?,?,'leader',1.0,'active',datetime('now'))", id, user.id);
  if (type === 'group') await notifyStaff(db, '새 챌린지 제안', `${user.nickname} · ${b.title}`, '#/admin/challenges');
  await audit(db, user.id, 'challenge.create', 'challenges:' + id, { type, title: b.title });
  return { ok: true, id, stage };
});

on('GET', '/challenges/:id', async ({ db, settings, user, params }) => {
  requireLevel(user, settings.visibility.card);
  const c = await loadChallenge(db, params.id);
  const m = await membership(db, c.id, user.id);
  if (['proposed', 'review', 'rejected'].includes(c.stage) && !isStaff(user) && c.leader_id !== user.id) throw forbid('심사 중인 챌린지는 제안자와 운영진만 볼 수 있습니다');
  const members = await activeMembers(db, c.id);
  const milestones = await all(db, 'SELECT * FROM milestones WHERE challenge_id = ? ORDER BY due_date, id', c.id);
  const paper = await one(db, 'SELECT id, status, publish_scope, form, private_fields FROM papers WHERE challenge_id = ?', c.id);
  const seeLogs = canSeeLogs(user, m, settings);
  const out = { ...c, field_name: FIELDS[c.field_code] || c.field_code, members: members.map(x => ({ user_id: x.user_id, nickname: x.nickname, role: x.role, role_name: ROLES[x.role], level: x.level })), milestones, my_membership: m, can_see_logs: seeLogs, is_leader: isLeaderOf(user, c, m), is_staff: isStaff(user), paper: paper ? paperSummary({ ...paper, title: c.title, field_code: c.field_code }) : null };
  if (!isStaff(user) && c.leader_id !== user.id) { delete out.proposal; delete out.review; }
  if (seeLogs) {
    out.done_logs = await all(db, 'SELECT d.*, u.nickname FROM done_logs d JOIN users u ON u.id = d.user_id WHERE d.challenge_id = ? AND d.cancelled_at IS NULL ORDER BY d.created_at DESC LIMIT 50', c.id);
    out.checkins = await all(db, 'SELECT ci.*, (SELECT COUNT(*) FROM checkin_entries e WHERE e.checkin_id = ci.id) AS submitted FROM checkins ci WHERE ci.challenge_id = ? ORDER BY ci.week_no DESC', c.id);
    if (!m && !isStaff(user)) await run(db, "INSERT INTO view_logs (user_id, target_type, target_id) VALUES (?,'group_logs',?)", user.id, c.id);
  }
  if (c.stage === 'recruiting' && (isLeaderOf(user, c, m))) out.applicants = await all(db, "SELECT gm.user_id, gm.apply_note, gm.created_at, u.nickname, u.level, u.interests FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.challenge_id = ? AND gm.status = 'applied'", c.id);
  return out;
});

on('PUT', '/challenges/:id', async ({ db, request, user, params }) => {
  requireUser(user);
  const c = await loadChallenge(db, params.id); const m = await membership(db, c.id, user.id);
  if (!isLeaderOf(user, c, m)) throw forbid('그룹장만 수정할 수 있습니다');
  const b = await readJson(request);
  const pn = { ...c.public_numbers };
  if (b.public_numbers) {
    if (b.public_numbers.has_sales !== undefined) pn.has_sales = !!b.public_numbers.has_sales;
    if (b.public_numbers.customers_band !== undefined) pn.customers_band = str(b.public_numbers.customers_band, 20);
    if (b.public_numbers.hours !== undefined) pn.hours = intv(b.public_numbers.hours, '투입 시간', { min: 0 });
  }
  await run(db, "UPDATE challenges SET title = COALESCE(?, title), summary = COALESCE(?, summary), field_code = COALESCE(?, field_code), public_numbers = ?, updated_at = datetime('now') WHERE id = ?", str(b.title, 80), str(b.summary, 500), FIELDS[b.field_code] ? b.field_code : null, J(pn), c.id);
  return { ok: true };
});

on('POST', '/challenges/:id/apply', async ({ db, request, user, params }) => {
  requireLevel(user, 'L2', '그룹 챌린지 참여는 메이커 등급부터 가능합니다');
  const c = await loadChallenge(db, params.id);
  if (c.stage !== 'recruiting') throw bad('모집 중인 챌린지가 아닙니다');
  if (c.type === 'solo') throw bad('솔로 챌린지에는 참여할 수 없습니다');
  const existing = await membership(db, c.id, user.id);
  if (existing && existing.status !== 'rejected' && existing.status !== 'left') throw bad('이미 지원했거나 참여 중입니다');
  const other = await one(db, "SELECT COUNT(*) AS c FROM group_members gm JOIN challenges ch ON ch.id = gm.challenge_id WHERE gm.user_id = ? AND gm.status = 'active' AND gm.role <> 'leader' AND ch.type <> 'solo' AND ch.stage IN ('recruiting','agreement','active','settling')", user.id);
  if ((other?.c || 0) >= 1) throw bad('그룹 챌린지는 동시에 1개만 그룹원으로 참여할 수 있습니다');
  const b = await readJson(request);
  if (existing) await run(db, "UPDATE group_members SET status = 'applied', apply_note = ?, created_at = datetime('now') WHERE id = ?", str(b.note, 500), existing.id);
  else await run(db, "INSERT INTO group_members (challenge_id, user_id, status, apply_note) VALUES (?,?,'applied',?)", c.id, user.id, str(b.note, 500));
  await notify(db, c.leader_id, `${user.nickname}님이 지원했습니다`, c.title, `#/challenges/${c.id}`);
  return { ok: true };
});

on('POST', '/challenges/:id/members/:uid', async ({ db, settings, request, user, params }) => {
  requireUser(user);
  const c = await loadChallenge(db, params.id); const m = await membership(db, c.id, user.id);
  if (!isLeaderOf(user, c, m)) throw forbid('그룹장만 처리할 수 있습니다');
  const target = await membership(db, c.id, Number(params.uid));
  if (!target) throw notfound('지원 기록이 없습니다');
  const b = await readJson(request);
  if (b.action === 'accept') {
    const cnt = await one(db, "SELECT COUNT(*) AS c FROM group_members WHERE challenge_id = ? AND status = 'active'", c.id);
    if ((cnt?.c || 0) >= (settings.max_group || 8)) throw bad('그룹 정원(8명)이 찼습니다');
    await run(db, "UPDATE group_members SET status = 'active', role = COALESCE(?, 'general'), role_weight = ?, joined_at = datetime('now') WHERE id = ?", ROLES[b.role] ? b.role : null, ROLE_WEIGHTS[b.role] || 1.0, target.id);
    await notify(db, target.user_id, '그룹 참여가 수락됐습니다', c.title, `#/groups/${c.id}`);
  } else if (b.action === 'reject') {
    await run(db, "UPDATE group_members SET status = 'rejected' WHERE id = ?", target.id);
    await notify(db, target.user_id, '이번에는 함께하지 못하게 됐습니다', `${c.title} · 다른 챌린지에 지원해 보세요`, '#/challenges');
  } else if (b.action === 'remove') {
    if (target.role === 'leader') throw bad('그룹장은 제외할 수 없습니다. 운영본부에 교체를 요청하세요');
    await run(db, "UPDATE group_members SET status = 'left', left_at = datetime('now'), leave_type = ? WHERE id = ?", b.leave_type === 'unannounced' ? 'unannounced' : 'notice', target.id);
    await notify(db, target.user_id, '그룹에서 이탈 처리됐습니다', `${c.title} · 이탈 시점까지의 기여는 정산에 반영됩니다`, `#/challenges/${c.id}`);
  } else if (b.action === 'role') {
    if (!ROLES[b.role]) throw bad('역할을 선택해 주세요');
    if (b.role === 'leader' && target.role !== 'leader') throw bad('그룹장 변경은 운영본부 승인 절차(MC-03 4.4)로 진행합니다');
    await run(db, 'UPDATE group_members SET role = ?, role_weight = ?, planned_share = ? WHERE id = ?', b.role, Number(b.weight || ROLE_WEIGHTS[b.role] || 1), b.planned_share == null ? target.planned_share : Number(b.planned_share), target.id);
  } else throw bad('알 수 없는 동작입니다');
  await audit(db, user.id, 'member.' + b.action, `challenges:${c.id}/users:${params.uid}`, b);
  return { ok: true };
});

on('POST', '/challenges/:id/stage', async ({ db, settings, request, user, params }) => {
  requireUser(user);
  const c = await loadChallenge(db, params.id); const m = await membership(db, c.id, user.id);
  const b = await readJson(request);
  const to = b.stage;
  if (to === 'agreement') {
    if (!isLeaderOf(user, c, m)) throw forbid();
    if (c.stage !== 'recruiting') throw bad('모집 단계에서만 합의 단계로 넘어갈 수 있습니다');
    const cnt = await one(db, "SELECT COUNT(*) AS c FROM group_members WHERE challenge_id = ? AND status = 'active'", c.id);
    const min = isStaff(user) ? 2 : (settings.min_group || 4);
    if ((cnt?.c || 0) < min) throw bad(`그룹원이 그룹장 포함 ${min}명 이상이어야 합니다 (현재 ${cnt?.c || 0}명)`);
  } else if (to === 'stopped') {
    if (!isLeaderOf(user, c, m)) throw forbid();
    if (!['active', 'settling', 'recruiting', 'agreement'].includes(c.stage)) throw bad('중단할 수 있는 단계가 아닙니다');
  } else if (to === 'closed' || to === 'active' || to === 'recruiting') {
    requireStaff(user);
  } else throw bad('허용되지 않는 단계 변경입니다');
  await run(db, "UPDATE challenges SET stage = ?, updated_at = datetime('now') WHERE id = ?", to, c.id);
  if (to === 'stopped') { await notifyStaff(db, '챌린지 중단', c.title + ' · 페이퍼 제출을 안내해 주세요', `#/challenges/${c.id}`); for (const am of await activeMembers(db, c.id)) await notify(db, am.user_id, '챌린지가 중단됐습니다', `${c.title} · 중단해도 프로젝트 페이퍼는 제출합니다`, `#/groups/${c.id}/paper`); }
  await audit(db, user.id, 'challenge.stage', 'challenges:' + c.id, { from: c.stage, to });
  return { ok: true };
});

on('POST', '/admin/challenges/:id/review', async ({ db, settings, request, user, params }) => {
  requireStaff(user);
  const c = await loadChallenge(db, params.id);
  const b = await readJson(request);
  let total = 0; const scores = {};
  for (const it of settings.review_items) { const s = Number(b.scores?.[it.key] || 0); if (s < 0 || s > 5) throw bad('점수는 1~5'); scores[it.key] = s; total += s * it.weight; }
  const review = { scores, total: Math.round(total * 10) / 10, banned: !!b.banned, conflict: !!b.conflict, decision: b.decision, comment: str(b.comment, 2000), reviewer_id: user.id, at: nowIso() };
  let stage = c.stage;
  if (b.decision === 'approve') { if (review.banned || review.conflict) throw bad('금지 유형 또는 이해충돌이 체크된 챌린지는 승인할 수 없습니다'); if (total < settings.review_pass_score) throw bad(`합계 ${review.total}점으로 기준(${settings.review_pass_score}점)에 미달합니다. 보완 요청 또는 반려로 처리하세요`); stage = 'recruiting'; }
  else if (b.decision === 'revise') stage = 'proposed';
  else if (b.decision === 'reject') stage = 'rejected';
  else throw bad('decision은 approve / revise / reject');
  await run(db, "UPDATE challenges SET review = ?, stage = ?, updated_at = datetime('now') WHERE id = ?", J(review), stage, c.id);
  const msg = { approve: '승인됐습니다. 그룹원 모집을 시작하세요', revise: '보완 요청이 있습니다', reject: '이번에는 반려됐습니다' }[b.decision];
  await notify(db, c.leader_id, `챌린지 심사 결과: ${c.title}`, `${msg}. ${review.comment || ''}`, `#/challenges/${c.id}`);
  await audit(db, user.id, 'challenge.review', 'challenges:' + c.id, review);
  return { ok: true, review, stage };
});

on('POST', '/challenges/:id/resubmit', async ({ db, user, params }) => {
  requireUser(user);
  const c = await loadChallenge(db, params.id);
  if (c.leader_id !== user.id && !isStaff(user)) throw forbid();
  if (c.stage !== 'proposed') throw bad('보완 요청 상태에서만 재제출할 수 있습니다');
  await run(db, "UPDATE challenges SET stage = 'review', updated_at = datetime('now') WHERE id = ?", c.id);
  await notifyStaff(db, '챌린지 재제출', c.title, '#/admin/challenges');
  return { ok: true };
});

on('PUT', '/challenges/:id/proposal', async ({ db, request, user, params }) => {
  requireUser(user);
  const c = await loadChallenge(db, params.id);
  if (c.leader_id !== user.id && !isStaff(user)) throw forbid();
  if (!['proposed', 'review'].includes(c.stage)) throw bad('심사 전에만 제안서를 고칠 수 있습니다');
  const b = await readJson(request);
  const proposal = { ...c.proposal };
  for (const k of Object.keys(proposal).concat(Object.keys(b.proposal || {}))) if (b.proposal?.[k] !== undefined) proposal[k] = str(b.proposal[k], 2000);
  await run(db, "UPDATE challenges SET proposal = ?, title = COALESCE(?, title), summary = COALESCE(?, summary), updated_at = datetime('now') WHERE id = ?", J(proposal), str(b.title, 80), str(b.summary, 500), c.id);
  return { ok: true };
});

on('POST', '/admin/challenges/:id/complete', async ({ db, settings, request, user, params }) => {
  requireStaff(user);
  const c = await loadChallenge(db, params.id);
  const b = await readJson(request);
  const presenters = new Set((b.presenters || []).map(Number));
  const members = await activeMembers(db, c.id);
  const paper = await one(db, "SELECT status FROM papers WHERE challenge_id = ? AND status IN ('review','approved','published')", c.id);
  if (!paper) throw bad('프로젝트 페이퍼가 제출되지 않은 챌린지는 완주 처리할 수 없습니다');
  for (const m of members) {
    if (!presenters.size || presenters.has(m.user_id)) {
      await grantBadge(db, m.user_id, m.role === 'leader' ? 'leader_completion' : 'completion', user.id, `challenge:${c.id}`);
      if (m.role === 'leader') await grantBadge(db, m.user_id, 'completion', user.id, `challenge:${c.id}`);
      await addPoints(db, settings, m.user_id, 'demo_present', 'challenge', c.id);
      await notify(db, m.user_id, '라운드 완주가 기록됐습니다', `${c.title} · 완주 배지가 부여됐습니다`, '#/me');
    }
  }
  await audit(db, user.id, 'challenge.complete', 'challenges:' + c.id, { presenters: [...presenters] });
  return { ok: true };
});

// =====================================================================
// 그룹 공간
// =====================================================================
async function groupCtx(db, settings, user, id, { write = false, leader = false } = {}) {
  requireUser(user);
  const c = await loadChallenge(db, id);
  const m = await membership(db, c.id, user.id);
  if (leader && !isLeaderOf(user, c, m)) throw forbid('그룹장만 할 수 있습니다');
  if (write && !canWriteGroup(user, m)) throw forbid('그룹원만 할 수 있습니다');
  if (!write && !canSeeLogs(user, m, settings)) throw forbid('그룹 공간은 그룹원과 어치버 이상이 볼 수 있습니다');
  return { c, m };
}

on('GET', '/groups/:id', async ({ db, settings, user, params }) => {
  const { c, m } = await groupCtx(db, settings, user, params.id);
  const isMember = isStaff(user) || (m && m.status === 'active');
  const members = await activeMembers(db, c.id);
  const left = await all(db, "SELECT gm.*, u.nickname FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.challenge_id = ? AND gm.status = 'left'", c.id);
  const agreement = await latestAgreement(db, c.id);
  const checkins = await all(db, 'SELECT * FROM checkins WHERE challenge_id = ? ORDER BY week_no DESC', c.id);
  for (const ck of checkins) ck.entries = (await all(db, 'SELECT e.*, u.nickname FROM checkin_entries e JOIN users u ON u.id = e.user_id WHERE e.checkin_id = ?', ck.id)).map(e => ({ ...e, done: parseJ(e.done, []), goals: parseJ(e.goals, []) }));
  const done_logs = await all(db, 'SELECT d.*, u.nickname FROM done_logs d JOIN users u ON u.id = d.user_id WHERE d.challenge_id = ? ORDER BY d.created_at DESC LIMIT 100', c.id);
  const milestones = await all(db, 'SELECT * FROM milestones WHERE challenge_id = ? ORDER BY due_date, id', c.id);
  const settlements = await all(db, 'SELECT id, period_start, period_end, status, result, created_at FROM settlements WHERE challenge_id = ? ORDER BY created_at DESC', c.id);
  const paper = await one(db, 'SELECT * FROM papers WHERE challenge_id = ?', c.id);
  const out = { challenge: { ...c, field_name: FIELDS[c.field_code] }, members: members.map(x => ({ ...x, role_name: ROLES[x.role] })), left, agreement, checkins, done_logs, milestones, is_member: !!isMember, is_leader: isLeaderOf(user, c, m), is_staff: isStaff(user), presets: settings.presets, roles: ROLES, role_weights: ROLE_WEIGHTS, settings: { budget_cap_person: settings.budget_cap_person, budget_cap_group: settings.budget_cap_group, min_settlement: settings.min_settlement, agency_rate: settings.agency_rate, hq_ratio_range: settings.hq_ratio_range, share_adjust_limit: settings.share_adjust_limit },
    settlements: settlements.map(s => ({ ...s, result: summarizeResult(parseJ(s.result, {})) })), paper: paper ? { ...paper, form: parseJ(paper.form, {}), private_fields: parseJ(paper.private_fields, []) } : null };
  if (isMember) {
    out.ledger = await all(db, 'SELECT l.*, u.nickname AS entered_by_name, p.nickname AS payer_name FROM ledger_entries l JOIN users u ON u.id = l.entered_by LEFT JOIN users p ON p.id = l.payer_id WHERE l.challenge_id = ? ORDER BY l.entry_date DESC, l.id DESC', c.id);
    out.ledger_totals = ledgerTotals(out.ledger);
    out.contribution = await contributionDraft(db, c, members, agreement);
  } else {
    await run(db, "INSERT INTO view_logs (user_id, target_type, target_id) VALUES (?,'group_logs',?)", user.id, c.id);
  }
  return out;
});

function ledgerTotals(rows) {
  const t = { revenue_external: 0, revenue_internal: 0, expenses: 0, member_contrib: 0, hq_advance: 0 };
  for (const r of rows) {
    if (r.kind === 'revenue') { if (r.is_external) t.revenue_external += r.amount; else t.revenue_internal += r.amount; }
    else { t.expenses += r.amount; if (r.payer_type === 'member') t.member_contrib += r.amount; if (r.payer_type === 'hq') t.hq_advance += r.amount; }
  }
  t.net = t.revenue_external - t.expenses;
  return t;
}

function summarizeResult(r) { return { status: r.status, N: r.N, D: r.D, A: r.A, L: r.L, P: r.P, carried: r.carried }; }

async function contributionDraft(db, c, members, agreement) {
  const leaderInPool = !!agreement?.clauses?.leader_in_pool;
  const pool = members.filter(m => m.role !== 'leader' || leaderInPool);
  const ckCount = (await one(db, 'SELECT COUNT(*) AS c FROM checkins WHERE challenge_id = ?', c.id))?.c || 0;
  const rows = [];
  for (const m of pool) {
    const done = (await one(db, 'SELECT COUNT(*) AS c FROM done_logs WHERE challenge_id = ? AND user_id = ? AND confirmed_at IS NOT NULL AND cancelled_at IS NULL', c.id, m.user_id))?.c || 0;
    const att = ckCount ? ((await one(db, 'SELECT COUNT(*) AS c FROM checkin_entries e JOIN checkins ci ON ci.id = e.checkin_id WHERE ci.challenge_id = ? AND e.user_id = ?', c.id, m.user_id))?.c || 0) / ckCount : 1;
    rows.push({ user_id: m.user_id, nickname: m.nickname, role: m.role, weight: m.role_weight, done, attendance: Math.round(att * 100) / 100, raw: m.role_weight * (1 + done) * (att || 0.0001), planned_share: m.planned_share, actual_share: m.actual_share });
  }
  const sum = rows.reduce((a, r) => a + r.raw, 0) || 1;
  return rows.map(r => ({ ...r, auto_share: Math.round((r.raw / sum) * 10000) / 10000 }));
}

on('POST', '/groups/:id/milestones/:mid', async ({ db, settings, request, user, params }) => {
  const { c } = await groupCtx(db, settings, user, params.id, { leader: true });
  const m = await one(db, 'SELECT * FROM milestones WHERE id = ? AND challenge_id = ?', params.mid, c.id);
  if (!m) throw notfound('마일스톤이 없습니다');
  const b = await readJson(request);
  if (b.done) await run(db, "UPDATE milestones SET done_at = datetime('now'), evidence = ? WHERE id = ?", str(b.evidence, 500), m.id);
  else await run(db, 'UPDATE milestones SET done_at = NULL WHERE id = ?', m.id);
  return { ok: true };
});

on('POST', '/groups/:id/done-logs', async ({ db, settings, request, user, params }) => {
  const { c } = await groupCtx(db, settings, user, params.id, { write: true });
  const b = await readJson(request);
  must(b.text, '완료한 일');
  const id = await insert(db, 'INSERT INTO done_logs (challenge_id, user_id, text, link, shared) VALUES (?,?,?,?,?)', c.id, user.id, str(b.text, 300), str(b.link, 500), b.shared ? 1 : 0);
  return { ok: true, id };
});
on('POST', '/groups/:id/done-logs/:lid', async ({ db, settings, request, user, params }) => {
  const { c, m } = await groupCtx(db, settings, user, params.id, { write: true });
  const log = await one(db, 'SELECT * FROM done_logs WHERE id = ? AND challenge_id = ?', params.lid, c.id);
  if (!log) throw notfound();
  const b = await readJson(request);
  if (b.action === 'confirm') {
    if (!isLeaderOf(user, c, m)) throw forbid('그룹장만 확인할 수 있습니다');
    if (log.confirmed_at) return { ok: true };
    await run(db, "UPDATE done_logs SET confirmed_by = ?, confirmed_at = datetime('now') WHERE id = ?", user.id, log.id);
    await addPoints(db, settings, log.user_id, 'done_log', 'done_log', log.id);
  } else if (b.action === 'cancel') {
    if (log.user_id !== user.id && !isLeaderOf(user, c, m)) throw forbid();
    await run(db, "UPDATE done_logs SET cancelled_at = datetime('now') WHERE id = ?", log.id);
  } else throw bad('action은 confirm 또는 cancel');
  return { ok: true };
});

on('POST', '/groups/:id/checkins', async ({ db, settings, request, user, params }) => {
  const { c } = await groupCtx(db, settings, user, params.id, { leader: true });
  const b = await readJson(request);
  const week = intv(b.week_no, '주차', { min: 1, max: 52 });
  const dup = await one(db, 'SELECT id FROM checkins WHERE challenge_id = ? AND week_no = ?', c.id, week);
  if (dup) throw bad('이미 열린 주차입니다');
  const id = await insert(db, 'INSERT INTO checkins (challenge_id, week_no, opened_by, due_date) VALUES (?,?,?,?)', c.id, week, user.id, b.due_date || null);
  for (const m of await activeMembers(db, c.id)) if (m.user_id !== user.id) await notify(db, m.user_id, `${week}주차 체크인이 열렸습니다`, c.title, `#/groups/${c.id}/checkin`);
  return { ok: true, id };
});
on('POST', '/groups/:id/checkins/:cid/entries', async ({ db, settings, request, user, params }) => {
  const { c } = await groupCtx(db, settings, user, params.id, { write: true });
  const ck = await one(db, 'SELECT * FROM checkins WHERE id = ? AND challenge_id = ?', params.cid, c.id);
  if (!ck) throw notfound('체크인 회차가 없습니다');
  const b = await readJson(request);
  const done = (b.done || []).map(s => str(s, 200)).filter(Boolean).slice(0, 5);
  const goals = (b.goals || []).map(s => str(s, 200)).filter(Boolean).slice(0, 3);
  if (!done.length && !goals.length) throw bad('지난주 완료 또는 이번 주 목표를 하나 이상 적어 주세요');
  const hours = Number(b.hours || 0); if (hours < 0 || hours > 168) throw bad('투입 시간을 확인해 주세요');
  const existing = await one(db, 'SELECT id FROM checkin_entries WHERE checkin_id = ? AND user_id = ?', ck.id, user.id);
  if (existing) await run(db, 'UPDATE checkin_entries SET done = ?, goals = ?, blocker = ?, hours = ? WHERE id = ?', J(done), J(goals), str(b.blocker, 500), hours, existing.id);
  else { await run(db, 'INSERT INTO checkin_entries (checkin_id, user_id, done, goals, blocker, hours) VALUES (?,?,?,?,?,?)', ck.id, user.id, J(done), J(goals), str(b.blocker, 500), hours); await addPoints(db, settings, user.id, 'checkin_attend', 'checkin', ck.id); }
  return { ok: true };
});

on('POST', '/groups/:id/ledger', async ({ db, settings, request, user, params }) => {
  const { c, m } = await groupCtx(db, settings, user, params.id, { write: true });
  const b = await readJson(request);
  if (!['revenue', 'expense'].includes(b.kind)) throw bad('kind는 revenue 또는 expense');
  const amount = intv(b.amount, '금액', { min: 1 });
  must(b.entry_date, '날짜');
  const payer_type = b.kind === 'expense' ? (['member', 'hq', 'none'].includes(b.payer_type) ? b.payer_type : 'none') : 'none';
  if (b.kind === 'expense' && payer_type === 'hq' && !isStaff(user)) throw bad('운영본부 선지원은 운영진이 기록합니다');
  const id = await insert(db, 'INSERT INTO ledger_entries (challenge_id, kind, entry_date, amount, is_external, channel, category, payer_type, payer_id, evidence, note, entered_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    c.id, b.kind, b.entry_date, amount, b.kind === 'revenue' ? (b.is_external === false ? 0 : 1) : 1, str(b.channel, 50), str(b.category, 50), payer_type, payer_type === 'member' ? (b.payer_id ? Number(b.payer_id) : user.id) : null, str(b.evidence, 500), str(b.note, 300), user.id);
  if (b.kind === 'revenue' && b.is_external !== false) {
    const alreadyFirst = await badgeCount(db, c.leader_id, 'first_sale');
    if (!alreadyFirst) await notifyStaff(db, '첫 외부 매출 기록', `${c.title} · 증빙 확인 후 첫 매출 배지를 부여하세요`, `#/groups/${c.id}/ledger`);
  }
  return { ok: true, id };
});
on('POST', '/groups/:id/ledger/:eid/confirm', async ({ db, settings, user, params }) => {
  const { c } = await groupCtx(db, settings, user, params.id, { leader: true });
  await run(db, 'UPDATE ledger_entries SET confirmed_by = ? WHERE id = ? AND challenge_id = ?', user.id, params.eid, c.id);
  return { ok: true };
});

// ----- 합의서 -----
on('POST', '/groups/:id/agreement', async ({ db, settings, request, user, params }) => {
  const { c } = await groupCtx(db, settings, user, params.id, { leader: true });
  const b = await readJson(request);
  const cl = b.clauses || {};
  const preset = settings.presets[cl.preset];
  if (!preset) throw bad('배분 프리셋을 선택해 주세요');
  const ratios = { hq: Number(cl.ratios?.hq ?? preset.hq), leader: Number(cl.ratios?.leader ?? preset.leader), pool: Number(cl.ratios?.pool ?? preset.pool) };
  if (Math.abs(ratios.hq + ratios.leader + ratios.pool - 1) > 0.001) throw bad('배분 비율 합이 100%여야 합니다');
  const [lo, hi] = settings.hq_ratio_range;
  if (cl.preset !== 'official' && (ratios.hq < lo - 1e-9 || ratios.hq > hi + 1e-9) && !isStaff(user)) throw bad(`운영본부 몫은 ${lo * 100}~${hi * 100}% 범위여야 합니다`);
  for (const k of ['hq', 'leader', 'pool']) if (Math.abs(ratios[k] - preset[k]) > 0.1 + 1e-9) throw bad('프리셋에서 ±10%p 안에서만 조정할 수 있습니다');
  if (!['A', 'B', 'C'].includes(cl.ownership_type)) throw bad('소유권 유형(A/B/C)을 선택해 주세요');
  if (cl.ownership_type === 'C' && c.type !== 'official' && !isStaff(user)) throw bad('C형(마챌 소유)은 오피셜 챌린지에서만 선택할 수 있습니다');
  const capP = intv(cl.budget_cap_person ?? settings.budget_cap_person, '1인 예산 상한', { min: 0 });
  const capG = intv(cl.budget_cap_group ?? settings.budget_cap_group, '그룹 예산 상한', { min: 0 });
  if ((capP > settings.budget_cap_person || capG > settings.budget_cap_group) && !isStaff(user)) throw bad('예산 상한을 넘기려면 운영본부 승인이 필요합니다. 운영진에게 요청하세요');
  const members = await activeMembers(db, c.id);
  const roles = (cl.roles || []).map(r => ({ user_id: Number(r.user_id), role: ROLES[r.role] ? r.role : 'general', planned_share: r.planned_share == null ? null : Number(r.planned_share) }));
  for (const m of members) if (!roles.find(r => r.user_id === m.user_id)) throw bad(`${m.nickname}님의 역할이 비어 있습니다`);
  const leaderInPool = cl.leader_in_pool == null ? !!preset.leader_in_pool : !!cl.leader_in_pool;
  const poolRoles = roles.filter(r => { const mm = members.find(x => x.user_id === r.user_id); return mm && (mm.role !== 'leader' || leaderInPool); });
  const shareSum = poolRoles.reduce((a, r) => a + (r.planned_share || 0), 0);
  if (poolRoles.some(r => r.planned_share != null) && Math.abs(shareSum - 1) > 0.01) throw bad('그룹원 풀의 예정 기여율 합이 100%여야 합니다');
  const clauses = {
    principles_ack: true, preset: cl.preset, ratios, leader_in_pool: leaderInPool, ownership_type: cl.ownership_type,
    budget_cap_person: capP, budget_cap_group: capG, hq_advance_allowed: !!cl.hq_advance_allowed,
    settlement_mode: ['leader', 'joint', 'agency'].includes(cl.settlement_mode) ? cl.settlement_mode : 'leader',
    agency_rate: settings.agency_rate, min_settlement: settings.min_settlement, withholding_rate: settings.withholding_rate,
    roles, checkin_day: str(cl.checkin_day, 10), special_terms: str(cl.special_terms, 2000), after_round: str(cl.after_round, 500),
    assets: str(cl.assets, 1000), rule_doc: 'MC-03 v1.0',
  };
  const latest = await latestAgreement(db, c.id);
  let id;
  if (latest && ['draft', 'signing'].includes(latest.status)) {
    await run(db, "UPDATE agreements SET clauses = ?, status = 'draft' WHERE id = ?", J(clauses), latest.id);
    await run(db, 'DELETE FROM signatures WHERE agreement_id = ?', latest.id);
    id = latest.id;
  } else {
    if (latest && ['signed', 'approved'].includes(latest.status)) throw bad('운영본부 검토 중인 합의서가 있습니다');
    id = await insert(db, 'INSERT INTO agreements (challenge_id, version, clauses, created_by) VALUES (?,?,?,?)', c.id, (latest?.version || 0) + 1, J(clauses), user.id);
  }
  for (const m of members) if (m.user_id !== user.id) await notify(db, m.user_id, '합의서 서명 요청', `${c.title} · 배분·소유·역할을 확인하고 서명해 주세요`, `#/groups/${c.id}/agreement`);
  for (const r of roles) { const mm = members.find(x => x.user_id === r.user_id); if (mm) await run(db, 'UPDATE group_members SET role = ?, role_weight = ?, planned_share = ? WHERE id = ?', mm.role === 'leader' ? 'leader' : r.role, mm.role === 'leader' ? 1.0 : (ROLE_WEIGHTS[r.role] || 1), r.planned_share, mm.id); }
  return { ok: true, id };
});

on('POST', '/groups/:id/agreement/sign', async ({ db, settings, request, user, params }) => {
  const { c, m } = await groupCtx(db, settings, user, params.id, { write: true });
  if (!m || m.status !== 'active') throw forbid('그룹원만 서명합니다');
  const a = await latestAgreement(db, c.id);
  if (!a || !['draft', 'signing'].includes(a.status)) throw bad('서명할 합의서가 없습니다');
  const b = await readJson(request);
  if (!b.agree) throw bad('조항을 읽고 동의해야 서명할 수 있습니다');
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || null;
  await run(db, 'INSERT OR IGNORE INTO signatures (agreement_id, user_id, ip) VALUES (?,?,?)', a.id, user.id, ip);
  const members = await activeMembers(db, c.id);
  const signed = await all(db, 'SELECT user_id FROM signatures WHERE agreement_id = ?', a.id);
  const allSigned = members.every(mm => signed.some(s => s.user_id === mm.user_id));
  await run(db, 'UPDATE agreements SET status = ? WHERE id = ?', allSigned ? 'signed' : 'signing', a.id);
  if (allSigned) await notifyStaff(db, '합의서 승인 요청', `${c.title} · 전원 서명 완료`, '#/admin/agreements');
  return { ok: true, all_signed: allSigned };
});

on('GET', '/admin/agreements', async ({ db, user }) => {
  requireStaff(user);
  const rows = await all(db, "SELECT a.id, a.challenge_id, a.version, a.status, a.clauses, a.created_at, c.title, u.nickname AS leader FROM agreements a JOIN challenges c ON c.id = a.challenge_id JOIN users u ON u.id = c.leader_id WHERE a.status IN ('signed','signing','draft') ORDER BY CASE a.status WHEN 'signed' THEN 0 ELSE 1 END, a.created_at DESC");
  return rows.map(r => ({ ...r, clauses: parseJ(r.clauses, {}) }));
});
on('POST', '/admin/agreements/:aid', async ({ db, settings, request, user, params }) => {
  requireStaff(user);
  const a = await one(db, 'SELECT * FROM agreements WHERE id = ?', params.aid);
  if (!a) throw notfound();
  const b = await readJson(request);
  const c = await loadChallenge(db, a.challenge_id);
  if (b.approve) {
    if (a.status !== 'signed') throw bad('전원 서명이 끝난 합의서만 승인할 수 있습니다');
    await run(db, "UPDATE agreements SET status = 'locked', approved_by = ?, approved_at = datetime('now') WHERE id = ?", user.id, a.id);
    if (['agreement', 'recruiting'].includes(c.stage)) {
      await run(db, "UPDATE challenges SET stage = 'active', updated_at = datetime('now') WHERE id = ?", c.id);
      const existing = await one(db, 'SELECT COUNT(*) AS c FROM milestones WHERE challenge_id = ?', c.id);
      if (!(existing?.c)) {
        const base = c.round_start ? new Date(c.round_start) : new Date();
        for (const ms of settings.milestones) { const d = new Date(base.getTime() + (ms.week * 7 - 1) * 86400000); await run(db, 'INSERT INTO milestones (challenge_id, code, title, due_date) VALUES (?,?,?,?)', c.id, ms.code, ms.title, d.toISOString().slice(0, 10)); }
      }
    }
    for (const m of await activeMembers(db, c.id)) await notify(db, m.user_id, '합의서가 승인됐습니다. 챌린지 시작!', c.title, `#/groups/${c.id}`);
  } else {
    await run(db, "UPDATE agreements SET status = 'draft' WHERE id = ?", a.id);
    await run(db, 'DELETE FROM signatures WHERE agreement_id = ?', a.id);
    await notify(db, c.leader_id, '합의서 보완 요청', str(b.note, 500) || '운영본부 의견을 확인해 주세요', `#/groups/${c.id}/agreement`);
  }
  await audit(db, user.id, b.approve ? 'agreement.approve' : 'agreement.return', 'agreements:' + a.id, { note: b.note });
  return { ok: true };
});

// ----- 기여도 -----
on('GET', '/groups/:id/contribution', async ({ db, settings, user, params }) => {
  const { c } = await groupCtx(db, settings, user, params.id, { write: true });
  return contributionDraft(db, c, await activeMembers(db, c.id), await latestAgreement(db, c.id));
});
on('POST', '/groups/:id/contribution', async ({ db, settings, request, user, params }) => {
  const { c } = await groupCtx(db, settings, user, params.id, { leader: true });
  const b = await readJson(request);
  const draft = await contributionDraft(db, c, await activeMembers(db, c.id), await latestAgreement(db, c.id));
  const shares = (b.shares || []).map(s => ({ user_id: Number(s.user_id), share: Number(s.share) }));
  const sum = shares.reduce((a, s) => a + s.share, 0);
  if (Math.abs(sum - 1) > 0.005) throw bad('실제 기여율 합이 100%여야 합니다');
  let alert = false;
  for (const d of draft) {
    const s = shares.find(x => x.user_id === d.user_id);
    if (!s) throw bad(`${d.nickname}님의 기여율이 비어 있습니다`);
    if (!isStaff(user) && Math.abs(s.share - d.auto_share) > settings.share_adjust_limit + 1e-9) throw bad(`${d.nickname}님의 기여율은 자동 산정값(${Math.round(d.auto_share * 100)}%)에서 ±${settings.share_adjust_limit * 100}%p 안에서만 조정할 수 있습니다`);
    if (d.planned_share != null && Math.abs(s.share - d.planned_share) > settings.share_alert_gap) alert = true;
    await run(db, 'UPDATE group_members SET actual_share = ? WHERE challenge_id = ? AND user_id = ?', s.share, c.id, d.user_id);
  }
  if (alert) await notifyStaff(db, '기여율 차이 확인 필요', `${c.title} · 예정 기여율과 20%p 이상 차이`, `#/groups/${c.id}/settlement`);
  return { ok: true, alert };
});

// ----- 정산 -----
on('POST', '/groups/:id/settlements', async ({ db, settings, request, user, params }) => {
  const { c } = await groupCtx(db, settings, user, params.id, { leader: true });
  const a = await latestAgreement(db, c.id);
  if (!a || a.status !== 'locked') throw bad('승인(잠금)된 합의서가 있어야 정산할 수 있습니다');
  const openS = await one(db, "SELECT id FROM settlements WHERE challenge_id = ? AND status IN ('confirming','disputed','reviewed') LIMIT 1", c.id);
  if (openS) throw bad('진행 중인 정산이 있습니다. 먼저 끝내 주세요');
  const b = await readJson(request);
  const ps = b.period_start || '1970-01-01', pe = b.period_end || today();
  const rows = await all(db, 'SELECT * FROM ledger_entries WHERE challenge_id = ? AND entry_date >= ? AND entry_date <= ?', c.id, ps, pe);
  const t = ledgerTotals(rows);
  const contrib = {};
  for (const r of rows) if (r.kind === 'expense' && r.payer_type === 'member' && r.payer_id) contrib[r.payer_id] = (contrib[r.payer_id] || 0) + r.amount;
  const members = await activeMembers(db, c.id);
  const leftMembers = await all(db, "SELECT * FROM group_members WHERE challenge_id = ? AND status = 'left'", c.id);
  const pool = members.filter(m => m.role !== 'leader' || a.clauses.leader_in_pool);
  let shares = pool.map(m => ({ user_id: m.user_id, share: m.actual_share ?? m.planned_share ?? (1 / pool.length) }));
  for (const lm of leftMembers) if (lm.actual_share) shares.push({ user_id: lm.user_id, share: lm.leave_type === 'unannounced' ? lm.actual_share * 0.5 : lm.actual_share });
  const carried = await all(db, "SELECT id, result FROM settlements WHERE challenge_id = ? AND status = 'carried'", c.id);
  const carry_in = carried.reduce((s, x) => s + (parseJ(x.result, {}).carried || 0), 0);
  const hours = (await one(db, 'SELECT COALESCE(SUM(e.hours),0) AS h FROM checkin_entries e JOIN checkins ci ON ci.id = e.checkin_id WHERE ci.challenge_id = ?', c.id))?.h || 0;
  const input = {
    revenue_external: t.revenue_external, revenue_internal: t.revenue_internal, expenses: t.expenses,
    member_contrib: Object.entries(contrib).map(([uid, amount]) => ({ user_id: Number(uid), amount })), hq_advance: t.hq_advance,
    agency: a.clauses.settlement_mode === 'agency', agency_rate: a.clauses.agency_rate ?? settings.agency_rate,
    ratios: a.clauses.ratios, leader_id: c.leader_id, shares, min_settlement: a.clauses.min_settlement ?? settings.min_settlement,
    carry_in, withholding_rate: a.clauses.withholding_rate ?? settings.withholding_rate, total_hours: hours,
    period: { start: ps, end: pe }, agreement_id: a.id, agreement_version: a.version, preset: a.clauses.preset,
  };
  const result = computeSettlement(input);
  const status = result.status === 'carried' ? 'carried' : (result.status === 'no_distribution' ? 'reviewed' : 'confirming');
  const id = await insert(db, 'INSERT INTO settlements (challenge_id, period_start, period_end, inputs, result, rule_version, status, created_by) VALUES (?,?,?,?,?,?,?,?)', c.id, ps, pe, J(input), J(result), RULE_VERSION, status, user.id);
  for (const x of carried) await run(db, "UPDATE settlements SET status = 'carried_used' WHERE id = ?", x.id);
  if (c.stage === 'active') await run(db, "UPDATE challenges SET stage = 'settling', updated_at = datetime('now') WHERE id = ?", c.id);
  if (status === 'confirming') for (const m of members) await notify(db, m.user_id, '정산표를 확인해 주세요', `${c.title} · 확인 서명 또는 이의 제기`, `#/settlements/${id}`);
  if (status === 'reviewed') { for (const r of buildPayouts(result, c.leader_id)) await run(db, 'INSERT INTO settlement_payouts (settlement_id, user_id, kind, gross, withholding_rate, withholding, net) VALUES (?,?,?,?,?,?,?)', id, r.user_id, r.kind, r.gross, r.withholding_rate, r.withholding, r.net); }
  await audit(db, user.id, 'settlement.create', 'settlements:' + id, { status });
  return { ok: true, id, status, result };
});

async function loadSettlement(db, sid) {
  const s = await one(db, 'SELECT s.*, c.title, c.leader_id, c.type FROM settlements s JOIN challenges c ON c.id = s.challenge_id WHERE s.id = ?', sid);
  if (!s) throw notfound('정산을 찾을 수 없습니다');
  s.inputs = parseJ(s.inputs, {}); s.result = parseJ(s.result, {});
  s.confirmations = await all(db, 'SELECT sc.*, u.nickname FROM settlement_confirmations sc JOIN users u ON u.id = sc.user_id WHERE sc.settlement_id = ?', sid);
  s.payouts = await all(db, 'SELECT p.*, u.nickname FROM settlement_payouts p LEFT JOIN users u ON u.id = p.user_id WHERE p.settlement_id = ? ORDER BY p.id', sid);
  return s;
}

on('GET', '/settlements/:sid', async ({ db, settings, user, params }) => {
  requireUser(user);
  const s = await loadSettlement(db, params.sid);
  const m = await membership(db, s.challenge_id, user.id);
  if (!isStaff(user) && !(m && ['active', 'left'].includes(m.status))) throw forbid('정산은 그룹원과 운영진만 볼 수 있습니다');
  const members = await all(db, "SELECT gm.user_id, u.nickname, gm.role, gm.status FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.challenge_id = ? AND gm.status IN ('active','left')", s.challenge_id);
  const paper = await one(db, 'SELECT id, status FROM papers WHERE challenge_id = ?', s.challenge_id);
  return { ...s, members, paper, is_staff: isStaff(user), is_leader: s.leader_id === user.id || isStaff(user), my_confirmation: s.confirmations.find(x => x.user_id === user.id) || null };
});

on('POST', '/settlements/:sid/confirm', async ({ db, request, user, params }) => {
  requireUser(user);
  const s = await loadSettlement(db, params.sid);
  const m = await membership(db, s.challenge_id, user.id);
  if (!(m && m.status === 'active')) throw forbid('그룹원만 확인합니다');
  if (!['confirming', 'disputed'].includes(s.status)) throw bad('확인 단계가 아닙니다');
  const b = await readJson(request);
  const confirmed = b.confirmed ? 1 : 0;
  if (!confirmed && !str(b.dispute_note, 10)) throw bad('이의 사유를 적어 주세요');
  await run(db, 'INSERT INTO settlement_confirmations (settlement_id, user_id, confirmed, dispute_note) VALUES (?,?,?,?) ON CONFLICT(settlement_id, user_id) DO UPDATE SET confirmed = excluded.confirmed, dispute_note = excluded.dispute_note, created_at = datetime(\'now\')', s.id, user.id, confirmed, str(b.dispute_note, 1000));
  if (!confirmed) {
    await run(db, "UPDATE settlements SET status = 'disputed' WHERE id = ?", s.id);
    await insert(db, "INSERT INTO disputes (ref_type, ref_id, filed_by, stage, note) VALUES ('settlement', ?, ?, 1, ?)", s.id, user.id, str(b.dispute_note, 1000));
    await notify(db, s.leader_id, '정산 이의 제기', `${s.title} · 1차 그룹 내 조정을 진행해 주세요 (7일)`, `#/settlements/${s.id}`);
    await notifyStaff(db, '정산 이의 접수', s.title, `#/settlements/${s.id}`);
  } else {
    // 이의를 냈던 사람이 확인으로 바꾸면 그 이의는 그룹 내 조정으로 종결 처리
    await run(db, "UPDATE disputes SET status = 'resolved', result = COALESCE(result, '제기자가 조정 후 정산표를 확인함'), resolved_at = datetime('now') WHERE ref_type = 'settlement' AND ref_id = ? AND filed_by = ? AND status IN ('open','mediating')", s.id, user.id);
    const members = await activeMembers(db, s.challenge_id);
    const conf = await all(db, 'SELECT user_id, confirmed FROM settlement_confirmations WHERE settlement_id = ?', s.id);
    const allOk = members.every(mm => conf.some(x => x.user_id === mm.user_id && x.confirmed));
    if (allOk) { await run(db, "UPDATE settlements SET status = 'confirming' WHERE id = ?", s.id); await notifyStaff(db, '정산 검수 요청', `${s.title} · 전원 확인 완료`, `#/settlements/${s.id}`); }
  }
  return { ok: true };
});

on('POST', '/settlements/:sid/review', async ({ db, request, user, params }) => {
  requireStaff(user);
  const s = await loadSettlement(db, params.sid);
  const b = await readJson(request);
  if (!b.approve) { await run(db, 'UPDATE settlements SET review_note = ? WHERE id = ?', str(b.note, 1000), s.id); await notify(db, s.leader_id, '정산 검수 보완 요청', str(b.note, 500), `#/settlements/${s.id}`); return { ok: true }; }
  const paper = await one(db, "SELECT status FROM papers WHERE challenge_id = ? AND status IN ('approved','published')", s.challenge_id);
  if (!paper) throw bad('프로젝트 페이퍼가 승인되지 않았습니다. 페이퍼 승인이 지급 조건입니다');
  const members = await activeMembers(db, s.challenge_id);
  const conf = await all(db, 'SELECT user_id, confirmed FROM settlement_confirmations WHERE settlement_id = ?', s.id);
  const disputed = conf.filter(x => !x.confirmed);
  const unconfirmed = members.filter(mm => !conf.some(x => x.user_id === mm.user_id && x.confirmed));
  if (unconfirmed.length && !b.force) throw bad(`아직 확인하지 않은 그룹원이 있습니다: ${unconfirmed.map(x => x.nickname).join(', ')}`, { unconfirmed: unconfirmed.map(x => x.user_id) });
  const open = await one(db, "SELECT COUNT(*) AS c FROM disputes WHERE ref_type = 'settlement' AND ref_id = ? AND status IN ('open','mediating')", s.id);
  if ((open?.c || 0) > 0 && !b.force) throw bad('조정 중인 이의가 있습니다. 이의 금액을 보류하려면 force 옵션으로 승인하고 해당 지급을 보류 처리하세요');
  await run(db, "UPDATE settlements SET status = 'reviewed', reviewed_by = ?, review_note = ?, reviewed_at = datetime('now') WHERE id = ?", user.id, str(b.note, 1000), s.id);
  await run(db, 'DELETE FROM settlement_payouts WHERE settlement_id = ?', s.id);
  for (const r of buildPayouts(s.result, s.leader_id)) {
    const held = disputed.some(d => d.user_id === r.user_id);
    await run(db, 'INSERT INTO settlement_payouts (settlement_id, user_id, kind, gross, withholding_rate, withholding, net, status) VALUES (?,?,?,?,?,?,?,?)', s.id, r.user_id, r.kind, r.gross, r.withholding_rate, r.withholding, r.net, held ? 'held' : 'pending');
  }
  for (const m of members) await notify(db, m.user_id, '정산이 검수됐습니다', `${s.title} · 7일 이내 지급 예정`, `#/settlements/${s.id}`);
  await audit(db, user.id, 'settlement.review', 'settlements:' + s.id, { force: !!b.force });
  return { ok: true };
});

on('POST', '/settlements/:sid/payouts/:pid', async ({ db, request, user, params }) => {
  requireUser(user);
  const s = await loadSettlement(db, params.sid);
  if (!isStaff(user) && s.leader_id !== user.id) throw forbid('지급 주체(그룹장) 또는 운영진만 처리합니다');
  const b = await readJson(request);
  if (!['paid', 'held', 'pending'].includes(b.status)) throw bad('status는 paid / held / pending');
  await run(db, "UPDATE settlement_payouts SET status = ?, paid_at = CASE WHEN ? = 'paid' THEN datetime('now') ELSE NULL END WHERE id = ? AND settlement_id = ?", b.status, b.status, params.pid, s.id);
  const left = await one(db, "SELECT COUNT(*) AS c FROM settlement_payouts WHERE settlement_id = ? AND status <> 'paid'", s.id);
  if ((left?.c || 0) === 0) { await run(db, "UPDATE settlements SET status = 'paid' WHERE id = ?", s.id); }
  await audit(db, user.id, 'payout.' + b.status, `settlements:${s.id}/payouts:${params.pid}`);
  return { ok: true, all_paid: (left?.c || 0) === 0 };
});

// ----- 페이퍼 -----
const PAPER_FIXED_PUBLIC = ['has_sales', 'customers_band', 'hours'];
function paperSummary(r) {
  const f = parseJ(r.form, r.form || {}) || {}; const priv = parseJ(r.private_fields, r.private_fields || []) || [];
  return { id: r.id, title: r.title, field_code: r.field_code, field_name: FIELDS[r.field_code], status: r.status, published_at: r.published_at, publish_scope: r.publish_scope,
    summary: { name: f.name, pain: f.pain, state: f.state, has_sales: f.has_sales, customers_band: f.customers_band, hours: f.hours, lesson: (f.good || [])[0] || null } };
}
on('GET', '/groups/:id/paper/prefill', async ({ db, settings, user, params }) => {
  const { c } = await groupCtx(db, settings, user, params.id, { write: true });
  const rows = await all(db, 'SELECT * FROM ledger_entries WHERE challenge_id = ?', c.id);
  const t = ledgerTotals(rows);
  const hours = (await one(db, 'SELECT COALESCE(SUM(e.hours),0) AS h FROM checkin_entries e JOIN checkins ci ON ci.id = e.checkin_id WHERE ci.challenge_id = ?', c.id))?.h || 0;
  const customers = (await one(db, "SELECT COUNT(*) AS c FROM ledger_entries WHERE challenge_id = ? AND kind = 'revenue' AND is_external = 1", c.id))?.c || 0;
  const logs = await all(db, 'SELECT text, created_at FROM done_logs WHERE challenge_id = ? AND cancelled_at IS NULL ORDER BY created_at LIMIT 200', c.id);
  return { name: c.title, field_code: c.field_code, revenue_external: t.revenue_external, revenue_internal: t.revenue_internal, expenses: t.expenses, hours, customers_count: customers, customers_band: band(customers), has_sales: t.revenue_external > 0, hourly: hours ? Math.round((t.revenue_external - t.expenses) / hours) : null, milestones_hint: logs.filter((_, i) => i % Math.max(1, Math.floor(logs.length / 5)) === 0).slice(0, 5).map(l => l.text) };
});
function band(n) { if (n === 0) return '0'; if (n < 5) return '1~4'; if (n < 20) return '5~19'; if (n < 100) return '20~99'; return '100+'; }

on('POST', '/groups/:id/paper', async ({ db, settings, request, user, params }) => {
  const { c } = await groupCtx(db, settings, user, params.id, { leader: true });
  const b = await readJson(request);
  const f = b.form || {};
  const form = {
    name: str(f.name, 80) || c.title, pain: str(f.pain, 500), product: str(f.product, 500), milestones: (f.milestones || []).map(s => str(s, 200)).filter(Boolean).slice(0, 5),
    revenue_external: intv(f.revenue_external || 0, '외부 매출', { min: 0 }), revenue_internal: intv(f.revenue_internal || 0, '내부 매출', { min: 0 }), customers: intv(f.customers || 0, '외부 고객 수', { min: 0 }),
    hours: Number(f.hours || 0), expenses: intv(f.expenses || 0, '총 비용', { min: 0 }), state: ['ongoing', 'transferred', 'stopped', 'closed'].includes(f.state) ? f.state : 'ongoing',
    good: (f.good || []).map(s => str(s, 300)).filter(Boolean).slice(0, 3), bad: (f.bad || []).map(s => str(s, 300)).filter(Boolean).slice(0, 3), next: str(f.next, 1000), to_next: str(f.to_next, 1000),
  };
  form.has_sales = form.revenue_external > 0; form.customers_band = band(form.customers); form.hourly_net = form.hours ? Math.round((form.revenue_external - form.expenses) / form.hours) : null;
  const priv = (b.private_fields || []).filter(k => !PAPER_FIXED_PUBLIC.includes(k));
  const scope = b.publish_scope === 'public' ? 'public' : 'members';
  const existing = await one(db, 'SELECT * FROM papers WHERE challenge_id = ?', c.id);
  if (existing && ['review', 'approved', 'published'].includes(existing.status) && !isStaff(user)) throw bad('제출된 페이퍼는 운영진이 보완 요청한 뒤에만 수정할 수 있습니다');
  let id;
  if (existing) { await run(db, "UPDATE papers SET form = ?, private_fields = ?, publish_scope = ?, updated_at = datetime('now') WHERE id = ?", J(form), J(priv), scope, existing.id); id = existing.id; }
  else id = await insert(db, 'INSERT INTO papers (challenge_id, form, private_fields, publish_scope) VALUES (?,?,?,?)', c.id, J(form), J(priv), scope);
  if (b.submit) {
    await run(db, "UPDATE papers SET status = 'review', submitted_at = datetime('now') WHERE id = ?", id);
    for (const m of await activeMembers(db, c.id)) await addPoints(db, settings, m.user_id, 'paper_submit', 'paper', id);
    await notifyStaff(db, '프로젝트 페이퍼 제출', c.title, '#/admin/papers');
  }
  return { ok: true, id, status: b.submit ? 'review' : (existing?.status || 'draft') };
});

on('POST', '/admin/papers/:pid/review', async ({ db, request, user, params }) => {
  requireStaff(user);
  const p = await one(db, 'SELECT p.*, c.title, c.leader_id, c.id AS cid FROM papers p JOIN challenges c ON c.id = p.challenge_id WHERE p.id = ?', params.pid);
  if (!p) throw notfound();
  const b = await readJson(request);
  if (b.decision === 'approve') {
    await run(db, "UPDATE papers SET status = 'approved', reviewer_id = ?, review_note = ?, published_at = datetime('now') WHERE id = ?", user.id, str(b.note, 1000), p.id);
    // 페이퍼의 공개 숫자를 챌린지 카드에도 반영
    const pf = parseJ(p.form, {}); const ch = await loadChallenge(db, p.cid);
    await run(db, "UPDATE challenges SET public_numbers = ?, updated_at = datetime('now') WHERE id = ?", J({ ...ch.public_numbers, has_sales: !!pf.has_sales, customers_band: pf.customers_band || ch.public_numbers.customers_band, hours: pf.hours || ch.public_numbers.hours }), p.cid);
    await grantBadge(db, p.leader_id, 'contributor', user.id, `paper:${p.id}`);
    await notify(db, p.leader_id, '페이퍼가 승인·공개됐습니다', p.title, `#/papers/${p.id}`);
  } else {
    await run(db, "UPDATE papers SET status = 'draft', reviewer_id = ?, review_note = ? WHERE id = ?", user.id, str(b.note, 1000), p.id);
    await notify(db, p.leader_id, '페이퍼 보완 요청', str(b.note, 500) || '운영진 의견을 확인해 주세요', `#/groups/${p.cid}/paper`);
  }
  await audit(db, user.id, 'paper.' + b.decision, 'papers:' + p.id, { note: b.note });
  return { ok: true };
});

on('GET', '/papers', async ({ db, settings, user, query }) => {
  requireLevel(user, 'L1');
  const where = ["p.status IN ('approved','published')"]; const p = [];
  if (query.field) { where.push('c.field_code = ?'); p.push(query.field); }
  if (query.state) { where.push("json_extract(p.form, '$.state') = ?"); p.push(query.state); }
  const rows = await all(db, `SELECT p.id, p.form, p.private_fields, p.status, p.publish_scope, p.published_at, c.title, c.field_code, c.id AS challenge_id FROM papers p JOIN challenges c ON c.id = p.challenge_id WHERE ${where.join(' AND ')} ORDER BY p.published_at DESC LIMIT 100`, ...p);
  return rows.map(r => ({ ...paperSummary(r), challenge_id: r.challenge_id }));
});
on('GET', '/papers/:pid', async ({ db, settings, user, params }) => {
  requireLevel(user, 'L1');
  const r = await one(db, 'SELECT p.*, c.title, c.field_code, c.leader_id, c.id AS challenge_id, u.nickname AS leader FROM papers p JOIN challenges c ON c.id = p.challenge_id JOIN users u ON u.id = c.leader_id WHERE p.id = ?', params.pid);
  if (!r) throw notfound();
  const m = await membership(db, r.challenge_id, user.id);
  const full = isStaff(user) || (m && m.status === 'active') || lvlAtLeast(user, settings.visibility.paper_full);
  if (!full && !['approved', 'published'].includes(r.status)) throw forbid();
  const summary = paperSummary(r);
  if (!full) return { ...summary, full: false, leader: r.leader };
  const form = parseJ(r.form, {}); const priv = parseJ(r.private_fields, []);
  if (!isStaff(user) && !(m && m.status === 'active')) { for (const k of priv) if (!PAPER_FIXED_PUBLIC.includes(k)) form[k] = null; await run(db, "INSERT INTO view_logs (user_id, target_type, target_id) VALUES (?,'paper_full',?)", user.id, r.id); }
  return { ...summary, full: true, form, private_fields: priv, leader: r.leader, review_note: r.review_note, challenge_id: r.challenge_id, viewer: user.nickname };
});
on('GET', '/admin/papers', async ({ db, user }) => {
  requireStaff(user);
  const rows = await all(db, "SELECT p.id, p.status, p.submitted_at, p.form, p.private_fields, c.title, c.field_code, c.id AS challenge_id, u.nickname AS leader FROM papers p JOIN challenges c ON c.id = p.challenge_id JOIN users u ON u.id = c.leader_id WHERE p.status = 'review' ORDER BY p.submitted_at");
  return rows.map(r => ({ ...paperSummary(r), leader: r.leader, challenge_id: r.challenge_id, form: parseJ(r.form, {}) }));
});

// =====================================================================
// 커뮤니티 · 이벤트
// =====================================================================
async function feedItems(db, limit = 30) {
  const logs = await all(db, "SELECT 'done' AS kind, d.id, d.text AS title, d.link, d.created_at, u.nickname, c.title AS challenge_title, c.id AS challenge_id FROM done_logs d JOIN users u ON u.id = d.user_id JOIN challenges c ON c.id = d.challenge_id WHERE d.shared = 1 AND d.cancelled_at IS NULL ORDER BY d.created_at DESC LIMIT ?", limit);
  const posts = await all(db, "SELECT 'post' AS kind, p.id, p.title, p.board, p.created_at, u.nickname, p.helpful_count FROM posts p JOIN users u ON u.id = p.author_id WHERE p.hidden = 0 ORDER BY p.created_at DESC LIMIT ?", limit);
  const ups = await all(db, "SELECT 'level' AS kind, h.id, h.to_level, h.created_at, u.nickname FROM level_history h JOIN users u ON u.id = h.user_id WHERE h.to_level >= 'L2' ORDER BY h.created_at DESC LIMIT ?", limit);
  const bd = await all(db, "SELECT 'badge' AS kind, b.id, b.code, b.created_at, u.nickname FROM badges b JOIN users u ON u.id = b.user_id WHERE b.revoked_at IS NULL AND b.code IN ('first_sale','completion','repeat_sale') ORDER BY b.created_at DESC LIMIT ?", limit);
  return [...logs, ...posts, ...ups.map(x => ({ ...x, title: `${x.nickname}님이 ${levelName(x.to_level)}가 되었습니다` })), ...bd.map(x => ({ ...x, title: `${x.nickname}님 · ${BADGE_NAMES[x.code]} 배지` }))].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, limit);
}
on('GET', '/feed', async ({ db, user }) => { requireLevel(user, 'L1'); return feedItems(db, 40); });

on('GET', '/posts', async ({ db, settings, user, query }) => {
  requireLevel(user, 'L1');
  if (query.board === 'swap') requireLevel(user, settings.visibility.swap_board, '품앗이 보드는 메이커부터 볼 수 있습니다');
  const where = ['p.hidden = 0']; const p = [];
  if (query.board) { where.push('p.board = ?'); p.push(query.board); }
  return all(db, `SELECT p.id, p.board, p.title, p.helpful_count, p.created_at, u.nickname, u.level, (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) AS comment_count FROM posts p JOIN users u ON u.id = p.author_id WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC LIMIT 100`, ...p);
});
on('POST', '/posts', async ({ db, settings, request, user }) => {
  requireLevel(user, 'L1');
  const b = await readJson(request);
  const board = ['question', 'share', 'review', 'notice', 'swap'].includes(b.board) ? b.board : 'share';
  if (board === 'notice') requireStaff(user);
  if (board === 'swap') requireLevel(user, settings.visibility.swap_board);
  must(b.title, '제목'); must(b.body, '내용');
  const banned = /(원금\s*보장|수익\s*보장|무조건\s*(수익|된다)|월\s*\d+\s*만\s*원\s*보장)/;
  if (banned.test(b.title + ' ' + b.body)) throw bad('수익이나 원금을 보장하는 표현은 쓸 수 없습니다 (마챌 원칙 1)');
  const id = await insert(db, 'INSERT INTO posts (author_id, board, title, body, challenge_id) VALUES (?,?,?,?,?)', user.id, board, str(b.title, 100), str(b.body, 5000), b.challenge_id ? Number(b.challenge_id) : null);
  await addPoints(db, settings, user.id, 'post', 'post', id);
  return { ok: true, id };
});
on('GET', '/posts/:id', async ({ db, user, params }) => {
  requireLevel(user, 'L1');
  const p = await one(db, 'SELECT p.*, u.nickname, u.level FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ? AND p.hidden = 0', params.id);
  if (!p) throw notfound();
  p.comments = await all(db, 'SELECT c.*, u.nickname, u.level FROM comments c JOIN users u ON u.id = c.author_id WHERE c.post_id = ? ORDER BY c.created_at', p.id);
  p.my_helpful = !!(await one(db, 'SELECT 1 AS x FROM helpful WHERE post_id = ? AND user_id = ?', p.id, user.id));
  return p;
});
on('POST', '/posts/:id/comments', async ({ db, settings, request, user, params }) => {
  requireLevel(user, 'L1');
  const b = await readJson(request); must(b.body, '내용');
  const p = await one(db, 'SELECT id, author_id FROM posts WHERE id = ?', params.id); if (!p) throw notfound();
  const id = await insert(db, 'INSERT INTO comments (post_id, author_id, body) VALUES (?,?,?)', p.id, user.id, str(b.body, 2000));
  await addPoints(db, settings, user.id, 'comment', 'comment', id);
  if (p.author_id !== user.id) await notify(db, p.author_id, '새 댓글', str(b.body, 80), `#/community/posts/${p.id}`);
  return { ok: true, id };
});
on('POST', '/posts/:id/helpful', async ({ db, settings, user, params }) => {
  requireLevel(user, 'L1');
  const p = await one(db, 'SELECT id, author_id FROM posts WHERE id = ?', params.id); if (!p) throw notfound();
  if (p.author_id === user.id) throw bad('자기 글에는 표시할 수 없습니다');
  const ex = await one(db, 'SELECT 1 AS x FROM helpful WHERE post_id = ? AND user_id = ?', p.id, user.id);
  if (ex) { await run(db, 'DELETE FROM helpful WHERE post_id = ? AND user_id = ?', p.id, user.id); await run(db, 'UPDATE posts SET helpful_count = helpful_count - 1 WHERE id = ?', p.id); return { ok: true, on: false }; }
  await run(db, 'INSERT INTO helpful (post_id, user_id) VALUES (?,?)', p.id, user.id); await run(db, 'UPDATE posts SET helpful_count = helpful_count + 1 WHERE id = ?', p.id);
  await addPoints(db, settings, p.author_id, 'helpful_received', 'post', p.id);
  return { ok: true, on: true };
});
on('POST', '/posts/:id/report', async ({ db, request, user, params }) => {
  requireLevel(user, 'L1');
  const b = await readJson(request);
  await run(db, 'UPDATE posts SET reported = reported + 1 WHERE id = ?', params.id);
  await insert(db, "INSERT INTO disputes (ref_type, ref_id, filed_by, note) VALUES ('report', ?, ?, ?)", Number(params.id), user.id, str(b.note, 500));
  await notifyStaff(db, '게시물 신고', str(b.note, 80) || '', `#/community/posts/${params.id}`);
  return { ok: true };
});

on('GET', '/events', async ({ db, user }) => {
  requireLevel(user, 'L1');
  const rows = await all(db, "SELECT e.*, (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS registered, (SELECT status FROM registrations r WHERE r.event_id = e.id AND r.user_id = ?) AS my_status FROM events e WHERE e.starts_at >= datetime('now','-21 days') ORDER BY e.starts_at", user.id);
  return rows.map(r => { const { attendance_code, ...rest } = r; return isStaff(user) ? r : rest; });
});
on('POST', '/admin/events', async ({ db, request, user }) => {
  requireStaff(user); const b = await readJson(request);
  must(b.title, '제목'); must(b.starts_at, '일시');
  const type = ['machal_day', 'demo_day', 'seminar', 'study', 'office_hour', 'workshop'].includes(b.type) ? b.type : 'seminar';
  const id = await insert(db, 'INSERT INTO events (type, title, starts_at, location, capacity, min_level, description, attendance_code, created_by) VALUES (?,?,?,?,?,?,?,?,?)', type, str(b.title, 100), b.starts_at, str(b.location, 100), b.capacity ? Number(b.capacity) : null, LEVELS.includes(b.min_level) ? b.min_level : 'L1', str(b.description, 2000), (b.attendance_code || randomToken(2)).toUpperCase(), user.id);
  await audit(db, user.id, 'event.create', 'events:' + id);
  return { ok: true, id };
});
on('POST', '/events/:id/register', async ({ db, user, params }) => {
  requireLevel(user, 'L1');
  const e = await one(db, 'SELECT * FROM events WHERE id = ?', params.id); if (!e) throw notfound();
  if (!lvlAtLeast(user, e.min_level)) throw forbid(`${levelName(e.min_level)}부터 참여할 수 있습니다`);
  const cnt = await one(db, "SELECT COUNT(*) AS c FROM registrations WHERE event_id = ? AND status <> 'cancelled'", e.id);
  if (e.capacity && (cnt?.c || 0) >= e.capacity) throw bad('정원이 찼습니다');
  await run(db, "INSERT INTO registrations (event_id, user_id) VALUES (?,?) ON CONFLICT(event_id, user_id) DO UPDATE SET status = 'registered'", e.id, user.id);
  return { ok: true };
});
on('POST', '/events/:id/attend', async ({ db, settings, request, user, params }) => {
  requireLevel(user, 'L1');
  const e = await one(db, 'SELECT * FROM events WHERE id = ?', params.id); if (!e) throw notfound();
  const b = await readJson(request);
  if (String(b.code || '').trim().toUpperCase() !== e.attendance_code) throw bad('출석 코드가 맞지 않습니다');
  await run(db, "INSERT INTO registrations (event_id, user_id, status, attended_at) VALUES (?,?,'attended',datetime('now')) ON CONFLICT(event_id, user_id) DO UPDATE SET status = 'attended', attended_at = datetime('now')", e.id, user.id);
  await addPoints(db, settings, user.id, 'event_attend', 'event', e.id);
  const promoted = await maybeAutoPromote(db, settings, user.id);
  return { ok: true, promoted };
});

on('GET', '/members/first-sales', async ({ db, user }) => {
  requireLevel(user, 'L1');
  return all(db, "SELECT u.id, u.nickname, u.level, u.interests, MIN(b.created_at) AS first_sale_at FROM badges b JOIN users u ON u.id = b.user_id WHERE b.code = 'first_sale' AND b.revoked_at IS NULL GROUP BY u.id ORDER BY first_sale_at DESC");
});
on('GET', '/leaderboard', async ({ db, user }) => {
  requireLevel(user, 'L1');
  return all(db, 'SELECT u.id, u.nickname, u.level, SUM(p.points) AS points FROM points_ledger p JOIN users u ON u.id = p.user_id WHERE p.quarter = ? GROUP BY u.id ORDER BY points DESC LIMIT 10', quarterOf());
});

// =====================================================================
// 관리자
// =====================================================================
// 가입하지 않은 신청서는 처리 후 6개월이 지나면 파기한다(개인정보처리방침 2항). 운영 화면을 열 때마다 정리한다.
async function purgeOldApplications(db) {
  const old = await all(db, "SELECT id FROM applications WHERE status IN ('rejected','approved') AND decided_at IS NOT NULL AND decided_at < datetime('now','-6 months') AND email NOT LIKE '%@deleted.invalid'");
  for (const a of old) {
    await run(db, "UPDATE applications SET name = '파기', email = ?, phone = NULL, form = '{}', invite_code = NULL, status = 'purged' WHERE id = ?", `purged-${a.id}@deleted.invalid`, a.id);
    await run(db, "UPDATE consents SET ip = NULL WHERE subject_type = 'application' AND subject_id = ?", a.id);
  }
  return old.length;
}
on('GET', '/admin/dashboard', async ({ db, user }) => {
  requireStaff(user);
  await purgeOldApplications(db);
  const byLevel = await all(db, "SELECT level, COUNT(*) AS c FROM users WHERE status = 'active' GROUP BY level");
  const q = async sql => (await one(db, sql))?.c || 0;
  const activeGroups = await q("SELECT COUNT(*) AS c FROM challenges WHERE stage IN ('active','settling') AND type <> 'solo'");
  const expected = await q("SELECT COUNT(*) AS c FROM group_members gm JOIN challenges c ON c.id = gm.challenge_id JOIN checkins ci ON ci.challenge_id = c.id WHERE gm.status = 'active' AND c.stage IN ('active','settling') AND ci.created_at >= datetime('now','-7 days')");
  const submitted = await q("SELECT COUNT(*) AS c FROM checkin_entries e JOIN checkins ci ON ci.id = e.checkin_id WHERE ci.created_at >= datetime('now','-7 days')");
  return {
    levels: byLevel, active_groups: activeGroups, weekly_checkin_rate: expected ? Math.round(submitted / expected * 100) : null,
    first_sales: await q("SELECT COUNT(DISTINCT user_id) AS c FROM badges WHERE code = 'first_sale' AND revoked_at IS NULL"),
    completions: await q("SELECT COUNT(*) AS c FROM badges WHERE code = 'completion' AND revoked_at IS NULL"),
    queues: {
      applications: await q("SELECT COUNT(*) AS c FROM applications WHERE status = 'pending'"),
      challenges: await q("SELECT COUNT(*) AS c FROM challenges WHERE stage = 'review'"),
      agreements: await q("SELECT COUNT(*) AS c FROM agreements WHERE status = 'signed'"),
      settlements: await q("SELECT COUNT(*) AS c FROM settlements WHERE status IN ('confirming','disputed')"),
      papers: await q("SELECT COUNT(*) AS c FROM papers WHERE status = 'review'"),
      promotions: await q("SELECT COUNT(*) AS c FROM promotion_requests WHERE status = 'pending'"),
      disputes: await q("SELECT COUNT(*) AS c FROM disputes WHERE status IN ('open','mediating')"),
    },
  };
});

on('GET', '/admin/applications', async ({ db, user, query }) => {
  requireStaff(user);
  const rows = await all(db, 'SELECT * FROM applications WHERE status = ? ORDER BY created_at DESC LIMIT 200', query.status || 'pending');
  return rows.map(r => ({ ...r, form: parseJ(r.form, {}) }));
});
on('POST', '/admin/applications/:id', async ({ db, request, user, params }) => {
  requireStaff(user); const b = await readJson(request);
  const a = await one(db, 'SELECT * FROM applications WHERE id = ?', params.id); if (!a) throw notfound();
  if (b.decision === 'approve') { const code = inviteCode(); await run(db, "UPDATE applications SET status = 'approved', invite_code = ?, note = ?, decided_at = datetime('now'), decided_by = ? WHERE id = ?", code, str(b.note, 500), user.id, a.id); await audit(db, user.id, 'application.approve', 'applications:' + a.id); return { ok: true, invite_code: code, email: a.email }; }
  if (b.decision === 'reject') { await run(db, "UPDATE applications SET status = 'rejected', note = ?, decided_at = datetime('now'), decided_by = ? WHERE id = ?", str(b.note, 500), user.id, a.id); await audit(db, user.id, 'application.reject', 'applications:' + a.id); return { ok: true }; }
  throw bad('decision은 approve 또는 reject');
});

on('GET', '/admin/users', async ({ db, user, query }) => {
  requireStaff(user);
  const q = `%${query.q || ''}%`;
  const rows = await all(db, 'SELECT u.id, u.email, u.name, u.nickname, u.level, u.role, u.status, u.has_business, u.interests, u.created_at, u.last_seen_at, (SELECT COALESCE(SUM(points),0) FROM points_ledger p WHERE p.user_id = u.id) AS points FROM users u WHERE u.nickname LIKE ? OR u.email LIKE ? OR u.name LIKE ? ORDER BY u.created_at DESC LIMIT 300', q, q, q);
  for (const r of rows) r.badges = await all(db, 'SELECT id, code, created_at FROM badges WHERE user_id = ? AND revoked_at IS NULL', r.id);
  return rows;
});
on('POST', '/admin/users/:id', async ({ db, request, user, params }) => {
  requireStaff(user); const b = await readJson(request);
  const target = await one(db, 'SELECT * FROM users WHERE id = ?', params.id); if (!target) throw notfound();
  if (b.level) { if (!LEVELS.includes(b.level)) throw bad('등급 코드 오류'); await setLevel(db, target.id, b.level, str(b.reason, 300) || '운영진 조정', user.id); await notify(db, target.id, `등급이 ${levelName(b.level)}(으)로 변경됐습니다`, str(b.reason, 300), '#/me'); }
  if (b.status) { if (!['active', 'dormant', 'removed'].includes(b.status)) throw bad('status 오류'); await run(db, 'UPDATE users SET status = ? WHERE id = ?', b.status, target.id); if (b.status === 'removed') await run(db, 'DELETE FROM sessions WHERE user_id = ?', target.id); }
  if (b.role) { if (!['member', 'staff'].includes(b.role)) throw bad('role 오류'); if (target.id === user.id && b.role !== 'staff') throw bad('자기 자신의 운영진 권한은 해제할 수 없습니다'); await run(db, 'UPDATE users SET role = ? WHERE id = ?', b.role, target.id); }
  if (b.badge) { if (!BADGE_NAMES[b.badge]) throw bad('배지 코드 오류'); await grantBadge(db, target.id, b.badge, user.id, str(b.evidence, 300)); if (b.badge === 'first_sale') { const s = await getSettings(db); await addPoints(db, s, target.id, 'first_sale', 'badge', null); } await notify(db, target.id, `${BADGE_NAMES[b.badge]} 배지가 부여됐습니다`, str(b.evidence, 200), '#/me'); }
  if (b.revoke_badge_id) await run(db, "UPDATE badges SET revoked_at = datetime('now') WHERE id = ? AND user_id = ?", Number(b.revoke_badge_id), target.id);
  let temp_password = null;
  if (b.temp_password) {
    temp_password = 'mc' + randomToken(4);
    await run(db, 'UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(temp_password), target.id);
    await run(db, 'DELETE FROM sessions WHERE user_id = ?', target.id);
    await notify(db, target.id, '임시 비밀번호가 발급됐습니다', '로그인한 뒤 내 정보에서 비밀번호를 바꿔 주세요.', '#/me');
  }
  await audit(db, user.id, 'user.update', 'users:' + target.id, { ...b, temp_password: b.temp_password ? 'issued' : undefined });
  return { ok: true, temp_password };
});

on('GET', '/admin/promotions', async ({ db, settings, user }) => {
  requireStaff(user);
  const rows = await all(db, "SELECT pr.*, u.nickname, u.level, u.email FROM promotion_requests pr JOIN users u ON u.id = pr.user_id WHERE pr.status = 'pending' ORDER BY pr.created_at");
  for (const r of rows) { const u = await one(db, 'SELECT * FROM users WHERE id = ?', r.user_id); const pts = await pointsOf(db, u.id); const badges = await all(db, 'SELECT code FROM badges WHERE user_id = ? AND revoked_at IS NULL', u.id); r.progress = await levelProgress(db, settings, u, pts, badges); r.points = pts; }
  return rows;
});
on('POST', '/admin/promotions/:id', async ({ db, request, user, params }) => {
  requireStaff(user); const b = await readJson(request);
  const pr = await one(db, 'SELECT * FROM promotion_requests WHERE id = ?', params.id); if (!pr) throw notfound();
  if (!['approve', 'hold', 'reject'].includes(b.decision)) throw bad('decision 오류');
  if (!str(b.note, 2) && b.decision !== 'approve') throw bad('보류·반려 사유를 적어 주세요');
  const status = { approve: 'approved', hold: 'held', reject: 'rejected' }[b.decision];
  await run(db, "UPDATE promotion_requests SET status = ?, reviewer_id = ?, decision_note = ?, decided_at = datetime('now') WHERE id = ?", status, user.id, str(b.note, 1000), pr.id);
  if (b.decision === 'approve') { await setLevel(db, pr.user_id, pr.target_level, '승급 심사 승인', user.id); await notify(db, pr.user_id, `${levelName(pr.target_level)}가 되셨습니다`, str(b.note, 300) || '축하합니다', '#/me'); }
  else await notify(db, pr.user_id, `승급 심사 결과: ${b.decision === 'hold' ? '보류' : '반려'}`, str(b.note, 300), '#/me');
  await audit(db, user.id, 'promotion.' + b.decision, 'promotion_requests:' + pr.id, { note: b.note });
  return { ok: true };
});

on('GET', '/admin/challenges', async ({ db, user }) => {
  requireStaff(user);
  const rows = await all(db, "SELECT c.*, u.nickname AS leader_nickname FROM challenges c JOIN users u ON u.id = c.leader_id WHERE c.stage IN ('review','proposed') ORDER BY c.created_at");
  return rows.map(r => ({ ...r, proposal: parseJ(r.proposal, {}), review: parseJ(r.review, null), field_name: FIELDS[r.field_code] }));
});
on('GET', '/admin/settlements', async ({ db, user }) => {
  requireStaff(user);
  const rows = await all(db, "SELECT s.id, s.challenge_id, s.status, s.period_start, s.period_end, s.result, s.created_at, c.title FROM settlements s JOIN challenges c ON c.id = s.challenge_id WHERE s.status IN ('confirming','disputed','reviewed') ORDER BY s.created_at");
  return rows.map(r => ({ ...r, result: summarizeResult(parseJ(r.result, {})) }));
});
on('GET', '/admin/disputes', async ({ db, user }) => {
  requireStaff(user);
  return all(db, "SELECT d.*, u.nickname FROM disputes d JOIN users u ON u.id = d.filed_by WHERE d.status IN ('open','mediating') ORDER BY d.created_at");
});
on('POST', '/admin/disputes/:id', async ({ db, request, user, params }) => {
  requireStaff(user); const b = await readJson(request);
  await run(db, "UPDATE disputes SET status = COALESCE(?, status), stage = COALESCE(?, stage), result = COALESCE(?, result), assignee_id = ?, resolved_at = CASE WHEN ? IN ('resolved','closed') THEN datetime('now') ELSE resolved_at END WHERE id = ?", b.status || null, b.stage ? Number(b.stage) : null, str(b.result, 2000), user.id, b.status || '', params.id);
  await audit(db, user.id, 'dispute.update', 'disputes:' + params.id, b);
  return { ok: true };
});

on('GET', '/admin/settings', async ({ db, user }) => { requireStaff(user); return { settings: await getSettings(db), overrides: (await all(db, 'SELECT key, value, version, updated_at FROM settings')).map(r => ({ ...r, value: parseJ(r.value) })) }; });
on('PUT', '/admin/settings', async ({ db, request, user }) => {
  requireStaff(user); const b = await readJson(request);
  must(b.key, 'key'); if (b.value === undefined) throw bad('value가 필요합니다');
  const allowed = ['levels', 'points', 'presets', 'hq_ratio_range', 'min_settlement', 'budget_cap_person', 'budget_cap_group', 'agency_rate', 'withholding_rate', 'share_adjust_limit', 'share_alert_gap', 'visibility', 'review_pass_score', 'min_group', 'max_group'];
  if (!allowed.includes(b.key)) throw bad('수정할 수 없는 설정 키입니다');
  await run(db, "INSERT INTO settings (key, value, version, updated_by) VALUES (?,?,1,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, version = settings.version + 1, updated_by = excluded.updated_by, updated_at = datetime('now')", b.key, J(b.value), user.id);
  await audit(db, user.id, 'settings.update', 'settings:' + b.key, b.value);
  return { ok: true };
});
on('GET', '/admin/audit', async ({ db, user, query }) => { requireStaff(user); return all(db, 'SELECT a.*, u.nickname FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC LIMIT ?', Math.min(Number(query.limit || 100), 500)); });


// ----- 데이터 내려받기 (CSV, 엑셀용 UTF-8 BOM) -----
const EXPORTS = {
  users: "SELECT id, email, name, nickname, phone, level, role, status, has_business, interests, created_at, last_seen_at FROM users ORDER BY id",
  applications: "SELECT id, name, email, phone, status, invite_code, created_at, decided_at, note, form FROM applications ORDER BY id",
  challenges: "SELECT c.id, c.type, c.title, c.field_code, c.stage, u.nickname AS leader, c.round_id, c.created_at, c.updated_at FROM challenges c JOIN users u ON u.id = c.leader_id ORDER BY c.id",
  ledger: "SELECT l.id, l.challenge_id, c.title AS challenge, l.kind, l.entry_date, l.amount, l.is_external, l.channel, l.category, l.payer_type, l.payer_id, l.evidence, l.note, l.entered_by, l.confirmed_by, l.created_at FROM ledger_entries l JOIN challenges c ON c.id = l.challenge_id ORDER BY l.id",
  settlements: "SELECT s.id, s.challenge_id, c.title AS challenge, s.status, s.period_start, s.period_end, s.created_at FROM settlements s JOIN challenges c ON c.id = s.challenge_id ORDER BY s.id",
  payouts: "SELECT p.id, p.settlement_id, p.user_id, COALESCE(u.nickname, '운영본부') AS nickname, u.name, p.kind, p.gross, p.withholding_rate, p.withholding, p.net, p.status, p.paid_at FROM settlement_payouts p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.id",
  papers: "SELECT p.id, p.challenge_id, c.title AS challenge, p.status, p.publish_scope, p.submitted_at, p.published_at FROM papers p JOIN challenges c ON c.id = p.challenge_id ORDER BY p.id",
  points: "SELECT p.id, p.user_id, u.nickname, p.action, p.points, p.ref_type, p.ref_id, p.quarter, p.created_at FROM points_ledger p JOIN users u ON u.id = p.user_id ORDER BY p.id",
  consents: "SELECT id, subject_type, subject_id, kind, version, created_at FROM consents ORDER BY id",
};
function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = v => { if (v == null) return ''; const t = String(v); return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n');
}
on('GET', '/admin/export', async ({ db, user, query }) => {
  requireStaff(user);
  const sql = EXPORTS[query.table];
  if (!sql) throw bad('내려받을 수 없는 표입니다. users, applications, challenges, ledger, settlements, payouts, papers, points, consents 중에서 고르세요');
  const rows = await all(db, sql);
  await audit(db, user.id, 'export', 'table:' + query.table, { rows: rows.length });
  const name = `machal-${query.table}-${today()}.csv`;
  return new Response('\uFEFF' + toCsv(rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' } });
});
