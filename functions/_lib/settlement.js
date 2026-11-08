// 마챌 정산 계산 (MC-02 부록 A / MC-03 7장)
// 순수 함수: 같은 입력이면 언제 실행해도 같은 결과가 나온다. 모든 중간값을 결과에 담는다.

export const RULE_VERSION = '1.0';

/**
 * @param {object} input
 * @param {number} input.revenue_external   외부 매출 합계 R (부가세 제외, 환불 차감)
 * @param {number} input.revenue_internal   내부 매출 (참고용, 배분 제외)
 * @param {number} input.expenses           직접 비용 합계 E
 * @param {Array<{user_id:number, amount:number}>} input.member_contrib  그룹원 분담금 M[i]
 * @param {number} input.hq_advance         운영본부 선지원 H
 * @param {boolean} input.agency            마챌 법인 정산 대행 여부
 * @param {number} input.agency_rate        대행 수수료율 f (예 0.03)
 * @param {{hq:number, leader:number, pool:number}} input.ratios  배분 비율 (합 1)
 * @param {number} input.leader_id
 * @param {Array<{user_id:number, share:number}>} input.shares  그룹원 풀 기여율 s[i] (합 1)
 * @param {number} input.min_settlement     최소 정산 금액 T
 * @param {number} input.carry_in           이월 잔액 B
 * @param {number} input.withholding_rate   원천징수율 (예 0.033)
 */
export function computeSettlement(input) {
  const R = int(input.revenue_external);
  const E = int(input.expenses);
  const M = (input.member_contrib || []).map(m => ({ user_id: m.user_id, amount: int(m.amount) })).filter(m => m.amount > 0);
  const H = int(input.hq_advance);
  const f = input.agency ? Number(input.agency_rate || 0) : 0;
  const ratios = normalizeRatios(input.ratios);
  const shares = normalizeShares(input.shares || []);
  const T = int(input.min_settlement);
  const B = int(input.carry_in);
  const w = Number(input.withholding_rate || 0);

  const steps = [];
  const out = {
    rule_version: RULE_VERSION,
    R, E, N: R - E,
    member_refunds: [], Mr: 0, N1: 0,
    Hr: 0, N2: 0,
    F: 0, N3: 0,
    carry_in: B, D: 0,
    A: 0, L: 0, P: 0,
    members: [],
    adjustment: null,
    carried: 0,
    status: 'distributed',
    steps,
  };

  steps.push(`1) 순수익 N = R − E = ${fmt(R)} − ${fmt(E)} = ${fmt(out.N)}`);
  if (out.N <= 0) {
    out.status = 'no_distribution';
    steps.push('   N ≤ 0 → 배분 없음. 분담금·선지원 회수 없음. 종료');
    return out;
  }

  // 2) 분담금 회수
  const sumM = M.reduce((a, m) => a + m.amount, 0);
  out.Mr = Math.min(out.N, sumM);
  if (sumM > 0) {
    let acc = 0;
    out.member_refunds = M.map((m, i) => {
      let r = i === M.length - 1 ? out.Mr - acc : Math.floor(out.Mr * m.amount / sumM);
      acc += r;
      return { user_id: m.user_id, contributed: m.amount, refund: r };
    });
  }
  out.N1 = out.N - out.Mr;
  steps.push(`2) 분담금 회수 Mr = min(N, ΣM) = min(${fmt(out.N)}, ${fmt(sumM)}) = ${fmt(out.Mr)} → N1 = ${fmt(out.N1)}`);

  // 3) 선지원 회수
  out.Hr = Math.min(out.N1, H);
  out.N2 = out.N1 - out.Hr;
  steps.push(`3) 선지원 회수 Hr = min(N1, H) = min(${fmt(out.N1)}, ${fmt(H)}) = ${fmt(out.Hr)} → N2 = ${fmt(out.N2)}`);

  // 4) 대행 수수료
  out.F = f > 0 ? Math.round(out.N2 * f) : 0;
  out.N3 = out.N2 - out.F;
  steps.push(`4) 대행 수수료 F = round(N2 × ${f}) = ${fmt(out.F)} → N3 = ${fmt(out.N3)}`);

  // 5) 배분 가능액
  out.D = out.N3 + B;
  steps.push(`5) 배분 가능액 D = N3 + 이월 B = ${fmt(out.N3)} + ${fmt(B)} = ${fmt(out.D)}`);
  if (out.D < T) {
    out.status = 'carried';
    out.carried = out.D;
    steps.push(`   D < 최소 정산 금액 T(${fmt(T)}) → 전액 이월 B' = ${fmt(out.D)}`);
    return out;
  }

  // 6) 몫
  out.A = Math.floor(out.D * ratios.hq);
  out.L = Math.floor(out.D * ratios.leader);
  out.P = out.D - out.A - out.L;
  steps.push(`6) 운영본부 A = floor(D × ${ratios.hq}) = ${fmt(out.A)} / 그룹장 L = floor(D × ${ratios.leader}) = ${fmt(out.L)} / 풀 P = D − A − L = ${fmt(out.P)}`);

  // 7) 그룹원 풀 분배
  let sumG = 0;
  out.members = shares.map(s => {
    const g = Math.floor(out.P * s.share);
    sumG += g;
    return { user_id: s.user_id, share: s.share, gross: g };
  });
  const diff = out.P - sumG;
  if (diff !== 0 && out.members.length) {
    let maxIdx = 0;
    out.members.forEach((m, i) => { if (m.share > out.members[maxIdx].share) maxIdx = i; });
    out.members[maxIdx].gross += diff;
    out.adjustment = { user_id: out.members[maxIdx].user_id, amount: diff };
    steps.push(`7) 풀 분배 후 차액 ${fmt(diff)}원을 기여율 최대자(user ${out.members[maxIdx].user_id})에게 가산`);
  } else {
    steps.push('7) 풀 분배 G[i] = floor(P × s[i]), 차액 없음');
  }

  // 8) 원천징수
  const wh = g => Math.round(g * w);
  out.leader_withholding = wh(out.L);
  out.leader_net = out.L - out.leader_withholding;
  out.members = out.members.map(m => ({ ...m, withholding: wh(m.gross), net: m.gross - wh(m.gross) }));
  steps.push(`8) 원천징수 예상액 = 지급액 × ${w} (세전·세후 함께 표시)`);
  out.withholding_rate = w;
  out.ratios = ratios;
  out.total_hours = input.total_hours || 0;
  out.hourly_net = out.total_hours > 0 ? Math.round(out.N / out.total_hours) : null;
  return out;
}

export function buildPayouts(result, leader_id) {
  const rows = [];
  for (const r of result.member_refunds || []) if (r.refund > 0) rows.push({ user_id: r.user_id, kind: 'refund_member', gross: r.refund, withholding_rate: 0, withholding: 0, net: r.refund });
  if (result.Hr > 0) rows.push({ user_id: null, kind: 'refund_hq', gross: result.Hr, withholding_rate: 0, withholding: 0, net: result.Hr });
  if (result.F > 0) rows.push({ user_id: null, kind: 'fee', gross: result.F, withholding_rate: 0, withholding: 0, net: result.F });
  if (result.status !== 'distributed') return rows;
  if (result.A > 0) rows.push({ user_id: null, kind: 'hq', gross: result.A, withholding_rate: 0, withholding: 0, net: result.A });
  if (result.L > 0) rows.push({ user_id: leader_id, kind: 'leader', gross: result.L, withholding_rate: result.withholding_rate, withholding: result.leader_withholding, net: result.leader_net });
  for (const m of result.members || []) if (m.gross > 0) rows.push({ user_id: m.user_id, kind: 'member', gross: m.gross, withholding_rate: result.withholding_rate, withholding: m.withholding, net: m.net });
  return rows;
}

export function normalizeRatios(r) {
  const hq = Number(r?.hq ?? 0.1), leader = Number(r?.leader ?? 0.3), pool = Number(r?.pool ?? 0.6);
  const s = hq + leader + pool;
  if (Math.abs(s - 1) > 0.0001) throw new Error(`배분 비율 합이 100%가 아닙니다 (${Math.round(s * 100)}%)`);
  return { hq, leader, pool };
}

export function normalizeShares(list) {
  const valid = list.filter(x => Number(x.share) > 0);
  const s = valid.reduce((a, x) => a + Number(x.share), 0);
  if (!valid.length) return [];
  return valid.map(x => ({ user_id: x.user_id, share: Number(x.share) / s }));
}

function int(v) { const n = Math.round(Number(v || 0)); return Number.isFinite(n) ? n : 0; }
function fmt(n) { return Number(n).toLocaleString('ko-KR'); }
