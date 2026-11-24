import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CLOSED_ORDER_STATUSES } from '../constants/orderStatus';

// Mijoz "🔔 Ofitsiant" tugmasini bosganda (telefondagi QR sahifa: supabase/qr.sql -> qr_call_waiter,
// yoki kafedagi mijoz ekrani) pos_calls ga yozuv tushadi. Oldin bu yozuvni hech bir ekran
// ko'rsatmasdi: chaqiruv telefondan "yuborildi", lekin xodim uni ko'rmasdi.
// Endi ofitsiant, kassir va admin ekranining tepasida chiqadi (ovozli signal bilan).

const beep = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [0, 0.25].forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(988, now + offset);
      gain.gain.setValueAtTime(0.3, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.2);
    });
  } catch {
    // ovoz bloklangan
  }
};

/** Stol bo'yicha bitta chaqiruv: pos_calls yozuvlari + eski usul (buyurtmadagi hasCall) */
export function collectTableCalls(waiterCalls, orders) {
  const map = new Map();
  (Array.isArray(waiterCalls) ? waiterCalls : []).forEach(c => {
    const table = typeof c === 'string' ? c : c?.table;
    if (!table || map.has(String(table))) return;
    map.set(String(table), {
      table: String(table),
      time: typeof c === 'object' ? String(c?.time || '') : '',
      createdAt: typeof c === 'object' ? Number(c?.createdAt || 0) : 0,
      fromPhone: typeof c === 'object' && c?.source === 'qr'
    });
  });
  (Array.isArray(orders) ? orders : []).forEach(o => {
    if (!o || !o.hasCall || CLOSED_ORDER_STATUSES.includes(o.status) || map.has(String(o.table))) return;
    map.set(String(o.table), { table: String(o.table), time: '', createdAt: 0, fromPhone: false });
  });
  return [...map.values()];
}

const agoText = (createdAt, nowMs) => {
  if (!createdAt) return '';
  const min = Math.floor(Math.max(0, nowMs - createdAt) / 60000);
  return min < 1 ? 'hozirgina' : `${min} daqiqa oldin`;
};

export default function WaiterCallsPanel({ waiterCalls, orders, onClear }) {
  const calls = useMemo(() => collectTableCalls(waiterCalls, orders), [waiterCalls, orders]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (calls.length === 0) return undefined;
    const t = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(t);
  }, [calls.length]);

  const prevCount = useRef(calls.length);
  useEffect(() => {
    if (calls.length > prevCount.current) beep();
    prevCount.current = calls.length;
  }, [calls.length]);

  if (calls.length === 0) return null;

  return (
    <div className="mb-4 space-y-2" data-testid="waiter-calls">
      {calls.map(call => (
        <div
          key={call.table}
          className="p-3 sm:p-4 rounded-2xl bg-red-600 text-white shadow-lg shadow-red-600/30 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
        >
          <div className="flex-1 min-w-0">
            <p className="font-black text-base sm:text-lg break-words">
              <span className="inline-block animate-bounce">🔔</span> {call.table}: mijoz ofitsiantni chaqiryapti
            </p>
            <p className="text-xs font-bold text-red-100">
              {[call.time, agoText(call.createdAt, nowMs), call.fromPhone ? '📱 telefondan' : '']
                .filter(Boolean)
                .join(' • ')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => typeof onClear === 'function' && onClear(call.table)}
            className="shrink-0 px-4 py-2.5 rounded-xl bg-white text-red-600 hover:bg-red-50 font-black text-sm transition active:scale-95"
          >
            ✓ Bordim
          </button>
        </div>
      ))}
    </div>
  );
}
