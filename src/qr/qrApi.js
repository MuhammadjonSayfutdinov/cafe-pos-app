// Mijoz telefonidagi QR sahifa uchun API (kirishsiz). Server tomoni: supabase/qr.sql
//   getMenu(table) -> { cafe_name, service_fee, categories, menu }
//   submitOrder(table, items, note) -> { ok, id, items, subTotal }
//   callWaiter(table) -> { ok }
//   requestStatus(ids) -> [{ id, status }]

const friendlyError = (e) => {
  const msg = String(e?.message || e || '');
  if (/failed to fetch|network|load failed/i.test(msg)) return "Internet aloqasi yo'q. Qayta urinib ko'ring.";
  return msg.replace(/^.*?ERROR:\s*/i, '') || 'Xatolik yuz berdi';
};

// Mijoz QR sahifasi ishlashi uchun bulut sozlanganmi (stiker varag'ida ogohlantirish uchun)
export const isQrBackendConfigured = () => {
  const env = import.meta.env;
  return Boolean((env.MODE === 'e2e' && env.VITE_FAKE_SYNC_URL) || (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY));
};

export async function createQrApi() {
  const env = import.meta.env;
  let call;

  if (env.MODE === 'e2e' && env.VITE_FAKE_SYNC_URL) {
    const base = env.VITE_FAKE_SYNC_URL.replace(/\/$/, '');
    call = async (fn, args) => {
      const res = await fetch(`${base}/rpc/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || `Xato ${res.status}`);
      return body;
    };
  } else if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    call = async (fn, args) => {
      const { data, error } = await client.rpc(fn, args);
      if (error) throw new Error(error.message);
      return data;
    };
  } else {
    return null; // bulut sozlanmagan: QR orqali buyurtma ishlamaydi
  }

  const wrap = (fn) => async (...a) => {
    try {
      return await fn(...a);
    } catch (e) {
      throw new Error(friendlyError(e));
    }
  };

  return {
    getMenu: wrap((table) => call('qr_menu', { p_table: table })),
    submitOrder: wrap((table, items, note = '') => call('qr_submit_order', { p_table: table, p_items: items, p_note: note })),
    callWaiter: wrap((table) => call('qr_call_waiter', { p_table: table })),
    requestStatus: wrap((ids) => call('qr_request_status', { p_ids: ids }))
  };
}
