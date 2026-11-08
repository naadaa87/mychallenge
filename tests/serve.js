// 로컬 미리보기 서버: public/ 정적 파일 + /api → Pages Function (node:sqlite)
// 사용: node tests/serve.js [port]   (MACHAL_DB=파일경로 로 DB 지정, 기본 tests/.tmp/dev.sqlite)
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDb } from './harness.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'public');
mkdirSync(join(here, '.tmp'), { recursive: true });
const dbPath = process.env.MACHAL_DB || join(here, '.tmp', 'dev.sqlite');
const fresh = !existsSync(dbPath);
const db = makeDb(dbPath);
const mod = await import('../functions/api/[[path]].js');
const port = Number(process.argv[2] || 8788);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname.startsWith('/api/')) {
    const chunks = []; for await (const ch of req) chunks.push(ch);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const request = new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
    const out = await mod.onRequest({ request, env: { DB: db }, params: {}, waitUntil() {} });
    const h = {}; out.headers.forEach((v, k) => { h[k] = v; });
    if (h['set-cookie']) h['set-cookie'] = h['set-cookie'].replace('; Secure', '');
    res.writeHead(out.status, h); res.end(Buffer.from(await out.arrayBuffer())); return;
  }
  let p = join(root, decodeURIComponent(url.pathname));
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(root, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(port, () => console.log(`마챌 로컬 서버 http://localhost:${port}  (DB: ${dbPath}${fresh ? ', 새로 만듦' : ''})`));
