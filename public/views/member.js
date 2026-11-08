import { fmtLocal, api, post, put, esc, nl2br, state, toast, go, reload, field, input, textarea, select, check, bindForms, bindActions, stat, num, pct, fmtDate, ago, won, LEVEL_NAMES, FIELDS, EVENT_TYPES, BADGES, ROLES, lvChip, stageChip, typeChip, pageHead, empty, progressBar, tabs, modal, closeModal } from '../core.js';

export async function onboarding({ me }) {
  if (me.onboarded) { go('#/dashboard'); return ''; }
  const html = `<div class="wrap page" style="max-width:720px">
    ${pageHead('오리엔테이션', `${esc(me.nickname)}님, 환영합니다. 마챌의 원칙 세 가지를 읽고 확인 문항에 답하면 챌린저(L1)가 됩니다. 5분이면 됩니다.`)}
    <div class="stack">
      <div class="card"><h3>원칙 1. 수익을 보장하지 않습니다</h3><p>마챌은 "이렇게 하면 월 얼마 번다"는 식의 약속을 하지 않고, 회원끼리도 그런 표현을 쓰지 않습니다. 매출이 나지 않은 챌린지도 페이퍼로 남기고, 성공 사례만 골라 보여 주지 않습니다. 운영본부가 받는 몫은 그룹 챌린지 순수익의 일부이지, 회비로 수익을 약속하는 구조가 아닙니다.</p></div>
      <div class="card"><h3>원칙 2. 실행한 사람이 발언합니다</h3><p>등급은 결제나 연차가 아니라 실행 기록(체크인, 완료 기록, 완주, 매출 인증)으로 오릅니다. 다른 그룹의 진행 기록과 페이퍼 전문은 어치버(L3)부터 볼 수 있는데, 이것은 정보를 감추기 위해서가 아니라 "먼저 해 본 사람"이 다른 사람의 기록을 읽을 자격을 갖게 하려는 것입니다.</p></div>
      <div class="card"><h3>원칙 3. 돈과 소유는 시작 전에 합의합니다</h3><p>그룹 챌린지는 배분 비율, 소유권 유형, 역할, 예산 상한을 합의서에 적고 전원이 서명하고 운영본부가 승인해야 시작됩니다. 기여율은 역할 가중치와 확인된 완료 기록, 체크인 출석으로 자동 산정되고, 그룹장은 ±10%p 안에서만 조정할 수 있습니다. 정산은 페이퍼 승인 뒤에 지급됩니다.</p></div>
      <form class="card form" data-form="ob">
        <h3>확인 문항</h3>
        ${field('1. 마챌 커뮤니티에서 쓸 수 있는 표현은?', `<div class="radio-cards"><label class="radio-card"><input type="radio" name="q1" value="a"><div><b>"이 방법이면 월 100만 원은 보장됩니다"</b></div></label><label class="radio-card"><input type="radio" name="q1" value="b"><div><b>"저는 3주 동안 이렇게 해서 첫 주문 2건을 받았습니다"</b></div></label></div>`)}
        ${field('2. 등급은 어떻게 오르나요?', `<div class="radio-cards"><label class="radio-card"><input type="radio" name="q2" value="a"><div><b>체크인·완료 기록·완주·매출 인증 같은 실행 기록으로</b></div></label><label class="radio-card"><input type="radio" name="q2" value="b"><div><b>운영본부에 추가 회비를 내면</b></div></label></div>`)}
        ${field('3. 그룹 챌린지는 언제 시작할 수 있나요?', `<div class="radio-cards"><label class="radio-card"><input type="radio" name="q3" value="a"><div><b>그룹장이 시작하자고 하면 바로</b></div></label><label class="radio-card"><input type="radio" name="q3" value="b"><div><b>합의서에 전원이 서명하고 운영본부가 승인한 뒤</b></div></label></div>`)}
        ${check('agree', '위 세 가지 원칙과 운영방침(MC-03)·등급 규정(MC-04)에 동의합니다.')}
        <div class="form-error error"></div>
        <button class="btn primary lg block" type="submit">오리엔테이션 마치기</button>
      </form>
    </div></div>`;
  return { html, mount(root) { bindForms(root, { async ob(d) { await post('/me/onboarding', { agree: d.agree, quiz: { q1: d.q1, q2: d.q2, q3: d.q3 } }); await state.refreshMe(); toast('챌린저가 되셨습니다. 환영합니다!'); go('#/dashboard'); } }); } };
}

export async function dashboard() {
  const d = await api('/dashboard');
  const me = d.me; state.me = me;
  const prog = me.progress;
  const myGroups = me.groups.filter(g => g.member_status === 'active');
  const html = `<div class="wrap page">
    <div class="page-head"><div><h1>${esc(me.nickname)}님, 이번 주도 한 칸</h1><p>${lvChip(me.level)} · 포인트 ${num(me.points.total)}점 (이번 분기 ${num(me.points.quarter)}점)</p></div>
      <div class="btn-row">${me.level >= 'L4' || me.role === 'staff' ? '<a class="btn primary" href="#/challenges/new">챌린지 제안</a>' : (me.level >= 'L1' ? '<a class="btn primary" href="#/challenges/new">솔로 챌린지 시작</a>' : '')}<a class="btn" href="#/challenges">챌린지 보드</a></div></div>

    ${d.tasks.length ? `<div class="section" style="margin-top:0"><div class="stack">${d.tasks.map(t => `<div class="task-item"><span>${esc(t.text)}</span><a href="${t.link}">바로 가기 →</a></div>`).join('')}</div></div>` : ''}

    <div class="grid grid-2">
      <div class="stack">
        <div class="card"><div class="card-head"><h3>내 챌린지</h3><a class="small" href="#/challenges">보드 보기</a></div>
          ${myGroups.length ? `<div class="list">${myGroups.map(g => `<a class="list-item" href="#/groups/${g.id}" style="color:inherit"><div class="grow"><div class="title">${esc(g.title)}</div><div class="meta">${typeChip(g.type)} ${stageChip(g.stage)} · 내 역할 ${ROLES[g.role] || g.role}</div></div><span class="muted">→</span></a>`).join('')}</div>` : empty('참여 중인 챌린지가 없습니다', me.level === 'L1' ? '메이커(L2)가 되면 그룹 챌린지에 지원할 수 있어요. 그 전엔 솔로 챌린지로 시작해 보세요.' : '모집 중인 챌린지를 둘러보세요.', `<a class="btn sm" href="#/challenges">모집 중인 챌린지</a>`)}
          ${me.groups.filter(g => g.member_status === 'applied').map(g => `<p class="small muted" style="margin:8px 0 0">· ${esc(g.title)} — 지원 후 그룹장 확인 대기 중</p>`).join('')}
        </div>
        ${prog && prog.next ? `<div class="card"><div class="card-head"><h3>다음 등급 · ${esc(prog.next_name)}</h3><a class="small" href="#/me">자세히</a></div><div class="stack">${prog.items.map(i => `<div><div class="row between small"><span>${i.done ? '✅' : '◻️'} ${esc(i.label)}</span><span class="muted">${i.manual ? '심사 시 확인' : `${num(i.cur)} / ${num(i.goal)}`}</span></div>${i.goal > 1 ? progressBar(i.cur, i.goal) : ''}</div>`).join('')}</div>${prog.eligible && !prog.auto ? `<div class="notice ok" style="margin-top:10px">조건을 채웠습니다. <a href="#/me">내 정보</a>에서 승급을 신청하세요.</div>` : ''}</div>` : ''}
      </div>
      <div class="stack">
        <div class="card"><div class="card-head"><h3>다가오는 일정</h3><a class="small" href="#/events">전체</a></div>${d.events.length ? `<div class="list">${d.events.map(e => `<div class="list-item"><div class="grow"><div class="title">${esc(e.title)}</div><div class="meta">${EVENT_TYPES[e.type]} · ${fmtLocal(e.starts_at)}${e.location ? ' · ' + esc(e.location) : ''}</div></div></div>`).join('')}</div>` : '<p class="muted small" style="margin:0">예정된 일정이 없습니다.</p>'}</div>
        <div class="card"><div class="card-head"><h3>커뮤니티 피드</h3><a class="small" href="#/community">더 보기</a></div>${d.feed.length ? d.feed.map(feedRow).join('') : '<p class="muted small" style="margin:0">아직 조용합니다. 첫 완료 기록을 남겨 보세요.</p>'}</div>
      </div>
    </div></div>`;
  return html;
}

export function feedRow(f) {
  const k = { done: ['✓', 'k-done'], post: ['글', 'k-post'], level: ['↑', 'k-level'], badge: ['★', 'k-badge'] }[f.kind] || ['·', ''];
  const link = f.kind === 'done' ? `#/challenges/${f.challenge_id}` : f.kind === 'post' ? `#/community/posts/${f.id}` : '#/members';
  const text = f.kind === 'done' ? `<b>${esc(f.nickname)}</b> · ${esc(f.title)} <span class="muted">(${esc(f.challenge_title)})</span>` : f.kind === 'post' ? `<b>${esc(f.nickname)}</b> · ${esc(f.title)}` : esc(f.title);
  return `<div class="feed-item"><span class="k ${k[1]}">${k[0]}</span><div class="grow"><a href="${link}" style="color:inherit">${text}</a><div class="muted small">${ago(f.created_at)}</div></div></div>`;
}

export async function me({ me: cached }) {
  const me = await api('/me'); state.me = me;
  const prog = me.progress;
  const html = `<div class="wrap page">
    ${pageHead(esc(me.nickname), `${lvChip(me.level)} · ${esc(me.email)} · 가입 ${fmtDate(me.created_at)}`, `<button class="btn" data-act="edit">프로필 수정</button><button class="btn" data-act="pw">비밀번호 변경</button><button class="btn ghost" data-act="logout">로그아웃</button>`)}
    <div class="grid grid-4">${stat('총 포인트', num(me.points.total))}${stat('이번 분기', num(me.points.quarter), true)}${stat('배지', num(me.badges.length))}${stat('참여 챌린지', num(me.groups.filter(g => g.member_status === 'active').length))}</div>
    <div class="grid grid-2" style="margin-top:14px">
      <div class="stack">
        ${prog && prog.next ? `<div class="card"><h3>다음 등급 · <span class="lv lv-${prog.next}">${esc(prog.next_name)}</span></h3><div class="stack">${prog.items.map(i => `<div><div class="row between small"><span>${i.done ? '✅' : '◻️'} ${esc(i.label)}</span><span class="muted">${i.manual ? '심사 시 확인' : `${num(i.cur)} / ${num(i.goal)}`}</span></div>${i.goal > 1 ? progressBar(i.cur, i.goal) : ''}</div>`).join('')}</div>
          ${prog.auto ? `<p class="small muted" style="margin:10px 0 0">조건을 채우면 자동으로 승급됩니다.</p>` : `<div style="margin-top:12px"><button class="btn primary" data-act="promote" ${prog.eligible ? '' : 'title="필수 조건을 먼저 채워 주세요"'}>승급 심사 신청</button>${prog.eligible ? '' : '<span class="small muted" style="margin-left:8px">조건 미충족이어도 신청은 가능하지만 보류될 수 있습니다</span>'}</div>`}</div>` : `<div class="card"><h3>마스터</h3><p class="muted">가장 높은 등급입니다. 심사와 멘토링으로 다음 사람을 끌어 주세요.</p></div>`}
        <div class="card"><div class="card-head"><h3>자기 자산 진단</h3><a class="small" href="#/me/asset">${me.asset_diag ? '수정' : '작성'}</a></div>${me.asset_diag ? `<div class="small stack" style="--gap:4px">${[['time', '시간'], ['money', '돈'], ['skills', '기술'], ['experience', '경험'], ['relations', '관계'], ['space', '공간·장비'], ['goal', '12주 목표']].filter(([k]) => me.asset_diag[k]).map(([k, l]) => `<div><b>${l}</b> · ${esc(me.asset_diag[k])}</div>`).join('')}</div>` : '<p class="muted small" style="margin:0">내가 가진 시간·돈·기술·경험·관계·공간을 적어 두면 어떤 챌린지가 맞는지 보입니다. 메이커 승급 조건이기도 합니다.</p>'}</div>
      </div>
      <div class="stack">
        <div class="card"><div class="card-head"><h3>배지</h3></div>${me.badges.length ? `<div class="badge-grid">${me.badges.map(b => `<div class="badge-tile"><span class="ic">★</span><span>${esc(b.name)}</span><small class="muted">${fmtDate(b.created_at)}</small></div>`).join('')}</div>` : '<p class="muted small" style="margin:0">아직 배지가 없습니다. 첫 배지는 보통 "라운드 완주" 또는 "첫 매출"입니다.</p>'}</div>
        <div class="card"><div class="card-head"><h3>포인트 내역</h3><a class="small" href="#/me/points">전체</a></div><p class="small muted" style="margin:0">완료 기록 확인, 체크인, 모임 참석, 글·댓글, 페이퍼 제출 등으로 쌓입니다. 하루 상한이 있습니다.</p></div>
        <div class="card"><h3>프로필</h3><div class="small"><div><b>이름</b> · ${esc(me.name)}</div><div><b>관심 분야</b> · ${esc((me.interests || '').split(',').filter(Boolean).map(k => FIELDS[k] || k).join(', ') || '-')}</div><div><b>사업자</b> · ${me.has_business ? '있음' : '없음'}</div>${me.bio ? `<div style="margin-top:6px">${nl2br(me.bio)}</div>` : ''}</div></div>
      </div>
    </div></div>`;
  return { html, mount(root) { bindActions(root, {
    pw() { modal(`<h3>비밀번호 변경</h3><form class="form" data-form="pw">${field('지금 비밀번호', input('current', { type: 'password', required: true }))}${field('새 비밀번호 (8자 이상)', input('next', { type: 'password', required: true }))}<div class="btn-row"><button class="btn primary" type="submit">변경</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`, { onMount(m) { bindForms(m, { async pw(d) { await put('/me/password', d); closeModal(); toast('비밀번호를 바꿨습니다. 다른 기기의 로그인은 해제됐습니다'); } }); } }); },
    async logout() { await post('/auth/logout'); state.me = null; await state.refreshMe(); go('#/'); },
    edit() {
      modal(`<h3>프로필 수정</h3><form class="form" data-form="prof">${field('닉네임', input('nickname', { value: me.nickname }))}${field('연락처', input('phone', { value: me.phone || '' }))}${field('관심 분야', `<div class="row">${Object.entries(FIELDS).map(([k, v]) => check('interests[]', v, (me.interests || '').includes(k), k)).join('')}</div>`)}${field('소개', textarea('bio', { value: me.bio || '', rows: 3 }))}${check('has_business', '사업자등록이 있습니다', !!me.has_business)}<div class="btn-row"><button class="btn primary" type="submit">저장</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`,
        { onMount(m) { bindForms(m, { async prof(d) { d.interests = (d.interests || []).join(','); await put('/me/profile', d); closeModal(); toast('저장했습니다'); await state.refreshMe(); reload(); } }); } });
    },
    promote() {
      modal(`<h3>승급 심사 신청 · ${esc(prog.next_name)}</h3><p class="small muted">운영본부가 7일 안에 심사하고 결과를 알림으로 보냅니다. 보류·반려 시 사유를 적어 드립니다.</p><form class="form" data-form="pr">${field('이번 라운드에서 한 일 (3줄 이내)', textarea('note', { rows: 3, required: true }))}${field('증빙 링크 (페이퍼, 매출 화면, 발표 자료 등)', textarea('evidence', { rows: 2 }))}<div class="btn-row"><button class="btn primary" type="submit">신청</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`,
        { onMount(m) { bindForms(m, { async pr(d) { await post('/me/promotion', d); closeModal(); toast('신청했습니다. 결과는 알림으로 알려 드립니다'); } }); } });
    },
  }); } };
}

export async function points() {
  const d = await api('/me/points');
  return `<div class="wrap page" style="max-width:760px">${pageHead('포인트 내역', `총 ${num(d.totals.total)}점 · 이번 분기 ${num(d.totals.quarter)}점`, '<a class="btn" href="#/me">← 내 정보</a>')}
    <div class="card">${d.rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>일시</th><th>활동</th><th class="num">포인트</th></tr></thead><tbody>${d.rows.map(r => `<tr><td>${fmtDate(r.created_at, true)}</td><td>${esc(r.label)}</td><td class="num">+${r.points}</td></tr>`).join('')}</tbody></table></div>` : empty('아직 적립된 포인트가 없습니다', '세미나 참석, 완료 기록, 글쓰기로 시작해 보세요')}</div></div>`;
}

export async function assetDiag({ me }) {
  const a = me.asset_diag || {};
  const html = `<div class="wrap page" style="max-width:720px">${pageHead('자기 자산 진단', '거창할 필요 없습니다. 지금 가진 것을 있는 그대로 적어야 맞는 챌린지가 보입니다.', '<a class="btn" href="#/me">← 내 정보</a>')}
    <form class="card form" data-form="diag">
      ${field('시간 *', input('time', { value: a.time || '', required: true, placeholder: '예: 평일 저녁 2시간 × 3일, 토요일 오전' }), '12주 동안 실제로 뺄 수 있는 시간')}
      ${field('돈', input('money', { value: a.money || '', placeholder: '예: 잃어도 되는 돈 30만 원까지' }), '그룹 챌린지 1인 예산 상한은 기본 10만 원입니다')}
      ${field('기술 *', textarea('skills', { value: a.skills || '', rows: 3, required: true, placeholder: '할 줄 아는 것. 전문가가 아니어도 됩니다. 예: 엑셀 중급, 블로그 글쓰기, 영상 편집 초급' }))}
      ${field('경험', textarea('experience', { value: a.experience || '', rows: 3, placeholder: '일·취미·실패 경험 모두. 예: 중고거래 50건, 동네 카페 아르바이트 2년' }))}
      ${field('관계', textarea('relations', { value: a.relations || '', rows: 2, placeholder: '도움을 청할 수 있는 사람, 첫 고객이 되어 줄 수 있는 사람' }))}
      ${field('공간·장비', input('space', { value: a.space || '', placeholder: '예: 노트북, 차량, 주말에 쓸 수 있는 사무실' }))}
      ${field('12주 뒤 바라는 모습', textarea('goal', { value: a.goal || '', rows: 2, placeholder: '예: 첫 유료 고객 1명, 디지털 상품 1개 출시' }))}
      <div class="form-error error"></div>
      <button class="btn primary lg block" type="submit">저장</button>
    </form></div>`;
  return { html, mount(root) { bindForms(root, { async diag(d) { const r = await post('/me/asset-diag', d); await state.refreshMe(); toast(r.promoted ? '저장했습니다. 메이커(L2)로 승급되었습니다!' : '저장했습니다'); go('#/me'); } }); } };
}

export async function notifications() {
  const rows = await api('/me/notifications');
  const html = `<div class="wrap page" style="max-width:720px">${pageHead('알림', '', rows.some(r => !r.read_at) ? '<button class="btn sm" data-act="readall">모두 읽음</button>' : '')}
    <div class="card">${rows.length ? rows.map(n => `<a class="noti ${n.read_at ? '' : 'unread'}" href="${n.link || '#/dashboard'}" data-act="open" data-id="${n.id}" style="color:inherit"><div class="grow"><div class="t">${esc(n.title)}</div>${n.body ? `<div class="b">${esc(n.body)}</div>` : ''}<div class="muted small">${ago(n.created_at)}</div></div></a>`).join('') : empty('알림이 없습니다')}</div></div>`;
  return { html, mount(root) { bindActions(root, {
    async readall() { await post('/me/notifications/read', { all: true }); await state.refreshMe(); reload(); },
    async open(el) { await post('/me/notifications/read', { id: el.dataset.id }); await state.refreshMe(); go(el.getAttribute('href')); },
  }); } };
}
