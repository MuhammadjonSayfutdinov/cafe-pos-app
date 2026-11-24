// Supabase transporti: dvigatel bilan Supabase orasidagi yupqa qatlam.
// Jadval tuzilishi: supabase/schema.sql
import { createClient } from '@supabase/supabase-js';
import { createTimeoutFetch, isNetworkError, withTimeout } from './timeouts';

const PAGE_SIZE = 1000;   // PostgREST bir so'rovda ko'pi bilan 1000 qator qaytaradi
const PUSH_CHUNK = 500;
// Bitta HTTP so'rov uchun eng ko'p kutish (sekin internetda 1000 qatorli sahifa ham sig'sin)
const REQUEST_TIMEOUT_MS = 45000;
// Sessiyani tekshirish (token yangilash) shundan uzoq cho'zilsa, saqlangan sessiya bilan ishlaymiz
const SESSION_TIMEOUT_MS = 10000;
const AUTH_STORAGE_KEY = 'cafe_supabase_auth';

export function createSupabaseTransport({ url, anonKey }) {
  const client = createClient(url, anonKey, {
    // storageKey 'pos_' bilan boshlanmaydi: favqulodda nusxa fayliga sessiya tokeni tushmasin
    auth: { persistSession: true, autoRefreshToken: true, storageKey: AUTH_STORAGE_KEY },
    // Sekin internetda so'rov cheksiz osilib qolmasin (src/sync/timeouts.ts)
    global: { fetch: createTimeoutFetch(REQUEST_TIMEOUT_MS) }
  });

  const storedSessionUser = () => {
    try {
      return JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) || 'null')?.user || null;
    } catch {
      return null;
    }
  };

  async function fetchTable(table, since) {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = client.from(table).select('*').order('updated_at', { ascending: true }).range(from, from + PAGE_SIZE - 1);
      if (since) query = query.gte('updated_at', since);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < PAGE_SIZE) break;
    }
    return rows;
  }

  async function upsertChunks(table, rows, onConflict) {
    for (let i = 0; i < rows.length; i += PUSH_CHUNK) {
      const { error } = await client.from(table).upsert(rows.slice(i, i + PUSH_CHUNK), { onConflict });
      if (error) throw error;
    }
  }

  return {
    async identity() {
      const { data } = await client.auth.getSession();
      return `${url}|${data.session?.user?.id || 'anon'}`;
    },
    async getSession() {
      let problem = null;
      try {
        const { data, error } = await withTimeout(client.auth.getSession(), SESSION_TIMEOUT_MS, 'Sessiya');
        if (data?.session) return data.session;
        problem = error || null;
      } catch (e) {
        problem = e; // tarmoq xatosi yoki vaqt tugadi
      }
      // Internet yo'q yoki juda sekin, token muddati esa tugagan bo'lsa ham: qurilma avval
      // ulangan bo'lsa kassa ishlashda davom etsin (internet qaytganda token o'zi yangilanadi).
      // Token haqiqatan bekor qilingan bo'lsa (tarmoq xatosi emas) - qayta kirish so'raladi.
      const user = storedSessionUser();
      if (user && (!navigator.onLine || isNetworkError(problem))) return { user, offline: true };
      return null;
    },
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data.session;
    },
    async signOut() {
      await client.auth.signOut();
    },
    async fetchAll(since) {
      const [records, kv] = await Promise.all([fetchTable('pos_records', since), fetchTable('pos_kv', since)]);
      return { records, kv };
    },
    async rpc(fn, args) {
      const { data, error } = await client.rpc(fn, args);
      if (error) throw new Error(error.message);
      return data;
    },
    pushRecords: (rows) => upsertChunks('pos_records', rows, 'collection,id'),
    pushKv: (rows) => upsertChunks('pos_kv', rows, 'key'),
    subscribe(onEvent, onStatus) {
      const channel = client
        .channel('pos-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_records' }, (payload) => {
          const r = payload.new;
          if (r && r.id !== undefined) onEvent({ type: 'record', ...r });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_kv' }, (payload) => {
          const r = payload.new;
          if (r && r.key) onEvent({ type: 'kv', ...r });
        })
        .subscribe((s) => onStatus && onStatus(s));
      return () => {
        client.removeChannel(channel);
      };
    }
  };
}
