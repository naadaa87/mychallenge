// 이용 통계 수집(/api/t)과 운영본부 KPI API(/api/admin/kpi/*) — v1.3
import { one, all, run, requireStaff, bad, audit, str, intv, J } from './util.js';
import { LEVELS, LEVEL_NAMES, FIELDS } from './rules.js';
import { isOwner, requireOwner } from './admin-routes.js';

// ───────────────────────── 날짜 ─────────────────────────
const kstNow = () => new Date(Date.now() + 9 * 3600e3);
const kstDate = () => kstNow().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const mondayOf = d => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const K = col => `date(datetime(${col}, '+9 hours'))`; // UTC로 저장된 시각 → 한국 날짜

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
// 기간: range(7·30·90·365일) 또는 start~end 직접 지정(최대 1년). 비교 기간은 바로 앞의 같은 길이.
export function period(query) {
  const today = kstDate();
  let end = DAY_RE.test(query.end || '') ? query.end : today;
  if (end > today) end = today;
  let start, range, custom = false;
  if (DAY_RE.test(query.start || '')) {
    start = query.start > end ? end : query.start;
    range = Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400e3) + 1;
    if (range > 366) { range = 366; start = addDays(end, -365); }
    custom = true;
  } else {
    range = [7, 30, 90, 365].includes(Number(query.range)) ? Number(query.range) : 30;
    start = addDays(end, -(range - 1));
  }
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(range - 1));
  const bucket = range <= 31 ? 'day' : range <= 120 ? 'week' : 'month';
  return { range, start, end, prevStart, prevEnd, bucket, custom };
}
// 수집 여부: 운영자가 끄거나 시작일 전이면 모으지 않는다 (개인정보처리방침 시행일을 지키기 위해)
export function collecting(settings) {
  const a = settings.analytics || {};
  return a.enabled !== false && !(a.start && kstDate() < a.start);
}
const bucketOf = (day, b) => b === 'day' ? day : b === 'week' ? mondayOf(day) : day.slice(0, 7);
function buckets(p) {
  const keys = [];
  for (let d = p.start; d <= p.end; d = addDays(d, 1)) { const k = bucketOf(d, p.bucket); if (keys[keys.length - 1] !== k) keys.push(k); }
  return keys;
}
// [{day, n}] → 구간별 합계 배열
function series(p, rows, field = 'n') {
  const keys = buckets(p); const m = Object.fromEntries(keys.map(k => [k, 0]));
  for (const r of rows) { const k = bucketOf(r.day, p.bucket); if (k in m) m[k] += Number(r[field] || 0); }
  return keys.map(k => m[k]);
}
// 구간별로 중복 없이 세야 하는 값(방문자 수 등): [{day, key}] → 구간마다 고유 key 수
function seriesDistinct(p, rows) {
  const keys = buckets(p); const m = Object.fromEntries(keys.map(k => [k, new Set()]));
  for (const r of rows) { const k = bucketOf(r.day, p.bucket); if (m[k]) m[k].add(r.key); }
  return keys.map(k => m[k].size);
}
const rate = (a, b) => (b ? Math.round(a / b * 1000) / 10 : null);

// ───────────────────────── 유입 출처 분류 ─────────────────────────
const SOURCES = [
  [/^(m\.)?search\.naver\.com$/, '네이버 검색'], [/^(m\.)?blog\.naver\.com$/, '네이버 블로그'], [/^(m\.)?cafe\.naver\.com$/, '네이버 카페'], [/(^|\.)naver\.(com|me)$/, '네이버'],
  [/(^|\.)google\.[a-z.]+$/, '구글 검색'], [/(^|\.)daum\.net$/, '다음'], [/(^|\.)bing\.com$/, '빙'],
  [/(^|\.)kakao\.com$|(^|\.)kakaocdn\.net$|^open\.kakao/, '카카오'], [/(^|\.)instagram\.com$/, '인스타그램'], [/(^|\.)facebook\.com$|^fb\.me$/, '페이스북'],
  [/(^|\.)threads\.(net|com)$/, '스레드'], [/^t\.co$|(^|\.)x\.com$|(^|\.)twitter\.com$/, 'X(트위터)'], [/(^|\.)youtube\.com$|^youtu\.be$/, '유튜브'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, '링크드인'], [/(^|\.)brunch\.co\.kr$/, '브런치'], [/(^|\.)tistory\.com$/, '티스토리'],
  [/chatgpt\.com$|openai\.com$|perplexity\.ai$|claude\.ai$|gemini\.google\.com$/, 'AI 검색·대화'], [/\.pages\.dev$/, '이전 주소(pages.dev)'],
];
export function classifySource(ref, campaign) {
  if (!ref) return { source: campaign ? '캠페인 · ' + String(campaign).split(' / ')[0] : '직접 방문', host: null };
  const host = String(ref).split('/')[0].toLowerCase().replace(/^www\./, '');
  for (const [re, name] of SOURCES) if (re.test(host)) return { source: name, host };
  return { source: host, host };
}

// ───────────────────────── 수집 ─────────────────────────
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|yeti|daum(oa)?[- ]?web|kakaotalk-scrap|python|curl|wget|httpclient|monitor|uptime/i;
const ID_RE = /^[a-z0-9]{6,24}$/;
const clip = (v, n) => (v == null ? null : String(v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) || null);
const empty = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

let purgedAt = 0;
async function purgeOld(db) {
  if (Date.now() - purgedAt < 6 * 3600e3) return;
  purgedAt = Date.now();
  await run(db, 'DELETE FROM analytics_events WHERE day < ?', addDays(kstDate(), -400));
}

export function registerKpiRoutes(on) {
  on('POST', '/t', async ({ db, request, user, settings }) => {
    if (!collecting(settings)) return empty();
    if (BOT.test(request.headers.get('user-agent') || '')) return empty();
    if (user && user.role === 'staff') return empty(); // 운영진 방문은 세지 않는다
    const text = await request.text();
    if (!text || text.length > 20000) return empty();
    let body; try { body = JSON.parse(text); } catch { return empty(); }
    const list = (Array.isArray(body.e) ? body.e : [body]).slice(0, 20);
    const now = kstNow(); const day = now.toISOString().slice(0, 10); const hour = now.getUTCHours();
    const stmts = [];
    for (const e of list) {
      if (!e || !['view', 'click', 'leave'].includes(e.k)) continue;
      if (!ID_RE.test(String(e.vid || '')) || !ID_RE.test(String(e.sid || ''))) continue;
      const path = String(e.p || '').split('?')[0];
      if (!path.startsWith('/') || path.length > 200) continue;
      const area = ['site', 'paper', 'app'].includes(e.a) ? e.a : 'site';
      const device = ['mobile', 'tablet', 'desktop'].includes(e.device) ? e.device : null;
      const v = { title: null, source: null, host: null, campaign: null, target: null, label: null, zone: null, dur: null, scroll: null, isNew: 0, entry: 0 };
      if (e.k === 'view') {
        v.title = clip(e.t, 120); v.isNew = e.n ? 1 : 0; v.entry = e.f ? 1 : 0;
        if (v.entry) { v.campaign = clip(e.c, 80); const s = classifySource(clip(e.r, 120), v.campaign); v.source = s.source; v.host = s.host; }
      } else if (e.k === 'click') {
        v.target = clip(e.g, 160); v.label = clip(e.l, 60); v.zone = clip(e.z, 12);
        if (!v.target) continue;
      } else {
        const d = Math.round(Number(e.d)); if (!(d >= 1)) continue; v.dur = Math.min(d, 1800);
        const sc = Math.round(Number(e.s)); if (sc >= 0 && sc <= 100) v.scroll = sc;
      }
      stmts.push(db.prepare(`INSERT INTO analytics_events (day, hour, vid, sid, user_id, kind, area, path, title, source, ref_host, campaign, target, label, zone, dur, scroll, device, is_new, entry)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(day, hour, e.vid, e.sid, user ? user.id : null, e.k, area, path, v.title, v.source, v.host, v.campaign, v.target, v.label, v.zone, v.dur, v.scroll, device, v.isNew, v.entry));
    }
    if (stmts.length) { await db.batch(stmts); await purgeOld(db); }
    return empty();
  });

  // ─────────────────────── 공통 집계 ───────────────────────
  const c1 = async (db, sql, ...p) => Number((await one(db, sql, ...p))?.c || 0);

  async function traffic(db, s, e) {
    const t = await one(db, `SELECT COUNT(DISTINCT vid) AS visitors, COUNT(DISTINCT sid) AS sessions, COUNT(*) AS views,
      COUNT(DISTINCT CASE WHEN is_new = 1 THEN vid END) AS new_visitors FROM analytics_events WHERE kind = 'view' AND day BETWEEN ? AND ?`, s, e);
    const dwell = await c1(db, "SELECT COALESCE(SUM(dur),0) AS c FROM analytics_events WHERE kind = 'leave' AND day BETWEEN ? AND ?", s, e);
    const bounces = await c1(db, "SELECT COUNT(*) AS c FROM (SELECT sid FROM analytics_events WHERE kind = 'view' AND day BETWEEN ? AND ? GROUP BY sid HAVING COUNT(*) = 1)", s, e);
    const visitors = Number(t?.visitors || 0), sessions = Number(t?.sessions || 0), views = Number(t?.views || 0);
    return {
      visitors, sessions, views, new_visitors: Number(t?.new_visitors || 0),
      views_per_session: sessions ? Math.round(views / sessions * 10) / 10 : null,
      avg_session_sec: sessions ? Math.round(dwell / sessions) : null,
      avg_view_sec: views ? Math.round(dwell / views) : null,
      bounce_rate: rate(bounces, sessions),
      new_rate: rate(Number(t?.new_visitors || 0), visitors),
    };
  }

  // 활동 회원: 회원 공간 방문 또는 기록(체크인·완료·글·댓글·출석·장부)이 있는 회원
  const ACTIVE_SQL = `SELECT DISTINCT uid FROM (
      SELECT user_id AS uid, day FROM analytics_events WHERE user_id IS NOT NULL
      UNION ALL SELECT user_id, ${K('submitted_at')} FROM checkin_entries
      UNION ALL SELECT user_id, ${K('created_at')} FROM done_logs
      UNION ALL SELECT author_id, ${K('created_at')} FROM posts
      UNION ALL SELECT author_id, ${K('created_at')} FROM comments
      UNION ALL SELECT user_id, ${K('attended_at')} FROM registrations WHERE status = 'attended'
      UNION ALL SELECT entered_by, ${K('created_at')} FROM ledger_entries
    ) a JOIN users u ON u.id = a.uid WHERE u.role = 'member' AND a.day BETWEEN ? AND ?`;
  const activeCount = (db, s, e) => c1(db, `SELECT COUNT(*) AS c FROM (${ACTIVE_SQL})`, s, e);
  const memberTotal = db => c1(db, "SELECT COUNT(*) AS c FROM users WHERE role = 'member' AND status = 'active' AND level <> 'L0'");

  async function checkinRate(db, s, e) {
    const cks = await all(db, `SELECT ci.id, ci.challenge_id, ci.created_at, (SELECT COUNT(*) FROM checkin_entries x WHERE x.checkin_id = ci.id) AS subs,
      (SELECT COUNT(*) FROM group_members gm WHERE gm.challenge_id = ci.challenge_id AND gm.status IN ('active','left') AND (gm.joined_at IS NULL OR gm.joined_at <= ci.created_at) AND (gm.left_at IS NULL OR gm.left_at > ci.created_at)) AS expected
      FROM checkins ci WHERE ${K('ci.created_at')} BETWEEN ? AND ?`, s, e);
    const subs = cks.reduce((t, r) => t + Math.min(r.subs, r.expected || r.subs), 0), exp = cks.reduce((t, r) => t + (r.expected || 0), 0);
    return { checkins: cks.length, subs, expected: exp, rate: rate(subs, exp) };
  }
  async function attendance(db, s, e) {
    const r = await one(db, `SELECT COUNT(*) AS reg, SUM(CASE WHEN r.status = 'attended' THEN 1 ELSE 0 END) AS att FROM registrations r JOIN events ev ON ev.id = r.event_id
      WHERE r.status <> 'cancelled' AND ev.status <> 'cancelled' AND substr(ev.starts_at, 1, 10) BETWEEN ? AND ?`, s, e);
    return { registered: Number(r?.reg || 0), attended: Number(r?.att || 0), rate: rate(Number(r?.att || 0), Number(r?.reg || 0)) };
  }
  const RUNNING = "('recruiting','agreement','active','settling')";
  async function groupNow(db, settings) {
    const g = await all(db, `SELECT c.id, (SELECT COUNT(*) FROM group_members gm WHERE gm.challenge_id = c.id AND gm.status = 'active') AS n FROM challenges c WHERE c.type <> 'solo' AND c.stage IN ${RUNNING}`);
    const min = settings.min_group ?? 4;
    const inGroup = await c1(db, `SELECT COUNT(DISTINCT gm.user_id) AS c FROM group_members gm JOIN challenges c ON c.id = gm.challenge_id JOIN users u ON u.id = gm.user_id
      WHERE gm.status = 'active' AND c.stage IN ${RUNNING} AND u.role = 'member'`);
    return { running: g.length, avg_size: g.length ? Math.round(g.reduce((t, r) => t + r.n, 0) / g.length * 10) / 10 : null, min_met: rate(g.filter(r => r.n >= min).length, g.length), in_group: inGroup };
  }

  // ─────────────────────── 요약 ───────────────────────
  on('GET', '/admin/kpi/summary', async ({ db, user, query, settings }) => {
    requireStaff(user); await purgeOld(db);
    const p = period(query);
    const calc = async (s, e) => {
      const t = await traffic(db, s, e);
      const apps = await c1(db, `SELECT COUNT(*) AS c FROM applications WHERE ${K('created_at')} BETWEEN ? AND ?`, s, e);
      const signups = await c1(db, `SELECT COUNT(*) AS c FROM users WHERE role = 'member' AND ${K('created_at')} BETWEEN ? AND ?`, s, e);
      const onboarded = await c1(db, `SELECT COUNT(*) AS c FROM users WHERE role = 'member' AND level <> 'L0' AND ${K('created_at')} BETWEEN ? AND ?`, s, e);
      const goals = await c1(db, "SELECT COUNT(DISTINCT sid) AS c FROM analytics_events WHERE kind = 'click' AND target = 'goal:apply' AND day BETWEEN ? AND ?", s, e);
      const active = await activeCount(db, s, e);
      const ck = await checkinRate(db, s, e);
      const att = await attendance(db, s, e);
      const posts = await c1(db, `SELECT COUNT(*) AS c FROM posts x JOIN users u ON u.id = x.author_id WHERE u.role = 'member' AND x.hidden = 0 AND ${K('x.created_at')} BETWEEN ? AND ?`, s, e);
      const comments = await c1(db, `SELECT COUNT(*) AS c FROM comments x JOIN users u ON u.id = x.author_id WHERE u.role = 'member' AND x.hidden = 0 AND ${K('x.created_at')} BETWEEN ? AND ?`, s, e);
      const writers = await c1(db, `SELECT COUNT(DISTINCT uid) AS c FROM (SELECT author_id AS uid, created_at FROM posts WHERE hidden = 0 UNION ALL SELECT author_id, created_at FROM comments WHERE hidden = 0) x JOIN users u ON u.id = x.uid WHERE u.role = 'member' AND ${K('x.created_at')} BETWEEN ? AND ?`, s, e);
      const opened = await c1(db, `SELECT COUNT(*) AS c FROM challenges WHERE type <> 'solo' AND ${K('created_at')} BETWEEN ? AND ?`, s, e);
      const joins = await c1(db, `SELECT COUNT(*) AS c FROM group_members gm JOIN challenges c ON c.id = gm.challenge_id WHERE c.type <> 'solo' AND gm.role <> 'leader' AND ${K('gm.created_at')} BETWEEN ? AND ?`, s, e);
      const completions = await c1(db, `SELECT COUNT(*) AS c FROM badges WHERE code = 'completion' AND revoked_at IS NULL AND ${K('created_at')} BETWEEN ? AND ?`, s, e);
      const firstSales = await c1(db, `SELECT COUNT(*) AS c FROM badges WHERE code = 'first_sale' AND revoked_at IS NULL AND ${K('created_at')} BETWEEN ? AND ?`, s, e);
      return { ...t, apps, signups, onboarded, goals, active, ck, att, posts, comments, writers, opened, joins, completions, firstSales };
    };
    const cur = await calc(p.start, p.end), prev = await calc(p.prevStart, p.prevEnd);
    const members = await memberTotal(db);
    const g = await groupNow(db, settings);
    const card = (group, key, label, value, prevValue, unit, def, opt = {}) => ({ group, key, label, value, prev: prevValue, unit, def, ...opt });
    const tracking_since = (await one(db, 'SELECT MIN(day) AS d FROM analytics_events'))?.d || null;
    // 방문 통계가 지난 기간 전체를 덮지 못하면 비교하지 않는다
    const fullPrev = !!tracking_since && tracking_since <= p.prevStart;
    const pv = v => (fullPrev ? v : null);
    const cards = [
      card('유입', 'visitors', '방문자', cur.visitors, pv(prev.visitors), '명', '기간 안에 한 번이라도 들어온 브라우저 수 (운영진·검색 로봇 제외)'),
      card('유입', 'views', '페이지뷰', cur.views, pv(prev.views), '회', `방문 ${cur.sessions}회 · 방문당 ${cur.views_per_session ?? '-'}쪽`),
      card('유입', 'avg_session', '방문당 머문 시간', cur.avg_session_sec, pv(prev.avg_session_sec), '초', '화면이 실제로 보인 시간만 셉니다', { fmt: 'dur' }),
      card('유입', 'bounce', '한 페이지만 보고 나간 비율', cur.bounce_rate, pv(prev.bounce_rate), '%', '방문 중 페이지를 하나만 본 비율', { better: 'down' }),
      card('전환', 'apps', '가입 신청', cur.apps, prev.apps, '건', '가입 신청서가 들어온 수'),
      card('전환', 'apply_conv', '방문자 → 신청 전환율', rate(cur.apps, cur.visitors), pv(rate(prev.apps, prev.visitors)), '%', '가입 신청 수 ÷ 방문자 수'),
      card('전환', 'signups', '새 회원', cur.signups, prev.signups, '명', '초대 코드로 계정을 만든 회원'),
      card('전환', 'onboard', '오리엔테이션 완료율', rate(cur.onboarded, cur.signups), rate(prev.onboarded, prev.signups), '%', '기간 안에 가입한 회원 중 챌린저(L1) 이상이 된 비율'),
      card('참여', 'active', '활동 회원', cur.active, pv(prev.active), '명', `정회원 ${members}명 중 ${rate(cur.active, members) ?? '-'}% · 회원 공간 방문이나 체크인·완료·글·댓글·출석·장부 기록이 있는 회원`),
      card('참여', 'checkin', '체크인 제출률', cur.ck.rate, prev.ck.rate, '%', `기간 안에 열린 체크인 ${cur.ck.checkins}회 · 제출 ${cur.ck.subs}/${cur.ck.expected}`),
      card('참여', 'attend', '일정 참석률', cur.att.rate, prev.att.rate, '%', `신청 ${cur.att.registered}명 중 출석 ${cur.att.attended}명`),
      card('참여', 'community', '커뮤니티 글·댓글', cur.posts + cur.comments, prev.posts + prev.comments, '건', `회원이 쓴 글 ${cur.posts} · 댓글 ${cur.comments} · 쓴 사람 ${cur.writers}명`),
      card('모임', 'opened', '새로 개설된 모임', cur.opened, prev.opened, '개', '그룹·오피셜 챌린지 제안 수 (솔로 제외)'),
      card('모임', 'joins', '모임 참여 신청', cur.joins, prev.joins, '건', '그룹원으로 지원한 수 (그룹장 제외)'),
      card('모임', 'running', '진행 중인 모임', g.running, null, '개', `모집·합의·진행·정산 단계 · 평균 ${g.avg_size ?? '-'}명`),
      card('모임', 'group_part', '회원 모임 참여율', rate(g.in_group, members), null, '%', `정회원 중 진행 중인 그룹에 들어가 있는 회원 ${g.in_group}명`),
      card('성과', 'completions', '라운드 완주', cur.completions, prev.completions, '명', '완주 배지를 받은 회원'),
      card('성과', 'first_sales', '첫 매출', cur.firstSales, prev.firstSales, '명', '첫 매출 배지를 받은 회원 (증빙 확인 후)'),
      card('성과', 'new_rate', '처음 온 방문자 비율', cur.new_rate, pv(prev.new_rate), '%', '방문자 중 이 브라우저로 처음 들어온 사람 — 새 사람에게 닿고 있는지'),
      card('성과', 'goals', '신청서 제출 방문', cur.goals, pv(prev.goals), '회', '브라우저에서 가입 신청서 제출을 마친 방문 (홍보 효과 확인용)'),
    ];
    // 이번 달 목표: 1일부터 오늘까지 실제 숫자
    const today = kstDate(), mFirst = today.slice(0, 8) + '01';
    const mt = await traffic(db, mFirst, today);
    const lastDay = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
    const month = {
      month: today.slice(0, 7), days_elapsed: Number(today.slice(8)), days_in_month: lastDay,
      targets: settings.kpi_targets || {},
      actual: {
        visitors: mt.visitors, views: mt.views,
        apps: await c1(db, `SELECT COUNT(*) AS c FROM applications WHERE ${K('created_at')} BETWEEN ? AND ?`, mFirst, today),
        signups: await c1(db, `SELECT COUNT(*) AS c FROM users WHERE role = 'member' AND ${K('created_at')} BETWEEN ? AND ?`, mFirst, today),
        active: await activeCount(db, mFirst, today),
      },
    };
    const vis = await all(db, "SELECT day, vid AS key FROM analytics_events WHERE kind = 'view' AND day BETWEEN ? AND ?", p.start, p.end);
    const sign = await all(db, `SELECT ${K('created_at')} AS day, COUNT(*) AS n FROM users WHERE role = 'member' AND ${K('created_at')} BETWEEN ? AND ? GROUP BY day`, p.start, p.end);
    const appsS = await all(db, `SELECT ${K('created_at')} AS day, COUNT(*) AS n FROM applications WHERE ${K('created_at')} BETWEEN ? AND ? GROUP BY day`, p.start, p.end);
    const a = settings.analytics || {};
    const config = { enabled: a.enabled !== false, start: a.start || '', collecting: collecting(settings), is_owner: await isOwner(db, user) };
    return { period: p, labels: buckets(p), cards, series: { visitors: seriesDistinct(p, vis), applications: series(p, appsS), signups: series(p, sign) }, tracking_since, members, month, config };
  });

  // ─────────────────────── 방문·유입 ───────────────────────
  on('GET', '/admin/kpi/traffic', async ({ db, user, query }) => {
    requireStaff(user);
    const p = period(query); const s = p.start, e = p.end;
    const cur = await traffic(db, s, e);
    const since = (await one(db, 'SELECT MIN(day) AS d FROM analytics_events'))?.d;
    const prev = since && since <= p.prevStart ? await traffic(db, p.prevStart, p.prevEnd) : null;
    const views = await all(db, "SELECT day, vid, sid FROM analytics_events WHERE kind = 'view' AND day BETWEEN ? AND ?", s, e);
    const goalsBySid = new Set((await all(db, "SELECT DISTINCT sid FROM analytics_events WHERE kind = 'click' AND target = 'goal:apply' AND day BETWEEN ? AND ?", s, e)).map(r => r.sid));
    const src = await all(db, `SELECT COALESCE(source, '직접 방문') AS source, sid, vid FROM analytics_events WHERE kind = 'view' AND entry = 1 AND day BETWEEN ? AND ?`, s, e);
    const bySrc = {};
    for (const r of src) { const o = bySrc[r.source] ||= { source: r.source, sessions: new Set(), visitors: new Set(), goals: 0 }; if (!o.sessions.has(r.sid) && goalsBySid.has(r.sid)) o.goals++; o.sessions.add(r.sid); o.visitors.add(r.vid); }
    const sources = Object.values(bySrc).map(o => ({ source: o.source, sessions: o.sessions.size, visitors: o.visitors.size, goals: o.goals, conv: rate(o.goals, o.sessions.size) })).sort((a, b) => b.sessions - a.sessions);
    return {
      period: p, labels: buckets(p), cur, prev,
      series: { visitors: seriesDistinct(p, views.map(r => ({ day: r.day, key: r.vid }))), sessions: seriesDistinct(p, views.map(r => ({ day: r.day, key: r.sid }))), views: series(p, views.map(r => ({ day: r.day, n: 1 }))) },
      sources,
      hosts: await all(db, "SELECT ref_host AS host, COUNT(DISTINCT sid) AS sessions FROM analytics_events WHERE kind = 'view' AND entry = 1 AND ref_host IS NOT NULL AND day BETWEEN ? AND ? GROUP BY ref_host ORDER BY sessions DESC LIMIT 20", s, e),
      campaigns: await all(db, "SELECT campaign, COUNT(DISTINCT sid) AS sessions, COUNT(DISTINCT vid) AS visitors FROM analytics_events WHERE kind = 'view' AND entry = 1 AND campaign IS NOT NULL AND day BETWEEN ? AND ? GROUP BY campaign ORDER BY sessions DESC LIMIT 20", s, e),
      devices: await all(db, "SELECT COALESCE(device, '알 수 없음') AS device, COUNT(DISTINCT vid) AS visitors, COUNT(*) AS views FROM analytics_events WHERE kind = 'view' AND day BETWEEN ? AND ? GROUP BY device ORDER BY visitors DESC", s, e),
      areas: await all(db, "SELECT area, COUNT(*) AS views, COUNT(DISTINCT vid) AS visitors FROM analytics_events WHERE kind = 'view' AND day BETWEEN ? AND ? GROUP BY area", s, e),
      hours: (h => Array.from({ length: 24 }, (_, i) => Number(h.find(r => r.hour === i)?.n || 0)))(await all(db, "SELECT hour, COUNT(*) AS n FROM analytics_events WHERE kind = 'view' AND day BETWEEN ? AND ? GROUP BY hour", s, e)),
      weekdays: (w => Array.from({ length: 7 }, (_, i) => Number(w.find(r => Number(r.wd) === (i + 1) % 7)?.n || 0)))(await all(db, "SELECT strftime('%w', day) AS wd, COUNT(*) AS n FROM analytics_events WHERE kind = 'view' AND day BETWEEN ? AND ? GROUP BY wd", s, e)),
    };
  });

  // ─────────────────────── 콘텐츠 ───────────────────────
  on('GET', '/admin/kpi/content', async ({ db, user, query }) => {
    requireStaff(user);
    const p = period(query); const s = p.start, e = p.end;
    const pages = await all(db, `SELECT path, area, MAX(title) AS title, COUNT(*) AS views, COUNT(DISTINCT vid) AS visitors, SUM(entry) AS entries
      FROM analytics_events WHERE kind = 'view' AND day BETWEEN ? AND ? GROUP BY path ORDER BY views DESC LIMIT 400`, s, e);
    const dwell = Object.fromEntries((await all(db, "SELECT path, SUM(dur) AS d FROM analytics_events WHERE kind = 'leave' AND day BETWEEN ? AND ? GROUP BY path", s, e)).map(r => [r.path, r.d]));
    const clicks = Object.fromEntries((await all(db, "SELECT path, COUNT(*) AS n FROM analytics_events WHERE kind = 'click' AND target NOT LIKE 'goal:%' AND day BETWEEN ? AND ? GROUP BY path", s, e)).map(r => [r.path, r.n]));
    const bounce = Object.fromEntries((await all(db, `SELECT a.path, COUNT(*) AS n FROM analytics_events a WHERE a.kind = 'view' AND a.entry = 1 AND a.day BETWEEN ? AND ?
      AND (SELECT COUNT(*) FROM analytics_events b WHERE b.sid = a.sid AND b.kind = 'view') = 1 GROUP BY a.path`, s, e)).map(r => [r.path, r.n]));
    const exits = Object.fromEntries((await all(db, `SELECT a.path, COUNT(*) AS n FROM analytics_events a WHERE a.kind = 'view' AND a.day BETWEEN ? AND ?
      AND a.id = (SELECT MAX(b.id) FROM analytics_events b WHERE b.sid = a.sid AND b.kind = 'view') GROUP BY a.path`, s, e)).map(r => [r.path, r.n]));
    // 스크롤: 방문마다 그 페이지에서 가장 많이 내려 본 위치의 평균
    const scrolls = Object.fromEntries((await all(db, `SELECT path, ROUND(AVG(sc)) AS sc FROM (SELECT sid, path, MAX(scroll) AS sc FROM analytics_events WHERE kind = 'leave' AND scroll IS NOT NULL AND day BETWEEN ? AND ? GROUP BY sid, path) GROUP BY path`, s, e)).map(r => [r.path, r.sc]));
    const rows = pages.map(r => ({ ...r, avg_sec: r.views ? Math.round((dwell[r.path] || 0) / r.views) : null, scroll: scrolls[r.path] ?? null, clicks: clicks[r.path] || 0, bounce_rate: rate(bounce[r.path] || 0, r.entries), exit_rate: rate(exits[r.path] || 0, r.views) }));
    // 회원 공간 화면은 번호를 지워서 화면 종류별로 묶는다
    const appScreens = {};
    for (const r of rows.filter(r => r.area === 'app')) {
      const key = r.path.replace(/\/\d+(?=\/|$)/g, '/:id');
      const o = appScreens[key] ||= { path: key, views: 0, visitors: 0, dwell: 0 };
      o.views += r.views; o.visitors += r.visitors; o.dwell += dwell[r.path] || 0;
    }
    const goalApply = await c1(db, "SELECT COUNT(DISTINCT sid) AS c FROM analytics_events WHERE kind = 'click' AND target = 'goal:apply' AND day BETWEEN ? AND ?", s, e);
    const applyViews = await c1(db, "SELECT COUNT(DISTINCT sid) AS c FROM analytics_events WHERE kind = 'view' AND path = '/apply/' AND day BETWEEN ? AND ?", s, e);
    const applyClickSessions = await c1(db, "SELECT COUNT(DISTINCT sid) AS c FROM analytics_events WHERE kind = 'click' AND target = '/apply/' AND day BETWEEN ? AND ?", s, e);
    const sessions = await c1(db, "SELECT COUNT(DISTINCT sid) AS c FROM analytics_events WHERE kind = 'view' AND day BETWEEN ? AND ?", s, e);
    const paperIds = rows.filter(r => /^\/papers\/\d+/.test(r.path)).map(r => Number(r.path.split('/')[2]));
    const paperTitles = paperIds.length ? Object.fromEntries((await all(db, `SELECT p.id, c.title FROM papers p JOIN challenges c ON c.id = p.challenge_id WHERE p.id IN (${paperIds.map(() => '?').join(',')})`, ...paperIds)).map(r => [r.id, r.title])) : {};
    // 페이지 상세: 그 페이지에서 누른 것, 바로 들어온 출처, 앞뒤로 본 페이지
    let detail = null;
    if (query.path) {
      const path = String(query.path).split('?')[0].slice(0, 200);
      const row = rows.find(r => r.path === path) || { path, title: null, views: 0, visitors: 0, entries: 0, avg_sec: null, scroll: null, clicks: 0, bounce_rate: null, exit_rate: null };
      const neighbor = (dir) => all(db, `SELECT n.path, COUNT(*) AS n FROM analytics_events a JOIN analytics_events n ON n.id = (SELECT ${dir === 'next' ? 'MIN' : 'MAX'}(x.id) FROM analytics_events x WHERE x.sid = a.sid AND x.kind = 'view' AND x.id ${dir === 'next' ? '>' : '<'} a.id)
        WHERE a.kind = 'view' AND a.path = ? AND a.day BETWEEN ? AND ? GROUP BY n.path ORDER BY n DESC LIMIT 8`, path, s, e);
      detail = {
        ...row,
        series: series(p, await all(db, "SELECT day, COUNT(*) AS n FROM analytics_events WHERE kind = 'view' AND path = ? AND day BETWEEN ? AND ? GROUP BY day", path, s, e)),
        clicks_list: await all(db, "SELECT target, label, zone, COUNT(*) AS n, COUNT(DISTINCT vid) AS visitors FROM analytics_events WHERE kind = 'click' AND path = ? AND target NOT LIKE 'goal:%' AND day BETWEEN ? AND ? GROUP BY target, label ORDER BY n DESC LIMIT 15", path, s, e),
        goals: await all(db, "SELECT target, COUNT(DISTINCT sid) AS n FROM analytics_events WHERE kind = 'click' AND path = ? AND target LIKE 'goal:%' AND day BETWEEN ? AND ? GROUP BY target", path, s, e),
        sources: await all(db, "SELECT COALESCE(source, '직접 방문') AS source, COUNT(*) AS n FROM analytics_events WHERE kind = 'view' AND entry = 1 AND path = ? AND day BETWEEN ? AND ? GROUP BY source ORDER BY n DESC LIMIT 10", path, s, e),
        from: await neighbor('prev'), next: await neighbor('next'),
      };
    }
    return {
      period: p, labels: buckets(p), detail,
      site: rows.filter(r => r.area === 'site' && !r.path.startsWith('/guide/')),
      guides: rows.filter(r => r.area === 'site' && /^\/guide\/[^/]+\/$/.test(r.path)),
      papers: [
        ...rows.filter(r => r.area === 'paper').map(r => ({ ...r, title: paperTitles[Number(r.path.split('/')[2])] || r.title })),
        ...(await all(db, `SELECT 'full:' || v.target_id AS path, 'paper' AS area, c.title, COUNT(*) AS views, COUNT(DISTINCT v.user_id) AS visitors FROM view_logs v JOIN papers p ON p.id = v.target_id JOIN challenges c ON c.id = p.challenge_id
          WHERE v.target_type = 'paper_full' AND ${K('v.created_at')} BETWEEN ? AND ? GROUP BY v.target_id ORDER BY views DESC LIMIT 20`, s, e)).map(r => ({ ...r, full: true })),
      ],
      app: Object.values(appScreens).map(o => ({ ...o, avg_sec: o.views ? Math.round(o.dwell / o.views) : null })).sort((a, b) => b.views - a.views).slice(0, 40),
      top_clicks: await all(db, `SELECT target, label, zone, COUNT(*) AS n, COUNT(DISTINCT vid) AS visitors FROM analytics_events WHERE kind = 'click' AND target NOT IN ('button','toggle','menu','faq') AND target NOT LIKE 'goal:%' AND day BETWEEN ? AND ?
        GROUP BY target, label ORDER BY n DESC LIMIT 30`, s, e),
      faq: await all(db, "SELECT label, COUNT(*) AS n, COUNT(DISTINCT vid) AS visitors FROM analytics_events WHERE kind = 'click' AND target = 'faq' AND day BETWEEN ? AND ? GROUP BY label ORDER BY n DESC LIMIT 20", s, e),
      outbound: await all(db, "SELECT substr(target, 5) AS host, COUNT(*) AS n FROM analytics_events WHERE kind = 'click' AND target LIKE 'out:%' AND day BETWEEN ? AND ? GROUP BY target ORDER BY n DESC LIMIT 15", s, e),
      apply_from: await all(db, "SELECT path, zone, COUNT(*) AS n FROM analytics_events WHERE kind = 'click' AND target = '/apply/' AND day BETWEEN ? AND ? GROUP BY path, zone ORDER BY n DESC LIMIT 20", s, e),
      apply_funnel: [['전체 방문', sessions], ['가입 신청 버튼 클릭', applyClickSessions], ['가입 신청 페이지 방문', applyViews], ['신청서 제출', goalApply]],
    };
  });

  // ─────────────────────── 회원 ───────────────────────
  on('GET', '/admin/kpi/members', async ({ db, user, query }) => {
    requireStaff(user);
    const p = period(query); const s = p.start, e = p.end; const today = kstDate();
    const levels = await all(db, "SELECT level, COUNT(*) AS n FROM users WHERE role = 'member' AND status = 'active' GROUP BY level");
    const statuses = await all(db, "SELECT status, COUNT(*) AS n FROM users WHERE role = 'member' GROUP BY status");
    const members = await memberTotal(db);
    const dau = await activeCount(db, today, today), wau = await activeCount(db, addDays(today, -6), today), mau = await activeCount(db, addDays(today, -29), today);
    const dormant = await c1(db, "SELECT COUNT(*) AS c FROM users WHERE role = 'member' AND status = 'active' AND level <> 'L0' AND (last_seen_at IS NULL OR last_seen_at < datetime('now','-30 days'))");
    const appsS = await all(db, `SELECT ${K('created_at')} AS day, COUNT(*) AS n FROM applications WHERE ${K('created_at')} BETWEEN ? AND ? GROUP BY day`, s, e);
    const signS = await all(db, `SELECT ${K('created_at')} AS day, COUNT(*) AS n FROM users WHERE role = 'member' AND ${K('created_at')} BETWEEN ? AND ? GROUP BY day`, s, e);
    const actRows = await all(db, `SELECT DISTINCT uid, day FROM (
        SELECT user_id AS uid, day FROM analytics_events WHERE user_id IS NOT NULL
        UNION ALL SELECT user_id, ${K('submitted_at')} FROM checkin_entries UNION ALL SELECT user_id, ${K('created_at')} FROM done_logs
        UNION ALL SELECT author_id, ${K('created_at')} FROM posts UNION ALL SELECT author_id, ${K('created_at')} FROM comments
        UNION ALL SELECT user_id, ${K('attended_at')} FROM registrations WHERE status = 'attended' UNION ALL SELECT entered_by, ${K('created_at')} FROM ledger_entries
      ) a JOIN users u ON u.id = a.uid WHERE u.role = 'member' AND a.day BETWEEN ? AND ?`, s, e);
    // 기간 안에 들어온 신청서 기준 흐름
    const funnelApps = await one(db, `SELECT COUNT(*) AS a, SUM(CASE WHEN status IN ('approved','joined') THEN 1 ELSE 0 END) AS ap, SUM(CASE WHEN status = 'joined' THEN 1 ELSE 0 END) AS j FROM applications WHERE ${K('created_at')} BETWEEN ? AND ?`, s, e);
    const cohort = `FROM users u WHERE u.role = 'member' AND ${K('u.created_at')} BETWEEN ? AND ?`;
    const funnel = [
      ['가입 신청', Number(funnelApps?.a || 0)],
      ['승인', Number(funnelApps?.ap || 0)],
      ['계정 생성', Number(funnelApps?.j || 0)],
      ['오리엔테이션 완료(L1)', await c1(db, `SELECT COUNT(*) AS c ${cohort} AND u.level <> 'L0'`, s, e)],
      ['메이커(L2) 이상', await c1(db, `SELECT COUNT(*) AS c ${cohort} AND u.level IN ('L2','L3','L4','L5')`, s, e)],
      ['모임 참여', await c1(db, `SELECT COUNT(*) AS c ${cohort} AND EXISTS (SELECT 1 FROM group_members gm JOIN challenges c ON c.id = gm.challenge_id WHERE gm.user_id = u.id AND c.type <> 'solo' AND gm.status IN ('active','left'))`, s, e)],
    ];
    // 가입 월별로 최근 30일 활동 비율
    const months = await all(db, `SELECT substr(${K('created_at')}, 1, 7) AS m, COUNT(*) AS n, GROUP_CONCAT(id) AS ids FROM users WHERE role = 'member' AND status = 'active' GROUP BY m ORDER BY m DESC LIMIT 6`);
    const active30 = new Set((await all(db, `SELECT uid FROM (${ACTIVE_SQL})`, addDays(today, -29), today)).map(r => r.uid));
    const cohorts = months.map(r => { const ids = String(r.ids || '').split(',').map(Number); const a = ids.filter(id => active30.has(id)).length; return { month: r.m, members: r.n, active: a, rate: rate(a, r.n) }; });
    // 회원별 활동
    const list = await all(db, `SELECT u.id, u.nickname, u.name, u.level, u.status, u.created_at, u.last_seen_at,
      (SELECT COUNT(*) FROM analytics_events a WHERE a.user_id = u.id AND a.kind = 'view' AND a.day BETWEEN ?1 AND ?2) AS views,
      (SELECT COALESCE(SUM(dur),0) FROM analytics_events a WHERE a.user_id = u.id AND a.kind = 'leave' AND a.day BETWEEN ?1 AND ?2) AS secs,
      (SELECT COUNT(*) FROM checkin_entries x WHERE x.user_id = u.id AND ${K('x.submitted_at')} BETWEEN ?1 AND ?2) AS checkins,
      (SELECT COUNT(*) FROM done_logs x WHERE x.user_id = u.id AND x.cancelled_at IS NULL AND ${K('x.created_at')} BETWEEN ?1 AND ?2) AS done,
      (SELECT COUNT(*) FROM posts x WHERE x.author_id = u.id AND ${K('x.created_at')} BETWEEN ?1 AND ?2) + (SELECT COUNT(*) FROM comments x WHERE x.author_id = u.id AND ${K('x.created_at')} BETWEEN ?1 AND ?2) AS talk,
      (SELECT COUNT(*) FROM registrations x JOIN events ev ON ev.id = x.event_id WHERE x.user_id = u.id AND x.status = 'attended' AND substr(ev.starts_at,1,10) BETWEEN ?1 AND ?2) AS attended,
      (SELECT COUNT(*) FROM group_members gm JOIN challenges c ON c.id = gm.challenge_id WHERE gm.user_id = u.id AND gm.status = 'active' AND c.stage IN ${RUNNING}) AS groups,
      (SELECT COALESCE(SUM(points),0) FROM points_ledger pl WHERE pl.user_id = u.id) AS points
      FROM users u WHERE u.role = 'member' AND u.status <> 'removed' ORDER BY u.created_at DESC LIMIT 500`, s, e);
    const daysBy = {}; for (const r of actRows) daysBy[r.uid] = (daysBy[r.uid] || 0) + 1;
    return {
      period: p, labels: buckets(p), members, dau, wau, mau, stickiness: rate(dau, mau), dormant,
      levels: LEVELS.map(l => ({ level: l, name: LEVEL_NAMES[l], n: Number(levels.find(r => r.level === l)?.n || 0) })),
      statuses, funnel, cohorts,
      series: { applications: series(p, appsS), signups: series(p, signS), active: seriesDistinct(p, actRows.map(r => ({ day: r.day, key: r.uid }))) },
      list: list.map(r => ({ ...r, active_days: daysBy[r.id] || 0 })),
    };
  });

  // ─────────────────────── 모임(챌린지·일정) ───────────────────────
  on('GET', '/admin/kpi/groups', async ({ db, user, query, settings }) => {
    requireStaff(user);
    const p = period(query); const s = p.start, e = p.end;
    const min = settings.min_group ?? 4, max = settings.max_group ?? 8;
    const created = await all(db, `SELECT ${K('created_at')} AS day, type, field_code FROM challenges WHERE ${K('created_at')} BETWEEN ? AND ?`, s, e);
    const stages = await all(db, "SELECT stage, COUNT(*) AS n FROM challenges WHERE stage <> 'rejected' AND type <> 'solo' GROUP BY stage");
    const groups = await all(db, `SELECT c.id, c.title, c.type, c.stage, c.field_code, c.created_at, u.nickname AS leader, r.name AS round_name,
      (SELECT COUNT(*) FROM group_members gm WHERE gm.challenge_id = c.id AND gm.role <> 'leader') AS applied,
      (SELECT COUNT(*) FROM group_members gm WHERE gm.challenge_id = c.id AND gm.role <> 'leader' AND gm.status IN ('active','left','removed')) AS accepted,
      (SELECT COUNT(*) FROM group_members gm WHERE gm.challenge_id = c.id AND gm.status = 'active') AS active,
      (SELECT COUNT(*) FROM group_members gm WHERE gm.challenge_id = c.id AND gm.status IN ('left','removed')) AS left_n,
      (SELECT COUNT(*) FROM checkins ci WHERE ci.challenge_id = c.id) AS checkins,
      (SELECT COUNT(*) FROM checkin_entries x JOIN checkins ci ON ci.id = x.checkin_id WHERE ci.challenge_id = c.id) AS subs,
      (SELECT COUNT(*) FROM done_logs d WHERE d.challenge_id = c.id AND d.cancelled_at IS NULL) AS done,
      (SELECT COALESCE(SUM(amount),0) FROM ledger_entries l WHERE l.challenge_id = c.id AND l.kind = 'revenue' AND l.is_external = 1) AS revenue
      FROM challenges c JOIN users u ON u.id = c.leader_id LEFT JOIN rounds r ON r.id = c.round_id
      WHERE c.stage NOT IN ('rejected') AND c.type <> 'solo' ORDER BY CASE WHEN c.stage IN ${RUNNING} THEN 0 ELSE 1 END, c.created_at DESC LIMIT 300`);
    const rows = groups.map(g => ({ ...g, field_name: FIELDS[g.field_code], fill_rate: rate(g.active, max), min_met: g.active >= min || !['recruiting', 'agreement', 'active', 'settling'].includes(g.stage), accept_rate: rate(g.accepted, g.applied), checkin_rate: g.checkins && g.active ? Math.min(100, rate(g.subs, g.checkins * g.active)) : null }));
    const running = rows.filter(r => ['recruiting', 'agreement', 'active', 'settling'].includes(r.stage));
    const members = await memberTotal(db);
    const g = await groupNow(db, settings);
    const totals = {
      opened: created.filter(r => r.type !== 'solo').length, solo: created.filter(r => r.type === 'solo').length,
      running: running.length, avg_size: g.avg_size, min_met: g.min_met, fill_rate: running.length ? Math.round(running.reduce((t, r) => t + (r.fill_rate || 0), 0) / running.length * 10) / 10 : null,
      accept_rate: rate(rows.reduce((t, r) => t + r.accepted, 0), rows.reduce((t, r) => t + r.applied, 0)),
      dropout_rate: rate(rows.reduce((t, r) => t + r.left_n, 0), rows.reduce((t, r) => t + r.active + r.left_n, 0)),
      completion_rate: rate(rows.filter(r => r.stage === 'closed').length, rows.filter(r => ['closed', 'stopped'].includes(r.stage)).length),
      participation: rate(g.in_group, members), in_group: g.in_group, members, min, max,
    };
    const events = await all(db, `SELECT ev.id, ev.title, ev.type, ev.starts_at, ev.capacity, ev.status,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = ev.id AND r.status <> 'cancelled') AS registered,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = ev.id AND r.status = 'attended') AS attended
      FROM events ev WHERE substr(ev.starts_at, 1, 10) BETWEEN ? AND ? ORDER BY ev.starts_at DESC`, s, e);
    const att = await attendance(db, s, e);
    return {
      period: p, labels: buckets(p), totals,
      series: { opened: series(p, created.filter(r => r.type !== 'solo').map(r => ({ day: r.day, n: 1 }))) },
      by_field: Object.entries(FIELDS).map(([code, name]) => ({ code, name, n: created.filter(r => r.field_code === code).length })),
      stages, groups: rows,
      events: events.map(ev => ({ ...ev, attend_rate: rate(ev.attended, ev.registered), fill_rate: ev.capacity ? rate(ev.registered, ev.capacity) : null })), attendance: att,
    };
  });

  // ─────────────────────── 커뮤니티 ───────────────────────
  on('GET', '/admin/kpi/community', async ({ db, user, query }) => {
    requireStaff(user);
    const p = period(query); const s = p.start, e = p.end;
    const count = async (table, a, b) => c1(db, `SELECT COUNT(*) AS c FROM ${table} x JOIN users u ON u.id = x.${table === 'helpful' ? 'user_id' : 'author_id'} WHERE u.role = 'member'${table === 'helpful' ? '' : ' AND x.hidden = 0'} AND ${K('x.created_at')} BETWEEN ? AND ?`, a, b);
    const cur = { posts: await count('posts', s, e), comments: await count('comments', s, e), helpful: await count('helpful', s, e) };
    const prev = { posts: await count('posts', p.prevStart, p.prevEnd), comments: await count('comments', p.prevStart, p.prevEnd), helpful: await count('helpful', p.prevStart, p.prevEnd) };
    const q = await one(db, `SELECT COUNT(*) AS n, SUM(CASE WHEN EXISTS (SELECT 1 FROM comments c WHERE c.post_id = p.id AND c.author_id <> p.author_id AND c.hidden = 0) THEN 1 ELSE 0 END) AS answered FROM posts p WHERE p.board = 'question' AND p.hidden = 0 AND ${K('p.created_at')} BETWEEN ? AND ?`, s, e);
    const writers = await c1(db, `SELECT COUNT(DISTINCT uid) AS c FROM (SELECT author_id AS uid FROM posts WHERE hidden = 0 AND ${K('created_at')} BETWEEN ?1 AND ?2 UNION SELECT author_id FROM comments WHERE hidden = 0 AND ${K('created_at')} BETWEEN ?1 AND ?2) x JOIN users u ON u.id = x.uid WHERE u.role = 'member'`, s, e);
    const postViews = {};
    for (const r of await all(db, "SELECT path, COUNT(*) AS n, COUNT(DISTINCT vid) AS v FROM analytics_events WHERE kind = 'view' AND area = 'app' AND path LIKE '/app/community/posts/%' AND day BETWEEN ? AND ? GROUP BY path", s, e)) {
      const id = Number(r.path.split('/').pop()); if (id) postViews[id] = r;
    }
    const top = await all(db, `SELECT p.id, p.title, p.board, p.helpful_count, p.created_at, u.nickname, (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.hidden = 0) AS comments
      FROM posts p JOIN users u ON u.id = p.author_id WHERE u.role = 'member' AND p.hidden = 0 AND ${K('p.created_at')} BETWEEN ? AND ? ORDER BY p.helpful_count * 2 + (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) DESC, p.created_at DESC LIMIT 20`, s, e);
    const ps = await all(db, `SELECT ${K('x.created_at')} AS day, COUNT(*) AS n FROM posts x JOIN users u ON u.id = x.author_id WHERE u.role = 'member' AND x.hidden = 0 AND ${K('x.created_at')} BETWEEN ? AND ? GROUP BY day`, s, e);
    const cs = await all(db, `SELECT ${K('x.created_at')} AS day, COUNT(*) AS n FROM comments x JOIN users u ON u.id = x.author_id WHERE u.role = 'member' AND x.hidden = 0 AND ${K('x.created_at')} BETWEEN ? AND ? GROUP BY day`, s, e);
    return {
      period: p, labels: buckets(p), cur, prev, writers,
      questions: { n: Number(q?.n || 0), answered: Number(q?.answered || 0), rate: rate(Number(q?.answered || 0), Number(q?.n || 0)) },
      by_board: await all(db, `SELECT p.board, COUNT(*) AS n FROM posts p JOIN users u ON u.id = p.author_id WHERE u.role = 'member' AND p.hidden = 0 AND ${K('p.created_at')} BETWEEN ? AND ? GROUP BY p.board ORDER BY n DESC`, s, e),
      series: { posts: series(p, ps), comments: series(p, cs) },
      top: top.map(t => ({ ...t, views: postViews[t.id]?.n || 0, readers: postViews[t.id]?.v || 0 })),
      contributors: await all(db, `SELECT u.id, u.nickname, u.level, SUM(x.posts) AS posts, SUM(x.comments) AS comments FROM (
          SELECT author_id AS uid, 1 AS posts, 0 AS comments FROM posts WHERE hidden = 0 AND ${K('created_at')} BETWEEN ?1 AND ?2
          UNION ALL SELECT author_id, 0, 1 FROM comments WHERE hidden = 0 AND ${K('created_at')} BETWEEN ?1 AND ?2) x JOIN users u ON u.id = x.uid
        WHERE u.role = 'member' GROUP BY u.id ORDER BY posts * 3 + comments DESC LIMIT 15`, s, e),
    };
  });

  // ─────────────────────── 월 목표·수집 설정 (운영자) ───────────────────────
  const saveSetting = (db, key, val, uid) => run(db, `INSERT INTO settings (key, value, version, updated_by) VALUES (?,?,1,?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, version = settings.version + 1, updated_by = excluded.updated_by, updated_at = datetime('now')`, key, J(val), uid);
  on('PUT', '/admin/kpi/settings', async ({ db, request, user, settings }) => {
    await requireOwner(db, user);
    let b; try { b = JSON.parse(await request.text() || '{}'); } catch { throw bad('잘못된 JSON 본문입니다'); }
    const changes = {};
    if (b.targets && typeof b.targets === 'object') {
      const t = {};
      for (const k of ['visitors', 'views', 'apps', 'signups', 'active']) t[k] = b.targets[k] === '' || b.targets[k] == null ? 0 : intv(b.targets[k], '목표', { min: 0, max: 100000000 });
      await saveSetting(db, 'kpi_targets', t, user.id); changes.targets = t;
    }
    if (b.analytics && typeof b.analytics === 'object') {
      const cur = settings.analytics || {};
      const start = b.analytics.start == null ? (cur.start || '') : String(b.analytics.start);
      if (start && !DAY_RE.test(start)) throw bad('수집 시작일은 날짜로 넣어 주세요');
      const val = { ...cur, enabled: b.analytics.enabled == null ? cur.enabled !== false : !!b.analytics.enabled, start };
      await saveSetting(db, 'analytics', val, user.id); changes.analytics = val;
    }
    if (!Object.keys(changes).length) throw bad('바꿀 내용이 없습니다');
    await audit(db, user.id, 'kpi.settings', 'settings:kpi', { reason: str(b.reason, 300) || undefined, ...changes });
    return { ok: true, ...changes };
  });
}
