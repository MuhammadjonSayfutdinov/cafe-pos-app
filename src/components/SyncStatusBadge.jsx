import React, { useEffect, useState } from 'react';
import { getSyncStatus, subscribeSyncStatus, syncNow } from '../sync/engine';

// Sarlavhadagi kichik belgi: bulut bilan aloqa holati. Bosilsa - hozir sinxronlaydi.
export default function SyncStatusBadge() {
  const [status, setStatus] = useState(getSyncStatus());
  useEffect(() => subscribeSyncStatus(setStatus), []);

  if (status.state === 'disabled' || status.state === 'auth') return null;

  const pending = status.pending > 0 ? ` (${status.pending})` : '';
  const view = {
    online: { text: status.pending ? `Yuborilmoqda${pending}` : 'Bulut', icon: '☁️', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800' },
    syncing: { text: `Yuborilmoqda${pending}`, icon: '🔄', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800' },
    booting: { text: 'Yuklanmoqda', icon: '🔄', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800' },
    offline: { text: `Oflayn${pending}`, icon: '📴', cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800' }
  }[status.state] || null;

  if (!view) return null;

  const title = status.state === 'offline'
    ? `Internet yo'q yoki server javob bermayapti. O'zgarishlar qurilmada saqlanadi va internet qaytganda yuboriladi.${status.error ? `\n${status.error}` : ''}`
    : status.lastSyncAt
    ? `Oxirgi sinxron: ${new Date(status.lastSyncAt).toLocaleTimeString()}`
    : 'Bulut sinxronlash';

  return (
    <button
      type="button"
      onClick={syncNow}
      title={title}
      data-sync-state={status.state}
      className={`h-10 px-3 rounded-xl border text-xs font-black flex items-center gap-1.5 whitespace-nowrap transition active:scale-95 ${view.cls}`}
    >
      <span>{view.icon}</span>
      <span className="hidden sm:inline">{view.text}</span>
    </button>
  );
}
