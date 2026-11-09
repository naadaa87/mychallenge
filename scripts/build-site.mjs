// 공개 사이트 생성기: functions/_site/* 의 내용으로 public/ 아래 정적 HTML을 만든다.
// 사용: node scripts/build-site.mjs
// Cloudflare Pages의 Build command에 넣어 두면 배포할 때마다 다시 만든다(넣지 않아도 저장소에 커밋된 결과로 동작).
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { SITE, siteUrl, verification } from '../functions/_site/config.js';
import { renderPage } from '../functions/_site/layout.js';
import { staticPages } from '../functions/_site/pages.js';
import { guidePages } from '../functions/_site/article.js';
import { GUIDES, CATEGORIES } from '../functions/_site/guides.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const base = siteUrl();
const ver = verification();

const hash = files => createHash('sha1').update(files.map(f => readFileSync(join(pub, f))).join('')).digest('hex').slice(0, 8);
const assetVersion = hash(['assets/site.css', 'assets/site.js']);
const opts = { base, verification: ver, assetVersion };

const ogFor = p => p.ogImage || (existsSync(join(pub, 'og', `${p.slug}.png`)) ? `/og/${p.slug}.png` : '/og/default.png');
const resolveLd = p => ({ ...p, ogImage: ogFor(p), jsonld: (p.jsonld || []).map(x => typeof x === 'function' ? x(base) : x) });
const pages = [...staticPages(), ...guidePages()].map(resolveLd);

let n = 0;
for (const p of pages) {
  const out = p.file ? join(pub, p.file) : join(pub, p.path, 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderPage(p, opts));
  n++;
}

// robots.txt
writeFileSync(join(pub, 'robots.txt'), `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${base}/sitemap.xml
`);

// 웹 앱 매니페스트
writeFileSync(join(pub, 'site.webmanifest'), JSON.stringify({
  name: SITE.fullName, short_name: SITE.alt, lang: 'ko', start_url: '/', display: 'standalone',
  background_color: '#ffffff', theme_color: SITE.themeColor,
  icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
}, null, 2) + '\n');

// Functions가 쓰는 경로 목록 (sitemap.xml, rss.xml, /papers)
const routes = pages.filter(p => !p.noindex).map(p => ({ path: p.path, lastmod: p.modified || SITE.updated, priority: p.path === '/' ? 1.0 : p.path.startsWith('/guide/') && p.path !== '/guide/' ? 0.7 : ['/privacy/', '/terms/'].includes(p.path) ? 0.3 : 0.8 }));
const guidesMeta = GUIDES.map(g => ({ slug: g.slug, title: g.title, description: g.description, category: CATEGORIES[g.category], published: g.published, modified: g.modified }));
writeFileSync(join(root, 'functions', '_site', 'generated.js'), `// 자동 생성 파일입니다. 직접 고치지 말고 node scripts/build-site.mjs 를 실행하세요.
export const ASSET_VERSION = ${JSON.stringify(assetVersion)};
export const ROUTES = ${JSON.stringify(routes, null, 1)};
export const GUIDES_META = ${JSON.stringify(guidesMeta, null, 1)};
`);

// D1 스키마를 Functions가 읽을 수 있게 문장 단위로 저장 (첫 요청 때 자동으로 표를 만든다)
const stmts = readFileSync(join(root, 'schema.sql'), 'utf8').split('\n').map(l => l.replace(/--.*$/, '')).join('\n')
  .split(';').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
writeFileSync(join(root, 'functions', '_lib', 'schema.generated.js'), `// 자동 생성 파일입니다. schema.sql 을 고친 뒤 node scripts/build-site.mjs 를 실행하세요.
export const SCHEMA_STATEMENTS = ${JSON.stringify(stmts, null, 1)};
export const SCHEMA_TABLES = ${JSON.stringify(stmts.filter(x => /^CREATE TABLE/i.test(x)).map(x => x.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)[1]))};
`);

console.log(`공개 페이지 ${n}개 생성 · 기준 주소 ${base} · 자산 버전 ${assetVersion}`);
const missing = Object.entries({ '운영 법인/상호(company)': SITE.operator.company, '문의 이메일(email)': SITE.operator.email, '개인정보 보호책임자(privacyOfficer)': SITE.operator.privacyOfficer }).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) console.log(`⚠ functions/_site/config.js 의 operator 항목이 비어 있습니다: ${missing.join(', ')} — 정식 공개 전에 채워 주세요.`);
if (!ver.naver) console.log('ℹ 네이버 소유확인 코드가 아직 없습니다 (config.js naverVerification 또는 환경 변수 NAVER_SITE_VERIFICATION).');
if (!ver.google) console.log('ℹ 구글 소유확인 코드가 아직 없습니다 (config.js googleVerification 또는 환경 변수 GOOGLE_SITE_VERIFICATION).');
if (!existsSync(join(pub, 'og', 'default.png'))) console.log('ℹ public/og/ 이미지가 없습니다. node scripts/render-og.mjs 로 만들 수 있습니다.');
