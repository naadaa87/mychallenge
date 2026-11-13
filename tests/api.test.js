// 전체 흐름 테스트: 초기 설정 → 가입 → 챌린지 → 합의서 → 실행 → 장부 → 정산 → 페이퍼 → 지급
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
  await expectFail(c.get('/challenges', { as: key }), 403, 'L0 cannot see board');
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

// 2. 라운드 + 제안 + 심사
const round = await expectOk(c.post('/admin/rounds', { name: '2026 라운드 1', start_date: today, end_date: '2027-02-01', status: 'open' }, { as: 'admin' }));
await expectFail(c.post('/challenges', { type: 'group', title: 'x', field_code: 'S-01', summary: 'x' }, { as: 'b' }), 403, 'L2 cannot propose group');
const prop = await expectOk(c.post('/challenges', { type: 'group', title: '동네 카페 인스타 운영 대행 3곳', field_code: 'S-04', round_id: round.id, summary: '자영업자 3곳의 인스타를 월 10만 원에 대행', proposal: { pain: '자영업자는 SNS 할 시간이 없다', product: '월 8개 게시물 대행', first_sale_plan: '단골 카페 사장님 3명', preset: 'basic', ownership: 'A' } }, { as: 'a' }), 'propose');
eq(prop.stage, 'review');
await expectFail(c.get(`/challenges/${prop.id}`, { as: 'b' }), 403, 'review stage hidden from others');
const queue = await expectOk(c.get('/admin/challenges', { as: 'admin' }));
eq(queue.length, 1);
await expectFail(c.post(`/admin/challenges/${prop.id}/review`, { scores: { asset: 2, pain: 2, speed: 2, accrue: 2, cost: 2, roles: 2 }, decision: 'approve' }, { as: 'admin' }), 400, 'low score cannot approve');
await expectOk(c.post(`/admin/challenges/${prop.id}/review`, { scores: { asset: 3, pain: 3, speed: 3, accrue: 3, cost: 3, roles: 3 }, decision: 'revise', comment: '첫 고객 후보를 더 구체적으로' }, { as: 'admin' }));
eq((await c.get(`/challenges/${prop.id}`, { as: 'a' })).data.stage, 'proposed');
await expectOk(c.put(`/challenges/${prop.id}/proposal`, { proposal: { first_sale_plan: '카페 A·B·C 사장님과 11/20 미팅' } }, { as: 'a' }));
await expectOk(c.post(`/challenges/${prop.id}/resubmit`, {}, { as: 'a' }));
const rv = await expectOk(c.post(`/admin/challenges/${prop.id}/review`, { scores: { asset: 4, pain: 4, speed: 4, accrue: 3, cost: 4, roles: 4 }, decision: 'approve', comment: '좋습니다' }, { as: 'admin' }));
eq(rv.stage, 'recruiting'); eq(rv.review.total, 34.5, 'weighted score');
console.log('제안·심사 ok');

// 3. 모집 → 지원 → 수락
await expectFail(c.post(`/challenges/${prop.id}/apply`, { note: 'x' }, { as: 'e' }), 403, 'L1 cannot apply');
for (const k of ['b', 'c', 'd']) await expectOk(c.post(`/challenges/${prop.id}/apply`, { note: '주 5시간 가능, 사진 촬영 가능' }, { as: k }));
await expectFail(c.post(`/challenges/${prop.id}/apply`, { note: 'x' }, { as: 'b' }), 400, 'duplicate apply');
await expectFail(c.post(`/challenges/${prop.id}/stage`, { stage: 'agreement' }, { as: 'a' }), 400, 'min members');
let det = await expectOk(c.get(`/challenges/${prop.id}`, { as: 'a' }));
eq(det.applicants.length, 3);
await expectOk(c.post(`/challenges/${prop.id}/members/${B.id}`, { action: 'accept', role: 'maker' }, { as: 'a' }));
await expectOk(c.post(`/challenges/${prop.id}/members/${C.id}`, { action: 'accept', role: 'marketing' }, { as: 'a' }));
await expectOk(c.post(`/challenges/${prop.id}/members/${D.id}`, { action: 'accept', role: 'accounting' }, { as: 'a' }));
await expectFail(c.post(`/challenges/${prop.id}/members/${B.id}`, { action: 'accept' }, { as: 'c' }), 403, 'non-leader cannot accept');
await expectOk(c.post(`/challenges/${prop.id}/stage`, { stage: 'agreement' }, { as: 'a' }));
console.log('모집 ok');

// 4. 합의서
const roles = [{ user_id: A.id, role: 'leader' }, { user_id: B.id, role: 'maker', planned_share: 0.4 }, { user_id: C.id, role: 'marketing', planned_share: 0.35 }, { user_id: D.id, role: 'accounting', planned_share: 0.25 }];
await expectFail(c.post(`/groups/${prop.id}/agreement`, { clauses: { preset: 'basic', ratios: { hq: 0.3, leader: 0.3, pool: 0.4 }, ownership_type: 'A', roles } }, { as: 'a' }), 400, 'hq ratio range');
await expectFail(c.post(`/groups/${prop.id}/agreement`, { clauses: { preset: 'basic', ownership_type: 'C', roles } }, { as: 'a' }), 400, 'C type only official');
await expectFail(c.post(`/groups/${prop.id}/agreement`, { clauses: { preset: 'basic', ownership_type: 'A', roles, budget_cap_group: 900000 } }, { as: 'a' }), 400, 'budget cap');
await expectFail(c.post(`/groups/${prop.id}/settlements`, {}, { as: 'a' }), 400, 'no settlement before locked agreement');
await expectOk(c.post(`/groups/${prop.id}/agreement`, { clauses: { preset: 'basic', ownership_type: 'A', roles, settlement_mode: 'leader', checkin_day: '수', special_terms: '라운드 후 계정은 그룹장이 유지' } }, { as: 'a' }), 'agreement');
await expectFail(c.post(`/groups/${prop.id}/agreement/sign`, { agree: true }, { as: 'e' }), 403, 'outsider cannot sign');
for (const k of ['a', 'b', 'c']) eq((await expectOk(c.post(`/groups/${prop.id}/agreement/sign`, { agree: true }, { as: k }))).all_signed, false);
const sg = await expectOk(c.post(`/groups/${prop.id}/agreement/sign`, { agree: true }, { as: 'd' }));
eq(sg.all_signed, true, 'all signed');
const agq = await expectOk(c.get('/admin/agreements', { as: 'admin' }));
eq(agq[0].status, 'signed');
await expectOk(c.post(`/admin/agreements/${agq[0].id}`, { approve: true }, { as: 'admin' }));
det = await expectOk(c.get(`/challenges/${prop.id}`, { as: 'a' }));
eq(det.stage, 'active', 'challenge active after approval'); eq(det.milestones.length, 4, 'milestones created');
console.log('합의서 ok');

// 5. 실행: 체크인, 완료 기록, 열람 권한
await expectFail(c.post(`/groups/${prop.id}/checkins`, { week_no: 1 }, { as: 'b' }), 403, 'only leader opens checkin');
const ck = await expectOk(c.post(`/groups/${prop.id}/checkins`, { week_no: 1 }, { as: 'a' }));
await expectFail(c.post(`/groups/${prop.id}/checkins`, { week_no: 1 }, { as: 'a' }), 400, 'duplicate week');
for (const k of ['a', 'b', 'c']) await expectOk(c.post(`/groups/${prop.id}/checkins/${ck.id}/entries`, { done: ['첫 미팅'], goals: ['게시물 4개'], hours: 5 }, { as: k }));
// D는 1주차 미제출 → 출석률 0
const ck2 = await expectOk(c.post(`/groups/${prop.id}/checkins`, { week_no: 2 }, { as: 'a' }));
for (const k of ['a', 'b', 'c', 'd']) await expectOk(c.post(`/groups/${prop.id}/checkins/${ck2.id}/entries`, { done: ['게시물 발행'], goals: ['고객 미팅'], hours: 4 }, { as: k }));
const logs = [];
for (let i = 0; i < 3; i++) logs.push((await expectOk(c.post(`/groups/${prop.id}/done-logs`, { text: `게시물 ${i + 1} 발행`, shared: true }, { as: 'b' }))).id);
logs.push((await expectOk(c.post(`/groups/${prop.id}/done-logs`, { text: '카페 A 계약', shared: true }, { as: 'c' }))).id);
await expectFail(c.post(`/groups/${prop.id}/done-logs/${logs[0]}`, { action: 'confirm' }, { as: 'b' }), 403, 'self confirm blocked');
for (const id of logs) await expectOk(c.post(`/groups/${prop.id}/done-logs/${id}`, { action: 'confirm' }, { as: 'a' }));
await expectFail(c.post(`/groups/${prop.id}/done-logs`, { text: 'x' }, { as: 'e' }), 403, 'outsider cannot log');
// 열람: L1은 그룹 공간 불가, L3는 열람 가능(장부 제외)
await expectFail(c.get(`/groups/${prop.id}`, { as: 'e' }), 403, 'L1 cannot view group logs');
const fview = await expectOk(c.get(`/groups/${prop.id}`, { as: 'f' }));
eq([fview.is_member, fview.ledger === undefined, fview.done_logs.length], [false, true, 4], 'L3 sees logs but not ledger');
const bview = await expectOk(c.get(`/groups/${prop.id}`, { as: 'b' }));
ok(Array.isArray(bview.ledger) && bview.contribution.length === 3, 'member sees ledger & contribution');
const card = await expectOk(c.get(`/challenges/${prop.id}`, { as: 'e' }));
eq([card.can_see_logs, card.proposal === undefined], [false, true], 'L1 sees card without logs/proposal');
// 포인트: B = 완료기록 2건(하루 상한 2) ×5 + 체크인 2회 중 하루 상한 1 → 20 = 30
const bpts = await expectOk(c.get('/me/points', { as: 'b' }));
eq(bpts.totals.total, 30, 'B points with daily caps');
// 마일스톤 완료 체크
const ms = (await expectOk(c.get(`/groups/${prop.id}`, { as: 'a' }))).milestones;
await expectFail(c.post(`/groups/${prop.id}/milestones/${ms[0].id}`, { done: true }, { as: 'b' }), 403, 'only leader marks milestone');
await expectOk(c.post(`/groups/${prop.id}/milestones/${ms[0].id}`, { done: true, evidence: 'https://example.com/plan' }, { as: 'a' }));
ok((await expectOk(c.get(`/groups/${prop.id}`, { as: 'a' }))).milestones[0].done_at, 'milestone done');
console.log('실행·열람 ok');

// 6. 장부
await expectOk(c.post(`/groups/${prop.id}/ledger`, { kind: 'revenue', entry_date: today, amount: 1200000, channel: '대행료 3곳 × 4개월', is_external: true }, { as: 'a' }));
for (const k of ['a', 'b', 'c', 'd']) await expectOk(c.post(`/groups/${prop.id}/ledger`, { kind: 'expense', entry_date: today, amount: 50000, category: '촬영 소품', payer_type: 'member' }, { as: k }));
await expectFail(c.post(`/groups/${prop.id}/ledger`, { kind: 'expense', entry_date: today, amount: 100000, payer_type: 'hq' }, { as: 'a' }), 400, 'member cannot record hq advance');
await expectOk(c.post(`/groups/${prop.id}/ledger`, { kind: 'expense', entry_date: today, amount: 100000, category: '광고비 선지원', payer_type: 'hq' }, { as: 'admin' }));
const gv = await expectOk(c.get(`/groups/${prop.id}`, { as: 'a' }));
eq([gv.ledger_totals.revenue_external, gv.ledger_totals.expenses, gv.ledger_totals.member_contrib, gv.ledger_totals.hq_advance], [1200000, 300000, 200000, 100000], 'ledger totals');
console.log('장부 ok');

// 7. 기여율 + 정산
const draft = await expectOk(c.get(`/groups/${prop.id}/contribution`, { as: 'a' }));
const byUser = Object.fromEntries(draft.map(d => [d.user_id, d]));
ok(byUser[B.id].auto_share > byUser[D.id].auto_share, 'B (3 logs) > D (0 logs, missed checkin)');
await expectFail(c.post(`/groups/${prop.id}/contribution`, { shares: draft.map(d => ({ user_id: d.user_id, share: d.user_id === B.id ? d.auto_share + 0.3 : d.auto_share - 0.15 })) }, { as: 'a' }), 400, 'adjust limit ±10pp');
// 30/30/25 비율을 ±10pp 안에서 맞추기 어려우니 자동 산정값을 그대로 확정
await expectOk(c.post(`/groups/${prop.id}/contribution`, { shares: draft.map(d => ({ user_id: d.user_id, share: d.auto_share })) }, { as: 'a' }));
await expectFail(c.post(`/groups/${prop.id}/settlements`, {}, { as: 'b' }), 403, 'only leader settles');
const st = await expectOk(c.post(`/groups/${prop.id}/settlements`, { period_start: '2026-01-01', period_end: today }, { as: 'a' }), 'settlement');
eq([st.status, st.result.N, st.result.Mr, st.result.Hr, st.result.D, st.result.A, st.result.L, st.result.P], ['confirming', 900000, 200000, 100000, 600000, 60000, 180000, 360000], 'TC1 waterfall via API');
eq(st.result.members.reduce((a, m) => a + m.gross, 0), 360000, 'pool fully distributed');
await expectFail(c.post(`/groups/${prop.id}/settlements`, {}, { as: 'a' }), 400, 'one open settlement at a time');
eq((await c.get(`/challenges/${prop.id}`, { as: 'a' })).data.stage, 'settling');
await expectFail(c.get(`/settlements/${st.id}`, { as: 'e' }), 403, 'outsider cannot view settlement');
// 확인/이의
await expectOk(c.post(`/settlements/${st.id}/confirm`, { confirmed: true }, { as: 'b' }));
await expectOk(c.post(`/settlements/${st.id}/confirm`, { confirmed: false, dispute_note: '제 완료 기록 하나가 빠진 것 같습니다' }, { as: 'd' }));
eq((await c.get(`/settlements/${st.id}`, { as: 'a' })).data.status, 'disputed', 'dispute flips status');
eq((await c.get('/admin/disputes', { as: 'admin' })).data.length, 1);
await expectOk(c.post(`/settlements/${st.id}/confirm`, { confirmed: true }, { as: 'd' }), 'D confirms after group mediation');
await expectOk(c.post(`/settlements/${st.id}/confirm`, { confirmed: true }, { as: 'c' }));
await expectOk(c.post(`/settlements/${st.id}/confirm`, { confirmed: true }, { as: 'a' }));
// 페이퍼 승인 전 검수 불가
await expectFail(c.post(`/settlements/${st.id}/review`, { approve: true }, { as: 'admin' }), 400, 'paper required before payout');
console.log('정산표 ok');

// 8. 페이퍼
const pre = await expectOk(c.get(`/groups/${prop.id}/paper/prefill`, { as: 'a' }));
eq([pre.revenue_external, pre.expenses, pre.hours, pre.has_sales], [1200000, 300000, 31, true], 'prefill from ledger/checkins');
await expectFail(c.post(`/groups/${prop.id}/paper`, { form: { pain: 'x' } }, { as: 'b' }), 403, 'only leader writes paper');
const paper = await expectOk(c.post(`/groups/${prop.id}/paper`, { form: { name: pre.name, pain: '자영업자는 SNS 할 시간이 없다', product: '월 8개 게시물 대행', revenue_external: 1200000, expenses: 300000, customers: 3, hours: 31, state: 'ongoing', good: ['단골 관계에서 첫 계약', '역할 분담이 명확했다'], bad: ['촬영 일정 조율이 힘들었다'], next: '계약서 양식을 먼저 만든다', to_next: '첫 고객은 아는 사람에게서 나옵니다' }, private_fields: ['expenses'], publish_scope: 'public', submit: true }, { as: 'a' }), 'paper submit');
eq(paper.status, 'review');
await expectFail(c.post(`/groups/${prop.id}/paper`, { form: { pain: 'y' } }, { as: 'a' }), 400, 'submitted paper locked');
const pq = await expectOk(c.get('/admin/papers', { as: 'admin' }));
eq(pq.length, 1);
await expectOk(c.post(`/admin/papers/${paper.id}/review`, { decision: 'approve', note: '좋은 기록입니다' }, { as: 'admin' }));
// 공개: 비회원 요약, L1 요약, L3 전문(비공개 항목 가림), 그룹원 전문
const pubList = await expectOk(c.get('/public/papers'));
eq(pubList.length, 1); eq(pubList[0].summary.revenue_external, undefined, 'exact revenue never in public summary'); eq(pubList[0].summary.has_sales, true);
const pE = await expectOk(c.get(`/papers/${paper.id}`, { as: 'e' }));
eq(pE.full, false, 'L1 summary only');
const pF = await expectOk(c.get(`/papers/${paper.id}`, { as: 'f' }));
eq([pF.full, pF.form.expenses, pF.form.revenue_external], [true, null, 1200000], 'L3 full with private field masked');
const pB = await expectOk(c.get(`/papers/${paper.id}`, { as: 'b' }));
eq(pB.form.expenses, 300000, 'member sees private field');
eq((await c.get('/public/stats')).data.papers, 1);
console.log('페이퍼 ok');

// 9. 정산 검수 → 지급
await expectOk(c.post(`/settlements/${st.id}/review`, { approve: true, note: '장부 확인 완료' }, { as: 'admin' }), 'settlement review');
let sv = await expectOk(c.get(`/settlements/${st.id}`, { as: 'a' }));
eq(sv.status, 'reviewed');
const sum = sv.payouts.reduce((a, p) => a + p.gross, 0);
eq(sum, 900000, 'payouts sum to N');
ok(sv.payouts.find(p => p.kind === 'hq' && p.user_id == null && p.gross === 60000), 'hq payout row');
ok(sv.payouts.find(p => p.kind === 'leader' && p.user_id === A.id && p.gross === 180000 && p.withholding === 5940), 'leader payout w/ 3.3%');
await expectFail(c.post(`/settlements/${st.id}/payouts/${sv.payouts[0].id}`, { status: 'paid' }, { as: 'b' }), 403, 'member cannot mark paid');
for (const p of sv.payouts) await expectOk(c.post(`/settlements/${st.id}/payouts/${p.id}`, { status: 'paid' }, { as: 'a' }));
sv = await expectOk(c.get(`/settlements/${st.id}`, { as: 'a' }));
eq(sv.status, 'paid', 'all paid');
// 완주 처리 → 배지
await expectOk(c.post(`/admin/challenges/${prop.id}/complete`, {}, { as: 'admin' }));
const meA = await expectOk(c.get('/me', { as: 'a' }));
ok(meA.badges.some(b => b.code === 'leader_completion') && meA.badges.some(b => b.code === 'completion'), 'leader badges');
const meB = await expectOk(c.get('/me', { as: 'b' }));
ok(meB.badges.some(b => b.code === 'completion'), 'member completion badge');
eq(meB.progress.next, 'L3'); eq(meB.progress.eligible, true, 'B eligible for L3');
const pr = await expectOk(c.post('/me/promotion', { note: '라운드 완주', evidence: '페이퍼 #1' }, { as: 'b' }));
await expectFail(c.post('/me/promotion', { note: 'x' }, { as: 'b' }), 400, 'one pending request');
await expectFail(c.post('/me/promotion', { note: 'x' }, { as: 'e' }), 400, 'L1→L2 is automatic, not by request');
const prq = await expectOk(c.get('/admin/promotions', { as: 'admin' }));
eq(prq[0].progress.eligible, true);
await expectOk(c.post(`/admin/promotions/${pr.id}`, { decision: 'approve', note: '축하합니다' }, { as: 'admin' }));
eq((await c.get('/me', { as: 'b' })).data.level, 'L3', 'B promoted to L3');
await expectOk(c.post(`/challenges/${prop.id}/stage`, { stage: 'closed' }, { as: 'admin' }));
console.log('검수·지급·승급 ok');

// 10. 커뮤니티 · 이벤트 · 자동 승급(설정 변경)
await expectFail(c.post('/posts', { board: 'share', title: '월 300 보장 방법', body: '이 방법이면 수익 보장됩니다' }, { as: 'b' }), 400, 'banned phrase');
await expectFail(c.post('/posts', { board: 'notice', title: 'x', body: 'y' }, { as: 'b' }), 403, 'notice staff only');
await expectFail(c.get('/posts?board=swap', { as: 'e' }), 403, 'swap board L2+');
const po = await expectOk(c.post('/posts', { board: 'question', title: '첫 계약서 양식 어떻게 쓰셨나요?', body: '카페 사장님과 구두로만 합의했는데 문서가 필요할까요?' }, { as: 'c' }));
await expectOk(c.post(`/posts/${po.id}/comments`, { body: '간단한 1장짜리 합의서라도 쓰는 게 좋았습니다' }, { as: 'b' }));
await expectFail(c.post(`/posts/${po.id}/helpful`, {}, { as: 'c' }), 400, 'self helpful');
eq((await expectOk(c.post(`/posts/${po.id}/helpful`, {}, { as: 'd' }))).on, true);
const pview = await expectOk(c.get(`/posts/${po.id}`, { as: 'e' }));
eq([pview.helpful_count, pview.comments.length], [1, 1]);
const feed = await expectOk(c.get('/feed', { as: 'e' }));
ok(feed.some(f => f.kind === 'done') && feed.some(f => f.kind === 'post') && feed.some(f => f.kind === 'badge'), 'feed kinds');
const ev = await expectOk(c.post('/admin/events', { type: 'machal_day', title: '11월 마챌데이', starts_at: '2026-11-25 19:30:00', location: '서울 성수', attendance_code: 'MD11' }, { as: 'admin' }));
await expectOk(c.post(`/events/${ev.id}/register`, {}, { as: 'e' }));
await expectFail(c.post(`/events/${ev.id}/attend`, { code: 'WRONG' }, { as: 'e' }), 400, 'wrong attendance code');
await expectOk(c.post(`/events/${ev.id}/attend`, { code: 'md11' }, { as: 'e' }));
const evs = await expectOk(c.get('/events', { as: 'e' }));
eq([evs[0].my_status, evs[0].attendance_code], ['attended', undefined], 'attended; code hidden from members');
// 설정 변경으로 L2 자동 승급 조건을 낮추고 자산 진단 제출 → 자동 승급
await expectFail(c.put('/admin/settings', { key: 'levels', value: { L2: { points: 30 } } }, { as: 'admin' }), 400, 'settings change needs reason');
await expectOk(c.put('/admin/settings', { key: 'levels', value: { L2: { points: 30, require_asset_diag: true, require_event: 1, min_days: 0 } }, reason: '테스트용 조건 완화' }, { as: 'admin' }));
await expectFail(c.put('/admin/settings', { key: 'evil', value: 1, reason: 'x' }, { as: 'admin' }), 400, 'unknown setting key');
eq((await c.get('/public/levels')).data.rules.L2.points, 30, 'settings override visible');
const diag = await expectOk(c.post('/me/asset-diag', { time: '주 6시간', skills: '사진, 엑셀' }, { as: 'e' }));
eq(diag.promoted, true, 'auto promotion to L2 after conditions met');
eq((await c.get('/me', { as: 'e' })).data.level, 'L2');
// 운영 대시보드 · 감사 로그 · 공개 통계
const dash = await expectOk(c.get('/admin/dashboard', { as: 'admin' }));
ok(dash.first_sales === 0 && dash.completions === 4 && dash.queues.applications === 0, 'admin dashboard');
await expectOk(c.post(`/admin/users/${C.id}`, { badge: 'first_sale', evidence: '카페 A 입금 확인' }, { as: 'admin' }));
eq((await c.get('/public/stats')).data.first_sales, 1);
ok((await expectOk(c.get('/admin/audit', { as: 'admin' }))).rows.length > 10, 'audit log');
await expectFail(c.get('/admin/audit', { as: 'b' }), 403, 'staff only');
const dB = await expectOk(c.get('/dashboard', { as: 'b' }));
ok(dB.me && Array.isArray(dB.tasks) && Array.isArray(dB.feed), 'member dashboard');
console.log('커뮤니티·이벤트·설정 ok');

// 11. 중단 흐름 + 이월 정산 + 솔로 챌린지
const solo = await expectOk(c.post('/challenges', { type: 'solo', title: '노션 템플릿 1개 판매', field_code: 'S-02', summary: '혼자 하는 챌린지' }, { as: 'e' }));
eq(solo.stage, 'active', 'solo starts immediately');
await expectFail(c.post(`/challenges/${solo.id}/apply`, { note: 'x' }, { as: 'b' }), 400, 'cannot apply to solo');
await expectOk(c.post(`/challenges/${solo.id}/stage`, { stage: 'stopped' }, { as: 'e' }));
eq((await c.get('/public/stats')).data.closed.stopped, 1);
// 비밀번호 변경 · 임시 비밀번호
await expectFail(c.put('/me/password', { current: 'wrong', next: 'newpass123' }, { as: 'c' }), 400, 'wrong current password');
await expectOk(c.put('/me/password', { current: 'password1', next: 'newpass123' }, { as: 'c' }));
await expectFail(c.post('/auth/login', { email: 'c@test.kr', password: 'password1' }, { as: 'c2' }), 401, 'old password rejected');
await expectOk(c.post('/auth/login', { email: 'c@test.kr', password: 'newpass123' }, { as: 'c2' }));
const tp = await expectOk(c.post(`/admin/users/${C.id}`, { temp_password: true }, { as: 'admin' }));
ok(/^mc[0-9a-f]{8}$/.test(tp.temp_password), 'temp password issued');
await expectFail(c.get('/me', { as: 'c2' }), 401, 'sessions cleared after temp password');
await expectOk(c.post('/auth/login', { email: 'c@test.kr', password: tp.temp_password }, { as: 'c3' }));
console.log('중단·솔로 ok');

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
await expectFail(c.get('/admin/export?table=sessions', { as: 'admin' }), 400, 'export unknown table');
{
  const mod = await import('../functions/api/[[path]].js');
  const req = new Request('http://localhost/api/admin/export?table=users', { headers: { cookie: 'machal_session=' + c.jar.admin.replace('machal_session=', '') } });
  const res = await mod.onRequest({ request: req, env: { DB: db }, params: {}, waitUntil() {} });
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  ok(res.status === 200 && res.headers.get('content-type').startsWith('text/csv') && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF, 'csv with BOM');
  ok(text.split('\r\n')[0].includes('email') && !text.includes('password_hash'), 'csv columns safe');
}
// 탈퇴: 진행 중인 챌린지가 있으면 막고, 없으면 익명화
await expectFail(c.post('/me/withdraw', { password: 'wrong' }, { as: 'f' }), 400, 'withdraw wrong password');
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



// 13. v1.2 — 운영본부 콘솔
{
  const { FakeD1 } = await import('./harness.js');
  const { runMigrations } = await import('../functions/_lib/admin-routes.js');
  const { readFileSync } = await import('node:fs');
  // 예전(v1.1) 스키마 DB에 새 열이 붙는지 확인
  const oldSql = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
    .replace(/^\s*recruit_until TEXT,.*$/m, '').replace(/^\s*status TEXT NOT NULL DEFAULT 'scheduled',.*$/m, '').replace(/^\s*hidden INTEGER NOT NULL DEFAULT 0,\s+-- v1\.2.*$/m, '');
  const old = new FakeD1(); old.db.exec(oldSql);
  const cols = t => old.db.prepare(`PRAGMA table_info(${t})`).all().map(r => r.name);
  ok(!cols('rounds').includes('recruit_until') && !cols('events').includes('status') && !cols('comments').includes('hidden'), 'old schema lacks v1.2 columns');
  await runMigrations(old); await runMigrations(old);
  ok(cols('rounds').includes('recruit_until') && cols('events').includes('status') && cols('comments').includes('hidden'), 'migrations add columns');
  eq(old.db.prepare('SELECT COUNT(*) AS c FROM schema_migrations').get().c, 3, 'migrations recorded once');
}
eq((await expectOk(c.get('/me', { as: 'admin' }))).is_owner, true, 'setup account is owner');
eq((await expectOk(c.get('/me', { as: 'b' }))).is_owner, false);
// 운영진 지정: 운영자만 / 일반 운영진은 규칙·개인정보 내려받기 불가
await expectFail(c.post('/admin/staff', { action: 'grant', who: 'b@test.kr' }, { as: 'b' }), 403, 'member cannot grant');
await expectOk(c.post('/admin/staff', { action: 'grant', who: 'b@test.kr' }, { as: 'admin' }), 'grant staff');
const staffList = await expectOk(c.get('/admin/staff', { as: 'b' }));
ok(staffList.rows.length === 2 && staffList.me.is_owner === false && staffList.rows.find(r => r.is_owner).email === 'admin@machal.kr', 'staff list');
await expectOk(c.get('/admin/dashboard', { as: 'b' }), 'staff sees dashboard');
await expectFail(c.put('/admin/settings', { key: 'min_group', value: 2, reason: 'x' }, { as: 'b' }), 403, 'non-owner cannot change settings');
await expectFail(c.get('/admin/export?table=users', { as: 'b' }), 403, 'non-owner cannot export PII');
await expectOk(c.get('/admin/export?table=ledger', { as: 'b' }), 'staff can export ledger');
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
const cd = await expectOk(c.get(`/admin/users/${C.id}`, { as: 'admin' }));
ok(cd.user.id === C.id && cd.groups.length > 0 && cd.badges.some(x => x.code === 'first_sale') && cd.points.total > 0 && cd.progress && !('password_hash' in cd.user), 'user detail');
const note = await expectOk(c.post('/admin/notes', { ref_type: 'user', ref_id: C.id, body: '첫 매출 인증 자료 원본은 메일로 받음' }, { as: 'b' }));
eq((await expectOk(c.get(`/admin/users/${C.id}`, { as: 'admin' }))).notes.length, 1, 'note visible');
await expectOk(c.del(`/admin/notes/${note.id}`, { as: 'admin' }), 'owner deletes note');
// 그룹 모니터링
const groups = await expectOk(c.get('/admin/groups', { as: 'admin' }));
ok(groups.length >= 2 && groups.every(g => 'health' in g && 'checkin_rate' in g), 'groups list');
const gd = await expectOk(c.get(`/admin/groups/${groups.find(g => g.type === 'group').id}`, { as: 'admin' }));
ok(gd.members.length > 0 && Array.isArray(gd.checkins) && gd.ledger && Array.isArray(gd.history), 'group detail');
await expectFail(c.post(`/admin/groups/${solo.id}/stage`, { stage: 'closed' }, { as: 'admin' }), 400, 'stage change needs reason');
await expectOk(c.post(`/admin/groups/${solo.id}/stage`, { stage: 'closed', reason: '본인 요청으로 종료' }, { as: 'admin' }));
eq((await expectOk(c.get(`/admin/groups/${solo.id}`, { as: 'admin' }))).challenge.stage, 'closed');
// 지급 · 재원
const pays = await expectOk(c.get('/admin/payouts?status=paid', { as: 'admin' }));
ok(pays.rows.length > 0 && pays.totals.length > 0, 'payouts list');
await expectFail(c.post('/admin/payouts/bulk', { status: 'paid', ids: [] }, { as: 'admin' }), 400, 'bulk needs ids');
await expectOk(c.post('/admin/hq/expenses', { spent_on: today, category: 'casebook', amount: 120000, memo: '사례집 인쇄' }, { as: 'admin' }));
await expectFail(c.post('/admin/hq/expenses', { spent_on: today, category: 'party', amount: 1 }, { as: 'admin' }), 400, 'hq category');
const hq = await expectOk(c.get('/admin/hq', { as: 'admin' }));
ok(hq.quarters.length >= 1 && hq.quarters[0].spent === 120000 && hq.quarters[0].income > 0, 'hq report');
const pub = (await c.get('/public/hq-report')).data;
ok(pub.quarters[0].by_category.casebook === 120000 && !('refund_hq' in pub.quarters[0]), 'public hq report');
// 단체 알림
{
  let n = 0; for (const lv of ['L3', 'L4', 'L5']) n += (await expectOk(c.get(`/admin/users?level=${lv}&status=active`, { as: 'admin' }))).total;
  eq((await expectOk(c.get('/admin/broadcast/preview?type=level&level=L3', { as: 'admin' }))).count, n, 'segment count');
}
await expectFail(c.post('/admin/broadcast', { type: 'challenge', title: 'x' }, { as: 'admin' }), 400, 'challenge segment needs id');
const bc = await expectOk(c.post('/admin/broadcast', { type: 'all', title: '12월 마챌데이 장소 안내', body: '성수동으로 바뀝니다', link: '#/events', post_notice: true }, { as: 'admin' }));
ok(bc.recipients >= 5 && bc.post_id, 'broadcast sent');
ok((await expectOk(c.get('/me/notifications', { as: 'd' }))).some(n => n.title === '12월 마챌데이 장소 안내'), 'member got broadcast');
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
ok(!(await expectOk(c.get('/events', { as: 'd' }))).some(x => x.id === ev2.id), 'cancelled event hidden for members');
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
ok(sys.tables.length === 38 && sys.migrations.length === 3, 'system info');
await expectFail(c.get('/admin/backup', { as: 'b' }), 403, 'backup owner only');
const bk = await expectOk(c.get('/admin/backup', { as: 'admin' }));
ok(bk.tables.users.length > 0 && !('password_hash' in bk.tables.users[0]) && !bk.tables.sessions, 'backup safe');
await expectOk(c.del('/admin/settings/levels', { as: 'admin' }));
eq((await c.get('/public/levels')).data.rules.L2.points, 300, 'settings reset to default');
await expectOk(c.post('/admin/staff', { action: 'revoke', who: 'b@test.kr' }, { as: 'admin' }));
await expectFail(c.get('/admin/dashboard', { as: 'b' }), 403, 'revoked staff');
console.log('v1.2 운영본부 콘솔 ok');

console.log('\nAPI 전체 흐름 테스트 통과 ✔');
