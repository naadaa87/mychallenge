// 가이드 글 한 편의 페이지 정의
import { SITE } from './config.js';
import { esc, h, breadcrumbHtml } from './layout.js';
import { GUIDES, CATEGORIES, guideBySlug } from './guides.js';

const dateKo = v => { const [y, m, d] = v.split('-').map(Number); return `${y}년 ${m}월 ${d}일`; };
export function readMinutes(g) {
  const len = g.body.replace(/<[^>]+>/g, '').replace(/\s+/g, '').length;
  return Math.max(3, Math.round(len / 400));
}

export function guidePage(g) {
  const path = `/guide/${g.slug}/`;
  const crumbs = [['홈', '/'], ['가이드', '/guide/'], [g.short, path]];
  const related = (g.related || []).map(s => guideBySlug[s]).filter(Boolean);
  const minutes = readMinutes(g);
  const toc = g.toc && g.toc.length ? `<nav class="toc" aria-label="이 글의 차례"><b>차례</b><ol>${g.toc.map(([id, label]) => `<li><a href="#${id}">${esc(label)}</a></li>`).join('')}</ol></nav>` : '';
  const articleLd = base => ({
    '@context': 'https://schema.org', '@type': 'Article',
    headline: g.title, description: g.description, inLanguage: 'ko-KR',
    datePublished: `${g.published}T09:00:00+09:00`, dateModified: `${g.modified}T09:00:00+09:00`,
    image: [`${base}/og/guide-${g.slug}.png`],
    author: { '@type': 'Organization', name: `${SITE.fullName} 운영본부`, url: base + '/about/' },
    publisher: { '@type': 'Organization', name: SITE.fullName, logo: { '@type': 'ImageObject', url: base + '/icon-512.png' } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': base + path },
    articleSection: CATEGORIES[g.category],
  });
  return {
    path, slug: 'guide-' + g.slug,
    title: g.title,
    fullTitle: `${g.title} | ${SITE.name}`,
    description: g.description,
    ogType: 'article', ogImage: `/og/guide-${g.slug}.png`,
    published: g.published, modified: g.modified,
    crumbs, jsonld: [articleLd],
    body: `<div class="wrap article-layout article-page">
<article class="prose article">
  <header class="article-head">
    ${breadcrumbHtml(crumbs)}
    <p class="eyebrow"><a href="/guide/#cat-${g.category}">${CATEGORIES[g.category]}</a></p>
    <h1>${esc(g.title)}</h1>
    <p class="article-lead">${esc(g.description)}</p>
    <p class="article-meta"><span>${esc(SITE.fullName)} 운영본부</span><span><time datetime="${g.published}">${dateKo(g.published)}</time>${g.modified !== g.published ? ` · 고친 날 <time datetime="${g.modified}">${dateKo(g.modified)}</time>` : ''}</span><span>${minutes}분 분량</span></p>
  </header>
  ${toc}
  <div class="article-body">${g.body}</div>
  ${h.sources(g.sources || [])}
  <div class="article-foot"><button class="btn btn-line btn-sm" type="button" data-copy-link>링크 복사</button><a class="btn btn-line btn-sm" href="/guide/">다른 가이드 보기</a></div>
</article>
<aside class="side">
  ${related.length ? `<div class="side-box"><b>함께 읽기</b><ul>${related.map(r => `<li><a href="/guide/${r.slug}/">${esc(r.short)}</a></li>`).join('')}</ul></div>` : ''}
  <div class="side-box side-cta"><b>읽었다면 해 볼 차례</b><p>마이챌린지는 12주 동안 그룹으로 사이드프로젝트를 실행하는 모임입니다.</p><a class="btn btn-primary" href="/apply/">가입 신청</a><a class="side-link" href="/how-it-works/">운영 방식 보기</a></div>
</aside>
</div>
${related.length ? `<section class="sec sec-tint"><div class="wrap"><div class="sec-head"><p class="eyebrow">이어서 읽기</p><h2>이 글과 함께 많이 읽는 가이드</h2></div><div class="g-grid g-grid-3">${related.map(r => `<a class="g-card" href="/guide/${r.slug}/"><span class="g-cat">${CATEGORIES[r.category]}</span><h3>${esc(r.title)}</h3><p>${esc(r.summary)}</p><span class="g-more">읽어 보기</span></a>`).join('')}</div></div></section>` : ''}
${h.cta('혼자 읽고 끝내지 않으려면', '다음 라운드에서 관심사가 비슷한 사람들과 12주 동안 직접 해 보세요.')}`,
  };
}

export const guidePages = () => GUIDES.map(guidePage);
