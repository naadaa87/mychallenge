import { fmtLocal, api, post, esc, nl2br, state, toast, go, reload, field, input, textarea, select, check, bindForms, bindActions, stat, num, pct, won, fmtDate, ago, LEVEL_NAMES, FIELDS, BOARDS, EVENT_TYPES, lvChip, fieldChip, pageHead, empty, tabs, modal, closeModal } from '../core.js';
import { paperCard } from './public.js';
import { feedRow } from './member.js';

// ---------------- 페이퍼 ----------------
export async function papers({ me, query }) {
  const list = me ? await api('/papers' + (query.field ? `?field=${query.field}` : '')) : await api('/public/papers');
  const html = `<div class="wrap page">
    ${pageHead('프로젝트 페이퍼', me ? '라운드가 끝난 모든 챌린지의 기록입니다. 성공도 실패도 같은 양식으로 남깁니다. 전문은 어치버(L3)부터, 그 전에는 요약을 봅니다.' : '외부 공개에 동의한 페이퍼의 요약입니다. 회원이 되면 더 많은 페이퍼를 볼 수 있습니다.')}
    ${me ? `<div class="pill-tabs" style="margin-bottom:14px"><a href="#/papers" class="${!query.field ? 'active' : ''}">전체</a>${Object.entries(FIELDS).map(([k, v]) => `<a href="#/papers?field=${k}" class="${query.field === k ? 'active' : ''}">${v}</a>`).join('')}</div>` : ''}
    ${list.length ? `<div class="grid grid-3">${list.map(paperCard).join('')}</div>` : empty('아직 공개된 페이퍼가 없습니다', '첫 라운드가 끝나면 이곳이 채워집니다')}
  </div>`;
  return html;
}

export async function paper({ params, me }) {
  const p = await api('/papers/' + params.id);
  const s = p.summary || {}; const f = p.form || {};
  const stateLabel = { ongoing: '계속 운영 중', transferred: '그룹원에게 이관', stopped: '중단', closed: '정리' };
  const kv = (label, v) => `<div class="kv"><small>${label}</small><b>${v == null ? '<span class="locked">비공개</span>' : v}</b></div>`;
  const html = `<div class="wrap page paper-view" style="max-width:800px">
    <div class="row" style="margin-bottom:6px"><a href="#/papers" class="small">← 페이퍼 목록</a></div>
    <div class="row">${fieldChip(p.field_code)}${s.has_sales ? '<span class="chip green">매출 발생</span>' : '<span class="chip">매출 없음</span>'}<span class="chip">${stateLabel[s.state] || ''}</span>${p.publish_scope === 'public' ? '<span class="chip blue">외부 공개</span>' : ''}</div>
    ${pageHead(esc(p.title), `그룹장 ${esc(p.leader || '')} · 공개 ${fmtDate(p.published_at)}`, '<button class="btn" onclick="window.print()">인쇄 / PDF</button>')}
    <div class="paper-kv">${kv('외부 매출', s.has_sales ? '있음' : '없음')}${kv('외부 고객 수', esc(s.customers_band || '0'))}${kv('투입 시간', num(s.hours) + 'h')}${p.full ? kv('외부 매출액', f.revenue_external == null ? null : won(f.revenue_external)) : kv('외부 매출액', '<span class="locked">전문에서</span>')}</div>
    <h2>해결하려던 문제</h2><p>${nl2br(s.pain || f.pain || '')}</p>
    ${p.full ? `
      ${f.product !== null ? `<h2>만든 것·판 것</h2><p>${nl2br(f.product || '')}</p>` : '<h2>만든 것·판 것</h2><p class="locked">비공개 항목</p>'}
      ${f.milestones?.length ? `<h2>주요 마일스톤</h2><ol>${f.milestones.map(m => `<li>${esc(m)}</li>`).join('')}</ol>` : ''}
      <h2>숫자</h2><div class="paper-kv">${kv('내부 매출', f.revenue_internal == null ? null : won(f.revenue_internal))}${kv('총 비용', f.expenses == null ? null : won(f.expenses))}${kv('외부 고객 수', f.customers == null ? null : num(f.customers) + '명')}${kv('시간당 순수익', f.hourly_net == null ? null : won(f.hourly_net))}</div>
      <div class="grid grid-2" style="margin-top:14px"><div class="card soft"><h3>잘된 것</h3>${(f.good || []).length ? `<ul>${f.good.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted small">-</p>'}</div><div class="card soft"><h3>안 된 것</h3>${f.bad === null ? '<p class="locked">비공개 항목</p>' : ((f.bad || []).length ? `<ul>${f.bad.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted small">-</p>')}</div></div>
      ${f.next ? `<h2>다음에 한다면</h2><p>${nl2br(f.next)}</p>` : ''}
      ${f.to_next ? `<h2>다음 도전자에게</h2><blockquote class="notice">${nl2br(f.to_next)}</blockquote>` : ''}
      <p class="small muted print-only">마이챌린지 프로젝트 페이퍼 · 열람자 ${esc(p.viewer || '')} · ${new Date().toLocaleDateString('ko-KR')}</p>
    ` : `
      ${s.lesson ? `<h2>배운 점 한 가지</h2><p>${esc(s.lesson)}</p>` : ''}
      <div class="notice" style="margin-top:20px">전문(상세 숫자, 잘된 것·안 된 것, 다음 도전자에게)은 어치버(L3) 이상 또는 해당 그룹원이 볼 수 있습니다. 먼저 해 본 사람이 다른 사람의 기록을 읽습니다.</div>
    `}
  </div>`;
  return html;
}

// ---------------- 커뮤니티 ----------------
const BOARD_TABS = [['feed', '피드', '#/community'], ['question', '질문', '#/community/board/question'], ['share', '공유', '#/community/board/share'], ['review', '후기', '#/community/board/review'], ['swap', '품앗이', '#/community/board/swap'], ['notice', '공지', '#/community/board/notice']];

export async function feed({ me }) {
  const items = await api('/feed');
  const html = `<div class="wrap page">
    ${pageHead('커뮤니티', '완료 기록, 질문, 공유, 후기가 한 줄기로 흐릅니다. 수익을 보장하는 표현은 쓸 수 없습니다.', '<a class="btn primary" href="#/community/new">글쓰기</a>')}
    ${tabs(BOARD_TABS, 'feed')}
    <div class="grid grid-2"><div class="card">${items.length ? items.map(feedRow).join('') : empty('아직 조용합니다', '첫 완료 기록이나 질문을 남겨 보세요')}</div>
    <div class="stack"><div class="card soft small"><b>글쓰기 전에</b><ul style="margin:6px 0 0;padding-left:18px"><li>질문은 "지금까지 해 본 것"을 먼저 적습니다.</li><li>공유는 링크보다 "내가 써 본 결과"가 먼저입니다.</li><li>후기는 숫자와 함께. 매출이 없었다면 없었다고.</li><li>품앗이 보드는 메이커(L2)부터 — 서로의 기술을 교환합니다.</li></ul></div><a class="card clickable" href="#/members"><h3>회원 · 첫 매출 명단</h3><p class="muted small" style="margin:0">이번 분기 포인트 상위 10명과 첫 매출을 낸 회원들</p></a></div></div>
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
    <div class="card">${posts.length ? `<div class="list">${posts.map(p => `<a class="list-item" href="#/community/posts/${p.id}" style="color:inherit"><div class="grow"><div class="title">${esc(p.title)}</div><div class="meta">${esc(p.nickname)} ${lvChip(p.level)} · ${ago(p.created_at)} · 댓글 ${p.comment_count} · 도움 ${p.helpful_count}</div></div></a>`).join('')}</div>` : empty('글이 없습니다')}</div>
  </div>`;
  return html;
}

export async function newPost({ me, query }) {
  const boards = Object.entries(BOARDS).filter(([k]) => (k !== 'notice' || me.role === 'staff') && (k !== 'swap' || me.role === 'staff' || me.level >= 'L2'));
  const myGroups = (me.groups || []).filter(g => g.member_status === 'active');
  const html = `<div class="wrap page" style="max-width:720px">${pageHead('글쓰기')}
    <form class="card form" data-form="post">
      <div class="form-cols">${field('게시판', select('board', boards, query.board || 'share'))}${myGroups.length ? field('관련 챌린지 (선택)', select('challenge_id', [['', '없음'], ...myGroups.map(g => [g.id, g.title])])) : ''}</div>
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
    <div class="card"><span class="chip">${BOARDS[p.board]}</span><h1 style="margin-top:8px;font-size:1.4rem">${esc(p.title)}</h1><p class="muted small">${esc(p.nickname)} ${lvChip(p.level)} · ${fmtDate(p.created_at, true)}</p><div class="divider"></div><div style="font-size:1rem;line-height:1.7">${nl2br(p.body)}</div><div class="divider"></div>
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

// ---------------- 일정 ----------------
export async function events({ me }) {
  const list = await api('/events');
  const now = Date.now();
  const upcoming = list.filter(e => new Date(e.starts_at.replace(' ', 'T')).getTime() >= now - 3 * 3600e3), past = list.filter(e => !upcoming.includes(e));
  const row = e => `<div class="list-item"><div class="grow"><div class="row" style="gap:6px"><span class="chip ${e.type === 'demo_day' ? 'purple' : e.type === 'machal_day' ? 'blue' : ''}">${EVENT_TYPES[e.type]}</span><span class="chip">${LEVEL_NAMES[e.min_level]}부터</span></div><div class="title" style="margin-top:4px">${esc(e.title)}</div><div class="meta">${fmtLocal(e.starts_at)}${e.location ? ' · ' + esc(e.location) : ''} · 신청 ${e.registered}${e.capacity ? '/' + e.capacity : ''}명</div>${e.description ? `<div class="small" style="margin-top:4px">${nl2br(e.description)}</div>` : ''}${me.role === 'staff' && e.attendance_code ? `<div class="small muted">출석 코드 <span class="kbd">${esc(e.attendance_code)}</span></div>` : ''}</div>
    <div class="btn-row" style="flex-direction:column">${e.my_status === 'attended' ? '<span class="chip green">출석</span>' : `${e.my_status === 'registered' ? '<span class="chip blue">신청함</span>' : `<button class="btn sm primary" data-act="reg" data-id="${e.id}">신청</button>`}<button class="btn sm" data-act="attend" data-id="${e.id}">출석 코드</button>`}</div></div>`;
  const html = `<div class="wrap page">${pageHead('일정', '마챌데이(월 1회 전체 모임), 데모데이(라운드 말), 세미나·스터디·오피스아워. 참석은 현장 코드로 출석 처리되고 포인트(30점)가 쌓입니다.', me.role === 'staff' ? '<a class="btn primary" href="#/admin/events">일정 만들기</a>' : '')}
    <div class="card"><h3>다가오는 일정</h3>${upcoming.length ? `<div class="list">${upcoming.map(row).join('')}</div>` : '<p class="muted small" style="margin:0">예정된 일정이 없습니다.</p>'}</div>
    ${past.length ? `<div class="card" style="margin-top:14px"><h3>지난 30일</h3><div class="list">${past.map(row).join('')}</div></div>` : ''}</div>`;
  return { html, mount(root) { bindActions(root, {
    async reg(el) { await post(`/events/${el.dataset.id}/register`); toast('신청했습니다'); reload(); },
    attend(el) { modal(`<h3>출석 코드 입력</h3><p class="small muted">현장에서 안내된 코드를 입력하면 출석 처리됩니다.</p><form class="form" data-form="at">${field('코드', input('code', { required: true, placeholder: '예: AB12' }))}<div class="btn-row"><button class="btn primary" type="submit">출석</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`, { onMount(m) { bindForms(m, { async at(d) { const r = await post(`/events/${el.dataset.id}/attend`, d); closeModal(); toast(r.promoted ? '출석! 메이커(L2)로 승급되었습니다' : '출석 처리됐습니다 (+30점)'); await state.refreshMe(); reload(); } }); } }); },
  }); } };
}

// ---------------- 회원 ----------------
export async function members() {
  const [first, board] = await Promise.all([api('/members/first-sales'), api('/leaderboard')]);
  return `<div class="wrap page">${pageHead('회원', '등수가 목적은 아닙니다. 누가 어디까지 왔는지 보고, 커피챗을 청해 보세요.')}
    <div class="grid grid-2">
      <div class="card"><h3>첫 매출 명단</h3><p class="small muted">외부 고객에게 첫 매출을 인증한 회원. 금액은 묻지 않습니다.</p>${first.length ? `<div class="list">${first.map(u => `<div class="list-item"><div class="grow"><div class="title">${esc(u.nickname)} ${lvChip(u.level)}</div><div class="meta">${esc((u.interests || '').split(',').filter(Boolean).map(k => FIELDS[k] || k).join(', '))} · ${fmtDate(u.first_sale_at)}</div></div></div>`).join('')}</div>` : '<p class="muted small" style="margin:0">아직 없습니다. 첫 번째가 되어 보세요.</p>'}</div>
      <div class="card"><h3>이번 분기 활동 상위</h3>${board.length ? `<div class="list">${board.map((u, i) => `<div class="list-item"><span class="muted" style="width:20px">${i + 1}</span><div class="grow"><div class="title">${esc(u.nickname)} ${lvChip(u.level)}</div></div><b>${num(u.points)}점</b></div>`).join('')}</div>` : '<p class="muted small" style="margin:0">이번 분기 기록이 아직 없습니다.</p>'}</div>
    </div></div>`;
}
