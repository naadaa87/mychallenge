// 그룹 운영 API (v2.0) — 학습그룹·도전그룹, 모임 일정, 출석, 경고·퇴출, 도전 기록, 목표·성과, 그룹리더 신청, 발표 신청
// 그룹은 운영진이 승인한 그룹리더가 언제든 만든다. 출석 규칙은 그룹리더가 그룹마다 정한다.
import {
  bad, forbid, notfound, readJson, parseJ, J, one, all, run, insert,
  requireUser, requireStaff, isStaff, lvlAtLeast, addPoints, grantBadge, notify, notifyStaff, audit, str, must, intv,
} from './util.js';
import {
  FIELDS, GROUP_TYPES, GROUP_STAGES, RUNNING_STAGES, GROUP_ROLES, GOAL_METRICS, LOG_KINDS, ATTEND_STATUS, EVENT_TYPES, LEVEL_NAMES,
  normalizePolicy, attendanceStats, levelIndex,
} from './rules.js';

// ───────────────────────── 시각 (일정은 한국 시각 문자열 YYYY-MM-DDTHH:MM 로 저장) ─────────────────────────
const KST = 9 * 3600e3;
export const kstNow = () => new Date(Date.now() + KST).toISOString().slice(0, 16);
export const kstToday = () => new Date(Date.now() + KST).toISOString().slice(0, 10);
const kstMs = s => Date.parse(String(s).slice(0, 16) + ':00+09:00');
const utcMs = s => Date.parse(String(s).replace(' ', 'T') + (/[zZ]$|[+-]\d\d:?\d\d$/.test(String(s)) ? '' : 'Z'));
const kstFromMs = ms => new Date(ms + KST).toISOString().slice(0, 16);
const DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const D_RE = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^https?:\/\/\S+$/i;
const fourDigits = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return String(a[0] % 10000).padStart(4, '0'); };

// ───────────────────────── 불러오기·권한 ─────────────────────────
export function basePolicy(settings) { return normalizePolicy(settings.attendance_default); }
export async function loadGroup(db, settings, id) {
  const c = await one(db, 'SELECT c.*, u.nickname AS leader_nickname, u.level AS leader_level FROM challenges c JOIN users u ON u.id = c.leader_id WHERE c.id = ?', id);
  if (!c) throw notfound('그룹을 찾을 수 없습니다');
  c.policy = normalizePolicy(parseJ(c.policy, null), basePolicy(settings));
  c.public_numbers = parseJ(c.public_numbers, {});
  c.type_name = GROUP_TYPES[c.type] || c.type;
  c.stage_name = GROUP_STAGES[c.stage] || c.stage;
  c.field_name = FIELDS[c.field_code] || c.field_code;
  return c;
}
export async function membership(db, cid, uid) { if (!uid) return null; return one(db, 'SELECT * FROM group_members WHERE challenge_id = ? AND user_id = ?', cid, uid); }
export const isActive = m => !!m && m.status === 'active';
export const isLeaderOf = (user, c) => isStaff(user) || (!!user && c.leader_id === user.id);
export const isManagerOf = (user, c, m) => isLeaderOf(user, c) || (isActive(m) && ['leader', 'sub'].includes(m.role));
export async function activeMembers(db, cid) {
  return all(db, `SELECT gm.*, u.nickname, u.level, u.name FROM group_members gm JOIN users u ON u.id = gm.user_id
    WHERE gm.challenge_id = ? AND gm.status = 'active' ORDER BY CASE gm.role WHEN 'leader' THEN 0 WHEN 'sub' THEN 1 ELSE 2 END, gm.joined_at`, cid);
}
async function ctx(db, settings, user, id, { member = false, manager = false, leader = false } = {}) {
  requireUser(user);
  const c = await loadGroup(db, settings, id);
  const m = await membership(db, c.id, user.id);
  if (leader && !isLeaderOf(user, c)) throw forbid('그룹리더만 할 수 있습니다');
  if (manager && !isManagerOf(user, c, m)) throw forbid('그룹리더나 부리더만 할 수 있습니다');
  if (member && !isActive(m) && !isStaff(user)) throw forbid('그룹원만 할 수 있습니다');
  return { c, m };
}
const liveGroup = c => { if (!RUNNING_STAGES.includes(c.stage)) throw bad('종료되었거나 중단된 그룹입니다'); };

// ───────────────────────── 출석 계산 ─────────────────────────
// 한 그룹의 마감된 모임 출석을 사람별로 모은다 → { [user_id]: stats }
export async function groupAttendance(db, c, userIds = null) {
  const rows = await all(db, `SELECT a.user_id, a.status, s.id AS session_id, s.starts_at FROM session_attendance a JOIN group_sessions s ON s.id = a.session_id
    WHERE s.challenge_id = ? AND s.status = 'closed' AND a.status IS NOT NULL ORDER BY s.starts_at, s.id`, c.id);
  const by = {};
  for (const r of rows) { if (userIds && !userIds.includes(r.user_id)) continue; (by[r.user_id] ||= []).push(r); }
  const out = {};
  for (const [uid, list] of Object.entries(by)) out[uid] = attendanceStats(list, c.policy);
  return out;
}
export const emptyStats = () => ({ present: 0, late: 0, absent: 0, excused: 0, counted: 0, late_as_absence: 0, effective_absences: 0, rate: null, streak: 0 });
async function activeWarnings(db, cid, uid) {
  return all(db, 'SELECT * FROM group_warnings WHERE challenge_id = ? AND user_id = ? AND cleared_at IS NULL ORDER BY created_at', cid, uid);
}
async function warningCounts(db, cid) {
  const rows = await all(db, 'SELECT user_id, COUNT(*) AS c FROM group_warnings WHERE challenge_id = ? AND cleared_at IS NULL GROUP BY user_id', cid);
  return Object.fromEntries(rows.map(r => [r.user_id, r.c]));
}

// 그룹원 내보내기 (출석 기준·그룹리더·운영진)
export async function removeMember(db, c, uid, type, note, actorId) {
  await run(db, "UPDATE group_members SET status = 'removed', left_at = datetime('now'), leave_type = ?, leave_note = ? WHERE challenge_id = ? AND user_id = ? AND status = 'active'", type, str(note, 500), c.id, uid);
  await notify(db, uid, `「${c.title}」 그룹에서 나가게 되었습니다`, (type === 'attendance' ? '그룹 출석 규칙의 퇴출 기준에 해당했습니다. ' : '') + (note ? str(note, 200) : '') + ' 이의가 있으면 그룹 화면에서 이의 신청을 할 수 있습니다.', `#/groups/${c.id}`);
  await audit(db, actorId, 'group.remove_member', `challenges:${c.id}`, { user_id: uid, type, note });
}

// 모임이 마감되면 한 사람의 출석 규칙을 확인한다. 새 경고를 주고, 퇴출 기준에 닿으면 자동 퇴출하거나 그룹리더에게 알린다.
async function evaluateMember(db, c, uid, sessionId) {
  const rows = await all(db, `SELECT a.status, s.id AS session_id FROM session_attendance a JOIN group_sessions s ON s.id = a.session_id
    WHERE s.challenge_id = ? AND a.user_id = ? AND s.status = 'closed' AND a.status IS NOT NULL ORDER BY s.starts_at, s.id`, c.id, uid);
  const p = c.policy;
  const now = attendanceStats(rows, p);
  const before = attendanceStats(rows.filter(r => r.session_id !== sessionId), p);
  const cur = rows.find(r => r.session_id === sessionId);
  const reasons = [];
  if (cur?.status === 'absent' && p.warn_absences > 0 && now.streak > 0 && now.streak % p.warn_absences === 0) reasons.push(`연속 결석 ${now.streak}회`);
  if (p.warn_on_low_rate && p.min_rate > 0 && now.counted >= p.rate_after && now.rate < p.min_rate
    && !(before.counted >= p.rate_after && before.rate < p.min_rate)) reasons.push(`출석률 ${now.rate}% (기준 ${p.min_rate}%)`);
  if (!reasons.length) return { warned: false, kick: false, stats: now };
  const dup = await one(db, "SELECT id FROM group_warnings WHERE challenge_id = ? AND user_id = ? AND session_id = ? AND kind = 'attendance'", c.id, uid, sessionId);
  if (dup) return { warned: false, kick: false, stats: now };
  await insert(db, "INSERT INTO group_warnings (challenge_id, user_id, kind, reason, session_id) VALUES (?,?,'attendance',?,?)", c.id, uid, reasons.join(', '), sessionId);
  const count = (await activeWarnings(db, c.id, uid)).length;
  const kick = p.kick_warnings > 0 && count >= p.kick_warnings;
  await notify(db, uid, `「${c.title}」 출석 경고 ${count}회`, `${reasons.join(', ')}. ${p.kick_warnings > 0 ? `경고가 ${p.kick_warnings}회 쌓이면 그룹에서 나가게 될 수 있습니다.` : ''} 사정이 있다면 그룹리더에게 먼저 이야기해 주세요.`, `#/groups/${c.id}/sessions`);
  return { warned: true, kick, count, stats: now };
}

export async function closeSession(db, settings, c, s, actorId) {
  if (s.status === 'closed' || s.status === 'cancelled') return { warned: [], kick: [] };
  const startMs = kstMs(s.starts_at);
  const members = (await activeMembers(db, c.id)).filter(m => !m.joined_at || utcMs(m.joined_at) <= startMs + 60e3);
  const att = Object.fromEntries((await all(db, 'SELECT * FROM session_attendance WHERE session_id = ?', s.id)).map(a => [a.user_id, a]));
  for (const m of members) {
    const a = att[m.user_id];
    if (a && a.status) continue;
    let status = 'absent';
    if (a && a.rsvp === 'no' && c.policy.excuse && a.rsvp_at && utcMs(a.rsvp_at) < startMs) {
      const used = await one(db, `SELECT COUNT(*) AS c FROM session_attendance x JOIN group_sessions gs ON gs.id = x.session_id WHERE gs.challenge_id = ? AND x.user_id = ? AND x.status = 'excused'`, c.id, m.user_id);
      if ((used?.c || 0) < c.policy.excuse_limit) status = 'excused';
    }
    await run(db, `INSERT INTO session_attendance (session_id, user_id, status, method, checked_at) VALUES (?,?,?,'auto',datetime('now'))
      ON CONFLICT(session_id, user_id) DO UPDATE SET status = excluded.status, method = 'auto', checked_at = datetime('now')`, s.id, m.user_id, status);
  }
  await run(db, "UPDATE group_sessions SET status = 'closed', closed_at = datetime('now') WHERE id = ?", s.id);
  // 출석 포인트는 마감할 때 한 번만
  for (const a of await all(db, "SELECT user_id FROM session_attendance WHERE session_id = ? AND status IN ('present','late')", s.id)) {
    const got = await one(db, "SELECT 1 AS x FROM points_ledger WHERE user_id = ? AND action = 'group_attend' AND ref_type = 'session' AND ref_id = ?", a.user_id, s.id);
    if (!got) await addPoints(db, settings, a.user_id, 'group_attend', 'session', s.id);
  }
  const warned = [], kick = [];
  for (const m of members) {
    if (m.role === 'leader') continue;
    const r = await evaluateMember(db, c, m.user_id, s.id);
    if (r.warned) warned.push({ user_id: m.user_id, nickname: m.nickname, count: r.count });
    if (r.kick) {
      if (c.policy.auto_remove) { await removeMember(db, c, m.user_id, 'attendance', `경고 ${r.count}회`, actorId); kick.push({ user_id: m.user_id, nickname: m.nickname, removed: true }); }
      else kick.push({ user_id: m.user_id, nickname: m.nickname, removed: false });
    }
  }
  if (kick.some(k => !k.removed)) await notify(db, c.leader_id, `「${c.title}」 퇴출 기준에 닿은 그룹원이 있습니다`, kick.filter(k => !k.removed).map(k => k.nickname).join(', ') + ' — 그룹원 탭에서 확인한 뒤 결정해 주세요.', `#/groups/${c.id}/members`);
  if (kick.some(k => k.removed)) await notify(db, c.leader_id, `「${c.title}」 출석 규칙에 따라 자동 퇴출`, kick.filter(k => k.removed).map(k => k.nickname).join(', '), `#/groups/${c.id}/members`);
  await audit(db, actorId, 'session.close', `group_sessions:${s.id}`, { warned: warned.length, kick: kick.length });
  return { warned, kick };
}

// 출석을 열어 두고 잊은 모임은 끝난 뒤 12시간이 지나면 자동으로 마감한다.
export async function autoCloseSessions(db, settings, c) {
  const open = await all(db, "SELECT * FROM group_sessions WHERE challenge_id = ? AND status = 'open'", c.id);
  const nowMs = Date.now();
  for (const s of open) if (kstMs(s.starts_at) + (s.duration_min + 12 * 60) * 60e3 < nowMs) await closeSession(db, settings, c, s, null);
}

function goalProgressSql() { return `(SELECT COALESCE(SUM(r.value),0) FROM group_results r WHERE r.challenge_id = c.id AND r.deleted_at IS NULL AND r.metric = c.goal_metric)`; }
async function goalProgress(db, c) {
  if (!c.goal_metric) return null;
  const r = await one(db, 'SELECT COALESCE(SUM(value),0) AS v FROM group_results WHERE challenge_id = ? AND metric = ? AND deleted_at IS NULL', c.id, c.goal_metric);
  const value = r?.v || 0;
  return { metric: c.goal_metric, metric_name: GOAL_METRICS[c.goal_metric]?.[0] || c.goal_metric, unit: c.goal_unit || GOAL_METRICS[c.goal_metric]?.[1] || '', target: c.goal_target, value, ratio: c.goal_target ? Math.min(1, value / c.goal_target) : null };
}

// 커뮤니티 '그룹 소식' 게시판에 공유한다
async function shareToCommunity(db, settings, user, c, title, body) {
  const id = await insert(db, "INSERT INTO posts (author_id, board, title, body, challenge_id) VALUES (?, 'group', ?, ?, ?)", user.id, str(title, 100), str(body, 5000), c.id);
  await addPoints(db, settings, user.id, 'post', 'post', id);
  return id;
}
const firstLine = s => String(s || '').split('\n').map(x => x.trim()).find(Boolean) || '';

// 그룹 입력값 정리 (만들기·수정 공통)
function groupFields(b, settings, existing = null) {
  const g = settings.groups;
  const out = {};
  if (b.title !== undefined) out.title = must(str(b.title, 60), '그룹 이름');
  if (b.type !== undefined) { if (!GROUP_TYPES[b.type]) throw bad('그룹 종류는 학습그룹 또는 도전그룹입니다'); out.type = b.type; }
  if (b.field_code !== undefined) { if (!FIELDS[b.field_code]) throw bad('분야를 골라 주세요'); out.field_code = b.field_code; }
  if (b.summary !== undefined) out.summary = must(str(b.summary, 120), '한 줄 소개');
  if (b.description !== undefined) out.description = str(b.description, 4000);
  if (b.goal_text !== undefined) out.goal_text = str(b.goal_text, 300);
  if (b.goal_metric !== undefined) {
    if (b.goal_metric && !GOAL_METRICS[b.goal_metric]) throw bad('목표 지표를 다시 골라 주세요');
    out.goal_metric = b.goal_metric || null;
    out.goal_unit = b.goal_metric ? (b.goal_metric === 'custom' ? str(b.goal_unit, 10) || '' : GOAL_METRICS[b.goal_metric][1]) : null;
  }
  if (b.goal_target !== undefined) { const t = b.goal_target === '' || b.goal_target == null ? null : Number(b.goal_target); if (t != null && (!Number.isFinite(t) || t < 0)) throw bad('목표 수치를 확인해 주세요'); out.goal_target = t; }
  for (const k of ['start_date', 'end_date']) if (b[k] !== undefined) { if (b[k] && !D_RE.test(b[k])) throw bad('날짜 형식을 확인해 주세요'); out[k] = b[k] || null; }
  const sd = out.start_date !== undefined ? out.start_date : existing?.start_date, ed = out.end_date !== undefined ? out.end_date : existing?.end_date;
  if (sd && ed && ed < sd) throw bad('끝나는 날이 시작하는 날보다 빠릅니다');
  if (b.schedule_text !== undefined) out.schedule_text = str(b.schedule_text, 100);
  if (b.capacity !== undefined) out.capacity = intv(b.capacity || g.capacity_default, '정원', { min: 2, max: g.capacity_max });
  if (b.join_mode !== undefined) out.join_mode = b.join_mode === 'open' ? 'open' : 'approval';
  if (b.recruit_open !== undefined) out.recruit_open = b.recruit_open ? 1 : 0;
  if (b.place !== undefined) out.place = str(b.place, 120);
  if (b.chat_url !== undefined) { const u = str(b.chat_url, 300); if (u && !URL_RE.test(u)) throw bad('대화방 주소는 http로 시작하는 링크여야 합니다'); out.chat_url = u || null; }
  if (b.policy !== undefined) out.policy = J(normalizePolicy(b.policy, basePolicy(settings)));
  return out;
}

// ───────────────────────── 회원 대시보드용 요약 ─────────────────────────
export async function myGroupsSummary(db, settings, user) {
  const rows = await all(db, `SELECT c.id, c.title, c.type, c.stage, c.leader_id, c.policy, c.goal_metric, c.goal_target, c.goal_unit, gm.role, gm.status AS member_status
    FROM group_members gm JOIN challenges c ON c.id = gm.challenge_id WHERE gm.user_id = ? AND gm.status IN ('active','applied') ORDER BY c.updated_at DESC`, user.id);
  const now = kstNow();
  const out = [];
  for (const r of rows) {
    const c = { ...r, policy: normalizePolicy(parseJ(r.policy, null), basePolicy(settings)) };
    const item = { id: r.id, title: r.title, type: r.type, type_name: GROUP_TYPES[r.type], stage: r.stage, role: r.role, role_name: GROUP_ROLES[r.role], member_status: r.member_status };
    if (r.member_status === 'active') {
      await autoCloseSessions(db, settings, c);
      item.next_session = await one(db, `SELECT s.id, s.title, s.starts_at, s.mode, s.status, s.code IS NOT NULL AS has_code,
        (SELECT rsvp FROM session_attendance a WHERE a.session_id = s.id AND a.user_id = ?) AS my_rsvp, (SELECT status FROM session_attendance a WHERE a.session_id = s.id AND a.user_id = ?) AS my_status
        FROM group_sessions s WHERE s.challenge_id = ? AND s.status IN ('scheduled','open') AND (s.status = 'open' OR s.starts_at >= ?) ORDER BY s.starts_at LIMIT 1`, user.id, user.id, r.id, now.slice(0, 10));
      const st = (await groupAttendance(db, c, [user.id]))[user.id] || emptyStats();
      item.attendance = st;
      item.warnings = (await activeWarnings(db, r.id, user.id)).length;
      item.policy = { min_rate: c.policy.min_rate, kick_warnings: c.policy.kick_warnings };
      if (isManagerOf(user, { leader_id: r.leader_id }, { status: 'active', role: r.role })) {
        item.applicants = (await one(db, "SELECT COUNT(*) AS c FROM group_members WHERE challenge_id = ? AND status = 'applied'", r.id))?.c || 0;
        item.unchecked = (await one(db, "SELECT COUNT(*) AS c FROM group_sessions WHERE challenge_id = ? AND status = 'scheduled' AND starts_at < ?", r.id, kstFromMs(Date.now() - 3 * 3600e3)))?.c || 0;
        item.open_sessions = (await one(db, "SELECT COUNT(*) AS c FROM group_sessions WHERE challenge_id = ? AND status = 'open'", r.id))?.c || 0;
      }
    }
    out.push(item);
  }
  return out;
}

// ───────────────────────── 경로 등록 ─────────────────────────
export function registerGroupRoutes(on) {
  // ── 그룹 목록
  on('GET', '/groups', async ({ db, settings, user, query }) => {
    requireUser(user);
    if (!lvlAtLeast(user, settings.visibility.card)) throw forbid('오리엔테이션을 마치면 그룹을 볼 수 있습니다');
    const where = []; const p = [];
    if (query.type && GROUP_TYPES[query.type]) { where.push('c.type = ?'); p.push(query.type); }
    if (query.field && FIELDS[query.field]) { where.push('c.field_code = ?'); p.push(query.field); }
    if (query.stage === 'all') { if (!isStaff(user)) where.push("c.stage <> 'stopped'"); }
    else if (query.stage && GROUP_STAGES[query.stage]) { where.push('c.stage = ?'); p.push(query.stage); }
    else where.push("c.stage IN ('recruiting','active')");
    if (query.mine) { where.push("EXISTS (SELECT 1 FROM group_members x WHERE x.challenge_id = c.id AND x.user_id = ? AND x.status IN ('active','applied'))"); p.push(user.id); }
    if (query.q) { where.push('(c.title LIKE ? OR c.summary LIKE ?)'); p.push(`%${query.q}%`, `%${query.q}%`); }
    const now = kstNow();
    const rows = await all(db, `SELECT c.id, c.title, c.type, c.field_code, c.stage, c.summary, c.leader_id, c.capacity, c.join_mode, c.recruit_open, c.schedule_text, c.start_date, c.end_date,
        c.goal_text, c.goal_metric, c.goal_unit, c.goal_target, c.updated_at, u.nickname AS leader_nickname,
        (SELECT COUNT(*) FROM group_members gm WHERE gm.challenge_id = c.id AND gm.status = 'active') AS member_count,
        (SELECT status FROM group_members gm WHERE gm.challenge_id = c.id AND gm.user_id = ?) AS my_status,
        (SELECT MIN(starts_at) FROM group_sessions s WHERE s.challenge_id = c.id AND s.status IN ('scheduled','open') AND s.starts_at >= ?) AS next_session_at,
        (SELECT COUNT(*) FROM group_sessions s WHERE s.challenge_id = c.id AND s.status = 'closed') AS sessions_done,
        (SELECT COUNT(*) FROM group_logs l WHERE l.challenge_id = c.id AND l.deleted_at IS NULL) AS log_count,
        ${goalProgressSql()} AS goal_value
      FROM challenges c JOIN users u ON u.id = c.leader_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY CASE c.stage WHEN 'recruiting' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, c.updated_at DESC LIMIT 200`, user.id, now, ...p);
    return rows.map(r => ({ ...r, type_name: GROUP_TYPES[r.type], stage_name: GROUP_STAGES[r.stage], field_name: FIELDS[r.field_code], goal_metric_name: GOAL_METRICS[r.goal_metric]?.[0] || null }));
  });

  // ── 그룹 만들기 (승인된 그룹리더·운영진)
  on('POST', '/groups', async ({ db, settings, request, user }) => {
    requireUser(user);
    if (!isStaff(user) && !user.can_lead) throw forbid('운영진 승인을 받은 그룹리더만 그룹을 만들 수 있습니다. 내 정보에서 그룹리더를 신청해 주세요');
    if (!isStaff(user)) {
      const n = (await one(db, "SELECT COUNT(*) AS c FROM challenges WHERE leader_id = ? AND stage IN ('recruiting','active')", user.id))?.c || 0;
      if (n >= settings.groups.leader_max_groups) throw bad(`한 사람이 동시에 이끌 수 있는 그룹은 ${settings.groups.leader_max_groups}개입니다. 진행 중인 그룹을 마친 뒤 만들어 주세요`);
    }
    const b = await readJson(request);
    const f = groupFields({ capacity: settings.groups.capacity_default, join_mode: 'approval', recruit_open: true, policy: {}, ...b, type: b.type || 'challenge' }, settings);
    if (!f.title || !f.field_code || !f.summary) throw bad('그룹 이름, 분야, 한 줄 소개는 꼭 적어 주세요');
    const cols = ['title', 'type', 'field_code', 'summary', 'description', 'goal_text', 'goal_metric', 'goal_unit', 'goal_target', 'start_date', 'end_date', 'schedule_text', 'capacity', 'join_mode', 'recruit_open', 'place', 'chat_url', 'policy'];
    const vals = cols.map(k => f[k] === undefined ? null : f[k]);
    const id = await insert(db, `INSERT INTO challenges (${cols.join(', ')}, stage, leader_id, public_numbers) VALUES (${cols.map(() => '?').join(',')}, 'recruiting', ?, ?)`, ...vals, user.id, J({ has_sales: false, customers_band: '0', hours: 0 }));
    await run(db, "INSERT INTO group_members (challenge_id, user_id, role, status, joined_at) VALUES (?,?,'leader','active',datetime('now'))", id, user.id);
    for (const ms of (Array.isArray(b.milestones) ? b.milestones : []).slice(0, 10)) {
      const t = str(ms?.title, 120); if (!t) continue;
      await run(db, "INSERT INTO milestones (challenge_id, code, title, due_date) VALUES (?, 'custom', ?, ?)", id, t, D_RE.test(ms.due_date || '') ? ms.due_date : null);
    }
    await notifyStaff(db, `새 ${GROUP_TYPES[f.type]}: ${f.title}`, `${user.nickname} · ${f.summary}`, `#/admin/groups/${id}`);
    await audit(db, user.id, 'group.create', `challenges:${id}`, { type: f.type, title: f.title });
    return { ok: true, id };
  });

  // ── 그룹 상세
  on('GET', '/groups/:id', async ({ db, settings, user, params }) => {
    requireUser(user);
    const c = await loadGroup(db, settings, params.id);
    const m = await membership(db, c.id, user.id);
    if (c.stage === 'stopped' && !isStaff(user) && !m) throw forbid('중단된 그룹입니다');
    if (!lvlAtLeast(user, settings.visibility.card) && !m) throw forbid('오리엔테이션을 마치면 그룹을 볼 수 있습니다');
    await autoCloseSessions(db, settings, c);
    const member = isActive(m), manager = isManagerOf(user, c, m), staff = isStaff(user);
    const insider = member || staff;
    const members = await activeMembers(db, c.id);
    const att = insider ? await groupAttendance(db, c) : {};
    const wc = insider ? await warningCounts(db, c.id) : {};
    const now = kstNow();
    const sessions = await all(db, `SELECT s.*, (SELECT COUNT(*) FROM session_attendance a WHERE a.session_id = s.id AND a.status IN ('present','late')) AS attended,
        (SELECT COUNT(*) FROM session_attendance a WHERE a.session_id = s.id AND a.rsvp = 'yes') AS rsvp_yes, (SELECT COUNT(*) FROM session_attendance a WHERE a.session_id = s.id AND a.rsvp = 'no') AS rsvp_no
      FROM group_sessions s WHERE s.challenge_id = ? ORDER BY s.starts_at DESC, s.id DESC LIMIT 80`, c.id);
    const mine = member ? Object.fromEntries((await all(db, 'SELECT a.* FROM session_attendance a JOIN group_sessions s ON s.id = a.session_id WHERE s.challenge_id = ? AND a.user_id = ?', c.id, user.id)).map(a => [a.session_id, a])) : {};
    const sessionOut = sessions.map(s => {
      const o = { id: s.id, title: s.title, starts_at: s.starts_at, duration_min: s.duration_min, mode: s.mode, agenda: s.agenda, prep: s.prep, status: s.status, attended: s.attended, rsvp_yes: s.rsvp_yes, rsvp_no: s.rsvp_no, upcoming: s.starts_at >= now.slice(0, 10) && ['scheduled', 'open'].includes(s.status) };
      if (insider) { o.place = s.place; o.notes = s.notes; }
      if (member) { o.my_rsvp = mine[s.id]?.rsvp || null; o.my_rsvp_note = mine[s.id]?.rsvp_note || null; o.my_status = mine[s.id]?.status || null; }
      if (manager) o.code = s.code;
      return o;
    });
    const logs = await all(db, `SELECT l.*, u.nickname, (SELECT COUNT(*) FROM log_cheers h WHERE h.log_id = l.id) AS cheers, (SELECT 1 FROM log_cheers h WHERE h.log_id = l.id AND h.user_id = ?) AS my_cheer
      FROM group_logs l JOIN users u ON u.id = l.user_id WHERE l.challenge_id = ? AND l.deleted_at IS NULL ${insider || lvlAtLeast(user, settings.visibility.group_logs) ? '' : 'AND (l.post_id IS NOT NULL OR l.kind = \'notice\')'}
      ORDER BY l.pinned DESC, l.created_at DESC LIMIT 100`, user.id, c.id);
    if (!insider && lvlAtLeast(user, settings.visibility.group_logs)) await run(db, "INSERT INTO view_logs (user_id, target_type, target_id) VALUES (?,'group_logs',?)", user.id, c.id);
    const milestones = await all(db, 'SELECT * FROM milestones WHERE challenge_id = ? ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date, id', c.id);
    const results = await all(db, `SELECT r.*, u.nickname FROM group_results r JOIN users u ON u.id = r.user_id WHERE r.challenge_id = ? AND r.deleted_at IS NULL ORDER BY r.happened_on DESC, r.id DESC LIMIT 100`, c.id);
    const totals = {};
    for (const r of results) totals[r.metric] = (totals[r.metric] || 0) + r.value;
    const paper = await one(db, 'SELECT id, status, publish_scope, review_note FROM papers WHERE challenge_id = ?', c.id);
    const out = {
      group: { ...c, chat_url: insider ? c.chat_url : null, place: c.place },
      members: members.map(x => ({ user_id: x.user_id, nickname: x.nickname, level: x.level, level_name: LEVEL_NAMES[x.level], role: x.role, role_name: GROUP_ROLES[x.role], joined_at: x.joined_at,
        ...(insider ? { attendance: att[x.user_id] || emptyStats(), warnings: wc[x.user_id] || 0 } : {}) })),
      sessions: sessionOut,
      logs: logs.map(l => ({ ...l, kind_name: LOG_KINDS[l.kind], my_cheer: !!l.my_cheer })),
      milestones, goal: await goalProgress(db, c),
      results: insider ? results : results.filter(r => r.post_id || r.verified_at).map(r => ({ ...r, evidence: null })),
      result_totals: Object.entries(totals).map(([metric, value]) => ({ metric, name: GOAL_METRICS[metric]?.[0] || metric, unit: GOAL_METRICS[metric]?.[1] || '', value })),
      paper,
      me: { membership: m, is_member: member, is_manager: manager, is_leader: isLeaderOf(user, c), is_staff: staff,
        attendance: member ? (att[user.id] || emptyStats()) : null, warnings: member ? await activeWarnings(db, c.id, user.id) : [] },
    };
    const activeCount = members.length;
    out.join = joinState(user, settings, c, m, activeCount);
    if (manager) {
      out.applicants = await all(db, `SELECT gm.user_id, gm.apply_note, gm.created_at, u.nickname, u.level, u.interests, u.bio,
          (SELECT COUNT(*) FROM group_members x WHERE x.user_id = gm.user_id AND x.status = 'removed' AND x.leave_type = 'attendance') AS removed_before
        FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.challenge_id = ? AND gm.status = 'applied' ORDER BY gm.created_at`, c.id);
      out.left = await all(db, "SELECT gm.user_id, gm.status, gm.left_at, gm.leave_type, gm.leave_note, u.nickname FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.challenge_id = ? AND gm.status IN ('left','removed') ORDER BY gm.left_at DESC", c.id);
      out.warnings = await all(db, 'SELECT w.*, u.nickname FROM group_warnings w JOIN users u ON u.id = w.user_id WHERE w.challenge_id = ? ORDER BY w.created_at DESC LIMIT 100', c.id);
      const closed = sessions.filter(s => s.status === 'closed').slice(0, 12).reverse();
      const grid = closed.length ? await all(db, `SELECT a.session_id, a.user_id, a.status, a.rsvp_note FROM session_attendance a WHERE a.session_id IN (${closed.map(() => '?').join(',')})`, ...closed.map(s => s.id)) : [];
      out.matrix = { sessions: closed.map(s => ({ id: s.id, starts_at: s.starts_at, title: s.title })), cells: grid };
      const p = c.policy;
      out.kick_candidates = members.filter(x => x.role !== 'leader' && p.kick_warnings > 0 && (wc[x.user_id] || 0) >= p.kick_warnings).map(x => ({ user_id: x.user_id, nickname: x.nickname, warnings: wc[x.user_id] }));
    }
    return out;
  });

  // ── 그룹 정보·목표·출석 규칙 수정 (그룹리더)
  on('PUT', '/groups/:id', async ({ db, settings, request, user, params }) => {
    const { c } = await ctx(db, settings, user, params.id, { leader: true });
    const b = await readJson(request);
    const f = groupFields(b, settings, c);
    delete f.type;
    if (f.capacity) { const n = (await activeMembers(db, c.id)).length; if (f.capacity < n) throw bad(`지금 그룹원(${n}명)보다 정원을 작게 할 수 없습니다`); }
    const keys = Object.keys(f);
    if (!keys.length) return { ok: true };
    await run(db, `UPDATE challenges SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`, ...keys.map(k => f[k]), c.id);
    if (f.policy && f.policy !== J(c.policy)) {
      const ms = await activeMembers(db, c.id);
      for (const x of ms) if (x.user_id !== user.id) await notify(db, x.user_id, `「${c.title}」 출석 규칙이 바뀌었습니다`, '그룹 홈에서 바뀐 규칙을 확인해 주세요.', `#/groups/${c.id}`);
    }
    await audit(db, user.id, 'group.update', `challenges:${c.id}`, b);
    return { ok: true };
  });

  // ── 그룹 단계: 모집 중 ↔ 진행 중 → 종료 (그룹리더) / 중단·재개 (운영진)
  on('POST', '/groups/:id/stage', async ({ db, settings, request, user, params }) => {
    const { c } = await ctx(db, settings, user, params.id, { leader: true });
    const b = await readJson(request);
    const to = b.stage;
    if (!GROUP_STAGES[to]) throw bad('단계를 다시 골라 주세요');
    if (to === 'stopped' && !isStaff(user)) throw forbid('그룹 중단은 운영진만 할 수 있습니다. 그룹을 마치려면 종료를 눌러 주세요');
    if (to === 'stopped' && !str(b.reason, 2)) throw bad('중단 사유를 적어 주세요. 그룹원에게 그대로 전달됩니다');
    if (['closed', 'stopped'].includes(c.stage) && !isStaff(user)) throw bad('끝난 그룹은 운영진만 다시 열 수 있습니다');
    if (to === c.stage) return { ok: true };
    await run(db, "UPDATE challenges SET stage = ?, closed_at = CASE WHEN ? IN ('closed','stopped') THEN datetime('now') ELSE NULL END, recruit_open = CASE WHEN ? IN ('closed','stopped') THEN 0 ELSE recruit_open END, updated_at = datetime('now') WHERE id = ?", to, to, to, c.id);
    const members = await activeMembers(db, c.id);
    let completion = [];
    if (to === 'closed') {
      // 열려 있던 출석은 마감하고, 완주를 판정한다 (마감된 모임이 1번 이상 + 최소 출석률 충족)
      for (const s of await all(db, "SELECT * FROM group_sessions WHERE challenge_id = ? AND status = 'open'", c.id)) await closeSession(db, settings, c, s, user.id);
      await run(db, "UPDATE group_sessions SET status = 'cancelled' WHERE challenge_id = ? AND status = 'scheduled' AND starts_at > ?", c.id, kstNow());
      const att = await groupAttendance(db, c);
      for (const x of members) {
        const st = att[x.user_id] || emptyStats();
        const ok = st.counted > 0 && (c.policy.min_rate === 0 || st.rate >= c.policy.min_rate);
        completion.push({ user_id: x.user_id, nickname: x.nickname, rate: st.rate, completed: ok });
        if (!ok) continue;
        const code = x.role === 'leader' ? 'leader_completion' : 'completion';
        const ev = `group:${c.id}`;
        if (!(await one(db, 'SELECT id FROM badges WHERE user_id = ? AND code = ? AND evidence = ? AND revoked_at IS NULL', x.user_id, code, ev))) {
          await grantBadge(db, x.user_id, code, user.id, ev);
          if (x.role === 'leader' && !(await one(db, "SELECT id FROM badges WHERE user_id = ? AND code = 'completion' AND evidence = ? AND revoked_at IS NULL", x.user_id, ev))) await grantBadge(db, x.user_id, 'completion', user.id, ev);
          await addPoints(db, settings, x.user_id, 'group_complete', 'challenge', c.id);
        }
      }
      for (const x of members) await notify(db, x.user_id, `「${c.title}」 그룹이 마무리되었습니다`, completion.find(k => k.user_id === x.user_id)?.completed ? '완주를 축하합니다. 완주 배지를 받았습니다. 그룹리더가 프로젝트 페이퍼를 정리하면 함께 확인해 주세요.' : '함께해 주셔서 고맙습니다. 그룹 기록은 계속 볼 수 있습니다.', `#/groups/${c.id}`);
    } else if (to === 'stopped') {
      for (const x of members) await notify(db, x.user_id, `「${c.title}」 그룹이 중단되었습니다`, str(b.reason, 300), `#/groups/${c.id}`);
    } else if (to === 'active' && c.stage === 'recruiting') {
      for (const x of members) if (x.user_id !== user.id) await notify(db, x.user_id, `「${c.title}」 그룹이 시작되었습니다`, '모임 일정과 출석 규칙을 확인해 주세요.', `#/groups/${c.id}`);
    }
    await audit(db, user.id, 'group.stage', `challenges:${c.id}`, { from: c.stage, to, reason: b.reason });
    return { ok: true, completion };
  });

  // ── 참여 신청·바로 참여
  on('POST', '/groups/:id/join', async ({ db, settings, request, user, params }) => {
    requireUser(user);
    const c = await loadGroup(db, settings, params.id);
    const m = await membership(db, c.id, user.id);
    const count = (await activeMembers(db, c.id)).length;
    const js = joinState(user, settings, c, m, count);
    if (!js.can) throw bad(js.reason);
    const myGroups = (await one(db, "SELECT COUNT(*) AS c FROM group_members gm JOIN challenges c ON c.id = gm.challenge_id WHERE gm.user_id = ? AND gm.status IN ('active','applied') AND c.stage IN ('recruiting','active')", user.id))?.c || 0;
    if (myGroups >= settings.groups.member_max_groups) throw bad(`한 사람이 동시에 참여하는 그룹은 ${settings.groups.member_max_groups}개까지입니다`);
    const b = await readJson(request);
    const removedBefore = m && m.status === 'removed';
    const status = c.join_mode === 'open' && !removedBefore ? 'active' : 'applied';
    const note = str(b.note, 500);
    if (m) await run(db, "UPDATE group_members SET status = ?, role = 'member', apply_note = ?, joined_at = CASE WHEN ? = 'active' THEN datetime('now') ELSE NULL END, left_at = NULL, leave_type = NULL, leave_note = NULL, created_at = datetime('now') WHERE id = ?", status, note, status, m.id);
    else await run(db, "INSERT INTO group_members (challenge_id, user_id, role, status, apply_note, joined_at) VALUES (?,?,'member',?,?, CASE WHEN ? = 'active' THEN datetime('now') ELSE NULL END)", c.id, user.id, status, note, status);
    if (status === 'active') {
      await notify(db, c.leader_id, `「${c.title}」에 새 그룹원이 들어왔습니다`, user.nickname, `#/groups/${c.id}/members`);
      await notify(db, user.id, `「${c.title}」 그룹에 참여했습니다`, '모임 일정과 출석 규칙을 먼저 확인해 주세요.', `#/groups/${c.id}`);
    } else await notify(db, c.leader_id, `「${c.title}」 참여 신청`, `${user.nickname}${note ? ' · ' + str(note, 60) : ''}`, `#/groups/${c.id}/members`);
    return { ok: true, status };
  });

  // ── 그룹에서 나가기 (본인)
  on('POST', '/groups/:id/leave', async ({ db, settings, request, user, params }) => {
    const { c, m } = await ctx(db, settings, user, params.id);
    if (!m || !['active', 'applied'].includes(m.status)) throw bad('참여 중인 그룹이 아닙니다');
    if (c.leader_id === user.id) throw bad('그룹리더는 나갈 수 없습니다. 그룹을 종료하거나 운영진에게 리더 변경을 요청해 주세요');
    const b = await readJson(request);
    await run(db, "UPDATE group_members SET status = 'left', left_at = datetime('now'), leave_type = 'self', leave_note = ? WHERE id = ?", str(b.note, 500), m.id);
    if (m.status === 'active') await notify(db, c.leader_id, `「${c.title}」에서 ${user.nickname}님이 나갔습니다`, str(b.note, 200), `#/groups/${c.id}/members`);
    return { ok: true };
  });

  // ── 퇴출 이의 신청 (운영진이 확인)
  on('POST', '/groups/:id/appeal', async ({ db, settings, request, user, params }) => {
    const { c, m } = await ctx(db, settings, user, params.id);
    if (!m || m.status !== 'removed') throw bad('그룹에서 퇴출된 경우에만 이의를 신청할 수 있습니다');
    const b = await readJson(request);
    const note = must(str(b.note, 1000), '이의 내용');
    const dup = await one(db, "SELECT id FROM disputes WHERE ref_type = 'removal' AND ref_id = ? AND status IN ('open','mediating')", m.id);
    if (dup) throw bad('이미 접수된 이의 신청이 있습니다');
    await insert(db, "INSERT INTO disputes (ref_type, ref_id, filed_by, note) VALUES ('removal', ?, ?, ?)", m.id, user.id, `[${c.title}] ${note}`);
    await notifyStaff(db, '그룹 퇴출 이의 신청', `${user.nickname} · ${c.title}`, '#/admin/disputes');
    return { ok: true };
  });

  // ── 그룹원 관리 (승인·거절·역할·경고·경고 취소·퇴출·복귀)
  on('POST', '/groups/:id/members/:uid', async ({ db, settings, request, user, params }) => {
    const { c, m: me } = await ctx(db, settings, user, params.id, { manager: true });
    const b = await readJson(request);
    const uid = Number(params.uid);
    const t = await membership(db, c.id, uid);
    if (!t) throw notfound('그룹원을 찾을 수 없습니다');
    const leaderOnly = () => { if (!isLeaderOf(user, c)) throw forbid('그룹리더만 할 수 있습니다'); };
    const name = (await one(db, 'SELECT nickname FROM users WHERE id = ?', uid))?.nickname || '';
    switch (b.action) {
      case 'approve': {
        if (t.status !== 'applied') throw bad('참여 신청 상태가 아닙니다');
        const n = (await activeMembers(db, c.id)).length;
        if (n >= c.capacity) throw bad(`정원(${c.capacity}명)이 찼습니다. 정원을 늘리거나 다른 그룹을 안내해 주세요`);
        await run(db, "UPDATE group_members SET status = 'active', joined_at = datetime('now') WHERE id = ?", t.id);
        await notify(db, uid, `「${c.title}」 참여가 승인되었습니다`, '모임 일정과 출석 규칙을 확인해 주세요.', `#/groups/${c.id}`);
        break;
      }
      case 'reject':
        if (t.status !== 'applied') throw bad('참여 신청 상태가 아닙니다');
        await run(db, "UPDATE group_members SET status = 'rejected' WHERE id = ?", t.id);
        await notify(db, uid, `「${c.title}」 참여 신청 결과`, str(b.note, 300) || '이번에는 함께하기 어렵다는 답을 받았습니다. 다른 그룹도 둘러봐 주세요.', '#/groups');
        break;
      case 'role':
        leaderOnly();
        if (!isActive(t) || t.role === 'leader') throw bad('그룹리더의 역할은 여기서 바꿀 수 없습니다');
        if (!['sub', 'member'].includes(b.role)) throw bad('역할은 부리더 또는 그룹원입니다');
        await run(db, 'UPDATE group_members SET role = ? WHERE id = ?', b.role, t.id);
        if (b.role === 'sub') await notify(db, uid, `「${c.title}」 부리더가 되었습니다`, '모임 일정 등록과 출석 체크를 함께 맡게 됩니다.', `#/groups/${c.id}`);
        break;
      case 'warn': {
        if (!isActive(t) || t.role === 'leader') throw bad('경고를 줄 수 없는 대상입니다');
        const reason = must(str(b.reason, 300), '경고 사유');
        await insert(db, "INSERT INTO group_warnings (challenge_id, user_id, kind, reason, issued_by) VALUES (?,?,'manual',?,?)", c.id, uid, reason, user.id);
        const cnt = (await activeWarnings(db, c.id, uid)).length;
        await notify(db, uid, `「${c.title}」 경고 ${cnt}회`, reason, `#/groups/${c.id}`);
        break;
      }
      case 'clear_warning': {
        const w = await one(db, 'SELECT * FROM group_warnings WHERE id = ? AND challenge_id = ? AND user_id = ?', Number(b.warning_id), c.id, uid);
        if (!w || w.cleared_at) throw bad('취소할 경고가 없습니다');
        await run(db, "UPDATE group_warnings SET cleared_at = datetime('now'), cleared_by = ? WHERE id = ?", user.id, w.id);
        await notify(db, uid, `「${c.title}」 경고가 취소되었습니다`, w.reason, `#/groups/${c.id}`);
        break;
      }
      case 'remove':
        leaderOnly();
        if (!isActive(t) || t.role === 'leader') throw bad('내보낼 수 없는 대상입니다');
        await removeMember(db, c, uid, isStaff(user) && c.leader_id !== user.id ? 'staff' : 'leader', must(str(b.reason, 300), '사유'), user.id);
        break;
      case 'restore':
        leaderOnly();
        if (t.status !== 'removed' && t.status !== 'left') throw bad('복귀시킬 대상이 아닙니다');
        if ((await activeMembers(db, c.id)).length >= c.capacity) throw bad('정원이 찼습니다');
        await run(db, "UPDATE group_members SET status = 'active', role = 'member', joined_at = COALESCE(joined_at, datetime('now')), left_at = NULL, leave_type = NULL, leave_note = NULL WHERE id = ?", t.id);
        await run(db, "UPDATE group_warnings SET cleared_at = datetime('now'), cleared_by = ? WHERE challenge_id = ? AND user_id = ? AND cleared_at IS NULL", user.id, c.id, uid);
        await notify(db, uid, `「${c.title}」 그룹에 다시 함께하게 되었습니다`, '이전 경고는 모두 취소되었습니다.', `#/groups/${c.id}`);
        break;
      default: throw bad('알 수 없는 작업입니다');
    }
    await audit(db, user.id, 'group.member.' + b.action, `challenges:${c.id}`, { user_id: uid, nickname: name, reason: b.reason || b.note || null, role: b.role });
    return { ok: true };
  });

  // ───────────────────────── 모임 일정 ─────────────────────────
  on('POST', '/groups/:id/sessions', async ({ db, settings, request, user, params }) => {
    const { c } = await ctx(db, settings, user, params.id, { manager: true });
    liveGroup(c);
    const b = await readJson(request);
    const title = must(str(b.title, 60), '모임 이름');
    if (!DT_RE.test(b.starts_at || '')) throw bad('모임 시작 일시를 확인해 주세요');
    const mode = b.mode === 'offline' ? 'offline' : 'online';
    const dur = intv(b.duration_min || 90, '모임 시간', { min: 15, max: 600 });
    const repeat = intv(b.repeat_weeks || 0, '반복 횟수', { min: 0, max: 12 });
    const ids = [];
    for (let i = 0; i <= repeat; i++) {
      const at = kstFromMs(kstMs(b.starts_at) + i * 7 * 86400e3);
      ids.push(await insert(db, 'INSERT INTO group_sessions (challenge_id, title, starts_at, duration_min, mode, place, agenda, prep, created_by) VALUES (?,?,?,?,?,?,?,?,?)',
        c.id, title, at, dur, mode, str(b.place, 300), str(b.agenda, 2000), str(b.prep, 1000), user.id));
    }
    for (const x of await activeMembers(db, c.id)) if (x.user_id !== user.id) await notify(db, x.user_id, `「${c.title}」 모임 일정 ${ids.length > 1 ? ids.length + '개가' : '이'} 잡혔습니다`, `${title} · ${b.starts_at.replace('T', ' ')}${ids.length > 1 ? ` 부터 매주` : ''}`, `#/groups/${c.id}/sessions`);
    return { ok: true, ids };
  });

  async function sessionOf(db, c, sid) {
    const s = await one(db, 'SELECT * FROM group_sessions WHERE id = ? AND challenge_id = ?', sid, c.id);
    if (!s) throw notfound('모임을 찾을 수 없습니다');
    return s;
  }

  on('PUT', '/groups/:id/sessions/:sid', async ({ db, settings, request, user, params }) => {
    const { c } = await ctx(db, settings, user, params.id, { manager: true });
    const s = await sessionOf(db, c, params.sid);
    const b = await readJson(request);
    if (b.status === 'cancelled') {
      if (s.status === 'closed') throw bad('출석을 마감한 모임은 취소할 수 없습니다');
      await run(db, "UPDATE group_sessions SET status = 'cancelled', code = NULL WHERE id = ?", s.id);
      for (const x of await activeMembers(db, c.id)) if (x.user_id !== user.id) await notify(db, x.user_id, `「${c.title}」 모임이 취소되었습니다`, `${s.title} · ${s.starts_at.replace('T', ' ')}${b.reason ? ' · ' + str(b.reason, 100) : ''}`, `#/groups/${c.id}/sessions`);
      return { ok: true };
    }
    if (b.starts_at !== undefined && !DT_RE.test(b.starts_at)) throw bad('모임 시작 일시를 확인해 주세요');
    await run(db, `UPDATE group_sessions SET title = COALESCE(?, title), starts_at = COALESCE(?, starts_at), duration_min = COALESCE(?, duration_min), mode = COALESCE(?, mode),
      place = CASE WHEN ? THEN ? ELSE place END, agenda = CASE WHEN ? THEN ? ELSE agenda END, prep = CASE WHEN ? THEN ? ELSE prep END, notes = CASE WHEN ? THEN ? ELSE notes END WHERE id = ?`,
      str(b.title, 60), b.starts_at || null, b.duration_min ? intv(b.duration_min, '모임 시간', { min: 15, max: 600 }) : null, b.mode ? (b.mode === 'offline' ? 'offline' : 'online') : null,
      b.place !== undefined ? 1 : 0, str(b.place, 300), b.agenda !== undefined ? 1 : 0, str(b.agenda, 2000), b.prep !== undefined ? 1 : 0, str(b.prep, 1000), b.notes !== undefined ? 1 : 0, str(b.notes, 6000), s.id);
    if (b.starts_at && b.starts_at !== s.starts_at) for (const x of await activeMembers(db, c.id)) if (x.user_id !== user.id) await notify(db, x.user_id, `「${c.title}」 모임 시간이 바뀌었습니다`, `${s.title} · ${b.starts_at.replace('T', ' ')}`, `#/groups/${c.id}/sessions`);
    return { ok: true };
  });

  // 모임 하나의 출석 표시 (그룹리더·부리더 출석 체크 화면용)
  on('GET', '/groups/:id/sessions/:sid/marks', async ({ db, settings, user, params }) => {
    const { c } = await ctx(db, settings, user, params.id, { manager: true });
    const s = await sessionOf(db, c, params.sid);
    return all(db, 'SELECT user_id, rsvp, rsvp_note, status, method, checked_at FROM session_attendance WHERE session_id = ?', s.id);
  });

  // 참석 예정 / 불참 알림 (불참 사유는 출석 규칙에 따라 공결로 인정될 수 있다)
  on('POST', '/groups/:id/sessions/:sid/rsvp', async ({ db, settings, request, user, params }) => {
    const { c } = await ctx(db, settings, user, params.id, { member: true });
    const s = await sessionOf(db, c, params.sid);
    if (!['scheduled', 'open'].includes(s.status)) throw bad('이미 끝났거나 취소된 모임입니다');
    const b = await readJson(request);
    const rsvp = b.rsvp === 'no' ? 'no' : 'yes';
    const note = str(b.note, 300);
    if (rsvp === 'no' && !note) throw bad('불참 사유를 짧게라도 적어 주세요. 그룹리더가 확인합니다');
    await run(db, `INSERT INTO session_attendance (session_id, user_id, rsvp, rsvp_note, rsvp_at) VALUES (?,?,?,?,datetime('now'))
      ON CONFLICT(session_id, user_id) DO UPDATE SET rsvp = excluded.rsvp, rsvp_note = excluded.rsvp_note, rsvp_at = excluded.rsvp_at`, s.id, user.id, rsvp, rsvp === 'no' ? note : null);
    if (rsvp === 'no') await notify(db, c.leader_id, `「${c.title}」 불참 알림`, `${user.nickname} · ${s.title} ${s.starts_at.replace('T', ' ')} · ${note}`, `#/groups/${c.id}/sessions`);
    return { ok: true, excuse: rsvp === 'no' && c.policy.excuse && kstNow() < s.starts_at };
  });

  // 출석 받기 시작 — 4자리 출석 코드를 만든다. 연 사람은 출석으로 기록한다.
  on('POST', '/groups/:id/sessions/:sid/open', async ({ db, settings, user, params }) => {
    const { c, m } = await ctx(db, settings, user, params.id, { manager: true });
    const s = await sessionOf(db, c, params.sid);
    if (!['scheduled', 'open'].includes(s.status)) throw bad('이미 마감했거나 취소된 모임입니다');
    if (kstMs(s.starts_at) - Date.now() > 3 * 3600e3) throw bad('출석은 모임 시작 3시간 전부터 열 수 있습니다');
    const code = s.code || fourDigits();
    await run(db, "UPDATE group_sessions SET status = 'open', code = ?, opened_at = COALESCE(opened_at, datetime('now')) WHERE id = ?", code, s.id);
    if (isActive(m)) await run(db, `INSERT INTO session_attendance (session_id, user_id, status, method, checked_at, marked_by) VALUES (?,?,'present','leader',datetime('now'),?)
      ON CONFLICT(session_id, user_id) DO UPDATE SET status = 'present', method = 'leader', checked_at = datetime('now'), marked_by = excluded.marked_by`, s.id, user.id, user.id);
    return { ok: true, code };
  });

  // 출석 코드 입력 (그룹원)
  on('POST', '/groups/:id/sessions/:sid/checkin', async ({ db, settings, request, user, params }) => {
    const { c } = await ctx(db, settings, user, params.id, { member: true });
    const s = await sessionOf(db, c, params.sid);
    if (s.status !== 'open' || !s.code) throw bad('아직 출석을 받고 있지 않습니다. 그룹리더가 출석을 열면 코드를 입력해 주세요');
    const b = await readJson(request);
    if (String(b.code || '').trim() !== s.code) throw bad('출석 코드가 맞지 않습니다');
    const start = kstMs(s.starts_at), nowMs = Date.now();
    if (nowMs < start - c.policy.checkin_before * 60e3) throw bad(`출석 코드는 시작 ${c.policy.checkin_before}분 전부터 입력할 수 있습니다`);
    const prev = await one(db, 'SELECT status FROM session_attendance WHERE session_id = ? AND user_id = ?', s.id, user.id);
    if (prev && ['present', 'late'].includes(prev.status)) return { ok: true, status: prev.status, already: true };
    const status = nowMs <= start + c.policy.late_minutes * 60e3 ? 'present' : 'late';
    await run(db, `INSERT INTO session_attendance (session_id, user_id, status, method, checked_at) VALUES (?,?,?,'code',datetime('now'))
      ON CONFLICT(session_id, user_id) DO UPDATE SET status = excluded.status, method = 'code', checked_at = datetime('now')`, s.id, user.id, status);
    return { ok: true, status };
  });

  // 그룹리더가 직접 표시 (출석·지각·결석·공결, 비우기)
  on('POST', '/groups/:id/sessions/:sid/mark', async ({ db, settings, request, user, params }) => {
    const { c } = await ctx(db, settings, user, params.id, { manager: true });
    const s = await sessionOf(db, c, params.sid);
    if (s.status === 'cancelled') throw bad('취소된 모임입니다');
    const b = await readJson(request);
    const uid = intv(b.user_id, '그룹원');
    const t = await membership(db, c.id, uid);
    if (!t || !['active', 'left', 'removed'].includes(t.status)) throw bad('그룹원이 아닙니다');
    const status = b.status === null || b.status === '' ? null : b.status;
    if (status !== null && !ATTEND_STATUS[status]) throw bad('출석 상태를 다시 골라 주세요');
    if (s.status === 'closed' && status === null) throw bad('마감한 모임은 비울 수 없습니다. 출석·지각·결석·공결 중에서 골라 주세요');
    await run(db, `INSERT INTO session_attendance (session_id, user_id, status, method, checked_at, marked_by) VALUES (?,?,?,'leader',datetime('now'),?)
      ON CONFLICT(session_id, user_id) DO UPDATE SET status = excluded.status, method = 'leader', checked_at = datetime('now'), marked_by = excluded.marked_by`, s.id, uid, status, user.id);
    if (s.status === 'closed' && ['present', 'late'].includes(status)) {
      const got = await one(db, "SELECT 1 AS x FROM points_ledger WHERE user_id = ? AND action = 'group_attend' AND ref_type = 'session' AND ref_id = ?", uid, s.id);
      if (!got) await addPoints(db, settings, uid, 'group_attend', 'session', s.id);
    }
    return { ok: true };
  });

  // 출석 마감 — 표시하지 않은 사람은 결석(사전 불참 알림은 규칙에 따라 공결), 출석 규칙 확인
  on('POST', '/groups/:id/sessions/:sid/close', async ({ db, settings, user, params }) => {
    const { c } = await ctx(db, settings, user, params.id, { manager: true });
    const s = await sessionOf(db, c, params.sid);
    if (s.status === 'cancelled') throw bad('취소된 모임입니다');
    if (s.status === 'closed') throw bad('이미 마감한 모임입니다');
    if (kstMs(s.starts_at) > Date.now()) throw bad('시작하기 전인 모임은 마감할 수 없습니다');
    const r = await closeSession(db, settings, c, s, user.id);
    return { ok: true, ...r };
  });

  // ───────────────────────── 도전 기록 ─────────────────────────
  on('POST', '/groups/:id/logs', async ({ db, settings, request, user, params }) => {
    const { c, m } = await ctx(db, settings, user, params.id, { member: true });
    const b = await readJson(request);
    const kind = LOG_KINDS[b.kind] ? b.kind : 'progress';
    if (kind === 'notice' && !isManagerOf(user, c, m)) throw forbid('공지는 그룹리더와 부리더가 씁니다');
    const body = must(str(b.body, 4000), '내용');
    const link = str(b.link, 500);
    if (link && !URL_RE.test(link)) throw bad('링크는 http로 시작해야 합니다');
    const sid = b.session_id ? Number(b.session_id) : null;
    if (sid && !(await one(db, 'SELECT id FROM group_sessions WHERE id = ? AND challenge_id = ?', sid, c.id))) throw bad('모임을 찾을 수 없습니다');
    const id = await insert(db, 'INSERT INTO group_logs (challenge_id, user_id, kind, body, link, session_id, pinned) VALUES (?,?,?,?,?,?,?)', c.id, user.id, kind, body, link, sid, kind === 'notice' && b.pinned ? 1 : 0);
    if (kind !== 'notice') await addPoints(db, settings, user.id, 'group_log', 'group_log', id);
    let post_id = null;
    if (b.share && kind !== 'notice') {
      post_id = await shareToCommunity(db, settings, user, c, `[${c.title}] ${firstLine(body).slice(0, 60)}`, `${body}${link ? '\n\n' + link : ''}\n\n— ${GROUP_TYPES[c.type]} 「${c.title}」의 ${LOG_KINDS[kind]}`);
      await run(db, 'UPDATE group_logs SET post_id = ? WHERE id = ?', post_id, id);
    }
    if (kind === 'notice') for (const x of await activeMembers(db, c.id)) if (x.user_id !== user.id) await notify(db, x.user_id, `「${c.title}」 공지`, firstLine(body).slice(0, 80), `#/groups/${c.id}`);
    await run(db, "UPDATE challenges SET updated_at = datetime('now') WHERE id = ?", c.id);
    return { ok: true, id, post_id };
  });

  on('POST', '/groups/:id/logs/:lid', async ({ db, settings, request, user, params }) => {
    requireUser(user);
    const c = await loadGroup(db, settings, params.id);
    const m = await membership(db, c.id, user.id);
    const l = await one(db, 'SELECT * FROM group_logs WHERE id = ? AND challenge_id = ? AND deleted_at IS NULL', params.lid, c.id);
    if (!l) throw notfound('기록을 찾을 수 없습니다');
    const b = await readJson(request);
    const mine = l.user_id === user.id;
    if (b.action === 'cheer') {
      if (!isActive(m) && !lvlAtLeast(user, 'L1')) throw forbid();
      if (await one(db, 'SELECT 1 AS x FROM log_cheers WHERE log_id = ? AND user_id = ?', l.id, user.id)) { await run(db, 'DELETE FROM log_cheers WHERE log_id = ? AND user_id = ?', l.id, user.id); return { ok: true, on: false }; }
      await run(db, 'INSERT INTO log_cheers (log_id, user_id) VALUES (?,?)', l.id, user.id);
      return { ok: true, on: true };
    }
    if (b.action === 'delete') {
      if (!mine && !isManagerOf(user, c, m)) throw forbid('본인 기록이나 그룹리더만 지울 수 있습니다');
      await run(db, "UPDATE group_logs SET deleted_at = datetime('now') WHERE id = ?", l.id);
      if (l.post_id) await run(db, 'UPDATE posts SET hidden = 1 WHERE id = ?', l.post_id);
      return { ok: true };
    }
    if (b.action === 'share') {
      if (!mine) throw forbid('본인 기록만 공유할 수 있습니다');
      if (l.post_id || l.kind === 'notice') return { ok: true, post_id: l.post_id };
      const post_id = await shareToCommunity(db, settings, user, c, `[${c.title}] ${firstLine(l.body).slice(0, 60)}`, `${l.body}${l.link ? '\n\n' + l.link : ''}\n\n— ${GROUP_TYPES[c.type]} 「${c.title}」의 ${LOG_KINDS[l.kind]}`);
      await run(db, 'UPDATE group_logs SET post_id = ? WHERE id = ?', post_id, l.id);
      return { ok: true, post_id };
    }
    if (b.action === 'pin' || b.action === 'unpin') {
      if (!isManagerOf(user, c, m)) throw forbid('그룹리더와 부리더만 고정할 수 있습니다');
      await run(db, 'UPDATE group_logs SET pinned = ? WHERE id = ?', b.action === 'pin' ? 1 : 0, l.id);
      return { ok: true };
    }
    throw bad('알 수 없는 작업입니다');
  });

  // ───────────────────────── 목표·마일스톤·성과 ─────────────────────────
  on('POST', '/groups/:id/milestones', async ({ db, settings, request, user, params }) => {
    const { c } = await ctx(db, settings, user, params.id, { manager: true });
    const b = await readJson(request);
    const title = must(str(b.title, 120), '마일스톤');
    if (b.due_date && !D_RE.test(b.due_date)) throw bad('날짜 형식을 확인해 주세요');
    const id = await insert(db, "INSERT INTO milestones (challenge_id, code, title, due_date) VALUES (?, 'custom', ?, ?)", c.id, title, b.due_date || null);
    return { ok: true, id };
  });
  on('POST', '/groups/:id/milestones/:mid', async ({ db, settings, request, user, params }) => {
    const { c } = await ctx(db, settings, user, params.id, { manager: true });
    const ms = await one(db, 'SELECT * FROM milestones WHERE id = ? AND challenge_id = ?', params.mid, c.id);
    if (!ms) throw notfound();
    const b = await readJson(request);
    if (b.action === 'done') await run(db, "UPDATE milestones SET done_at = datetime('now'), evidence = ? WHERE id = ?", str(b.evidence, 500), ms.id);
    else if (b.action === 'undo') await run(db, 'UPDATE milestones SET done_at = NULL WHERE id = ?', ms.id);
    else if (b.action === 'delete') await run(db, 'DELETE FROM milestones WHERE id = ?', ms.id);
    else throw bad('알 수 없는 작업입니다');
    return { ok: true };
  });

  on('POST', '/groups/:id/results', async ({ db, settings, request, user, params }) => {
    const { c } = await ctx(db, settings, user, params.id, { member: true });
    const b = await readJson(request);
    if (!GOAL_METRICS[b.metric]) throw bad('어떤 성과인지 골라 주세요');
    const value = Number(b.value);
    if (!Number.isFinite(value) || value <= 0) throw bad('0보다 큰 숫자로 적어 주세요');
    const on_ = b.happened_on && D_RE.test(b.happened_on) ? b.happened_on : kstToday();
    if (on_ > kstToday()) throw bad('아직 오지 않은 날짜입니다');
    const label = str(b.label, 120);
    if (b.metric === 'custom' && !label) throw bad('직접 정한 지표는 무엇인지 적어 주세요');
    const evidence = str(b.evidence, 500);
    const id = await insert(db, 'INSERT INTO group_results (challenge_id, user_id, metric, value, label, happened_on, evidence) VALUES (?,?,?,?,?,?,?)', c.id, user.id, b.metric, value, label, on_, evidence);
    await addPoints(db, settings, user.id, 'result_record', 'group_result', id);
    const [mname, unit] = GOAL_METRICS[b.metric];
    let post_id = null;
    if (b.share) {
      post_id = await shareToCommunity(db, settings, user, c, `[${c.title}] 성과 기록: ${label || mname} ${value.toLocaleString('ko-KR')}${unit}`, `${label ? label + '\n' : ''}${mname} ${value.toLocaleString('ko-KR')}${unit} (${on_})${evidence && URL_RE.test(evidence) ? '\n\n' + evidence : ''}\n\n— ${GROUP_TYPES[c.type]} 「${c.title}」의 성과 기록`);
      await run(db, 'UPDATE group_results SET post_id = ? WHERE id = ?', post_id, id);
    }
    if (b.metric === 'revenue') await notifyStaff(db, `매출 기록 확인 요청: ${c.title}`, `${user.nickname} · ${value.toLocaleString('ko-KR')}원 · ${label || ''}`, `#/admin/groups/${c.id}`);
    // 공개 숫자 갱신 (매출 여부, 고객 수 구간)
    const t = await one(db, "SELECT COALESCE(SUM(CASE WHEN metric = 'revenue' THEN value END),0) AS rev, COALESCE(SUM(CASE WHEN metric = 'customers' THEN value END),0) AS cus FROM group_results WHERE challenge_id = ? AND deleted_at IS NULL", c.id);
    await run(db, "UPDATE challenges SET public_numbers = ?, updated_at = datetime('now') WHERE id = ?", J({ ...c.public_numbers, has_sales: (t?.rev || 0) > 0, customers_band: band(t?.cus || 0) }), c.id);
    return { ok: true, id, post_id };
  });

  on('POST', '/groups/:id/results/:rid', async ({ db, settings, request, user, params }) => {
    requireUser(user);
    const c = await loadGroup(db, settings, params.id);
    const m = await membership(db, c.id, user.id);
    const r = await one(db, 'SELECT * FROM group_results WHERE id = ? AND challenge_id = ? AND deleted_at IS NULL', params.rid, c.id);
    if (!r) throw notfound('성과 기록을 찾을 수 없습니다');
    const b = await readJson(request);
    if (b.action === 'delete') {
      if (r.user_id !== user.id && !isManagerOf(user, c, m)) throw forbid('본인 기록이나 그룹리더만 지울 수 있습니다');
      if (r.verified_at && !isStaff(user)) throw bad('운영진이 확인한 기록은 운영진에게 수정을 요청해 주세요');
      await run(db, "UPDATE group_results SET deleted_at = datetime('now') WHERE id = ?", r.id);
      if (r.post_id) await run(db, 'UPDATE posts SET hidden = 1 WHERE id = ?', r.post_id);
      return { ok: true };
    }
    if (b.action === 'verify') {
      requireStaff(user);
      if (r.verified_at) return { ok: true };
      await run(db, "UPDATE group_results SET verified_by = ?, verified_at = datetime('now') WHERE id = ?", user.id, r.id);
      const granted = [];
      if (r.metric === 'revenue') {
        for (const x of await activeMembers(db, c.id)) {
          if (await one(db, "SELECT id FROM badges WHERE user_id = ? AND code = 'first_sale' AND revoked_at IS NULL", x.user_id)) continue;
          await grantBadge(db, x.user_id, 'first_sale', user.id, `group_result:${r.id}`);
          await addPoints(db, settings, x.user_id, 'first_sale', 'group_result', r.id);
          await notify(db, x.user_id, '첫 매출 배지를 받았습니다', `「${c.title}」의 매출 기록을 운영진이 확인했습니다.`, '#/me');
          granted.push(x.user_id);
        }
      }
      await audit(db, user.id, 'group_result.verify', `group_results:${r.id}`, { metric: r.metric, value: r.value, granted });
      return { ok: true, granted };
    }
    throw bad('알 수 없는 작업입니다');
  });

  // ───────────────────────── 그룹리더 신청 ─────────────────────────
  on('GET', '/me/leader', async ({ db, settings, user }) => {
    requireUser(user);
    const app = await one(db, 'SELECT * FROM leader_applications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', user.id);
    const leading = await all(db, "SELECT id, title, stage, type FROM challenges WHERE leader_id = ? ORDER BY created_at DESC", user.id);
    return { can_lead: !!user.can_lead || isStaff(user), leader_since: user.leader_since, application: app ? { ...app, form: parseJ(app.form, {}) } : null, leading, min_level: settings.groups.leader_level, max_groups: settings.groups.leader_max_groups };
  });
  on('POST', '/me/leader', async ({ db, settings, request, user }) => {
    requireUser(user);
    if (user.can_lead) throw bad('이미 그룹리더로 승인되었습니다. 그룹을 바로 만들 수 있습니다');
    if (levelIndex(user.level) < levelIndex(settings.groups.leader_level)) throw forbid(`${LEVEL_NAMES[settings.groups.leader_level]} 등급부터 신청할 수 있습니다`);
    const pending = await one(db, "SELECT id FROM leader_applications WHERE user_id = ? AND status = 'pending'", user.id);
    if (pending) throw bad('검토 중인 신청이 있습니다. 운영진이 확인하면 알림을 드립니다');
    const b = await readJson(request);
    const form = {
      kind: GROUP_TYPES[b.kind] ? b.kind : 'challenge', topic: must(str(b.topic, 120), '이끌고 싶은 그룹 주제'), plan: must(str(b.plan, 2000), '그룹 운영 계획'),
      experience: str(b.experience, 2000), time: str(b.time, 200), field_code: FIELDS[b.field_code] ? b.field_code : null,
    };
    const id = await insert(db, 'INSERT INTO leader_applications (user_id, form) VALUES (?,?)', user.id, J(form));
    await notifyStaff(db, `그룹리더 신청: ${user.nickname}`, `${GROUP_TYPES[form.kind]} · ${form.topic}`, '#/admin/leaders');
    return { ok: true, id };
  });

  // ───────────────────────── 정기모임 발제·성과발표회 발표 신청 ─────────────────────────
  on('POST', '/events/:id/presentations', async ({ db, settings, request, user, params }) => {
    requireUser(user);
    if (!lvlAtLeast(user, 'L1')) throw forbid('오리엔테이션을 마친 회원부터 신청할 수 있습니다');
    const e = await one(db, 'SELECT * FROM events WHERE id = ?', params.id);
    if (!e || e.status === 'cancelled') throw notfound('일정을 찾을 수 없습니다');
    if (!['regular', 'showcase', 'seminar', 'workshop'].includes(e.type)) throw bad('이 일정은 발표 신청을 받지 않습니다');
    if (e.starts_at < kstNow()) throw bad('지난 일정입니다');
    const b = await readJson(request);
    const title = must(str(b.title, 100), '발표 제목');
    let cid = null;
    if (b.challenge_id) {
      const c = await loadGroup(db, settings, b.challenge_id);
      const m = await membership(db, c.id, user.id);
      if (!isManagerOf(user, c, m)) throw forbid('그룹 발표는 그룹리더나 부리더가 신청합니다');
      cid = c.id;
    } else if (e.type === 'showcase') throw bad('성과발표회는 그룹 단위로 신청합니다. 발표할 그룹을 골라 주세요');
    const dup = await one(db, "SELECT id FROM event_presentations WHERE event_id = ? AND (user_id = ? OR (? IS NOT NULL AND challenge_id = ?)) AND status <> 'declined'", e.id, user.id, cid, cid);
    if (dup) throw bad('이 일정에 이미 신청한 발표가 있습니다');
    const link = str(b.link, 500);
    if (link && !URL_RE.test(link)) throw bad('링크는 http로 시작해야 합니다');
    const id = await insert(db, 'INSERT INTO event_presentations (event_id, user_id, challenge_id, title, summary, link) VALUES (?,?,?,?,?,?)', e.id, user.id, cid, title, str(b.summary, 1000), link);
    await run(db, "INSERT INTO registrations (event_id, user_id) VALUES (?,?) ON CONFLICT(event_id, user_id) DO NOTHING", e.id, user.id);
    await notifyStaff(db, `${EVENT_TYPES[e.type] || '일정'} 발표 신청`, `${user.nickname} · ${title}`, `#/admin/events/${e.id}`);
    return { ok: true, id };
  });
  on('POST', '/presentations/:id/cancel', async ({ db, user, params }) => {
    requireUser(user);
    const p = await one(db, 'SELECT * FROM event_presentations WHERE id = ?', params.id);
    if (!p || p.user_id !== user.id) throw notfound();
    if (p.status === 'presented') throw bad('이미 발표를 마친 신청입니다');
    await run(db, 'DELETE FROM event_presentations WHERE id = ?', p.id);
    return { ok: true };
  });
  on('GET', '/admin/presentations', async ({ db, user }) => {
    requireStaff(user);
    return all(db, `SELECT p.*, u.nickname, c.title AS group_title, e.title AS event_title, e.type AS event_type, e.starts_at FROM event_presentations p
      JOIN events e ON e.id = p.event_id JOIN users u ON u.id = p.user_id LEFT JOIN challenges c ON c.id = p.challenge_id
      WHERE e.status <> 'cancelled' AND p.status IN ('applied','confirmed') AND e.starts_at >= datetime('now','+9 hours','-1 day') ORDER BY e.starts_at, p.created_at LIMIT 200`);
  });
  on('POST', '/admin/presentations/:id', async ({ db, settings, request, user, params }) => {
    requireStaff(user);
    const p = await one(db, 'SELECT p.*, e.type AS event_type, e.title AS event_title FROM event_presentations p JOIN events e ON e.id = p.event_id WHERE p.id = ?', params.id);
    if (!p) throw notfound();
    const b = await readJson(request);
    if (!['confirmed', 'presented', 'declined', 'applied'].includes(b.status)) throw bad('상태를 다시 골라 주세요');
    await run(db, 'UPDATE event_presentations SET status = ? WHERE id = ?', b.status, p.id);
    if (b.status === 'confirmed') await notify(db, p.user_id, '발표가 확정되었습니다', `${p.event_title} · ${p.title}`, '#/events');
    if (b.status === 'declined') await notify(db, p.user_id, '발표 신청 결과', `${p.event_title} · ${str(b.note, 200) || '이번 일정에는 발표 순서를 드리기 어렵습니다'}`, '#/events');
    if (b.status === 'presented') {
      const action = p.event_type === 'showcase' ? 'showcase_present' : 'topic_present';
      const got = await one(db, 'SELECT 1 AS x FROM points_ledger WHERE user_id = ? AND action = ? AND ref_type = ? AND ref_id = ?', p.user_id, action, 'presentation', p.id);
      if (!got) await addPoints(db, settings, p.user_id, action, 'presentation', p.id);
    }
    await audit(db, user.id, 'presentation.' + b.status, `event_presentations:${p.id}`);
    return { ok: true };
  });
}

export function band(n) { if (!n) return '0'; if (n < 5) return '1~4'; if (n < 20) return '5~19'; if (n < 100) return '20~99'; return '100+'; }

// 참여할 수 있는지와 이유
export function joinState(user, settings, c, m, activeCount) {
  const no = reason => ({ can: false, reason });
  if (m && m.status === 'active') return no('이미 참여 중입니다');
  if (m && m.status === 'applied') return no('참여 신청을 보냈습니다. 그룹리더가 확인하면 알림을 드립니다');
  if (!RUNNING_STAGES.includes(c.stage)) return no('종료되었거나 중단된 그룹입니다');
  if (!c.recruit_open) return no('지금은 새 그룹원을 받지 않습니다');
  if (activeCount >= c.capacity) return no(`정원(${c.capacity}명)이 찼습니다`);
  if (!lvlAtLeast(user, settings.groups.join_level)) return no(`${LEVEL_NAMES[settings.groups.join_level]} 등급부터 참여할 수 있습니다`);
  return { can: true, mode: m && m.status === 'removed' ? 'approval' : c.join_mode, rejoin: !!(m && m.status === 'removed') };
}
