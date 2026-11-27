import React, { useState, useMemo, useEffect } from 'react';
import { getPinLockRemainingMs, registerPinFailure, resetPinGuard } from '../utils/pinGuard';
import { CLOSED_ORDER_STATUSES } from '../constants/orderStatus';
import { APP_BUILD, APP_BUILD_TIME } from '../pwa/update';
import { findUserByPin } from '../utils/pinHash';
import { hasTwoFactor } from '../utils/twoFactor';
import TwoFactorCodeModal from './TwoFactorCodeModal';

// Qurilmadagi dastur versiyasi: telefon va kompyuter bir xil versiyadami, solishtirish uchun
const formatBuildTime = (iso) => {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const PIN_GUARD_SCOPE = 'login';

export default function LockScreen({ 
  cafeName = 'Restoran POS', 
  users = [], 
  tables = [],
  orders = [],
  onLogin, 
  onGuestLogin,
  onOpenQrMenu,
  onAudit,
  isDarkMode = false 
}) {
  // ==========================================
  // 1. STATE'LAR
  // ==========================================
  const [selectedGroup, setSelectedGroup] = useState(null); // 'management' | 'staff' | null
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  // PIN to'g'ri, ikki bosqichli kirish yoqilgan xodim: Authenticator kodini kutyapmiz
  const [twoFactorUser, setTwoFactorUser] = useState(null);
  
  // Mijoz QR-Menyusi uchun Stol tanlash modali state'i
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [tableFilter, setTableFilter] = useState('free'); // 'free' (Bo'shlar) | 'all' (Barchasi)

  const requiredPinLength = selectedGroup === 'management' ? 6 : 4;

  // Xato urinishlar cheklovi (B6): 5 marta xato -> 30 soniya, keyin har safar 2 baravar
  const [lockRemainingMs, setLockRemainingMs] = useState(() => getPinLockRemainingMs(PIN_GUARD_SCOPE));
  const isLocked = lockRemainingMs > 0;

  useEffect(() => {
    if (!isLocked) return undefined;
    const timer = setInterval(() => {
      const left = getPinLockRemainingMs(PIN_GUARD_SCOPE);
      setLockRemainingMs(left);
      if (left <= 0) setError('');
    }, 500);
    return () => clearInterval(timer);
  }, [isLocked]);

  // ==========================================
  // 2. BO'SH VA BAND STOLLARNI ANIQLASH MANTIG'I
  // ==========================================
  const allTablesList = useMemo(() => {
    if (Array.isArray(tables) && tables.length > 0) {
      return tables.filter(t => t !== 'Olib ketish');
    }
    try {
      const savedTables = JSON.parse(window.localStorage.getItem('pos_tables') || '[]');
      if (Array.isArray(savedTables) && savedTables.length > 0) {
        return savedTables.filter(t => t !== 'Olib ketish');
      }
    } catch {
      // Xatolik bo'lsa standart stollarni qaytaramiz
    }
    return ['1-Stol', '2-Stol', '3-Stol', '4-Stol', '5-Stol', '6-Stol', '7-Stol', '8-Stol', 'VIP-1', 'VIP-2'];
  }, [tables]);

  const activeOrdersList = useMemo(() => {
    if (Array.isArray(orders) && orders.length > 0) {
      return orders;
    }
    try {
      return JSON.parse(window.localStorage.getItem('pos_orders') || '[]');
    } catch {
      return [];
    }
  }, [orders]);

  // Har bir stolning bo'sh yoki bandligini hisoblaymiz
  const tablesWithStatus = useMemo(() => {
    return allTablesList.map(tableName => {
      const nameStr = typeof tableName === 'object' ? tableName.name : String(tableName);
      const hasActiveOrder = activeOrdersList.some(
        o => o && o.table === nameStr && !CLOSED_ORDER_STATUSES.includes(o.status)
      );
      return {
        name: nameStr,
        isOccupied: hasActiveOrder
      };
    });
  }, [allTablesList, activeOrdersList]);

  const freeTables = tablesWithStatus.filter(t => !t.isOccupied);
  const occupiedTables = tablesWithStatus.filter(t => t.isOccupied);

  // ==========================================
  // 3. PIN-KOD ORQALI KIRISH MANTIG'I
  // ==========================================
  const handleSelectGroup = (group) => {
    setSelectedGroup(group);
    setPin('');
    setError('');
  };

  const handleClosePinModal = () => {
    setSelectedGroup(null);
    setPin('');
    setError('');
  };

  const handleNumberClick = (num) => {
    if (isLocked || getPinLockRemainingMs(PIN_GUARD_SCOPE) > 0) return;
    if (pin.length >= requiredPinLength) return;
    const nextPin = pin + num;
    setPin(nextPin);
    setError('');

    if (nextPin.length === requiredPinLength) {
      verifyPin(nextPin);
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const verifyPin = (enteredPin) => {
    const safeUsers = Array.isArray(users) ? users : [];
    const matchedUser = findUserByPin(safeUsers, enteredPin, u => {
      const role = String(u.role || '').toLowerCase();
      const isManagementRole = role === 'admin' || role === 'warehouse' || role === 'omborchi';
      return selectedGroup === 'management' ? isManagementRole : !isManagementRole;
    });

    if (matchedUser) {
      resetPinGuard(PIN_GUARD_SCOPE);
      if (hasTwoFactor(matchedUser)) {
        // PIN yolg'iz yetmaydi: telefondagi kod ham so'raladi (src/utils/twoFactor.ts)
        setTwoFactorUser(matchedUser);
        setPin('');
        return;
      }
      if (typeof onLogin === 'function') {
        onLogin(matchedUser);
      }
      handleClosePinModal();
    } else {
      const { attemptsLeft, lockedMs } = registerPinFailure(PIN_GUARD_SCOPE);
      if (lockedMs > 0) {
        setLockRemainingMs(lockedMs);
        setError(`⛔️ Juda ko'p xato urinish! ${Math.ceil(lockedMs / 1000)} soniya kuting.`);
      } else {
        setError(`❌ PIN-kod noto'g'ri! Yana ${attemptsLeft} ta urinish qoldi.`);
      }
      setTimeout(() => {
        setPin('');
      }, 400);
    }
  };

  const handleTwoFactorVerified = (verifiedUser) => {
    setTwoFactorUser(null);
    if (typeof onLogin === 'function') {
      onLogin(verifiedUser);
    }
    handleClosePinModal();
  };

  // ==========================================
  // 4. MIJOZ QR-MENYUSIGA STOL TANLAB KIRISH
  // ==========================================
  // Faqat bo'sh stol ochiladi: band stolga (boshqa mijozning chekiga) buyurtma faqat o'sha
  // stoldagi QR kodni telefon bilan skaner qilib beriladi (App.jsx ham tekshiradi)
  const handleSelectCustomerTable = (tableName) => {
    if (tablesWithStatus.some(t => t.name === tableName && t.isOccupied)) return;
    setIsTableModalOpen(false);
    const callback = onGuestLogin || onOpenQrMenu;
    if (typeof callback === 'function') {
      callback(tableName);
    }
  };

  // ==========================================
  // 5. RENDER (UI DIZAYN)
  // ==========================================
  return (
    <div className={`relative isolate min-h-screen flex flex-col items-center justify-center p-4 select-none overflow-hidden transition-colors duration-300 ${
      isDarkMode ? 'dark bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'
    }`}>

      {/* FON: kafe rasmi + to'q qatlam */}
      <img
        src="/images/cafe-hero.webp"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 -z-20 w-full h-full object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/80 via-black/65 to-black/90" />

      {/* SARLAVHA */}
      <div className="text-center mb-8 animate-fade-in-up">
        <div className="w-16 h-16 bg-gradient-to-br from-brand-500 to-brand-700 text-white rounded-3xl flex items-center justify-center text-3xl mx-auto mb-5 shadow-xl shadow-brand-900/50 ring-4 ring-white/10">
          🍽️
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
          {cafeName}
        </h1>
        <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.3em] text-brand-400 mt-3">
          Premium Boshqaruv Tizimi
        </p>
      </div>

      {/* ASOSIY KARTA */}
      <div className="bg-white/95 dark:bg-gray-900/75 backdrop-blur-xl w-full max-w-md rounded-[32px] p-5 sm:p-7 shadow-2xl shadow-black/50 border border-white/20 dark:border-gray-700/70 space-y-3.5 animate-fade-in-up">

        {/* 1. BOSHQARUV (6 XONALI PIN) */}
        <button
          type="button"
          onClick={() => handleSelectGroup('management')}
          className="w-full p-4 sm:p-5 rounded-3xl border border-gray-200 dark:border-gray-700/70 hover:border-brand-500 dark:hover:border-brand-500 bg-gray-50 dark:bg-gray-800/70 hover:bg-brand-50/60 dark:hover:bg-brand-500/10 transition-all active:scale-[0.98] flex items-center gap-4 text-left group"
        >
          <div className="w-14 h-14 shrink-0 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-2xl group-hover:scale-110 transition">
            👔
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-lg font-bold tracking-wider uppercase text-gray-900 dark:text-white">
              BOSHQARUV
            </h2>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">
              Faqat rahbar va omborchi uchun
            </p>
          </div>
          <span className="text-xl text-gray-400 group-hover:text-brand-500 group-hover:translate-x-1 transition">›</span>
        </button>

        {/* 2. XODIMLAR (4 XONALI PIN) */}
        <button
          type="button"
          onClick={() => handleSelectGroup('staff')}
          className="w-full p-4 sm:p-5 rounded-3xl border border-gray-200 dark:border-gray-700/70 hover:border-emerald-500 dark:hover:border-emerald-500 bg-gray-50 dark:bg-gray-800/70 hover:bg-emerald-50/60 dark:hover:bg-emerald-500/10 transition-all active:scale-[0.98] flex items-center gap-4 text-left group"
        >
          <div className="w-14 h-14 shrink-0 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-2xl group-hover:scale-110 transition">
            👥
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-lg font-bold tracking-wider uppercase text-gray-900 dark:text-white">
              XODIMLAR
            </h2>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">
              Kassir, ofitsiant va oshpazlar uchun
            </p>
          </div>
          <span className="text-xl text-gray-400 group-hover:text-emerald-500 group-hover:translate-x-1 transition">›</span>
        </button>

        {/* 3. MIJOZ UCHUN QR-MENYU TUGMASI */}
        <div className="pt-3.5 border-t border-gray-200 dark:border-gray-700/70">
          <button
            type="button"
            onClick={() => setIsTableModalOpen(true)}
            className="w-full py-3.5 px-6 rounded-full border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold text-sm flex items-center justify-center gap-2 transition active:scale-95"
          >
            <span>📱</span>
            <span>Mijoz uchun QR-Menyu</span>
          </button>
        </div>

      </div>

      <p className="mt-6 text-[11px] font-medium text-white/50 tracking-wide">
        Versiya: {APP_BUILD}{APP_BUILD_TIME ? ` · ${formatBuildTime(APP_BUILD_TIME)}` : ''}
      </p>

      {/* =======================================================
          MODAL 1: PIN TERISH OYNASI (BOSHQARUV VA XODIMLAR)
          ======================================================= */}
      {selectedGroup && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-[32px] p-6 sm:p-8 shadow-2xl shadow-black/50 border border-gray-200 dark:border-gray-700/70">

            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white uppercase">
                  {selectedGroup === 'management' ? '👔 Boshqaruv' : '👥 Xodimlar'}
                </h3>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">
                  {requiredPinLength} xonali maxfiy PIN-kodni kiriting
                </p>
              </div>
              <button
                type="button"
                onClick={handleClosePinModal}
                className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center font-bold text-gray-500 dark:text-gray-400 hover:bg-red-100 dark:hover:bg-red-500/15 hover:text-red-500 transition"
              >
                ✕
              </button>
            </div>

            {/* PIN Nuqtachalari */}
            <div className="flex justify-center gap-3.5 my-7">
              {Array.from({ length: requiredPinLength }).map((_, idx) => {
                const isFilled = idx < pin.length;
                return (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-full transition-all duration-150 ${
                      isFilled
                        ? 'bg-brand-500 scale-125 shadow-md shadow-brand-500/50'
                        : 'bg-gray-200 dark:bg-gray-700 ring-1 ring-gray-300 dark:ring-gray-600'
                    }`}
                  />
                );
              })}
            </div>

            {isLocked ? (
              <p className="text-center text-xs font-bold text-red-500 mb-4">
                ⛔️ Kirish vaqtincha bloklandi: {Math.ceil(lockRemainingMs / 1000)} soniya kuting
              </p>
            ) : error && (
              <p className="text-center text-xs font-bold text-red-500 mb-4 animate-bounce">
                {error}
              </p>
            )}

            {/* Raqamlar Klaviaturasi */}
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleNumberClick(String(num))}
                  className="h-16 rounded-2xl bg-gray-50 dark:bg-gray-800 hover:bg-brand-50 dark:hover:bg-brand-500/10 hover:border-brand-500/60 text-2xl font-semibold text-gray-900 dark:text-white transition active:scale-90 border border-gray-200 dark:border-gray-700/70"
                >
                  {num}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setPin('')}
                className="h-16 rounded-2xl bg-red-50 dark:bg-red-500/10 text-red-500 font-bold text-xs uppercase transition active:scale-90"
              >
                Tozalash
              </button>

              <button
                type="button"
                onClick={() => handleNumberClick('0')}
                className="h-16 rounded-2xl bg-gray-50 dark:bg-gray-800 hover:bg-brand-50 dark:hover:bg-brand-500/10 hover:border-brand-500/60 text-2xl font-semibold text-gray-900 dark:text-white transition active:scale-90 border border-gray-200 dark:border-gray-700/70"
              >
                0
              </button>

              <button
                type="button"
                onClick={handleBackspace}
                className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300 font-bold text-xl transition active:scale-90"
              >
                ⌫
              </button>
            </div>

          </div>
        </div>
      )}

      {twoFactorUser && (
        <TwoFactorCodeModal
          user={twoFactorUser}
          title={selectedGroup === 'management' ? '👔 Boshqaruv: 2-bosqich' : '🔐 Ikkinchi bosqich'}
          onVerified={handleTwoFactorVerified}
          onCancel={() => setTwoFactorUser(null)}
          onAudit={onAudit}
        />
      )}

      {/* =======================================================
          MODAL 2: MIJOZ STOLINI TANLASH (BO'SH STOLLAR RO'YXATI)
          ======================================================= */}
      {isTableModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-900 w-full sm:max-w-lg rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl shadow-black/50 border border-gray-200 dark:border-gray-700/70 flex flex-col max-h-[85vh]">

            {/* Modal Header */}
            <div className="flex justify-between items-start gap-3 border-b border-gray-200 dark:border-gray-700/70 pb-4 shrink-0">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
                  <span>🪑</span> Stolingizni tanlang
                </h3>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">
                  QR-Menyuni ochish uchun bo'sh stollardan birini bosing.
                  Band stolda o'tirgan bo'lsangiz, stoldagi QR kodni telefoningiz bilan skaner qiling.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTableModalOpen(false)}
                className="w-10 h-10 shrink-0 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center font-bold text-gray-500 dark:text-gray-400 hover:bg-red-100 dark:hover:bg-red-500/15 hover:text-red-500 transition"
              >
                ✕
              </button>
            </div>

            {/* Filtr Tablari: Faqat Bo'sh stollar vs Barcha stollar */}
            <div className="flex bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700/70 p-1 rounded-full my-4 shrink-0">
              <button
                type="button"
                onClick={() => setTableFilter('free')}
                className={`flex-1 py-2.5 rounded-full font-semibold text-xs uppercase tracking-wider transition ${
                  tableFilter === 'free'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                🟢 Bo'sh stollar ({freeTables.length})
              </button>
              <button
                type="button"
                onClick={() => setTableFilter('all')}
                className={`flex-1 py-2.5 rounded-full font-semibold text-xs uppercase tracking-wider transition ${
                  tableFilter === 'all'
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/30'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                🗺️ Barcha stollar ({tablesWithStatus.length})
              </button>
            </div>

            {/* Stollar Ro'yxati (Grid) */}
            <div className="flex-1 overflow-y-auto hide-scrollbar py-2">
              {tableFilter === 'free' && freeTables.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <span className="text-5xl block mb-3">🎉</span>
                  <p className="font-bold text-gray-700 dark:text-gray-300">
                    Hozircha barcha stollarimiz band!
                  </p>
                  <button
                    type="button"
                    onClick={() => setTableFilter('all')}
                    className="mt-4 text-xs font-bold text-brand-600 dark:text-brand-500 underline"
                  >
                    Band stollarni ko'rish
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {(tableFilter === 'free' ? freeTables : tablesWithStatus).map(item => (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => handleSelectCustomerTable(item.name)}
                      disabled={item.isOccupied}
                      title={item.isOccupied ? "Band stol: stoldagi QR kodni telefon bilan skaner qiling" : undefined}
                      className={`p-4 rounded-3xl border flex flex-col items-center justify-center gap-1.5 transition ${
                        item.isOccupied
                          ? 'bg-gray-100 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/70 opacity-70 cursor-not-allowed'
                          : 'bg-emerald-50/70 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/25 hover:border-emerald-500 dark:hover:border-emerald-500 active:scale-95'
                      }`}
                    >
                      <span className="text-2xl">
                        {item.isOccupied ? '🍽️' : '🪑'}
                      </span>
                      <span className="font-bold text-base text-gray-900 dark:text-white">
                        {item.name}
                      </span>
                      <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full ${
                        item.isOccupied
                          ? 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      }`}>
                        {item.isOccupied ? '🔒 Band · QR orqali' : "Bo'sh"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
