import React, { useEffect, useState } from 'react';
import { getSyncStatus, subscribeSyncStatus, syncNow, signOut, getDeviceId } from '../sync/engine';
import { confirmAsync, notify } from '../utils/notify';

const STATE_LABEL = {
  online: '🟢 Ulangan',
  syncing: "🔄 Ma'lumot yuborilmoqda",
  booting: '🔄 Yuklanmoqda',
  offline: "🟠 Oflayn (internet qaytganda yuboriladi)",
  auth: '⚪ Ulanmagan'
};

// Mahalliy serverning bulut bilan aloqasi (server/upstream.mjs)
const UPSTREAM_LABEL = {
  disabled: "⚪ Ulanmagan: server faqat kafe ichida ishlaydi",
  connecting: '🔄 Ulanmoqda',
  online: '🟢 Ulangan',
  offline: "🟠 Internet yo'q (kafe ichida ish davom etadi)",
  error: '🔴 Xato'
};

// Admin -> Tizim Sozlamalari: bulut sinxronlash holati va qurilmani uzish
export default function AdminSyncSection() {
  const [status, setStatus] = useState(getSyncStatus());
  useEffect(() => subscribeSyncStatus(setStatus), []);

  if (status.state === 'disabled') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 shadow-xs border border-gray-100 dark:border-gray-700 space-y-2">
        <h3 className="text-lg font-black text-gray-900 dark:text-white">☁️ Bulut sinxronlash</h3>
        <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
          O'chiq: ma'lumotlar faqat shu qurilmada saqlanadi. Bir nechta qurilmani ulash uchun
          loyihadagi SUPABASE.md qo'llanmasiga qarang.
        </p>
      </div>
    );
  }

  const hub = status.transport === 'hub';
  const up = status.upstream;
  const target = hub ? 'kafe serveri' : 'bulut';

  const handleSignOut = async () => {
    const ok = await confirmAsync(
      hub
        ? "⚠️ Bu qurilma kafe serveridan uziladi. Ma'lumotlar qurilmada qoladi, lekin boshqa qurilmalar bilan sinxronlanmaydi. Qayta ulash uchun server paroli kerak bo'ladi."
        : "⚠️ Bu qurilma bulutdan uziladi. Ma'lumotlar qurilmada qoladi, lekin boshqa qurilmalar bilan sinxronlanmaydi. Qayta ulash uchun email va parol kerak bo'ladi.",
      { confirmText: 'Uzish', danger: true }
    );
    if (!ok) return;
    let res = await signOut();
    if (!res.ok) {
      const force = await confirmAsync(
        `⚠️ ${res.pending} ta o'zgarish hali serverga yuborilmagan va YO'QOLADI. Baribir uzilsinmi?`,
        { confirmText: 'Baribir uzish', danger: true }
      );
      if (!force) return;
      res = await signOut({ force: true });
    }
    if (res.ok) notify(`✅ Qurilma ${target}dan uzildi`);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 shadow-xs border border-gray-100 dark:border-gray-700 space-y-4">
      <h3 className="text-lg font-black text-gray-900 dark:text-white">{hub ? '🖥️ Kafe mahalliy serveri' : '☁️ Bulut sinxronlash'}</h3>
      {hub && (
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400">
          Qurilma kafe ichidagi serverga ulangan: internet bo'lmasa ham ofitsiant, oshxona va kassa bir-birini ko'radi.
          Bulut (egasining telefoni, mijoz QR-buyurtmasi) bilan aloqani server o'zi yuritadi.
        </p>
      )}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60">
          <dt className="text-[10px] font-black uppercase text-gray-400">Holat</dt>
          <dd className="font-black text-gray-900 dark:text-white">{STATE_LABEL[status.state] || status.state}</dd>
        </div>
        <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60">
          <dt className="text-[10px] font-black uppercase text-gray-400">Yuborilmagan o'zgarishlar</dt>
          <dd className="font-black text-gray-900 dark:text-white">{status.pending} ta</dd>
        </div>
        <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60">
          <dt className="text-[10px] font-black uppercase text-gray-400">{hub ? 'Server → bulut' : 'Kafe hisobi'}</dt>
          <dd className="font-bold text-gray-900 dark:text-white break-all">
            {hub
              ? (up ? `${UPSTREAM_LABEL[up.state] || up.state}${up.pending ? ` · navbatda ${up.pending} ta` : ''}` : '—')
              : (status.email || '—')}
          </dd>
        </div>
        <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60">
          <dt className="text-[10px] font-black uppercase text-gray-400">Oxirgi sinxron</dt>
          <dd className="font-bold text-gray-900 dark:text-white">
            {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : '—'}
          </dd>
        </div>
      </dl>
      {status.error && status.state === 'offline' && (
        <p className="text-xs font-bold text-amber-700 dark:text-amber-300 break-words">Oxirgi xato: {status.error}</p>
      )}
      {hub && up?.error && up.state !== 'online' && (
        <p className="text-xs font-bold text-amber-700 dark:text-amber-300 break-words">Bulut xatosi: {up.error}</p>
      )}
      <p className="text-[11px] font-bold text-gray-400 break-all">Qurilma ID: {getDeviceId()}</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={syncNow}
          className="flex-1 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-black text-sm"
        >
          🔄 Hozir sinxronlash
        </button>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex-1 py-3 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 font-black text-sm hover:bg-red-100"
        >
          {hub ? 'Qurilmani serverdan uzish' : 'Qurilmani bulutdan uzish'}
        </button>
      </div>
    </div>
  );
}
