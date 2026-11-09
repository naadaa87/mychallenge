// 공유 미리보기 이미지(OG 1200×630)와 아이콘을 헤드리스 크롬으로 그린다.
// 사용: node scripts/render-og.mjs   (google-chrome 필요. Pretendard 글꼴 경로는 PRETENDARD_DIR 로 지정)
// 결과물은 public/og/*.png, public/icon-*.png, public/apple-touch-icon.png 로 저장되며 저장소에 커밋한다.
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { staticPages } from '../functions/_site/pages.js';
import { guidePages } from '../functions/_site/article.js';
import { GUIDES, CATEGORIES } from '../functions/_site/guides.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const fontDir = process.env.PRETENDARD_DIR || '/tmp/fonts/node_modules/pretendard/dist/web/static/woff2';
const tmp = '/tmp/machal-og'; mkdirSync(tmp, { recursive: true }); mkdirSync(join(pub, 'og'), { recursive: true });
const font = w => pathToFileURL(join(fontDir, `Pretendard-${w}.woff2`)).href;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const EYEBROW = { home: '사이드프로젝트 수익 도전 모임', about: '마챌 소개', 'how-it-works': '12주 운영 방식', rules: '수익 배분 규칙', levels: '등급과 포인트', programs: '프로그램', faq: '자주 묻는 질문', apply: '가입 신청', guide: '가이드', papers: '프로젝트 페이퍼', privacy: '정책', terms: '정책' };
const TITLE = { home: '사이드프로젝트,\n12주 동안 함께 첫 매출까지', papers: '잘된 길도, 멈춘 길도\n기록으로 남깁니다', apply: '각자의 챌린지를\n함께 끝까지', guide: '실행에 필요한 글만\n모았습니다' };
const items = [];
for (const p of staticPages()) { if (p.noindex) continue; items.push({ file: `${p.slug}.png`, eyebrow: EYEBROW[p.slug] || '마이챌린지', title: TITLE[p.slug] || (p.ogTitle || p.title).replace(/^마이챌린지\(마챌\)\s*[—|]?\s*/, '') }); }
items.push({ file: 'papers.png', eyebrow: EYEBROW.papers, title: TITLE.papers });
for (const g of GUIDES) items.push({ file: `guide-${g.slug}.png`, eyebrow: `가이드 · ${CATEGORIES[g.category]}`, title: g.title.replace(/:\s*/, ':\n') });
items.push({ ...items.find(i => i.file === 'home.png'), file: 'default.png' });

const logo = `<svg viewBox="0 0 64 64" width="56" height="56"><rect width="64" height="64" rx="16" fill="#2457F5"/><path d="M16 46V18h7l9 16 9-16h7v28h-7V31l-9 15-9-15v15z" fill="#fff"/></svg>`;
const page = it => `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><style>
@font-face{font-family:P;src:url(${font('Bold')});font-weight:700}
@font-face{font-family:P;src:url(${font('ExtraBold')});font-weight:800}
@font-face{font-family:P;src:url(${font('SemiBold')});font-weight:600}
*{margin:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden}
body{font-family:P,'Noto Sans CJK KR',sans-serif;background:#fff;color:#121624;position:relative;word-break:keep-all}
.dots{position:absolute;inset:0;background-image:radial-gradient(circle at 1px 1px,#e1e6f2 1.4px,transparent 0);background-size:30px 30px;-webkit-mask-image:linear-gradient(120deg,transparent 35%,#000 100%)}
.bar{position:absolute;left:0;top:0;bottom:0;width:18px;background:#2457F5}
.wrap{position:absolute;left:96px;right:96px;top:84px;bottom:76px;display:flex;flex-direction:column}
.eyebrow{display:inline-flex;align-items:center;gap:12px;font-weight:700;font-size:30px;color:#2457F5;letter-spacing:-.01em}
.eyebrow i{width:12px;height:12px;border-radius:50%;background:#2457F5;box-shadow:0 0 0 7px #e7edff}
h1{margin-top:34px;font-weight:800;font-size:${it.title.length > 34 ? 58 : 68}px;line-height:1.24;letter-spacing:-.045em;white-space:pre-line;max-width:960px}
.foot{margin-top:auto;display:flex;align-items:center;gap:16px}
.foot b{font-size:30px;font-weight:800;letter-spacing:-.03em}
.foot span{font-size:24px;color:#687083;font-weight:600;margin-left:4px}
.tag{margin-left:auto;font-size:22px;font-weight:600;color:#687083;border:2px solid #e6e8ee;border-radius:99px;padding:10px 22px}
</style></head><body><div class="dots"></div><div class="bar"></div><div class="wrap"><p class="eyebrow"><i></i>${esc(it.eyebrow)}</p><h1>${esc(it.title)}</h1><div class="foot">${logo}<b>마이챌린지</b><span>마챌</span><p class="tag">수익을 보장하지 않습니다 · 실행한 사람이 발언합니다</p></div></div></body></html>`;

const iconPage = size => `<!DOCTYPE html><html><head><style>*{margin:0}html,body{width:${size}px;height:${size}px;background:transparent;overflow:hidden}</style></head><body><svg viewBox="0 0 64 64" width="${size}" height="${size}"><rect width="64" height="64" rx="${size >= 180 ? 14 : 16}" fill="#2457F5"/><path d="M16 46V18h7l9 16 9-16h7v28h-7V31l-9 15-9-15v15z" fill="#fff"/></svg></body></html>`;

// ── 크롬 CDP
const PORT = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--allow-file-access-from-files', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/machal-og-chrome-${process.pid}`, 'about:blank'], { stdio: 'ignore' });
let list; for (let i = 0; i < 30; i++) { try { list = await (await fetch(`http://localhost:${PORT}/json`)).json(); break; } catch { await new Promise(r => setTimeout(r, 200)); } }
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
async function shoot(html, out, w, h, transparent = false) {
  const f = join(tmp, 'p.html'); writeFileSync(f, html);
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  if (transparent) await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await send('Page.navigate', { url: pathToFileURL(f).href + '?t=' + Date.now() });
  await new Promise(r => setTimeout(r, 450));
  await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
  const { result } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  writeFileSync(out, Buffer.from(result.data, 'base64'));
  if (transparent) await send('Emulation.setDefaultBackgroundColorOverride', {});
}
for (const it of items) { await shoot(page(it), join(pub, 'og', it.file), 1200, 630); }
for (const [size, name] of [[512, 'icon-512.png'], [192, 'icon-192.png'], [180, 'apple-touch-icon.png'], [48, '_fav48.png'], [32, '_fav32.png'], [16, '_fav16.png']]) await shoot(iconPage(size), join(size < 64 ? tmp : pub, name), size, size, size !== 180);
ws.close(); chrome.kill();
// favicon.ico (ImageMagick이 있으면)
try { execFileSync('convert', [join(tmp, '_fav16.png'), join(tmp, '_fav32.png'), join(tmp, '_fav48.png'), join(pub, 'favicon.ico')]); } catch { console.log('ImageMagick(convert)이 없어 favicon.ico는 건너뜁니다'); }
console.log(`OG 이미지 ${items.length}개, 아이콘 ${existsSync(join(pub, 'favicon.ico')) ? 4 : 3}개를 만들었습니다`);
