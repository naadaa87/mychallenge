// 운영본부 콘솔 API (v2.0) — /api/admin/* 의 조회·관리 기능
// 승인 큐(가입·페이퍼·승급·이의)의 '처리' 엔드포인트는 [[path]].js 에 있고, 그룹 운영 API는 group-routes.js 에 있다.
// 여기에는 운영 현황, 회원·그룹리더·그룹 모니터링, 알림, 커뮤니티, 일정, 감사, 백업을 모았다.
import {
  bad, forbid, notfound, readJson, parseJ, J, one, all, run, insert, getSettings,
  requireStaff, notify, audit, str, must, intv, addPoints, maybeAutoPromote, inviteCode,
} from './util.js';
import { LEVELS, LEVEL_NAMES, FIELDS, BADGE_NAMES, GROUP_TYPES, GROUP_STAGES, GROUP_ROLES, GOAL_METRICS, EVENT_TYPES, EVENT_TOPICS, LEGACY_POINT_LABELS, DEFAULT_SETTINGS, levelIndex } from './rules.js';
import { loadGroup, activeMembers, groupAttendance, emptyStats, closeSession, autoCloseSessions, kstNow } from './group-routes.js';

// ───────────────────────── 스키마 보강 (기존 표에 열 추가·자료 옮기기) ─────────────────────────
// 한 번씩만 실행하고 schema_migrations에 기록한다. 이미 있는 열을 더하려다 난 오류는 넘어간다.
export const MIGRATIONS = [
  ['2026-11-14-rounds-recruit-until', 'ALTER TABLE rounds ADD COLUMN recruit_until TEXT'],
  ['2026-11-14-events-status', "ALTER TABLE events ADD COLUMN status TEXT NOT NULL DEFAULT 'scheduled'"],
  ['2026-11-14-comments-hidden', 'ALTER TABLE comments ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0'],
  ['2026-11-19-analytics-scroll', 'ALTER TABLE analytics_events ADD COLUMN scroll INTEGER'],
  // v2.0 커뮤니티 운영 모델
  ['2026-11-23-users-can-lead', 'ALTER TABLE users ADD COLUMN can_lead INTEGER NOT NULL DEFAULT 0'],
  ['2026-11-23-users-leader-since', 'ALTER TABLE users ADD COLUMN leader_since TEXT'],
  ['2026-11-23-ch-description', 'ALTER TABLE challenges ADD COLUMN description TEXT'],
  ['2026-11-23-ch-goal-text', 'ALTER TABLE challenges ADD COLUMN goal_text TEXT'],
  ['2026-11-23-ch-goal-metric', 'ALTER TABLE challenges ADD COLUMN goal_metric TEXT'],
  ['2026-11-23-ch-goal-unit', 'ALTER TABLE challenges ADD COLUMN goal_unit TEXT'],
  ['2026-11-23-ch-goal-target', 'ALTER TABLE challenges ADD COLUMN goal_target REAL'],
  ['2026-11-23-ch-start', 'ALTER TABLE challenges ADD COLUMN start_date TEXT'],
  ['2026-11-23-ch-end', 'ALTER TABLE challenges ADD COLUMN end_date TEXT'],
  ['2026-11-23-ch-schedule', 'ALTER TABLE challenges ADD COLUMN schedule_text TEXT'],
  ['2026-11-23-ch-capacity', 'ALTER TABLE challenges ADD COLUMN capacity INTEGER NOT NULL DEFAULT 8'],
  ['2026-11-23-ch-join-mode', "ALTER TABLE challenges ADD COLUMN join_mode TEXT NOT NULL DEFAULT 'approval'"],
  ['2026-11-23-ch-recruit-open', 'ALTER TABLE challenges ADD COLUMN recruit_open INTEGER NOT NULL DEFAULT 1'],
  ['2026-11-23-ch-policy', 'ALTER TABLE challenges ADD COLUMN policy TEXT'],
  ['2026-11-23-ch-place', 'ALTER TABLE challenges ADD COLUMN place TEXT'],
  ['2026-11-23-ch-chat', 'ALTER TABLE challenges ADD COLUMN chat_url TEXT'],
  ['2026-11-23-ch-closed-at', 'ALTER TABLE challenges ADD COLUMN closed_at TEXT'],
  ['2026-11-23-gm-leave-note', 'ALTER TABLE group_members ADD COLUMN leave_note TEXT'],
  ['2026-11-23-events-mode', "ALTER TABLE events ADD COLUMN mode TEXT NOT NULL DEFAULT 'offline'"],
  ['2026-11-23-events-online-url', 'ALTER TABLE events ADD COLUMN online_url TEXT'],
  ['2026-11-23-events-topics', 'ALTER TABLE events ADD COLUMN topics TEXT'],
  // 예전 자료를 새 모델로 옮긴다 (수익 배분·합의서 단계는 없어졌다)
  ['2026-11-23-data-stage', "UPDATE challenges SET stage = CASE WHEN stage IN ('agreement','settling') THEN 'active' WHEN stage IN ('proposed','review','rejected') THEN 'stopped' ELSE stage END WHERE stage NOT IN ('recruiting','active','closed','stopped')"],
  ['2026-11-23-data-type', "UPDATE challenges SET type = 'challenge' WHERE type NOT IN ('study','challenge')"],
  ['2026-11-23-data-roles', "UPDATE group_members SET role = 'member' WHERE role NOT IN ('leader','sub','member')"],
  ['2026-11-23-data-event-types', "UPDATE events SET type = CASE type WHEN 'machal_day' THEN 'regular' WHEN 'demo_day' THEN 'showcase' WHEN 'study' THEN 'workshop' ELSE type END WHERE type IN ('machal_day','demo_day','study')"],
  ['2026-11-23-data-boards', "UPDATE posts SET board = 'share' WHERE board = 'swap'"],
  ['2026-11-23-data-leaders', "UPDATE users SET can_lead = 1, leader_since = COALESCE(leader_since, datetime('now')) WHERE id IN (SELECT leader_id FROM challenges WHERE stage IN ('recruiting','active','closed'))"],
];
export async function runMigrations(db) {
  const done = new Set((await all(db, 'SELECT id FROM schema_migrations')).map(r => r.id));
  for (const [id, sql] of MIGRATIONS) {
    if (done.has(id)) continue;
    try { await run(db, sql); } catch (e) { if (!/duplicate column/i.test(String(e && e.message))) throw e; }
    await run(db, 'INSERT OR IGNORE INTO schema_migrations (id) VALUES (?)', id);
  }
}

// ───────────────────────── 운영자(최고 관리자) ─────────────────────────
// 운영자가 한 명도 없으면 가장 먼저 만든 운영진을 운영자로 삼는다(초기 설정 계정).
export async function isOwner(db, user) {
  if (!user || user.role !== 'staff') return false;
  const any = await one(db, 'SELECT COUNT(*) AS c FROM admin_roles');
  if (!(any && any.c)) {
    const first = await one(db, "SELECT id FROM users WHERE role = 'staff' AND status = 'active' ORDER BY id LIMIT 1");
    if (first) await run(db, "INSERT OR IGNORE INTO admin_roles (user_id, role) VALUES (?, 'owner')", first.id);
  }
  return !!(await one(db, "SELECT user_id FROM admin_roles WHERE user_id = ? AND role = 'owner'", user.id));
}
export async function requireOwner(db, user) {
  requireStaff(user);
  if (!(await isOwner(db, user))) throw forbid('운영자만 할 수 있습니다. 운영진 관리 화면에서 운영자를 확인하세요');
  return user;
}

const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.floor((Date.parse(b) - Date.parse(a)) / 86400e3);

function mondayOf(dateStr) { const d = new Date(dateStr + 'T00:00:00Z'); const wd = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - wd); return d.toISOString().slice(0, 10); }
function addDays(dateStr, n) { const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// 단체 알림 대상
async function segmentUsers(db, seg) {
  const t = seg.type;
  if (t === 'all') return all(db, "SELECT id FROM users WHERE status = 'active'");
  if (t === 'level') { const lv = LEVELS.includes(seg.level) ? seg.level : 'L1'; const list = LEVELS.slice(levelIndex(lv)); return all(db, `SELECT id FROM users WHERE status = 'active' AND level IN (${list.map(() => '?').join(',')})`, ...list); }
  if (t === 'challenge' && !Number(seg.challenge_id)) throw bad('대상 그룹을 골라 주세요');
  if (t === 'challenge') return all(db, "SELECT gm.user_id AS id FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.challenge_id = ? AND gm.status = 'active' AND u.status = 'active'", Number(seg.challenge_id));
  if (t === 'in_groups') return all(db, "SELECT DISTINCT gm.user_id AS id FROM group_members gm JOIN challenges c ON c.id = gm.challenge_id JOIN users u ON u.id = gm.user_id WHERE c.stage IN ('recruiting','active') AND gm.status = 'active' AND u.status = 'active'");
  if (t === 'no_group') return all(db, "SELECT u.id FROM users u WHERE u.status = 'active' AND u.role = 'member' AND u.level <> 'L0' AND NOT EXISTS (SELECT 1 FROM group_members gm JOIN challenges c ON c.id = gm.challenge_id WHERE gm.user_id = u.id AND gm.status = 'active' AND c.stage IN ('recruiting','active'))");
  if (t === 'staff') return all(db, "SELECT id FROM users WHERE role = 'staff' AND status = 'active'");
  if (t === 'leaders') return all(db, "SELECT id FROM users WHERE can_lead = 1 AND status = 'active'");
  throw bad('보낼 대상을 골라 주세요');
}

async function batchRun(db, stmts) {
  // D1은 batch로 여러 문장을 한 번에 보낸다. 너무 길면 나눠 보낸다.
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
}

export function registerAdminRoutes(on, h) {
  // ─────────────────────────────── 현황 대시보드 ───────────────────────────────
  on('GET', '/admin/dashboard', async ({ db, settings, user }) => {
    requireStaff(user);
    await h.purgeOldApplications(db);
    const c = async (sql, ...p) => (await one(db, sql, ...p))?.c || 0;
    const today = kstDate();
    const queues = {
      applications: await c("SELECT COUNT(*) AS c FROM applications WHERE status = 'pending'"),
      leaders: await c("SELECT COUNT(*) AS c FROM leader_applications WHERE status = 'pending'"),
      results: await c("SELECT COUNT(*) AS c FROM group_results WHERE metric = 'revenue' AND verified_at IS NULL AND deleted_at IS NULL"),
      papers: await c("SELECT COUNT(*) AS c FROM papers WHERE status = 'review'"),
      presentations: await c("SELECT COUNT(*) AS c FROM event_presentations p JOIN events e ON e.id = p.event_id WHERE p.status = 'applied' AND e.status <> 'cancelled'"),
      promotions: await c("SELECT COUNT(*) AS c FROM promotion_requests WHERE status = 'pending'"),
      disputes: await c("SELECT COUNT(*) AS c FROM disputes WHERE status IN ('open','mediating')"),
    };
    // 처리 기한: 가입 3일, 그룹리더 신청 5일, 페이퍼 5일, 매출 확인·승급·이의 7일, 발표 신청은 일정 3일 전까지
    const overdue = {
      applications: await c("SELECT COUNT(*) AS c FROM applications WHERE status = 'pending' AND created_at < datetime('now','-3 days')"),
      leaders: await c("SELECT COUNT(*) AS c FROM leader_applications WHERE status = 'pending' AND created_at < datetime('now','-5 days')"),
      results: await c("SELECT COUNT(*) AS c FROM group_results WHERE metric = 'revenue' AND verified_at IS NULL AND deleted_at IS NULL AND created_at < datetime('now','-7 days')"),
      papers: await c("SELECT COUNT(*) AS c FROM papers WHERE status = 'review' AND submitted_at < datetime('now','-5 days')"),
      presentations: await c("SELECT COUNT(*) AS c FROM event_presentations p JOIN events e ON e.id = p.event_id WHERE p.status = 'applied' AND e.status <> 'cancelled' AND e.starts_at < datetime('now','+9 hours','+3 days')"),
      promotions: await c("SELECT COUNT(*) AS c FROM promotion_requests WHERE status = 'pending' AND created_at < datetime('now','-7 days')"),
      disputes: await c("SELECT COUNT(*) AS c FROM disputes WHERE status IN ('open','mediating') AND created_at < datetime('now','-7 days')"),
    };
    const since30 = new Date(Date.now() + 9 * 3600e3 - 30 * 86400e3).toISOString().slice(0, 16);
    const att30 = await one(db, `SELECT SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END) AS ok, SUM(CASE WHEN a.status IN ('present','late','absent') THEN 1 ELSE 0 END) AS n
      FROM session_attendance a JOIN group_sessions s ON s.id = a.session_id WHERE s.status = 'closed' AND s.starts_at >= ?`, since30);
    const kpi = {
      north_star: await c(`SELECT COUNT(DISTINCT a.user_id) AS c FROM session_attendance a JOIN group_sessions s ON s.id = a.session_id JOIN users u ON u.id = a.user_id
        WHERE s.status = 'closed' AND s.starts_at >= ? AND a.status IN ('present','late') AND u.role = 'member'`, since30),
      members: await c("SELECT COUNT(*) AS c FROM users WHERE status = 'active' AND role = 'member' AND level <> 'L0'"),
      active_7d: await c("SELECT COUNT(*) AS c FROM users WHERE status = 'active' AND role = 'member' AND level <> 'L0' AND last_seen_at >= datetime('now','-7 days')"),
      active_groups: await c("SELECT COUNT(*) AS c FROM challenges WHERE stage IN ('recruiting','active')"),
      study_groups: await c("SELECT COUNT(*) AS c FROM challenges WHERE stage IN ('recruiting','active') AND type = 'study'"),
      challenge_groups: await c("SELECT COUNT(*) AS c FROM challenges WHERE stage IN ('recruiting','active') AND type = 'challenge'"),
      leaders: await c("SELECT COUNT(*) AS c FROM users WHERE can_lead = 1 AND status = 'active'"),
      sessions_30d: await c("SELECT COUNT(*) AS c FROM group_sessions WHERE status = 'closed' AND starts_at >= ?", since30),
      attendance_rate_30d: att30?.n ? Math.round(att30.ok / att30.n * 100) : null,
      warnings_30d: await c("SELECT COUNT(*) AS c FROM group_warnings WHERE created_at >= datetime('now','-30 days')"),
      removed_30d: await c("SELECT COUNT(*) AS c FROM group_members WHERE status = 'removed' AND leave_type = 'attendance' AND left_at >= datetime('now','-30 days')"),
      logs_7d: await c("SELECT COUNT(*) AS c FROM group_logs WHERE deleted_at IS NULL AND created_at >= datetime('now','-7 days')"),
      first_sales: await c("SELECT COUNT(DISTINCT user_id) AS c FROM badges WHERE code = 'first_sale' AND revoked_at IS NULL"),
      completions: await c("SELECT COUNT(*) AS c FROM badges WHERE code = 'completion' AND revoked_at IS NULL"),
      papers_public: await c("SELECT COUNT(*) AS c FROM papers WHERE status IN ('approved','published') AND publish_scope = 'public'"),
    };
    // v1.x 화면 호환용 이름
    kpi.weekly_checkin_rate = kpi.attendance_rate_30d;
    const funnel = [
      ['가입 신청', await c("SELECT COUNT(*) AS c FROM applications WHERE status <> 'purged'")],
      ['계정 생성', await c("SELECT COUNT(*) AS c FROM users WHERE role = 'member'")],
      ['오리엔테이션', await c("SELECT COUNT(*) AS c FROM users WHERE role = 'member' AND level <> 'L0'")],
      ['그룹 참여', await c("SELECT COUNT(DISTINCT gm.user_id) AS c FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.status IN ('active','left','removed') AND u.role = 'member'")],
      ['그룹 모임 출석', await c("SELECT COUNT(DISTINCT a.user_id) AS c FROM session_attendance a JOIN users u ON u.id = a.user_id WHERE a.status IN ('present','late') AND u.role = 'member'")],
      ['그룹 완주', await c("SELECT COUNT(DISTINCT user_id) AS c FROM badges WHERE code = 'completion' AND revoked_at IS NULL")],
      ['성과 기록', await c("SELECT COUNT(DISTINCT r.user_id) AS c FROM group_results r JOIN users u ON u.id = r.user_id WHERE r.deleted_at IS NULL AND u.role = 'member'")],
    ];
    // 최근 8주 추이 (한국 시간, 월요일 시작)
    const thisMon = mondayOf(today);
    const weeks = Array.from({ length: 8 }, (_, i) => addDays(thisMon, (i - 7) * 7));
    const weekCounts = async (table, col, where = '1 = 1', kst = false) => {
      const expr = kst ? `substr(${col}, 1, 10)` : `datetime(${col}, '+9 hours')`;
      const rows = await all(db, `SELECT date(${expr}, '-6 days', 'weekday 1') AS wk, COUNT(*) AS c FROM ${table} WHERE ${where} AND ${expr} >= ? GROUP BY wk`, weeks[0] + (kst ? '' : ' 00:00:00'));
      const m = Object.fromEntries(rows.map(r => [r.wk, r.c]));
      return weeks.map(w => m[w] || 0);
    };
    const trends = { weeks, applications: await weekCounts('applications', 'created_at'), joins: await weekCounts('users', 'created_at'),
      sessions: await weekCounts('group_sessions', 'starts_at', "status = 'closed'", true), logs: await weekCounts('group_logs', 'created_at', 'deleted_at IS NULL') };
    const risks = await computeRisks(db, settings, today);
    const roundRow = await one(db, "SELECT * FROM rounds WHERE status IN ('open','active') ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, start_date DESC LIMIT 1");
    const round = roundRow ? { ...roundRow, days_to_start: today < roundRow.start_date ? daysBetween(today, roundRow.start_date) : 0 } : null;
    const upcoming = await all(db, `SELECT e.id, e.type, e.title, e.starts_at, e.mode, (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS registered,
      (SELECT COUNT(*) FROM event_presentations p WHERE p.event_id = e.id AND p.status IN ('applied','confirmed')) AS presentations FROM events e WHERE e.status <> 'cancelled' AND e.starts_at >= datetime('now','+9 hours') ORDER BY e.starts_at LIMIT 4`);
    const byLevel = await all(db, "SELECT level, COUNT(*) AS c FROM users WHERE status = 'active' GROUP BY level");
    return {
      me: { is_owner: await isOwner(db, user) },
      queues, overdue, kpi, funnel, trends, risks, round, levels: byLevel,
      events: upcoming.map(e => ({ ...e, type_name: EVENT_TYPES[e.type] || e.type })),
      active_groups: kpi.active_groups, first_sales: kpi.first_sales, completions: kpi.completions,
    };
  });

  // 주의가 필요한 그룹 — 모임이 끊긴 그룹, 출석을 안 받은 모임, 출석률이 낮은 그룹, 퇴출 결정을 기다리는 그룹원, 기간이 지난 그룹
  async function computeRisks(db, settings, today) {
    const risks = [];
    const now = kstNow();
    const groups = await all(db, `SELECT c.id, c.title, c.stage, c.end_date, c.created_at, c.policy, (SELECT COUNT(*) FROM group_members gm WHERE gm.challenge_id = c.id AND gm.status = 'active') AS members,
      (SELECT MAX(starts_at) FROM group_sessions s WHERE s.challenge_id = c.id AND s.status = 'closed') AS last_session,
      (SELECT MIN(starts_at) FROM group_sessions s WHERE s.challenge_id = c.id AND s.status IN ('scheduled','open') AND s.starts_at >= ?) AS next_session,
      (SELECT COUNT(*) FROM group_sessions s WHERE s.challenge_id = c.id AND s.status = 'scheduled' AND s.starts_at < ?) AS unchecked
      FROM challenges c WHERE c.stage IN ('recruiting','active')`, now, new Date(Date.now() + 9 * 3600e3 - 86400e3).toISOString().slice(0, 16));
    for (const g of groups) {
      const link = `#/admin/groups/${g.id}`;
      const ageDays = Math.floor((Date.now() - Date.parse(g.created_at.replace(' ', 'T') + 'Z')) / 86400e3);
      const lastDays = g.last_session ? Math.floor((Date.now() - Date.parse(g.last_session + ':00+09:00')) / 86400e3) : null;
      if (g.stage === 'active' && !g.next_session && (lastDays == null ? ageDays > 14 : lastDays > 14)) risks.push({ level: lastDays == null || lastDays > 21 ? 'high' : 'mid', kind: 'stalled', title: g.title, detail: lastDays == null ? `진행 중인데 ${ageDays}일째 마감한 모임이 없고, 잡힌 일정도 없습니다` : `마지막 모임이 ${lastDays}일 전이고 다음 일정이 없습니다`, link });
      if (g.unchecked) risks.push({ level: 'mid', kind: 'unchecked', title: g.title, detail: `출석을 받지 않은 지난 모임이 ${g.unchecked}개 있습니다`, link });
      if (g.stage === 'recruiting' && g.members < 2 && ageDays > 14) risks.push({ level: 'low', kind: 'lonely', title: g.title, detail: `모집을 연 지 ${ageDays}일이 지났는데 그룹원이 ${g.members}명입니다. 정기모임에서 소개해 보세요`, link });
      if (g.end_date && g.end_date < today && g.stage === 'active') risks.push({ level: 'low', kind: 'overdue', title: g.title, detail: `정한 기간(${g.end_date})이 지났습니다. 연장하거나 종료해 주세요`, link });
      const recent = await all(db, "SELECT id FROM group_sessions WHERE challenge_id = ? AND status = 'closed' ORDER BY starts_at DESC LIMIT 3", g.id);
      if (recent.length >= 2) {
        const r = await one(db, `SELECT SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) AS ok, SUM(CASE WHEN status IN ('present','late','absent') THEN 1 ELSE 0 END) AS n FROM session_attendance WHERE session_id IN (${recent.map(() => '?').join(',')})`, ...recent.map(x => x.id));
        const rate = r?.n ? Math.round(r.ok / r.n * 100) : null;
        if (rate != null && rate < 60) risks.push({ level: rate < 40 ? 'high' : 'mid', kind: 'low_attendance', title: g.title, detail: `최근 모임 ${recent.length}번의 출석률이 ${rate}%입니다`, link });
      }
      const pol = parseJ(g.policy, {}) || {};
      const kickAt = pol.kick_warnings ?? settings.attendance_default.kick_warnings;
      if (kickAt > 0) {
        const cand = await all(db, `SELECT u.id, u.nickname, COUNT(*) AS n FROM group_warnings w JOIN users u ON u.id = w.user_id JOIN group_members gm ON gm.challenge_id = w.challenge_id AND gm.user_id = w.user_id AND gm.status = 'active'
          WHERE w.challenge_id = ? AND w.cleared_at IS NULL GROUP BY u.id HAVING n >= ?`, g.id, kickAt);
        for (const k of cand) risks.push({ level: 'mid', kind: 'kick', title: `${k.nickname} · ${g.title}`, detail: `출석 경고 ${k.n}회로 퇴출 기준에 닿았습니다. 그룹리더의 결정을 기다리는 중입니다`, link });
      }
    }
    return risks.sort((a, b) => ({ high: 0, mid: 1, low: 2 }[a.level] - { high: 0, mid: 1, low: 2 }[b.level])).slice(0, 30);
  }

  // 사이드 메뉴 숫자 (가벼운 조회)
  on('GET', '/admin/counts', async ({ db, user }) => {
    requireStaff(user);
    const row = await one(db, `SELECT
      (SELECT COUNT(*) FROM applications WHERE status = 'pending') AS applications,
      (SELECT COUNT(*) FROM leader_applications WHERE status = 'pending') AS leaders,
      (SELECT COUNT(*) FROM group_results WHERE metric = 'revenue' AND verified_at IS NULL AND deleted_at IS NULL) AS results,
      (SELECT COUNT(*) FROM papers WHERE status = 'review') AS papers,
      (SELECT COUNT(*) FROM promotion_requests WHERE status = 'pending') AS promotions,
      (SELECT COUNT(*) FROM disputes WHERE status IN ('open','mediating')) AS disputes,
      (SELECT COUNT(*) FROM posts WHERE reported > 0 AND hidden = 0) AS community,
      (SELECT COUNT(*) FROM event_presentations p JOIN events e ON e.id = p.event_id WHERE p.status = 'applied' AND e.status <> 'cancelled') AS presentations`);
    return { ...row, is_owner: await isOwner(db, user) };
  });

  // ─────────────────────────────── 통합 검색 ───────────────────────────────
  on('GET', '/admin/search', async ({ db, user, query }) => {
    requireStaff(user);
    const q = String(query.q || '').trim(); if (q.length < 1) return { users: [], challenges: [], applications: [] };
    const like = `%${q}%`;
    return {
      users: await all(db, 'SELECT id, nickname, name, email, level, status FROM users WHERE nickname LIKE ? OR name LIKE ? OR email LIKE ? ORDER BY last_seen_at DESC LIMIT 6', like, like, like),
      challenges: await all(db, 'SELECT id, title, stage, type FROM challenges WHERE title LIKE ? ORDER BY updated_at DESC LIMIT 6', like),
      applications: await all(db, "SELECT id, name, email, status FROM applications WHERE (name LIKE ? OR email LIKE ?) AND status <> 'purged' ORDER BY created_at DESC LIMIT 6", like, like),
    };
  });

  // ─────────────────────────────── 가입 신청 ───────────────────────────────
  on('GET', '/admin/applications', async ({ db, user, query }) => {
    requireStaff(user);
    const status = ['pending', 'approved', 'joined', 'rejected'].includes(query.status) ? query.status : 'pending';
    const like = `%${String(query.q || '').trim()}%`;
    const rows = await all(db, `SELECT a.*, CAST(julianday('now') - julianday(a.created_at) AS INTEGER) AS waiting_days,
      (SELECT COUNT(*) FROM admin_notes n WHERE n.ref_type = 'application' AND n.ref_id = a.id) AS notes
      FROM applications a WHERE a.status = ? AND (a.name LIKE ? OR a.email LIKE ?) ORDER BY a.created_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 300`, status, like, like);
    return rows.map(r => ({ ...r, form: parseJ(r.form, {}) }));
  });
  on('POST', '/admin/applications/bulk', async ({ db, request, user }) => {
    requireStaff(user); const b = await readJson(request);
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean).slice(0, 100);
    if (!ids.length) throw bad('승인할 신청을 골라 주세요');
    const out = [];
    for (const id of ids) {
      const a = await one(db, "SELECT * FROM applications WHERE id = ? AND status = 'pending'", id); if (!a) continue;
      const code = inviteCode();
      await run(db, "UPDATE applications SET status = 'approved', invite_code = ?, decided_at = datetime('now'), decided_by = ? WHERE id = ?", code, user.id, a.id);
      await audit(db, user.id, 'application.approve', 'applications:' + a.id, { bulk: true });
      out.push({ id: a.id, name: a.name, email: a.email, invite_code: code });
    }
    return { approved: out };
  });

  // ─────────────────────────────── 회원 ───────────────────────────────
  on('GET', '/admin/users', async ({ db, user, query }) => {
    requireStaff(user);
    const where = []; const p = [];
    if (query.q) { const like = `%${String(query.q).trim()}%`; where.push('(u.nickname LIKE ? OR u.email LIKE ? OR u.name LIKE ?)'); p.push(like, like, like); }
    if (LEVELS.includes(query.level)) { where.push('u.level = ?'); p.push(query.level); }
    if (['active', 'dormant', 'removed'].includes(query.status)) { where.push('u.status = ?'); p.push(query.status); }
    if (query.role === 'staff' || query.role === 'member') { where.push('u.role = ?'); p.push(query.role); }
    if (query.leader) where.push('u.can_lead = 1');
    const order = { points: 'points DESC', seen: 'u.last_seen_at IS NULL, u.last_seen_at DESC', name: 'u.nickname', level: "u.level DESC, u.created_at DESC" }[query.sort] || 'u.created_at DESC';
    const per = 50; const page = Math.max(1, Number(query.page || 1));
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = (await one(db, `SELECT COUNT(*) AS c FROM users u ${w}`, ...p))?.c || 0;
    const rows = await all(db, `SELECT u.id, u.email, u.name, u.nickname, u.level, u.role, u.status, u.has_business, u.interests, u.can_lead, u.created_at, u.last_seen_at,
      (SELECT COALESCE(SUM(points),0) FROM points_ledger pl WHERE pl.user_id = u.id) AS points,
      (SELECT COUNT(*) FROM badges b WHERE b.user_id = u.id AND b.revoked_at IS NULL) AS badge_count,
      (SELECT COUNT(*) FROM group_members gm JOIN challenges c ON c.id = gm.challenge_id WHERE gm.user_id = u.id AND gm.status = 'active' AND c.stage IN ('recruiting','active')) AS active_groups
      FROM users u ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, ...p, per, (page - 1) * per);
    return { rows, total, page, per };
  });

  on('GET', '/admin/users/:id', async ({ db, settings, user, params }) => {
    requireStaff(user);
    const u = await one(db, 'SELECT id, email, name, nickname, phone, level, role, status, has_business, interests, bio, onboarded, asset_diag, can_lead, leader_since, created_at, last_seen_at FROM users WHERE id = ?', params.id);
    if (!u) throw notfound();
    u.asset_diag = parseJ(u.asset_diag, null);
    const points = await all(db, 'SELECT action, SUM(points) AS pts, COUNT(*) AS n FROM points_ledger WHERE user_id = ? GROUP BY action ORDER BY pts DESC', u.id);
    const pointsTotal = points.reduce((s, r) => s + (r.pts || 0), 0);
    const badges = await all(db, 'SELECT b.*, g.nickname AS granted_by_name FROM badges b LEFT JOIN users g ON g.id = b.granted_by WHERE b.user_id = ? ORDER BY b.created_at', u.id);
    const levelHistory = await all(db, 'SELECT h.*, d.nickname AS decided_by_name FROM level_history h LEFT JOIN users d ON d.id = h.decided_by WHERE h.user_id = ? ORDER BY h.created_at DESC', u.id);
    const groupRows = await all(db, `SELECT c.id, c.title, c.stage, c.type, c.policy, gm.role, gm.status, gm.joined_at, gm.left_at, gm.leave_type, gm.leave_note,
      (SELECT COUNT(*) FROM group_logs l WHERE l.challenge_id = c.id AND l.user_id = gm.user_id AND l.deleted_at IS NULL) AS logs,
      (SELECT COUNT(*) FROM group_results r WHERE r.challenge_id = c.id AND r.user_id = gm.user_id AND r.deleted_at IS NULL) AS results,
      (SELECT COUNT(*) FROM group_warnings w WHERE w.challenge_id = c.id AND w.user_id = gm.user_id AND w.cleared_at IS NULL) AS warnings
      FROM group_members gm JOIN challenges c ON c.id = gm.challenge_id WHERE gm.user_id = ? ORDER BY gm.created_at DESC`, u.id);
    const groups = [];
    for (const g of groupRows) {
      const c = await loadGroup(db, settings, g.id);
      const st = (await groupAttendance(db, c, [u.id]))[u.id] || emptyStats();
      groups.push({ ...g, policy: undefined, type_name: GROUP_TYPES[g.type], role_name: GROUP_ROLES[g.role] || g.role, attendance: st, min_rate: c.policy.min_rate });
    }
    const leaderApps = await all(db, 'SELECT id, status, form, note, created_at, decided_at FROM leader_applications WHERE user_id = ? ORDER BY created_at DESC', u.id);
    const events = await all(db, 'SELECT e.id, e.title, e.type, e.starts_at, r.status FROM registrations r JOIN events e ON e.id = r.event_id WHERE r.user_id = ? ORDER BY e.starts_at DESC LIMIT 20', u.id);
    const applications = await all(db, 'SELECT id, status, created_at, decided_at, form FROM applications WHERE email = ? ORDER BY created_at DESC', u.email);
    const consents = await all(db, "SELECT kind, version, created_at FROM consents WHERE subject_type = 'user' AND subject_id = ? ORDER BY created_at", u.id);
    const promotions = await all(db, 'SELECT id, target_level, status, decision_note, created_at, decided_at FROM promotion_requests WHERE user_id = ? ORDER BY created_at DESC', u.id);
    const activity = {
      posts: (await one(db, 'SELECT COUNT(*) AS c FROM posts WHERE author_id = ?', u.id))?.c || 0,
      comments: (await one(db, 'SELECT COUNT(*) AS c FROM comments WHERE author_id = ?', u.id))?.c || 0,
      disputes: (await one(db, 'SELECT COUNT(*) AS c FROM disputes WHERE filed_by = ?', u.id))?.c || 0,
    };
    const progress = await h.levelProgress(db, settings, u, { total: pointsTotal }, badges.filter(b => !b.revoked_at));
    const notes = await notesOf(db, 'user', u.id);
    return { user: u, is_owner: u.role === 'staff' ? !!(await one(db, "SELECT user_id FROM admin_roles WHERE user_id = ? AND role = 'owner'", u.id)) : false,
      points: { total: pointsTotal, by_action: points.map(r => ({ ...r, label: settings.points[r.action]?.label || LEGACY_POINT_LABELS[r.action] || r.action })) },
      badges: badges.map(b => ({ ...b, name: BADGE_NAMES[b.code] || b.code })), level_history: levelHistory, groups, events, leader_applications: leaderApps.map(a => ({ ...a, form: parseJ(a.form, {}) })),
      applications: applications.map(a => ({ ...a, form: parseJ(a.form, {}) })), consents, promotions, activity, progress, notes };
  });

  // ─────────────────────────────── 내부 메모 ───────────────────────────────
  async function notesOf(db, refType, refId) {
    return all(db, 'SELECT n.id, n.body, n.created_at, n.author_id, u.nickname AS author FROM admin_notes n LEFT JOIN users u ON u.id = n.author_id WHERE n.ref_type = ? AND n.ref_id = ? ORDER BY n.created_at DESC', refType, refId);
  }
  const NOTE_REFS = ['user', 'challenge', 'application'];
  on('GET', '/admin/notes', async ({ db, user, query }) => {
    requireStaff(user);
    if (!NOTE_REFS.includes(query.ref_type)) throw bad('ref_type 오류');
    return notesOf(db, query.ref_type, Number(query.ref_id));
  });
  on('POST', '/admin/notes', async ({ db, request, user }) => {
    requireStaff(user); const b = await readJson(request);
    if (!NOTE_REFS.includes(b.ref_type)) throw bad('ref_type 오류');
    const body = str(b.body, 2000); if (!body) throw bad('메모 내용을 적어 주세요');
    const id = await insert(db, 'INSERT INTO admin_notes (ref_type, ref_id, author_id, body) VALUES (?,?,?,?)', b.ref_type, Number(b.ref_id), user.id, body);
    return { ok: true, id };
  });
  on('DELETE', '/admin/notes/:id', async ({ db, user, params }) => {
    requireStaff(user);
    const n = await one(db, 'SELECT * FROM admin_notes WHERE id = ?', params.id); if (!n) throw notfound();
    if (n.author_id !== user.id && !(await isOwner(db, user))) throw forbid('메모는 쓴 사람이나 운영자만 지울 수 있습니다');
    await run(db, 'DELETE FROM admin_notes WHERE id = ?', n.id);
    return { ok: true };
  });

  // ─────────────────────────────── 운영진 ───────────────────────────────
  on('GET', '/admin/staff', async ({ db, user }) => {
    requireStaff(user);
    const meOwner = await isOwner(db, user);
    const rows = await all(db, `SELECT u.id, u.nickname, u.name, u.email, u.level, u.last_seen_at, u.created_at,
      EXISTS (SELECT 1 FROM admin_roles r WHERE r.user_id = u.id AND r.role = 'owner') AS is_owner,
      (SELECT COUNT(*) FROM audit_logs a WHERE a.actor_id = u.id AND a.created_at >= datetime('now','-30 days')) AS actions_30d,
      (SELECT MAX(created_at) FROM audit_logs a WHERE a.actor_id = u.id) AS last_action_at
      FROM users u WHERE u.role = 'staff' AND u.status = 'active' ORDER BY is_owner DESC, u.id`);
    return { me: { is_owner: meOwner, id: user.id }, rows: rows.map(r => ({ ...r, is_owner: !!r.is_owner })) };
  });
  on('POST', '/admin/staff', async ({ db, request, user }) => {
    await requireOwner(db, user); const b = await readJson(request);
    const target = b.user_id ? await one(db, 'SELECT * FROM users WHERE id = ?', Number(b.user_id)) : await one(db, 'SELECT * FROM users WHERE email = ? OR nickname = ?', String(b.who || '').trim().toLowerCase(), String(b.who || '').trim());
    if (!target) throw bad('회원을 찾지 못했습니다. 이메일 또는 닉네임을 정확히 적어 주세요');
    if (target.status !== 'active') throw bad('활동 중인 회원만 운영진으로 지정할 수 있습니다');
    const owners = async () => (await one(db, "SELECT COUNT(*) AS c FROM admin_roles r JOIN users u ON u.id = r.user_id WHERE r.role = 'owner' AND u.role = 'staff' AND u.status = 'active'"))?.c || 0;
    if (b.action === 'grant') {
      await run(db, "UPDATE users SET role = 'staff' WHERE id = ?", target.id);
      await notify(db, target.id, '운영진으로 지정됐습니다', '메뉴의 운영본부에서 처리할 일을 확인할 수 있습니다', '#/admin');
    } else if (b.action === 'revoke') {
      if (target.id === user.id) throw bad('자기 자신의 운영진 권한은 해제할 수 없습니다');
      const wasOwner = await one(db, "SELECT 1 AS x FROM admin_roles WHERE user_id = ? AND role = 'owner'", target.id);
      if (wasOwner && (await owners()) <= 1) throw bad('마지막 운영자는 해제할 수 없습니다');
      await run(db, "UPDATE users SET role = 'member' WHERE id = ?", target.id);
      await run(db, 'DELETE FROM admin_roles WHERE user_id = ?', target.id);
      await notify(db, target.id, '운영진 권한이 해제됐습니다', null, '#/me');
    } else if (b.action === 'make_owner') {
      if (target.role !== 'staff') throw bad('운영진만 운영자로 지정할 수 있습니다');
      await run(db, "INSERT OR IGNORE INTO admin_roles (user_id, role, granted_by) VALUES (?, 'owner', ?)", target.id, user.id);
      await notify(db, target.id, '운영자로 지정됐습니다', '규칙 설정·운영진 관리·개인정보 내려받기를 할 수 있습니다', '#/admin/staff');
    } else if (b.action === 'remove_owner') {
      if ((await owners()) <= 1) throw bad('운영자는 최소 한 명 있어야 합니다');
      await run(db, 'DELETE FROM admin_roles WHERE user_id = ?', target.id);
    } else throw bad('action은 grant, revoke, make_owner, remove_owner 중 하나');
    await audit(db, user.id, 'staff.' + b.action, 'users:' + target.id);
    return { ok: true };
  });

  // ─────────────────────────────── 그룹 현황 ───────────────────────────────
  // 그룹 현황 — 순조·주의·위험을 출석률과 모임 간격으로 본다
  on('GET', '/admin/groups', async ({ db, settings, user, query }) => {
    requireStaff(user);
    const where = []; const p = [];
    const stageSets = { running: ['active'], forming: ['recruiting'], done: ['closed', 'stopped'] };
    if (stageSets[query.view]) { where.push(`c.stage IN (${stageSets[query.view].map(() => '?').join(',')})`); p.push(...stageSets[query.view]); }
    if (GROUP_TYPES[query.type]) { where.push('c.type = ?'); p.push(query.type); }
    const now = kstNow();
    const rows = await all(db, `SELECT c.id, c.title, c.type, c.stage, c.field_code, c.capacity, c.recruit_open, c.join_mode, c.start_date, c.end_date, c.updated_at, c.created_at, c.goal_metric, c.goal_target, c.goal_unit, c.policy, c.public_numbers, u.nickname AS leader, c.leader_id,
        (SELECT COUNT(*) FROM group_members gm WHERE gm.challenge_id = c.id AND gm.status = 'active') AS members,
        (SELECT COUNT(*) FROM group_members gm WHERE gm.challenge_id = c.id AND gm.status = 'applied') AS applicants,
        (SELECT COUNT(*) FROM group_sessions s WHERE s.challenge_id = c.id AND s.status = 'closed') AS sessions_done,
        (SELECT MAX(starts_at) FROM group_sessions s WHERE s.challenge_id = c.id AND s.status = 'closed') AS last_session,
        (SELECT MIN(starts_at) FROM group_sessions s WHERE s.challenge_id = c.id AND s.status IN ('scheduled','open') AND s.starts_at >= ?) AS next_session,
        (SELECT COUNT(*) FROM group_warnings w WHERE w.challenge_id = c.id AND w.cleared_at IS NULL) AS warnings,
        (SELECT COUNT(*) FROM group_logs l WHERE l.challenge_id = c.id AND l.deleted_at IS NULL) AS logs,
        (SELECT MAX(created_at) FROM group_logs l WHERE l.challenge_id = c.id AND l.deleted_at IS NULL) AS last_log,
        (SELECT COALESCE(SUM(value),0) FROM group_results r WHERE r.challenge_id = c.id AND r.deleted_at IS NULL AND r.metric = 'revenue') AS revenue,
        (SELECT COALESCE(SUM(value),0) FROM group_results r WHERE r.challenge_id = c.id AND r.deleted_at IS NULL AND r.metric = c.goal_metric) AS goal_value
      FROM challenges c JOIN users u ON u.id = c.leader_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY CASE c.stage WHEN 'active' THEN 0 WHEN 'recruiting' THEN 1 ELSE 2 END, c.updated_at DESC LIMIT 300`, now, ...p);
    const out = [];
    for (const r of rows) {
      const recent = await all(db, "SELECT id FROM group_sessions WHERE challenge_id = ? AND status = 'closed' ORDER BY starts_at DESC LIMIT 3", r.id);
      let rate = null;
      if (recent.length) {
        const a = await one(db, `SELECT SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) AS ok, SUM(CASE WHEN status IN ('present','late','absent') THEN 1 ELSE 0 END) AS n FROM session_attendance WHERE session_id IN (${recent.map(() => '?').join(',')})`, ...recent.map(x => x.id));
        rate = a?.n ? Math.round(a.ok / a.n * 100) : null;
      }
      const lastMs = r.last_session ? Date.parse(r.last_session + ':00+09:00') : null;
      const idle = lastMs ? Math.floor((Date.now() - lastMs) / 86400e3) : null;
      const age = Math.floor((Date.now() - Date.parse(r.created_at.replace(' ', 'T') + 'Z')) / 86400e3);
      let health = 'na';
      if (r.stage === 'active') {
        if ((idle == null && age > 14 && !r.next_session) || (idle != null && idle > 21 && !r.next_session) || (rate != null && rate < 40)) health = 'bad';
        else if ((idle != null && idle > 10 && !r.next_session) || (rate != null && rate < 60) || r.warnings > 0) health = 'warn';
        else health = 'good';
      }
      const { policy, ...rest } = r;
      out.push({ ...rest, type_name: GROUP_TYPES[r.type], stage_name: GROUP_STAGES[r.stage], field_name: FIELDS[r.field_code], goal_metric_name: GOAL_METRICS[r.goal_metric]?.[0] || null,
        public_numbers: parseJ(r.public_numbers, null), recent_rate: rate, idle_days: idle, health });
    }
    return out;
  });

  on('GET', '/admin/groups/:id', async ({ db, settings, user, params }) => {
    requireStaff(user);
    const c = await loadGroup(db, settings, params.id);
    await autoCloseSessions(db, settings, c);
    const members = await all(db, `SELECT gm.*, u.nickname, u.level, u.email, u.last_seen_at,
      (SELECT COUNT(*) FROM group_logs l WHERE l.challenge_id = gm.challenge_id AND l.user_id = gm.user_id AND l.deleted_at IS NULL) AS logs,
      (SELECT COUNT(*) FROM group_warnings w WHERE w.challenge_id = gm.challenge_id AND w.user_id = gm.user_id AND w.cleared_at IS NULL) AS warnings
      FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.challenge_id = ? ORDER BY CASE gm.status WHEN 'active' THEN 0 WHEN 'applied' THEN 1 ELSE 2 END, CASE gm.role WHEN 'leader' THEN 0 WHEN 'sub' THEN 1 ELSE 2 END, gm.joined_at`, c.id);
    const att = await groupAttendance(db, c);
    const sessions = await all(db, `SELECT s.*, (SELECT COUNT(*) FROM session_attendance a WHERE a.session_id = s.id AND a.status IN ('present','late')) AS attended,
      (SELECT COUNT(*) FROM session_attendance a WHERE a.session_id = s.id AND a.status = 'absent') AS absent, (SELECT COUNT(*) FROM session_attendance a WHERE a.session_id = s.id AND a.status = 'excused') AS excused
      FROM group_sessions s WHERE s.challenge_id = ? ORDER BY s.starts_at DESC LIMIT 60`, c.id);
    const warnings = await all(db, 'SELECT w.*, u.nickname, i.nickname AS issuer FROM group_warnings w JOIN users u ON u.id = w.user_id LEFT JOIN users i ON i.id = w.issued_by WHERE w.challenge_id = ? ORDER BY w.created_at DESC LIMIT 100', c.id);
    const results = await all(db, 'SELECT r.*, u.nickname, v.nickname AS verifier FROM group_results r JOIN users u ON u.id = r.user_id LEFT JOIN users v ON v.id = r.verified_by WHERE r.challenge_id = ? AND r.deleted_at IS NULL ORDER BY r.happened_on DESC, r.id DESC', c.id);
    const logs = await all(db, 'SELECT l.id, l.kind, l.body, l.link, l.post_id, l.created_at, u.nickname FROM group_logs l JOIN users u ON u.id = l.user_id WHERE l.challenge_id = ? AND l.deleted_at IS NULL ORDER BY l.created_at DESC LIMIT 30', c.id);
    const milestones = await all(db, 'SELECT * FROM milestones WHERE challenge_id = ? ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date, id', c.id);
    const paper = await one(db, 'SELECT id, status, publish_scope, submitted_at, published_at FROM papers WHERE challenge_id = ?', c.id);
    const history = await all(db, "SELECT a.action, a.detail, a.created_at, u.nickname FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id WHERE a.target = ? OR a.target LIKE ? ORDER BY a.created_at DESC LIMIT 40", 'challenges:' + c.id, `challenges:${c.id}/%`);
    return { group: c, members: members.map(m => ({ ...m, role_name: GROUP_ROLES[m.role] || m.role, attendance: att[m.user_id] || emptyStats() })), sessions, warnings, results: results.map(r => ({ ...r, metric_name: GOAL_METRICS[r.metric]?.[0] || r.metric, unit: GOAL_METRICS[r.metric]?.[1] || '' })),
      logs, milestones, paper, history, notes: await notesOf(db, 'challenge', c.id) };
  });

  // 운영진의 그룹 단계 변경 (중단·재개·종료). 그룹리더의 종료와 달리 사유를 남긴다.
  on('POST', '/admin/groups/:id/stage', async ({ db, settings, request, user, params }) => {
    requireStaff(user); const b = await readJson(request);
    const c = await loadGroup(db, settings, params.id);
    const to = b.stage; const reason = str(b.reason, 500);
    const allowed = { stopped: ['recruiting', 'active'], closed: ['active', 'recruiting', 'stopped'], active: ['stopped', 'closed', 'recruiting'], recruiting: ['stopped', 'active'] };
    if (!allowed[to]) throw bad('바꿀 수 없는 단계입니다');
    if (!allowed[to].includes(c.stage)) throw bad(`지금 단계(${GROUP_STAGES[c.stage] || c.stage})에서는 ${GROUP_STAGES[to]}(으)로 바꿀 수 없습니다`);
    if (!reason) throw bad('사유를 적어 주세요. 그룹원에게도 전달됩니다');
    if (to === 'stopped' || to === 'closed') for (const s of await all(db, "SELECT * FROM group_sessions WHERE challenge_id = ? AND status = 'open'", c.id)) await closeSession(db, settings, c, s, user.id);
    await run(db, "UPDATE challenges SET stage = ?, closed_at = CASE WHEN ? IN ('closed','stopped') THEN datetime('now') ELSE NULL END, updated_at = datetime('now') WHERE id = ?", to, to, c.id);
    const label = { stopped: '중단', closed: '종료', active: '재개', recruiting: '모집 재개' }[to];
    for (const m of await all(db, "SELECT user_id FROM group_members WHERE challenge_id = ? AND status = 'active'", c.id)) {
      await notify(db, m.user_id, `운영진이 「${c.title}」 그룹을 ${label} 처리했습니다`, reason, `#/groups/${c.id}`);
    }
    await audit(db, user.id, 'group.stage', 'challenges:' + c.id, { from: c.stage, to, reason, by: 'admin' });
    return { ok: true };
  });

  // 그룹리더 교체 (운영진만). 새 리더는 그룹리더 자격도 함께 받는다.
  on('POST', '/admin/groups/:id/leader', async ({ db, settings, request, user, params }) => {
    requireStaff(user); const b = await readJson(request);
    const c = await loadGroup(db, settings, params.id);
    const reason = str(b.reason, 500); if (!reason) throw bad('교체 사유를 적어 주세요');
    const next = await one(db, "SELECT * FROM group_members WHERE challenge_id = ? AND user_id = ? AND status = 'active'", c.id, Number(b.user_id));
    if (!next) throw bad('활동 중인 그룹원 중에서 새 그룹리더를 골라 주세요');
    if (next.user_id === c.leader_id) throw bad('이미 그룹리더입니다');
    await run(db, "UPDATE group_members SET role = 'member' WHERE challenge_id = ? AND user_id = ?", c.id, c.leader_id);
    await run(db, "UPDATE group_members SET role = 'leader' WHERE id = ?", next.id);
    await run(db, "UPDATE challenges SET leader_id = ?, updated_at = datetime('now') WHERE id = ?", next.user_id, c.id);
    await run(db, "UPDATE users SET can_lead = 1, leader_since = COALESCE(leader_since, datetime('now')) WHERE id = ?", next.user_id);
    for (const m of await all(db, "SELECT user_id FROM group_members WHERE challenge_id = ? AND status = 'active'", c.id)) await notify(db, m.user_id, '그룹리더가 바뀌었습니다', `${c.title} · ${reason}`, `#/groups/${c.id}`);
    await notify(db, c.leader_id, '그룹리더 역할이 넘어갔습니다', `${c.title} · ${reason}`, `#/groups/${c.id}`);
    await audit(db, user.id, 'group.leader', 'challenges:' + c.id, { from: c.leader_id, to: next.user_id, reason });
    return { ok: true };
  });

  // ─────────────────────────────── 그룹리더 승인 ───────────────────────────────
  on('GET', '/admin/leaders', async ({ db, user, query }) => {
    requireStaff(user);
    const view = ['pending', 'decided'].includes(query.view) ? query.view : 'pending';
    const apps = await all(db, `SELECT a.*, u.nickname, u.name, u.email, u.level, u.interests, u.bio, u.created_at AS joined_at, u.can_lead,
        (SELECT COUNT(*) FROM badges b WHERE b.user_id = u.id AND b.code = 'completion' AND b.revoked_at IS NULL) AS completions,
        (SELECT COUNT(*) FROM registrations r WHERE r.user_id = u.id AND r.status = 'attended') AS events_attended,
        (SELECT COUNT(*) FROM session_attendance s WHERE s.user_id = u.id AND s.status IN ('present','late')) AS sessions_attended,
        (SELECT COUNT(*) FROM group_logs l WHERE l.user_id = u.id AND l.deleted_at IS NULL) AS logs
      FROM leader_applications a JOIN users u ON u.id = a.user_id WHERE ${view === 'pending' ? "a.status = 'pending'" : "a.status <> 'pending'"} ORDER BY a.created_at ${view === 'pending' ? 'ASC' : 'DESC'} LIMIT 200`);
    const leaders = await all(db, `SELECT u.id, u.nickname, u.level, u.leader_since,
        (SELECT COUNT(*) FROM challenges c WHERE c.leader_id = u.id AND c.stage IN ('recruiting','active')) AS running,
        (SELECT COUNT(*) FROM challenges c WHERE c.leader_id = u.id AND c.stage = 'closed') AS closed,
        (SELECT COUNT(*) FROM challenges c WHERE c.leader_id = u.id) AS total
      FROM users u WHERE u.can_lead = 1 AND u.status = 'active' ORDER BY u.leader_since DESC`);
    return { view, applications: apps.map(a => ({ ...a, form: parseJ(a.form, {}) })), leaders };
  });
  on('POST', '/admin/leader-applications/:id', async ({ db, request, user, params }) => {
    requireStaff(user); const b = await readJson(request);
    const a = await one(db, 'SELECT * FROM leader_applications WHERE id = ?', params.id); if (!a) throw notfound();
    if (a.status !== 'pending') throw bad('이미 처리한 신청입니다');
    if (!['approve', 'reject'].includes(b.decision)) throw bad('decision은 approve 또는 reject');
    const note = str(b.note, 1000);
    if (b.decision === 'reject' && !note) throw bad('반려 사유를 적어 주세요. 신청자에게 그대로 전달됩니다');
    await run(db, "UPDATE leader_applications SET status = ?, note = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?", b.decision === 'approve' ? 'approved' : 'rejected', note, user.id, a.id);
    if (b.decision === 'approve') {
      await run(db, "UPDATE users SET can_lead = 1, leader_since = COALESCE(leader_since, datetime('now')) WHERE id = ?", a.user_id);
      await notify(db, a.user_id, '그룹리더로 승인되었습니다', (note ? note + ' ' : '') + '이제 언제든 학습그룹이나 도전그룹을 만들 수 있습니다.', '#/groups/new');
    } else await notify(db, a.user_id, '그룹리더 신청 결과', note, '#/me/leader');
    await audit(db, user.id, 'leader.' + b.decision, 'leader_applications:' + a.id, { user_id: a.user_id, note });
    return { ok: true };
  });
  on('POST', '/admin/users/:id/leader', async ({ db, request, user, params }) => {
    requireStaff(user); const b = await readJson(request);
    const t = await one(db, 'SELECT id, nickname, can_lead FROM users WHERE id = ?', params.id); if (!t) throw notfound();
    const reason = str(b.reason, 500);
    if (b.on) {
      await run(db, "UPDATE users SET can_lead = 1, leader_since = COALESCE(leader_since, datetime('now')) WHERE id = ?", t.id);
      await run(db, "UPDATE leader_applications SET status = 'approved', note = COALESCE(note, ?), decided_by = ?, decided_at = datetime('now') WHERE user_id = ? AND status = 'pending'", reason, user.id, t.id);
      await notify(db, t.id, '그룹리더로 승인되었습니다', (reason ? reason + ' ' : '') + '이제 언제든 그룹을 만들 수 있습니다.', '#/groups/new');
    } else {
      if (!reason) throw bad('그룹리더 자격을 거두는 사유를 적어 주세요');
      const running = await one(db, "SELECT title FROM challenges WHERE leader_id = ? AND stage IN ('recruiting','active') LIMIT 1", t.id);
      if (running) throw bad(`이끄는 그룹(${running.title})이 진행 중입니다. 그룹리더를 먼저 바꾸거나 그룹을 종료해 주세요`);
      await run(db, 'UPDATE users SET can_lead = 0 WHERE id = ?', t.id);
      await notify(db, t.id, '그룹리더 자격이 해제되었습니다', reason, '#/me/leader');
    }
    await audit(db, user.id, b.on ? 'leader.grant' : 'leader.revoke', 'users:' + t.id, { reason });
    return { ok: true };
  });

  // 매출 등 성과 기록 확인 대기 목록
  on('GET', '/admin/results', async ({ db, user, query }) => {
    requireStaff(user);
    const pending = query.view !== 'all';
    const rows = await all(db, `SELECT r.*, u.nickname, c.title AS group_title, c.type AS group_type FROM group_results r JOIN users u ON u.id = r.user_id JOIN challenges c ON c.id = r.challenge_id
      WHERE r.deleted_at IS NULL ${pending ? "AND r.metric = 'revenue' AND r.verified_at IS NULL" : ''} ORDER BY r.created_at DESC LIMIT 200`);
    return rows.map(r => ({ ...r, metric_name: GOAL_METRICS[r.metric]?.[0] || r.metric, unit: GOAL_METRICS[r.metric]?.[1] || '' }));
  });

  // ─────────────────────────────── 단체 알림 ───────────────────────────────
  const segOf = q => ({ type: q.type || q.segment || 'all', level: q.level, challenge_id: q.challenge_id });
  on('GET', '/admin/broadcast/preview', async ({ db, user, query }) => {
    requireStaff(user);
    return { count: (await segmentUsers(db, segOf(query))).length };
  });
  on('GET', '/admin/broadcasts', async ({ db, user }) => {
    requireStaff(user);
    const rows = await all(db, 'SELECT b.*, u.nickname AS author FROM broadcasts b LEFT JOIN users u ON u.id = b.author_id ORDER BY b.created_at DESC LIMIT 100');
    return rows.map(r => ({ ...r, segment: parseJ(r.segment, {}) }));
  });
  on('POST', '/admin/broadcast', async ({ db, request, user }) => {
    requireStaff(user); const b = await readJson(request);
    const title = str(b.title, 100); if (!title) throw bad('제목을 적어 주세요');
    const body = str(b.body, 2000); const link = str(b.link, 300);
    if (link && !/^(#\/|\/|https:\/\/)/.test(link)) throw bad('링크는 #/ 또는 / 또는 https:// 로 시작해야 합니다');
    const seg = segOf(b);
    const users = await segmentUsers(db, seg);
    if (!users.length) throw bad('받을 사람이 없습니다');
    await batchRun(db, users.map(u => db.prepare('INSERT INTO notifications (user_id, title, body, link) VALUES (?,?,?,?)').bind(u.id, title, body, link)));
    let postId = null;
    if (b.post_notice) postId = await insert(db, "INSERT INTO posts (author_id, board, title, body) VALUES (?, 'notice', ?, ?)", user.id, title, body || title);
    const id = await insert(db, 'INSERT INTO broadcasts (author_id, segment, title, body, link, recipients, post_id) VALUES (?,?,?,?,?,?,?)', user.id, J(seg), title, body, link, users.length, postId);
    await audit(db, user.id, 'broadcast.send', 'broadcasts:' + id, { recipients: users.length, segment: seg });
    return { ok: true, recipients: users.length, post_id: postId };
  });

  // ─────────────────────────────── 커뮤니티 관리 ───────────────────────────────
  on('GET', '/admin/community', async ({ db, user, query }) => {
    requireStaff(user);
    const view = ['reported', 'hidden', 'recent'].includes(query.view) ? query.view : 'reported';
    const where = { reported: 'p.reported > 0 AND p.hidden = 0', hidden: 'p.hidden = 1', recent: '1 = 1' }[view];
    const posts = await all(db, `SELECT p.id, p.board, p.title, p.body, p.reported, p.hidden, p.helpful_count, p.created_at, u.id AS author_id, u.nickname, u.level,
      (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) AS comments FROM posts p JOIN users u ON u.id = p.author_id WHERE ${where} ORDER BY p.created_at DESC LIMIT 100`);
    const comments = await all(db, `SELECT cm.id, cm.post_id, cm.body, cm.hidden, cm.created_at, u.id AS author_id, u.nickname, p.title AS post_title FROM comments cm JOIN users u ON u.id = cm.author_id JOIN posts p ON p.id = cm.post_id
      WHERE ${view === 'hidden' ? 'cm.hidden = 1' : '1 = 1'} ORDER BY cm.created_at DESC LIMIT 60`);
    const counts = { reported: (await one(db, 'SELECT COUNT(*) AS c FROM posts WHERE reported > 0 AND hidden = 0'))?.c || 0, hidden: ((await one(db, 'SELECT COUNT(*) AS c FROM posts WHERE hidden = 1'))?.c || 0) + ((await one(db, 'SELECT COUNT(*) AS c FROM comments WHERE hidden = 1'))?.c || 0) };
    return { view, posts, comments, counts };
  });
  on('POST', '/admin/posts/:id', async ({ db, request, user, params }) => {
    requireStaff(user); const b = await readJson(request);
    const p = await one(db, 'SELECT * FROM posts WHERE id = ?', params.id); if (!p) throw notfound();
    if (b.hidden !== undefined) await run(db, 'UPDATE posts SET hidden = ? WHERE id = ?', b.hidden ? 1 : 0, p.id);
    if (b.clear_reports) await run(db, 'UPDATE posts SET reported = 0 WHERE id = ?', p.id);
    if (b.hidden && b.notify_author) await notify(db, p.author_id, '게시물이 숨김 처리됐습니다', `「${p.title}」 · ${str(b.reason, 300) || '커뮤니티 규범 위반'}`, '#/community');
    await audit(db, user.id, b.hidden ? 'post.hide' : 'post.update', 'posts:' + p.id, { reason: b.reason, clear_reports: !!b.clear_reports });
    return { ok: true };
  });
  on('POST', '/admin/comments/:id', async ({ db, request, user, params }) => {
    requireStaff(user); const b = await readJson(request);
    const cm = await one(db, 'SELECT * FROM comments WHERE id = ?', params.id); if (!cm) throw notfound();
    await run(db, 'UPDATE comments SET hidden = ? WHERE id = ?', b.hidden ? 1 : 0, cm.id);
    await audit(db, user.id, b.hidden ? 'comment.hide' : 'comment.show', 'comments:' + cm.id, { reason: b.reason });
    return { ok: true };
  });

  // ─────────────────────────────── 일정·출석 ───────────────────────────────
  on('GET', '/admin/events', async ({ db, user, query }) => {
    requireStaff(user);
    const past = query.when === 'past';
    return all(db, `SELECT e.*, (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS registered,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'attended') AS attended
      FROM events e WHERE e.starts_at ${past ? '<' : '>='} datetime('now','+9 hours','-1 day') ORDER BY e.starts_at ${past ? 'DESC' : 'ASC'} LIMIT 200`);
  });
  on('GET', '/admin/events/:id', async ({ db, user, params }) => {
    requireStaff(user);
    const e = await one(db, 'SELECT * FROM events WHERE id = ?', params.id); if (!e) throw notfound();
    const regs = await all(db, 'SELECT r.*, u.nickname, u.level, u.email FROM registrations r JOIN users u ON u.id = r.user_id WHERE r.event_id = ? ORDER BY r.status, r.created_at', e.id);
    const presentations = await all(db, 'SELECT p.*, u.nickname, c.title AS group_title FROM event_presentations p JOIN users u ON u.id = p.user_id LEFT JOIN challenges c ON c.id = p.challenge_id WHERE p.event_id = ? ORDER BY p.created_at', e.id);
    return { event: { ...e, type_name: EVENT_TYPES[e.type] || e.type }, registrations: regs, presentations };
  });
  on('PUT', '/admin/events/:id', async ({ db, request, user, params }) => {
    requireStaff(user); const b = await readJson(request);
    const e = await one(db, 'SELECT * FROM events WHERE id = ?', params.id); if (!e) throw notfound();
    const v = {
      title: b.title !== undefined ? str(b.title, 100) || e.title : e.title,
      starts_at: b.starts_at ? String(b.starts_at).replace('T', ' ').slice(0, 19) : e.starts_at,
      location: b.location !== undefined ? str(b.location, 200) : e.location,
      capacity: b.capacity === '' || b.capacity === null ? null : b.capacity !== undefined ? intv(b.capacity, '정원', { min: 1 }) : e.capacity,
      min_level: LEVELS.includes(b.min_level) ? b.min_level : e.min_level,
      description: b.description !== undefined ? str(b.description, 2000) : e.description,
      attendance_code: b.attendance_code ? String(b.attendance_code).trim().toUpperCase().slice(0, 20) : e.attendance_code,
      status: ['scheduled', 'cancelled'].includes(b.status) ? b.status : (e.status || 'scheduled'),
      type: EVENT_TYPES[b.type] ? b.type : e.type,
      mode: ['offline', 'online', 'hybrid'].includes(b.mode) ? b.mode : (e.mode || 'offline'),
      online_url: b.online_url !== undefined ? str(b.online_url, 300) : e.online_url,
      topics: b.topics !== undefined ? ((Array.isArray(b.topics) ? b.topics : String(b.topics || '').split(',')).map(t => String(t).trim()).filter(t => EVENT_TOPICS[t]).join(',') || null) : e.topics,
    };
    if (v.online_url && !/^https?:\/\/\S+$/i.test(v.online_url)) throw bad('온라인 참여 링크는 http로 시작해야 합니다');
    if (v.starts_at.length === 16) v.starts_at += ':00';
    await run(db, 'UPDATE events SET title = ?, starts_at = ?, location = ?, capacity = ?, min_level = ?, description = ?, attendance_code = ?, status = ?, type = ?, mode = ?, online_url = ?, topics = ? WHERE id = ?',
      v.title, v.starts_at, v.location, v.capacity, v.min_level, v.description, v.attendance_code, v.status, v.type, v.mode, v.online_url, v.topics, e.id);
    const regs = await all(db, "SELECT user_id FROM registrations WHERE event_id = ? AND status <> 'cancelled'", e.id);
    if (v.status === 'cancelled' && (e.status || 'scheduled') !== 'cancelled') for (const r of regs) await notify(db, r.user_id, '신청한 일정이 취소됐습니다', `${v.title} · ${str(b.reason, 300) || '운영본부 사정'}`, '#/events');
    else if (b.notify_change && (v.starts_at !== e.starts_at || v.location !== e.location)) for (const r of regs) await notify(db, r.user_id, '신청한 일정이 바뀌었습니다', `${v.title} · ${v.starts_at.slice(0, 16)} · ${v.location || ''}`, '#/events');
    await audit(db, user.id, v.status === 'cancelled' ? 'event.cancel' : 'event.update', 'events:' + e.id, b);
    return { ok: true };
  });
  on('POST', '/admin/events/:id/attendance', async ({ db, settings, request, user, params }) => {
    requireStaff(user); const b = await readJson(request);
    const e = await one(db, 'SELECT * FROM events WHERE id = ?', params.id); if (!e) throw notfound();
    const uid = Number(b.user_id); const prev = await one(db, 'SELECT * FROM registrations WHERE event_id = ? AND user_id = ?', e.id, uid);
    if (b.attended) {
      if (!(await one(db, 'SELECT id FROM users WHERE id = ?', uid))) throw notfound('회원을 찾을 수 없습니다');
      await run(db, "INSERT INTO registrations (event_id, user_id, status, attended_at) VALUES (?,?,'attended',datetime('now')) ON CONFLICT(event_id, user_id) DO UPDATE SET status = 'attended', attended_at = datetime('now')", e.id, uid);
      if (!prev || prev.status !== 'attended') { await addPoints(db, settings, uid, 'event_attend', 'event', e.id); await maybeAutoPromote(db, settings, uid); }
    } else if (prev) {
      await run(db, "UPDATE registrations SET status = 'registered', attended_at = NULL WHERE id = ?", prev.id);
    }
    await audit(db, user.id, b.attended ? 'event.attend.mark' : 'event.attend.unmark', `events:${e.id}/users:${uid}`);
    return { ok: true };
  });

  // ─────────────────────────────── 감사 로그 ───────────────────────────────
  on('GET', '/admin/audit', async ({ db, user, query }) => {
    requireStaff(user);
    const where = []; const p = [];
    if (query.actor) { where.push('a.actor_id = ?'); p.push(Number(query.actor)); }
    if (query.action) { where.push('a.action LIKE ?'); p.push(String(query.action) + '%'); }
    if (query.q) { where.push('(a.target LIKE ? OR a.detail LIKE ?)'); p.push(`%${query.q}%`, `%${query.q}%`); }
    if (query.before) { where.push('a.id < ?'); p.push(Number(query.before)); }
    const limit = Math.min(Number(query.limit || 100), 300);
    const rows = await all(db, `SELECT a.*, u.nickname FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC LIMIT ?`, ...p, limit);
    const actors = await all(db, 'SELECT DISTINCT u.id, u.nickname FROM audit_logs a JOIN users u ON u.id = a.actor_id ORDER BY u.nickname');
    return { rows, next_before: rows.length === limit ? rows[rows.length - 1].id : null, actors };
  });

  // ─────────────────────────────── 규칙 기본값 되돌리기 ───────────────────────────────
  on('DELETE', '/admin/settings/:key', async ({ db, user, params }) => {
    await requireOwner(db, user);
    if (!(params.key in DEFAULT_SETTINGS)) throw bad('없는 설정 키입니다');
    await run(db, 'DELETE FROM settings WHERE key = ?', params.key);
    await audit(db, user.id, 'settings.reset', 'settings:' + params.key);
    return { ok: true };
  });

  // ─────────────────────────────── 시스템·백업 ───────────────────────────────
  const BACKUP_SKIP = ['sessions', 'login_attempts', 'view_logs', 'analytics_events'];
  on('GET', '/admin/system', async ({ db, user }) => {
    requireStaff(user);
    const tables = (await all(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name")).map(r => r.name);
    const counts = [];
    for (const t of tables) counts.push({ name: t, rows: (await one(db, `SELECT COUNT(*) AS c FROM "${t}"`))?.c || 0 });
    return { is_owner: await isOwner(db, user), tables: counts, migrations: await all(db, 'SELECT * FROM schema_migrations ORDER BY id'), settings_overrides: (await one(db, 'SELECT COUNT(*) AS c FROM settings'))?.c || 0 };
  });
  on('GET', '/admin/backup', async ({ db, user }) => {
    await requireOwner(db, user);
    const tables = (await all(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name")).map(r => r.name).filter(t => !BACKUP_SKIP.includes(t));
    const out = { exported_at: new Date().toISOString(), note: '비밀번호 해시와 로그인 세션은 포함하지 않습니다', tables: {} };
    for (const t of tables) {
      const rows = await all(db, `SELECT * FROM "${t}"`);
      out.tables[t] = t === 'users' ? rows.map(({ password_hash, ...r }) => r) : rows;
    }
    await audit(db, user.id, 'backup.download', 'all', { tables: tables.length });
    return new Response(JSON.stringify(out, null, 1), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="machal-backup-${kstDate()}.json"`, 'cache-control': 'no-store' } });
  });
}
