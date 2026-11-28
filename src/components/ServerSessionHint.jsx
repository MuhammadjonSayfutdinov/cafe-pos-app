import React, { useEffect, useState } from 'react';
import { getSyncStatus, subscribeSyncStatus } from '../sync/engine';

// Server xavfsizligi (supabase/security.sql): kirgan xodim serverda ham kirgan bo'lishi kerak,
// shunda server uning ruxsatiga mos ma'lumotni (hisobot, mijozlar, xarajatlar) beradi va
// o'zgarishlarini qabul qiladi. Masalan, xodim internet yo'q paytda yoki dastur yangilanishidan oldin
// kirgan bo'lsa, server uni bilmaydi: shu tugma chiqadi, bosilsa PIN qayta so'raladi.
const SHOW_AFTER_MS = 12000;

export default function ServerSessionHint({ currentUser, onRelogin }) {
  const [status, setStatus] = useState(getSyncStatus());
  const [stale, setStale] = useState(false);
  useEffect(() => subscribeSyncStatus(setStatus), []);

  const sec = status.security || {};
  const mismatch = Boolean(currentUser) && sec.installed === true && sec.status === 'trusted' &&
    status.state === 'online' && String(sec.staff?.id || '') !== String(currentUser?.id ?? '');

  // Kirgandan keyin server javobi kelguncha (internet sekin) tugma darhol chiqmasin
  useEffect(() => {
    if (!mismatch) {
      setStale(false);
      return undefined;
    }
    const t = setTimeout(() => setStale(true), SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [mismatch]);

  if (!mismatch || !stale) return null;
  return (
    <button
      type="button"
      onClick={onRelogin}
      title="Server sizni hali tanimaydi: ruxsat berilgan ma'lumot va o'zgarishlaringiz uchun PIN'ni qayta kiriting"
      className="h-10 px-3 rounded-xl border text-xs font-black flex items-center gap-1.5 whitespace-nowrap bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800 active:scale-95"
    >
      <span>🔑</span>
      <span className="hidden sm:inline">Qayta kiring</span>
    </button>
  );
}
