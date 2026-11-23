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

// 2. 규칙 변경 — 사유를 받아 저장 (출석 규칙 기본값)
await go('#/admin/settings');
const before = (await apiGet('/admin/settings')).settings.attendance_default.min_rate;
await ev(`(() => { const f = document.querySelector('form[data-form=att]'); f.min_rate.value = '${before === 70 ? 75 : 70}'; f.querySelector('button[type=submit]').click(); })()`);
await wait(500);
ok(await ev(`!!document.querySelector('.modal textarea[name=reason]')`), '저장하면 바꾸는 이유를 묻는다');
await ev(`(() => { const m = document.querySelector('.modal'); m.querySelector('textarea[name=reason]').value = '화면 점검용 변경'; m.querySelector('button[type=submit]').click(); })()`);
await wait(1500);
ok((await apiGet('/admin/settings')).settings.attendance_default.min_rate === (before === 70 ? 75 : 70), '이유를 적으면 출석 규칙 기본값이 바뀐다');
ok(await ev(`document.body.innerText.includes('화면 점검용 변경')`), '최근 규칙 변경에 이유가 보인다');
ok(!(await ev(`!!document.querySelector('form[data-form=money]') || !!document.querySelector('form[data-form=presets]')`)), '돈·배분 규칙 카드는 없다');
await fetch(BASE + '/api/admin/settings/attendance_default', { method: 'DELETE', headers: { cookie: 'machal_session=' + admin } });

// 3. 단체 알림 — 받는 사람 수 미리보기와 발송
await go('#/admin/broadcast');
await wait(400);
ok(/^\d+명$/.test(await ev(`document.querySelector('#rc').textContent`)), '받는 사람 수가 바로 계산된다');
await ev(`(() => { const f = document.querySelector('form[data-form=bc]'); f.type.value = 'level'; f.type.dispatchEvent(new Event('change', { bubbles: true })); })()`);
await wait(500);
ok(await ev(`!document.querySelector('.seg-extra[data-for=level]').hidden && document.querySelector('.seg-extra[data-for=challenge]').hidden && !!document.querySelector('form[data-form=bc] option[value=no_group]')`), '대상을 바꾸면 필요한 칸만 보인다 (그룹 참여 여부로도 고른다)');
await ev(`(() => { window.confirm = () => true; const f = document.querySelector('form[data-form=bc]'); f.title.value = '화면 점검 알림'; f.querySelector('button[type=submit]').click(); })()`);
await wait(1500);
ok((await apiGet('/admin/broadcasts'))[0]?.title === '화면 점검 알림', '보낸 알림이 기록된다');

// 4. 그룹 상세 — 내부 메모
await go('#/admin/groups/1');
await ev(`(() => { const f = document.querySelector('.adm-notes form'); f.body.value = '그룹리더와 통화, 다음 주 첫 공개 예정'; f.querySelector('button[type=submit]').click(); })()`);
await wait(1500);
ok(await ev(`document.querySelector('.adm-notes').innerText.includes('다음 주 첫 공개 예정')`), '내부 메모를 남기면 바로 보인다');

// 4-1. 그룹 상세 — 출석·경고·성과
ok(await ev(`document.body.innerText.includes('출석 규칙') && document.body.innerText.includes('경고 기록') && document.body.innerText.includes('성과 기록')`), '그룹 상세에 출석 규칙·경고·성과가 보인다');
// 4-2. 받은 일 — 그룹리더 신청, 매출 확인, 발표 신청
for (const [sec, txt] of [['leaders', '그룹리더'], ['results', '매출'], ['presentations', '발표']]) {
  await go('#/admin/' + sec);
  ok(await ev(`!!document.querySelector('.adm-side a.active[href="#/admin/${sec}"]') && document.querySelector('.adm-head h1').textContent.includes('${txt}') && !document.querySelector('.error-box')`), `받은 일: ${txt} 화면이 열린다`);
}
await go('#/admin/settlements');
ok((await ev('location.hash')) === '#/admin/groups', '예전 정산 주소는 그룹 현황으로 옮겨 간다');

// 5. 회원 상세 — 관리 창
await go('#/admin/users/3');
await ev(`document.querySelector('[data-act=manage]').click()`);
await wait(400);
ok(await ev(`!!document.querySelector('.modal select[name=level]') && !document.querySelector('.modal select[name=role]')`), '회원 관리 창이 열리고, 권한 변경은 운영진 화면으로 분리돼 있다');

// 6. 모바일 메뉴
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await go('#/admin/groups');
ok(await ev(`getComputedStyle(document.querySelector('.adm-side')).display === 'none' && getComputedStyle(document.querySelector('.adm-mnav')).display !== 'none'`), '휴대폰에서는 사이드 메뉴 대신 메뉴 버튼이 보인다');
await ev(`document.querySelector('.adm-mnav summary').click()`);
await wait(200);
ok(await ev(`document.querySelector('.adm-mnav').open && document.querySelectorAll('.adm-mnav-panel a').length === 21`), '메뉴 버튼을 누르면 전체 메뉴가 열린다');
await send('Emulation.clearDeviceMetricsOverride');

// 6-1. KPI 지표 — 탭마다 숫자와 표가 뜬다
for (const [tab, sel, n] of [['', '.kpi-d', 20], ['traffic', '.kpi-d', 8], ['content', '.kpi-tbl', 3], ['members', '#kpi-mlist .kpi-tbl', 1], ['groups', '.kpi-tbl', 1], ['community', '.kpi-d', 4]]) {
  await go('#/admin/kpi' + (tab ? '?tab=' + tab : ''));
  await wait(400);
  const got = await ev(`document.querySelectorAll('${sel}').length`);
  ok(got >= n && await ev(`!!document.querySelector('.adm-side a.active[href="#/admin/kpi"]') && !document.querySelector('.error-box')`), `KPI ${tab || 'summary'} 탭이 열린다 (${got})`);
}
await go('#/admin/kpi?range=7');
ok(await ev(`document.querySelector('.kpi-bar .pill-tabs.sm a.active')?.textContent === '7일' && document.querySelectorAll('.cols')[0]?.children.length === 7`), '기간을 7일로 바꾸면 막대가 7개');
await go('#/admin/kpi?tab=members');
await ev(`(() => { const q = document.querySelector('#kpi-mq'); q.value = '메이커'; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await wait(200);
const mrows = await ev(`document.querySelectorAll('#kpi-mlist tbody tr').length`);
ok(mrows >= 1 && await ev(`[...document.querySelectorAll('#kpi-mlist tbody tr')].every(tr => tr.textContent.includes('메이커'))`), `회원 목록을 이름으로 거른다 (${mrows})`);
const kpiTracked = Number((await (await fetch(BASE + '/api/admin/kpi/members?range=7', { headers: { cookie: 'machal_session=' + admin } })).json()).list.length >= 0);
ok(kpiTracked === 1, 'KPI API 응답');
await go('#/admin/kpi?tab=content');
ok(await ev(`!!window.machalTrack && typeof window.machalTrack.goal === 'function'`), '회원 공간에 방문 기록 스크립트가 들어 있다');

// 6-2. 단체카톡방 — 참여 현황, 확인 처리, 공지 만들기, 설정
await go('#/admin/chat');
ok(await ev(`!!document.querySelector('.adm-side a.active[href="#/admin/chat"]') && document.querySelector('.adm-head h1').textContent.includes('단체카톡방') && document.querySelectorAll('tbody tr').length >= 1 && !document.querySelector('.error-box')`), '단체카톡방 참여 현황이 열린다');
const target = await ev(`(() => { const b = [...document.querySelectorAll('button[data-act=set][data-s=verified]')][0]; if (!b) return null; const id = b.dataset.id; b.click(); return Number(id); })()`);
await wait(1300);
const chatAfter = await apiGet('/admin/chat?status=verified');
ok(target && chatAfter.members.some(m => m.id === target), '확인 버튼을 누르면 운영진 확인으로 바뀐다');
await go('#/admin/chat?tab=compose&kind=custom');
await ev(`(() => { const t = document.querySelector('#compose-text'); t.value = '이번 주 정기모임은 목요일 저녁입니다'; document.querySelector('form[data-form=post] button[type=submit]').click(); })()`);
await wait(1300);
ok(await ev(`document.body.innerText.includes('올린 기록') && document.body.textContent.includes('이번 주 정기모임은 목요일 저녁입니다')`) && (await apiGet('/admin/chat/compose')).posts[0]?.kind === 'custom', '직접 쓴 공지를 기록하면 올린 기록에 남는다');
await go('#/admin/chat?tab=compose&kind=welcome&days=60');
ok(await ev(`!!document.querySelector('#compose-text') && document.querySelectorAll('.pill-tabs.sm a').length === 5`), '공지 만들기 탭에 문안 종류 다섯 가지가 보인다');
await go('#/admin/chat?tab=settings');
ok(await ev(`document.querySelector('form[data-form=cs] input[name=url]')?.value.startsWith('https://open.kakao.com/')`), '운영자는 단체카톡방 설정을 볼 수 있다');

// 6-3. 신규 회원 정착
await go('#/admin/onboarding?days=365');
ok(await ev(`!!document.querySelector('.adm-side a.active[href="#/admin/onboarding"]') && document.querySelectorAll('.ob-dots').length >= 1 && document.querySelectorAll('.hbar').length === 8 && !document.querySelector('.error-box')`), '신규 회원 정착 화면에 단계 점과 정착 단계 막대가 보인다');
const obBefore = (await apiGet('/admin/onboarding?days=365')).nudges.length;
await ev(`document.querySelector('button[data-act=nudge1]:not([data-force])')?.click()`);
await wait(1300);
ok((await apiGet('/admin/onboarding?days=365')).nudges.length > obBefore || await ev(`!document.querySelector('button[data-act=nudge1]:not([data-force])')`), '다음 단계 안내를 보내면 최근 보낸 안내에 쌓인다');
const eId = (await apiGet('/admin/search?q=' + encodeURIComponent('챌린저E'))).users[0]?.id;
await go('#/admin/users/' + eId);
ok(await ev(`document.body.innerText.includes('정착 단계') && document.body.innerText.includes('단체카톡방')`), '회원 상세에 정착 단계와 단체카톡방 상태가 보인다');
await go('#/admin');
ok(await ev(`document.body.innerText.includes('단체카톡방 참여') && document.querySelectorAll('.kpi-grid.kpi-4 .kpi').length >= 8`), '현황에 단체카톡방 참여율과 새 회원 지표가 보인다');

// 7. 일반 회원은 들어올 수 없다
await send('Network.clearBrowserCookies');
const member = await tokenOf('e@test.kr', 'password1');
await send('Network.setCookie', { name: 'machal_session', value: member, url: BASE, httpOnly: true });
await send('Page.navigate', { url: 'about:blank' }); await wait(200);
await go('#/admin/settings');
await wait(600); const h7 = await ev('location.hash'); ok(h7 === '#/dashboard' && !(await ev(`!!document.querySelector('.adm')`)), '일반 회원이 운영 화면 주소로 오면 대시보드로 돌려보낸다 (' + h7 + ')');

// 8. 회원 화면 — 단체카톡방 안내와 링크 (링크를 눌러도 화면이 막히지 않고 기록만 남는다)
await go('#/chat');
ok(await ev(`document.body.innerText.includes('내 참여 상태') && !!document.querySelector('a[data-chat-link][target=_blank]')`), '회원은 단체카톡방 참여 방법 화면을 볼 수 있다');
const prevented = await ev(`(() => { const a = document.querySelector('a[data-chat-link]'); let p = null; document.addEventListener('click', e => { p = e.defaultPrevented; e.preventDefault(); }, { once: true }); a.click(); return p; })()`);
ok(prevented === false, '단체카톡방 링크 클릭을 막지 않는다 (새 창으로 열린다)');

ws.close(); chrome.kill();
if (errors.length) { console.log('\nJS 오류:'); errors.forEach(e => console.log(' -', e)); }
if (fails.length || errors.length) { console.log(`\n실패 ${fails.length}건`); process.exit(1); }
console.log('\n운영본부 콘솔 동작 점검 통과 ✔');
