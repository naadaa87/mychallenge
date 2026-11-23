// 로컬 테스트용 D1 흉내 — Node 22의 node:sqlite 위에서 Pages Function을 그대로 실행한다.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// 실제 D1의 제한을 로컬에서도 똑같이 건다 (https://developers.cloudflare.com/d1/platform/limits/)
// - 한 compound SELECT(UNION·INTERSECT·EXCEPT)에 들어가는 SELECT는 5개까지
// - 한 쿼리에 묶는 값(? 자리)은 100개까지
export const D1_LIMITS = { compound: 5, params: 100 };
export function checkD1Limits(sql, nParams) {
  if (nParams > D1_LIMITS.params) throw new Error(`D1_ERROR: too many SQL variables (${nParams} > ${D1_LIMITS.params}) — 실제 D1과 동일하게 거부`);
  // 따옴표 안은 건너뛰고, 괄호 깊이마다 UNION/INTERSECT/EXCEPT 개수를 센다
  const stack = [0];
  const src = String(sql);
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "'" || ch === '"') { const q = ch; i++; while (i < src.length && src[i] !== q) i++; continue; }
    if (ch === '(') { stack.push(0); continue; }
    if (ch === ')') { stack.pop(); if (!stack.length) stack.push(0); continue; }
    if (/[A-Za-z]/.test(ch) && (i === 0 || !/[A-Za-z0-9_]/.test(src[i - 1]))) {
      const m = /^(UNION|INTERSECT|EXCEPT)\b/i.exec(src.slice(i, i + 10));
      if (m) { stack[stack.length - 1]++; if (stack[stack.length - 1] + 1 > D1_LIMITS.compound) throw new Error(`D1_ERROR: too many terms in compound SELECT (D1은 ${D1_LIMITS.compound}개까지) — 실제 D1과 동일하게 거부`); i += m[0].length - 1; }
    }
  }
}

class D1Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.params = []; }
  bind(...p) { for (const v of p) { if (v === undefined || typeof v === 'boolean') throw new Error(`D1_TYPE_ERROR: Type '${typeof v}' not supported for value binding (실제 D1과 동일하게 거부) — SQL: ${this.sql.slice(0, 80)}`); } this.params = p; return this; }
  _prep() { checkD1Limits(this.sql, this.params.length); return this.db.prepare(this.sql); }
  async first(col) { const r = this._prep().get(...this.params) ?? null; return col && r ? r[col] : r; }
  async all() { const results = this._prep().all(...this.params); return { results, success: true, meta: {} }; }
  async run() { const r = this._prep().run(...this.params); return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; }
}
export class FakeD1 {
  constructor(path = ':memory:') { this.db = new DatabaseSync(path); this.db.exec('PRAGMA foreign_keys = ON'); }
  prepare(sql) { return new D1Stmt(this.db, sql); }
  async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; }
  async exec(sql) { this.db.exec(sql); return { count: 0, duration: 0 }; }
}

export function makeDb(path = ':memory:') {
  const db = new FakeD1(path);
  db.db.exec(readFileSync(join(here, '..', 'schema.sql'), 'utf8'));
  return db;
}

// Pages Function 라우터를 불러와 fetch 처럼 호출하는 클라이언트
export async function makeClient(db) {
  const mod = await import('../functions/api/[[path]].js');
  const jar = {};
  async function call(method, path, body, { as = 'default' } = {}) {
    const headers = new Headers();
    if (body !== undefined) headers.set('content-type', 'application/json');
    if (jar[as]) headers.set('cookie', jar[as]);
    const req = new Request('http://localhost/api' + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const res = await mod.onRequest({ request: req, env: { DB: db }, params: {}, waitUntil() {} });
    const sc = res.headers.get('set-cookie');
    if (sc) { const m = sc.match(/machal_session=([^;]*)/); if (m) jar[as] = m[1] ? 'machal_session=' + m[1] : undefined; }
    let data = null; try { data = await res.json(); } catch {}
    return { status: res.status, data, ok: res.ok };
  }
  return {
    get: (p, o) => call('GET', p, undefined, o), post: (p, b = {}, o) => call('POST', p, b, o), put: (p, b = {}, o) => call('PUT', p, b, o),
    del: (p, o) => call('DELETE', p, undefined, o),
    jar,
  };
}

// 작은 assert
export function eq(actual, expected, msg) { if (JSON.stringify(actual) !== JSON.stringify(expected)) { throw new Error(`${msg || 'assert'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); } }
export function ok(v, msg) { if (!v) throw new Error(msg || 'assert failed'); }
export async function expectOk(p, msg) { const r = await p; if (!r.ok) throw new Error(`${msg || 'request'} failed ${r.status}: ${r.data?.error}`); return r.data; }
export async function expectFail(p, status, msg) { const r = await p; if (r.ok || (status && r.status !== status)) throw new Error(`${msg || 'request'} should fail with ${status}, got ${r.status} ${JSON.stringify(r.data)}`); return r.data; }
