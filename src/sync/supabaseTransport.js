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
// Taom rasmlari ombori (supabase/storage.sql). Ochiq o'qiladi, yozish faqat ulangan qurilmadan
const IMAGE_BUCKET = 'menu-images';

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

  // Ruxsat bo'yicha o'qilgan to'plamlar (supabase/security.sql: yangi ochilgan yoki qayta olinadigan)
  async function fetchWhere(table, column, values) {
    const rows = [];
    if (!values.length) return rows;
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await client.from(table).select('*').in(column, values)
        .order('updated_at', { ascending: true }).range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < PAGE_SIZE) break;
    }
    return rows;
  }

  async function rpcRaw(fn, args) {
    const { data, error } = await client.rpc(fn, args);
    if (error) {
      // Kod saqlanadi: dvigatel "funksiya yo'q" (PGRST202) va "ruxsat yo'q" (42501) ni ajratadi
      const err = new Error(error.message || String(error));
      err.code = error.code;
      throw err;
    }
    return data;
  }

  async function upsertChunks(table, rows, onConflict) {
    for (let i = 0; i < rows.length; i += PUSH_CHUNK) {
      const { error } = await client.from(table).upsert(rows.slice(i, i + PUSH_CHUNK), { onConflict });
      if (error) throw error;
    }
  }

  return {
    kind: 'supabase',
    // Server xavfsizligi funksiyalarini qo'llaydi (pos_device_hello, pos_push_records...): supabase/security.sql
    secure: true,
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
    rpc: rpcRaw,
    async fetchSome({ collections = [], kvKeys = [] } = {}) {
      const [records, kv] = await Promise.all([
        fetchWhere('pos_records', 'collection', collections),
        fetchWhere('pos_kv', 'key', kvKeys)
      ]);
      return { records, kv };
    },
    async uploadPublicFile(path, file) {
      const bucket = client.storage.from(IMAGE_BUCKET);
      const { error } = await bucket.upload(path, file, {
        contentType: file.type || 'image/webp',
        // Har bir rasmning yo'li noyob va o'zgarmaydi: brauzer va telefon uni bir yil keshda saqlaydi
        cacheControl: '31536000',
        // Qayta urinishda (oldingi safar yarmi yuklangan) xato bermasin: o'sha fayl qayta yoziladi
        upsert: true
      });
      if (error) {
        const msg = String(error.message || error);
        if (/bucket not found/i.test(msg)) {
          throw new Error("Rasm ombori yo'q: Supabase'da supabase/storage.sql ni ishga tushiring.");
        }
        throw new Error(msg);
      }
      return bucket.getPublicUrl(path).data.publicUrl;
    },
    async removePublicFiles(paths) {
      const list = (Array.isArray(paths) ? paths : []).filter(p => typeof p === 'string' && p);
      if (list.length === 0) return;
      const { error } = await client.storage.from(IMAGE_BUCKET).remove(list);
      if (error) throw new Error(String(error.message || error));
    },
    pushRecords: (rows) => upsertChunks('pos_records', rows, 'collection,id'),
    pushKv: (rows) => upsertChunks('pos_kv', rows, 'key'),
    // security.sql: har bir qator serverda tekshiriladi, ruxsat yo'qlari { rejected } da qaytadi
    pushRecordsSecure: (rows) => rpcRaw('pos_push_records', { p_rows: rows }),
    pushKvSecure: (rows) => rpcRaw('pos_push_kv', { p_rows: rows }),
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
