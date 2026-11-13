// 공개 사이트 동작 점검 (헤드리스 크롬): 가입 신청서 제출, 예전 해시 주소 이동, 로그인 표시 전환
// 사용: node tests/site-flow.js  (서버가 8788에 떠 있어야 함)
import { spawn } from 'node:child_process';
const BASE = 'http://localhost:8788';
const PORT = 9500 + Math.floor(Math.random() * 400);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/machal-flow-${process.pid}`, 'about:blank'], { stdio: 'ignore' });
let list; for (let i = 0; i < 30; i++) { try { list = await (await fetch(`http://localhost:${PORT}/json`)).json(); break; } catch { await new Promise(r => setTimeout(r, 200)); } }
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const wait = ms => new Promise(r => setTimeout(r, ms));
const go = async url => { await send('Page.navigate', { url }); await wait(900); };
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
const fails = []; const ok = (c, m) => { console.log(`${c ? '✔' : '✗'} ${m}`); if (!c) fails.push(m); };

// 1. 가입 신청서
const email = `flow${Date.now()}@test.kr`;
await go(BASE + '/apply/');
await ev(`(() => { const f = document.querySelector('#apply-form'); f.name.value = '흐름테스트'; f.email.value = '${email}'; f.hours_weekday.value = '주중 5시간'; f.querySelector('[name=interests][value="S-02"]').checked = true; f.side_job_check.value = 'yes'; f.consent_privacy.checked = true; return true; })()`);
await ev(`document.querySelector('#apply-form button[type=submit]').click()`);
await wait(700);
ok(await ev(`document.querySelector('.form-msg').textContent.includes('결과 공개')`), '결과 공개 동의 없이 보내면 막는다');
await ev(`(() => { document.querySelector('[name=consent_public]').checked = true; document.querySelector('#apply-form button[type=submit]').click(); })()`);
await wait(1200);
ok(await ev(`!document.querySelector('.apply-done').hidden`), '신청서 제출 후 완료 안내가 보인다');
const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@machal.kr', password: 'adminpass1' }) });
const token = login.headers.getSetCookie().find(c => c.startsWith('machal_session=')).match(/machal_session=([^;]+)/)[1];
const apps = await (await fetch(BASE + '/api/admin/applications?status=pending', { headers: { cookie: 'machal_session=' + token } })).json();
const app = apps.find(a => a.email === email);
ok(app && app.form.interests === 'S-02' && app.form.side_job_check === 'yes', '운영 화면에서 신청서 내용이 그대로 보인다');

// 2. 예전 해시 주소
await go(BASE + '/#/login');
ok((await ev('location.pathname + location.hash')) === '/app/#/login', '/#/login → /app/#/login 로 이동');

// 3. 로그인 상태 표시
await send('Network.setCookie', { name: 'machal_session', value: token, url: BASE, httpOnly: true });
await send('Network.setCookie', { name: 'machal_in', value: '1', url: BASE });
await go(BASE + '/about/');
ok(await ev(`!document.querySelector('.sh-cta .auth-member').hidden && document.querySelector('.sh-cta .auth-guest').hidden`), '로그인하면 머리글이 "내 대시보드"로 바뀐다');
await go(BASE + '/app/');
await wait(800);
ok((await ev('location.hash')) === '#/dashboard', '/app/ 첫 화면은 로그인 상태면 대시보드');

// 4. 홈 숫자, 등급 기준값 반영
await send('Network.clearBrowserCookies');
await go(BASE + '/');
ok(await ev(`!document.querySelector('[data-live=stats]').hidden && /\\d/.test(document.querySelector('[data-stat=members]').textContent)`), '홈의 실제 숫자 섹션이 채워진다(챌린지 기록이 있을 때)');
ok(await ev(`(() => { const r = document.querySelector('[data-live=round]'); return !r.hidden && r.textContent.includes('모집 중'); })()`), '모집 중인 라운드가 있으면 홈에 안내가 뜬다');
await go(BASE + '/rules/');
ok(await ev(`!!document.querySelector('[data-live=hq] table') && document.querySelector('[data-live=hq]').innerText.includes('사례집')`), '수익 배분 규칙 페이지에 운영본부 몫과 쓰임이 공개된다');
await go(BASE + '/levels/');
const lvPts = String((await (await fetch(BASE + '/api/public/levels')).json()).rules.L2.points);
ok((await ev(`document.querySelector('[data-rule="L2.points"]').textContent`)) === lvPts, `등급 페이지가 운영본부 설정값(지금 ${lvPts}점)을 반영한다`);
await go(BASE + '/app/');
await wait(800);
ok((await ev('location.hash')) === '#/login', '/app/ 첫 화면은 비로그인 상태면 로그인');

ws.close(); chrome.kill();
if (fails.length) { console.log(`\n실패 ${fails.length}건`); process.exit(1); }
console.log('\n공개 사이트 동작 점검 통과 ✔');
