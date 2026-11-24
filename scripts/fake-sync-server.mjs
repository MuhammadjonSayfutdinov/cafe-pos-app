// Sinov uchun soxta sinxron server (Supabase o'rniga). Faqat avtomatik sinovlar uchun!
//
//   node scripts/fake-sync-server.mjs            # http://localhost:8787
//   VITE_FAKE_SYNC_URL=http://localhost:8787 npx vite build --mode e2e --outDir dist-e2e
//
// Kirish: istalgan email, parol "parol123".
// Sinov boshqaruvi: POST /__offline {"on": true|false}, GET /__state, POST /__reset
// FAKE_OLD_QR_SQL=1: yangilanmagan supabase/qr.sql ni taqlid qiladi (p_ctx parametri yo'q)
import http from 'node:http';
import { createHash } from 'node:crypto';

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

// --- supabase/qr.sql dagi funksiyalarning soddalashtirilgan nusxasi ---
const putRecord = (collection, id, data, updatedBy) => {
  const k = `${collection}\u0000${id}`;
  const prev = records.get(k);
  const ts = nowIso();
  const row = { collection, id: String(id), data, deleted: false, created_at: prev?.created_at || ts, updated_at: ts, updated_by: updatedBy };
  records.set(k, row);
  broadcast({ type: 'record', ...row });
  return row;
};
const live = (collection) => [...records.values()].filter(r => r.collection === collection && !r.deleted);
const tableExists = (t) => {
  const tables = kv.get('pos_tables')?.value;
  return Array.isArray(tables) && tables.some(x => (typeof x === 'string' ? x === t : x?.name === t));
};
const hhmm = () => new Date().toTimeString().slice(0, 5);
const recentQr = (t) => live('pos_qr_requests').filter(r => (!t || r.data.table === t) && Date.now() - Date.parse(r.created_at) < 60000).length;

// supabase/qr.sql -> qr_table_busy, qr_access
const CLOSED = ["To'langan", 'Qarz', 'Arxiv'];
const hintError = (message, hint) => Object.assign(new Error(message), { hint });
const tableBusy = (t) => t !== 'Olib ketish' && live('pos_orders').some(o => o.data.table === t && !CLOSED.includes(o.data.status || ''));
const access = (table, ctxRaw) => {
  const ctx = ctxRaw && typeof ctxRaw === 'object' && !Array.isArray(ctxRaw) ? ctxRaw : {};
  const secret = kv.get('pos_qr_secret')?.value;
  const keyOk = typeof secret === 'string' && secret.length >= 16 && Boolean(ctx.k) &&
    ctx.k === createHash('sha256').update(`${secret}|${table}`, 'utf8').digest('hex').slice(0, 12);
  const busy = tableBusy(table);
  const ids = Array.isArray(ctx.r) ? ctx.r.slice(0, 20).map(String) : [];
  const owner = busy && !keyOk && live('pos_qr_requests').some(q => ids.includes(q.id) && q.data.table === table &&
    q.data.status === 'accepted' && live('pos_orders').some(o => o.id === String(q.data.orderId) && o.data.table === table && !CLOSED.includes(o.data.status || '')));
  const g = kv.get('pos_qr_geofence')?.value;
  const geoOn = Boolean(g && g.enabled === true && typeof g.lat === 'number' && typeof g.lng === 'number');
  const res = { busy, key_ok: keyOk, owner, geo_required: geoOn };
  if (busy && !keyOk && !owner) {
    return { ...res, hint: 'busy', error: "Bu stol band. Shu stolda o'tirgan bo'lsangiz, stoldagi QR kodni telefon kamerasi bilan qayta skaner qiling yoki ofitsiantni chaqiring." };
  }
  if (geoOn) {
    if (typeof ctx.lat !== 'number' || typeof ctx.lng !== 'number') {
      return { ...res, hint: 'geo', error: 'Buyurtma va chaqiruv faqat kafe ichidan qabul qilinadi. Telefon joylashuviga (GPS) ruxsat bering.' };
    }
    const rad = (x) => (x * Math.PI) / 180;
    const a = Math.sin(rad(ctx.lat - g.lat) / 2) ** 2 + Math.cos(rad(g.lat)) * Math.cos(rad(ctx.lat)) * Math.sin(rad(ctx.lng - g.lng) / 2) ** 2;
    const dist = 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
    const acc = typeof ctx.acc === 'number' ? Math.min(Math.max(ctx.acc, 0), 150) : 0;
    const radius = typeof g.radius === 'number' ? Math.min(Math.max(g.radius, 50), 2000) : 200;
    if (dist - acc > radius) {
      const txt = dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`;
      return { ...res, hint: 'far', error: `Siz kafedan taxminan ${txt} uzoqdasiz. Buyurtma va chaqiruv faqat kafe ichidan qabul qilinadi.` };
    }
  }
  return res;
};
const requireAccess = (table, ctx) => {
  const a = access(table, ctx);
  if (a.error) throw hintError(a.error, a.hint);
  return a;
};

const rpc = {
  qr_menu({ p_table, p_ctx }) {
    if (!tableExists(p_table)) throw new Error(`Stol topilmadi: ${p_table}`);
    const menu = live('pos_menu').filter(r => r.data.is_available !== false).map(r => ({
      id: r.data.id, name: r.data.name, category: r.data.category, variants: r.data.variants || [], price: r.data.price, is_available: true
    }));
    const a = access(p_table, p_ctx);
    return {
      table: p_table,
      access: { busy: a.busy, key_ok: a.key_ok, geo_required: a.geo_required, blocked: a.hint === 'busy', message: a.hint === 'busy' ? a.error : null },
      cafe_name: kv.get('pos_cafe_name')?.value, service_fee: kv.get('pos_service_fee')?.value, categories: kv.get('pos_categories')?.value, menu
    };
  },
  qr_submit_order({ p_table, p_items, p_note = '', p_ctx }) {
    if (!tableExists(p_table)) throw new Error(`Stol topilmadi: ${p_table}`);
    const acc = requireAccess(p_table, p_ctx);
    if (!Array.isArray(p_items) || p_items.length === 0 || p_items.length > 30) throw new Error("Savat noto'g'ri (1 dan 30 tagacha taom)");
    if (recentQr(p_table) >= 3) throw new Error("Juda ko'p so'rov. Bir daqiqadan keyin qayta urinib ko'ring");
    if (live('pos_qr_requests').filter(r => r.data.table === p_table && r.data.status === 'pending').length >= 3) {
      throw new Error("Oldingi buyurtmalaringiz hali tasdiqlanmadi. Ofitsiant ko'rib chiqishini kuting");
    }
    const now = Date.now();
    let sub = 0;
    const items = p_items.map((it, i) => {
      const m = live('pos_menu').find(r => r.id === String(it.menu_id) && r.data.is_available !== false)?.data;
      if (!m) throw new Error('Taom topilmadi yoki tugagan. Menyuni yangilang');
      const vs = Array.isArray(m.variants) ? m.variants : [];
      let v = null;
      if (vs.length) {
        v = vs.length === 1 && !it.variant_name ? vs[0] : vs.find(x => x.name === it.variant_name);
        if (!v) throw new Error("Menyu o'zgargan. Sahifani yangilang");
      }
      const price = Number(v ? v.price : m.price) || 0;
      const q = Math.min(Math.max(parseInt(it.quantity, 10) || 1, 1), 20);
      sub += price * q;
      return { cartItemId: `qr_${now}_${i + 1}`, id: m.id, name: vs.length > 1 ? `${m.name} (${v.name})` : m.name, baseName: m.name,
        variantName: v?.name || '1 porsiya', price, quantity: q, note: String(it.note || '').slice(0, 200), category: m.category };
    });
    const id = `qr_${now}_${Math.random().toString(16).slice(2, 10)}`;
    putRecord('pos_qr_requests', id, { id, table: p_table, items, subTotal: sub, note: String(p_note).slice(0, 300), status: 'pending', createdAt: now, time: hhmm(),
      keyOk: acc.key_ok, geoChecked: acc.geo_required }, 'qr');
    return { ok: true, id, items, subTotal: sub };
  },
  qr_call_waiter({ p_table, p_ctx }) {
    if (!tableExists(p_table)) throw new Error(`Stol topilmadi: ${p_table}`);
    const acc = requireAccess(p_table, p_ctx);
    live('pos_calls').filter(r => r.data.table === p_table && Date.now() - Date.parse(r.created_at) > 15 * 60000).forEach(r => {
      const row = { ...r, data: {}, deleted: true, updated_at: nowIso(), updated_by: 'qr' };
      records.set(`pos_calls\u0000${r.id}`, row);
      broadcast({ type: 'record', ...row });
    });
    if (live('pos_calls').some(r => r.data.table === p_table)) return { ok: true, already: true };
    const id = `call_qr_${Date.now()}`;
    putRecord('pos_calls', id, { id, table: p_table, time: hhmm(), createdAt: Date.now(), source: 'qr', keyOk: acc.key_ok }, 'qr');
    return { ok: true, id };
  },
  qr_request_status({ p_ids }) {
    const ids = (p_ids || []).slice(0, 20);
    return [...records.values()].filter(r => r.collection === 'pos_qr_requests' && ids.includes(r.id)).map(r => {
      const status = r.data.status || null;
      if (status !== 'accepted') return { id: r.id, status, orderStatus: null, closed: false };
      const orders = [...records.values()].filter(x => x.collection === 'pos_orders');
      const o = r.data.orderId
        ? orders.find(x => x.id === String(r.data.orderId))
        : orders.find(x => !x.deleted && x.data.table === r.data.table && !CLOSED.includes(x.data.status || ''));
      if (o) return { id: r.id, status, orderStatus: o.data.status || null, closed: o.deleted || CLOSED.includes(o.data.status || '') };
      return { id: r.id, status, orderStatus: null, closed: Number(r.data.handledAt || 0) < Date.now() - 60000 };
    });
  },
  qr_claim_request({ p_id, p_status, p_by = '' }) {
    if (!['accepted', 'rejected'].includes(p_status)) throw new Error(`Noto'g'ri holat: ${p_status}`);
    const r = live('pos_qr_requests').find(x => x.id === p_id);
    if (!r || r.data.status !== 'pending') return { ok: false };
    const data = { ...r.data, status: p_status, handledBy: p_by, handledAt: Date.now() };
    putRecord('pos_qr_requests', p_id, data, 'claim');
    return { ok: true, request: data };
  }
};

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
  if (url.pathname.startsWith('/rpc/') && req.method === 'POST') {
    const name = url.pathname.slice(5);
    const fn = rpc[name];
    if (!fn) return send(res, 404, { message: 'Funksiya topilmadi' });
    try {
      const body = (await readBody(req)) || {};
      if (process.env.FAKE_OLD_QR_SQL === '1' && 'p_ctx' in body) {
        const params = Object.keys(body).sort().join(', ');
        return send(res, 404, { code: 'PGRST202', message: `Could not find the function public.${name}(${params}) in the schema cache` });
      }
      return send(res, 200, fn(body));
    } catch (e) {
      return send(res, 400, { message: e.message, hint: e.hint || '' });
    }
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
