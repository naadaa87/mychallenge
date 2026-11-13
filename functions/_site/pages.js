// 공개 사이트의 고정 페이지들. 빌드 스크립트가 public/<path>/index.html 로 만든다.
import { SITE } from './config.js';
import { esc, h, orgLd, websiteLd } from './layout.js';
import { GUIDES, CATEGORIES, guideBySlug } from './guides.js';
import { legalPages } from './legal.js';
import { DEFAULT_SETTINGS as D, LEVEL_NAMES, FIELDS } from '../_lib/rules.js';

const pct = r => Math.round(r * 100) + '%';
const won = n => n.toLocaleString('ko-KR') + '원';
const P = D.presets;

// ───────────── 재사용 조각 ─────────────
export function guideCard(g) {
  return `<a class="g-card" href="/guide/${g.slug}/"><span class="g-cat">${CATEGORIES[g.category]}</span><h3>${esc(g.title)}</h3><p>${esc(g.summary)}</p><span class="g-more">읽어 보기</span></a>`;
}
const guideLink = slug => { const g = guideBySlug[slug]; return g ? `<a href="/guide/${slug}/">${esc(g.short)}</a>` : ''; };

const waterfall = `<ol class="flow">
  <li><span class="flow-n">1</span><div><b>외부 매출 − 직접 비용 = 순수익</b><small>가족·지인·회원 매출은 빼고, 증빙 있는 비용만 뺍니다</small></div></li>
  <li><span class="flow-n">2</span><div><b>그룹원 분담금 회수</b><small>비용을 나눠 낸 사람이 먼저 돌려받습니다</small></div></li>
  <li><span class="flow-n">3</span><div><b>운영본부 선지원 회수</b><small>운영본부가 대신 낸 비용이 있으면 그다음</small></div></li>
  <li><span class="flow-n">4</span><div><b>정산 대행 수수료</b><small>마챌이 매출 수취·지급을 대신 맡았을 때만 ${pct(D.agency_rate)}</small></div></li>
  <li><span class="flow-n">5</span><div><b>최소 정산 확인</b><small>배분 가능액이 ${won(D.min_settlement)} 미만이면 다음 정산으로 이월</small></div></li>
  <li class="flow-split"><span class="flow-n">6</span><div><b>합의서 비율대로 배분</b><small>기본형 기준. 유형에 따라 비율이 다릅니다</small>
    <div class="split" role="img" aria-label="기본형 배분 비율: 운영본부 10%, 그룹장 30%, 그룹원 풀 60%"><span style="flex:${P.basic.hq * 100}" class="s-hq">${pct(P.basic.hq)}</span><span style="flex:${P.basic.leader * 100}" class="s-leader">${pct(P.basic.leader)}</span><span style="flex:${P.basic.pool * 100}" class="s-pool">${pct(P.basic.pool)}</span></div>
    <p class="split-legend" aria-hidden="true"><span><i class="l-hq"></i>운영본부</span><span><i class="l-leader"></i>그룹장</span><span><i class="l-pool"></i>그룹원 풀(기여율대로)</span></p></div></li>
</ol>`;

const ROUND = [
  ['1~2주', '제안과 모집', '리더 등급 회원이 챌린지를 제안하고, 운영본부 심사를 통과하면 그룹원을 모읍니다.'],
  ['3주', '합의서 서명', '배분 비율, 소유권, 역할, 예산 상한을 적고 전원이 서명합니다. 운영본부가 승인하면 시작입니다.'],
  ['4주', '선언', '1페이지 계획을 마챌데이에서 공개합니다. 공개한 계획은 약속이 됩니다.'],
  ['7주', '첫 공개', '완성품이 아니어도 바깥사람이 볼 수 있는 것을 처음 내놓습니다.'],
  ['8주', '교차 피드백', '다른 그룹과 서로의 결과물을 보고 냉정한 의견을 주고받습니다.'],
  ['12주', '데모데이와 정산', '결과를 발표하고 프로젝트 페이퍼를 낸 뒤, 합의서대로 정산합니다.'],
];
const timeline = `<ol class="timeline">${ROUND.map(([w, t, d]) => `<li><span class="tl-week">${w}</span><b>${t}</b><p>${d}</p></li>`).join('')}</ol>`;

const LADDER = [
  ['L1', '챌린저', '오리엔테이션을 마친 회원', '세미나·스터디·커피챗, 커뮤니티, 솔로 챌린지'],
  ['L2', '메이커', `활동 포인트 ${D.levels.L2.points}점 + 자기 자산 진단 + 모임 ${D.levels.L2.require_event}회 + 가입 ${D.levels.L2.min_days}일`, '그룹 챌린지 그룹원, 품앗이 보드'],
  ['L3', '어치버', '라운드 1회 완주 또는 첫 외부 매출 인증', '다른 그룹의 진행 기록, 페이퍼 전문'],
  ['L4', '리더', '라운드 2회 완주 + 리더 교육', '그룹 챌린지 제안과 운영'],
  ['L5', '마스터', '그룹장으로 성공 챌린지 2건 또는 반복 매출', '심사·멘토링 참여'],
];
const ladder = `<ol class="ladder">${LADDER.map(([c, n, how, can]) => `<li><span class="lv lv-${c}">${c}</span><div><b>${n}</b><small>${how}</small></div><p>${can}</p></li>`).join('')}</ol>`;

const heroVisual = `<div class="hero-visual" role="img" aria-label="그룹 공간 화면 예시: 7주차 진행, 마일스톤, 주간 체크인, 배분 합의">
  <div class="mock">
    <div class="mock-head"><span class="chip">서비스·프리랜싱</span><span class="chip chip-blue">진행 중 · 7주차</span></div>
    <b class="mock-title">동네 카페 세 곳 SNS 운영 대행</b>
    <div class="mock-progress"><span style="width:58%"></span></div>
    <ul class="mock-ms">
      <li class="done">4주 선언</li><li class="done">7주 첫 공개</li><li>8주 교차 피드백</li><li>12주 데모데이</li>
    </ul>
    <div class="mock-row"><span>이번 주 체크인</span><b>4 / 5 제출</b></div>
  </div>
  <div class="mock mock-sm mock-a"><small>완료 기록 · 그룹장 확인</small><b>카페 B 샘플 게시물 4개 전달</b></div>
  <div class="mock mock-sm mock-b"><small>배분 합의서 · 전원 서명</small><b>10 · 30 · 60</b></div>
  <p class="mock-note">예시 화면입니다</p>
</div>`;

const PAINS = [
  ['퇴근 후 혼자 하다 보면 3주째에 멈춥니다', '마감도, 물어볼 사람도 없어서입니다. 매주 15분 체크인과 그룹장이 그 빈자리를 채웁니다.', 'why-group'],
  ['수백만 원짜리 부업 강의는 망설여집니다', '마챌은 돈 버는 법을 팔지 않습니다. 각자 실제로 팔아 보고, 결과를 숫자로 남깁니다.', 'avoid-side-job-course-scams'],
  ['같이 하고 싶은데 돈 문제로 틀어질까 걱정됩니다', '배분 비율과 소유권은 시작 전에 합의서로 정하고 전원이 서명합니다.', 'profit-sharing'],
  ['회사 다니면서 해도 되는지, 세금은 어떻게 되는지 모르겠습니다', '시작 전에 확인할 회사 규정과 부업 소득 세금을 가이드로 정리해 두었습니다.', 'side-job-company-rules'],
];

// ───────────── FAQ (홈 일부, /faq/ 전체) ─────────────
export const FAQ = [
  ['가입과 참여', [
    ['마이챌린지는 어떤 모임인가요?', '사이드프로젝트로 첫 매출을 만들어 보려는 사람들이 관심사별 그룹을 짜서 12주 동안 함께 실행하는 모임입니다. 강의를 듣는 곳이 아니라 각자 프로젝트를 실제로 진행하고, 매주 체크인으로 진행을 확인하고, 끝나면 결과를 프로젝트 페이퍼로 남기는 곳입니다.'],
    ['누가 가입할 수 있나요?', '사이드프로젝트를 실제로 해 보려는 직장인, 프리랜서, 자영업자, 학생 모두 신청할 수 있습니다. 경력이나 실적은 심사 기준이 아닙니다. 다만 일주일에 쓸 수 있는 시간을 솔직하게 적어 주셔야 하고, 수익을 보장하지 않는다는 원칙에 동의해야 합니다. 만 14세 미만은 가입할 수 없습니다.'],
    ['가입 절차는 어떻게 되나요?', '가입 신청서를 내면 운영본부가 3일 안에 확인하고 이메일로 초대 코드를 보내 드립니다. 초대 코드로 계정을 만든 뒤 5분 정도 걸리는 오리엔테이션(원칙 확인 3문항)을 마치면 챌린저(L1)가 됩니다.'],
    ['비용이 드나요?', '가입 신청과 오리엔테이션에는 비용이 들지 않습니다. 정기 멤버십이나 라운드 참가비를 받게 되면 기수마다 모집 공지에 금액과 환불 기준을 숫자로 적어 안내합니다. "전액 환급", "사실상 무료" 같은 표현은 쓰지 않습니다.'],
    ['사이드프로젝트를 해 본 적이 전혀 없어도 되나요?', '괜찮습니다. 처음에는 세미나·스터디·커피챗에 참여하고, 자기 자산 진단으로 내가 가진 기술과 경험을 정리하는 것부터 시작합니다. 혼자 작게 해 보는 솔로 챌린지도 있습니다.'],
    ['온라인으로만 참여할 수 있나요?', '체크인, 완료 기록, 장부, 커뮤니티는 모두 온라인에서 합니다. 월 1회 마챌데이와 라운드 마지막 주 데모데이는 오프라인 모임이 중심이며, 메이커(L2)가 되려면 모임에 한 번은 참석해야 합니다. 장소와 일정은 회원 일정 게시판에서 안내합니다.'],
  ]],
  ['그룹 챌린지', [
    ['그룹은 어떻게 만들어지나요?', `리더(L4) 이상 회원이 챌린지를 제안하면 운영본부가 여섯 항목(그룹 자산 활용, 불편의 실체, 첫 매출 속도, 쌓이는 정도, 초기 비용, 역할 분담)으로 심사합니다. 45점 만점에 ${D.review_pass_score}점 이상이면 모집을 시작하고, 그룹장이 지원자 중에서 그룹원을 고릅니다. 그룹은 그룹장을 포함해 4~8명입니다.`],
    ['그룹 챌린지에 바로 들어갈 수 있나요?', `그룹원 지원은 메이커(L2)부터 할 수 있습니다. 챌린저(L1)가 활동 포인트 ${D.levels.L2.points}점, 자기 자산 진단, 모임 ${D.levels.L2.require_event}회 참석, 가입 ${D.levels.L2.min_days}일을 채우면 자동으로 메이커가 됩니다.`],
    ['여러 그룹에 동시에 참여할 수 있나요?', '그룹원으로는 한 번에 한 그룹만 참여할 수 있습니다. 한 프로젝트에 제대로 시간을 쓰기 위한 규칙입니다.'],
    ['중간에 그만두면 어떻게 되나요?', '2주 전에 알리고 나가면 그 시점까지의 실제 기여율로 라운드 말 정산에 포함되고, 낸 분담금은 정해진 순서대로 돌려받습니다. 3주 연속 체크인에 나오지 않고 연락이 끊기면 기여율의 50%만 반영됩니다. 챌린지 자체는 8주차까지 첫 공개가 없거나 그룹원 과반이 원하면 운영본부와 협의해 멈출 수 있고, 멈춰도 프로젝트 페이퍼는 냅니다.'],
  ]],
  ['돈과 소유권', [
    ['수익은 어떻게 나누나요?', `외부 매출에서 직접 비용을 뺀 순수익에서 그룹원 분담금과 운영본부 선지원을 먼저 돌려준 뒤, 합의서에 적은 비율대로 나눕니다. 기본형은 운영본부 ${pct(P.basic.hq)}, 그룹장 ${pct(P.basic.leader)}, 그룹원 풀 ${pct(P.basic.pool)}이고, 그룹원 풀은 완료 기록으로 계산한 기여율대로 나눕니다.`],
    ['운영본부는 왜 몫을 가져가나요?', '홈페이지와 정산 도구, 모임 공간, 세미나와 오피스아워, 심사·검수·조정에 드는 인력에 대한 대가입니다. 이 비용을 따로 떼지 않는 대신 몫으로 받으며, 범위는 5~15%(오피셜 챌린지 제외)입니다. 그룹 순수익이 0 이하라면 몫도 없고, 받은 몫의 합계와 쓴 곳은 분기마다 공개합니다.'],
    ['손실이 나면 제가 더 내야 하나요?', '아니요. 순수익이 0 이하라면 배분이 없고, 손실은 각자 낸 분담금만큼으로 끝납니다. 누구에게도 추가 부담을 지우지 않으며, 비용은 처음부터 예산 상한(1인 10만 원, 그룹 50만 원) 안에서만 씁니다.'],
    ['마이챌린지가 수익을 보장하나요?', '보장하지 않습니다. 마챌은 회원에게서 출자금이나 투자금을 받지 않고, 원금이나 수익을 약속하지 않습니다. 배분하는 돈은 그룹이 실제로 판 상품의 순수익뿐입니다.'],
    ['프로젝트는 누구 소유가 되나요?', '합의서에서 세 가지 중 하나를 고릅니다. 그룹 공동 소유(A형), 그룹장 소유와 마챌 사례 사용권(B형), 마챌 소유(C형, 오피셜 챌린지)입니다. 소유 유형을 정하지 않은 챌린지는 시작하지 않으며, 어떤 유형이든 만든 사람의 포트폴리오 사용권은 보장합니다.'],
    ['배분받은 돈의 세금은 어떻게 하나요?', '정산표에는 지급액마다 3.3% 원천징수 참고액이 함께 표시됩니다. 실제 신고는 소득의 성격에 따라 달라지므로 금액이 커지면 세무사 확인을 권합니다. 자세한 내용은 부업 소득 세금 가이드에 정리했습니다.'],
  ]],
  ['회사·기록·개인정보', [
    ['회사에 다니면서 참여해도 되나요?', '대부분 가능하지만 회사마다 겸업 규정이 다릅니다. 근로계약서와 취업규칙을 먼저 확인해 주세요. 마챌은 근무시간과 회사 자료를 쓰지 않는 것을 원칙으로 하며, 공무원이라면 소속 기관의 겸직 허가 절차를 먼저 밟아야 합니다.'],
    ['프로젝트 결과가 외부에 공개되나요?', '매출이 있었는지, 외부 고객 수의 구간, 투입 시간 세 가지는 항상 공개합니다. 성공한 사례만 보이지 않게 하기 위해서입니다. 정확한 매출액이나 비용 같은 나머지 숫자는 비공개로 고를 수 있고, 외부 공개는 그룹이 동의한 경우에만 요약으로 실립니다.'],
    ['개인정보는 어떻게 관리하나요?', '비밀번호는 복원할 수 없는 방식으로 암호화해 저장하고, 회원 정보는 운영진만 볼 수 있습니다. 정산 지급에 필요한 계좌나 주민등록번호는 홈페이지에 저장하지 않습니다. 자세한 내용은 개인정보처리방침을 확인해 주세요.'],
    ['탈퇴는 어떻게 하나요?', '로그인한 뒤 내 정보 화면에서 회원 탈퇴를 누르면 됩니다. 이메일, 이름, 연락처, 자기 자산 진단은 바로 지워지고, 다른 그룹원과 함께 서명한 합의서·장부·정산 기록은 이름 없이 남습니다. 참여 중인 챌린지나 지급 전 정산이 있으면 먼저 정리해야 탈퇴할 수 있습니다.'],
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
    fullTitle: '마이챌린지(마챌) | 사이드프로젝트 첫 매출까지 12주 함께하는 모임',
    title: '사이드프로젝트 첫 매출까지 12주 함께하는 모임',
    ogTitle: '마이챌린지(마챌) — 사이드프로젝트, 12주 동안 함께 첫 매출까지',
    description: '마이챌린지(마챌)는 직장인·프리랜서가 관심사별 그룹을 짜서 12주 동안 사이드프로젝트를 실행하고 첫 매출에 도전하는 모임입니다. 주간 체크인, 시작 전 수익 배분 합의서, 프로젝트 페이퍼로 운영합니다.',
    bodyClass: 'is-home',
    jsonld: [orgLd, websiteLd],
    body: `
<section class="hero">
  <div class="wrap hero-in">
    <div class="hero-copy">
      <p class="eyebrow"><span class="dot"></span>사이드프로젝트 수익 도전 모임</p>
      <h1>사이드프로젝트,<br>12주 동안 함께<br><em>첫 매출까지</em></h1>
      <p class="lead">마이챌린지(마챌)는 혼자 미뤄 온 사이드프로젝트를 관심사가 비슷한 사람들과 그룹으로 실행하는 모임입니다. 매주 15분 체크인으로 진행을 확인하고, 번 돈은 시작 전에 서명한 합의서대로 나누며, 끝나면 결과를 프로젝트 페이퍼로 남깁니다.</p>
      <div class="hero-actions"><a class="btn btn-primary btn-lg" href="/apply/">가입 신청하기</a><a class="btn btn-line btn-lg" href="/how-it-works/">12주 운영 방식 보기</a></div>
      <p class="round-note" data-live="round" hidden></p>
      <ul class="hero-facts"><li><b>12주</b>한 라운드</li><li><b>4~8명</b>한 그룹</li><li><b>15분</b>주간 체크인</li></ul>
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
    <div class="sec-head"><p class="eyebrow">마챌이 하는 일과 하지 않는 일</p><h2>돈 버는 법을 파는 곳이 아니라,<br>벌어 보려는 사람들이 실행하는 곳입니다</h2></div>
    <div class="do-dont">
      <div class="do"><h3>하는 일</h3><ul class="checks">
        <li>관심사와 쓸 수 있는 시간이 맞는 사람끼리 그룹을 만듭니다</li>
        <li>매주 체크인과 완료 기록으로 진행을 눈에 보이게 합니다</li>
        <li>합의서, 장부, 정산표를 홈페이지에서 함께 관리합니다</li>
        <li>세미나·마챌데이·오피스아워로 막힌 곳을 같이 풉니다</li>
        <li>잘된 프로젝트도, 멈춘 프로젝트도 페이퍼로 남깁니다</li>
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
    <div class="sec-head row"><div><p class="eyebrow">12주 라운드</p><h2>한 분기에 한 번, 시작과 끝이 있는 실행</h2></div><a class="more" href="/how-it-works/">운영 방식 자세히</a></div>
    ${timeline}
  </div>
</section>

<section class="sec sec-tint">
  <div class="wrap two-col">
    <div>
      <p class="eyebrow">수익 배분</p>
      <h2>돈과 소유는 시작 전에 정합니다</h2>
      <p>그룹 프로젝트가 깨지는 건 대개 돈이 들어온 뒤입니다. 마챌은 배분 순서와 비율, 소유권, 예산 상한을 합의서에 적고 그룹원 전원이 서명한 뒤에만 챌린지를 시작합니다. 비용을 낸 사람이 먼저 돌려받고, 그다음에 몫을 나눕니다.</p>
      <p>손실이 나면 각자 낸 분담금만큼으로 끝나고, 누구에게도 추가 부담을 지우지 않습니다.</p>
      <p><a class="more" href="/rules/">수익 배분 규칙 전체 보기</a></p>
    </div>
    <div class="panel">${waterfall}</div>
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <div class="sec-head row"><div><p class="eyebrow">회원 등급</p><h2>등급은 돈이 아니라 실행 기록으로 오릅니다</h2></div><a class="more" href="/levels/">등급과 포인트 안내</a></div>
    ${ladder}
  </div>
</section>

<section class="sec sec-stats" data-live="stats" hidden>
  <div class="wrap">
    <div class="sec-head"><p class="eyebrow">있는 그대로의 숫자</p><h2>성공한 사례만 골라 보여 주지 않습니다</h2></div>
    <div class="stat-row">
      <div><b data-stat="members">-</b><span>활동 회원</span></div>
      <div><b data-stat="active_challenges">-</b><span>진행 중인 챌린지</span></div>
      <div><b data-stat="first_sales">-</b><span>첫 매출을 낸 회원</span></div>
      <div><b data-stat="papers">-</b><span>공개된 프로젝트 페이퍼</span></div>
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
    <div class="faq">${[FAQ[0][1][0], FAQ[0][1][3], FAQ[2][1][3], FAQ[2][1][0], FAQ[3][1][0]].map(faqItem).join('')}</div>
    <p class="center"><a class="more" href="/faq/">질문 전체 보기</a></p>
  </div>
</section>

${h.cta('지원서는 10분이면 씁니다', '신청서를 보내면 운영본부가 3일 안에 확인하고 초대 코드를 보내 드립니다. 첫 달은 라운드를 지켜보는 것부터 시작해도 됩니다.')}
`,
  });

  // ── 소개
  const aboutCrumbs = [['홈', '/'], ['마챌 소개', '/about/']];
  pages.push({
    path: '/about/', slug: 'about',
    title: '마이챌린지(마챌) 소개: 왜 만들었고 무엇을 하는가',
    description: '마이챌린지(마챌)는 사이드프로젝트를 혼자 미루던 사람들이 그룹으로 실행하고 결과를 숫자로 남기는 모임입니다. 만든 이유, 세 가지 원칙, 하는 일과 하지 않는 일, 운영본부의 역할을 소개합니다.',
    crumbs: aboutCrumbs,
    jsonld: [base => ({ '@context': 'https://schema.org', '@type': 'AboutPage', name: '마이챌린지(마챌) 소개', url: base + '/about/', about: { '@id': base + '/#org' } }), orgLd],
    body: `${h.pageHero('마챌 소개', '각자의 챌린지를, 함께 끝까지', '마이챌린지는 "내 도전"이라는 뜻입니다. 모임의 주인공은 운영자나 강사가 아니라 각자의 프로젝트를 가진 회원입니다.', aboutCrumbs)}
<div class="wrap article-layout">
<article class="prose">
<h2 id="why">왜 만들었나</h2>
<p>사이드프로젝트를 하려는 사람은 늘고 있습니다. 통계청 마이크로데이터를 분석한 보도를 보면 2024년 2분기 부업을 한 취업자는 월평균 67만 6천 명으로 집계 이후 가장 많았고, 그 흐름은 2025년에도 이어졌습니다. 중소벤처기업부 조사에서 1인 창조기업은 2023년 기준 116만 개를 넘었습니다.</p>
<p>그런데 사람이 늘어나는 만큼 어려움도 비슷하게 반복됩니다. 혼자 하다 보면 몇 주 안에 멈추고, 같이 하자니 돈과 역할 문제로 틀어질까 걱정됩니다. 그 틈을 고액 부업 강의가 파고듭니다. 한국소비자원에 접수된 고액 온라인 부업 강의 피해구제 신청은 2024년 11건에서 2025년 42건으로 늘었고, 결제 금액은 대부분 100만~400만 원이었습니다.</p>
<p>마이챌린지는 이 세 가지 문제, 즉 <b>혼자 하면 멈추는 문제, 함께하면 돈으로 다투는 문제, 불안을 파는 시장</b>에 대한 답으로 만들었습니다. 강의를 파는 대신 실행할 구조를 만들고, 다툼을 사람 사이의 선의에 맡기는 대신 규칙과 기록으로 정합니다.</p>

<h2 id="principles">세 가지 원칙</h2>
<div class="principles">
  <div><b>① 수익을 보장하지 않습니다</b><p>마챌은 돈을 벌게 해 주는 곳이 아니라 벌어 보려는 사람들이 모여 실행하는 곳입니다. 대신 과정과 결과를 숫자로 공개합니다. 매출 없이 끝난 챌린지와 멈춘 챌린지도 함께 공개합니다.</p></div>
  <div><b>② 실행한 사람이 발언합니다</b><p>조언보다 기록이 먼저입니다. 계획이 아니라 이번 주에 끝낸 일을 적고, 그 기록이 발언권과 등급, 수익 배분의 근거가 됩니다.</p></div>
  <div><b>③ 돈과 소유는 시작 전에 합의합니다</b><p>그룹 챌린지는 배분 비율과 소유권, 역할, 예산 상한을 합의서로 적고 전원이 서명한 뒤에만 시작합니다. 정한 대로 나눕니다.</p></div>
</div>
<p>모임 안에서는 이 세 가지를 조금 더 풀어 쓴 일곱 가지 원칙을 함께 읽습니다. 작게 만들고 빨리 팔아 본다, 본업을 지킨다(근무시간과 회사 자료는 쓰지 않는다), 먼저 간 사람이 기록을 남긴다, 이 안에서 서로에게 팔지 않는다는 내용이 더해집니다.</p>

<h2 id="what">하는 일과 하지 않는 일</h2>
<div class="table-wrap"><table>
  <thead><tr><th>마챌이 하는 일</th><th>마챌이 하지 않는 일</th></tr></thead>
  <tbody>
    <tr><td>관심사와 시간이 맞는 사람끼리 그룹을 만든다</td><td>수익을 보장하거나 금액을 약속한다</td></tr>
    <tr><td>12주 라운드를 운영하고 매주 체크인을 연다</td><td>고액 강의·코칭 상품을 판다</td></tr>
    <tr><td>합의서·장부·정산표를 함께 관리하는 도구를 제공한다</td><td>회원에게서 출자금이나 투자금을 받는다</td></tr>
    <tr><td>챌린지 제안을 심사하고 정산을 검수한다</td><td>회원 대신 만들거나 대신 판다</td></tr>
    <tr><td>세미나·마챌데이·데모데이·오피스아워를 연다</td><td>회원 사이의 투자 권유, 다단계, 외부 유료 강의 모집을 허용한다</td></tr>
  </tbody>
</table></div>

<h2 id="who">어떤 사람들이 모이나</h2>
<p>회사에 다니면서 퇴근 후와 주말을 쓰는 직장인, 본업과 별개로 자기 상품을 만들어 보려는 프리랜서, 가게 밖에서 새로운 매출을 찾는 자영업자가 중심입니다. 처음부터 큰 사업을 하려는 사람보다, 12주 안에 모르는 사람에게 한 번 팔아 보는 것을 목표로 삼는 사람에게 잘 맞습니다.</p>
<p>회원의 프로젝트는 콘텐츠·미디어, 디지털 상품, 커머스, 서비스·프리랜싱, 공간·오프라인, 웹·앱·자동화의 여섯 분야로 나눠 관리합니다.</p>

<h2 id="hq">운영본부가 하는 일</h2>
<p>운영본부는 운영자와 위촉된 운영진으로 이루어집니다. 가입 신청 확인, 챌린지 제안 심사, 합의서 승인, 정산 검수, 프로젝트 페이퍼 검토, 승급 심사, 분쟁 조정을 맡습니다. 심사와 검수는 홈페이지의 운영 화면에서 처리하고, 모든 결정은 감사 기록으로 남깁니다.</p>
<p>그룹 챌린지에서 운영본부가 받는 몫(기본 10%, 범위 5~15%)은 홈페이지와 정산 도구, 모임 공간, 세미나와 오피스아워, 심사·검수 인력에 대한 대가입니다. 받은 몫의 합계와 쓴 곳은 분기마다 공개합니다.</p>
${SITE.operator.company ? `<p class="small muted">운영 주체: ${esc(SITE.operator.company)}${SITE.operator.ceo ? ` (대표 ${esc(SITE.operator.ceo)})` : ''}</p>` : ''}

<h2 id="name">이름에 대하여</h2>
<p>'마이챌린지'에는 내 도전, 내 프로젝트라는 뜻을 담았습니다. 이름에서 '부업'이나 '수익' 같은 단어를 뺀 건 의도한 것입니다. 돈을 앞세운 이름은 지금 같은 때에 오히려 신뢰를 깎는다고 봤습니다. 줄여서 부르는 '마챌'은 '마챌데이', '마챌 페이퍼'처럼 붙여 쓰기 좋습니다.</p>
${h.sources([
  ['YTN 보도(2024.8.8), 2024년 2분기 부업 취업자 통계', 'https://www.ytn.co.kr/_ln/0102_202408081258409552', ''],
  ['헤럴드경제, 「1인 창조기업 116만개 돌파…매출 늘고 준비기간도 길어졌다」(2026.4.5)', 'https://www.heraldk.com/article/2026040519000044445', ''],
  ['뉴시스, 「고액 지불 후 저품질·환급 거부·연락두절」(2026.2.13)', 'https://mobile.newsis.com/view/NISX20260213_0003515702', '한국소비자원 분석'],
])}
</article>
<aside class="side">
  <div class="side-box"><b>더 알아보기</b><ul><li><a href="/how-it-works/">12주 운영 방식</a></li><li><a href="/rules/">수익 배분 규칙</a></li><li><a href="/levels/">등급과 포인트</a></li><li><a href="/faq/">자주 묻는 질문</a></li></ul></div>
  <div class="side-box side-cta"><b>함께해 볼까요?</b><p>신청서는 10분이면 씁니다.</p><a class="btn btn-primary" href="/apply/">가입 신청</a></div>
</aside>
</div>
${h.cta('각자의 챌린지를 함께 끝까지', '다음 라운드 모집을 기다리는 동안에도 세미나와 스터디에 먼저 참여할 수 있습니다.')}`,
  });

  // ── 운영 방식
  const howCrumbs = [['홈', '/'], ['운영 방식', '/how-it-works/']];
  pages.push({
    path: '/how-it-works/', slug: 'how-it-works',
    title: '12주 라운드 운영 방식: 제안부터 데모데이·정산까지',
    description: '마이챌린지 그룹 챌린지는 12주 라운드로 운영합니다. 챌린지 제안과 심사, 합의서 서명, 주간 체크인과 완료 기록, 4·7·8·12주 마일스톤, 데모데이와 프로젝트 페이퍼, 정산까지 순서대로 설명합니다.',
    crumbs: howCrumbs,
    body: `${h.pageHero('운영 방식', '12주 라운드는 이렇게 흘러갑니다', '마챌의 모든 그룹 챌린지는 한 분기 길이의 라운드 안에서 시작하고, 점검하고, 정산합니다. 라운드는 1년에 네 번 열립니다.', howCrumbs)}
<div class="wrap article-layout">
<article class="prose">
<nav class="toc" aria-label="이 페이지의 내용"><b>이 페이지의 내용</b><ol><li><a href="#overview">한눈에 보기</a></li><li><a href="#types">챌린지의 세 종류</a></li><li><a href="#propose">제안과 심사</a></li><li><a href="#team">그룹 구성</a></li><li><a href="#agreement">합의서</a></li><li><a href="#weekly">매주 하는 일</a></li><li><a href="#milestones">마일스톤</a></li><li><a href="#end">데모데이·페이퍼·정산</a></li><li><a href="#stop">멈출 때와 나갈 때</a></li></ol></nav>

<h2 id="overview">한눈에 보기</h2>
${timeline}

<h2 id="types">챌린지의 세 종류</h2>
<div class="table-wrap"><table>
  <thead><tr><th>종류</th><th>누가 하나</th><th>마챌이 주는 것</th></tr></thead>
  <tbody>
    <tr><td><b>솔로 챌린지</b></td><td>챌린저(L1) 이상 누구나, 혼자</td><td>체크인·완료 기록·페이퍼 양식, 피드백</td></tr>
    <tr><td><b>그룹 챌린지</b></td><td>리더(L4)가 제안하고 메이커(L2) 이상이 그룹원으로 참여</td><td>위 항목에 더해 그룹 공간, 장부·정산 도구, 오피스아워, 노출</td></tr>
    <tr><td><b>오피셜 챌린지</b></td><td>운영본부가 만들고 그룹이 운영</td><td>위 항목에 더해 비용, 브랜드, 명의, 위험 부담</td></tr>
  </tbody>
</table></div>

<h2 id="propose">제안과 심사</h2>
<p>그룹 챌린지는 리더(L4) 이상 회원이 제안합니다. 제안서에는 풀려는 불편, 만들 상품, 첫 매출 계획, 배분 유형, 소유 유형을 적습니다. 운영본부는 아래 여섯 항목을 1~5점으로 매기고 가중치를 곱해 더합니다.</p>
<div class="table-wrap"><table>
  <thead><tr><th>심사 항목</th><th class="num">가중치</th><th>보는 것</th></tr></thead>
  <tbody>
    <tr><td>그룹 자산 활용</td><td class="num">×2</td><td>그룹원들이 이미 가진 기술·경험·채널을 쓰는가</td></tr>
    <tr><td>불편의 실체</td><td class="num">×2</td><td>사람들이 실제로 돈이나 시간을 쓰고 있는 문제인가</td></tr>
    <tr><td>첫 매출 속도</td><td class="num">×1.5</td><td>12주 안에 외부 고객에게 팔아 볼 수 있는가</td></tr>
    <tr><td>쌓이는 정도</td><td class="num">×1.5</td><td>고객·콘텐츠·노하우처럼 다음 판매를 돕는 것이 남는가</td></tr>
    <tr><td>초기 비용</td><td class="num">×1</td><td>잃어도 되는 돈으로 시작할 수 있는가</td></tr>
    <tr><td>역할 분담</td><td class="num">×1</td><td>제작·판매·회계를 나눠 맡을 수 있는가</td></tr>
  </tbody>
</table></div>
<p>만점은 45점이고 <b>${D.review_pass_score}점 이상</b>이면서 금지 유형이 아니고 이해충돌이 없으면 승인합니다. 점수와 함께 보완 의견을 돌려드리며, 보완한 뒤 다시 낼 수 있습니다.</p>
<p>투자·금융 상품 중개, 다단계·방문판매 조직, 자격이 필요한 서비스의 무자격 제공, 성인·도박 콘텐츠, 타인 저작물 무단 이용, 시간을 파는 단순 노동형, 인허가 없이 할 수 없는 업종, 수익 보장을 내세운 강의·코칭 판매는 받지 않습니다.</p>

<h2 id="team">그룹 구성</h2>
<p>그룹은 그룹장을 포함해 4~8명입니다. 모집이 열리면 메이커(L2) 이상 회원이 짧은 지원 메모와 함께 지원하고, 그룹장이 쓸 수 있는 시간과 관심사를 보고 그룹원을 고릅니다. 그룹원으로는 한 번에 한 그룹에만 참여할 수 있습니다.</p>
<p>그룹 안에서는 역할을 나눕니다. 그룹장 외에 회계, 기록, 제작, 마케팅·판매, 일반 참여 중에서 맡을 역할을 정하고, 이 역할은 나중에 기여율을 계산할 때 가중치로 쓰입니다.</p>

<h2 id="agreement">합의서</h2>
<p>모집이 끝나면 그룹장이 합의서를 씁니다. 합의서에는 배분 유형과 비율, 소유 유형(A·B·C), 역할과 예정 기여율, 예산 상한, 매출을 받을 명의가 들어갑니다. 그룹원 전원이 조항을 읽고 서명하면 운영본부가 검토해 승인하고, 승인되는 순간 합의서는 잠기고 챌린지가 시작됩니다.</p>
<p>규칙이 부딪히면 법령, 챌린지 합의서, 마챌 운영 규칙, 운영본부 결정 순으로 따릅니다. 합의서는 마챌 규칙보다 회원에게 불리하게 정할 수 없고, 규칙이 바뀌어도 이미 진행 중인 챌린지에는 소급하지 않습니다. 자세한 배분 규칙은 <a href="/rules/">수익 배분과 합의서 규칙</a>에 있습니다.</p>

<h2 id="weekly">매주 하는 일</h2>
<div class="cards-3">
  <div class="mini"><b>주간 체크인</b><p>지난주에 끝낸 것, 이번 주에 끝낼 것, 막힌 점, 쓴 시간을 적습니다. 15분이면 끝납니다.</p></div>
  <div class="mini"><b>완료 기록</b><p>끝낸 일을 한 줄과 링크로 남기면 그룹장이 확인합니다. 수정은 안 되고 취소만 됩니다.</p></div>
  <div class="mini"><b>장부</b><p>매출과 비용, 분담금, 선지원을 증빙 링크와 함께 적습니다. 증빙 없는 지출은 정산에 넣지 않습니다.</p></div>
</div>
<p>체크인 진행 요령은 ${guideLink('weekly-checkin')}에 따로 정리했습니다.</p>

<h2 id="milestones">마일스톤</h2>
<div class="table-wrap"><table>
  <thead><tr><th>주차</th><th>마일스톤</th><th>무엇을 하나</th></tr></thead>
  <tbody>
    <tr><td>4주</td><td>선언</td><td>1페이지 계획을 마챌데이에서 공개합니다</td></tr>
    <tr><td>7주</td><td>첫 공개</td><td>바깥사람이 볼 수 있는 결과물을 처음 내놓습니다</td></tr>
    <tr><td>8주</td><td>교차 피드백</td><td>다른 그룹과 결과물을 바꿔 보고 의견을 주고받습니다</td></tr>
    <tr><td>12주</td><td>데모데이</td><td>결과를 발표하고 다음 계획을 이야기합니다</td></tr>
  </tbody>
</table></div>

<h2 id="end">데모데이, 페이퍼, 정산</h2>
<p>12주차 데모데이에서 결과를 발표한 뒤에는 프로젝트 페이퍼를 냅니다. 장부와 체크인 기록을 바탕으로 숫자 항목이 미리 채워진 양식에서 시작하고, 운영본부가 검토해 승인합니다. 쓰는 법은 ${guideLink('project-paper')}에 있습니다.</p>
<p>정산은 그룹장이 정산표를 만들면 그룹원 전원이 확인하거나 이의를 내고, 운영본부가 검수한 뒤 지급합니다. 프로젝트 페이퍼가 승인되어야 지급이 이뤄집니다. 이의가 있으면 다툼이 없는 금액은 먼저 지급하고, 이의를 낸 사람의 몫만 보류한 채 조정합니다.</p>

<h2 id="stop">멈출 때와 나갈 때</h2>
<p>8주차까지 첫 공개가 없거나 그룹원 과반이 원하면 운영본부와 협의해 챌린지를 멈춥니다. 멈춰도 프로젝트 페이퍼는 냅니다. 어디서 멈췄는지가 다음 사람에게 가장 쓸모 있는 기록이 되기도 합니다.</p>
<p>그룹원이 나가려면 2주 전에 알립니다. 그 시점까지의 실제 기여율로 라운드 말 정산에 포함되고, 낸 분담금은 정해진 순서대로 돌려받습니다. 3주 연속 체크인에 나오지 않고 연락이 끊기면 무단 이탈로 보고 기여율의 50%만 반영합니다.</p>
</article>
<aside class="side">
  <div class="side-box"><b>함께 읽기</b><ul><li>${guideLink('first-sale-12-weeks')}</li><li>${guideLink('weekly-checkin')}</li><li>${guideLink('why-group')}</li></ul></div>
  <div class="side-box side-cta"><b>다음 라운드에 참여하기</b><p>가입 신청 후 챌린저부터 시작합니다.</p><a class="btn btn-primary" href="/apply/">가입 신청</a></div>
</aside>
</div>
${h.cta('12주 동안 한 번, 끝까지 가 보기', '혼자 미뤄 둔 프로젝트가 있다면 다음 라운드에서 그룹으로 시작해 보세요.')}`,
  });

  // ── 수익 배분 규칙
  const rulesCrumbs = [['홈', '/'], ['수익 배분 규칙', '/rules/']];
  const presetRows = Object.values(P).map(p => `<tr><td><b>${p.label}</b></td><td class="num">${pct(p.hq)}</td><td class="num">${pct(p.leader)}</td><td class="num">${pct(p.pool)}</td><td>${esc(p.desc)}</td></tr>`).join('');
  pages.push({
    path: '/rules/', slug: 'rules',
    title: '수익 배분과 합의서 규칙: 배분 순서, 비율, 소유권, 정산',
    description: '마이챌린지 그룹 챌린지의 돈 규칙입니다. 외부 매출과 순수익의 정의, 비용 회수부터 시작하는 배분 순서, 네 가지 배분 유형, 기여율 계산, 소유권 A·B·C, 예산 상한과 정산 조건을 정리했습니다.',
    crumbs: rulesCrumbs,
    body: `${h.pageHero('수익 배분 규칙', '돈과 소유는 시작 전에 합의합니다', '아래 규칙은 홈페이지의 정산 계산기에 그대로 들어가 있습니다. 운영본부가 기준값을 바꾸면 다음 라운드부터 적용하고, 진행 중인 챌린지에는 소급하지 않습니다.', rulesCrumbs)}
<div class="wrap article-layout">
<article class="prose">
<div class="callout"><strong>먼저 밝혀 둡니다</strong><p>마이챌린지는 수익을 보장하지 않습니다. 회원에게서 출자금이나 투자금을 받지 않고, 원금이나 수익을 약속하지 않습니다. 배분하는 돈은 그룹이 실제로 판 상품의 순수익뿐이며, 이 원칙은 모든 합의서의 첫 조항에 들어갑니다.</p></div>

<h2 id="terms">용어</h2>
<div class="table-wrap"><table>
  <thead><tr><th>용어</th><th>정의</th></tr></thead>
  <tbody>
    <tr><td>외부 매출</td><td>외부 고객이 실제로 결제한 금액 합계. 부가세 제외, 환불 차감</td></tr>
    <tr><td>내부 매출</td><td>회원·가족·지인 매출. 장부에는 적지만 배분과 성과 인증에서 뺍니다</td></tr>
    <tr><td>직접 비용</td><td>재료비, 플랫폼 수수료, 광고비, 도메인·도구 구독료, 배송비, 샘플 등. 분담금·선지원으로 낸 비용 포함</td></tr>
    <tr><td>인정하지 않는 비용</td><td>개인 장비, 식비·교통비, 본인 인건비, 증빙 없는 지출</td></tr>
    <tr><td>순수익</td><td>외부 매출 − 직접 비용. 배분의 출발점</td></tr>
    <tr><td>배분 가능액</td><td>순수익 − 분담금 회수 − 선지원 회수 − 대행 수수료 + 이월액</td></tr>
  </tbody>
</table></div>

<h2 id="order">배분 순서</h2>
<p>비용을 낸 사람이 먼저 돌려받고, 그다음에 몫을 나눕니다. 순서는 바꾸지 않습니다.</p>
<div class="panel">${waterfall}</div>

<h2 id="presets">배분 유형</h2>
<div class="table-wrap"><table>
  <thead><tr><th>유형</th><th class="num">운영본부</th><th class="num">그룹장</th><th class="num">그룹원 풀</th><th>언제 쓰나</th></tr></thead>
  <tbody>${presetRows}</tbody>
</table></div>
<ul>
  <li>운영본부 몫은 오피셜형을 빼면 ${pct(D.hq_ratio_range[0])}~${pct(D.hq_ratio_range[1])} 범위에서만 정할 수 있습니다. 홈페이지가 범위를 벗어난 합의서를 저장하지 못하게 막습니다.</li>
  <li>균등형은 그룹장도 그룹원 풀에 들어가 기여율대로 나눕니다.</li>
  <li>그룹 순수익이 0 이하라면 운영본부 몫도 없습니다. 받은 몫의 합계와 쓴 곳(사례집과 쇼케이스, 세미나 강사비·오피스아워 수당, 홈페이지 운영, 다음 라운드 선지원)은 분기마다 공개합니다.</li>
</ul>

<h2 id="hq-report">운영본부 몫과 쓰임</h2>
<div data-live="hq"><p>운영본부가 정산에서 받은 몫과 정산 대행 수수료, 그 돈을 어디에 썼는지를 분기마다 이 자리에 공개합니다. 첫 정산이 끝나기 전이라 아직 공개할 숫자가 없습니다.</p></div>

<h2 id="contribution">기여율</h2>
<p>그룹원 풀은 실제 기여율대로 나눕니다. 기여율 초안은 그룹장이 확인한 완료 기록에 역할별 가중치를 곱해 홈페이지가 자동으로 만듭니다.</p>
<div class="table-wrap"><table>
  <thead><tr><th>역할</th><th class="num">가중치</th></tr></thead>
  <tbody><tr><td>회계</td><td class="num">1.2</td></tr><tr><td>제작</td><td class="num">1.15</td></tr><tr><td>마케팅·판매</td><td class="num">1.15</td></tr><tr><td>기록</td><td class="num">1.1</td></tr><tr><td>그룹장 · 일반 참여</td><td class="num">1.0</td></tr></tbody>
</table></div>
<p>그룹장은 초안을 사람마다 ±${Math.round(D.share_adjust_limit * 100)}%p 안에서 조정할 수 있습니다. 합의서에 적은 예정 기여율과 ${Math.round(D.share_alert_gap * 100)}%p 이상 차이가 나면 운영본부에 알림이 가고, 운영본부가 근거를 확인합니다.</p>

<h2 id="ownership">소유권</h2>
<div class="table-wrap"><table>
  <thead><tr><th>유형</th><th>내용</th><th>어울리는 경우</th></tr></thead>
  <tbody>
    <tr><td><b>A형</b> 그룹 공동 소유</td><td>상품·채널·고객 목록을 그룹이 함께 소유합니다</td><td>아이디어와 제작을 그룹이 처음부터 함께 했을 때</td></tr>
    <tr><td><b>B형</b> 그룹장 소유</td><td>그룹장이 소유하고, 마챌은 사례 소개 사용권을 가집니다. 라운드 후 배분 방식을 합의서에 적습니다</td><td>그룹장이 이미 가진 채널·브랜드·거래처 위에 쌓을 때</td></tr>
    <tr><td><b>C형</b> 마챌 소유</td><td>마챌이 소유하고 마챌 이름과 로고를 씁니다</td><td>오피셜 챌린지</td></tr>
  </tbody>
</table></div>
<p>소유 유형이 없는 합의서로는 시작하지 않습니다. 어떤 유형이든 마챌은 페이퍼와 사례집, 쇼케이스에 프로젝트명·이미지·공개 숫자를 소개할 수 있고(비공개로 지정한 숫자는 빼고), 만든 사람의 포트폴리오 사용권은 보장합니다.</p>

<h2 id="budget">예산과 비용</h2>
<ul>
  <li>예산 상한 기본값은 그룹원 1인 ${won(D.budget_cap_person)}, 그룹 합계 ${won(D.budget_cap_group)}입니다. 넘기려면 전원 동의와 운영본부 승인이 필요합니다.</li>
  <li>잃어도 되는 돈으로만 합니다. 대출, 카드 할부, 회원 간 금전 대여로 비용을 대지 않습니다.</li>
  <li>모든 지출은 그룹장 승인을 거쳐 증빙과 함께 장부에 적습니다.</li>
  <li>순수익이 0 이하라면 배분은 없습니다. 분담금은 돌려받지 못하고 운영본부 선지원도 회수하지 않으며, 손실은 각자 낸 만큼으로 끝납니다.</li>
</ul>

<h2 id="settlement">정산</h2>
<ul>
  <li>매출은 기본적으로 그룹장 명의로 받습니다. 매출이 크거나 오래 갈 그룹은 동업계약서로 공동사업자 등록을 검토하고, 사업자가 없으면 마챌이 매출 수취와 지급을 대신 맡을 수 있습니다(대행 수수료 ${pct(D.agency_rate)}).</li>
  <li>배분 가능액이 ${won(D.min_settlement)} 미만이면 다음 정산으로 이월합니다.</li>
  <li>프로젝트 페이퍼가 승인되어야 지급합니다.</li>
  <li>정산표에는 지급액마다 ${(D.withholding_rate * 100).toFixed(1)}% 원천징수 참고액을 표시합니다. 세금 처리는 ${guideLink('side-income-tax')}을 참고하세요.</li>
  <li>그룹원 전원이 정산표를 확인한 뒤 운영본부가 검수합니다. 이의가 있으면 다툼이 없는 금액은 먼저 지급하고, 다투는 몫만 보류합니다.</li>
</ul>

<h2 id="disputes">이견이 생기면</h2>
<div class="table-wrap"><table>
  <thead><tr><th>단계</th><th>누가</th><th>어떻게</th><th>기한</th></tr></thead>
  <tbody>
    <tr><td>1차</td><td>그룹 안</td><td>그룹장이 회의를 열어 합의서와 기록을 근거로 조정합니다. 그룹장이 당사자면 회계 담당이 진행합니다</td><td>7일</td></tr>
    <tr><td>2차</td><td>운영본부</td><td>서면 신청을 받아 양측 의견과 체크인·장부·합의서 기록을 검토하고 조정안을 냅니다. 운영진 2명 이상이 참여합니다</td><td>14일</td></tr>
    <tr><td>3차</td><td>외부</td><td>조정안을 받아들이지 않으면 당사자 간 외부 조정이나 법적 절차로 갑니다. 운영본부는 가진 기록을 양측에 똑같이 제공합니다</td><td>-</td></tr>
  </tbody>
</table></div>
</article>
<aside class="side">
  <div class="side-box"><b>함께 읽기</b><ul><li>${guideLink('profit-sharing')}</li><li>${guideLink('side-income-tax')}</li><li>${guideLink('why-group')}</li></ul></div>
  <div class="side-box"><b>규칙 적용 순서</b><p class="small">법령 → 챌린지 합의서 → 마챌 운영 규칙 → 운영본부 결정. 합의서는 이 규칙보다 회원에게 불리하게 정할 수 없습니다.</p></div>
</aside>
</div>
${h.cta('규칙이 먼저 있어서 함께할 수 있습니다', '돈 이야기를 시작 전에 끝내 두면 나머지 11주는 만드는 데 쓸 수 있습니다.')}`,
  });

  // ── 등급과 포인트
  const levelsCrumbs = [['홈', '/'], ['등급과 포인트', '/levels/']];
  const pts = Object.entries(D.points).sort((a, b) => b[1].points - a[1].points);
  pages.push({
    path: '/levels/', slug: 'levels',
    title: '회원 등급과 활동 포인트: 챌린저부터 마스터까지',
    description: '마이챌린지 회원 등급은 돈으로 살 수 없고 실행 기록으로만 오릅니다. 게스트(L0)부터 마스터(L5)까지 각 등급의 조건과 할 수 있는 일, 활동 포인트 기준과 하루 상한을 정리했습니다.',
    crumbs: levelsCrumbs,
    body: `${h.pageHero('등급과 포인트', '등급은 실행 기록으로 오릅니다', '등급을 돈으로 사는 구조는 만들지 않습니다. 아래 기준은 운영본부가 조정할 수 있고, 바뀌면 이 페이지도 함께 바뀝니다.', levelsCrumbs)}
<div class="wrap article-layout" data-live="levels">
<article class="prose">
<h2 id="ladder">여섯 단계</h2>
<div class="table-wrap"><table class="lv-table">
  <thead><tr><th>등급</th><th>되는 방법</th><th>할 수 있는 것</th></tr></thead>
  <tbody>
    <tr><td><span class="lv lv-L0">L0</span> 게스트</td><td>가입 승인 직후</td><td>공지, 공개 페이퍼 요약. 오리엔테이션(원칙 3문항 확인)을 마치면 자동으로 챌린저가 됩니다</td></tr>
    <tr><td><span class="lv lv-L1">L1</span> 챌린저</td><td>오리엔테이션 이수</td><td>챌린지 보드, 세미나·스터디·마챌데이, 커피챗, 커뮤니티, 솔로 챌린지, 페이퍼 요약</td></tr>
    <tr><td><span class="lv lv-L2">L2</span> 메이커</td><td>활동 포인트 <b data-rule="L2.points">${D.levels.L2.points}</b>점, 자기 자산 진단 제출, 모임 <b data-rule="L2.require_event">${D.levels.L2.require_event}</b>회 참석, 가입 후 <b data-rule="L2.min_days">${D.levels.L2.min_days}</b>일. 조건을 채우면 <b>자동 승급</b></td><td>그룹 챌린지 그룹원 지원·참여, 품앗이 보드, 아카이브</td></tr>
    <tr><td><span class="lv lv-L3">L3</span> 어치버</td><td>라운드 1회 완주(데모데이 발표와 페이퍼 제출) 또는 첫 외부 매출 인증 → 신청과 심사</td><td>다른 그룹의 진행 기록과 장부 요약, 페이퍼 전문</td></tr>
    <tr><td><span class="lv lv-L4">L4</span> 리더</td><td>라운드 2회 완주와 리더 교육 이수, 운영본부 면담 → 신청과 심사</td><td>그룹 챌린지 제안과 운영, 그룹장 몫</td></tr>
    <tr><td><span class="lv lv-L5">L5</span> 마스터</td><td>그룹장으로 성공 챌린지 2건 또는 반복 매출 → 신청과 심사</td><td>챌린지 심사·멘토링 참여, 오피셜 챌린지 공동 설계</td></tr>
  </tbody>
</table></div>
<p>L3부터는 신청을 받아 운영본부가 7일 안에 심사하고, 보류하거나 반려할 때는 사유를 적어 알려 드립니다.</p>

<h2 id="points">활동 포인트</h2>
<p>포인트는 메이커(L2) 승급 조건으로 쓰이고, 분기마다 새로 셉니다. 활동마다 하루 적립 상한이 있어서 글을 많이 쓴다고 빨리 오르지는 않습니다. 포인트는 현금이나 상품으로 바꿀 수 없습니다.</p>
<div class="table-wrap"><table>
  <thead><tr><th>활동</th><th class="num">포인트</th><th class="num">하루 상한</th></tr></thead>
  <tbody data-live="points">${pts.map(([, v]) => `<tr><td>${esc(v.label)}</td><td class="num">${v.points}</td><td class="num">${v.daily_cap ? v.daily_cap + '회' : '없음'}</td></tr>`).join('')}</tbody>
</table></div>

<h2 id="badges">배지</h2>
<p>등급과 별도로 의미 있는 순간에 배지를 드립니다. 첫 매출, 반복 매출, 라운드 완주, 그룹장 완주, 페이퍼 기고, 창립 멤버, 강사·멘토 배지가 있습니다. 첫 매출 배지는 외부 고객의 결제를 증빙으로 확인한 뒤에만 드립니다.</p>

<h2 id="dormant">휴면과 복귀</h2>
<p>6개월 넘게 활동이 없으면 휴면으로 바뀝니다. 휴면 중에도 등급, 배지, 포인트 기록은 그대로 남고, 돌아오면 원래 등급으로 복원됩니다. 리더(L4) 이상은 복귀할 때 운영본부와 한 번 면담합니다.</p>
</article>
<aside class="side">
  <div class="side-box"><b>함께 읽기</b><ul><li><a href="/how-it-works/">12주 운영 방식</a></li><li><a href="/programs/">마챌 프로그램</a></li><li>${guideLink('side-project-start')}</li></ul></div>
  <div class="side-box side-cta"><b>챌린저부터 시작</b><p>신청 후 초대 코드로 가입하면 오리엔테이션을 거쳐 챌린저가 됩니다.</p><a class="btn btn-primary" href="/apply/">가입 신청</a></div>
</aside>
</div>`,
  });

  // ── 프로그램
  const progCrumbs = [['홈', '/'], ['프로그램', '/programs/']];
  const PROGRAMS = [
    ['마챌데이', '월 1회', 'L1 이상, 일부 게스트', '전체 회원이 모이는 정기 모임입니다. 그룹별로 5분씩 진행 상황을 나누고, 세미나나 회원 발표, 네트워킹이 이어집니다. 4주차 선언도 이 자리에서 합니다.'],
    ['그룹 챌린지 라운드', '분기 1회 (12주)', 'L2 이상 그룹원', '마챌의 중심 프로그램입니다. 관심사가 비슷한 4~8명이 그룹장과 함께 12주 동안 하나의 프로젝트를 실행합니다.'],
    ['데모데이', '라운드 마지막 주', '진행 그룹 발표, 회원 참관', '12주 동안 만든 것과 숫자, 배운 점을 발표합니다. 매출이 없어도, 중간에 멈췄어도 발표합니다.'],
    ['세미나', '수시', 'L1 이상', '실제로 해 본 사람을 강사로 초청해 상세 페이지, 가격, 첫 판매, 세금 같은 실무 주제를 다룹니다.'],
    ['분야 스터디', '수시', 'L1 이상', '여섯 분야별로 관심 있는 회원끼리 사례를 읽고 정리합니다. 그룹 챌린지를 준비하는 단계에서 함께할 사람을 찾는 자리이기도 합니다.'],
    ['커피챗', '매주', 'L1 이상', '다른 그룹, 다른 분야의 회원 두 명을 묶어 30분 동안 이야기합니다. 혼자서는 떠올리지 못한 조합이 여기서 나옵니다.'],
    ['오피스아워', '라운드당 2회', '진행 중인 그룹', '마스터나 외부 멘토가 그룹별로 30분씩 막힌 부분을 함께 봅니다.'],
    ['품앗이 보드', '상시', 'L2 이상', '디자인, 글, 세팅처럼 서로 가진 기술을 교환합니다. 금전 거래는 당사자끼리 따로 합니다.'],
    ['마챌 페이퍼(사례집)', '분기 1회', '누구나(공개 요약)', '라운드가 끝나면 프로젝트 페이퍼를 묶어 사례집으로 냅니다. 잘된 길과 멈춘 길을 함께 싣습니다.'],
  ];
  pages.push({
    path: '/programs/', slug: 'programs',
    title: '마챌 프로그램: 마챌데이, 그룹 챌린지, 데모데이, 세미나',
    description: '마이챌린지에서 열리는 프로그램을 소개합니다. 월 1회 마챌데이, 12주 그룹 챌린지 라운드, 데모데이, 실무 세미나, 분야 스터디, 커피챗, 오피스아워, 품앗이 보드, 분기 사례집.',
    crumbs: progCrumbs,
    body: `${h.pageHero('프로그램', '혼자서는 만들기 어려운 리듬을 만듭니다', '매주, 매월, 매 분기 돌아오는 프로그램이 사이드프로젝트에 마감과 동료를 만들어 줍니다.', progCrumbs)}
<section class="sec sec-tight"><div class="wrap">
  <div class="prog-grid">${PROGRAMS.map(([t, when, who, d]) => `<article class="prog"><h2>${t}</h2><p class="prog-meta"><span>${when}</span><span>${who}</span></p><p>${d}</p></article>`).join('')}</div>
</div></section>
<section class="sec sec-tint" data-live="events" hidden><div class="wrap narrow">
  <div class="sec-head"><p class="eyebrow">다가오는 일정</p><h2>이번 달 모임</h2></div>
  <ul class="event-list"></ul>
  <p class="small muted">출석 확인과 참가 신청은 회원 공간에서 합니다.</p>
</div></section>
${h.cta('다음 마챌데이에서 만나요', '가입하면 일정 게시판에서 모임 신청과 출석 확인을 할 수 있습니다.')}`,
  });

  // ── FAQ
  const faqCrumbs = [['홈', '/'], ['자주 묻는 질문', '/faq/']];
  pages.push({
    path: '/faq/', slug: 'faq',
    title: '자주 묻는 질문: 가입, 그룹 챌린지, 수익 배분, 회사·세금',
    description: '마이챌린지 가입 절차와 비용, 그룹 챌린지 참여 조건, 수익 배분과 손실 처리, 소유권, 회사 겸업과 세금, 결과 공개와 개인정보, 탈퇴까지 자주 묻는 질문을 모았습니다.',
    crumbs: faqCrumbs,
    jsonld: [faqLd],
    body: `${h.pageHero('자주 묻는 질문', '신청 전에 궁금한 것들', '찾는 답이 없다면 가입 신청서의 마지막 칸에 질문을 남겨 주세요. 운영본부가 확인할 때 함께 답해 드립니다.', faqCrumbs)}
<div class="wrap narrow faq-page">
${FAQ.map(([group, qs], i) => `<section class="faq-group" id="faq-${i + 1}"><h2>${group}</h2><div class="faq">${qs.map(faqItem).join('')}</div></section>`).join('')}
<p class="faq-links">더 자세한 내용: <a href="/how-it-works/">운영 방식</a> · <a href="/rules/">수익 배분 규칙</a> · <a href="/levels/">등급과 포인트</a> · ${guideLink('side-job-company-rules')} · ${guideLink('side-income-tax')} · <a href="/privacy/">개인정보처리방침</a></p>
</div>
${h.cta('궁금한 게 풀렸다면', '신청서는 10분이면 씁니다. 경력이나 실적은 심사 기준이 아닙니다.')}`,
  });

  // ── 가입 신청
  const applyCrumbs = [['홈', '/'], ['가입 신청', '/apply/']];
  const interestChecks = Object.entries(FIELDS).map(([k, v]) => `<label class="chk"><input type="checkbox" name="interests" value="${k}"><span>${v}</span></label>`).join('');
  pages.push({
    path: '/apply/', slug: 'apply',
    title: '가입 신청: 사이드프로젝트 모임 마이챌린지에 함께하기',
    description: '마이챌린지(마챌) 가입 신청 페이지입니다. 신청서를 보내면 운영본부가 3일 안에 확인하고 초대 코드를 이메일로 보내 드립니다. 경력이나 실적은 심사 기준이 아닙니다.',
    crumbs: applyCrumbs,
    body: `${h.pageHero('가입 신청', '마이챌린지 가입 신청', '솔직하게 적어 주세요. 경력이나 실적은 심사 기준이 아니고, 쓸 수 있는 시간과 함께하는 방식에 대한 생각을 봅니다.', applyCrumbs)}
<div class="wrap apply-layout">
<div class="apply-main">
  <p class="round-note" data-live="round" hidden></p>
  <ol class="apply-steps"><li><b>신청서 제출</b><span>10분</span></li><li><b>운영본부 확인</b><span>3일 안</span></li><li><b>초대 코드 이메일</b><span>승인 시</span></li><li><b>가입·오리엔테이션</b><span>5분</span></li></ol>
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
    </fieldset>
    <fieldset><legend>생각을 듣고 싶은 것</legend>
      <label class="f"><span>사이드프로젝트를 해 본 적이 있나요? 결과는 어땠나요?</span><textarea name="experience" rows="4" placeholder="해 본 적이 없어도 괜찮습니다. 없다면 해 보고 싶은 것을 적어 주세요."></textarea></label>
      <label class="f"><span>그룹으로 프로젝트를 하면 좋은 점과 걱정되는 점을 한 가지씩</span><textarea name="why_group" rows="3"></textarea></label>
      <label class="f"><span>그룹 챌린지 수익을 운영본부, 그룹장, 그룹원이 나누는 방식에 대해 어떻게 생각하시나요?</span><textarea name="share_opinion" rows="3"></textarea><small>정답은 없습니다. <a href="/rules/" target="_blank" rel="noopener">배분 규칙</a>을 보고 적어 주셔도 좋습니다.</small></label>
      <div class="f-row">
        <label class="f"><span>회사 규정상 겸업 제한이 있는지 확인하셨나요?</span><select name="side_job_check"><option value="">선택</option><option value="yes">확인했고 문제 없음</option><option value="partial">일부 제한이 있음 (가입 후 상의)</option><option value="no">아직 확인하지 않음</option><option value="na">해당 없음 (직장인이 아님)</option></select></label>
        <label class="f"><span>마챌데이·데모데이 같은 모임에 참석할 수 있나요?</span><select name="can_attend"><option value="">선택</option><option value="yes">대부분 참석 가능</option><option value="some">절반 정도</option><option value="no">당분간 온라인만</option></select></label>
      </div>
      <label class="f"><span>마챌에 줄 수 있는 것 한 가지</span><input name="give" placeholder="예: 디자인 피드백, 엑셀 정리, 사진 촬영, 모임 장소"></label>
      <label class="f"><span>운영본부에 묻고 싶은 것 (선택)</span><textarea name="question" rows="2"></textarea></label>
    </fieldset>
    <fieldset class="consent"><legend>동의</legend>
      <div class="privacy-summary">
        <b>개인정보 수집·이용 안내</b>
        <dl><dt>목적</dt><dd>가입 심사, 초대 코드 발송, 신청 관련 연락</dd><dt>항목</dt><dd>(필수) 이름, 이메일 (선택) 연락처, 추천인, 하는 일, 가능 시간, 관심 분야, 신청서 답변</dd><dt>보유 기간</dt><dd>가입하면 회원 정보로 옮겨 탈퇴 시까지, 가입하지 않으면 처리 후 6개월이 지나면 파기</dd></dl>
        <p>동의하지 않을 수 있으며, 이 경우 가입 신청을 할 수 없습니다. 자세한 내용은 <a href="/privacy/" target="_blank" rel="noopener">개인정보처리방침</a>을 확인해 주세요.</p>
      </div>
      <label class="chk chk-block"><input type="checkbox" name="consent_privacy" required><span>만 14세 이상이며, 위 개인정보 수집·이용에 동의합니다. <i>(필수)</i></span></label>
      <label class="chk chk-block"><input type="checkbox" name="consent_public" required><span>그룹 챌린지에 참여하면 매출 유무, 외부 고객 수 구간, 투입 시간이 프로젝트 페이퍼로 공개될 수 있다는 점에 동의합니다. <i>(필수)</i></span></label>
    </fieldset>
    <p class="form-msg" role="alert" aria-live="assertive"></p>
    <button class="btn btn-primary btn-lg btn-block" type="submit">신청서 보내기</button>
  </form>
  <div class="apply-done" hidden>
    <h2>신청서를 받았습니다</h2>
    <p>운영본부가 3일 안에 확인한 뒤 이메일로 초대 코드를 보내 드립니다. 코드를 받으면 <a href="/app/#/register">초대 코드로 가입</a>에서 계정을 만드세요.</p>
    <p>기다리는 동안 <a href="/guide/">가이드</a>를 읽어 보셔도 좋습니다.</p>
  </div>
</div>
<aside class="side apply-side">
  <div class="side-box"><b>신청 전에 확인해 주세요</b><ul class="checks small">
    <li>마챌은 수익을 보장하지 않습니다</li>
    <li>근무시간과 회사 자료는 쓰지 않습니다</li>
    <li>매주 15분 체크인에 참여할 수 있어야 합니다</li>
    <li>회원끼리 투자 권유, 다단계, 유료 강의 모집은 할 수 없습니다</li>
  </ul></div>
  <div class="side-box"><b>이미 초대 코드를 받았다면</b><p class="small">운영본부가 보낸 코드와 신청서에 적은 이메일로 가입하세요.</p><a class="btn btn-line" href="/app/#/register">초대 코드로 가입</a></div>
</aside>
</div>`,
  });

  // ── 가이드 목록
  const guideCrumbs = [['홈', '/'], ['가이드', '/guide/']];
  const byCat = Object.entries(CATEGORIES).map(([k, label]) => [k, label, GUIDES.filter(g => g.category === k)]).filter(([, , list]) => list.length);
  pages.push({
    path: '/guide/', slug: 'guide',
    title: '사이드프로젝트 가이드: 시작, 함께하기, 돈과 제도, 운영 노하우',
    description: '직장인 사이드프로젝트를 시작하는 법, 부업 아이디어 고르는 기준, 12주 첫 매출 계획, 그룹 수익 배분, 회사 겸업 규정, 부업 소득 세금, 고액 부업 강의 피해 예방까지 실행에 필요한 글을 모았습니다.',
    crumbs: guideCrumbs,
    jsonld: [base => ({ '@context': 'https://schema.org', '@type': 'CollectionPage', name: '마이챌린지 사이드프로젝트 가이드', url: base + '/guide/', mainEntity: { '@type': 'ItemList', itemListElement: GUIDES.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: `${base}/guide/${g.slug}/`, name: g.title })) } })],
    body: `${h.pageHero('가이드', '사이드프로젝트 가이드', '마챌 회원들이 실제로 막히는 지점을 중심으로 정리했습니다. 숫자가 들어간 글에는 출처를 밝혔습니다.', guideCrumbs)}
<div class="wrap">
  <nav class="cat-nav" aria-label="가이드 분류">${byCat.map(([k, label, list]) => `<a href="#cat-${k}">${label}<span>${list.length}</span></a>`).join('')}</nav>
  ${byCat.map(([k, label, list]) => `<section class="cat-sec" id="cat-${k}"><h2>${label}</h2><div class="g-grid">${list.map(guideCard).join('')}</div></section>`).join('')}
</div>
${h.cta('읽는 것보다 해 보는 게 빠릅니다', '다음 라운드에서 12주 동안 함께 실행해 보세요.')}`,
  });

  // ── 법적 고지
  pages.push(...legalPages());

  // ── 404
  pages.push({
    path: '/404.html', slug: '404', file: '404.html', noindex: true,
    title: '페이지를 찾을 수 없습니다',
    description: '요청한 페이지를 찾을 수 없습니다. 주소를 확인하거나 마이챌린지 홈에서 다시 찾아 주세요.',
    body: `<section class="notfound"><div class="wrap narrow center">
  <p class="eyebrow">404</p>
  <h1>페이지를 찾을 수 없습니다</h1>
  <p class="lead">주소가 바뀌었거나 없어진 페이지입니다. 아래에서 찾던 내용을 골라 주세요.</p>
  <div class="hero-actions center"><a class="btn btn-primary" href="/">마이챌린지 홈</a><a class="btn btn-line" href="/guide/">가이드</a><a class="btn btn-line" href="/app/#/dashboard">회원 공간</a></div>
</div></section>`,
  });

  return pages;
}
