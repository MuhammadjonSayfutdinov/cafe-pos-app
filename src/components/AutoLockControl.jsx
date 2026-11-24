import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getPinLockRemainingMs, registerPinFailure, resetPinGuard } from '../utils/pinGuard';
import { setUpdateScreenLocked } from '../pwa/update';
import { checkPin, findUserByPin, pinLengthOf } from '../utils/pinHash';
import { getRequiredPinLength } from '../constants/roles';

// =========================================================
// VAQT VARIANTLARI (TELEFON VA KOMPYUTER SOZLAMALARIDEK)
// =========================================================
const TIMEOUT_OPTIONS = [
  { seconds: 15, label: '15 soniya', short: '15s' },
  { seconds: 30, label: '30 soniya', short: '30s' },
  { seconds: 60, label: '1 daqiqa', short: '1 daq' },
  { seconds: 120, label: '2 daqiqa', short: '2 daq' },
  { seconds: 180, label: '3 daqiqa', short: '3 daq' },
  { seconds: 300, label: '5 daqiqa', short: '5 daq' },
  { seconds: 600, label: '10 daqiqa', short: '10 daq' },
  { seconds: 1800, label: '30 daqiqa', short: '30 daq' },
  { seconds: 0, label: "♾️ Hech qachon (O'chirilgan)", short: "O'chiq" }
];

// Har bir bo'lim (rol) uchun standart boshlang'ich vaqtlar (soniyada)
const DEFAULT_ROLE_TIMEOUTS = {
  waiter: 60,     // Ofitsiant: 1 daqiqa
  cashier: 180,   // Kassir: 3 daqiqa
  warehouse: 300, // Omborchi: 5 daqiqa
  admin: 300,     // Admin: 5 daqiqa
  kitchen: 0,     // Oshxona: Standart o'chiq (oshpaz qo'li band bo'lgani uchun)
  courier: 300    // Kuryer: 5 daqiqa (o'z telefonida ishlaydi)
};

const STORAGE_KEY = 'pos_auto_lock_settings';

// Sozlamalar oynasi: eng ko'p kenglik va ekran chetidan masofa (px)
const MENU_MAX_WIDTH = 320;
const MENU_EDGE_GAP = 8;

// Sensorli qurilma (telefon/planshet): bunda PIN maydoniga avtomatik fokus berilmaydi,
// aks holda klaviatura ochilib qulf ekranining yarmini yopib qo'yadi
const isCoarsePointer = () => {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
};

const readSavedSettings = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: true, byRole: DEFAULT_ROLE_TIMEOUTS };
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed?.enabled !== false,
      byRole: { ...DEFAULT_ROLE_TIMEOUTS, ...(parsed?.byRole || {}) }
    };
  } catch {
    return { enabled: true, byRole: DEFAULT_ROLE_TIMEOUTS };
  }
};

export default function AutoLockControl({
  currentUser,
  users = [],
  cafeName = 'Premium Cafe',
  onSwitchUser,
  onLogout
}) {
  // =========================================================
  // 1. SOZLAMALAR VA QULF HOLATI STATE'LARI
  // =========================================================
  const [settings, setSettings] = useState(readSavedSettings);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScreenLocked, setIsScreenLocked] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(null);

  // Qulf ekranidagi PIN-kod statelari
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [liveClock, setLiveClock] = useState(() => new Date());

  const [menuPos, setMenuPos] = useState(null);

  const lastActivityRef = useRef(Date.now());
  const menuContainerRef = useRef(null);
  const menuPopoverRef = useRef(null);

  const userRole = String(currentUser?.role || 'waiter').toLowerCase();

  // Shu xodim (rol) uchun belgilangan soniyalar (0 = o'chirilgan)
  const activeTimeoutSeconds = useMemo(() => {
    if (!settings.enabled) return 0;
    const roleSec = settings.byRole?.[userRole];
    return roleSec !== undefined ? Number(roleSec) : 60;
  }, [settings, userRole]);

  // Sozlamalarni localStorage'ga saqlash
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage error
    }
  }, [settings]);

  // =========================================================
  // 2. FOYDALANUVCHI HARAKATINI KUZATISH (MOUSE, TOUCH, KEYBOARD)
  // =========================================================
  const resetInactivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (remainingSeconds !== null) {
      setRemainingSeconds(null);
    }
  }, [remainingSeconds]);

  useEffect(() => {
    if (!currentUser || isScreenLocked || activeTimeoutSeconds <= 0) {
      setRemainingSeconds(null);
      return;
    }

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];

    const handleUserActivity = () => {
      lastActivityRef.current = Date.now();
      setRemainingSeconds(prev => (prev !== null ? null : prev));
    };

    activityEvents.forEach(ev =>
      window.addEventListener(ev, handleUserActivity, { passive: true })
    );

    const interval = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      const leftSec = activeTimeoutSeconds - elapsedSec;

      if (leftSec <= 0) {
        setIsScreenLocked(true);
        setRemainingSeconds(null);
        setIsMenuOpen(false);
        setPinInput('');
        setPinError('');
      } else if (leftSec <= 10) {
        // Qulflanishiga 10 soniya qolganda ekranda ogohlantirish chiqadi
        setRemainingSeconds(leftSec);
      } else {
        setRemainingSeconds(null);
      }
    }, 1000);

    return () => {
      activityEvents.forEach(ev => window.removeEventListener(ev, handleUserActivity));
      clearInterval(interval);
    };
  }, [currentUser, isScreenLocked, activeTimeoutSeconds]);

  // Tashqariga bosilganda sozlamalar menyusini yopish
  // (menyu portal orqali body'da turadi, shuning uchun ikkala ref ham tekshiriladi)
  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const handleClickOutside = (e) => {
      const inButtons = menuContainerRef.current?.contains(e.target);
      const inPopover = menuPopoverRef.current?.contains(e.target);
      if (!inButtons && !inPopover) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [isMenuOpen]);

  // Menyu joylashuvi: tugma ostida, lekin har doim ekran ichida (telefonda chapga chiqib ketmaydi)
  const updateMenuPos = useCallback(() => {
    const anchor = menuContainerRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(MENU_MAX_WIDTH, vw - MENU_EDGE_GAP * 2);
    const left = Math.min(Math.max(rect.right - width, MENU_EDGE_GAP), vw - width - MENU_EDGE_GAP);
    const top = rect.bottom + MENU_EDGE_GAP;
    setMenuPos({ top, left, width, maxHeight: Math.max(200, vh - top - MENU_EDGE_GAP) });
  }, []);

  useLayoutEffect(() => {
    if (!isMenuOpen) return undefined;
    updateMenuPos();
    window.addEventListener('resize', updateMenuPos);
    window.addEventListener('scroll', updateMenuPos, true);
    return () => {
      window.removeEventListener('resize', updateMenuPos);
      window.removeEventListener('scroll', updateMenuPos, true);
    };
  }, [isMenuOpen, updateMenuPos]);

  // Dastur yangilanishi: qulf ekrani ochiq bo'lsa, yangilangach ham PIN so'raladi (src/pwa/update.js)
  useEffect(() => {
    setUpdateScreenLocked(isScreenLocked);
  }, [isScreenLocked]);
  useEffect(() => () => setUpdateScreenLocked(false), []);

  // Qulf ekrani ochiq turganda orqadagi sahifa aylanmasin (telefonda muhim)
  useEffect(() => {
    if (!isScreenLocked) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isScreenLocked]);

  // Qulf ekranidagi jonli soat
  useEffect(() => {
    if (!isScreenLocked) return;
    const clockTimer = setInterval(() => setLiveClock(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, [isScreenLocked]);

  // =========================================================
  // 3. SOZLAMALARNI O'ZGARTIRISH HANDLERLARI
  // =========================================================
  const handleSelectTimeout = (seconds) => {
    lastActivityRef.current = Date.now();
    setSettings(prev => ({
      ...prev,
      enabled: seconds > 0 ? true : prev.enabled,
      byRole: {
        ...(prev.byRole || {}),
        [userRole]: seconds
      }
    }));
  };

  const handleToggleMasterSwitch = () => {
    lastActivityRef.current = Date.now();
    setSettings(prev => {
      const nextEnabled = !prev.enabled;
      const currentRoleSec = prev.byRole?.[userRole] || 0;
      return {
        ...prev,
        enabled: nextEnabled,
        byRole: {
          ...(prev.byRole || {}),
          [userRole]: nextEnabled && currentRoleSec === 0 ? 60 : currentRoleSec
        }
      };
    });
  };

  const handleLockImmediately = () => {
    setIsMenuOpen(false);
    setPinInput('');
    setPinError('');
    setIsScreenLocked(true);
  };

  // =========================================================
  // 4. QULFNI OCHISH (PIN-KOD TEKSHIRUVI)
  // =========================================================
  const verifyAndUnlock = useCallback((enteredPin) => {
    const cleanPin = String(enteredPin || '').trim();
    if (!cleanPin) return;

    const lockLeftMs = getPinLockRemainingMs('autolock');
    if (lockLeftMs > 0) {
      setPinError(`⛔️ Bloklangan: ${Math.ceil(lockLeftMs / 1000)} soniya kuting.`);
      setPinInput('');
      return;
    }

    // 1. Joriy foydalanuvchining o'z PIN-kodi (universal "1111/0000" kodlar olib tashlandi, B6)
    if (checkPin(currentUser, cleanPin)) {
      resetPinGuard('autolock');
      setIsScreenLocked(false);
      setPinInput('');
      setPinError('');
      lastActivityRef.current = Date.now();
      return;
    }

    // 2. Agar boshqa xodim kelib o'z PIN-kodini tersa
    let allUsers = Array.isArray(users) && users.length > 0 ? users : [];
    if (allUsers.length === 0) {
      try {
        const rawU = window.localStorage.getItem('pos_users');
        if (rawU) allUsers = JSON.parse(rawU) || [];
      } catch {
        // ignore
      }
    }

    const matchedOtherUser = findUserByPin(allUsers, cleanPin);

    if (matchedOtherUser) {
      resetPinGuard('autolock');
      setIsScreenLocked(false);
      setPinInput('');
      setPinError('');
      lastActivityRef.current = Date.now();
      if (typeof onSwitchUser === 'function') {
        onSwitchUser(matchedOtherUser);
      }
      return;
    }

    const { attemptsLeft, lockedMs } = registerPinFailure('autolock');
    setPinError(
      lockedMs > 0
        ? `⛔️ Juda ko'p xato! ${Math.ceil(lockedMs / 1000)} soniya kuting.`
        : `❌ PIN-kod noto'g'ri! (${attemptsLeft} ta urinish qoldi)`
    );
    setPinInput('');
  }, [currentUser, users, onSwitchUser]);

  const handleNumpadPress = (digit) => {
    setPinError('');
    if (digit === 'C') {
      setPinInput('');
      return;
    }
    if (digit === 'BACK') {
      setPinInput(prev => prev.slice(0, -1));
      return;
    }

    const nextPin = (pinInput + digit).slice(0, 6);
    setPinInput(nextPin);

    // Agar joriy xodimning PIN uzunligiga yetgan bo'lsa avtomatik tekshiramiz
    const expectedLen = pinLengthOf(currentUser, getRequiredPinLength(currentUser?.role));
    if (nextPin.length >= expectedLen) {
      setTimeout(() => verifyAndUnlock(nextPin), 120);
    }
  };

  if (!currentUser) return null;

  const currentOptionMeta =
    TIMEOUT_OPTIONS.find(o => o.seconds === activeTimeoutSeconds) ||
    { label: `${activeTimeoutSeconds}s`, short: `${activeTimeoutSeconds}s` };

  // =========================================================
  // 5. RENDER (YUQORI PANEL TUGMASI + OGOHLANTIRISH + LOCK SCREEN)
  // =========================================================
  return (
    <>
      {/* 1. YUQORI PANELDA TURADIGAN IXCHAM AVTO-QULF TUGMASI VA MENYUSI */}
      <div ref={menuContainerRef} className="relative inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => setIsMenuOpen(prev => !prev)}
          className={`px-3 py-2 rounded-xl font-black text-xs transition flex items-center gap-1.5 border ${
            activeTimeoutSeconds > 0
              ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border-brand-200 dark:border-brand-800/60 hover:bg-brand-100'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-200'
          }`}
          title="Avtomatik ekran qulflanish vaqtini sozlash"
        >
          <span>{activeTimeoutSeconds > 0 ? '⏱️' : '🔓'}</span>
          <span className="hidden sm:inline">Avto-Qulf:</span>
          <span>{currentOptionMeta.short}</span>
        </button>

        {/* Darhol qulflash tugmasi */}
        <button
          type="button"
          onClick={handleLockImmediately}
          className="p-2 rounded-xl bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 font-black text-xs transition active:scale-90"
          title="Ekranni hoziroq qulflash"
        >
          🔒
        </button>
      </div>

      {/* OCHILUVCHI SOZLAMALAR OYNASI (XUDDI TELEFON SOZLAMALARIDEK)
          Portal orqali body'ga chiqariladi: sticky header ichida qolib ketmaydi va ekrandan chiqmaydi */}
      {isMenuOpen && menuPos && createPortal(
        <div
          ref={menuPopoverRef}
          style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width, maxHeight: menuPos.maxHeight }}
          className="fixed overflow-y-auto overscroll-contain bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 z-[190] space-y-3.5 animate-fade-in"
        >
          
          {/* Yoqish / O'chirish Switch */}
          <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-3">
            <div>
              <h4 className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                <span>🛡️</span> Avtomatik Qulflash
              </h4>
              <p className="text-[11px] font-bold text-gray-400">
                Harakatsizlikda ekranni himoyalash
              </p>
            </div>

            <button
              type="button"
              onClick={handleToggleMasterSwitch}
              className={`px-3 py-1.5 rounded-xl font-black text-xs transition ${
                settings.enabled && activeTimeoutSeconds > 0
                  ? 'bg-emerald-500 text-white shadow-xs'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              {settings.enabled && activeTimeoutSeconds > 0 ? '🟢 Yoqilgan' : "⚪️ O'chiq"}
            </button>
          </div>

          {/* Vaqt tanlash tugmalari */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-black uppercase text-gray-400 block">
              ⏱️ Qancha vaqt harakatsizlikdan so'ng qulflansin?
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {TIMEOUT_OPTIONS.map(opt => {
                const isSelected = activeTimeoutSeconds === opt.seconds;
                return (
                  <button
                    key={opt.seconds}
                    type="button"
                    onClick={() => handleSelectTimeout(opt.seconds)}
                    className={`py-2 px-2.5 rounded-xl font-black text-xs text-left transition flex items-center justify-between ${
                      isSelected
                        ? 'bg-brand-600 text-white shadow-xs'
                        : 'bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-100 dark:border-gray-700'
                    } ${opt.seconds === 0 ? 'col-span-2 justify-center text-center' : ''}`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <span>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hoziroq qulflash tugmasi */}
          <button
            type="button"
            onClick={handleLockImmediately}
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs uppercase tracking-wider shadow-md transition active:scale-95 flex items-center justify-center gap-1.5"
          >
            <span>🔒</span> Ekranni Hoziroq Qulflash
          </button>
        </div>,
        document.body
      )}

      {/* 2. QULFLANISHIGA 10 SONIYA QOLGANDA CHIQUVCHI OGOHLANTIRISH BANNERI */}
      {remainingSeconds !== null && !isScreenLocked && createPortal(
        <div
          onClick={resetInactivityTimer}
          className="fixed bottom-4 left-3 right-3 sm:left-auto sm:bottom-5 sm:right-5 z-[195] bg-gray-900/95 text-white px-4 sm:px-5 py-3.5 rounded-2xl shadow-2xl border-2 border-amber-400 flex items-center gap-3 cursor-pointer animate-bounce"
        >
          <span className="text-2xl">⏳</span>
          <div>
            <p className="font-black text-xs sm:text-sm text-amber-400">
              Ekran {remainingSeconds} soniyadan so'ng qulflanadi!
            </p>
            <p className="text-[11px] font-bold text-gray-300">
              Davom etish uchun sichqonchani qimirlating yoki ekranga teging
            </p>
          </div>
        </div>,
        document.body
      )}

      {/* 3. TO'LIQ EKRANLI QULF PARDASI (TELEFON / WINDOWS LOCK SCREEN USLUBIDA) */}
      {/* Portal orqali body'ga chiqariladi: sticky header (z-40) ichida qolib, boshqa oynalar ostida qolmaydi.
          Kichik ekranda butun parda aylantiriladi (scroll), hech narsa kesilib qolmaydi */}
      {isScreenLocked && createPortal(
        <div className="fixed inset-0 z-[250] bg-slate-950/90 backdrop-blur-xl overflow-y-auto overscroll-contain text-white select-none animate-fade-in">
          <div className="min-h-full flex flex-col items-center justify-between gap-4 p-4 sm:p-6">

            {/* Tepasi: Kafe nomi va Xavfsizlik holati */}
            <div className="text-center space-y-1 pt-1 sm:pt-2">
              <span className="px-3 py-1 rounded-full bg-white/10 text-amber-400 font-black text-[11px] uppercase tracking-widest">
                🔒 Ekran Vaqtincha Qulflangan
              </span>
              <p className="text-xs font-bold text-slate-400 pt-1">
                {cafeName} • Ish jarayoni va savatchadagi ma'lumotlar saqlab qolingan
              </p>
            </div>

            {/* O'rtasi: Katta Soat, Xodim Ismi va PIN-kod Numpad */}
            <div className="w-full max-w-sm bg-white/10 border border-white/15 rounded-3xl p-4 sm:p-6 shadow-2xl backdrop-blur-md space-y-4 sm:space-y-5 text-center">

              {/* Jonli Soat */}
              <div>
                <h1 className="text-4xl sm:text-5xl font-black tracking-tight font-mono">
                  {liveClock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </h1>
                <p className="text-xs font-bold text-slate-300 mt-1">
                  👤 Faol xodim: <strong className="text-amber-400">{currentUser.name}</strong>
                </p>
              </div>

              {/* PIN-kod nuqtalari va klaviatura inputi */}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  verifyAndUnlock(pinInput);
                }}
                className="space-y-2"
              >
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus={!isCoarsePointer()}
                  value={pinInput}
                  onChange={e => {
                    setPinError('');
                    setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6));
                  }}
                  placeholder="PIN-kodni tering..."
                  className="w-full py-3 px-4 rounded-2xl bg-black/40 border-2 border-white/20 focus:border-amber-400 text-center font-black text-2xl tracking-[0.5em] placeholder:text-base placeholder:tracking-normal text-white outline-hidden"
                />
                {pinError && (
                  <p className="text-xs font-black text-red-400 animate-pulse">
                    {pinError}
                  </p>
                )}
              </form>

              {/* Sensorli Ekran (Planshet / Monoblok) uchun Raqamlar Klaviaturasi */}
              <div className="grid grid-cols-3 gap-2.5">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'BACK'].map(key => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleNumpadPress(key)}
                    className={`py-3 sm:py-3.5 rounded-2xl font-black text-lg transition active:scale-90 ${
                      key === 'C'
                        ? 'bg-red-500/25 hover:bg-red-500/40 text-red-300 text-sm'
                        : key === 'BACK'
                        ? 'bg-slate-700/60 hover:bg-slate-700 text-slate-200 text-sm'
                        : 'bg-white/10 hover:bg-white/20 text-white shadow-xs'
                    }`}
                  >
                    {key === 'BACK' ? '⌫' : key}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => verifyAndUnlock(pinInput)}
                className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg shadow-amber-500/30 transition active:scale-95"
              >
                🔓 Qulfni Ochish
              </button>
            </div>

            {/* Pastki qism: Boshqa xodim sifatida kirish (To'liq chiqish) */}
            <div className="pb-2">
              {typeof onLogout === 'function' && (
                <button
                  type="button"
                  onClick={() => {
                    setIsScreenLocked(false);
                    onLogout();
                  }}
                  className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-red-500/30 text-slate-300 hover:text-white font-black text-xs transition"
                >
                  🔄 Boshqa xodim sifatida kirish (Asosiy menyu)
                </button>
              )}
            </div>

          </div>
        </div>,
        document.body
      )}
    </>
  );
}