// /sitemap.xml — 공개 페이지, 가이드, 외부 공개 페이퍼
import { siteUrl } from './_site/config.js';
import { ROUTES } from './_site/generated.js';

const x = s => String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

export async function onRequestGet({ env }) {
  const base = siteUrl(env);
  const urls = ROUTES.map(r => ({ loc: base + r.path, lastmod: r.lastmod, priority: r.priority }));
  let latestPaper = null;
  try {
    if (env.DB) {
      const { results } = await env.DB.prepare("SELECT id, COALESCE(updated_at, published_at) AS lastmod FROM papers WHERE status IN ('approved','published') AND publish_scope = 'public' ORDER BY id").all();
      for (const p of results) {
        const lm = String(p.lastmod || '').slice(0, 10);
        if (!latestPaper || lm > latestPaper) latestPaper = lm;
        urls.push({ loc: `${base}/papers/${p.id}/`, lastmod: lm, priority: 0.6 });
      }
    }
  } catch (e) { console.error(e); }
  urls.push({ loc: base + '/papers/', lastmod: latestPaper || ROUTES[0]?.lastmod, priority: 0.7 });
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${x(u.loc)}</loc>${u.lastmod ? `<lastmod>${x(u.lastmod)}</lastmod>` : ''}<priority>${Number(u.priority).toFixed(1)}</priority></url>`).join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
