import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CustomerQRView from '../components/CustomerQRView';
import { createQrApi } from './qrApi';

// Mijoz telefonidagi QR-menyu (?table=3-Stol&k=<stol kaliti>). Kirish talab qilinmaydi.
// Buyurtma "so'rov" bo'lib boradi; ofitsiant qabul qilgach oshxonaga tushadi.
//
// Himoya (server tekshiradi: supabase/qr.sql -> qr_access):
//  - band stolga faqat stoldagi QR stikerni skaner qilgan mijoz (to'g'ri k=) buyurtma beradi;
//  - "faqat kafe ichidan" yoqilgan bo'lsa, buyurtma va chaqiruvga telefon joylashuvi qo'shiladi.
const STORE_KEY = (table) => `qr_my_requests_${table}`;
const POLL_MS = 8000;
const POSITION_MAX_AGE_MS = 60000;

const readMine = (table) => {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY(table)) || '[]');
    // Faqat bugungi va hali yopilmagan (to'lanmagan) so'rovlar
    const dayAgo = Date.now() - 12 * 60 * 60 * 1000;
    return Array.isArray(list) ? list.filter(r => r && !r.closed && Number(r.createdAt) > dayAgo) : [];
  } catch {
    return [];
  }
};

// Hali kuzatiladigan so'rov: ofitsiant ko'rmagan yoki qabul qilingan, lekin chek yopilmagan
const isTracked = (r) => r && !r.closed && (r.status === 'pending' || r.status === 'accepted');

// Telefon joylashuvi (GPS). Mijoz ruxsat bermasa - tushunarli xato matni
const readPosition = () => new Promise((resolve, reject) => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    reject(new Error("Telefoningiz joylashuvni aniqlay olmaydi. Buyurtma uchun ofitsiantni chaqiring."));
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (p) => resolve({
      lat: Number(p.coords.latitude),
      lng: Number(p.coords.longitude),
      acc: Math.round(Number(p.coords.accuracy) || 0)
    }),
    (err) => reject(new Error(err?.code === 1
      ? "Joylashuvga ruxsat berilmadi. Buyurtma faqat kafe ichidan qabul qilinadi: brauzer sozlamasida shu sayt uchun joylashuvga ruxsat bering."
      : "Joylashuvni aniqlab bo'lmadi. Telefonda GPS (joylashuv) ni yoqib, qayta urinib ko'ring.")),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: POSITION_MAX_AGE_MS }
  );
});

export default function PublicQrApp({ table, tableKey = '' }) {
  const [api, setApi] = useState(undefined);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [mine, setMine] = useState(() => readMine(table));
  const [geoRequired, setGeoRequired] = useState(false);
  const isDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

  const mineRef = useRef(mine);
  mineRef.current = mine;
  const geoRequiredRef = useRef(false);
  geoRequiredRef.current = geoRequired;
  const positionRef = useRef(null); // { lat, lng, acc, at }

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY(table), JSON.stringify(mine));
    } catch {
      // ignore
    }
  }, [mine, table]);

  // Serverga boradigan kontekst: stol kaliti va shu telefonning ochiq so'rovlari
  // (o'zi ochgan chekka kalitsiz ham qo'shimcha buyurtma bera olsin)
  const baseCtx = useCallback(() => ({
    k: tableKey,
    r: mineRef.current.filter(isTracked).map(r => r.id).slice(0, 20)
  }), [tableKey]);

  const loadMenu = useCallback(async (qrApi) => {
    setError('');
    try {
      const menu = await qrApi.getMenu(table, baseCtx());
      setData(menu);
      setGeoRequired(Boolean(menu?.access?.geo_required));
    } catch (e) {
      setError(e.message);
    }
  }, [table, baseCtx]);

  useEffect(() => {
    createQrApi().then(a => {
      setApi(a);
      if (a) loadMenu(a);
    });
  }, [loadMenu]);

  const getPosition = async () => {
    const cached = positionRef.current;
    if (cached && Date.now() - cached.at < POSITION_MAX_AGE_MS) {
      return { lat: cached.lat, lng: cached.lng, acc: cached.acc };
    }
    const pos = await readPosition();
    positionRef.current = { ...pos, at: Date.now() };
    return pos;
  };

  // Server chaqiruvi: kerak bo'lsa joylashuv qo'shiladi. Admin "faqat kafe ichidan" ni
  // sahifa ochilgandan keyin yoqgan bo'lsa (hint 'geo'), joylashuv bilan bir marta qayta urinamiz.
  const callWithAccess = async (fn) => {
    let withGeo = geoRequiredRef.current;
    for (let attempt = 0; ; attempt++) {
      const ctx = baseCtx();
      if (withGeo) Object.assign(ctx, await getPosition());
      try {
        return await fn(ctx);
      } catch (e) {
        if (e.hint === 'geo' && !withGeo && attempt === 0) {
          withGeo = true;
          setGeoRequired(true);
          continue;
        }
        if (e.hint === 'busy') {
          setData(prev => (prev ? { ...prev, access: { ...(prev.access || {}), blocked: true, message: e.message } } : prev));
        }
        if (e.hint === 'far') positionRef.current = null; // keyingi urinishda joylashuv yangidan olinsin
        throw e;
      }
    }
  };

  // So'rovlar holati: kutilmoqda -> qabul qilindi -> oshxona (Yangi/Tayyor/...) -> chek yopildi.
  // Chek to'langach so'rov ro'yxatdan olib tashlanadi (oldin "tayyorlanmoqda" bo'lib qolib ketardi).
  const trackedKey = useMemo(() => mine.filter(isTracked).map(r => r.id).join(','), [mine]);

  useEffect(() => {
    if (!api || !trackedKey) return undefined;
    const ids = trackedKey.split(',');
    let stopped = false;

    const check = async () => {
      try {
        const list = await api.requestStatus(ids);
        if (stopped) return;
        const map = new Map((Array.isArray(list) ? list : []).map(x => [x.id, x]));
        setMine(prev => {
          let changed = false;
          const next = prev.map(r => {
            const s = map.get(r.id);
            if (!s) return r;
            const upd = {
              ...r,
              status: s.status || r.status,
              orderStatus: s.orderStatus || '',
              // Server yozuvi o'chirilgan (status yo'q) yoki chek yopilgan
              closed: Boolean(s.closed) || !s.status
            };
            if (upd.status === r.status && upd.orderStatus === (r.orderStatus || '') && upd.closed === Boolean(r.closed)) return r;
            changed = true;
            return upd;
          });
          return changed ? next : prev;
        });
      } catch {
        // keyingi safar
      }
    };

    check();
    const t = setInterval(check, POLL_MS);
    // Telefon ekrani qayta yoqilganda darhol tekshiramiz
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [api, trackedKey]);

  const handleSubmit = async (cart) => {
    if (!api) return { ok: false, error: "QR orqali buyurtma hozircha o'chiq" };
    const items = (Array.isArray(cart) ? cart : []).map(c => ({
      menu_id: String(c.id),
      variant_name: c.variantName || '',
      quantity: Number(c.quantity || c.qty || 1),
      note: c.note || ''
    }));
    try {
      const res = await callWithAccess(ctx => api.submitOrder(table, items, '', ctx));
      const record = {
        id: res.id,
        table,
        status: 'pending',
        createdAt: Date.now(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        items: res.items,
        subtotal: res.subTotal,
        total: res.subTotal
      };
      setMine(prev => [record, ...prev]);
      return { ok: true, message: "📨 Buyurtma ofitsiantga yuborildi. Tasdiqlanishini kuting." };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  const handleCallWaiter = async () => {
    if (!api) return { ok: false };
    try {
      await callWithAccess(ctx => api.callWaiter(table, ctx));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  // Ekranda: yopilgan cheklar ko'rinmaydi; qabul qilingan so'rov oshxonadagi holat bilan chiqadi
  const orders = useMemo(
    () => mine
      .filter(r => r && !r.closed && r.status !== 'hidden')
      .map(r => (r.status === 'accepted' && r.orderStatus ? { ...r, status: r.orderStatus } : r)),
    [mine]
  );

  const access = data?.access || {};
  const notice = access.blocked
    ? { tone: 'warn', text: `🔒 ${access.message || "Bu stol band. Stoldagi QR kodni skaner qiling."}` }
    : tableKey && access.key_ok === false
    ? { tone: 'warn', text: "⚠️ Bu QR stiker eskirgan: stol band bo'lsa buyurtma o'tmaydi. Ofitsiantga ayting (admin yangi stiker chop etadi)." }
    : geoRequired
    ? { tone: 'info', text: "📍 Buyurtma va chaqiruv faqat kafe ichidan qabul qilinadi: telefon joylashuvni so'raydi, ruxsat bering." }
    : null;

  if (api === null) {
    return (
      <Message title="QR-menyu hozircha ishlamaydi" text="Buyurtma berish uchun ofitsiantni chaqiring." />
    );
  }
  if (error && !data) {
    return (
      <Message title="Menyuni yuklab bo'lmadi" text={error}>
        <button
          type="button"
          onClick={() => api && loadMenu(api)}
          className="mt-4 px-5 py-3 rounded-xl bg-indigo-600 text-white font-black"
        >
          🔄 Qayta urinish
        </button>
      </Message>
    );
  }
  if (!data) {
    return <Message title="Menyu yuklanmoqda..." spinner />;
  }

  return (
    <CustomerQRView
      cafeName={data.cafe_name || 'Menyu'}
      table={table}
      menuItems={Array.isArray(data.menu) ? data.menu : []}
      menuCategories={Array.isArray(data.categories) ? data.categories : []}
      serviceFee={table === 'Olib ketish' ? 0 : Number(data.service_fee || 0)}
      orders={orders}
      isDarkMode={isDark}
      notice={notice}
      onSubmitOrder={handleSubmit}
      onCallWaiter={handleCallWaiter}
    />
  );
}

function Message({ title, text, spinner, children }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center bg-gray-50 dark:bg-gray-900">
      {spinner && <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />}
      <h1 className="text-lg font-black text-gray-900 dark:text-white">{title}</h1>
      {text && <p className="text-sm font-bold text-gray-500 dark:text-gray-400 max-w-sm">{text}</p>}
      {children}
    </div>
  );
}
