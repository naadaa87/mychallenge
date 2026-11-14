// 공개 사이트 공통 레이아웃: <head>(메타·OG·구조화 데이터), 머리글, 바닥글
// 빌드 스크립트(scripts/build-site.mjs)와 Pages Functions(/papers, /sitemap.xml, /rss.xml)가 함께 쓴다.
import { SITE } from './config.js';
import { IMG } from './images.generated.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ld = obj => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

export const NAV = [
  ['/about/', '마챌 소개'],
  ['/how-it-works/', '운영 방식'],
  ['/rules/', '수익 배분'],
  ['/levels/', '등급'],
  ['/guide/', '가이드'],
  ['/papers/', '프로젝트 페이퍼'],
];

export const FOOT = [
  ['마이챌린지', [['/about/', '마챌 소개'], ['/how-it-works/', '12주 운영 방식'], ['/rules/', '수익 배분 규칙'], ['/levels/', '등급과 포인트'], ['/programs/', '프로그램']]],
  ['시작하기', [['/apply/', '가입 신청'], ['/faq/', '자주 묻는 질문'], ['/papers/', '프로젝트 페이퍼'], ['/app/#/login', '회원 로그인']]],
  ['가이드', [['/guide/side-project-start/', '사이드프로젝트 시작하기'], ['/guide/side-income-tax/', '부업 소득 세금'], ['/guide/side-job-company-rules/', '회사 겸업 규정'], ['/guide/', '전체 글 보기']]],
];

export function orgLd(base) {
  return { '@context': 'https://schema.org', '@type': 'Organization', '@id': base + '/#org', name: SITE.fullName, alternateName: [SITE.name, SITE.alt, 'My Challenge'], url: base + '/', logo: base + '/icon-512.png', description: `${SITE.fullName}는 사이드프로젝트로 첫 매출을 만들려는 사람들이 관심사별 그룹을 짜서 12주 동안 함께 실행하는 모임입니다.` };
}
export function websiteLd(base) {
  return { '@context': 'https://schema.org', '@type': 'WebSite', '@id': base + '/#website', name: SITE.fullName, alternateName: [SITE.name, SITE.alt], url: base + '/', inLanguage: 'ko-KR', publisher: { '@id': base + '/#org' } };
}
export function breadcrumbLd(crumbs, base) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: base + path })) };
}
export function breadcrumbHtml(crumbs) {
  if (!crumbs || crumbs.length < 2) return '';
  return `<nav class="crumbs" aria-label="현재 위치"><ol>${crumbs.map(([name, path], i) => i === crumbs.length - 1 ? `<li aria-current="page">${esc(name)}</li>` : `<li><a href="${path}">${esc(name)}</a></li>`).join('')}</ol></nav>`;
}

const logo = `<svg class="logo-mark" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#2457F5"/><path d="M16 46V18h7l9 16 9-16h7v28h-7V31l-9 15-9-15v15z" fill="#fff"/></svg>`;

function header(path) {
  const active = href => (href !== '/' && path.startsWith(href)) ? ' aria-current="page"' : '';
  const links = NAV.map(([href, label]) => `<a href="${href}"${active(href)}>${label}</a>`).join('');
  return `<header class="sh">
  <div class="wrap sh-in">
    <a class="brand" href="/" title="마이챌린지 홈">${logo}<span class="brand-name">마이챌린지<small>마챌</small></span></a>
    <nav class="sh-nav" aria-label="주요 메뉴">${links}</nav>
    <div class="sh-cta">
      <span class="auth-guest"><a class="btn btn-quiet" href="/app/#/login">로그인</a><a class="btn btn-primary" href="/apply/">가입 신청</a></span>
      <span class="auth-member" hidden><a class="btn btn-primary" href="/app/#/dashboard">내 대시보드</a></span>
    </div>
    <details class="mnav">
      <summary aria-label="메뉴 열기"><span></span><span></span><span></span></summary>
      <div class="mnav-panel">
        <nav aria-label="모바일 메뉴">${links}<a href="/programs/">프로그램</a><a href="/faq/">자주 묻는 질문</a></nav>
        <div class="mnav-cta auth-guest"><a class="btn btn-line" href="/app/#/login">로그인</a><a class="btn btn-primary" href="/apply/">가입 신청</a></div>
        <div class="mnav-cta auth-member" hidden><a class="btn btn-primary" href="/app/#/dashboard">내 대시보드</a></div>
      </div>
    </details>
  </div>
</header>`;
}

function footer() {
  const o = SITE.operator;
  const biz = [o.company && `상호 ${esc(o.company)}`, o.ceo && `대표 ${esc(o.ceo)}`, o.bizNumber && `사업자등록번호 ${esc(o.bizNumber)}`, o.address && esc(o.address), o.email && `<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>`].filter(Boolean).join(' · ');
  return `<footer class="sf">
  <div class="wrap">
    <div class="sf-top">
      <div class="sf-brand">
        <a class="brand" href="/" title="마이챌린지 홈">${logo}<span class="brand-name">마이챌린지<small>마챌</small></span></a>
        <p>사이드프로젝트로 첫 매출을 만드는 사람들이 모여 12주 동안 함께 실행하고, 결과를 기록으로 남기는 모임입니다.</p>
        <ul class="sf-principles"><li>수익을 보장하지 않습니다</li><li>실행한 사람이 발언합니다</li><li>돈과 소유는 시작 전에 합의합니다</li></ul>
      </div>
      ${FOOT.map(([t, items]) => `<div class="sf-col"><h2>${t}</h2><ul>${items.map(([h, l]) => `<li><a href="${h}">${l}</a></li>`).join('')}</ul></div>`).join('')}
    </div>
    <div class="sf-bottom">
      <p class="sf-legal"><a href="/terms/">이용약관</a><a href="/privacy/"><b>개인정보처리방침</b></a><a href="/rss.xml">RSS</a></p>
      <p class="sf-biz">${esc(o.name)}${biz ? ' · ' + biz : ''}</p>
      <p class="sf-copy">© ${new Date().getFullYear()} ${esc(SITE.fullName)}. 마챌은 수익을 보장하지 않으며, 회원 간 투자 권유·다단계·유료 강의 모집을 금지합니다.</p>
    </div>
  </div>
</footer>`;
}

/**
 * 한 페이지 전체 HTML을 만든다.
 * @param {object} p  path, title, description, body, crumbs, jsonld[], ogImage, ogType, published, modified, noindex, fullTitle
 * @param {object} o  base(사이트 주소), verification({naver, google}), assetVersion
 */
export function renderPage(p, o) {
  const base = o.base;
  const url = base + p.path;
  const title = p.fullTitle || `${p.title} | ${SITE.fullName}`;
  const og = base + (p.ogImage || '/og/default.png');
  const v = o.assetVersion ? `?v=${o.assetVersion}` : '';
  const ver = o.verification || {};
  const crumbs = p.crumbs || null;
  const graph = [...(p.jsonld || [])];
  if (crumbs && crumbs.length > 1) graph.push(breadcrumbLd(crumbs, base));
  const head = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`,
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(p.description)}">`,
    p.noindex ? `<meta name="robots" content="noindex, follow">` : `<meta name="robots" content="index, follow, max-image-preview:large">`,
    p.noindex ? '' : `<link rel="canonical" href="${esc(url)}">`,
    ver.naver ? `<meta name="naver-site-verification" content="${esc(ver.naver)}">` : '',
    ver.google ? `<meta name="google-site-verification" content="${esc(ver.google)}">` : '',
    `<meta property="og:type" content="${p.ogType || 'website'}">`,
    `<meta property="og:site_name" content="${esc(SITE.fullName)}">`,
    `<meta property="og:locale" content="${SITE.locale}">`,
    `<meta property="og:title" content="${esc(p.ogTitle || p.title)}">`,
    `<meta property="og:description" content="${esc(p.description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(og)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(p.ogTitle || p.title)}">`,
    p.published ? `<meta property="article:published_time" content="${p.published}T09:00:00+09:00">` : '',
    p.modified ? `<meta property="article:modified_time" content="${p.modified}T09:00:00+09:00">` : '',
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(p.ogTitle || p.title)}">`,
    `<meta name="twitter:description" content="${esc(p.description)}">`,
    `<meta name="twitter:image" content="${esc(og)}">`,
    `<meta name="theme-color" content="#ffffff">`,
    `<meta name="format-detection" content="telephone=no">`,
    `<link rel="icon" href="/favicon.ico" sizes="32x32">`,
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
    `<link rel="manifest" href="/site.webmanifest">`,
    `<link rel="alternate" type="application/rss+xml" title="${esc(SITE.fullName)} 가이드" href="${base}/rss.xml">`,
    `<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>`,
    `<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">`,
    `<link rel="stylesheet" href="/assets/site.css${v}">`,
    ...graph.map(ld),
  ].filter(Boolean).join('\n');
  return `<!DOCTYPE html>
<html lang="ko">
<head>
${head}
</head>
<body class="${p.bodyClass || ''}">
<a class="skip" href="#main">본문 바로가기</a>
${header(p.path)}
<main id="main">
${withImageVersion(p.body, o.assetVersion)}
</main>
${footer()}
<script src="/assets/site.js${v}" defer></script>
</body>
</html>
`;
}

// 이미지 주소에 자산 버전을 붙여 캐시가 바뀐 그림을 놓치지 않게 한다
const withImageVersion = (html, ver) => ver ? String(html).replace(/(\/assets\/img\/[\w.-]+\.webp)(?=["\s,])/g, `$1?v=${ver}`) : html;

/**
 * 일러스트 <img>. name은 public/assets/img/<name>.webp
 * @param {string} name
 * @param {string} alt  꾸밈용이면 '' (스크린리더가 건너뜀)
 * @param {object} o  cls, eager(첫 화면 그림), sizes(작은 판이 있을 때 srcset 기준), w(표시 너비 힌트)
 */
export function img(name, alt, o = {}) {
  const d = IMG[name];
  if (!d) throw new Error('이미지 없음: ' + name);
  const sm = IMG[name + '-sm'];
  const src = `/assets/img/${name}.webp`;
  const srcset = sm ? ` srcset="/assets/img/${name}-sm.webp ${sm[0]}w, ${src} ${d[0]}w" sizes="${o.sizes || `(min-width: 1040px) 360px, (min-width: 720px) 50vw, 100vw`}"` : '';
  return `<img src="${src}"${srcset} width="${d[0]}" height="${d[1]}" alt="${esc(alt)}"${o.cls ? ` class="${o.cls}"` : ''}${o.eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
}

// 본문 조각을 만들 때 쓰는 작은 도우미
export const h = {
  // art: { name, alt } 또는 그림 HTML 문자열. 있으면 오른쪽에 그림을 둔 두 칸 머리말이 된다.
  pageHero: (eyebrow, title, lead, crumbs, extra = '', art = null) => {
    const copy = `${breadcrumbHtml(crumbs)}<p class="eyebrow">${eyebrow}</p><h1>${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}${extra}`;
    if (!art) return `<section class="page-hero"><div class="wrap">${copy}</div></section>`;
    const pic = typeof art === 'string' ? art : img(art.name, art.alt || '', { eager: true, cls: art.cls });
    return `<section class="page-hero has-art"><div class="wrap ph-in"><div class="ph-copy">${copy}</div><div class="ph-art${art.frame === false ? '' : ' framed'}">${pic}</div></div></section>`;
  },
  cta: (title, text, primary = ['/apply/', '가입 신청하기'], secondary = ['/how-it-works/', '운영 방식 보기'], art = null) => {
    const actions = `<div class="cta-actions"><a class="btn btn-white btn-lg" href="${primary[0]}">${primary[1]}</a>${secondary ? `<a class="btn btn-ghost-white btn-lg" href="${secondary[0]}">${secondary[1]}</a>` : ''}</div>`;
    if (!art) return `<section class="cta"><div class="wrap"><div class="cta-box"><div><h2>${title}</h2><p>${text}</p></div>${actions}</div></div></section>`;
    return `<section class="cta"><div class="wrap"><div class="cta-box has-art"><div class="cta-copy"><h2>${title}</h2><p>${text}</p>${actions}</div><div class="cta-art">${img(art.name, art.alt || '', { sizes: '(min-width: 900px) 420px, 90vw' })}</div></div></div></section>`;
  },
  // 본문 속 그림 (캡션 포함)
  figure: (name, alt, caption = '', cls = '') => `<figure class="fig${cls ? ' ' + cls : ''}">${img(name, alt, { sizes: '(min-width: 1040px) 720px, 100vw' })}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`,
  sources: list => list.length ? `<aside class="sources"><h2>참고한 자료</h2><ol>${list.map(([t, url, note]) => `<li><a href="${url}" rel="noopener" target="_blank">${t}</a>${note ? ` <span>${note}</span>` : ''}</li>`).join('')}</ol></aside>` : '',
};
