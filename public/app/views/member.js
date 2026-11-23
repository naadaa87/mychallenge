import { fmtLocal, api, post, put, esc, nl2br, state, toast, go, reload, field, input, textarea, select, check, bindForms, bindActions, stat, num, pct, fmtDate, ago, won, LEVEL_NAMES, FIELDS, EVENT_TYPES, BADGES, ROLES, TYPE, attendChip, lvChip, stageChip, typeChip, pageHead, empty, progressBar, tabs, modal, closeModal } from '../core.js';

// ---------------- 마챌 단체카톡방 안내 ----------------
// 참여 상태는 서버에 남긴다 (링크를 누름 → 참여했어요 → 운영진 확인). 운영본부가 같은 기록을 본다.
const chatIn = me => ['joined', 'verified'].includes(me.chat_status);
const CHAT_STATUS_TEXT = {
  verified: ['운영진이 참여를 확인했습니다', 'green'],
  joined: ['참여했다고 표시했습니다', 'blue'],
  clicked: ['링크를 눌렀습니다', 'amber'],
  left: ['대화방에서 나간 것으로 되어 있습니다', 'red'],
  none: ['아직 들어오지 않았습니다', ''],
};
export function chatSteps(me) {
  const c = me.community_chat || {};
  return `<ol class="steps-list small">
    <li><b>단체카톡방 들어가기</b>를 누르면 카카오톡 오픈채팅방이 열립니다. 휴대폰은 카카오톡 앱으로, PC는 카카오톡 PC 앱이나 휴대폰으로 이어서 들어갑니다.</li>
    ${c.code ? `<li>참여코드를 물으면 <span class="kbd">${esc(c.code)}</span> 를 입력해 주세요. 회원끼리만 쓰는 코드라 밖에 알리지 말아 주세요.</li>` : ''}
    <li>대화방 프로필 이름은 마챌 닉네임 <b>${esc(me.nickname)}</b>(으)로 맞춰 주세요. 운영진과 다른 회원이 누구인지 알아보기 쉽습니다.</li>
    <li>들어오면 짧게 인사를 남겨 주세요. 관심 분야와 해 보고 싶은 것 한 가지면 충분합니다.</li>
    <li>이 화면으로 돌아와 <b>참여했어요</b>를 눌러 주세요. 운영진이 대화방에서 닉네임을 확인하면 표시가 바뀝니다.</li>
  </ol>
  <p class="small muted" style="margin:8px 0 0">대화방에서는 정기모임 일정, 새 그룹 소식, 운영진 공지를 빠르게 받습니다. 그룹 참여, 출석, 기록은 홈페이지 회원 공간에서 합니다. 광고, 투자 권유, 다른 모임 홍보는 올릴 수 없고, 대화방 주소는 회원끼리만 나눠 주세요.</p>`;
}
const chatLink = (c, label, cls = 'btn primary') => `<a class="${cls}" href="${esc(c.url)}" target="_blank" rel="noopener" data-chat-link>${label}</a>`;
function chatCard(me, { compact = false } = {}) {
  const c = me.community_chat; if (!c?.url) return '';
  if (compact) {
    const [t, color] = CHAT_STATUS_TEXT[me.chat_status || 'none'] || CHAT_STATUS_TEXT.none;
    return `<div class="card soft chat-card"><div class="card-head"><h3>💬 ${esc(c.name)}</h3>${chatLink(c, '들어가기', 'btn sm')}</div>
      <p class="small" style="margin:0"><span class="chip ${color}">${t}</span> <a href="#/chat">참여 방법 보기</a></p></div>`;
  }
  return `<div class="card chat-card is-new"><div class="card-head"><h3>💬 ${esc(c.name)}에 참여해 주세요</h3><span class="chip blue">회원 전용</span></div>
    <p class="small" style="margin:0 0 8px">마챌 회원이 모두 모여 있는 카카오톡 오픈채팅방입니다. 참여 방법은 이렇습니다.</p>
    ${chatSteps(me)}
    <div class="btn-row" style="margin-top:12px">${chatLink(c, '단체카톡방 들어가기')}<button class="btn" data-act="chatdone">참여했어요</button></div></div>`;
}
// 링크를 누른 사실만 조용히 남긴다. 페이지가 바뀌어도 요청이 끝나도록 keepalive를 쓰고, 링크 이동은 막지 않는다.
function recordChatClick() {
  try { fetch('/api/me/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'click' }), credentials: 'same-origin', keepalive: true }).catch(() => {}); } catch {}
  if (state.me && (!state.me.chat_status || ['none', 'left'].includes(state.me.chat_status))) state.me.chat_status = 'clicked';
}
export function bindChat(root, { after } = {}) {
  root.addEventListener('click', e => { const a = e.target.closest('[data-chat-link]'); if (a && root.contains(a)) { recordChatClick(); if (after) setTimeout(after, 60); } });
}
const chatActions = () => ({ async chatdone() {
  const r = await post('/me/chat', { action: 'joined' });
  if (state.me) state.me.chat_status = r.chat_status;
  toast('고맙습니다. 대화방에서 만나요'); reload();
} });

// #/chat — 단체카톡방 참여 방법과 내 참여 상태
export async function chat() {
  const me = await api('/me'); state.me = me;
  const c = me.community_chat;
  if (!c?.url) return `<div class="wrap page" style="max-width:720px">${pageHead('마챌 단체카톡방')}${empty('지금은 단체카톡방 안내가 없습니다', '운영진이 대화방을 다시 열면 이 화면과 알림으로 알려 드립니다.', '<a class="btn" href="#/dashboard">홈으로</a>')}</div>`;
  const st = me.chat_status || 'none';
  const [t, color] = CHAT_STATUS_TEXT[st] || CHAT_STATUS_TEXT.none;
  const html = `<div class="wrap page" style="max-width:720px">
    ${pageHead(esc(c.name), '마챌 회원이 모두 모여 정기모임 일정, 새 그룹 소식, 운영진 공지를 나누는 카카오톡 오픈채팅방입니다.')}
    <div class="stack">
      <div class="card chat-card${chatIn(me) ? '' : ' is-new'}">
        <div class="card-head"><h3>내 참여 상태</h3><span class="chip ${color}">${t}</span></div>
        <p class="small" style="margin:0">${{ verified: '대화방에서 만나요. 닉네임을 바꿨다면 운영진에게 한 번 알려 주세요.', joined: '운영진이 대화방 참여자 목록에서 닉네임을 확인하면 "운영진 확인"으로 바뀝니다.', clicked: '대화방에 들어가셨다면 아래 "참여했어요"를 눌러 주세요.', left: '다시 들어오고 싶으면 언제든 아래 버튼으로 들어오시면 됩니다.', none: '아래 순서대로 들어와 주세요. 1분이면 됩니다.' }[st]}</p>
        <div class="btn-row" style="margin-top:12px">${chatLink(c, '단체카톡방 들어가기')}${chatIn(me) ? '' : '<button class="btn" data-act="chatdone">참여했어요</button>'}</div>
      </div>
      ${c.intro ? `<div class="card soft"><h3>운영진 한마디</h3><p class="small" style="margin:0">${nl2br(c.intro)}</p></div>` : ''}
      <div class="card"><h3>참여 방법</h3>${chatSteps(me)}</div>
    </div></div>`;
  return { html, mount(root) { bindChat(root); bindActions(root, chatActions()); } };
}

export async function onboarding({ me }) {
  if (me.onboarded) { go('#/dashboard'); return ''; }
  const html = `<div class="wrap page" style="max-width:720px">
    ${pageHead('오리엔테이션', `${esc(me.nickname)}님, 환영합니다. 마챌의 원칙 세 가지를 읽고 확인 문항에 답하면 챌린저(L1)가 되어 그룹에 참여할 수 있습니다. 5분이면 되고, 마치면 마챌 단체카톡방 참여 방법을 안내해 드립니다.`)}
    <div class="stack">
      <div class="card"><h3>원칙 1. 수익을 보장하지 않습니다</h3><p>마챌은 "이렇게 하면 월 얼마 번다"는 약속을 하지 않고, 회원끼리도 그런 표현을 쓰지 않습니다. 도전그룹의 최종 목표는 성과와 수익이지만, 그 결과는 각 그룹이 직접 만들어 숫자로 기록합니다. 잘 안된 도전도 기록으로 남기고, 성공 사례만 골라 보여 주지 않습니다.</p></div>
      <div class="card"><h3>원칙 2. 실행한 사람이 발언합니다</h3><p>등급은 결제나 연차가 아니라 실행 기록으로 오릅니다. 정기모임과 그룹 모임 출석, 도전 기록, 그룹 완주, 성과 기록이 쌓이면 등급이 오르고 할 수 있는 일이 늘어납니다. 그룹을 이끄는 그룹리더는 운영진이 승인합니다.</p></div>
      <div class="card"><h3>원칙 3. 약속한 자리에 나오고, 배운 것은 나눕니다</h3><p>그룹마다 그룹리더가 정한 출석 규칙이 있습니다. 모임마다 출석 코드로 출석하고, 사정이 있으면 미리 알립니다. 출석이 계속 저조하면 경고를 받고, 경고가 쌓이면 그룹에서 나가게 될 수 있습니다. 그리고 그룹에서 배운 것과 만든 결과는 기록하고 다른 그룹과 나눕니다. 정기모임과 성과발표회가 그 자리입니다.</p></div>
      <form class="card form" data-form="ob">
        <h3>확인 문항</h3>
        ${field('1. 마챌 커뮤니티에서 쓸 수 있는 표현은?', `<div class="radio-cards"><label class="radio-card"><input type="radio" name="q1" value="a"><div><b>"이 방법이면 월 100만 원은 보장됩니다"</b></div></label><label class="radio-card"><input type="radio" name="q1" value="b"><div><b>"저는 3주 동안 이렇게 해서 첫 주문 2건을 받았습니다"</b></div></label></div>`)}
        ${field('2. 등급은 어떻게 오르나요?', `<div class="radio-cards"><label class="radio-card"><input type="radio" name="q2" value="a"><div><b>모임 출석·도전 기록·그룹 완주·성과 기록 같은 실행 기록으로</b></div></label><label class="radio-card"><input type="radio" name="q2" value="b"><div><b>운영본부에 추가 회비를 내면</b></div></label></div>`)}
        ${field('3. 그룹 모임에 말없이 계속 빠지면 어떻게 되나요?', `<div class="radio-cards"><label class="radio-card"><input type="radio" name="q3" value="a"><div><b>아무 일도 없다</b></div></label><label class="radio-card"><input type="radio" name="q3" value="b"><div><b>그룹의 출석 규칙에 따라 경고를 받고, 경고가 쌓이면 그룹에서 나가게 될 수 있다</b></div></label></div>`)}
        ${check('agree', '위 세 가지 원칙과 이용약관의 커뮤니티 운영 규칙에 동의합니다.')}
        <div class="form-error error"></div>
        <button class="btn primary lg block" type="submit">오리엔테이션 마치기</button>
      </form>
    </div></div>`;
  return { html, mount(root) { bindForms(root, { async ob(d) { await post('/me/onboarding', { agree: d.agree, quiz: { q1: d.q1, q2: d.q2, q3: d.q3 } }); await state.refreshMe(); toast('챌린저가 되셨습니다. 환영합니다!');
    const c = (state.me || me).community_chat;
    if (!c?.url) { go('#/dashboard'); return; }
    modal(`<h3>환영합니다! 이제 ${esc(c.name)}에 참여해 주세요</h3><p class="small">마챌 회원이 모두 모여 정기모임 일정, 새 그룹 소식, 운영진 공지를 나누는 카카오톡 오픈채팅방입니다.</p>${chatSteps(state.me || me)}
      <div class="btn-row" style="margin-top:14px">${chatLink(c, '단체카톡방 들어가기')}<button class="btn" type="button" data-act="later">나중에 할게요</button></div>
      <p class="small muted" style="margin:8px 0 0">나중에 들어가도 괜찮습니다. 홈 화면과 내 정보 화면에서 언제든 다시 볼 수 있습니다.</p>`,
      { onMount(mm) { bindChat(mm, { after() { closeModal(); go('#/chat'); } }); bindActions(mm, { later() { closeModal(); go('#/dashboard'); } }); } });
  } }); } };
}

export async function dashboard() {
  const d = await api('/dashboard');
  const me = d.me; state.me = me;
  const prog = me.progress;
  const active = d.groups.filter(g => g.member_status === 'active');
  const canLead = me.can_lead || me.role === 'staff';
  const taskIc = { checkin: '✅', rsvp: '🗓', warning: '⚠️', leader: '★', applied: '⏳', present: '🎤' };
  const html = `<div class="wrap page">
    <div class="page-head"><div><h1>${esc(me.nickname)}님, 이번 주도 한 칸</h1><p>${lvChip(me.level)} · 포인트 ${num(me.points.total)}점 (이번 분기 ${num(me.points.quarter)}점)${me.can_lead ? ' · <span class="chip ink">그룹리더</span>' : ''}</p></div>
      <div class="btn-row">${canLead ? '<a class="btn primary" href="#/groups/new">그룹 만들기</a>' : ''}<a class="btn ${canLead ? '' : 'primary'}" href="#/groups">그룹 둘러보기</a><a class="btn" href="#/events">정기모임</a></div></div>

    ${chatIn(me) ? '' : `<div class="section" style="margin-top:0;margin-bottom:14px">${chatCard(me)}</div>`}
    ${d.tasks.length ? `<div class="section" style="margin-top:0"><div class="stack">${d.tasks.map(t => `<div class="task-item ${t.type === 'warning' ? 'warn' : ''}"><span>${taskIc[t.type] || '·'} ${esc(t.text)}</span><a href="${t.link}">바로 가기 →</a></div>`).join('')}</div></div>` : ''}

    <div class="grid grid-2">
      <div class="stack">
        <div class="card"><div class="card-head"><h3>내 그룹</h3><a class="small" href="#/groups?mine=1">전체</a></div>
          ${active.length ? `<div class="list">${active.map(g => `<a class="list-item" href="#/groups/${g.id}" style="color:inherit"><div class="grow"><div class="title">${esc(g.title)} ${typeChip(g.type)}</div>
            <div class="meta">${ROLES[g.role] || g.role} · 출석률 ${g.attendance?.rate != null ? g.attendance.rate + '%' : '-'}${g.warnings ? ` · <span class="error">경고 ${g.warnings}</span>` : ''}${g.next_session ? ` · 다음 모임 ${fmtLocal(g.next_session.starts_at).slice(5)}` : ''}</div></div><span class="muted">→</span></a>`).join('')}</div>`
            : empty('참여 중인 그룹이 없습니다', '관심 있는 학습그룹이나 도전그룹에 참여해 보세요. 정기모임에서 함께할 사람을 만나도 좋습니다.', '<a class="btn primary sm" href="#/groups">그룹 둘러보기</a>')}
        </div>
        ${!canLead ? `<div class="card soft"><h3>직접 그룹을 이끌어 보고 싶다면</h3><p class="small muted" style="margin:0 0 10px">운영진의 승인을 받은 그룹리더는 언제든 학습그룹이나 도전그룹을 만들 수 있습니다.${d.leader_application?.status === 'pending' ? ' 지금 신청을 검토하고 있습니다.' : ''}</p><a class="btn sm" href="#/me/leader">${d.leader_application?.status === 'pending' ? '신청 내용 보기' : '그룹리더 신청'}</a></div>` : ''}
        ${prog && prog.next ? `<div class="card"><div class="card-head"><h3 class="h-ic"><img src="/assets/img/lv-${prog.next}.webp" width="30" height="30" alt="">다음 등급 · ${esc(prog.next_name)}</h3><a class="small" href="#/me">자세히</a></div><div class="stack">${prog.items.map(i => `<div><div class="row between small"><span>${i.done ? '✅' : '◻️'} ${esc(i.label)}</span><span class="muted">${i.manual ? '심사 시 확인' : `${num(i.cur)}/${num(i.goal)}`}</span></div>${i.manual ? '' : progressBar(i.cur, i.goal)}</div>`).join('')}</div></div>` : ''}
      </div>
      <div class="stack">
        ${chatIn(me) ? chatCard(me, { compact: true }) : ''}
        <div class="card"><div class="card-head"><h3>정기모임·일정</h3><a class="small" href="#/events">전체</a></div>${d.events.length ? `<div class="list">${d.events.map(e => `<a class="list-item" href="#/events" style="color:inherit"><div class="grow"><div class="title">${esc(e.title)}</div><div class="meta">${esc(e.type_name || EVENT_TYPES[e.type] || '')} · ${fmtLocal(e.starts_at)}${e.location ? ' · ' + esc(e.location) : ''}</div></div></a>`).join('')}</div>` : '<p class="muted small" style="margin:0">예정된 일정이 없습니다.</p>'}</div>
        <div class="card"><div class="card-head"><h3>커뮤니티 피드</h3><a class="small" href="#/community">더 보기</a></div>${d.feed.length ? d.feed.map(feedRow).join('') : '<p class="muted small" style="margin:0">아직 조용합니다. 그룹에서 첫 기록을 남기고 공유해 보세요.</p>'}</div>
      </div>
    </div></div>`;
  return { html, mount(root) { bindChat(root); bindActions(root, chatActions()); } };
}

export function feedRow(f) {
  const k = { group: ['G', 'k-done'], post: [f.board === 'group' ? '✓' : '글', f.board === 'group' ? 'k-done' : 'k-post'], level: ['↑', 'k-level'], badge: ['★', 'k-badge'] }[f.kind] || ['·', ''];
  const link = f.kind === 'group' ? `#/groups/${f.challenge_id}` : f.kind === 'post' ? `#/community/posts/${f.id}` : '#/members';
  const text = f.kind === 'group' ? `${esc(f.title)} <span class="muted">· 리더 ${esc(f.nickname)}</span>` : f.kind === 'post' ? `<b>${esc(f.nickname)}</b> · ${esc(f.title)}` : esc(f.title);
  return `<div class="feed-item"><span class="k ${k[1]}">${k[0]}</span><div class="grow"><a href="${link}" style="color:inherit">${text}</a><div class="muted small">${ago(f.created_at)}</div></div></div>`;
}

export async function me({ me: cached }) {
  const me = await api('/me'); state.me = me;
  const prog = me.progress;
  const html = `<div class="wrap page">
    ${pageHead(esc(me.nickname), `${lvChip(me.level)} · ${esc(me.email)} · 가입 ${fmtDate(me.created_at)}`, `<button class="btn" data-act="edit">프로필 수정</button><button class="btn" data-act="pw">비밀번호 변경</button><button class="btn ghost" data-act="logout">로그아웃</button>`)}
    <div class="grid grid-4">${stat('총 포인트', num(me.points.total))}${stat('이번 분기', num(me.points.quarter), true)}${stat('배지', num(me.badges.length))}${stat('참여 그룹', num(me.groups.filter(g => g.member_status === 'active').length))}</div>
    <div class="grid grid-2" style="margin-top:14px">
      <div class="stack">
        ${prog && prog.next ? `<div class="card"><h3 class="h-ic"><img src="/assets/img/lv-${prog.next}.webp" width="30" height="30" alt="">다음 등급 · <span class="lv lv-${prog.next}">${esc(prog.next_name)}</span></h3><div class="stack">${prog.items.map(i => `<div><div class="row between small"><span>${i.done ? '✅' : '◻️'} ${esc(i.label)}</span><span class="muted">${i.manual ? '심사 시 확인' : `${num(i.cur)} / ${num(i.goal)}`}</span></div>${i.goal > 1 ? progressBar(i.cur, i.goal) : ''}</div>`).join('')}</div>
          ${prog.auto ? `<p class="small muted" style="margin:10px 0 0">조건을 채우면 자동으로 승급됩니다.</p>` : `<div style="margin-top:12px"><button class="btn primary" data-act="promote" ${prog.eligible ? '' : 'title="필수 조건을 먼저 채워 주세요"'}>승급 심사 신청</button>${prog.eligible ? '' : '<span class="small muted" style="margin-left:8px">조건 미충족이어도 신청은 가능하지만 보류될 수 있습니다</span>'}</div>`}</div>` : `<div class="card"><h3>마스터</h3><p class="muted">가장 높은 등급입니다. 심사와 멘토링으로 다음 사람을 끌어 주세요.</p></div>`}
        <div class="card"><div class="card-head"><h3>자기 자산 진단</h3><a class="small" href="#/me/asset">${me.asset_diag ? '수정' : '작성'}</a></div>${me.asset_diag ? `<div class="small stack" style="--gap:4px">${[['time', '시간'], ['money', '돈'], ['skills', '기술'], ['experience', '경험'], ['relations', '관계'], ['space', '공간·장비'], ['goal', '바라는 모습']].filter(([k]) => me.asset_diag[k]).map(([k, l]) => `<div><b>${l}</b> · ${esc(me.asset_diag[k])}</div>`).join('')}</div>` : '<p class="muted small" style="margin:0">내가 가진 시간·돈·기술·경험·관계·공간을 적어 두면 어떤 챌린지가 맞는지 보입니다. 메이커 승급 조건이기도 합니다.</p>'}</div>
      </div>
      <div class="stack">
        <div class="card"><div class="card-head"><h3>배지</h3></div>${me.badges.length ? `<div class="badge-grid">${me.badges.map(b => `<div class="badge-tile"><img class="badge-img" src="/assets/img/badge-${esc(b.code)}.webp" width="56" height="56" alt="" loading="lazy"><span>${esc(b.name)}</span><small class="muted">${fmtDate(b.created_at)}</small></div>`).join('')}</div>` : '<p class="muted small" style="margin:0">아직 배지가 없습니다. 첫 배지는 보통 "그룹 완주"나 "첫 매출"입니다.</p>'}</div>
        ${chatCard(me, { compact: true })}
        <div class="card"><div class="card-head"><h3>그룹리더</h3><a class="small" href="#/me/leader">${me.can_lead ? '내 그룹' : '신청'}</a></div><p class="small muted" style="margin:0">${me.can_lead ? `그룹리더로 승인되었습니다${me.leader_since ? ` (${fmtDate(me.leader_since)})` : ''}. 언제든 학습그룹이나 도전그룹을 만들 수 있습니다.` : '운영진의 승인을 받으면 직접 그룹을 만들고 이끌 수 있습니다.'}</p></div>
        <div class="card"><div class="card-head"><h3>포인트 내역</h3><a class="small" href="#/me/points">전체</a></div><p class="small muted" style="margin:0">정기모임·그룹 모임 출석, 도전 기록, 성과 기록, 글·댓글, 발제·발표, 페이퍼 제출로 쌓입니다. 하루 상한이 있습니다.</p></div>
        <div class="card"><h3>프로필</h3><div class="small"><div><b>이름</b> · ${esc(me.name)}</div><div><b>관심 분야</b> · ${esc((me.interests || '').split(',').filter(Boolean).map(k => FIELDS[k] || k).join(', ') || '-')}</div><div><b>사업자</b> · ${me.has_business ? '있음' : '없음'}</div>${me.bio ? `<div style="margin-top:6px">${nl2br(me.bio)}</div>` : ''}</div></div>
        <div class="card soft small"><b>계정 정리</b><p class="muted" style="margin:4px 0 8px">탈퇴하면 개인정보는 지워지고, 그룹에 함께 남긴 출석·기록·성과는 이름 없이 남습니다.</p><button class="btn sm danger" data-act="withdraw">회원 탈퇴</button></div>
      </div>
    </div></div>`;
  return { html, mount(root) { bindChat(root); bindActions(root, {
    pw() { modal(`<h3>비밀번호 변경</h3><form class="form" data-form="pw">${field('지금 비밀번호', input('current', { type: 'password', required: true }))}${field('새 비밀번호 (8자 이상)', input('next', { type: 'password', required: true }))}<div class="btn-row"><button class="btn primary" type="submit">변경</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`, { onMount(m) { bindForms(m, { async pw(d) { await put('/me/password', d); closeModal(); toast('비밀번호를 바꿨습니다. 다른 기기의 로그인은 해제됐습니다'); } }); } }); },
    async logout() { await post('/auth/logout'); state.me = null; location.href = '/'; },
    withdraw() {
      modal(`<h3>회원 탈퇴</h3><p class="small">탈퇴하면 이메일·이름·연락처·자기 자산 진단은 바로 지워지고, 닉네임은 '탈퇴회원'으로 바뀝니다. 그룹에 함께 남긴 출석·도전 기록·성과는 다른 그룹원의 기록이기도 해서 이름 없이 남습니다.</p><p class="small muted">그룹리더로 이끄는 그룹이 진행 중이면 먼저 그룹을 종료하거나 운영진에게 리더 변경을 요청해 주세요. 참여 중인 그룹에서는 자동으로 나가게 됩니다.</p><form class="form" data-form="wd">${field('비밀번호 확인', input('password', { type: 'password', required: true }))}${check('confirm', '위 내용을 확인했고 탈퇴합니다')}<div class="form-error error"></div><div class="btn-row"><button class="btn danger" type="submit">탈퇴하기</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`, { onMount(m) { bindForms(m, { async wd(d) { if (!d.confirm) throw new Error('확인란에 체크해 주세요'); await post('/me/withdraw', { password: d.password }); closeModal(); state.me = null; location.href = '/?withdrawn=1'; } }); } });
    },
    edit() {
      modal(`<h3>프로필 수정</h3><form class="form" data-form="prof">${field('닉네임', input('nickname', { value: me.nickname }))}${field('연락처', input('phone', { value: me.phone || '' }))}${field('관심 분야', `<div class="row">${Object.entries(FIELDS).map(([k, v]) => check('interests[]', v, (me.interests || '').includes(k), k)).join('')}</div>`)}${field('소개', textarea('bio', { value: me.bio || '', rows: 3 }))}${check('has_business', '사업자등록이 있습니다', !!me.has_business)}<div class="btn-row"><button class="btn primary" type="submit">저장</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`,
        { onMount(m) { bindForms(m, { async prof(d) { d.interests = (d.interests || []).join(','); await put('/me/profile', d); closeModal(); toast('저장했습니다'); await state.refreshMe(); reload(); } }); } });
    },
    promote() {
      modal(`<h3>승급 심사 신청 · ${esc(prog.next_name)}</h3><p class="small muted">운영본부가 7일 안에 심사하고 결과를 알림으로 보냅니다. 보류·반려 시 사유를 적어 드립니다.</p><form class="form" data-form="pr">${field('그동안 한 일 (3줄 이내)', textarea('note', { rows: 3, required: true }))}${field('증빙 링크 (페이퍼, 매출 화면, 발표 자료 등)', textarea('evidence', { rows: 2 }))}<div class="btn-row"><button class="btn primary" type="submit">신청</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`,
        { onMount(m) { bindForms(m, { async pr(d) { await post('/me/promotion', d); closeModal(); toast('신청했습니다. 결과는 알림으로 알려 드립니다'); } }); } });
    },
  }); } };
}

export async function points() {
  const d = await api('/me/points');
  return `<div class="wrap page" style="max-width:760px">${pageHead('포인트 내역', `총 ${num(d.totals.total)}점 · 이번 분기 ${num(d.totals.quarter)}점`, '<a class="btn" href="#/me">← 내 정보</a>')}
    <div class="card">${d.rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>일시</th><th>활동</th><th class="num">포인트</th></tr></thead><tbody>${d.rows.map(r => `<tr><td>${fmtDate(r.created_at, true)}</td><td>${esc(r.label)}</td><td class="num">+${r.points}</td></tr>`).join('')}</tbody></table></div>` : empty('아직 적립된 포인트가 없습니다', '정기모임 참석, 그룹 모임 출석, 도전 기록, 글쓰기로 시작해 보세요')}</div></div>`;
}

export async function assetDiag({ me }) {
  const a = me.asset_diag || {};
  const html = `<div class="wrap page" style="max-width:720px">${pageHead('자기 자산 진단', '거창할 필요 없습니다. 지금 가진 것을 있는 그대로 적어야 맞는 그룹이 보입니다.', '<a class="btn" href="#/me">← 내 정보</a>')}
    <form class="card form" data-form="diag">
      ${field('시간 *', input('time', { value: a.time || '', required: true, placeholder: '예: 평일 저녁 2시간 × 3일, 토요일 오전' }), '한 주에 실제로 뺄 수 있는 시간')}
      ${field('돈', input('money', { value: a.money || '', placeholder: '예: 잃어도 되는 돈 30만 원까지' }), '무리하지 않는 선에서 쓸 수 있는 돈')}
      ${field('기술 *', textarea('skills', { value: a.skills || '', rows: 3, required: true, placeholder: '할 줄 아는 것. 전문가가 아니어도 됩니다. 예: 엑셀 중급, 블로그 글쓰기, 영상 편집 초급' }))}
      ${field('경험', textarea('experience', { value: a.experience || '', rows: 3, placeholder: '일·취미·실패 경험 모두. 예: 중고거래 50건, 동네 카페 아르바이트 2년' }))}
      ${field('관계', textarea('relations', { value: a.relations || '', rows: 2, placeholder: '도움을 청할 수 있는 사람, 첫 고객이 되어 줄 수 있는 사람' }))}
      ${field('공간·장비', input('space', { value: a.space || '', placeholder: '예: 노트북, 차량, 주말에 쓸 수 있는 사무실' }))}
      ${field('석 달 뒤 바라는 모습', textarea('goal', { value: a.goal || '', rows: 2, placeholder: '예: 첫 유료 고객 1명, 디지털 상품 1개 출시' }))}
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

// ---------------- 그룹리더 신청 ----------------
export async function leader({ me }) {
  const d = await api('/me/leader');
  const app = d.application;
  const status = app ? { pending: ['검토 중', 'amber'], approved: ['승인', 'green'], rejected: ['반려', 'red'] }[app.status] : null;
  const html = `<div class="wrap page" style="max-width:820px">
    ${pageHead('그룹리더', '그룹리더는 학습그룹이나 도전그룹을 만들고, 모임을 열고, 출석 규칙을 정하고, 그룹원이 목표까지 가도록 이끄는 사람입니다.', '<a class="btn" href="#/me">← 내 정보</a>')}
    ${d.can_lead ? `<div class="card"><h3>그룹리더로 승인되었습니다</h3><p>언제든 그룹을 만들 수 있습니다. 한 번에 이끌 수 있는 그룹은 ${d.max_groups}개까지입니다.</p><a class="btn primary" href="#/groups/new">그룹 만들기</a>
      ${d.leading.length ? `<div class="list" style="margin-top:12px">${d.leading.map(g => `<a class="list-item" href="#/groups/${g.id}" style="color:inherit"><div class="grow"><div class="title">${esc(g.title)}</div><div class="meta">${typeChip(g.type)} ${stageChip(g.stage)}</div></div><span class="muted">→</span></a>`).join('')}</div>` : ''}</div>`
    : app && app.status === 'pending' ? `<div class="card"><div class="card-head"><h3>신청을 검토하고 있습니다</h3><span class="chip ${status[1]}">${status[0]}</span></div><p class="small muted">${fmtDate(app.created_at)}에 신청했습니다. 보통 5일 안에 결과를 알림으로 드립니다. 필요하면 운영진이 짧게 연락드립니다.</p>
      <div class="kv-list small">${[['그룹 종류', TYPE[app.form.kind] || app.form.kind], ['주제', app.form.topic], ['운영 계획', app.form.plan], ['관련 경험', app.form.experience || '-'], ['쓸 수 있는 시간', app.form.time || '-']].map(([k, v]) => `<div><span class="muted">${k}</span><span>${nl2br(v)}</span></div>`).join('')}</div></div>`
    : `${app && app.status === 'rejected' ? `<div class="notice warn">지난 신청은 이번에 함께하지 못했습니다${app.note ? ` · ${esc(app.note)}` : ''}. 내용을 보완해 다시 신청할 수 있습니다.</div>` : ''}
      <div class="grid grid-2"><div class="card soft small"><b>그룹리더가 하는 일</b><ul class="rule-list"><li>그룹의 목표와 진행 방식, 출석 규칙을 정합니다</li><li>모임 일정을 잡고 출석을 받습니다</li><li>그룹원의 기록을 챙기고 막힌 곳을 같이 봅니다</li><li>정기모임과 성과발표회에서 그룹의 진행을 나눕니다</li></ul></div>
      <div class="card soft small"><b>운영진이 돕는 일</b><ul class="rule-list"><li>그룹리더 워크숍과 운영 가이드</li><li>그룹 소개와 모집 홍보</li><li>모임 공간과 진행 도구 안내</li><li>막힐 때 오피스아워와 연결</li></ul></div></div>
      <form class="card form" data-form="lead" style="margin-top:14px"><h3>그룹리더 신청</h3>
        ${field('어떤 그룹을 이끌고 싶나요?', `<div class="radio-cards"><label class="radio-card"><input type="radio" name="kind" value="study"><div><b>학습그룹</b><small>함께 공부하고 정리</small></div></label><label class="radio-card"><input type="radio" name="kind" value="challenge" checked><div><b>도전그룹</b><small>프로젝트로 성과·수익에 도전</small></div></label></div>`)}
        <div class="form-cols">${field('그룹 주제 *', input('topic', { required: true, placeholder: '예: AI로 상세페이지 만들기, 동네 가게 SNS 대행' }))}${field('분야', select('field_code', [['', '고르기'], ...Object.entries(FIELDS)]))}</div>
        ${field('어떻게 운영할 생각인가요? *', textarea('plan', { rows: 4, required: true, placeholder: '모임 주기와 방식, 목표, 몇 명과 함께하고 싶은지' }))}
        ${field('관련 경험', textarea('experience', { rows: 3, placeholder: '이 주제와 관련해 해 본 일, 모임을 이끌어 본 경험' }))}
        ${field('그룹에 쓸 수 있는 시간', input('time', { placeholder: '예: 주 4시간, 화요일 저녁 고정' }))}
        <div class="form-error error"></div><button class="btn primary" type="submit">신청하기</button></form>`}
  </div>`;
  return { html, mount(root) { bindForms(root, { async lead(f) { await post('/me/leader', f); toast('신청했습니다. 결과는 알림으로 알려 드립니다'); reload(); } }); } };
}
