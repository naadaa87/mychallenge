// 마이챌린지 운영본부 — https://mychallenge.kr/admin
// 운영진·총괄관리자 전용 콘솔. 화면(views/admin/*)은 회원 공간과 같은 모듈을 쓰고, 주소는 /admin/#/메뉴 형태다.
import { state, api, post, esc, toast, closeModal, bindForms, field, input } from '/app/core.js';
import { home, section } from '/app/views/admin/index.js';
import { labelOf } from '/app/views/admin/shared.js';

const root = document.getElementById('app');
const right = document.getElementById('topbar-right');

async function loadMe() {
  try { state.me = (await api('/session')).user; } catch { state.me = null; }
  return state.me;
}
state.refreshMe = async () => { await loadMe(); renderTop(); };

function renderTop() {
  const me = state.me;
  if (!me || me.role !== 'staff') { right.innerHTML = '<a class="btn sm ghost" href="/">홈페이지</a>'; return; }
  right.innerHTML = `<a class="btn sm ghost adm-top-link" href="/app/#/dashboard">회원 화면</a><a class="btn sm ghost adm-top-link" href="/" target="_blank" rel="noopener">홈페이지</a>
    <span class="adm-me"><b>${esc(me.nickname)}</b></span><button class="btn sm" type="button" id="adm-logout">로그아웃</button>`;
  right.querySelector('#adm-logout').addEventListener('click', async () => {
    try { await post('/auth/logout'); } catch {}
    state.me = null; location.hash = '#/'; route();
  });
}

function loginView(note = '') {
  document.title = '운영본부 로그인 · 마이챌린지(마챌)';
  root.innerHTML = `<div class="adm-login">
    <div class="card adm-login-card">
      <div class="eyebrow">MY CHALLENGE · 운영본부</div>
      <h1>운영본부 로그인</h1>
      <p class="muted small">운영진과 총괄관리자 계정으로 들어옵니다. 회원 공간과 같은 계정입니다.</p>
      ${note ? `<div class="notice warn small" style="margin-bottom:12px">${note}</div>` : ''}
      <form class="form" data-form="login">
        ${field('이메일', input('email', { type: 'email', required: true, placeholder: 'you@example.com' }))}
        ${field('비밀번호', input('password', { type: 'password', required: true }))}
        <div class="form-error error"></div>
        <button class="btn primary lg block" type="submit">로그인</button>
      </form>
      <p class="small muted" style="margin:14px 0 0">비밀번호를 잊었으면 총괄관리자에게 임시 비밀번호를 받아 주세요. 같은 이메일로 15분 안에 10번 틀리면 잠시 로그인이 막힙니다.</p>
    </div>
    <p class="small muted adm-login-foot"><a href="/">마이챌린지 홈</a> · <a href="/app/#/login">회원 공간 로그인</a></p>
  </div>`;
  const form = root.querySelector('form');
  form.email.focus();
  bindForms(root, { async login(v) {
    await post('/auth/login', { email: v.email, password: v.password });
    await loadMe(); renderTop(); route();
  } });
}

function notStaffView() {
  document.title = '운영본부 · 마이챌린지(마챌)';
  root.innerHTML = `<div class="adm-login"><div class="card adm-login-card">
    <h1>운영진 계정이 아닙니다</h1>
    <p class="small">${esc(state.me.nickname)}님은 회원 계정으로 로그인되어 있습니다. 운영본부는 총괄관리자가 운영진으로 지정한 계정만 쓸 수 있습니다.</p>
    <div class="btn-row"><a class="btn primary" href="/app/#/dashboard">회원 공간으로</a><button class="btn" type="button" id="adm-switch">다른 계정으로 로그인</button></div>
  </div></div>`;
  root.querySelector('#adm-switch').addEventListener('click', async () => { try { await post('/auth/logout'); } catch {} state.me = null; renderTop(); route(); });
}

function parse() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { parts: path.split('/').filter(Boolean), query: Object.fromEntries(new URLSearchParams(qs || '')), path };
}

let seq = 0;
async function route() {
  closeModal();
  // 회원 공간 시절 주소(#/admin/…)와 서버가 만든 링크는 /admin/#/… 로 맞춘다
  if (/^#\/admin(\/|\?|$)/.test(location.hash)) { location.replace(location.hash.replace(/^#\/admin\/?/, '#/')); return; }
  const my = ++seq;
  if (state.me === undefined) {
    await loadMe(); renderTop();
    if (!state.me) { try { const s = await api('/public/status'); if (s.setup_needed) { root.innerHTML = `<div class="adm-login"><div class="card adm-login-card"><h1>처음 설정이 필요합니다</h1><p class="small">아직 계정이 하나도 없습니다. 첫 총괄관리자 계정을 만들어 주세요.</p><a class="btn primary" href="/app/#/setup">총괄관리자 계정 만들기</a></div></div>`; return; } } catch {} }
  }
  const me = state.me;
  if (!me) return loginView();
  if (me.role !== 'staff') return notStaffView();
  const { parts, query, path } = parse();
  if (parts[0] === 'login') { location.replace('#/'); return; }
  root.innerHTML = '<div class="loading"><div class="spinner"></div>불러오는 중</div>';
  try {
    const ctx = { params: { section: parts[0], id: parts[1] }, query, me, path };
    const out = parts.length ? await section(ctx) : await home(ctx);
    if (my !== seq || !out) return;
    const view = document.createElement('div');
    view.className = 'view';
    view.innerHTML = typeof out === 'string' ? out : out.html;
    root.replaceChildren(view);
    if (typeof out !== 'string' && out.mount) await out.mount(view);
    document.title = `${parts.length ? labelOf(parts[0]) : '현황'} · 마챌 운영본부`;
    window.scrollTo({ top: 0 });
  } catch (e) {
    if (my !== seq) return;
    console.error(e);
    if (e.status === 401) { state.me = null; renderTop(); return loginView('로그인이 끝났습니다. 다시 로그인해 주세요.'); }
    root.innerHTML = `<div class="adm" style="display:block"><div class="notice danger"><b>${e.status === 403 ? '권한이 없는 화면입니다' : '문제가 생겼습니다'}</b><br>${esc(e.message)}</div><p style="margin-top:12px"><a class="btn" href="#/">현황으로</a></p></div>`;
  }
}

window.addEventListener('hashchange', route);
route();
