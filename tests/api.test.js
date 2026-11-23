// 전체 흐름 테스트: 초기 설정 → 가입 → 그룹리더 승인 → 그룹 → 모임·출석·경고 → 기록·성과 → 완주·페이퍼 → 정기모임 → 운영 콘솔 → KPI
import { makeDb, makeClient, eq, ok, expectOk, expectFail } from './harness.js';

const db = makeDb(process.env.MACHAL_DB || ':memory:');
const c = await makeClient(db);
const today = new Date().toISOString().slice(0, 10);

// 0. 초기 상태
eq((await c.get('/public/status')).data.setup_needed, true, 'setup needed');
await expectOk(c.post('/setup', { email: 'admin@machal.kr', password: 'adminpass1', name: '최시준', nickname: '운영본부' }, { as: 'admin' }), 'setup');
eq((await c.get('/public/status')).data.setup_needed, false);
await expectFail(c.post('/setup', { email: 'x@x.kr', password: 'password1', name: 'x' }, { as: 'x' }), 403, 'second setup blocked');
const admin = await expectOk(c.get('/me', { as: 'admin' }));
eq([admin.level, admin.role], ['L5', 'staff'], 'admin is L5 staff');

// 1. 가입 신청 → 승인 → 초대 코드 → 가입 → 온보딩
async function join(key, name, level) {
  const email = `${key}@test.kr`;
  await expectFail(c.post('/apply', { name, email, interests: 'S-01', consent_public: true }), 400, 'apply needs privacy consent');
  await expectOk(c.post('/apply', { name, email, interests: 'S-01,S-02', consent_public: true, consent_privacy: true, experience: '없음' }), 'apply ' + key);
  await expectFail(c.post('/apply', { name, email, consent_public: true, consent_privacy: true }), 400, 'duplicate application');
  const apps = await expectOk(c.get('/admin/applications?status=pending', { as: 'admin' }));
  const app = apps.find(a => a.email === email);
  const dec = await expectOk(c.post(`/admin/applications/${app.id}`, { decision: 'approve' }, { as: 'admin' }));
  ok(/^MC-[A-Z0-9]{6}$/.test(dec.invite_code), 'invite code format ' + dec.invite_code);
  await expectFail(c.post('/auth/register', { invite_code: 'MC-WRONG0', email, password: 'password1', name, nickname: name, agree_terms: true, agree_privacy: true }, { as: key }), 400, 'bad code');
  await expectFail(c.post('/auth/register', { invite_code: dec.invite_code, email, password: 'password1', name, nickname: name }, { as: key }), 400, 'register needs terms consent');
  await expectOk(c.post('/auth/register', { invite_code: dec.invite_code.toLowerCase(), email, password: 'password1', name, nickname: name, agree_terms: true, agree_privacy: true }, { as: key }), 'register ' + key);
  await expectFail(c.post('/auth/register', { invite_code: dec.invite_code, email, password: 'password1', name, nickname: name, agree_terms: true, agree_privacy: true }, { as: key + '2' }), 400, 'code reuse blocked');
  let me = await expectOk(c.get('/me', { as: key }));
  eq([me.level, me.onboarded], ['L0', 0], 'new member L0');
  await expectFail(c.get('/groups', { as: key }), 403, 'L0 cannot see groups');
  await expectFail(c.post('/me/onboarding', { agree: true, quiz: { q1: 'a', q2: 'a', q3: 'b' } }, { as: key }), 400, 'wrong quiz');
  await expectOk(c.post('/me/onboarding', { agree: true, quiz: { q1: 'b', q2: 'a', q3: 'b' } }, { as: key }), 'onboarding');
  me = await expectOk(c.get('/me', { as: key }));
  eq(me.level, 'L1', 'onboarded → L1');
  if (level && level !== 'L1') {
    await expectOk(c.post(`/admin/users/${me.id}`, { level, reason: '테스트 등급 조정' }, { as: 'admin' }));
    me = await expectOk(c.get('/me', { as: key }));
    eq(me.level, level);
  }
  return me;
}
const A = await join('a', '리더A', 'L4');
const B = await join('b', '메이커B', 'L2');
const C = await join('c', '메이커C', 'L2');
const D = await join('d', '메이커D', 'L2');
const E = await join('e', '챌린저E', 'L1');
const F = await join('f', '어치버F', 'L3');
console.log('가입·온보딩 ok');

// 로그인/로그아웃
await expectFail(c.post('/auth/login', { email: 'a@test.kr', password: 'wrong' }, { as: 'tmp' }), 401);
await expectOk(c.post('/auth/login', { email: 'a@test.kr', password: 'password1' }, { as: 'tmp' }));
await expectOk(c.post('/auth/logout', {}, { as: 'tmp' }));
await expectFail(c.get('/me', { as: 'tmp' }), 401, 'logged out');

// 한국 시각 문자열 (분 단위로 앞뒤로 옮김)
const kstAt = min => new Date(Date.now() + 9 * 3600e3 + min * 60e3).toISOString().slice(0, 16);
const DAY = 24 * 60;

// 2. 모집 시즌 + 그룹리더 신청·승인
const round = await expectOk(c.post('/admin/rounds', { name: '2026 겨울 시즌', start_date: today, end_date: '2027-02-01', status: 'open' }, { as: 'admin' }));
await expectFail(c.post('/groups', { type: 'challenge', title: 'x', field_code: 'S-01', summary: 'x' }, { as: 'b' }), 403, 'not approved leader cannot create');
await expectFail(c.post('/me/leader', { kind: 'challenge', topic: '', plan: 'x' }, { as: 'a' }), 400, 'leader application needs topic');
const la = await expectOk(c.post('/me/leader', { kind: 'challenge', topic: '동네 가게 인스타 운영 대행', plan: '주 1회 온라인 모임, 8주 안에 첫 고객 1곳', experience: '마케팅 3년', time: '주 6시간', field_code: 'S-04' }, { as: 'a' }));
await expectFail(c.post('/me/leader', { kind: 'study', topic: 'x', plan: 'y' }, { as: 'a' }), 400, 'duplicate pending application');
eq((await expectOk(c.get('/me/leader', { as: 'a' }))).application.status, 'pending');
const ql = await expectOk(c.get('/admin/leaders', { as: 'admin' }));
ok(ql.applications.length === 1 && ql.applications[0].form.topic === '동네 가게 인스타 운영 대행', 'leader queue');
await expectFail(c.post(`/admin/leader-applications/${la.id}`, { decision: 'reject' }, { as: 'admin' }), 400, 'reject needs note');
await expectFail(c.post(`/admin/leader-applications/${la.id}`, { decision: 'approve' }, { as: 'b' }), 403, 'member cannot approve');
await expectOk(c.post(`/admin/leader-applications/${la.id}`, { decision: 'approve', note: '첫 그룹 응원합니다' }, { as: 'admin' }));
await expectFail(c.post(`/admin/leader-applications/${la.id}`, { decision: 'approve' }, { as: 'admin' }), 400, 'already decided');
eq((await expectOk(c.get('/me', { as: 'a' }))).can_lead, true, 'A can lead');
await expectOk(c.post(`/admin/users/${C.id}/leader`, { on: true, reason: '정기모임 발제 3회' }, { as: 'admin' }), 'grant leader directly');
console.log('그룹리더 승인 ok');

// 3. 그룹 만들기 · 참여
const policy = { min_rate: 70, late_minutes: 10, late_per_absence: 2, warn_absences: 2, warn_on_low_rate: true, rate_after: 2, kick_warnings: 2, auto_remove: false, excuse: true, excuse_limit: 1, checkin_before: 30 };
await expectFail(c.post('/groups', { type: 'challenge', title: '', field_code: 'S-04', summary: 'x' }, { as: 'a' }), 400, 'title required');
await expectFail(c.post('/groups', { type: 'party', title: 'x', field_code: 'S-04', summary: 'x' }, { as: 'a' }), 400, 'bad type');
await expectFail(c.post('/groups', { type: 'challenge', title: 'x', field_code: 'S-04', summary: 'x', chat_url: 'kakao' }, { as: 'a' }), 400, 'chat url must be link');
const g1 = await expectOk(c.post('/groups', {
  type: 'challenge', title: '동네 가게 인스타 운영 대행', field_code: 'S-04', summary: '동네 가게 3곳의 인스타를 대신 운영해 보고 첫 고객을 만든다',
  description: '매주 화요일 21시 온라인으로 모여 진행을 공유합니다.', goal_text: '8주 안에 유료 고객 1곳, 매출 30만 원', goal_metric: 'revenue', goal_target: 300000,
  start_date: today, end_date: '2027-01-20', schedule_text: '매주 화 21시 온라인', capacity: 5, join_mode: 'approval', chat_url: 'https://open.kakao.com/o/test', policy,
  milestones: [{ title: '가게 사장님 5명 인터뷰', due_date: today }, { title: '첫 제안서 발송' }],
}, { as: 'a' }));
const g2 = await expectOk(c.post('/groups', { type: 'study', title: 'AI 자동화 스터디', field_code: 'S-06', summary: '업무 자동화 도구를 하나씩 써 보고 정리한다', join_mode: 'open', capacity: 6,
  policy: { warn_absences: 1, kick_warnings: 1, auto_remove: true, min_rate: 0 } }, { as: 'a' }));
await expectFail(c.post('/groups', { type: 'study', title: '세 번째', field_code: 'S-01', summary: 'x' }, { as: 'a' }), 400, 'leader max groups');
const list = await expectOk(c.get('/groups', { as: 'e' }));
ok(list.length === 2 && list.find(x => x.id === g1.id).type_name === '도전그룹' && list.find(x => x.id === g2.id).type_name === '학습그룹', 'group list');
eq((await expectOk(c.get('/groups?type=study', { as: 'e' }))).length, 1, 'type filter');
const g1v = await expectOk(c.get(`/groups/${g1.id}`, { as: 'e' }));
ok(g1v.group.chat_url === null && g1v.join.can && g1v.join.mode === 'approval' && g1v.milestones.length === 2 && g1v.goal.target === 300000 && g1v.group.policy.min_rate === 70, 'outsider view hides chat link');
for (const k of ['b', 'd', 'e', 'f']) eq((await expectOk(c.post(`/groups/${g1.id}/join`, { note: '함께하고 싶습니다' }, { as: k }))).status, 'applied', 'apply ' + k);
await expectFail(c.post(`/groups/${g1.id}/join`, {}, { as: 'b' }), 400, 'already applied');
await expectFail(c.post(`/groups/${g1.id}/members/${B.id}`, { action: 'approve' }, { as: 'd' }), 403, 'applicant cannot approve');
const apView = await expectOk(c.get(`/groups/${g1.id}`, { as: 'a' }));
eq(apView.applicants.length, 4, 'leader sees applicants');
for (const u of [B, D, E, F]) await expectOk(c.post(`/groups/${g1.id}/members/${u.id}`, { action: 'approve' }, { as: 'a' }));
eq((await c.post(`/groups/${g1.id}/join`, {}, { as: 'c' })).status, 400, 'group full (capacity 5)');
eq((await expectOk(c.post(`/groups/${g2.id}/join`, {}, { as: 'c' }))).status, 'active', 'open group joins directly');
await expectOk(c.post(`/groups/${g1.id}/leave`, { note: '회사 일이 바빠졌습니다' }, { as: 'f' }));
await expectFail(c.post(`/groups/${g1.id}/leave`, {}, { as: 'a' }), 400, 'leader cannot leave');
await expectOk(c.post(`/groups/${g1.id}/members/${B.id}`, { action: 'role', role: 'sub' }, { as: 'a' }));
await expectFail(c.post(`/groups/${g1.id}/members/${D.id}`, { action: 'role', role: 'sub' }, { as: 'b' }), 403, 'sub cannot change roles');
await expectOk(c.post(`/groups/${g1.id}/stage`, { stage: 'active' }, { as: 'a' }));
await expectFail(c.post(`/groups/${g1.id}/stage`, { stage: 'stopped' }, { as: 'a' }), 403, 'leader cannot stop');
const g1m = await expectOk(c.get(`/groups/${g1.id}`, { as: 'd' }));
ok(g1m.group.chat_url && g1m.me.is_member && !g1m.me.is_manager && g1m.members.length === 4, 'member view');
// 과거 모임 출석을 시험하려고 가입 시각을 앞당긴다
db.db.exec(`UPDATE group_members SET joined_at = datetime('now','-10 days') WHERE challenge_id IN (${g1.id}, ${g2.id})`);
console.log('그룹 만들기·참여 ok');

// 4. 모임 일정 · 출석 · 경고 · 퇴출
await expectFail(c.post(`/groups/${g1.id}/sessions`, { title: '주간 모임', starts_at: kstAt(60) }, { as: 'd' }), 403, 'member cannot add session');
await expectFail(c.post(`/groups/${g1.id}/sessions`, { title: '주간 모임', starts_at: '내일 9시' }, { as: 'a' }), 400, 'bad datetime');
const past = await expectOk(c.post(`/groups/${g1.id}/sessions`, { title: '주간 모임', starts_at: kstAt(-6 * DAY), mode: 'online', place: 'https://meet.example.com/x', agenda: '이번 주 진행 공유', repeat_weeks: 0 }, { as: 'b' }));
const s = [past.ids[0]];
for (const d of [5, 4, 3]) s.push((await expectOk(c.post(`/groups/${g1.id}/sessions`, { title: '주간 모임', starts_at: kstAt(-d * DAY), mode: 'offline', place: '성수 카페' }, { as: 'a' }))).ids[0]);
const fut = await expectOk(c.post(`/groups/${g1.id}/sessions`, { title: '정기 점검', starts_at: kstAt(3 * DAY), repeat_weeks: 1 }, { as: 'a' }));
eq(fut.ids.length, 2, 'repeat weekly creates 2');
ok((await expectOk(c.get('/me/notifications', { as: 'd' }))).some(n => n.title.includes('모임 일정')), 'members notified of sessions');
// 참석 예정·불참 알림
await expectFail(c.post(`/groups/${g1.id}/sessions/${fut.ids[0]}/rsvp`, { rsvp: 'no' }, { as: 'd' }), 400, 'absence needs reason');
eq((await expectOk(c.post(`/groups/${g1.id}/sessions/${fut.ids[0]}/rsvp`, { rsvp: 'no', note: '출장' }, { as: 'd' }))).excuse, true, 'early notice can be excused');
await expectOk(c.post(`/groups/${g1.id}/sessions/${fut.ids[0]}/rsvp`, { rsvp: 'yes' }, { as: 'e' }));
await expectFail(c.post(`/groups/${g1.id}/sessions/${fut.ids[1]}/open`, {}, { as: 'a' }), 400, 'cannot open far-future session');
await expectFail(c.post(`/groups/${g1.id}/sessions/${fut.ids[0]}/close`, {}, { as: 'a' }), 400, 'cannot close before start');
// 1회차: B 코드 입력(지각), E 공결(리더 표시), D 미표시 → 결석
await expectFail(c.post(`/groups/${g1.id}/sessions/${s[0]}/checkin`, { code: '0000' }, { as: 'b' }), 400, 'not open yet');
const op = await expectOk(c.post(`/groups/${g1.id}/sessions/${s[0]}/open`, {}, { as: 'a' }));
ok(/^\d{4}$/.test(op.code), 'attendance code');
await expectFail(c.post(`/groups/${g1.id}/sessions/${s[0]}/checkin`, { code: op.code === '0000' ? '1111' : '0000' }, { as: 'b' }), 400, 'wrong code');
eq((await expectOk(c.post(`/groups/${g1.id}/sessions/${s[0]}/checkin`, { code: op.code }, { as: 'b' }))).status, 'late', 'late after 10 minutes');
eq((await expectOk(c.post(`/groups/${g1.id}/sessions/${s[0]}/checkin`, { code: op.code }, { as: 'b' }))).already, true, 'checkin idempotent');
await expectFail(c.post(`/groups/${g1.id}/sessions/${s[0]}/mark`, { user_id: E.id, status: 'excused' }, { as: 'd' }), 403, 'member cannot mark');
await expectOk(c.post(`/groups/${g1.id}/sessions/${s[0]}/mark`, { user_id: E.id, status: 'excused' }, { as: 'a' }));
await expectFail(c.post(`/groups/${g1.id}/sessions/${s[0]}/mark`, { user_id: E.id, status: 'sleep' }, { as: 'a' }), 400, 'bad status');
const c1 = await expectOk(c.post(`/groups/${g1.id}/sessions/${s[0]}/close`, {}, { as: 'b' }));
eq(c1.warned.length, 0, 'no warning yet');
await expectFail(c.post(`/groups/${g1.id}/sessions/${s[0]}/close`, {}, { as: 'a' }), 400, 'already closed');
eq(db.db.prepare('SELECT status FROM session_attendance WHERE session_id = ? AND user_id = ?').get(s[0], D.id).status, 'absent', 'unmarked → absent');
// 2회차: B 지각, E 출석, D 결석 → D 연속 결석 2회 + 출석률 미달 경고, B는 지각 2회 = 결석 1회로 출석률 50% 경고
await expectOk(c.post(`/groups/${g1.id}/sessions/${s[1]}/open`, {}, { as: 'a' }));
const code2 = db.db.prepare('SELECT code FROM group_sessions WHERE id = ?').get(s[1]).code;
await expectOk(c.post(`/groups/${g1.id}/sessions/${s[1]}/checkin`, { code: code2 }, { as: 'b' }));
await expectOk(c.post(`/groups/${g1.id}/sessions/${s[1]}/mark`, { user_id: E.id, status: 'present' }, { as: 'a' }));
const c2 = await expectOk(c.post(`/groups/${g1.id}/sessions/${s[1]}/close`, {}, { as: 'a' }));
ok(c2.warned.some(w => w.user_id === D.id) && c2.warned.some(w => w.user_id === B.id) && c2.kick.length === 0, 'warnings on 2nd session');
ok(db.db.prepare('SELECT reason FROM group_warnings WHERE user_id = ? AND challenge_id = ?').get(D.id, g1.id).reason.includes('연속 결석 2회'), 'streak reason');
ok((await expectOk(c.get('/me/notifications', { as: 'd' }))).some(n => n.title.includes('출석 경고 1회')), 'warning notified');
// 3회차: D 결석(연속 3회 → 새 경고 없음), E 출석
await expectOk(c.post(`/groups/${g1.id}/sessions/${s[2]}/open`, {}, { as: 'a' }));
await expectOk(c.post(`/groups/${g1.id}/sessions/${s[2]}/mark`, { user_id: E.id, status: 'present' }, { as: 'a' }));
await expectOk(c.post(`/groups/${g1.id}/sessions/${s[2]}/mark`, { user_id: B.id, status: 'late' }, { as: 'a' }));
eq((await expectOk(c.post(`/groups/${g1.id}/sessions/${s[2]}/close`, {}, { as: 'a' }))).warned.length, 0, 'no repeated warning');
// 4회차: D 연속 4회 → 경고 2회 → 퇴출 대상 (자동 퇴출 꺼짐)
await expectOk(c.post(`/groups/${g1.id}/sessions/${s[3]}/open`, {}, { as: 'a' }));
await expectOk(c.post(`/groups/${g1.id}/sessions/${s[3]}/mark`, { user_id: E.id, status: 'present' }, { as: 'a' }));
await expectOk(c.post(`/groups/${g1.id}/sessions/${s[3]}/mark`, { user_id: B.id, status: 'late' }, { as: 'a' }));
const c4 = await expectOk(c.post(`/groups/${g1.id}/sessions/${s[3]}/close`, {}, { as: 'a' }));
ok(c4.kick.length === 1 && c4.kick[0].user_id === D.id && !c4.kick[0].removed, 'kick candidate');
ok((await expectOk(c.get('/me/notifications', { as: 'a' }))).some(n => n.title.includes('퇴출 기준')), 'leader told about kick candidate');
const lv = await expectOk(c.get(`/groups/${g1.id}`, { as: 'a' }));
const dm = lv.members.find(m => m.user_id === D.id), bm = lv.members.find(m => m.user_id === B.id), em = lv.members.find(m => m.user_id === E.id);
ok(dm.attendance.streak === 4 && dm.attendance.rate === 0 && dm.warnings === 2, 'D stats');
ok(bm.attendance.late === 4 && bm.attendance.late_as_absence === 2 && bm.attendance.rate === 50 && bm.warnings === 1, 'B late conversion');
ok(em.attendance.excused === 1 && em.attendance.rate === 100, 'E excused not counted');
ok(lv.kick_candidates.length === 1 && lv.matrix.sessions.length === 4 && lv.matrix.cells.length >= 12, 'leader matrix');
eq(db.db.prepare("SELECT COUNT(*) AS c FROM points_ledger WHERE user_id = ? AND action = 'group_attend'").get(E.id).c, 2, 'attendance points (daily cap 2)');
// 경고 취소 · 퇴출 · 이의 신청
const bw = lv.warnings.find(w => w.user_id === B.id);
await expectOk(c.post(`/groups/${g1.id}/members/${B.id}`, { action: 'clear_warning', warning_id: bw.id }, { as: 'a' }));
await expectFail(c.post(`/groups/${g1.id}/members/${E.id}`, { action: 'warn' }, { as: 'a' }), 400, 'manual warning needs reason');
await expectOk(c.post(`/groups/${g1.id}/members/${E.id}`, { action: 'warn', reason: '자료 공유 약속을 두 번 지키지 않음' }, { as: 'b' }));
await expectFail(c.post(`/groups/${g1.id}/members/${D.id}`, { action: 'remove' }, { as: 'a' }), 400, 'remove needs reason');
await expectFail(c.post(`/groups/${g1.id}/members/${D.id}`, { action: 'remove', reason: 'x' }, { as: 'b' }), 403, 'sub cannot remove');
await expectFail(c.post(`/groups/${g1.id}/appeal`, { note: 'x' }, { as: 'd' }), 400, 'appeal only after removal');
await expectOk(c.post(`/groups/${g1.id}/members/${D.id}`, { action: 'remove', reason: '출석 경고 2회 (연속 결석 4회)' }, { as: 'a' }));
eq(db.db.prepare('SELECT status, leave_type FROM group_members WHERE challenge_id = ? AND user_id = ?').get(g1.id, D.id), { status: 'removed', leave_type: 'leader' }, 'D removed');
await expectFail(c.post(`/groups/${g1.id}/logs`, { body: 'x' }, { as: 'd' }), 403, 'removed member cannot write');
await expectOk(c.post(`/groups/${g1.id}/appeal`, { note: '출장 일정이 겹쳤는데 미리 말씀드리지 못했습니다' }, { as: 'd' }));
await expectFail(c.post(`/groups/${g1.id}/appeal`, { note: '다시' }, { as: 'd' }), 400, 'duplicate appeal');
// 학습그룹: 결석 1회 경고 1회 → 자동 퇴출
const gs = await expectOk(c.post(`/groups/${g2.id}/sessions`, { title: '도구 실습', starts_at: kstAt(-2 * DAY) }, { as: 'a' }));
await expectOk(c.post(`/groups/${g2.id}/sessions/${gs.ids[0]}/open`, {}, { as: 'a' }));
const ac = await expectOk(c.post(`/groups/${g2.id}/sessions/${gs.ids[0]}/close`, {}, { as: 'a' }));
ok(ac.kick.length === 1 && ac.kick[0].removed && ac.kick[0].user_id === C.id, 'auto removal');
eq(db.db.prepare('SELECT leave_type FROM group_members WHERE challenge_id = ? AND user_id = ?').get(g2.id, C.id).leave_type, 'attendance');
const rj = await expectOk(c.post(`/groups/${g2.id}/join`, { note: '다시 열심히 하겠습니다' }, { as: 'c' }));
eq(rj.status, 'applied', 'removed member re-joins via approval even in open group');
await expectOk(c.post(`/groups/${g2.id}/members/${C.id}`, { action: 'approve' }, { as: 'a' }));
// 열어 두고 잊은 출석은 끝난 뒤 12시간이 지나면 자동 마감
const old = await expectOk(c.post(`/groups/${g2.id}/sessions`, { title: '저녁 실습', starts_at: kstAt(-20 * 60), duration_min: 60 }, { as: 'a' }));
await expectOk(c.post(`/groups/${g2.id}/sessions/${old.ids[0]}/open`, {}, { as: 'a' }));
await expectOk(c.get(`/groups/${g2.id}`, { as: 'a' }));
eq(db.db.prepare('SELECT status FROM group_sessions WHERE id = ?').get(old.ids[0]).status, 'closed', 'auto closed');
console.log('모임·출석·경고·퇴출 ok');

// 5. 도전 기록 · 공지 · 공유 · 마일스톤 · 성과
await expectFail(c.post(`/groups/${g1.id}/logs`, { kind: 'notice', body: '공지' }, { as: 'e' }), 403, 'notice by managers only');
const nt = await expectOk(c.post(`/groups/${g1.id}/logs`, { kind: 'notice', body: '다음 주는 오프라인으로 모입니다', pinned: true }, { as: 'a' }));
const lg = await expectOk(c.post(`/groups/${g1.id}/logs`, { kind: 'progress', body: '사장님 3분 인터뷰 완료\n세 분 모두 사진 촬영을 가장 귀찮아하셨어요', link: 'https://example.com/note', share: true }, { as: 'e' }));
ok(lg.post_id, 'shared to community');
await expectFail(c.post(`/groups/${g1.id}/logs`, { body: 'x', link: 'ftp://x' }, { as: 'e' }), 400, 'link must be http');
const lg2 = await expectOk(c.post(`/groups/${g1.id}/logs`, { kind: 'study', body: '인스타 릴스 편집 도구 비교 정리' }, { as: 'b' }));
const gp = await expectOk(c.get(`/posts?board=group`, { as: 'f' }));
ok(gp.some(p => p.id === lg.post_id && p.group_title === '동네 가게 인스타 운영 대행'), 'group board post');
eq((await expectOk(c.post(`/groups/${g1.id}/logs/${lg.id}`, { action: 'cheer' }, { as: 'c' }))).on, true, 'cheer from another group');
const outside = await expectOk(c.get(`/groups/${g1.id}`, { as: 'c' }));
ok(outside.logs.every(l => l.post_id || l.kind === 'notice') && outside.logs.some(l => l.id === lg.id) && !outside.logs.some(l => l.id === lg2.id), 'non-member sees shared logs only');
ok(!outside.members[0].attendance && !outside.sessions.some(x => x.place), 'non-member sees no attendance or meeting place');
ok((await expectOk(c.get(`/groups/${g1.id}`, { as: 'f' }))).logs.some(l => l.id === lg2.id), 'L3 sees all group logs');
await expectFail(c.post(`/groups/${g1.id}/logs/${lg2.id}`, { action: 'share' }, { as: 'e' }), 403, 'only author shares');
await expectOk(c.post(`/groups/${g1.id}/logs/${lg2.id}`, { action: 'delete' }, { as: 'a' }), 'leader deletes log');
const ms = (await expectOk(c.get(`/groups/${g1.id}`, { as: 'a' }))).milestones;
await expectOk(c.post(`/groups/${g1.id}/milestones/${ms[0].id}`, { action: 'done', evidence: '인터뷰 메모 링크' }, { as: 'b' }));
await expectOk(c.post(`/groups/${g1.id}/milestones`, { title: '첫 유료 계약', due_date: '2027-01-10' }, { as: 'a' }));
await expectFail(c.post(`/groups/${g1.id}/results`, { metric: 'revenue', value: 0 }, { as: 'e' }), 400, 'result value > 0');
await expectFail(c.post(`/groups/${g1.id}/results`, { metric: 'revenue', value: 1000, happened_on: '2099-01-01' }, { as: 'e' }), 400, 'future date');
await expectFail(c.post(`/groups/${g1.id}/results`, { metric: 'custom', value: 3 }, { as: 'e' }), 400, 'custom needs label');
const rs = await expectOk(c.post(`/groups/${g1.id}/results`, { metric: 'revenue', value: 120000, label: '꽃집 한 달 운영 대행', evidence: 'https://example.com/receipt', share: true }, { as: 'e' }));
await expectOk(c.post(`/groups/${g1.id}/results`, { metric: 'customers', value: 1, label: '꽃집' }, { as: 'b' }));
const gr = await expectOk(c.get(`/groups/${g1.id}`, { as: 'e' }));
ok(gr.goal.value === 120000 && Math.abs(gr.goal.ratio - 0.4) < 1e-9 && gr.result_totals.length === 2, 'goal progress');
ok((await expectOk(c.get('/admin/results', { as: 'admin' }))).some(r => r.id === rs.id), 'revenue waits for check');
await expectFail(c.post(`/groups/${g1.id}/results/${rs.id}`, { action: 'verify' }, { as: 'a' }), 403, 'leader cannot verify');
const vr = await expectOk(c.post(`/groups/${g1.id}/results/${rs.id}`, { action: 'verify' }, { as: 'admin' }));
eq(vr.granted.sort(), [A.id, B.id, E.id].sort(), 'first sale badges to active members');
await expectFail(c.post(`/groups/${g1.id}/results/${rs.id}`, { action: 'delete' }, { as: 'e' }), 400, 'verified result locked');
ok((await c.get('/public/stats')).data.first_sales === 3, 'public first sales');
ok((await expectOk(c.get('/groups', { as: 'f' }))).find(x => x.id === g1.id).goal_value === 120000, 'list goal value');
console.log('기록·공유·성과 ok');

// 6. 그룹 종료 · 완주 · 프로젝트 페이퍼
const done = await expectOk(c.post(`/groups/${g1.id}/stage`, { stage: 'closed' }, { as: 'a' }));
const byId = Object.fromEntries(done.completion.map(x => [x.user_id, x]));
ok(byId[A.id].completed && byId[E.id].completed && !byId[B.id].completed, 'completion by attendance rule');
eq(db.db.prepare("SELECT COUNT(*) AS c FROM badges WHERE user_id = ? AND code IN ('completion','leader_completion')").get(A.id).c, 2, 'leader gets both badges');
eq(db.db.prepare("SELECT COUNT(*) AS c FROM group_sessions WHERE challenge_id = ? AND status = 'cancelled'").get(g1.id).c, 2, 'future sessions cancelled on close');
await expectFail(c.post(`/groups/${g1.id}/stage`, { stage: 'active' }, { as: 'a' }), 400, 'leader cannot reopen');
const pf = await expectOk(c.get(`/groups/${g1.id}/paper/prefill`, { as: 'a' }));
ok(pf.revenue_external === 120000 && pf.sessions === 4 && pf.customers_count === 1 && pf.milestones.length === 1, 'paper prefill');
await expectFail(c.post(`/groups/${g1.id}/paper`, { form: {} }, { as: 'e' }), 403, 'paper by leader');
const pp = await expectOk(c.post(`/groups/${g1.id}/paper`, { form: { pain: '가게 사장님들이 SNS 사진 찍을 시간이 없다', product: '월 4회 촬영과 게시 대행', revenue_external: 120000, customers: 1, hours: 60, state: 'ongoing', good: ['인터뷰를 먼저 했다'], bad: ['가격을 늦게 정했다'] }, publish_scope: 'public', submit: true }, { as: 'a' }));
await expectOk(c.post(`/admin/papers/${pp.id}/review`, { decision: 'approve', note: '좋습니다' }, { as: 'admin' }));
const pubPapers = (await c.get('/public/papers')).data;
ok(pubPapers.some(x => x.id === pp.id && x.summary.has_sales), 'public paper');
const pv = await expectOk(c.get(`/papers/${pp.id}`, { as: 'c' }));
ok(pv.full === false || pv.full === true, 'paper view');
console.log('완주·페이퍼 ok');

// 7. 정기모임 · 발제 · 성과발표회
const ev = await expectOk(c.post('/admin/events', { type: 'regular', title: '12월 정기모임', starts_at: kstAt(10 * DAY).replace('T', ' ') + ':00', location: '서울 성수', mode: 'hybrid', online_url: 'https://meet.example.com/regular', topics: ['idea', 'ai', 'nope'], attendance_code: 'MD12' }, { as: 'admin' }));
const showcase = await expectOk(c.post('/admin/events', { type: 'showcase', title: '겨울 성과발표회', starts_at: kstAt(20 * DAY).replace('T', ' ') + ':00', location: '서울 성수' }, { as: 'admin' }));
await expectOk(c.post(`/events/${ev.id}/register`, {}, { as: 'e' }));
const evE = await expectOk(c.get('/events', { as: 'e' }));
const evRow = evE.events.find(x => x.id === ev.id);
ok(evRow.online_url === 'https://meet.example.com/regular' && evRow.topics === 'idea,ai' && evRow.topic_names.includes('AI 활용') && evRow.type_name === '정기모임' && !('attendance_code' in evRow), 'event for registered member');
eq((await expectOk(c.get('/events', { as: 'b' }))).events.find(x => x.id === ev.id).online_url, null, 'online link hidden for unregistered');
const tp1 = await expectOk(c.post(`/events/${ev.id}/presentations`, { title: '요즘 뜨는 AI 상세페이지 도구 3가지' }, { as: 'b' }));
await expectFail(c.post(`/events/${ev.id}/presentations`, { title: '두 번째' }, { as: 'b' }), 400, 'one presentation per event');
await expectFail(c.post(`/events/${showcase.id}/presentations`, { title: '개인 발표' }, { as: 'b' }), 400, 'showcase needs group');
await expectFail(c.post(`/events/${showcase.id}/presentations`, { title: '그룹 발표', challenge_id: g1.id }, { as: 'e' }), 403, 'showcase by group manager');
const sp = await expectOk(c.post(`/events/${showcase.id}/presentations`, { title: '동네 가게 인스타 대행 8주 이야기', challenge_id: g1.id }, { as: 'a' }));
await expectOk(c.post(`/admin/presentations/${tp1.id}`, { status: 'confirmed' }, { as: 'admin' }));
await expectOk(c.post(`/admin/presentations/${tp1.id}`, { status: 'presented' }, { as: 'admin' }));
await expectOk(c.post(`/admin/presentations/${tp1.id}`, { status: 'presented' }, { as: 'admin' }));
eq(db.db.prepare("SELECT COUNT(*) AS c FROM points_ledger WHERE user_id = ? AND action = 'topic_present'").get(B.id).c, 1, 'presentation points once');
ok((await expectOk(c.get('/events', { as: 'f' }))).events.find(x => x.id === ev.id).presentations.some(p => p.id === tp1.id), 'confirmed presentation visible');
ok((await expectOk(c.get(`/admin/events/${showcase.id}`, { as: 'admin' }))).presentations.some(p => p.id === sp.id && p.group_title), 'admin sees showcase signups');
{ const q = await expectOk(c.get('/admin/presentations', { as: 'admin' }));
  ok(q.some(p => p.id === sp.id && p.event_title && p.group_title) && !q.some(p => p.id === tp1.id), 'admin presentation queue (presented ones drop out)');
  await expectFail(c.get('/admin/presentations', { as: 'b' }), 403, 'presentation queue staff only'); }
{ const mk = await expectOk(c.get(`/groups/${g1.id}/sessions/${(await expectOk(c.get(`/groups/${g1.id}`, { as: 'a' }))).sessions[0].id}/marks`, { as: 'a' }));
  ok(Array.isArray(mk), 'session marks for manager'); }
await expectFail(c.post(`/events/${ev.id}/attend`, { code: 'WRONG' }, { as: 'e' }), 400, 'wrong attendance code');
await expectOk(c.post(`/events/${ev.id}/attend`, { code: 'md12' }, { as: 'e' }));
console.log('정기모임·발표 ok');

// 8. 커뮤니티 · 피드 · 설정 · 대시보드
await expectFail(c.post('/posts', { board: 'share', title: '월 300 보장 방법', body: '이 방법이면 수익 보장됩니다' }, { as: 'b' }), 400, 'banned phrase');
await expectFail(c.post('/posts', { board: 'notice', title: 'x', body: 'y' }, { as: 'b' }), 403, 'notice staff only');
await expectFail(c.post('/posts', { board: 'group', title: 'x', body: 'y' }, { as: 'b' }), 400, 'group board needs group');
await expectFail(c.post('/posts', { board: 'group', title: 'x', body: 'y', challenge_id: g2.id }, { as: 'b' }), 403, 'only own group');
const po = await expectOk(c.post('/posts', { board: 'question', title: '첫 계약서 양식 어떻게 쓰셨나요?', body: '카페 사장님과 구두로만 합의했는데 문서가 필요할까요?' }, { as: 'c' }));
const idea = await expectOk(c.post('/posts', { board: 'idea', title: '동네 사진관 예약 대행 어떨까요', body: '사장님들이 예약 관리를 힘들어합니다' }, { as: 'e' }));
await expectOk(c.post(`/posts/${po.id}/comments`, { body: '간단한 1장짜리 확인서라도 쓰는 게 좋았습니다' }, { as: 'b' }));
await expectFail(c.post(`/posts/${po.id}/helpful`, {}, { as: 'c' }), 400, 'self helpful');
eq((await expectOk(c.post(`/posts/${po.id}/helpful`, {}, { as: 'd' }))).on, true);
const pview = await expectOk(c.get(`/posts/${po.id}`, { as: 'e' }));
eq([pview.helpful_count, pview.comments.length], [1, 1]);
const feed = await expectOk(c.get('/feed', { as: 'e' }));
ok(feed.some(f => f.kind === 'group') && feed.some(f => f.kind === 'post') && feed.some(f => f.kind === 'badge'), 'feed kinds');
await expectFail(c.put('/admin/settings', { key: 'levels', value: { L2: { points: 30 } } }, { as: 'admin' }), 400, 'settings change needs reason');
await expectOk(c.put('/admin/settings', { key: 'levels', value: { L2: { points: 30, require_asset_diag: true, require_event: 1, min_days: 0 } }, reason: '테스트용 조건 완화' }, { as: 'admin' }));
await expectFail(c.put('/admin/settings', { key: 'presets', value: {}, reason: 'x' }, { as: 'admin' }), 400, 'revenue presets gone');
eq((await c.get('/public/levels')).data.rules.L2.points, 30, 'settings override visible');
const diag = await expectOk(c.post('/me/asset-diag', { time: '주 6시간', skills: '사진, 엑셀' }, { as: 'e' }));
eq(diag.promoted, true, 'auto promotion to L2 after conditions met');
eq((await c.get('/me', { as: 'e' })).data.level, 'L2');
const dash = await expectOk(c.get('/admin/dashboard', { as: 'admin' }));
ok(dash.first_sales === 3 && dash.completions >= 2 && dash.queues.applications === 0 && dash.kpi.sessions_30d >= 4 && dash.kpi.attendance_rate_30d !== null && dash.queues.disputes >= 1 && dash.queues.presentations >= 1, 'admin dashboard');
ok((await expectOk(c.get('/admin/audit', { as: 'admin' }))).rows.length > 10, 'audit log');
await expectFail(c.get('/admin/audit', { as: 'b' }), 403, 'staff only');
// 회원 대시보드: 다가오는 모임 참석 여부, 리더 할 일
const g3 = await expectOk(c.post('/groups', { type: 'study', title: '상세페이지 글쓰기 스터디', field_code: 'S-01', summary: '매주 한 편씩 써 보고 서로 고친다', join_mode: 'open' }, { as: 'c' }));
await expectOk(c.post(`/groups/${g3.id}/join`, {}, { as: 'b' }));
await expectOk(c.post(`/groups/${g3.id}/sessions`, { title: '첫 모임', starts_at: kstAt(2 * DAY) }, { as: 'c' }));
const dB = await expectOk(c.get('/dashboard', { as: 'b' }));
ok(dB.me && dB.groups.some(g => g.id === g3.id && g.next_session) && dB.tasks.some(t => t.type === 'rsvp') && Array.isArray(dB.feed), 'member dashboard');
await expectOk(c.post(`/groups/${g3.id}/join`, {}, { as: 'd' }));
const dC = await expectOk(c.get('/dashboard', { as: 'c' }));
ok(dC.groups.find(g => g.id === g3.id).role === 'leader', 'leader dashboard');
console.log('커뮤니티·피드·설정·대시보드 ok');

// 9. 비밀번호 변경 · 임시 비밀번호
await expectFail(c.put('/me/password', { current: 'wrong', next: 'newpass123' }, { as: 'c' }), 400, 'wrong current password');
await expectOk(c.put('/me/password', { current: 'password1', next: 'newpass123' }, { as: 'c' }));
await expectFail(c.post('/auth/login', { email: 'c@test.kr', password: 'password1' }, { as: 'c2' }), 401, 'old password rejected');
await expectOk(c.post('/auth/login', { email: 'c@test.kr', password: 'newpass123' }, { as: 'c2' }));
const tp = await expectOk(c.post(`/admin/users/${C.id}`, { temp_password: true }, { as: 'admin' }));
ok(/^mc[0-9a-f]{8}$/.test(tp.temp_password), 'temp password issued');
await expectFail(c.get('/me', { as: 'c2' }), 401, 'sessions cleared after temp password');
await expectOk(c.post('/auth/login', { email: 'c@test.kr', password: tp.temp_password }, { as: 'c3' }));
console.log('비밀번호 ok');

// 12. v1.1 — 동의 기록 · 로그인 시도 제한 · CSV 내려받기 · 회원 탈퇴
const consentRows = db.db.prepare("SELECT subject_type, kind, COUNT(*) AS c FROM consents GROUP BY subject_type, kind ORDER BY subject_type, kind").all().map(r => `${r.subject_type}:${r.kind}:${r.c}`);
eq(consentRows, ['application:privacy:6', 'application:public_results:6', 'user:privacy:6', 'user:terms:6'], 'consents recorded');
for (let i = 0; i < 10; i++) await expectFail(c.post('/auth/login', { email: 'f@test.kr', password: 'nope' + i }, { as: 'rl' }), 401, 'wrong pw ' + i);
await expectFail(c.post('/auth/login', { email: 'f@test.kr', password: 'password1' }, { as: 'rl' }), 429, 'rate limited after 10 failures');
db.db.exec("UPDATE login_attempts SET created_at = datetime('now','-20 minutes')");
await expectOk(c.post('/auth/login', { email: 'f@test.kr', password: 'password1' }, { as: 'rl' }), 'login allowed after window');
eq(db.db.prepare("SELECT COUNT(*) AS c FROM login_attempts WHERE email = 'f@test.kr'").get().c, 0, 'attempts cleared on success');
const loginRes = await (await import('../functions/api/[[path]].js')).onRequest({ request: new Request('http://localhost/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'f@test.kr', password: 'password1' }) }), env: { DB: db }, params: {}, waitUntil() {} });
const cookies = loginRes.headers.getSetCookie();
ok(cookies.some(x => x.startsWith('machal_session=') && x.includes('HttpOnly')) && cookies.some(x => x.startsWith('machal_in=1') && !x.includes('HttpOnly')), 'session + marker cookies');
await expectFail(c.get('/admin/export?table=users', { as: 'b' }), 403, 'export staff only');
await expectFail(c.get('/admin/export?table=login_attempts', { as: 'admin' }), 400, 'export unknown table');
{
  const mod = await import('../functions/api/[[path]].js');
  const req = new Request('http://localhost/api/admin/export?table=users', { headers: { cookie: 'machal_session=' + c.jar.admin.replace('machal_session=', '') } });
  const res = await mod.onRequest({ request: req, env: { DB: db }, params: {}, waitUntil() {} });
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  ok(res.status === 200 && res.headers.get('content-type').startsWith('text/csv') && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF, 'csv with BOM');
  ok(text.split('\r\n')[0].includes('email') && !text.includes('password_hash'), 'csv columns safe');
}
// 탈퇴: 이끄는 그룹이 진행 중이면 막고, 아니면 익명화
await expectFail(c.post('/me/withdraw', { password: 'wrong' }, { as: 'f' }), 400, 'withdraw wrong password');
await expectFail(c.post('/me/withdraw', { password: 'password1' }, { as: 'a' }), 400, 'leader of running group cannot withdraw');
const fUser = await expectOk(c.get('/me', { as: 'f' }));
await expectOk(c.post('/me/withdraw', { password: 'password1' }, { as: 'f' }), 'withdraw');
await expectFail(c.get('/me', { as: 'f' }), 401, 'withdrawn session gone');
await expectFail(c.post('/auth/login', { email: 'f@test.kr', password: 'password1' }, { as: 'f2' }), 401, 'withdrawn cannot login');
const ghost = db.db.prepare('SELECT email, name, nickname, phone, status FROM users WHERE id = ?').get(fUser.id);
ok(ghost.email.endsWith('@deleted.invalid') && ghost.name === '탈퇴회원' && ghost.status === 'removed' && ghost.phone === null, 'anonymized');
eq(db.db.prepare("SELECT COUNT(*) AS c FROM applications WHERE email = 'f@test.kr'").get().c, 0, 'application anonymized');
await expectFail(c.post('/me/withdraw', { password: 'adminpass1' }, { as: 'admin' }), 400, 'last staff cannot withdraw');
// 오래된 미가입 신청서 파기
await expectOk(c.post('/apply', { name: '미가입자', email: 'nojoin@test.kr', consent_public: true, consent_privacy: true }));
const nj = (await expectOk(c.get('/admin/applications?status=pending', { as: 'admin' }))).find(a => a.email === 'nojoin@test.kr');
await expectOk(c.post(`/admin/applications/${nj.id}`, { decision: 'approve' }, { as: 'admin' }));
db.db.exec(`UPDATE applications SET decided_at = datetime('now','-7 months') WHERE id = ${nj.id}`);
await expectOk(c.get('/admin/dashboard', { as: 'admin' }));
const purged = db.db.prepare('SELECT name, email, status, invite_code FROM applications WHERE id = ?').get(nj.id);
ok(purged.status === 'purged' && purged.email.endsWith('@deleted.invalid') && purged.invite_code === null, 'old application purged');
eq(db.db.prepare("SELECT COUNT(*) AS c FROM consents WHERE subject_type = 'application' AND subject_id = ? AND ip IS NOT NULL", ).get(nj.id).c, 0, 'consent ip cleared');
console.log('v1.1 동의·로그인 제한·내보내기·탈퇴·파기 ok');



// 13. v1.2·v2.0 — 운영본부 콘솔과 스키마 보강
{
  const { FakeD1 } = await import('./harness.js');
  const { runMigrations, MIGRATIONS } = await import('../functions/_lib/admin-routes.js');
  // 예전(v1.3) 스키마의 핵심 표만 만들어 새 열이 붙고 자료가 옮겨지는지 확인
  const old = new FakeD1();
  old.db.exec(`CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE users (id INTEGER PRIMARY KEY, nickname TEXT, level TEXT, status TEXT DEFAULT 'active');
    CREATE TABLE rounds (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE comments (id INTEGER PRIMARY KEY, body TEXT);
    CREATE TABLE analytics_events (id INTEGER PRIMARY KEY, day TEXT);
    CREATE TABLE challenges (id INTEGER PRIMARY KEY, title TEXT, type TEXT, stage TEXT, leader_id INTEGER);
    CREATE TABLE group_members (id INTEGER PRIMARY KEY, challenge_id INTEGER, user_id INTEGER, role TEXT, status TEXT);
    CREATE TABLE events (id INTEGER PRIMARY KEY, type TEXT, title TEXT);
    CREATE TABLE posts (id INTEGER PRIMARY KEY, board TEXT);
    INSERT INTO users (id, nickname, level) VALUES (1, '그룹장', 'L4'), (2, '그룹원', 'L2');
    INSERT INTO challenges VALUES (1, '정산 중', 'group', 'settling', 1), (2, '심사 중', 'group', 'review', 2), (3, '솔로', 'solo', 'active', 2);
    INSERT INTO group_members VALUES (1, 1, 1, 'leader', 'active'), (2, 1, 2, 'maker', 'active');
    INSERT INTO events VALUES (1, 'machal_day', '마챌데이'), (2, 'demo_day', '데모데이');
    INSERT INTO posts VALUES (1, 'swap');`);
  const cols = t => old.db.prepare(`PRAGMA table_info(${t})`).all().map(r => r.name);
  await runMigrations(old); await runMigrations(old);
  ok(cols('users').includes('can_lead') && cols('challenges').includes('policy') && cols('challenges').includes('goal_metric') && cols('events').includes('topics') && cols('group_members').includes('leave_note'), 'migrations add v2 columns');
  eq(old.db.prepare('SELECT stage, type FROM challenges ORDER BY id').all().map(r => r.stage + ':' + r.type), ['active:challenge', 'stopped:challenge', 'active:challenge'], 'old stages mapped');
  eq(old.db.prepare("SELECT role FROM group_members WHERE id = 2").get().role, 'member', 'old roles mapped');
  eq(old.db.prepare('SELECT type FROM events ORDER BY id').all().map(r => r.type), ['regular', 'showcase'], 'old event types mapped');
  eq(old.db.prepare('SELECT board FROM posts').get().board, 'share', 'swap board moved');
  eq(old.db.prepare('SELECT can_lead FROM users ORDER BY id').all().map(r => r.can_lead), [1, 1], 'existing group leaders keep leading');
  eq(old.db.prepare('SELECT COUNT(*) AS c FROM schema_migrations').get().c, MIGRATIONS.length, 'migrations recorded once');
}
eq((await expectOk(c.get('/me', { as: 'admin' }))).is_owner, true, 'setup account is owner');
eq((await expectOk(c.get('/me', { as: 'b' }))).is_owner, false);
// 운영진 지정: 운영자만 / 일반 운영진은 규칙·개인정보 내려받기 불가
await expectFail(c.post('/admin/staff', { action: 'grant', who: 'b@test.kr' }, { as: 'b' }), 403, 'member cannot grant');
await expectOk(c.post('/admin/staff', { action: 'grant', who: 'b@test.kr' }, { as: 'admin' }), 'grant staff');
const staffList = await expectOk(c.get('/admin/staff', { as: 'b' }));
ok(staffList.rows.length === 2 && staffList.me.is_owner === false && staffList.rows.find(r => r.is_owner).email === 'admin@machal.kr', 'staff list');
await expectOk(c.get('/admin/dashboard', { as: 'b' }), 'staff sees dashboard');
await expectFail(c.put('/admin/settings', { key: 'groups', value: { capacity_default: 6 }, reason: 'x' }, { as: 'b' }), 403, 'non-owner cannot change settings');
await expectFail(c.get('/admin/export?table=users', { as: 'b' }), 403, 'non-owner cannot export PII');
await expectOk(c.get('/admin/export?table=attendance', { as: 'b' }), 'staff can export attendance');
await expectFail(c.get('/admin/export?table=ledger', { as: 'b' }), 400, 'ledger export gone');
await expectFail(c.post(`/admin/users/${admin.id}`, { status: 'dormant' }, { as: 'b' }), 403, 'staff cannot touch other staff');
await expectFail(c.post(`/admin/users/${C.id}`, { role: 'staff' }, { as: 'b' }), 403, 'staff cannot change roles');
await expectFail(c.post('/admin/staff', { action: 'remove_owner', who: 'admin@machal.kr' }, { as: 'admin' }), 400, 'last owner stays');
await expectOk(c.post('/admin/staff', { action: 'make_owner', who: 'b@test.kr' }, { as: 'admin' }));
eq((await expectOk(c.get('/me', { as: 'b' }))).is_owner, true, 'b became owner');
await expectOk(c.post('/admin/staff', { action: 'remove_owner', who: 'b@test.kr' }, { as: 'admin' }));
// 대시보드 v2
const d2 = await expectOk(c.get('/admin/dashboard', { as: 'admin' }));
ok(d2.kpi && d2.funnel.length === 7 && d2.trends.weeks.length === 8 && d2.trends.applications.length === 8 && Array.isArray(d2.risks) && d2.overdue && d2.me.is_owner, 'dashboard v2 shape');
ok(d2.funnel[0][1] >= d2.funnel[1][1] - 1, 'funnel numbers');
// 통합 검색 · 회원 목록/상세 · 메모
const sr = await expectOk(c.get('/admin/search?q=test.kr', { as: 'admin' }));
ok(sr.users.length > 0, 'search users');
const ul = await expectOk(c.get('/admin/users?level=L3&sort=points', { as: 'admin' }));
ok(ul.total >= 1 && ul.rows.every(r => r.level === 'L3'), 'user filter');
await expectOk(c.post(`/admin/users/${C.id}`, { badge: 'first_sale', evidence: '카페 A 입금 확인' }, { as: 'admin' }));
const cd = await expectOk(c.get(`/admin/users/${C.id}`, { as: 'admin' }));
ok(cd.user.id === C.id && cd.user.can_lead === 1 && cd.groups.length > 0 && cd.groups.some(g => g.attendance && g.role_name) && cd.badges.some(x => x.code === 'first_sale') && cd.points.total > 0 && cd.progress && !('password_hash' in cd.user), 'user detail');
const note = await expectOk(c.post('/admin/notes', { ref_type: 'user', ref_id: C.id, body: '첫 매출 인증 자료 원본은 메일로 받음' }, { as: 'b' }));
eq((await expectOk(c.get(`/admin/users/${C.id}`, { as: 'admin' }))).notes.length, 1, 'note visible');
await expectOk(c.del(`/admin/notes/${note.id}`, { as: 'admin' }), 'owner deletes note');
// 그룹 모니터링
const groups = await expectOk(c.get('/admin/groups', { as: 'admin' }));
ok(groups.length >= 3 && groups.every(g => 'health' in g && 'recent_rate' in g && 'warnings' in g), 'groups list');
const gd = await expectOk(c.get(`/admin/groups/${g1.id}`, { as: 'admin' }));
ok(gd.members.length >= 4 && gd.sessions.length >= 4 && gd.warnings.length >= 2 && gd.results.some(r => r.verified_at) && Array.isArray(gd.history), 'group detail');
await expectFail(c.post(`/admin/groups/${g3.id}/stage`, { stage: 'stopped' }, { as: 'admin' }), 400, 'stage change needs reason');
await expectOk(c.post(`/admin/groups/${g3.id}/stage`, { stage: 'stopped', reason: '그룹리더 요청으로 잠시 멈춤' }, { as: 'admin' }));
eq((await expectOk(c.get(`/admin/groups/${g3.id}`, { as: 'admin' }))).group.stage, 'stopped');
ok(!(await expectOk(c.get('/groups', { as: 'e' }))).some(x => x.id === g3.id), 'stopped group hidden from list');
await expectOk(c.post(`/admin/groups/${g3.id}/stage`, { stage: 'active', reason: '다시 시작' }, { as: 'admin' }));
await expectOk(c.post(`/admin/groups/${g2.id}/leader`, { user_id: C.id, reason: '리더 교대' }, { as: 'admin' }));
eq((await expectOk(c.get(`/groups/${g2.id}`, { as: 'c3' }))).me.is_leader, true, 'leader changed');
// 그룹리더 목록 · 자격 해제
const lead = await expectOk(c.get('/admin/leaders?view=decided', { as: 'admin' }));
ok(lead.applications.length >= 1 && lead.leaders.some(l => l.id === A.id), 'leaders list');
await expectFail(c.post(`/admin/users/${C.id}/leader`, { on: false }, { as: 'admin' }), 400, 'revoke needs reason');
await expectFail(c.post(`/admin/users/${C.id}/leader`, { on: false, reason: 'x' }, { as: 'admin' }), 400, 'cannot revoke while leading');
await expectOk(c.post(`/admin/users/${A.id}/leader`, { on: false, reason: '활동 중단' }, { as: 'admin' }));
await expectFail(c.post('/groups', { type: 'study', title: 'x', field_code: 'S-01', summary: 'y' }, { as: 'a' }), 403, 'revoked leader cannot create');
// 단체 알림
{
  let n = 0; for (const lv of ['L3', 'L4', 'L5']) n += (await expectOk(c.get(`/admin/users?level=${lv}&status=active`, { as: 'admin' }))).total;
  eq((await expectOk(c.get('/admin/broadcast/preview?type=level&level=L3', { as: 'admin' }))).count, n, 'segment count');
  ok((await expectOk(c.get('/admin/broadcast/preview?type=leaders', { as: 'admin' }))).count >= 1 && (await expectOk(c.get('/admin/broadcast/preview?type=in_groups', { as: 'admin' }))).count >= 3, 'group segments');
}
await expectFail(c.post('/admin/broadcast', { type: 'challenge', title: 'x' }, { as: 'admin' }), 400, 'challenge segment needs id');
const bc = await expectOk(c.post('/admin/broadcast', { type: 'all', title: '12월 정기모임 장소 안내', body: '성수동으로 바뀝니다', link: '#/events', post_notice: true }, { as: 'admin' }));
ok(bc.recipients >= 5 && bc.post_id, 'broadcast sent');
ok((await expectOk(c.get('/me/notifications', { as: 'd' }))).some(n => n.title === '12월 정기모임 장소 안내'), 'member got broadcast');
eq((await expectOk(c.get('/admin/broadcasts', { as: 'admin' })))[0].recipients, bc.recipients);
// 커뮤니티 관리
await expectOk(c.post(`/posts/${po.id}/report`, { note: '광고 같아요' }, { as: 'd' }));
const com = await expectOk(c.get('/admin/community', { as: 'admin' }));
ok(com.posts.some(x => x.id === po.id) && com.counts.reported >= 1, 'reported posts');
const cm = com.comments.find(x => x.post_id === po.id);
await expectOk(c.post(`/admin/comments/${cm.id}`, { hidden: true, reason: '테스트' }, { as: 'admin' }));
eq((await expectOk(c.get(`/posts/${po.id}`, { as: 'e' }))).comments.length, 0, 'hidden comment gone');
await expectOk(c.post(`/admin/posts/${po.id}`, { hidden: true, clear_reports: true, notify_author: true, reason: '테스트 숨김' }, { as: 'admin' }));
await expectFail(c.get(`/posts/${po.id}`, { as: 'e' }), 404, 'hidden post');
await expectOk(c.post(`/admin/posts/${po.id}`, { hidden: false }, { as: 'admin' }));
// 일정 관리 · 출석
const ev2 = await expectOk(c.post('/admin/events', { type: 'seminar', title: '세금 기초 세미나', starts_at: '2027-01-10 19:00:00', location: '온라인' }, { as: 'admin' }));
await expectOk(c.post(`/events/${ev2.id}/register`, {}, { as: 'd' }));
await expectOk(c.post(`/admin/events/${ev2.id}/attendance`, { user_id: D.id, attended: true }, { as: 'admin' }));
await expectOk(c.post(`/admin/events/${ev2.id}/attendance`, { user_id: D.id, attended: true }, { as: 'admin' }));
eq(db.db.prepare("SELECT COUNT(*) AS c FROM points_ledger WHERE user_id = ? AND action = 'event_attend' AND ref_id = ?").get(D.id, ev2.id).c, 1, 'attendance points once');
const evd = await expectOk(c.get(`/admin/events/${ev2.id}`, { as: 'admin' }));
eq(evd.registrations[0].status, 'attended');
await expectOk(c.put(`/admin/events/${ev2.id}`, { status: 'cancelled', reason: '강사 일정 변경' }, { as: 'admin' }));
ok(!(await expectOk(c.get('/events', { as: 'd' }))).events.some(x => x.id === ev2.id), 'cancelled event hidden for members');
ok(!(await c.get('/public/events')).data.some(x => x.id === ev2.id), 'cancelled hidden publicly');
await expectFail(c.post(`/events/${ev2.id}/register`, {}, { as: 'e' }), 400, 'cannot register cancelled');
ok((await expectOk(c.get('/me/notifications', { as: 'd' }))).some(n => n.title === '신청한 일정이 취소됐습니다'), 'cancel notice');
// 라운드 모집 · 신청 일괄 승인
const nextYear = String(new Date().getFullYear() + 1);
await expectOk(c.put(`/admin/rounds/${round.id}`, { status: 'active' }, { as: 'admin' }));
eq((await c.get('/public/stats')).data.round, null, 'no open round');
await expectOk(c.post('/admin/rounds', { name: '2기', start_date: nextYear + '-03-01', end_date: nextYear + '-05-24', status: 'open', recruit_until: nextYear + '-02-20' }, { as: 'admin' }));
eq((await c.get('/public/stats')).data.round.name, '2기', 'open round public');
for (const k of ['g1', 'g2']) await expectOk(c.post('/apply', { name: k, email: `${k}@test.kr`, consent_public: true, consent_privacy: true }));
const pend = await expectOk(c.get('/admin/applications?status=pending&q=g', { as: 'admin' }));
const bulk = await expectOk(c.post('/admin/applications/bulk', { ids: pend.map(a => a.id) }, { as: 'admin' }));
ok(bulk.approved.length === 2 && bulk.approved.every(a => /^MC-/.test(a.invite_code)), 'bulk approve');
// 감사 로그 필터 · 시스템 · 백업 · 규칙 되돌리기
const au = await expectOk(c.get('/admin/audit?action=broadcast', { as: 'admin' }));
ok(au.rows.length === 1 && au.actors.length >= 1, 'audit filter');
const au2 = await expectOk(c.get('/admin/audit?limit=5', { as: 'admin' }));
ok(au2.rows.length === 5 && au2.next_before, 'audit paging');
ok((await expectOk(c.get(`/admin/audit?limit=5&before=${au2.next_before}`, { as: 'admin' }))).rows[0].id < au2.next_before, 'audit next page');
const sys = await expectOk(c.get('/admin/system', { as: 'b' }));
{ const { MIGRATIONS } = await import('../functions/_lib/admin-routes.js'); ok(sys.tables.length === 37 && sys.migrations.length === MIGRATIONS.length, 'system info'); }
await expectFail(c.get('/admin/backup', { as: 'b' }), 403, 'backup owner only');
const bk = await expectOk(c.get('/admin/backup', { as: 'admin' }));
ok(bk.tables.users.length > 0 && !('password_hash' in bk.tables.users[0]) && !bk.tables.sessions, 'backup safe');
await expectOk(c.del('/admin/settings/levels', { as: 'admin' }));
eq((await c.get('/public/levels')).data.rules.L2.points, 300, 'settings reset to default');
await expectOk(c.post('/admin/staff', { action: 'revoke', who: 'b@test.kr' }, { as: 'admin' }));
await expectFail(c.get('/admin/dashboard', { as: 'b' }), 403, 'revoked staff');
console.log('v1.2 운영본부 콘솔 ok');

// 14. v1.3 — 이용 통계와 KPI
{
  const { classifySource } = await import('../functions/_lib/kpi-routes.js');
  eq(classifySource('m.search.naver.com/search.naver').source, '네이버 검색');
  eq(classifySource('l.instagram.com/').source, '인스타그램');
  eq(classifySource(null).source, '직접 방문');
  eq(classifySource(null, 'insta_bio / social').source, '캠페인 · insta_bio');
  eq(classifySource('www.example.com/a').source, 'example.com');
}
const T = (e, o) => c.post('/t', { e }, o);
const cnt = (sql, ...p) => db.db.prepare(sql).get(...p).c;
// 수집 시작일 전에는 모으지 않는다 (개인정보처리방침 시행일). 운영자만 바꾼다.
const kstD = n => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
await expectFail(c.put('/admin/kpi/settings', { analytics: { start: '' } }, { as: 'e' }), 403, 'kpi settings owner only');
await expectFail(c.put('/admin/kpi/settings', { analytics: { start: '11/25' } }, { as: 'admin' }), 400, 'bad start date');
await expectOk(c.put('/admin/kpi/settings', { analytics: { enabled: true, start: kstD(1) } }, { as: 'admin' }));
const gate0 = cnt('SELECT COUNT(*) AS c FROM analytics_events');
await T([{ k: 'view', a: 'site', p: '/', vid: 'vgate0001', sid: 'sgate0001', f: 1 }]);
eq(cnt('SELECT COUNT(*) AS c FROM analytics_events'), gate0, 'not collected before start date');
eq((await expectOk(c.get('/admin/kpi/summary', { as: 'admin' }))).config.collecting, false, 'config shows not collecting');
await expectOk(c.put('/admin/kpi/settings', { analytics: { enabled: true, start: '' }, reason: '테스트에서 바로 수집' }, { as: 'admin' }));
const before = cnt('SELECT COUNT(*) AS c FROM analytics_events');
eq((await T([{ k: 'view', a: 'site', p: '/', t: '마이챌린지', vid: 'vtest0001', sid: 'stest0001', device: 'mobile', n: 1, f: 1, r: 'search.naver.com/search.naver' },
  { k: 'click', a: 'site', p: '/', g: '/apply/', l: '가입 신청하기', z: 'hero', vid: 'vtest0001', sid: 'stest0001' },
  { k: 'leave', a: 'site', p: '/', d: 42, s: 75, vid: 'vtest0001', sid: 'stest0001' },
  { k: 'view', a: 'site', p: '/apply/', t: '가입 신청', vid: 'vtest0001', sid: 'stest0001' },
  { k: 'click', a: 'site', p: '/apply/', g: 'goal:apply', l: '가입 신청서 제출', z: 'goal', vid: 'vtest0001', sid: 'stest0001' },
  { k: 'view', a: 'site', p: '/x', vid: 'BAD id', sid: 'stest0001' },
  { k: 'hack', p: '/', vid: 'vtest0001', sid: 'stest0001' },
  { k: 'leave', a: 'site', p: '/apply/', d: 99999, vid: 'vtest0001', sid: 'stest0001' }])).status, 204, 'track accepted');
eq(cnt('SELECT COUNT(*) AS c FROM analytics_events') - before, 6, 'invalid events dropped');
eq(db.db.prepare("SELECT source FROM analytics_events WHERE sid = 'stest0001' AND entry = 1").get().source, '네이버 검색', 'source classified');
eq(db.db.prepare("SELECT MAX(dur) AS d FROM analytics_events WHERE sid = 'stest0001'").get().d, 1800, 'dwell capped');
eq(db.db.prepare("SELECT scroll FROM analytics_events WHERE sid = 'stest0001' AND kind = 'leave' AND path = '/'").get().scroll, 75, 'scroll stored');
await T([{ k: 'view', a: 'site', p: '/', vid: 'vadmin001', sid: 'sadmin001', f: 1 }], { as: 'admin' });
eq(cnt("SELECT COUNT(*) AS c FROM analytics_events WHERE vid = 'vadmin001'"), 0, 'staff visits not counted');
await T([{ k: 'view', a: 'app', p: '/app/dashboard', t: '대시보드', vid: 'vmemd0001', sid: 'smemd0001', f: 1 }, { k: 'view', a: 'app', p: `/app/community/posts/${po.id}`, vid: 'vmemd0001', sid: 'smemd0001' }], { as: 'd' });
ok(db.db.prepare("SELECT user_id FROM analytics_events WHERE vid = 'vmemd0001' LIMIT 1").get().user_id === D.id, 'member visit linked');
// 지난 30일 표본 (화면 점검용)
{
  const ins = db.db.prepare('INSERT INTO analytics_events (day, hour, vid, sid, user_id, kind, area, path, title, source, ref_host, target, label, zone, dur, device, is_new, entry) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const kst = d => new Date(Date.now() + 9 * 3600e3 - d * 86400e3).toISOString().slice(0, 10);
  const pages = [['/', '마이챌린지'], ['/how-it-works/', '운영 방식'], ['/goals/', '수익목표'], ['/guide/side-project-start/', '사이드프로젝트 시작'], ['/guide/side-income-tax/', '부업 소득 세금'], ['/faq/', '자주 묻는 질문'], ['/apply/', '가입 신청'], ['/levels/', '등급과 포인트']];
  const srcs = [['네이버 검색', 'search.naver.com'], ['직접 방문', null], ['인스타그램', 'instagram.com'], ['구글 검색', 'google.com'], ['네이버 블로그', 'blog.naver.com']];
  let seed = 7; const rnd = n => { seed = (seed * 9301 + 49297) % 233280; return Math.floor(seed / 233280 * n); };
  for (let d = 29; d >= 1; d--) {
    const visits = 4 + rnd(8) + (d < 10 ? 4 : 0);
    for (let v = 0; v < visits; v++) {
      const vid = 'vs' + d + 'x' + v + 'aa', sid = 'ss' + d + 'x' + v + 'aa', [src, host] = srcs[rnd(srcs.length)], dev = rnd(3) ? 'mobile' : 'desktop', hour = 8 + rnd(15);
      const n = 1 + rnd(4);
      for (let i = 0; i < n; i++) {
        const [path, title] = i === 0 ? pages[rnd(3)] : pages[rnd(pages.length)];
        ins.run(kst(d), hour, vid, sid, null, 'view', 'site', path, title, i === 0 ? src : null, i === 0 ? host : null, null, null, null, null, dev, i === 0 && rnd(2) ? 1 : 0, i === 0 ? 1 : 0);
        ins.run(kst(d), hour, vid, sid, null, 'leave', 'site', path, null, null, null, null, null, null, 10 + rnd(170), dev, 0, 0);
        if (rnd(3) === 0) ins.run(kst(d), hour, vid, sid, null, 'click', 'site', path, null, null, null, '/apply/', '가입 신청하기', rnd(2) ? 'hero' : 'cta', null, dev, 0, 0);
        if (path === '/faq/') ins.run(kst(d), hour, vid, sid, null, 'click', 'site', path, null, null, null, 'faq', ['회사에 다니면서 해도 되나요?', '수익이 안 나면 어떻게 되나요?', '참가비가 있나요?'][rnd(3)], 'body', null, dev, 0, 0);
      }
    }
  }
}
await expectFail(c.get('/admin/kpi/summary', { as: 'e' }), 403, 'kpi staff only');
const ks = await expectOk(c.get('/admin/kpi/summary?range=30', { as: 'admin' }));
ok(ks.cards.length >= 20 && ks.labels.length === 30 && ks.series.visitors.length === 30 && ks.cards.find(x => x.key === 'visitors').value > 50 && ks.tracking_since, 'kpi summary');
ok(ks.cards.find(x => x.key === 'apps').value >= 2 && ks.cards.find(x => x.key === 'checkin').value !== undefined, 'summary includes members data');
const k7 = await expectOk(c.get('/admin/kpi/summary?range=7', { as: 'admin' }));
ok(k7.labels.length === 7 && k7.period.prevEnd < k7.period.start, 'period 7');
const kq = await expectOk(c.get('/admin/kpi/summary?range=90', { as: 'admin' }));
ok(kq.period.bucket === 'week' && kq.labels.length >= 13, 'weekly buckets');
const kt = await expectOk(c.get('/admin/kpi/traffic?range=30', { as: 'admin' }));
const naverSrc = kt.sources.find(x => x.source === '네이버 검색');
ok(naverSrc && naverSrc.goals >= 1 && kt.hours.length === 24 && kt.weekdays.length === 7 && kt.devices.length >= 2 && kt.cur.bounce_rate !== null, 'kpi traffic');
const kc = await expectOk(c.get('/admin/kpi/content?range=30', { as: 'admin' }));
ok(kc.site.find(x => x.path === '/').views > 10 && kc.guides.length >= 2 && kc.faq.length >= 1 && kc.apply_funnel[3][1] >= 1 && kc.app.some(x => x.path === '/app/community/posts/:id'), 'kpi content');
const km = await expectOk(c.get('/admin/kpi/members?range=30', { as: 'admin' }));
ok(km.list.length >= 4 && km.funnel.length === 6 && km.levels.length === 6 && km.mau >= 1 && km.list.find(x => x.id === D.id).views >= 2, 'kpi members');
const kg = await expectOk(c.get('/admin/kpi/groups?range=30', { as: 'admin' }));
ok(kg.groups.length >= 3 && kg.totals.sessions >= 4 && kg.totals.group_attendance !== null && kg.totals.warnings >= 3 && 'participation' in kg.totals && Array.isArray(kg.events) && kg.by_field.length === 6 && kg.series.sessions.length === 30, 'kpi groups');
const kcm = await expectOk(c.get('/admin/kpi/community?range=30', { as: 'admin' }));
ok(kcm.cur.posts >= 1 && kcm.top.length >= 1 && kcm.top.find(x => x.id === po.id)?.views >= 1, 'kpi community');
// 기간 직접 고르기
const kx = await expectOk(c.get(`/admin/kpi/summary?start=${kstD(-13)}&end=${kstD(0)}`, { as: 'admin' }));
ok(kx.period.custom && kx.period.range === 14 && kx.labels.length === 14 && kx.period.prevEnd === kstD(-14), 'custom period');
const kl = await expectOk(c.get(`/admin/kpi/summary?start=2020-01-01&end=${kstD(5)}`, { as: 'admin' }));
ok(kl.period.range === 366 && kl.period.end === kstD(0) && kl.period.bucket === 'month', 'custom period clipped');
// 페이지 상세
const kd = await expectOk(c.get('/admin/kpi/content?range=30&path=/', { as: 'admin' }));
ok(kd.detail && kd.detail.views > 10 && kd.detail.series.length === 30 && kd.detail.next.length >= 1 && kd.detail.clicks_list.some(x => x.target === '/apply/') && kd.detail.sources.length >= 1, 'page detail');
ok(kd.site.find(x => x.path === '/').scroll === 75, 'page scroll column');
const ka = await expectOk(c.get('/admin/kpi/content?range=30&path=/apply/', { as: 'admin' }));
ok(ka.detail.goals.some(g => g.target === 'goal:apply' && g.n >= 1) && ka.detail.from.some(x => x.path === '/'), 'detail goals and previous page');
// 월 목표
const km0 = await expectOk(c.get('/admin/kpi/summary', { as: 'admin' }));
ok(km0.month && km0.month.days_in_month >= 28 && km0.month.actual.visitors >= 1 && km0.config.is_owner && km0.config.collecting, 'month block');
await expectOk(c.put('/admin/kpi/settings', { targets: { visitors: 300, apps: '20', signups: '' } }, { as: 'admin' }));
eq((await expectOk(c.get('/admin/kpi/summary', { as: 'admin' }))).month.targets, { visitors: 300, views: 0, apps: 20, signups: 0, active: 0 }, 'targets saved');
// 수집을 끄면 버린다
await expectOk(c.put('/admin/kpi/settings', { analytics: { enabled: false } }, { as: 'admin' }));
const off0 = cnt('SELECT COUNT(*) AS c FROM analytics_events');
await T([{ k: 'view', a: 'site', p: '/', vid: 'voff00001', sid: 'soff00001', f: 1 }]);
eq(cnt('SELECT COUNT(*) AS c FROM analytics_events'), off0, 'disabled drops events');
await expectOk(c.put('/admin/kpi/settings', { analytics: { enabled: true, start: '' } }, { as: 'admin' }));
ok((await expectOk(c.get('/admin/audit?action=kpi', { as: 'admin' }))).rows.length >= 4, 'kpi settings audited');
console.log('v1.3 이용 통계·KPI ok');

console.log('\nAPI 전체 흐름 테스트 통과 ✔');
