// 단체카톡방 · 신규 회원 정착 API (v2.1)
// - 회원: 단체카톡방 링크를 눌렀는지, 참여했다고 표시했는지 기록한다 (/me/chat)
// - 운영본부: 단체카톡방 설정, 참여 현황, 참여 안내 다시 보내기, 카톡방에 올릴 공지 만들기와 기록,
//             신규 회원의 정착 단계 확인과 단계별 안내 보내기
import { bad, notfound, readJson, parseJ, J, one, all, run, insert, requireUser, requireStaff, notify, audit, str } from './util.js';
import { CHAT_STATUS, CHAT_IN, ONBOARD_STEPS, ONBOARD_STEP_NAMES, FIELDS, GROUP_TYPES, EVENT_TYPES, EVENT_TOPICS, LEVEL_NAMES } from './rules.js';
import { requireOwner, isOwner } from './admin-routes.js';
import { kstNow } from './group-routes.js';

const STEP_KEYS = ONBOARD_STEPS.map(s => s[0]);
const isHttps = u => /^https:\/\/[^\s]+$/i.test(u || '');

// 회원에게 보여 줄 단체카톡방 정보 (꺼져 있거나 주소가 없으면 null)
export function chatInfo(settings) {
  const c = settings.community_chat || {};
  if (!c.enabled || !isHttps(c.url)) return null;
  return { name: c.name || '마챌 단체카톡방', url: c.url, code: c.code || '', intro: c.intro || '' };
}

// 회원별 정착 단계. where/params 로 대상을 고른다 (u. 별칭 사용)
export async function onboardingRows(db, settings, where = '1 = 1', ...params) {
  const rows = await all(db, `SELECT u.id, u.nickname, u.name, u.email, u.level, u.status, u.interests, u.bio, u.created_at, u.last_seen_at,
      u.onboarded, u.chat_status, u.chat_at, u.welcomed_at, CASE WHEN u.asset_diag IS NOT NULL AND u.asset_diag <> '' THEN 1 ELSE 0 END AS asset,
      EXISTS (SELECT 1 FROM registrations r WHERE r.user_id = u.id AND r.status = 'attended') AS event,
      EXISTS (SELECT 1 FROM group_members gm WHERE gm.user_id = u.id AND gm.status IN ('active','left','removed')) AS grp,
      EXISTS (SELECT 1 FROM session_attendance a WHERE a.user_id = u.id AND a.status IN ('present','late')) AS attend,
      EXISTS (SELECT 1 FROM group_logs l WHERE l.user_id = u.id AND l.deleted_at IS NULL) AS log,
      (SELECT MAX(n.created_at) FROM nudges n WHERE n.user_id = u.id) AS last_nudged_at,
      (SELECT COUNT(*) FROM nudges n WHERE n.user_id = u.id) AS nudges
    FROM users u WHERE u.role = 'member' AND u.status = 'active' AND ${where} ORDER BY u.created_at DESC LIMIT 500`, ...params);
  const o = settings.onboarding || {};
  const now = Date.now();
  const ageDays = t => (t ? (now - Date.parse(String(t).replace(' ', 'T') + 'Z')) / 86400e3 : null);
  return rows.map(r => {
    const steps = {
      orientation: !!r.onboarded, chat: CHAT_IN.includes(r.chat_status), asset: !!r.asset, event: !!r.event,
      group: !!r.grp, attend: !!r.attend, log: !!r.log,
    };
    const done = STEP_KEYS.filter(k => steps[k]).length;
    const next = STEP_KEYS.find(k => !steps[k]) || null;
    const age = ageDays(r.created_at), idle = ageDays(r.last_seen_at);
    const state = !next ? 'done' : age != null && age < 3 ? 'new' : (idle == null || idle >= (o.stall_days || 7)) ? 'stalled' : 'progress';
    const nudgedDays = ageDays(r.last_nudged_at);
    return {
      id: r.id, nickname: r.nickname, name: r.name, email: r.email, level: r.level, interests: r.interests, bio: r.bio,
      created_at: r.created_at, last_seen_at: r.last_seen_at, chat_status: r.chat_status || 'none', chat_at: r.chat_at, welcomed_at: r.welcomed_at,
      steps, done, total: STEP_KEYS.length, next, next_name: next ? ONBOARD_STEP_NAMES[next] : null, state,
      days: age == null ? null : Math.floor(age), idle_days: idle == null ? null : Math.floor(idle),
      last_nudged_at: r.last_nudged_at, nudges: r.nudges, can_nudge: !!next && (nudgedDays == null || nudgedDays >= (o.nudge_gap_days ?? 3)),
    };
  });
}

// 정착 단계 안내 한 건 보내기 (알림 + 기록)
async function sendNudge(db, actorId, userId, step, extra) {
  const s = ONBOARD_STEPS.find(x => x[0] === step);
  const title = s ? s[2] : '마이챌린지 운영진의 안내';
  const body = [s ? s[3] : '', extra || ''].filter(Boolean).join('\n\n');
  await notify(db, userId, title, body, s ? s[4] : '#/dashboard');
  await run(db, 'INSERT INTO nudges (user_id, step, title, sent_by) VALUES (?,?,?,?)', userId, step || 'custom', title, actorId);
}

export function registerCommunityRoutes(on) {
  // ───────── 회원: 단체카톡방 ─────────
  on('POST', '/me/chat', async ({ db, request, user }) => {
    requireUser(user); const b = await readJson(request);
    const cur = (await one(db, 'SELECT chat_status FROM users WHERE id = ?', user.id))?.chat_status || null;
    if (b.action === 'click') {
      if (!cur || cur === 'left') await run(db, "UPDATE users SET chat_status = 'clicked', chat_at = datetime('now') WHERE id = ?", user.id);
    } else if (b.action === 'joined') {
      if (cur !== 'verified') await run(db, "UPDATE users SET chat_status = 'joined', chat_at = datetime('now') WHERE id = ?", user.id);
    } else throw bad('알 수 없는 요청입니다');
    const now = (await one(db, 'SELECT chat_status FROM users WHERE id = ?', user.id))?.chat_status;
    return { ok: true, chat_status: now };
  });

  // ───────── 운영본부: 단체카톡방 현황 ─────────
  on('GET', '/admin/chat', async ({ db, settings, user, query }) => {
    requireStaff(user);
    if (query.only === 'settings') return { settings: settings.community_chat, onboarding: settings.onboarding, is_owner: await isOwner(db, user) };
    const st = ['none', 'clicked', 'joined', 'verified', 'left'].includes(query.status) ? query.status : '';
    const like = `%${String(query.q || '').trim()}%`;
    const statusWhere = st === 'none' ? 'u.chat_status IS NULL' : st ? 'u.chat_status = ?' : '1 = 1';
    const params = st && st !== 'none' ? [st] : [];
    const members = await all(db, `SELECT u.id, u.nickname, u.name, u.level, u.created_at, u.last_seen_at, u.onboarded, COALESCE(u.chat_status, 'none') AS chat_status, u.chat_at, u.welcomed_at,
        (SELECT MAX(n.created_at) FROM nudges n WHERE n.user_id = u.id AND n.step = 'chat') AS last_reminded_at
      FROM users u WHERE u.role = 'member' AND u.status = 'active' AND ${statusWhere} AND (u.nickname LIKE ? OR u.name LIKE ? OR u.email LIKE ?)
      ORDER BY CASE COALESCE(u.chat_status,'none') WHEN 'joined' THEN 0 WHEN 'clicked' THEN 1 WHEN 'none' THEN 2 WHEN 'left' THEN 3 ELSE 4 END, u.created_at DESC LIMIT 400`, ...params, like, like, like);
    const counts = await all(db, "SELECT COALESCE(chat_status, 'none') AS s, COUNT(*) AS n FROM users WHERE role = 'member' AND status = 'active' GROUP BY COALESCE(chat_status, 'none')");
    const stats = Object.fromEntries(Object.keys(CHAT_STATUS).map(k => [k, counts.find(c => c.s === k)?.n || 0]));
    stats.members = Object.values(stats).reduce((a, b) => a + b, 0);
    stats.in = stats.joined + stats.verified;
    stats.rate = stats.members ? Math.round(stats.in / stats.members * 100) : null;
    const gap = settings.onboarding?.nudge_gap_days ?? 3;
    return { settings: settings.community_chat, onboarding: settings.onboarding, is_owner: await isOwner(db, user), stats, members, remind_gap_days: gap };
  });

  // 회원 참여 상태를 운영진이 바꾼다 (카톡방에서 닉네임을 확인했을 때, 나간 걸 알았을 때)
  on('POST', '/admin/chat/members', async ({ db, request, user }) => {
    requireStaff(user); const b = await readJson(request);
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean).slice(0, 300);
    if (!ids.length) throw bad('회원을 골라 주세요');
    const status = ['verified', 'left', 'none', 'joined'].includes(b.status) ? b.status : null;
    if (!status) throw bad('바꿀 상태를 골라 주세요');
    const ph = ids.map(() => '?').join(',');
    await run(db, `UPDATE users SET chat_status = ?, chat_at = datetime('now') WHERE role = 'member' AND id IN (${ph})`, status === 'none' ? null : status, ...ids);
    await audit(db, user.id, 'chat.status', ids.length === 1 ? 'users:' + ids[0] : null, { ids, status });
    return { ok: true, updated: ids.length };
  });

  // 아직 들어오지 않은 회원에게 참여 안내를 다시 보낸다 (같은 회원에게는 정한 기간 안에 한 번만)
  on('POST', '/admin/chat/remind', async ({ db, settings, request, user }) => {
    requireStaff(user); const b = await readJson(request);
    if (!chatInfo(settings)) throw bad('단체카톡방 주소가 없거나 꺼져 있습니다. 먼저 설정에서 주소를 넣어 주세요');
    const gap = settings.onboarding?.nudge_gap_days ?? 3;
    let ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean).slice(0, 300);
    if (!ids.length) ids = (await all(db, "SELECT id FROM users WHERE role = 'member' AND status = 'active' AND onboarded = 1 AND (chat_status IS NULL OR chat_status IN ('clicked','left'))")).map(r => r.id);
    const sent = [], skipped = [];
    for (const id of ids) {
      const u = await one(db, "SELECT id, nickname, chat_status, onboarded, (SELECT MAX(created_at) FROM nudges n WHERE n.user_id = users.id AND n.step = 'chat') AS last FROM users WHERE id = ? AND role = 'member' AND status = 'active'", id);
      if (!u) { skipped.push({ id, reason: '활동 중인 회원이 아님' }); continue; }
      if (CHAT_IN.includes(u.chat_status)) { skipped.push({ id, nickname: u.nickname, reason: '이미 참여' }); continue; }
      if (!b.force && u.last && (Date.now() - Date.parse(u.last.replace(' ', 'T') + 'Z')) / 86400e3 < gap) { skipped.push({ id, nickname: u.nickname, reason: `${gap}일 안에 이미 보냄` }); continue; }
      await sendNudge(db, user.id, id, 'chat', str(b.note, 500));
      sent.push({ id, nickname: u.nickname });
    }
    await audit(db, user.id, 'chat.remind', null, { sent: sent.length, skipped: skipped.length });
    return { sent, skipped };
  });

  // 단체카톡방 설정 (총괄관리자만, 바꾸는 이유를 남긴다)
  on('PUT', '/admin/chat/settings', async ({ db, settings, request, user }) => {
    await requireOwner(db, user); const b = await readJson(request);
    const reason = str(b.reason, 300); if (!reason) throw bad('바꾸는 이유를 적어 주세요. 변경 이력으로 남습니다');
    const url = str(b.url, 300) || '';
    if (url && !isHttps(url)) throw bad('대화방 주소는 https:// 로 시작해야 합니다');
    const value = { enabled: !!b.enabled && !!url, name: str(b.name, 40) || '마챌 단체카톡방', url, code: str(b.code, 20) || '', intro: str(b.intro, 600) || '' };
    const ob = b.onboarding ? {
      window_days: Math.max(7, Math.min(365, Number(b.onboarding.window_days) || 30)),
      stall_days: Math.max(2, Math.min(60, Number(b.onboarding.stall_days) || 7)),
      nudge_gap_days: Math.max(1, Math.min(30, Number(b.onboarding.nudge_gap_days) || 3)),
    } : null;
    const save = async (key, v) => run(db, "INSERT INTO settings (key, value, version, updated_by) VALUES (?,?,1,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, version = settings.version + 1, updated_by = excluded.updated_by, updated_at = datetime('now')", key, J(v), user.id);
    await save('community_chat', value);
    await audit(db, user.id, 'settings.update', 'settings:community_chat', { reason, value });
    if (ob) { await save('onboarding', ob); await audit(db, user.id, 'settings.update', 'settings:onboarding', { reason, value: ob }); }
    return { ok: true, community_chat: value, onboarding: ob };
  });

  // ───────── 카톡방에 올릴 공지 만들기 ─────────
  on('GET', '/admin/chat/compose', async ({ db, settings, user, query }) => {
    requireStaff(user);
    const days = Math.max(1, Math.min(60, Number(query.days) || 14));
    // 아직 환영 인사에 소개하지 않은, 오리엔테이션을 마친 새 회원
    const newcomers = (await all(db, `SELECT id, nickname, interests, bio, created_at, chat_status FROM users
      WHERE role = 'member' AND status = 'active' AND onboarded = 1 AND welcomed_at IS NULL AND created_at >= datetime('now', ?) ORDER BY created_at`, `-${days} days`))
      .map(u => ({ ...u, interest_names: String(u.interests || '').split(',').filter(Boolean).map(k => FIELDS[k]).filter(Boolean) }));
    const now = kstNow().replace('T', ' ');
    const events = (await all(db, `SELECT e.id, e.title, e.type, e.mode, e.starts_at, e.location, e.topics, e.capacity, e.min_level,
        (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS registered
      FROM events e WHERE e.status <> 'cancelled' AND e.starts_at >= ? ORDER BY e.starts_at LIMIT 5`, now.slice(0, 16)))
      .map(e => ({ ...e, type_name: EVENT_TYPES[e.type] || e.type, topic_names: String(e.topics || '').split(',').filter(Boolean).map(t => EVENT_TOPICS[t]).filter(Boolean) }));
    const groups = (await all(db, `SELECT c.id, c.title, c.type, c.field_code, c.summary, c.schedule_text, c.capacity, c.join_mode, u.nickname AS leader,
        (SELECT COUNT(*) FROM group_members gm WHERE gm.challenge_id = c.id AND gm.status = 'active') AS members
      FROM challenges c JOIN users u ON u.id = c.leader_id WHERE c.stage IN ('recruiting','active') AND c.recruit_open = 1 ORDER BY c.created_at DESC LIMIT 8`))
      .filter(g => g.members < g.capacity).map(g => ({ ...g, type_name: GROUP_TYPES[g.type], field_name: FIELDS[g.field_code] }));
    const stories = await all(db, `SELECT p.id, p.title, u.nickname, c.title AS group_title, p.created_at FROM posts p JOIN users u ON u.id = p.author_id LEFT JOIN challenges c ON c.id = p.challenge_id
      WHERE p.board = 'group' AND p.hidden = 0 AND p.created_at >= datetime('now','-7 days') ORDER BY p.created_at DESC LIMIT 10`);
    const posts = await all(db, 'SELECT cp.id, cp.kind, cp.body, cp.member_ids, cp.created_at, u.nickname AS posted_by_name FROM chat_posts cp LEFT JOIN users u ON u.id = cp.posted_by ORDER BY cp.created_at DESC LIMIT 20');
    return { days, newcomers, events, groups, stories, posts, chat: chatInfo(settings) };
  });

  // 카톡방에 올린 공지를 기록한다. 환영 인사면 소개한 회원에 표시해 두고 다음 목록에서 뺀다.
  on('POST', '/admin/chat/posts', async ({ db, request, user }) => {
    requireStaff(user); const b = await readJson(request);
    const kind = ['welcome', 'events', 'groups', 'stories', 'custom'].includes(b.kind) ? b.kind : 'custom';
    const body = str(b.body, 4000); if (!body) throw bad('올린 내용을 적어 주세요');
    const ids = (Array.isArray(b.member_ids) ? b.member_ids : []).map(Number).filter(Boolean).slice(0, 100);
    const id = await insert(db, 'INSERT INTO chat_posts (kind, body, member_ids, posted_by) VALUES (?,?,?,?)', kind, body, ids.join(',') || null, user.id);
    if (kind === 'welcome' && ids.length) await run(db, `UPDATE users SET welcomed_at = datetime('now') WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
    await audit(db, user.id, 'chat.post', 'chat_posts:' + id, { kind, members: ids.length });
    return { ok: true, id };
  });

  // ───────── 신규 회원 정착 ─────────
  on('GET', '/admin/onboarding', async ({ db, settings, user, query }) => {
    requireStaff(user);
    const o = settings.onboarding || {};
    const days = [7, 14, 30, 60, 90, 180, 365].includes(Number(query.days)) ? Number(query.days) : (o.window_days || 30);
    const rows = await onboardingRows(db, settings, "u.created_at >= datetime('now', ?)", `-${days} days`);
    const view = ['stalled', 'new', 'progress', 'done'].includes(query.view) ? query.view : '';
    const q = String(query.q || '').trim();
    const members = rows.filter(r => (!view || r.state === view) && (!q || [r.nickname, r.name, r.email].some(v => String(v || '').includes(q))));
    const funnel = [['가입', rows.length], ...ONBOARD_STEPS.map(([k, n]) => [n, rows.filter(r => r.steps[k]).length])];
    const states = { new: 0, progress: 0, stalled: 0, done: 0 }; rows.forEach(r => { states[r.state]++; });
    const byNext = ONBOARD_STEPS.map(([k, n]) => ({ step: k, name: n, n: rows.filter(r => r.next === k).length, nudgeable: rows.filter(r => r.next === k && r.can_nudge).length, ids: rows.filter(r => r.next === k && r.can_nudge).map(r => r.id) }));
    // 초대 코드를 받고 아직 가입하지 않은 신청자
    const invites = await all(db, `SELECT id, name, email, invite_code, decided_at, CAST(julianday('now') - julianday(decided_at) AS INTEGER) AS days
      FROM applications WHERE status = 'approved' ORDER BY decided_at LIMIT 100`);
    const nudgesRecent = await all(db, `SELECT n.id, n.user_id, n.step, n.title, n.created_at, u.nickname, s.nickname AS sent_by_name FROM nudges n JOIN users u ON u.id = n.user_id
      LEFT JOIN users s ON s.id = n.sent_by ORDER BY n.created_at DESC LIMIT 15`);
    return { days, settings: o, funnel, states, by_next: byNext, members, invites, nudges: nudgesRecent, steps: ONBOARD_STEPS.map(([k, n, t]) => ({ key: k, name: n, title: t })) };
  });

  // 다음 단계 안내 보내기. step 을 주면 그 단계로, 없으면 회원마다 아직 안 한 첫 단계로.
  on('POST', '/admin/onboarding/nudge', async ({ db, settings, request, user }) => {
    requireStaff(user); const b = await readJson(request);
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean).slice(0, 300);
    if (!ids.length) throw bad('안내를 보낼 회원을 골라 주세요');
    const step = b.step && STEP_KEYS.includes(b.step) ? b.step : null;
    const rows = await onboardingRows(db, settings, `u.id IN (${ids.map(() => '?').join(',')})`, ...ids);
    const sent = [], skipped = [];
    for (const r of rows) {
      const target = step || r.next;
      if (!target) { skipped.push({ id: r.id, nickname: r.nickname, reason: '모든 단계를 마침' }); continue; }
      if (step && r.steps[step]) { skipped.push({ id: r.id, nickname: r.nickname, reason: '이미 한 단계' }); continue; }
      if (!r.can_nudge && !b.force) { skipped.push({ id: r.id, nickname: r.nickname, reason: `최근 ${settings.onboarding?.nudge_gap_days ?? 3}일 안에 이미 보냄` }); continue; }
      await sendNudge(db, user.id, r.id, target, str(b.note, 500));
      sent.push({ id: r.id, nickname: r.nickname, step: target });
    }
    for (const id of ids) if (!rows.some(r => r.id === id)) skipped.push({ id, reason: '활동 중인 회원이 아님' });
    await audit(db, user.id, 'onboarding.nudge', ids.length === 1 ? 'users:' + ids[0] : null, { sent: sent.length, skipped: skipped.length, step });
    return { sent, skipped };
  });
}

// 회원 상세 화면용: 한 사람의 정착 단계와 안내 기록
export async function memberOnboarding(db, settings, userId) {
  const [row] = await onboardingRows(db, settings, 'u.id = ?', userId);
  const nudges = await all(db, 'SELECT n.step, n.title, n.created_at, s.nickname AS sent_by_name FROM nudges n LEFT JOIN users s ON s.id = n.sent_by WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 20', userId);
  return row ? { ...row, nudge_history: nudges } : null;
}
