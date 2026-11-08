// 마이챌린지(마챌) 프런트엔드 — 빌드 없이 동작하는 ES 모듈 SPA
import * as pub from './views/public.js';
import * as member from './views/member.js';
import * as group from './views/group.js';
import * as community from './views/community.js';
import * as admin from './views/admin.js';
import { state, api, esc, toast, navActive, closeModal } from './core.js';

const routes = [
  // 공개
  ['/', pub.landing, 'any'], ['/levels', pub.levels, 'any'], ['/apply', pub.apply, 'any'], ['/apply/done', pub.applyDone, 'any'],
  ['/login', pub.login, 'guest'], ['/register', pub.register, 'guest'], ['/setup', pub.setup, 'any'],
  // 회원
  ['/onboarding', member.onboarding, 'user'], ['/dashboard', member.dashboard, 'user'], ['/me', member.me, 'user'], ['/me/points', member.points, 'user'], ['/me/asset', member.assetDiag, 'user'], ['/notifications', member.notifications, 'user'],
  ['/challenges', group.board, 'user'], ['/challenges/new', group.propose, 'user'], ['/challenges/:id', group.detail, 'user'], ['/challenges/:id/edit', group.editProposal, 'user'],
  ['/groups/:id', group.space, 'user'], ['/groups/:id/:tab', group.space, 'user'],
  ['/settlements/:id', group.settlement, 'user'],
  ['/papers', community.papers, 'any'], ['/papers/:id', community.paper, 'user'],
  ['/community', community.feed, 'user'], ['/community/new', community.newPost, 'user'], ['/community/posts/:id', community.post, 'user'], ['/community/board/:board', community.boardView, 'user'],
  ['/events', community.events, 'user'], ['/members', community.members, 'user'],
  // 운영
  ['/admin', admin.home, 'staff'], ['/admin/:section', admin.section, 'staff'], ['/admin/:section/:id', admin.section, 'staff'],
];

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  return { path: path.replace(/\/+$/, '') || '/', query };
}
function matchRoute(path) {
  const parts = path.split('/').filter(Boolean);
  for (const [pattern, view, auth] of routes) {
    const pp = pattern.split('/').filter(Boolean);
    if (pp.length !== parts.length) continue;
    const params = {}; let ok = true;
    for (let i = 0; i < pp.length; i++) { if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(parts[i]); else if (pp[i] !== parts[i]) { ok = false; break; } }
    if (ok) return { view, auth, params };
  }
  return null;
}

async function loadMe() {
  try { state.me = (await api('/session')).user; } catch (e) { state.me = null; }
  return state.me;
}

function renderChrome() {
  const me = state.me;
  const nav = document.getElementById('topnav'), right = document.getElementById('topbar-right'), bottom = document.getElementById('bottomnav');
  const ic = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4a1 1 0 0 1 1-1h11l-1.5 4L18 11H5"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.4A8 8 0 1 1 21 12z"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  };
  if (!me) {
    nav.innerHTML = `<a href="#/">소개</a><a href="#/levels">등급과 라운드</a><a href="#/papers">프로젝트 페이퍼</a>`;
    right.innerHTML = `<a class="btn sm" href="#/login">로그인</a><a class="btn sm primary" href="#/apply">가입 신청</a>`;
    bottom.innerHTML = '';
  } else {
    nav.innerHTML = `<a href="#/dashboard">홈</a><a href="#/challenges">챌린지</a><a href="#/community">커뮤니티</a><a href="#/papers">페이퍼</a><a href="#/events">일정</a>${me.role === 'staff' ? '<a href="#/admin">운영</a>' : ''}`;
    right.innerHTML = `<a class="bell" href="#/notifications" aria-label="알림">${'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>'}${me.unread ? `<span class="dot">${me.unread > 9 ? '9+' : me.unread}</span>` : ''}</a><a class="avatar" href="#/me" title="${esc(me.nickname)}">${esc((me.nickname || '?').slice(0, 1))}</a>`;
    bottom.innerHTML = `<a href="#/dashboard">${ic.home}홈</a><a href="#/challenges">${ic.flag}챌린지</a><a href="#/community">${ic.chat}커뮤니티</a><a href="#/papers">${ic.book}페이퍼</a><a href="#/me">${ic.user}나</a>`;
  }
  navActive();
}

let renderSeq = 0;
async function route() {
  closeModal();
  const { path, query } = parseHash();
  const m = matchRoute(path);
  const root = document.getElementById('app');
  const seq = ++renderSeq;
  if (!m) { root.innerHTML = `<div class="wrap page"><div class="empty"><strong>페이지를 찾을 수 없습니다</strong><a href="#/">처음으로</a></div></div>`; return; }
  if (state.me === undefined) { root.innerHTML = `<div class="loading"><div class="spinner"></div>불러오는 중</div>`; await loadMe(); renderChrome(); }
  const me = state.me;
  if (m.auth === 'user' && !me) { sessionStorage.setItem('machal_after_login', location.hash); location.hash = '#/login'; return; }
  if (m.auth === 'staff' && (!me || me.role !== 'staff')) { toast('운영진만 들어갈 수 있는 화면입니다', true); location.hash = me ? '#/dashboard' : '#/login'; return; }
  if (m.auth === 'guest' && me) { location.hash = '#/dashboard'; return; }
  if (me && !me.onboarded && path !== '/onboarding' && m.auth !== 'any') { location.hash = '#/onboarding'; return; }
  root.innerHTML = `<div class="loading"><div class="spinner"></div>불러오는 중</div>`;
  try {
    const out = await m.view({ params: m.params, query, me, path });
    if (seq !== renderSeq) return;
    // 화면마다 새 컨테이너에 그린다. 이전 화면의 클릭 처리기가 남아 겹치지 않게 하기 위함
    const view = document.createElement('div');
    view.className = 'view';
    if (typeof out === 'string') view.innerHTML = out;
    else view.innerHTML = out.html;
    root.replaceChildren(view);
    if (typeof out !== 'string' && out.mount) await out.mount(view);
    window.scrollTo({ top: 0 });
    navActive();
  } catch (e) {
    if (seq !== renderSeq) return;
    console.error(e);
    if (e.status === 401) { state.me = null; renderChrome(); sessionStorage.setItem('machal_after_login', location.hash); location.hash = '#/login'; return; }
    root.innerHTML = `<div class="wrap page"><div class="notice danger"><b>${e.status === 403 ? '권한이 없는 화면입니다' : '문제가 생겼습니다'}</b><br>${esc(e.message)}</div><p style="margin-top:12px"><a class="btn" href="#/dashboard">홈으로</a></p></div>`;
  }
}

export async function refreshMe() { await loadMe(); renderChrome(); }
state.refreshMe = refreshMe;

window.addEventListener('hashchange', route);
window.addEventListener('load', async () => {
  // 초기 설정이 안 된 사이트면 /setup 으로
  try { const s = await api('/public/status'); if (s.setup_needed && location.hash !== '#/setup') { location.hash = '#/setup'; } } catch {}
  await loadMe(); renderChrome(); route();
});
