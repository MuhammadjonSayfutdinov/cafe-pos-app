import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collectStaffNotices } from '../utils/kitchenFlow';

// Oshxonadan xodimlarga xabarlar (ofitsiant, kassir va admin ekranining tepasida, ovoz bilan):
//  - oshxona rad etgan taomlar: chekdan olib tashlangan, mijozga aytish kerak
//    (chek to'langan bo'lsa - qancha pul qaytarish kerakligi);
//  - oshxona tugatmasdan to'langan chek tayyor bo'ldi: mijozga berish kerak.
// "✓" bosilsa xabar barcha qurilmalarda yopiladi (chek yozuviga ackAt yoziladi).

const beep = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [0, 0.22, 0.44].forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(740, now + offset);
      gain.gain.setValueAtTime(0.28, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.18);
    });
  } catch {
    // ovoz bloklangan
  }
};

const linesText = (lines) => lines.map(l => `${l.qty}× ${l.name}`).join(', ');
const timeText = (ms) => (ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

export default function KitchenNoticesPanel({ orders, onAck }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const notices = useMemo(() => collectStaffNotices(orders, nowMs), [orders, nowMs]);

  // Yangi xabar kelsa ovoz (ekran ochilganda eskilari uchun chalinmaydi)
  const prevCount = useRef(notices.length);
  useEffect(() => {
    if (notices.length > prevCount.current) beep();
    prevCount.current = notices.length;
  }, [notices.length]);

  if (notices.length === 0) return null;

  return (
    <div className="mb-4 space-y-2" data-testid="kitchen-notices">
      {notices.map(n => (
        n.kind === 'rejected' ? (
          <div
            key={n.key}
            className="p-3 sm:p-4 rounded-2xl bg-orange-600 text-white shadow-lg shadow-orange-600/30 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="font-black text-base sm:text-lg break-words">
                ❌ {n.table}: oshxona rad etdi — {linesText(n.lines)}
              </p>
              <p className="text-xs font-bold text-orange-100 break-words">
                {[
                  n.reasons.length > 0 ? `Sabab: ${n.reasons.join('; ')}` : '',
                  timeText(n.at),
                  n.by ? `👨‍🍳 ${n.by}` : '',
                  "chekdan olib tashlandi, mijozga ayting"
                ].filter(Boolean).join(' • ')}
              </p>
              {n.refundDue > 0 && (
                <p className="mt-1.5 inline-block text-xs font-black bg-white/20 rounded-lg px-2.5 py-1">
                  💸 Chek to'langan: mijozga {n.refundDue.toLocaleString()} so'm qaytaring (Kassa → "💸 Qaytarish")
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => typeof onAck === 'function' && onAck(n)}
              className="shrink-0 px-4 py-2.5 rounded-xl bg-white text-orange-700 hover:bg-orange-50 font-black text-sm transition active:scale-95"
            >
              ✓ Tushunarli
            </button>
          </div>
        ) : (
          <div
            key={n.key}
            className="p-3 sm:p-4 rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="font-black text-base sm:text-lg break-words">
                <span className="inline-block animate-bounce">🔔</span> {n.table}: buyurtma tayyor
                {n.lines.length > 0 ? ` — ${linesText(n.lines)}` : ''}
              </p>
              <p className="text-xs font-bold text-emerald-100">
                {timeText(n.at)} • chek oldindan to'langan • mijozga bering
              </p>
            </div>
            <button
              type="button"
              onClick={() => typeof onAck === 'function' && onAck(n)}
              className="shrink-0 px-4 py-2.5 rounded-xl bg-white text-emerald-700 hover:bg-emerald-50 font-black text-sm transition active:scale-95"
            >
              ✓ Berildi
            </button>
          </div>
        )
      ))}
    </div>
  );
}
