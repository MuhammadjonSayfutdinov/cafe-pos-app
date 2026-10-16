import React, { useState, useEffect, useMemo, useCallback } from 'react';

export default function ManagerOverrideModal({ 
  request,
  actionName, 
  users = [], 
  onSuccess, 
  onCancel,
  onClose
}) {
  // ==========================================
  // 1. PROP'LARNI XAVFSIZ BIRXILLASHTIRISH
  // ==========================================
  const resolvedActionName = actionName || request?.actionName || 'Maxfiy amalni tasdiqlash';
  const resolvedOnSuccess = onSuccess || request?.onSuccess;
  const resolvedOnCancel = onCancel || onClose;

  // Agar users prop bo'sh kelsa, localStorage'dan zaxira sifatida o'qiymiz
  const adminUsers = useMemo(() => {
    let sourceUsers = Array.isArray(users) && users.length > 0 ? users : [];
    if (sourceUsers.length === 0) {
      try {
        const saved = JSON.parse(window.localStorage.getItem('pos_users') || '[]');
        if (Array.isArray(saved)) sourceUsers = saved;
      } catch {
        // Xatolik bo'lsa standart adminga tayanamiz
      }
    }

    const filteredAdmins = sourceUsers.filter(
      u => u && String(u.role || '').toLowerCase() === 'admin'
    );

    // Agar bazada umuman admin topilmasa, tizim qulflanib qolmasligi uchun fallback
    return filteredAdmins.length > 0
      ? filteredAdmins
      : [{ id: 1, name: 'Admin', role: 'admin', pin: '777777' }];
  }, [users]);

  // ==========================================
  // 2. STATE'LAR (PIN, XATO VA BLOKIROVKA)
  // ==========================================
  const [adminPin, setAdminPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  // Blokirovka taymeri (5 marta xato terilganda 15 soniya kutish)
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  // ==========================================
  // 3. PAROLNI TEKSHIRISH MANTIG'I
  // ==========================================
  const verifyPinCode = useCallback((pinToVerify) => {
    if (lockoutSeconds > 0) return;

    const cleanPin = String(pinToVerify || '').trim();
    if (!cleanPin) return;

    const validAdmin = adminUsers.find(
      a => String(a.pin || '').trim() === cleanPin
    );

    if (validAdmin) {
      setErrorMsg('');
      setFailedAttempts(0);
      setAdminPin('');
      if (typeof resolvedOnSuccess === 'function') {
        resolvedOnSuccess(validAdmin);
      }
    } else {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      setAdminPin('');

      if (nextAttempts >= 5) {
        setLockoutSeconds(15);
        setErrorMsg("⛔️ 5 marta xato kiritildi! 15 soniya kuting.");
        setFailedAttempts(0);
      } else {
        setErrorMsg(`❌ Xato PIN-kod! Tasdiqlanmadi (${nextAttempts}/5)`);
      }
    }
  }, [adminUsers, failedAttempts, lockoutSeconds, resolvedOnSuccess]);

  // ==========================================
  // 4. RAQAMLAR KLAVIATURASI VA FIZIK KLAVIATURA
  // ==========================================
  const handleDigitPress = useCallback((digit) => {
    if (lockoutSeconds > 0) return;
    setErrorMsg('');

    setAdminPin(prev => {
      if (prev.length >= 6) return prev;
      const nextPin = prev + String(digit);
      
      // 6 xonali parol to'lishi bilan avtomatik tekshiramiz
      if (nextPin.length === 6) {
        setTimeout(() => verifyPinCode(nextPin), 80);
      }
      return nextPin;
    });
  }, [lockoutSeconds, verifyPinCode]);

  const handleBackspace = useCallback(() => {
    if (lockoutSeconds > 0) return;
    setErrorMsg('');
    setAdminPin(prev => prev.slice(0, -1));
  }, [lockoutSeconds]);

  const handleClear = useCallback(() => {
    if (lockoutSeconds > 0) return;
    setErrorMsg('');
    setAdminPin('');
  }, [lockoutSeconds]);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (adminPin.length > 0) {
      verifyPinCode(adminPin);
    }
  };

  // Kompyuter klaviaturasidan raqamlar, Backspace, Enter va Escape bosilishini ushlash
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (typeof resolvedOnCancel === 'function') resolvedOnCancel();
        return;
      }

      if (lockoutSeconds > 0) return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigitPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Enter' && adminPin.length >= 4) {
        e.preventDefault();
        verifyPinCode(adminPin);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [adminPin, handleBackspace, handleDigitPress, lockoutSeconds, resolvedOnCancel, verifyPinCode]);

  // ==========================================
  // 5. RENDER (UI DIZAYN)
  // ==========================================
  return (
    <div 
      onClick={() => typeof resolvedOnCancel === 'function' && resolvedOnCancel()}
      className="fixed inset-0 bg-black/75 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-fade-in select-none"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-[32px] p-6 md:p-7 shadow-2xl border-2 border-red-100 dark:border-red-900/40 text-center relative overflow-hidden"
      >
        {/* Tepadagi qizil xavfsizlik chizig'i */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-500 via-amber-500 to-red-600"></div>

        {/* Yopish (X) tugmasi */}
        <button
          type="button"
          onClick={() => typeof resolvedOnCancel === 'function' && resolvedOnCancel()}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-red-100 hover:text-red-500 font-black flex items-center justify-center transition"
          title="Yopish (Esc)"
        >
          ✕
        </button>
        
        {/* Qalqon Ikonkasi */}
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-500 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-3 shadow-inner">
          🛡️
        </div>
        
        <h2 className="text-xl font-black text-gray-900 dark:text-white">
          Rahbar Tasdig'i Talab Qilinadi
        </h2>
        <p className="text-xs font-bold text-gray-400 mt-0.5 mb-4">
          6 xonali Admin PIN-kodini kiriting
        </p>
        
        {/* Tasdiqlanayotgan amal nomi */}
        <div className="text-xs sm:text-sm font-bold text-gray-600 dark:text-gray-300 mb-5 bg-red-50/70 dark:bg-gray-900/80 p-3.5 rounded-2xl border border-red-100 dark:border-gray-700">
          <span className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
            Tasdiqlanayotgan harakat:
          </span>
          <span className="text-red-600 dark:text-red-400 font-black break-words">
            "{resolvedActionName}"
          </span>
        </div>

        <form onSubmit={handleManualSubmit} className="space-y-5">
          
          {/* Vizual PIN Nuqtachalari (6 xonali) */}
          <div>
            <div className="flex justify-center gap-3 my-2">
              {Array.from({ length: 6 }).map((_, idx) => {
                const isFilled = idx < adminPin.length;
                return (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-full transition-all duration-150 ${
                      errorMsg
                        ? 'bg-red-500 scale-110'
                        : isFilled
                        ? 'bg-red-600 dark:bg-red-500 scale-125 shadow-md shadow-red-500/40'
                        : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  />
                );
              })}
            </div>

            {/* Xatolik yoki Blokirovka xabari */}
            {lockoutSeconds > 0 ? (
              <p className="text-xs font-black text-red-600 dark:text-red-400 mt-3 bg-red-100 dark:bg-red-900/40 py-2 px-3 rounded-xl animate-pulse">
                ⏳ Kirish vaqtincha bloklandi: {lockoutSeconds} soniya
              </p>
            ) : errorMsg ? (
              <p className="text-xs font-black text-red-500 mt-3 animate-bounce">
                {errorMsg}
              </p>
            ) : (
              <p className="text-[11px] font-bold text-gray-400 mt-2">
                Klaviaturadan yoki ekrandagi raqamlardan tering
              </p>
            )}
          </div>

          {/* Sensorli Ekranlar uchun Raqamlar Klaviaturasi (Numpad) */}
          <div className="grid grid-cols-3 gap-2.5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button
                key={num}
                type="button"
                disabled={lockoutSeconds > 0}
                onClick={() => handleDigitPress(num)}
                className="h-13 py-3 rounded-2xl bg-gray-50 dark:bg-gray-700/60 hover:bg-red-50 dark:hover:bg-red-900/30 text-xl font-black text-gray-900 dark:text-white border border-gray-200/80 dark:border-gray-600 transition active:scale-90 disabled:opacity-40"
              >
                {num}
              </button>
            ))}

            <button
              type="button"
              disabled={lockoutSeconds > 0 || adminPin.length === 0}
              onClick={handleClear}
              className="h-13 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 font-black text-xs uppercase transition active:scale-90 disabled:opacity-40"
            >
              Tozalash
            </button>

            <button
              type="button"
              disabled={lockoutSeconds > 0}
              onClick={() => handleDigitPress(0)}
              className="h-13 py-3 rounded-2xl bg-gray-50 dark:bg-gray-700/60 hover:bg-red-50 dark:hover:bg-red-900/30 text-xl font-black text-gray-900 dark:text-white border border-gray-200/80 dark:border-gray-600 transition active:scale-90 disabled:opacity-40"
            >
              0
            </button>

            <button
              type="button"
              disabled={lockoutSeconds > 0 || adminPin.length === 0}
              onClick={handleBackspace}
              className="h-13 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-black text-lg transition active:scale-90 disabled:opacity-40"
            >
              ⌫
            </button>
          </div>

          {/* Pastki Bekor qilish va Tasdiqlash tugmalari */}
          <div className="flex gap-3 pt-2">
            <button 
              type="button" 
              onClick={() => typeof resolvedOnCancel === 'function' && resolvedOnCancel()}
              className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 text-gray-800 dark:text-white py-3.5 rounded-2xl font-black text-sm transition active:scale-95"
            >
              Bekor qilish
            </button>
            <button 
              type="submit" 
              disabled={lockoutSeconds > 0 || adminPin.length < 4}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3.5 rounded-2xl font-black text-sm shadow-lg shadow-red-600/30 transition active:scale-95 disabled:opacity-40"
            >
              Tasdiqlash ✓
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}