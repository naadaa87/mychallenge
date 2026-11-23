// 공개 사이트의 고정 페이지들. 빌드 스크립트가 public/<path>/index.html 로 만든다.
import { SITE } from './config.js';
import { esc, h, img, orgLd, websiteLd } from './layout.js';
import { guideCard, lvIcon, levelStrip, badgeGrid, fieldGrid } from './art.js';
export { guideCard };
import { GUIDES, CATEGORIES, guideBySlug } from './guides.js';
import { legalPages } from './legal.js';
import { DEFAULT_SETTINGS as D, FIELDS, GOAL_METRICS, EVENT_TOPICS } from '../_lib/rules.js';

const A = D.attendance_default;
const G = D.groups;

// ───────────── 재사용 조각 ─────────────
const guideLink = slug => { const g = guideBySlug[slug]; return g ? `<a href="/guide/${slug}/">${esc(g.short)}</a>` : ''; };

// 정기모임에서 성과발표회까지의 흐름
const FLOW = [
  ['정기모임', '함께 살펴보기', '사업 아이디어, 시장, 트렌드, AI 활용, 사이드프로젝트 사례를 발제로 듣고 함께 이야기합니다.'],
  ['그룹 만들기', '관심이 맞는 사람끼리', '정기모임에서 나온 관심사로 학습그룹이나 도전그룹을 엽니다. 그룹은 운영진이 승인한 그룹리더가 만듭니다.'],
  ['목표 세우기', '숫자로 적기', '그룹마다 목표와 기간, 모임 주기, 출석 규칙을 정해 공개합니다. 도전그룹은 셀 수 있는 목표를 적습니다.'],
  ['모이고 출석하기', '온라인·오프라인', '모임마다 출석 코드로 출석합니다. 출석이 계속 저조하면 경고를 받고 그룹에서 나가게 될 수 있습니다.'],
  ['기록하고 나누기', '그룹 밖으로도', '한 일과 배운 것, 성과를 그룹 공간에 남기고 커뮤니티 그룹 소식으로 다른 그룹과 나눕니다.'],
  ['성과발표회', '시즌마다', '그룹들이 목표와 결과, 숫자, 배운 점을 발표합니다. 마무리한 그룹은 프로젝트 페이퍼를 남깁니다.'],
];
const flowTimeline = `<ol class="timeline">${FLOW.map(([t, w, d]) => `<li><span class="tl-week">${w}</span><b>${t}</b><p>${d}</p></li>`).join('')}</ol>`;

// 수익목표 사다리
const GOAL_STEPS = [
  ['배움', '함께 공부하고 정리한 노트와 실습 결과가 남는다', '학습 과제, 정리 노트'],
  ['실행', '계획에서 멈추지 않고 만들기 시작한다', '시제품, 판매 페이지, 첫 콘텐츠'],
  ['첫 반응', '모르는 사람에게 보여 주고 반응을 받는다', '인터뷰, 문의, 사전 신청, 구독자'],
  ['첫 매출', '그룹 밖의 고객이 처음으로 돈을 낸다', '증빙 확인 후 첫 매출 배지'],
  ['반복 매출', '한 번이 아니라 다시 팔린다', '재구매, 정기 고객, 반복 매출 배지'],
  ['성장', '그룹이 끝난 뒤에도 프로젝트가 이어진다', '다음 그룹, 독립, 다른 사람에게 이어 주기'],
];
const goalFlow = `<ol class="flow">${GOAL_STEPS.map(([t, d, e], i) => `<li class="${i === 3 ? 'flow-split' : ''}"><span class="flow-n">${i + 1}</span><div><b>${t}</b><small>${d} · ${e}</small></div></li>`).join('')}</ol>`;
const goalStairs = `<ol class="goal-steps" aria-label="수익목표 여섯 단계">${GOAL_STEPS.map(([t, d, e], i) => `<li style="--i:${i}"><span class="gs-bar" aria-hidden="true"></span><span class="gs-n">${i + 1}단계</span><b>${t}</b><p>${d}</p><small>${e}</small></li>`).join('')}</ol>`;

// 운영진의 지원
const SUPPORT = [
  ['그룹리더 지원', '그룹리더 승인과 워크숍, 운영 가이드를 드리고, 첫 모임을 열기 전 목표와 출석 규칙을 함께 점검합니다.'],
  ['정기모임과 발제 자리', '그룹을 소개하고 함께할 사람을 찾는 자리, 다른 그룹의 진행과 정보를 듣는 자리를 매달 엽니다.'],
  ['세미나·워크숍', 'AI 도구, 판매 페이지, 가격, 콘텐츠, 세금처럼 바로 써먹을 주제를 해 본 사람에게 배우고 직접 해 봅니다.'],
  ['오피스아워', '막힌 그룹은 운영진이나 먼저 해 본 회원과 시간을 잡아 함께 봅니다. 필요한 기술을 가진 회원을 연결해 드리기도 합니다.'],
  ['그룹 운영 도구', '모임 일정, 출석 코드, 출석률과 경고 자동 계산, 도전 기록, 목표 진행률, 성과 기록을 홈페이지에서 한 번에 관리합니다.'],
  ['성과 확인과 소개', '매출은 증빙을 보고 확인해 배지를 드리고, 성과발표회와 프로젝트 페이퍼로 그룹의 도전을 바깥에 소개합니다.'],
];
const supportCards = `<div class="cards-3 support-grid">${SUPPORT.map(([t, d]) => `<div class="mini"><b>${t}</b><p>${d}</p></div>`).join('')}</div>`;

const LADDER = [
  ['L1', '챌린저', '오리엔테이션을 마친 회원', '정기모임, 학습·도전그룹 참여, 커뮤니티, 그룹리더 신청'],
  ['L2', '메이커', `활동 포인트 ${D.levels.L2.points}점 + 자기 자산 진단 + 정기모임·세미나 ${D.levels.L2.require_event}회 + 가입 ${D.levels.L2.min_days}일`, '꾸준히 실행하는 회원이라는 표시. 그룹리더 신청과 발제 때 활동 기록으로 함께 봅니다'],
  ['L3', '어치버', '그룹 1회 완주 또는 첫 매출 확인', '다른 그룹의 도전 기록 전체, 프로젝트 페이퍼 전문'],
  ['L4', '리더', '그룹 2회 완주 + 그룹리더 워크숍', '처음 그룹을 여는 그룹리더의 멘토, 성과발표회 패널'],
  ['L5', '마스터', '그룹리더로 2회 완주 또는 반복 매출', '정기모임 프로그램 기획 참여, 오피스아워 멘토'],
];
const ladder = `<ol class="ladder">${LADDER.map(([c, n, how, can]) => `<li><span class="ladder-ic">${lvIcon(c, 48)}<span class="lv lv-${c}">${c}</span></span><div><b>${n}</b><small>${how}</small></div><p>${can}</p></li>`).join('')}</ol>`;

const heroVisual = `<div class="hero-visual hero-art">
  <div class="hero-pic">${img('hero-group-table', '그룹원 네 명이 테이블에 모여 노트북으로 작업하고, 진행표에 메모를 붙이고, 상품 상자를 포장하는 모습', { eager: true })}</div>
  <div class="mock mock-sm mock-a" aria-hidden="true"><small>그룹 모임 · 출석 받는 중</small><b>출석 코드 4자리 입력</b></div>
  <div class="mock mock-sm mock-b" aria-hidden="true"><small>도전그룹 목표</small><b>첫 유료 고객 3명</b></div>
</div>`;

// 홈 '마챌에서 보내는 시간' 장면들
const SCENES = [
  ['act-seminar', '정기모임 발제', '회원과 운영진이 사업 아이디어, 시장, 트렌드, AI 활용 사례를 짧게 발제하고 함께 이야기합니다.', '발표자 앞에서 회원들이 노트를 펴고 이야기를 듣는 모습'],
  ['act-book-club', '학습그룹', '한 분야를 정해 같이 읽고, 실습하고, 정리 노트를 나눕니다. 혼자 공부할 때보다 오래 갑니다.', '소파에 둘러앉아 같은 자료를 읽고 이야기하는 스터디'],
  ['act-customer-interview', '고객 인터뷰', '도전그룹은 만들기 전에 먼저 물어봅니다. 살 사람이 실제로 무엇에 돈을 쓰는지 확인합니다.', '카페 테이블에서 시제품 가방을 보여 주며 이야기를 듣는 모습'],
  ['act-online-meeting', '온라인 그룹 모임', '퇴근 후 집에서도 모임에 들어옵니다. 출석은 모임마다 출석 코드로 확인합니다.', '퇴근 후 집에서 노트북으로 그룹 모임에 참여하는 사람'],
  ['act-popup-store', '첫 판매', '온라인이든 플리마켓이든 모르는 사람에게 처음 팔아 보는 날이 옵니다.', '천막 매대에서 에코백과 노트를 손님에게 보여 주는 그룹원들'],
  ['act-demo-day', '성과발표회', '목표와 결과, 숫자, 배운 점을 발표합니다. 목표에 닿지 못했어도, 중간에 멈췄어도 발표합니다.', '화면에 결과물을 띄우고 회원들 앞에서 발표하는 그룹리더'],
];
const scenes = `<div class="scene-grid">${SCENES.map(([n, t, d, alt]) => `<figure class="scene">${img(n, alt)}<figcaption><b>${t}</b><span>${d}</span></figcaption></figure>`).join('')}</div>`;

const PAINS = [
  ['혼자 하다 보면 몇 주 만에 멈춥니다', '마감도, 물어볼 사람도 없어서입니다. 정해진 그룹 모임과 출석, 그룹리더가 그 빈자리를 채웁니다.', 'why-group'],
  ['무엇부터 해야 할지, 요즘 무엇이 되는지 모르겠습니다', '정기모임에서 사업 아이디어와 시장, 트렌드, AI 활용 사례를 함께 살피고 고르는 기준을 나눕니다.', 'side-job-ideas'],
  ['수백만 원짜리 부업 강의는 망설여집니다', '마챌은 돈 버는 법을 팔지 않습니다. 직접 해 본 사람의 기록과 숫자를 나눕니다.', 'avoid-side-job-course-scams'],
  ['회사 다니면서 해도 되는지, 세금은 어떻게 되는지 모르겠습니다', '시작 전에 확인할 회사 규정과 부업 소득 세금을 가이드로 정리해 두었습니다.', 'side-job-company-rules'],
];

const liveGroups = `<section class="sec" data-live="groups" hidden><div class="wrap">
  <div class="sec-head row"><div><p class="eyebrow">지금 모집 중인 그룹</p><h2>이런 그룹들이 함께할 사람을 찾고 있습니다</h2></div><a class="more" href="/app/#/groups">회원 공간에서 전체 보기</a></div>
  <ul class="live-groups"></ul>
  <p class="small muted">참여 신청은 가입 후 회원 공간에서 합니다. 그룹마다 출석 규칙이 다르니 신청 전에 꼭 확인해 주세요.</p>
</div></section>`;

// ───────────── FAQ (홈 일부, /faq/ 전체) ─────────────
export const FAQ = [
  ['가입과 참여', [
    ['마이챌린지는 어떤 모임인가요?', '사이드프로젝트와 새로운 수익에 관심 있는 사람들이 모이는 커뮤니티입니다. 정기모임에서 사업 아이디어, 시장, 트렌드, AI 활용, 사이드프로젝트 사례를 함께 살펴보고, 그중 관심이 맞는 사람끼리 학습그룹이나 도전그룹을 만들어 목표에 도전합니다. 과정은 홈페이지에 기록하고, 결과는 성과발표회에서 나눕니다.'],
    ['누가 가입할 수 있나요?', '사이드프로젝트를 실제로 해 보려는 직장인, 프리랜서, 자영업자, 학생 모두 신청할 수 있습니다. 경력이나 실적은 심사 기준이 아닙니다. 다만 쓸 수 있는 시간을 솔직하게 적어 주셔야 하고, 수익을 보장하지 않는다는 원칙에 동의해야 합니다. 만 14세 미만은 가입할 수 없습니다.'],
    ['가입 절차는 어떻게 되나요?', '가입 신청서를 내면 운영진이 3일 안에 확인하고 이메일로 초대 코드를 보내 드립니다. 초대 코드로 계정을 만든 뒤 5분 정도 걸리는 오리엔테이션(원칙 확인 3문항)을 마치면 챌린저(L1)가 되고, 바로 그룹에 참여할 수 있습니다.'],
    ['비용이 드나요?', '가입 신청과 오리엔테이션에는 비용이 들지 않습니다. 정기 멤버십이나 모임 참가비를 받게 되면 금액과 환불 기준을 모집 공지에 숫자로 적어 미리 안내합니다. "전액 환급", "사실상 무료" 같은 표현은 쓰지 않습니다.'],
    ['사이드프로젝트를 해 본 적이 전혀 없어도 되나요?', '괜찮습니다. 처음에는 정기모임에 나와 이야기를 듣고, 학습그룹에서 한 분야를 함께 공부하는 것부터 시작하면 됩니다. 자기 자산 진단으로 내가 가진 기술과 경험을 정리해 두면 맞는 도전그룹을 찾기 쉽습니다.'],
    ['온라인으로만 참여할 수 있나요?', '그룹마다 다릅니다. 그룹리더가 온라인으로만 모이는 그룹도 있고, 오프라인 모임을 섞는 그룹도 있습니다. 정기모임과 성과발표회는 오프라인이 중심이지만 온라인 참여 링크를 함께 여는 경우가 많습니다. 메이커(L2)가 되려면 정기모임이나 세미나에 한 번은 참석해야 합니다.'],
  ]],
  ['정기모임과 그룹', [
    ['정기모임에서는 무엇을 하나요?', '한 달에 한 번 이상 열립니다. 회원과 운영진이 사업 아이디어, 시장 분석, 트렌드, AI 활용, 해 본 사이드프로젝트 이야기를 10분 안팎으로 발제하고 함께 의견을 나눕니다. 새로 열린 그룹을 소개하고 함께할 사람을 찾는 시간, 진행 중인 그룹이 근황을 나누는 시간도 있습니다. 발제는 회원 누구나 신청할 수 있습니다.'],
    ['학습그룹과 도전그룹은 무엇이 다른가요?', '학습그룹은 AI 업무 자동화, 숏폼 기획, 부업 세금처럼 한 분야를 정해 함께 공부하고 정리하는 그룹입니다. 도전그룹은 하나의 프로젝트를 정해 매출·고객·사용자 같은 숫자 목표를 세우고 성과와 수익에 도전하는 그룹입니다. 학습그룹에서 시작해 도전그룹으로 이어 가는 경우도 많습니다.'],
    ['그룹은 누가 만드나요?', '운영진의 승인을 받은 그룹리더가 만듭니다. 회원 누구나 내 정보 화면에서 그룹리더를 신청할 수 있고, 운영진이 활동 기록과 운영 계획을 보고 5일 안에 결과를 알려 드립니다. 승인을 받으면 언제든 그룹을 만들 수 있고, 만들자마자 그룹 목록에 올라가 모집이 시작됩니다.'],
    ['그룹에는 어떻게 참여하나요?', `오리엔테이션을 마친 챌린저(L1)부터 참여할 수 있습니다. 회원 공간의 그룹 목록에서 소개와 목표, 모임 방식, 출석 규칙을 보고 신청합니다. 그룹리더가 승인하면 참여가 확정되고, 그룹에 따라 바로 참여할 수 있는 곳도 있습니다. 한 사람이 동시에 참여할 수 있는 그룹은 ${G.member_max_groups}개까지입니다.`],
    ['출석은 어떻게 확인하나요?', `모임이 시작되면 그룹리더나 부리더가 숫자 4자리 출석 코드를 엽니다. 오프라인은 현장 화면으로, 온라인은 대화창으로 코드를 알려 주고, 그룹원은 회원 공간에서 코드를 입력합니다. 기본값으로는 시작 ${A.checkin_before}분 전부터 입력할 수 있고, 시작 ${A.late_minutes}분이 지나면 지각입니다. 모임 전에 불참 사유를 남기면 공결로 인정받을 수 있습니다.`],
    ['출석이 저조하면 어떻게 되나요?', `그룹리더가 정한 출석 규칙에 따라 경고를 받고, 경고가 쌓이면 그룹에서 나가게 될 수 있습니다. 기본값은 연속 결석 ${A.warn_absences}번이나 출석률 ${A.min_rate}% 미만이면 경고, 경고 ${A.kick_warnings}번이면 퇴출 대상이며, 퇴출은 그룹리더가 사정을 확인한 뒤 결정합니다. 그룹에서 나가도 회원 자격과 다른 그룹 참여에는 영향이 없고, 사정이 있었다면 운영진에게 이의를 신청할 수 있습니다.`],
    ['그룹을 중간에 나갈 수 있나요?', '언제든 나갈 수 있습니다. 그룹 화면에서 나가기를 누르고 이유를 짧게 남겨 주시면 그룹리더에게 전달됩니다. 함께 남긴 기록은 그룹에 그대로 남습니다.'],
  ]],
  ['수익목표와 성과', [
    ['마이챌린지가 수익을 보장하나요?', '보장하지 않습니다. 마챌은 회원에게서 출자금이나 투자금을 받지 않고, 원금이나 수익을 약속하지 않습니다. 도전그룹의 최종 목표는 성과와 수익이지만, 결과는 각 그룹이 직접 만들고 숫자로 기록합니다.'],
    ['수익목표는 무엇인가요?', '그룹이 함께 올라갈 여섯 단계입니다. 배움, 실행, 첫 반응, 첫 매출, 반복 매출, 성장 순서로, 도전그룹은 이 중 어디까지 갈지를 숫자로 정하고 성과를 기록할 때마다 진행률을 확인합니다. 자세한 내용은 수익목표 페이지에 정리했습니다.'],
    ['그룹에서 번 돈은 어떻게 나누나요?', '지금은 정해 두지 않았습니다. 마챌은 먼저 사람과 그룹이 모이고 다양한 프로젝트가 움직이는 데 집중하고, 실제 수익이 나는 그룹이 생기면 그 그룹과 운영진이 함께 방식을 정해 적용 전에 공개할 예정입니다. 그 전이라도 그룹 안에서 돈이 오가게 되면, 받거나 쓰기 전에 그룹원끼리 방식을 먼저 정하고 기록으로 남겨 주세요.'],
    ['운영진은 어떤 지원을 하나요?', '그룹리더 승인과 워크숍, 정기모임의 발제·소개 자리, 세미나와 워크숍, 막힌 그룹을 위한 오피스아워, 출석과 기록을 관리하는 그룹 운영 도구, 매출 확인과 성과발표회를 맡습니다. 필요한 기술을 가진 회원을 연결해 드리기도 합니다.'],
    ['매출은 어떻게 인정하나요?', '그룹 밖의 고객이 실제로 결제한 매출만 인정합니다. 그룹원이 목표·성과 화면에 매출을 기록하면서 입금 화면이나 판매 플랫폼 정산 내역 같은 증빙을 남기면, 운영진이 확인한 뒤 그룹원 모두에게 첫 매출 배지를 드립니다. 가족·지인·회원 사이의 거래는 확인에서 뺍니다.'],
  ]],
  ['회사·기록·개인정보', [
    ['회사에 다니면서 참여해도 되나요?', '대부분 가능하지만 회사마다 겸업 규정이 다릅니다. 근로계약서와 취업규칙을 먼저 확인해 주세요. 마챌은 근무시간과 회사 자료를 쓰지 않는 것을 원칙으로 하며, 공무원이라면 소속 기관의 겸직 허가 절차를 먼저 밟아야 합니다.'],
    ['프로젝트 결과가 외부에 공개되나요?', '그룹을 마치고 프로젝트 페이퍼를 내면 매출이 있었는지, 고객 수의 구간, 들인 시간 세 가지는 항상 공개합니다. 성공한 사례만 보이지 않게 하기 위해서입니다. 정확한 매출액이나 비용 같은 나머지 숫자는 비공개로 고를 수 있고, 외부 공개는 그룹이 동의한 경우에만 요약으로 실립니다.'],
    ['개인정보는 어떻게 관리하나요?', '비밀번호는 복원할 수 없는 방식으로 암호화해 저장하고, 회원 정보는 운영진만 볼 수 있습니다. 출석 경고와 불참 사유는 본인과 그룹리더·부리더, 운영진만 보고, 매출 증빙은 운영진만 봅니다. 계좌번호나 주민등록번호는 홈페이지에 저장하지 않습니다. 자세한 내용은 개인정보처리방침을 확인해 주세요.'],
    ['탈퇴는 어떻게 하나요?', '로그인한 뒤 내 정보 화면에서 회원 탈퇴를 누르면 됩니다. 이메일, 이름, 연락처, 자기 자산 진단은 바로 지워지고, 그룹에 함께 남긴 출석·기록·성과는 이름 없이 남습니다. 그룹리더로 이끄는 그룹이 진행 중이면 그룹을 마치거나 리더를 바꾼 뒤 탈퇴할 수 있습니다.'],
  ]],
];
const allFaq = FAQ.flatMap(([, qs]) => qs);
const faqItem = ([q, a]) => `<details class="faq-item"><summary>${esc(q)}</summary><div><p>${esc(a)}</p></div></details>`;
function faqLd(base) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: allFaq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
}

// ───────────── 페이지 정의 ─────────────
export function staticPages() {
  const pages = [];

  // ── 홈
  pages.push({
    path: '/', slug: 'home',
    fullTitle: '마이챌린지(마챌) | 함께 배우고 함께 도전하는 사이드프로젝트 커뮤니티',
    title: '함께 배우고 함께 도전하는 사이드프로젝트 커뮤니티',
    ogTitle: '마이챌린지(마챌) — 함께 배우고, 그룹으로 도전해서, 성과까지',
    description: '마이챌린지(마챌)는 정기모임에서 사업 아이디어와 시장, 트렌드, AI 활용, 사이드프로젝트를 함께 살펴보고, 관심이 맞는 사람끼리 학습그룹과 도전그룹을 만들어 성과와 수익에 도전하는 커뮤니티입니다.',
    bodyClass: 'is-home',
    jsonld: [orgLd, websiteLd],
    body: `
<section class="hero">
  <div class="wrap hero-in">
    <div class="hero-copy">
      <p class="eyebrow"><span class="dot"></span>사이드프로젝트 커뮤니티</p>
      <h1>함께 배우고,<br>그룹으로 도전해서<br><em>성과까지</em></h1>
      <p class="lead">마이챌린지(마챌)는 정기모임에서 사업 아이디어와 시장, 트렌드, AI 활용을 함께 살펴보고, 관심이 맞는 사람끼리 학습그룹과 도전그룹을 만들어 목표에 도전하는 커뮤니티입니다. 도전은 홈페이지에 기록하고, 결과는 성과발표회에서 나눕니다.</p>
      <div class="hero-actions"><a class="btn btn-primary btn-lg" href="/apply/">가입 신청하기</a><a class="btn btn-line btn-lg" href="/goals/">수익목표 보기</a></div>
      <p class="round-note" data-live="round" hidden></p>
      <ul class="hero-facts"><li><b>월 1회 이상</b>정기모임</li><li><b>2가지</b>학습그룹 · 도전그룹</li><li><b>모임마다</b>출석 체크</li></ul>
    </div>
    ${heroVisual}
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <div class="sec-head"><p class="eyebrow">이런 분께 맞습니다</p><h2>사이드프로젝트가 멈추는 이유는 대개 비슷합니다</h2></div>
    <div class="pain-grid">${PAINS.map(([t, d, slug]) => `<a class="pain" href="/guide/${slug}/"><h3>${t}</h3><p>${d}</p><span class="g-more">${esc(guideBySlug[slug].short)}</span></a>`).join('')}</div>
  </div>
</section>

<section class="sec sec-tint">
  <div class="wrap">
    <div class="sec-head row"><div><p class="eyebrow">함께하는 방식</p><h2>정기모임에서 시작해 성과발표회까지</h2></div><a class="more" href="/how-it-works/">운영 방식 자세히</a></div>
    ${flowTimeline}
  </div>
</section>

<section class="sec">
  <div class="wrap two-col">
    <div>
      <div class="spot spot-left">${img('spot-building', '')}</div>
      <p class="eyebrow">수익목표</p>
      <h2>함께 도전하는 최종 목표는<br>성과와 수익입니다</h2>
      <p>배우는 데서 끝나지 않고, 만들고, 보여 주고, 팔아 보는 데까지 갑니다. 도전그룹은 매출이나 고객 수처럼 셀 수 있는 목표를 세우고, 성과를 기록할 때마다 진행률이 올라갑니다. 매출은 운영진이 증빙을 보고 확인합니다.</p>
      <p>운영진은 그룹리더 지원, 세미나와 오피스아워, 그룹 운영 도구, 성과발표회로 그 과정을 돕습니다. 수익을 나누는 방식은 실제 수익이 나는 그룹이 생기면 그때 함께 정합니다.</p>
      <p><a class="more" href="/goals/">수익목표 자세히 보기</a></p>
    </div>
    <div class="panel">${goalFlow}</div>
  </div>
</section>

${liveGroups}

<section class="sec sec-tint">
  <div class="wrap">
    <div class="sec-head"><p class="eyebrow">마챌이 하는 일과 하지 않는 일</p><h2>돈 버는 법을 파는 곳이 아니라,<br>함께 해 보는 사람들이 모인 곳입니다</h2></div>
    <div class="do-dont">
      <div class="do"><h3>하는 일</h3><ul class="checks">
        <li>정기모임에서 아이디어와 시장, 트렌드, AI 활용, 사이드프로젝트를 함께 살펴봅니다</li>
        <li>관심이 맞는 사람끼리 학습그룹과 도전그룹을 만들고, 그룹리더를 세웁니다</li>
        <li>모임마다 출석을 확인하고, 도전과 성과를 홈페이지에 기록합니다</li>
        <li>세미나·워크숍·오피스아워로 막힌 곳을 같이 풉니다</li>
        <li>성과발표회와 프로젝트 페이퍼로 잘된 도전도, 멈춘 도전도 나눕니다</li>
      </ul></div>
      <div class="dont"><h3>하지 않는 일</h3><ul class="crosses">
        <li>수익을 보장하거나 "얼마를 벌게 해 주겠다"고 약속하지 않습니다</li>
        <li>고액 강의나 코칭 상품을 팔지 않습니다</li>
        <li>회원에게서 출자금이나 투자금을 받지 않습니다</li>
        <li>회원 사이의 투자 권유, 다단계, 리딩방을 허용하지 않습니다</li>
        <li>대신 만들어 주거나 대신 팔아 주지 않습니다</li>
      </ul></div>
    </div>
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <div class="sec-head row"><div><p class="eyebrow">마챌에서 보내는 시간</p><h2>책상 앞에서만 하지 않습니다</h2></div><a class="more" href="/programs/">정기모임·프로그램 보기</a></div>
    ${scenes}
  </div>
</section>

<section class="sec sec-tint">
  <div class="wrap">
    <div class="sec-head row"><div><p class="eyebrow">회원 등급</p><h2>등급은 돈이 아니라 실행 기록으로 오릅니다</h2></div><a class="more" href="/levels/">등급과 포인트 안내</a></div>
    ${ladder}
  </div>
</section>

<section class="sec sec-stats" data-live="stats" hidden>
  <div class="wrap">
    <div class="sec-head"><div class="spot spot-bars">${img('spot-honest-results', '')}</div><p class="eyebrow">있는 그대로의 숫자</p><h2>잘된 도전만 골라 보여 주지 않습니다</h2></div>
    <div class="stat-row">
      <div><b data-stat="members">-</b><span>활동 회원</span></div>
      <div><b data-stat="active_challenges">-</b><span>모집·진행 중인 그룹</span></div>
      <div><b data-stat="sessions_held">-</b><span>지금까지 연 그룹 모임</span></div>
      <div><b data-stat="first_sales">-</b><span>첫 매출을 확인한 회원</span></div>
    </div>
    <p class="stat-note" data-stat="closed_note"></p>
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <div class="sec-head row"><div><p class="eyebrow">가이드</p><h2>시작 전에 읽어 두면 좋은 글</h2></div><a class="more" href="/guide/">전체 가이드</a></div>
    <div class="g-grid">${GUIDES.slice(0, 6).map(guideCard).join('')}</div>
  </div>
</section>

<section class="sec sec-tint">
  <div class="wrap narrow">
    <div class="sec-head"><p class="eyebrow">자주 묻는 질문</p><h2>신청 전에 많이 물어보시는 것</h2></div>
    <div class="faq">${[FAQ[0][1][0], FAQ[1][1][1], FAQ[1][1][5], FAQ[2][1][0], FAQ[2][1][2]].map(faqItem).join('')}</div>
    <p class="center"><a class="more" href="/faq/">질문 전체 보기</a></p>
  </div>
</section>

${h.cta('지원서는 10분이면 씁니다', '신청서를 보내면 운영진이 3일 안에 확인하고 초대 코드를 보내 드립니다. 처음에는 정기모임에 나와 분위기를 보는 것부터 시작해도 됩니다.', undefined, ['/goals/', '수익목표 보기'], { name: 'cta-walking', alt: '강변 산책로를 함께 걸으며 이야기하는 네 사람' })}
`,
  });

  // ── 소개
  const aboutCrumbs = [['홈', '/'], ['마챌 소개', '/about/']];
  pages.push({
    path: '/about/', slug: 'about',
    title: '마이챌린지(마챌) 소개: 왜 만들었고 무엇을 하는가',
    description: '마이챌린지(마챌)는 사이드프로젝트를 혼자 미루던 사람들이 정기모임에서 함께 배우고, 학습그룹·도전그룹으로 성과에 도전하는 커뮤니티입니다. 만든 이유, 세 가지 원칙, 하는 일과 하지 않는 일, 운영진의 역할을 소개합니다.',
    crumbs: aboutCrumbs,
    jsonld: [base => ({ '@context': 'https://schema.org', '@type': 'AboutPage', name: '마이챌린지(마챌) 소개', url: base + '/about/', about: { '@id': base + '/#org' } }), orgLd],
    body: `${h.pageHero('마챌 소개', '각자의 챌린지를, 함께 끝까지', '마이챌린지는 "내 도전"이라는 뜻입니다. 모임의 주인공은 운영자나 강사가 아니라 각자의 프로젝트를 가진 회원과 그 회원들이 만든 그룹입니다.', aboutCrumbs, '', { name: 'ph-about', alt: '텃밭 상자에 모종을 심고 물을 주며 함께 가꾸는 네 사람' })}
<div class="wrap article-layout">
<article class="prose">
<h2 id="why">왜 만들었나</h2>
<p>사이드프로젝트를 하려는 사람은 늘고 있습니다. 통계청 마이크로데이터를 분석한 보도를 보면 2024년 2분기 부업을 한 취업자는 월평균 67만 6천 명으로 집계 이후 가장 많았고, 그 흐름은 2025년에도 이어졌습니다. 중소벤처기업부 조사에서 1인 창조기업은 2023년 기준 116만 개를 넘었습니다.</p>
<p>그런데 사람이 늘어나는 만큼 어려움도 비슷하게 반복됩니다. 혼자 하다 보면 몇 주 안에 멈추고, 무엇부터 해야 할지 정보는 흩어져 있습니다. 그 틈을 고액 부업 강의가 파고듭니다. 한국소비자원에 접수된 고액 온라인 부업 강의 피해구제 신청은 2024년 11건에서 2025년 42건으로 늘었고, 결제 금액은 대부분 100만~400만 원이었습니다.</p>
<p>마이챌린지는 이 세 가지 문제, 즉 <b>혼자 하면 멈추는 문제, 무엇을 할지 모르는 문제, 불안을 파는 시장</b>에 대한 답으로 만들었습니다. 강의를 파는 대신 함께 살펴보고 함께 실행할 자리를 만들고, 의지에 기대는 대신 모임과 출석, 기록으로 끝까지 가게 합니다.</p>

<h2 id="principles">세 가지 원칙</h2>
${h.figure('spot-completed-work', '', '', 'fig-spot fig-right')}
<div class="principles">
  <div><b>① 수익을 보장하지 않습니다</b><p>마챌은 돈을 벌게 해 주는 곳이 아니라 벌어 보려는 사람들이 모여 실행하는 곳입니다. 도전그룹의 최종 목표는 성과와 수익이지만, 결과는 각 그룹이 직접 만들어 숫자로 남깁니다. 목표에 닿지 못한 그룹과 멈춘 그룹도 함께 공개합니다.</p></div>
  <div><b>② 실행한 사람이 발언합니다</b><p>조언보다 기록이 먼저입니다. 계획이 아니라 이번 주에 한 일을 적고, 모임에 나오고, 결과를 기록한 것이 등급과 발언권의 근거가 됩니다.</p></div>
  <div><b>③ 기록하고 나눕니다</b><p>그룹에서 배운 것과 만든 결과는 그룹 안에만 두지 않습니다. 커뮤니티 그룹 소식, 정기모임, 성과발표회, 프로젝트 페이퍼로 다른 그룹과 나눕니다. 먼저 간 사람의 기록이 다음 사람의 출발점이 됩니다.</p></div>
</div>
<p>모임 안에서는 이 세 가지를 조금 더 풀어 쓴 원칙을 함께 읽습니다. 작게 만들고 빨리 보여 준다, 약속한 모임에는 나온다(못 나오면 미리 알린다), 본업을 지킨다(근무시간과 회사 자료는 쓰지 않는다), 이 안에서 서로에게 팔지 않는다는 내용이 더해집니다.</p>

<h2 id="what">하는 일과 하지 않는 일</h2>
<div class="table-wrap"><table>
  <thead><tr><th>마챌이 하는 일</th><th>마챌이 하지 않는 일</th></tr></thead>
  <tbody>
    <tr><td>정기모임에서 아이디어·시장·트렌드·AI 활용을 함께 살펴본다</td><td>수익을 보장하거나 금액을 약속한다</td></tr>
    <tr><td>학습그룹과 도전그룹을 만들고 그룹리더를 세운다</td><td>고액 강의·코칭 상품을 판다</td></tr>
    <tr><td>모임 일정, 출석, 기록, 목표를 관리하는 도구를 제공한다</td><td>회원에게서 출자금이나 투자금을 받는다</td></tr>
    <tr><td>그룹리더를 승인하고, 매출을 확인하고, 이의를 조정한다</td><td>회원 대신 만들거나 대신 판다</td></tr>
    <tr><td>세미나·워크숍·오피스아워·성과발표회를 연다</td><td>회원 사이의 투자 권유, 다단계, 외부 유료 강의 모집을 허용한다</td></tr>
  </tbody>
</table></div>

<h2 id="who">어떤 사람들이 모이나</h2>
${h.figure('act-content-video', '한 사람은 카메라로 촬영하고, 한 사람은 노트를 들고 설명하고, 한 사람은 편집하는 콘텐츠 제작 모습', '퇴근 후에 모여 각자 잘하는 일을 나눠 맡습니다.')}
<p>회사에 다니면서 퇴근 후와 주말을 쓰는 직장인, 본업과 별개로 자기 상품을 만들어 보려는 프리랜서, 가게 밖에서 새로운 매출을 찾는 자영업자가 중심입니다. 처음부터 큰 사업을 하려는 사람보다, 함께 공부하면서 작게 만들어 보고 모르는 사람에게 한 번 팔아 보는 것을 목표로 삼는 사람에게 잘 맞습니다.</p>
<p>그룹은 아래 여섯 분야로 나눠 관리합니다. 정기모임의 주제와 학습그룹도 이 구분을 참고해 열립니다.</p>
${fieldGrid()}

<h2 id="hq">운영진이 하는 일</h2>
<p>운영본부는 운영자와 위촉된 운영진으로 이루어집니다. 정기모임과 성과발표회를 열고, 가입 신청과 그룹리더 신청을 확인하고, 그룹이 멈추지 않도록 살피고, 매출 기록을 확인하고, 프로젝트 페이퍼와 승급을 검토하고, 이의를 조정합니다. 처리는 홈페이지의 운영 화면에서 하고, 모든 결정은 감사 기록으로 남깁니다.</p>
<p>운영진이 그룹에 주는 지원은 <a href="/goals/#support">수익목표 페이지</a>에 정리했습니다. 그룹 프로젝트에서 생긴 수익을 어떻게 나눌지는 아직 정하지 않았고, 실제 수익이 나는 그룹이 생기면 그 그룹과 함께 정해 미리 공개합니다.</p>
${SITE.operator.company ? `<p class="small muted">운영 주체: ${esc(SITE.operator.company)}${SITE.operator.ceo ? ` (대표 ${esc(SITE.operator.ceo)})` : ''}</p>` : ''}

<h2 id="name">이름에 대하여</h2>
<p>'마이챌린지'에는 내 도전, 내 프로젝트라는 뜻을 담았습니다. 이름에서 '부업'이나 '수익' 같은 단어를 뺀 건 의도한 것입니다. 돈을 앞세운 이름은 지금 같은 때에 오히려 신뢰를 깎는다고 봤습니다. 줄여서 부르는 '마챌'은 '마챌 정기모임', '마챌 페이퍼'처럼 붙여 쓰기 좋습니다.</p>
${h.sources([
  ['YTN 보도(2024.8.8), 2024년 2분기 부업 취업자 통계', 'https://www.ytn.co.kr/_ln/0102_202408081258409552', ''],
  ['헤럴드경제, 「1인 창조기업 116만개 돌파…매출 늘고 준비기간도 길어졌다」(2026.4.5)', 'https://www.heraldk.com/article/2026040519000044445', ''],
  ['뉴시스, 「고액 지불 후 저품질·환급 거부·연락두절」(2026.2.13)', 'https://mobile.newsis.com/view/NISX20260213_0003515702', '한국소비자원 분석'],
])}
</article>
<aside class="side">
  <div class="side-box"><b>더 알아보기</b><ul><li><a href="/how-it-works/">함께하는 방식</a></li><li><a href="/goals/">수익목표</a></li><li><a href="/programs/">정기모임·프로그램</a></li><li><a href="/levels/">등급과 포인트</a></li><li><a href="/faq/">자주 묻는 질문</a></li></ul></div>
  <div class="side-box side-cta"><b>함께해 볼까요?</b><p>신청서는 10분이면 씁니다.</p><a class="btn btn-primary" href="/apply/">가입 신청</a></div>
</aside>
</div>
${h.cta('각자의 챌린지를 함께 끝까지', '가입하면 다음 정기모임부터 함께할 수 있습니다. 마음에 드는 그룹이 있으면 바로 신청해도 됩니다.')}`,
  });

  // ── 함께하는 방식
  const howCrumbs = [['홈', '/'], ['함께하는 방식', '/how-it-works/']];
  const policyRows = [
    ['최소 출석률', `${A.min_rate}%`, `마감한 모임이 ${A.rate_after}번 쌓인 뒤부터 확인합니다. 공결은 계산에서 뺍니다.`],
    ['지각', `시작 ${A.late_minutes}분 뒤`, A.late_per_absence ? `지각 ${A.late_per_absence}번은 결석 1번으로 셉니다.` : '지각은 결석으로 환산하지 않습니다.'],
    ['공결', A.excuse ? `최대 ${A.excuse_limit}번` : '인정 안 함', '모임 시작 전에 불참 사유를 남기면 인정합니다.'],
    ['경고', `연속 결석 ${A.warn_absences}번`, A.warn_on_low_rate ? '또는 출석률이 기준 아래로 내려가면 경고합니다.' : '출석률로는 경고하지 않습니다.'],
    ['퇴출 기준', `경고 ${A.kick_warnings}번`, A.auto_remove ? '기준에 닿으면 자동으로 그룹에서 나가게 됩니다.' : '기준에 닿으면 그룹리더가 사정을 확인한 뒤 결정합니다.'],
    ['출석 코드 입력', `시작 ${A.checkin_before}분 전부터`, '모임이 끝나고 출석을 마감하면 더는 입력할 수 없습니다.'],
  ];
  pages.push({
    path: '/how-it-works/', slug: 'how-it-works',
    title: '함께하는 방식: 정기모임, 학습·도전그룹, 출석, 성과발표회',
    description: '마이챌린지는 정기모임에서 시작해 학습그룹·도전그룹으로 목표에 도전하고, 성과발표회에서 결과를 나눕니다. 그룹리더 승인, 그룹 만들기와 참여, 모임마다 하는 출석 체크와 출석 규칙, 기록과 공유까지 순서대로 설명합니다.',
    crumbs: howCrumbs,
    body: `${h.pageHero('함께하는 방식', '정기모임에서 시작해, 그룹으로 도전하고, 성과발표회에서 나눕니다', '마챌의 모든 활동은 이 흐름 안에 있습니다. 같은 흐름이 홈페이지와 오프라인 모임에서 함께 돌아갑니다.', howCrumbs, '', { name: 'ph-how', alt: '킥오프 날 진행표에 메모를 붙이며 계획을 세우는 그룹' })}
<div class="wrap article-layout">
<article class="prose">
<nav class="toc" aria-label="이 페이지의 내용"><b>이 페이지의 내용</b><ol><li><a href="#overview">한눈에 보기</a></li><li><a href="#meetup">정기모임</a></li><li><a href="#types">학습그룹과 도전그룹</a></li><li><a href="#leader">그룹리더</a></li><li><a href="#join">그룹 만들기와 참여</a></li><li><a href="#attendance">모임과 출석</a></li><li><a href="#warning">경고와 퇴출</a></li><li><a href="#records">기록과 공유</a></li><li><a href="#showcase">성과발표회와 페이퍼</a></li></ol></nav>

<h2 id="overview">한눈에 보기</h2>
${flowTimeline}

<h2 id="meetup">정기모임</h2>
${h.figure('act-seminar', '발표자의 이야기를 들으며 손을 들어 질문하는 회원들', '정기모임은 발제를 듣고 함께 이야기하는 자리입니다. 새 그룹도 여기서 시작됩니다.')}
<p>정기모임은 한 달에 한 번 이상 열리는 전체 회원 모임입니다. 회원이나 운영진이 10분 안팎으로 발제하고, 다 같이 의견을 나눕니다. 다루는 주제는 아래와 같습니다.</p>
<ul>${Object.values(EVENT_TOPICS).map(t => `<li>${esc(t)}</li>`).join('')}</ul>
<p>발제가 끝나면 새로 열린 그룹을 소개하고 함께할 사람을 찾는 시간, 진행 중인 그룹이 근황과 막힌 점을 나누는 시간이 이어집니다. 발제는 회원 누구나 회원 공간의 정기모임·일정 화면에서 신청할 수 있고, 운영진이 순서를 정해 알려 드립니다. 출석은 현장이나 온라인에서 안내하는 출석 코드로 확인하고, 참석하면 활동 포인트가 쌓입니다.</p>

<h2 id="types">학습그룹과 도전그룹</h2>
<div class="table-wrap"><table>
  <thead><tr><th></th><th>학습그룹</th><th>도전그룹</th></tr></thead>
  <tbody>
    <tr><td><b>하는 일</b></td><td>한 분야를 정해 함께 공부하고, 실습하고, 정리합니다</td><td>하나의 프로젝트를 정해 만들고, 보여 주고, 팔아 봅니다</td></tr>
    <tr><td><b>목표의 예</b></td><td>6주 동안 매주 실습 하나, 정리 노트 6편 공개</td><td>8주 안에 첫 유료 고객 3명, 매출 30만 원</td></tr>
    <tr><td><b>세는 숫자</b></td><td>학습 과제, 발행한 콘텐츠</td><td>매출, 유료 고객, 판매, 사용자·구독자</td></tr>
    <tr><td><b>마무리</b></td><td>정리한 내용을 정기모임이나 커뮤니티에 공유</td><td>성과발표회 발표와 프로젝트 페이퍼</td></tr>
  </tbody>
</table></div>
<p>목표의 예는 그룹을 만들 때 참고하도록 넣어 둔 예시이고, 실제 목표와 기간은 그룹리더가 정합니다. 학습그룹에서 함께 공부한 사람들이 도전그룹으로 이어 가는 경우가 많습니다. 목표를 세우는 방법은 <a href="/goals/">수익목표</a>에 정리했습니다.</p>

<h2 id="leader">그룹리더</h2>
${h.figure('spot-building', '', '', 'fig-spot fig-right')}
<p>그룹은 운영진의 승인을 받은 그룹리더가 만듭니다. 회원 누구나 내 정보 화면에서 그룹리더를 신청할 수 있습니다. 어떤 그룹을 이끌고 싶은지, 어떻게 운영할지, 관련 경험과 쓸 수 있는 시간을 적으면 운영진이 정기모임 참석과 활동 기록을 함께 보고 5일 안에 결과를 알려 드립니다.</p>
<p>승인을 받으면 언제든 그룹을 만들 수 있습니다. 한 사람이 동시에 이끌 수 있는 그룹은 ${G.leader_max_groups}개까지입니다. 그룹리더는 그룹원 중 한 명을 부리더로 지정해 모임 일정과 출석 관리를 나눠 맡길 수 있습니다.</p>
<div class="cards-3">
  <div class="mini"><b>그룹리더가 하는 일</b><p>목표와 기간, 모임 방식, 출석 규칙을 정하고, 모임을 열어 출석을 받고, 그룹원의 기록을 챙기고, 성과발표회에서 그룹의 진행을 나눕니다.</p></div>
  <div class="mini"><b>운영진이 돕는 일</b><p>그룹리더 워크숍과 운영 가이드, 정기모임에서의 그룹 소개, 오피스아워, 모임 장소 안내, 필요한 회원 연결을 맡습니다.</p></div>
  <div class="mini"><b>운영진이 살피는 것</b><p>모임이 끊긴 그룹, 출석을 받지 않은 모임, 출석률이 낮은 그룹을 운영 화면에서 확인하고 그룹리더에게 먼저 연락합니다.</p></div>
</div>

<h2 id="join">그룹 만들기와 참여</h2>
<p>그룹리더는 회원 공간에서 그룹을 만듭니다. 그룹 종류와 분야, 소개, 목표와 목표로 세는 숫자, 기간과 마일스톤, 모이는 주기와 장소, 정원(기본 ${G.capacity_default}명, 최대 ${G.capacity_max}명), 참여 방식(리더 승인 또는 바로 참여), 그룹 대화방, 출석 규칙을 적으면 바로 그룹 목록에 올라가 모집이 시작됩니다. 학습그룹과 도전그룹 예시를 누르면 처음 쓰는 사람도 빈칸을 채우기 쉽습니다.</p>
<p>회원은 그룹 목록에서 종류와 분야로 그룹을 찾고, 소개와 출석 규칙을 확인한 뒤 신청합니다. 한 사람이 동시에 참여할 수 있는 그룹은 ${G.member_max_groups}개까지입니다. 출석 규칙을 확인했다는 표시를 해야 신청이 되고, 그룹리더가 승인하면 그룹원이 됩니다. 예전에 그 그룹에서 출석 기준으로 나간 적이 있다면 바로 참여 그룹이라도 그룹리더의 승인을 거칩니다.</p>

<h2 id="attendance">모임과 출석</h2>
${h.figure('act-online-meeting', '퇴근 후 집에서 노트북으로 그룹 모임에 참여하는 사람', '온라인이든 오프라인이든 모임마다 출석 코드로 출석합니다.')}
<p>그룹리더나 부리더는 모임 일정을 잡습니다. 같은 요일과 시간으로 몇 주치를 한 번에 만들 수 있고, 온라인 링크나 장소, 다룰 것, 미리 준비할 것을 함께 적어 둡니다. 그룹원은 모임 전에 참석이나 불참을 알립니다.</p>
<ol>
  <li>모임이 시작되면 그룹리더나 부리더가 <b>출석 받기</b>를 누릅니다. 숫자 4자리 출석 코드가 나옵니다.</li>
  <li>오프라인 모임은 화면을 보여 주고, 온라인 모임은 대화창에 코드나 출석 링크를 올립니다.</li>
  <li>그룹원은 회원 공간에서 코드를 입력합니다. 정해진 시간이 지나 입력하면 지각입니다.</li>
  <li>코드를 넣지 못한 사람은 그룹리더가 직접 출석·지각·결석·공결을 표시할 수 있습니다.</li>
  <li>모임이 끝나면 <b>출석 마감</b>을 누릅니다. 표시하지 않은 사람은 결석, 미리 사유를 남긴 사람은 공결이 됩니다. 마감하지 않은 모임은 끝난 지 12시간 뒤 자동으로 마감됩니다.</li>
</ol>
<p>출석 규칙은 그룹리더가 그룹마다 정합니다. 아래는 새 그룹을 만들 때 미리 채워지는 기본값입니다.</p>
<div class="table-wrap"><table>
  <thead><tr><th>항목</th><th>기본값</th><th>설명</th></tr></thead>
  <tbody>${policyRows.map(([k, v, d]) => `<tr><td>${k}</td><td><b>${v}</b></td><td>${d}</td></tr>`).join('')}</tbody>
</table></div>

<h2 id="warning">경고와 퇴출</h2>
<p>출석 규칙은 사람을 내보내려고 있는 게 아니라, 함께 끝까지 가기 위한 약속입니다. 그래도 기준은 분명하게 둡니다.</p>
<ul>
  <li>출석을 마감할 때 출석 규칙에 따라 경고가 자동으로 나갑니다. 한 모임에서 경고는 한 번만 나옵니다.</li>
  <li>그룹리더도 사유를 적어 직접 경고할 수 있고, 사정을 들은 뒤 경고를 취소할 수도 있습니다.</li>
  <li>경고가 퇴출 기준에 닿으면 그룹리더에게 알림이 가고, 그룹리더가 사정을 확인한 뒤 결정합니다. 그룹리더가 자동 퇴출을 켜 둔 그룹은 기준에 닿는 즉시 나가게 됩니다.</li>
  <li>그룹에서 나가게 된 회원에게는 사유와 함께 알림이 가고, 운영진에게 이의를 신청할 수 있습니다. 운영진은 출석 기록과 경고 사유를 보고 그룹리더와 이야기한 뒤 결과를 알려 드립니다.</li>
  <li>그룹 퇴출은 그 그룹에만 해당합니다. 회원 자격, 등급, 다른 그룹 참여에는 영향이 없습니다.</li>
</ul>

<h2 id="records">기록과 공유</h2>
<div class="cards-3">
  <div class="mini"><b>도전 기록</b><p>진행 기록, 학습 노트, 자료 공유, 회고를 그룹 공간에 남깁니다. 그룹원끼리 응원을 보낼 수 있고, 그룹리더는 공지를 위에 고정합니다.</p></div>
  <div class="mini"><b>모임 기록</b><p>그룹리더가 모임에서 나눈 이야기와 정한 것을 남겨 두면, 빠진 사람도 다음 모임 전에 따라올 수 있습니다.</p></div>
  <div class="mini"><b>그룹 소식 공유</b><p>도전 기록과 성과 기록은 커뮤니티 '그룹 소식'에 공유할 수 있습니다. 다른 그룹이 보고 응원과 조언을 남깁니다.</p></div>
</div>
<p>기록 요령은 ${guideLink('weekly-checkin')}에 따로 정리했습니다. 매출·고객·사용자 같은 성과는 목표·성과 화면에 기록하고, 매출은 운영진이 증빙을 보고 확인합니다.</p>

<h2 id="showcase">성과발표회와 페이퍼</h2>
${h.figure('spot-sharing', '', '', 'fig-spot fig-right')}
<p>성과발표회는 시즌마다 열리는 발표 자리입니다. 그룹리더나 부리더가 그룹 단위로 발표를 신청하고, 목표와 한 일, 숫자, 배운 점을 10분 안에 나눕니다. 목표에 닿지 못한 그룹도, 중간에 멈춘 그룹도 발표합니다.</p>
<p>그룹리더가 그룹을 마치면 열려 있던 출석은 마감되고, 앞으로 잡힌 모임은 취소됩니다. 출석 기준을 채운 그룹원은 '그룹 완주' 배지를 받습니다. 그다음 그룹리더가 프로젝트 페이퍼를 씁니다. 성과 기록과 출석 기록에서 숫자를 불러와 시작하고, 운영진이 검토해 공개합니다. 쓰는 법은 ${guideLink('project-paper')}에 있습니다.</p>
</article>
<aside class="side">
  <div class="side-box"><b>함께 읽기</b><ul><li><a href="/goals/">수익목표</a></li><li>${guideLink('why-group')}</li><li>${guideLink('weekly-checkin')}</li><li>${guideLink('first-sale-12-weeks')}</li></ul></div>
  <div class="side-box side-cta"><b>정기모임부터 시작하기</b><p>가입 신청 후 챌린저가 되면 바로 그룹에 참여할 수 있습니다.</p><a class="btn btn-primary" href="/apply/">가입 신청</a></div>
</aside>
</div>
${h.cta('혼자 미뤄 둔 프로젝트가 있다면', '정기모임에서 함께할 사람을 만나고, 그룹으로 끝까지 가 보세요.', undefined, ['/goals/', '수익목표 보기'])}`,
  });

  // ── 수익목표
  const goalsCrumbs = [['홈', '/'], ['수익목표', '/goals/']];
  pages.push({
    path: '/goals/', slug: 'goals',
    title: '수익목표: 그룹으로 함께 도전하는 성과와 수익',
    description: '마이챌린지 도전그룹의 최종 목표는 성과와 수익입니다. 배움에서 성장까지 여섯 단계의 수익목표, 목표를 숫자로 세우는 법, 운영진의 지원, 매출을 확인하는 기준, 수익을 나누는 방식을 정하는 원칙을 정리했습니다.',
    crumbs: goalsCrumbs,
    body: `${h.pageHero('수익목표', '함께 도전하는 최종 목표는 성과와 수익입니다', '배우는 데서 멈추지 않고, 만들고, 보여 주고, 팔아 보는 데까지 함께 갑니다. 운영진은 그 과정을 곁에서 돕습니다.', goalsCrumbs, '', { name: 'spot-building', alt: '', frame: false, cls: 'ph-spot' })}
<div class="wrap article-layout goal-before">
<article class="prose">
<div class="callout"><strong>먼저 밝혀 둡니다</strong><p>마이챌린지는 수익을 보장하지 않습니다. 회원에게서 출자금이나 투자금을 받지 않고, 원금이나 수익을 약속하지 않습니다. 수익목표는 그룹이 스스로 세우고 함께 도전하는 목표이며, 결과는 각 그룹이 만든 기록과 숫자로만 이야기합니다.</p></div>

<nav class="toc" aria-label="이 페이지의 내용"><b>이 페이지의 내용</b><ol><li><a href="#ladder">여섯 단계</a></li><li><a href="#set">목표를 숫자로 세우기</a></li><li><a href="#study">학습그룹의 목표</a></li><li><a href="#support">운영진의 지원</a></li><li><a href="#verify">성과를 확인하는 기준</a></li><li><a href="#revenue">수익이 생기면</a></li></ol></nav>

<h2 id="ladder">여섯 단계</h2>
<p>모든 그룹이 첫날부터 매출을 목표로 하지는 않습니다. 그룹마다 지금 어느 단계에 있는지, 이번 그룹에서 어디까지 갈지를 정하고 시작합니다.</p>
</article>
</div>
<div class="wrap goal-wrap">${goalStairs}</div>
<div class="wrap article-layout goal-after">
<article class="prose">
<p>배움과 실행 단계는 학습그룹이, 첫 반응부터는 도전그룹이 주로 맡습니다. 첫 매출이 가장 큰 고비입니다. 금액보다 그룹 밖의 모르는 사람이 처음으로 돈을 냈다는 사실이 중요하고, 마챌은 이 순간을 운영진 확인과 배지로 함께 기록합니다.</p>

<h2 id="set">목표를 숫자로 세우기</h2>
<p>"잘해 보자"로 시작한 그룹은 몇 주 뒤 무엇을 하려던 모임인지 각자 다르게 기억합니다. 그래서 그룹을 만들 때 목표를 한 문장으로 적고, 그 목표를 무엇으로 셀지 고릅니다.</p>
<div class="table-wrap"><table>
  <thead><tr><th>세는 숫자</th><th>단위</th><th>어울리는 경우</th></tr></thead>
  <tbody>
    ${[['revenue', '판매 페이지를 열고 실제로 팔아 보는 그룹'], ['customers', '돈을 낸 고객 수가 더 중요한 서비스·대행형 그룹'], ['sales', '상품 개수로 세는 커머스·디지털 상품 그룹'], ['users', '무료 서비스나 뉴스레터, 채널을 키우는 그룹'], ['content', '콘텐츠를 정해진 만큼 발행하는 그룹'], ['study', '과제나 실습 개수로 세는 학습그룹'], ['custom', '위에 없는 숫자로 세고 싶을 때']].map(([k, d]) => `<tr><td>${esc(GOAL_METRICS[k][0])}</td><td>${esc(GOAL_METRICS[k][1] || '직접 정함')}</td><td>${d}</td></tr>`).join('')}
  </tbody>
</table></div>
<p>좋은 목표는 기간과 숫자가 함께 들어 있습니다. "8주 안에 첫 유료 고객 3명"은 매주 무엇을 해야 하는지 거꾸로 따져 볼 수 있지만, "의미 있는 매출 만들기"는 그렇지 않습니다. 목표 숫자를 적어 두면 그룹원이 성과를 기록할 때마다 그룹 화면의 진행률이 올라갑니다. 마일스톤(예: 2주차 고객 후보 10명 인터뷰, 4주차 판매 페이지 공개)을 함께 적으면 중간 점검이 쉬워집니다.</p>

<h2 id="study">학습그룹의 목표</h2>
<p>학습그룹은 매출 대신 끝까지 해낼 학습 목표를 세웁니다. 정해진 기간 동안 실습을 몇 개 하고, 정리 노트를 몇 편 공개할지 정해 두면 됩니다. 학습그룹에서 정리한 노트는 커뮤니티에 공유되어 다른 회원에게도 자료가 되고, 그 분야로 도전그룹을 만들 때 출발점이 됩니다.</p>

<h2 id="support">운영진의 지원</h2>
${h.figure('act-mentoring', '안락의자에 앉아 멘토와 함께 막힌 부분을 짚어 보는 모습', '막힌 그룹은 오피스아워로 운영진이나 먼저 해 본 회원과 함께 봅니다.')}
<p>그룹은 회원이 만들고 이끌지만, 혼자 다 하게 두지 않습니다. 운영진은 아래 여섯 가지로 그룹을 돕습니다.</p>
${supportCards}
<p>지원은 그룹의 단계에 맞춰 달라집니다. 막 시작한 그룹에는 목표와 출석 규칙 점검을, 만들기 시작한 그룹에는 세미나와 회원 연결을, 첫 매출 앞에 선 그룹에는 오피스아워와 판매 피드백을 먼저 권합니다.</p>

<h2 id="verify">성과를 확인하는 기준</h2>
<ul class="checks">
  <li>매출은 가족, 친구, 회원끼리가 아닌 <b>그룹 밖의 고객</b>이 결제한 것만 확인합니다.</li>
  <li>입금 화면, 판매 플랫폼 정산 내역, 세금계산서처럼 <b>돈이 오간 흔적</b>을 증빙으로 남깁니다. 계좌번호와 고객의 개인정보는 가려 주세요.</li>
  <li>증빙은 운영진만 봅니다. 확인이 끝나면 그 그룹의 그룹원 모두에게 첫 매출 배지를 드립니다.</li>
  <li>매출이 아닌 성과(고객, 판매, 사용자, 콘텐츠, 학습 과제)는 그룹 안에서 기록하고, 성과발표회와 페이퍼에서 숫자로 나눕니다.</li>
</ul>
<p>그룹을 마치고 프로젝트 페이퍼를 내면 매출이 있었는지, 고객 수 구간, 들인 시간은 항상 공개합니다. 잘된 그룹만 골라 보여 주면 다음 사람이 잘못된 기대를 갖게 되기 때문입니다.</p>

<h2 id="revenue">수익이 생기면</h2>
<p>마챌은 지금 사람과 그룹이 모이고 다양한 사이드프로젝트가 움직이는 데 집중하고 있습니다. 그룹 프로젝트에서 생긴 수익을 어떻게 나눌지는 <b>아직 정하지 않았습니다.</b> 실제 수익이 나는 그룹이 생기면 그 그룹과 운영진이 함께 방식을 정하고, 적용하기 전에 이 페이지에 공개합니다.</p>
<p>그 전이라도 그룹 안에서 돈이 오가기 시작하면 아래 세 가지를 지켜 주세요.</p>
<ol>
  <li>돈을 받거나 쓰기 전에, 누가 무엇을 맡고 어떻게 나눌지 그룹원끼리 먼저 이야기하고 그룹 기록으로 남깁니다.</li>
  <li>잃어도 되는 돈으로만 합니다. 대출이나 카드 할부, 회원 사이의 돈 빌리기로 비용을 대지 않습니다.</li>
  <li>정하기 어렵거나 이견이 생기면 운영진에게 조정을 요청합니다. 금액이 커지면 세무사에게 한 번 확인받는 것을 권합니다(${guideLink('side-income-tax')}).</li>
</ol>
</article>
<aside class="side">
  <div class="side-box side-cta"><b>함께 도전해 볼까요?</b><p>가입하면 모집 중인 그룹에 바로 신청할 수 있습니다.</p><a class="btn btn-primary" href="/apply/">가입 신청</a></div>
  <div class="side-box"><b>함께 읽기</b><ul><li><a href="/how-it-works/">함께하는 방식</a></li><li>${guideLink('first-sale-12-weeks')}</li><li>${guideLink('side-job-ideas')}</li><li>${guideLink('side-income-tax')}</li></ul></div>
  <div class="side-box"><b>도전그룹 목표 예시</b><p class="small">8주 안에 첫 유료 고객 3명, 매출 30만 원 · 6주 동안 뉴스레터 구독자 200명 · 4주 안에 전자책 판매 10건</p><p class="small muted">그룹을 만들 때 참고하도록 넣은 예시입니다. 실제 목표는 그룹이 정합니다.</p></div>
</aside>
</div>
${liveGroups}
${h.cta('목표가 있으면 끝까지 갈 수 있습니다', '정기모임에서 함께할 사람을 찾고, 그룹으로 첫 매출까지 도전해 보세요.', undefined, ['/how-it-works/', '함께하는 방식 보기'])}`,
  });

  // ── 등급과 포인트
  const levelsCrumbs = [['홈', '/'], ['등급과 포인트', '/levels/']];
  const pts = Object.entries(D.points).sort((a, b) => b[1].points - a[1].points);
  pages.push({
    path: '/levels/', slug: 'levels',
    title: '회원 등급과 활동 포인트: 챌린저부터 마스터까지',
    description: '마이챌린지 회원 등급은 돈으로 살 수 없고 실행 기록으로만 오릅니다. 게스트(L0)부터 마스터(L5)까지 각 등급의 조건과 할 수 있는 일, 그룹리더와 등급의 관계, 활동 포인트 기준과 하루 상한을 정리했습니다.',
    crumbs: levelsCrumbs,
    body: `${h.pageHero('등급과 포인트', '등급은 실행 기록으로 오릅니다', '등급을 돈으로 사는 구조는 만들지 않습니다. 아래 기준은 운영진이 조정할 수 있고, 바뀌면 이 페이지도 함께 바뀝니다.', levelsCrumbs, levelStrip())}
<div class="wrap article-layout" data-live="levels">
<article class="prose">
<h2 id="ladder">여섯 단계</h2>
<div class="table-wrap"><table class="lv-table">
  <thead><tr><th>등급</th><th>되는 방법</th><th>할 수 있는 것</th></tr></thead>
  <tbody>
    <tr><td class="lv-cell">${lvIcon('L0', 36)}<span class="lv lv-L0">L0</span> 게스트</td><td>가입 승인 직후</td><td>공지, 공개 페이퍼 요약. 오리엔테이션(원칙 3문항 확인)을 마치면 자동으로 챌린저가 됩니다</td></tr>
    <tr><td class="lv-cell">${lvIcon('L1', 36)}<span class="lv lv-L1">L1</span> 챌린저</td><td>오리엔테이션 이수</td><td>정기모임·세미나·성과발표회, 학습그룹·도전그룹 참여, 커뮤니티, 발제 신청, 그룹리더 신청, 페이퍼 요약</td></tr>
    <tr><td class="lv-cell">${lvIcon('L2', 36)}<span class="lv lv-L2">L2</span> 메이커</td><td>활동 포인트 <b data-rule="L2.points">${D.levels.L2.points}</b>점, 자기 자산 진단 제출, 정기모임·세미나 <b data-rule="L2.require_event">${D.levels.L2.require_event}</b>회 참석, 가입 후 <b data-rule="L2.min_days">${D.levels.L2.min_days}</b>일. 조건을 채우면 <b>자동 승급</b></td><td>꾸준히 실행하는 회원이라는 표시. 그룹리더 신청과 발제 신청을 검토할 때 활동 기록으로 함께 봅니다</td></tr>
    <tr><td class="lv-cell">${lvIcon('L3', 36)}<span class="lv lv-L3">L3</span> 어치버</td><td>그룹 1회 완주(출석 기준을 채우고 그룹을 마침) 또는 첫 매출 확인 → 신청과 심사</td><td>다른 그룹의 도전 기록 전체, 프로젝트 페이퍼 전문</td></tr>
    <tr><td class="lv-cell">${lvIcon('L4', 36)}<span class="lv lv-L4">L4</span> 리더</td><td>그룹 2회 완주와 그룹리더 워크숍 이수 → 신청과 심사</td><td>처음 그룹을 여는 그룹리더의 멘토, 성과발표회 패널</td></tr>
    <tr><td class="lv-cell">${lvIcon('L5', 36)}<span class="lv lv-L5">L5</span> 마스터</td><td>그룹리더로 2회 완주 또는 반복 매출 → 신청과 심사</td><td>정기모임 프로그램 기획 참여, 오피스아워 멘토</td></tr>
  </tbody>
</table></div>
<p>L3부터는 신청을 받아 운영진이 7일 안에 심사하고, 보류하거나 반려할 때는 사유를 적어 알려 드립니다.</p>
<div class="callout"><strong>그룹리더와 리더(L4)는 다릅니다</strong><p>그룹을 만들고 이끄는 그룹리더는 등급과 관계없이 운영진의 승인으로 정합니다. 챌린저(L1)도 그룹리더를 신청할 수 있습니다. 리더(L4)는 그룹을 여러 번 완주한 회원에게 붙는 등급입니다.</p></div>

<h2 id="points">활동 포인트</h2>
<p>포인트는 메이커(L2) 승급 조건으로 쓰이고, 분기마다 새로 셉니다. 활동마다 하루 적립 상한이 있어서 글을 많이 쓴다고 빨리 오르지는 않습니다. 포인트는 현금이나 상품으로 바꿀 수 없습니다.</p>
<div class="table-wrap"><table>
  <thead><tr><th>활동</th><th class="num">포인트</th><th class="num">하루 상한</th></tr></thead>
  <tbody data-live="points">${pts.map(([, v]) => `<tr><td>${esc(v.label)}</td><td class="num">${v.points}</td><td class="num">${v.daily_cap ? v.daily_cap + '회' : '없음'}</td></tr>`).join('')}</tbody>
</table></div>

<h2 id="badges">배지</h2>
<p>등급과 별도로 의미 있는 순간에 배지를 드립니다. 첫 매출 배지는 그룹 밖 고객의 결제를 증빙으로 확인한 뒤에만 드리고, 그룹 완주 배지는 그룹을 마칠 때 출석 기준을 채운 그룹원에게 드립니다.</p>
${badgeGrid()}

<h2 id="dormant">휴면과 복귀</h2>
<p>6개월 넘게 활동이 없으면 휴면으로 바뀝니다. 휴면 중에도 등급, 배지, 포인트 기록은 그대로 남고, 돌아오면 원래 등급으로 복원됩니다. 리더(L4) 이상은 복귀할 때 운영진과 한 번 이야기를 나눕니다.</p>
</article>
<aside class="side">
  <div class="side-box"><b>함께 읽기</b><ul><li><a href="/how-it-works/">함께하는 방식</a></li><li><a href="/goals/">수익목표</a></li><li><a href="/programs/">정기모임·프로그램</a></li><li>${guideLink('side-project-start')}</li></ul></div>
  <div class="side-box side-cta"><b>챌린저부터 시작</b><p>신청 후 초대 코드로 가입하면 오리엔테이션을 거쳐 챌린저가 됩니다.</p><a class="btn btn-primary" href="/apply/">가입 신청</a></div>
</aside>
</div>`,
  });

  // ── 프로그램
  const progCrumbs = [['홈', '/'], ['정기모임·프로그램', '/programs/']];
  const PROGRAMS = [
    ['정기모임', '월 1회 이상', 'L1 이상, 일부 공개', '사업 아이디어, 시장, 트렌드, AI 활용, 사이드프로젝트 사례를 발제로 듣고 함께 이야기합니다. 새 그룹 소개와 그룹 근황 나눔이 이어집니다.', 'act-event-checkin', '행사장 입구에서 이름표를 받고 입장하는 회원들'],
    ['학습그룹', '그룹리더가 정한 기간', 'L1 이상', '한 분야를 정해 함께 공부하고 실습하고 정리합니다. 정리한 노트는 커뮤니티에 공유해 다른 회원의 자료가 됩니다.', 'act-book-club', '소파에 둘러앉아 같은 자료를 읽고 이야기하는 스터디'],
    ['도전그룹', '그룹리더가 정한 기간', 'L1 이상', '하나의 프로젝트로 매출·고객·사용자 같은 목표에 도전합니다. 그룹 공간에서 모임, 출석, 기록, 목표 진행률을 함께 관리합니다.', 'act-kickoff', '그룹원들이 진행표에 메모를 붙이며 계획을 세우는 킥오프'],
    ['성과발표회', '시즌마다', '그룹 발표, 회원 참관', '그룹들이 목표와 결과, 숫자, 배운 점을 발표합니다. 목표에 닿지 못했어도, 멈췄어도 발표합니다.', 'act-demo-day', '회원들 앞에서 결과물을 띄워 놓고 발표하는 그룹리더'],
    ['세미나·특강', '수시', 'L1 이상', '실제로 해 본 사람을 초청해 판매 페이지, 가격, 첫 판매, 세금 같은 실무 주제를 다룹니다.', 'act-seminar', '강사의 설명을 들으며 손을 들어 질문하는 세미나 참가자들'],
    ['워크숍', '수시', 'L1 이상', 'AI 도구, 상세 페이지, 콘텐츠 제작처럼 그 자리에서 직접 해 보는 실습입니다. 학습그룹이 시작되는 계기가 되기도 합니다.', 'act-workshop', '화이트보드 앞에서 계획을 함께 정리하는 사람들'],
    ['오피스아워', '신청제', '진행 중인 그룹', '막힌 그룹이 운영진이나 먼저 해 본 회원과 시간을 잡아 함께 봅니다. 필요한 기술을 가진 회원을 연결해 드리기도 합니다.', 'act-mentoring', '안락의자에 앉아 멘토와 함께 막힌 부분을 짚어 보는 모습'],
    ['네트워킹', '정기모임 뒤·수시', 'L1 이상', '다른 그룹, 다른 분야의 회원과 편하게 이야기를 나눕니다. 혼자서는 떠올리지 못한 조합이 여기서 나옵니다.', 'act-networking', '커피잔을 앞에 두고 편하게 이야기를 나누는 회원들'],
    ['마챌 페이퍼', '시즌마다', '누구나(공개 요약)', '마무리한 그룹의 프로젝트 페이퍼를 묶어 사례로 냅니다. 잘된 길과 멈춘 길을 함께 싣습니다.', 'act-project-showcase', '테이블마다 프로젝트 결과물을 펼쳐 놓고 소개하는 전시'],
  ];
  pages.push({
    path: '/programs/', slug: 'programs',
    title: '정기모임과 프로그램: 정기모임, 학습·도전그룹, 성과발표회, 세미나',
    description: '마이챌린지에서 열리는 모임과 프로그램을 소개합니다. 월 1회 이상 정기모임, 학습그룹과 도전그룹, 시즌마다 성과발표회, 세미나·특강, 워크숍, 오피스아워, 네트워킹, 마챌 페이퍼.',
    crumbs: progCrumbs,
    body: `${h.pageHero('정기모임·프로그램', '혼자서는 만들기 어려운 리듬을 만듭니다', '매주의 그룹 모임, 매달의 정기모임, 시즌마다의 성과발표회가 사이드프로젝트에 마감과 동료를 만들어 줍니다. 모임은 온라인과 오프라인에서 함께 열립니다.', progCrumbs, '', { name: 'ph-programs', alt: '공방 테이블에서 천을 자르고 바느질하며 함께 작업하는 세 사람' })}
<section class="sec sec-tight"><div class="wrap">
  <div class="prog-grid">${PROGRAMS.map(([t, when, who, d, pic, alt]) => `<article class="prog has-pic"><div class="prog-pic">${img(pic, alt)}</div><div class="prog-body"><h2>${t}</h2><p class="prog-meta"><span>${when}</span><span>${who}</span></p><p>${d}</p></div></article>`).join('')}</div>
</div></section>
<section class="sec sec-tint" data-live="events" hidden><div class="wrap narrow">
  <div class="sec-head"><p class="eyebrow">다가오는 일정</p><h2>이번 달 모임</h2></div>
  <ul class="event-list"></ul>
  <p class="small muted">참가 신청, 발제 신청, 출석 확인은 회원 공간에서 합니다.</p>
</div></section>
${h.cta('다음 정기모임에서 만나요', '가입하면 정기모임·일정 화면에서 참가 신청과 발제 신청을 할 수 있습니다.')}`,
  });

  // ── FAQ
  const faqCrumbs = [['홈', '/'], ['자주 묻는 질문', '/faq/']];
  pages.push({
    path: '/faq/', slug: 'faq',
    title: '자주 묻는 질문: 가입, 정기모임과 그룹, 출석, 수익목표, 회사·세금',
    description: '마이챌린지 가입 절차와 비용, 정기모임과 학습·도전그룹, 그룹리더, 출석 체크와 경고·퇴출, 수익목표와 매출 확인, 회사 겸업과 개인정보, 탈퇴까지 자주 묻는 질문을 모았습니다.',
    crumbs: faqCrumbs,
    jsonld: [faqLd],
    body: `${h.pageHero('자주 묻는 질문', '신청 전에 궁금한 것들', '찾는 답이 없다면 가입 신청서의 마지막 칸에 질문을 남겨 주세요. 운영진이 확인할 때 함께 답해 드립니다.', faqCrumbs, '', { name: 'ph-faq', alt: '마이크 앞에 마주 앉아 질문하고 답하는 두 사람' })}
<div class="wrap narrow faq-page">
${FAQ.map(([group, qs], i) => `<section class="faq-group" id="faq-${i + 1}"><h2>${group}</h2><div class="faq">${qs.map(faqItem).join('')}</div></section>`).join('')}
<p class="faq-links">더 자세한 내용: <a href="/how-it-works/">함께하는 방식</a> · <a href="/goals/">수익목표</a> · <a href="/levels/">등급과 포인트</a> · ${guideLink('side-job-company-rules')} · ${guideLink('side-income-tax')} · <a href="/privacy/">개인정보처리방침</a></p>
</div>
${h.cta('궁금한 게 풀렸다면', '신청서는 10분이면 씁니다. 경력이나 실적은 심사 기준이 아닙니다.')}`,
  });

  // ── 가입 신청
  const applyCrumbs = [['홈', '/'], ['가입 신청', '/apply/']];
  const interestChecks = Object.entries(FIELDS).map(([k, v]) => `<label class="chk"><input type="checkbox" name="interests" value="${k}"><span>${v}</span></label>`).join('');
  pages.push({
    path: '/apply/', slug: 'apply',
    title: '가입 신청: 사이드프로젝트 커뮤니티 마이챌린지에 함께하기',
    description: '마이챌린지(마챌) 가입 신청 페이지입니다. 신청서를 보내면 운영진이 3일 안에 확인하고 초대 코드를 이메일로 보내 드립니다. 경력이나 실적은 심사 기준이 아닙니다.',
    crumbs: applyCrumbs,
    body: `${h.pageHero('가입 신청', '마이챌린지 가입 신청', '솔직하게 적어 주세요. 경력이나 실적은 심사 기준이 아니고, 쓸 수 있는 시간과 함께하는 방식에 대한 생각을 봅니다.', applyCrumbs, '', { name: 'ph-apply', alt: '운영진이 문을 열고 노트를 든 새 회원들을 맞이하는 모습' })}
<div class="wrap apply-layout">
<div class="apply-main">
  <p class="round-note" data-live="round" hidden></p>
  <ol class="apply-steps"><li><b>신청서 제출</b><span>10분</span></li><li><b>운영진 확인</b><span>3일 안</span></li><li><b>초대 코드 이메일</b><span>승인 시</span></li><li><b>가입·오리엔테이션</b><span>5분</span></li></ol>
  <form class="apply-form" id="apply-form" novalidate>
    <fieldset><legend>기본 정보</legend>
      <div class="f-row">
        <label class="f"><span>이름 <i>*</i></span><input name="name" required autocomplete="name" placeholder="실명"></label>
        <label class="f"><span>이메일 <i>*</i></span><input name="email" type="email" required autocomplete="email" placeholder="초대 코드를 받을 이메일"><small>가입할 때 같은 이메일을 씁니다</small></label>
      </div>
      <div class="f-row">
        <label class="f"><span>연락처</span><input name="phone" autocomplete="tel" placeholder="010-0000-0000"></label>
        <label class="f"><span>추천인</span><input name="referrer" placeholder="회원 닉네임 또는 이메일"></label>
      </div>
    </fieldset>
    <fieldset><legend>시간과 관심사</legend>
      <div class="f-row">
        <label class="f"><span>지금 하는 일</span><input name="job" placeholder="직장인 · 자영업 · 프리랜서 · 학생 등"></label>
        <label class="f"><span>주중·주말에 쓸 수 있는 시간</span><input name="hours_weekday" placeholder="예: 주중 저녁 5시간, 주말 4시간"></label>
      </div>
      <div class="f"><span>관심 분야 (여러 개 고를 수 있습니다)</span><div class="chk-row">${interestChecks}</div></div>
      <label class="f"><span>먼저 해 보고 싶은 것</span><select name="want_group"><option value="">선택</option><option value="meetup">우선 정기모임에 나와 보고 싶다</option><option value="study">학습그룹에서 함께 공부하고 싶다</option><option value="challenge">도전그룹으로 프로젝트를 해 보고 싶다</option><option value="both">둘 다 해 보고 싶다</option></select></label>
    </fieldset>
    <fieldset><legend>생각을 듣고 싶은 것</legend>
      <label class="f"><span>사이드프로젝트를 해 본 적이 있나요? 결과는 어땠나요?</span><textarea name="experience" rows="4" placeholder="해 본 적이 없어도 괜찮습니다. 없다면 그 이유를 적어 주셔도 좋습니다."></textarea></label>
      <label class="f"><span>마챌에서 배우고 싶은 것, 함께 도전해 보고 싶은 프로젝트</span><textarea name="project_idea" rows="3" placeholder="예: AI로 상세페이지 만드는 법을 배우고 싶다 / 동네 가게 SNS 대행을 같이 해 볼 사람을 찾는다"></textarea></label>
      <label class="f"><span>그룹으로 하면 좋은 점과 걱정되는 점을 한 가지씩</span><textarea name="why_group" rows="3"></textarea></label>
      <div class="f-row">
        <label class="f"><span>회사 규정상 겸업 제한이 있는지 확인하셨나요?</span><select name="side_job_check"><option value="">선택</option><option value="yes">확인했고 문제 없음</option><option value="partial">일부 제한이 있음 (가입 후 상의)</option><option value="no">아직 확인하지 않음</option><option value="na">해당 없음 (직장인이 아님)</option></select></label>
        <label class="f"><span>정기모임·성과발표회 같은 오프라인 모임에 나올 수 있나요?</span><select name="can_attend"><option value="">선택</option><option value="yes">대부분 참석 가능</option><option value="some">절반 정도</option><option value="no">당분간 온라인만</option></select></label>
      </div>
      <label class="f"><span>마챌에 줄 수 있는 것 한 가지</span><input name="give" placeholder="예: 디자인 피드백, 엑셀 정리, 사진 촬영, 발제 주제, 모임 장소"></label>
      <label class="f"><span>운영진에게 묻고 싶은 것 (선택)</span><textarea name="question" rows="2"></textarea></label>
    </fieldset>
    <fieldset class="consent"><legend>동의</legend>
      <div class="privacy-summary">
        <b>개인정보 수집·이용 안내</b>
        <dl><dt>목적</dt><dd>가입 심사, 초대 코드 발송, 신청 관련 연락</dd><dt>항목</dt><dd>(필수) 이름, 이메일 (선택) 연락처, 추천인, 하는 일, 가능 시간, 관심 분야, 신청서 답변</dd><dt>보유 기간</dt><dd>가입하면 회원 정보로 옮겨 탈퇴 시까지, 가입하지 않으면 처리 후 6개월이 지나면 파기</dd></dl>
        <p>동의하지 않을 수 있으며, 이 경우 가입 신청을 할 수 없습니다. 자세한 내용은 <a href="/privacy/" target="_blank" rel="noopener">개인정보처리방침</a>을 확인해 주세요.</p>
      </div>
      <label class="chk chk-block"><input type="checkbox" name="consent_privacy" required><span>만 14세 이상이며, 위 개인정보 수집·이용에 동의합니다. <i>(필수)</i></span></label>
      <label class="chk chk-block"><input type="checkbox" name="consent_public" required><span>그룹을 마치고 프로젝트 페이퍼를 내면 매출 유무, 고객 수 구간, 들인 시간이 공개될 수 있다는 점에 동의합니다. <i>(필수)</i></span></label>
    </fieldset>
    <p class="form-msg" role="alert" aria-live="assertive"></p>
    <button class="btn btn-primary btn-lg btn-block" type="submit">신청서 보내기</button>
  </form>
  <div class="apply-done" hidden>
    <h2>신청서를 받았습니다</h2>
    <p>운영진이 3일 안에 확인한 뒤 이메일로 초대 코드를 보내 드립니다. 코드를 받으면 <a href="/app/#/register">초대 코드로 가입</a>에서 계정을 만드세요.</p>
    <p>기다리는 동안 <a href="/goals/">수익목표</a>나 <a href="/guide/">가이드</a>를 읽어 보셔도 좋습니다.</p>
  </div>
</div>
<aside class="side apply-side">
  <div class="side-box"><b>신청 전에 확인해 주세요</b><ul class="checks small">
    <li>마챌은 수익을 보장하지 않습니다</li>
    <li>근무시간과 회사 자료는 쓰지 않습니다</li>
    <li>참여한 그룹의 모임에 나오고, 그룹의 출석 규칙을 지킵니다</li>
    <li>회원끼리 투자 권유, 다단계, 유료 강의 모집은 할 수 없습니다</li>
  </ul></div>
  <div class="side-box"><b>이미 초대 코드를 받았다면</b><p class="small">운영진이 보낸 코드와 신청서에 적은 이메일로 가입하세요.</p><a class="btn btn-line" href="/app/#/register">초대 코드로 가입</a></div>
</aside>
</div>`,
  });

  // ── 가이드 목록
  const guideCrumbs = [['홈', '/'], ['가이드', '/guide/']];
  const byCat = Object.entries(CATEGORIES).map(([k, label]) => [k, label, GUIDES.filter(g => g.category === k)]).filter(([, , list]) => list.length);
  pages.push({
    path: '/guide/', slug: 'guide',
    title: '사이드프로젝트 가이드: 시작, 함께하기, 돈과 제도, 운영 노하우',
    description: '직장인 사이드프로젝트를 시작하는 법, 부업 아이디어 고르는 기준, 첫 매출 계획, 그룹으로 할 때 달라지는 것, 회사 겸업 규정, 부업 소득 세금, 고액 부업 강의 피해 예방까지 실행에 필요한 글을 모았습니다.',
    crumbs: guideCrumbs,
    jsonld: [base => ({ '@context': 'https://schema.org', '@type': 'CollectionPage', name: '마이챌린지 사이드프로젝트 가이드', url: base + '/guide/', mainEntity: { '@type': 'ItemList', itemListElement: GUIDES.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: `${base}/guide/${g.slug}/`, name: g.title })) } })],
    body: `${h.pageHero('가이드', '사이드프로젝트 가이드', '마챌 회원들이 실제로 막히는 지점을 중심으로 정리했습니다. 숫자가 들어간 글에는 출처를 밝혔습니다.', guideCrumbs)}
<div class="wrap">
  <nav class="cat-nav" aria-label="가이드 분류">${byCat.map(([k, label, list]) => `<a href="#cat-${k}">${label}<span>${list.length}</span></a>`).join('')}</nav>
  ${byCat.map(([k, label, list]) => `<section class="cat-sec" id="cat-${k}"><h2>${label}</h2><div class="g-grid">${list.map(guideCard).join('')}</div></section>`).join('')}
</div>
${h.cta('읽는 것보다 해 보는 게 빠릅니다', '정기모임에서 함께할 사람을 만나고, 그룹으로 직접 해 보세요.')}`,
  });

  // ── 법적 고지
  pages.push(...legalPages());

  // ── 404
  pages.push({
    path: '/404.html', slug: '404', file: '404.html', noindex: true,
    title: '페이지를 찾을 수 없습니다',
    description: '요청한 페이지를 찾을 수 없습니다. 주소를 확인하거나 마이챌린지 홈에서 다시 찾아 주세요.',
    body: `<section class="notfound"><div class="wrap narrow center">
  <div class="nf-pic">${img('ph-404', '공원 산책로에서 주변을 둘러보며 사진을 찍는 사람들', { eager: true })}</div>
  <p class="eyebrow">404</p>
  <h1>페이지를 찾을 수 없습니다</h1>
  <p class="lead">주소가 바뀌었거나 없어진 페이지입니다. 아래에서 찾던 내용을 골라 주세요.</p>
  <div class="hero-actions center"><a class="btn btn-primary" href="/">마이챌린지 홈</a><a class="btn btn-line" href="/goals/">수익목표</a><a class="btn btn-line" href="/guide/">가이드</a><a class="btn btn-line" href="/app/#/dashboard">회원 공간</a></div>
</div></section>`,
  });

  return pages;
}
