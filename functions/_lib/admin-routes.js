// 운영본부 콘솔 API (v1.2) — /api/admin/* 의 조회·관리 기능
// 승인 큐(가입·심사·합의서·정산·페이퍼·승급·이의)의 '처리' 엔드포인트는 [[path]].js 에 있고,
// 여기에는 운영 현황, 회원·그룹 모니터링, 지급, 재원, 알림, 커뮤니티, 일정, 감사, 백업을 모았다.
import {
  bad, forbid, notfound, readJson, parseJ, J, one, all, run, insert, getSettings,
  requireStaff, notify, audit, str, must, intv, addPoints, maybeAutoPromote, inviteCode,
} from './util.js';
import { LEVELS, LEVEL_NAMES, FIELDS, BADGE_NAMES, ROLE_WEIGHTS, DEFAULT_SETTINGS, levelIndex } from './rules.js';

// ───────────────────────── 스키마 보강 (기존 표에 열 추가) ─────────────────────────
export const MIGRATIONS = [
  ['2026-11-14-rounds-recruit-until', 'ALTER TABLE rounds ADD COLUMN recruit_until TEXT'],
  ['2026-11-14-events-status', "ALTER TABLE events ADD COLUMN status TEXT NOT NULL DEFAULT 'scheduled'"],
  ['2026-11-14-comments-hidden', 'ALTER TABLE comments ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0'],
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

const HQ_CATEGORIES = { casebook: '사례집·쇼케이스', mentors: '강사비·오피스아워', website: '홈페이지 운영', advance: '다음 라운드 선지원', other: '기타' };
const quarterSql = col => `strftime('%Y', ${col}) || '-Q' || ((CAST(strftime('%m', ${col}) AS INTEGER) + 2) / 3)`;
const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.floor((Date.parse(b) - Date.parse(a)) / 86400e3);

function mondayOf(dateStr) { const d = new Date(dateStr + 'T00:00:00Z'); const wd = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - wd); return d.toISOString().slice(0, 10); }
function addDays(dateStr, n) { const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// 단체 알림 대상
async function segmentUsers(db, seg) {
  const t = seg.type;
  if (t === 'all') return all(db, "SELECT id FROM users WHERE status = 'active'");
  if (t === 'level') { const lv = LEVELS.includes(seg.level) ? seg.level : 'L1'; const list = LEVELS.slice(levelIndex(lv)); return all(db, `SELECT id FROM users WHERE status = 'active' AND level IN (${list.map(() => '?').join(',')})`, ...list); }
  if ((t === 'challenge' && !Number(seg.challenge_id)) || (t === 'round' && !Number(seg.round_id))) throw bad('대상 챌린지나 라운드를 골라 주세요');
  if (t === 'challenge') return all(db, "SELECT gm.user_id AS id FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.challenge_id = ? AND gm.status = 'active' AND u.status = 'active'", Number(seg.challenge_id));
  if (t === 'round') return all(db, "SELECT DISTINCT gm.user_id AS id FROM group_members gm JOIN challenges c ON c.id = gm.challenge_id JOIN users u ON u.id = gm.user_id WHERE c.round_id = ? AND gm.status = 'active' AND u.status = 'active'", Number(seg.round_id));
  if (t === 'staff') return all(db, "SELECT id FROM users WHERE role = 'staff' AND status = 'active'");
  if (t === 'leaders') return all(db, "SELECT DISTINCT c.leader_id AS id FROM challenges c JOIN users u ON u.id = c.leader_id WHERE c.stage IN ('recruiting','agreement','active','settling') AND u.status = 'active'");
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
      challenges: await c("SELECT COUNT(*) AS c FROM challenges WHERE stage = 'review'"),
      agreements: await c("SELECT COUNT(*) AS c FROM agreements WHERE status = 'signed'"),
      settlements: await c("SELECT COUNT(*) AS c FROM settlements WHERE status IN ('confirming','disputed')"),
      papers: await c("SELECT COUNT(*) AS c FROM papers WHERE status = 'review'"),
      promotions: await c("SELECT COUNT(*) AS c FROM promotion_requests WHERE status = 'pending'"),
      disputes: await c("SELECT COUNT(*) AS c FROM disputes WHERE status IN ('open','mediating')"),
    };
    // 처리 기한(MC-05): 가입 3일, 페이퍼 5일, 심사·승급·이의·정산 7일
    const overdue = {
      applications: await c("SELECT COUNT(*) AS c FROM applications WHERE status = 'pending' AND created_at < datetime('now','-3 days')"),
      challenges: await c("SELECT COUNT(*) AS c FROM challenges WHERE stage = 'review' AND updated_at < datetime('now','-7 days')"),
      agreements: await c("SELECT COUNT(*) AS c FROM agreements WHERE status = 'signed' AND created_at < datetime('now','-3 days')"),
      settlements: await c("SELECT COUNT(*) AS c FROM settlements WHERE status IN ('confirming','disputed') AND created_at < datetime('now','-7 days')"),
      papers: await c("SELECT COUNT(*) AS c FROM papers WHERE status = 'review' AND submitted_at < datetime('now','-5 days')"),
      promotions: await c("SELECT COUNT(*) AS c FROM promotion_requests WHERE status = 'pending' AND created_at < datetime('now','-7 days')"),
      disputes: await c("SELECT COUNT(*) AS c FROM disputes WHERE status IN ('open','mediating') AND created_at < datetime('now','-7 days')"),
    };

    const expected = await c("SELECT COUNT(*) AS c FROM group_members gm JOIN challenges ch ON ch.id = gm.challenge_id JOIN checkins ci ON ci.challenge_id = ch.id WHERE gm.status = 'active' AND ch.stage IN ('active','settling') AND ci.created_at >= datetime('now','-7 days')");
    const submitted = await c("SELECT COUNT(*) AS c FROM checkin_entries e JOIN checkins ci ON ci.id = e.checkin_id WHERE ci.created_at >= datetime('now','-7 days')");
    const kpi = {
      north_star: await c(`SELECT COUNT(DISTINCT b.user_id) AS c FROM badges b WHERE b.code = 'completion' AND b.revoked_at IS NULL AND (
        EXISTS (SELECT 1 FROM badges f WHERE f.user_id = b.user_id AND f.code = 'first_sale' AND f.revoked_at IS NULL)
        OR EXISTS (SELECT 1 FROM group_members gm JOIN challenges ch ON ch.id = gm.challenge_id WHERE gm.user_id = b.user_id AND gm.status IN ('active','left') AND ch.public_numbers LIKE '%"has_sales":true%'))`),
      members: await c("SELECT COUNT(*) AS c FROM users WHERE status = 'active' AND role = 'member' AND level <> 'L0'"),
      active_7d: await c("SELECT COUNT(*) AS c FROM users WHERE status = 'active' AND role = 'member' AND level <> 'L0' AND last_seen_at >= datetime('now','-7 days')"),
      active_groups: await c("SELECT COUNT(*) AS c FROM challenges WHERE stage IN ('active','settling') AND type <> 'solo'"),
      weekly_checkin_rate: expected ? Math.round(submitted / expected * 100) : null,
      first_sales: await c("SELECT COUNT(DISTINCT user_id) AS c FROM badges WHERE code = 'first_sale' AND revoked_at IS NULL"),
      completions: await c("SELECT COUNT(*) AS c FROM badges WHERE code = 'completion' AND revoked_at IS NULL"),
      papers_public: await c("SELECT COUNT(*) AS c FROM papers WHERE status IN ('approved','published') AND publish_scope = 'public'"),
    };
    const funnel = [
      ['가입 신청', await c("SELECT COUNT(*) AS c FROM applications WHERE status <> 'purged'")],
      ['계정 생성', await c("SELECT COUNT(*) AS c FROM users WHERE role = 'member'")],
      ['오리엔테이션', await c("SELECT COUNT(*) AS c FROM users WHERE role = 'member' AND level <> 'L0'")],
      ['메이커 이상', await c("SELECT COUNT(*) AS c FROM users WHERE role = 'member' AND level IN ('L2','L3','L4','L5')")],
      ['그룹 참여', await c("SELECT COUNT(DISTINCT gm.user_id) AS c FROM group_members gm JOIN challenges ch ON ch.id = gm.challenge_id JOIN users u ON u.id = gm.user_id WHERE ch.type <> 'solo' AND gm.status IN ('active','left') AND u.role = 'member'")],
      ['라운드 완주', await c("SELECT COUNT(DISTINCT user_id) AS c FROM badges WHERE code = 'completion' AND revoked_at IS NULL")],
      ['첫 매출', kpi.first_sales],
    ];

    // 최근 8주 추이 (한국 시간, 월요일 시작)
    const thisMon = mondayOf(today);
    const weeks = Array.from({ length: 8 }, (_, i) => addDays(thisMon, (i - 7) * 7));
    const weekCounts = async (table, col) => {
      const rows = await all(db, `SELECT date(datetime(${col}, '+9 hours'), '-6 days', 'weekday 1') AS wk, COUNT(*) AS c FROM ${table} WHERE datetime(${col}, '+9 hours') >= ? GROUP BY wk`, weeks[0] + ' 00:00:00');
      const m = Object.fromEntries(rows.map(r => [r.wk, r.c]));
      return weeks.map(w => m[w] || 0);
    };
    const trends = { weeks, applications: await weekCounts('applications', 'created_at'), joins: await weekCounts('users', 'created_at'), checkins: await weekCounts('checkin_entries', 'submitted_at'), done_logs: await weekCounts('done_logs', 'created_at') };

    const risks = await computeRisks(db, settings, today);

    const roundRow = await one(db, "SELECT * FROM rounds WHERE status IN ('open','active') ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, start_date DESC LIMIT 1");
    const round = roundRow ? { ...roundRow, week: today >= roundRow.start_date ? Math.min(12, Math.floor(daysBetween(roundRow.start_date, today) / 7) + 1) : 0, days_to_start: today < roundRow.start_date ? daysBetween(today, roundRow.start_date) : 0 } : null;
    const pay = await one(db, "SELECT COUNT(*) AS n, COALESCE(SUM(net),0) AS s FROM settlement_payouts WHERE status = 'pending'");
    const byLevel = await all(db, "SELECT level, COUNT(*) AS c FROM users WHERE status = 'active' GROUP BY level");

    return {
      me: { is_owner: await isOwner(db, user) },
      queues, overdue, kpi, funnel, trends, risks, round,
      payouts: { pending_count: pay?.n || 0, pending_sum: pay?.s || 0 },
      levels: byLevel,
      // v1.1 호환
      active_groups: kpi.active_groups, weekly_checkin_rate: kpi.weekly_checkin_rate, first_sales: kpi.first_sales, completions: kpi.completions,
    };
  });

  async function computeRisks(db, settings, today) {
    const risks = [];
    const actives = await all(db, "SELECT c.id, c.title, c.updated_at, (SELECT COUNT(*) FROM group_members gm WHERE gm.challenge_id = c.id AND gm.status = 'active') AS members FROM challenges c WHERE c.stage = 'active'");
    for (const ch of actives) {
      const cks = await all(db, 'SELECT id, week_no, created_at FROM checkins WHERE challenge_id = ? ORDER BY week_no DESC LIMIT 2', ch.id);
      const link = `#/admin/groups/${ch.id}`;
      if (!cks.length) {
        if (ch.updated_at < new Date(Date.now() - 10 * 86400e3).toISOString().replace('T', ' ').slice(0, 19)) risks.push({ level: 'high', kind: 'stalled', title: ch.title, detail: '시작한 지 10일이 넘었는데 체크인이 한 번도 열리지 않았습니다', link });
        continue;
      }
      const last = cks[0];
      const ageDays = (Date.now() - Date.parse(last.created_at.replace(' ', 'T') + 'Z')) / 86400e3;
      if (ageDays > 10) risks.push({ level: 'high', kind: 'stalled', title: ch.title, detail: `마지막 체크인(${last.week_no}주차)이 ${Math.floor(ageDays)}일 전입니다`, link });
      else if (ageDays > 3 && ch.members) {
        const subs = (await one(db, 'SELECT COUNT(*) AS c FROM checkin_entries WHERE checkin_id = ?', last.id))?.c || 0;
        if (subs / ch.members < 0.5) risks.push({ level: 'mid', kind: 'low_checkin', title: ch.title, detail: `${last.week_no}주차 체크인 제출 ${subs}/${ch.members}명`, link });
      }
      if (cks.length === 2) {
        const absent = await all(db, `SELECT u.id, u.nickname FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.challenge_id = ? AND gm.status = 'active' AND (gm.joined_at IS NULL OR gm.joined_at <= ?)
          AND NOT EXISTS (SELECT 1 FROM checkin_entries e WHERE e.user_id = gm.user_id AND e.checkin_id IN (?, ?))`, ch.id, cks[1].created_at, cks[0].id, cks[1].id);
        for (const a of absent) risks.push({ level: 'mid', kind: 'absence', title: `${a.nickname} · ${ch.title}`, detail: '2주 연속 체크인 미제출 — 다음 주도 없으면 무단 이탈 기준(3주)에 해당합니다', link: `#/admin/users/${a.id}` });
      }
    }
    for (const m of await all(db, "SELECT m.challenge_id, m.due_date, c.title FROM milestones m JOIN challenges c ON c.id = m.challenge_id WHERE c.stage = 'active' AND m.code = 'first_public' AND m.done_at IS NULL AND m.due_date < ?", today)) {
      risks.push({ level: 'high', kind: 'first_public', title: m.title, detail: `첫 공개 마감(${m.due_date})이 지났습니다. 8주차까지 공개가 없으면 계속 여부를 함께 정합니다`, link: `#/admin/groups/${m.challenge_id}` });
    }
    const gap = settings.share_alert_gap || 0.2;
    for (const g of await all(db, "SELECT gm.challenge_id, gm.planned_share, gm.actual_share, u.nickname, c.title FROM group_members gm JOIN challenges c ON c.id = gm.challenge_id JOIN users u ON u.id = gm.user_id WHERE c.stage IN ('active','settling') AND gm.planned_share IS NOT NULL AND gm.actual_share IS NOT NULL")) {
      if (Math.abs(g.actual_share - g.planned_share) >= gap - 1e-9) risks.push({ level: 'mid', kind: 'share_gap', title: `${g.nickname} · ${g.title}`, detail: `예정 기여율 ${Math.round(g.planned_share * 100)}% → 실제 ${Math.round(g.actual_share * 100)}%. 근거를 확인해 주세요`, link: `#/admin/groups/${g.challenge_id}` });
    }
    for (const p of await all(db, "SELECT s.id, c.title, COUNT(*) AS n, SUM(p.net) AS amt FROM settlement_payouts p JOIN settlements s ON s.id = p.settlement_id JOIN challenges c ON c.id = s.challenge_id WHERE p.status = 'pending' AND s.reviewed_at IS NOT NULL AND s.reviewed_at < datetime('now','-7 days') GROUP BY s.id")) {
      risks.push({ level: 'high', kind: 'payout_late', title: p.title, detail: `검수 후 7일이 지났는데 지급 대기 ${p.n}건(${Number(p.amt).toLocaleString('ko-KR')}원)이 남아 있습니다`, link: '#/admin/payouts' });
    }
    return risks.sort((a, b) => (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1)).slice(0, 30);
  }

  // 사이드 메뉴 숫자 (가벼운 조회)
  on('GET', '/admin/counts', async ({ db, user }) => {
    requireStaff(user);
    const row = await one(db, `SELECT
      (SELECT COUNT(*) FROM applications WHERE status = 'pending') AS applications,
      (SELECT COUNT(*) FROM challenges WHERE stage = 'review') AS challenges,
      (SELECT COUNT(*) FROM agreements WHERE status = 'signed') AS agreements,
      (SELECT COUNT(*) FROM settlements WHERE status IN ('confirming','disputed')) AS settlements,
      (SELECT COUNT(*) FROM papers WHERE status = 'review') AS papers,
      (SELECT COUNT(*) FROM promotion_requests WHERE status = 'pending') AS promotions,
      (SELECT COUNT(*) FROM disputes WHERE status IN ('open','mediating')) AS disputes,
      (SELECT COUNT(*) FROM posts WHERE reported > 0 AND hidden = 0) AS community,
      (SELECT COUNT(*) FROM settlement_payouts WHERE status = 'pending') AS payouts`);
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
    const order = { points: 'points DESC', seen: 'u.last_seen_at IS NULL, u.last_seen_at DESC', name: 'u.nickname', level: "u.level DESC, u.created_at DESC" }[query.sort] || 'u.created_at DESC';
    const per = 50; const page = Math.max(1, Number(query.page || 1));
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = (await one(db, `SELECT COUNT(*) AS c FROM users u ${w}`, ...p))?.c || 0;
    const rows = await all(db, `SELECT u.id, u.email, u.name, u.nickname, u.level, u.role, u.status, u.has_business, u.interests, u.created_at, u.last_seen_at,
      (SELECT COALESCE(SUM(points),0) FROM points_ledger pl WHERE pl.user_id = u.id) AS points,
      (SELECT COUNT(*) FROM badges b WHERE b.user_id = u.id AND b.revoked_at IS NULL) AS badge_count,
      (SELECT COUNT(*) FROM group_members gm JOIN challenges c ON c.id = gm.challenge_id WHERE gm.user_id = u.id AND gm.status = 'active' AND c.stage IN ('recruiting','agreement','active','settling')) AS active_groups
      FROM users u ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, ...p, per, (page - 1) * per);
    return { rows, total, page, per };
  });

  on('GET', '/admin/users/:id', async ({ db, settings, user, params }) => {
    requireStaff(user);
    const u = await one(db, 'SELECT id, email, name, nickname, phone, level, role, status, has_business, interests, bio, onboarded, asset_diag, created_at, last_seen_at FROM users WHERE id = ?', params.id);
    if (!u) throw notfound();
    u.asset_diag = parseJ(u.asset_diag, null);
    const points = await all(db, 'SELECT action, SUM(points) AS pts, COUNT(*) AS n FROM points_ledger WHERE user_id = ? GROUP BY action ORDER BY pts DESC', u.id);
    const pointsTotal = points.reduce((s, r) => s + (r.pts || 0), 0);
    const badges = await all(db, 'SELECT b.*, g.nickname AS granted_by_name FROM badges b LEFT JOIN users g ON g.id = b.granted_by WHERE b.user_id = ? ORDER BY b.created_at', u.id);
    const levelHistory = await all(db, 'SELECT h.*, d.nickname AS decided_by_name FROM level_history h LEFT JOIN users d ON d.id = h.decided_by WHERE h.user_id = ? ORDER BY h.created_at DESC', u.id);
    const groups = await all(db, `SELECT c.id, c.title, c.stage, c.type, gm.role, gm.status, gm.planned_share, gm.actual_share, gm.joined_at, gm.left_at, gm.leave_type,
      (SELECT COUNT(*) FROM checkins ci WHERE ci.challenge_id = c.id AND (gm.joined_at IS NULL OR ci.created_at >= gm.joined_at)) AS checkins,
      (SELECT COUNT(*) FROM checkin_entries e JOIN checkins ci ON ci.id = e.checkin_id WHERE ci.challenge_id = c.id AND e.user_id = gm.user_id) AS submitted,
      (SELECT COALESCE(SUM(e.hours),0) FROM checkin_entries e JOIN checkins ci ON ci.id = e.checkin_id WHERE ci.challenge_id = c.id AND e.user_id = gm.user_id) AS hours,
      (SELECT COUNT(*) FROM done_logs d WHERE d.challenge_id = c.id AND d.user_id = gm.user_id AND d.confirmed_at IS NOT NULL AND d.cancelled_at IS NULL) AS done_confirmed
      FROM group_members gm JOIN challenges c ON c.id = gm.challenge_id WHERE gm.user_id = ? ORDER BY gm.created_at DESC`, u.id);
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
      points: { total: pointsTotal, by_action: points.map(r => ({ ...r, label: settings.points[r.action]?.label || r.action })) },
      badges: badges.map(b => ({ ...b, name: BADGE_NAMES[b.code] || b.code })), level_history: levelHistory, groups, events,
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
  on('GET', '/admin/groups', async ({ db, user, query }) => {
    requireStaff(user);
    const where = ["c.stage NOT IN ('rejected')"]; const p = [];
    const stageSets = { running: ['active', 'settling'], forming: ['proposed', 'review', 'recruiting', 'agreement'], done: ['closed', 'stopped'] };
    if (stageSets[query.view]) { where.push(`c.stage IN (${stageSets[query.view].map(() => '?').join(',')})`); p.push(...stageSets[query.view]); }
    if (query.round) { where.push('c.round_id = ?'); p.push(Number(query.round)); }
    if (['solo', 'group', 'official'].includes(query.type)) { where.push('c.type = ?'); p.push(query.type); }
    const rows = await all(db, `SELECT c.id, c.title, c.type, c.stage, c.field_code, c.round_id, c.updated_at, c.created_at, c.public_numbers, u.nickname AS leader, r.name AS round_name
      FROM challenges c JOIN users u ON u.id = c.leader_id LEFT JOIN rounds r ON r.id = c.round_id WHERE ${where.join(' AND ')} ORDER BY CASE c.stage WHEN 'active' THEN 0 WHEN 'settling' THEN 1 WHEN 'agreement' THEN 2 WHEN 'recruiting' THEN 3 WHEN 'review' THEN 4 ELSE 5 END, c.updated_at DESC LIMIT 300`, ...p);
    const map = async sql => Object.fromEntries((await all(db, sql)).map(r => [r.cid, r]));
    const members = await map("SELECT challenge_id AS cid, COUNT(*) AS n FROM group_members WHERE status = 'active' GROUP BY challenge_id");
    const cks = await map('SELECT challenge_id AS cid, COUNT(*) AS n, MAX(week_no) AS last_week, MAX(created_at) AS last_at FROM checkins GROUP BY challenge_id');
    const recent = await map(`SELECT ci.challenge_id AS cid, COUNT(DISTINCT ci.id) AS cks, COUNT(e.id) AS subs FROM checkins ci LEFT JOIN checkin_entries e ON e.checkin_id = ci.id
      WHERE ci.week_no >= (SELECT MAX(c2.week_no) - 1 FROM checkins c2 WHERE c2.challenge_id = ci.challenge_id) GROUP BY ci.challenge_id`);
    const money = await map("SELECT challenge_id AS cid, SUM(CASE WHEN kind = 'revenue' AND is_external = 1 THEN amount ELSE 0 END) AS revenue, SUM(CASE WHEN kind = 'expense' THEN amount ELSE 0 END) AS expenses FROM ledger_entries GROUP BY challenge_id");
    const ms = await map('SELECT challenge_id AS cid, COUNT(*) AS total, SUM(CASE WHEN done_at IS NOT NULL THEN 1 ELSE 0 END) AS done FROM milestones GROUP BY challenge_id');
    const act = await map(`SELECT cid, MAX(t) AS last FROM (
      SELECT ci.challenge_id AS cid, e.submitted_at AS t FROM checkin_entries e JOIN checkins ci ON ci.id = e.checkin_id
      UNION ALL SELECT challenge_id, created_at FROM ledger_entries UNION ALL SELECT challenge_id, created_at FROM done_logs) GROUP BY cid`);
    return rows.map(c => {
      const n = members[c.id]?.n || 0; const rc = recent[c.id];
      const rate = rc && rc.cks && n ? Math.round(rc.subs / (rc.cks * n) * 100) : null;
      const last = act[c.id]?.last || null;
      const idle = last ? Math.floor((Date.now() - Date.parse(last.replace(' ', 'T') + 'Z')) / 86400e3) : null;
      const health = c.stage !== 'active' ? 'na' : (rate == null || (idle != null && idle > 10)) ? 'bad' : rate < 60 || (idle != null && idle > 6) ? 'warn' : 'good';
      return { ...c, field_name: FIELDS[c.field_code], public_numbers: parseJ(c.public_numbers, null), members: n, checkins: cks[c.id]?.n || 0, last_week: cks[c.id]?.last_week || 0, checkin_rate: rate,
        revenue: money[c.id]?.revenue || 0, expenses: money[c.id]?.expenses || 0, milestones: { done: ms[c.id]?.done || 0, total: ms[c.id]?.total || 0 }, last_activity: last, idle_days: idle, health };
    });
  });

  on('GET', '/admin/groups/:id', async ({ db, user, params }) => {
    requireStaff(user);
    const c = await one(db, 'SELECT c.*, u.nickname AS leader, r.name AS round_name, r.start_date AS round_start FROM challenges c JOIN users u ON u.id = c.leader_id LEFT JOIN rounds r ON r.id = c.round_id WHERE c.id = ?', params.id);
    if (!c) throw notfound();
    const checkins = await all(db, 'SELECT ci.id, ci.week_no, ci.created_at, ci.due_date, (SELECT COUNT(*) FROM checkin_entries e WHERE e.checkin_id = ci.id) AS subs, (SELECT COALESCE(SUM(hours),0) FROM checkin_entries e WHERE e.checkin_id = ci.id) AS hours FROM checkins ci WHERE ci.challenge_id = ? ORDER BY ci.week_no', c.id);
    const members = await all(db, `SELECT gm.*, u.nickname, u.level, u.email, u.last_seen_at,
      (SELECT COUNT(*) FROM checkin_entries e JOIN checkins ci ON ci.id = e.checkin_id WHERE ci.challenge_id = gm.challenge_id AND e.user_id = gm.user_id) AS submitted,
      (SELECT COUNT(*) FROM checkins ci WHERE ci.challenge_id = gm.challenge_id AND (gm.joined_at IS NULL OR ci.created_at >= gm.joined_at)) AS expected,
      (SELECT MAX(e.submitted_at) FROM checkin_entries e JOIN checkins ci ON ci.id = e.checkin_id WHERE ci.challenge_id = gm.challenge_id AND e.user_id = gm.user_id) AS last_submitted,
      (SELECT COALESCE(SUM(e.hours),0) FROM checkin_entries e JOIN checkins ci ON ci.id = e.checkin_id WHERE ci.challenge_id = gm.challenge_id AND e.user_id = gm.user_id) AS hours,
      (SELECT COUNT(*) FROM done_logs d WHERE d.challenge_id = gm.challenge_id AND d.user_id = gm.user_id AND d.cancelled_at IS NULL) AS done_total,
      (SELECT COUNT(*) FROM done_logs d WHERE d.challenge_id = gm.challenge_id AND d.user_id = gm.user_id AND d.confirmed_at IS NOT NULL AND d.cancelled_at IS NULL) AS done_confirmed
      FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.challenge_id = ? ORDER BY CASE gm.role WHEN 'leader' THEN 0 ELSE 1 END, gm.status, gm.joined_at`, c.id);
    const milestones = await all(db, 'SELECT * FROM milestones WHERE challenge_id = ? ORDER BY due_date, id', c.id);
    const ledger = h.ledgerTotals(await all(db, 'SELECT * FROM ledger_entries WHERE challenge_id = ?', c.id));
    const ledgerCount = (await one(db, 'SELECT COUNT(*) AS c FROM ledger_entries WHERE challenge_id = ?', c.id))?.c || 0;
    const agreement = await one(db, 'SELECT id, version, status, approved_at, clauses FROM agreements WHERE challenge_id = ? ORDER BY version DESC LIMIT 1', c.id);
    const settlements = await all(db, 'SELECT id, status, period_start, period_end, created_at, reviewed_at FROM settlements WHERE challenge_id = ? ORDER BY id DESC', c.id);
    const paper = await one(db, 'SELECT id, status, publish_scope, submitted_at, published_at FROM papers WHERE challenge_id = ?', c.id);
    const history = await all(db, "SELECT a.action, a.detail, a.created_at, u.nickname FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id WHERE a.target = ? OR a.target LIKE ? ORDER BY a.created_at DESC LIMIT 30", 'challenges:' + c.id, `challenges:${c.id}/%`);
    return { challenge: { ...c, proposal: parseJ(c.proposal, {}), review: parseJ(c.review, null), public_numbers: parseJ(c.public_numbers, null), field_name: FIELDS[c.field_code] },
      checkins, members, milestones, ledger: { ...ledger, entries: ledgerCount }, agreement: agreement ? { ...agreement, clauses: parseJ(agreement.clauses, {}) } : null, settlements, paper, history, notes: await notesOf(db, 'challenge', c.id) };
  });

  // 운영본부의 단계 변경 (중단·종료·재개). 그룹장 중단과 달리 사유를 남긴다.
  on('POST', '/admin/groups/:id/stage', async ({ db, request, user, params }) => {
    requireStaff(user); const b = await readJson(request);
    const c = await one(db, 'SELECT * FROM challenges WHERE id = ?', params.id); if (!c) throw notfound();
    const to = b.stage; const reason = str(b.reason, 500);
    const allowed = { stopped: ['recruiting', 'agreement', 'active', 'settling'], closed: ['active', 'settling', 'stopped'], active: ['stopped', 'settling'], recruiting: ['agreement'] };
    if (!allowed[to]) throw bad('바꿀 수 없는 단계입니다');
    if (!allowed[to].includes(c.stage)) throw bad(`지금 단계(${c.stage})에서는 ${to}(으)로 바꿀 수 없습니다`);
    if (!reason) throw bad('사유를 적어 주세요. 그룹원에게도 전달됩니다');
    await run(db, "UPDATE challenges SET stage = ?, updated_at = datetime('now') WHERE id = ?", to, c.id);
    const label = { stopped: '중단', closed: '종료', active: '재개', recruiting: '모집 재개' }[to];
    for (const m of await all(db, "SELECT user_id FROM group_members WHERE challenge_id = ? AND status = 'active'", c.id)) {
      await notify(db, m.user_id, `운영본부가 챌린지를 ${label} 처리했습니다`, `${c.title} · ${reason}${to === 'stopped' ? ' · 중단해도 프로젝트 페이퍼는 제출합니다' : ''}`, to === 'stopped' ? `#/groups/${c.id}/paper` : `#/challenges/${c.id}`);
    }
    await audit(db, user.id, 'challenge.stage', 'challenges:' + c.id, { from: c.stage, to, reason, by: 'admin' });
    return { ok: true };
  });

  // 그룹장 교체 (MC-03 4.4: 운영본부 승인으로 진행)
  on('POST', '/admin/groups/:id/leader', async ({ db, request, user, params }) => {
    requireStaff(user); const b = await readJson(request);
    const c = await one(db, 'SELECT * FROM challenges WHERE id = ?', params.id); if (!c) throw notfound();
    const reason = str(b.reason, 500); if (!reason) throw bad('교체 사유를 적어 주세요');
    const next = await one(db, "SELECT * FROM group_members WHERE challenge_id = ? AND user_id = ? AND status = 'active'", c.id, Number(b.user_id));
    if (!next) throw bad('활동 중인 그룹원 중에서 새 그룹장을 골라 주세요');
    if (next.user_id === c.leader_id) throw bad('이미 그룹장입니다');
    await run(db, "UPDATE group_members SET role = 'general', role_weight = ? WHERE challenge_id = ? AND user_id = ?", ROLE_WEIGHTS.general || 1, c.id, c.leader_id);
    await run(db, "UPDATE group_members SET role = 'leader', role_weight = ? WHERE id = ?", ROLE_WEIGHTS.leader || 1, next.id);
    await run(db, "UPDATE challenges SET leader_id = ?, updated_at = datetime('now') WHERE id = ?", next.user_id, c.id);
    for (const m of await all(db, "SELECT user_id FROM group_members WHERE challenge_id = ? AND status = 'active'", c.id)) await notify(db, m.user_id, '그룹장이 바뀌었습니다', `${c.title} · ${reason}`, `#/challenges/${c.id}`);
    await notify(db, c.leader_id, '그룹장 역할이 넘어갔습니다', `${c.title} · ${reason}`, `#/challenges/${c.id}`);
    await audit(db, user.id, 'challenge.leader', 'challenges:' + c.id, { from: c.leader_id, to: next.user_id, reason });
    return { ok: true };
  });

  // ─────────────────────────────── 지급 관리 ───────────────────────────────
  on('GET', '/admin/payouts', async ({ db, user, query }) => {
    requireStaff(user);
    const status = ['pending', 'held', 'paid'].includes(query.status) ? query.status : 'pending';
    const rows = await all(db, `SELECT p.*, s.challenge_id, s.reviewed_at, s.period_start, s.period_end, c.title, l.nickname AS leader, COALESCE(u.nickname, '운영본부') AS nickname, u.name
      FROM settlement_payouts p JOIN settlements s ON s.id = p.settlement_id JOIN challenges c ON c.id = s.challenge_id JOIN users l ON l.id = c.leader_id LEFT JOIN users u ON u.id = p.user_id
      WHERE p.status = ? ORDER BY ${status === 'paid' ? 'p.paid_at DESC' : 's.reviewed_at, p.id'} LIMIT 500`, status);
    const totals = await all(db, 'SELECT status, COUNT(*) AS n, COALESCE(SUM(net),0) AS net, COALESCE(SUM(withholding),0) AS withholding FROM settlement_payouts GROUP BY status');
    return { rows, totals };
  });
  on('POST', '/admin/payouts/bulk', async ({ db, request, user }) => {
    requireStaff(user); const b = await readJson(request);
    if (!['paid', 'held', 'pending'].includes(b.status)) throw bad('status는 paid / held / pending');
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean).slice(0, 200);
    if (!ids.length) throw bad('처리할 지급 건을 골라 주세요');
    const touched = new Set();
    for (const id of ids) {
      const p = await one(db, 'SELECT * FROM settlement_payouts WHERE id = ?', id); if (!p) continue;
      await run(db, "UPDATE settlement_payouts SET status = ?, paid_at = CASE WHEN ? = 'paid' THEN datetime('now') ELSE NULL END WHERE id = ?", b.status, b.status, id);
      touched.add(p.settlement_id);
      if (b.status === 'paid' && p.user_id) await notify(db, p.user_id, '정산금이 지급 처리됐습니다', `${Number(p.net).toLocaleString('ko-KR')}원`, `#/settlements/${p.settlement_id}`);
    }
    for (const sid of touched) {
      const left = await one(db, "SELECT COUNT(*) AS c FROM settlement_payouts WHERE settlement_id = ? AND status <> 'paid'", sid);
      if (!(left?.c)) await run(db, "UPDATE settlements SET status = 'paid' WHERE id = ?", sid);
    }
    await audit(db, user.id, 'payout.bulk.' + b.status, 'settlement_payouts', { ids });
    return { ok: true, count: ids.length };
  });

  // ─────────────────────────────── 운영본부 재원 ───────────────────────────────
  async function hqReport(db) {
    const income = await all(db, `SELECT ${quarterSql('COALESCE(s.reviewed_at, s.created_at)')} AS q,
      SUM(CASE WHEN p.kind = 'hq' THEN p.gross ELSE 0 END) AS hq_share, SUM(CASE WHEN p.kind = 'fee' THEN p.gross ELSE 0 END) AS fee, SUM(CASE WHEN p.kind = 'refund_hq' THEN p.gross ELSE 0 END) AS refund_hq
      FROM settlement_payouts p JOIN settlements s ON s.id = p.settlement_id WHERE p.user_id IS NULL GROUP BY q`);
    const spent = await all(db, `SELECT ${quarterSql('spent_on')} AS q, category, SUM(amount) AS amount FROM hq_expenses GROUP BY q, category`);
    const qs = [...new Set([...income.map(r => r.q), ...spent.map(r => r.q)])].sort().reverse();
    return qs.map(q => {
      const i = income.find(r => r.q === q) || {}; const s = spent.filter(r => r.q === q);
      const by = Object.fromEntries(Object.keys(HQ_CATEGORIES).map(k => [k, s.find(r => r.category === k)?.amount || 0]));
      return { quarter: q, hq_share: i.hq_share || 0, fee: i.fee || 0, refund_hq: i.refund_hq || 0, income: (i.hq_share || 0) + (i.fee || 0), spent: s.reduce((t, r) => t + r.amount, 0), by_category: by };
    });
  }
  on('GET', '/admin/hq', async ({ db, user }) => {
    requireStaff(user);
    const expenses = await all(db, 'SELECT e.*, u.nickname AS author FROM hq_expenses e LEFT JOIN users u ON u.id = e.created_by ORDER BY e.spent_on DESC, e.id DESC LIMIT 300');
    return { categories: HQ_CATEGORIES, quarters: await hqReport(db), expenses };
  });
  on('POST', '/admin/hq/expenses', async ({ db, request, user }) => {
    requireStaff(user); const b = await readJson(request);
    must(b.spent_on, '사용일'); if (!HQ_CATEGORIES[b.category]) throw bad('항목을 골라 주세요');
    const amount = intv(b.amount, '금액', { min: 1 });
    const id = await insert(db, 'INSERT INTO hq_expenses (spent_on, category, amount, memo, evidence, created_by) VALUES (?,?,?,?,?,?)', String(b.spent_on).slice(0, 10), b.category, amount, str(b.memo, 500), str(b.evidence, 500), user.id);
    await audit(db, user.id, 'hq.expense.add', 'hq_expenses:' + id, { amount, category: b.category });
    return { ok: true, id };
  });
  on('DELETE', '/admin/hq/expenses/:id', async ({ db, user, params }) => {
    requireStaff(user);
    const e = await one(db, 'SELECT * FROM hq_expenses WHERE id = ?', params.id); if (!e) throw notfound();
    await run(db, 'DELETE FROM hq_expenses WHERE id = ?', e.id);
    await audit(db, user.id, 'hq.expense.delete', 'hq_expenses:' + e.id, e);
    return { ok: true };
  });
  // 공개용: 분기별 운영본부 몫과 쓰임 (수익 배분 규칙 페이지에 표시)
  on('GET', '/public/hq-report', async ({ db }) => ({ categories: HQ_CATEGORIES, quarters: (await hqReport(db)).slice(0, 4).map(({ refund_hq, ...r }) => r) }));

  // ─────────────────────────────── 단체 알림 ───────────────────────────────
  const segOf = q => ({ type: q.type || q.segment || 'all', level: q.level, challenge_id: q.challenge_id, round_id: q.round_id });
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
    return { event: e, registrations: regs };
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
    };
    if (v.starts_at.length === 16) v.starts_at += ':00';
    await run(db, 'UPDATE events SET title = ?, starts_at = ?, location = ?, capacity = ?, min_level = ?, description = ?, attendance_code = ?, status = ? WHERE id = ?', v.title, v.starts_at, v.location, v.capacity, v.min_level, v.description, v.attendance_code, v.status, e.id);
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
  const BACKUP_SKIP = ['sessions', 'login_attempts', 'view_logs'];
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
