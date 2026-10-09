// Fortis Monthly Planner — zero-dependency server: static app + accounts + per-user plan storage (SQLite).
// Requires Node >= 22.13 (built-in node:sqlite). Config via env: PORT, DATA_DIR, SESSION_SECRET, ALLOW_SIGNUP, TRUST_PROXY.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = +process.env.PORT || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const ALLOW_SIGNUP = (process.env.ALLOW_SIGNUP ?? 'true').toLowerCase() !== 'false';
const TRUST_PROXY = (process.env.TRUST_PROXY ?? 'true').toLowerCase() !== 'false';
const COOKIE = 'fmp_session';
const SESSION_DAYS = 30;
const MAX_BODY = 5 * 1024 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ── secret: env var, else generated once and kept next to the database ── */
function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const f = path.join(DATA_DIR, '.session-secret');
  try { return fs.readFileSync(f, 'utf8').trim(); } catch { /* first run */ }
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}
const SECRET = loadSecret();

/* ── database ── */
const db = new DatabaseSync(path.join(DATA_DIR, 'planner.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS plans (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
const q = {
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  userById: db.prepare('SELECT id, email, name FROM users WHERE id = ?'),
  insertUser: db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)'),
  userCount: db.prepare('SELECT COUNT(*) AS n FROM users'),
  getPlan: db.prepare('SELECT data, version, updated_at FROM plans WHERE user_id = ?'),
  insertPlan: db.prepare('INSERT INTO plans (user_id, data, version) VALUES (?, ?, 1)'),
  updatePlan: db.prepare("UPDATE plans SET data = ?, version = version + 1, updated_at = datetime('now') WHERE user_id = ? AND version = ?"),
};

/* ── passwords & sessions ── */
const b64u = b => Buffer.from(b).toString('base64url');
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `s1$${salt.toString('base64')}$${crypto.scryptSync(pw, salt, 64).toString('base64')}`;
}
function verifyPassword(pw, stored) {
  const [v, salt, hash] = String(stored).split('$');
  if (v !== 's1') return false;
  const a = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), 64), b = Buffer.from(hash, 'base64');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const DUMMY_HASH = hashPassword('not-a-real-password'); // equalises timing for unknown emails
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
function makeToken(uid) {
  const body = b64u(JSON.stringify({ uid, exp: Date.now() + SESSION_DAYS * 864e5 }));
  return `${body}.${sign(body)}`;
}
function readToken(tok) {
  if (!tok) return null;
  const [body, mac] = tok.split('.');
  if (!body || !mac) return null;
  const good = sign(body);
  if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
  try { const o = JSON.parse(Buffer.from(body, 'base64url').toString()); return o.exp > Date.now() ? o.uid : null; } catch { return null; }
}
const parseCookies = h => Object.fromEntries((h || '').split(';').map(c => c.trim().split(/=(.*)/s).slice(0, 2)).filter(p => p[0]));
const isHttps = req => !!req.socket.encrypted || (TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
function setSession(req, res, uid) {
  res.setHeader('Set-Cookie', `${COOKIE}=${makeToken(uid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${isHttps(req) ? '; Secure' : ''}`);
}
const clearSession = (req, res) => res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps(req) ? '; Secure' : ''}`);
const authUser = req => { const uid = readToken(parseCookies(req.headers.cookie)[COOKIE]); return uid ? q.userById.get(uid) || null : null; };

/* ── tiny rate limiter for auth endpoints ── */
const hits = new Map();
function limited(req, key, max = 10, windowMs = 15 * 60e3) {
  const ip = (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
  const k = key + ':' + ip, now = Date.now(); let h = hits.get(k);
  if (!h || h.reset < now) h = { n: 0, reset: now + windowMs };
  h.n++; hits.set(k, h);
  return h.n > max;
}
setInterval(() => { const n = Date.now(); for (const [k, h] of hits) if (h.reset < n) hits.delete(k); }, 60e3).unref();

/* ── http helpers ── */
function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); } });
    req.on('error', reject);
  });
}
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

/* ── API ── */
async function api(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'planner') return send(res, 403, { error: 'Forbidden' }); // CSRF guard (also needs SameSite cookie)

  if (route === 'GET /api/config') return send(res, 200, { allowSignup: ALLOW_SIGNUP || q.userCount.get().n === 0 });

  if (route === 'POST /api/signup') {
    if (limited(req, 'auth')) return send(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
    if (!ALLOW_SIGNUP && q.userCount.get().n > 0) return send(res, 403, { error: 'Sign-ups are closed on this server.' });
    const b = await readJson(req);
    const email = String(b.email || '').trim().toLowerCase(), name = String(b.name || '').trim().slice(0, 80), pw = String(b.password || '');
    if (!EMAIL.test(email)) return send(res, 400, { error: 'Enter a valid email address.' });
    if (!name) return send(res, 400, { error: 'Enter your name.' });
    if (pw.length < 8 || pw.length > 200) return send(res, 400, { error: 'Password must be at least 8 characters.' });
    if (q.userByEmail.get(email)) return send(res, 409, { error: 'An account with this email already exists.' });
    const { lastInsertRowid } = q.insertUser.run(email, name, hashPassword(pw));
    setSession(req, res, Number(lastInsertRowid));
    return send(res, 201, { user: { id: Number(lastInsertRowid), email, name } });
  }

  if (route === 'POST /api/login') {
    if (limited(req, 'auth')) return send(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
    const b = await readJson(req);
    const u = q.userByEmail.get(String(b.email || '').trim().toLowerCase());
    const ok = verifyPassword(String(b.password || ''), u ? u.password_hash : DUMMY_HASH) && u;
    if (!ok) return send(res, 401, { error: 'Email or password is incorrect.' });
    setSession(req, res, u.id);
    return send(res, 200, { user: { id: u.id, email: u.email, name: u.name } });
  }

  if (route === 'POST /api/logout') { clearSession(req, res); return send(res, 200, { ok: true }); }

  const user = authUser(req);
  if (route === 'GET /api/me') return send(res, 200, { user });
  if (!user) return send(res, 401, { error: 'Please sign in.' });

  if (route === 'GET /api/plan') {
    const row = q.getPlan.get(user.id);
    return send(res, 200, row ? { data: JSON.parse(row.data), version: row.version, updatedAt: row.updated_at } : { data: null, version: 0 });
  }

  if (route === 'PUT /api/plan') {
    const b = await readJson(req);
    const d = b.data;
    if (!d || typeof d !== 'object' || !d.plan || !Array.isArray(d.tasks) || !Array.isArray(d.projects) || !Array.isArray(d.team)) return send(res, 400, { error: 'Invalid plan.' });
    const text = JSON.stringify(d), base = Number.isInteger(b.version) ? b.version : -1;
    if (base === 0) {
      if (q.getPlan.get(user.id)) { const r = q.getPlan.get(user.id); return send(res, 409, { error: 'Plan changed elsewhere.', version: r.version }); }
      q.insertPlan.run(user.id, text);
      return send(res, 200, { version: 1 });
    }
    const r = q.updatePlan.run(text, user.id, base);
    if (!r.changes) { const cur = q.getPlan.get(user.id); return send(res, 409, { error: 'Plan changed elsewhere.', version: cur ? cur.version : 0 }); }
    return send(res, 200, { version: base + 1 });
  }

  return send(res, 404, { error: 'Not found' });
}

/* ── static files ── */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(PUBLIC, path.normalize(rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    const etag = `"${st.size}-${Math.floor(st.mtimeMs)}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, ETag: etag, 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', CSP);
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/healthz') return send(res, 200, { ok: true });
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, url);
  } catch (e) {
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Server error' });
    if (!e.status) console.error(e);
  }
});
server.listen(PORT, '0.0.0.0', () => console.log(`Fortis Monthly Planner on http://localhost:${PORT}  (data: ${DATA_DIR}, sign-ups ${ALLOW_SIGNUP ? 'open' : 'closed after first user'})`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => { db.close(); process.exit(0); }));
