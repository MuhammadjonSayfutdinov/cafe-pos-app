import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// =========================================================
// VAQT VARIANTLARI (TELEFON VA KOMPYUTER SOZLAMALARIDEK)
// =========================================================
const TIMEOUT_OPTIONS = [
  { seconds: 15, label: '15 soniya', short: '15s' },
  { seconds: 30, label: '30 soniya', short: '30s' },
  { seconds: 60, label: '1 daqiqa', short: '1 daq' },
  { seconds: 120, label: '2 daqiqa', short: '2 daq' },
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
  kitchen: 0      // Oshxona: Standart o'chiq (oshpaz qo'li band bo'lgani uchun)
};

const STORAGE_KEY = 'pos_auto_lock_settings';

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

  const lastActivityRef = useRef(Date.now());
  const menuContainerRef = useRef(null);

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
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

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

    // 1. Joriy foydalanuvchining o'z PIN-kodi yoki Admin universal PIN-kodi
    const currentPin = String(currentUser?.pin || currentUser?.password || '').trim();
    if (
      (currentPin && cleanPin === currentPin) ||
      ['1111', '0000', '111111', '1234'].includes(cleanPin)
    ) {
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

    const matchedOtherUser = allUsers.find(
      u => u && String(u.pin || u.password || '').trim() === cleanPin
    );

    if (matchedOtherUser) {
      setIsScreenLocked(false);
      setPinInput('');
      setPinError('');
      lastActivityRef.current = Date.now();
      if (typeof onSwitchUser === 'function') {
        onSwitchUser(matchedOtherUser);
      }
      return;
    }

    setPinError("❌ PIN-kod noto'g'ri!");
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
    const expectedLen = String(currentUser?.pin || '1111').trim().length || 4;
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
              ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60 hover:bg-indigo-100'
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

        {/* OCHILUVCHI SOZLAMALAR OYNASI (XUDDI TELEFON SOZLAMALARIDEK) */}
        {isMenuOpen && (
          <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 z-[190] space-y-3.5 animate-fade-in">
            
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
                    ? 'bg-emerald-500 text-white shadow-sm'
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
                          ? 'bg-indigo-600 text-white shadow-sm'
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
          </div>
        )}
      </div>

      {/* 2. QULFLANISHIGA 10 SONIYA QOLGANDA CHIQUVCHI OGOHLANTIRISH BANNERI */}
      {remainingSeconds !== null && !isScreenLocked && (
        <div
          onClick={resetInactivityTimer}
          className="fixed bottom-5 right-5 z-[195] bg-gray-900/95 text-white px-5 py-3.5 rounded-2xl shadow-2xl border-2 border-amber-400 flex items-center gap-3 cursor-pointer animate-bounce"
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
        </div>
      )}

      {/* 3. TO'LIQ EKRANLI QULF PARDASI (TELEFON / WINDOWS LOCK SCREEN USLUBIDA) */}
      {isScreenLocked && (
        <div className="fixed inset-0 z-[250] bg-slate-950/90 backdrop-blur-xl flex flex-col items-center justify-between p-6 text-white select-none animate-fade-in">
          
          {/* Tepasi: Kafe nomi va Xavfsizlik holati */}
          <div className="text-center space-y-1 pt-2">
            <span className="px-3 py-1 rounded-full bg-white/10 text-amber-400 font-black text-[11px] uppercase tracking-widest">
              🔒 Ekran Vaqtincha Qulflangan
            </span>
            <p className="text-xs font-bold text-slate-400 pt-1">
              {cafeName} • Ish jarayoni va savatchadagi ma'lumotlar saqlab qolingan
            </p>
          </div>

          {/* O'rtasi: Katta Soat, Xodim Ismi va PIN-kod Numpad */}
          <div className="w-full max-w-sm bg-white/10 border border-white/15 rounded-3xl p-6 shadow-2xl backdrop-blur-md space-y-5 text-center">
            
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
                autoFocus
                value={pinInput}
                onChange={e => {
                  setPinError('');
                  setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6));
                }}
                placeholder="PIN-kodni tering..."
                className="w-full py-3 px-4 rounded-2xl bg-black/40 border-2 border-white/20 focus:border-amber-400 text-center font-black text-2xl tracking-[0.5em] text-white outline-none"
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
                  className={`py-3.5 rounded-2xl font-black text-lg transition active:scale-90 ${
                    key === 'C'
                      ? 'bg-red-500/25 hover:bg-red-500/40 text-red-300 text-sm'
                      : key === 'BACK'
                      ? 'bg-slate-700/60 hover:bg-slate-700 text-slate-200 text-sm'
                      : 'bg-white/10 hover:bg-white/20 text-white shadow-sm'
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
      )}
    </>
  );
}