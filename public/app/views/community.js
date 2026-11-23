import { fmtLocal, api, post, esc, nl2br, state, toast, go, reload, field, input, textarea, select, check, bindForms, bindActions, stat, num, pct, won, fmtDate, ago, LEVEL_NAMES, FIELDS, BOARDS, EVENT_TYPES, EVENT_TOPICS, TYPE, lvChip, fieldChip, pageHead, empty, tabs, modal, closeModal } from '../core.js';
import { paperCard } from './public.js';
import { feedRow } from './member.js';

// ---------------- 페이퍼 ----------------
export async function papers({ me, query }) {
  const list = me ? await api('/papers' + (query.field ? `?field=${query.field}` : '')) : await api('/public/papers');
  const html = `<div class="wrap page">
    ${pageHead('프로젝트 페이퍼', me ? '마무리한 그룹이 과정과 결과를 정리한 기록입니다. 잘된 도전도, 멈춘 도전도 같은 양식으로 남깁니다. 전문은 어치버(L3)부터, 그 전에는 요약을 봅니다.' : '외부 공개에 동의한 페이퍼의 요약입니다. 회원이 되면 더 많은 페이퍼를 볼 수 있습니다.')}
    ${me ? `<div class="pill-tabs" style="margin-bottom:14px"><a href="#/papers" class="${!query.field ? 'active' : ''}">전체</a>${Object.entries(FIELDS).map(([k, v]) => `<a href="#/papers?field=${k}" class="${query.field === k ? 'active' : ''}">${v}</a>`).join('')}</div>` : ''}
    ${list.length ? `<div class="grid grid-3">${list.map(paperCard).join('')}</div>` : empty('아직 공개된 페이퍼가 없습니다', '첫 그룹들이 마무리되면 이곳이 채워집니다')}
  </div>`;
  return html;
}

export async function paper({ params, me }) {
  const p = await api('/papers/' + params.id);
  const s = p.summary || {}; const f = p.form || {};
  const stateLabel = { ongoing: '계속 운영 중', transferred: '다른 사람이 이어 감', stopped: '중단', closed: '정리' };
  const kv = (label, v) => `<div class="kv"><small>${label}</small><b>${v == null ? '<span class="locked">비공개</span>' : v}</b></div>`;
  const html = `<div class="wrap page paper-view" style="max-width:800px">
    <div class="row" style="margin-bottom:6px"><a href="#/papers" class="small">← 페이퍼 목록</a></div>
    <div class="row">${fieldChip(p.field_code)}${s.has_sales ? '<span class="chip green">매출 발생</span>' : '<span class="chip">매출 없음</span>'}<span class="chip">${stateLabel[s.state] || ''}</span>${p.publish_scope === 'public' ? '<span class="chip blue">외부 공개</span>' : ''}</div>
    ${pageHead(esc(p.title), `그룹리더 ${esc(p.leader || '')} · 공개 ${fmtDate(p.published_at)}${p.challenge_id ? ` · <a href="#/groups/${p.challenge_id}">그룹 보기</a>` : ''}`, '<button class="btn" onclick="window.print()">인쇄 / PDF</button>')}
    <div class="paper-kv">${kv('매출', s.has_sales ? '있음' : '없음')}${kv('고객 수', esc(s.customers_band || '0'))}${kv('들인 시간', num(s.hours) + 'h')}${p.full ? kv('매출액', f.revenue_external == null ? null : won(f.revenue_external)) : kv('매출액', '<span class="locked">전문에서</span>')}</div>
    <h2>해결하려던 문제 · 배우려던 것</h2><p>${nl2br(s.pain || f.pain || '')}</p>
    ${p.full ? `
      ${f.product !== null ? `<h2>만든 것 · 해 본 것</h2><p>${nl2br(f.product || '')}</p>` : '<h2>만든 것 · 해 본 것</h2><p class="locked">비공개 항목</p>'}
      ${f.milestones?.length ? `<h2>주요 마일스톤</h2><ol>${f.milestones.map(m => `<li>${esc(m)}</li>`).join('')}</ol>` : ''}
      <h2>숫자</h2><div class="paper-kv">${kv('지인·내부 매출', f.revenue_internal == null ? null : won(f.revenue_internal))}${kv('쓴 비용', f.expenses == null ? null : won(f.expenses))}${kv('고객 수', f.customers == null ? null : num(f.customers) + '명')}${kv('시간당 남은 돈', f.hourly_net == null ? null : won(f.hourly_net))}</div>
      <div class="grid grid-2" style="margin-top:14px"><div class="card soft"><h3>잘된 것</h3>${(f.good || []).length ? `<ul>${f.good.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted small">-</p>'}</div><div class="card soft"><h3>안 된 것</h3>${f.bad === null ? '<p class="locked">비공개 항목</p>' : ((f.bad || []).length ? `<ul>${f.bad.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted small">-</p>')}</div></div>
      ${f.next ? `<h2>다음에 한다면</h2><p>${nl2br(f.next)}</p>` : ''}
      ${f.to_next ? `<h2>다음 도전자에게</h2><blockquote class="notice">${nl2br(f.to_next)}</blockquote>` : ''}
      <p class="small muted print-only">마이챌린지 프로젝트 페이퍼 · 열람자 ${esc(p.viewer || '')} · ${new Date().toLocaleDateString('ko-KR')}</p>
    ` : `
      ${s.lesson ? `<h2>배운 점 한 가지</h2><p>${esc(s.lesson)}</p>` : ''}
      <div class="notice" style="margin-top:20px">전문(상세 숫자, 잘된 것·안 된 것, 다음 도전자에게)은 어치버(L3) 이상 또는 해당 그룹원이 볼 수 있습니다.</div>
    `}
  </div>`;
  return html;
}

// ---------------- 커뮤니티 ----------------
const BOARD_TABS = [['feed', '피드', '#/community'], ['group', '그룹 소식', '#/community/board/group'], ['share', '정보·자료', '#/community/board/share'], ['idea', '아이디어', '#/community/board/idea'], ['trend', '시장·트렌드·AI', '#/community/board/trend'], ['question', '질문', '#/community/board/question'], ['review', '후기', '#/community/board/review'], ['notice', '공지', '#/community/board/notice']];

export async function feed({ me }) {
  const items = await api('/feed');
  const html = `<div class="wrap page">
    ${pageHead('커뮤니티', '그룹 소식, 정보·자료, 사업 아이디어, 시장·트렌드·AI 이야기가 한 줄기로 흐릅니다. 그룹끼리 기록과 성과를 나누는 곳입니다. 수익을 보장하는 표현은 쓸 수 없습니다.', '<a class="btn primary" href="#/community/new">글쓰기</a>')}
    ${tabs(BOARD_TABS, 'feed')}
    <div class="grid grid-2"><div class="card">${items.length ? items.map(feedRow).join('') : empty('아직 조용합니다', '그룹에서 첫 기록을 공유하거나 질문을 남겨 보세요')}</div>
    <div class="stack"><div class="card soft small"><b>글쓰기 전에</b><ul style="margin:6px 0 0;padding-left:18px"><li>질문은 "지금까지 해 본 것"을 먼저 적습니다.</li><li>정보·자료는 링크보다 "내가 써 본 결과"가 먼저입니다.</li><li>아이디어는 누가, 언제, 왜 불편한지부터.</li><li>그룹 소식은 숫자와 함께. 잘 안된 것도 그대로.</li></ul></div><a class="card clickable" href="#/members"><h3>회원 · 첫 매출 명단</h3><p class="muted small" style="margin:0">이번 분기 포인트 상위 10명과 첫 매출을 낸 회원들</p></a></div></div>
  </div>`;
  return html;
}

export async function boardView({ params, me }) {
  const board = params.board;
  if (!BOARDS[board]) { go('#/community'); return ''; }
  const posts = await api('/posts?board=' + board);
  const html = `<div class="wrap page">
    ${pageHead('커뮤니티 · ' + BOARDS[board], '', board === 'notice' && me.role !== 'staff' ? '' : `<a class="btn primary" href="#/community/new?board=${board}">글쓰기</a>`)}
    ${tabs(BOARD_TABS, board)}
    ${board === 'group' ? '<p class="small muted" style="margin:-6px 0 12px">그룹의 도전 기록과 성과 기록 중 커뮤니티에 공유한 것이 모입니다. 다른 그룹의 진행을 보고 응원과 조언을 남겨 주세요.</p>' : ''}
    <div class="card">${posts.length ? `<div class="list">${posts.map(p => `<a class="list-item" href="#/community/posts/${p.id}" style="color:inherit"><div class="grow"><div class="title">${esc(p.title)}</div><div class="meta">${esc(p.nickname)} ${lvChip(p.level)}${p.group_title ? ` · ${esc(p.group_title)}` : ''} · ${ago(p.created_at)} · 댓글 ${p.comment_count} · 도움 ${p.helpful_count}</div></div></a>`).join('')}</div>` : empty('글이 없습니다')}</div>
  </div>`;
  return html;
}

export async function newPost({ me, query }) {
  const boards = Object.entries(BOARDS).filter(([k]) => k !== 'notice' || me.role === 'staff');
  const myGroups = (me.groups || []).filter(g => g.member_status === 'active');
  const html = `<div class="wrap page" style="max-width:720px">${pageHead('글쓰기')}
    <form class="card form" data-form="post">
      <div class="form-cols">${field('게시판', select('board', boards, query.board || 'share'))}${myGroups.length ? field('관련 그룹 (그룹 소식은 필수)', select('challenge_id', [['', '없음'], ...myGroups.map(g => [g.id, g.title])])) : ''}</div>
      ${field('제목', input('title', { required: true }))}
      ${field('내용', textarea('body', { rows: 8, required: true, placeholder: '해 본 것 → 결과 → 궁금한 것 순서로 쓰면 답이 빨리 옵니다.' }))}
      <p class="small muted" style="margin:0">"원금 보장", "수익 보장", "무조건 된다" 같은 표현은 자동으로 막힙니다 (원칙 1).</p>
      <div class="form-error error"></div>
      <button class="btn primary" type="submit">올리기</button>
    </form></div>`;
  return { html, mount(root) { bindForms(root, { async post(d) { const r = await post('/posts', d); toast('올렸습니다'); go(`#/community/posts/${r.id}`); } }); } };
}

export async function post_({ params, me }) {
  const p = await api('/posts/' + params.id);
  const html = `<div class="wrap page" style="max-width:760px">
    <div class="row" style="margin-bottom:6px"><a href="#/community/board/${p.board}" class="small">← ${BOARDS[p.board]}</a></div>
    <div class="card"><span class="chip">${BOARDS[p.board]}</span>${p.group_title ? ` <a class="chip blue" href="#/groups/${p.challenge_id}">${esc(TYPE[p.group_type] || '그룹')} · ${esc(p.group_title)}</a>` : ''}<h1 style="margin-top:8px;font-size:1.4rem">${esc(p.title)}</h1><p class="muted small">${esc(p.nickname)} ${lvChip(p.level)} · ${fmtDate(p.created_at, true)}</p><div class="divider"></div><div style="font-size:1rem;line-height:1.7">${nl2br(p.body)}</div><div class="divider"></div>
      <div class="btn-row"><button class="btn sm ${p.my_helpful ? 'primary' : ''}" data-act="helpful">👍 도움이 됐어요 ${p.helpful_count}</button><button class="btn sm ghost" data-act="report">신고</button></div></div>
    <div class="card" style="margin-top:14px"><h3>댓글 ${p.comments.length}</h3>${p.comments.map(c => `<div class="list-item"><div class="grow"><div class="small"><b>${esc(c.nickname)}</b> ${lvChip(c.level)} <span class="muted">${ago(c.created_at)}</span></div><div>${nl2br(c.body)}</div></div></div>`).join('')}
      <form class="form" data-form="cmt" style="margin-top:12px"><div class="field"><textarea name="body" rows="3" required placeholder="댓글 (+2점, 하루 5회까지)"></textarea></div><button class="btn primary sm" type="submit">댓글 달기</button></form></div>
  </div>`;
  return { html, mount(root) {
    bindForms(root, { async cmt(d) { await post(`/posts/${p.id}/comments`, d); reload(); } });
    bindActions(root, {
      async helpful() { await post(`/posts/${p.id}/helpful`); reload(); },
      report() { modal(`<h3>신고</h3><form class="form" data-form="rp">${field('사유', textarea('note', { rows: 3, required: true, placeholder: '수익 보장 표현, 광고, 비방 등' }))}<div class="btn-row"><button class="btn primary" type="submit">신고</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`, { onMount(m) { bindForms(m, { async rp(d) { await post(`/posts/${p.id}/report`, d); closeModal(); toast('운영진에게 전달했습니다'); } }); } }); },
    });
  } };
}
export { post_ as post };

// ---------------- 정기모임·일정 ----------------
const EV_CHIP = { regular: 'blue', showcase: 'purple', seminar: '', workshop: '', office_hour: '', networking: 'green' };
const MODE = { offline: '오프라인', online: '온라인', hybrid: '온·오프라인' };
export async function events({ me }) {
  const d = await api('/events');
  const list = d.events;
  const now = Date.now();
  const upcoming = list.filter(e => new Date(e.starts_at.replace(' ', 'T')).getTime() >= now - 3 * 3600e3), past = list.filter(e => !upcoming.includes(e));
  const canPresent = e => ['regular', 'showcase', 'seminar', 'workshop'].includes(e.type) && upcoming.includes(e) && e.status !== 'cancelled';
  const row = e => `<div class="list-item ev-row"><div class="grow"><div class="row" style="gap:6px"><span class="chip ${EV_CHIP[e.type] || ''}">${esc(e.type_name || EVENT_TYPES[e.type] || e.type)}</span><span class="chip">${MODE[e.mode] || '오프라인'}</span>${(e.topic_names || []).map(t => `<span class="chip soft">${esc(t)}</span>`).join('')}${e.status === 'cancelled' ? '<span class="chip red">취소</span>' : ''}</div>
      <div class="title" style="margin-top:4px">${esc(e.title)}</div><div class="meta">${fmtLocal(e.starts_at)}${e.location ? ' · ' + esc(e.location) : ''} · 신청 ${e.registered}${e.capacity ? '/' + e.capacity : ''}명 · ${LEVEL_NAMES[e.min_level]}부터</div>
      ${e.description ? `<div class="small" style="margin-top:4px">${nl2br(e.description)}</div>` : ''}
      ${e.online_url ? `<div class="small" style="margin-top:4px"><a href="${esc(e.online_url)}" target="_blank" rel="noopener">온라인 참여 링크</a></div>` : ''}
      ${e.presentations?.length ? `<div class="pres-list small">${e.presentations.map(p => `<div>🎤 <b>${esc(p.title)}</b> · ${esc(p.group_title ? p.group_title + ' (' + p.nickname + ')' : p.nickname)} ${p.status === 'applied' ? '<span class="chip amber">검토 중</span>' : p.status === 'presented' ? '<span class="chip green">발표함</span>' : ''}${p.mine && p.status !== 'presented' ? ` <button class="btn xs ghost" data-act="unpres" data-id="${p.id}">신청 취소</button>` : ''}</div>`).join('')}</div>` : ''}</div>
    <div class="btn-row" style="flex-direction:column">${e.my_status === 'attended' ? '<span class="chip green">출석</span>' : e.status === 'cancelled' ? '' : `${e.my_status === 'registered' ? '<span class="chip blue">신청함</span>' : `<button class="btn sm primary" data-act="reg" data-id="${e.id}">신청</button>`}<button class="btn sm" data-act="attend" data-id="${e.id}">출석 코드</button>`}
      ${canPresent(e) && !(e.presentations || []).some(p => p.mine) ? `<button class="btn sm" data-act="present" data-id="${e.id}" data-type="${e.type}">${e.type === 'showcase' ? '그룹 발표 신청' : '발제 신청'}</button>` : ''}</div></div>`;
  const html = `<div class="wrap page">${pageHead('정기모임·일정', '정기모임에서는 사업 아이디어, 시장, 트렌드, AI 활용, 사이드프로젝트 사례를 함께 살피고 의견을 나눕니다. 그룹은 여기서 시작되고, 성과발표회에서 결과를 나눕니다.', me.role === 'staff' ? '<a class="btn primary" href="/admin/#/events">일정 만들기</a>' : '')}
    <div class="grid grid-3 ev-intro">
      <div class="card soft small"><b>정기모임</b><p class="muted" style="margin:4px 0 0">한 달에 한 번 이상. 발제 2~3개를 듣고 이야기를 나눕니다. 누구나 발제를 신청할 수 있습니다.</p></div>
      <div class="card soft small"><b>세미나·워크숍</b><p class="muted" style="margin:4px 0 0">AI 도구, 판매 페이지, 세금처럼 바로 써먹을 주제를 해 본 사람에게 배웁니다.</p></div>
      <div class="card soft small"><b>성과발표회</b><p class="muted" style="margin:4px 0 0">분기마다 그룹들이 목표와 결과, 배운 것을 발표합니다. 그룹리더가 그룹 단위로 신청합니다.</p></div>
    </div>
    <div class="card" style="margin-top:14px"><h3>다가오는 일정</h3>${upcoming.length ? `<div class="list">${upcoming.map(row).join('')}</div>` : '<p class="muted small" style="margin:0">예정된 일정이 없습니다.</p>'}</div>
    ${past.length ? `<div class="card" style="margin-top:14px"><h3>지난 30일</h3><div class="list">${past.map(row).join('')}</div></div>` : ''}</div>`;
  return { html, mount(root) { bindActions(root, {
    async reg(el) { await post(`/events/${el.dataset.id}/register`); toast('신청했습니다'); reload(); },
    async unpres(el) { await post(`/presentations/${el.dataset.id}/cancel`); toast('발표 신청을 취소했습니다'); reload(); },
    attend(el) { modal(`<h3>출석 코드 입력</h3><p class="small muted">현장이나 온라인에서 안내된 코드를 입력하면 출석 처리됩니다.</p><form class="form" data-form="at">${field('코드', input('code', { required: true, placeholder: '예: AB12' }))}<div class="btn-row"><button class="btn primary" type="submit">출석</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`, { onMount(m) { bindForms(m, { async at(f) { const r = await post(`/events/${el.dataset.id}/attend`, f); closeModal(); toast(r.promoted ? '출석! 메이커(L2)로 승급되었습니다' : '출석했습니다'); reload(); } }); } }); },
    present(el) {
      const show = el.dataset.type === 'showcase';
      if (show && !d.my_groups.length) { toast('성과발표회 발표는 그룹리더나 부리더가 그룹 단위로 신청합니다', true); return; }
      modal(`<h3>${show ? '그룹 발표 신청' : '발제 신청'}</h3><p class="small muted">${show ? '그룹의 목표, 한 일, 숫자, 배운 것을 10분 안에 나눕니다.' : '아이디어, 시장, 트렌드, AI 활용, 해 본 사이드프로젝트 중 무엇이든 10분이면 됩니다.'} 운영진이 순서를 정해 알려 드립니다.</p>
        <form class="form" data-form="pr">${show ? field('발표할 그룹', select('challenge_id', d.my_groups.map(g => [g.id, g.title]))) : (d.my_groups.length ? field('그룹 이야기라면 (선택)', select('challenge_id', [['', '개인 발제'], ...d.my_groups.map(g => [g.id, g.title])])) : '')}
        ${field('제목', input('title', { required: true, placeholder: show ? '예: 동네 가게 인스타 대행 8주, 첫 고객까지' : '예: 요즘 쓸 만한 AI 상세페이지 도구 3가지' }))}${field('한두 줄 소개', textarea('summary', { rows: 2 }))}${field('자료 링크 (선택)', input('link', { placeholder: 'https://' }))}
        <div class="btn-row"><button class="btn primary" type="submit">신청</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`,
        { onMount(m) { bindForms(m, { async pr(f) { if (!f.challenge_id) delete f.challenge_id; await post(`/events/${el.dataset.id}/presentations`, f); closeModal(); toast('신청했습니다. 확정되면 알려 드립니다'); reload(); } }); } });
    },
  }); } };
}

// ---------------- 회원 ----------------
export async function members() {
  const [first, board] = await Promise.all([api('/members/first-sales'), api('/leaderboard')]);
  return `<div class="wrap page">${pageHead('회원', '등수가 목적은 아닙니다. 누가 어디까지 왔는지 보고, 정기모임에서 말을 걸어 보세요.')}
    <div class="grid grid-2">
      <div class="card"><h3>첫 매출 명단</h3><p class="small muted">그룹의 첫 매출을 운영진이 확인한 회원. 금액은 묻지 않습니다.</p>${first.length ? `<div class="list">${first.map(u => `<div class="list-item"><div class="grow"><div class="title">${esc(u.nickname)} ${lvChip(u.level)}</div><div class="meta">${esc((u.interests || '').split(',').filter(Boolean).map(k => FIELDS[k] || k).join(', '))} · ${fmtDate(u.first_sale_at)}</div></div></div>`).join('')}</div>` : '<p class="muted small" style="margin:0">아직 없습니다. 첫 번째가 되어 보세요.</p>'}</div>
      <div class="card"><h3>이번 분기 활동 상위</h3>${board.length ? `<div class="list">${board.map((u, i) => `<div class="list-item"><span class="muted" style="width:20px">${i + 1}</span><div class="grow"><div class="title">${esc(u.nickname)} ${lvChip(u.level)}</div></div><b>${num(u.points)}점</b></div>`).join('')}</div>` : '<p class="muted small" style="margin:0">이번 분기 기록이 아직 없습니다.</p>'}</div>
    </div></div>`;
}
