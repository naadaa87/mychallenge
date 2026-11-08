// 규칙 기본값 (MC-03 · MC-04). 관리자 설정(settings 테이블)에서 덮어쓸 수 있다.

export const LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];
export const LEVEL_NAMES = { L0: '게스트', L1: '챌린저', L2: '메이커', L3: '어치버', L4: '리더', L5: '마스터' };
export const FIELDS = {
  'S-01': '콘텐츠·미디어', 'S-02': '디지털 상품', 'S-03': '커머스',
  'S-04': '서비스·프리랜싱', 'S-05': '공간·오프라인', 'S-06': '웹·앱·자동화',
};
export const ROLES = { leader: '그룹장', accounting: '회계', record: '기록', maker: '제작', marketing: '마케팅·판매', general: '일반 참여' };
export const ROLE_WEIGHTS = { leader: 1.0, accounting: 1.2, record: 1.1, maker: 1.15, marketing: 1.15, general: 1.0 };
export const BADGE_NAMES = { first_sale: '첫 매출', repeat_sale: '반복 매출', completion: '라운드 완주', leader_completion: '그룹장 완주', contributor: '페이퍼 기고', founder: '창립 멤버', mentor: '강사·멘토' };

export const DEFAULT_SETTINGS = {
  levels: {
    L2: { points: 300, require_asset_diag: true, require_event: 1, min_days: 14 },
    L3: { completions: 1, or_first_sale: true },
    L4: { completions: 2, leader_training: true },
    L5: { leader_completions: 2, or_repeat_sale: true },
  },
  points: {
    done_log: { points: 5, daily_cap: 2, label: '완료 로그' },
    checkin_attend: { points: 20, daily_cap: 1, label: '주간 체크인 제출' },
    checkin_record: { points: 10, daily_cap: 1, label: '체크인 기록 담당' },
    event_attend: { points: 30, daily_cap: 2, label: '마챌데이·세미나 참석' },
    coffeechat: { points: 15, daily_cap: 2, label: '커피챗' },
    post: { points: 5, daily_cap: 1, label: '게시글' },
    comment: { points: 2, daily_cap: 5, label: '댓글' },
    helpful_received: { points: 3, daily_cap: 0, label: '도움이 됐어요 받음' },
    cross_feedback: { points: 40, daily_cap: 2, label: '교차 피드백' },
    swap: { points: 30, daily_cap: 2, label: '품앗이 완료' },
    paper_submit: { points: 100, daily_cap: 1, label: '프로젝트 페이퍼 제출' },
    demo_present: { points: 50, daily_cap: 1, label: '데모데이 발표' },
    first_sale: { points: 150, daily_cap: 1, label: '첫 매출 인증' },
    referral: { points: 50, daily_cap: 0, label: '추천' },
  },
  presets: {
    basic: { label: '기본형', hq: 0.10, leader: 0.30, pool: 0.60, leader_in_pool: false, desc: '그룹장이 제안하고 이끌되 제작·판매는 그룹이 함께' },
    leader_led: { label: '리더 주도형', hq: 0.10, leader: 0.45, pool: 0.45, leader_in_pool: false, desc: '그룹장이 핵심 자산(채널·노하우·거래처)을 가져옴' },
    equal: { label: '균등형', hq: 0.10, leader: 0.20, pool: 0.70, leader_in_pool: true, desc: '공동 발안, 역할 비중이 비슷함. 그룹장도 풀에 참여' },
    official: { label: '오피셜형', hq: 0.55, leader: 0.15, pool: 0.30, leader_in_pool: false, desc: '마챌 법인이 비용·브랜드·명의·리스크를 모두 부담' },
  },
  hq_ratio_range: [0.05, 0.15],
  min_settlement: 100000,
  budget_cap_person: 100000,
  budget_cap_group: 500000,
  agency_rate: 0.03,
  withholding_rate: 0.033,
  share_adjust_limit: 0.10,
  share_alert_gap: 0.20,
  visibility: { card: 'L1', group_logs: 'L3', paper_full: 'L3', archive: 'L2', swap_board: 'L2', propose: 'L4' },
  review_pass_score: 27,
  milestones: [
    { code: 'declare', title: '4주차 선언 (1페이지 계획 공개)', week: 4 },
    { code: 'first_public', title: '7주차 첫 공개', week: 7 },
    { code: 'cross_feedback', title: '8주차 교차 피드백', week: 8 },
    { code: 'demo_day', title: '12주차 데모데이', week: 12 },
  ],
  review_items: [
    { key: 'asset', label: '그룹 자산 활용', weight: 2 },
    { key: 'pain', label: '불편의 실체', weight: 2 },
    { key: 'speed', label: '첫 매출 속도', weight: 1.5 },
    { key: 'accrue', label: '쌓이는 정도', weight: 1.5 },
    { key: 'cost', label: '초기 비용', weight: 1 },
    { key: 'roles', label: '역할 분담 가능성', weight: 1 },
  ],
};

export function levelIndex(l) { const i = LEVELS.indexOf(l); return i < 0 ? 0 : i; }
export function atLeast(userLevel, required) { return levelIndex(userLevel) >= levelIndex(required); }
export function quarterOf(d = new Date()) { return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`; }

export function deepMerge(base, over) {
  if (!over || typeof over !== 'object') return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(over)) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = deepMerge(base[k], over[k]);
    else out[k] = over[k];
  }
  return out;
}
