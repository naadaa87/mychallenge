// 규칙 기본값 (v2.0 커뮤니티 운영 모델). 운영본부 설정(settings 테이블)에서 덮어쓸 수 있다.
// 정기모임 → 학습·도전그룹 → 기록·공유 → 성과발표회. 수익 배분 방식은 실제 수익이 나는 그룹이 생긴 뒤 따로 정한다.

export const LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];
export const LEVEL_NAMES = { L0: '게스트', L1: '챌린저', L2: '메이커', L3: '어치버', L4: '리더', L5: '마스터' };
export const FIELDS = {
  'S-01': '콘텐츠·미디어', 'S-02': '디지털 상품', 'S-03': '커머스',
  'S-04': '서비스·프리랜싱', 'S-05': '공간·오프라인', 'S-06': '웹·앱·자동화',
};

// ───────── 그룹 ─────────
export const GROUP_TYPES = { study: '학습그룹', challenge: '도전그룹' };
export const GROUP_STAGES = { recruiting: '모집 중', active: '진행 중', closed: '종료', stopped: '중단' };
export const RUNNING_STAGES = ['recruiting', 'active'];
export const GROUP_ROLES = { leader: '그룹리더', sub: '부리더', member: '그룹원' };
// 목표 지표: [이름, 단위]
export const GOAL_METRICS = {
  revenue: ['매출', '원'], customers: ['유료 고객', '명'], sales: ['판매', '건'], users: ['사용자·구독자', '명'],
  content: ['발행한 콘텐츠', '개'], study: ['학습 과제', '개'], custom: ['직접 정한 지표', ''],
};
export const LOG_KINDS = { progress: '진행 기록', study: '학습 노트', resource: '자료 공유', retro: '회고', notice: '공지' };
export const ATTEND_STATUS = { present: '출석', late: '지각', absent: '결석', excused: '공결' };

// ───────── 정기모임·일정 ─────────
export const EVENT_TYPES = { regular: '정기모임', showcase: '성과발표회', seminar: '세미나·특강', workshop: '워크숍', office_hour: '오피스아워', networking: '네트워킹' };
export const EVENT_TOPICS = { idea: '사업 아이디어', market: '시장 분석', trend: '트렌드', ai: 'AI 활용', sideproject: '사이드프로젝트 사례', group: '그룹 진행 공유' };
export const BOARDS = { notice: '공지', share: '정보·자료', idea: '아이디어', trend: '시장·트렌드·AI', question: '질문', group: '그룹 소식', review: '후기' };

export const BADGE_NAMES = { first_sale: '첫 매출', repeat_sale: '반복 매출', completion: '그룹 완주', leader_completion: '그룹리더 완주', contributor: '페이퍼 기고', founder: '창립 멤버', mentor: '강사·멘토' };
// 예전 포인트 항목 이름(기록 화면 표시용)
export const LEGACY_POINT_LABELS = { checkin_attend: '주간 체크인 제출', checkin_record: '체크인 기록 담당', done_log: '완료 기록', cross_feedback: '교차 피드백', swap: '품앗이 완료', demo_present: '데모데이 발표', coffeechat: '커피챗' };

export const DEFAULT_ATTENDANCE = {
  min_rate: 70,             // 최소 출석률(%). 0이면 쓰지 않음
  late_minutes: 10,         // 시작 후 몇 분이 지나면 지각
  late_per_absence: 3,      // 지각 몇 번을 결석 1번으로 볼지. 0이면 환산하지 않음
  warn_absences: 2,         // 연속 결석 몇 번이면 경고
  warn_on_low_rate: true,   // 출석률이 최소 기준 아래로 내려가면 경고
  rate_after: 3,            // 모임이 몇 번 쌓인 뒤부터 출석률 경고를 줄지
  kick_warnings: 2,         // 경고 몇 번이면 퇴출 대상. 0이면 퇴출 기준 없음
  auto_remove: false,       // true면 퇴출 대상이 되는 즉시 자동 퇴출, false면 리더가 확인 후 퇴출
  excuse: true,             // 모임 전에 불참 사유를 남기면 공결로 인정
  excuse_limit: 2,          // 한 그룹에서 공결로 인정하는 최대 횟수
  checkin_before: 30,       // 시작 몇 분 전부터 출석 코드 입력 가능
};

export const DEFAULT_SETTINGS = {
  levels: {
    L2: { points: 300, require_asset_diag: true, require_event: 1, min_days: 14 },
    L3: { completions: 1, or_first_sale: true },
    L4: { completions: 2, leader_training: true },
    L5: { leader_completions: 2, or_repeat_sale: true },
  },
  points: {
    group_attend: { points: 10, daily_cap: 2, label: '그룹 모임 출석' },
    event_attend: { points: 30, daily_cap: 2, label: '정기모임·세미나 참석' },
    group_log: { points: 5, daily_cap: 2, label: '도전 기록' },
    result_record: { points: 10, daily_cap: 1, label: '성과 기록' },
    post: { points: 5, daily_cap: 1, label: '게시글' },
    comment: { points: 2, daily_cap: 5, label: '댓글' },
    helpful_received: { points: 3, daily_cap: 0, label: '도움이 됐어요 받음' },
    topic_present: { points: 30, daily_cap: 1, label: '정기모임 발제' },
    showcase_present: { points: 50, daily_cap: 1, label: '성과발표회 발표' },
    paper_submit: { points: 100, daily_cap: 1, label: '프로젝트 페이퍼 제출' },
    group_complete: { points: 50, daily_cap: 2, label: '그룹 완주' },
    first_sale: { points: 150, daily_cap: 1, label: '첫 매출 확인' },
    referral: { points: 50, daily_cap: 0, label: '추천' },
  },
  groups: {
    capacity_default: 8,    // 새 그룹의 기본 정원(그룹리더 포함)
    capacity_max: 20,       // 그룹리더가 정할 수 있는 최대 정원
    leader_max_groups: 2,   // 그룹리더 한 명이 동시에 이끄는 그룹 수
    member_max_groups: 3,   // 회원 한 명이 동시에 참여하는 그룹 수
    join_level: 'L1',       // 그룹에 참여할 수 있는 등급
    leader_level: 'L1',     // 그룹리더를 신청할 수 있는 등급
  },
  attendance_default: DEFAULT_ATTENDANCE,
  visibility: { card: 'L1', group_logs: 'L3', paper_full: 'L3' },
  // 이용 통계 수집. start 전에는 모으지 않는다(개인정보처리방침 변경 시행일).
  analytics: { enabled: true, start: '2026-11-25' },
  // KPI 월 목표 (0이면 목표 없음)
  kpi_targets: { visitors: 0, views: 0, apps: 0, signups: 0, active: 0 },
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

// 그룹 출석 규칙을 정리한다(빈 값은 운영본부 기본값, 범위를 벗어나면 잘라 낸다).
export function normalizePolicy(p, base = DEFAULT_ATTENDANCE) {
  const src = { ...base, ...(p && typeof p === 'object' ? p : {}) };
  const n = (v, min, max, d) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : d; };
  return {
    min_rate: n(src.min_rate, 0, 100, base.min_rate),
    late_minutes: n(src.late_minutes, 0, 120, base.late_minutes),
    late_per_absence: n(src.late_per_absence, 0, 10, base.late_per_absence),
    warn_absences: n(src.warn_absences, 0, 10, base.warn_absences),
    warn_on_low_rate: src.warn_on_low_rate === true || src.warn_on_low_rate === 'true' || src.warn_on_low_rate === 1 || src.warn_on_low_rate === 'on',
    rate_after: n(src.rate_after, 1, 20, base.rate_after),
    kick_warnings: n(src.kick_warnings, 0, 10, base.kick_warnings),
    auto_remove: src.auto_remove === true || src.auto_remove === 'true' || src.auto_remove === 1 || src.auto_remove === 'on',
    excuse: src.excuse === true || src.excuse === 'true' || src.excuse === 1 || src.excuse === 'on',
    excuse_limit: n(src.excuse_limit, 0, 20, base.excuse_limit),
    checkin_before: n(src.checkin_before, 0, 180, base.checkin_before),
  };
}

// 출석 기록 목록(오래된 순)으로 한 사람의 출석 현황을 계산한다.
// rows: [{ status: present|late|absent|excused|null }]. 아직 확정되지 않은(null) 모임은 세지 않는다.
export function attendanceStats(rows, policy) {
  let present = 0, late = 0, absent = 0, excused = 0, streak = 0;
  for (const r of rows) {
    if (r.status === 'present') { present++; streak = 0; }
    else if (r.status === 'late') { late++; streak = 0; }
    else if (r.status === 'absent') { absent++; streak++; }
    else if (r.status === 'excused') { excused++; }
  }
  const counted = present + late + absent;
  const lateAbs = policy.late_per_absence > 0 ? Math.floor(late / policy.late_per_absence) : 0;
  const effAbs = absent + lateAbs;
  const rate = counted ? Math.max(0, Math.round((counted - effAbs) / counted * 1000) / 10) : null;
  return { present, late, absent, excused, counted, late_as_absence: lateAbs, effective_absences: effAbs, rate, streak };
}
