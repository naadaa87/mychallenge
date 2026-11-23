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
await ev(`(() => { const f = document.querySelector('#apply-form'); f.name.value = '흐름테스트'; f.email.value = '${email}'; f.hours_weekday.value = '주중 5시간'; f.querySelector('[name=interests][value="S-02"]').checked = true; f.side_job_check.value = 'yes'; f.want_group.value = 'challenge'; f.project_idea.value = 'AI로 상세페이지 만들기'; f.consent_privacy.checked = true; return true; })()`);
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
ok(app && app.form.interests === 'S-02' && app.form.side_job_check === 'yes' && app.form.want_group === 'challenge' && app.form.project_idea, '운영 화면에서 신청서 내용(관심 있는 그룹 포함)이 그대로 보인다');

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
ok(await ev(`!document.querySelector('[data-live=stats]').hidden && /\\d/.test(document.querySelector('[data-stat=members]').textContent)`), '홈의 실제 숫자 섹션이 채워진다(그룹 기록이 있을 때)');
ok(await ev(`(() => { const r = document.querySelector('[data-live=round]'); return !r.hidden && r.textContent.includes('모집 중'); })()`), '신규 회원 모집 중인 시즌이 있으면 홈에 안내가 뜬다');
ok(await ev(`(() => { const g = document.querySelector('[data-live=groups]'); return !!g && (g.hidden || g.querySelectorAll('.live-groups li').length >= 1); })()`), '모집 중인 그룹이 있으면 홈에 그룹 목록이 뜬다');
const rr = await fetch(BASE + '/rules/', { redirect: 'manual' });
ok(rr.status === 301 && rr.headers.get('location') === '/goals/', '예전 수익 배분 주소(/rules/)는 수익목표로 옮겨 간다');
await go(BASE + '/goals/');
ok(await ev(`document.querySelectorAll('.goal-steps li').length === 6 && document.body.innerText.includes('아직 정하지 않았습니다') && !document.body.innerText.includes('합의서')`), '수익목표 페이지: 여섯 단계, 수익 나눔은 추후 결정, 합의서 없음');
ok(await ev(`!!document.querySelector('.sh-nav a[href="/goals/"]')`), '머리글 메뉴에 수익목표가 있다');
await go(BASE + '/levels/');
const lvPts = String((await (await fetch(BASE + '/api/public/levels')).json()).rules.L2.points);
ok((await ev(`document.querySelector('[data-rule="L2.points"]').textContent`)) === lvPts, `등급 페이지가 운영본부 설정값(지금 ${lvPts}점)을 반영한다`);
await go(BASE + '/app/');
await wait(800);
ok((await ev('location.hash')) === '#/login', '/app/ 첫 화면은 비로그인 상태면 로그인');

// 이용 통계: 페이지 보기·캠페인·FAQ 펼침·버튼 클릭이 KPI에 잡힌다 (헤드리스 표시를 지운 브라우저 정보로)
await send('Network.clearBrowserCookies'); // 운영진으로 로그인한 방문은 세지 않으므로 로그아웃 상태로
await send('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
await go('about:blank');
await send('Storage.clearDataForOrigin', { origin: BASE, storageTypes: 'local_storage' }); // 새 방문으로 시작
const camp = 'kpi' + Date.now().toString(36);
await go(BASE + `/faq/?utm_source=flowtest&utm_campaign=${camp}`);
await ev(`document.querySelector('details.faq-item summary').click()`);
await wait(300);
await ev(`document.querySelector('main a[href="/apply/"]').click()`);
await wait(1500);
const kget = async p => (await fetch(BASE + '/api' + p, { headers: { cookie: 'machal_session=' + token } })).json();
const kt = await kget('/admin/kpi/traffic?range=7');
ok(kt.campaigns.some(c => c.campaign === `flowtest / ${camp}`), '캠페인 링크로 들어온 방문이 잡힌다');
const kc = await kget('/admin/kpi/content?range=7');
ok(kc.faq.length >= 1 && kc.apply_from.some(r => r.path === '/faq/'), 'FAQ 펼침과 가입 신청 버튼 클릭이 잡힌다');
const faqRow = kc.site.find(r => r.path === '/faq/');
ok(faqRow && faqRow.avg_sec !== null && kc.site.some(r => r.path === '/apply/'), '링크로 넘어가면 앞 페이지의 머문 시간과 다음 페이지 보기가 기록된다');
const kin = await kget('/admin/kpi/summary?range=7');
await go(BASE + '/');
await wait(600);
const kin2 = await kget('/admin/kpi/summary?range=7');
ok(kin2.cards.find(c => c.key === 'views').value === kin.cards.find(c => c.key === 'views').value + 1, '페이지를 열면 바로 페이지뷰가 1 늘어난다');

ws.close(); chrome.kill();
if (fails.length) { console.log(`\n실패 ${fails.length}건`); process.exit(1); }
console.log('\n공개 사이트 동작 점검 통과 ✔');
