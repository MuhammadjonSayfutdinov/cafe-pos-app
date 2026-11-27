// Sinxronlash dvigateli (transportdan mustaqil).
//
// Ish tartibi:
//  1. Ilova avvalgidek localStorage bilan ishlaydi (internet uzilsa ham to'xtamaydi).
//  2. useSticky har yozganda localWrite() chaqiriladi: oldingi holat bilan solishtirib,
//     faqat o'zgargan yozuvlar "outbox" (yuborish navbati) ga qo'yiladi. Navbat localStorage'da
//     saqlanadi, sahifa yangilansa ham yo'qolmaydi.
//  3. Navbat serverga yuboriladi; internet bo'lmasa keyinroq qayta urinadi.
//  4. Boshqa qurilmalarning o'zgarishlari real vaqtda keladi va localStorage'ga yoziladi;
//     useSticky ularni SAME_TAB_EVENT orqali oladi.
//  5. Qarama-qarshilik: bitta yozuvni ikki qurilma o'zgartirsa, oxirgi yozilgani qoladi.
//     Hali yuborilmagan mahalliy o'zgarish serverdan kelgan eski versiyadan ustun.
//  6. Sekin internet: har bir so'rov vaqti cheklangan (src/sync/timeouts.ts), navbat kichik
//     qismlarda yuboriladi (yuborilgan qism navbatdan darhol o'chadi), dastur ochilganda butun
//     baza emas, faqat oxirgi sinxrondan keyingi o'zgarishlar olinadi (to'liq tekshiruv 6 soatda bir).

import {
  SAME_TAB_EVENT, RECORD_COLLECTIONS, KV_KEYS,
  isRecordCollection, isKvKey, isSyncedKey,
  OUTBOX_KEY, DEVICE_ID_KEY, INIT_IDENTITY_KEY, LAST_SERVER_TS_KEY, LAST_FULL_SYNC_KEY
} from './config';
import { withTimeout } from './timeouts';
import { isAuthRequiredError } from './types';

const FLUSH_DEBOUNCE_MS = 300;
const RETRY_MIN_MS = 2000;
const RETRY_MAX_MS = 60000;
const CATCHUP_INTERVAL_MS = 120000;
// Bitta so'rovda yuboriladigan yozuvlar: sekin internetda katta paket vaqtga sig'may, navbat
// hech qachon bo'shamay qolishi mumkin edi
const PUSH_BATCH = 100;
// Dvigatel darajasidagi zaxira cheklov (transportning o'z cheklovidan keyin ishlaydi)
const PUSH_TIMEOUT_MS = 60000;
const FETCH_TIMEOUT_MS = 180000;
const RPC_TIMEOUT_MS = 20000;
// Bitta rasm (taxminan 100 KB) sekin mobil internetda ham sig'sin
const FILE_UPLOAD_TIMEOUT_MS = 60000;
// Shundan uzoq javob - "sekin internet" (sarlavhadagi belgida ko'rinadi)
const SLOW_MS = 4000;
// Dastur ochilganda butun bazani qayta tekshirish oralig'i (qolgan paytda faqat o'zgarishlar)
const FULL_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

// ---------- yordamchilar ----------
export const recordId = (r) =>
  r && typeof r === 'object' && r.id !== undefined && r.id !== null && r.id !== '' ? String(r.id) : null;

const stable = (v) => JSON.stringify(v === undefined ? null : v);

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const readLocal = (key) => {
  try {
    const raw = storage()?.getItem(key);
    return raw === null || raw === undefined ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
};

/** Ikki ro'yxat orasidagi farq: qo'shilgan/o'zgargan yozuvlar va o'chirilgan id lar. */
export function diffRecords(prevList, nextList) {
  const prev = new Map();
  (Array.isArray(prevList) ? prevList : []).forEach(r => {
    const id = recordId(r);
    if (id) prev.set(id, stable(r));
  });
  const upserts = [];
  const seen = new Set();
  (Array.isArray(nextList) ? nextList : []).forEach(r => {
    const id = recordId(r);
    if (!id || seen.has(id)) return;
    seen.add(id);
    if (prev.get(id) !== stable(r)) upserts.push(r);
  });
  const deletes = [...prev.keys()].filter(id => !seen.has(id));
  return { upserts, deletes };
}

// ---------- holat ----------
let transport = null;
let deviceId = null;
let started = false;      // birinchi sinxron tugadimi
let buffering = null;     // boshlang'ich yuklash paytida kelgan real vaqt hodisalari
let unsubscribe = null;
let flushTimer = null;
let retryTimer = null;
let retryDelay = RETRY_MIN_MS;
let flushing = false;
let catchupTimer = null;
let subscribedOnce = false;
const shadow = new Map(); // har bir kalitning sinxronlangan oxirgi holati
let outbox = new Map();   // opKey -> op

// transport: 'supabase' | 'hub' | 'fake'; upstream: mahalliy serverning bulut bilan aloqasi (faqat hub)
let status = { state: 'disabled', pending: 0, lastSyncAt: null, error: null, email: null, slow: false, transport: null, upstream: null };
const statusListeners = new Set();

function setStatus(patch) {
  status = { ...status, ...patch, pending: outbox.size };
  statusListeners.forEach(fn => {
    try {
      fn(status);
    } catch {
      // tinglovchi xatosi dvigatelni to'xtatmasin
    }
  });
}

export const getSyncStatus = () => status;
export function subscribeSyncStatus(fn) {
  statusListeners.add(fn);
  fn(status);
  return () => statusListeners.delete(fn);
}

/**
 * Server qurilmani tanimadi (mahalliy server paroli o'zgargan yoki qurilma uzilgan):
 * ulash oynasi chiqadi. Yuborilmagan o'zgarishlar navbatda qoladi va qayta ulangach yuboriladi.
 */
function requireAuth(e) {
  if (!isAuthRequiredError(e)) return false;
  started = false;
  subscribedOnce = false;
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (catchupTimer) clearInterval(catchupTimer);
  setStatus({ state: 'auth', error: String(e?.message || e) });
  return true;
}

/** Server so'rovi: vaqt cheklovi va tezlikni o'lchash (sekin bo'lsa status.slow) */
async function timed(promise, ms, label) {
  const t0 = Date.now();
  const result = await withTimeout(promise, ms, label);
  const slow = Date.now() - t0 > SLOW_MS;
  if (slow !== status.slow) setStatus({ slow });
  return result;
}

// ---------- outbox ----------
const opKey = (op) => (op.kind === 'kv' ? `kv:${op.key}` : `rec:${op.collection}:${op.id}`);

function loadOutbox() {
  const list = readLocal(OUTBOX_KEY);
  const map = new Map();
  (Array.isArray(list) ? list : []).forEach(op => {
    if (op && (op.kind === 'kv' || op.kind === 'rec')) map.set(opKey(op), op);
  });
  return map;
}

function saveOutbox() {
  try {
    storage()?.setItem(OUTBOX_KEY, JSON.stringify([...outbox.values()]));
  } catch (e) {
    console.error("Sinxron navbatini saqlab bo'lmadi:", e);
  }
}

function enqueue(op) {
  outbox.set(opKey(op), op);
}

const hasPending = (kind, a, b) => outbox.has(kind === 'kv' ? `kv:${a}` : `rec:${a}:${b}`);

// ---------- mahalliy yozuv ----------
function writeLocalFromRemote(key, value) {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Serverdan kelgan ma'lumotni saqlab bo'lmadi (${key}):`, e);
  }
  shadow.set(key, value);
  window.dispatchEvent(new CustomEvent(SAME_TAB_EVENT, { detail: { key, newValue: value, source: 'remote' } }));
}

/**
 * useSticky (va boshqa yozuvchilar) har bir yozuvdan keyin chaqiradi.
 * seed: komponentning standart (namuna) qiymati. Birinchi sinxrondan oldin u navbatga
 * qo'yilmaydi: aks holda yangi qurilmaning namuna xodimlari (777777, 2222...) va menyusi
 * bulutdagi haqiqiy ma'lumot ustiga yozilardi. Bulut bo'sh bo'lsa, mergeInitial o'zi yuklaydi.
 */
export function localWrite(key, nextValue, { seed = false } = {}) {
  if (!transport || !isSyncedKey(key)) return;
  if (seed && !started) return;
  const prev = shadow.get(key);
  shadow.set(key, nextValue);

  if (isRecordCollection(key)) {
    const { upserts, deletes } = diffRecords(prev, nextValue);
    upserts.forEach(r => enqueue({ kind: 'rec', collection: key, id: recordId(r), data: r, deleted: false }));
    deletes.forEach(id => enqueue({ kind: 'rec', collection: key, id, data: {}, deleted: true }));
    if (!upserts.length && !deletes.length) return;
  } else {
    if (stable(prev) === stable(nextValue)) return;
    enqueue({ kind: 'kv', key, value: nextValue === undefined ? null : nextValue });
  }
  saveOutbox();
  setStatus({});
  scheduleFlush();
}

// Boshqa tabdagi o'zgarish: o'sha tabning dvigateli serverga yuboradi, bu yerda faqat shadow yangilanadi
function handleStorageEvent(e) {
  if (!e.key || !isSyncedKey(e.key)) return;
  try {
    shadow.set(e.key, e.newValue === null ? undefined : JSON.parse(e.newValue));
  } catch {
    // ignore
  }
}

// ---------- serverga yuborish ----------
function scheduleFlush(delay = FLUSH_DEBOUNCE_MS) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, delay);
}

function scheduleRetry(fn) {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    fn();
  }, retryDelay);
  retryDelay = Math.min(RETRY_MAX_MS, retryDelay * 2);
}

// Yuborilgan op larni navbatdan olib tashlaymiz (yuborish paytida qayta o'zgarganlari qoladi)
function settleOps(ops) {
  ops.forEach(o => {
    const k = opKey(o);
    if (outbox.get(k) === o) outbox.delete(k);
  });
  saveOutbox();
  setStatus({});
}

export async function flush() {
  if (!transport || !started || flushing || outbox.size === 0) return;
  flushing = true;
  setStatus({ state: 'syncing' });
  const ops = [...outbox.values()];
  try {
    const recs = ops.filter(o => o.kind === 'rec');
    const kvs = ops.filter(o => o.kind === 'kv');
    // Kichik qismlarda: internet o'rtada uzilsa, yuborib bo'lingan qism qayta yuborilmaydi
    for (let i = 0; i < recs.length; i += PUSH_BATCH) {
      const batch = recs.slice(i, i + PUSH_BATCH);
      await timed(transport.pushRecords(batch.map(o => ({
        collection: o.collection, id: o.id, data: o.data ?? {}, deleted: Boolean(o.deleted), updated_by: deviceId
      }))), PUSH_TIMEOUT_MS, 'Yuborish');
      settleOps(batch);
    }
    if (kvs.length) {
      await timed(
        transport.pushKv(kvs.map(o => ({ key: o.key, value: o.value ?? null, updated_by: deviceId }))),
        PUSH_TIMEOUT_MS, 'Yuborish'
      );
      settleOps(kvs);
    }
    retryDelay = RETRY_MIN_MS;
    setStatus({ state: 'online', lastSyncAt: Date.now(), error: null });
  } catch (e) {
    if (!requireAuth(e)) {
      setStatus({ state: 'offline', error: String(e?.message || e) });
      scheduleRetry(flush);
    }
  } finally {
    flushing = false;
    if (outbox.size > 0 && status.state === 'online') scheduleFlush();
  }
}

// ---------- serverdan qabul qilish ----------
function noteServerTs(ts) {
  if (!ts) return;
  const prev = storage()?.getItem(LAST_SERVER_TS_KEY);
  if (!prev || String(ts) > prev) {
    try {
      storage()?.setItem(LAST_SERVER_TS_KEY, String(ts));
    } catch {
      // ignore
    }
  }
}

function applyRemote(ev) {
  if (!ev) return;
  if (ev.type === 'hub') {
    // Mahalliy server o'zining bulut bilan aloqasi haqida xabar beradi (server/upstream.mjs)
    setStatus({ upstream: ev.upstream || null });
    return;
  }
  if (buffering) {
    buffering.push(ev);
    return;
  }
  noteServerTs(ev.updated_at);
  if (ev.updated_by && ev.updated_by === deviceId) return; // o'zimizning yozuv

  if (ev.type === 'record') {
    const key = ev.collection;
    const id = ev.id === undefined || ev.id === null ? null : String(ev.id);
    if (!isRecordCollection(key) || !id) return;
    if (hasPending('rec', key, id)) return; // mahalliy o'zgarish hali yuborilmagan - u ustun

    const current = readLocal(key);
    const list = Array.isArray(current) ? current : [];
    const idx = list.findIndex(r => recordId(r) === id);
    let next;
    if (ev.deleted) {
      if (idx === -1) return;
      next = list.filter((_, i) => i !== idx);
    } else if (idx === -1) {
      next = RECORD_COLLECTIONS[key] === 'prepend' ? [ev.data, ...list] : [...list, ev.data];
    } else {
      if (stable(list[idx]) === stable(ev.data)) return;
      next = [...list];
      next[idx] = ev.data;
    }
    writeLocalFromRemote(key, next);
  } else if (ev.type === 'kv') {
    if (!isKvKey(ev.key) || hasPending('kv', ev.key)) return;
    if (stable(readLocal(ev.key)) === stable(ev.value)) return;
    writeLocalFromRemote(ev.key, ev.value);
  }
}

// Boshlang'ich birlashtirish: server + mahalliy ma'lumot
function mergeInitial(records, kvRows, { firstTime }) {
  const serverEmpty = records.length === 0 && kvRows.length === 0;

  Object.keys(RECORD_COLLECTIONS).forEach(key => {
    const local = Array.isArray(readLocal(key)) ? readLocal(key) : [];
    const rows = records
      .filter(r => r.collection === key)
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));

    let merged;
    if (serverEmpty) {
      // Birinchi qurilma: bazani shu qurilma ma'lumoti bilan to'ldiramiz
      merged = local;
      local.forEach(r => {
        const id = recordId(r);
        if (id) enqueue({ kind: 'rec', collection: key, id, data: r, deleted: false });
      });
    } else {
      const serverMap = new Map(rows.map(r => [String(r.id), r]));
      merged = [];
      const seen = new Set();
      local.forEach(r => {
        const id = recordId(r);
        if (!id || seen.has(id)) return;
        seen.add(id);
        if (hasPending('rec', key, id)) {
          merged.push(r); // yuborilmagan mahalliy o'zgarish
          return;
        }
        const s = serverMap.get(id);
        if (s) {
          if (!s.deleted) merged.push(s.data);
          return;
        }
        if (!firstTime) {
          // Shu qurilmada oflayn yaratilgan, serverda yo'q
          merged.push(r);
          enqueue({ kind: 'rec', collection: key, id, data: r, deleted: false });
        }
        // firstTime: yangi qurilmadagi standart ma'lumotlar tashlab yuboriladi, server ustun
      });
      const fresh = rows.filter(s => !s.deleted && !seen.has(String(s.id)) && !hasPending('rec', key, String(s.id)));
      if (RECORD_COLLECTIONS[key] === 'prepend') {
        merged = [...fresh.reverse().map(s => s.data), ...merged];
      } else {
        merged = [...merged, ...fresh.map(s => s.data)];
      }
    }

    if (stable(merged) !== stable(local)) writeLocalFromRemote(key, merged);
    else shadow.set(key, local);
  });

  const kvMap = new Map(kvRows.map(r => [r.key, r]));
  KV_KEYS.forEach(key => {
    const local = readLocal(key);
    if (hasPending('kv', key)) {
      shadow.set(key, local);
      return;
    }
    const s = kvMap.get(key);
    if (s) {
      if (stable(s.value) !== stable(local)) writeLocalFromRemote(key, s.value);
      else shadow.set(key, local);
    } else {
      shadow.set(key, local);
      if (local !== undefined && (serverEmpty || !firstTime)) {
        enqueue({ kind: 'kv', key, value: local });
      }
    }
  });

  [...records, ...kvRows].forEach(r => noteServerTs(r.updated_at));
  saveOutbox();
}

async function initialSync() {
  buffering = [];
  if (!unsubscribe) {
    unsubscribe = transport.subscribe(applyRemote, handleRealtimeStatus);
  }
  try {
    const identity = await transport.identity();
    const firstTime = storage()?.getItem(INIT_IDENTITY_KEY) !== identity;
    const since = storage()?.getItem(LAST_SERVER_TS_KEY) || null;
    const lastFull = Number(storage()?.getItem(LAST_FULL_SYNC_KEY) || 0);
    const incremental = !firstTime && Boolean(since) && Date.now() - lastFull < FULL_SYNC_INTERVAL_MS;

    if (incremental) {
      // Qurilmadagi ma'lumot yangi: faqat oxirgi sinxrondan keyingi o'zgarishlar (sekin internetda tez)
      const { records, kv } = await timed(transport.fetchAll(since), FETCH_TIMEOUT_MS, 'Yuklash');
      buffering = [
        ...records.map(r => ({ type: 'record', ...r })),
        ...kv.map(r => ({ type: 'kv', ...r })),
        ...buffering
      ];
    } else {
      const { records, kv } = await timed(transport.fetchAll(null), FETCH_TIMEOUT_MS, 'Yuklash');
      mergeInitial(records, kv, { firstTime });
      try {
        storage()?.setItem(LAST_FULL_SYNC_KEY, String(Date.now()));
      } catch {
        // ignore
      }
    }
    try {
      storage()?.setItem(INIT_IDENTITY_KEY, identity);
    } catch {
      // ignore
    }
    started = true;
  } finally {
    const queued = buffering || [];
    buffering = null;
    if (started) queued.forEach(applyRemote);
  }
  retryDelay = RETRY_MIN_MS;
  setStatus({ state: 'online', lastSyncAt: Date.now(), error: null });
  scheduleCatchup();
  flush();
}

/** Uzilishdan keyin o'tkazib yuborilgan o'zgarishlarni olish */
export async function catchUp() {
  if (!transport || !started) return;
  try {
    const since = storage()?.getItem(LAST_SERVER_TS_KEY) || null;
    const { records, kv } = await timed(transport.fetchAll(since), FETCH_TIMEOUT_MS, 'Yuklash');
    records.forEach(r => applyRemote({ type: 'record', ...r }));
    kv.forEach(r => applyRemote({ type: 'kv', ...r }));
    if (status.state === 'offline' && outbox.size === 0) setStatus({ state: 'online', error: null });
  } catch (e) {
    if (requireAuth(e)) return;
    setStatus({ state: 'offline', error: String(e?.message || e) });
  }
  flush();
}

function scheduleCatchup() {
  if (catchupTimer) clearInterval(catchupTimer);
  catchupTimer = setInterval(catchUp, CATCHUP_INTERVAL_MS);
}

function handleRealtimeStatus(s) {
  if (s === 'SUBSCRIBED') {
    if (subscribedOnce && started) catchUp(); // qayta ulandi: o'tkazib yuborilganlarni olamiz
    subscribedOnce = true;
  } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
    if (started) setStatus({ state: 'offline' });
  }
}

let initialRunning = null;
async function startWithRetry() {
  if (started) return;
  if (initialRunning) return initialRunning; // parallel ikkinchi ishga tushirish bo'lmasin
  initialRunning = (async () => {
    try {
      await initialSync();
    } catch (e) {
      if (!requireAuth(e)) {
        setStatus({ state: 'offline', error: String(e?.message || e) });
        scheduleRetry(startWithRetry);
      }
    } finally {
      initialRunning = null;
    }
  })();
  return initialRunning;
}

// ---------- tashqi API ----------

/**
 * Qurilma shu kafe hisobi bilan hali birorta ham to'liq sinxron qilmaganmi.
 * Bunday qurilmada ilova bulut ma'lumoti kelguncha ochilmaydi (SyncGate): uning
 * xotirasida faqat namuna ma'lumot bor.
 */
export const isFirstSyncPending = () => !started && !storage()?.getItem(INIT_IDENTITY_KEY);

/** Transport yuklanayotganda: ilova o'rniga yuklanish ekrani ko'rinsin */
export function markBooting() {
  setStatus({ state: 'booting' });
}

/** Ilova ishga tushganda (App chizilishidan oldin) chaqiriladi. transport null bo'lsa - o'chiq. */
export function configureSync(transportInstance) {
  transport = transportInstance || null;
  if (!transport) {
    setStatus({ state: 'disabled' });
    return;
  }
  deviceId = storage()?.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      storage()?.setItem(DEVICE_ID_KEY, deviceId);
    } catch {
      // ignore
    }
  }
  setStatus({ transport: transport.kind || null });
  outbox = loadOutbox();
  [...Object.keys(RECORD_COLLECTIONS), ...KV_KEYS].forEach(key => shadow.set(key, readLocal(key)));

  window.addEventListener('storage', handleStorageEvent);
  // Internet qaytdi: kutish oralig'ini tiklab, darhol yuboramiz
  window.addEventListener('online', () => {
    retryDelay = RETRY_MIN_MS;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (started) catchUp();
    else if (status.state !== 'auth') startWithRetry();
  });
  window.addEventListener('offline', () => {
    if (status.state !== 'auth' && status.state !== 'disabled') setStatus({ state: 'offline', error: "Internet yo'q" });
  });
  // Planshet uyqudan yoki boshqa ilovadan qaytdi: o'tkazib yuborilgan o'zgarishlarni olamiz
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && started) catchUp();
  });
  setStatus({ state: 'booting' });
}

/** Saqlangan sessiya bo'lsa sinxronni boshlaydi, bo'lmasa kirish ekranini so'raydi. */
export async function bootSync() {
  if (!transport) return;
  let session = null;
  try {
    session = await transport.getSession();
  } catch {
    session = null;
  }
  if (!session) {
    setStatus({ state: 'auth' });
    return;
  }
  setStatus({ state: 'booting', email: session.user?.email || null });
  await startWithRetry();
}

export async function signIn(email, password) {
  if (!transport) throw new Error("Sinxronlash sozlanmagan");
  const session = await transport.signIn(email, password);
  // Boshqa kafe hisobiga ulandi: oldingi hisobning "birinchi sinxron bo'lgan" belgisi o'chadi
  try {
    if (storage()?.getItem(INIT_IDENTITY_KEY) !== await transport.identity()) {
      storage()?.removeItem(INIT_IDENTITY_KEY);
    }
  } catch {
    // ignore
  }
  setStatus({ state: 'booting', email: session?.user?.email || email, error: null });
  await startWithRetry();
}

/** Qurilmani bulutdan uzish. Yuborilmagan o'zgarishlar bo'lsa, force=true talab qilinadi. */
export async function signOut({ force = false } = {}) {
  if (!transport) return { ok: true };
  if (outbox.size > 0 && !force) return { ok: false, pending: outbox.size };
  try {
    await transport.signOut();
  } catch {
    // tarmoq bo'lmasa ham mahalliy sessiyani tozalaymiz
  }
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  started = false;
  subscribedOnce = false;
  outbox.clear();
  saveOutbox();
  try {
    storage()?.removeItem(INIT_IDENTITY_KEY);
    storage()?.removeItem(LAST_SERVER_TS_KEY);
    storage()?.removeItem(LAST_FULL_SYNC_KEY);
  } catch {
    // ignore
  }
  if (catchupTimer) clearInterval(catchupTimer);
  setStatus({ state: 'auth', email: null, error: null });
  return { ok: true };
}

export function syncNow() {
  if (started) catchUp();
  else startWithRetry();
}

export const getDeviceId = () => deviceId;

/** Bulut rasm ombori bormi (taom rasmlari bulutga yuklanadimi yoki menyu yozuvida saqlanadimi) */
export const canUploadFiles = () => Boolean(transport && typeof transport.uploadPublicFile === 'function');

/** Ochiq faylni bulutga yuklash; havolasini qaytaradi. Ombor yo'q bo'lsa - xato */
export async function uploadPublicFile(path, file) {
  if (!canUploadFiles()) throw new Error("Bulut rasm ombori ulanmagan");
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error("Internet yo'q");
  }
  return withTimeout(transport.uploadPublicFile(path, file), FILE_UPLOAD_TIMEOUT_MS, 'Rasm yuklash');
}

/** Ombordagi fayllarni o'chirish. Xato bo'lsa jim o'tadi: ortiqcha fayl ishni to'xtatmasin */
export async function removePublicFiles(paths) {
  const list = (Array.isArray(paths) ? paths : []).filter(Boolean);
  if (list.length === 0 || !transport || typeof transport.removePublicFiles !== 'function') return;
  try {
    await withTimeout(transport.removePublicFiles(list), RPC_TIMEOUT_MS, "Rasm o'chirish");
  } catch (e) {
    console.warn("Eski rasmlarni ombordan o'chirib bo'lmadi:", e);
  }
}

/** Server funksiyasini chaqirish (masalan, qr_claim_request). Sinxron o'chiq bo'lsa - xato. */
export async function callRpc(fn, args) {
  if (!transport || typeof transport.rpc !== 'function') {
    throw new Error("Bulut sinxronlash ulanmagan");
  }
  // Tugma bosilganda kutiladi: sekin internetda xodim uzoq kutib qolmasin
  return withTimeout(transport.rpc(fn, args), RPC_TIMEOUT_MS, 'Server');
}
