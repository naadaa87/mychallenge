// 총괄관리자 기능 (v2.2) — https://mychallenge.kr/admin 의 '총괄 관리' 메뉴
// - 총괄 현황: 받은 일 처리 속도, 운영진 업무, 회원·커뮤니티, 시스템 점검표
// - 운영진 담당 영역: 운영진마다 맡은 영역만 처리하게 제한 (비워 두면 전체)
// - 보안·접속: 로그인 실패, 운영진 로그인 기기, 강제 로그아웃
// - 사이트 운영: 회원 신청 받기/닫기, 공지 띠
// - 데이터 정리: 만료된 로그인, 오래된 알림, 하루 지난 로그인 실패 기록
import { SITE } from '../_site/config.js';
import { bad, forbid, readJson, J, one, all, run, requireStaff, audit, str, getCookie, COOKIE } from './util.js';
import { requireOwner, isOwner } from './admin-routes.js';
import { onboardingRows } from './community-routes.js';

// ───────── 운영진 담당 영역 ─────────
export const STAFF_SCOPES = [
  ['members', '회원·가입', '가입 신청, 회원 정보 변경, 신규 회원 정착, 승급 심사'],
  ['groups', '그룹·성과', '그룹리더 신청·자격, 그룹 관리, 시즌, 매출 확인, 페이퍼'],
  ['comms', '정기모임·소통', '정기모임·일정, 발표 신청, 단체 알림, 단체카톡방'],
  ['community', '커뮤니티', '커뮤니티 관리, 이의·신고'],
  ['data', 'KPI·데이터', 'KPI 지표, CSV 내려받기'],
];
const SCOPE_NAME = Object.fromEntries(STAFF_SCOPES.map(([k, n]) => [k, n]));
// [영역, 경로, 'write'면 조회는 누구나]. 위에서부터 먼저 맞는 규칙을 쓴다.
const SCOPE_RULES = [
  ['groups', /^\/admin\/users\/\d+\/leader$/],
  ['members', /^\/admin\/(applications|onboarding|promotions)(\/|$)/],
  ['members', /^\/admin\/users(\/|$)/, 'write'],
  ['groups', /^\/admin\/(leaders|leader-applications|rounds|results|papers)(\/|$)/],
  ['groups', /^\/admin\/groups(\/|$)/, 'write'],
  ['comms', /^\/admin\/(events|presentations|broadcast|broadcasts|chat)(\/|$)/],
  ['community', /^\/admin\/(community|posts|comments|disputes)(\/|$)/],
  ['data', /^\/admin\/(kpi|export)(\/|$)/],
];
export const scopesOf = u => (u?.staff_scopes == null ? null : String(u.staff_scopes).split(',').filter(k => SCOPE_NAME[k]));

// API 요청마다 부른다. 담당 영역이 정해진 운영진이 영역 밖의 처리를 하면 막는다.
export async function checkScope(db, user, method, path) {
  if (!user || user.role !== 'staff' || user.staff_scopes == null) return;
  const mine = scopesOf(user);
  for (const [scope, re, mode] of SCOPE_RULES) {
    if (!re.test(path)) continue;
    if (mode === 'write' && method === 'GET') return;
    if (mine.includes(scope)) return;
    if (await isOwner(db, user)) return;
    throw forbid(`'${SCOPE_NAME[scope]}'은(는) 담당 영역이 아닙니다. 필요하면 총괄관리자에게 담당 영역을 요청해 주세요`);
  }
}

// 로그인 기기 요약 (전체 User-Agent는 남기지 않는다)
export function deviceOf(ua) {
  ua = String(ua || '');
  if (!ua) return '';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '기타';
  const br = /KAKAOTALK/i.test(ua) ? '카카오톡 인앱' : /NAVER\(inapp/i.test(ua) ? '네이버 인앱' : /SamsungBrowser/.test(ua) ? '삼성 인터넷' : /Edg\//.test(ua) ? 'Edge' : /Whale\//.test(ua) ? '웨일' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '브라우저';
  return `${br} · ${os}`;
}

// ───────── 사이트 운영 (공지 띠, 회원 신청) ─────────
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
export function publicNotice(settings) {
  const s = settings.site || {};
  const b = s.banner || {};
  const active = !!(b.enabled && b.text && (!b.until || b.until >= kstToday()));
  return {
    banner: active ? { text: b.text, link: b.link || '', audience: b.audience === 'all' ? 'all' : 'members', v: b.v || 0 } : null,
    applications: { open: s.applications_open !== false, message: s.applications_open === false ? (s.applications_closed_message || '지금은 회원 신청을 받지 않습니다. 다음 모집 때 다시 찾아 주세요.') : '' },
  };
}

// ───────── 데이터 정리 ─────────
const CLEANUP = {
  sessions: { name: '만료된 로그인 기록', count: "SELECT COUNT(*) AS c FROM sessions WHERE expires_at < datetime('now')", note: '로그인 유지 기간(30일)이 끝난 기록입니다. 지워도 아무에게도 영향이 없습니다.' },
  notifications: { name: '읽은 지 180일 지난 알림', count: "SELECT COUNT(*) AS c FROM notifications WHERE read_at IS NOT NULL AND read_at < datetime('now','-180 days')", note: '회원이 이미 읽은 오래된 알림입니다.' },
  login_attempts: { name: '하루 지난 로그인 실패 기록', count: "SELECT COUNT(*) AS c FROM login_attempts WHERE created_at < datetime('now','-1 day')", note: '개인정보처리방침: 로그인 실패 기록은 1일 후 삭제합니다.' },
};
async function cleanupCounts(db) {
  const out = [];
  for (const [key, t] of Object.entries(CLEANUP)) out.push({ key, name: t.name, note: t.note, count: (await one(db, t.count))?.c || 0 });
  return out;
}

const operatorMissing = () => Object.entries({ '운영 법인/상호': SITE.operator?.company, '문의 이메일': SITE.operator?.email, '개인정보 보호책임자': SITE.operator?.privacyOfficer }).filter(([, v]) => !v).map(([k]) => k);

export function registerOwnerRoutes(on) {
  // 공개: 공지 띠와 회원 신청 상태 (홈페이지·회원 공간이 읽는다)
  on('GET', '/public/notice', async ({ settings }) => new Response(JSON.stringify(publicNotice(settings)), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' } }));

  // ───────── 총괄 현황 ─────────
  on('GET', '/admin/overview', async ({ db, settings, user }) => {
    await requireOwner(db, user);
    const c = async (sql, ...p) => (await one(db, sql, ...p))?.c || 0;
    const avg = async (sql) => { const v = (await one(db, sql))?.c; return v == null ? null : Math.round(v * 10) / 10; };
    const queues = [
      { key: 'applications', name: '가입 신청', limit: 3, pending: await c("SELECT COUNT(*) AS c FROM applications WHERE status = 'pending'"),
        overdue: await c("SELECT COUNT(*) AS c FROM applications WHERE status = 'pending' AND created_at < datetime('now','-3 days')"),
        done30: await c("SELECT COUNT(*) AS c FROM applications WHERE decided_at >= datetime('now','-30 days')"),
        avg_days: await avg("SELECT AVG(julianday(decided_at) - julianday(created_at)) AS c FROM applications WHERE decided_at >= datetime('now','-30 days')") },
      { key: 'leaders', name: '그룹리더 신청', limit: 5, pending: await c("SELECT COUNT(*) AS c FROM leader_applications WHERE status = 'pending'"),
        overdue: await c("SELECT COUNT(*) AS c FROM leader_applications WHERE status = 'pending' AND created_at < datetime('now','-5 days')"),
        done30: await c("SELECT COUNT(*) AS c FROM leader_applications WHERE decided_at >= datetime('now','-30 days')"),
        avg_days: await avg("SELECT AVG(julianday(decided_at) - julianday(created_at)) AS c FROM leader_applications WHERE decided_at >= datetime('now','-30 days')") },
      { key: 'results', name: '매출 확인', limit: 7, pending: await c("SELECT COUNT(*) AS c FROM group_results WHERE metric = 'revenue' AND verified_at IS NULL AND deleted_at IS NULL"),
        overdue: await c("SELECT COUNT(*) AS c FROM group_results WHERE metric = 'revenue' AND verified_at IS NULL AND deleted_at IS NULL AND created_at < datetime('now','-7 days')"),
        done30: await c("SELECT COUNT(*) AS c FROM group_results WHERE verified_at >= datetime('now','-30 days')"),
        avg_days: await avg("SELECT AVG(julianday(verified_at) - julianday(created_at)) AS c FROM group_results WHERE verified_at >= datetime('now','-30 days')") },
      { key: 'promotions', name: '승급 심사', limit: 7, pending: await c("SELECT COUNT(*) AS c FROM promotion_requests WHERE status = 'pending'"),
        overdue: await c("SELECT COUNT(*) AS c FROM promotion_requests WHERE status = 'pending' AND created_at < datetime('now','-7 days')"),
        done30: await c("SELECT COUNT(*) AS c FROM promotion_requests WHERE decided_at >= datetime('now','-30 days')"),
        avg_days: await avg("SELECT AVG(julianday(decided_at) - julianday(created_at)) AS c FROM promotion_requests WHERE decided_at >= datetime('now','-30 days')") },
      { key: 'disputes', name: '이의·신고', limit: 7, pending: await c("SELECT COUNT(*) AS c FROM disputes WHERE status IN ('open','mediating')"),
        overdue: await c("SELECT COUNT(*) AS c FROM disputes WHERE status IN ('open','mediating') AND created_at < datetime('now','-7 days')"),
        done30: await c("SELECT COUNT(*) AS c FROM disputes WHERE resolved_at >= datetime('now','-30 days')"),
        avg_days: await avg("SELECT AVG(julianday(resolved_at) - julianday(created_at)) AS c FROM disputes WHERE resolved_at >= datetime('now','-30 days')") },
      { key: 'papers', name: '페이퍼 검토', limit: 5, pending: await c("SELECT COUNT(*) AS c FROM papers WHERE status = 'review'"), overdue: null, done30: await c("SELECT COUNT(*) AS c FROM papers WHERE published_at >= datetime('now','-30 days')"), avg_days: null },
    ];
    const staff = (await all(db, `SELECT u.id, u.nickname, u.email, u.last_seen_at, u.staff_scopes,
        EXISTS (SELECT 1 FROM admin_roles r WHERE r.user_id = u.id AND r.role = 'owner') AS is_owner,
        (SELECT COUNT(*) FROM audit_logs a WHERE a.actor_id = u.id AND a.created_at >= datetime('now','-7 days')) AS actions_7d,
        (SELECT COUNT(*) FROM audit_logs a WHERE a.actor_id = u.id AND a.created_at >= datetime('now','-30 days')) AS actions_30d,
        (SELECT MAX(created_at) FROM audit_logs a WHERE a.actor_id = u.id) AS last_action_at,
        (SELECT MAX(created_at) FROM sessions s WHERE s.user_id = u.id) AS last_login_at
      FROM users u WHERE u.role = 'staff' AND u.status = 'active' ORDER BY is_owner DESC, actions_30d DESC`))
      .map(s => ({ ...s, is_owner: !!s.is_owner, scopes: s.is_owner ? null : scopesOf(s) }));
    const members = {
      total: await c("SELECT COUNT(*) AS c FROM users WHERE role = 'member' AND status = 'active'"),
      new_month: await c("SELECT COUNT(*) AS c FROM users WHERE role = 'member' AND created_at >= datetime('now','+9 hours','start of month','-9 hours')"),
      active_7d: await c("SELECT COUNT(*) AS c FROM users WHERE role = 'member' AND status = 'active' AND last_seen_at >= datetime('now','-7 days')"),
      dormant: await c("SELECT COUNT(*) AS c FROM users WHERE role = 'member' AND status = 'dormant'"),
      leaders: await c("SELECT COUNT(*) AS c FROM users WHERE can_lead = 1 AND status = 'active'"),
      groups: await c("SELECT COUNT(*) AS c FROM challenges WHERE stage IN ('recruiting','active')"),
      chat_in: await c("SELECT COUNT(*) AS c FROM users WHERE role = 'member' AND status = 'active' AND chat_status IN ('joined','verified')"),
    };
    members.chat_rate = members.total ? Math.round(members.chat_in / members.total * 100) : null;
    const ob = await onboardingRows(db, settings, "u.created_at >= datetime('now', ?)", `-${settings.onboarding?.window_days || 30} days`);
    members.newcomers = ob.length; members.newcomers_done = ob.filter(r => r.state === 'done').length; members.newcomers_stalled = ob.filter(r => r.state === 'stalled').length;
    members.window = settings.onboarding?.window_days || 30;
    const lastBackup = (await one(db, "SELECT MAX(created_at) AS t FROM audit_logs WHERE action = 'backup.download'"))?.t || null;
    const changes = await all(db, `SELECT a.id, a.action, a.target, a.detail, a.created_at, u.nickname AS actor FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.action LIKE 'settings.%' OR a.action LIKE 'site.%' OR a.action LIKE 'staff.%' OR a.action = 'cleanup.run' ORDER BY a.id DESC LIMIT 8`);
    const owners = staff.filter(s => s.is_owner).length;
    const idleStaff = staff.filter(s => !s.last_seen_at || (Date.now() - Date.parse(s.last_seen_at.replace(' ', 'T') + 'Z')) / 86400e3 > 90);
    const cleanup = await cleanupCounts(db);
    const failures24 = await c("SELECT COUNT(*) AS c FROM login_attempts WHERE created_at >= datetime('now','-1 day')");
    const notice = publicNotice(settings);
    const chat = settings.community_chat || {};
    const overdueTotal = queues.reduce((s, q) => s + (q.overdue || 0), 0);
    const backupDays = lastBackup ? Math.floor((Date.now() - Date.parse(lastBackup.replace(' ', 'T') + 'Z')) / 86400e3) : null;
    const purged = await c("SELECT COUNT(*) AS c FROM applications WHERE status = 'purged'");
    const opMissing = operatorMissing();
    const checklist = [
      { ok: owners >= 2, title: owners >= 2 ? `총괄관리자 ${owners}명` : '총괄관리자가 한 명뿐입니다', detail: '총괄관리자 계정에 문제가 생기면 규칙·권한·백업을 처리할 사람이 없습니다. 믿을 수 있는 운영진 한 명을 더 지정해 두세요.', link: '#/staff' },
      { ok: backupDays != null && backupDays <= 30, title: lastBackup ? `마지막 전체 백업 ${backupDays}일 전` : '전체 백업 기록이 없습니다', detail: '시즌이 끝날 때, 그리고 적어도 한 달에 한 번 전체 백업을 받아 안전한 곳에 보관합니다.', link: '#/data' },
      { ok: overdueTotal === 0, title: overdueTotal ? `처리 기한이 지난 받은 일 ${overdueTotal}건` : '처리 기한이 지난 받은 일 없음', detail: '기한이 지난 건은 담당 운영진에게 먼저 알리고, 담당이 없으면 직접 처리합니다.', link: '#/' },
      { ok: true, info: true, title: `보관 기간이 지난 가입 신청서 자동 파기 · 지금까지 ${purged}건`, detail: '반려되었거나 승인 후 가입하지 않은 신청서는 처리일로부터 6개월이 지나면 운영 현황을 열 때 자동으로 파기됩니다 (개인정보처리방침 2항).', link: '' },
      { ok: !idleStaff.length, title: idleStaff.length ? `90일 넘게 접속하지 않은 운영진 ${idleStaff.length}명` : '오래 접속하지 않은 운영진 없음', detail: idleStaff.length ? `${idleStaff.map(s => s.nickname).join(', ')}. 더 이상 운영하지 않는다면 운영진에서 해제해 권한을 줄입니다.` : '쓰지 않는 운영진 계정은 해제해 두는 것이 안전합니다.', link: '#/staff' },
      { ok: !opMissing.length, title: opMissing.length ? `운영 주체 정보 비어 있음 (${opMissing.join(', ')})` : '운영 주체 정보 입력됨', detail: '개인정보처리방침과 홈페이지 아래쪽에 들어가는 정보입니다. 저장소의 functions/_site/config.js 에 적고 다시 배포해야 반영됩니다.', link: '' },
      { ok: !!(chat.enabled && chat.url), title: chat.enabled && chat.url ? '단체카톡방 안내 켜짐' : '단체카톡방 안내가 꺼져 있습니다', detail: '가입한 회원이 가장 먼저 연결되는 곳입니다.', link: '#/chat?tab=settings' },
      { ok: true, info: true, title: notice.applications.open ? '회원 신청 받는 중' : '회원 신청 닫힘', detail: notice.applications.open ? '홈페이지의 회원 신청서가 열려 있습니다.' : `신청 페이지 안내: ${notice.applications.message}`, link: '#/site' },
    ];
    return { queues, staff, members, system: { last_backup_at: lastBackup, backup_days: backupDays, failures_24h: failures24, owners, cleanup, operator_missing: opMissing, banner: notice.banner, applications: notice.applications,
      tables: (await one(db, "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"))?.c || 0,
      migrations: (await one(db, 'SELECT COUNT(*) AS c FROM schema_migrations'))?.c || 0 }, changes, checklist };
  });

  // ───────── 운영진 담당 영역 ─────────
  on('POST', '/admin/staff/:id/scopes', async ({ db, request, user, params }) => {
    await requireOwner(db, user); const b = await readJson(request);
    const t = await one(db, "SELECT id, nickname, role, status FROM users WHERE id = ?", Number(params.id));
    if (!t || t.role !== 'staff' || t.status !== 'active') throw bad('활동 중인 운영진만 담당 영역을 정할 수 있습니다');
    if (await one(db, "SELECT 1 AS x FROM admin_roles WHERE user_id = ? AND role = 'owner'", t.id)) throw bad('총괄관리자는 모든 영역을 맡습니다. 담당 영역을 정하려면 먼저 총괄관리자에서 해제해 주세요');
    const all_ = b.scopes === null || b.all === true;
    const scopes = all_ ? null : (Array.isArray(b.scopes) ? b.scopes : []).filter(k => SCOPE_NAME[k]);
    await run(db, 'UPDATE users SET staff_scopes = ? WHERE id = ?', scopes == null ? null : scopes.join(','), t.id);
    await audit(db, user.id, 'staff.scopes', 'users:' + t.id, { to: scopes == null ? '전체' : (scopes.map(k => SCOPE_NAME[k]).join(', ') || '없음 (현황·검색만)') });
    return { ok: true, scopes };
  });

  // ───────── 보안·접속 ─────────
  on('GET', '/admin/security', async ({ db, request, user }) => {
    await requireOwner(db, user);
    const token = getCookie(request, COOKIE);
    const cur = token ? (await one(db, 'SELECT rowid AS sid FROM sessions WHERE token = ?', token))?.sid : null;
    const byEmail = await all(db, `SELECT a.email, COUNT(*) AS n, COUNT(DISTINCT a.ip) AS ips, MAX(a.created_at) AS last,
        (SELECT u.role FROM users u WHERE u.email = a.email) AS role
      FROM login_attempts a WHERE a.created_at >= datetime('now','-1 day') GROUP BY a.email ORDER BY n DESC, last DESC LIMIT 30`);
    const byIp = await all(db, `SELECT ip, COUNT(*) AS n, COUNT(DISTINCT email) AS emails, MAX(created_at) AS last FROM login_attempts
      WHERE created_at >= datetime('now','-1 day') AND ip IS NOT NULL AND ip <> '' GROUP BY ip ORDER BY n DESC LIMIT 15`);
    const sessions = await all(db, `SELECT s.rowid AS sid, s.user_id, u.nickname, s.ua, s.created_at, s.expires_at,
        EXISTS (SELECT 1 FROM admin_roles r WHERE r.user_id = u.id AND r.role = 'owner') AS is_owner
      FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.role = 'staff' AND s.expires_at > datetime('now') ORDER BY s.created_at DESC LIMIT 100`);
    const staff = await all(db, `SELECT u.id, u.nickname, u.email, u.last_seen_at, u.staff_scopes,
        EXISTS (SELECT 1 FROM admin_roles r WHERE r.user_id = u.id AND r.role = 'owner') AS is_owner,
        (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > datetime('now')) AS devices,
        (SELECT MAX(created_at) FROM sessions s WHERE s.user_id = u.id) AS last_login_at
      FROM users u WHERE u.role = 'staff' AND u.status = 'active' ORDER BY is_owner DESC, u.id`);
    return {
      current_sid: cur,
      failures: { total: byEmail.reduce((s, r) => s + r.n, 0), by_email: byEmail.map(r => ({ ...r, is_staff: r.role === 'staff', locked: r.n >= 10 })), by_ip: byIp.map(r => ({ ...r, locked: r.n >= 30 })) },
      sessions: sessions.map(s => ({ ...s, is_owner: !!s.is_owner, current: s.sid === cur })),
      staff: staff.map(s => ({ ...s, is_owner: !!s.is_owner, scopes: s.is_owner ? null : scopesOf(s) })),
      rules: { per_email: 10, per_ip: 30, window_min: 15, session_days: 30 },
    };
  });
  on('POST', '/admin/security/revoke', async ({ db, request, user }) => {
    await requireOwner(db, user); const b = await readJson(request);
    const token = getCookie(request, COOKIE);
    let n = 0, target = null;
    if (b.sid) {
      const s = await one(db, 'SELECT rowid AS sid, user_id, token FROM sessions WHERE rowid = ?', Number(b.sid));
      if (!s) throw bad('이미 끝난 로그인입니다');
      if (s.token === token) throw bad('지금 쓰고 있는 로그인은 여기서 끊을 수 없습니다. 오른쪽 위 로그아웃을 눌러 주세요');
      await run(db, 'DELETE FROM sessions WHERE rowid = ?', s.sid); n = 1; target = s.user_id;
    } else if (b.user_id) {
      target = Number(b.user_id);
      const r = await run(db, 'DELETE FROM sessions WHERE user_id = ? AND token <> ?', target, token || '');
      n = r.meta?.changes ?? 0;
    } else throw bad('끊을 로그인을 골라 주세요');
    await audit(db, user.id, 'login.revoke', target ? 'users:' + target : null, { sessions: n });
    return { ok: true, revoked: n };
  });

  // ───────── 사이트 운영 ─────────
  on('GET', '/admin/site', async ({ db, settings, user }) => {
    requireStaff(user);
    return { site: settings.site, notice: publicNotice(settings), is_owner: await isOwner(db, user), today: kstToday() };
  });
  on('PUT', '/admin/site', async ({ db, settings, request, user }) => {
    await requireOwner(db, user); const b = await readJson(request);
    const reason = str(b.reason, 300); if (!reason) throw bad('바꾸는 이유를 적어 주세요. 변경 이력으로 남습니다');
    const bn = b.banner || {};
    const link = str(bn.link, 300) || '';
    if (link && !/^(\/|#\/|https:\/\/)/.test(link)) throw bad('공지 링크는 / 또는 https:// 로 시작해야 합니다');
    const until = /^\d{4}-\d{2}-\d{2}$/.test(bn.until || '') ? bn.until : '';
    const text = str(bn.text, 120) || '';
    if (bn.enabled && !text) throw bad('공지 띠에 보일 문구를 적어 주세요');
    const prev = settings.site?.banner || {};
    const changed = prev.text !== text || prev.link !== link || !!prev.enabled !== !!bn.enabled;
    const value = {
      applications_open: b.applications_open !== false,
      applications_closed_message: str(b.applications_closed_message, 300) || '',
      banner: { enabled: !!bn.enabled && !!text, text, link, audience: bn.audience === 'all' ? 'all' : 'members', until, v: changed ? Date.now() : (prev.v || Date.now()) },
    };
    await run(db, "INSERT INTO settings (key, value, version, updated_by) VALUES ('site',?,1,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, version = settings.version + 1, updated_by = excluded.updated_by, updated_at = datetime('now')", J(value), user.id);
    await audit(db, user.id, 'site.update', 'settings:site', { reason, applications_open: value.applications_open, banner: value.banner.enabled ? value.banner.text : '꺼짐' });
    return { ok: true, site: value };
  });

  // ───────── 데이터 정리 ─────────
  on('GET', '/admin/cleanup', async ({ db, user }) => {
    await requireOwner(db, user);
    const lastBackup = (await one(db, "SELECT MAX(created_at) AS t FROM audit_logs WHERE action = 'backup.download'"))?.t || null;
    const history = await all(db, "SELECT a.detail, a.created_at, u.nickname AS actor FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id WHERE a.action = 'cleanup.run' ORDER BY a.id DESC LIMIT 10");
    return { tasks: await cleanupCounts(db), last_backup_at: lastBackup, history };
  });
  on('POST', '/admin/cleanup', async ({ db, request, user }) => {
    await requireOwner(db, user); const b = await readJson(request);
    const t = CLEANUP[b.task]; if (!t) throw bad('정리할 항목을 골라 주세요');
    const reason = str(b.reason, 300); if (!reason) throw bad('정리하는 이유를 적어 주세요. 처리 기록으로 남습니다');
    let n = 0;
    if (b.task === 'sessions') n = (await run(db, "DELETE FROM sessions WHERE expires_at < datetime('now')")).meta?.changes ?? 0;
    if (b.task === 'notifications') n = (await run(db, "DELETE FROM notifications WHERE read_at IS NOT NULL AND read_at < datetime('now','-180 days')")).meta?.changes ?? 0;
    if (b.task === 'login_attempts') n = (await run(db, "DELETE FROM login_attempts WHERE created_at < datetime('now','-1 day')")).meta?.changes ?? 0;
    await audit(db, user.id, 'cleanup.run', null, { task: t.name, rows: n, reason });
    return { ok: true, removed: n };
  });
}
