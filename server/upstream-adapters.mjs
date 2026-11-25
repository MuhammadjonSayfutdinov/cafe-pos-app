// @ts-check
// Mahalliy server qaysi bulutga ulanadi:
//  - Supabase (asosiy): .env.local dagi VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY va kafe hisobi
//    HUB_SUPABASE_EMAIL, HUB_SUPABASE_PASSWORD (SUPABASE.md 3-qadamdagi hisob);
//  - soxta server (faqat avtomatik sinovlar uchun): HUB_FAKE_UPSTREAM_URL (scripts/fake-sync-server.mjs).

const REQUEST_TIMEOUT_MS = 30000;
const PAGE_SIZE = 1000;

/** @typedef {import('./upstream.mjs').UpstreamAdapter} UpstreamAdapter */

/** fetch, vaqt cheklovi bilan (sekin internetda osilib qolmasin) */
const timeoutFetch = (url, init = {}) => {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(url, { ...init, signal });
};

const isNetworkError = (e) =>
  /fetch failed|network|timeout|timed out|aborted|ECONN|ENOTFOUND|EAI_AGAIN|socket/i.test(String(e?.message || e)) ||
  e?.name === 'AuthRetryableFetchError' || e?.name === 'TimeoutError' || e?.name === 'AbortError';

// Server realtime (WebSocket) ishlatmaydi, bulutni har 3 soniyada so'raydi. Node 20 da WebSocket
// yo'q, supabase-js esa ishga tushishda uni talab qiladi: shuning uchun "bo'sh" transport beriladi.
class NoWebSocket {
  constructor() {
    throw new Error('Mahalliy server realtime ishlatmaydi');
  }
}

/**
 * @param {{ url: string, anonKey: string, email: string, password: string }} cfg
 * @returns {Promise<UpstreamAdapter>}
 */
export async function createSupabaseAdapter({ url, anonKey, email, password }) {
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
    global: { fetch: timeoutFetch },
    realtime: { transport: /** @type {any} */ (NoWebSocket) }
  });

  /** Xatoni turiga ajratish: tarmoq, sessiya tugagan yoki boshqa */
  const wrap = (error) => {
    const e = /** @type {any} */ (new Error(String(error?.message || error)));
    const status = Number(error?.status || error?.code || 0);
    if (status === 401 || /jwt|token|not authenticated/i.test(e.message)) e.sessionExpired = true;
    return e;
  };

  return {
    name: 'Supabase',
    source: url,
    async signIn() {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        const e = /** @type {any} */ (new Error(
          isNetworkError(error) ? `Internet yo'q: ${error.message}` : `Kafe hisobiga kirib bo'lmadi: ${error.message}`
        ));
        e.authFailed = !isNetworkError(error);
        throw e;
      }
    },
    async fetchSince(since) {
      const read = async (table) => {
        const rows = [];
        for (let from = 0; ; from += PAGE_SIZE) {
          let q = client.from(table).select('*').order('updated_at', { ascending: true }).range(from, from + PAGE_SIZE - 1);
          if (since) q = q.gte('updated_at', since);
          const { data, error } = await q;
          if (error) throw wrap(error);
          rows.push(...(data || []));
          if (!data || data.length < PAGE_SIZE) break;
        }
        return rows;
      };
      const [records, kv] = await Promise.all([read('pos_records'), read('pos_kv')]);
      return { records, kv };
    },
    async pushRecords(rows) {
      const { error } = await client.from('pos_records').upsert(rows, { onConflict: 'collection,id' });
      if (error) throw wrap(error);
    },
    async pushKv(rows) {
      const { error } = await client.from('pos_kv').upsert(rows, { onConflict: 'key' });
      if (error) throw wrap(error);
    },
    async rpc(fn, args) {
      const { data, error } = await client.rpc(fn, args);
      if (error) throw wrap(error);
      return data;
    }
  };
}

/**
 * FAQAT sinovlar uchun: scripts/fake-sync-server.mjs ga ulanadi.
 * @param {{ url: string }} cfg
 * @returns {UpstreamAdapter}
 */
export function createFakeAdapter({ url }) {
  const base = url.replace(/\/$/, '');
  /** @returns {Promise<any>} */
  const call = async (path, body) => {
    const res = await timeoutFetch(`${base}${path}`, body === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    /** @type {any} */
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.message || json?.error || `Soxta server xatosi: ${res.status}`);
    return json;
  };
  return {
    name: 'soxta bulut (sinov)',
    source: base,
    async signIn() {
      const res = await call('/auth', { email: 'hub@test', password: 'parol123' });
      if (!res?.ok) throw Object.assign(new Error("Soxta bulut: parol noto'g'ri"), { authFailed: true });
    },
    fetchSince: (since) => call(`/all${since ? `?since=${encodeURIComponent(since)}` : ''}`),
    pushRecords: async (rows) => { await call('/records', rows); },
    pushKv: async (rows) => { await call('/kv', rows); },
    rpc: (fn, args) => call(`/rpc/${fn}`, args)
  };
}
