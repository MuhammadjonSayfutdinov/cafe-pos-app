import React, { useEffect, useMemo, useRef } from 'react';

// Mijoz telefonidan kelgan QR-buyurtma so'rovlari (supabase/qr.sql -> pos_qr_requests).
// Ofitsiant/kassir/admin ekranida chiqadi: "Qabul qilish" -> buyurtma oshxonaga tushadi.

const beep = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    // ovoz bloklangan
  }
};

export default function QrRequestsPanel({ requests, onAccept, onReject }) {
  const pending = useMemo(
    () => (Array.isArray(requests) ? requests : []).filter(r => r && r.status === 'pending'),
    [requests]
  );

  const prevCount = useRef(pending.length);
  useEffect(() => {
    if (pending.length > prevCount.current) beep();
    prevCount.current = pending.length;
  }, [pending.length]);

  if (pending.length === 0) return null;

  return (
    <div className="mb-4 space-y-3" data-testid="qr-requests">
      {pending.map(req => {
        const items = Array.isArray(req.items) ? req.items : [];
        const total = Number(req.subTotal || 0);
        return (
          <div
            key={req.id}
            className="p-4 rounded-2xl bg-sky-50 dark:bg-sky-900/30 border-2 border-sky-300 dark:border-sky-700 flex flex-col md:flex-row md:items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="font-black text-sky-900 dark:text-sky-100">
                📱 QR-buyurtma: {req.table}
                <span className="ml-2 text-xs font-bold text-sky-700 dark:text-sky-300">{req.time}</span>
              </p>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200 break-words">
                {items.map(it => `${it.name} ×${it.quantity}`).join(', ')}
              </p>
              {req.note && <p className="text-xs font-bold text-red-600 dark:text-red-300">Izoh: {req.note}</p>}
              <p className="text-xs font-black text-sky-700 dark:text-sky-300 mt-0.5">
                {total.toLocaleString()} so'm (xizmat haqisiz)
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onReject(req)}
                className="px-4 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 font-black text-sm"
              >
                Rad etish
              </button>
              <button
                type="button"
                onClick={() => onAccept(req)}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm"
              >
                ✅ Qabul qilish
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
