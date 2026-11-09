// 검색 노출 점검: 로컬 서버(node tests/serve.js)를 처음부터 끝까지 돌며 SEO 기본 요소를 확인한다.
// 사용: node tests/seo-audit.js [http://localhost:8788]
const BASE = process.argv[2] || 'http://localhost:8788';
const problems = []; const warn = [];
const seen = new Map(); // path -> {title, desc}
const queue = ['/'];
const SKIP = /^\/(app|api)\//;

const attr = (html, re) => { const m = html.match(re); return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'") : null; };
const textLen = s => [...s].length;

async function sitemapPaths() {
  const xml = await (await fetch(BASE + '/sitemap.xml')).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname);
}

for (const p of await sitemapPaths()) if (!queue.includes(p)) queue.push(p);

while (queue.length) {
  const path = queue.shift();
  if (seen.has(path)) continue;
  const r = await fetch(BASE + path, { redirect: 'manual' });
  if (r.status !== 200) { problems.push(`${path}: HTTP ${r.status}`); seen.set(path, {}); continue; }
  const html = await r.text();
  const title = attr(html, /<title>([^<]*)<\/title>/);
  const desc = attr(html, /<meta name="description" content="([^"]*)"/);
  const canonical = attr(html, /<link rel="canonical" href="([^"]*)"/);
  const robots = attr(html, /<meta name="robots" content="([^"]*)"/) || '';
  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  seen.set(path, { title, desc });
  const P = m => problems.push(`${path}: ${m}`);
  if (!/<html lang="ko">/.test(html)) P('html lang 누락');
  if (!title) P('title 없음'); else if (textLen(title) > 60) warn.push(`${path}: title ${textLen(title)}자 (검색 결과에서 잘릴 수 있음)`);
  if (!desc) P('description 없음'); else if (textLen(desc) < 50 || textLen(desc) > 160) P(`description 길이 ${textLen(desc)}자 (50~160 권장)`);
  if (h1s !== 1) P(`h1 ${h1s}개`);
  if (!robots.includes('noindex')) {
    if (!canonical) P('canonical 없음'); else if (new URL(canonical).pathname !== path) P(`canonical 경로 불일치 ${canonical}`);
  }
  for (const k of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'og:site_name']) if (!new RegExp(`<meta property="${k}" content="[^"]+"`).test(html)) P(`${k} 없음`);
  const ogImg = attr(html, /<meta property="og:image" content="([^"]*)"/);
  if (ogImg) { const ir = await fetch(BASE + new URL(ogImg).pathname); if (ir.status !== 200) P(`og:image 파일 없음 ${ogImg}`); }
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { const j = JSON.parse(m[1]); if (!j['@context'] || !j['@type']) P('JSON-LD @context/@type 누락'); } catch { P('JSON-LD 파싱 실패'); } }
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\balt="/.test(m[0])) P('img alt 누락');
  // 내부 링크 수집
  for (const m of html.matchAll(/href="(\/[^"#?]*)(?:[#?][^"]*)?"/g)) {
    const href = m[1];
    if (SKIP.test(href) || /\.(css|js|png|svg|ico|webmanifest|xml)$/.test(href)) continue;
    if (!seen.has(href) && !queue.includes(href)) queue.push(href);
  }
}

// 중복 title / description
const dup = key => { const c = {}; for (const [p, v] of seen) if (v[key]) (c[v[key]] = c[v[key]] || []).push(p); return Object.values(c).filter(a => a.length > 1); };
for (const d of dup('title')) problems.push(`title 중복: ${d.join(', ')}`);
for (const d of dup('desc')) problems.push(`description 중복: ${d.join(', ')}`);

// robots.txt · rss · 404
const robots = await (await fetch(BASE + '/robots.txt')).text();
if (!/Sitemap: https?:\/\/\S+\/sitemap\.xml/.test(robots)) problems.push('robots.txt에 Sitemap 줄 없음');
if (/Disallow: \/\s*$/m.test(robots)) problems.push('robots.txt가 전체를 막고 있음');
const rss = await fetch(BASE + '/rss.xml'); const rssText = await rss.text();
if (rss.status !== 200 || !/<rss version="2.0"/.test(rssText) || (rssText.match(/<item>/g) || []).length < 5) problems.push('rss.xml 이상');
const nf = await fetch(BASE + '/no-such-page/'); if (nf.status !== 404) problems.push(`없는 주소가 ${nf.status}를 돌려줌 (404여야 함)`);
const app = await fetch(BASE + '/app/'); if (!/noindex/.test(await app.text())) problems.push('/app/ 에 noindex 없음');

console.log(`점검한 페이지 ${seen.size}개`);
if (warn.length) { console.log('\n참고:'); warn.forEach(w => console.log(' ·', w)); }
if (problems.length) { console.log('\n문제:'); problems.forEach(p => console.log(' ✗', p)); process.exit(1); }
console.log('\nSEO 기본 점검 통과 ✔');
