import { fmtLocal, api, post, esc, nl2br, state, toast, go, field, input, textarea, select, check, bindForms, stat, num, fmtDate, LEVEL_NAMES, LEVELS, FIELDS, EVENT_TYPES, pageHead, empty } from '../core.js';

// 회원 공간의 첫 화면: 로그인했으면 대시보드, 아니면 로그인 화면
export async function home({ me }) {
  location.replace(me ? '#/dashboard' : '#/login');
  return `<div class="loading"><div class="spinner"></div>이동 중</div>`;
}

// 예전 해시 주소(#/levels, #/apply)로 들어오면 사이트의 공개 페이지로 보낸다
export function toSite(path) {
  return async () => { location.replace(path); return `<div class="loading"><div class="spinner"></div>이동 중</div>`; };
}

export function paperCard(p) {
  const s = p.summary || {};
  return `<a class="card clickable" href="#/papers/${p.id}"><div class="row" style="margin-bottom:6px"><span class="chip">${esc(p.field_name || '')}</span>${s.has_sales ? '<span class="chip green">매출 발생</span>' : '<span class="chip">매출 없음</span>'}</div><h3>${esc(p.title)}</h3><p class="muted small" style="margin:0">${esc(s.pain || '')}</p>${s.lesson ? `<div class="divider"></div><small>배운 점 · ${esc(s.lesson)}</small>` : ''}</a>`;
}

export async function login() {
  const html = `<div class="wrap auth"><div class="card"><h2>로그인</h2><form class="form" data-form="login">${field('이메일', input('email', { type: 'email', required: true }))}${field('비밀번호', input('password', { type: 'password', required: true }))}<div class="form-error error"></div><button class="btn primary block" type="submit">로그인</button></form><div class="divider"></div><p class="small muted" style="margin:0">아직 계정이 없나요? <a href="#/register">초대 코드로 가입</a> · <a href="/apply/">가입 신청</a></p></div></div>`;
  return { html, mount(root) { bindForms(root, { async login(d) { await post('/auth/login', d); await state.refreshMe(); const after = sessionStorage.getItem('machal_after_login'); sessionStorage.removeItem('machal_after_login'); go(after && after !== '#/login' ? after : '#/dashboard'); } }); } };
}

export async function register() {
  const html = `<div class="wrap auth"><div class="card"><h2>초대 코드로 가입</h2><p class="muted small">운영본부가 보낸 초대 코드와 지원서에 적은 이메일이 필요합니다.</p><form class="form" data-form="reg">
    ${field('초대 코드', input('invite_code', { required: true, placeholder: 'MC-XXXXXX' }))}
    ${field('이메일 (지원서와 동일)', input('email', { type: 'email', required: true }))}
    <div class="form-cols">${field('이름', input('name', { required: true }))}${field('닉네임', input('nickname', { required: true, placeholder: '모임에서 불릴 이름' }))}</div>
    ${field('비밀번호 (8자 이상)', input('password', { type: 'password', required: true }))}
    <div class="consent-box">
      ${check('agree_terms', '<a href="/terms/" target="_blank" rel="noopener">이용약관</a>에 동의합니다 (필수)')}
      ${check('agree_privacy', '<a href="/privacy/" target="_blank" rel="noopener">개인정보 수집·이용</a>에 동의합니다 (필수)')}
    </div>
    <div class="form-error error"></div><button class="btn primary block" type="submit">가입하기</button></form></div></div>`;
  return { html, mount(root) { bindForms(root, { async reg(d) {
    if (!d.agree_terms || !d.agree_privacy) throw new Error('이용약관과 개인정보 수집·이용에 동의해야 가입할 수 있습니다');
    await post('/auth/register', { ...d, agree_terms: true, agree_privacy: true }); await state.refreshMe(); go('#/onboarding');
  } }); } };
}

export async function setup() {
  const st = await api('/public/status');
  if (!st.setup_needed) return `<div class="wrap auth"><div class="card"><h2>이미 설정이 끝났습니다</h2><p class="muted">운영자 계정이 있습니다. <a href="#/login">로그인</a>으로 이동하세요.</p><p class="small muted">공개 홈페이지는 <a href="/">여기</a>에 있습니다.</p></div></div>`;
  const html = `<div class="wrap auth"><div class="card"><h2>마챌 초기 설정</h2><p class="muted small">첫 운영자(마스터 · 운영진) 계정을 만듭니다. 이 화면은 한 번만 열립니다.</p><form class="form" data-form="setup">
    ${field('이름', input('name', { required: true }))}${field('닉네임', input('nickname', { placeholder: '운영본부' }))}${field('이메일', input('email', { type: 'email', required: true }))}${field('비밀번호 (8자 이상)', input('password', { type: 'password', required: true }))}
    <div class="form-error error"></div><button class="btn primary block" type="submit">운영자 계정 만들기</button></form></div></div>`;
  return { html, mount(root) { bindForms(root, { async setup(d) { await post('/setup', d); await state.refreshMe(); toast('운영자 계정이 만들어졌습니다'); go('#/admin'); } }); } };
}
