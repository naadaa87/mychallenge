// 공통 유틸 — API, 템플릿, 포맷, 토스트, 모달, 폼
export const state = { me: undefined, settings: null, refreshMe: null };

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const nl2br = s => esc(s).replace(/\n/g, '<br>');

export async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch('/api' + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  let d = {}; try { d = await r.json(); } catch {}
  if (!r.ok) { const e = new Error(d.error || `요청 실패 (${r.status})`); e.status = r.status; e.data = d; throw e; }
  return d;
}
export const post = (path, body) => api(path, { method: 'POST', body: body || {} });
export const put = (path, body) => api(path, { method: 'PUT', body: body || {} });

export async function getSettings() { if (!state.settings) state.settings = await api('/public/levels'); return state.settings; }

// ---------- 포맷 ----------
export const won = n => (n == null || isNaN(n)) ? '-' : Math.round(n).toLocaleString('ko-KR') + '원';
export const num = n => (n == null || isNaN(n)) ? '-' : Number(n).toLocaleString('ko-KR');
export const pct = r => (r == null) ? '-' : Math.round(r * 1000) / 10 + '%';
export function fmtDate(s, withTime = false) {
  if (!s) return '-';
  const d = new Date(String(s).includes('T') || String(s).includes(' ') ? s.replace(' ', 'T') + (s.endsWith('Z') || s.includes('+') ? '' : 'Z') : s + 'T00:00:00');
  if (isNaN(d)) return s;
  const y = d.getFullYear(), m = d.getMonth() + 1, dd = d.getDate();
  const base = `${y}.${String(m).padStart(2, '0')}.${String(dd).padStart(2, '0')}`;
  if (!withTime) return base;
  return `${base} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function fmtLocal(s) {
  // 사용자가 입력한 현지 시각(타임존 변환 없음) — 일정에 사용
  if (!s) return '-';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return fmtDate(s, true);
  return `${m[1]}.${m[2]}.${m[3]} ${m[4]}:${m[5]}`;
}
export function ago(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z'));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return '방금'; if (diff < 3600) return Math.floor(diff / 60) + '분 전'; if (diff < 86400) return Math.floor(diff / 3600) + '시간 전'; if (diff < 86400 * 7) return Math.floor(diff / 86400) + '일 전';
  return fmtDate(s);
}

export const LEVEL_NAMES = { L0: '게스트', L1: '챌린저', L2: '메이커', L3: '어치버', L4: '리더', L5: '마스터' };
export const LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];
export const STAGE = { recruiting: ['모집 중', 'green'], active: ['진행 중', 'blue'], closed: ['종료', ''], stopped: ['중단', 'red'] };
export const TYPE = { study: '학습그룹', challenge: '도전그룹' };
export const FIELDS = { 'S-01': '콘텐츠·미디어', 'S-02': '디지털 상품', 'S-03': '커머스', 'S-04': '서비스·프리랜싱', 'S-05': '공간·오프라인', 'S-06': '웹·앱·자동화' };
export const ROLES = { leader: '그룹리더', sub: '부리더', member: '그룹원' };
export const BOARDS = { notice: '공지', share: '정보·자료', idea: '아이디어', trend: '시장·트렌드·AI', question: '질문', group: '그룹 소식', review: '후기' };
export const EVENT_TYPES = { regular: '정기모임', showcase: '성과발표회', seminar: '세미나·특강', workshop: '워크숍', office_hour: '오피스아워', networking: '네트워킹' };
export const EVENT_TOPICS = { idea: '사업 아이디어', market: '시장 분석', trend: '트렌드', ai: 'AI 활용', sideproject: '사이드프로젝트 사례', group: '그룹 진행 공유' };
export const BADGES = { first_sale: '첫 매출', repeat_sale: '반복 매출', completion: '그룹 완주', leader_completion: '그룹리더 완주', contributor: '페이퍼 기고', founder: '창립 멤버', mentor: '강사·멘토' };
export const GOAL_METRICS = { revenue: ['매출', '원'], customers: ['유료 고객', '명'], sales: ['판매', '건'], users: ['사용자·구독자', '명'], content: ['발행한 콘텐츠', '개'], study: ['학습 과제', '개'], custom: ['직접 정한 지표', ''] };
export const LOG_KINDS = { progress: '진행 기록', study: '학습 노트', resource: '자료 공유', retro: '회고', notice: '공지' };
export const ATTEND = { present: ['출석', 'green'], late: ['지각', 'amber'], absent: ['결석', 'red'], excused: ['공결', 'blue'] };
export const attendChip = s => s ? `<span class="chip ${ATTEND[s]?.[1] || ''}">${ATTEND[s]?.[0] || s}</span>` : '<span class="chip">미확인</span>';
export const metricVal = (metric, v, unit) => { const u = unit ?? GOAL_METRICS[metric]?.[1] ?? ''; return u === '원' ? won(v) : num(v) + u; };

export const lvChip = l => `<span class="chip lv-${l}" style="background:transparent;border-color:currentColor">${esc(LEVEL_NAMES[l] || l)}</span>`;
export const stageChip = s => { const [n, c] = STAGE[s] || [s, '']; return `<span class="chip ${c}">${n}</span>`; };
export const typeChip = t => `<span class="chip ${t === 'study' ? 'purple' : 'ink'}">${TYPE[t] || t}</span>`;
export const fieldChip = f => `<span class="chip">${esc(FIELDS[f] || f)}</span>`;

export function empty(title, sub = '', action = '') { return `<div class="empty"><strong>${esc(title)}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}${action ? `<div style="margin-top:12px">${action}</div>` : ''}</div>`; }
export function stat(label, value, accent = false) { return `<div class="stat ${accent ? 'accent' : ''}"><div class="num">${value}</div><div class="label">${esc(label)}</div></div>`; }
export function pageHead(title, sub = '', right = '') { return `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right ? `<div class="btn-row">${right}</div>` : ''}</div>`; }
export function tabs(items, active) { return `<div class="tabs">${items.map(([k, label, href]) => `<a href="${href}" class="${k === active ? 'active' : ''}">${label}</a>`).join('')}</div>`; }
export function progressBar(cur, goal) { const p = goal ? Math.min(100, Math.round(cur / goal * 100)) : 0; return `<div class="progress"><span style="width:${p}%"></span></div>`; }

// ---------- 폼 ----------
export function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') { if (el.name.endsWith('[]')) { const k = el.name.slice(0, -2); o[k] = o[k] || []; if (el.checked) o[k].push(el.value); } else o[el.name] = el.checked; }
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; else if (!(el.name in o)) o[el.name] = o[el.name]; }
    else if (el.name.endsWith('[]')) { const k = el.name.slice(0, -2); o[k] = o[k] || []; if (el.value.trim() !== '') o[k].push(el.value.trim()); }
    else if (el.type === 'number') o[el.name] = el.value === '' ? null : Number(el.value);
    else o[el.name] = el.value;
  }
  return o;
}
export function field(label, inputHtml, hint = '') { return `<div class="field"><label>${label}</label>${inputHtml}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`; }
export function input(name, { type = 'text', value = '', placeholder = '', required = false, min, max, step } = {}) {
  return `<input type="${type}" name="${name}" value="${esc(value ?? '')}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''} ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''} ${step != null ? `step="${step}"` : ''}>`;
}
export function textarea(name, { value = '', placeholder = '', required = false, rows = 4 } = {}) { return `<textarea name="${name}" rows="${rows}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''}>${esc(value ?? '')}</textarea>`; }
export function select(name, options, value) { return `<select name="${name}">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`; }
export function check(name, label, checked = false, value = 'on') { return `<label class="check"><input type="checkbox" name="${name}" value="${esc(value)}" ${checked ? 'checked' : ''}><span>${label}</span></label>`; }

// 폼 제출 바인딩: data-form 속성 → 핸들러
export function bindForms(root, handlers) {
  root.querySelectorAll('form[data-form]').forEach(f => {
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const name = f.dataset.form; const h = handlers[name]; if (!h) return;
      const btn = f.querySelector('button[type=submit]'); const old = btn?.textContent;
      if (btn) { btn.disabled = true; btn.textContent = '처리 중…'; }
      try { await h(formData(f), f, ev.submitter); } catch (e) { toast(e.message || '오류가 났습니다', true); const err = f.querySelector('.form-error'); if (err) err.textContent = e.message; }
      finally { if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = old; } }
    });
  });
}
// 클릭 바인딩: data-act 속성 → 핸들러(el)
export function bindActions(root, handlers) {
  root.addEventListener('click', async ev => {
    const el = ev.target.closest('[data-act]'); if (!el || !root.contains(el)) return;
    const h = handlers[el.dataset.act]; if (!h) return;
    ev.preventDefault();
    if (el.dataset.confirm && !confirm(el.dataset.confirm)) return;
    el.disabled = true;
    try { await h(el); } catch (e) { toast(e.message || '오류가 났습니다', true); }
    finally { if (document.body.contains(el)) el.disabled = false; }
  });
}

// ---------- 토스트 · 모달 ----------
let toastTimer;
export function toast(msg, isErr = false) {
  const t = document.getElementById('toast'); t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), isErr ? 4200 : 2600);
}
export function modal(html, { onMount } = {}) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-bg" data-close><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  root.querySelector('.modal-bg').addEventListener('click', ev => { if (ev.target.dataset.close !== undefined) closeModal(); });
  root.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', closeModal));
  if (onMount) onMount(root.querySelector('.modal'));
  return root.querySelector('.modal');
}
export function closeModal() { document.getElementById('modal-root').innerHTML = ''; }
export function go(hash) { location.hash = hash; }
export function reload() { window.dispatchEvent(new HashChangeEvent('hashchange')); }

export function navActive() {
  const h = location.hash || '#/';
  document.querySelectorAll('#topnav a, #bottomnav a').forEach(a => {
    const href = a.getAttribute('href');
    a.classList.toggle('active', href === '#/' ? h === '#/' : h.startsWith(href));
  });
}
