// FAQAT avtomatik sinovlar uchun (vite --mode e2e). Oddiy build'ga kirmaydi.
// scripts/fake-sync-server.mjs bilan ishlaydi: Supabase o'rniga oddiy HTTP + SSE server.

export function createFakeTransport({ url }) {
  const base = url.replace(/\/$/, '');
  const SESSION_KEY = 'cafe_fake_session';

  const post = async (path, body) => {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Soxta server xatosi: ${res.status}`);
    }
    return res.json();
  };

  return {
    kind: 'fake',
    async identity() {
      return `${base}|${window.localStorage.getItem(SESSION_KEY) || 'anon'}`;
    },
    async getSession() {
      const email = window.localStorage.getItem(SESSION_KEY);
      return email ? { user: { email } } : null;
    },
    async signIn(email, password) {
      const res = await post('/auth', { email, password });
      if (!res.ok) throw new Error("Email yoki parol noto'g'ri");
      window.localStorage.setItem(SESSION_KEY, email);
      return { user: { email } };
    },
    async signOut() {
      window.localStorage.removeItem(SESSION_KEY);
    },
    async fetchAll(since) {
      const res = await fetch(`${base}/all${since ? `?since=${encodeURIComponent(since)}` : ''}`);
      if (!res.ok) throw new Error(`Soxta server xatosi: ${res.status}`);
      return res.json();
    },
    rpc: (fn, args) => post(`/rpc/${fn}`, args),
    pushRecords: (rows) => post('/records', rows),
    pushKv: (rows) => post('/kv', rows),
    subscribe(onEvent, onStatus) {
      const es = new EventSource(`${base}/events`);
      es.onopen = () => onStatus && onStatus('SUBSCRIBED');
      es.onerror = () => onStatus && onStatus('CHANNEL_ERROR');
      es.onmessage = (m) => {
        try {
          onEvent(JSON.parse(m.data));
        } catch {
          // ignore
        }
      };
      return () => es.close();
    }
  };
}
