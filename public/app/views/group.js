// 그룹 — 학습그룹·도전그룹 목록, 만들기, 그룹 공간(홈·모임·출석·기록·목표·성과·그룹원·설정·페이퍼)
import {
  api, post, put, esc, nl2br, state, toast, go, reload, field, input, textarea, select, check, bindForms, bindActions, stat, num, won, fmtDate, fmtLocal, ago,
  FIELDS, ROLES, TYPE, GOAL_METRICS, LOG_KINDS, ATTEND, attendChip, metricVal, lvChip, stageChip, typeChip, fieldChip, pageHead, empty, progressBar, tabs, modal, closeModal, getSettings,
} from '../core.js';

const kstNow = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16);
const dday = s => { const d = Math.ceil((Date.parse(s.slice(0, 16) + ':00+09:00') - Date.now()) / 86400e3); return d <= 0 ? '오늘' : d === 1 ? '내일' : `${d}일 뒤`; };
const modeLabel = m => (m === 'offline' ? '오프라인' : '온라인');
const isUrl = s => /^https?:\/\//i.test(s || '');
const rateText = st => (st && st.rate != null ? `${st.rate}%` : '-');

// 출석 규칙을 사람이 읽는 문장으로
export function policyLines(p) {
  const out = [];
  if (p.min_rate > 0) out.push(`출석률 ${p.min_rate}% 이상을 지켜 주세요. 모임이 ${p.rate_after}번 쌓인 뒤부터 확인합니다.`);
  out.push(`시작 ${p.late_minutes}분이 지나면 지각입니다.${p.late_per_absence > 0 ? ` 지각 ${p.late_per_absence}번은 결석 1번으로 셉니다.` : ''}`);
  const warn = [];
  if (p.warn_absences > 0) warn.push(`연속 결석 ${p.warn_absences}번`);
  if (p.warn_on_low_rate && p.min_rate > 0) warn.push('출석률이 기준 아래로 내려가면');
  if (warn.length) out.push(`${warn.join(' 또는 ')} 경고를 받습니다.`);
  if (p.kick_warnings > 0) out.push(`경고가 ${p.kick_warnings}번 쌓이면 ${p.auto_remove ? '그룹에서 자동으로 나가게 됩니다' : '그룹리더가 확인한 뒤 그룹에서 나가게 될 수 있습니다'}.`);
  out.push(p.excuse ? `모임 전에 불참 사유를 남기면 공결로 인정합니다 (최대 ${p.excuse_limit}번).` : '공결은 따로 인정하지 않습니다.');
  return out;
}

function goalBar(g) {
  if (!g || !g.target) return g ? `<div class="small muted">${esc(g.metric_name)} 누적 <b>${metricVal(g.metric, g.value, g.unit)}</b></div>` : '';
  return `<div class="goal-bar"><div class="row between small"><span>${esc(g.metric_name)} 목표 ${metricVal(g.metric, g.target, g.unit)}</span><b>${metricVal(g.metric, g.value, g.unit)} · ${Math.round((g.ratio || 0) * 100)}%</b></div>${progressBar(g.value, g.target)}</div>`;
}

// ---------------- 그룹 목록 ----------------
export async function board({ me, query }) {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(query).filter(([, v]) => v))).toString();
  const list = await api('/groups' + (qs ? '?' + qs : ''));
  const canLead = me.can_lead || me.role === 'staff';
  const tab = query.mine ? 'mine' : (query.type || 'all');
  const href = o => '#/groups?' + new URLSearchParams(Object.fromEntries(Object.entries({ ...o }).filter(([, v]) => v))).toString();
  const html = `<div class="wrap page">
    ${pageHead('그룹', '정기모임에서 나온 관심사로 그룹을 만들고, 그룹리더와 함께 목표에 도전합니다. 학습그룹은 함께 공부하고, 도전그룹은 프로젝트로 성과와 수익에 도전합니다.',
      canLead ? '<a class="btn primary" href="#/groups/new">그룹 만들기</a>' : '<a class="btn" href="#/me/leader">그룹리더 신청</a>')}
    <div class="grid grid-2 group-kinds">
      <div class="card soft"><div class="row" style="gap:8px">${typeChip('study')}<b>학습그룹</b></div><p class="small muted" style="margin:6px 0 0">AI 활용, 마케팅, 세금처럼 한 분야를 정해 4~8주 동안 함께 공부하고 정리합니다.</p></div>
      <div class="card soft"><div class="row" style="gap:8px">${typeChip('challenge')}<b>도전그룹</b></div><p class="small muted" style="margin:6px 0 0">하나의 프로젝트를 정해 목표 숫자(매출·고객·사용자)를 세우고, 기록하고, 발표합니다.</p></div>
    </div>
    <div class="toolbar" style="margin-top:14px">
      <div class="pill-tabs">${[['all', '전체', {}], ['study', '학습그룹', { type: 'study' }], ['challenge', '도전그룹', { type: 'challenge' }], ['mine', '내 그룹', { mine: '1' }]].map(([k, l, o]) => `<a href="${href({ ...o, field: query.field, stage: query.stage })}" class="${tab === k ? 'active' : ''}">${l}</a>`).join('')}</div>
      <form class="filters" data-form="filter" style="margin:0">
        <select name="field">${[['', '모든 분야'], ...Object.entries(FIELDS)].map(([v, l]) => `<option value="${v}" ${query.field === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select name="stage">${[['', '모집·진행 중'], ['recruiting', '모집 중'], ['active', '진행 중'], ['closed', '종료'], ['all', '전체']].map(([v, l]) => `<option value="${v}" ${(query.stage || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input type="search" name="q" value="${esc(query.q || '')}" placeholder="그룹 이름 검색" class="mini-input">
        <button class="btn sm" type="submit">찾기</button>
      </form>
    </div>
    ${list.length ? `<div class="grid grid-3" style="margin-top:12px">${list.map(groupCard).join('')}</div>` : empty('조건에 맞는 그룹이 없습니다', canLead ? '직접 그룹을 만들어 보세요' : '정기모임에서 함께할 사람을 찾아 보거나, 그룹리더를 신청해 직접 열어 보세요', canLead ? '<a class="btn primary" href="#/groups/new">그룹 만들기</a>' : '<a class="btn" href="#/me/leader">그룹리더 신청</a>')}
  </div>`;
  return { html, mount(root) { bindForms(root, { filter(d) { go(href({ type: query.type, mine: query.mine, field: d.field, stage: d.stage, q: d.q?.trim() })); } }); } };
}

export function groupCard(c) {
  const full = c.member_count >= c.capacity;
  const my = c.my_status === 'active' ? '<span class="chip blue">참여 중</span>' : c.my_status === 'applied' ? '<span class="chip amber">신청함</span>' : '';
  const goal = c.goal_metric && c.goal_target ? `<div class="ch-goal">${progressBar(c.goal_value, c.goal_target)}<small>${esc(c.goal_metric_name)} ${metricVal(c.goal_metric, c.goal_value, c.goal_unit)} / ${metricVal(c.goal_metric, c.goal_target, c.goal_unit)}</small></div>` : (c.goal_text ? `<div class="ch-goal small muted">목표 · ${esc(c.goal_text)}</div>` : '');
  return `<a class="card clickable ch-card" href="#/groups/${c.id}">
    <div class="ch-top">${typeChip(c.type)}${stageChip(c.stage)}${fieldChip(c.field_code)}${my}</div>
    <h3>${esc(c.title)}</h3>
    <div class="ch-summary">${esc(c.summary || '')}</div>
    ${goal}
    <div class="ch-meta small muted">${c.schedule_text ? esc(c.schedule_text) + ' · ' : ''}${c.next_session_at ? `다음 모임 ${fmtLocal(c.next_session_at).slice(5)}` : `모임 ${num(c.sessions_done)}번 진행`}</div>
    <div class="ch-foot"><span>리더 ${esc(c.leader_nickname)} · ${c.member_count}/${c.capacity}명</span><span>${c.stage === 'closed' ? '' : full ? '정원 마감' : !c.recruit_open ? '모집 쉼' : c.join_mode === 'open' ? '바로 참여' : '리더 승인'}</span></div>
  </a>`;
}

// ---------------- 그룹 만들기 · 설정 폼 ----------------
const TEMPLATES = {
  study: { goal_text: '6주 동안 매주 하나씩 실습하고, 정리 노트 6편을 함께 공개한다', goal_metric: 'study', goal_target: 6, schedule_text: '매주 수요일 21시 온라인 60분',
    milestones: ['1주차: 각자 배우고 싶은 것 정리', '3주차: 중간 실습 결과 공유', '6주차: 정리 노트 공개 · 정기모임 발표'] },
  challenge: { goal_text: '8주 안에 첫 유료 고객 3명, 매출 30만 원', goal_metric: 'revenue', goal_target: 300000, schedule_text: '매주 화요일 21시 온라인 90분 · 월 1회 오프라인',
    milestones: ['2주차: 고객 후보 10명 인터뷰', '4주차: 첫 판매 페이지 공개', '6주차: 첫 매출', '8주차: 성과발표회 발표'] },
};
function policyFields(p) {
  const n = (name, v, min, max, unit) => `<div class="unit-input">${input(name, { type: 'number', value: v, min, max })}<span>${unit}</span></div>`;
  return `<div class="form-cols">${field('최소 출석률', n('policy.min_rate', p.min_rate, 0, 100, '%'), '0이면 출석률 기준을 쓰지 않습니다')}${field('출석률 확인 시작', n('policy.rate_after', p.rate_after, 1, 20, '번째 모임부터'))}</div>
    <div class="form-cols">${field('지각 기준', n('policy.late_minutes', p.late_minutes, 0, 120, '분 지나면'))}${field('지각 환산', n('policy.late_per_absence', p.late_per_absence, 0, 10, '번 = 결석 1번'), '0이면 환산하지 않습니다')}</div>
    <div class="form-cols">${field('연속 결석 경고', n('policy.warn_absences', p.warn_absences, 0, 10, '번 연속이면 경고'), '0이면 쓰지 않습니다')}${field('퇴출 기준', n('policy.kick_warnings', p.kick_warnings, 0, 10, '번 경고면 퇴출 대상'), '0이면 퇴출 기준이 없습니다')}</div>
    <div class="form-cols">${field('공결 인정 횟수', n('policy.excuse_limit', p.excuse_limit, 0, 20, '번까지'))}${field('출석 코드 입력', n('policy.checkin_before', p.checkin_before, 0, 180, '분 전부터'))}</div>
    <div class="row" style="gap:14px;flex-wrap:wrap">${check('policy.warn_on_low_rate', '출석률이 기준 아래로 내려가면 경고', p.warn_on_low_rate)}${check('policy.excuse', '모임 전 불참 사유는 공결로 인정', p.excuse)}${check('policy.auto_remove', '퇴출 기준에 닿으면 자동으로 내보내기 (끄면 리더가 확인 후 결정)', p.auto_remove)}</div>`;
}
function collect(d) {
  const out = { policy: {} };
  for (const [k, v] of Object.entries(d)) { if (k.startsWith('policy.')) out.policy[k.slice(7)] = v; else out[k] = v; }
  return out;
}
function groupForm(g, { create = false, settings }) {
  const p = g.policy || settings.attendance_default;
  return `
    ${create ? field('그룹 종류', `<div class="radio-cards"><label class="radio-card"><input type="radio" name="type" value="study" ${g.type === 'study' ? 'checked' : ''}><div><b>학습그룹</b><small>한 분야를 정해 함께 공부하고 정리합니다. 예: AI 업무 자동화, 숏폼 기획, 부업 세금</small></div></label><label class="radio-card"><input type="radio" name="type" value="challenge" ${g.type !== 'study' ? 'checked' : ''}><div><b>도전그룹</b><small>하나의 프로젝트로 성과·수익 목표에 도전합니다. 예: 전자책 판매, 동네 가게 SNS 대행</small></div></label></div>`) : ''}
    <div class="form-cols">${field('그룹 이름 *', input('title', { value: g.title || '', required: true, placeholder: '예: AI로 상세페이지 만들기 스터디' }))}${field('분야 *', `<select name="field_code">${Object.entries(FIELDS).map(([k, v]) => `<option value="${k}" ${g.field_code === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}</div>
    ${field('한 줄 소개 *', input('summary', { value: g.summary || '', required: true, placeholder: '그룹 목록 카드에 보이는 문장입니다 (120자 이내)' }))}
    ${field('자세한 소개', textarea('description', { value: g.description || '', rows: 5, placeholder: '무엇을 함께 하는지, 어떤 사람과 하고 싶은지, 모임은 어떻게 진행되는지 적어 주세요' }))}
    <h3 class="form-section">목표</h3>
    ${create ? `<p class="small muted" style="margin:-4px 0 8px">예시로 채우기: <button class="btn sm" type="button" data-act="tpl" data-k="study">학습그룹 예시</button> <button class="btn sm" type="button" data-act="tpl" data-k="challenge">도전그룹 예시</button></p>` : ''}
    ${field('그룹 목표', input('goal_text', { value: g.goal_text || '', placeholder: '예: 8주 안에 첫 유료 고객 3명, 매출 30만 원' }), '도전그룹은 마지막에 닿고 싶은 성과·수익 숫자를, 학습그룹은 끝까지 해낼 학습 목표를 적어 주세요')}
    <div class="form-cols">${field('목표로 세는 숫자', `<select name="goal_metric"><option value="">숫자 목표 없음</option>${Object.entries(GOAL_METRICS).map(([k, [n, u]]) => `<option value="${k}" ${g.goal_metric === k ? 'selected' : ''}>${n}${u ? ` (${u})` : ''}</option>`).join('')}</select>`)}${field('목표 수치', input('goal_target', { type: 'number', value: g.goal_target ?? '', min: 0, placeholder: '예: 300000' }), '성과 기록이 쌓이면 진행률이 올라갑니다')}</div>
    <div class="form-cols">${field('시작일', input('start_date', { type: 'date', value: g.start_date || '' }))}${field('끝나는 날', input('end_date', { type: 'date', value: g.end_date || '' }))}</div>
    ${create ? field('마일스톤', [0, 1, 2, 3].map(i => `<div class="form-cols" style="margin-bottom:6px"><input type="text" name="ms_title_${i}" placeholder="${i + 1}. 예: 4주차 첫 판매 페이지 공개"><input type="date" name="ms_date_${i}"></div>`).join(''), '나중에 목표·성과 탭에서 더하거나 고칠 수 있습니다') : ''}
    <h3 class="form-section">모임 방식</h3>
    <div class="form-cols">${field('모이는 주기', input('schedule_text', { value: g.schedule_text || '', placeholder: '예: 매주 화요일 21시 온라인' }))}${field('주로 모이는 곳', input('place', { value: g.place || '', placeholder: '예: 줌 / 성수동 공유 라운지' }))}</div>
    <div class="form-cols">${field('정원 (그룹리더 포함)', input('capacity', { type: 'number', value: g.capacity || settings.groups.capacity_default, min: 2, max: settings.groups.capacity_max }))}${field('참여 방식', `<select name="join_mode"><option value="approval" ${g.join_mode !== 'open' ? 'selected' : ''}>리더가 신청을 보고 승인</option><option value="open" ${g.join_mode === 'open' ? 'selected' : ''}>누구나 바로 참여</option></select>`)}</div>
    ${field('그룹 대화방 링크', input('chat_url', { value: g.chat_url || '', placeholder: 'https://open.kakao.com/…' }), '그룹원에게만 보입니다')}
    ${!create ? check('recruit_open', '새 그룹원을 받습니다', !!g.recruit_open) : ''}
    <h3 class="form-section">출석 규칙</h3>
    <p class="small muted" style="margin:-4px 0 8px">그룹리더가 정합니다. 그룹원은 참여하기 전에 이 규칙을 확인하고, 모임마다 출석 코드로 출석합니다.</p>
    ${policyFields(p)}`;
}

export async function create({ me }) {
  const settings = await getSettings();
  if (!(me.can_lead || me.role === 'staff')) {
    return `<div class="wrap page" style="max-width:720px">${pageHead('그룹 만들기')}<div class="card"><h3>그룹리더 승인이 필요합니다</h3><p>그룹은 운영진의 승인을 받은 그룹리더가 언제든 만들 수 있습니다. 어떤 그룹을 이끌고 싶은지 적어 신청해 주세요. 보통 5일 안에 결과를 알려 드립니다.</p><a class="btn primary" href="#/me/leader">그룹리더 신청하기</a></div></div>`;
  }
  const html = `<div class="wrap page" style="max-width:820px">
    ${pageHead('그룹 만들기', '만들면 바로 그룹 목록에 올라가 모집이 시작됩니다. 운영진이 함께 지켜보고, 필요하면 연락드립니다.', '<a class="btn" href="#/groups">← 그룹 목록</a>')}
    <form class="card form" data-form="g">${groupForm({ type: 'challenge' }, { create: true, settings })}<div class="form-error error"></div><button class="btn primary lg block" type="submit">그룹 만들기</button></form></div>`;
  return { html, mount(root) {
    bindActions(root, { tpl(el) {
      const t = TEMPLATES[el.dataset.k]; const f = root.querySelector('form');
      f.querySelector(`input[name=type][value=${el.dataset.k}]`).checked = true;
      f.goal_text.value = t.goal_text; f.goal_metric.value = t.goal_metric; f.goal_target.value = t.goal_target; f.schedule_text.value = t.schedule_text;
      t.milestones.forEach((m, i) => { if (f[`ms_title_${i}`]) f[`ms_title_${i}`].value = m; });
    } });
    bindForms(root, { async g(d) {
      const b = collect(d);
      b.milestones = [0, 1, 2, 3].map(i => ({ title: d[`ms_title_${i}`], due_date: d[`ms_date_${i}`] })).filter(m => m.title);
      const r = await post('/groups', b);
      await state.refreshMe();
      toast('그룹을 만들었습니다. 첫 모임 일정을 잡아 보세요');
      go(`#/groups/${r.id}/sessions`);
    } });
  } };
}

// ---------------- 그룹 공간 ----------------
const TABS = [['home', '홈'], ['sessions', '모임·출석'], ['records', '도전 기록'], ['goals', '목표·성과'], ['members', '그룹원'], ['paper', '페이퍼'], ['settings', '설정']];

export async function space({ params, me, query }) {
  const tab = TABS.some(([k]) => k === params.tab) ? params.tab : 'home';
  const d = await api('/groups/' + params.id);
  const settings = await getSettings();
  const g = d.group, mine = d.me;
  const visible = TABS.filter(([k]) => (k !== 'settings' || mine.is_leader) && (k !== 'paper' || mine.is_leader || d.paper || g.stage === 'closed'));
  const views = { home: tabHome, sessions: tabSessions, records: tabRecords, goals: tabGoals, members: tabMembers, paper: tabPaper, settings: tabSettings };
  const body = views[tab](d, me, settings);
  const m = mine.membership;
  const actions = [];
  if (d.join.can) actions.push(`<button class="btn primary" data-act="join">${d.join.mode === 'open' ? '바로 참여하기' : '참여 신청'}</button>`);
  if (mine.is_member && g.chat_url) actions.push(`<a class="btn" href="${esc(g.chat_url)}" target="_blank" rel="noopener">그룹 대화방</a>`);
  if (mine.is_leader && g.stage === 'recruiting') actions.push('<button class="btn" data-act="stage" data-to="active">진행 시작</button>');
  if (mine.is_leader && ['recruiting', 'active'].includes(g.stage)) actions.push('<button class="btn" data-act="close">그룹 종료</button>');
  if (m && ['active', 'applied'].includes(m.status) && m.role !== 'leader') actions.push(`<button class="btn ghost" data-act="leave">${m.status === 'applied' ? '신청 취소' : '그룹 나가기'}</button>`);
  const html = `<div class="wrap page">
    <div class="row" style="margin-bottom:8px;gap:6px">${typeChip(g.type)}${stageChip(g.stage)}${fieldChip(g.field_code)}${m?.status === 'active' ? `<span class="chip blue">${ROLES[m.role] || m.role}</span>` : ''}</div>
    ${pageHead(esc(g.title), esc(g.summary || ''), actions.join(''))}
    ${noticeBar(d)}
    ${tabs(visible.map(([k, l]) => [k, l, `#/groups/${g.id}${k === 'home' ? '' : '/' + k}`]), tab)}
    ${typeof body === 'string' ? body : body.html}
  </div>`;
  return { html, async mount(root) {
    bindActions(root, {
      join() {
        modal(`<h3>${d.join.mode === 'open' ? '그룹에 참여하기' : '참여 신청'}</h3>${d.join.rejoin ? '<p class="small notice warn">이전에 이 그룹에서 나간 기록이 있어 그룹리더의 승인을 거칩니다.</p>' : ''}
          <div class="card soft small"><b>이 그룹의 출석 규칙</b><ul class="rule-list">${policyLines(g.policy).map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>
          <form class="form" data-form="j" style="margin-top:12px">${field('그룹리더에게 한마디', textarea('note', { rows: 3, placeholder: '이 그룹에서 해 보고 싶은 것, 쓸 수 있는 시간을 짧게 적어 주세요' }))}${check('agree', '출석 규칙을 확인했습니다')}<div class="btn-row"><button class="btn primary" type="submit">${d.join.mode === 'open' ? '참여하기' : '신청 보내기'}</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`,
        { onMount(mm) { bindForms(mm, { async j(f) { if (!f.agree) throw new Error('출석 규칙을 확인해 주세요'); const r = await post(`/groups/${g.id}/join`, { note: f.note }); closeModal(); await state.refreshMe(); toast(r.status === 'active' ? '그룹에 참여했습니다' : '신청을 보냈습니다. 그룹리더가 확인하면 알려 드립니다'); reload(); } }); } });
      },
      leave() {
        modal(`<h3>${m.status === 'applied' ? '참여 신청 취소' : '그룹 나가기'}</h3><form class="form" data-form="l">${field('이유 (그룹리더에게 전달됩니다)', textarea('note', { rows: 2 }))}<div class="btn-row"><button class="btn danger" type="submit">${m.status === 'applied' ? '신청 취소' : '나가기'}</button><button class="btn" type="button" data-close-modal>닫기</button></div></form>`,
          { onMount(mm) { bindForms(mm, { async l(f) { await post(`/groups/${g.id}/leave`, f); closeModal(); await state.refreshMe(); toast('처리했습니다'); reload(); } }); } });
      },
      async stage(el) { await post(`/groups/${g.id}/stage`, { stage: el.dataset.to }); toast('그룹을 시작했습니다'); reload(); },
      close() {
        modal(`<h3>그룹 종료</h3><p class="small">종료하면 열려 있는 출석은 마감되고, 앞으로 잡힌 모임은 취소됩니다. 출석 기준(${g.policy.min_rate ? `출석률 ${g.policy.min_rate}% 이상` : '마감한 모임 1번 이상'})을 채운 그룹원은 완주 배지를 받습니다. 끝난 그룹은 운영진만 다시 열 수 있습니다.</p><div class="btn-row"><button class="btn primary" data-act="doclose">종료하기</button><button class="btn" data-close-modal>취소</button></div>`,
          { onMount(mm) { bindActions(mm, { async doclose() { const r = await post(`/groups/${g.id}/stage`, { stage: 'closed' }); closeModal(); const ok = r.completion.filter(x => x.completed).length; toast(`그룹을 마쳤습니다. 완주 ${ok}명`); go(`#/groups/${g.id}/paper`); } }); } });
      },
      appeal() {
        modal(`<h3>이의 신청</h3><p class="small muted">운영진이 그룹리더와 함께 확인하고 결과를 알려 드립니다.</p><form class="form" data-form="ap">${field('어떤 사정이 있었나요?', textarea('note', { rows: 4, required: true }))}<div class="btn-row"><button class="btn primary" type="submit">보내기</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`,
          { onMount(mm) { bindForms(mm, { async ap(f) { await post(`/groups/${g.id}/appeal`, f); closeModal(); toast('이의 신청을 보냈습니다'); } }); } });
      },
      ...(body.actions || {}),
    });
    if (body.mount) await body.mount(root);
  } };
}

function noticeBar(d) {
  const g = d.group, m = d.me.membership, me = d.me;
  if (g.stage === 'stopped') return '<div class="notice danger">운영진이 이 그룹을 중단했습니다. 기록은 그대로 볼 수 있습니다.</div>';
  if (g.stage === 'closed') return `<div class="notice">마무리된 그룹입니다${g.closed_at ? ` (${fmtDate(g.closed_at)})` : ''}. 기록과 성과는 그대로 남아 있습니다.</div>`;
  if (m?.status === 'removed') return `<div class="notice danger">이 그룹에서 나가게 되었습니다${m.leave_note ? ` · ${esc(m.leave_note)}` : ''}. 사정이 있었다면 <button class="btn sm" data-act="appeal">이의 신청</button></div>`;
  if (m?.status === 'applied') return '<div class="notice">참여 신청을 보냈습니다. 그룹리더가 확인하면 알림을 드립니다.</div>';
  if (me.is_member && me.warnings.length) return `<div class="notice warn"><b>출석 경고 ${me.warnings.length}회</b>${g.policy.kick_warnings ? ` (퇴출 기준 ${g.policy.kick_warnings}회)` : ''} · ${esc(me.warnings[me.warnings.length - 1].reason)}. 사정이 있다면 그룹리더에게 먼저 이야기해 주세요.</div>`;
  if (!me.is_member && !d.join.can && !me.is_staff) return `<div class="notice">${esc(d.join.reason)}</div>`;
  return '';
}

function sessionRow(s, d) {
  const g = d.group, mine = d.me;
  const st = s.status === 'cancelled' ? '<span class="chip">취소</span>' : s.status === 'open' ? '<span class="chip green">출석 받는 중</span>' : s.status === 'closed' ? '<span class="chip">마감</span>' : `<span class="chip blue">${dday(s.starts_at)}</span>`;
  const myLine = mine.is_member && s.status !== 'cancelled' ? (s.my_status ? attendChip(s.my_status) : s.my_rsvp === 'yes' ? '<span class="chip blue">참석 예정</span>' : s.my_rsvp === 'no' ? '<span class="chip amber">불참 알림</span>' : '') : '';
  return `<a class="list-item session-row" href="#/groups/${g.id}/sessions/${s.id}" style="color:inherit"><div class="grow"><div class="title">${esc(s.title)} ${st} ${myLine}</div>
    <div class="meta">${fmtLocal(s.starts_at)} · ${s.duration_min}분 · ${modeLabel(s.mode)}${s.place && !isUrl(s.place) ? ' · ' + esc(s.place) : ''}${s.status === 'closed' ? ` · 출석 ${s.attended}명` : s.rsvp_yes || s.rsvp_no ? ` · 참석 ${s.rsvp_yes} · 불참 ${s.rsvp_no}` : ''}</div>
    ${s.agenda ? `<div class="small muted clamp1">${esc(s.agenda)}</div>` : ''}</div><span class="muted">→</span></a>`;
}

function myAttendanceCard(d) {
  const me = d.me, g = d.group; const st = me.attendance;
  if (!me.is_member || !st) return '';
  const p = g.policy;
  const bad = p.min_rate > 0 && st.counted >= p.rate_after && st.rate < p.min_rate;
  return `<div class="card"><div class="card-head"><h3>내 출석</h3><a class="small" href="#/groups/${g.id}/sessions">모임 보기</a></div>
    <div class="grid grid-4 mini-stats">${stat('출석률', rateText(st), !bad)}${stat('출석·지각', `${st.present}·${st.late}`)}${stat('결석', num(st.absent))}${stat('공결', num(st.excused))}</div>
    <p class="small ${bad ? 'error' : 'muted'}" style="margin:10px 0 0">${st.counted ? `마감된 모임 ${st.counted + st.excused}번 기준${st.late_as_absence ? ` · 지각 ${st.late}번은 결석 ${st.late_as_absence}번으로 셉니다` : ''}${p.min_rate ? ` · 기준 ${p.min_rate}%` : ''}${me.warnings.length ? ` · 경고 ${me.warnings.length}회` : ''}` : '아직 마감된 모임이 없습니다.'}</p></div>`;
}

function nextSessionCard(d) {
  const g = d.group; const now = kstNow();
  const next = d.sessions.filter(s => ['scheduled', 'open'].includes(s.status) && (s.status === 'open' || s.starts_at >= now.slice(0, 10))).sort((a, b) => a.starts_at < b.starts_at ? -1 : 1)[0];
  if (!next) return `<div class="card"><h3>다음 모임</h3><p class="muted small" style="margin:0">잡힌 모임이 없습니다.${d.me.is_manager ? ` <a href="#/groups/${g.id}/sessions">모임 일정 잡기</a>` : ''}</p></div>`;
  const insider = d.me.is_member || d.me.is_staff;
  return `<div class="card next-session ${next.status === 'open' ? 'is-open' : ''}"><div class="card-head"><h3>다음 모임 · ${dday(next.starts_at)}</h3>${next.status === 'open' ? '<span class="chip green">출석 받는 중</span>' : ''}</div>
    <div class="title">${esc(next.title)}</div><div class="meta small muted">${fmtLocal(next.starts_at)} · ${next.duration_min}분 · ${modeLabel(next.mode)}</div>
    ${insider && next.place ? `<div class="small" style="margin-top:6px">${isUrl(next.place) ? `<a href="${esc(next.place)}" target="_blank" rel="noopener">온라인 모임 열기</a>` : '장소 · ' + esc(next.place)}</div>` : ''}
    ${next.agenda ? `<div class="small" style="margin-top:6px">${nl2br(next.agenda)}</div>` : ''}${next.prep ? `<div class="small muted" style="margin-top:6px">준비할 것 · ${esc(next.prep)}</div>` : ''}
    ${d.me.is_member ? `<div class="btn-row" style="margin-top:10px">${next.status === 'open' && !['present', 'late'].includes(next.my_status) ? `<a class="btn primary" href="#/groups/${g.id}/sessions/${next.id}">출석 코드 입력</a>` : ''}
      ${next.status === 'scheduled' ? `<button class="btn sm ${next.my_rsvp === 'yes' ? 'primary' : ''}" data-act="rsvp" data-sid="${next.id}" data-v="yes">참석</button><button class="btn sm ${next.my_rsvp === 'no' ? 'primary' : ''}" data-act="rsvp" data-sid="${next.id}" data-v="no">불참 알림</button>` : ''}
      ${next.my_status ? attendChip(next.my_status) : ''}</div>` : ''}</div>`;
}
const rsvpAction = g => ({
  async rsvp(el) {
    if (el.dataset.v === 'yes') { await post(`/groups/${g.id}/sessions/${el.dataset.sid}/rsvp`, { rsvp: 'yes' }); toast('참석으로 표시했습니다'); reload(); return; }
    modal(`<h3>불참 알림</h3><p class="small muted">${g.policy.excuse ? `모임 시작 전에 사유를 남기면 공결로 인정됩니다 (최대 ${g.policy.excuse_limit}번).` : '이 그룹은 공결을 따로 인정하지 않습니다.'}</p><form class="form" data-form="no">${field('사유', input('note', { required: true, placeholder: '예: 야근, 출장' }))}<div class="btn-row"><button class="btn primary" type="submit">알리기</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`,
      { onMount(mm) { bindForms(mm, { async no(f) { await post(`/groups/${g.id}/sessions/${el.dataset.sid}/rsvp`, { rsvp: 'no', note: f.note }); closeModal(); toast('그룹리더에게 알렸습니다'); reload(); } }); } });
  },
});

function logItem(l, d) {
  const g = d.group, mine = d.me;
  const own = state.me && l.user_id === state.me.id;
  return `<div class="log-item ${l.pinned ? 'pinned' : ''}"><div class="row between"><div class="small"><span class="chip ${l.kind === 'notice' ? 'ink' : ''}">${esc(l.kind_name || LOG_KINDS[l.kind])}</span> <b>${esc(l.nickname)}</b> <span class="muted">${ago(l.created_at)}</span>${l.post_id ? ` · <a href="#/community/posts/${l.post_id}">커뮤니티에 공유됨</a>` : ''}</div>
    <div class="row" style="gap:4px">${state.me ? `<button class="btn xs ${l.my_cheer ? 'primary' : ''}" data-act="cheer" data-id="${l.id}">응원 ${l.cheers || ''}</button>` : ''}
    ${own && !l.post_id && l.kind !== 'notice' ? `<button class="btn xs" data-act="sharelog" data-id="${l.id}">공유</button>` : ''}
    ${mine.is_manager ? `<button class="btn xs" data-act="pin" data-id="${l.id}" data-on="${l.pinned ? 0 : 1}">${l.pinned ? '고정 해제' : '고정'}</button>` : ''}
    ${own || mine.is_manager ? `<button class="btn xs ghost" data-act="dellog" data-id="${l.id}" data-confirm="이 기록을 지울까요?">지우기</button>` : ''}</div></div>
    <div class="log-body">${nl2br(l.body)}</div>${l.link ? `<a class="small" href="${esc(l.link)}" target="_blank" rel="noopener">${esc(l.link)}</a>` : ''}</div>`;
}
const logActions = g => ({
  async cheer(el) { await post(`/groups/${g.id}/logs/${el.dataset.id}`, { action: 'cheer' }); reload(); },
  async sharelog(el) { await post(`/groups/${g.id}/logs/${el.dataset.id}`, { action: 'share' }); toast('커뮤니티 그룹 소식에 공유했습니다'); reload(); },
  async pin(el) { await post(`/groups/${g.id}/logs/${el.dataset.id}`, { action: el.dataset.on === '1' ? 'pin' : 'unpin' }); reload(); },
  async dellog(el) { await post(`/groups/${g.id}/logs/${el.dataset.id}`, { action: 'delete' }); toast('지웠습니다'); reload(); },
});

// ── 홈
function tabHome(d) {
  const g = d.group;
  const pinned = d.logs.filter(l => l.pinned).slice(0, 2);
  const recent = d.logs.filter(l => !l.pinned).slice(0, 4);
  const html = `<div class="grid grid-2">
    <div class="stack">
      ${d.me.is_member ? nextSessionCard(d) : ''}
      ${pinned.map(l => `<div class="card notice-card">${logItem(l, d)}</div>`).join('')}
      <div class="card"><h3>이 그룹은</h3>${g.description ? `<div class="small">${nl2br(g.description)}</div>` : '<p class="small muted">그룹리더가 아직 자세한 소개를 쓰지 않았습니다.</p>'}
        <div class="kv-list small" style="margin-top:10px">${[['그룹리더', esc(g.leader_nickname)], ['모이는 주기', esc(g.schedule_text || '-')], ['주로 모이는 곳', esc(g.place || '-')], ['기간', g.start_date ? `${fmtDate(g.start_date)} ~ ${g.end_date ? fmtDate(g.end_date) : ''}` : '-'], ['인원', `${d.members.length}/${g.capacity}명 · ${g.join_mode === 'open' ? '바로 참여' : '리더 승인'}`]].map(([k, v]) => `<div><span class="muted">${k}</span><span>${v}</span></div>`).join('')}</div></div>
      <div class="card"><div class="card-head"><h3>최근 도전 기록</h3><a class="small" href="#/groups/${g.id}/records">전체</a></div>${recent.length ? recent.map(l => logItem(l, d)).join('') : '<p class="small muted" style="margin:0">아직 기록이 없습니다.</p>'}</div>
    </div>
    <div class="stack">
      <div class="card"><div class="card-head"><h3>목표</h3><a class="small" href="#/groups/${g.id}/goals">목표·성과</a></div>${g.goal_text ? `<p style="margin:0 0 10px"><b>${esc(g.goal_text)}</b></p>` : ''}${goalBar(d.goal) || (g.goal_text ? '' : '<p class="small muted" style="margin:0">목표가 아직 없습니다.</p>')}
        ${d.milestones.length ? `<div style="margin-top:10px">${d.milestones.slice(0, 5).map(m => `<div class="milestone ${m.done_at ? 'done' : (m.due_date && m.due_date < kstNow().slice(0, 10) ? 'late' : '')}"><span class="dotm"></span><span class="grow small">${esc(m.title)}</span><small class="muted">${m.done_at ? '완료' : m.due_date ? fmtDate(m.due_date) : ''}</small></div>`).join('')}</div>` : ''}</div>
      ${myAttendanceCard(d)}
      <div class="card"><h3>출석 규칙</h3><ul class="rule-list small">${policyLines(g.policy).map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>
      <div class="card"><div class="card-head"><h3>그룹원 ${d.members.length}명</h3><a class="small" href="#/groups/${g.id}/members">전체</a></div><div class="avatar-row">${d.members.map(x => `<span class="who"><span class="avatar">${esc(x.nickname.slice(0, 1))}</span>${esc(x.nickname)}${x.role !== 'member' ? ` <small class="muted">${esc(x.role_name)}</small>` : ''}</span>`).join('')}</div></div>
    </div></div>`;
  return { html, actions: { ...rsvpAction(g), ...logActions(g) } };
}

// ── 모임·출석
function tabSessions(d) {
  const g = d.group; const now = kstNow();
  const live = ['recruiting', 'active'].includes(g.stage);
  const upcoming = d.sessions.filter(s => ['scheduled', 'open'].includes(s.status) && (s.status === 'open' || s.starts_at >= now.slice(0, 10))).sort((a, b) => a.starts_at < b.starts_at ? -1 : 1);
  const past = d.sessions.filter(s => !upcoming.includes(s));
  const unchecked = d.me.is_manager ? past.filter(s => s.status === 'scheduled') : [];
  const html = `<div class="grid grid-2">
    <div class="stack">
      ${d.me.is_manager && live ? `<details class="card" ${d.sessions.length ? '' : 'open'}><summary><b>모임 일정 잡기</b></summary>
        <form class="form" data-form="sess" style="margin-top:12px">
          <div class="form-cols">${field('모임 이름', input('title', { value: '주간 모임', required: true }))}${field('시작 (한국 시간)', input('starts_at', { type: 'datetime-local', required: true }))}</div>
          <div class="form-cols">${field('방식', select('mode', [['online', '온라인'], ['offline', '오프라인']]))}${field('진행 시간', `<div class="unit-input">${input('duration_min', { type: 'number', value: 90, min: 15, max: 600 })}<span>분</span></div>`)}</div>
          ${field('장소 또는 온라인 링크', input('place', { value: g.place || '', placeholder: '예: https://zoom.us/… 또는 성수동 ○○ 라운지' }), '그룹원에게만 보입니다')}
          ${field('다룰 것', textarea('agenda', { rows: 2, placeholder: '예: 지난주 진행 공유 → 막힌 것 → 이번 주 할 일' }))}
          ${field('미리 준비할 것', input('prep', { placeholder: '예: 고객 인터뷰 메모 1개' }))}
          ${field('매주 반복', `<div class="unit-input">${input('repeat_weeks', { type: 'number', value: 0, min: 0, max: 12 })}<span>주 더</span></div>`, '0이면 한 번만 만듭니다. 4를 넣으면 같은 요일·시간으로 5번 만듭니다')}
          <button class="btn primary" type="submit">일정 만들기</button></form></details>` : ''}
      ${unchecked.length ? `<div class="notice warn">출석을 받지 않은 지난 모임이 ${unchecked.length}개 있습니다. 모임을 열어 출석을 표시하고 마감해 주세요. 마감하지 않은 모임은 출석률에 들어가지 않습니다.</div>` : ''}
      <div class="card"><h3>다가오는 모임</h3>${upcoming.length ? `<div class="list">${upcoming.map(s => sessionRow(s, d)).join('')}</div>` : '<p class="small muted" style="margin:0">잡힌 모임이 없습니다.</p>'}</div>
      <div class="card"><h3>지난 모임</h3>${past.length ? `<div class="list">${past.map(s => sessionRow(s, d)).join('')}</div>` : '<p class="small muted" style="margin:0">아직 없습니다.</p>'}</div>
    </div>
    <div class="stack">${myAttendanceCard(d)}<div class="card"><h3>출석은 이렇게 합니다</h3><ol class="small steps-list"><li>그룹리더나 부리더가 모임을 열고 <b>출석 받기</b>를 누르면 숫자 4자리 코드가 나옵니다.</li><li>오프라인은 화면을 보여 주고, 온라인은 대화창에 코드나 출석 링크를 올립니다.</li><li>그룹원은 모임 화면에서 코드를 입력합니다. 시작 ${g.policy.late_minutes}분이 지나 입력하면 지각입니다.</li><li>모임이 끝나면 <b>출석 마감</b>을 누릅니다. 표시하지 않은 사람은 결석, 미리 사유를 남긴 사람은 공결이 됩니다.</li></ol></div>
      <div class="card"><h3>출석 규칙</h3><ul class="rule-list small">${policyLines(g.policy).map(l => `<li>${esc(l)}</li>`).join('')}</ul></div></div>
  </div>`;
  return { html, actions: rsvpAction(g), mount(root) { bindForms(root, { async sess(f) {
    const r = await post(`/groups/${g.id}/sessions`, { ...f, starts_at: f.starts_at?.slice(0, 16) });
    toast(r.ids.length > 1 ? `모임 ${r.ids.length}개를 만들었습니다` : '모임을 만들었습니다'); reload();
  } }); } };
}

// ── 모임 하나 (출석 코드 입력 · 출석 관리 · 모임 기록)
export async function session({ params, query, me }) {
  const d = await api('/groups/' + params.id);
  const g = d.group; const s = d.sessions.find(x => String(x.id) === String(params.sid));
  if (!s) return `<div class="wrap page">${empty('모임을 찾을 수 없습니다', '', `<a class="btn" href="#/groups/${params.id}/sessions">모임 목록</a>`)}</div>`;
  const mine = d.me; const mgr = mine.is_manager;
  const live = mgr ? await sessionMarks(g.id, s.id) : {};
  const link = `${location.origin}/app/#/groups/${g.id}/sessions/${s.id}?code=${s.code || ''}`;
  const canCheck = mine.is_member && s.status === 'open' && !['present', 'late'].includes(s.my_status);
  const html = `<div class="wrap page" style="max-width:900px">
    <div class="adm-crumbs small"><a href="#/groups/${g.id}">${esc(g.title)}</a> <span class="sep">›</span> <a href="#/groups/${g.id}/sessions">모임·출석</a></div>
    ${pageHead(esc(s.title), `${fmtLocal(s.starts_at)} · ${s.duration_min}분 · ${modeLabel(s.mode)}`, [
      mgr && ['scheduled', 'open'].includes(s.status) ? `<button class="btn ${s.status === 'open' ? '' : 'primary'}" data-act="open">${s.status === 'open' ? '출석 코드 다시 보기' : '출석 받기'}</button>` : '',
      mgr && ['scheduled', 'open'].includes(s.status) && s.starts_at <= kstNow() ? '<button class="btn primary" data-act="closes">출석 마감</button>' : '',
      mgr && ['scheduled', 'open'].includes(s.status) ? '<button class="btn" data-act="edit">수정</button><button class="btn ghost" data-act="cancel">취소</button>' : '',
    ].join(''))}
    ${s.status === 'cancelled' ? '<div class="notice">취소된 모임입니다.</div>' : ''}
    <div class="grid grid-2">
      <div class="stack">
        ${canCheck ? `<form class="card attend-card" data-form="ci"><h3>출석 코드 입력</h3><p class="small muted">그룹리더가 알려 준 숫자 4자리를 입력해 주세요.</p><input class="attend-input" name="code" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" value="${esc(query.code || '')}" placeholder="0000" required autocomplete="off"><button class="btn primary lg block" type="submit">출석하기</button></form>` : ''}
        ${mine.is_member && s.my_status ? `<div class="card"><h3>내 출석</h3>${attendChip(s.my_status)}</div>` : ''}
        ${mine.is_member && s.status === 'scheduled' ? `<div class="card"><h3>참석 여부</h3><div class="btn-row"><button class="btn ${s.my_rsvp === 'yes' ? 'primary' : ''}" data-act="rsvp" data-sid="${s.id}" data-v="yes">참석</button><button class="btn ${s.my_rsvp === 'no' ? 'primary' : ''}" data-act="rsvp" data-sid="${s.id}" data-v="no">불참 알림</button></div>${s.my_rsvp_note ? `<p class="small muted" style="margin:8px 0 0">남긴 사유 · ${esc(s.my_rsvp_note)}</p>` : ''}</div>` : ''}
        ${mgr && s.status === 'open' && s.code ? `<div class="card attend-code"><div class="muted small">출석 코드</div><div class="code">${esc(s.code)}</div><div class="small muted">시작 ${g.policy.checkin_before}분 전부터 입력할 수 있고, 시작 ${g.policy.late_minutes}분이 지나면 지각입니다.</div><div class="btn-row" style="justify-content:center;margin-top:10px"><button class="btn sm" data-act="copy" data-text="${esc(link)}">출석 링크 복사</button></div></div>` : ''}
        <div class="card"><h3>모임 안내</h3><div class="kv-list small">${[['장소', s.place ? (isUrl(s.place) ? `<a href="${esc(s.place)}" target="_blank" rel="noopener">온라인 모임 열기</a>` : esc(s.place)) : '-'], ['다룰 것', s.agenda ? nl2br(s.agenda) : '-'], ['준비할 것', esc(s.prep || '-')]].map(([k, v]) => `<div><span class="muted">${k}</span><span>${v}</span></div>`).join('')}</div></div>
        <div class="card"><div class="card-head"><h3>모임 기록</h3>${mgr ? '<button class="btn sm" data-act="notes">쓰기</button>' : ''}</div>${s.notes ? `<div class="small">${nl2br(s.notes)}</div>` : '<p class="small muted" style="margin:0">회의록이나 나눈 이야기를 남겨 두면 빠진 사람도 따라올 수 있습니다.</p>'}</div>
      </div>
      <div class="stack">
        ${mgr ? `<div class="card"><div class="card-head"><h3>출석 체크</h3><span class="small muted">${s.status === 'closed' ? '마감됨 · 고칠 수 있습니다' : '코드로 들어온 사람은 자동 표시'}</span></div>
          <div class="small" style="margin:-4px 0 6px">${Object.entries(ATTEND).map(([k, [l]]) => `${l} <b>${Object.values(live).filter(x => x.status === k).length}</b>`).join(' · ')} · 표시 전 <b>${d.members.filter(x => !live[x.user_id]?.status).length}</b></div>
          <div class="list">${d.members.map(x => { const cur = live[x.user_id] || {}; return `<div class="list-item"><div class="grow"><div class="title">${esc(x.nickname)} <small class="muted">${esc(x.role_name)}</small></div>${cur.rsvp_note ? `<div class="meta">불참 사유 · ${esc(cur.rsvp_note)}</div>` : ''}</div>
            <div class="seg">${Object.entries(ATTEND).map(([k, [l]]) => `<button class="${cur.status === k ? 'on ' + ATTEND[k][1] : ''}" data-act="mark" data-uid="${x.user_id}" data-st="${k}">${l}</button>`).join('')}</div></div>`; }).join('')}</div></div>` : ''}
        ${!mgr && s.status === 'closed' ? `<div class="card"><h3>이 모임</h3><p class="small" style="margin:0">출석 ${s.attended}명</p></div>` : ''}
      </div>
    </div></div>`;
  return { html, mount(root) {
    bindForms(root, { async ci(f) { const r = await post(`/groups/${g.id}/sessions/${s.id}/checkin`, { code: f.code }); toast(r.status === 'late' ? '출석했습니다 (지각)' : '출석했습니다'); if (query.code) go(`#/groups/${g.id}/sessions/${s.id}`); else reload(); } });
    bindActions(root, {
      ...rsvpAction(g),
      async open() { const r = await post(`/groups/${g.id}/sessions/${s.id}/open`); toast(`출석 코드 ${r.code}`); reload(); },
      async mark(el) { await post(`/groups/${g.id}/sessions/${s.id}/mark`, { user_id: Number(el.dataset.uid), status: el.dataset.st }); reload(); },
      async copy(el) { try { await navigator.clipboard.writeText(el.dataset.text); toast('출석 링크를 복사했습니다'); } catch { prompt('출석 링크', el.dataset.text); } },
      closes() {
        modal(`<h3>출석 마감</h3><p class="small">표시하지 않은 그룹원은 결석이 됩니다. 모임 전에 불참 사유를 남긴 그룹원은 ${g.policy.excuse ? `공결(최대 ${g.policy.excuse_limit}번)` : '결석'}으로 처리됩니다. 마감하면 출석 규칙에 따라 경고가 나갈 수 있습니다.</p><div class="btn-row"><button class="btn primary" data-act="doit">마감하기</button><button class="btn" data-close-modal>취소</button></div>`,
          { onMount(mm) { bindActions(mm, { async doit() { const r = await post(`/groups/${g.id}/sessions/${s.id}/close`); closeModal();
            const msg = [r.warned.length ? `경고 ${r.warned.map(w => w.nickname).join(', ')}` : '', r.kick.length ? `퇴출 기준 ${r.kick.map(k => k.nickname + (k.removed ? '(자동 퇴출)' : '')).join(', ')}` : ''].filter(Boolean).join(' · ');
            toast('출석을 마감했습니다' + (msg ? ' · ' + msg : '')); reload(); } }); } });
      },
      edit() {
        modal(`<h3>모임 수정</h3><form class="form" data-form="e">${field('모임 이름', input('title', { value: s.title }))}${field('시작 (한국 시간)', input('starts_at', { type: 'datetime-local', value: s.starts_at }))}<div class="form-cols">${field('방식', select('mode', [['online', '온라인'], ['offline', '오프라인']], s.mode))}${field('진행 시간(분)', input('duration_min', { type: 'number', value: s.duration_min, min: 15 }))}</div>${field('장소 또는 링크', input('place', { value: s.place || '' }))}${field('다룰 것', textarea('agenda', { value: s.agenda || '', rows: 3 }))}${field('준비할 것', input('prep', { value: s.prep || '' }))}<div class="btn-row"><button class="btn primary" type="submit">저장</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`,
          { onMount(mm) { bindForms(mm, { async e(f) { await put(`/groups/${g.id}/sessions/${s.id}`, { ...f, starts_at: f.starts_at?.slice(0, 16) }); closeModal(); toast('저장했습니다'); reload(); } }); } });
      },
      notes() {
        modal(`<h3>모임 기록</h3><form class="form" data-form="n">${textarea('notes', { value: s.notes || '', rows: 10, placeholder: '나눈 이야기, 정한 것, 다음 할 일' })}<div class="btn-row"><button class="btn primary" type="submit">저장</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`,
          { onMount(mm) { bindForms(mm, { async n(f) { await put(`/groups/${g.id}/sessions/${s.id}`, { notes: f.notes }); closeModal(); toast('저장했습니다'); reload(); } }); } });
      },
      cancel() {
        modal(`<h3>모임 취소</h3><form class="form" data-form="c">${field('사유 (그룹원에게 알림으로 갑니다)', input('reason'))}<div class="btn-row"><button class="btn danger" type="submit">취소하기</button><button class="btn" type="button" data-close-modal>닫기</button></div></form>`,
          { onMount(mm) { bindForms(mm, { async c(f) { await put(`/groups/${g.id}/sessions/${s.id}`, { status: 'cancelled', reason: f.reason }); closeModal(); toast('취소했습니다'); go(`#/groups/${g.id}/sessions`); } }); } });
      },
    });
    const ci = root.querySelector('.attend-input'); if (ci && !ci.value) ci.focus();
  } };
}
// 모임 하나의 출석 표시를 따로 읽는다 (그룹 상세에는 최근 마감된 모임만 실려 온다)
async function sessionMarks(gid, sid) {
  try { const r = await api(`/groups/${gid}/sessions/${sid}/marks`); return Object.fromEntries(r.map(x => [x.user_id, x])); } catch { return {}; }
}

// ── 도전 기록
function tabRecords(d) {
  const g = d.group; const mine = d.me;
  const live = ['recruiting', 'active'].includes(g.stage);
  const kinds = Object.entries(LOG_KINDS).filter(([k]) => k !== 'notice' || mine.is_manager);
  const past = d.sessions.filter(s => s.status !== 'cancelled' && s.starts_at <= kstNow()).slice(0, 10);
  const html = `<div class="grid grid-2">
    <div class="stack">
      ${mine.is_member && live ? `<form class="card form" data-form="log"><h3>기록 남기기</h3>
        <div class="form-cols">${field('종류', select('kind', kinds))}${past.length ? field('관련 모임 (선택)', select('session_id', [['', '없음'], ...past.map(s => [s.id, `${fmtLocal(s.starts_at).slice(5, 10)} ${s.title}`])])) : ''}</div>
        ${field('내용', textarea('body', { rows: 4, required: true, placeholder: '이번 주에 한 것, 배운 것, 막힌 것. 숫자가 있으면 숫자로.' }))}
        ${field('링크 (선택)', input('link', { placeholder: 'https://' }))}
        ${check('share', '커뮤니티 그룹 소식에도 공유 (다른 그룹이 보고 응원·조언할 수 있습니다)')}
        <button class="btn primary" type="submit">기록하기</button></form>` : ''}
      <div class="card"><h3>기록 ${d.logs.length}개</h3>${d.logs.length ? d.logs.map(l => logItem(l, d)).join('') : '<p class="small muted" style="margin:0">아직 기록이 없습니다.</p>'}</div>
    </div>
    <div class="stack"><div class="card soft small"><b>무엇을 기록하나요?</b><ul class="rule-list"><li><b>진행 기록</b> · 이번 주에 한 일과 결과, 다음에 할 일</li><li><b>학습 노트</b> · 공부한 내용을 다른 사람이 읽을 수 있게 정리</li><li><b>자료 공유</b> · 도움이 된 글, 도구, 템플릿</li><li><b>회고</b> · 잘된 것, 안 된 것, 바꿀 것</li></ul><p class="muted" style="margin:6px 0 0">공유한 기록은 커뮤니티 '그룹 소식'에 올라가 다른 그룹과 정보를 나누는 데 쓰입니다. 정기모임과 성과발표회에서도 이 기록을 바탕으로 이야기합니다.</p></div></div>
  </div>`;
  return { html, actions: logActions(g), mount(root) { bindForms(root, { async log(f) { const r = await post(`/groups/${g.id}/logs`, { ...f, share: !!f.share }); toast(r.post_id ? '기록하고 커뮤니티에 공유했습니다' : '기록했습니다'); reload(); } }); } };
}

// ── 목표·성과
function tabGoals(d) {
  const g = d.group; const mine = d.me;
  const live = ['recruiting', 'active'].includes(g.stage);
  const html = `<div class="grid grid-2">
    <div class="stack">
      <div class="card"><h3>그룹 목표</h3>${g.goal_text ? `<p style="margin:0 0 10px"><b>${esc(g.goal_text)}</b></p>` : '<p class="small muted">목표가 없습니다. 그룹리더가 설정에서 정할 수 있습니다.</p>'}${goalBar(d.goal)}
        ${d.result_totals.length ? `<div class="grid grid-3 mini-stats" style="margin-top:12px">${d.result_totals.map(t => stat(t.name, metricVal(t.metric, t.value, t.unit))).join('')}</div>` : ''}</div>
      <div class="card"><div class="card-head"><h3>마일스톤</h3></div>
        ${d.milestones.length ? d.milestones.map(m => `<div class="milestone ${m.done_at ? 'done' : (m.due_date && m.due_date < kstNow().slice(0, 10) ? 'late' : '')}"><span class="dotm"></span><span class="grow">${esc(m.title)}${m.evidence ? ` <small class="muted">· ${esc(m.evidence)}</small>` : ''}</span><small class="muted">${m.done_at ? '완료 ' + fmtDate(m.done_at) : m.due_date ? fmtDate(m.due_date) : ''}</small>
          ${mine.is_manager ? `<button class="btn xs" data-act="ms" data-id="${m.id}" data-a="${m.done_at ? 'undo' : 'done'}">${m.done_at ? '되돌리기' : '완료'}</button><button class="btn xs ghost" data-act="ms" data-id="${m.id}" data-a="delete" data-confirm="마일스톤을 지울까요?">지우기</button>` : ''}</div>`).join('') : '<p class="small muted" style="margin:0">아직 없습니다.</p>'}
        ${mine.is_manager && live ? `<form class="form row" data-form="ms" style="margin-top:10px;gap:6px;align-items:flex-end"><div class="grow">${input('title', { required: true, placeholder: '예: 6주차 첫 매출' })}</div>${input('due_date', { type: 'date' })}<button class="btn sm" type="submit">더하기</button></form>` : ''}</div>
    </div>
    <div class="stack">
      ${mine.is_member ? `<form class="card form" data-form="res"><h3>성과 기록</h3><p class="small muted" style="margin-top:-6px">매출, 고객, 판매, 사용자, 발행한 콘텐츠처럼 셀 수 있는 결과를 남깁니다. 매출은 운영진이 확인하면 첫 매출 배지가 나갑니다.</p>
        <div class="form-cols">${field('무엇을', select('metric', Object.entries(GOAL_METRICS).map(([k, [n, u]]) => [k, n + (u ? ` (${u})` : '')]), g.goal_metric || 'revenue'))}${field('얼마나', input('value', { type: 'number', required: true, min: 0, step: 'any' }))}</div>
        <div class="form-cols">${field('어떤 결과인지', input('label', { placeholder: '예: 꽃집 한 달 운영 대행' }))}${field('날짜', input('happened_on', { type: 'date', value: kstNow().slice(0, 10) }))}</div>
        ${field('증빙 (링크나 설명)', input('evidence', { placeholder: '예: 입금 화면 캡처 링크, 판매 페이지' }), '운영진만 봅니다. 매출 확인에 씁니다')}
        ${check('share', '커뮤니티 그룹 소식에도 공유')}<button class="btn primary" type="submit">기록하기</button></form>` : ''}
      <div class="card"><h3>성과 기록 ${d.results.length}개</h3>${d.results.length ? `<div class="list">${d.results.map(r => `<div class="list-item"><div class="grow"><div class="title">${esc(GOAL_METRICS[r.metric]?.[0] || r.metric)} <b>${metricVal(r.metric, r.value)}</b> ${r.verified_at ? '<span class="chip green">운영진 확인</span>' : r.metric === 'revenue' ? '<span class="chip amber">확인 대기</span>' : ''}</div><div class="meta">${esc(r.label || '')} · ${fmtDate(r.happened_on)} · ${esc(r.nickname)}${r.post_id ? ` · <a href="#/community/posts/${r.post_id}">공유됨</a>` : ''}</div></div>${(state.me && r.user_id === state.me.id) || mine.is_manager ? (r.verified_at ? '' : `<button class="btn xs ghost" data-act="delres" data-id="${r.id}" data-confirm="이 성과 기록을 지울까요?">지우기</button>`) : ''}</div>`).join('')}</div>` : '<p class="small muted" style="margin:0">아직 없습니다. 첫 결과는 작아도 좋습니다.</p>'}</div>
    </div></div>`;
  return { html, actions: {
    async ms(el) { await post(`/groups/${g.id}/milestones/${el.dataset.id}`, { action: el.dataset.a }); reload(); },
    async delres(el) { await post(`/groups/${g.id}/results/${el.dataset.id}`, { action: 'delete' }); toast('지웠습니다'); reload(); },
  }, mount(root) { bindForms(root, {
    async ms(f) { await post(`/groups/${g.id}/milestones`, f); toast('더했습니다'); reload(); },
    async res(f) { const r = await post(`/groups/${g.id}/results`, { ...f, share: !!f.share }); toast(f.metric === 'revenue' ? '기록했습니다. 운영진이 확인하면 알려 드립니다' : '기록했습니다'); reload(); },
  }); } };
}

// ── 그룹원
function tabMembers(d) {
  const g = d.group; const mine = d.me; const mgr = mine.is_manager;
  const p = g.policy;
  const rows = d.members.map(x => {
    const st = x.attendance; const kick = p.kick_warnings > 0 && x.warnings >= p.kick_warnings && x.role !== 'leader';
    return `<div class="list-item ${kick ? 'risk-row' : ''}"><span class="avatar">${esc(x.nickname.slice(0, 1))}</span><div class="grow"><div class="title">${esc(x.nickname)} ${lvChip(x.level)} <small class="muted">${esc(x.role_name)}</small>${kick ? ' <span class="chip red">퇴출 기준</span>' : ''}</div>
      ${st ? `<div class="meta">출석률 <b>${rateText(st)}</b> · 출석 ${st.present} · 지각 ${st.late} · 결석 ${st.absent} · 공결 ${st.excused}${st.streak ? ` · 연속 결석 ${st.streak}` : ''}${x.warnings ? ` · <span class="error">경고 ${x.warnings}</span>` : ''}</div>` : `<div class="meta">${fmtDate(x.joined_at)} 참여</div>`}</div>
      ${mgr && x.role !== 'leader' ? `<div class="btn-row">${mine.is_leader ? `<button class="btn xs" data-act="role" data-uid="${x.user_id}" data-role="${x.role === 'sub' ? 'member' : 'sub'}">${x.role === 'sub' ? '부리더 해제' : '부리더로'}</button>` : ''}<button class="btn xs" data-act="warn" data-uid="${x.user_id}" data-name="${esc(x.nickname)}">경고</button>${mine.is_leader ? `<button class="btn xs danger" data-act="remove" data-uid="${x.user_id}" data-name="${esc(x.nickname)}">내보내기</button>` : ''}</div>` : ''}</div>`;
  }).join('');
  const matrix = mgr && d.matrix?.sessions.length ? `<div class="card"><h3>출석표 <small class="muted">최근 마감된 모임 ${d.matrix.sessions.length}번</small></h3><div class="table-wrap"><table class="tbl compact att-matrix"><thead><tr><th>그룹원</th>${d.matrix.sessions.map(s => `<th title="${esc(s.title)}">${fmtLocal(s.starts_at).slice(5, 10)}</th>`).join('')}<th class="num">출석률</th></tr></thead><tbody>
    ${d.members.map(x => `<tr><td>${esc(x.nickname)}</td>${d.matrix.sessions.map(s => { const c = d.matrix.cells.find(c => c.session_id === s.id && c.user_id === x.user_id); return `<td class="att att-${c?.status || 'none'}">${c?.status ? ATTEND[c.status][0] : '·'}</td>`; }).join('')}<td class="num">${rateText(x.attendance)}</td></tr>`).join('')}</tbody></table></div></div>` : '';
  const html = `<div class="stack">
    ${mgr && d.applicants?.length ? `<div class="card"><h3>참여 신청 ${d.applicants.length}건</h3><div class="list">${d.applicants.map(a => `<div class="list-item"><div class="grow"><div class="title">${esc(a.nickname)} ${lvChip(a.level)}${a.removed_before ? ' <span class="chip amber">이전 출석 퇴출 기록</span>' : ''}</div><div class="meta">${esc(a.apply_note || '')} · ${ago(a.created_at)}</div>${a.bio ? `<div class="small muted clamp1">${esc(a.bio)}</div>` : ''}</div><div class="btn-row"><button class="btn sm primary" data-act="approve" data-uid="${a.user_id}">승인</button><button class="btn sm" data-act="reject" data-uid="${a.user_id}">거절</button></div></div>`).join('')}</div></div>` : ''}
    ${mgr && d.kick_candidates?.length ? `<div class="notice warn">퇴출 기준(경고 ${p.kick_warnings}회)에 닿은 그룹원: ${d.kick_candidates.map(k => esc(k.nickname)).join(', ')}. 사정을 먼저 들어 보고, 경고를 취소하거나 내보내기를 결정해 주세요.</div>` : ''}
    <div class="card"><h3>그룹원 ${d.members.length}/${g.capacity}명</h3><div class="list">${rows}</div></div>
    ${matrix}
    ${mgr && d.warnings?.length ? `<div class="card"><h3>경고 기록</h3><div class="list">${d.warnings.map(w => `<div class="list-item"><div class="grow"><div class="title">${esc(w.nickname)} · ${esc(w.reason)} ${w.cleared_at ? '<span class="chip">취소됨</span>' : ''}</div><div class="meta">${w.issued_by ? '그룹리더 경고' : '출석 규칙 자동 경고'} · ${ago(w.created_at)}</div></div>${!w.cleared_at ? `<button class="btn xs" data-act="clearw" data-uid="${w.user_id}" data-wid="${w.id}">경고 취소</button>` : ''}</div>`).join('')}</div></div>` : ''}
    ${mgr && d.left?.length ? `<div class="card"><h3>나간 그룹원</h3><div class="list">${d.left.map(x => `<div class="list-item"><div class="grow"><div class="title">${esc(x.nickname)} <span class="chip">${{ self: '스스로 나감', attendance: '출석 기준 퇴출', leader: '리더가 내보냄', staff: '운영진 조치' }[x.leave_type] || '나감'}</span></div><div class="meta">${fmtDate(x.left_at)}${x.leave_note ? ' · ' + esc(x.leave_note) : ''}</div></div>${mine.is_leader ? `<button class="btn xs" data-act="restore" data-uid="${x.user_id}" data-confirm="다시 그룹원으로 받을까요? 이전 경고는 모두 취소됩니다.">다시 받기</button>` : ''}</div>`).join('')}</div></div>` : ''}
  </div>`;
  const act = (uid, body) => post(`/groups/${g.id}/members/${uid}`, body);
  return { html, actions: {
    async approve(el) { await act(el.dataset.uid, { action: 'approve' }); toast('승인했습니다'); reload(); },
    async reject(el) { await act(el.dataset.uid, { action: 'reject' }); toast('거절했습니다'); reload(); },
    async role(el) { await act(el.dataset.uid, { action: 'role', role: el.dataset.role }); toast('바꿨습니다'); reload(); },
    async clearw(el) { await act(el.dataset.uid, { action: 'clear_warning', warning_id: Number(el.dataset.wid) }); toast('경고를 취소했습니다'); reload(); },
    async restore(el) { await act(el.dataset.uid, { action: 'restore' }); toast('다시 받았습니다'); reload(); },
    warn(el) { modal(`<h3>${esc(el.dataset.name)}님에게 경고</h3><form class="form" data-form="w">${field('사유 (본인에게 그대로 전달됩니다)', textarea('reason', { rows: 3, required: true }))}<div class="btn-row"><button class="btn primary" type="submit">경고 주기</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`,
      { onMount(mm) { bindForms(mm, { async w(f) { await act(el.dataset.uid, { action: 'warn', reason: f.reason }); closeModal(); toast('경고를 보냈습니다'); reload(); } }); } }); },
    remove(el) { modal(`<h3>${esc(el.dataset.name)}님 내보내기</h3><p class="small muted">본인에게 사유와 함께 알림이 가고, 운영진에게 이의 신청을 할 수 있습니다.</p><form class="form" data-form="r">${field('사유', textarea('reason', { rows: 3, required: true }))}<div class="btn-row"><button class="btn danger" type="submit">내보내기</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`,
      { onMount(mm) { bindForms(mm, { async r(f) { await act(el.dataset.uid, { action: 'remove', reason: f.reason }); closeModal(); toast('내보냈습니다'); reload(); } }); } }); },
  } };
}

// ── 설정 (그룹리더)
function tabSettings(d, me, settings) {
  const g = d.group;
  const html = `<form class="card form" data-form="set" style="max-width:820px">${groupForm(g, { settings })}<div class="form-error error"></div><button class="btn primary" type="submit">저장</button></form>`;
  return { html, mount(root) { bindForms(root, { async set(f) { const b = collect(f); b.recruit_open = !!f.recruit_open; await put(`/groups/${g.id}`, b); toast('저장했습니다'); reload(); } }); } };
}

// ── 프로젝트 페이퍼 (그룹을 마치며 정리)
function tabPaper(d) {
  const g = d.group; const p = d.paper; const mine = d.me;
  const canEdit = mine.is_leader && (!p || p.status === 'draft' || mine.is_staff);
  const stateLabel = { ongoing: '계속 운영', transferred: '다른 사람이 이어 감', stopped: '중단', closed: '정리' };
  const view = p ? `<div class="card"><div class="card-head"><h3>프로젝트 페이퍼</h3><span class="chip ${['approved', 'published'].includes(p.status) ? 'green' : 'amber'}">${{ draft: '작성 중', review: '운영진 검토 중', approved: '승인 · 공개', published: '공개' }[p.status]}</span></div>${p.review_note ? `<div class="notice ${p.status === 'draft' ? 'warn' : ''}">운영진 의견: ${esc(p.review_note)}</div>` : ''}${['approved', 'published'].includes(p.status) ? `<a class="btn sm" href="#/papers/${p.id}">페이퍼 보기</a>` : ''}</div>` : '';
  if (!canEdit) return view || `<div class="card"><p class="muted" style="margin:0">그룹을 마치면 그룹리더가 프로젝트 페이퍼로 과정과 결과를 정리합니다.</p></div>`;
  const html = `${view}<form class="card form" data-form="paper" id="paperform"><h3>${p ? '페이퍼 고치기' : '프로젝트 페이퍼 쓰기'}</h3><p class="small muted">A4 두 장이면 충분합니다. 성과 기록과 출석에서 숫자를 <button class="btn sm" type="button" data-act="prefill">불러오기</button>. 매출이 없어도, 중간에 멈췄어도 씁니다. 안 된 이유가 다음 사람에게 가장 쓸모 있습니다.</p>
    ${field('프로젝트 이름', input('form.name', { value: g.title }))}
    ${field('해결하려던 문제 또는 배우려던 것 (1~2문장)', textarea('form.pain', { rows: 2, required: true }))}
    ${field('만든 것 · 해 본 것', textarea('form.product', { rows: 2 }))}
    ${field('주요 마일스톤 (최대 5개)', [0, 1, 2, 3, 4].map(i => `<input type="text" name="form.milestones[]" placeholder="${i + 1}." style="margin-bottom:6px">`).join(''))}
    <div class="form-cols"><div class="form-cols" style="grid-template-columns:1fr 1fr">${field('매출 (원)', input('form.revenue_external', { type: 'number', min: 0 }))}${field('지인·내부 매출 (원)', input('form.revenue_internal', { type: 'number', min: 0 }))}</div><div class="form-cols" style="grid-template-columns:1fr 1fr">${field('쓴 비용 (원)', input('form.expenses', { type: 'number', min: 0 }))}${field('고객 수', input('form.customers', { type: 'number', min: 0 }))}</div></div>
    <div class="form-cols">${field('함께 쓴 시간 (대략)', input('form.hours', { type: 'number', min: 0 }), '모임 시간 × 인원을 불러오기로 채울 수 있습니다')}${field('지금 상태', select('form.state', Object.entries(stateLabel), 'ongoing'))}</div>
    ${field('잘된 것 (최대 3개)', [0, 1, 2].map(i => `<input type="text" name="form.good[]" style="margin-bottom:6px">`).join(''))}
    ${field('안 된 것 (최대 3개)', [0, 1, 2].map(i => `<input type="text" name="form.bad[]" style="margin-bottom:6px">`).join(''))}
    ${field('다음 계획', textarea('form.next', { rows: 2 }))}
    ${field('다음에 비슷한 그룹을 할 사람에게', textarea('form.to_next', { rows: 2 }))}
    ${field('공개 범위', select('publish_scope', [['members', '회원에게만'], ['public', '홈페이지에 요약 공개']], p?.publish_scope || 'members'), '매출이 있었는지, 고객 수 구간, 들인 시간은 항상 공개됩니다. 나머지 숫자는 아래에서 가릴 수 있습니다')}
    <div class="row" style="gap:12px">${[['revenue_external', '매출액'], ['revenue_internal', '내부 매출'], ['expenses', '비용'], ['customers', '정확한 고객 수']].map(([k, l]) => check('private_fields[]', `${l} 가리기`, false, k)).join('')}</div>
    <div class="btn-row"><button class="btn" type="submit" name="mode" value="save">임시 저장</button><button class="btn primary" type="submit" name="mode" value="submit">운영진에게 제출</button></div></form>`;
  return { html, actions: { async prefill() {
    const x = await api(`/groups/${g.id}/paper/prefill`); const fm = document.getElementById('paperform');
    fm['form.revenue_external'].value = x.revenue_external; fm['form.customers'].value = x.customers_count; fm['form.hours'].value = x.hours;
    const ms = fm.querySelectorAll('input[name="form.milestones[]"]'); x.milestones.forEach((t, i) => { if (ms[i]) ms[i].value = t; });
    toast(`불러왔습니다 · 마감한 모임 ${x.sessions}번${x.avg_rate != null ? ` · 평균 출석률 ${x.avg_rate}%` : ''}`);
  } }, mount(root) { bindForms(root, { async paper(f, fm, submitter) {
    const form = {}; for (const [k, v] of Object.entries(f)) if (k.startsWith('form.')) form[k.slice(5)] = v;
    const r = await post(`/groups/${g.id}/paper`, { form, private_fields: f.private_fields || [], publish_scope: f.publish_scope, submit: submitter?.value === 'submit' });
    toast(r.status === 'review' ? '제출했습니다. 운영진이 5일 안에 확인합니다' : '저장했습니다'); reload();
  } }); } };
}

// 예전 주소 → 그룹
export function legacy({ params }) { go(params.id ? `#/groups/${params.id}` : '#/groups'); return ''; }
