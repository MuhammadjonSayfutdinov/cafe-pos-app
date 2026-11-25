// @ts-check
// Mahalliy server <-> bulut (Supabase) sinxroni.
//
// Server bulut uchun bitta "qurilma": kafedagi planshetlarning o'zgarishlarini bulutga yuboradi va
// bulutdagi o'zgarishlarni (egasining telefoni, mijoz QR-buyurtmasi) olib, planshetlarga tarqatadi.
// Internet yo'q bo'lsa navbat diskda turadi, internet qaytganda yuboriladi.
//
// Qoidalar src/sync/engine.js bilan bir xil:
//  - bitta yozuvni ikki joyda o'zgartirishsa, oxirgi yozilgani qoladi;
//  - hali yuborilmagan mahalliy o'zgarish bulutdan kelgan versiyadan ustun;
//  - bulutga server o'z id si bilan yozadi (updated_by = hubId), qaytib kelgan o'z yozuvi tashlanadi.

import { recKey, kvKey } from './store.mjs';

const POLL_MS = 3000;
const RETRY_MIN_MS = 3000;
const RETRY_MAX_MS = 30000;
const AUTH_RETRY_MS = 120000;
const PUSH_BATCH = 100;

/**
 * @typedef {{ state: 'disabled' | 'connecting' | 'online' | 'offline' | 'error',
 *   pending: number, lastSyncAt: number | null, error: string | null }} UpstreamStatus
 * @typedef {{
 *   name: string,
 *   source: string,
 *   signIn(): Promise<void>,
 *   fetchSince(since: string | null): Promise<{ records: any[], kv: any[] }>,
 *   pushRecords(rows: any[]): Promise<void>,
 *   pushKv(rows: any[]): Promise<void>,
 *   rpc(fn: string, args: any): Promise<any>
 * }} UpstreamAdapter
 */

/**
 * @param {{
 *   store: ReturnType<typeof import('./store.mjs').createStore>,
 *   adapter: UpstreamAdapter | null,
 *   hubId: string,
 *   onRemoteRow: (ev: any) => void,
 *   onStatus: (s: UpstreamStatus) => void,
 *   log?: (msg: string) => void
 * }} opts
 */
export function createUpstream({ store, adapter, hubId, onRemoteRow, onStatus, log = () => {} }) {
  /** @type {UpstreamStatus} */
  let status = { state: adapter ? 'connecting' : 'disabled', pending: store.pendingCount(), lastSyncAt: null, error: null };
  let timer = null;
  let running = false;
  let again = false;
  let signedIn = false;
  let delay = RETRY_MIN_MS;
  let stopped = false;

  /** @param {Partial<UpstreamStatus>} patch */
  function setStatus(patch) {
    const next = { ...status, ...patch, pending: store.pendingCount() };
    const changed = next.state !== status.state || next.pending !== status.pending || next.error !== status.error;
    status = next;
    if (changed) onStatus(status);
  }

  function schedule(ms) {
    if (stopped || !adapter) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, ms);
  }

  // Boshqa bulut loyihasiga ulandi (yoki birinchi marta): kursor va navbat qaytadan
  const source = adapter?.source || null;
  if (adapter && store.getMeta().upstreamSource !== source) {
    store.setMeta({ upstreamSource: source, upstreamCursor: null });
  }

  /** Bulutdan kelgan qatorni mahalliy omborga yozish (o'zgargan bo'lsa planshetlarga tarqatiladi) */
  function applyRemote(kind, r) {
    if (kind === 'rec') {
      const id = String(r.id);
      if (store.isPending(recKey(r.collection, id))) return;
      const row = store.putRecord(
        { collection: r.collection, id, data: r.data ?? {}, deleted: Boolean(r.deleted), updated_by: r.updated_by ?? null, created_at: r.created_at },
        { fromUpstream: true }
      );
      if (row) onRemoteRow({ type: 'record', ...row });
    } else {
      if (store.isPending(kvKey(r.key))) return;
      const row = store.putKv({ key: r.key, value: r.value ?? null, updated_by: r.updated_by ?? null }, { fromUpstream: true });
      if (row) onRemoteRow({ type: 'kv', ...row });
    }
  }

  const maxTs = (rows, cur) => rows.reduce((m, r) => (r.updated_at && (!m || String(r.updated_at) > m) ? String(r.updated_at) : m), cur);

  async function pull() {
    if (!adapter) return;
    const cursor = store.getMeta().upstreamCursor || null;
    const { records, kv } = await adapter.fetchSince(cursor);

    if (!cursor) {
      // Birinchi ulanish: bulutda yo'q mahalliy yozuvlar bulutga yuboriladi, qolganida bulut ustun
      const remoteRec = new Set(records.map(r => recKey(r.collection, String(r.id))));
      const remoteKv = new Set(kv.map(r => kvKey(r.key)));
      for (const row of store.allRecords()) {
        const k = recKey(row.collection, row.id);
        if (!remoteRec.has(k)) store.markPending(k);
      }
      for (const row of store.allKv()) {
        const k = kvKey(row.key);
        if (!remoteKv.has(k)) store.markPending(k);
      }
      log(`bulut bilan birinchi sinxron: bulutda ${records.length} yozuv, ${kv.length} sozlama`);
    }

    records
      .slice()
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
      .forEach(r => {
        if (r.updated_by && r.updated_by === hubId) return; // o'zimiz yozganmiz
        applyRemote('rec', r);
      });
    kv.forEach(r => {
      if (r.updated_by && r.updated_by === hubId) return;
      applyRemote('kv', r);
    });

    const next = maxTs(kv, maxTs(records, cursor));
    if (next && next !== cursor) store.setMeta({ upstreamCursor: next });
  }

  async function push() {
    if (!adapter) return;
    const keys = store.pendingKeys();
    const recKeys = keys.filter(k => k.startsWith('rec:'));
    const kvKeys = keys.filter(k => k.startsWith('kv:'));

    for (let i = 0; i < recKeys.length; i += PUSH_BATCH) {
      const batch = recKeys.slice(i, i + PUSH_BATCH).flatMap(k => {
        const row = store.recordForKey(k);
        return row ? [{ k, row }] : [];
      });
      if (!batch.length) continue;
      await adapter.pushRecords(batch.map(({ row }) => ({
        collection: row.collection, id: row.id, data: row.data ?? {}, deleted: Boolean(row.deleted), updated_by: hubId
      })));
      batch.forEach(({ k, row }) => store.clearPending(k, row.updated_at));
      setStatus({});
    }
    if (kvKeys.length) {
      const batch = kvKeys.flatMap(k => {
        const row = store.kvForKey(k);
        return row ? [{ k, row }] : [];
      });
      if (batch.length) {
        await adapter.pushKv(batch.map(({ row }) => ({ key: row.key, value: row.value ?? null, updated_by: hubId })));
        batch.forEach(({ k, row }) => store.clearPending(k, row.updated_at));
      }
    }
  }

  async function tick() {
    timer = null;
    if (!adapter || stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    let nextDelay = POLL_MS;
    try {
      if (!signedIn) {
        await adapter.signIn();
        signedIn = true;
        log(`bulutga ulandi (${adapter.name})`);
      }
      // Avval yuboramiz: kafedagi o'zgarish boshqalarga tezroq yetsin
      await push();
      await pull();
      await push(); // birinchi ulanishda navbatga qo'yilganlar
      delay = RETRY_MIN_MS;
      setStatus({ state: 'online', lastSyncAt: Date.now(), error: null });
    } catch (e) {
      const err = /** @type {any} */ (e);
      const msg = String(err?.message || err);
      if (err?.authFailed) {
        // Kafe hisobi email/paroli noto'g'ri: tez-tez urinmaymiz
        signedIn = false;
        setStatus({ state: 'error', error: msg });
        nextDelay = AUTH_RETRY_MS;
      } else {
        if (err?.sessionExpired) signedIn = false;
        if (status.state !== 'offline') log(`bulut bilan aloqa yo'q: ${msg}`);
        setStatus({ state: 'offline', error: msg });
        nextDelay = delay;
        delay = Math.min(RETRY_MAX_MS, delay * 2);
      }
    } finally {
      running = false;
    }
    if (again) {
      again = false;
      nextDelay = Math.min(nextDelay, 300);
    }
    schedule(nextDelay);
  }

  return {
    start() {
      if (!adapter) {
        onStatus(status);
        return;
      }
      setStatus({ state: 'connecting' });
      schedule(0);
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
    /** Mahalliy o'zgarish bo'ldi: tezroq yuboramiz */
    kick() {
      if (!adapter) return;
      setStatus({});
      if (status.state === 'online' || status.state === 'connecting') schedule(300);
    },
    /** Server funksiyasi (masalan qr_claim_request): faqat bulut orqali */
    async rpc(fn, args) {
      if (!adapter) throw Object.assign(new Error("Bulut ulanmagan: bu amal uchun internet va bulut sozlamasi kerak"), { status: 503 });
      if (status.state !== 'online') {
        throw Object.assign(new Error("Internet yo'q: bu amal uchun bulut bilan aloqa kerak"), { status: 503 });
      }
      return adapter.rpc(fn, args);
    },
    getStatus: () => ({ ...status, pending: store.pendingCount() })
  };
}
