// 운영본부 화면 공통 — 레이아웃(사이드 메뉴), 숫자 막대, 메모, 감사 로그 문구
import { api, post, esc, nl2br, ago, fmtDate, num, toast, modal, closeModal, bindForms, bindActions, field, textarea, reload } from '../../core.js';

// 사이드 메뉴 — [키, 이름, 묶음, 개수 키]
export const MENU = [
  ['home', '현황', null],
  ['applications', '가입 신청', '받은 일', 'applications'],
  ['challenges', '챌린지 심사', '받은 일', 'challenges'],
  ['agreements', '합의서 승인', '받은 일', 'agreements'],
  ['settlements', '정산 검수', '받은 일', 'settlements'],
  ['papers', '페이퍼 검토', '받은 일', 'papers'],
  ['promotions', '승급 심사', '받은 일', 'promotions'],
  ['disputes', '이의·신고', '받은 일', 'disputes'],
  ['users', '회원', '사람'],
  ['staff', '운영진', '사람'],
  ['groups', '그룹 현황', '챌린지'],
  ['rounds', '라운드', '챌린지'],
  ['payouts', '지급 관리', '돈', 'payouts'],
  ['hq', '운영본부 재원', '돈'],
  ['broadcast', '단체 알림', '소통'],
  ['community', '커뮤니티 관리', '소통', 'community'],
  ['events', '일정·출석', '소통'],
  ['settings', '규칙 설정', '설정'],
  ['audit', '감사 로그', '설정'],
  ['data', '데이터·백업', '설정'],
];
export const labelOf = key => MENU.find(m => m[0] === key)?.[1] || key;

let countsCache = null, countsAt = 0;
export async function getCounts(force = false) {
  if (!force && countsCache && Date.now() - countsAt < 20000) return countsCache;
  try { countsCache = await api('/admin/counts'); countsAt = Date.now(); } catch { countsCache = countsCache || {}; }
  return countsCache;
}
export function invalidateCounts() { countsAt = 0; }

function sideHtml(active, counts) {
  let html = ''; let group = undefined;
  for (const [k, l, g, ck] of MENU) {
    if (g !== group) { if (group !== undefined) html += '</div>'; html += `<div class="adm-group">${g ? `<div class="adm-group-title">${g}</div>` : ''}`; group = g; }
    const n = ck ? counts[ck] || 0 : 0;
    html += `<a href="${k === 'home' ? '#/admin' : '#/admin/' + k}" class="${k === active ? 'active' : ''}"><span>${l}</span>${n ? `<span class="adm-count${g === '받은 일' ? ' hot' : ''}">${n > 99 ? '99+' : n}</span>` : ''}</a>`;
  }
  return html + '</div>';
}

// 운영본부 화면 틀. body는 HTML 문자열, mount는 선택
export async function shell(active, { title, sub = '', actions = '', crumbs = null }, body) {
  const counts = await getCounts();
  const inbox = ['applications', 'challenges', 'agreements', 'settlements', 'papers', 'promotions', 'disputes'].reduce((s, k) => s + (counts[k] || 0), 0);
  return `<div class="adm">
    <aside class="adm-side" aria-label="운영본부 메뉴">
      <div class="adm-side-head"><b>운영본부</b><span class="chip ${counts.is_owner ? 'ink' : ''}">${counts.is_owner ? '운영자' : '운영진'}</span></div>
      ${sideHtml(active, counts)}
    </aside>
    <div class="adm-main">
      <div class="adm-top">
        <details class="adm-mnav"><summary><span>☰ 메뉴</span><b>${esc(labelOf(active))}</b>${inbox ? `<span class="adm-count hot">${inbox}</span>` : ''}</summary><div class="adm-mnav-panel">${sideHtml(active, counts)}</div></details>
        <div class="adm-search"><input type="search" id="adm-q" placeholder="회원·챌린지·신청자 찾기" autocomplete="off" aria-label="통합 검색"><div class="adm-search-box" id="adm-q-box" hidden></div></div>
      </div>
      ${crumbs ? `<nav class="adm-crumbs">${crumbs.map(([l, h]) => h ? `<a href="${h}">${esc(l)}</a>` : `<span>${esc(l)}</span>`).join('<span class="sep">›</span>')}</nav>` : ''}
      <div class="adm-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="btn-row">${actions}</div>` : ''}</div>
      ${body}
    </div>
  </div>`;
}

// 통합 검색 (모든 운영본부 화면 공통)
export function mountShell(root) {
  const q = root.querySelector('#adm-q'), box = root.querySelector('#adm-q-box');
  if (!q) return;
  let t, seq = 0;
  const close = () => { box.hidden = true; };
  q.addEventListener('input', () => {
    clearTimeout(t);
    const v = q.value.trim();
    if (!v) return close();
    t = setTimeout(async () => {
      const my = ++seq;
      let r; try { r = await api('/admin/search?q=' + encodeURIComponent(v)); } catch { return; }
      if (my !== seq) return;
      const sec = (title, items) => items.length ? `<div class="adm-sr-title">${title}</div>${items.join('')}` : '';
      const html = sec('회원', r.users.map(u => `<a href="#/admin/users/${u.id}"><b>${esc(u.nickname)}</b><small>${esc(u.name)} · ${esc(u.email)} · ${u.level}${u.status !== 'active' ? ' · ' + ({ dormant: '휴면', removed: '제명' }[u.status] || u.status) : ''}</small></a>`))
        + sec('챌린지', r.challenges.map(c => `<a href="#/admin/groups/${c.id}"><b>${esc(c.title)}</b><small>${{ solo: '솔로', group: '그룹', official: '오피셜' }[c.type] || c.type} · ${esc(stageName(c.stage))}</small></a>`))
        + sec('가입 신청', r.applications.map(a => `<a href="#/admin/applications?status=${a.status}&q=${encodeURIComponent(a.email)}"><b>${esc(a.name)}</b><small>${esc(a.email)} · ${{ pending: '대기', approved: '승인', joined: '가입 완료', rejected: '반려' }[a.status] || a.status}</small></a>`));
      box.innerHTML = html || '<div class="adm-sr-empty">찾는 결과가 없습니다</div>';
      box.hidden = false;
    }, 220);
  });
  q.addEventListener('keydown', e => { if (e.key === 'Escape') { q.value = ''; close(); } if (e.key === 'Enter') { const a = box.querySelector('a'); if (a) { e.preventDefault(); location.hash = a.getAttribute('href'); } } });
  document.addEventListener('click', e => { if (!root.contains(e.target) || !e.target.closest('.adm-search')) close(); }, { capture: true });
}

export const STAGE_NAMES = { proposed: '보완 중', review: '심사 중', recruiting: '모집 중', agreement: '합의 중', active: '진행 중', settling: '정산 중', closed: '종료', rejected: '반려', stopped: '중단' };
export const stageName = s => STAGE_NAMES[s] || s;

// 상태 표시 — 색만으로 구분하지 않도록 기호와 글자를 같이 쓴다
export function health(h) {
  return { good: '<span class="hl hl-good">● 순조</span>', warn: '<span class="hl hl-warn">▲ 주의</span>', bad: '<span class="hl hl-bad">■ 위험</span>' }[h] || '<span class="hl hl-na">–</span>';
}
export function waitChip(days, limit) {
  if (days == null) return '';
  if (days >= limit) return `<span class="chip red">${days}일째 · 기한 지남</span>`;
  if (days >= limit - 1) return `<span class="chip amber">${days}일째</span>`;
  return `<span class="chip">${days ? days + '일째' : '오늘'}</span>`;
}

// 세로 막대 (주간 추이 등). 한 가지 색, 마지막 값만 숫자로 표시하고 나머지는 마우스를 올리면 보인다.
export function columns(values, labels, { unit = '', height = 96 } = {}) {
  const max = Math.max(1, ...values);
  const last = values.length - 1;
  return `<div class="cols" style="--h:${height}px" role="img" aria-label="${esc(labels.map((l, i) => `${l} ${values[i]}${unit}`).join(', '))}">
    ${values.map((v, i) => `<div class="col" data-tip="${esc(labels[i])} · ${num(v)}${unit}"><div class="col-bar${i === last ? ' now' : ''}" style="height:${v ? Math.max(3, Math.round(v / max * 100)) : 0}%"></div>${i === last ? `<span class="col-val">${num(v)}</span>` : ''}</div>`).join('')}
  </div><div class="cols-x"><span>${esc(labels[0])}</span><span>${esc(labels[last])}</span></div>`;
}
// 가로 막대 (퍼널·분포)
export function hbars(rows, { unit = '명', showPct = false } = {}) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  const first = rows[0]?.[1] || 0;
  return `<div class="hbars">${rows.map(([label, v, hint]) => `<div class="hbar" data-tip="${esc(label)} · ${num(v)}${unit}"><div class="hbar-label">${esc(label)}${hint ? ` <small class="muted">${esc(hint)}</small>` : ''}</div><div class="hbar-track"><div class="hbar-fill" style="width:${v ? Math.max(1.5, v / max * 100) : 0}%"></div></div><div class="hbar-val">${num(v)}${showPct && first ? `<small> · ${Math.round(v / first * 100)}%</small>` : ''}</div></div>`).join('')}</div>`;
}
export function kpi(label, value, sub = '', { accent = false, href = '' } = {}) {
  const tag = href ? 'a' : 'div';
  return `<${tag} class="kpi${accent ? ' accent' : ''}" ${href ? `href="${href}"` : ''}><div class="kpi-label">${esc(label)}</div><div class="kpi-num">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</${tag}>`;
}
export function kv(pairs) { return `<dl class="kv">${pairs.filter(Boolean).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v ?? '-'}</dd></div>`).join('')}</dl>`; }
export function pager(page, per, total, makeHref) {
  const pages = Math.max(1, Math.ceil(total / per)); if (pages <= 1) return '';
  return `<div class="pager">${page > 1 ? `<a class="btn sm" href="${makeHref(page - 1)}">이전</a>` : ''}<span class="muted small">${page} / ${pages} 쪽 · 전체 ${num(total)}</span>${page < pages ? `<a class="btn sm" href="${makeHref(page + 1)}">다음</a>` : ''}</div>`;
}
export function qs(obj) { const p = new URLSearchParams(); for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== '') p.set(k, v); const s = p.toString(); return s ? '?' + s : ''; }

// 사유를 받아서 실행 (되돌리기 어려운 처리에 쓴다)
export function askReason(title, { label = '사유', hint = '', button = '확인', danger = false, placeholder = '' } = {}) {
  return new Promise(resolve => {
    modal(`<h3>${title}</h3><form class="form" data-form="rs">${hint ? `<p class="small muted" style="margin:0">${hint}</p>` : ''}${field(label, textarea('reason', { rows: 3, required: true, placeholder }))}<div class="btn-row"><button class="btn ${danger ? 'danger' : 'primary'}" type="submit">${button}</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`,
      { onMount(m) { bindForms(m, { rs(d) { closeModal(); resolve(d.reason); } }); m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => resolve(null))); } });
  });
}

// 내부 메모 (회원·챌린지·신청서) — 회원에게는 보이지 않는다
export function notesBox(refType, refId, notes, meId, isOwner) {
  return `<div class="card adm-notes" data-ref-type="${refType}" data-ref-id="${refId}"><div class="card-head"><h3>내부 메모 <small class="muted">· 운영진만 봅니다</small></h3></div>
    <form class="form" data-form="note" style="gap:8px">${textarea('body', { rows: 2, placeholder: '통화 내용, 확인한 증빙, 다음에 볼 것 등' })}<div><button class="btn sm primary" type="submit">메모 남기기</button></div></form>
    <div class="list" style="margin-top:6px">${notes.length ? notes.map(n => `<div class="list-item"><div class="grow"><div class="small">${nl2br(n.body)}</div><div class="meta">${esc(n.author || '-')} · ${fmtDate(n.created_at, true)}</div></div>${n.author_id === meId || isOwner ? `<button class="btn sm ghost" data-act="note-del" data-id="${n.id}" data-confirm="메모를 지울까요?">지우기</button>` : ''}</div>`).join('') : '<p class="muted small" style="margin:6px 0 0">아직 메모가 없습니다.</p>'}</div></div>`;
}
export function mountNotes(root) {
  const box = root.querySelector('.adm-notes'); if (!box) return;
  bindForms(box, { async note(d) { if (!d.body.trim()) throw new Error('메모 내용을 적어 주세요'); await post('/admin/notes', { ref_type: box.dataset.refType, ref_id: Number(box.dataset.refId), body: d.body }); toast('메모를 남겼습니다'); reload(); } });
  bindActions(box, { async 'note-del'(el) { await api('/admin/notes/' + el.dataset.id, { method: 'DELETE' }); reload(); } });
}

// 감사 로그 행동 이름
export const ACTION_LABELS = {
  setup: '초기 설정', 'application.approve': '가입 승인', 'application.reject': '가입 반려',
  'challenge.review': '챌린지 심사', 'challenge.stage': '챌린지 단계 변경', 'challenge.leader': '그룹장 교체', 'challenge.complete': '완주 처리',
  'agreement.approve': '합의서 승인', 'agreement.return': '합의서 보완 요청', 'paper.approve': '페이퍼 승인', 'paper.return': '페이퍼 보완 요청',
  'settlement.review': '정산 검수', 'payout.paid': '지급 처리', 'payout.bulk.paid': '일괄 지급 처리', 'payout.bulk.held': '지급 보류', 'payout.bulk.pending': '지급 대기로 되돌림',
  'promotion.approve': '승급 승인', 'promotion.hold': '승급 보류', 'promotion.reject': '승급 반려',
  'dispute.update': '이의 처리', 'user.update': '회원 정보 변경', 'staff.grant': '운영진 지정', 'staff.revoke': '운영진 해제', 'staff.make_owner': '운영자 지정', 'staff.remove_owner': '운영자 해제',
  'settings.update': '규칙 변경', 'settings.reset': '규칙 기본값 복원', 'round.create': '라운드 생성', 'round.update': '라운드 수정',
  'event.create': '일정 생성', 'event.update': '일정 수정', 'event.cancel': '일정 취소', 'event.attend.mark': '출석 처리', 'event.attend.unmark': '출석 취소',
  'broadcast.send': '단체 알림 발송', 'post.hide': '게시물 숨김', 'post.update': '게시물 처리', 'comment.hide': '댓글 숨김', 'comment.show': '댓글 다시 보이기',
  'challenge.create': '챌린지 제안', 'settlement.create': '정산표 작성', 'user.withdraw': '회원 탈퇴', 'payout.held': '지급 보류', 'payout.pending': '지급 대기로 되돌림',
  'member.accept': '그룹원 수락', 'member.reject': '그룹원 거절', 'member.remove': '그룹원 이탈 처리', 'member.role': '그룹원 역할 변경',
  'hq.expense.add': '재원 사용 기록', 'hq.expense.delete': '재원 기록 삭제', export: 'CSV 내려받기', 'backup.download': '전체 백업', 'member.withdraw': '회원 탈퇴',
};
export const actionLabel = a => ACTION_LABELS[a] || a;
export const ACTION_GROUPS = [['', '전체 행동'], ['application', '가입'], ['challenge', '챌린지'], ['agreement', '합의서'], ['settlement', '정산'], ['payout', '지급'], ['paper', '페이퍼'], ['promotion', '승급'], ['user', '회원'], ['member', '그룹원'], ['staff', '운영진'], ['settings', '규칙'], ['event', '일정'], ['broadcast', '알림'], ['post', '게시물'], ['hq', '재원'], ['export', '내려받기'], ['backup', '백업']];
export function targetLink(target) {
  const m = String(target || '').match(/^(users|challenges|applications|events|posts|settlements|papers):(\d+)/);
  if (!m) return esc(target || '');
  const href = { users: `#/admin/users/${m[2]}`, challenges: `#/admin/groups/${m[2]}`, applications: '#/admin/applications', events: `#/admin/events/${m[2]}`, posts: `#/community/posts/${m[2]}`, settlements: `#/settlements/${m[2]}`, papers: '#/admin/papers' }[m[1]];
  const name = { users: '회원', challenges: '챌린지', applications: '신청서', events: '일정', posts: '게시물', settlements: '정산', papers: '페이퍼' }[m[1]];
  return `<a href="${href}">${name} #${m[2]}</a>`;
}
// 감사 로그 상세(JSON)를 읽기 쉬운 한 줄로
const DETAIL_KEYS = { reason: '사유', note: '메모', from: '이전', to: '변경', stage: '단계', status: '상태', level: '등급', role: '역할', badge: '배지', evidence: '증빙', amount: '금액', category: '항목', recipients: '받는 사람', rows: '행 수', tables: '표 수', decision: '결정', total: '합계', bulk: '일괄', action: '동작', title: '제목', type: '유형' };
export function fmtDetail(detail, max = 200) {
  if (!detail) return '';
  let o; try { o = JSON.parse(detail); } catch { return String(detail).slice(0, max); }
  if (!o || typeof o !== 'object') return String(o ?? '').slice(0, max);
  const parts = [];
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (k === 'scores' || k === 'value' || k === 'segment' || k === 'ids') { parts.push(`${DETAIL_KEYS[k] || k}: ${Array.isArray(v) ? v.length + '건' : '…'}`); continue; }
    parts.push(`${DETAIL_KEYS[k] || k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  }
  const t = parts.join(' · ');
  return t.length > max ? t.slice(0, max) + '…' : t;
}
export { ago };
