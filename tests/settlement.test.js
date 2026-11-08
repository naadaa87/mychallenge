// MC-02 부록 A 테스트 케이스 — 정산 계산기
import { computeSettlement, buildPayouts } from '../functions/_lib/settlement.js';
import { eq, ok } from './harness.js';

const base = { revenue_internal: 0, agency: false, agency_rate: 0.03, ratios: { hq: 0.1, leader: 0.3, pool: 0.6 }, leader_id: 1, min_settlement: 100000, carry_in: 0, withholding_rate: 0.033 };
const shares = [{ user_id: 2, share: 0.30 }, { user_id: 3, share: 0.30 }, { user_id: 4, share: 0.25 }, { user_id: 5, share: 0.15 }];
const contrib = [2, 3, 4, 5].map(u => ({ user_id: u, amount: 50000 }));

// TC1: 기본형, 매출 120만, 비용 30만, 분담금 4×5만, 선지원 10만
{
  const r = computeSettlement({ ...base, revenue_external: 1200000, expenses: 300000, member_contrib: contrib, hq_advance: 100000, shares, total_hours: 180 });
  eq(r.N, 900000, 'TC1 N'); eq(r.Mr, 200000, 'TC1 Mr'); eq(r.Hr, 100000, 'TC1 Hr'); eq(r.D, 600000, 'TC1 D');
  eq(r.A, 60000, 'TC1 A'); eq(r.L, 180000, 'TC1 L'); eq(r.P, 360000, 'TC1 P');
  eq(r.members.map(m => m.gross), [108000, 108000, 90000, 54000], 'TC1 pool split');
  eq(r.member_refunds.map(m => m.refund), [50000, 50000, 50000, 50000], 'TC1 refunds');
  eq(r.leader_withholding, Math.round(180000 * 0.033), 'TC1 withholding');
  eq(r.status, 'distributed');
  const p = buildPayouts(r, 1);
  const total = p.reduce((a, x) => a + x.gross, 0);
  eq(total, 900000, 'TC1 payouts sum equals N');
  ok(p.find(x => x.kind === 'hq').gross === 60000 && p.find(x => x.kind === 'refund_hq').gross === 100000, 'TC1 hq rows');
  console.log('TC1 ok');
}
// TC2: 적자
{
  const r = computeSettlement({ ...base, revenue_external: 250000, expenses: 300000, member_contrib: contrib, hq_advance: 0, shares });
  eq(r.status, 'no_distribution', 'TC2 status'); eq(r.N, -50000); eq(buildPayouts(r, 1).length, 0, 'TC2 no payouts');
  console.log('TC2 ok');
}
// TC3: 최소 정산 미달 → 이월
{
  const r = computeSettlement({ ...base, revenue_external: 150000, expenses: 60000, member_contrib: [], hq_advance: 0, shares });
  eq(r.D, 90000, 'TC3 D'); eq(r.status, 'carried', 'TC3 status'); eq(r.carried, 90000, 'TC3 carried');
  // 이월분이 다음 정산에 합쳐짐
  const r2 = computeSettlement({ ...base, revenue_external: 100000, expenses: 50000, member_contrib: [], hq_advance: 0, shares, carry_in: 90000 });
  eq(r2.D, 140000, 'TC3 carry in'); eq(r2.status, 'distributed');
  console.log('TC3 ok');
}
// TC4: 대행 수수료 3%
{
  const r = computeSettlement({ ...base, revenue_external: 1200000, expenses: 300000, member_contrib: contrib, hq_advance: 100000, shares, agency: true });
  eq(r.F, 18000, 'TC4 F'); eq(r.D, 582000, 'TC4 D'); eq(r.A, 58200, 'TC4 A'); eq(r.L, 174600, 'TC4 L'); eq(r.P, 349200, 'TC4 P');
  console.log('TC4 ok');
}
// TC5: 나누어떨어지지 않는 경우 — 차액을 기여율 최대자에게
{
  const r = computeSettlement({ ...base, revenue_external: 333333, expenses: 0, member_contrib: [], hq_advance: 0, shares: [{ user_id: 2, share: 1 / 3 }, { user_id: 3, share: 1 / 3 }, { user_id: 4, share: 1 / 3 }] });
  eq(r.A + r.L + r.P, r.D, 'TC5 A+L+P = D');
  eq(r.members.reduce((a, m) => a + m.gross, 0), r.P, 'TC5 pool sums to P');
  ok(r.adjustment == null || r.adjustment.amount > 0, 'TC5 adjustment recorded');
  console.log('TC5 ok');
}
// TC6: 균등형(그룹장 풀 포함) 비율 검증 + 비율 합 오류
{
  const r = computeSettlement({ ...base, ratios: { hq: 0.1, leader: 0.2, pool: 0.7 }, revenue_external: 1000000, expenses: 0, member_contrib: [], hq_advance: 0, shares: [{ user_id: 1, share: 0.5 }, { user_id: 2, share: 0.5 }] });
  eq([r.A, r.L, r.P], [100000, 200000, 700000], 'TC6 equal preset');
  let threw = false; try { computeSettlement({ ...base, ratios: { hq: 0.2, leader: 0.3, pool: 0.6 }, revenue_external: 1, expenses: 0 }); } catch { threw = true; }
  ok(threw, 'TC6 ratio sum check');
  console.log('TC6 ok');
}
console.log('settlement tests passed');
