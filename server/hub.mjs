// @ts-check
// Kafe mahalliy serveri: internet bo'lmasa ham kafedagi qurilmalar (ofitsiant, oshxona, kassa)
// bir-biri bilan ma'lumot almashadi. Qo'llanma: MAHALLIY-SERVER.md
//
//   npm run build      (bir marta va har yangilanishda)
//   npm run hub        (shu kompyuterda server ishga tushadi)
//
// Qurilmalar brauzerda http://<shu kompyuter IP si>:8080 ni ochadi va server parolini kiritadi.
// Internet bo'lsa server bulut (Supabase) bilan ham sinxronlanadi (server/upstream.mjs).

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.mjs';
import { createUpstream } from './upstream.mjs';
import { createSupabaseAdapter, createFakeAdapter } from './upstream-adapters.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- sozlamalar (.env.local yoki muhit o'zgaruvchilari) ----------
for (const f of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(ROOT, f));
  } catch {
    // fayl yo'q
  }
}
const env = process.env;
const PORT = Number(env.HUB_PORT || 8080);
const HOST = env.HUB_HOST || '0.0.0.0';
const PASSWORD = String(env.HUB_PASSWORD || '');
const DATA_DIR = path.resolve(ROOT, env.HUB_DATA_DIR || 'hub-data');
const DIST_DIR = path.resolve(ROOT, env.HUB_DIST_DIR || 'dist');
const ALLOW_ORIGIN = env.HUB_ALLOW_ORIGIN || ''; // faqat dasturchi uchun (vite dev server)

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 1000;
const AUTH_MAX_FAILS = 10;
const AUTH_LOCK_MS = 5 * 60 * 1000;
const RPC_ALLOWED = new Set(['qr_claim_request', 'qr_menu']);
const COLLECTION_RE = /^pos_[a-z0-9_]{1,40}$/;

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
const fail = (msg) => {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
};

if (PASSWORD.length < 8) {
  fail("HUB_PASSWORD kamida 8 belgi bo'lishi kerak. .env.local fayliga yozing, masalan:\n   HUB_PASSWORD=kafe-serveri-2026\n   (qo'llanma: MAHALLIY-SERVER.md)");
}
if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  fail(`Dastur yig'ilmagan (${DIST_DIR}/index.html yo'q). Avval: npm run build`);
}

// ---------- ma'lumotlar ----------
const store = createStore(DATA_DIR);
if (!store.getMeta().hubId) store.setMeta({ hubId: `hub_${crypto.randomBytes(6).toString('hex')}` });
const HUB_ID = /** @type {string} */ (store.getMeta().hubId);

// ---------- qurilma tokenlari ----------
// Parol o'zgarsa, barcha qurilmalar qayta ulanadi (eski tokenlar bekor bo'ladi)
const TOKENS_PATH = path.join(DATA_DIR, 'tokens.json');
const passwordTag = crypto.createHash('sha256').update(`cafe-hub|${PASSWORD}`).digest('hex');
/** @type {{ passwordTag: string, tokens: Record<string, { createdAt: number, ip: string, ua: string }> }} */
let tokenDb = { passwordTag, tokens: {} };
try {
  const saved = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
  if (saved?.passwordTag === passwordTag && saved.tokens) tokenDb = saved;
  else if (saved?.passwordTag) log("server paroli o'zgargan: barcha qurilmalar qayta ulanishi kerak");
} catch {
  // birinchi ishga tushish
}
const saveTokens = () => {
  const tmp = `${TOKENS_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(tokenDb, null, 1));
  fs.renameSync(tmp, TOKENS_PATH);
};
saveTokens();

const tokenHash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const isValidToken = (t) => Boolean(t) && Object.prototype.hasOwnProperty.call(tokenDb.tokens, tokenHash(t));

function passwordMatches(input) {
  const a = crypto.createHash('sha256').update(String(input)).digest();
  const b = crypto.createHash('sha256').update(PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

/** @type {Map<string, { fails: number, until: number }>} */
const authFails = new Map();

// ---------- real vaqt (SSE): qurilmalarga o'zgarishlarni darhol yetkazish ----------
/** @type {Set<http.ServerResponse>} */
const clients = new Set();
const broadcast = (ev) => {
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  clients.forEach(c => c.write(line));
};
setInterval(() => clients.forEach(c => c.write(': ping\n\n')), 25000).unref();

// ---------- bulut ----------
async function makeAdapter() {
  if (env.HUB_FAKE_UPSTREAM_URL) return createFakeAdapter({ url: env.HUB_FAKE_UPSTREAM_URL });
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (!env.HUB_SUPABASE_EMAIL || !env.HUB_SUPABASE_PASSWORD) {
    log("⚠️  Supabase sozlangan, lekin HUB_SUPABASE_EMAIL / HUB_SUPABASE_PASSWORD yo'q: server bulutsiz ishlaydi");
    return null;
  }
  return createSupabaseAdapter({ url, anonKey, email: env.HUB_SUPABASE_EMAIL, password: env.HUB_SUPABASE_PASSWORD });
}

const upstream = createUpstream({
  store,
  adapter: await makeAdapter(),
  hubId: HUB_ID,
  onRemoteRow: broadcast,
  onStatus: (s) => broadcast({ type: 'hub', upstream: s }),
  log
});

// ---------- HTTP yordamchilari ----------
const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co", "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.telegram.org",
    "manifest-src 'self'", "worker-src 'self'", "object-src 'none'", "base-uri 'self'",
    "form-action 'self'", "frame-ancestors 'none'"
  ].join('; '),
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};

function corsHeaders(req) {
  if (!ALLOW_ORIGIN || req.headers.origin !== ALLOW_ORIGIN) return {};
  return {
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin'
  };
}

function sendJson(req, res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...corsHeaders(req)
  });
  res.end(JSON.stringify(body));
}

const readBody = (req) => new Promise((resolve, reject) => {
  let size = 0;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY_BYTES) {
      reject(Object.assign(new Error("So'rov juda katta"), { status: 413 }));
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', () => {
    try {
      const text = Buffer.concat(chunks).toString('utf8');
      resolve(text ? JSON.parse(text) : null);
    } catch {
      reject(Object.assign(new Error("JSON noto'g'ri"), { status: 400 }));
    }
  });
  req.on('error', reject);
});

const clientIp = (req) => String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');

function bearer(req, url) {
  const h = String(req.headers.authorization || '');
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return url.searchParams.get('token') || '';
}

const isPlainObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const validId = (id) => (typeof id === 'string' || typeof id === 'number') && String(id).length > 0 && String(id).length <= 200;

// ---------- API ----------
async function handleApi(req, res, url) {
  const route = url.pathname.slice('/api'.length);

  if (route === '/auth' && req.method === 'POST') {
    const ip = clientIp(req);
    const f = authFails.get(ip);
    if (f && f.until > Date.now()) {
      return sendJson(req, res, 429, { message: `Juda ko'p xato urinish. ${Math.ceil((f.until - Date.now()) / 60000)} daqiqadan keyin urinib ko'ring` });
    }
    const body = await readBody(req);
    if (!passwordMatches(body?.password ?? '')) {
      const next = { fails: (f && !f.until ? f.fails : 0) + 1, until: 0 };
      if (next.fails >= AUTH_MAX_FAILS) next.until = Date.now() + AUTH_LOCK_MS;
      authFails.set(ip, next);
      log(`noto'g'ri server paroli: ${ip}`);
      return sendJson(req, res, 401, { message: "Server paroli noto'g'ri" });
    }
    authFails.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    tokenDb.tokens[tokenHash(token)] = { createdAt: Date.now(), ip, ua: String(req.headers['user-agent'] || '').slice(0, 200) };
    saveTokens();
    log(`yangi qurilma ulandi: ${ip}`);
    return sendJson(req, res, 200, { token, hubId: HUB_ID });
  }

  const token = bearer(req, url);
  if (!isValidToken(token)) return sendJson(req, res, 401, { message: 'Qurilma serverga ulanmagan' });

  if (route === '/logout' && req.method === 'POST') {
    delete tokenDb.tokens[tokenHash(token)];
    saveTokens();
    return sendJson(req, res, 200, { ok: true });
  }

  if (route === '/status' && req.method === 'GET') {
    return sendJson(req, res, 200, { hubId: HUB_ID, upstream: upstream.getStatus(), ...store.stats(), clients: clients.size });
  }

  if (route === '/all' && req.method === 'GET') {
    return sendJson(req, res, 200, store.since(url.searchParams.get('since') || null));
  }

  if (route === '/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      ...corsHeaders(req)
    });
    res.write('retry: 3000\n\n');
    res.write(`data: ${JSON.stringify({ type: 'hub', upstream: upstream.getStatus() })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return undefined;
  }

  if (route === '/records' && req.method === 'POST') {
    const rows = await readBody(req);
    if (!Array.isArray(rows) || rows.length > MAX_ROWS) return sendJson(req, res, 400, { message: "Yozuvlar ro'yxati noto'g'ri" });
    const bad = rows.find(r => !isPlainObject(r) || !COLLECTION_RE.test(String(r.collection)) || !validId(r.id) ||
      (!r.deleted && !isPlainObject(r.data)));
    if (bad) return sendJson(req, res, 400, { message: "Noto'g'ri yozuv" });
    rows.forEach(r => {
      const row = store.putRecord({
        collection: r.collection,
        id: String(r.id),
        data: r.deleted ? {} : r.data,
        deleted: Boolean(r.deleted),
        updated_by: typeof r.updated_by === 'string' ? r.updated_by.slice(0, 100) : null
      });
      if (row) broadcast({ type: 'record', ...row });
    });
    upstream.kick();
    return sendJson(req, res, 200, { ok: true });
  }

  if (route === '/kv' && req.method === 'POST') {
    const rows = await readBody(req);
    if (!Array.isArray(rows) || rows.length > MAX_ROWS) return sendJson(req, res, 400, { message: "Sozlamalar ro'yxati noto'g'ri" });
    if (rows.some(r => !isPlainObject(r) || !COLLECTION_RE.test(String(r.key)))) {
      return sendJson(req, res, 400, { message: "Noto'g'ri sozlama" });
    }
    rows.forEach(r => {
      const row = store.putKv({
        key: r.key,
        value: r.value ?? null,
        updated_by: typeof r.updated_by === 'string' ? r.updated_by.slice(0, 100) : null
      });
      if (row) broadcast({ type: 'kv', ...row });
    });
    upstream.kick();
    return sendJson(req, res, 200, { ok: true });
  }

  const rpcMatch = route.match(/^\/rpc\/([a-z_]+)$/);
  if (rpcMatch && req.method === 'POST') {
    if (!RPC_ALLOWED.has(rpcMatch[1])) return sendJson(req, res, 404, { message: 'Funksiya topilmadi' });
    const args = (await readBody(req)) || {};
    try {
      return sendJson(req, res, 200, await upstream.rpc(rpcMatch[1], args));
    } catch (e) {
      const err = /** @type {any} */ (e);
      return sendJson(req, res, err?.status === 503 ? 503 : 502, { message: String(err?.message || err) });
    }
  }

  return sendJson(req, res, 404, { message: 'Topilmadi' });
}

// ---------- dastur fayllari (dist) ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8'
};

// Sahifa shu serverdan ochilganini dastur shu belgidan biladi (src/sync/index.js)
const HUB_META = '<meta name="cafe-hub" content="1" />';

function serveStatic(req, res, url) {
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    rel = '/';
  }
  let file = path.join(DIST_DIR, path.normalize(rel));
  if (file !== DIST_DIR && !file.startsWith(DIST_DIR + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  const isFile = fs.existsSync(file) && fs.statSync(file).isFile();
  if (!isFile) {
    // Sahifa manzili (fayl emas): dastur o'zi; topilmagan fayl: 404
    if (path.extname(rel)) {
      res.writeHead(404, SECURITY_HEADERS);
      res.end('Topilmadi');
      return;
    }
    file = path.join(DIST_DIR, 'index.html');
  }

  const ext = path.extname(file).toLowerCase();
  const isIndex = file === path.join(DIST_DIR, 'index.html');
  const cache = rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
  let body = fs.readFileSync(file);
  if (isIndex) body = Buffer.from(body.toString('utf8').replace('<head>', `<head>\n    ${HUB_META}`));
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': rel === '/version.json' ? 'no-store' : cache,
    ...SECURITY_HEADERS
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://hub.local');
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(req));
      res.end();
      return;
    }
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end();
      return;
    }
    serveStatic(req, res, url);
  } catch (e) {
    const err = /** @type {any} */ (e);
    if (!res.headersSent) sendJson(req, res, err?.status || 500, { message: String(err?.message || 'Server xatosi') });
    if (!err?.status) console.error(e);
  }
});

server.on('error', (e) => {
  const err = /** @type {any} */ (e);
  if (err?.code === 'EADDRINUSE') fail(`${PORT}-port band: server allaqachon ishlayaptimi? Boshqa port: HUB_PORT=8081`);
  fail(String(err?.message || err));
});

server.listen(PORT, HOST, () => {
  const addrs = Object.values(os.networkInterfaces()).flat()
    .filter(a => a && a.family === 'IPv4' && !a.internal)
    .map(a => `http://${a?.address}:${PORT}`);
  console.log('\n☕ Kafe mahalliy serveri ishga tushdi');
  console.log(`   Qurilmalarda shu manzilni oching: ${addrs.join('  yoki  ') || `http://localhost:${PORT}`}`);
  console.log(`   Ma'lumotlar: ${DATA_DIR} (${store.stats().records} yozuv)`);
  console.log(`   Bulut: ${upstream.getStatus().state === 'disabled' ? "ulanmagan (faqat kafe ichida ishlaydi)" : 'ulanmoqda...'}`);
  console.log("   To'xtatish: Ctrl+C\n");
  upstream.start();
});

function shutdown() {
  log("server to'xtatilmoqda...");
  upstream.stop();
  try {
    store.compact();
  } catch (e) {
    console.error(e);
  }
  clients.forEach(c => c.end());
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
