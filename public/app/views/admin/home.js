// 운영본부 현황 — 오늘 처리할 일, 핵심 지표, 주의가 필요한 곳, 추이
import { api, esc, num, fmtLocal, LEVELS, LEVEL_NAMES, EVENT_TYPES } from '../../core.js';
import { shell, mountShell, kpi, columns, hbars } from './shared.js';

const QUEUES = [
  ['applications', '가입 신청', '3일 안에 승인·반려'],
  ['leaders', '그룹리더 신청', '5일 안에 결정'],
  ['results', '매출 확인', '7일 안에 확인'],
  ['presentations', '발표 신청', '일정 3일 전까지'],
  ['papers', '페이퍼 검토', '5일 안에 검토'],
  ['promotions', '승급 심사', '7일 안에 결정'],
  ['disputes', '이의·신고', '7일 안에 1차 답변'],
];
const KIND_LABEL = { stalled: '모임 멈춤', unchecked: '출석 미확인', lonely: '모집 부진', overdue: '기간 지남', low_attendance: '출석 저조', kick: '퇴출 기준', newcomer: '신규 회원 멈춤' };

export async function home() {
  const d = await api('/admin/dashboard');
  const total = QUEUES.reduce((s, [k]) => s + (d.queues[k] || 0), 0);
  const overdueTotal = QUEUES.reduce((s, [k]) => s + (d.overdue[k] || 0), 0);
  const now = new Date();
  const dateLabel = `${now.getMonth() + 1}월 ${now.getDate()}일 ${'일월화수목금토'[now.getDay()]}요일`;
  const r = d.round;
  const roundLine = r ? (r.status === 'open' && r.days_to_start ? `${esc(r.name)} · 시작까지 ${r.days_to_start}일` : esc(r.name)) : '진행 중인 시즌 없음';
  const k = d.kpi;
  const wkLabels = d.trends.weeks.map(w => `${Number(w.slice(5, 7))}/${Number(w.slice(8, 10))}주`);

  const body = `
  <section class="adm-today">
    <div class="adm-today-head"><div><div class="eyebrow">${dateLabel}</div><h2>${total ? `오늘 처리할 일 <b>${total}</b>건` : '받은 일이 모두 처리됐습니다'}</h2>${overdueTotal ? `<p class="adm-warn">■ 처리 기한이 지난 건이 ${overdueTotal}건 있습니다. 먼저 봐 주세요.</p>` : '<p class="muted">기한이 지난 건은 없습니다.</p>'}</div><a class="adm-round" href="#/admin/rounds"><small>시즌</small><b>${roundLine}</b></a></div>
    <div class="adm-queue2">${QUEUES.map(([key, label, rule]) => { const n = d.queues[key] || 0, o = d.overdue[key] || 0; return `<a href="#/admin/${key}" class="${n ? 'has' : 'zero'}${o ? ' late' : ''}"><span class="q-label">${label}</span><span class="q-n">${n}</span><span class="q-rule">${o ? `기한 지남 ${o}건` : rule}</span></a>`; }).join('')}</div>
  </section>

  <section class="adm-sec"><div class="adm-sec-head"><h2>핵심 지표</h2><span class="muted small">숫자는 모두 실제 기록에서 바로 계산합니다</span></div>
    <div class="kpi-grid kpi-4">
      ${kpi('최근 30일 그룹 모임에 나온 회원', num(k.north_star) + '<small>명</small>', '마감한 모임 출석·지각 기준', { accent: true })}
      ${kpi('최근 7일 접속 회원', num(k.active_7d) + '<small>명</small>', `정회원(L1 이상) ${num(k.members)}명 중`, { href: '#/admin/users?sort=seen' })}
      ${kpi('모집·진행 중인 그룹', num(k.active_groups) + '<small>개</small>', `학습 ${num(k.study_groups)} · 도전 ${num(k.challenge_groups)} · 그룹리더 ${num(k.leaders)}명`, { href: '#/admin/groups' })}
      ${kpi('최근 30일 그룹 출석률', k.attendance_rate_30d == null ? '-' : k.attendance_rate_30d + '<small>%</small>', `마감한 모임 ${num(k.sessions_30d)}번 · 공결 제외`, { href: '#/admin/groups' })}
      ${kpi('첫 매출 회원', num(k.first_sales) + '<small>명</small>', `그룹 완주 ${num(k.completions)}건`)}
      ${kpi('최근 30일 출석 경고', num(k.warnings_30d) + '<small>건</small>', `출석 기준 퇴출 ${num(k.removed_30d)}명`)}
      ${kpi('단체카톡방 참여', k.chat_rate == null ? '-' : k.chat_rate + '<small>%</small>', `회원 ${num(k.member_accounts)}명 중 ${num(k.chat_in)}명 · 운영진 확인 ${num(k.chat_verified)}명`, { href: '#/admin/chat' })}
      ${kpi(`최근 ${num(k.newcomers_window)}일 새 회원`, num(k.newcomers) + '<small>명</small>', `정착 완료 ${num(k.newcomers_done)} · 멈춤 ${num(k.newcomers_stalled)}`, { href: '#/admin/onboarding' })}
    </div>
  </section>

  <div class="adm-two">
    <section class="card"><div class="card-head"><h3>주의가 필요한 곳</h3><span class="muted small">${d.risks.length ? `${d.risks.length}건` : ''}</span></div>
      ${d.risks.length ? `<div class="risk-list">${d.risks.map(x => `<a class="risk ${x.level}" href="${x.link}"><span class="risk-tag">${x.level === 'high' ? '■' : '▲'} ${KIND_LABEL[x.kind] || x.kind}</span><span class="risk-body"><b>${esc(x.title)}</b><small>${esc(x.detail)}</small></span></a>`).join('')}</div>` : '<div class="empty" style="padding:24px 10px"><strong>지금은 걸리는 곳이 없습니다</strong><span>모임이 끊긴 그룹, 출석을 받지 않은 모임, 출석률이 낮은 그룹, 퇴출 기준에 닿은 그룹원을 매번 확인합니다</span></div>'}
    </section>
    <section class="card"><div class="card-head"><h3>회원 흐름</h3><span class="muted small">누적 · 첫 단계 대비 비율</span></div>${hbars(d.funnel, { showPct: true })}
      <p class="small muted" style="margin:10px 0 0">어느 단계에서 가장 많이 멈추는지 보고, 그 단계의 안내와 일정을 먼저 손봅니다.</p></section>
  </div>

  <section class="adm-sec"><div class="adm-sec-head"><h2>최근 8주</h2><span class="muted small">월요일 시작 · 한국 시간</span></div>
    <div class="trend-grid">
      <div class="card"><h3 class="small">가입 신청</h3>${columns(d.trends.applications, wkLabels, { unit: '건' })}</div>
      <div class="card"><h3 class="small">새 계정</h3>${columns(d.trends.joins, wkLabels, { unit: '명' })}</div>
      <div class="card"><h3 class="small">마감한 그룹 모임</h3>${columns(d.trends.sessions, wkLabels, { unit: '번' })}</div>
      <div class="card"><h3 class="small">도전 기록</h3>${columns(d.trends.logs, wkLabels, { unit: '건' })}</div>
    </div>
  </section>

  <div class="adm-two">
    <section class="card"><div class="card-head"><h3>다가오는 정기모임·일정</h3><a class="small" href="#/admin/events">일정 관리</a></div>
      ${d.events.length ? `<div class="list">${d.events.map(e => `<a class="list-item" href="#/admin/events/${e.id}" style="color:inherit"><div class="grow"><div class="title">${esc(e.title)}</div><div class="meta">${esc(e.type_name || EVENT_TYPES[e.type] || '')} · ${fmtLocal(e.starts_at)} · 신청 ${num(e.registered)}명${e.presentations ? ` · 발표 ${e.presentations}건` : ''}</div></div></a>`).join('')}</div>` : '<p class="small muted" style="margin:0">잡힌 일정이 없습니다. 정기모임은 한 달에 한 번 이상 열어 주세요.</p>'}
      <div class="adm-rhythm" style="margin-top:14px"><b>운영 리듬</b><ul><li><b>매일 20분</b> 받은 일 비우기</li><li><b>매주</b> 주의가 필요한 그룹의 그룹리더에게 연락</li><li><b>매월</b> 정기모임 · 발제 확정 · 그룹 소식 정리</li><li><b>시즌 말</b> 성과발표회 → 페이퍼 → 승급 심사</li></ul></div></section>
    <section class="card"><div class="card-head"><h3>등급 분포</h3><a class="small" href="#/admin/users">회원 보기</a></div>${hbars(LEVELS.map(l => [`${l} ${LEVEL_NAMES[l]}`, d.levels.find(x => x.level === l)?.c || 0]))}</section>
  </div>`;
  return { html: await shell('home', { title: '운영 현황', sub: '받은 일부터 비우고, 그다음 멈춘 그룹을 봅니다.' }, body), mount: mountShell };
}
