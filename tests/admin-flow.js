// 운영본부 콘솔 동작 점검 (헤드리스 크롬): 통합 검색, 규칙 변경(사유 입력), 단체 알림, 내부 메모, 권한 차단
// 사용: node tests/admin-flow.js  (서버가 8788에 떠 있어야 함. api.test.js로 채운 DB 기준)
import { spawn } from 'node:child_process';
const BASE = 'http://localhost:8788';
const PORT = 9900 + Math.floor(Math.random() * 90);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/machal-admin-${process.pid}`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
let list; for (let i = 0; i < 30; i++) { try { list = await (await fetch(`http://localhost:${PORT}/json`)).json(); break; } catch { await new Promise(r => setTimeout(r, 200)); } }
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const wait = ms => new Promise(r => setTimeout(r, ms));
const go = async hash => { await send('Page.navigate', { url: BASE + '/app/' + hash }); await wait(1200); };
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
const fails = []; const ok = (c, m) => { console.log(`${c ? '✔' : '✗'} ${m}`); if (!c) fails.push(m); };
async function tokenOf(email, password) {
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return r.headers.getSetCookie().find(c => c.startsWith('machal_session=')).match(/machal_session=([^;]+)/)[1];
}
const admin = await tokenOf('admin@machal.kr', 'adminpass1');
const apiGet = async p => (await fetch(BASE + '/api' + p, { headers: { cookie: 'machal_session=' + admin } })).json();
await send('Network.setCookie', { name: 'machal_session', value: admin, url: BASE, httpOnly: true });

// 1. 통합 검색
await go('#/admin');
ok(await ev(`!!document.querySelector('.adm-side a.active[href="#/admin"]')`), '사이드 메뉴에서 현황이 선택돼 있다');
await ev(`(() => { const q = document.querySelector('#adm-q'); q.value = '메이커'; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await wait(900);
ok(await ev(`!document.querySelector('#adm-q-box').hidden && document.querySelectorAll('#adm-q-box a[href^="#/admin/users/"]').length >= 3`), '검색어를 넣으면 회원 결과가 뜬다');
await ev(`(() => { const q = document.querySelector('#adm-q'); q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
await wait(1200);
ok(/#\/admin\/users\/\d+/.test(await ev('location.hash')), 'Enter를 누르면 첫 결과로 이동한다');

// 2. 규칙 변경 — 사유를 받아 저장
await go('#/admin/settings');
const before = (await apiGet('/admin/settings')).settings.min_settlement;
await ev(`(() => { const f = document.querySelector('form[data-form=money]'); f.min_settlement.value = '${before + 20000}'; f.querySelector('button[type=submit]').click(); })()`);
await wait(500);
ok(await ev(`!!document.querySelector('.modal textarea[name=reason]')`), '저장하면 바꾸는 이유를 묻는다');
await ev(`(() => { const m = document.querySelector('.modal'); m.querySelector('textarea[name=reason]').value = '화면 점검용 변경'; m.querySelector('button[type=submit]').click(); })()`);
await wait(1500);
ok((await apiGet('/admin/settings')).settings.min_settlement === before + 20000, '이유를 적으면 값이 바뀐다');
ok(await ev(`document.body.innerText.includes('화면 점검용 변경')`), '최근 규칙 변경에 이유가 보인다');
await fetch(BASE + '/api/admin/settings/min_settlement', { method: 'DELETE', headers: { cookie: 'machal_session=' + admin } });

// 3. 단체 알림 — 받는 사람 수 미리보기와 발송
await go('#/admin/broadcast');
await wait(400);
ok(/^\d+명$/.test(await ev(`document.querySelector('#rc').textContent`)), '받는 사람 수가 바로 계산된다');
await ev(`(() => { const f = document.querySelector('form[data-form=bc]'); f.type.value = 'level'; f.type.dispatchEvent(new Event('change', { bubbles: true })); })()`);
await wait(500);
ok(await ev(`!document.querySelector('.seg-extra[data-for=level]').hidden && document.querySelector('.seg-extra[data-for=round]').hidden`), '대상을 바꾸면 필요한 칸만 보인다');
await ev(`(() => { window.confirm = () => true; const f = document.querySelector('form[data-form=bc]'); f.title.value = '화면 점검 알림'; f.querySelector('button[type=submit]').click(); })()`);
await wait(1500);
ok((await apiGet('/admin/broadcasts'))[0]?.title === '화면 점검 알림', '보낸 알림이 기록된다');

// 4. 그룹 상세 — 내부 메모
await go('#/admin/groups/1');
await ev(`(() => { const f = document.querySelector('.adm-notes form'); f.body.value = '그룹장과 통화, 다음 주 첫 공개 예정'; f.querySelector('button[type=submit]').click(); })()`);
await wait(1500);
ok(await ev(`document.querySelector('.adm-notes').innerText.includes('다음 주 첫 공개 예정')`), '내부 메모를 남기면 바로 보인다');

// 5. 회원 상세 — 관리 창
await go('#/admin/users/3');
await ev(`document.querySelector('[data-act=manage]').click()`);
await wait(400);
ok(await ev(`!!document.querySelector('.modal select[name=level]') && !document.querySelector('.modal select[name=role]')`), '회원 관리 창이 열리고, 권한 변경은 운영진 화면으로 분리돼 있다');

// 6. 모바일 메뉴
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await go('#/admin/payouts');
ok(await ev(`getComputedStyle(document.querySelector('.adm-side')).display === 'none' && getComputedStyle(document.querySelector('.adm-mnav')).display !== 'none'`), '휴대폰에서는 사이드 메뉴 대신 메뉴 버튼이 보인다');
await ev(`document.querySelector('.adm-mnav summary').click()`);
await wait(200);
ok(await ev(`document.querySelector('.adm-mnav').open && document.querySelectorAll('.adm-mnav-panel a').length === 20`), '메뉴 버튼을 누르면 전체 메뉴가 열린다');
await send('Emulation.clearDeviceMetricsOverride');

// 7. 일반 회원은 들어올 수 없다
await send('Network.clearBrowserCookies');
const member = await tokenOf('e@test.kr', 'password1');
await send('Network.setCookie', { name: 'machal_session', value: member, url: BASE, httpOnly: true });
await send('Page.navigate', { url: 'about:blank' }); await wait(200);
await go('#/admin/settings');
await wait(600); const h7 = await ev('location.hash'); ok(h7 === '#/dashboard' && !(await ev(`!!document.querySelector('.adm')`)), '일반 회원이 운영 화면 주소로 오면 대시보드로 돌려보낸다 (' + h7 + ')');

ws.close(); chrome.kill();
if (errors.length) { console.log('\nJS 오류:'); errors.forEach(e => console.log(' -', e)); }
if (fails.length || errors.length) { console.log(`\n실패 ${fails.length}건`); process.exit(1); }
console.log('\n운영본부 콘솔 동작 점검 통과 ✔');
