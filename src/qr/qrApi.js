// Mijoz telefonidagi QR sahifa uchun API (kirishsiz). Server tomoni: supabase/qr.sql
//   getMenu(table, ctx) -> { cafe_name, service_fee, categories, menu, access }
//   submitOrder(table, items, note, ctx) -> { ok, id, items, subTotal }
//   callWaiter(table, ctx) -> { ok }
//   requestStatus(ids) -> [{ id, status, orderStatus, closed }]
// ctx: { k: stol kaliti (QR havoladan), r: oldingi so'rov id lari, lat, lng, acc: joylashuv }
// Xato: error.message - mijozga ko'rsatiladigan matn, error.hint - 'busy' | 'geo' | 'far'

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
      if (!res.ok) {
        const err = new Error(body?.message || `Xato ${res.status}`);
        err.hint = body?.hint || '';
        throw err;
      }
      return body;
    };
  } else if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    call = async (fn, args) => {
      const { data, error } = await client.rpc(fn, args);
      if (error) {
        const err = new Error(error.message);
        err.hint = error.hint || '';
        throw err;
      }
      return data;
    };
  } else {
    return null; // bulut sozlanmagan: QR orqali buyurtma ishlamaydi
  }

  // supabase/qr.sql hali yangilanmagan bo'lsa (eski funksiyalarda p_ctx parametri yo'q), eski usulda
  // qayta chaqiramiz: QR sahifa ishlashda davom etadi, himoya esa SQL yangilangach ishlaydi.
  // Supabase xatosi: "Could not find the function public.qr_menu(p_ctx, p_table) in the schema cache"
  const isOldServer = (e) => /could not find the function|schema cache|PGRST202/i.test(String(e?.message || ''));
  const callCompat = async (fn, args) => {
    try {
      return await call(fn, args);
    } catch (e) {
      if (!Object.prototype.hasOwnProperty.call(args, 'p_ctx') || !isOldServer(e)) throw e;
      const { p_ctx: _ctx, ...oldArgs } = args;
      console.warn("supabase/qr.sql eski versiyada: QR himoyasi ishlamayapti. SQL Editor'da qayta ishga tushiring.");
      return call(fn, oldArgs);
    }
  };

  const wrap = (fn) => async (...a) => {
    try {
      return await fn(...a);
    } catch (e) {
      const err = new Error(friendlyError(e));
      err.hint = e?.hint || '';
      throw err;
    }
  };

  return {
    getMenu: wrap((table, ctx = {}) => callCompat('qr_menu', { p_table: table, p_ctx: ctx })),
    submitOrder: wrap((table, items, note = '', ctx = {}) =>
      callCompat('qr_submit_order', { p_table: table, p_items: items, p_note: note, p_ctx: ctx })),
    callWaiter: wrap((table, ctx = {}) => callCompat('qr_call_waiter', { p_table: table, p_ctx: ctx })),
    requestStatus: wrap((ids) => call('qr_request_status', { p_ids: ids }))
  };
}
