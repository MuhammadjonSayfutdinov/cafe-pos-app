import React, { useEffect, useState } from 'react';
import { signOut, syncNow } from '../sync/engine';
import { approveThisDevice } from '../sync/staffAuth';
import { confirmAsync, notify } from '../utils/notify';

// Server xavfsizligi (supabase/security.sql): kafe hisobiga ulangan, lekin hali tasdiqlanmagan yoki
// bloklangan qurilma. Tasdiqlash: Ega yoki "Tizim sozlamalari" huquqli admin shu yerda PIN'ini
// kiritadi yoki boshqa qurilmada Boshqaruv -> Tizim sozlamalari -> "📱 Qurilmalar" da tasdiqlaydi.
// Holat har 15 soniyada o'zi tekshiriladi (src/sync/engine.js -> enterDeviceState).

const inputCls = 'mt-1 w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-gray-900 dark:text-white outline-hidden focus:border-brand-500';

const REASON_TEXT = {
  wrong: "❌ PIN noto'g'ri (faqat Ega yoki admin PIN'i).",
  bad_code: "❌ Authenticator kodi noto'g'ri.",
  reused: '⏳ Bu kod hozirgina ishlatilgan: ilovada yangi kod chiqishini kuting.',
  not_allowed: "⛔️ Bu admin qurilmalarni tasdiqlay olmaydi (Ega yoki \"Tizim sozlamalari\" huquqi kerak).",
  revoked: '⛔️ Qurilma bloklangan.',
  offline: "📴 Server bilan aloqa yo'q. Internetni tekshiring."
};

export default function DeviceApprovalScreen({ security }) {
  const revoked = security?.status === 'revoked';
  const [label, setLabel] = useState('');
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [codeKind, setCodeKind] = useState('totp');
  const [needCode, setNeedCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lockS, setLockS] = useState(0);

  useEffect(() => {
    if (lockS <= 0) return undefined;
    const t = setInterval(() => setLockS(s => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [lockS]);

  const handleApprove = async (e) => {
    e.preventDefault();
    if (busy || lockS > 0) return;
    const cleanPin = pin.replace(/\D/g, '');
    if (cleanPin.length < 4) {
      setError("PIN'ni kiriting");
      return;
    }
    if (needCode && !code.replace(/\D/g, '')) {
      setError('Authenticator kodini kiriting');
      return;
    }
    setBusy(true);
    setError('');
    const res = await approveThisDevice({
      pin: cleanPin,
      code: needCode ? code : null,
      codeKind,
      label: label.trim()
    });
    setBusy(false);
    if (res.ok) {
      notify(`✅ Qurilma tasdiqlandi (${res.name || 'admin'})`);
      return;
    }
    if (res.reason === 'need_code') {
      setNeedCode(true);
      setError(`🔐 ${res.name || 'Admin'}: Authenticator ilovasidagi kodni kiriting.`);
      return;
    }
    if (Number(res.wait_s) > 0 || res.reason === 'locked') {
      setLockS(Number(res.wait_s) || 30);
      setError(`⛔️ Juda ko'p xato urinish. ${Number(res.wait_s) || 30} soniya kuting.`);
    } else {
      setError(REASON_TEXT[res.reason] || "❌ Tasdiqlab bo'lmadi");
    }
    setPin('');
    setCode('');
  };

  const handleDisconnect = async () => {
    const ok = await confirmAsync(
      "Qurilma kafe hisobidan uziladi. Qayta ulash uchun email va parol kerak bo'ladi (keyin yana tasdiqlanadi).",
      { confirmText: 'Uzish', danger: true }
    );
    if (!ok) return;
    await signOut({ force: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl p-6 sm:p-8 shadow-xl border border-gray-100 dark:border-gray-700 space-y-4">
        <div className="text-center">
          <div className="text-4xl mb-2">{revoked ? '⛔️' : '🔐'}</div>
          <h1 className="text-xl font-black text-gray-900 dark:text-white">
            {revoked ? 'Qurilma bloklangan' : 'Qurilma tasdiqlanmagan'}
          </h1>
          <p className="mt-2 text-xs font-bold text-gray-500 dark:text-gray-400">
            {revoked
              ? "Bu qurilmani Ega yoki admin bloklagan: u kafe ma'lumotini ko'ra olmaydi. Xato bo'lsa, admin boshqa qurilmada Boshqaruv → Tizim sozlamalari → 📱 Qurilmalar da uni qayta tasdiqlaydi."
              : "Bu qurilma kafe hisobiga ulandi, lekin hali ishonchli emas. Ega yoki admin shu yerda PIN'ini kiritsin yoki boshqa qurilmada: Boshqaruv → Tizim sozlamalari → 📱 Qurilmalar → ✅ Tasdiqlash."}
          </p>
        </div>

        {!revoked && (
          <form onSubmit={handleApprove} className="space-y-3">
            <label className="block">
              <span className="text-[11px] font-black uppercase text-gray-500">Qurilma nomi</span>
              <input
                type="text"
                value={label}
                maxLength={60}
                placeholder="Masalan: Kassa kompyuteri, Oshxona planshet"
                onChange={e => setLabel(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-black uppercase text-gray-500">Ega yoki admin PIN'i</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                maxLength={8}
                disabled={lockS > 0}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                className={`${inputCls} tracking-[0.5em] text-center text-lg`}
              />
            </label>
            {needCode && (
              <label className="block">
                <span className="text-[11px] font-black uppercase text-gray-500">
                  {codeKind === 'totp' ? 'Authenticator kodi (6 raqam)' : 'Zaxira kod (10 raqam)'}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  maxLength={codeKind === 'totp' ? 6 : 11}
                  onChange={e => setCode(e.target.value.replace(/[^\d-]/g, ''))}
                  className={`${inputCls} tracking-[0.3em] text-center text-lg`}
                />
                <button
                  type="button"
                  onClick={() => {
                    setCodeKind(k => (k === 'totp' ? 'backup' : 'totp'));
                    setCode('');
                  }}
                  className="mt-1 text-[11px] font-black text-brand-600 underline"
                >
                  {codeKind === 'totp' ? 'Telefon yo\'qmi? Zaxira kod bilan' : 'Authenticator kodi bilan'}
                </button>
              </label>
            )}
            {error && <p className="text-xs font-black text-red-600 dark:text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={busy || lockS > 0}
              className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-black"
            >
              {busy ? 'Tekshirilmoqda...' : lockS > 0 ? `Kuting (${lockS} s)` : '✅ Qurilmani tasdiqlash'}
            </button>
          </form>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={syncNow}
            className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-black text-xs"
          >
            🔄 Holatni tekshirish
          </button>
          <button
            type="button"
            onClick={handleDisconnect}
            className="flex-1 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 font-black text-xs"
          >
            Qurilmani uzish
          </button>
        </div>
        <p className="text-[10px] font-bold text-gray-400 text-center">
          Holat har 15 soniyada o'zi tekshiriladi: boshqa qurilmada tasdiqlansa, dastur o'zi ochiladi.
        </p>
      </div>
    </div>
  );
}
