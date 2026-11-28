import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSticky } from '../hooks/useSticky';
import { getPinLockRemainingMs, registerPinFailure, resetPinGuard } from '../utils/pinGuard';
import {
  BACKUP_CODE_DIGITS,
  backupCodesLeft,
  findBackupCode,
  formatBackupCode,
  hasLocalTwoFactor,
  verifySecondFactor,
  withoutBackupCode
} from '../utils/twoFactor';
import { dropCachedBackupCode, readVerifierCache, writeVerifierCache } from '../utils/verifierCache';
import { TOTP_DIGITS, TOTP_PERIOD_SEC } from '../utils/totp';
import { notify } from '../utils/notify';

// Ikkinchi bosqich: PIN to'g'ri terilgandan keyin Authenticator ilovasidagi 6 xonali kod
// (yoki telefon yo'q bo'lsa 10 raqamli zaxira kod). Kirish oynasi, admin tasdig'i, avto-qulf va
// ofitsiant ekranidagi admin tasdig'i shu oynadan foydalanadi (src/utils/twoFactor.ts).
//
// Oyna doim to'q rangda va body'ga chiqariladi (portal): boshqa oynalar ustida turadi.
//
// checkCode (ixtiyoriy): kod serverda tekshiriladi (supabase/security.sql, shu qurilmada sir yo'q):
// (code, 'totp' | 'backup') => Promise<{ ok } | { ok: false, message }>. onVerified(user, { code, kind }).

const GUARD_SCOPE = 'second_factor';

const pad2 = (n) => String(n).padStart(2, '0');

export default function TwoFactorCodeModal({
  user,
  title = '🔐 Ikkinchi bosqich',
  actionLabel = '',
  onVerified,
  onCancel,
  onAudit,
  checkCode
}) {
  const [, setUsers] = useSticky('pos_users', []);
  const [mode, setMode] = useState('totp'); // 'totp' | 'backup'
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [lockMs, setLockMs] = useState(() => getPinLockRemainingMs(GUARD_SCOPE));
  const [now, setNow] = useState(() => Date.now());
  const [checking, setChecking] = useState(false);
  const submittingRef = useRef(false);

  const isLocked = lockMs > 0;
  const codeLength = mode === 'totp' ? TOTP_DIGITS : BACKUP_CODE_DIGITS;
  const userName = String(user?.name || 'Xodim');

  // Soat (qurilma vaqti ko'rinsin: kod ishlamasa birinchi sabab - noto'g'ri soat) va blok taymeri
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      setLockMs(getPinLockRemainingMs(GUARD_SCOPE));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const audit = useCallback((action, details) => {
    if (typeof onAudit === 'function') onAudit(action, details, user);
  }, [onAudit, user]);

  // Kod serverda (shu qurilmada sir yo'q): server o'zi cheklaydi va zaxira kodni o'chiradi
  const submitRemote = useCallback(async (value) => {
    setChecking(true);
    let res;
    try {
      res = await checkCode(value, mode);
    } catch {
      res = { ok: false, message: "📴 Server bilan aloqa yo'q: kodni tekshirib bo'lmadi." };
    } finally {
      setChecking(false);
    }
    if (res?.ok) {
      setCode('');
      setError('');
      if (mode === 'backup') {
        audit('Zaxira kod ishlatildi', `${userName}: ikki bosqichli kirishda zaxira kod ishlatildi`);
        notify("Zaxira kod ishlatildi. Kodlar kam qolsa: Admin → Xodimlar, ikki bosqichli kirishni o'chirib qayta yoqing.", 'info');
      }
      if (typeof onVerified === 'function') onVerified(user, { code: value, kind: mode });
      return;
    }
    setTimeout(() => setCode(''), 300);
    if (Number(res?.waitS) > 0) setLockMs(Number(res.waitS) * 1000);
    setError(res?.message || "❌ Kod noto'g'ri.");
  }, [audit, checkCode, mode, onVerified, user, userName]);

  const submit = useCallback((value) => {
    if (getPinLockRemainingMs(GUARD_SCOPE) > 0) return;
    if (typeof checkCode === 'function') {
      submitRemote(value);
      return;
    }
    if (!hasLocalTwoFactor(user)) {
      // Sir faqat serverda, internet yo'q
      setTimeout(() => setCode(''), 300);
      setError("📴 Bu admin shu qurilmada avval kirmagan: kod serverda tekshiriladi, internet kerak.");
      return;
    }
    const result = verifySecondFactor(user, value, mode);

    if (result.ok) {
      resetPinGuard(GUARD_SCOPE);
      let verifiedUser = user;
      if (result.kind === 'backup') {
        // Zaxira kod bir martalik: ro'yxatdan o'chiriladi (eng so'nggi yozuvdan, bulutga ham boradi)
        verifiedUser = withoutBackupCode(user, result.index);
        setUsers(prev => (Array.isArray(prev) ? prev : []).map(u => {
          if (!u || String(u.id) !== String(user?.id)) return u;
          const idx = findBackupCode(u, value);
          return idx >= 0 ? withoutBackupCode(u, idx) : u;
        }));
        // Qurilmadagi keshda ham (internetsiz kirish): shu kod qayta ishlamasin
        const cache = readVerifierCache();
        const entry = cache[String(user?.id)];
        if (entry) {
          const idx = findBackupCode({ twoFactor: entry.twoFactor }, value);
          if (idx >= 0) writeVerifierCache(dropCachedBackupCode(cache, user?.id, idx));
        }
        const left = backupCodesLeft(verifiedUser);
        audit('Zaxira kod ishlatildi', `${userName}: ikki bosqichli kirishda zaxira kod ishlatildi (${left} ta qoldi)`);
        notify(
          left <= 2
            ? `⚠️ Zaxira kod ishlatildi, ${left} ta qoldi. Admin → Xodimlar: ikki bosqichli kirishni o'chirib, qayta yoqing (yangi kodlar beriladi).`
            : `Zaxira kod ishlatildi. ${left} ta qoldi.`,
          left <= 2 ? 'warning' : 'info'
        );
      }
      setCode('');
      setError('');
      if (typeof onVerified === 'function') onVerified(verifiedUser, { code: value, kind: mode });
      return;
    }

    setTimeout(() => setCode(''), 300);
    if (result.reason === 'reused') {
      setError(`⏳ Bu kod hozirgina ishlatilgan. Ilovada yangi kod chiqishini kuting (${TOTP_PERIOD_SEC} soniyagacha).`);
      return;
    }
    if (result.reason === 'not-enabled') {
      setError("❌ Bu hisobda ikki bosqichli kirish sozlanmagan.");
      return;
    }
    const { attemptsLeft, lockedMs } = registerPinFailure(GUARD_SCOPE);
    if (lockedMs > 0) {
      setLockMs(lockedMs);
      setError(`⛔️ Juda ko'p xato kod! ${Math.ceil(lockedMs / 1000)} soniya kuting.`);
      audit("⚠️ Ikkinchi bosqich: ko'p xato", `${userName} hisobiga PIN to'g'ri, lekin 5 marta noto'g'ri kod terildi`);
    } else {
      setError(mode === 'totp'
        ? `❌ Kod noto'g'ri. Yana ${attemptsLeft} ta urinish qoldi.`
        : `❌ Zaxira kod noto'g'ri yoki ishlatilgan. Yana ${attemptsLeft} ta urinish qoldi.`);
    }
  }, [audit, checkCode, mode, onVerified, setUsers, submitRemote, user, userName]);

  // Tekshiruv state yangilagichidan tashqarida: StrictMode'da yangilagich ikki marta ishlaydi,
  // zaxira kod esa ikki marta "ishlatilib" qolmasin
  const pressDigit = useCallback((digit) => {
    if (getPinLockRemainingMs(GUARD_SCOPE) > 0 || submittingRef.current || checking) return;
    if (code.length >= codeLength) return;
    const next = code + String(digit);
    setError('');
    setCode(next);
    if (next.length === codeLength) {
      submittingRef.current = true;
      setTimeout(() => {
        submittingRef.current = false;
        submit(next);
      }, 60);
    }
  }, [checking, code, codeLength, submit]);

  const backspace = useCallback(() => {
    setError('');
    setCode(prev => prev.slice(0, -1));
  }, []);

  const switchMode = () => {
    setMode(prev => (prev === 'totp' ? 'backup' : 'totp'));
    setCode('');
    setError('');
  };

  const cancel = useCallback(() => {
    if (typeof onCancel === 'function') onCancel();
  }, [onCancel]);

  // Kompyuter klaviaturasi. Capture bosqichida ushlanadi: ostidagi oynalar (PIN oynasi) raqamni olmasin
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      } else if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        pressDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        backspace();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [backspace, cancel, pressDigit]);

  const clock = new Date(now);
  const clockText = `${pad2(clock.getHours())}:${pad2(clock.getMinutes())}:${pad2(clock.getSeconds())}`;
  const secondsLeft = TOTP_PERIOD_SEC - (Math.floor(now / 1000) % TOTP_PERIOD_SEC);

  // Portal ichidagi bosish React daraxti bo'ylab ota oynaga yetmasin (u bosishda yopiladi)
  return createPortal(
    <div
      onClick={e => e.stopPropagation()}
      className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-md overflow-y-auto overscroll-contain select-none animate-fade-in">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-gray-900 text-white rounded-[32px] p-6 sm:p-7 shadow-2xl shadow-black/60 border border-gray-700/70 text-center">

          <div className="w-14 h-14 rounded-2xl bg-brand-500/15 text-3xl flex items-center justify-center mx-auto mb-3">
            {mode === 'totp' ? '📱' : '🗝️'}
          </div>
          <h3 className="text-lg font-bold tracking-tight">{title}</h3>
          <p className="text-xs font-medium text-gray-400 mt-1">
            {mode === 'totp'
              ? <>👤 <strong className="text-brand-400">{userName}</strong>: telefoningizdagi Authenticator ilovasidagi {TOTP_DIGITS} xonali kodni tering</>
              : <>👤 <strong className="text-brand-400">{userName}</strong>: qog'ozga yozib olingan {BACKUP_CODE_DIGITS} raqamli zaxira kodni tering (har biri bir marta ishlaydi)</>}
          </p>

          {actionLabel && (
            <p className="mt-3 text-xs font-bold text-red-300 bg-red-500/10 border border-red-500/20 rounded-2xl px-3 py-2 break-words">
              "{actionLabel}"
            </p>
          )}

          {/* Terilgan kod: bir martalik kod, ko'rinib turishi xavfli emas (terishda adashmaslik uchun) */}
          {mode === 'totp' ? (
            <div className="flex justify-center gap-2 my-5">
              {Array.from({ length: TOTP_DIGITS }).map((_, idx) => (
                <div
                  key={idx}
                  className={`w-10 h-12 rounded-xl flex items-center justify-center text-2xl font-bold border transition ${
                    error ? 'border-red-500/70 bg-red-500/10' : idx < code.length ? 'border-brand-500 bg-brand-500/10' : 'border-gray-700 bg-gray-800'
                  }`}
                >
                  {code[idx] || ''}
                </div>
              ))}
            </div>
          ) : (
            <div className={`my-5 mx-auto max-w-[15rem] h-12 rounded-xl border flex items-center justify-center text-xl font-bold tracking-[0.2em] ${
              error ? 'border-red-500/70 bg-red-500/10' : 'border-gray-700 bg-gray-800'
            }`}>
              {code ? formatBackupCode(code) : <span className="text-sm tracking-normal text-gray-500">12345-67890</span>}
            </div>
          )}

          {isLocked ? (
            <p className="text-xs font-bold text-red-400 mb-3">
              ⛔️ Vaqtincha bloklandi: {Math.ceil(lockMs / 1000)} soniya kuting
            </p>
          ) : checking ? (
            <p className="text-xs font-bold text-gray-400 mb-3">🔄 Server tekshirmoqda...</p>
          ) : error ? (
            <p className="text-xs font-bold text-red-400 mb-3">{error}</p>
          ) : mode === 'totp' ? (
            <p className="text-[11px] font-medium text-gray-500 mb-3">
              Ilovadagi kod {secondsLeft} soniyadan keyin yangilanadi
            </p>
          ) : null}

          <div className="grid grid-cols-3 gap-2.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
              <button
                key={num}
                type="button"
                disabled={isLocked}
                onClick={() => pressDigit(num)}
                className="h-14 rounded-2xl bg-gray-800 hover:bg-brand-500/10 border border-gray-700/70 hover:border-brand-500/60 text-2xl font-semibold transition active:scale-90 disabled:opacity-40"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setCode(''); setError(''); }}
              className="h-14 rounded-2xl bg-red-500/10 text-red-400 font-bold text-xs uppercase transition active:scale-90"
            >
              Tozalash
            </button>
            <button
              type="button"
              disabled={isLocked}
              onClick={() => pressDigit('0')}
              className="h-14 rounded-2xl bg-gray-800 hover:bg-brand-500/10 border border-gray-700/70 hover:border-brand-500/60 text-2xl font-semibold transition active:scale-90 disabled:opacity-40"
            >
              0
            </button>
            <button
              type="button"
              onClick={backspace}
              className="h-14 rounded-2xl bg-gray-800/60 text-gray-300 font-bold text-xl transition active:scale-90"
            >
              ⌫
            </button>
          </div>

          <button
            type="button"
            onClick={switchMode}
            className="mt-4 text-xs font-semibold text-brand-400 hover:text-brand-300 underline underline-offset-4"
          >
            {mode === 'totp' ? "Telefon yonimda yo'q: zaxira kod bilan" : '← Authenticator kodi bilan'}
          </button>

          <p className="mt-3 text-[11px] text-gray-500">
            Qurilma vaqti: <span className="font-mono text-gray-400">{clockText}</span>. Kod ishlamasa, qurilma va telefon soati
            to'g'riligini tekshiring.
          </p>

          <button
            type="button"
            onClick={cancel}
            className="mt-4 w-full py-3 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold text-sm transition active:scale-95"
          >
            Bekor qilish
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
