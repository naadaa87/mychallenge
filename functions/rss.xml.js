// /rss.xml — 가이드 새 글과 외부 공개 페이퍼 (네이버 서치어드바이저 RSS 제출용)
import { siteUrl, SITE } from './_site/config.js';
import { GUIDES_META } from './_site/generated.js';

const x = s => String(s ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const rfc822 = d => new Date(d).toUTCString();

export async function onRequestGet({ env }) {
  const base = siteUrl(env);
  const items = GUIDES_META.map(g => ({ title: g.title, link: `${base}/guide/${g.slug}/`, description: g.description, category: g.category, date: `${g.published}T00:00:00+09:00` }));
  try {
    if (env.DB) {
      const { results } = await env.DB.prepare("SELECT p.id, p.form, p.published_at, c.title FROM papers p JOIN challenges c ON c.id = p.challenge_id WHERE p.status IN ('approved','published') AND p.publish_scope = 'public' ORDER BY p.published_at DESC LIMIT 30").all();
      for (const p of results) {
        let f = {}; try { f = JSON.parse(p.form || '{}'); } catch {}
        items.push({ title: `프로젝트 페이퍼: ${f.name || p.title}`, link: `${base}/papers/${p.id}/`, description: f.pain || '마이챌린지 그룹 챌린지의 프로젝트 페이퍼입니다.', category: '프로젝트 페이퍼', date: String(p.published_at || '').replace(' ', 'T') + 'Z' });
      }
    }
  } catch (e) { console.error(e); }
  items.sort((a, b) => (a.date < b.date ? 1 : -1));
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${x(SITE.fullName)} — 사이드프로젝트 가이드와 프로젝트 페이퍼</title>
  <link>${base}/</link>
  <description>사이드프로젝트로 첫 매출을 만드는 12주 모임 마이챌린지의 가이드와 프로젝트 기록</description>
  <language>ko</language>
  <atom:link href="${base}/rss.xml" rel="self" type="application/rss+xml"/>
  <lastBuildDate>${rfc822(items[0]?.date || Date.now())}</lastBuildDate>
${items.map(i => `  <item>
    <title>${x(i.title)}</title>
    <link>${x(i.link)}</link>
    <guid isPermaLink="true">${x(i.link)}</guid>
    <description>${x(i.description)}</description>
    <category>${x(i.category)}</category>
    <pubDate>${rfc822(i.date)}</pubDate>
  </item>`).join('\n')}
</channel>
</rss>
`;
  return new Response(body, { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
