// 운영본부 현황 — 오늘 처리할 일, 핵심 지표, 주의가 필요한 곳, 추이
import { api, esc, num, won, fmtDate, LEVELS, LEVEL_NAMES } from '../../core.js';
import { shell, mountShell, kpi, columns, hbars } from './shared.js';

const QUEUES = [
  ['applications', '가입 신청', '3일 안에 승인·반려'],
  ['challenges', '챌린지 심사', '7일 안에 결정'],
  ['agreements', '합의서 승인', '서명 완료 후 확인'],
  ['settlements', '정산 검수', '확인·이의 처리'],
  ['papers', '페이퍼 검토', '5일 안에 검토'],
  ['promotions', '승급 심사', '7일 안에 결정'],
  ['disputes', '이의·신고', '7일 안에 1차 답변'],
];
const KIND_LABEL = { stalled: '멈춤', low_checkin: '체크인 저조', absence: '연속 미제출', first_public: '첫 공개 지연', share_gap: '기여율 차이', payout_late: '지급 지연' };

export async function home() {
  const d = await api('/admin/dashboard');
  const total = QUEUES.reduce((s, [k]) => s + (d.queues[k] || 0), 0);
  const overdueTotal = QUEUES.reduce((s, [k]) => s + (d.overdue[k] || 0), 0);
  const now = new Date();
  const dateLabel = `${now.getMonth() + 1}월 ${now.getDate()}일 ${'일월화수목금토'[now.getDay()]}요일`;
  const r = d.round;
  const roundLine = r ? (r.status === 'active' || r.week > 0 ? `${esc(r.name)} · ${r.week}주차 / 12주` : `${esc(r.name)} 모집 중 · 시작까지 ${r.days_to_start}일`) : '진행 중인 라운드 없음';
  const k = d.kpi;
  const wkLabels = d.trends.weeks.map(w => `${Number(w.slice(5, 7))}/${Number(w.slice(8, 10))}주`);

  const body = `
  <section class="adm-today">
    <div class="adm-today-head"><div><div class="eyebrow">${dateLabel}</div><h2>${total ? `오늘 처리할 일 <b>${total}</b>건` : '받은 일이 모두 처리됐습니다'}</h2>${overdueTotal ? `<p class="adm-warn">■ 처리 기한이 지난 건이 ${overdueTotal}건 있습니다. 먼저 봐 주세요.</p>` : '<p class="muted">기한이 지난 건은 없습니다.</p>'}</div><a class="adm-round" href="#/admin/rounds"><small>라운드</small><b>${roundLine}</b></a></div>
    <div class="adm-queue2">${QUEUES.map(([key, label, rule]) => { const n = d.queues[key] || 0, o = d.overdue[key] || 0; return `<a href="#/admin/${key}" class="${n ? 'has' : 'zero'}${o ? ' late' : ''}"><span class="q-label">${label}</span><span class="q-n">${n}</span><span class="q-rule">${o ? `기한 지남 ${o}건` : rule}</span></a>`; }).join('')}</div>
  </section>

  <section class="adm-sec"><div class="adm-sec-head"><h2>핵심 지표</h2><span class="muted small">숫자는 모두 실제 기록에서 바로 계산합니다</span></div>
    <div class="kpi-grid">
      ${kpi('완주하고 매출까지 낸 회원', num(k.north_star) + '<small>명</small>', '라운드 완주 + 외부 매출 1건 이상', { accent: true })}
      ${kpi('최근 7일 접속 회원', num(k.active_7d) + '<small>명</small>', `정회원(L1 이상) ${num(k.members)}명 중`, { href: '#/admin/users?sort=seen' })}
      ${kpi('진행 중인 그룹', num(k.active_groups) + '<small>개</small>', '솔로 제외 · 진행·정산 단계', { href: '#/admin/groups' })}
      ${kpi('이번 주 체크인 제출률', k.weekly_checkin_rate == null ? '-' : k.weekly_checkin_rate + '<small>%</small>', '최근 7일 열린 체크인 기준', { href: '#/admin/groups' })}
      ${kpi('첫 매출 회원', num(k.first_sales) + '<small>명</small>', '첫 매출 배지 누적')}
      ${kpi('공개된 프로젝트 페이퍼', num(k.papers_public) + '<small>편</small>', '홈페이지에 공개된 것', { href: '/papers/' })}
    </div>
  </section>

  <div class="adm-two">
    <section class="card"><div class="card-head"><h3>주의가 필요한 곳</h3><span class="muted small">${d.risks.length ? `${d.risks.length}건` : ''}</span></div>
      ${d.risks.length ? `<div class="risk-list">${d.risks.map(x => `<a class="risk ${x.level}" href="${x.link}"><span class="risk-tag">${x.level === 'high' ? '■' : '▲'} ${KIND_LABEL[x.kind] || x.kind}</span><span class="risk-body"><b>${esc(x.title)}</b><small>${esc(x.detail)}</small></span></a>`).join('')}</div>` : '<div class="empty" style="padding:24px 10px"><strong>지금은 걸리는 곳이 없습니다</strong><span>체크인 공백, 첫 공개 지연, 기여율 차이, 지급 지연을 매번 확인합니다</span></div>'}
    </section>
    <section class="card"><div class="card-head"><h3>회원 흐름</h3><span class="muted small">누적 · 첫 단계 대비 비율</span></div>${hbars(d.funnel, { showPct: true })}
      <p class="small muted" style="margin:10px 0 0">어느 단계에서 가장 많이 멈추는지 보고, 그 단계의 안내와 일정을 먼저 손봅니다.</p></section>
  </div>

  <section class="adm-sec"><div class="adm-sec-head"><h2>최근 8주</h2><span class="muted small">월요일 시작 · 한국 시간</span></div>
    <div class="trend-grid">
      <div class="card"><h3 class="small">가입 신청</h3>${columns(d.trends.applications, wkLabels, { unit: '건' })}</div>
      <div class="card"><h3 class="small">새 계정</h3>${columns(d.trends.joins, wkLabels, { unit: '명' })}</div>
      <div class="card"><h3 class="small">체크인 제출</h3>${columns(d.trends.checkins, wkLabels, { unit: '건' })}</div>
      <div class="card"><h3 class="small">완료 로그</h3>${columns(d.trends.done_logs, wkLabels, { unit: '건' })}</div>
    </div>
  </section>

  <div class="adm-two">
    <section class="card"><div class="card-head"><h3>등급 분포</h3><a class="small" href="#/admin/users">회원 보기</a></div>${hbars(LEVELS.map(l => [`${l} ${LEVEL_NAMES[l]}`, d.levels.find(x => x.level === l)?.c || 0]))}</section>
    <section class="card"><div class="card-head"><h3>돈</h3><a class="small" href="#/admin/payouts">지급 관리</a></div>
      <div class="money-line"><span>지급 대기</span><b>${num(d.payouts.pending_count)}건</b><b class="amt">${won(d.payouts.pending_sum)}</b></div>
      <p class="small muted" style="margin:8px 0 14px">정산 검수가 끝난 건은 일주일 안에 입금하고, 입금한 뒤 지급 처리합니다.</p>
      <div class="adm-rhythm"><b>운영 리듬</b><ul><li><b>매일 20분</b> 받은 일 비우기</li><li><b>월요일</b> 체크인 제출률·멈춘 그룹 확인</li><li><b>매월</b> 마챌데이 준비, 규칙 변경 공지</li><li><b>라운드 말</b> 데모데이 → 페이퍼 → 정산 → 승급</li></ul></div>
    </section>
  </div>`;
  return { html: await shell('home', { title: '운영 현황', sub: '받은 일부터 비우고, 그다음 멈춘 곳을 봅니다.' }, body), mount: mountShell };
}
