import { fmtLocal, api, post, esc, nl2br, state, toast, go, field, input, textarea, select, check, bindForms, stat, num, fmtDate, LEVEL_NAMES, LEVELS, FIELDS, EVENT_TYPES, pageHead, empty } from '../core.js';

const PRINCIPLES = [
  ['수익을 보장하지 않습니다', '마챌은 돈을 벌게 해 주는 곳이 아니라, 벌어 보려는 사람들이 모여 실행하는 곳입니다. "보장"이라는 말은 쓰지 않습니다.'],
  ['실행한 사람이 발언합니다', '조언보다 기록이 먼저입니다. 이번 주에 무엇을 했는지가 발언권이 되고, 등급이 됩니다.'],
  ['돈과 소유는 시작 전에 합의합니다', '그룹 챌린지는 배분·소유·역할을 합의서로 적고 전원이 서명한 뒤에만 시작합니다.'],
];

export async function landing() {
  let stats = null, papers = [], events = [];
  try { [stats, papers, events] = await Promise.all([api('/public/stats'), api('/public/papers'), api('/public/events')]); } catch {}
  const me = state.me;
  return `
  <section class="hero"><div class="wrap hero-grid">
    <div>
      <div class="eyebrow">MY CHALLENGE · 사이드프로젝트 수익 도전 모임</div>
      <h1>혼자 고민하던 사이드프로젝트,<br>12주 안에 첫 매출까지</h1>
      <p class="lead">마이챌린지(마챌)는 공부만 하는 모임이 아닙니다. 같은 관심사의 사람들과 그룹을 짜고, 매주 체크인하며, 라운드가 끝나면 프로젝트 페이퍼로 결과를 남깁니다. 번 돈은 미리 합의한 규칙대로 나눕니다.</p>
      <div class="btn-row">
        ${me ? `<a class="btn primary lg" href="#/dashboard">내 대시보드로</a>` : `<a class="btn primary lg" href="#/apply">가입 신청하기</a><a class="btn lg" href="#/levels">어떻게 운영되나요?</a>`}
      </div>
    </div>
    <div class="hero-visual">
      <div class="mini-card"><div class="ic">1</div><div><b>관심사별 그룹 챌린지</b><small>그룹장 1명 + 그룹원 3~7명, 12주 라운드</small></div></div>
      <div class="mini-card"><div class="ic">2</div><div><b>매주 체크인 · 완료 기록</b><small>지난주 한 일, 이번 주 목표, 막힌 점 15분</small></div></div>
      <div class="mini-card"><div class="ic">3</div><div><b>합의서 기반 수익 배분</b><small>운영본부 10% · 그룹장 · 그룹원 풀, 시작 전에 서명</small></div></div>
      <div class="mini-card"><div class="ic">4</div><div><b>프로젝트 페이퍼 아카이브</b><small>잘된 것·안 된 것·숫자를 남겨 다음 사람이 배웁니다</small></div></div>
    </div>
  </div></section>

  <section class="section"><div class="wrap">
    <div class="principles">${PRINCIPLES.map(([t, d], i) => `<div class="principle"><b>원칙 ${i + 1}. ${t}</b><span>${d}</span></div>`).join('')}</div>
  </div></section>

  ${stats ? `<section class="section"><div class="wrap"><div class="grid grid-4">
    ${stat('활동 회원', num(stats.members))}${stat('진행 중인 챌린지', num(stats.active_challenges), true)}${stat('첫 매출을 낸 회원', num(stats.first_sales), true)}${stat('공개된 프로젝트 페이퍼', num(stats.papers))}
  </div><p class="muted small" style="margin-top:8px">종료된 챌린지 ${num(stats.closed.with_sales + stats.closed.without_sales + stats.closed.stopped)}건 중 매출 발생 ${num(stats.closed.with_sales)} · 매출 없이 종료 ${num(stats.closed.without_sales)} · 중단 ${num(stats.closed.stopped)}. 성공만 골라 보여 주지 않습니다.</p></div></section>` : ''}

  <section class="section"><div class="wrap">
    <div class="section-title"><h2>12주 라운드는 이렇게 흘러갑니다</h2><a href="#/levels">자세히</a></div>
    <div class="steps">
      <div class="step"><b>1~2주 · 제안과 모집</b><small>리더 등급이 챌린지를 제안하고 운영본부 심사를 거쳐 그룹원을 모읍니다.</small></div>
      <div class="step"><b>3주 · 합의서</b><small>배분 비율, 소유권, 역할, 예산 상한을 적고 전원이 서명하면 시작입니다.</small></div>
      <div class="step"><b>4~11주 · 실행</b><small>매주 체크인, 완료 기록, 장부 입력. 7주차엔 외부에 한 번은 공개합니다.</small></div>
      <div class="step"><b>12주 · 데모데이와 정산</b><small>결과를 발표하고 페이퍼를 제출한 뒤, 합의서대로 정산합니다.</small></div>
    </div>
  </div></section>

  <section class="section"><div class="wrap">
    <div class="section-title"><h2>등급은 실행 기록으로 오릅니다</h2><a href="#/levels">등급 안내</a></div>
    <div class="ladder">
      ${[['L1', '챌린저', '오리엔테이션을 마친 회원. 세미나·스터디·커피챗에 참여합니다.'], ['L2', '메이커', '활동 포인트 300점 + 자기 자산 진단. 그룹 챌린지에 그룹원으로 들어갑니다.'], ['L3', '어치버', '라운드 완주 또는 첫 외부 매출. 다른 그룹의 진행 기록과 페이퍼 전문을 봅니다.'], ['L4', '리더', '2회 완주 + 리더 교육. 그룹 챌린지를 직접 제안하고 이끕니다.'], ['L5', '마스터', '그룹장으로 성공 챌린지 2건. 심사와 멘토링에 참여합니다.']].map(([c, n, d]) => `<div class="rung"><div class="code lv-${c}">${c}</div><div><b>${n}</b><small>${d}</small></div></div>`).join('')}
    </div>
  </div></section>

  ${papers.length ? `<section class="section"><div class="wrap"><div class="section-title"><h2>최근 공개된 프로젝트 페이퍼</h2><a href="#/papers">전체 보기</a></div><div class="grid grid-3">${papers.slice(0, 3).map(p => paperCard(p)).join('')}</div></div></section>` : ''}

  ${events.length ? `<section class="section"><div class="wrap"><div class="section-title"><h2>다가오는 일정</h2></div><div class="card"><div class="list">${events.map(e => `<div class="list-item"><div class="grow"><div class="title">${esc(e.title)}</div><div class="meta">${EVENT_TYPES[e.type] || e.type} · ${fmtLocal(e.starts_at)}${e.location ? ' · ' + esc(e.location) : ''}</div></div><span class="chip">${LEVEL_NAMES[e.min_level]}부터</span></div>`).join('')}</div></div></div></section>` : ''}

  <section class="section"><div class="wrap"><div class="cta-band">
    <h2>지원서는 10분이면 씁니다</h2><p>신청 후 운영본부가 확인하고 초대 코드를 보내 드립니다. 첫 달은 라운드 참관부터 시작해도 됩니다.</p>
    ${me ? '' : `<a class="btn lg" href="#/apply">가입 신청하기</a>`}
  </div></div></section>`;
}

export function paperCard(p) {
  const s = p.summary || {};
  return `<a class="card clickable" href="#/papers/${p.id}"><div class="row" style="margin-bottom:6px"><span class="chip">${esc(p.field_name || '')}</span>${s.has_sales ? '<span class="chip green">매출 발생</span>' : '<span class="chip">매출 없음</span>'}</div><h3>${esc(p.title)}</h3><p class="muted small" style="margin:0">${esc(s.pain || '')}</p>${s.lesson ? `<div class="divider"></div><small>배운 점 · ${esc(s.lesson)}</small>` : ''}</a>`;
}

export async function levels() {
  const s = await api('/public/levels');
  const r = s.rules;
  const rows = [
    ['L0', '게스트', '가입 승인 직후', '오리엔테이션(원칙 3개 확인 + 동의)을 마치면 자동으로 챌린저가 됩니다.', '공지, 공개 페이퍼 요약'],
    ['L1', '챌린저', '오리엔테이션 이수', `활동 포인트 ${r.L2.points}점, 자기 자산 진단 제출, 모임 ${r.L2.require_event}회 참석, 가입 후 ${r.L2.min_days}일이 지나면 자동으로 메이커가 됩니다.`, '챌린지 보드(카드), 세미나·스터디, 커피챗, 커뮤니티'],
    ['L2', '메이커', '자동 승급', '라운드 1회 완주(데모데이 발표 + 페이퍼) 또는 첫 외부 매출 인증 후 신청하면 심사를 거쳐 어치버가 됩니다.', '그룹 챌린지 참여, 품앗이 보드, 아카이브'],
    ['L3', '어치버', '신청 + 심사', '라운드 2회 완주와 리더 교육 이수, 운영본부 면담을 거치면 리더가 됩니다.', '다른 그룹의 진행 기록·장부 요약, 페이퍼 전문'],
    ['L4', '리더', '신청 + 심사', '그룹장으로 성공 챌린지 2건 또는 3개월 연속 외부 매출이면 마스터 심사를 신청할 수 있습니다.', '그룹 챌린지 제안·운영, 그룹장 배분 몫'],
    ['L5', '마스터', '신청 + 심사', '챌린지 심사·멘토링에 참여하고, 오피셜 챌린지를 함께 설계합니다.', '심사 참여, 멘토 배지, 운영 회의'],
  ];
  const pts = Object.entries(s.points).sort((a, b) => b[1].points - a[1].points);
  return `<div class="wrap page">
    ${pageHead('등급과 라운드', '등급은 돈을 내서 사는 게 아니라 실행 기록으로 오릅니다. 아래 조건은 운영본부가 설정 화면에서 조정할 수 있고, 바뀌면 이 페이지도 함께 바뀝니다.')}
    <div class="stack">${rows.map(([c, n, how, next, perm]) => `<div class="card"><div class="row between"><h3><span class="lv lv-${c}">${c}</span> ${n}</h3><span class="chip">${how}</span></div><p class="small" style="margin:4px 0 8px"><b>할 수 있는 것</b> · ${perm}</p><p class="small muted" style="margin:0"><b>다음 등급으로</b> · ${next}</p></div>`).join('')}</div>

    <div class="section"><h2>활동 포인트</h2><p class="muted">포인트는 메이커(L2) 승급 조건이고, 분기마다 새로 셉니다. 하루 적립 상한이 있어서 글만 많이 쓴다고 오르지 않습니다.</p>
    <div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>활동</th><th class="num">포인트</th><th class="num">하루 상한</th></tr></thead><tbody>${pts.map(([k, v]) => `<tr><td>${esc(v.label || k)}</td><td class="num">${v.points}</td><td class="num">${v.daily_cap ? v.daily_cap + '회' : '없음'}</td></tr>`).join('')}</tbody></table></div></div></div>

    <div class="section"><h2>그룹 챌린지의 돈 규칙 (요약)</h2>
      <div class="grid grid-2">
        <div class="card soft"><h3>배분 순서</h3><p class="small">매출 − 비용 = 순수익 → 그룹원 분담금 회수 → 운영본부 선지원 회수 → (정산 대행 시 수수료) → 운영본부 몫 → 그룹장 몫 → 그룹원 풀(기여율대로).</p></div>
        <div class="card soft"><h3>기본형 프리셋</h3><p class="small">운영본부 10% · 그룹장 30% · 그룹원 풀 60%. 리더주도형(10/45/45), 균등형(10/20/70, 그룹장도 풀에 포함), 오피셜형(55/15/30)도 있습니다. 프리셋에서 ±10%p 안에서 조정합니다.</p></div>
        <div class="card soft"><h3>정산 조건</h3><p class="small">정산 가능 금액이 10만 원 미만이면 다음 라운드로 이월합니다. 프로젝트 페이퍼가 승인되어야 지급됩니다. 지급액에는 3.3% 원천징수 참고액을 함께 표시합니다.</p></div>
        <div class="card soft"><h3>소유권</h3><p class="small">A형(그룹 공동 소유), B형(그룹장 소유 + 마챌 사례 사용권), C형(마챌 소유, 오피셜 챌린지)을 합의서에서 고릅니다. 합의 없이 시작한 챌린지는 없습니다.</p></div>
      </div>
    </div>
    ${state.me ? '' : `<div class="cta-band" style="margin-top:20px"><h2>함께해 볼까요?</h2><p>지원서를 쓰고, 승인되면 초대 코드로 가입합니다.</p><a class="btn lg" href="#/apply">가입 신청하기</a></div>`}
  </div>`;
}

export async function apply() {
  const html = `<div class="wrap page" style="max-width:720px">
    ${pageHead('가입 신청', '운영본부가 3일 안에 확인하고 이메일로 초대 코드를 보내 드립니다. 솔직하게 적어 주세요. 경력이나 실적은 심사 기준이 아닙니다.')}
    <form class="form card" data-form="apply">
      <div class="form-cols">
        ${field('이름 *', input('name', { required: true, placeholder: '실명' }))}
        ${field('이메일 *', input('email', { type: 'email', required: true, placeholder: '초대 코드를 받을 이메일' }), '가입할 때 같은 이메일을 씁니다')}
        ${field('연락처', input('phone', { placeholder: '010-0000-0000' }))}
        ${field('추천인 (선택)', input('referrer', { placeholder: '회원 닉네임 또는 이메일' }))}
      </div>
      <div class="form-cols">
        ${field('현재 하는 일', input('job', { placeholder: '직장인 · 자영업 · 프리랜서 · 학생 등' }))}
        ${field('주중 / 주말에 쓸 수 있는 시간', input('hours_weekday', { placeholder: '예: 주중 저녁 5시간, 주말 4시간' }))}
      </div>
      ${field('관심 분야 (복수 선택)', `<div class="row">${Object.entries(FIELDS).map(([k, v]) => check('interests[]', v, false, k)).join('')}</div>`)}
      ${field('사이드프로젝트를 해 본 적이 있나요? 결과는 어땠나요?', textarea('experience', { placeholder: '해 본 적이 없어도 괜찮습니다. 없다면 "없음"과 함께 해 보고 싶은 것을 적어 주세요.' }))}
      ${field('그룹으로 프로젝트를 하면 좋은 점과 걱정되는 점을 한 가지씩', textarea('why_group', { rows: 3 }))}
      ${field('그룹 챌린지 수익을 운영본부 10%, 그룹장, 그룹원이 나누는 방식에 대해 어떻게 생각하시나요?', textarea('share_opinion', { rows: 3 }), '정답은 없습니다. 생각을 듣고 싶습니다.')}
      ${field('회사 규정상 겸업이나 부업에 제한이 있는지 확인하셨나요?', select('side_job_check', [['', '선택'], ['yes', '확인했고 문제 없음'], ['partial', '일부 제한이 있음 (가입 후 상의)'], ['no', '아직 확인하지 않음']]))}
      ${field('이번 라운드 모임(마챌데이·데모데이)에 참석할 수 있나요?', select('can_attend', [['', '선택'], ['yes', '대부분 참석 가능'], ['some', '절반 정도'], ['no', '당분간 온라인만']]))}
      ${field('마챌에 줄 수 있는 것 한 가지', input('give', { placeholder: '예: 디자인 피드백, 엑셀 정리, 사진 촬영, 장소' }))}
      ${check('consent_public', '프로젝트 결과(매출 유무, 고객 수 구간, 투입 시간)가 페이퍼로 공개될 수 있다는 점에 동의합니다. *', false)}
      <div class="form-error error"></div>
      <button class="btn primary lg block" type="submit">신청서 보내기</button>
    </form></div>`;
  return { html, mount(root) { bindForms(root, { async apply(d) { if (!d.consent_public) throw new Error('결과 공개 원칙에 동의해야 신청할 수 있습니다'); d.interests = (d.interests || []).join(','); await post('/apply', d); go('#/apply/done'); } }); } };
}
export async function applyDone() { return `<div class="wrap page auth"><div class="card" style="text-align:center"><h2>신청서를 받았습니다</h2><p class="muted">운영본부가 확인한 뒤 이메일로 초대 코드를 보내 드립니다. 코드를 받으면 <a href="#/register">초대 코드로 가입</a>에서 계정을 만드세요.</p><a class="btn" href="#/">처음으로</a></div></div>`; }

export async function login() {
  const html = `<div class="wrap auth"><div class="card"><h2>로그인</h2><form class="form" data-form="login">${field('이메일', input('email', { type: 'email', required: true }))}${field('비밀번호', input('password', { type: 'password', required: true }))}<div class="form-error error"></div><button class="btn primary block" type="submit">로그인</button></form><div class="divider"></div><p class="small muted" style="margin:0">아직 계정이 없나요? <a href="#/register">초대 코드로 가입</a> · <a href="#/apply">가입 신청</a></p></div></div>`;
  return { html, mount(root) { bindForms(root, { async login(d) { await post('/auth/login', d); await state.refreshMe(); const after = sessionStorage.getItem('machal_after_login'); sessionStorage.removeItem('machal_after_login'); go(after && after !== '#/login' ? after : '#/dashboard'); } }); } };
}

export async function register() {
  const html = `<div class="wrap auth"><div class="card"><h2>초대 코드로 가입</h2><p class="muted small">운영본부가 보낸 초대 코드와 지원서에 적은 이메일이 필요합니다.</p><form class="form" data-form="reg">
    ${field('초대 코드', input('invite_code', { required: true, placeholder: 'MC-XXXXXX' }))}
    ${field('이메일 (지원서와 동일)', input('email', { type: 'email', required: true }))}
    <div class="form-cols">${field('이름', input('name', { required: true }))}${field('닉네임', input('nickname', { required: true, placeholder: '모임에서 불릴 이름' }))}</div>
    ${field('비밀번호 (8자 이상)', input('password', { type: 'password', required: true }))}
    <div class="form-error error"></div><button class="btn primary block" type="submit">가입하기</button></form></div></div>`;
  return { html, mount(root) { bindForms(root, { async reg(d) { await post('/auth/register', d); await state.refreshMe(); go('#/onboarding'); } }); } };
}

export async function setup() {
  const st = await api('/public/status');
  if (!st.setup_needed) return `<div class="wrap auth"><div class="card"><h2>이미 설정이 끝났습니다</h2><p class="muted">운영자 계정이 있습니다. <a href="#/login">로그인</a>으로 이동하세요.</p></div></div>`;
  const html = `<div class="wrap auth"><div class="card"><h2>마챌 초기 설정</h2><p class="muted small">첫 운영자(마스터 · 운영진) 계정을 만듭니다. 이 화면은 한 번만 열립니다.</p><form class="form" data-form="setup">
    ${field('이름', input('name', { required: true }))}${field('닉네임', input('nickname', { placeholder: '운영본부' }))}${field('이메일', input('email', { type: 'email', required: true }))}${field('비밀번호 (8자 이상)', input('password', { type: 'password', required: true }))}
    <div class="form-error error"></div><button class="btn primary block" type="submit">운영자 계정 만들기</button></form></div></div>`;
  return { html, mount(root) { bindForms(root, { async setup(d) { await post('/setup', d); await state.refreshMe(); toast('운영자 계정이 만들어졌습니다'); go('#/admin'); } }); } };
}
