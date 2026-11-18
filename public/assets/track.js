// 마이챌린지 이용 통계 — 어떤 페이지를 얼마나 보고 무엇을 누르는지 운영본부 KPI용으로만 모은다.
// 쿠키를 쓰지 않고, 이 브라우저에만 저장되는 무작위 번호로 방문자를 구분한다. IP·브라우저 정보는 서버에 남기지 않는다.
// 브라우저의 '추적 안 함(DNT)'이나 GPC가 켜져 있으면 아무것도 보내지 않는다.
(() => {
  'use strict';
  if (window.machalTrack) return;
  const off = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  const noop = () => {};
  if (off) { window.machalTrack = { view: noop, leave: noop, click: noop, goal: noop }; return; }

  const END = '/api/t';
  const inApp = p => /^\/app(\/|$)/.test(p); // '/apply/'는 회원 공간이 아니다
  const IDLE = 30 * 60 * 1000;
  const rnd = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const ss = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };

  let isNew = 0;
  let vid = ls.get('machal_vid');
  if (!vid) { vid = rnd(); ls.set('machal_vid', vid); isNew = 1; }

  // 30분 넘게 움직임이 없으면 새 방문(세션)으로 센다
  function session() {
    const now = Date.now();
    let sid = ss.get('machal_sid');
    const last = Number(ls.get('machal_last') || 0);
    let fresh = false;
    if (!sid || now - last > IDLE) { sid = rnd(); ss.set('machal_sid', sid); fresh = true; }
    ls.set('machal_last', String(now));
    return { sid, fresh };
  }
  const w = Math.min(window.screen?.width || 0, window.innerWidth || 9999);
  const device = /iPad|Tablet/i.test(navigator.userAgent) || (w >= 600 && w < 1024 && 'ontouchstart' in window) ? 'tablet' : w < 600 || /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';

  const queue = [];
  let timer = null;
  function send(now) {
    if (!queue.length) return;
    const body = JSON.stringify({ e: queue.splice(0, 20) });
    let ok = false;
    try { if (navigator.sendBeacon) ok = navigator.sendBeacon(END, new Blob([body], { type: 'text/plain' })); } catch {}
    if (!ok) { try { fetch(END, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain' } }); } catch {} }
    if (queue.length) send(now);
  }
  function push(ev, now = false) {
    const { sid } = session();
    queue.push({ ...ev, vid, sid, device });
    clearTimeout(timer);
    if (now || queue.length >= 10) send(true); else timer = setTimeout(send, 1500);
  }

  // 화면에 실제로 보인 시간만 센다 (다른 탭에 가 있던 시간은 빼기)
  let cur = null;
  function startClock() { if (cur) { cur.acc = 0; cur.since = document.visibilityState === 'visible' ? Date.now() : 0; } }
  function elapsed() { if (!cur) return 0; return Math.round((cur.acc + (cur.since ? Date.now() - cur.since : 0)) / 1000); }

  function view(path, area = 'site', title = document.title) {
    leave();
    const s = session();
    const ev = { k: 'view', a: area, p: String(path).slice(0, 200), t: String(title || '').slice(0, 120), n: isNew };
    if (s.fresh) {
      ev.f = 1;
      try {
        const r = document.referrer ? new URL(document.referrer) : null;
        if (r && r.host !== location.host) ev.r = r.host + r.pathname.slice(0, 60);
      } catch {}
      const q = new URLSearchParams(location.search);
      const c = q.get('utm_source') || q.get('utm_campaign');
      if (c) ev.c = [q.get('utm_source'), q.get('utm_medium'), q.get('utm_campaign')].filter(Boolean).join(' / ').slice(0, 80);
    }
    isNew = 0;
    cur = { path: ev.p, area, acc: 0, since: 0 };
    startClock();
    push(ev, true); // 페이지 보기는 바로 보낸다 (곧바로 다른 페이지로 가도 빠지지 않게)
  }
  function leave(now = false) {
    if (!cur) return;
    const d = Math.min(elapsed(), 1800);
    if (d >= 1) push({ k: 'leave', a: cur.area, p: cur.path, d }, now); else if (now) send(true);
    cur = null;
  }
  function click(el) {
    if (!cur) return;
    let target = '', label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50);
    if (el.tagName === 'A') {
      try { const u = new URL(el.href, location.href); target = u.host === location.host ? u.pathname + (u.hash && inApp(u.pathname) ? u.hash : '') : 'out:' + u.host; } catch { target = el.getAttribute('href') || ''; }
    } else if (el.tagName === 'SUMMARY') {
      const det = el.closest('details');
      if (det && det.classList.contains('mnav')) target = 'menu';
      else if (det && det.classList.contains('faq-item')) { if (det.open) return; target = 'faq'; }
      else target = 'toggle';
    } else target = 'button';
    const zone = el.closest('.sh, header') ? 'header' : el.closest('footer') ? 'footer' : el.closest('.hero, .page-hero') ? 'hero' : el.closest('.cta') ? 'cta' : el.closest('nav') ? 'nav' : 'body';
    push({ k: 'click', a: cur.area, p: cur.path, g: target.slice(0, 160), l: label, z: zone });
    return target;
  }

  document.addEventListener('visibilitychange', () => {
    if (!cur) return;
    if (document.visibilityState === 'hidden') {
      if (cur.since) { cur.acc += Date.now() - cur.since; cur.since = 0; }
      const d = Math.min(Math.round(cur.acc / 1000), 1800);
      if (d >= 1) push({ k: 'leave', a: cur.area, p: cur.path, d }, true); else send(true);
      cur.acc = 0;
    }
    else { cur.since = Date.now(); session(); }
  });
  window.addEventListener('pagehide', () => { leave(true); send(true); });

  // 목표 달성(가입 신청서 제출 등)
  function goal(name, label = '') { if (cur) push({ k: 'click', a: cur.area, p: cur.path, g: 'goal:' + name, l: label, z: 'goal' }, true); }

  window.machalTrack = { view, leave, click, goal };

  // 공개 사이트: 페이지를 열면 자동으로 기록하고, 링크·버튼·질문 펼치기를 기록한다
  if (!inApp(location.pathname)) {
    const area = location.pathname.startsWith('/papers') ? 'paper' : 'site';
    const go = () => view(location.pathname.replace(/\/index\.html$/, '/'), area);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
    document.addEventListener('click', e => {
      const el = e.target.closest('a[href], button, summary');
      if (!el || (el.closest('form') && !el.matches('button[type="submit"]'))) return;
      const target = click(el);
      // 같은 창에서 다른 페이지로 넘어가는 링크면, 페이지가 닫히기 전에 머문 시간까지 지금 보낸다
      const leaving = el.tagName === 'A' && target && target.startsWith('/') && el.target !== '_blank' && !el.hasAttribute('download')
        && !(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button > 0) && !(el.hash && el.pathname === location.pathname);
      if (leaving) leave(true); else if (target && target.startsWith('out:') && el.target !== '_blank') send(true);
    }, { capture: true });
  }
})();
