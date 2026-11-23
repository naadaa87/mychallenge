// KPI 지표 — 방문·유입, 콘텐츠, 회원, 모임·참여, 커뮤니티 (v1.3)
import { api, put, esc, num, won, fmtDate, fmtLocal, ago, LEVEL_NAMES, BOARDS, EVENT_TYPES, lvChip, stageChip, typeChip, empty, toast, go, reload, modal, closeModal, bindForms, field, input, check, textarea, progressBar } from '../../core.js';
import { columns, hbars, qs } from './shared.js';

const TABS = [['summary', '요약'], ['traffic', '방문·유입'], ['content', '콘텐츠'], ['members', '회원'], ['groups', '그룹·출석'], ['community', '커뮤니티']];
const RANGES = [[7, '7일'], [30, '30일'], [90, '90일'], [365, '1년']];
const ZONES = { header: '머리글', hero: '첫 화면', body: '본문', cta: '맺음 띠', footer: '바닥글', nav: '메뉴', goal: '목표' };
const AREAS = { site: '공개 사이트', paper: '프로젝트 페이퍼', app: '회원 공간' };
const DEVICES = { mobile: '휴대폰', tablet: '태블릿', desktop: 'PC' };

// ───────── 숫자 표시 ─────────
const dur = s => s == null ? '-' : s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60 ? (s % 60) + '초' : ''}`.trim();
function fmtVal(v, unit, f) {
  if (v == null || Number.isNaN(v)) return '-';
  if (f === 'dur' || unit === '초') return dur(v);
  if (unit === '%') return `${v}<small>%</small>`;
  return `${num(v)}<small>${unit || ''}</small>`;
}
function delta(cur, prev, unit, better = 'up') {
  if (prev == null || cur == null) return '';
  if (cur === prev) return '<span class="dl dl-flat">– 지난 기간과 같음</span>';
  let txt;
  if (unit === '%') txt = `${Math.abs(Math.round((cur - prev) * 10) / 10)}%p`;
  else if (!prev) return `<span class="dl dl-flat">${cur > 0 ? '▲' : '▼'} 지난 기간 0${unit === '초' ? '' : unit}</span>`;
  else txt = `${Math.abs(Math.round((cur - prev) / prev * 1000) / 10)}%`;
  const up = cur > prev, good = better === 'up' ? up : !up;
  return `<span class="dl ${good ? 'dl-good' : 'dl-bad'}">${up ? '▲' : '▼'} ${txt}</span>`;
}
function tile(c) {
  return `<div class="kpi kpi-d"><div class="kpi-label">${esc(c.label)}</div><div class="kpi-num">${fmtVal(c.value, c.unit, c.fmt)}</div>${delta(c.value, c.prev, c.unit, c.better)}<div class="kpi-sub">${esc(c.def || '')}</div></div>`;
}
const T = (label, value, prev, unit, def, opt = {}) => tile({ label, value, prev, unit, def, ...opt });
function labelsFor(p, keys) {
  return keys.map(k => p.bucket === 'month' ? `${k.slice(2, 4)}.${Number(k.slice(5, 7))}` : `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))}${p.bucket === 'week' ? '~' : ''}`);
}
const chart = (title, values, labels, unit, note = '') => `<div class="card"><div class="card-head"><h3 class="small">${title}</h3><span class="muted small">합계 ${num(values.reduce((a, b) => a + b, 0))}${unit}</span></div>${columns(values, labels, { unit, height: 110 })}${note ? `<p class="small muted" style="margin:8px 0 0">${note}</p>` : ''}</div>`;

// ───────── 표 + CSV ─────────
const TABLES = {};
function table(id, cols, rows, { limit = 0, emptyText = '자료가 없습니다', csvName = id } = {}) {
  TABLES[id] = { cols, rows, csvName };
  if (!rows.length) return `<p class="muted small pad">${emptyText}</p>`;
  const shown = limit ? rows.slice(0, limit) : rows;
  return `<div class="table-wrap"><table class="tbl compact kpi-tbl"><thead><tr>${cols.map(c => `<th class="${c.num ? 'num' : ''}">${c.label}</th>`).join('')}</tr></thead><tbody>${shown.map(r => `<tr>${cols.map(c => `<td class="${c.num ? 'num' : ''}">${c.html ? c.html(r) : esc(c.get ? c.get(r) ?? '-' : r[c.key] ?? '-')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${limit && rows.length > limit ? `<p class="muted small" style="margin:6px 12px 10px">상위 ${limit}개만 보입니다. 전체는 CSV로 받으세요.</p>` : ''}`;
}
const csvBtn = id => `<button class="btn sm ghost" type="button" data-csv="${id}">CSV</button>`;
function downloadCsv(id, p) {
  const t = TABLES[id]; if (!t) return;
  const cell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [t.cols.map(c => cell(c.label.replace(/<[^>]+>/g, ''))).join(',')];
  for (const r of t.rows) lines.push(t.cols.map(c => cell(c.csv ? c.csv(r) : c.get ? c.get(r) : r[c.key])).join(','));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `machal-kpi-${t.csvName}-${p.start}_${p.end}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const sec = (title, inner, { csv, sub = '', flush = false } = {}) => `<section class="card${flush ? ' flush' : ''}"><div class="card-head${flush ? ' pad' : ''}"><h3>${title}${sub ? ` <small class="muted">${sub}</small>` : ''}</h3>${csv ? csvBtn(csv) : ''}</div>${inner}</section>`;
const pct = v => v == null ? '-' : v + '%';

// ───────── 탭별 화면 ─────────
// 월 목표·수집 설정 (총괄관리자)
const TARGETS = [['visitors', '방문자', '명'], ['views', '페이지뷰', '회'], ['apps', '가입 신청', '건'], ['signups', '새 회원', '명'], ['active', '활동 회원', '명']];
function settingsModal(d) {
  const T = d.month.targets || {}, C = d.config;
  modal(`<h3>목표·수집 설정</h3><form class="form" data-form="kset">
    <p class="small muted" style="margin:0">월 목표는 비우거나 0이면 정하지 않은 것으로 봅니다.</p>
    <div class="kpi-form-cols">${TARGETS.map(([k, l, u]) => field(`${l} (${u})`, input(k, { type: 'number', min: 0, value: T[k] || '' }))).join('')}</div>
    <hr class="kpi-hr">
    ${check('enabled', '방문 통계 모으기', C.enabled)}
    ${field('수집 시작일', input('start', { type: 'date', value: C.start || '' }), '개인정보처리방침을 바꾸면 시행 7일 전에 알리기로 했습니다(처리방침 12항). 처리방침에 바뀐 내용을 올린 날로부터 7일 뒤로 두세요. 비우면 바로 모읍니다.')}
    ${field('바꾸는 이유', textarea('reason', { rows: 2, placeholder: '감사 로그에 남습니다' }))}
    <div class="btn-row"><button class="btn primary" type="submit">저장</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`,
  { onMount(m) { bindForms(m, { async kset(v) {
    await put('/admin/kpi/settings', { targets: Object.fromEntries(TARGETS.map(([k]) => [k, v[k]])), analytics: { enabled: !!v.enabled, start: v.start || '' }, reason: v.reason });
    closeModal(); toast('목표·수집 설정을 저장했습니다'); reload();
  } }); } });
}
function monthCard(d) {
  const M = d.month, T = M.targets || {};
  const set = TARGETS.filter(([k]) => Number(T[k]) > 0);
  const rows = set.map(([k, l, u]) => {
    const a = M.actual[k] || 0, g = Number(T[k]);
    const proj = Math.round(a / Math.max(1, M.days_elapsed) * M.days_in_month);
    const pace = k === 'active' ? '<span class="muted">이번 달에 한 번이라도 활동한 회원</span>'
      : proj >= g ? `<span class="dl dl-good">이 속도면 월말 약 ${num(proj)}${u} · 달성 예상</span>` : `<span class="dl dl-bad">이 속도면 월말 약 ${num(proj)}${u} · ${num(g - proj)}${u} 모자람</span>`;
    return `<div class="kpi-goal"><div class="kpi-goal-h"><b>${l}</b><span><b>${num(a)}</b> / ${num(g)}${u} · ${Math.round(a / g * 100)}%</span></div>${progressBar(a, g)}<div class="small">${pace}</div></div>`;
  });
  return `<section class="card kpi-month"><div class="card-head"><h3>${Number(M.month.slice(5))}월 목표 <small class="muted">${M.days_elapsed}일째 / ${M.days_in_month}일</small></h3>${d.config.is_owner ? '<button class="btn sm ghost" type="button" data-kpi-set>목표·수집 설정</button>' : ''}</div>
    ${rows.length ? `<div class="kpi-goals">${rows.join('')}</div>` : `<p class="muted small" style="margin:0">월 목표를 정해 두면 여기서 달성률과 월말 예상치를 봅니다. ${d.config.is_owner ? '오른쪽 위 <b>목표·수집 설정</b>에서 정하세요.' : '총괄관리자가 정합니다.'}</p>`}</section>`;
}

async function summary(P, query) {
  const d = await api('/admin/kpi/summary' + qs({ ...P }));
  const L = labelsFor(d.period, d.labels);
  const C = d.config;
  const colNote = C.collecting ? '' : !C.enabled
    ? `<div class="notice warn">방문 통계 수집이 꺼져 있습니다. 회원·모임·커뮤니티 지표는 실제 기록으로 그대로 보이지만 방문·페이지·클릭 숫자는 쌓이지 않습니다.${C.is_owner ? ' <b>목표·수집 설정</b>에서 다시 켤 수 있습니다.' : ''}</div>`
    : `<div class="notice">방문 통계는 <b>${fmtDate(C.start)}</b>부터 모읍니다. 개인정보처리방침에 이용 통계 항목을 더하고 7일 뒤 시행하기로 했기 때문입니다. 그 전까지 회원·모임·커뮤니티 지표는 실제 기록으로 그대로 보입니다.</div>`;
  const groups = [...new Set(d.cards.map(c => c.group))];
  const GROUP_NOTE = { 유입: '사람들이 얼마나 들어오나', 전환: '들어온 사람이 회원이 되나', 참여: '회원이 실제로 움직이나', 그룹: '그룹이 만들어지고 채워지나', 성과: '그룹이 낸 결과' };
  return {
    period: d.period,
    note: colNote + (!d.tracking_since ? '<div class="notice">방문 통계는 이번 업데이트 이후부터 쌓입니다. 방문·페이지뷰·머문 시간은 하루쯤 지나면 보이기 시작합니다. 회원·모임·커뮤니티 지표는 지금 바로 정확합니다.</div>'
      : d.tracking_since > d.period.start ? `<div class="notice">방문 통계는 ${fmtDate(d.tracking_since)}부터 쌓였습니다. 그 이전 날짜의 방문 수치는 0으로 보입니다.</div>` : ''),
    mount(root) { root.querySelector('[data-kpi-set]')?.addEventListener('click', () => settingsModal(d)); },
    body: `${monthCard(d)}${groups.map(g => `<section class="adm-sec"><div class="adm-sec-head"><h2>${g}</h2><span class="muted small">${GROUP_NOTE[g] || ''}</span></div><div class="kpi-grid kpi-4">${d.cards.filter(c => c.group === g).map(tile).join('')}</div></section>`).join('')}
      <section class="adm-sec"><div class="adm-sec-head"><h2>추이</h2><span class="muted small">${d.period.bucket === 'day' ? '하루' : d.period.bucket === 'week' ? '주' : '월'} 단위</span></div>
        <div class="trend-grid trend-3">${chart('방문자', d.series.visitors, L, '명')}${chart('가입 신청', d.series.applications, L, '건')}${chart('새 회원', d.series.signups, L, '명')}</div></section>`,
  };
}

async function traffic(P, query) {
  const d = await api('/admin/kpi/traffic' + qs({ ...P }));
  const L = labelsFor(d.period, d.labels); const c = d.cur, p = d.prev || {};
  const totalSessions = d.sources.reduce((t, r) => t + r.sessions, 0);
  const wd = ['월', '화', '수', '목', '금', '토', '일'];
  return {
    period: d.period,
    note: c.views === 0 ? '<div class="notice">이 기간에는 방문 기록이 없습니다. 방문 통계는 이번 업데이트 이후부터 쌓입니다.</div>' : '',
    body: `<div class="kpi-grid kpi-4">
        ${T('방문자', c.visitors, p.visitors, '명', '중복 없이 센 브라우저 수')}${T('방문', c.sessions, p.sessions, '회', '30분 넘게 쉬면 새 방문')}${T('페이지뷰', c.views, p.views, '회', '열어 본 화면 수')}${T('방문당 페이지', c.views_per_session, p.views_per_session, '쪽', '한 번 들어와서 본 페이지 수')}
        ${T('방문당 머문 시간', c.avg_session_sec, p.avg_session_sec, '초', '화면이 실제로 보인 시간', { fmt: 'dur' })}${T('페이지당 머문 시간', c.avg_view_sec, p.avg_view_sec, '초', '페이지 하나를 본 평균 시간', { fmt: 'dur' })}${T('한 페이지만 보고 나간 비율', c.bounce_rate, p.bounce_rate, '%', '방문 중 페이지 하나만 본 비율', { better: 'down' })}${T('처음 온 방문자 비율', c.new_rate, p.new_rate, '%', '이 브라우저로 처음 들어온 방문자')}
      </div>
      <div class="trend-grid trend-3">${chart('방문자', d.series.visitors, L, '명')}${chart('방문', d.series.sessions, L, '회')}${chart('페이지뷰', d.series.views, L, '회')}</div>
      <div class="adm-two wide-left">
        ${sec('유입 출처', table('sources', [
          { label: '출처', key: 'source' }, { label: '방문', key: 'sessions', num: 1, get: r => num(r.sessions), csv: r => r.sessions },
          { label: '비율', num: 1, get: r => pct(totalSessions ? Math.round(r.sessions / totalSessions * 1000) / 10 : null) },
          { label: '방문자', key: 'visitors', num: 1 }, { label: '신청서 제출', key: 'goals', num: 1 }, { label: '신청 전환율', num: 1, get: r => pct(r.conv) },
        ], d.sources, { emptyText: '아직 유입 기록이 없습니다' }), { csv: 'sources', flush: true, sub: '방문의 첫 페이지 기준' })}
        <div class="stack">
          ${sec('기기', d.devices.length ? hbars(d.devices.map(r => [DEVICES[r.device] || r.device, r.visitors])) : '<p class="muted small">자료 없음</p>', { sub: '방문자 기준' })}
          ${sec('영역', d.areas.length ? hbars(d.areas.map(r => [AREAS[r.area] || r.area, r.views]), { unit: '회' }) : '<p class="muted small">자료 없음</p>', { sub: '페이지뷰 기준' })}
        </div>
      </div>
      <div class="trend-grid trend-2">
        <div class="card"><h3 class="small card-title">시간대별 페이지뷰 <small class="muted">한국 시간</small></h3>${columns(d.hours, d.hours.map((_, i) => i + '시'), { unit: '회', height: 100, markLast: false })}</div>
        <div class="card"><h3 class="small card-title">요일별 페이지뷰</h3>${columns(d.weekdays, wd, { unit: '회', height: 100, markLast: false })}</div>
      </div>
      <div class="adm-two">
        ${sec('들어온 사이트', table('hosts', [{ label: '도메인', key: 'host' }, { label: '방문', key: 'sessions', num: 1 }], d.hosts, { emptyText: '바깥 사이트에서 들어온 기록이 없습니다' }), { csv: 'hosts', flush: true })}
        ${sec('캠페인(UTM)', table('campaigns', [{ label: '캠페인', key: 'campaign' }, { label: '방문', key: 'sessions', num: 1 }, { label: '방문자', key: 'visitors', num: 1 }], d.campaigns, { emptyText: '캠페인 링크로 들어온 기록이 없습니다' })
          + '<p class="small muted pad" style="padding-top:0">홍보 링크 뒤에 <code>?utm_source=instagram&amp;utm_campaign=1기모집</code>처럼 붙이면 어디서 온 방문인지 따로 셉니다.</p>', { csv: 'campaigns', flush: true })}
      </div>`,
  };
}

async function content(P, query) {
  const d = await api('/admin/kpi/content' + qs({ ...P, path: query.path }));
  const detailHref = path => '#/kpi' + qs({ tab: 'content', ...P, path });
  const pageLink = r => `<a href="${detailHref(r.path)}"><b>${esc(r.title || r.path)}</b></a> <a class="muted small" href="${esc(r.path)}" target="_blank" rel="noopener" title="새 창에서 페이지 열기">↗</a><br><small class="muted">${esc(r.path)}</small>`;
  const pageCols = [
    { label: '페이지', html: pageLink, get: r => r.title || r.path, csv: r => r.path },
    { label: '페이지뷰', key: 'views', num: 1 }, { label: '방문자', key: 'visitors', num: 1 },
    { label: '평균 머문 시간', num: 1, get: r => dur(r.avg_sec), csv: r => r.avg_sec },
    { label: '스크롤', num: 1, get: r => pct(r.scroll), csv: r => r.scroll },
    { label: '첫 페이지로 들어옴', key: 'entries', num: 1 }, { label: '바로 나감', num: 1, get: r => pct(r.bounce_rate) }, { label: '여기서 떠남', num: 1, get: r => pct(r.exit_rate) }, { label: '클릭', key: 'clicks', num: 1 },
  ];
  const maxG = Math.max(1, ...d.guides.map(g => g.views));
  const D = d.detail;
  const mini = (rows, f, emptyText = '기록이 없습니다') => rows.length ? `<ul class="kpi-mini">${rows.map(f).join('')}</ul>` : `<p class="muted small" style="margin:0 0 10px">${emptyText}</p>`;
  const pathName = x => x.startsWith('/app') ? x.replace(/\/\d+(?=\/|$)/g, '/:id') : x;
  const GOALS = { 'goal:apply': '가입 신청서 제출', 'goal:signup': '초대 코드로 가입 완료' };
  const detailHtml = D ? `<section class="card kpi-detail"><div class="card-head"><h3>${esc(D.title || D.path)} <small class="muted">${esc(D.path)}</small></h3><div class="row"><a class="btn sm ghost" href="${esc(D.path)}" target="_blank" rel="noopener">페이지 열기</a><a class="btn sm ghost" href="${'#/kpi' + qs({ tab: 'content', ...P })}">닫기</a></div></div>
      <div class="kpi-grid kpi-4">${T('페이지뷰', D.views, null, '회', `방문자 ${num(D.visitors)}명 · 첫 페이지로 들어옴 ${num(D.entries)}회`)}${T('평균 머문 시간', D.avg_sec, null, '초', '페이지 하나를 본 평균 시간', { fmt: 'dur' })}${T('스크롤', D.scroll, null, '%', '방문마다 가장 많이 내려 본 위치의 평균')}${T('여기서 떠남', D.exit_rate, null, '%', `이 페이지를 마지막으로 보고 나간 비율 · 바로 나감 ${pct(D.bounce_rate)}`, { better: 'down' })}</div>
      ${columns(D.series, labelsFor(d.period, d.labels), { unit: '회', height: 80 })}
      <div class="adm-two kpi-detail-two">
        <div><h4 class="small">이 페이지에서 누른 것</h4>${mini(D.clicks_list, r => `<li><span>${esc(r.label || '(글자 없음)')} <small class="muted">${esc(r.target.startsWith('out:') ? '바깥: ' + r.target.slice(4) : r.target)}${r.zone ? ' · ' + esc(ZONES[r.zone] || r.zone) : ''}</small></span><b>${num(r.n)}</b></li>`, '이 기간에 누른 기록이 없습니다')}
          ${D.goals.length ? `<h4 class="small">이 페이지에서 달성한 목표</h4>${mini(D.goals, r => `<li><span>${esc(GOALS[r.target] || r.target)}</span><b>${num(r.n)}</b></li>`)}` : ''}</div>
        <div><h4 class="small">이 페이지로 바로 들어온 출처</h4>${mini(D.sources, r => `<li><span>${esc(r.source)}</span><b>${num(r.n)}</b></li>`, '이 페이지로 방문을 시작한 기록이 없습니다')}
          <h4 class="small">바로 앞에 본 페이지</h4>${mini(D.from, r => `<li><a href="${detailHref(r.path)}">${esc(pathName(r.path))}</a><b>${num(r.n)}</b></li>`, '이 페이지로 방문을 시작했습니다')}
          <h4 class="small">다음에 본 페이지</h4>${mini(D.next, r => `<li><a href="${detailHref(r.path)}">${esc(pathName(r.path))}</a><b>${num(r.n)}</b></li>`, '여기서 바로 나간 방문만 있습니다')}</div>
      </div></section>` : '';
  return {
    period: d.period,
    body: `${detailHtml}<div class="adm-two">
        ${sec('가입 신청까지', hbars(d.apply_funnel, { unit: '회', showPct: true }) + '<p class="small muted" style="margin:10px 0 0">방문 단위로 셉니다. 신청서 제출은 브라우저에서 제출을 마친 경우만 셉니다.</p>')}
        ${sec('가입 신청 버튼을 누른 곳', table('apply_from', [{ label: '페이지', key: 'path' }, { label: '위치', get: r => ZONES[r.zone] || r.zone || '-' }, { label: '클릭', key: 'n', num: 1 }], d.apply_from, { limit: 7, emptyText: '아직 클릭 기록이 없습니다' }), { csv: 'apply_from', flush: true })}
      </div>
      ${sec('많이 본 페이지', table('pages', pageCols, d.site, { limit: 30, emptyText: '아직 방문 기록이 없습니다' }), { csv: 'pages', flush: true, sub: '가이드 제외 · 공개 사이트' })}
      <div class="adm-two wide-left">
        ${sec('가장 많이 읽은 가이드', d.guides.length ? `<div class="hbars">${d.guides.slice(0, 11).map(g => `<div class="hbar" data-tip="${esc(g.title || g.path)} · ${num(g.views)}회 · 평균 ${dur(g.views ? g.avg_sec : 0)}"><div class="hbar-label"><a href="${detailHref(g.path)}">${esc((g.title || g.path).replace(/ \|.*$/, ''))}</a></div><div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(1.5, g.views / maxG * 100)}%"></div></div><div class="hbar-val">${num(g.views)}<small> · ${dur(g.avg_sec)}</small></div></div>`).join('')}</div>` : '<p class="muted small">아직 기록이 없습니다</p>', { csv: 'guides', sub: '페이지뷰 · 평균 머문 시간' })}
        ${sec('많이 펼친 질문(FAQ)', table('faq', [{ label: '질문', key: 'label' }, { label: '펼침', key: 'n', num: 1 }, { label: '사람', key: 'visitors', num: 1 }], d.faq, { emptyText: '아직 기록이 없습니다' }), { csv: 'faq', flush: true })}
      </div>
      ${(TABLES.guides = { cols: pageCols, rows: d.guides, csvName: 'guides' }, '')}
      ${sec('많이 누른 링크·버튼', table('clicks', [{ label: '누른 글자', get: r => r.label || '(글자 없음)' }, { label: '이동한 곳', get: r => r.target.startsWith('out:') ? '바깥: ' + r.target.slice(4) : r.target }, { label: '위치', get: r => ZONES[r.zone] || r.zone || '-' }, { label: '클릭', key: 'n', num: 1 }, { label: '누른 사람', key: 'visitors', num: 1 }], d.top_clicks, { limit: 20, emptyText: '아직 클릭 기록이 없습니다' }), { csv: 'clicks', flush: true })}
      <div class="adm-two">
        ${sec('프로젝트 페이퍼', table('papers', [{ label: '페이퍼', html: r => `${esc(r.title || r.path)}${r.full ? ' <span class="chip">회원 전문 열람</span>' : ''}`, get: r => r.title }, { label: '열람', key: 'views', num: 1 }, { label: '사람', key: 'visitors', num: 1 }], d.papers, { emptyText: '아직 열람 기록이 없습니다' }), { csv: 'papers', flush: true })}
        ${sec('회원 공간에서 많이 쓴 화면', table('app', [{ label: '화면', key: 'path' }, { label: '페이지뷰', key: 'views', num: 1 }, { label: '평균 머문 시간', num: 1, get: r => dur(r.avg_sec), csv: r => r.avg_sec }], d.app, { limit: 15, emptyText: '아직 기록이 없습니다' }), { csv: 'app', flush: true })}
      </div>
      ${d.outbound.length ? sec('바깥으로 나간 링크', table('outbound', [{ label: '사이트', key: 'host' }, { label: '클릭', key: 'n', num: 1 }], d.outbound), { csv: 'outbound', flush: true }) : ''}`,
  };
}

async function members(P, query) {
  const d = await api('/admin/kpi/members' + qs({ ...P }));
  const L = labelsFor(d.period, d.labels);
  const listCols = [
    { label: '회원', html: r => `<a href="#/users/${r.id}"><b>${esc(r.nickname)}</b></a> ${lvChip(r.level)}${r.status !== 'active' ? ' <span class="chip">휴면</span>' : ''}<br><small class="muted">${esc(r.name || '')}</small>`, get: r => r.nickname },
    { label: '가입', get: r => fmtDate(r.created_at) }, { label: '최근 접속', get: r => r.last_seen_at ? ago(r.last_seen_at) : '-', csv: r => r.last_seen_at || '' },
    { label: '활동한 날', key: 'active_days', num: 1 }, { label: '화면', key: 'views', num: 1 }, { label: '머문 시간', num: 1, get: r => dur(r.secs || 0), csv: r => r.secs },
    { label: '그룹 모임 출석', key: 'checkins', num: 1 }, { label: '도전 기록', key: 'done', num: 1 }, { label: '글·댓글', key: 'talk', num: 1 }, { label: '정기모임 출석', key: 'attended', num: 1 }, { label: '참여 그룹', key: 'groups', num: 1 }, { label: '포인트', key: 'points', num: 1 },
  ];
  const SORTS = { active: (a, b) => b.active_days - a.active_days || b.views - a.views, recent: (a, b) => (a.created_at < b.created_at ? 1 : -1), seen: (a, b) => String(b.last_seen_at || '').localeCompare(String(a.last_seen_at || '')), points: (a, b) => b.points - a.points, quiet: (a, b) => a.active_days - b.active_days || String(a.last_seen_at || '').localeCompare(String(b.last_seen_at || '')) };
  const listHtml = (sort, q) => table('members', listCols, d.list.filter(r => !q || (r.nickname + ' ' + (r.name || '')).includes(q)).sort(SORTS[sort]), { emptyText: '회원이 없습니다' });
  return {
    period: d.period,
    body: `<div class="kpi-grid kpi-3">
        ${T('정회원', d.members, null, '명', '오리엔테이션을 마친 활동 회원(L1 이상)')}${T('오늘 활동 회원 (DAU)', d.dau, null, '명', '오늘 회원 공간 방문 또는 기록이 있는 회원')}${T('7일 활동 회원 (WAU)', d.wau, null, '명', '최근 7일')}
        ${T('30일 활동 회원 (MAU)', d.mau, null, '명', '최근 30일')}${T('고착도 (DAU ÷ MAU)', d.stickiness, null, '%', '한 달 활동 회원 중 오늘도 들어온 비율')}${T('잠든 회원', d.dormant, null, '명', '30일 넘게 접속하지 않은 정회원', { better: 'down' })}
      </div>
      <div class="trend-grid trend-3">${chart('가입 신청', d.series.applications, L, '건')}${chart('새 회원', d.series.signups, L, '명')}${chart('활동 회원', d.series.active, L, '명', '구간마다 활동한 회원 수')}</div>
      <div class="adm-two">
        ${sec('가입 흐름', hbars(d.funnel, { showPct: true }) + '<p class="small muted" style="margin:10px 0 0">위 세 줄은 기간 안에 들어온 신청서, 아래 세 줄은 기간 안에 가입한 회원 기준입니다.</p>', { sub: '이 기간' })}
        <div class="stack">
          ${sec('등급 분포', hbars(d.levels.map(l => [`${l.level} ${l.name}`, l.n])))}
          ${sec('가입 월별 최근 30일 활동률', table('cohorts', [{ label: '가입 월', key: 'month' }, { label: '회원', key: 'members', num: 1 }, { label: '최근 30일 활동', key: 'active', num: 1 }, { label: '활동률', num: 1, get: r => pct(r.rate) }], d.cohorts), { csv: 'cohorts', flush: true })}
        </div>
      </div>
      <section class="card flush"><div class="card-head pad"><h3>회원별 활동 <small class="muted">이 기간</small></h3><div class="row"><input type="search" class="mini-input" id="kpi-mq" placeholder="닉네임·이름"><select class="mini-input" id="kpi-ms"><option value="active">활동한 날 많은 순</option><option value="quiet">조용한 회원 먼저</option><option value="seen">최근 접속순</option><option value="recent">최근 가입순</option><option value="points">포인트순</option></select>${csvBtn('members')}</div></div><div id="kpi-mlist">${listHtml('active', '')}</div></section>`,
    mount(root) {
      const re = () => { root.querySelector('#kpi-mlist').innerHTML = listHtml(root.querySelector('#kpi-ms').value, root.querySelector('#kpi-mq').value.trim()); };
      root.querySelector('#kpi-ms').addEventListener('change', re);
      root.querySelector('#kpi-mq').addEventListener('input', re);
    },
  };
}

async function groups(P, query) {
  const d = await api('/admin/kpi/groups' + qs({ ...P }));
  const L = labelsFor(d.period, d.labels); const t = d.totals;
  const STAGE = { recruiting: '모집 중', active: '진행 중', closed: '종료', stopped: '중단' };
  return {
    period: d.period,
    body: `<div class="kpi-grid kpi-4">
        ${T('새로 만든 그룹', t.opened, null, '개', `학습그룹 ${t.study}개 · 도전그룹 ${t.challenge}개`)}${T('모집·진행 중인 그룹', t.running, null, '개', '지금 기준')}${T('그룹 평균 인원', t.avg_size, null, '명', `진행 그룹 기준 · 정원 대비 ${pct(t.fill_rate)}`)}${T('회원 그룹 참여율', t.participation, null, '%', `정회원 ${t.members}명 중 그룹에 있는 ${t.in_group}명`)}
        ${T('그룹 모임 출석률', t.group_attendance, null, '%', `이 기간 마감한 모임 ${num(t.sessions)}번 · 공결 제외`)}${T('출석 경고', t.warnings, null, '건', `출석 기준 퇴출 ${num(t.removed)}명`, { better: 'down' })}${T('중도 이탈률', t.dropout_rate, null, '%', '그룹에 들어온 사람 중 나가거나 퇴출된 비율', { better: 'down' })}${T('정기모임·일정 참석률', d.attendance.rate, null, '%', `이 기간 신청 ${d.attendance.registered}명 중 출석 ${d.attendance.attended}명`)}
      </div>
      <div class="trend-grid trend-3">${chart('새 그룹', d.series.opened, L, '개')}${chart('마감한 그룹 모임', d.series.sessions, L, '번')}
        <div class="card"><h3 class="small card-title">단계별 그룹 <small class="muted">지금</small></h3>${hbars(d.stages.map(s => [STAGE[s.stage] || s.stage, s.n]), { unit: '개' })}<h3 class="small card-title" style="margin-top:14px">분야별 개설 <small class="muted">이 기간</small></h3>${hbars(d.by_field.map(f => [f.name, f.n]), { unit: '개' })}</div></div>
      ${sec('그룹별 참여·출석·성과', table('groups', [
        { label: '그룹', html: r => `<a href="#/groups/${r.id}"><b>${esc(r.title)}</b></a><br><small class="muted">${esc(r.leader)} · ${esc(r.field_name || '')}</small>`, get: r => r.title },
        { label: '단계', html: r => `${typeChip(r.type)} ${stageChip(r.stage)}`, get: r => STAGE[r.stage] || r.stage },
        { label: '신청', key: 'applied', num: 1 }, { label: '받음', key: 'accepted', num: 1 },
        { label: '활동 인원', num: 1, get: r => `${r.active}/${r.capacity}`, csv: r => r.active }, { label: '정원 대비', num: 1, get: r => pct(r.fill_rate) },
        { label: '마감한 모임', key: 'sessions', num: 1 }, { label: '출석률', num: 1, get: r => pct(r.checkin_rate) }, { label: '경고', key: 'warnings', num: 1 }, { label: '출석 퇴출', key: 'removed_att', num: 1 },
        { label: '도전 기록', key: 'done', num: 1 }, { label: '성과 기록', key: 'results', num: 1 }, { label: '목표 진행', num: 1, get: r => r.goal_rate == null ? '-' : pct(r.goal_rate), csv: r => r.goal_rate }, { label: '매출 기록', num: 1, get: r => r.revenue ? won(r.revenue) : '-', csv: r => r.revenue },
      ], d.groups, { emptyText: '아직 그룹이 없습니다' }), { csv: 'groups', flush: true, sub: '모집·진행 중인 그룹 먼저' })}
      ${sec('정기모임·일정 참석', table('events', [
        { label: '일정', html: r => `<a href="#/events/${r.id}"><b>${esc(r.title)}</b></a>${r.status === 'cancelled' ? ' <span class="chip red">취소</span>' : ''}<br><small class="muted">${esc(EVENT_TYPES[r.type] || r.type)}</small>`, get: r => r.title },
        { label: '일시', get: r => fmtLocal(r.starts_at) }, { label: '정원', num: 1, get: r => r.capacity || '제한 없음' },
        { label: '신청', key: 'registered', num: 1 }, { label: '출석', key: 'attended', num: 1 }, { label: '참석률', num: 1, get: r => pct(r.attend_rate) }, { label: '발표', key: 'presentations', num: 1 }, { label: '정원 대비 신청', num: 1, get: r => pct(r.fill_rate) },
      ], d.events, { emptyText: '이 기간에 열린 일정이 없습니다' }), { csv: 'events', flush: true, sub: '이 기간에 열린 일정' })}`,
  };
}

async function community(P, query) {
  const d = await api('/admin/kpi/community' + qs({ ...P }));
  const L = labelsFor(d.period, d.labels);
  return {
    period: d.period,
    body: `<div class="kpi-grid kpi-4">
        ${T('새 글·댓글', d.cur.posts + d.cur.comments, d.prev.posts + d.prev.comments, '개', `글 ${d.cur.posts} · 댓글 ${d.cur.comments} · 숨긴 글과 운영진 글 제외`)}${T('도움돼요', d.cur.helpful, d.prev.helpful, '회', '회원이 다른 글에 누른 수')}${T('글·댓글 쓴 회원', d.writers, null, '명', '이 기간 한 번이라도 쓴 회원')}${T('질문 답변율', d.questions.rate, null, '%', `질문 ${d.questions.n}개 중 다른 회원이 답한 ${d.questions.answered}개`)}
      </div>
      <div class="trend-grid trend-3">${chart('새 글', d.series.posts, L, '개')}${chart('댓글', d.series.comments, L, '개')}
        <div class="card"><h3 class="small card-title">게시판별 글</h3>${d.by_board.length ? hbars(d.by_board.map(b => [BOARDS[b.board] || b.board, b.n]), { unit: '개' }) : '<p class="muted small">자료 없음</p>'}</div></div>
      <div class="adm-two wide-left">
        ${sec('반응이 많았던 글', table('posts', [
          { label: '글', html: r => `<a href="/app/#/community/posts/${r.id}"><b>${esc(r.title)}</b></a><br><small class="muted">${esc(BOARDS[r.board] || r.board)} · ${esc(r.nickname)} · ${fmtDate(r.created_at)}</small>`, get: r => r.title },
          { label: '읽음', key: 'views', num: 1 }, { label: '읽은 사람', key: 'readers', num: 1 }, { label: '댓글', key: 'comments', num: 1 }, { label: '도움돼요', key: 'helpful_count', num: 1 },
        ], d.top, { emptyText: '이 기간에 쓴 글이 없습니다' }), { csv: 'posts', flush: true })}
        ${sec('많이 참여한 회원', table('contributors', [{ label: '회원', html: r => `<a href="#/users/${r.id}">${esc(r.nickname)}</a> ${lvChip(r.level)}`, get: r => r.nickname }, { label: '글', key: 'posts', num: 1 }, { label: '댓글', key: 'comments', num: 1 }], d.contributors, { emptyText: '자료가 없습니다' }), { csv: 'contributors', flush: true })}
      </div>`,
  };
}

const VIEWS = { summary, traffic, content, members, groups, community };

export async function kpiPage({ query }) {
  const tab = VIEWS[query.tab] ? query.tab : 'summary';
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const custom = DAY.test(query.start || '');
  const range = !custom && RANGES.some(([r]) => String(r) === String(query.range)) ? Number(query.range) : 30;
  // API와 탭 주소에 함께 넘기는 기간
  const P = custom ? { start: query.start, end: DAY.test(query.end || '') ? query.end : '' } : { range: range === 30 ? '' : range };
  for (const k of Object.keys(TABLES)) delete TABLES[k];
  const out = await VIEWS[tab](P, query);
  const pd = out.period;
  const f = d => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
  const tabHref = k => '#/kpi' + qs({ tab: k === 'summary' ? '' : k, ...P });
  const rangeHref = r => '#/kpi' + qs({ tab: tab === 'summary' ? '' : tab, range: r === 30 ? '' : r });
  const body = `<div class="toolbar kpi-bar"><div class="pill-tabs">${TABS.map(([k, l]) => `<a href="${tabHref(k)}" class="${tab === k ? 'active' : ''}">${l}</a>`).join('')}</div>
      <div class="row"><span class="muted small">${f(pd.start)} ~ ${f(pd.end)} · ${pd.range}일 · 바로 앞 ${pd.range}일과 비교</span><div class="pill-tabs sm">${RANGES.map(([r, l]) => `<a href="${rangeHref(r)}" class="${!custom && range === r ? 'active' : ''}">${l}</a>`).join('')}<a href="#" data-kpi-custom class="${custom ? 'active' : ''}">직접 고르기</a></div></div>
      <form class="kpi-range" data-form="krange"${custom ? '' : ' hidden'}><input type="date" name="start" value="${pd.start}" max="${pd.end}" aria-label="시작일"><span class="muted">~</span><input type="date" name="end" value="${pd.end}" aria-label="마지막 날"><button class="btn sm primary" type="submit">보기</button><span class="muted small">최대 1년</span></form></div>
    <div class="kpi-body">${out.note || ''}${out.body}</div>
    <p class="small muted" style="margin-top:14px">운영진 방문과 검색 로봇은 세지 않습니다. 브라우저에서 '추적 안 함'을 켠 방문자도 세지 않으므로 실제보다 조금 적게 나올 수 있습니다. 지표 정의는 저장소의 <code>docs/KPI-정의.md</code>에 있습니다.</p>`;
  return {
    title: 'KPI 지표', sub: '방문부터 가입, 모임 참여, 성과까지 한 화면에서 봅니다.', body,
    mount(root) {
      root.addEventListener('click', e => { const b = e.target.closest('[data-csv]'); if (!b) return; if (!TABLES[b.dataset.csv]?.rows.length) return toast('내려받을 자료가 없습니다', true); downloadCsv(b.dataset.csv, pd); });
      const form = root.querySelector('form[data-form=krange]');
      root.querySelector('[data-kpi-custom]').addEventListener('click', e => { e.preventDefault(); form.hidden = !form.hidden; if (!form.hidden) form.querySelector('input').focus(); });
      form.addEventListener('submit', e => {
        e.preventDefault();
        let s = form.start.value, en = form.end.value;
        if (!DAY.test(s) || !DAY.test(en)) return toast('시작일과 마지막 날을 골라 주세요', true);
        if (s > en) [s, en] = [en, s];
        go('#/kpi' + qs({ tab: tab === 'summary' ? '' : tab, start: s, end: en }));
      });
      if (out.mount) out.mount(root);
    },
  };
}
