import React, { useEffect, useState } from 'react';
import { getSyncStatus, subscribeSyncStatus, signIn, isFirstSyncPending, syncNow } from '../sync/engine';

// Bulut sinxronlash yoqilgan bo'lsa: qurilma kafe hisobiga ulanmaguncha ilovani ko'rsatmaydi.
// Sinxronlash o'chiq bo'lsa (.env.local bo'sh) - darhol ilovani ko'rsatadi.
export default function SyncGate({ children }) {
  const [status, setStatus] = useState(getSyncStatus());
  const [skipWait, setSkipWait] = useState(false);

  useEffect(() => subscribeSyncStatus(setStatus), []);

  // Internet sekin bo'lsa, 8 soniyadan keyin qurilmadagi ma'lumot bilan ochiladi
  useEffect(() => {
    if (status.state !== 'booting') return undefined;
    const t = setTimeout(() => setSkipWait(true), 8000);
    return () => clearTimeout(t);
  }, [status.state]);

  if (status.state === 'auth') return <DeviceLogin hub={status.transport === 'hub'} />;

  // Yangi qurilma: bulut ma'lumoti kelmaguncha ilova ochilmaydi. Aks holda namuna xodimlar
  // (777777, 2222...) bilan kirish mumkin bo'lardi va ular bulutdagi ma'lumotni buzardi.
  if ((status.state === 'booting' || status.state === 'offline') && isFirstSyncPending()) {
    return <FirstSyncScreen status={status} />;
  }

  if (status.state === 'booting' && !skipWait) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 bg-gray-100 dark:bg-gray-900 text-center">
        <div className="w-14 h-14 rounded-full border-4 border-gray-200 dark:border-gray-700 border-t-brand-500 animate-spin" />
        <p className="font-black text-gray-800 dark:text-gray-100">Ma'lumotlar bulutdan yuklanmoqda...</p>
        <button
          type="button"
          onClick={() => setSkipWait(true)}
          className="text-xs font-bold text-gray-500 underline"
        >
          Kutmasdan qurilmadagi ma'lumot bilan ochish
        </button>
      </div>
    );
  }

  return children;
}

function FirstSyncScreen({ status }) {
  const failed = status.state === 'offline';
  const hub = status.transport === 'hub';
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!busy) return undefined;
    const t = setTimeout(() => setBusy(false), 3000);
    return () => clearTimeout(t);
  }, [busy]);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 bg-gray-100 dark:bg-gray-900 text-center">
      {failed ? (
        <div className="text-5xl">📴</div>
      ) : (
        <div className="w-14 h-14 rounded-full border-4 border-gray-200 dark:border-gray-700 border-t-brand-500 animate-spin" />
      )}
      <p className="font-black text-gray-800 dark:text-gray-100">
        {failed
          ? (hub ? "Kafe serveridan ma'lumot olib bo'lmadi" : "Bulutdan ma'lumot olib bo'lmadi")
          : (hub ? "Ma'lumotlar kafe serveridan yuklanmoqda..." : "Ma'lumotlar bulutdan yuklanmoqda...")}
      </p>
      <p className="max-w-sm text-xs font-bold text-gray-500 dark:text-gray-400">
        {failed
          ? (hub
            ? "Server kompyuteri yoqilganini va qurilma kafe Wi-Fi'siga ulanganini tekshiring. Dastur o'zi qayta urinib turadi."
            : "Internetni tekshiring. Dastur o'zi qayta urinib turadi. Bu qurilma birinchi marta ulanmoqda, shuning uchun menyu va xodimlar kelmaguncha ochilmaydi.")
          : "Bu qurilma birinchi marta ulanmoqda. Internet sekin bo'lsa, biroz kuting."}
      </p>
      {failed && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              syncNow();
            }}
            className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 active:scale-95 text-white font-black"
          >
            {busy ? 'Urinilmoqda...' : '🔄 Qayta urinish'}
          </button>
          {status.error && (
            <p className="max-w-sm text-[10px] font-bold text-gray-400 break-words">{String(status.error)}</p>
          )}
        </>
      )}
    </div>
  );
}

// hub: sahifa kafe mahalliy serveridan ochilgan (faqat server paroli so'raladi)
function DeviceLogin({ hub = false }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if ((!hub && !email.trim()) || !password) {
      setError(hub ? 'Server parolini kiriting' : 'Email va parolni kiriting');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      const msg = String(err?.message || err);
      setError(
        /invalid login credentials|noto'g'ri/i.test(msg)
          ? (hub ? "Server paroli noto'g'ri" : "Email yoki parol noto'g'ri")
          : /fetch|network|failed|javob bermadi/i.test(msg)
          ? (hub
            ? "Kafe serveriga ulanib bo'lmadi. Server kompyuteri yoqilganini va Wi-Fi'ni tekshiring."
            : "Internet aloqasi yo'q. Ulanishni tekshirib, qayta urinib ko'ring.")
          : msg
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-100 dark:bg-gray-900">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-3xl p-6 sm:p-8 shadow-xl border border-gray-100 dark:border-gray-700 space-y-4"
      >
        <div className="text-center">
          <div className="text-4xl mb-2">{hub ? '🖥️' : '☁️'}</div>
          <h1 className="text-xl font-black text-gray-900 dark:text-white">
            {hub ? 'Kafe serveriga ulash' : 'Qurilmani ulash'}
          </h1>
          <p className="mt-1 text-xs font-bold text-gray-500 dark:text-gray-400">
            {hub
              ? "Bu qurilmani kafe serveriga bir marta ulang (parol server kompyuterida, .env.local faylidagi HUB_PASSWORD). Keyin xodimlar odatdagidek PIN bilan kiradi."
              : 'Bu qurilmani kafe hisobiga bir marta ulang. Keyin xodimlar odatdagidek PIN bilan kiradi.'}
          </p>
        </div>

        {!hub && (
        <label className="block">
          <span className="text-[11px] font-black uppercase text-gray-500">Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="mt-1 w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-gray-900 dark:text-white outline-hidden focus:border-brand-500"
          />
        </label>
        )}

        <label className="block">
          <span className="text-[11px] font-black uppercase text-gray-500">{hub ? 'Server paroli' : 'Parol'}</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="mt-1 w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-gray-900 dark:text-white outline-hidden focus:border-brand-500"
          />
        </label>

        {error && <p className="text-xs font-black text-red-600 dark:text-red-400">❌ {error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-black"
        >
          {busy ? 'Ulanmoqda...' : 'Ulash'}
        </button>
      </form>
    </div>
  );
}
