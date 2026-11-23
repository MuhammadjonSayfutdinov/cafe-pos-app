// Supabase transporti: dvigatel bilan Supabase orasidagi yupqa qatlam.
// Jadval tuzilishi: supabase/schema.sql
import { createClient } from '@supabase/supabase-js';

const PAGE_SIZE = 1000;   // PostgREST bir so'rovda ko'pi bilan 1000 qator qaytaradi
const PUSH_CHUNK = 500;

export function createSupabaseTransport({ url, anonKey }) {
  const client = createClient(url, anonKey, {
    // storageKey 'pos_' bilan boshlanmaydi: favqulodda nusxa fayliga sessiya tokeni tushmasin
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'cafe_supabase_auth' }
  });

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
      try {
        const { data } = await client.auth.getSession();
        if (data.session) return data.session;
      } catch {
        // tarmoq xatosi: pastdagi zaxira tekshiruvga o'tamiz
      }
      // Internet yo'q va token muddati tugagan bo'lsa ham, qurilma avval ulangan bo'lsa
      // kassa ishlashda davom etsin (internet qaytganda token avtomatik yangilanadi).
      try {
        const stored = JSON.parse(window.localStorage.getItem('cafe_supabase_auth') || 'null');
        if (stored?.user && !navigator.onLine) return { user: stored.user, offline: true };
      } catch {
        // ignore
      }
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
