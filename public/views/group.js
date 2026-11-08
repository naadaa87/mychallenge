import { api, post, put, esc, nl2br, state, toast, go, reload, field, input, textarea, select, check, bindForms, bindActions, stat, num, pct, won, fmtDate, ago, LEVEL_NAMES, LEVELS, FIELDS, ROLES, lvChip, stageChip, typeChip, fieldChip, pageHead, empty, progressBar, tabs, modal, closeModal, STAGE } from '../core.js';

// ---------------- 챌린지 보드 ----------------
export async function board({ me, query }) {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(query).filter(([, v]) => v))).toString();
  const list = await api('/challenges' + (qs ? '?' + qs : ''));
  const rounds = await api('/rounds');
  const canPropose = me.role === 'staff' || me.level >= 'L4';
  const html = `<div class="wrap page">
    ${pageHead('챌린지 보드', '모집 중인 그룹에 지원하거나, 진행 상황을 둘러보세요. 카드는 챌린저부터, 그룹 안의 기록은 어치버부터 볼 수 있습니다.', `${canPropose ? '<a class="btn primary" href="#/challenges/new">챌린지 제안</a>' : '<a class="btn primary" href="#/challenges/new">솔로 챌린지</a>'}`)}
    <form class="filters" data-form="filter">
      <select name="stage">${[['', '모든 단계'], ['recruiting', '모집 중'], ['active', '진행 중'], ['settling', '정산 중'], ['closed', '종료'], ['stopped', '중단']].map(([v, l]) => `<option value="${v}" ${query.stage === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select name="field">${[['', '모든 분야'], ...Object.entries(FIELDS)].map(([v, l]) => `<option value="${v}" ${query.field === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select name="type">${[['', '모든 유형'], ['group', '그룹'], ['solo', '솔로'], ['official', '오피셜']].map(([v, l]) => `<option value="${v}" ${query.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${rounds.length ? `<select name="round">${[['', '모든 라운드'], ...rounds.map(r => [r.id, r.name])].map(([v, l]) => `<option value="${v}" ${String(query.round || '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}
      <button class="btn sm" type="submit">적용</button>
    </form>
    ${list.length ? `<div class="grid grid-3">${list.map(challengeCard).join('')}</div>` : empty('조건에 맞는 챌린지가 없습니다', '필터를 바꾸거나, 리더 등급이라면 직접 제안해 보세요')}
  </div>`;
  return { html, mount(root) { bindForms(root, { filter(d) { const q = new URLSearchParams(Object.fromEntries(Object.entries(d).filter(([, v]) => v))).toString(); go('#/challenges' + (q ? '?' + q : '')); } }); } };
}

export function challengeCard(c) {
  const pn = c.public_numbers || {};
  return `<a class="card clickable ch-card" href="#/challenges/${c.id}">
    <div class="ch-top">${typeChip(c.type)}${stageChip(c.stage)}${fieldChip(c.field_code)}${c.my_status === 'active' ? '<span class="chip blue">참여 중</span>' : c.my_status === 'applied' ? '<span class="chip amber">지원함</span>' : ''}</div>
    <h3>${esc(c.title)}</h3>
    <div class="ch-summary">${esc(c.summary || '')}</div>
    <div class="ch-foot"><span>${esc(c.leader_nickname)} · ${c.member_count}명${c.round_name ? ' · ' + esc(c.round_name) : ''}</span><span>${pn.has_sales ? '매출 발생' : ''}</span></div>
  </a>`;
}

// ---------------- 제안서 ----------------
const PROPOSAL_FIELDS = [
  ['pain', '어떤 불편·문제를 해결하나요? *', '누가, 언제, 어떤 상황에서 겪는 문제인지 구체적으로. "요즘 뜨는 분야라서"는 문제가 아닙니다.'],
  ['product', '무엇을 만들어 팔 건가요? *', '12주 안에 팔 수 있는 최소 형태. 예: 10페이지 PDF 가이드, 주말 2시간 클래스, 소규모 공동구매 1회'],
  ['first_sale_plan', '첫 매출은 어떻게 낼 건가요? *', '첫 고객 후보 3명을 적을 수 있으면 좋습니다. 어디에 어떻게 알릴지.'],
  ['roles_needed', '필요한 역할과 인원', '예: 제작 2명, 마케팅·판매 1명, 기록 1명. 그룹장 포함 4~8명'],
  ['budget', '예산 계획', '1인 상한 10만 원, 그룹 상한 50만 원 안에서. 무엇에 얼마를 쓸지'],
  ['assets', '이미 가진 자산', '계정, 재고, 장비, 고객 명단, 장소 등. 소유권 판단의 근거가 됩니다'],
  ['conflict_check', '이해충돌·규정 확인', '본업과의 충돌, 겸업 제한, 타인의 저작권·상표 등 확인한 내용'],
  ['after_round', '라운드 이후 계획', '계속 운영 / 그룹원에게 이관 / 정리 중 어느 쪽으로 생각하는지'],
];
const PRESET_LABEL = { basic: '기본형 (운영본부 10 · 그룹장 30 · 그룹원 풀 60)', leader_led: '리더주도형 (10 · 45 · 45)', equal: '균등형 (10 · 20 · 70, 그룹장도 풀에 포함)', official: '오피셜형 (55 · 15 · 30, 운영본부가 리더)' };

export async function propose({ me }) {
  const canGroup = me.role === 'staff' || me.level >= 'L4';
  const rounds = (await api('/rounds')).filter(r => r.status !== 'closed');
  const html = `<div class="wrap page" style="max-width:760px">
    ${pageHead(canGroup ? '챌린지 제안' : '솔로 챌린지 시작', canGroup ? '그룹 챌린지는 운영본부 심사(6개 항목, 45점 만점 중 27점 이상)를 거쳐 모집이 열립니다. 솔로 챌린지는 바로 시작됩니다.' : '혼자 진행하는 챌린지입니다. 체크인과 완료 기록, 페이퍼까지 같은 흐름으로 갑니다. 리더(L4)가 되면 그룹 챌린지를 제안할 수 있습니다.')}
    <form class="card form" data-form="prop">
      ${canGroup ? field('유형', `<div class="radio-cards"><label class="radio-card"><input type="radio" name="type" value="group" checked><div><b>그룹 챌린지</b><small>그룹장 + 그룹원 3~7명, 심사 후 모집, 합의서 필요</small></div></label><label class="radio-card"><input type="radio" name="type" value="solo"><div><b>솔로 챌린지</b><small>혼자 진행, 심사 없이 바로 시작</small></div></label>${me.role === 'staff' ? `<label class="radio-card"><input type="radio" name="type" value="official"><div><b>오피셜 챌린지</b><small>운영본부가 리더, 바로 모집</small></div></label>` : ''}</div>`) : '<input type="hidden" name="type" value="solo">'}
      <div class="form-cols">${field('제목 *', input('title', { required: true, placeholder: '예: 동네 자영업자 대상 인스타 운영 대행 3곳' }))}${field('분야 *', select('field_code', Object.entries(FIELDS)))}</div>
      ${rounds.length ? field('라운드', select('round_id', [['', '라운드 미지정'], ...rounds.map(r => [r.id, `${r.name} (${fmtDate(r.start_date)}~${fmtDate(r.end_date)})`])])) : ''}
      ${field('한 줄 요약 *', input('summary', { required: true, placeholder: '보드 카드에 보이는 문장. 80자 이내' }))}
      ${PROPOSAL_FIELDS.map(([k, l, h]) => field(l, textarea(`proposal.${k}`, { rows: 3, required: l.endsWith('*') }), h)).join('')}
      <div class="form-cols">${field('배분 프리셋 (그룹)', select('proposal.preset', Object.entries(PRESET_LABEL).filter(([k]) => me.role === 'staff' || k !== 'official')))}${field('소유권 유형 (그룹)', select('proposal.ownership', [['A', 'A형 · 그룹장 소유 + 마챌 사례 공개권'], ['B', 'B형 · 그룹 공동 소유'], ...(me.role === 'staff' ? [['C', 'C형 · 마챌 소유 (오피셜)']] : [])]))}</div>
      <div class="form-error error"></div>
      <button class="btn primary lg block" type="submit">${canGroup ? '제출' : '시작하기'}</button>
    </form></div>`;
  return { html, mount(root) { bindForms(root, { async prop(d) {
    const proposal = {}; for (const [k, v] of Object.entries(d)) if (k.startsWith('proposal.')) proposal[k.slice(9)] = v;
    const r = await post('/challenges', { type: d.type, title: d.title, field_code: d.field_code, round_id: d.round_id || null, summary: d.summary, proposal });
    toast(r.stage === 'review' ? '제출했습니다. 운영본부 심사 결과를 알림으로 보내 드립니다' : '챌린지가 만들어졌습니다');
    go(r.stage === 'active' ? `#/groups/${r.id}` : `#/challenges/${r.id}`);
  } }); } };
}

export async function editProposal({ params }) {
  const c = await api('/challenges/' + params.id);
  const p = c.proposal || {};
  const html = `<div class="wrap page" style="max-width:760px">${pageHead('제안서 수정', c.review ? `심사 의견: ${esc(c.review.comment || '')}` : '', `<a class="btn" href="#/challenges/${c.id}">← 돌아가기</a>`)}
    <form class="card form" data-form="edit">
      ${field('제목', input('title', { value: c.title }))}${field('한 줄 요약', input('summary', { value: c.summary || '' }))}
      ${PROPOSAL_FIELDS.map(([k, l, h]) => field(l.replace(' *', ''), textarea(`proposal.${k}`, { rows: 3, value: p[k] || '' }), h)).join('')}
      <div class="form-cols">${field('배분 프리셋', select('proposal.preset', Object.entries(PRESET_LABEL), p.preset))}${field('소유권 유형', select('proposal.ownership', [['A', 'A형'], ['B', 'B형'], ['C', 'C형']], p.ownership))}</div>
      <div class="btn-row"><button class="btn primary" type="submit" name="mode" value="save">저장</button>${c.stage === 'proposed' ? '<button class="btn" type="submit" name="mode" value="resubmit">저장하고 재제출</button>' : ''}</div>
    </form></div>`;
  return { html, mount(root) { bindForms(root, { async edit(d, f, submitter) {
    const proposal = {}; for (const [k, v] of Object.entries(d)) if (k.startsWith('proposal.')) proposal[k.slice(9)] = v;
    await put(`/challenges/${c.id}/proposal`, { title: d.title, summary: d.summary, proposal });
    if (submitter?.value === 'resubmit') { await post(`/challenges/${c.id}/resubmit`); toast('재제출했습니다'); } else toast('저장했습니다');
    go(`#/challenges/${c.id}`);
  } }); } };
}

// ---------------- 챌린지 상세 ----------------
export async function detail({ params, me }) {
  const c = await api('/challenges/' + params.id);
  const mine = c.my_membership;
  const isLeader = c.is_leader;
  const canApply = c.stage === 'recruiting' && c.type !== 'solo' && !isLeader && (!mine || ['rejected', 'left'].includes(mine.status));
  const pn = c.public_numbers || {};
  const html = `<div class="wrap page">
    <div class="row" style="margin-bottom:8px">${typeChip(c.type)}${stageChip(c.stage)}${fieldChip(c.field_code)}${c.round_name ? `<span class="chip">${esc(c.round_name)}</span>` : ''}</div>
    ${pageHead(esc(c.title), esc(c.summary || ''), [
      (mine && mine.status === 'active') || c.is_staff ? `<a class="btn primary" href="#/groups/${c.id}">그룹 공간</a>` : (c.can_see_logs ? `<a class="btn" href="#/groups/${c.id}">진행 기록 보기</a>` : ''),
      canApply && me.level >= 'L2' ? '<button class="btn primary" data-act="apply">참여 지원</button>' : (canApply ? '<span class="chip amber">메이커(L2)부터 지원 가능</span>' : ''),
      isLeader && ['proposed', 'review'].includes(c.stage) ? `<a class="btn" href="#/challenges/${c.id}/edit">제안서 수정</a>` : '',
      isLeader && c.stage === 'recruiting' && c.type !== 'solo' ? '<button class="btn" data-act="to-agreement">모집 마감 → 합의서</button>' : '',
      isLeader && ['recruiting', 'agreement', 'active'].includes(c.stage) ? '<button class="btn danger" data-act="stop" data-confirm="챌린지를 중단합니다. 중단해도 페이퍼는 제출해야 합니다. 계속할까요?">중단</button>' : '',
    ].filter(Boolean).join(''))}

    ${c.stage === 'proposed' && isLeader ? `<div class="notice warn">운영본부가 보완을 요청했습니다. ${c.review?.comment ? `<br>의견: ${esc(c.review.comment)}` : ''} 제안서를 고친 뒤 재제출해 주세요.</div>` : ''}
    ${c.stage === 'review' ? `<div class="notice">운영본부 심사 중입니다. 보통 3일 안에 결과가 나옵니다.</div>` : ''}
    ${c.stage === 'rejected' ? `<div class="notice danger">반려된 제안입니다. ${esc(c.review?.comment || '')}</div>` : ''}
    ${mine && mine.status === 'applied' ? `<div class="notice">지원서를 보냈습니다. 그룹장이 확인하면 알림을 드립니다.</div>` : ''}

    <div class="grid grid-2" style="margin-top:14px">
      <div class="stack">
        <div class="card"><h3>공개 숫자</h3><div class="grid grid-3">${stat('외부 매출', pn.has_sales ? '있음' : '아직')}${stat('외부 고객 수', esc(pn.customers_band || '0'))}${stat('투입 시간', num(pn.hours || 0) + 'h')}</div><p class="small muted" style="margin:10px 0 0">정확한 금액은 그룹원과 어치버 이상만 봅니다. 모든 챌린지가 매출 유무·고객 수 구간·투입 시간은 공개합니다.</p></div>
        ${c.milestones?.length ? `<div class="card"><h3>마일스톤</h3>${c.milestones.map(m => `<div class="milestone ${m.done_at ? 'done' : (m.due_date < new Date().toISOString().slice(0, 10) ? 'late' : '')}"><span class="dotm"></span><span class="grow">${esc(m.title)}</span><small class="muted">${m.done_at ? '완료 ' + fmtDate(m.done_at) : '~' + fmtDate(m.due_date)}</small></div>`).join('')}</div>` : ''}
        ${c.paper ? `<div class="card"><div class="card-head"><h3>프로젝트 페이퍼</h3><span class="chip ${c.paper.status === 'approved' || c.paper.status === 'published' ? 'green' : 'amber'}">${{ draft: '작성 중', review: '검토 중', approved: '공개', published: '공개' }[c.paper.status]}</span></div>${['approved', 'published'].includes(c.paper.status) ? `<a class="btn sm" href="#/papers/${c.paper.id}">페이퍼 읽기</a>` : '<p class="small muted" style="margin:0">아직 공개되지 않았습니다.</p>'}</div>` : ''}
      </div>
      <div class="stack">
        <div class="card"><div class="card-head"><h3>그룹</h3><span class="muted small">${c.members.length}명</span></div><div class="list">${c.members.map(m => `<div class="list-item"><div class="grow"><div class="title">${esc(m.nickname)} ${lvChip(m.level)}</div><div class="meta">${esc(m.role_name || m.role)}</div></div></div>`).join('')}</div></div>
        ${c.applicants ? `<div class="card"><div class="card-head"><h3>지원자</h3><span class="muted small">${c.applicants.length}명</span></div>${c.applicants.length ? `<div class="list">${c.applicants.map(a => `<div class="list-item"><div class="grow"><div class="title">${esc(a.nickname)} ${lvChip(a.level)}</div><div class="meta">${esc((a.interests || '').split(',').filter(Boolean).map(k => FIELDS[k] || k).join(', '))}</div>${a.apply_note ? `<div class="small" style="margin-top:4px">${nl2br(a.apply_note)}</div>` : ''}</div><div class="btn-row" style="flex-direction:column"><button class="btn sm primary" data-act="accept" data-uid="${a.user_id}" data-name="${esc(a.nickname)}">수락</button><button class="btn sm" data-act="reject" data-uid="${a.user_id}">거절</button></div></div>`).join('')}</div>` : '<p class="small muted" style="margin:0">아직 지원자가 없습니다. 커뮤니티에 모집 글을 올려 보세요.</p>'}</div>` : ''}
        ${c.proposal ? `<div class="card"><h3>제안서</h3><div class="small stack">${PROPOSAL_FIELDS.filter(([k]) => c.proposal[k]).map(([k, l]) => `<div><b>${esc(l.replace(' *', ''))}</b><div>${nl2br(c.proposal[k])}</div></div>`).join('')}<div><b>배분 프리셋</b> · ${esc(PRESET_LABEL[c.proposal.preset] || c.proposal.preset || '-')}</div><div><b>소유권</b> · ${esc(c.proposal.ownership || '-')}형</div></div>${c.review ? `<div class="divider"></div><div class="small"><b>심사 결과</b> · 합계 ${c.review.total}점 ${c.review.decision === 'approve' ? '(통과)' : ''}<br>${esc(c.review.comment || '')}</div>` : ''}</div>` : ''}
      </div>
    </div></div>`;
  return { html, mount(root) { bindActions(root, {
    apply() { modal(`<h3>참여 지원</h3><p class="small muted">그룹장이 읽습니다. 왜 이 챌린지에 맞는지, 무엇을 할 수 있는지, 주당 몇 시간을 낼 수 있는지 적어 주세요.</p><form class="form" data-form="ap">${field('지원 메모', textarea('note', { rows: 4, required: true }))}<div class="btn-row"><button class="btn primary" type="submit">지원</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`, { onMount(m) { bindForms(m, { async ap(d) { await post(`/challenges/${c.id}/apply`, d); closeModal(); toast('지원했습니다'); reload(); } }); } }); },
    accept(el) { modal(`<h3>${esc(el.dataset.name)}님 수락</h3><form class="form" data-form="ac">${field('역할', select('role', Object.entries(ROLES).filter(([k]) => k !== 'leader')))}<p class="small muted">역할 가중치: 회계 1.2 · 제작/마케팅 1.15 · 기록 1.1 · 일반 1.0. 합의서에서 다시 조정할 수 있습니다.</p><div class="btn-row"><button class="btn primary" type="submit">수락</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`, { onMount(m) { bindForms(m, { async ac(d) { await post(`/challenges/${c.id}/members/${el.dataset.uid}`, { action: 'accept', role: d.role }); closeModal(); toast('수락했습니다'); reload(); } }); } }); },
    async reject(el) { if (!confirm('이 지원자를 거절할까요?')) return; await post(`/challenges/${c.id}/members/${el.dataset.uid}`, { action: 'reject' }); toast('거절했습니다'); reload(); },
    async 'to-agreement'() { await post(`/challenges/${c.id}/stage`, { stage: 'agreement' }); toast('합의 단계로 넘어갔습니다. 그룹 공간에서 합의서를 작성하세요'); go(`#/groups/${c.id}/agreement`); },
    async stop() { await post(`/challenges/${c.id}/stage`, { stage: 'stopped' }); toast('중단 처리했습니다'); reload(); },
  }); } };
}

// ---------------- 그룹 공간 ----------------
const TABS = [['home', '홈'], ['checkin', '체크인'], ['logs', '완료 기록'], ['ledger', '장부'], ['agreement', '합의서'], ['settlement', '정산'], ['paper', '페이퍼'], ['members', '그룹원']];

export async function space({ params, me }) {
  const g = await api('/groups/' + params.id);
  const tab = params.tab || 'home';
  const c = g.challenge;
  const visible = g.is_member ? TABS : TABS.filter(([k]) => ['home', 'checkin', 'logs', 'paper', 'members'].includes(k));
  if (!visible.find(([k]) => k === tab)) { go(`#/groups/${c.id}`); return ''; }
  const body = { home: tabHome, checkin: tabCheckin, logs: tabLogs, ledger: tabLedger, agreement: tabAgreement, settlement: tabSettlement, paper: tabPaper, members: tabMembers }[tab](g, me);
  const html = `<div class="wrap page">
    <div class="row" style="margin-bottom:6px"><a href="#/challenges/${c.id}" class="small">← 챌린지 카드</a></div>
    <div class="page-head"><div><h1>${esc(c.title)}</h1><p>${typeChip(c.type)} ${stageChip(c.stage)} ${fieldChip(c.field_code)} · 그룹장 ${esc(c.leader_nickname)}${g.is_member ? '' : ' · <span class="chip purple">열람 모드</span>'}</p></div></div>
    ${tabs(visible.map(([k, l]) => [k, l, `#/groups/${c.id}${k === 'home' ? '' : '/' + k}`]), tab)}
    ${body.html}
  </div>`;
  return { html, mount(root) { if (body.mount) body.mount(root, g); } };
}

function tabHome(g) {
  const c = g.challenge; const today = new Date().toISOString().slice(0, 10);
  const latest = g.checkins[0];
  const html = `<div class="grid grid-2">
    <div class="stack">
      ${g.is_member && ['active', 'settling'].includes(c.stage) ? `<form class="card form" data-form="quicklog" style="gap:8px"><h3>오늘 한 일 한 줄</h3><div class="row"><input type="text" name="text" placeholder="예: 랜딩페이지 문구 초안 완성" required style="flex:1;min-width:0;padding:10px 12px;border:1px solid var(--line);border-radius:10px"><button class="btn primary" type="submit">기록</button></div><div class="row small"><input type="text" name="link" placeholder="링크 (선택)" style="flex:1;min-width:0;padding:8px 10px;border:1px solid var(--line);border-radius:8px">${check('shared', '커뮤니티 피드에 공유', true)}</div></form>` : ''}
      <div class="card"><div class="card-head"><h3>마일스톤</h3></div>${g.milestones.length ? g.milestones.map(m => `<div class="milestone ${m.done_at ? 'done' : (m.due_date < today ? 'late' : '')}"><span class="dotm"></span><span class="grow">${esc(m.title)}</span><small class="muted">${m.done_at ? '완료' : '~' + fmtDate(m.due_date)}</small></div>`).join('') : '<p class="small muted" style="margin:0">합의서가 승인되면 4·7·8·12주차 마일스톤이 자동으로 생깁니다.</p>'}</div>
      ${latest ? `<div class="card"><div class="card-head"><h3>${latest.week_no}주차 체크인</h3><a class="small" href="#/groups/${c.id}/checkin">전체</a></div><p class="small muted" style="margin:0 0 8px">제출 ${latest.entries.length} / ${g.members.length}명</p>${latest.entries.slice(0, 4).map(e => `<div class="small" style="padding:6px 0;border-top:1px solid var(--line)"><b>${esc(e.nickname)}</b> · ${esc((e.goals || [])[0] || (e.done || [])[0] || '')}${e.blocker ? ` <span class="chip red">막힘</span>` : ''}</div>`).join('')}</div>` : ''}
    </div>
    <div class="stack">
      ${c.stage === 'agreement' || (c.stage === 'recruiting' && g.is_leader) ? `<div class="notice warn">${g.agreement ? (g.agreement.status === 'locked' ? '합의서가 승인되었습니다.' : `합의서 서명 ${g.agreement.signatures.length} / ${g.members.length}명. <a href="#/groups/${c.id}/agreement">합의서로 →</a>`) : `아직 합의서가 없습니다. ${g.is_leader ? `<a href="#/groups/${c.id}/agreement">그룹장이 작성해 주세요 →</a>` : '그룹장이 작성하면 알림이 옵니다.'}`}</div>` : ''}
      <div class="card"><div class="card-head"><h3>최근 완료 기록</h3><a class="small" href="#/groups/${c.id}/logs">전체</a></div>${g.done_logs.length ? `<div class="list">${g.done_logs.slice(0, 6).map(logRow).join('')}</div>` : '<p class="small muted" style="margin:0">아직 기록이 없습니다.</p>'}</div>
      ${g.is_member ? `<div class="card"><div class="card-head"><h3>장부 요약</h3><a class="small" href="#/groups/${c.id}/ledger">장부</a></div><div class="grid grid-3">${stat('외부 매출', won(g.ledger_totals.revenue_external))}${stat('비용', won(g.ledger_totals.expenses))}${stat('순수익', won(g.ledger_totals.net), true)}</div></div>` : ''}
      <div class="card"><h3>공개 숫자</h3>${g.is_leader ? `<form class="form" data-form="pubnum" style="gap:8px"><div class="form-cols">${field('외부 매출', select('has_sales', [['0', '아직 없음'], ['1', '있음']], c.public_numbers.has_sales ? '1' : '0'))}${field('고객 수 구간', select('customers_band', [['0', '0'], ['1~4', '1~4'], ['5~19', '5~19'], ['20~99', '20~99'], ['100+', '100+']], c.public_numbers.customers_band))}</div>${field('총 투입 시간', input('hours', { type: 'number', value: c.public_numbers.hours || 0, min: 0 }))}<button class="btn sm" type="submit">저장</button></form>` : `<p class="small" style="margin:0">매출 ${c.public_numbers.has_sales ? '있음' : '아직'} · 고객 ${esc(c.public_numbers.customers_band || '0')} · ${num(c.public_numbers.hours || 0)}시간</p>`}</div>
    </div></div>`;
  return { html, mount(root) { bindForms(root, {
    async quicklog(d, f) { await post(`/groups/${g.challenge.id}/done-logs`, { text: d.text, link: d.link, shared: d.shared }); toast('기록했습니다. 그룹장이 확인하면 포인트가 적립됩니다'); reload(); },
    async pubnum(d) { await put(`/challenges/${g.challenge.id}`, { public_numbers: { has_sales: d.has_sales === '1', customers_band: d.customers_band, hours: d.hours } }); toast('저장했습니다'); },
  }); } };
}

function logRow(l) {
  return `<div class="list-item"><div class="grow"><div class="title" style="font-weight:550">${esc(l.text)}${l.link ? ` <a href="${esc(l.link)}" target="_blank" rel="noopener" class="small">링크</a>` : ''}</div><div class="meta">${esc(l.nickname)} · ${ago(l.created_at)}${l.cancelled_at ? ' · <span class="chip red">취소됨</span>' : (l.confirmed_at ? ' · <span class="chip green">확인됨</span>' : ' · 미확인')}</div></div><div class="btn-row">${!l.confirmed_at && !l.cancelled_at ? `<button class="btn sm" data-act="confirm" data-id="${l.id}" data-leader-only>확인</button>` : ''}${!l.cancelled_at ? `<button class="btn sm ghost" data-act="cancel" data-id="${l.id}" data-owner="${l.user_id}">취소</button>` : ''}</div></div>`;
}

function tabLogs(g, me) {
  const html = `<div class="card"><div class="card-head"><h3>완료 기록</h3><span class="small muted">그룹장이 확인한 기록만 기여도와 포인트에 반영됩니다</span></div>
    ${g.is_member && ['active', 'settling'].includes(g.challenge.stage) ? `<form class="form" data-form="log" style="gap:8px;margin-bottom:14px"><div class="row"><input type="text" name="text" placeholder="완료한 일 (300자 이내)" required style="flex:1;min-width:0;padding:10px 12px;border:1px solid var(--line);border-radius:10px"><button class="btn primary" type="submit">기록</button></div><div class="row small"><input type="text" name="link" placeholder="증빙 링크 (선택)" style="flex:1;min-width:0;padding:8px 10px;border:1px solid var(--line);border-radius:8px">${check('shared', '피드 공유', true)}</div></form>` : ''}
    ${g.done_logs.length ? `<div class="list">${g.done_logs.map(logRow).join('')}</div>` : empty('기록이 없습니다')}</div>`;
  return { html, mount(root) {
    // 권한에 맞지 않는 버튼 숨김
    root.querySelectorAll('[data-leader-only]').forEach(b => { if (!g.is_leader) b.remove(); });
    root.querySelectorAll('[data-act=cancel]').forEach(b => { if (!g.is_leader && Number(b.dataset.owner) !== me.id) b.remove(); });
    bindForms(root, { async log(d) { await post(`/groups/${g.challenge.id}/done-logs`, d); toast('기록했습니다'); reload(); } });
    bindActions(root, { async confirm(el) { await post(`/groups/${g.challenge.id}/done-logs/${el.dataset.id}`, { action: 'confirm' }); toast('확인했습니다'); reload(); }, async cancel(el) { await post(`/groups/${g.challenge.id}/done-logs/${el.dataset.id}`, { action: 'cancel' }); reload(); } });
  } };
}

function tabCheckin(g, me) {
  const c = g.challenge;
  const nextWeek = (g.checkins[0]?.week_no || 0) + 1;
  const html = `<div class="stack">
    ${g.is_leader && ['active', 'settling', 'agreement'].includes(c.stage) ? `<form class="card form" data-form="open" style="gap:8px"><div class="row between"><h3 style="margin:0">체크인 열기</h3><span class="small muted">매주 같은 요일에</span></div><div class="row"><div class="field" style="margin:0"><input type="number" name="week_no" value="${nextWeek}" min="1" max="52" style="width:90px"></div><span class="small">주차</span><div class="field" style="margin:0"><input type="date" name="due_date"></div><button class="btn primary sm" type="submit">열기</button></div></form>` : ''}
    ${g.checkins.length ? g.checkins.map(ck => {
      const mine = ck.entries.find(e => e.user_id === me.id);
      return `<div class="card"><div class="card-head"><h3>${ck.week_no}주차</h3><span class="small muted">${ck.due_date ? '마감 ' + fmtDate(ck.due_date) + ' · ' : ''}제출 ${ck.entries.length}/${g.members.length}</span></div>
        ${g.is_member && !mine ? `<form class="form" data-form="entry" data-ck="${ck.id}" style="gap:8px;background:var(--blue-tint);padding:12px;border-radius:10px"><b class="small">내 체크인 (3분)</b>${field('지난주 완료한 일 (최대 3개)', `<input type="text" name="done[]" placeholder="1." style="margin-bottom:6px"><input type="text" name="done[]" placeholder="2." style="margin-bottom:6px"><input type="text" name="done[]" placeholder="3.">`)}${field('이번 주 목표 (최대 3개)', `<input type="text" name="goals[]" placeholder="1." style="margin-bottom:6px"><input type="text" name="goals[]" placeholder="2.">`)}<div class="form-cols">${field('막힌 점 (있으면)', input('blocker', { placeholder: '도움이 필요한 것' }))}${field('이번 주 투입 시간', input('hours', { type: 'number', value: 0, min: 0, max: 168 }))}</div><button class="btn primary sm" type="submit">제출</button></form>` : ''}
        ${ck.entries.length ? `<div class="list" style="margin-top:8px">${ck.entries.map(e => `<div class="list-item"><div class="grow"><div class="title">${esc(e.nickname)} <small class="muted">${num(e.hours)}h</small></div><div class="small">${e.done?.length ? `<div><b>완료</b> · ${e.done.map(esc).join(' / ')}</div>` : ''}${e.goals?.length ? `<div><b>목표</b> · ${e.goals.map(esc).join(' / ')}</div>` : ''}${e.blocker ? `<div style="color:var(--red)"><b>막힘</b> · ${esc(e.blocker)}</div>` : ''}</div></div></div>`).join('')}</div>` : '<p class="small muted" style="margin:8px 0 0">아직 제출한 사람이 없습니다.</p>'}
      </div>`; }).join('') : empty('체크인이 아직 열리지 않았습니다', g.is_leader ? '위에서 1주차를 열어 보세요' : '그룹장이 열면 알림이 옵니다')}
  </div>`;
  return { html, mount(root) { bindForms(root, {
    async open(d) { await post(`/groups/${c.id}/checkins`, d); toast('체크인을 열었습니다'); reload(); },
    async entry(d, f) { await post(`/groups/${c.id}/checkins/${f.dataset.ck}/entries`, d); toast('제출했습니다 (+20점)'); reload(); },
  }); } };
}

function tabLedger(g, me) {
  const c = g.challenge; const t = g.ledger_totals;
  const html = `<div class="stack">
    <div class="grid grid-4">${stat('외부 매출', won(t.revenue_external), true)}${stat('내부 매출 (회원 간)', won(t.revenue_internal))}${stat('비용', won(t.expenses))}${stat('순수익 (외부 기준)', won(t.net))}</div>
    <p class="small muted" style="margin:0">그룹원 분담금 ${won(t.member_contrib)} · 운영본부 선지원 ${won(t.hq_advance)} — 정산 때 순수익에서 먼저 돌려받습니다. 내부 매출(마챌 회원이 산 것)은 참고용이고 배분 대상이 아닙니다.</p>
    ${['active', 'settling'].includes(c.stage) ? `<form class="card form" data-form="entry" style="gap:10px"><h3>장부 기록</h3><div class="form-cols">${field('구분', select('kind', [['revenue', '매출'], ['expense', '비용']]))}${field('날짜', input('entry_date', { type: 'date', value: new Date().toISOString().slice(0, 10), required: true }))}${field('금액 (원)', input('amount', { type: 'number', min: 1, required: true }))}${field('채널 / 항목', input('channel', { placeholder: '예: 스마트스토어, 현장 결제 / 재료비, 광고비' }))}</div><div class="form-cols">${field('매출일 때: 고객 구분', select('is_external', [['1', '외부 고객'], ['0', '마챌 회원 (내부)']]))}${field('비용일 때: 누가 냈나요?', select('payer_type', [['none', '그룹 공동 (매출에서 지출)'], ['member', '그룹원 개인 분담'], ...(g.is_staff ? [['hq', '운영본부 선지원']] : [])]))}</div>${field('증빙 링크 / 메모', input('evidence', { placeholder: '영수증 사진 링크, 입금 내역 등' }))}<button class="btn primary" type="submit">기록</button></form>` : ''}
    <div class="card"><h3>기록</h3>${g.ledger.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>날짜</th><th>구분</th><th>항목</th><th class="num">금액</th><th>기록자</th><th>확인</th></tr></thead><tbody>${g.ledger.map(l => `<tr><td>${fmtDate(l.entry_date)}</td><td>${l.kind === 'revenue' ? (l.is_external ? '<span class="chip green">외부 매출</span>' : '<span class="chip">내부 매출</span>') : `<span class="chip amber">비용</span>${l.payer_type === 'member' ? `<br><small>${esc(l.payer_name || '')} 분담</small>` : l.payer_type === 'hq' ? '<br><small>운영본부 선지원</small>' : ''}`}</td><td>${esc(l.channel || l.category || '')}${l.evidence ? ` <a href="${esc(l.evidence)}" target="_blank" rel="noopener" class="small">증빙</a>` : ''}${l.note ? `<br><small class="muted">${esc(l.note)}</small>` : ''}</td><td class="num">${won(l.amount)}</td><td>${esc(l.entered_by_name)}</td><td>${l.confirmed_by ? '✓' : (g.is_leader ? `<button class="btn sm" data-act="confirm" data-id="${l.id}">확인</button>` : '-')}</td></tr>`).join('')}</tbody></table></div>` : empty('장부가 비어 있습니다', '첫 비용부터 적어 두면 정산이 편합니다')}</div>
  </div>`;
  return { html, mount(root) { bindForms(root, { async entry(d) { d.is_external = d.is_external === '1'; await post(`/groups/${c.id}/ledger`, d); toast('기록했습니다'); reload(); } }); bindActions(root, { async confirm(el) { await post(`/groups/${c.id}/ledger/${el.dataset.id}/confirm`); reload(); } }); } };
}

function tabAgreement(g, me) {
  const c = g.challenge; const a = g.agreement; const presets = g.presets;
  const canEdit = g.is_leader && (!a || ['draft', 'signing'].includes(a.status)) && ['recruiting', 'agreement'].includes(c.stage);
  const signedByMe = a && a.signatures.some(s => s.user_id === me.id);
  const view = a ? `<div class="card"><div class="card-head"><h3>합의서 v${a.version}</h3><span class="chip ${a.status === 'locked' ? 'green' : a.status === 'signed' ? 'blue' : 'amber'}">${{ draft: '서명 대기', signing: '서명 중', signed: '전원 서명 · 승인 대기', approved: '승인', locked: '승인 · 잠금' }[a.status]}</span></div>
      <div class="paper-kv" style="margin-bottom:12px">${[['배분', `${Math.round(a.clauses.ratios.hq * 100)} / ${Math.round(a.clauses.ratios.leader * 100)} / ${Math.round(a.clauses.ratios.pool * 100)}`, '운영본부 / 그룹장 / 그룹원 풀'], ['프리셋', esc(presets[a.clauses.preset]?.label || a.clauses.preset), a.clauses.leader_in_pool ? '그룹장도 풀에 포함' : ''], ['소유권', a.clauses.ownership_type + '형', { A: '그룹장 소유 + 사례 공개권', B: '그룹 공동 소유', C: '마챌 소유' }[a.clauses.ownership_type]], ['예산 상한', `${won(a.clauses.budget_cap_person)} / ${won(a.clauses.budget_cap_group)}`, '1인 / 그룹'], ['정산 방식', { leader: '그룹장 지급', joint: '공동 계좌', agency: '운영본부 대행 (3%)' }[a.clauses.settlement_mode], ''], ['최소 정산', won(a.clauses.min_settlement), '미만이면 이월'], ['체크인 요일', esc(a.clauses.checkin_day || '-'), ''], ['규정 기준', esc(a.clauses.rule_doc), '']].map(([k, v, s]) => `<div class="kv"><small>${k}</small><b>${v}</b>${s ? `<br><small>${s}</small>` : ''}</div>`).join('')}</div>
      <h3 class="small" style="margin-top:14px">역할과 예정 기여율</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>그룹원</th><th>역할</th><th class="num">예정 기여율</th><th>서명</th></tr></thead><tbody>${g.members.map(m => { const r = a.clauses.roles.find(x => x.user_id === m.user_id) || {}; const s = a.signatures.find(x => x.user_id === m.user_id); return `<tr><td>${esc(m.nickname)}</td><td>${ROLES[m.role === 'leader' ? 'leader' : r.role] || '-'}</td><td class="num">${m.role === 'leader' && !a.clauses.leader_in_pool ? '그룹장 몫' : (r.planned_share != null ? pct(r.planned_share) : '균등')}</td><td>${s ? `<span class="chip green">서명 ${fmtDate(s.signed_at)}</span>` : '<span class="chip">대기</span>'}</td></tr>`; }).join('')}</tbody></table></div>
      ${a.clauses.special_terms ? `<div class="divider"></div><b class="small">특약</b><p class="small">${nl2br(a.clauses.special_terms)}</p>` : ''}${a.clauses.assets ? `<b class="small">투입 자산</b><p class="small">${nl2br(a.clauses.assets)}</p>` : ''}${a.clauses.after_round ? `<b class="small">라운드 이후</b><p class="small">${nl2br(a.clauses.after_round)}</p>` : ''}
      <div class="notice small" style="margin-top:10px">정산 순서: 매출 − 비용 → 그룹원 분담금 회수 → 운영본부 선지원 회수 → ${a.clauses.settlement_mode === 'agency' ? '대행 수수료 3% → ' : ''}운영본부 ${Math.round(a.clauses.ratios.hq * 100)}% → 그룹장 ${Math.round(a.clauses.ratios.leader * 100)}% → 그룹원 풀 ${Math.round(a.clauses.ratios.pool * 100)}%(실제 기여율대로). 기여율은 역할 가중치 × 확인된 완료 기록 × 체크인 출석으로 자동 산정되며 그룹장이 ±${Math.round(g.settings.share_adjust_limit * 100)}%p 안에서 조정합니다. 지급액에는 3.3% 원천징수 참고액을 표시합니다. 이 합의서는 마챌 운영방침(MC-03)에 따른 그룹 내부 약속이며, 금전 분쟁은 1차 그룹 조정 → 2차 운영본부 조정으로 처리합니다.</div>
      ${g.is_member && ['draft', 'signing'].includes(a.status) && !signedByMe ? `<form class="form" data-form="sign" style="margin-top:12px">${check('agree', '위 조항을 모두 읽었고 동의합니다. 서명은 마챌 안에서의 약속으로 기록됩니다.')}<button class="btn primary" type="submit">서명하기</button></form>` : ''}
      ${signedByMe && a.status !== 'locked' ? '<p class="small muted" style="margin-top:10px">서명했습니다. 전원이 서명하면 운영본부가 검토합니다.</p>' : ''}
    </div>` : '';
  const editor = canEdit ? agreementEditor(g, a) : '';
  const html = `<div class="stack">${!a && !canEdit ? empty('아직 합의서가 없습니다', '그룹장이 작성하면 서명 요청 알림이 옵니다') : ''}${view}${editor}</div>`;
  return { html, mount(root) {
    bindForms(root, {
      async sign(d) { await post(`/groups/${c.id}/agreement/sign`, d); toast('서명했습니다'); reload(); },
      async agree(d) {
        const clauses = { preset: d.preset, ratios: { hq: Number(d.r_hq) / 100, leader: Number(d.r_leader) / 100, pool: Number(d.r_pool) / 100 }, leader_in_pool: !!d.leader_in_pool, ownership_type: d.ownership_type, budget_cap_person: d.budget_cap_person, budget_cap_group: d.budget_cap_group, hq_advance_allowed: !!d.hq_advance_allowed, settlement_mode: d.settlement_mode, checkin_day: d.checkin_day, special_terms: d.special_terms, after_round: d.after_round, assets: d.assets,
          roles: g.members.map(m => ({ user_id: m.user_id, role: d[`role_${m.user_id}`] || (m.role === 'leader' ? 'leader' : 'general'), planned_share: d[`share_${m.user_id}`] === '' || d[`share_${m.user_id}`] == null ? null : Number(d[`share_${m.user_id}`]) / 100 })) };
        await post(`/groups/${c.id}/agreement`, { clauses }); toast('합의서를 저장하고 서명 요청을 보냈습니다'); reload();
      },
    });
    const f = root.querySelector('form[data-form=agree]'); if (!f) return;
    const sync = () => { const p = presets[f.preset.value]; if (!p) return; f.r_hq.value = Math.round(p.hq * 100); f.r_leader.value = Math.round(p.leader * 100); f.r_pool.value = Math.round(p.pool * 100); f.leader_in_pool.checked = !!p.leader_in_pool; };
    f.preset.addEventListener('change', sync);
    ['r_hq', 'r_leader'].forEach(n => f[n].addEventListener('input', () => { f.r_pool.value = 100 - Number(f.r_hq.value) - Number(f.r_leader.value); }));
  } };
}

function agreementEditor(g, a) {
  const cl = a?.clauses || {}; const presets = g.presets; const s = g.settings;
  const ratios = cl.ratios || presets.basic;
  return `<form class="card form" data-form="agree"><h3>${a ? '합의서 수정 (서명이 초기화됩니다)' : '합의서 작성'}</h3>
    ${field('배분 프리셋', select('preset', Object.entries(presets).filter(([k]) => g.is_staff || k !== 'official').map(([k, p]) => [k, `${p.label} — ${p.desc}`]), cl.preset || 'basic'))}
    <div class="form-cols" style="grid-template-columns:1fr 1fr 1fr">${field('운영본부 %', input('r_hq', { type: 'number', value: Math.round(ratios.hq * 100), min: 0, max: 100 }))}${field('그룹장 %', input('r_leader', { type: 'number', value: Math.round(ratios.leader * 100), min: 0, max: 100 }))}${field('그룹원 풀 %', input('r_pool', { type: 'number', value: Math.round(ratios.pool * 100), min: 0, max: 100 }))}</div>
    <p class="small muted" style="margin:-6px 0 0">프리셋에서 ±10%p 안에서 조정. 운영본부 몫은 ${s.hq_ratio_range[0] * 100}~${s.hq_ratio_range[1] * 100}% 범위.</p>
    ${check('leader_in_pool', '그룹장도 그룹원 풀 배분에 포함 (균등형)', !!cl.leader_in_pool)}
    ${field('소유권 유형', `<div class="radio-cards">${[['A', 'A형 · 그룹장 소유', '브랜드·계정·자산은 그룹장 소유. 마챌은 사례 공개권, 그룹원은 포트폴리오 사용권'], ['B', 'B형 · 그룹 공동 소유', '지분은 실제 기여율에 따름. 라운드 후 운영 주체를 다시 정함'], ...(g.is_staff || g.challenge.type === 'official' ? [['C', 'C형 · 마챌 소유', '오피셜 챌린지. 참여자는 배분과 포트폴리오 사용권']] : [])].map(([v, t, d]) => `<label class="radio-card"><input type="radio" name="ownership_type" value="${v}" ${(cl.ownership_type || 'A') === v ? 'checked' : ''}><div><b>${t}</b><small>${d}</small></div></label>`).join('')}</div>`)}
    <div class="form-cols">${field('1인 예산 상한 (원)', input('budget_cap_person', { type: 'number', value: cl.budget_cap_person ?? s.budget_cap_person, min: 0 }))}${field('그룹 예산 상한 (원)', input('budget_cap_group', { type: 'number', value: cl.budget_cap_group ?? s.budget_cap_group, min: 0 }))}</div>
    <div class="form-cols">${field('정산 방식', select('settlement_mode', [['leader', '그룹장이 수령 후 지급'], ['joint', '공동 계좌'], ['agency', `운영본부 대행 (수수료 ${s.agency_rate * 100}%)`]], cl.settlement_mode || 'leader'))}${field('체크인 요일', select('checkin_day', ['월', '화', '수', '목', '금', '토', '일'].map(d => [d, d + '요일']), cl.checkin_day || '수'))}</div>
    ${check('hq_advance_allowed', '필요 시 운영본부 선지원(비용 대납)을 요청할 수 있음', !!cl.hq_advance_allowed)}
    <h3 class="small">역할과 예정 기여율</h3>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>그룹원</th><th>역할</th><th class="num">예정 기여율 % (풀 내, 비워도 됨)</th></tr></thead><tbody>${g.members.map(m => { const r = (cl.roles || []).find(x => x.user_id === m.user_id) || {}; return `<tr><td>${esc(m.nickname)}</td><td>${m.role === 'leader' ? '그룹장' : select(`role_${m.user_id}`, Object.entries(ROLES).filter(([k]) => k !== 'leader'), r.role || m.role)}</td><td class="num">${m.role === 'leader' && !cl.leader_in_pool ? '-' : `<input type="number" name="share_${m.user_id}" value="${r.planned_share != null ? Math.round(r.planned_share * 100) : ''}" min="0" max="100" style="width:80px">`}</td></tr>`; }).join('')}</tbody></table></div>
    <p class="small muted" style="margin:0">예정 기여율은 참고값입니다. 실제 배분은 자동 산정된 기여율(역할 가중치 × 확인된 완료 기록 × 출석)을 기준으로 하고, 예정치와 20%p 이상 차이 나면 운영본부가 확인합니다.</p>
    ${field('투입 자산 (누가 무엇을 가져오나)', textarea('assets', { rows: 2, value: cl.assets || '' }))}
    ${field('특약', textarea('special_terms', { rows: 3, value: cl.special_terms || '', placeholder: '예: 라운드 종료 후 인스타 계정은 그룹장이 유지하되 그룹원 포트폴리오 표기 허용' }))}
    ${field('라운드 이후 계획', input('after_round', { value: cl.after_round || '' }))}
    <button class="btn primary lg" type="submit">저장하고 서명 요청</button>
  </form>`;
}

function tabSettlement(g, me) {
  const c = g.challenge; const a = g.agreement;
  const canSettle = g.is_leader && a && a.status === 'locked' && ['active', 'settling'].includes(c.stage);
  const contrib = g.contribution || [];
  const html = `<div class="stack">
    ${canSettle ? `<div class="card"><h3>1. 실제 기여율 확정</h3><p class="small muted">자동 산정값 = 역할 가중치 × (1 + 확인된 완료 기록 수) × 체크인 출석률, 합계를 100%로 정규화. 그룹장은 ±${Math.round(g.settings.share_adjust_limit * 100)}%p 안에서만 조정할 수 있습니다.</p>
      <form class="form" data-form="contrib"><div class="table-wrap"><table class="tbl"><thead><tr><th>그룹원</th><th>역할(가중치)</th><th class="num">확인 기록</th><th class="num">출석</th><th class="num">자동 산정</th><th class="num">확정 %</th></tr></thead><tbody>${contrib.map(r => `<tr><td>${esc(r.nickname)}</td><td>${ROLES[r.role]} (${r.weight})</td><td class="num">${r.done}</td><td class="num">${pct(r.attendance)}</td><td class="num">${pct(r.auto_share)}</td><td class="num"><input type="number" step="0.1" name="share_${r.user_id}" value="${r.actual_share != null ? Math.round(r.actual_share * 1000) / 10 : Math.round(r.auto_share * 1000) / 10}" style="width:84px"></td></tr>`).join('')}</tbody></table></div><button class="btn" type="submit">기여율 저장</button></form></div>
      <div class="card"><h3>2. 정산표 만들기</h3><p class="small muted">장부의 기간 내 기록으로 정산표를 계산합니다. 만들어지면 그룹원 전원에게 확인 요청이 갑니다. 정산 가능 금액이 ${won(g.settings.min_settlement)} 미만이면 자동 이월됩니다.</p><form class="form" data-form="settle"><div class="form-cols">${field('기간 시작', input('period_start', { type: 'date', value: c.round_start || '' }))}${field('기간 끝', input('period_end', { type: 'date', value: new Date().toISOString().slice(0, 10) }))}</div><button class="btn primary" type="submit">정산표 생성</button></form></div>` : (g.is_leader ? `<div class="notice warn">정산은 승인(잠금)된 합의서가 있고 챌린지가 진행 중일 때 그룹장이 시작합니다.</div>` : '')}
    <div class="card"><h3>정산 내역</h3>${g.settlements.length ? `<div class="list">${g.settlements.map(s => `<a class="list-item" href="#/settlements/${s.id}" style="color:inherit"><div class="grow"><div class="title">${fmtDate(s.period_start)} ~ ${fmtDate(s.period_end)}</div><div class="meta">${settleStatus(s.status)} · 정산 가능 ${won(s.result.D)} · 운영본부 ${won(s.result.A)} · 그룹장 ${won(s.result.L)} · 풀 ${won(s.result.P)}</div></div><span>→</span></a>`).join('')}</div>` : '<p class="small muted" style="margin:0">아직 정산이 없습니다.</p>'}</div>
  </div>`;
  return { html, mount(root) { bindForms(root, {
    async contrib(d) { const shares = contrib.map(r => ({ user_id: r.user_id, share: Number(d[`share_${r.user_id}`]) / 100 })); const r = await post(`/groups/${c.id}/contribution`, { shares }); toast(r.alert ? '저장했습니다. 예정치와 차이가 커서 운영본부에 알림이 갔습니다' : '저장했습니다'); reload(); },
    async settle(d) { const r = await post(`/groups/${c.id}/settlements`, d); toast(r.status === 'carried' ? '정산 가능 금액이 최소 기준 미만이라 다음으로 이월했습니다' : r.status === 'reviewed' ? '순수익이 없어 배분 없이 기록했습니다' : '정산표를 만들었습니다. 그룹원 확인을 기다립니다'); go(`#/settlements/${r.id}`); },
  }); } };
}
export function settleStatus(s) { const m = { confirming: ['그룹원 확인 중', 'amber'], disputed: ['이의 조정 중', 'red'], reviewed: ['검수 완료 · 지급 대기', 'blue'], paid: ['지급 완료', 'green'], carried: ['이월', ''], carried_used: ['이월 반영됨', ''] }[s] || [s, '']; return `<span class="chip ${m[1]}">${m[0]}</span>`; }

function tabPaper(g, me) {
  const c = g.challenge; const p = g.paper; const f = p?.form || {};
  const canEdit = g.is_leader && (!p || p.status === 'draft' || g.is_staff);
  const stateLabel = { ongoing: '계속 운영', transferred: '그룹원에게 이관', stopped: '중단', closed: '정리' };
  const view = p ? `<div class="card"><div class="card-head"><h3>프로젝트 페이퍼</h3><span class="chip ${['approved', 'published'].includes(p.status) ? 'green' : 'amber'}">${{ draft: '작성 중', review: '운영진 검토 중', approved: '승인 · 공개', published: '공개' }[p.status]}</span></div>${p.review_note ? `<div class="notice ${p.status === 'draft' ? 'warn' : ''}">운영진 의견: ${esc(p.review_note)}</div>` : ''}${['approved', 'published'].includes(p.status) ? `<a class="btn sm" href="#/papers/${p.id}">공개 페이지 보기</a>` : ''}</div>` : '';
  const editor = canEdit ? `<form class="card form" data-form="paper" id="paperform"><h3>${p ? '페이퍼 수정' : '페이퍼 작성'}</h3><p class="small muted">A4 두 장이면 충분합니다. 장부·체크인 숫자를 <button class="btn sm" type="button" data-act="prefill">자동으로 채우기</button>. 매출이 없어도, 중단했어도 씁니다. 안 된 이유가 다음 사람에게 가장 비쌉니다.</p>
    ${field('프로젝트 이름', input('form.name', { value: f.name || c.title }))}
    ${field('해결하려던 문제 (1~2문장)', textarea('form.pain', { rows: 2, value: f.pain || '', required: true }))}
    ${field('만든 것·판 것', textarea('form.product', { rows: 2, value: f.product || '' }))}
    ${field('주요 마일스톤 (최대 5개)', [0, 1, 2, 3, 4].map(i => `<input type="text" name="form.milestones[]" value="${esc((f.milestones || [])[i] || '')}" placeholder="${i + 1}." style="margin-bottom:6px">`).join(''))}
    <div class="form-cols"><div class="form-cols" style="grid-template-columns:1fr 1fr">${field('외부 매출 (원)', input('form.revenue_external', { type: 'number', value: f.revenue_external ?? '', min: 0 }))}${field('내부 매출 (원)', input('form.revenue_internal', { type: 'number', value: f.revenue_internal ?? '', min: 0 }))}</div><div class="form-cols" style="grid-template-columns:1fr 1fr">${field('총 비용 (원)', input('form.expenses', { type: 'number', value: f.expenses ?? '', min: 0 }))}${field('외부 고객 수', input('form.customers', { type: 'number', value: f.customers ?? '', min: 0 }))}</div></div>
    <div class="form-cols">${field('총 투입 시간', input('form.hours', { type: 'number', value: f.hours ?? '', min: 0 }))}${field('현재 상태', select('form.state', Object.entries(stateLabel), f.state || 'ongoing'))}</div>
    ${field('잘된 것 3가지', [0, 1, 2].map(i => `<input type="text" name="form.good[]" value="${esc((f.good || [])[i] || '')}" placeholder="${i + 1}." style="margin-bottom:6px">`).join(''))}
    ${field('안 된 것 3가지', [0, 1, 2].map(i => `<input type="text" name="form.bad[]" value="${esc((f.bad || [])[i] || '')}" placeholder="${i + 1}." style="margin-bottom:6px">`).join(''))}
    ${field('다음에 한다면', textarea('form.next', { rows: 2, value: f.next || '' }))}
    ${field('다음 도전자에게 한마디', textarea('form.to_next', { rows: 2, value: f.to_next || '' }))}
    ${field('비공개로 둘 항목 (매출 유무·고객 수 구간·투입 시간은 항상 공개)', `<div class="row">${[['revenue_external', '외부 매출액'], ['revenue_internal', '내부 매출액'], ['expenses', '비용'], ['customers', '정확한 고객 수'], ['product', '만든 것 상세'], ['bad', '안 된 것']].map(([k, l]) => check('private_fields[]', l, (p?.private_fields || []).includes(k), k)).join('')}</div>`)}
    ${field('공개 범위', select('publish_scope', [['members', '마챌 회원 (요약은 챌린저, 전문은 어치버 이상)'], ['public', '외부 공개 (요약만, 홈페이지 노출)']], p?.publish_scope || 'members'))}
    <div class="btn-row"><button class="btn" type="submit" name="mode" value="save">임시 저장</button><button class="btn primary" type="submit" name="mode" value="submit">제출 (운영진 검토 요청)</button></div></form>` : (!p ? empty('페이퍼가 아직 없습니다', '그룹장이 라운드 끝에 작성합니다') : '');
  const html = `<div class="stack">${view}${editor}</div>`;
  return { html, mount(root) {
    bindActions(root, { async prefill() { const d = await api(`/groups/${c.id}/paper/prefill`); const fm = root.querySelector('#paperform'); fm['form.revenue_external'].value = d.revenue_external; fm['form.revenue_internal'].value = d.revenue_internal; fm['form.expenses'].value = d.expenses; fm['form.hours'].value = d.hours; fm['form.customers'].value = d.customers_count; const ms = fm.querySelectorAll('[name="form.milestones[]"]'); d.milestones_hint.forEach((t, i) => { if (ms[i] && !ms[i].value) ms[i].value = t; }); toast('장부·체크인 숫자를 채웠습니다. 확인 후 고쳐 주세요'); } });
    bindForms(root, { async paper(d, fm, submitter) {
      const form = {}; for (const [k, v] of Object.entries(d)) if (k.startsWith('form.')) form[k.slice(5)] = v;
      const r = await post(`/groups/${c.id}/paper`, { form, private_fields: d.private_fields || [], publish_scope: d.publish_scope, submit: submitter?.value === 'submit' });
      toast(r.status === 'review' ? '제출했습니다. 운영진이 검토합니다 (+100점)' : '임시 저장했습니다'); reload();
    } });
  } };
}

function tabMembers(g, me) {
  const c = g.challenge;
  const html = `<div class="stack"><div class="card"><div class="card-head"><h3>그룹원</h3><span class="small muted">${g.members.length}명 · 정원 8명</span></div><div class="list">${g.members.map(m => `<div class="list-item"><div class="grow"><div class="title">${esc(m.nickname)} ${lvChip(m.level)}</div><div class="meta">${ROLES[m.role]} · 가중치 ${m.role_weight} · 합류 ${fmtDate(m.joined_at)}</div></div>${g.is_leader && m.role !== 'leader' && ['recruiting', 'agreement', 'active'].includes(c.stage) ? `<div class="btn-row"><button class="btn sm" data-act="role" data-uid="${m.user_id}" data-name="${esc(m.nickname)}" data-role="${m.role}">역할</button><button class="btn sm danger" data-act="remove" data-uid="${m.user_id}" data-confirm="${esc(m.nickname)}님을 그룹에서 이탈 처리할까요? 이탈 시점까지의 기여는 정산에 반영됩니다.">이탈</button></div>` : ''}</div>`).join('')}</div></div>
    ${g.left?.length ? `<div class="card"><h3>이탈한 그룹원</h3><div class="list">${g.left.map(m => `<div class="list-item"><div class="grow"><div class="title">${esc(m.nickname)}</div><div class="meta">${fmtDate(m.left_at)} · ${m.leave_type === 'unannounced' ? '무단 이탈 (기여분 50% 반영)' : '사전 고지 이탈'}</div></div></div>`).join('')}</div></div>` : ''}
    <div class="card soft small"><b>그룹 규칙 요약</b><ul style="margin:6px 0 0;padding-left:18px"><li>그룹원은 동시에 1개 그룹 챌린지에만 참여합니다.</li><li>2주 연속 무단 미제출은 그룹장이 운영본부에 알립니다.</li><li>이탈은 1주 전 고지가 원칙이며, 무단 이탈 시 기여분의 50%만 반영됩니다.</li><li>그룹장 교체는 운영본부 승인 절차(MC-03 4.4)로 진행합니다.</li></ul></div></div>`;
  return { html, mount(root) { bindActions(root, {
    role(el) { modal(`<h3>${esc(el.dataset.name)}님 역할 변경</h3><form class="form" data-form="role">${field('역할', select('role', Object.entries(ROLES).filter(([k]) => k !== 'leader'), el.dataset.role))}<div class="btn-row"><button class="btn primary" type="submit">저장</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`, { onMount(m) { bindForms(m, { async role(d) { await post(`/challenges/${c.id}/members/${el.dataset.uid}`, { action: 'role', role: d.role }); closeModal(); reload(); } }); } }); },
    async remove(el) { await post(`/challenges/${c.id}/members/${el.dataset.uid}`, { action: 'remove', leave_type: 'notice' }); toast('이탈 처리했습니다'); reload(); },
  }); } };
}

// ---------------- 정산 상세 ----------------
export async function settlement({ params, me }) {
  const s = await api('/settlements/' + params.id);
  const r = s.result; const i = s.inputs;
  const nameOf = uid => uid == null ? '운영본부' : (s.members.find(m => m.user_id === uid)?.nickname || `#${uid}`);
  const wf = [
    ['외부 매출 (R)', r.R], ['− 비용 (E)', -r.E], ['= 순수익 (N)', r.N, 'big'],
    ...(r.Mr ? [['− 그룹원 분담금 회수', -r.Mr], ...(r.member_refunds || []).map(x => [`　↳ ${nameOf(x.user_id)} (분담 ${won(x.contributed)})`, x.refund, 'sub'])] : []),
    ...(r.Hr ? [['− 운영본부 선지원 회수', -r.Hr]] : []),
    ...(r.F ? [['− 정산 대행 수수료', -r.F]] : []),
    ...(r.carry_in ? [['+ 이월분', r.carry_in]] : []),
    ['= 정산 가능 금액 (D)', r.D, 'big'],
  ];
  const html = `<div class="wrap page" style="max-width:860px">
    <div class="row" style="margin-bottom:6px"><a href="#/groups/${s.challenge_id}/settlement" class="small">← 그룹 정산 탭</a></div>
    ${pageHead(`정산표 · ${esc(s.title)}`, `${fmtDate(s.period_start)} ~ ${fmtDate(s.period_end)} · ${settleStatus(s.status)} · 규칙 v${esc(s.rule_version)}`, '<button class="btn" onclick="window.print()">인쇄 / PDF</button>')}
    ${r.status === 'no_distribution' ? '<div class="notice">순수익이 0 이하여서 이번 기간에는 배분이 없습니다. 비용은 합의서의 분담 원칙에 따릅니다.</div>' : ''}
    ${r.status === 'carried' ? `<div class="notice">정산 가능 금액 ${won(r.D)}이 최소 정산 기준 ${won(i.min_settlement)} 미만이라 다음 정산으로 이월됩니다.</div>` : ''}
    ${s.status === 'disputed' ? `<div class="notice danger">이의가 접수되어 조정 중입니다. 1차: 그룹 내 조정(7일) → 2차: 운영본부 조정. 조정 중인 금액은 보류되고 나머지는 지급될 수 있습니다.</div>` : ''}
    <div class="grid grid-2">
      <div class="card"><h3>계산 과정</h3><div class="waterfall">${wf.map(([l, v, cls]) => `<div class="wf-row ${cls || ''}"><span>${l}</span><span class="amt">${won(v)}</span></div>`).join('')}</div>
        ${r.status === 'distributed' ? `<div class="divider"></div><div class="waterfall"><div class="wf-row"><span>운영본부 ${pct(r.ratios.hq)} (A)</span><span class="amt">${won(r.A)}</span></div><div class="wf-row"><span>그룹장 ${pct(r.ratios.leader)} (L)</span><span class="amt">${won(r.L)}</span></div><div class="wf-row"><span>그룹원 풀 ${pct(r.ratios.pool)} (P)</span><span class="amt">${won(r.P)}</span></div></div>` : ''}
        <p class="small muted" style="margin:10px 0 0">소수점은 버림, 차액은 기여율이 가장 높은 그룹원에게 더합니다${r.adjustment ? ` (이번 조정액 ${won(r.adjustment)})` : ''}. 총 투입 ${num(r.total_hours)}시간${r.hourly_net != null ? ` · 시간당 순수익 약 ${won(r.hourly_net)}` : ''}.</p></div>
      <div class="card"><h3>지급표</h3>${r.status === 'distributed' ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>받는 사람</th><th class="num">기여율</th><th class="num">지급액</th><th class="num">원천징수 참고 (${pct(r.withholding_rate)})</th><th class="num">실수령 참고</th></tr></thead><tbody>
        <tr><td>운영본부</td><td class="num">-</td><td class="num">${won(r.A)}</td><td class="num">-</td><td class="num">${won(r.A)}</td></tr>
        <tr><td>${esc(nameOf(s.leader_id))} <small class="muted">그룹장</small></td><td class="num">-</td><td class="num">${won(r.L)}</td><td class="num">${won(r.leader_withholding)}</td><td class="num">${won(r.leader_net)}</td></tr>
        ${r.members.map(m => `<tr><td>${esc(nameOf(m.user_id))}</td><td class="num">${pct(m.share)}</td><td class="num">${won(m.gross)}</td><td class="num">${won(m.withholding)}</td><td class="num">${won(m.net)}</td></tr>`).join('')}
        ${(r.member_refunds || []).map(x => `<tr><td>${esc(nameOf(x.user_id))} <small class="muted">분담금 환급</small></td><td class="num">-</td><td class="num">${won(x.refund)}</td><td class="num">-</td><td class="num">${won(x.refund)}</td></tr>`).join('')}
        ${r.Hr ? `<tr><td>운영본부 <small class="muted">선지원 회수</small></td><td class="num">-</td><td class="num">${won(r.Hr)}</td><td class="num">-</td><td class="num">${won(r.Hr)}</td></tr>` : ''}
        </tbody></table></div><p class="small muted" style="margin:8px 0 0">원천징수 참고액은 사업소득 3.3% 기준의 안내용 숫자입니다. 실제 세무 처리는 지급 주체와 수령인이 각자 확인합니다.</p>` : '<p class="small muted">배분 대상 금액이 없습니다.</p>'}
        ${s.payouts.length ? `<div class="divider"></div><h3 class="small">지급 처리</h3><div class="list">${s.payouts.map(p => `<div class="list-item"><div class="grow"><div class="title" style="font-weight:600">${esc(p.nickname || '운영본부')} <small class="muted">${{ refund_member: '분담금 환급', refund_hq: '선지원 회수', fee: '대행 수수료', hq: '운영본부 몫', leader: '그룹장 몫', member: '그룹원 몫' }[p.kind]}</small></div><div class="meta">${won(p.gross)}${p.withholding ? ` (실수령 참고 ${won(p.net)})` : ''}</div></div>${p.status === 'paid' ? `<span class="chip green">지급 ${fmtDate(p.paid_at)}</span>` : p.status === 'held' ? '<span class="chip red">보류</span>' : '<span class="chip amber">대기</span>'}${s.is_leader && p.status !== 'paid' ? `<button class="btn sm" data-act="paid" data-id="${p.id}">지급 완료</button>` : ''}${s.is_staff && p.status === 'pending' ? `<button class="btn sm ghost" data-act="hold" data-id="${p.id}">보류</button>` : ''}</div>`).join('')}</div>` : ''}
      </div>
    </div>
    <div class="grid grid-2" style="margin-top:14px">
      <div class="card"><h3>그룹원 확인</h3><div class="list">${s.members.filter(m => m.status === 'active').map(m => { const cf = s.confirmations.find(x => x.user_id === m.user_id); return `<div class="list-item"><div class="grow"><div class="title" style="font-weight:600">${esc(m.nickname)}</div>${cf && !cf.confirmed ? `<div class="meta" style="color:var(--red)">이의: ${esc(cf.dispute_note)}</div>` : ''}</div>${cf ? (cf.confirmed ? '<span class="chip green">확인</span>' : '<span class="chip red">이의</span>') : '<span class="chip">대기</span>'}</div>`; }).join('')}</div>
        ${['confirming', 'disputed'].includes(s.status) && s.members.some(m => m.user_id === me.id && m.status === 'active') && !s.my_confirmation?.confirmed ? `<div class="divider"></div><form class="form" data-form="confirm"><p class="small">정산표를 확인했나요? 숫자가 맞으면 확인을, 다르면 이의 사유를 적어 주세요 (7일 안에).</p>${field('이의 사유 (이의 제기 시)', textarea('dispute_note', { rows: 2 }))}<div class="btn-row"><button class="btn primary" type="submit" name="mode" value="ok">확인합니다</button><button class="btn danger" type="submit" name="mode" value="dispute">이의 제기</button></div></form>` : ''}</div>
      ${s.is_staff ? `<div class="card"><h3>운영본부 검수</h3><p class="small muted">지급 조건: 전원 확인 + 페이퍼 승인. 페이퍼 상태: <b>${s.paper ? { draft: '작성 중', review: '검토 중', approved: '승인', published: '승인' }[s.paper.status] : '미제출'}</b></p>${['confirming', 'disputed'].includes(s.status) ? `<form class="form" data-form="review">${field('검수 메모', textarea('note', { rows: 2 }))}${check('force', '미확인·이의 그룹원이 있어도 승인하고 해당 지급은 보류 처리')}<div class="btn-row"><button class="btn primary" type="submit" name="mode" value="approve">검수 승인 → 지급표 확정</button><button class="btn" type="submit" name="mode" value="return">보완 요청</button></div></form>` : '<p class="small muted" style="margin:0">검수 단계가 아닙니다.</p>'}</div>` : ''}
    </div>
    <details class="card" style="margin-top:14px"><summary class="small" style="cursor:pointer">계산 입력값 (감사용)</summary><pre class="json">${esc(JSON.stringify(i, null, 2))}</pre></details>
  </div>`;
  return { html, mount(root) {
    bindForms(root, {
      async confirm(d, f, sub) { const ok = sub?.value === 'ok'; await post(`/settlements/${s.id}/confirm`, { confirmed: ok, dispute_note: d.dispute_note }); toast(ok ? '확인했습니다' : '이의를 접수했습니다'); reload(); },
      async review(d, f, sub) { await post(`/settlements/${s.id}/review`, { approve: sub?.value === 'approve', note: d.note, force: !!d.force }); toast(sub?.value === 'approve' ? '검수를 승인했습니다' : '보완을 요청했습니다'); reload(); },
    });
    bindActions(root, { async paid(el) { await post(`/settlements/${s.id}/payouts/${el.dataset.id}`, { status: 'paid' }); reload(); }, async hold(el) { await post(`/settlements/${s.id}/payouts/${el.dataset.id}`, { status: 'held' }); reload(); } });
  } };
}
