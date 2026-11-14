// /papers/ , /papers/:id/ — 외부 공개로 승인된 프로젝트 페이퍼의 요약을 서버에서 그려 검색엔진이 읽을 수 있게 한다.
import { siteUrl, verification, SITE } from '../_site/config.js';
import { renderPage, esc, h, breadcrumbHtml } from '../_site/layout.js';
import { ASSET_VERSION } from '../_site/generated.js';
import { FIELDS } from '../_lib/rules.js';

const STATE = { ongoing: '계속 진행', transferred: '이관', stopped: '중단', closed: '종료' };
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const dateKo = s => { const d = new Date(String(s || '').replace(' ', 'T') + 'Z'); return isNaN(d) ? '' : `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };

function html(body, status = 200, maxAge = 300) {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': `public, max-age=${maxAge}`, 'x-content-type-options': 'nosniff' } });
}

async function listPapers(db) {
  if (!db) return [];
  const { results } = await db.prepare("SELECT p.id, p.form, p.published_at, p.updated_at, c.title, c.field_code FROM papers p JOIN challenges c ON c.id = p.challenge_id WHERE p.status IN ('approved','published') AND p.publish_scope = 'public' ORDER BY p.published_at DESC LIMIT 200").all();
  return results.map(r => ({ ...r, form: parse(r.form, {}) }));
}
async function onePaper(db, id) {
  if (!db) return null;
  const r = await db.prepare("SELECT p.id, p.form, p.published_at, p.updated_at, c.title, c.field_code FROM papers p JOIN challenges c ON c.id = p.challenge_id WHERE p.id = ? AND p.status IN ('approved','published') AND p.publish_scope = 'public'").bind(id).first();
  return r ? { ...r, form: parse(r.form, {}) } : null;
}

const card = p => {
  const f = p.form;
  return `<a class="p-card" href="/papers/${p.id}/"><div class="p-tags"><span class="chip">${esc(FIELDS[p.field_code] || '')}</span>${f.has_sales ? '<span class="chip chip-green">매출 발생</span>' : '<span class="chip">매출 없음</span>'}${f.state ? `<span class="chip">${esc(STATE[f.state] || f.state)}</span>` : ''}</div><h2>${esc(f.name || p.title)}</h2>${f.pain ? `<p>${esc(f.pain)}</p>` : ''}<p class="small">외부 고객 ${esc(f.customers_band || '0')}명 · 투입 ${esc(String(f.hours || 0))}시간</p></a>`;
};

function notFound(o) {
  return html(renderPage({ path: '/papers/', title: '공개되지 않은 페이퍼', description: '요청한 프로젝트 페이퍼가 없거나 외부에 공개되지 않았습니다.', noindex: true,
    body: `<section class="notfound"><div class="wrap narrow center"><p class="eyebrow">404</p><h1>공개되지 않은 페이퍼입니다</h1><p class="lead">없는 페이퍼이거나, 그룹이 회원에게만 공개하기로 한 페이퍼입니다. 회원이라면 회원 공간에서 볼 수 있습니다.</p><div class="hero-actions center"><a class="btn btn-primary" href="/papers/">공개 페이퍼 목록</a><a class="btn btn-line" href="/app/#/papers">회원 공간에서 보기</a></div></div></section>` }, o), 404, 60);
}

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url);
  const seg = Array.isArray(params.path) ? params.path.filter(Boolean) : [];
  // 끝에 / 가 붙은 주소 하나로 통일한다
  if (!url.pathname.endsWith('/')) return Response.redirect(url.origin + url.pathname + '/' + url.search, 301);
  const base = siteUrl(env);
  const o = { base, verification: verification(env), assetVersion: ASSET_VERSION };
  const db = env.DB;

  if (seg.length === 0) {
    let list = [];
    try { list = await listPapers(db); } catch (e) { console.error(e); }
    const crumbs = [['홈', '/'], ['프로젝트 페이퍼', '/papers/']];
    const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: '마이챌린지 프로젝트 페이퍼', url: base + '/papers/', mainEntity: { '@type': 'ItemList', itemListElement: list.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${base}/papers/${p.id}/`, name: p.form.name || p.title })) } };
    return html(renderPage({
      path: '/papers/', title: '프로젝트 페이퍼: 12주 사이드프로젝트의 숫자와 회고', ogImage: '/og/papers.png',
      description: '마이챌린지 그룹 챌린지가 12주 동안 무엇을 만들고 얼마나 팔았으며 무엇을 배웠는지 남긴 프로젝트 페이퍼입니다. 매출이 없었던 챌린지와 멈춘 챌린지도 함께 공개합니다.',
      crumbs, jsonld: [ld],
      body: `${h.pageHero('프로젝트 페이퍼', '잘된 길도, 멈춘 길도 기록으로 남깁니다', '그룹이 외부 공개에 동의한 페이퍼의 요약입니다. 매출 유무, 외부 고객 수 구간, 투입 시간은 모든 페이퍼에서 공개합니다. 전문은 어치버(L3) 이상 회원이 볼 수 있습니다.', crumbs, '', { name: 'spot-completed-work', alt: '', frame: false, cls: 'ph-spot' })}
<section class="sec sec-tight"><div class="wrap">
${list.length ? `<div class="paper-list">${list.map(card).join('')}</div>` : `<div class="empty-box"><b>아직 공개된 페이퍼가 없습니다</b>첫 라운드가 끝나면 이곳이 채워집니다. 쓰는 방식이 궁금하다면 <a href="/guide/project-paper/">프로젝트 페이퍼 쓰는 법</a>을 먼저 읽어 보세요.</div>`}
</div></section>
${h.cta('다음 페이퍼의 주인공이 되어 보세요', '12주 동안 그룹으로 실행하고, 결과를 숫자로 남깁니다.')}`,
    }, o));
  }

  const id = Number(seg[0]);
  if (seg.length > 1 || !Number.isInteger(id) || id <= 0) return notFound(o);
  let p = null;
  try { p = await onePaper(db, id); } catch (e) { console.error(e); }
  if (!p) return notFound(o);
  const f = p.form;
  const name = f.name || p.title;
  const path = `/papers/${p.id}/`;
  const crumbs = [['홈', '/'], ['프로젝트 페이퍼', '/papers/'], [name, path]];
  const desc = `${FIELDS[p.field_code] || ''} 분야 그룹 챌린지의 프로젝트 페이퍼. ${f.pain ? f.pain.slice(0, 70) : ''} ${f.has_sales ? '외부 매출 발생' : '매출 없이 종료'}, 외부 고객 ${f.customers_band || '0'}명, 투입 ${f.hours || 0}시간.`.replace(/\s+/g, ' ').trim();
  const published = (p.published_at || '').slice(0, 10);
  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: name, description: desc, inLanguage: 'ko-KR', datePublished: published || undefined, author: { '@type': 'Organization', name: SITE.fullName }, publisher: { '@type': 'Organization', name: SITE.fullName, logo: { '@type': 'ImageObject', url: base + '/icon-512.png' } }, mainEntityOfPage: base + path };
  const lesson = (f.good || [])[0];
  return html(renderPage({
    path, title: `${name} — 프로젝트 페이퍼`, description: desc, ogType: 'article', ogImage: '/og/papers.png', published: published || null, crumbs, jsonld: [ld],
    body: `<div class="wrap article-layout article-page">
<article class="prose article">
  <header class="article-head">
    ${breadcrumbHtml(crumbs)}
    <p class="eyebrow">프로젝트 페이퍼 · ${esc(FIELDS[p.field_code] || '')}</p>
    <h1>${esc(name)}</h1>
    <p class="article-meta"><span>${f.state ? esc(STATE[f.state] || f.state) : ''}</span>${published ? `<span>공개 ${dateKo(p.published_at)}</span>` : ''}</p>
  </header>
  <div class="p-nums"><div><small>외부 매출</small><b>${f.has_sales ? '있음' : '없음'}</b></div><div><small>외부 고객</small><b>${esc(f.customers_band || '0')}명</b></div><div><small>투입 시간</small><b>${esc(String(f.hours || 0))}시간</b></div></div>
  ${f.pain ? `<h2>풀려던 불편</h2><p>${esc(f.pain)}</p>` : ''}
  ${lesson ? `<h2>잘된 것 한 가지</h2><p>${esc(lesson)}</p>` : ''}
  <div class="callout"><strong>전문은 회원 공간에서</strong><p>만든 것, 마일스톤, 숫자, 잘된 것과 안 된 것, 다음 사람에게 남긴 말은 어치버(L3) 이상 회원이 볼 수 있습니다. 그룹이 비공개로 정한 숫자는 회원에게도 보이지 않습니다.</p></div>
  <div class="article-foot"><a class="btn btn-primary btn-sm" href="/app/#/papers/${p.id}">회원 공간에서 전문 보기</a><a class="btn btn-line btn-sm" href="/papers/">다른 페이퍼 보기</a></div>
</article>
<aside class="side">
  <div class="side-box"><b>페이퍼가 궁금하다면</b><ul><li><a href="/guide/project-paper/">프로젝트 페이퍼 쓰는 법</a></li><li><a href="/how-it-works/">12주 운영 방식</a></li></ul></div>
  <div class="side-box side-cta"><b>나도 해 보기</b><p>다음 라운드에서 그룹으로 실행해 보세요.</p><a class="btn btn-primary" href="/apply/">가입 신청</a></div>
</aside>
</div>`,
  }, o));
}
