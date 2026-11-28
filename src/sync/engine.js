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
//  7. Cheklar (pos_orders) - 5-banddan istisno: har versiyada kelib chiqish belgisi (_rev, _revs).
//     Ikki qurilma bir chekni bir vaqtda o'zgartirsa, chek taom darajasida birlashtiriladi va qayta
//     yuboriladi (src/sync/mergeOrder.ts); eskirgan (kechikkan) versiya yangisini bosib ketmaydi.
//  8. Server xavfsizligi (supabase/security.sql, bo'lsa): ishga tushishda qurilma o'zini tanitadi
//     (pos_device_hello). Tasdiqlanmagan qurilma sinxronlanmaydi (holat 'device', SyncGate tasdiqlash
//     oynasini ko'rsatadi). Server aytgan yashirin to'plamlar (mijozlar, xarajatlar...) qurilmadan
//     o'chiriladi, ochilganlari to'liq yuklanadi. Yozish pos_push_records / pos_push_kv orqali: ruxsat
//     yo'q yozuv navbatni to'xtatmaydi, "kutmoqda" (held) ro'yxatiga o'tadi va xodim kirgach qayta
//     yuboriladi. Xodim yozuviga shu qurilmaning PIN keshi qo'shiladi (src/utils/verifierCache.ts).

import {
  SAME_TAB_EVENT, RECORD_COLLECTIONS, KV_KEYS,
  isRecordCollection, isKvKey, isSyncedKey,
  OUTBOX_KEY, DEVICE_ID_KEY, INIT_IDENTITY_KEY, LAST_SERVER_TS_KEY, LAST_FULL_SYNC_KEY
} from './config';
import { withTimeout } from './timeouts';
import { isAuthRequiredError } from './types';
import { ancestorsOf, commonAncestor, mergeOrder3, relationOf, revOf, sameContent, stampRev } from './mergeOrder';
import { newId } from '../utils/ids';
import {
  VERIFIER_SEEDED_KEY, decorateUsers, pruneVerifiers, readVerifierCache, refreshFromOwnWrite,
  seedFromUsers, writeVerifierCache
} from '../utils/verifierCache';

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
// Server xavfsizligi (supabase/security.sql): qurilma holati va ruxsat yozuvi faqat shu qurilmada
const SECURITY_KEY = 'pos_sync_security';
const HELD_KEY = 'pos_sync_held';
// Qurilma holatini (bloklanmaganmi, xodim sessiyasi) tekshirish oralig'i
const HELLO_INTERVAL_MS = 5 * 60 * 1000;
// Tasdiqlanmagan qurilma: boshqa qurilmada tasdiqlanganini bilish uchun
const DEVICE_POLL_MS = 15000;
const USERS_KEY = 'pos_users';

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
// Server rad etgan (ruxsat yo'q) yozuvlar: opKey -> { op, reason, at }. Xodim kirgach qayta yuboriladi
let held = new Map();
// Server xavfsizligi: installed - security.sql bormi (null - hali noma'lum), status - qurilma holati,
// staff - serverda PIN bilan kirgan xodim, hidden - bu qurilmaga ko'rinmaydigan to'plamlar
const EMPTY_SECURITY = Object.freeze({ installed: null, status: null, staff: null, hidden: null, label: '', lockedS: 0 });
let security = { ...EMPTY_SECURITY };
let helloTimer = null;
let devicePollTimer = null;

// ---------- cheklarni birlashtirish (7-band, src/sync/mergeOrder.ts) ----------
const MERGE_COLLECTIONS = new Set(['pos_orders']);
const HISTORY_LIMIT = 400;
const MERGE_WINDOW_MS = 60000;
const MERGE_LIMIT = 6;
const serverCopy = new Map(); // "pos_orders:<id>" -> shu qurilma bilgan oxirgi server versiyasi (o'zi yuborgani ham)
const history = new Map();    // _rev -> versiya (umumiy otani topish uchun, faqat xotirada)
const mergeLog = new Map();   // "pos_orders:<id>" -> birlashtirish vaqtlari (cheksiz aylanishdan himoya)
const mergeKey = (collection, id) => `${collection}:${id}`;

function rememberServer(collection, id, data) {
  if (!MERGE_COLLECTIONS.has(collection) || !data || typeof data !== 'object') return;
  serverCopy.set(mergeKey(collection, id), data);
  const rev = revOf(data);
  if (!rev) return;
  history.delete(rev);
  history.set(rev, data);
  if (history.size > HISTORY_LIMIT) history.delete(history.keys().next().value);
}

function mergeAllowed(key) {
  const now = Date.now();
  const recent = (mergeLog.get(key) || []).filter(t => now - t < MERGE_WINDOW_MS);
  if (recent.length >= MERGE_LIMIT) return false;
  mergeLog.set(key, [...recent, now]);
  return true;
}

function safeMerge(base, a, b) {
  try {
    return mergeOrder3(base, a, b);
  } catch (e) {
    console.warn('Chekni birlashtirib bo\'lmadi:', e);
    return null;
  }
}

const readLocalRecord = (collection, id) =>
  (Array.isArray(readLocal(collection)) ? readLocal(collection) : []).find(r => recordId(r) === id) || null;

function writeMergedLocal(collection, id, data) {
  const list = Array.isArray(readLocal(collection)) ? readLocal(collection) : [];
  const idx = list.findIndex(r => recordId(r) === id);
  const next = idx === -1
    ? (RECORD_COLLECTIONS[collection] === 'prepend' ? [data, ...list] : [...list, data])
    : list.map((r, i) => (i === idx ? data : r));
  writeLocalFromRemote(collection, next);
}

/**
 * Serverdan kelgan chek versiyasi: kelib chiqishiga qarab qabul, e'tiborsiz yoki birlashtirish.
 * true - hal qilindi; false - eski usul (yuborilmagan mahalliy o'zgarish ustun, aks holda qabul).
 */
function applyRemoteMerge(collection, id, incoming) {
  const key = mergeKey(collection, id);
  const pendingOp = outbox.get(`rec:${collection}:${id}`) || null;
  if (pendingOp && pendingOp.deleted) return false;
  const known = serverCopy.get(key) || pendingOp?.base || null;
  const rel = relationOf(known, incoming);
  if (rel === 'unknown') return false;
  if (rel === 'same' || rel === 'older') return true; // kechikkan (eski) xabar: yangisini bosib ketmasin

  const local = readLocalRecord(collection, id) || pendingOp?.data || null;
  if (rel === 'newer') {
    rememberServer(collection, id, incoming);
    if (!pendingOp || !local) return false; // oddiy qabul
    // Yuborilmagan mahalliy o'zgarish: asosi - known, ikkalasi birlashtiriladi
    const merged = mergeAllowed(key) ? safeMerge(known, local, incoming) : null;
    if (!merged) return false;
    writeMergedLocal(collection, id, merged);
    // Ikkinchi ota - kelgan versiya: yuborilgan natija uni o'z ichiga olgani belgisida ko'rinsin
    enqueue({ ...pendingOp, data: merged, base: incoming, mergedWith: { _rev: revOf(incoming), _revs: ancestorsOf(incoming) } });
    saveOutbox();
    setStatus({});
    scheduleFlush();
    return true;
  }

  // Bir vaqtda o'zgartirilgan (ikki qurilma bir asosdan): umumiy ota bo'yicha birlashtirish
  const baseRev = commonAncestor(known, incoming, rev => history.has(rev));
  const base = baseRev ? history.get(baseRev) : null;
  // Birlashtirib bo'lmadi: eski usul. Yuborilmagan o'zgarish bo'lsa kelgan versiya "server holati"
  // deb yozilmaydi: aks holda yuborilganda u kelgan versiyadan kelib chiqqandek ko'rinib, ikkinchi
  // qurilma o'z o'zgarishini birlashtira olmasdi
  if (!base || !mergeAllowed(key)) {
    if (!pendingOp) rememberServer(collection, id, incoming);
    return false;
  }
  let merged = safeMerge(base, known, incoming);
  if (!merged) {
    if (!pendingOp) rememberServer(collection, id, incoming);
    return false;
  }
  if (pendingOp && local) {
    const withLocal = safeMerge(known, local, merged);
    if (withLocal) merged = withLocal;
  }
  rememberServer(collection, id, incoming);
  if (!pendingOp && sameContent(merged, incoming)) return false; // kelgan versiya hammasini o'z ichiga oladi
  writeMergedLocal(collection, id, merged);
  enqueue({
    kind: 'rec', collection, id, data: merged, deleted: false, base: incoming,
    // ikkinchi ota: yuborilganda kelib chiqish belgisiga qo'shiladi
    mergedWith: { _rev: revOf(known), _revs: ancestorsOf(known) }
  });
  saveOutbox();
  setStatus({});
  scheduleFlush();
  return true;
}

// transport: 'supabase' | 'hub' | 'fake'; upstream: mahalliy serverning bulut bilan aloqasi (faqat hub)
let status = {
  state: 'disabled', pending: 0, held: 0, lastSyncAt: null, error: null, email: null, slow: false,
  transport: null, upstream: null, security: EMPTY_SECURITY
};
const statusListeners = new Set();

function setStatus(patch) {
  status = { ...status, ...patch, pending: outbox.size, held: held.size, security };
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
  const k = opKey(op);
  outbox.set(k, op);
  // Yangi o'zgarish kutayotgan (rad etilgan) eskisining o'rnini egallaydi
  if (held.delete(k)) saveHeld();
}

function loadHeld() {
  const list = readLocal(HELD_KEY);
  const map = new Map();
  (Array.isArray(list) ? list : []).forEach(h => {
    if (h && h.op && (h.op.kind === 'kv' || h.op.kind === 'rec')) map.set(opKey(h.op), h);
  });
  return map;
}

function saveHeld() {
  try {
    if (held.size === 0) storage()?.removeItem(HELD_KEY);
    else storage()?.setItem(HELD_KEY, JSON.stringify([...held.values()]));
  } catch (e) {
    console.error("Rad etilgan o'zgarishlarni saqlab bo'lmadi:", e);
  }
}

const isHeld = (kind, a, b) => held.has(kind === 'kv' ? `kv:${a}` : `rec:${a}:${b}`);

const hasPending = (kind, a, b) => outbox.has(kind === 'kv' ? `kv:${a}` : `rec:${a}:${b}`);

// ---------- mahalliy yozuv ----------
// Xodim yozuviga shu qurilmaning PIN keshi qo'shiladi: internetsiz ham kirish mumkin
function decorateLocal(key, value) {
  if (key !== USERS_KEY || !Array.isArray(value)) return value;
  return decorateUsers(value, readVerifierCache());
}

function writeLocalFromRemote(key, rawValue) {
  const value = decorateLocal(key, rawValue);
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
    upserts.forEach(r => {
      const id = recordId(r);
      const op = { kind: 'rec', collection: key, id, data: r, deleted: false };
      if (MERGE_COLLECTIONS.has(key)) {
        // O'zgarish qaysi server versiyasidan boshlangani (birlashtirish uchun asos)
        const prevOp = outbox.get(`rec:${key}:${id}`);
        const base = prevOp ? prevOp.base : serverCopy.get(mergeKey(key, id));
        if (base) op.base = base;
        if (prevOp?.mergedWith) op.mergedWith = prevOp.mergedWith;
      }
      enqueue(op);
    });
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

// ---------- server xavfsizligi (8-band, supabase/security.sql) ----------
const secureWrites = () => Boolean(transport?.secure) && security.installed === true;

const errText = (e) => `${e?.code || ''} ${e?.message || e || ''}`;
/** Server funksiyasi yo'q: security.sql ishga tushirilmagan */
const isMissingFunction = (e) => /PGRST202|could not find the function|function .* does not exist/i.test(errText(e));
/** Ruxsat yo'q (RLS / huquq): to'g'ridan-to'g'ri yozish yopilgan yoki qurilma tasdiqlanmagan */
const isPermissionError = (e) => /42501|permission denied|pos_device_not_trusted/i.test(errText(e));

function saveSecurity() {
  try {
    storage()?.setItem(SECURITY_KEY, JSON.stringify(security));
  } catch {
    // ignore
  }
}

function setSecurityState(patch) {
  security = { ...security, ...patch };
  saveSecurity();
  setStatus({});
}

/** Rad etilgan yozuvlar: kalit -> sabab */
function rejectedKeys(res, kind) {
  const map = new Map();
  (Array.isArray(res?.rejected) ? res.rejected : []).forEach(r => {
    if (!r) return;
    const k = kind === 'kv' ? `kv:${r.key}` : `rec:${r.collection}:${r.id}`;
    map.set(k, String(r.reason || 'rejected'));
  });
  return map;
}

function holdOps(ops, reasons) {
  if (!ops.length) return;
  ops.forEach(o => {
    const k = opKey(o);
    if (outbox.get(k) !== o) return; // yuborish paytida yana o'zgardi: yangisi navbatda qoladi
    outbox.delete(k);
    held.set(k, { op: o, reason: reasons.get(k) || 'rejected', at: Date.now() });
  });
  saveHeld();
  saveOutbox();
  setStatus({});
  console.warn(`Server ${ops.length} ta o'zgarishni qabul qilmadi (ruxsat yo'q):`, [...new Set(reasons.values())].join(', '));
}

/** Server o'zi saqlagan ko'rinish (masalan, PIN xeshisiz xodim yozuvi) shu qurilmaga ham yoziladi */
function applyServerRecord(collection, id, data) {
  if (!isRecordCollection(collection) || !id || hasPending('rec', collection, id)) return;
  const list = Array.isArray(readLocal(collection)) ? readLocal(collection) : [];
  const idx = list.findIndex(r => recordId(r) === id);
  const next = idx === -1
    ? (RECORD_COLLECTIONS[collection] === 'prepend' ? [data, ...list] : [...list, data])
    : list.map((r, i) => (i === idx ? data : r));
  writeLocalFromRemote(collection, next);
}

function applyChanged(res, rows) {
  const list = Array.isArray(res?.changed) ? res.changed : [];
  if (list.length === 0) return;
  // Shu qurilma o'zi yangi PIN bergan xodim keshda bo'lsa, kesh ham yangilanadi
  let cache = readVerifierCache();
  const before = cache;
  list.forEach(c => {
    if (!c || c.collection !== USERS_KEY) return;
    const sent = rows.find(r => r.collection === USERS_KEY && r.id === String(c.id));
    if (sent) cache = refreshFromOwnWrite(cache, sent.data);
  });
  if (cache !== before) writeVerifierCache(cache);
  list.forEach(c => {
    if (c && c.id !== undefined && c.id !== null) applyServerRecord(c.collection, String(c.id), c.data);
  });
}

function removeLocal(key) {
  try {
    storage()?.removeItem(key);
  } catch {
    // ignore
  }
  shadow.set(key, undefined);
  window.dispatchEvent(new CustomEvent(SAME_TAB_EVENT, { detail: { key, newValue: undefined, source: 'remote' } }));
}

/** Bu qurilmaga ko'rinmaydigan to'plamlar qurilmadan o'chadi (yuborilmagan o'zgarishlar qoladi) */
function purgeHidden(hiddenSet) {
  const incomplete = new Set(Array.isArray(security.incomplete) ? security.incomplete : []);
  let marked = false;
  Object.keys(RECORD_COLLECTIONS).forEach(key => {
    if (!hiddenSet.has(key) && !hiddenSet.has('*')) return;
    if (!incomplete.has(key)) {
      incomplete.add(key);
      marked = true;
    }
    const list = readLocal(key);
    if (!Array.isArray(list)) {
      // Kalit yo'q: bo'sh ro'yxat yoziladi (komponent namuna ma'lumotni qo'yib, yubormasin)
      if (list === undefined) writeLocalFromRemote(key, []);
      return;
    }
    if (list.length === 0) return;
    const keep = list.filter(r => {
      const id = recordId(r);
      return id && (hasPending('rec', key, id) || isHeld('rec', key, id));
    });
    if (keep.length !== list.length) writeLocalFromRemote(key, keep);
  });
  if (marked) setSecurityState({ incomplete: [...incomplete] });
}

/** Endi ko'rinadigan to'plamlarni serverdan to'liq yuklash (avval yashirin edi) */
let loadingCollections = null;
async function loadIncomplete() {
  const hidden = new Set(Array.isArray(security.hidden) ? security.hidden : []);
  const keys = (Array.isArray(security.incomplete) ? security.incomplete : [])
    .filter(k => isRecordCollection(k) && !hidden.has(k) && !hidden.has('*'));
  if (keys.length === 0 || !transport || typeof transport.fetchSome !== 'function' || loadingCollections) return;
  loadingCollections = (async () => {
    try {
      const { records } = await timed(transport.fetchSome({ collections: keys }), FETCH_TIMEOUT_MS, 'Yuklash');
      mergeInitial(records, [], { firstTime: true, onlyKeys: keys });
      records.forEach(r => noteServerTs(r.updated_at));
      const left = (Array.isArray(security.incomplete) ? security.incomplete : []).filter(k => !keys.includes(k));
      setSecurityState({ incomplete: left });
    } catch (e) {
      console.warn("Ochilgan ma'lumotni yuklab bo'lmadi (keyinroq qayta urinadi):", e);
    } finally {
      loadingCollections = null;
    }
  })();
  return loadingCollections;
}

/** Bloklangan qurilma: maxfiy ma'lumot va PIN keshi qurilmadan o'chadi */
function wipeRevoked() {
  purgeHidden(new Set(['*']));
  ['pos_telegram_config', 'pos_qr_secret'].forEach(removeLocal);
  writeVerifierCache({});
  try {
    storage()?.removeItem(LAST_SERVER_TS_KEY);
    storage()?.removeItem(LAST_FULL_SYNC_KEY);
  } catch {
    // ignore
  }
}

function stopDevicePoll() {
  if (devicePollTimer) clearTimeout(devicePollTimer);
  devicePollTimer = null;
}

/** Qurilma tasdiqlanmagan yoki bloklangan: sinxron to'xtaydi, tasdiqlash oynasi chiqadi */
function enterDeviceState() {
  started = false;
  subscribedOnce = false;
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  if (catchupTimer) clearInterval(catchupTimer);
  if (helloTimer) clearInterval(helloTimer);
  setStatus({ state: 'device', error: null });
  stopDevicePoll();
  devicePollTimer = setTimeout(() => {
    devicePollTimer = null;
    if (status.state === 'device') startWithRetry();
  }, security.status === 'revoked' ? 60000 : DEVICE_POLL_MS);
}

/**
 * Server qurilma holatini yubordi (pos_device_hello, xodim kirishi/chiqishi): ruxsatni qo'llash.
 * Yashirin bo'lgan to'plam qurilmadan o'chadi, ochilgani yuklanadi, xodim almashsa rad etilgan
 * yozuvlar qayta yuboriladi.
 */
export function applyDeviceState(state) {
  if (!state || typeof state !== 'object' || state.installed !== true) return;
  const prevStaff = security.staff?.id || null;
  const hidden = Array.isArray(state.hidden) ? state.hidden.map(String) : [];
  const staff = state.staff && state.staff.id !== undefined && state.staff.id !== null
    ? { id: String(state.staff.id), name: String(state.staff.name || ''), until: state.staff.until || null }
    : null;
  setSecurityState({
    installed: true,
    status: String(state.status || ''),
    staff,
    hidden,
    label: String(state.label || ''),
    lockedS: Number(state.locked_s) || 0
  });
  if (security.status !== 'trusted') {
    if (security.status === 'revoked') wipeRevoked();
    if (started) enterDeviceState();
    return;
  }
  if (!started) return; // ishga tushish (initialSync) o'zi o'chiradi va yuklaydi
  purgeHidden(new Set(hidden));
  loadIncomplete();
  if ((staff?.id || null) !== prevStaff) retryHeld();
}

async function deviceHello() {
  if (!transport?.secure || typeof transport.rpc !== 'function') return null;
  let res;
  try {
    res = await timed(transport.rpc('pos_device_hello', {
      p_device_key: deviceId || '',
      p_label: '',
      p_user_agent: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 300) : ''
    }), RPC_TIMEOUT_MS, 'Server');
  } catch (e) {
    if (isMissingFunction(e)) {
      if (security.installed !== false) setSecurityState({ ...EMPTY_SECURITY, installed: false });
      return null;
    }
    throw e;
  }
  applyDeviceState(res);
  return res;
}

/** Rad etilgan yozuvlarni qayta yuborish (xodim kirdi - endi ruxsat bo'lishi mumkin) */
export function retryHeld() {
  if (held.size === 0) return;
  held.forEach((h, k) => {
    if (!outbox.has(k)) outbox.set(k, h.op);
  });
  held.clear();
  saveHeld();
  saveOutbox();
  setStatus({});
  scheduleFlush();
}

/** Rad etilgan yozuvlar ro'yxati (sozlamalarda ko'rsatish uchun) */
export const getHeldChanges = () => [...held.values()].map(h => ({
  kind: h.op.kind,
  collection: h.op.collection || null,
  id: h.op.id || null,
  key: h.op.key || null,
  reason: h.reason,
  at: h.at
}));

/** Rad etilgan o'zgarishlardan voz kechish: qurilmada serverdagi holat tiklanadi */
export async function discardHeldChanges() {
  const items = [...held.values()];
  held.clear();
  saveHeld();
  setStatus({});
  if (!transport || typeof transport.fetchSome !== 'function') return;
  const collections = [...new Set(items.filter(h => h.op.kind === 'rec').map(h => h.op.collection))];
  const kvKeys = [...new Set(items.filter(h => h.op.kind === 'kv').map(h => h.op.key))];
  if (collections.length === 0 && kvKeys.length === 0) return;
  const { records, kv } = await timed(transport.fetchSome({ collections, kvKeys }), FETCH_TIMEOUT_MS, 'Yuklash');
  if (collections.length) mergeInitial(records, [], { firstTime: true, onlyKeys: collections });
  (Array.isArray(kv) ? kv : []).forEach(r => {
    if (!hasPending('kv', r.key)) writeLocalFromRemote(r.key, r.value);
  });
}

export const getSecurity = () => security;

/** Server PIN tekshiruvi bormi (security.sql o'rnatilgan, qurilma ishonchli) */
export const isServerSecurityActive = () =>
  Boolean(transport?.secure) && security.installed === true && security.status === 'trusted';

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
      // Cheklar: kelib chiqish belgisi (ota - shu qurilma bilgan oxirgi server versiyasi)
      const rows = batch.map(o => {
        let data = o.data ?? {};
        if (MERGE_COLLECTIONS.has(o.collection) && !o.deleted) {
          const parent = serverCopy.get(mergeKey(o.collection, o.id)) || o.base || data;
          data = stampRev(data, newId('r'), o.mergedWith ? [parent, o.mergedWith] : [parent]);
        }
        return { collection: o.collection, id: o.id, data, deleted: Boolean(o.deleted), updated_by: deviceId };
      });
      const res = secureWrites()
        ? await timed(transport.pushRecordsSecure(rows), PUSH_TIMEOUT_MS, 'Yuborish')
        : await timed(transport.pushRecords(rows), PUSH_TIMEOUT_MS, 'Yuborish');
      // Server ruxsat bermagan yozuvlar navbatni to'xtatmaydi: "kutmoqda" ro'yxatiga o'tadi
      const rejected = rejectedKeys(res, 'rec');
      holdOps(batch.filter(o => rejected.has(opKey(o))), rejected);
      settleOps(batch.filter(o => !rejected.has(opKey(o))));
      rows.forEach((r, i) => {
        if (rejected.has(opKey(batch[i]))) return;
        if (r.deleted) {
          serverCopy.delete(mergeKey(r.collection, r.id));
          return;
        }
        rememberServer(r.collection, r.id, r.data);
        // Yuborish paytida yana o'zgargan chek: endi uning asosi - hozir yuborilgan versiya
        const next = MERGE_COLLECTIONS.has(r.collection) ? outbox.get(`rec:${r.collection}:${r.id}`) : null;
        if (next && !next.deleted) next.base = r.data;
      });
      // Server yozuvni o'zgartirib saqladi (xodim yozuvidan PIN xeshi olindi): shu qurilmada ham
      applyChanged(res, rows);
      saveOutbox();
    }
    if (kvs.length) {
      const kvRows = kvs.map(o => ({ key: o.key, value: o.value ?? null, updated_by: deviceId }));
      const res = secureWrites()
        ? await timed(transport.pushKvSecure(kvRows), PUSH_TIMEOUT_MS, 'Yuborish')
        : await timed(transport.pushKv(kvRows), PUSH_TIMEOUT_MS, 'Yuborish');
      const rejected = rejectedKeys(res, 'kv');
      holdOps(kvs.filter(o => rejected.has(opKey(o))), rejected);
      settleOps(kvs.filter(o => !rejected.has(opKey(o))));
    }
    retryDelay = RETRY_MIN_MS;
    setStatus({ state: 'online', lastSyncAt: Date.now(), error: null });
  } catch (e) {
    if (!requireAuth(e)) {
      setStatus({ state: 'offline', error: String(e?.message || e) });
      // Serverda security.sql endi o'rnatilgan (to'g'ridan-to'g'ri yozish yopildi) yoki qurilma
      // bloklangan: holatni qayta so'raymiz (keyingi urinish server funksiyasi orqali)
      if (isPermissionError(e)) deviceHello().catch(() => {});
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
    if (MERGE_COLLECTIONS.has(key)) {
      if (ev.deleted) serverCopy.delete(mergeKey(key, id));
      else if (applyRemoteMerge(key, id, ev.data)) return;
      else if (!hasPending('rec', key, id)) rememberServer(key, id, ev.data);
    }
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

// Boshlang'ich birlashtirish: server + mahalliy ma'lumot.
// hidden - bu qurilmaga ko'rinmaydigan to'plamlar (tegilmaydi, purgeHidden o'chiradi);
// onlyKeys - faqat shu to'plamlar (yangi ochilgan yoki serverdan qayta olingan), sozlamalarsiz
function mergeInitial(records, kvRows, { firstTime, hidden = null, onlyKeys = null }) {
  const serverEmpty = !onlyKeys && records.length === 0 && kvRows.length === 0;

  (onlyKeys || Object.keys(RECORD_COLLECTIONS)).forEach(key => {
    if (hidden && (hidden.has(key) || hidden.has('*'))) return;
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
        if (hasPending('rec', key, id) || isHeld('rec', key, id)) {
          merged.push(r); // yuborilmagan (yoki server rad etgan, qayta yuboriladigan) mahalliy o'zgarish
          return;
        }
        const s = serverMap.get(id);
        if (s) {
          if (!s.deleted) {
            merged.push(s.data);
            rememberServer(key, id, s.data);
          }
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
      fresh.forEach(s => rememberServer(key, String(s.id), s.data));
      if (RECORD_COLLECTIONS[key] === 'prepend') {
        merged = [...fresh.reverse().map(s => s.data), ...merged];
      } else {
        merged = [...merged, ...fresh.map(s => s.data)];
      }
    }

    if (stable(merged) !== stable(local)) writeLocalFromRemote(key, merged);
    else shadow.set(key, local);
  });

  if (onlyKeys) {
    records.forEach(r => noteServerTs(r.updated_at));
    saveOutbox();
    return;
  }

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
  // 8-band: qurilma o'zini tanitadi. Tasdiqlanmagan/bloklangan bo'lsa - sinxron yo'q, tasdiqlash oynasi
  await deviceHello();
  if (security.installed === true && security.status !== 'trusted') {
    enterDeviceState();
    return;
  }
  stopDevicePoll();
  const hidden = new Set(security.installed === true && Array.isArray(security.hidden) ? security.hidden : []);
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
      mergeInitial(records, kv, { firstTime, hidden });
      try {
        storage()?.setItem(LAST_FULL_SYNC_KEY, String(Date.now()));
      } catch {
        // ignore
      }
      // To'liq yuklandi: ko'rinadigan to'plamlar endi to'liq
      if (security.installed === true) setSecurityState({ incomplete: [] });
    }
    if (security.installed === true) purgeHidden(hidden);
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
  loadIncomplete();
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
    loadIncomplete();
  } catch (e) {
    if (requireAuth(e)) return;
    setStatus({ state: 'offline', error: String(e?.message || e) });
  }
  flush();
}

function scheduleCatchup() {
  if (catchupTimer) clearInterval(catchupTimer);
  catchupTimer = setInterval(catchUp, CATCHUP_INTERVAL_MS);
  // Qurilma holati: boshqa qurilmada bloklanmadimi, xodim sessiyasi uzaytiriladi
  if (helloTimer) clearInterval(helloTimer);
  helloTimer = transport?.secure
    ? setInterval(() => {
      if (started) deviceHello().catch(() => {});
    }, HELLO_INTERVAL_MS)
    : null;
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

// ---------- PIN keshi (src/utils/verifierCache.ts) ----------
/**
 * Bir marta: yangilanishdan oldin qurilmadagi xodim yozuvlarida PIN xeshi bor edi - u keshga o'tadi,
 * server xeshni yozuvdan olib tashlagach ham shu qurilmada internetsiz kirish ishlayveradi.
 */
function seedVerifierCache() {
  try {
    const users = readLocal(USERS_KEY);
    let cache = readVerifierCache();
    const before = cache;
    if (!storage()?.getItem(VERIFIER_SEEDED_KEY)) {
      cache = seedFromUsers(cache, Array.isArray(users) ? users : []);
      storage()?.setItem(VERIFIER_SEEDED_KEY, String(Date.now()));
    }
    cache = pruneVerifiers(cache, Array.isArray(users) ? users : []);
    if (cache !== before) writeVerifierCache(cache);
  } catch {
    // kesh ishlamasa ham dastur ochilsin
  }
}

/** Kesh o'zgardi (xodim serverda kirdi): xodim yozuvlari qayta bezaladi, serverga yuborilmaydi */
export function refreshUserVerifiers() {
  const list = readLocal(USERS_KEY);
  if (!Array.isArray(list)) return;
  const next = decorateUsers(list, readVerifierCache());
  if (next !== list) writeLocalFromRemote(USERS_KEY, next);
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
  outbox = loadOutbox();
  held = loadHeld();
  const savedSecurity = readLocal(SECURITY_KEY);
  security = { ...EMPTY_SECURITY, ...(savedSecurity && typeof savedSecurity === 'object' ? savedSecurity : {}) };
  seedVerifierCache();
  setStatus({ transport: transport.kind || null });
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
  held.clear();
  saveHeld();
  security = { ...EMPTY_SECURITY };
  try {
    storage()?.removeItem(SECURITY_KEY);
  } catch {
    // ignore
  }
  writeVerifierCache({});
  stopDevicePoll();
  if (helloTimer) clearInterval(helloTimer);
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
