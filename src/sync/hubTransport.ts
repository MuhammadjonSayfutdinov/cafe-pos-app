// Kafe mahalliy serveri (server/hub.mjs) bilan sinxronlash.
//
// Sahifa shu serverning o'zidan ochiladi (http://192.168.x.x:8080), shuning uchun manzil bir xil
// (so'rovlar /api/... ga). Dasturchi rejimida VITE_HUB_URL bilan boshqa manzil berish mumkin.
// Qurilma server paroli bilan bir marta ulanadi: server token beradi, token shu qurilmada saqlanadi.
// Internet (va bulut) bo'lmasa ham ishlaydi: server kafe ichidagi Wi-Fi'da.

import { createTimeoutFetch } from './timeouts';
import { AuthRequiredError } from './types';
import type { KvRow, RecordRow, SyncEvent, SyncSession, SyncTransport } from './types';

// 'pos_' bilan boshlanmaydi: zaxira nusxaga tushmasin
const TOKEN_KEY = 'cafe_hub_token';
const HUB_ID_KEY = 'cafe_hub_id';
const REQUEST_TIMEOUT_MS = 30000;
const RESUBSCRIBE_MS = 3000;

const HUB_SESSION: SyncSession = { user: { email: 'Kafe serveri' } };

const read = (key: string): string => {
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};
const write = (key: string, value: string | null): void => {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // xotira yopiq bo'lsa ham ishlashda davom etamiz
  }
};

export function createHubTransport({ baseUrl = '' }: { baseUrl?: string } = {}): SyncTransport {
  const api = `${baseUrl.replace(/\/$/, '')}/api`;
  const doFetch = createTimeoutFetch(REQUEST_TIMEOUT_MS);

  async function request<T>(path: string, body?: unknown): Promise<T> {
    const token = read(TOKEN_KEY);
    const res = await doFetch(`${api}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const json = (await res.json().catch(() => null)) as { message?: string } | null;
    if (res.status === 401 && path !== '/auth') {
      write(TOKEN_KEY, null);
      throw new AuthRequiredError(json?.message || undefined);
    }
    if (!res.ok) throw new Error(json?.message || `Server xatosi: ${res.status}`);
    return json as T;
  }

  return {
    kind: 'hub',

    async identity() {
      return `hub|${read(HUB_ID_KEY) || api}`;
    },

    // Token bo'lsa - ulangan (server o'chiq bo'lsa ham: qurilma oflayn ishlaydi)
    async getSession() {
      return read(TOKEN_KEY) ? HUB_SESSION : null;
    },

    async signIn(_email, password) {
      const res = await request<{ token: string; hubId: string }>('/auth', { password });
      if (!res?.token) throw new Error("Server javobi noto'g'ri");
      write(TOKEN_KEY, res.token);
      write(HUB_ID_KEY, res.hubId || '');
      return HUB_SESSION;
    },

    async signOut() {
      try {
        await request('/logout', {});
      } catch {
        // server o'chiq bo'lsa ham qurilmadagi tokenni o'chiramiz
      }
      write(TOKEN_KEY, null);
    },

    fetchAll(since) {
      return request<{ records: RecordRow[]; kv: KvRow[] }>(`/all${since ? `?since=${encodeURIComponent(since)}` : ''}`);
    },

    rpc: (fn, args) => request(`/rpc/${encodeURIComponent(fn)}`, args ?? {}),
    pushRecords: (rows) => request('/records', rows),
    pushKv: (rows) => request('/kv', rows),

    subscribe(onEvent, onStatus) {
      let es: EventSource | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let closed = false;

      const open = () => {
        timer = null;
        if (closed || !read(TOKEN_KEY)) return; // token yo'q: qayta ulangach dvigatel yangidan obuna bo'ladi
        es = new EventSource(`${api}/events?token=${encodeURIComponent(read(TOKEN_KEY))}`);
        es.onopen = () => onStatus?.('SUBSCRIBED');
        es.onerror = () => {
          onStatus?.('CHANNEL_ERROR');
          // Tarmoq uzilsa brauzer o'zi qayta ulanadi; server rad etsa (masalan qayta ishga tushganda)
          // ulanish yopiladi - o'zimiz qayta ochamiz
          if (es && es.readyState === EventSource.CLOSED && !closed && !timer) {
            timer = setTimeout(open, RESUBSCRIBE_MS);
          }
        };
        es.onmessage = (m) => {
          try {
            onEvent(JSON.parse(m.data) as SyncEvent);
          } catch {
            // buzilgan xabar
          }
        };
      };
      open();

      return () => {
        closed = true;
        if (timer) clearTimeout(timer);
        es?.close();
      };
    }
  };
}
