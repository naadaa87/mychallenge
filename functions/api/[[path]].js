// 마이챌린지(마챌) API — Cloudflare Pages Functions + D1
// 모든 경로는 /api/* 로 들어온다. v2.0: 정기모임 · 학습/도전그룹 · 출석 · 기록 · 성과 중심 커뮤니티 운영.

import {
  HttpError, bad, unauth, forbid, notfound, json, readJson, parseJ, J, nowIso, today,
  one, all, run, insert, getSettings, hashPassword, verifyPassword, randomToken, inviteCode,
  sessionCookie, clearCookie, currentUser, requireUser, requireStaff, requireLevel, isStaff, lvlAtLeast,
  addPoints, pointsOf, maybeAutoPromote, setLevel, grantBadge, badgeCount, notify, notifyStaff, audit,
  str, must, intv, getCookie, COOKIE, HttpError as HttpErr, markCookie, jsonWithCookies,
} from '../_lib/util.js';
import { POLICY_VERSION, SITE } from '../_site/config.js';
import { SCHEMA_STATEMENTS, SCHEMA_TABLES } from '../_lib/schema.generated.js';
import { LEVELS, LEVEL_NAMES, FIELDS, BADGE_NAMES, BOARDS, EVENT_TYPES, EVENT_TOPICS, GROUP_TYPES, GOAL_METRICS, LEGACY_POINT_LABELS, levelIndex, quarterOf, normalizePolicy } from '../_lib/rules.js';
import { registerGroupRoutes, myGroupsSummary, loadGroup, membership, activeMembers, isActive, isManagerOf, isLeaderOf, groupAttendance, emptyStats, band, kstNow } from '../_lib/group-routes.js';
import { registerAdminRoutes, runMigrations, isOwner, requireOwner } from '../_lib/admin-routes.js';
import { registerKpiRoutes } from '../_lib/kpi-routes.js';
import { registerCommunityRoutes, chatInfo } from '../_lib/community-routes.js';

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

// D1에 표가 없거나 모자라면 schema.sql 내용을 그대로 실행한다(모두 IF NOT EXISTS라 여러 번 실행해도 안전).
// 인스턴스마다 한 번만 확인한다.
let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  const have = await db.prepare(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name IN (${SCHEMA_TABLES.map(() => '?').join(',')})`).bind(...SCHEMA_TABLES).first();
  if ((have?.c || 0) < SCHEMA_TABLES.length) await db.batch(SCHEMA_STATEMENTS.map(sql => db.prepare(sql)));
  // 이미 있던 표에 새 열을 붙이는 보강(ALTER TABLE)은 schema_migrations에 기록하며 한 번씩만 실행한다.
  await runMigrations(db);
  schemaReady = true;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathParts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const db = env.DB;
  if (!db) return json({ error: 'D1 바인딩(DB)이 설정되지 않았습니다. README의 배포 안내를 확인하세요.' }, 500);
  try {
    await ensureSchema(db);
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

// ---------- 공통 ----------
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
  const active = await one(db, "SELECT COUNT(*) AS c FROM challenges WHERE stage IN ('recruiting','active')");
  const groups = await all(db, "SELECT type, COUNT(*) AS c FROM challenges WHERE stage IN ('recruiting','active') GROUP BY type");
  const recruiting = await all(db, `SELECT c.id, c.title, c.type, c.summary, c.schedule_text, c.capacity, (SELECT COUNT(*) FROM group_members gm WHERE gm.challenge_id = c.id AND gm.status = 'active') AS members
    FROM challenges c WHERE c.stage IN ('recruiting','active') AND c.recruit_open = 1 ORDER BY c.updated_at DESC LIMIT 6`);
  const sessions = await one(db, "SELECT COUNT(*) AS c FROM group_sessions WHERE status = 'closed'");
  const dist = await all(db, "SELECT stage, public_numbers FROM challenges WHERE stage IN ('closed','stopped')");
  let with_sales = 0, without_sales = 0, stopped = 0;
  for (const d of dist) { if (d.stage === 'stopped') stopped++; else if (parseJ(d.public_numbers, {})?.has_sales) with_sales++; else without_sales++; }
  const papers = await one(db, "SELECT COUNT(*) AS c FROM papers WHERE status IN ('approved','published')");
  const first_sales = await one(db, "SELECT COUNT(DISTINCT user_id) AS c FROM badges WHERE code = 'first_sale' AND revoked_at IS NULL");
  // 모집 중인 라운드 (홈·지원 페이지 안내 띠에 쓴다)
  const round = await one(db, "SELECT name, start_date, end_date, recruit_until FROM rounds WHERE status = 'open' AND COALESCE(recruit_until, start_date) >= date('now','+9 hours') ORDER BY start_date LIMIT 1");
  return { members: members?.c || 0, active_challenges: active?.c || 0, groups: { study: groups.find(g => g.type === 'study')?.c || 0, challenge: groups.find(g => g.type === 'challenge')?.c || 0 },
    recruiting: recruiting.map(r => ({ ...r, type_name: GROUP_TYPES[r.type] || r.type })), sessions_held: sessions?.c || 0,
    closed: { with_sales, without_sales, stopped }, papers: papers?.c || 0, first_sales: first_sales?.c || 0, round: round || null };
});

on('GET', '/public/levels', async ({ settings }) => ({ levels: LEVELS.map(l => ({ code: l, name: LEVEL_NAMES[l] })), rules: settings.levels, visibility: settings.visibility, points: settings.points, groups: settings.groups, attendance_default: normalizePolicy(settings.attendance_default) }));

on('GET', '/public/papers', async ({ db }) => {
  const rows = await all(db, "SELECT p.id, p.form, p.private_fields, p.published_at, c.title, c.field_code FROM papers p JOIN challenges c ON c.id = p.challenge_id WHERE p.status IN ('approved','published') AND p.publish_scope = 'public' ORDER BY p.published_at DESC LIMIT 50");
  return rows.map(r => paperSummary(r));
});

// 일정 시각은 운영진이 입력한 한국 시각(KST) 그대로 저장한다. 비교도 KST 기준으로.
const KST_NOW = "datetime('now','+9 hours')";
on('GET', '/public/events', async ({ db }) => (await all(db, `SELECT id, type, title, starts_at, location, mode, topics, min_level FROM events WHERE starts_at >= ${KST_NOW} AND status <> 'cancelled' ORDER BY starts_at LIMIT 10`))
  .map(e => ({ ...e, type_name: EVENT_TYPES[e.type] || e.type, topic_names: String(e.topics || '').split(',').filter(Boolean).map(t => EVENT_TOPICS[t] || t) })));

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
  for (const k of ['job', 'years', 'hours_weekday', 'hours_weekend', 'experience', 'interests', 'why_group', 'want_group', 'project_idea', 'side_job_check', 'consent_public', 'can_attend', 'give', 'referrer', 'question']) form[k] = str(b[k], 1000);
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
  await run(db, "INSERT OR IGNORE INTO admin_roles (user_id, role) VALUES (?, 'owner')", id);
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

// 회원 탈퇴: 개인정보는 지우고, 그룹에 함께 남긴 기록(출석·도전 기록·성과)은 이름 없이 남긴다
on('POST', '/me/withdraw', async ({ db, request, user }) => {
  requireUser(user);
  const b = await readJson(request);
  const row = await one(db, 'SELECT password_hash, email FROM users WHERE id = ?', user.id);
  if (!(await verifyPassword(String(b.password || ''), row.password_hash))) throw bad('비밀번호가 맞지 않습니다');
  const leading = await one(db, "SELECT title FROM challenges WHERE leader_id = ? AND stage IN ('recruiting','active') LIMIT 1", user.id);
  if (leading) throw bad(`그룹리더로 이끄는 그룹(${leading.title})이 진행 중입니다. 그룹을 종료하거나 운영진에게 리더 변경을 요청한 뒤 탈퇴할 수 있습니다`);
  if (user.role === 'staff') {
    const staff = await one(db, "SELECT COUNT(*) AS c FROM users WHERE role = 'staff' AND status = 'active'");
    if ((staff?.c || 0) <= 1) throw bad('마지막 운영진 계정은 탈퇴할 수 없습니다. 다른 운영진을 먼저 지정해 주세요');
  }
  await run(db, "UPDATE group_members SET status = 'left', left_at = datetime('now'), leave_type = 'self', leave_note = '회원 탈퇴' WHERE user_id = ? AND status IN ('active','applied')", user.id);
  const ghostEmail = `withdrawn-${user.id}-${randomToken(4)}@deleted.invalid`;
  await run(db, "UPDATE users SET email = ?, name = '탈퇴회원', nickname = ?, phone = NULL, bio = NULL, asset_diag = NULL, interests = NULL, password_hash = ?, status = 'removed', role = 'member', can_lead = 0 WHERE id = ?", ghostEmail, '탈퇴회원' + user.id, await hashPassword(randomToken(16)), user.id);
  const apps = await all(db, 'SELECT id FROM applications WHERE email = ?', row.email);
  await run(db, "UPDATE applications SET name = '탈퇴회원', email = ?, phone = NULL, form = '{}' WHERE email = ?", ghostEmail, row.email);
  await run(db, "UPDATE consents SET ip = NULL WHERE subject_type = 'user' AND subject_id = ?", user.id);
  for (const a of apps) await run(db, "UPDATE consents SET ip = NULL WHERE subject_type = 'application' AND subject_id = ?", a.id);
  await run(db, 'DELETE FROM sessions WHERE user_id = ?', user.id);
  await run(db, 'DELETE FROM notifications WHERE user_id = ?', user.id);
  await run(db, 'UPDATE analytics_events SET user_id = NULL WHERE user_id = ?', user.id);
  await run(db, "UPDATE leader_applications SET form = '{}' WHERE user_id = ?", user.id);
  await audit(db, user.id, 'user.withdraw', 'users:' + user.id);
  return jsonWithCookies({ ok: true }, [clearCookie(), markCookie(false)]);
});

async function meSummary(db, settings, u) {
  const pts = await pointsOf(db, u.id);
  const badges = await all(db, 'SELECT id, code, created_at, evidence FROM badges WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at', u.id);
  const unread = await one(db, 'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL', u.id);
  const groups = (await all(db, "SELECT c.id, c.title, c.stage, c.type, c.field_code, gm.role, gm.status AS member_status FROM group_members gm JOIN challenges c ON c.id = gm.challenge_id WHERE gm.user_id = ? AND gm.status IN ('active','applied') AND c.stage IN ('recruiting','active') ORDER BY c.updated_at DESC", u.id))
    .map(g => ({ ...g, type_name: GROUP_TYPES[g.type] || g.type }));
  const progress = await levelProgress(db, settings, u, pts, badges);
  return { ...u, community_chat: chatInfo(settings), chat_status: u.chat_status || 'none', can_lead: !!u.can_lead || u.role === 'staff', asset_diag: parseJ(u.asset_diag, null), level_name: levelName(u.level), points: pts, badges: badges.map(b => ({ ...b, name: BADGE_NAMES[b.code] || b.code })), unread: unread?.c || 0, groups, progress, is_owner: u.role === 'staff' ? await isOwner(db, u) : false };
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
    items.push({ label: `정기모임·세미나 ${r.require_event}회 참석`, done: (ev?.c || 0) >= r.require_event, cur: ev?.c || 0, goal: r.require_event });
    items.push({ label: `가입 후 ${r.min_days}일 경과`, done: (days?.d || 0) >= r.min_days, cur: Math.floor(days?.d || 0), goal: r.min_days });
  }
  if (next === 'L3') {
    items.push({ label: '그룹 1회 완주 (그룹 출석 기준 충족)', done: count('completion') >= 1, cur: count('completion'), goal: 1, or: true });
    items.push({ label: '또는 그룹의 첫 매출 확인', done: count('first_sale') >= 1, cur: count('first_sale'), goal: 1, or: true });
  }
  if (next === 'L4') {
    items.push({ label: '그룹 2회 완주', done: count('completion') >= 2, cur: count('completion'), goal: 2 });
    items.push({ label: '그룹리더 워크숍 이수 + 운영진 면담 (심사에서 확인)', done: false, cur: 0, goal: 1, manual: true });
  }
  if (next === 'L5') {
    items.push({ label: '그룹리더로 그룹 2회 완주', done: count('leader_completion') >= 2, cur: count('leader_completion'), goal: 2, or: true });
    items.push({ label: '또는 3개월 연속 매출 확인', done: count('repeat_sale') >= 1, cur: count('repeat_sale'), goal: 1, or: true });
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
  return { totals: await pointsOf(db, user.id), rows: rows.map(r => ({ ...r, label: settings.points[r.action]?.label || LEGACY_POINT_LABELS[r.action] || r.action })) };
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
  const groups = await myGroupsSummary(db, settings, user);
  const tasks = [];
  const now = kstNow();
  for (const g of groups) {
    if (g.member_status === 'applied') { tasks.push({ type: 'applied', text: `「${g.title}」 참여 신청 결과를 기다리는 중입니다`, link: `#/groups/${g.id}` }); continue; }
    const s = g.next_session;
    if (s && s.status === 'open' && !['present', 'late'].includes(s.my_status)) tasks.push({ type: 'checkin', text: `「${g.title}」 출석을 받고 있습니다. 출석 코드를 입력해 주세요`, link: `#/groups/${g.id}/sessions` });
    else if (s && s.status === 'scheduled' && !s.my_rsvp && s.starts_at.slice(0, 10) <= new Date(Date.now() + 9 * 3600e3 + 3 * 86400e3).toISOString().slice(0, 10)) tasks.push({ type: 'rsvp', text: `「${g.title}」 ${s.starts_at.slice(5, 16).replace('T', ' ')} 모임에 참석하시나요?`, link: `#/groups/${g.id}/sessions` });
    if (g.warnings) tasks.push({ type: 'warning', text: `「${g.title}」 출석 경고 ${g.warnings}회${g.policy?.kick_warnings ? ` (기준 ${g.policy.kick_warnings}회)` : ''}`, link: `#/groups/${g.id}` });
    if (g.applicants) tasks.push({ type: 'leader', text: `「${g.title}」 참여 신청 ${g.applicants}건을 확인해 주세요`, link: `#/groups/${g.id}/members` });
    if (g.open_sessions) tasks.push({ type: 'leader', text: `「${g.title}」 출석을 열어 둔 모임이 있습니다. 모임이 끝나면 마감해 주세요`, link: `#/groups/${g.id}/sessions` });
    if (g.unchecked) tasks.push({ type: 'leader', text: `「${g.title}」 출석을 받지 않은 지난 모임이 ${g.unchecked}개 있습니다`, link: `#/groups/${g.id}/sessions` });
  }
  const pres = await all(db, `SELECT p.title, p.status, e.title AS event_title, e.starts_at FROM event_presentations p JOIN events e ON e.id = p.event_id WHERE p.user_id = ? AND p.status IN ('applied','confirmed') AND e.starts_at >= ?`, user.id, now);
  for (const p of pres) tasks.push({ type: 'present', text: `${p.event_title} 발표 ${p.status === 'confirmed' ? '확정' : '신청 접수'} · ${p.title}`, link: '#/events' });
  const events = (await all(db, `SELECT id, type, title, starts_at, location, mode FROM events WHERE starts_at >= ${KST_NOW} AND status <> 'cancelled' ORDER BY starts_at LIMIT 5`)).map(e => ({ ...e, type_name: EVENT_TYPES[e.type] || e.type }));
  const notis = await all(db, 'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', user.id);
  const feed = await feedItems(db, 8);
  const leader = me.can_lead ? null : await one(db, "SELECT status, created_at FROM leader_applications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1", user.id);
  return { me, groups, tasks, events, notifications: notis, feed, leader_application: leader };
});

// =====================================================================
// 라운드
// =====================================================================
on('GET', '/rounds', async ({ db }) => all(db, 'SELECT * FROM rounds ORDER BY start_date DESC'));
on('POST', '/admin/rounds', async ({ db, request, user }) => {
  requireStaff(user); const b = await readJson(request);
  must(b.name, '시즌 이름'); must(b.start_date, '시작일'); must(b.end_date, '종료일');
  if (b.end_date < b.start_date) throw bad('종료일이 시작일보다 빠릅니다');
  const status = ['planning', 'open', 'active', 'closed'].includes(b.status) ? b.status : 'planning';
  const id = await insert(db, 'INSERT INTO rounds (name, start_date, end_date, status, recruit_until) VALUES (?,?,?,?,?)', str(b.name, 50), b.start_date, b.end_date, status, b.recruit_until || null);
  await audit(db, user.id, 'round.create', 'rounds:' + id, b);
  return { ok: true, id };
});
on('PUT', '/admin/rounds/:id', async ({ db, request, user, params }) => {
  requireStaff(user); const b = await readJson(request);
  if (b.status && !['planning', 'open', 'active', 'closed'].includes(b.status)) throw bad('시즌 상태는 planning, open, active, closed 중 하나');
  await run(db, 'UPDATE rounds SET name = COALESCE(?, name), start_date = COALESCE(?, start_date), end_date = COALESCE(?, end_date), status = COALESCE(?, status), recruit_until = CASE WHEN ? THEN ? ELSE recruit_until END WHERE id = ?', str(b.name, 50), b.start_date || null, b.end_date || null, b.status || null, b.recruit_until !== undefined ? 1 : 0, b.recruit_until || null, params.id);
  await audit(db, user.id, 'round.update', 'rounds:' + params.id, b);
  return { ok: true };
});

const PAPER_FIXED_PUBLIC = ['has_sales', 'customers_band', 'hours'];
function paperSummary(r) {
  const f = parseJ(r.form, r.form || {}) || {}; const priv = parseJ(r.private_fields, r.private_fields || []) || [];
  return { id: r.id, title: r.title, field_code: r.field_code, field_name: FIELDS[r.field_code], status: r.status, published_at: r.published_at, publish_scope: r.publish_scope,
    summary: { name: f.name, pain: f.pain, state: f.state, has_sales: f.has_sales, customers_band: f.customers_band, hours: f.hours, lesson: (f.good || [])[0] || null } };
}
// 프로젝트 페이퍼 — 그룹을 마치며 그룹리더가 정리하는 결과 기록. 성과 기록·출석에서 숫자를 미리 채운다.
async function paperGroup(db, settings, user, id, leader) {
  requireUser(user);
  const c = await loadGroup(db, settings, id);
  const m = await membership(db, c.id, user.id);
  if (leader ? !isLeaderOf(user, c) : !(isActive(m) || isStaff(user))) throw forbid(leader ? '그룹리더만 할 수 있습니다' : '그룹원만 볼 수 있습니다');
  return { c, m };
}
on('GET', '/groups/:id/paper/prefill', async ({ db, settings, user, params }) => {
  const { c } = await paperGroup(db, settings, user, params.id, false);
  const t = await one(db, `SELECT COALESCE(SUM(CASE WHEN metric = 'revenue' THEN value END),0) AS revenue, COALESCE(SUM(CASE WHEN metric = 'customers' THEN value END),0) AS customers,
    COALESCE(SUM(CASE WHEN metric = 'sales' THEN value END),0) AS sales FROM group_results WHERE challenge_id = ? AND deleted_at IS NULL`, c.id);
  const sess = await one(db, "SELECT COUNT(*) AS n, COALESCE(SUM(duration_min),0) AS mins FROM group_sessions WHERE challenge_id = ? AND status = 'closed'", c.id);
  const att = await groupAttendance(db, c);
  const rates = Object.values(att).map(x => x.rate).filter(x => x != null);
  const members = (await activeMembers(db, c.id)).length;
  const milestones = (await all(db, 'SELECT title FROM milestones WHERE challenge_id = ? AND done_at IS NOT NULL ORDER BY done_at LIMIT 5', c.id)).map(r => r.title);
  const hours = Math.round((sess?.mins || 0) / 60 * members);
  return { name: c.title, field_code: c.field_code, revenue_external: Math.round(t?.revenue || 0), revenue_internal: 0, expenses: 0, customers_count: Math.round(t?.customers || 0), customers_band: band(t?.customers || 0),
    has_sales: (t?.revenue || 0) > 0, hours, sessions: sess?.n || 0, avg_rate: rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null, milestones };
});

on('POST', '/groups/:id/paper', async ({ db, settings, request, user, params }) => {
  const { c } = await paperGroup(db, settings, user, params.id, true);
  const b = await readJson(request);
  const f = b.form || {};
  const form = {
    name: str(f.name, 80) || c.title, pain: str(f.pain, 500), product: str(f.product, 500), milestones: (f.milestones || []).map(s => str(s, 200)).filter(Boolean).slice(0, 5),
    revenue_external: intv(f.revenue_external || 0, '매출', { min: 0 }), revenue_internal: intv(f.revenue_internal || 0, '지인·내부 매출', { min: 0 }), customers: intv(f.customers || 0, '고객 수', { min: 0 }),
    hours: Number(f.hours || 0), expenses: intv(f.expenses || 0, '총 비용', { min: 0 }), state: ['ongoing', 'transferred', 'stopped', 'closed'].includes(f.state) ? f.state : 'ongoing',
    good: (f.good || []).map(s => str(s, 300)).filter(Boolean).slice(0, 3), bad: (f.bad || []).map(s => str(s, 300)).filter(Boolean).slice(0, 3), next: str(f.next, 1000), to_next: str(f.to_next, 1000),
  };
  form.has_sales = form.revenue_external > 0; form.customers_band = band(form.customers); form.hourly_net = form.hours ? Math.round((form.revenue_external - form.expenses) / form.hours) : null;
  const priv = (b.private_fields || []).filter(k => !PAPER_FIXED_PUBLIC.includes(k));
  const scope = b.publish_scope === 'public' ? 'public' : 'members';
  const existing = await one(db, 'SELECT * FROM papers WHERE challenge_id = ?', c.id);
  if (existing && ['review', 'approved', 'published'].includes(existing.status) && !isStaff(user)) throw bad('제출한 페이퍼는 운영진이 보완을 요청한 뒤에만 고칠 수 있습니다');
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
    const pf = parseJ(p.form, {}); const ch = await one(db, 'SELECT public_numbers FROM challenges WHERE id = ?', p.cid); const pn = parseJ(ch?.public_numbers, {}) || {};
    await run(db, "UPDATE challenges SET public_numbers = ?, updated_at = datetime('now') WHERE id = ?", J({ ...pn, has_sales: !!pf.has_sales, customers_band: pf.customers_band || pn.customers_band, hours: pf.hours || pn.hours }), p.cid);
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
  const full = isStaff(user) || isActive(m) || lvlAtLeast(user, settings.visibility.paper_full);
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
  return rows.map(r => ({ ...paperSummary(r), leader: r.leader, challenge_id: r.challenge_id, submitted_at: r.submitted_at, form: parseJ(r.form, {}) }));
});

// =====================================================================
// 커뮤니티 · 이벤트
// =====================================================================
async function feedItems(db, limit = 30) {
  const logs = await all(db, "SELECT 'group' AS kind, c.id, c.title, c.type, c.created_at, u.nickname FROM challenges c JOIN users u ON u.id = c.leader_id WHERE c.stage IN ('recruiting','active','closed') ORDER BY c.created_at DESC LIMIT ?", limit);
  const posts = await all(db, "SELECT 'post' AS kind, p.id, p.title, p.board, p.challenge_id, p.created_at, u.nickname, p.helpful_count FROM posts p JOIN users u ON u.id = p.author_id WHERE p.hidden = 0 ORDER BY p.created_at DESC LIMIT ?", limit);
  const ups = await all(db, "SELECT 'level' AS kind, h.id, h.to_level, h.created_at, u.nickname FROM level_history h JOIN users u ON u.id = h.user_id WHERE h.to_level >= 'L2' ORDER BY h.created_at DESC LIMIT ?", limit);
  const bd = await all(db, "SELECT 'badge' AS kind, b.id, b.code, b.created_at, u.nickname FROM badges b JOIN users u ON u.id = b.user_id WHERE b.revoked_at IS NULL AND b.code IN ('first_sale','completion','repeat_sale') ORDER BY b.created_at DESC LIMIT ?", limit);
  return [...logs.map(x => ({ ...x, title: `새 ${GROUP_TYPES[x.type] || '그룹'}: ${x.title}`, challenge_id: x.id })), ...posts, ...ups.map(x => ({ ...x, title: `${x.nickname}님이 ${levelName(x.to_level)}가 되었습니다` })), ...bd.map(x => ({ ...x, title: `${x.nickname}님 · ${BADGE_NAMES[x.code]} 배지` }))].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, limit);
}
on('GET', '/feed', async ({ db, user }) => { requireLevel(user, 'L1'); return feedItems(db, 40); });

on('GET', '/posts', async ({ db, settings, user, query }) => {
  requireLevel(user, 'L1');
  const where = ['p.hidden = 0']; const p = [];
  if (query.board) { where.push('p.board = ?'); p.push(query.board); }
  if (query.group) { where.push('p.challenge_id = ?'); p.push(Number(query.group)); }
  return all(db, `SELECT p.id, p.board, p.title, p.helpful_count, p.created_at, p.challenge_id, c.title AS group_title, u.nickname, u.level, (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id AND cm.hidden = 0) AS comment_count
    FROM posts p JOIN users u ON u.id = p.author_id LEFT JOIN challenges c ON c.id = p.challenge_id WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC LIMIT 100`, ...p);
});
on('POST', '/posts', async ({ db, settings, request, user }) => {
  requireLevel(user, 'L1');
  const b = await readJson(request);
  const board = BOARDS[b.board] ? b.board : 'share';
  if (board === 'notice') requireStaff(user);
  must(b.title, '제목'); must(b.body, '내용');
  const banned = /(원금\s*보장|수익\s*보장|무조건\s*(수익|된다)|월\s*\d+\s*만\s*원\s*보장)/;
  if (banned.test(b.title + ' ' + b.body)) throw bad('수익이나 원금을 보장하는 표현은 쓸 수 없습니다 (마챌 원칙 1)');
  let cid = null;
  if (b.challenge_id) { const c = await loadGroup(db, settings, b.challenge_id); const m = await membership(db, c.id, user.id); if (!isActive(m) && !isStaff(user)) throw forbid('참여 중인 그룹의 소식만 올릴 수 있습니다'); cid = c.id; }
  if (board === 'group' && !cid) throw bad('그룹 소식은 그룹을 골라서 올려 주세요');
  const id = await insert(db, 'INSERT INTO posts (author_id, board, title, body, challenge_id) VALUES (?,?,?,?,?)', user.id, board, str(b.title, 100), str(b.body, 5000), cid);
  await addPoints(db, settings, user.id, 'post', 'post', id);
  return { ok: true, id };
});
on('GET', '/posts/:id', async ({ db, user, params }) => {
  requireLevel(user, 'L1');
  const p = await one(db, 'SELECT p.*, u.nickname, u.level, c.title AS group_title, c.type AS group_type FROM posts p JOIN users u ON u.id = p.author_id LEFT JOIN challenges c ON c.id = p.challenge_id WHERE p.id = ? AND p.hidden = 0', params.id);
  if (!p) throw notfound();
  p.comments = await all(db, 'SELECT c.*, u.nickname, u.level FROM comments c JOIN users u ON u.id = c.author_id WHERE c.post_id = ? AND c.hidden = 0 ORDER BY c.created_at', p.id);
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
  const rows = await all(db, "SELECT e.*, (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS registered, (SELECT status FROM registrations r WHERE r.event_id = e.id AND r.user_id = ?) AS my_status FROM events e WHERE e.starts_at >= datetime('now','-21 days') AND (e.status <> 'cancelled' OR ?) ORDER BY e.starts_at", user.id, isStaff(user) ? 1 : 0);
  const ids = rows.map(r => r.id);
  const pres = ids.length ? await all(db, `SELECT p.id, p.event_id, p.user_id, p.challenge_id, p.title, p.summary, p.link, p.status, u.nickname, c.title AS group_title FROM event_presentations p JOIN users u ON u.id = p.user_id LEFT JOIN challenges c ON c.id = p.challenge_id
    WHERE p.event_id IN (${ids.map(() => '?').join(',')}) AND (p.status IN ('confirmed','presented') OR p.user_id = ? OR ?) ORDER BY p.created_at`, ...ids, user.id, isStaff(user) ? 1 : 0) : [];
  // 내가 그룹리더·부리더인 진행 중 그룹 (성과발표회 발표 신청용)
  const myGroups = await all(db, "SELECT c.id, c.title FROM group_members gm JOIN challenges c ON c.id = gm.challenge_id WHERE gm.user_id = ? AND gm.status = 'active' AND gm.role IN ('leader','sub') AND c.stage IN ('recruiting','active','closed') ORDER BY c.updated_at DESC", user.id);
  return { my_groups: myGroups, events: rows.map(r => {
    const { attendance_code, online_url, ...rest } = r;
    const out = isStaff(user) ? { ...r } : { ...rest, online_url: ['registered', 'attended'].includes(r.my_status) ? online_url : null };
    return { ...out, type_name: EVENT_TYPES[r.type] || r.type, topic_names: String(r.topics || '').split(',').filter(Boolean).map(t => EVENT_TOPICS[t] || t), presentations: pres.filter(p => p.event_id === r.id).map(p => ({ ...p, mine: p.user_id === user.id })) };
  }) };
});
export function eventFields(b) {
  const topics = (Array.isArray(b.topics) ? b.topics : String(b.topics || '').split(',')).map(t => String(t).trim()).filter(t => EVENT_TOPICS[t]);
  const url = str(b.online_url, 300);
  if (url && !/^https?:\/\/\S+$/i.test(url)) throw bad('온라인 참여 링크는 http로 시작해야 합니다');
  return { type: EVENT_TYPES[b.type] ? b.type : 'regular', mode: ['offline', 'online', 'hybrid'].includes(b.mode) ? b.mode : 'offline', online_url: url, topics: topics.join(',') || null };
}
on('POST', '/admin/events', async ({ db, request, user }) => {
  requireStaff(user); const b = await readJson(request);
  must(b.title, '제목'); must(b.starts_at, '일시');
  const f = eventFields(b);
  const id = await insert(db, 'INSERT INTO events (type, title, starts_at, location, capacity, min_level, description, attendance_code, mode, online_url, topics, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    f.type, str(b.title, 100), b.starts_at, str(b.location, 100), b.capacity ? Number(b.capacity) : null, LEVELS.includes(b.min_level) ? b.min_level : 'L1', str(b.description, 2000),
    (b.attendance_code || randomToken(2)).toUpperCase().slice(0, 8), f.mode, f.online_url, f.topics, user.id);
  await audit(db, user.id, 'event.create', 'events:' + id);
  return { ok: true, id };
});
on('POST', '/events/:id/register', async ({ db, user, params }) => {
  requireLevel(user, 'L1');
  const e = await one(db, 'SELECT * FROM events WHERE id = ?', params.id); if (!e) throw notfound();
  if (e.status === 'cancelled') throw bad('취소된 일정입니다');
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
  const prev = await one(db, 'SELECT status FROM registrations WHERE event_id = ? AND user_id = ?', e.id, user.id);
  if (prev?.status === 'attended') return { ok: true, already: true, promoted: null };
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
// 그룹 운영(그룹·모임·출석·기록·성과·그룹리더 신청·발표 신청) API는 _lib/group-routes.js 에 있다.
registerGroupRoutes(on);
// 현황·회원·그룹리더·그룹·알림·커뮤니티·일정·감사·백업 API는 _lib/admin-routes.js 에 있다.
registerAdminRoutes(on, { purgeOldApplications, levelProgress });
// 이용 통계 수집(/t)과 KPI(/admin/kpi/*)는 _lib/kpi-routes.js 에 있다.
registerKpiRoutes(on);
registerCommunityRoutes(on);

on('POST', '/admin/applications/:id', async ({ db, request, user, params }) => {
  requireStaff(user); const b = await readJson(request);
  const a = await one(db, 'SELECT * FROM applications WHERE id = ?', params.id); if (!a) throw notfound();
  if (b.decision === 'approve') { const code = inviteCode(); await run(db, "UPDATE applications SET status = 'approved', invite_code = ?, note = ?, decided_at = datetime('now'), decided_by = ? WHERE id = ?", code, str(b.note, 500), user.id, a.id); await audit(db, user.id, 'application.approve', 'applications:' + a.id); return { ok: true, invite_code: code, email: a.email }; }
  if (b.decision === 'reject') { await run(db, "UPDATE applications SET status = 'rejected', note = ?, decided_at = datetime('now'), decided_by = ? WHERE id = ?", str(b.note, 500), user.id, a.id); await audit(db, user.id, 'application.reject', 'applications:' + a.id); return { ok: true }; }
  throw bad('decision은 approve 또는 reject');
});

on('POST', '/admin/users/:id', async ({ db, request, user, params }) => {
  requireStaff(user); const b = await readJson(request);
  const target = await one(db, 'SELECT * FROM users WHERE id = ?', params.id); if (!target) throw notfound();
  const owner = await isOwner(db, user);
  if (target.role === 'staff' && target.id !== user.id && !owner && (b.level || b.status || b.temp_password)) throw forbid('다른 운영진의 등급·상태·비밀번호는 운영자만 바꿀 수 있습니다');
  if (b.role && !owner) throw forbid('운영진 지정과 해제는 운영자만 할 수 있습니다');
  if (b.status && b.status !== 'active' && target.id === user.id) throw bad('자기 계정을 휴면·제명 처리할 수 없습니다');
  if (b.level) { if (!LEVELS.includes(b.level)) throw bad('등급 코드 오류'); await setLevel(db, target.id, b.level, str(b.reason, 300) || '운영진 조정', user.id); await notify(db, target.id, `등급이 ${levelName(b.level)}(으)로 변경됐습니다`, str(b.reason, 300), '#/me'); }
  if (b.status) { if (!['active', 'dormant', 'removed'].includes(b.status)) throw bad('status 오류'); await run(db, 'UPDATE users SET status = ? WHERE id = ?', b.status, target.id); if (b.status === 'removed') await run(db, 'DELETE FROM sessions WHERE user_id = ?', target.id); }
  if (b.role) { if (!['member', 'staff'].includes(b.role)) throw bad('role 오류'); if (target.id === user.id && b.role !== 'staff') throw bad('자기 자신의 운영진 권한은 해제할 수 없습니다');
    if (b.role === 'member') {
      const ownerRow = await one(db, "SELECT 1 AS x FROM admin_roles WHERE user_id = ? AND role = 'owner'", target.id);
      const owners = (await one(db, "SELECT COUNT(*) AS c FROM admin_roles r JOIN users u ON u.id = r.user_id WHERE r.role = 'owner' AND u.role = 'staff' AND u.status = 'active'"))?.c || 0;
      if (ownerRow && owners <= 1) throw bad('마지막 운영자는 해제할 수 없습니다');
      await run(db, 'DELETE FROM admin_roles WHERE user_id = ?', target.id);
    }
    await run(db, 'UPDATE users SET role = ? WHERE id = ?', b.role, target.id); }
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

on('GET', '/admin/disputes', async ({ db, user }) => {
  requireStaff(user);
  return all(db, "SELECT d.*, u.nickname, gm.challenge_id AS group_id FROM disputes d JOIN users u ON u.id = d.filed_by LEFT JOIN group_members gm ON d.ref_type = 'removal' AND gm.id = d.ref_id WHERE d.status IN ('open','mediating') ORDER BY d.created_at");
});
on('POST', '/admin/disputes/:id', async ({ db, request, user, params }) => {
  requireStaff(user); const b = await readJson(request);
  await run(db, "UPDATE disputes SET status = COALESCE(?, status), stage = COALESCE(?, stage), result = COALESCE(?, result), assignee_id = ?, resolved_at = CASE WHEN ? IN ('resolved','closed') THEN datetime('now') ELSE resolved_at END WHERE id = ?", b.status || null, b.stage ? Number(b.stage) : null, str(b.result, 2000), user.id, b.status || '', params.id);
  await audit(db, user.id, 'dispute.update', 'disputes:' + params.id, b);
  return { ok: true };
});

on('GET', '/admin/settings', async ({ db, user }) => { requireStaff(user); return { settings: await getSettings(db), overrides: (await all(db, 'SELECT key, value, version, updated_at FROM settings')).map(r => ({ ...r, value: parseJ(r.value) })) }; });
on('PUT', '/admin/settings', async ({ db, request, user }) => {
  await requireOwner(db, user); const b = await readJson(request);
  must(b.key, 'key'); if (b.value === undefined) throw bad('value가 필요합니다');
  const reason = str(b.reason, 300); if (!reason) throw bad('바꾸는 이유를 적어 주세요. 규칙 변경 이력으로 남습니다');
  const allowed = ['levels', 'points', 'visibility', 'groups', 'attendance_default', 'analytics', 'kpi_targets'];
  if (!allowed.includes(b.key)) throw bad('수정할 수 없는 설정 키입니다');
  await run(db, "INSERT INTO settings (key, value, version, updated_by) VALUES (?,?,1,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, version = settings.version + 1, updated_by = excluded.updated_by, updated_at = datetime('now')", b.key, J(b.value), user.id);
  await audit(db, user.id, 'settings.update', 'settings:' + b.key, { reason, value: b.value });
  return { ok: true };
});


// ----- 데이터 내려받기 (CSV, 엑셀용 UTF-8 BOM) -----
const EXPORTS = {
  users: "SELECT id, email, name, nickname, phone, level, role, status, has_business, interests, created_at, last_seen_at FROM users ORDER BY id",
  applications: "SELECT id, name, email, phone, status, invite_code, created_at, decided_at, note, form FROM applications ORDER BY id",
  groups: "SELECT c.id, c.type, c.title, c.field_code, c.stage, u.nickname AS leader, c.capacity, c.join_mode, c.goal_metric, c.goal_target, c.start_date, c.end_date, c.created_at, c.closed_at FROM challenges c JOIN users u ON u.id = c.leader_id ORDER BY c.id",
  members: "SELECT gm.id, gm.challenge_id, c.title AS group_title, gm.user_id, u.nickname, gm.role, gm.status, gm.joined_at, gm.left_at, gm.leave_type FROM group_members gm JOIN challenges c ON c.id = gm.challenge_id JOIN users u ON u.id = gm.user_id ORDER BY gm.challenge_id, gm.id",
  sessions: "SELECT s.id, s.challenge_id, c.title AS group_title, s.title, s.starts_at, s.duration_min, s.mode, s.status, (SELECT COUNT(*) FROM session_attendance a WHERE a.session_id = s.id AND a.status IN ('present','late')) AS attended, (SELECT COUNT(*) FROM session_attendance a WHERE a.session_id = s.id AND a.status = 'absent') AS absent FROM group_sessions s JOIN challenges c ON c.id = s.challenge_id ORDER BY s.starts_at",
  attendance: "SELECT a.session_id, s.challenge_id, c.title AS group_title, s.starts_at, a.user_id, u.nickname, a.rsvp, a.status, a.method, a.checked_at FROM session_attendance a JOIN group_sessions s ON s.id = a.session_id JOIN challenges c ON c.id = s.challenge_id JOIN users u ON u.id = a.user_id ORDER BY s.starts_at, a.user_id",
  results: "SELECT r.id, r.challenge_id, c.title AS group_title, u.nickname, r.metric, r.value, r.label, r.happened_on, r.evidence, r.verified_at, r.created_at FROM group_results r JOIN challenges c ON c.id = r.challenge_id JOIN users u ON u.id = r.user_id WHERE r.deleted_at IS NULL ORDER BY r.happened_on",
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
const PII_EXPORTS = ['users', 'applications', 'consents'];
on('GET', '/admin/export', async ({ db, user, query }) => {
  requireStaff(user);
  if (PII_EXPORTS.includes(query.table)) await requireOwner(db, user);
  const sql = EXPORTS[query.table];
  if (!sql) throw bad('내려받을 수 없는 표입니다. users, applications, groups, members, sessions, attendance, results, papers, points, consents 중에서 고르세요');
  const rows = await all(db, sql);
  await audit(db, user.id, 'export', 'table:' + query.table, { rows: rows.length });
  const name = `machal-${query.table}-${today()}.csv`;
  return new Response('\uFEFF' + toCsv(rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' } });
});
