// Sinov uchun soxta sinxron server (Supabase o'rniga). Faqat avtomatik sinovlar uchun!
//
//   node scripts/fake-sync-server.mjs            # http://localhost:8787
//   VITE_FAKE_SYNC_URL=http://localhost:8787 npx vite build --mode e2e --outDir dist-e2e
//
// Kirish: istalgan email, parol "parol123".
// Sinov boshqaruvi: POST /__offline {"on": true|false}, GET /__state, POST /__reset
import http from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const PASSWORD = 'parol123';

let records = new Map();
let kv = new Map();
let offline = false;
let lastTs = 0;
const clients = new Set();

const nowIso = () => {
  // qat'iy o'suvchi server vaqti (bir millisekundda bir nechta yozuv bo'lsa ham)
  lastTs = Math.max(Date.now(), lastTs + 1);
  return new Date(lastTs).toISOString();
};

const send = (res, code, body) => {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(body));
};

const broadcast = (ev) => {
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  clients.forEach(c => c.write(line));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', c => { data += c; });
  req.on('end', () => {
    try { resolve(data ? JSON.parse(data) : null); } catch (e) { reject(e); }
  });
});

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'OPTIONS') return send(res, 204, {});

  // --- sinov boshqaruvi ---
  if (url.pathname === '/__offline') {
    offline = Boolean((await readBody(req))?.on);
    if (offline) clients.forEach(c => c.destroy());
    return send(res, 200, { offline });
  }
  if (url.pathname === '/__state') {
    return send(res, 200, { records: [...records.values()], kv: [...kv.values()], offline });
  }
  if (url.pathname === '/__reset') {
    records = new Map(); kv = new Map(); offline = false;
    return send(res, 200, { ok: true });
  }

  if (offline) return send(res, 503, { error: 'server offline' });

  if (url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(': ok\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (url.pathname === '/auth' && req.method === 'POST') {
    const body = await readBody(req);
    return send(res, 200, { ok: body?.password === PASSWORD });
  }
  if (url.pathname === '/all') {
    const since = url.searchParams.get('since');
    const f = r => !since || r.updated_at >= since;
    return send(res, 200, { records: [...records.values()].filter(f), kv: [...kv.values()].filter(f) });
  }
  if (url.pathname === '/records' && req.method === 'POST') {
    const rows = (await readBody(req)) || [];
    rows.forEach(r => {
      const k = `${r.collection}\u0000${r.id}`;
      const prev = records.get(k);
      const ts = nowIso();
      const row = { ...r, id: String(r.id), created_at: prev?.created_at || ts, updated_at: ts };
      records.set(k, row);
      broadcast({ type: 'record', ...row });
    });
    return send(res, 200, { ok: true });
  }
  if (url.pathname === '/kv' && req.method === 'POST') {
    const rows = (await readBody(req)) || [];
    rows.forEach(r => {
      const row = { ...r, updated_at: nowIso() };
      kv.set(r.key, row);
      broadcast({ type: 'kv', ...row });
    });
    return send(res, 200, { ok: true });
  }
  send(res, 404, { error: 'not found' });
}).listen(PORT, () => console.log(`Soxta sinxron server: http://localhost:${PORT}`));
