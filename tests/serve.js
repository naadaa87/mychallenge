// 로컬 미리보기 서버 — Cloudflare Pages 동작을 흉내 낸다
//  · public/ 정적 파일 (끝 / 주소 → index.html, 폴더 주소는 / 붙여 308, 없는 주소는 404.html)
//  · /api/*  → functions/api/[[path]].js
//  · /papers → functions/papers/[[path]].js,  /sitemap.xml, /rss.xml → 각 Function
// 사용: node tests/serve.js [port]   (MACHAL_DB=파일경로 로 DB 지정, 기본 tests/.tmp/dev.sqlite)
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDb } from './harness.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'public');
mkdirSync(join(here, '.tmp'), { recursive: true });
const dbPath = process.env.MACHAL_DB || join(here, '.tmp', 'dev.sqlite');
const fresh = !existsSync(dbPath);
const db = makeDb(dbPath);
const api = await import('../functions/api/[[path]].js');
const papers = await import('../functions/papers/[[path]].js');
const sitemap = await import('../functions/sitemap.xml.js');
const rss = await import('../functions/rss.xml.js');
const port = Number(process.argv[2] || 8788);
const env = { DB: db, SITE_URL: process.env.SITE_URL || `http://localhost:${port}` };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };

async function send(res, out) {
  const h = {};
  out.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
  const cookies = out.headers.getSetCookie ? out.headers.getSetCookie() : [];
  if (cookies.length) h['set-cookie'] = cookies.map(c => c.replace('; Secure', ''));
  res.writeHead(out.status, h); res.end(Buffer.from(await out.arrayBuffer()));
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    const p = decodeURIComponent(url.pathname);
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    if (p.startsWith('/api/')) {
      const chunks = []; for await (const ch of req) chunks.push(ch);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const request = new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
      return send(res, await api.onRequest({ request, env, params: {}, waitUntil() {} }));
    }
    const request = new Request(url, { method: req.method, headers });
    if (p === '/papers' || p.startsWith('/papers/')) return send(res, await papers.onRequestGet({ request, env, params: { path: p.split('/').slice(2).filter(Boolean) } }));
    if (p === '/sitemap.xml') return send(res, await sitemap.onRequestGet({ request, env }));
    if (p === '/rss.xml') return send(res, await rss.onRequestGet({ request, env }));

    const file = normalize(join(root, p));
    if (!file.startsWith(root)) { res.writeHead(400); return res.end(); }
    const serve = (f, status = 200) => { res.writeHead(status, { 'content-type': MIME[extname(f)] || 'application/octet-stream', ...(f.includes('/app/') ? { 'x-robots-tag': 'noindex' } : {}) }); res.end(readFileSync(f)); };
    if (p.endsWith('/index.html')) { res.writeHead(308, { location: p.slice(0, -10) }); return res.end(); }
    if (p.endsWith('/') && existsSync(join(file, 'index.html'))) return serve(join(file, 'index.html'));
    if (existsSync(file) && statSync(file).isFile()) return serve(file);
    if (existsSync(join(file, 'index.html'))) { res.writeHead(308, { location: p + '/' + url.search }); return res.end(); }
    return serve(join(root, '404.html'), 404);
  } catch (e) {
    console.error(e); res.writeHead(500); res.end('server error');
  }
}).listen(port, () => console.log(`마챌 로컬 서버 http://localhost:${port}  (DB: ${dbPath}${fresh ? ', 새로 만듦' : ''})`));
