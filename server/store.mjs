// @ts-check
// Mahalliy server ma'lumotlari: xotirada (Map) + diskda (snapshot + jurnal).
//
// Har bir o'zgarish jurnalga (journal.jsonl) bitta qator bo'lib qo'shiladi: tez va elektr o'chsa ham
// oxirgi yozuvlar saqlanadi. Jurnal kattalashsa, butun holat snapshot.json ga yoziladi va jurnal
// tozalanadi. Ishga tushganda: snapshot + jurnal qayta o'qiladi (yarim yozilgan oxirgi qator tashlanadi).
//
// Vaqt (updated_at) - serverning o'z soati, qat'iy o'suvchi: qurilmalar "since" bilan faqat yangi
// o'zgarishlarni so'raydi. Kompyuter soati orqaga ketsa ham vaqt kamaymaydi.

import fs from 'node:fs';
import path from 'node:path';

/**
 * @typedef {{ collection: string, id: string, data: any, deleted: boolean,
 *   created_at: string, updated_at: string, updated_by: string | null }} RecordRow
 * @typedef {{ key: string, value: any, updated_at: string, updated_by: string | null }} KvRow
 * @typedef {{ hubId?: string, upstreamCursor?: string | null, upstreamSource?: string | null }} Meta
 */

const COMPACT_EVERY = 5000; // jurnal qatorlari

export const recKey = (collection, id) => `rec:${collection}\u0000${id}`;
export const kvKey = (key) => `kv:${key}`;

/** @param {string} dir */
export function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const snapPath = path.join(dir, 'snapshot.json');
  const journalPath = path.join(dir, 'journal.jsonl');

  /** @type {Map<string, RecordRow>} */
  const records = new Map();
  /** @type {Map<string, KvRow>} */
  const kv = new Map();
  /** Bulutga hali yuborilmagan kalitlar (recKey / kvKey) */
  const pending = new Set();
  /** @type {Meta} */
  let meta = {};
  let lastTs = 0;
  let journalLines = 0;

  const noteTs = (iso) => {
    const ms = Date.parse(iso);
    if (Number.isFinite(ms) && ms > lastTs) lastTs = ms;
  };

  /** @param {any} e */
  function applyEntry(e) {
    if (!e || typeof e !== 'object') return;
    if (e.t === 'rec' && e.row) {
      records.set(recKey(e.row.collection, e.row.id), e.row);
      noteTs(e.row.updated_at);
    } else if (e.t === 'kv' && e.row) {
      kv.set(e.row.key, e.row);
      noteTs(e.row.updated_at);
    } else if (e.t === 'pend') {
      if (e.on) pending.add(e.k);
      else pending.delete(e.k);
    } else if (e.t === 'meta' && e.meta && typeof e.meta === 'object') {
      meta = { ...meta, ...e.meta };
    }
  }

  // ---------- yuklash ----------
  if (fs.existsSync(snapPath)) {
    const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
    (snap.records || []).forEach(row => applyEntry({ t: 'rec', row }));
    (snap.kv || []).forEach(row => applyEntry({ t: 'kv', row }));
    (snap.pending || []).forEach(k => pending.add(k));
    meta = snap.meta || {};
    if (Number(snap.lastTs) > lastTs) lastTs = Number(snap.lastTs);
  }
  if (fs.existsSync(journalPath)) {
    const lines = fs.readFileSync(journalPath, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        applyEntry(JSON.parse(line));
        journalLines += 1;
      } catch {
        // elektr o'chganda yarim yozilgan qator: tashlab yuboriladi
      }
    }
  }

  // ---------- yozish ----------
  function compact() {
    const tmp = `${snapPath}.tmp`;
    const snap = {
      version: 1,
      lastTs,
      meta,
      pending: [...pending],
      records: [...records.values()],
      kv: [...kv.values()]
    };
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, JSON.stringify(snap));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, snapPath);
    fs.writeFileSync(journalPath, '');
    journalLines = 0;
  }

  /** @param {any} entry */
  function append(entry) {
    applyEntry(entry);
    fs.appendFileSync(journalPath, `${JSON.stringify(entry)}\n`);
    journalLines += 1;
    if (journalLines >= COMPACT_EVERY) compact();
  }

  if (journalLines >= COMPACT_EVERY / 2) compact();

  const nextTs = () => {
    lastTs = Math.max(Date.now(), lastTs + 1);
    return new Date(lastTs).toISOString();
  };

  const stable = (v) => JSON.stringify(v === undefined ? null : v);

  return {
    /**
     * Yozuvni saqlash. fromUpstream=false (qurilmadan kelgan) bo'lsa bulutga yuborish navbatiga qo'yiladi.
     * O'zgarish bo'lmasa (ma'lumot bir xil) - null.
     * @param {{ collection: string, id: string, data: any, deleted: boolean, updated_by?: string | null, created_at?: string }} input
     * @param {{ fromUpstream?: boolean }} [opts]
     * @returns {RecordRow | null}
     */
    putRecord(input, { fromUpstream = false } = {}) {
      const k = recKey(input.collection, input.id);
      const prev = records.get(k);
      const data = input.deleted ? {} : input.data;
      if (prev && prev.deleted === Boolean(input.deleted) && stable(prev.data) === stable(data)) return null;
      const ts = nextTs();
      /** @type {RecordRow} */
      const row = {
        collection: input.collection,
        id: input.id,
        data,
        deleted: Boolean(input.deleted),
        created_at: prev?.created_at || input.created_at || ts,
        updated_at: ts,
        updated_by: input.updated_by ?? null
      };
      append({ t: 'rec', row });
      if (!fromUpstream && !pending.has(k)) append({ t: 'pend', k, on: true });
      return row;
    },

    /**
     * @param {{ key: string, value: any, updated_by?: string | null }} input
     * @param {{ fromUpstream?: boolean }} [opts]
     * @returns {KvRow | null}
     */
    putKv(input, { fromUpstream = false } = {}) {
      const k = kvKey(input.key);
      const prev = kv.get(input.key);
      if (prev && stable(prev.value) === stable(input.value ?? null)) return null;
      /** @type {KvRow} */
      const row = { key: input.key, value: input.value ?? null, updated_at: nextTs(), updated_by: input.updated_by ?? null };
      append({ t: 'kv', row });
      if (!fromUpstream && !pending.has(k)) append({ t: 'pend', k, on: true });
      return row;
    },

    /** since (ISO) va undan keyingi o'zgarishlar; since bo'lmasa - hammasi */
    since(since) {
      const f = (r) => !since || r.updated_at >= since;
      return { records: [...records.values()].filter(f), kv: [...kv.values()].filter(f) };
    },

    getRecord: (collection, id) => records.get(recKey(collection, id)),
    getKv: (key) => kv.get(key),
    allRecords: () => records.values(),
    allKv: () => kv.values(),

    // ---------- bulutga yuborish navbati ----------
    isPending: (k) => pending.has(k),
    pendingCount: () => pending.size,
    pendingKeys: () => [...pending],
    markPending(k) {
      if (!pending.has(k)) append({ t: 'pend', k, on: true });
    },
    /** Yuborilgandan keyin: yuborish paytida yozuv yana o'zgarmagan bo'lsa navbatdan olinadi */
    clearPending(k, sentUpdatedAt) {
      if (!pending.has(k)) return;
      const row = k.startsWith('kv:') ? kv.get(k.slice(3)) : records.get(k);
      if (row && row.updated_at !== sentUpdatedAt) return;
      append({ t: 'pend', k, on: false });
    },
    /** @param {string} k recKey */
    recordForKey: (k) => records.get(k),
    /** @param {string} k kvKey */
    kvForKey: (k) => kv.get(k.slice(3)),

    // ---------- meta (server id, bulut kursori) ----------
    getMeta: () => meta,
    /** @param {Meta} patch */
    setMeta(patch) {
      append({ t: 'meta', meta: patch });
    },

    stats: () => ({ records: records.size, kv: kv.size, pending: pending.size }),
    compact
  };
}
