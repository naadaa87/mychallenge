// 헤드리스 크롬으로 주요 화면을 열어 JS 오류를 잡고 스크린샷을 남긴다 (CDP 직접 사용, 의존성 없음)
// 사용: node tests/screenshots.js [--mobile] [--site-only]  (서버가 8788에 떠 있어야 함)
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'http://localhost:8788';
const OUT = process.env.SHOT_DIR || 'tests/.tmp/shots';
mkdirSync(OUT, { recursive: true });
const mobile = process.argv.includes('--mobile');
const W = mobile ? 390 : 1280, H = mobile ? 844 : 900;
const PORT = 9300 + Math.floor(Math.random() * 500);

const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/machal-chrome-${process.pid}`, `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const list = await (await fetch(`http://localhost:${PORT}/json`)).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const events = [];
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method) events.push(m); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, m => { if (m.error) console.log('CDP error', method, JSON.stringify(m.error)); res(m); }); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
const evalJs = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile });

async function login(email, password) {
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const token = r.headers.get('set-cookie').match(/machal_session=([^;]+)/)[1];
  await send('Network.setCookie', { name: 'machal_session', value: token, url: BASE, httpOnly: true });
}
async function logout() { await send('Network.clearBrowserCookies'); }
const errors = [];
async function shot(target, name, { full = false } = {}) {
  const hash = target;
  await send('Page.navigate', { url: 'about:blank' }); await new Promise(r => setTimeout(r, 150));
  events.length = 0;
  await send('Page.navigate', { url: BASE + (target.startsWith('/') ? target : '/app/' + target) });
  await new Promise(r => setTimeout(r, 1200));
  // 로딩이 끝날 때까지 잠깐 더
  for (let i = 0; i < 15; i++) { if (!(await evalJs('!!document.querySelector("#app .spinner")'))) break; await new Promise(r => setTimeout(r, 300)); }
  await new Promise(r => setTimeout(r, 300));
  const errs = events.filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'));
  for (const e of errs) { const txt = e.method === 'Runtime.exceptionThrown' ? e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text : e.method === 'Log.entryAdded' ? e.params.entry.text : e.params.args.map(a => a.value || a.description).join(' '); if (!/favicon|pretendard|cdn\.jsdelivr|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED/i.test(txt) && !(name.endsWith('404') && /status of 404/.test(txt))) errors.push(`${hash}: ${txt}`); }
  const text = (await evalJs('(document.querySelector("#app") || document.querySelector("main"))?.innerText || ""')).replace(/\s+/g, ' ');
  let clip; if (full) { const h = Math.min(Number(await evalJs('document.documentElement.scrollHeight')) || H, 6000); clip = { x: 0, y: 0, width: W, height: h, scale: 1 }; await send('Emulation.setDeviceMetricsOverride', { width: W, height: h, deviceScaleFactor: 1, mobile }); await new Promise(r => setTimeout(r, 200)); }
  let { result: img } = await send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: !!full });
  if (!img) ({ result: img } = await send('Page.captureScreenshot', { format: 'png' }));
  if (full) await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile });
  writeFileSync(`${OUT}/${name}${mobile ? '-m' : ''}.png`, Buffer.from(img.data, 'base64'));
  console.log(`${name.padEnd(22)} ${hash.padEnd(28)} ${text.slice(0, 90)}`);
}

// 공개 사이트
await shot('/', 'site-home', { full: true });
await shot('/about/', 'site-about', { full: true });
await shot('/how-it-works/', 'site-how', { full: true });
await shot('/rules/', 'site-rules', { full: true });
await shot('/levels/', 'site-levels', { full: true });
await shot('/programs/', 'site-programs', { full: true });
await shot('/faq/', 'site-faq');
await shot('/apply/', 'site-apply', { full: true });
await shot('/guide/', 'site-guide', { full: true });
await shot('/guide/side-income-tax/', 'site-article', { full: true });
await shot('/papers/', 'site-papers');
await shot('/papers/1/', 'site-paper');
await shot('/privacy/', 'site-privacy');
await shot('/nope/', 'site-404');
if (process.argv.includes('--site-only')) { ws.close(); chrome.kill(); if (errors.length) { console.log('\nJS 오류:'); errors.forEach(e => console.log(' -', e)); process.exit(1); } console.log('\n프런트 오류 없음 ✔'); process.exit(0); }
// 회원 공간
await shot('#/levels', 'app-levels-redirect');
await shot('#/login', 'login');
await shot('#/register', 'register');
await login('admin@machal.kr', 'adminpass1');
await shot('#/admin', 'admin-home');
await shot('#/admin/settings', 'admin-settings');
await shot('#/admin/users', 'admin-users');
await logout();
await login('a@test.kr', 'password1');
await shot('#/dashboard', 'dashboard');
await shot('#/challenges', 'challenges');
await shot('#/challenges/1', 'challenge-detail');
await shot('#/groups/1', 'group-home');
await shot('#/groups/1/checkin', 'group-checkin');
await shot('#/groups/1/ledger', 'group-ledger');
await shot('#/groups/1/agreement', 'group-agreement', { full: true });
await shot('#/groups/1/settlement', 'group-settlement');
await shot('#/settlements/1', 'settlement', { full: true });
await shot('#/groups/1/paper', 'group-paper');
await shot('#/papers/1', 'paper');
await shot('#/community', 'community');
await shot('#/events', 'events');
await shot('#/me', 'me');
await logout();
await login('e@test.kr', 'password1');
await shot('#/papers/1', 'paper-summary-L2');
await shot('#/challenges/new', 'propose-solo');
ws.close(); chrome.kill();
if (errors.length) { console.log('\nJS 오류:'); errors.forEach(e => console.log(' -', e)); process.exit(1); }
console.log('\n프런트 오류 없음 ✔');
