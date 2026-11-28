import React, { useEffect, useState } from 'react';
import { getSyncStatus, subscribeSyncStatus, syncNow } from '../sync/engine';

// Sarlavhadagi kichik belgi: bulut bilan aloqa holati. Bosilsa - hozir sinxronlaydi.
export default function SyncStatusBadge() {
  const [status, setStatus] = useState(getSyncStatus());
  useEffect(() => subscribeSyncStatus(setStatus), []);

  if (status.state === 'disabled' || status.state === 'auth' || status.state === 'device') return null;

  const pending = status.pending > 0 ? ` (${status.pending})` : '';
  // Server ruxsat bermagan o'zgarishlar (supabase/security.sql): Tizim sozlamalari -> Qurilmalar
  const heldNote = status.held > 0
    ? `\n⏸ ${status.held} ta o'zgarish serverga qabul qilinmadi (ruxsat yo'q). Huquqi bor xodim internet bilan kirsa, qayta yuboriladi.`
    : '';
  // Server javob beradi, lekin sekin (src/sync/engine.js -> timed): ish to'xtamaydi, faqat ogohlantirish
  const slowView = { text: `Sekin internet${pending}`, icon: '🐢', cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800' };
  const view = status.slow && (status.state === 'online' || status.state === 'syncing') ? slowView : {
    online: { text: status.pending ? `Yuborilmoqda${pending}` : 'Bulut', icon: '☁️', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800' },
    syncing: { text: `Yuborilmoqda${pending}`, icon: '🔄', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800' },
    booting: { text: 'Yuklanmoqda', icon: '🔄', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800' },
    offline: { text: `Oflayn${pending}`, icon: '📴', cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800' }
  }[status.state] || null;

  if (!view) return null;

  // Kafe mahalliy serveri: qurilma serverga ulangan; bulut bilan aloqani server o'zi yuritadi
  const hub = status.transport === 'hub';
  const up = status.upstream;
  const upOffline = hub && up && (up.state === 'offline' || up.state === 'error');
  if (hub && status.state === 'online' && !status.slow && !status.pending) {
    view.icon = '🖥️';
    view.text = upOffline ? `Server · bulutsiz${up.pending ? ` (${up.pending})` : ''}` : 'Server';
    if (upOffline) view.cls = 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800';
  }
  const upstreamText = !hub || !up ? ''
    : up.state === 'disabled' ? '\nBulut: ulanmagan (faqat kafe ichida ishlaydi)'
    : up.state === 'online' ? `\nBulut: ulangan${up.pending ? `, ${up.pending} ta yuborilmoqda` : ''}`
    : up.state === 'error' ? `\nBulut: xato - ${up.error || ''}`
    : `\nBulut: internet yo'q, ${up.pending} ta o'zgarish serverda navbatda (kafe ichida ish davom etadi)`;

  const title = hub && status.state === 'offline'
    ? `Kafe serveriga ulanib bo'lmadi (server kompyuteri yoki Wi-Fi). O'zgarishlar qurilmada saqlanadi va server bilan aloqa tiklanganda yuboriladi.${status.error ? `\n${status.error}` : ''}`
    : hub
    ? `Kafe serveriga ulangan${status.lastSyncAt ? ` (oxirgi sinxron: ${new Date(status.lastSyncAt).toLocaleTimeString()})` : ''}${upstreamText}`
    : status.state === 'offline'
    ? `Internet yo'q yoki server javob bermayapti. O'zgarishlar qurilmada saqlanadi va internet qaytganda yuboriladi.${status.error ? `\n${status.error}` : ''}`
    : status.slow
    ? "Internet sekin: ish davom etadi, o'zgarishlar qurilmada saqlanib, navbat bilan yuboriladi."
    : status.lastSyncAt
    ? `Oxirgi sinxron: ${new Date(status.lastSyncAt).toLocaleTimeString()}`
    : 'Bulut sinxronlash';

  if (status.held > 0 && (status.state === 'online' || status.state === 'syncing')) {
    view.icon = '⏸';
    view.text = `Kutmoqda (${status.held})`;
    view.cls = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800';
  }

  return (
    <button
      type="button"
      onClick={syncNow}
      title={`${title}${heldNote}`}
      data-sync-state={status.state}
      data-sync-slow={status.slow ? 'true' : undefined}
      data-sync-upstream={hub && up ? up.state : undefined}
      className={`h-10 px-3 rounded-xl border text-xs font-black flex items-center gap-1.5 whitespace-nowrap transition active:scale-95 ${view.cls}`}
    >
      <span>{view.icon}</span>
      <span className="hidden sm:inline">{view.text}</span>
    </button>
  );
}
