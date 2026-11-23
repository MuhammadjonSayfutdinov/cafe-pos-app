import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CustomerQRView from '../components/CustomerQRView';
import { createQrApi } from './qrApi';

// Mijoz telefonidagi QR-menyu (?table=3-Stol). Kirish talab qilinmaydi.
// Buyurtma "so'rov" bo'lib boradi; ofitsiant qabul qilgach oshxonaga tushadi.
const STORE_KEY = (table) => `qr_my_requests_${table}`;

const readMine = (table) => {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY(table)) || '[]');
    // Faqat bugungi so'rovlar
    const dayAgo = Date.now() - 12 * 60 * 60 * 1000;
    return Array.isArray(list) ? list.filter(r => r && Number(r.createdAt) > dayAgo) : [];
  } catch {
    return [];
  }
};

export default function PublicQrApp({ table }) {
  const [api, setApi] = useState(undefined);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [mine, setMine] = useState(() => readMine(table));
  const isDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY(table), JSON.stringify(mine));
    } catch {
      // ignore
    }
  }, [mine, table]);

  const loadMenu = useCallback(async (qrApi) => {
    setError('');
    try {
      setData(await qrApi.getMenu(table));
    } catch (e) {
      setError(e.message);
    }
  }, [table]);

  useEffect(() => {
    createQrApi().then(a => {
      setApi(a);
      if (a) loadMenu(a);
    });
  }, [loadMenu]);

  // Kutilayotgan so'rovlar holatini har 8 soniyada tekshiramiz
  useEffect(() => {
    if (!api) return undefined;
    const pendingIds = mine.filter(r => r.status === 'pending').map(r => r.id);
    if (pendingIds.length === 0) return undefined;
    const t = setInterval(async () => {
      try {
        const list = await api.requestStatus(pendingIds);
        const map = new Map((Array.isArray(list) ? list : []).map(x => [x.id, x.status]));
        setMine(prev => prev.map(r => (map.has(r.id) ? { ...r, status: map.get(r.id) } : r)));
      } catch {
        // keyingi safar
      }
    }, 8000);
    return () => clearInterval(t);
  }, [api, mine]);

  const handleSubmit = async (cart) => {
    if (!api) return { ok: false, error: "QR orqali buyurtma hozircha o'chiq" };
    const items = (Array.isArray(cart) ? cart : []).map(c => ({
      menu_id: String(c.id),
      variant_name: c.variantName || '',
      quantity: Number(c.quantity || c.qty || 1),
      note: c.note || ''
    }));
    try {
      const res = await api.submitOrder(table, items);
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
      await api.callWaiter(table);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  const orders = useMemo(() => mine.filter(r => r.status !== 'hidden'), [mine]);

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
