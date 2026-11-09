// 마이챌린지 공개 사이트 스크립트 — 페이지는 이 스크립트 없이도 모두 읽힌다. 여기서는 편의 기능만 더한다.
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // 예전 주소(https://.../#/dashboard)로 들어오면 회원 공간으로 보낸다
  if (location.hash.startsWith('#/') && !location.pathname.startsWith('/app/')) {
    location.replace('/app/' + location.hash);
    return;
  }

  // 로그인 상태면 머리글의 버튼을 '내 대시보드'로 바꾼다 (표시용 쿠키만 확인, API 호출 없음)
  if (/(?:^|;\s*)machal_in=1/.test(document.cookie)) {
    $$('.auth-guest').forEach(el => { el.hidden = true; });
    $$('.auth-member').forEach(el => { el.hidden = false; });
  }

  // 모바일 메뉴: 링크를 누르거나 Esc를 누르면 닫는다
  const mnav = $('.mnav');
  if (mnav) {
    mnav.addEventListener('click', e => { if (e.target.closest('a')) mnav.open = false; });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') mnav.open = false; });
  }

  // 작은 알림
  function toast(msg) {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }
  if (new URLSearchParams(location.search).get('withdrawn') === '1') toast('탈퇴가 처리됐습니다. 그동안 함께해 주셔서 고맙습니다.');

  // 링크 복사
  $$('[data-copy-link]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href.split('#')[0]); toast('링크를 복사했습니다'); }
    catch { toast('주소창의 링크를 복사해 주세요'); }
  }));

  const getJson = async path => { const r = await fetch('/api' + path, { credentials: 'same-origin' }); if (!r.ok) throw new Error(r.status); return r.json(); };
  const num = n => Number(n || 0).toLocaleString('ko-KR');

  // 홈: 실제 숫자 (불러오지 못하면 섹션을 숨긴 채로 둔다)
  const statsSec = $('[data-live="stats"]');
  if (statsSec) {
    getJson('/public/stats').then(s => {
      const c0 = s.closed || {};
      // 진행 중이거나 끝난 챌린지, 공개 페이퍼가 하나라도 생기기 전에는 0만 늘어선 화면을 보여 주지 않는다
      if (!(s.active_challenges || s.papers || c0.with_sales || c0.without_sales || c0.stopped)) return;
      for (const k of ['members', 'active_challenges', 'first_sales', 'papers']) { const el = $(`[data-stat="${k}"]`, statsSec); if (el) el.textContent = num(s[k]); }
      const c = s.closed || {}; const total = (c.with_sales || 0) + (c.without_sales || 0) + (c.stopped || 0);
      const note = $('[data-stat="closed_note"]', statsSec);
      if (note) note.textContent = total ? `끝난 챌린지 ${num(total)}건 중 매출 발생 ${num(c.with_sales)}건 · 매출 없이 종료 ${num(c.without_sales)}건 · 중단 ${num(c.stopped)}건` : '첫 라운드가 끝나면 끝난 챌린지의 결과가 여기에 함께 표시됩니다.';
      statsSec.hidden = false;
    }).catch(() => {});
  }

  // 등급 페이지: 운영본부가 바꾼 기준값 반영
  const lvSec = $('[data-live="levels"]');
  if (lvSec) {
    getJson('/public/levels').then(s => {
      const L2 = s.rules && s.rules.L2;
      if (L2) for (const k of ['points', 'require_event', 'min_days']) { const el = $(`[data-rule="L2.${k}"]`, lvSec); if (el && L2[k] != null) el.textContent = L2[k]; }
      const tb = $('[data-live="points"]', lvSec);
      if (tb && s.points) {
        const rows = Object.values(s.points).sort((a, b) => b.points - a.points);
        tb.innerHTML = rows.map(v => `<tr><td>${String(v.label || '').replace(/[<>&]/g, '')}</td><td class="num">${Number(v.points)}</td><td class="num">${v.daily_cap ? Number(v.daily_cap) + '회' : '없음'}</td></tr>`).join('');
      }
    }).catch(() => {});
  }

  // 프로그램 페이지: 다가오는 일정
  const evSec = $('[data-live="events"]');
  if (evSec) {
    const TYPES = { machal_day: '마챌데이', demo_day: '데모데이', seminar: '세미나', study: '스터디', office_hour: '오피스아워', workshop: '워크숍' };
    const LV = { L0: '게스트', L1: '챌린저', L2: '메이커', L3: '어치버', L4: '리더', L5: '마스터' };
    const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = s => { const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? s : `${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]}) ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    getJson('/public/events').then(list => {
      if (!list.length) return;
      $('.event-list', evSec).innerHTML = list.map(e => `<li><span class="ev-type">${escH(TYPES[e.type] || e.type)}</span><div><b>${escH(e.title)}</b><small>${escH(fmt(e.starts_at))}${e.location ? ' · ' + escH(e.location) : ''} · ${escH(LV[e.min_level] || '')}부터</small></div></li>`).join('');
      evSec.hidden = false;
    }).catch(() => {});
  }

  // 가입 신청서
  const form = $('#apply-form');
  if (form) {
    const msg = $('.form-msg', form);
    const KEY = 'machal_apply_draft';
    // 쓰다 만 내용은 이 브라우저에만 임시 저장한다
    try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d) for (const [k, v] of Object.entries(d)) { const els = form.elements[k]; if (!els) continue; if (els.length && els[0] && els[0].type === 'checkbox') $$(`[name="${k}"]`, form).forEach(c => { c.checked = (v || []).includes(c.value); }); else if (els.type !== 'checkbox') els.value = v; } } catch {}
    const collect = () => {
      const o = {};
      for (const el of form.elements) {
        if (!el.name) continue;
        if (el.type === 'checkbox') { if (el.name === 'interests') { (o.interests = o.interests || []); if (el.checked) o.interests.push(el.value); } else o[el.name] = el.checked; }
        else o[el.name] = el.value.trim();
      }
      return o;
    };
    form.addEventListener('input', () => { try { const d = collect(); delete d.consent_privacy; delete d.consent_public; localStorage.setItem(KEY, JSON.stringify(d)); } catch {} });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      msg.textContent = '';
      const d = collect();
      const bad = (text, name) => { msg.textContent = text; const el = name && form.elements[name]; if (el && el.focus) el.focus(); };
      if (!d.name) return bad('이름을 적어 주세요', 'name');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email || '')) return bad('이메일 형식을 확인해 주세요', 'email');
      if (!d.consent_privacy) return bad('개인정보 수집·이용에 동의해야 신청할 수 있습니다', 'consent_privacy');
      if (!d.consent_public) return bad('결과 공개 원칙에 동의해야 신청할 수 있습니다', 'consent_public');
      d.interests = (d.interests || []).join(',');
      const btn = $('button[type="submit"]', form); btn.disabled = true; const old = btn.textContent; btn.textContent = '보내는 중…';
      try {
        const r = await fetch('/api/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || '신청서를 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
        try { localStorage.removeItem(KEY); } catch {}
        form.hidden = true; $('.apply-steps').hidden = true;
        const done = $('.apply-done'); done.hidden = false; done.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) { bad(err.message); }
      finally { btn.disabled = false; btn.textContent = old; }
    });
  }
})();
