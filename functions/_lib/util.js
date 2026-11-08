import { DEFAULT_SETTINGS, deepMerge, quarterOf, LEVELS, levelIndex } from './rules.js';

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
export const bad = (m, extra) => new HttpError(400, m, extra);
export const unauth = (m = '로그인이 필요합니다') => new HttpError(401, m);
export const forbid = (m = '권한이 없습니다') => new HttpError(403, m);
export const notfound = (m = '찾을 수 없습니다') => new HttpError(404, m);

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}

export async function readJson(request) {
  try { const t = await request.text(); return t ? JSON.parse(t) : {}; } catch { throw bad('잘못된 JSON 본문입니다'); }
}

export const parseJ = (s, d = null) => { if (s == null || s === '') return d; try { return JSON.parse(s); } catch { return d; } };
export const J = v => JSON.stringify(v ?? null);
export const nowIso = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
export const today = () => new Date().toISOString().slice(0, 10);

// ---------- DB helpers (D1) ----------
export async function one(db, sql, ...params) { return db.prepare(sql).bind(...params).first(); }
export async function all(db, sql, ...params) { const r = await db.prepare(sql).bind(...params).all(); return r.results || []; }
export async function run(db, sql, ...params) { return db.prepare(sql).bind(...params).run(); }
export async function insert(db, sql, ...params) { const r = await run(db, sql, ...params); return r.meta?.last_row_id ?? r.lastInsertRowid; }

// ---------- settings ----------
let _settingsCache = null;
export async function getSettings(db) {
  const rows = await all(db, 'SELECT key, value FROM settings');
  let over = {};
  for (const r of rows) over[r.key] = parseJ(r.value, undefined);
  const merged = deepMerge(DEFAULT_SETTINGS, over);
  _settingsCache = merged;
  return merged;
}

// ---------- auth ----------
const enc = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return `pbkdf2$100000$${b64(salt)}$${b64(bits)}`;
}
export async function verifyPassword(pw, stored) {
  try {
    const [, iter, saltB, hashB] = stored.split('$');
    const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB), iterations: Number(iter) }, key, 256);
    return b64(bits) === hashB;
  } catch { return false; }
}
export function randomToken(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}
export function inviteCode() { return 'MC-' + randomToken(3).toUpperCase(); }

export function getCookie(request, name) {
  const c = request.headers.get('cookie') || '';
  for (const part of c.split(';')) { const [k, ...v] = part.trim().split('='); if (k === name) return decodeURIComponent(v.join('=')); }
  return null;
}
export const COOKIE = 'machal_session';
export function sessionCookie(token, maxAgeSec = 60 * 60 * 24 * 30) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAgeSec}`;
}
export function clearCookie() { return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`; }

export async function currentUser(db, request) {
  const token = getCookie(request, COOKIE);
  if (!token) return null;
  const s = await one(db, 'SELECT user_id, expires_at FROM sessions WHERE token = ?', token);
  if (!s) return null;
  if (s.expires_at < nowIso()) { await run(db, 'DELETE FROM sessions WHERE token = ?', token); return null; }
  const u = await one(db, 'SELECT id, email, name, nickname, phone, level, role, status, has_business, interests, bio, onboarded, asset_diag, created_at FROM users WHERE id = ?', s.user_id);
  if (!u || u.status === 'removed') return null;
  return u;
}

export function requireUser(u) { if (!u) throw unauth(); return u; }
export function requireStaff(u) { requireUser(u); if (u.role !== 'staff') throw forbid('운영진만 할 수 있습니다'); return u; }
export function requireLevel(u, lvl, msg) {
  requireUser(u);
  if (u.role === 'staff') return u;
  const effective = u.status === 'dormant' ? 'L0' : u.level;
  if (levelIndex(effective) < levelIndex(lvl)) throw forbid(msg || `${lvl} 등급부터 이용할 수 있습니다`);
  return u;
}
export const isStaff = u => !!u && u.role === 'staff';
export const lvlAtLeast = (u, lvl) => !!u && (u.role === 'staff' || (u.status !== 'dormant' && levelIndex(u.level) >= levelIndex(lvl)));

// ---------- points ----------
export async function addPoints(db, settings, userId, action, refType = null, refId = null) {
  const rule = settings.points[action];
  if (!rule || !rule.points) return 0;
  if (rule.daily_cap > 0) {
    const r = await one(db, "SELECT COUNT(*) AS c FROM points_ledger WHERE user_id = ? AND action = ? AND date(created_at) = date('now')", userId, action);
    if ((r?.c || 0) >= rule.daily_cap) return 0;
  }
  await run(db, 'INSERT INTO points_ledger (user_id, action, points, ref_type, ref_id, quarter) VALUES (?,?,?,?,?,?)', userId, action, rule.points, refType, refId, quarterOf());
  return rule.points;
}
export async function pointsOf(db, userId) {
  const t = await one(db, 'SELECT COALESCE(SUM(points),0) AS s FROM points_ledger WHERE user_id = ?', userId);
  const q = await one(db, 'SELECT COALESCE(SUM(points),0) AS s FROM points_ledger WHERE user_id = ? AND quarter = ?', userId, quarterOf());
  return { total: t?.s || 0, quarter: q?.s || 0 };
}

// L1 → L2 자동 승급 판정
export async function maybeAutoPromote(db, settings, userId) {
  const u = await one(db, 'SELECT id, level, role, asset_diag, created_at, onboarded FROM users WHERE id = ?', userId);
  if (!u || u.level !== 'L1' || !u.onboarded) return false;
  const rule = settings.levels.L2;
  const pts = await pointsOf(db, userId);
  if (pts.total < rule.points) return false;
  if (rule.require_asset_diag && !u.asset_diag) return false;
  const ev = await one(db, "SELECT COUNT(*) AS c FROM registrations WHERE user_id = ? AND status = 'attended'", userId);
  if ((ev?.c || 0) < (rule.require_event || 0)) return false;
  const days = await one(db, "SELECT (julianday('now') - julianday(created_at)) AS d FROM users WHERE id = ?", userId);
  if ((days?.d || 0) < (rule.min_days || 0)) return false;
  await setLevel(db, userId, 'L2', '조건 충족 자동 승급', null);
  await notify(db, userId, '메이커가 되셨습니다', '그룹 챌린지에 그룹원으로 참여할 수 있습니다. 다음 라운드 모집을 확인해 보세요.', '#/challenges');
  return true;
}

export async function setLevel(db, userId, to, reason, actorId) {
  const u = await one(db, 'SELECT level FROM users WHERE id = ?', userId);
  await run(db, 'UPDATE users SET level = ? WHERE id = ?', to, userId);
  await run(db, 'INSERT INTO level_history (user_id, from_level, to_level, reason, decided_by) VALUES (?,?,?,?,?)', userId, u?.level || null, to, reason, actorId);
}

export async function grantBadge(db, userId, code, actorId, evidence = null) {
  await run(db, 'INSERT INTO badges (user_id, code, granted_by, evidence) VALUES (?,?,?,?)', userId, code, actorId, evidence);
}
export async function badgeCount(db, userId, code) {
  const r = await one(db, 'SELECT COUNT(*) AS c FROM badges WHERE user_id = ? AND code = ? AND revoked_at IS NULL', userId, code);
  return r?.c || 0;
}

// ---------- notifications / audit ----------
export async function notify(db, userId, title, body = null, link = null) {
  if (!userId) return;
  await run(db, 'INSERT INTO notifications (user_id, title, body, link) VALUES (?,?,?,?)', userId, title, body, link);
}
export async function notifyStaff(db, title, body = null, link = null) {
  const staff = await all(db, "SELECT id FROM users WHERE role = 'staff' AND status = 'active'");
  for (const s of staff) await notify(db, s.id, title, body, link);
}
export async function audit(db, actorId, action, target = null, detail = null) {
  await run(db, 'INSERT INTO audit_logs (actor_id, action, target, detail) VALUES (?,?,?,?)', actorId, action, target, detail ? J(detail) : null);
}

// ---------- misc ----------
export function pick(obj, keys) { const o = {}; for (const k of keys) if (obj[k] !== undefined) o[k] = obj[k]; return o; }
export function str(v, max = 2000) { if (v == null) return null; const s = String(v).trim(); return s.length > max ? s.slice(0, max) : s; }
export function must(v, name) { if (v === undefined || v === null || String(v).trim() === '') throw bad(`${name}을(를) 입력해 주세요`); return v; }
export function intv(v, name, { min = null, max = null } = {}) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) throw bad(`${name}은(는) 숫자여야 합니다`);
  if (min !== null && n < min) throw bad(`${name}은(는) ${min} 이상이어야 합니다`);
  if (max !== null && n > max) throw bad(`${name}은(는) ${max} 이하여야 합니다`);
  return n;
}
export const LEVEL_LIST = LEVELS;
