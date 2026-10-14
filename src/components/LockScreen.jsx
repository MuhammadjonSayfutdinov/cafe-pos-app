import React, { useState, useMemo } from 'react';

export default function LockScreen({ 
  cafeName = 'Restoran POS', 
  users = [], 
  tables = [],
  orders = [],
  onLogin, 
  onGuestLogin,
  onOpenQrMenu,
  isDarkMode = false 
}) {
  // ==========================================
  // 1. STATE'LAR
  // ==========================================
  const [selectedGroup, setSelectedGroup] = useState(null); // 'management' | 'staff' | null
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  
  // Mijoz QR-Menyusi uchun Stol tanlash modali state'i
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [tableFilter, setTableFilter] = useState('free'); // 'free' (Bo'shlar) | 'all' (Barchasi)

  const requiredPinLength = selectedGroup === 'management' ? 6 : 4;

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
        o => o && o.table === nameStr && o.status !== "To'langan" && o.status !== 'Qarz'
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
    const matchedUser = safeUsers.find(u => {
      const userPin = String(u.pin || '').trim();
      const role = String(u.role || '').toLowerCase();
      const isManagementRole = role === 'admin' || role === 'warehouse' || role === 'omborchi';

      if (selectedGroup === 'management') {
        return isManagementRole && userPin === enteredPin;
      } else {
        return !isManagementRole && userPin === enteredPin;
      }
    });

    if (matchedUser) {
      if (typeof onLogin === 'function') {
        onLogin(matchedUser);
      }
      handleClosePinModal();
    } else {
      setError("❌ PIN-kod noto'g'ri! Qaytadan urinib ko'ring.");
      setTimeout(() => {
        setPin('');
      }, 400);
    }
  };

  // ==========================================
  // 4. MIJOZ QR-MENYUSIGA STOL TANLAB KIRISH
  // ==========================================
  const handleSelectCustomerTable = (tableName) => {
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
    <div className={`min-h-screen flex flex-col items-center justify-center p-4 select-none transition-colors duration-300 ${
      isDarkMode ? 'dark bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'
    }`}>
      
      {/* SARLAVHA */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-indigo-600 text-white rounded-3xl flex items-center justify-center text-3xl mx-auto mb-4 shadow-xl shadow-indigo-600/30">
          🍽️
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-gray-900 dark:text-white">
          {cafeName}
        </h1>
        <p className="text-xs sm:text-sm font-black uppercase tracking-widest text-gray-400 mt-1">
          Premium Boshqaruv Tizimi
        </p>
      </div>

      {/* ASOSIY KARTA */}
      <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[32px] p-6 sm:p-8 shadow-xl border border-gray-100 dark:border-gray-700 space-y-5">
        
        {/* 1. BOSHQARUV (6 XONALI PIN) */}
        <button
          type="button"
          onClick={() => handleSelectGroup('management')}
          className="w-full p-6 rounded-3xl border-2 border-gray-100 dark:border-gray-700 hover:border-indigo-500 dark:hover:border-indigo-500 bg-gray-50/50 dark:bg-gray-900/40 hover:bg-indigo-50/30 transition-all active:scale-[0.98] flex flex-col items-center text-center group"
        >
          <div className="w-16 h-16 rounded-full bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center text-3xl mb-3 group-hover:scale-110 transition">
            👔
          </div>
          <h2 className="text-lg font-black tracking-wider uppercase text-gray-900 dark:text-white">
            BOSHQARUV
          </h2>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mt-1">
            Faqat rahbar va omborchi uchun
          </p>
        </button>

        {/* 2. XODIMLAR (4 XONALI PIN) */}
        <button
          type="button"
          onClick={() => handleSelectGroup('staff')}
          className="w-full p-6 rounded-3xl border-2 border-gray-100 dark:border-gray-700 hover:border-emerald-500 dark:hover:border-emerald-500 bg-gray-50/50 dark:bg-gray-900/40 hover:bg-emerald-50/30 transition-all active:scale-[0.98] flex flex-col items-center text-center group"
        >
          <div className="w-16 h-16 rounded-full bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center text-3xl mb-3 group-hover:scale-110 transition">
            👥
          </div>
          <h2 className="text-lg font-black tracking-wider uppercase text-gray-900 dark:text-white">
            XODIMLAR
          </h2>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mt-1">
            Kassir, ofitsiant va oshpazlar uchun
          </p>
        </button>

        {/* 3. MIJOZ UCHUN QR-MENYU TUGMASI */}
        <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setIsTableModalOpen(true)}
            className="w-full py-4 px-6 rounded-2xl bg-emerald-100/80 dark:bg-emerald-900/30 hover:bg-emerald-200/80 text-emerald-800 dark:text-emerald-300 font-black text-sm flex items-center justify-center gap-2 transition active:scale-95"
          >
            <span>📱</span>
            <span>Mijoz uchun QR-Menyu</span>
          </button>
        </div>

      </div>

      {/* =======================================================
          MODAL 1: PIN TERISH OYNASI (BOSHQARUV VA XODIMLAR)
          ======================================================= */}
      {selectedGroup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-[32px] p-6 sm:p-8 shadow-2xl border border-gray-100 dark:border-gray-700">
            
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase">
                  {selectedGroup === 'management' ? '👔 Boshqaruv' : '👥 Xodimlar'}
                </h3>
                <p className="text-xs font-bold text-gray-400 mt-0.5">
                  {requiredPinLength} xonali maxfiy PIN-kodni kiriting
                </p>
              </div>
              <button
                type="button"
                onClick={handleClosePinModal}
                className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center font-black text-gray-500 hover:bg-red-100 hover:text-red-500 transition"
              >
                ✕
              </button>
            </div>

            {/* PIN Nuqtachalari */}
            <div className="flex justify-center gap-3 my-6">
              {Array.from({ length: requiredPinLength }).map((_, idx) => {
                const isFilled = idx < pin.length;
                return (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-full transition-all duration-150 ${
                      isFilled
                        ? 'bg-indigo-600 scale-125 shadow-md shadow-indigo-600/40'
                        : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  />
                );
              })}
            </div>

            {error && (
              <p className="text-center text-xs font-black text-red-500 mb-4 animate-bounce">
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
                  className="h-14 rounded-2xl bg-gray-50 dark:bg-gray-700/60 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 text-xl font-black text-gray-900 dark:text-white transition active:scale-90 border border-gray-100 dark:border-gray-600"
                >
                  {num}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setPin('')}
                className="h-14 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-500 font-black text-xs uppercase transition active:scale-90"
              >
                Tozalash
              </button>

              <button
                type="button"
                onClick={() => handleNumberClick('0')}
                className="h-14 rounded-2xl bg-gray-50 dark:bg-gray-700/60 hover:bg-indigo-50 text-xl font-black text-gray-900 dark:text-white transition active:scale-90 border border-gray-100 dark:border-gray-600"
              >
                0
              </button>

              <button
                type="button"
                onClick={handleBackspace}
                className="h-14 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-black text-lg transition active:scale-90"
              >
                ⌫
              </button>
            </div>

          </div>
        </div>
      )}

      {/* =======================================================
          MODAL 2: MIJOZ STOLINI TANLASH (BO'SH STOLLAR RO'YXATI)
          ======================================================= */}
      {isTableModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 w-full sm:max-w-lg rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl border border-gray-100 dark:border-gray-700 flex flex-col max-h-[85vh]">
            
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-700 pb-4 shrink-0">
              <div>
                <h3 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                  <span>🪑</span> Stolingizni tanlang
                </h3>
                <p className="text-xs font-bold text-gray-400 mt-1">
                  QR-Menyuni ochish uchun bo'sh stollardan birini bosing
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTableModalOpen(false)}
                className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center font-black text-gray-500 hover:bg-red-100 hover:text-red-500 transition"
              >
                ✕
              </button>
            </div>

            {/* Filtr Tablari: Faqat Bo'sh stollar vs Barcha stollar */}
            <div className="flex bg-gray-100 dark:bg-gray-900/60 p-1 rounded-2xl my-4 shrink-0">
              <button
                type="button"
                onClick={() => setTableFilter('free')}
                className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition ${
                  tableFilter === 'free'
                    ? 'bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                🟢 Bo'sh stollar ({freeTables.length})
              </button>
              <button
                type="button"
                onClick={() => setTableFilter('all')}
                className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition ${
                  tableFilter === 'all'
                    ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400'
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
                  <p className="font-black text-gray-700 dark:text-gray-300">
                    Hozircha barcha stollarimiz band!
                  </p>
                  <button
                    type="button"
                    onClick={() => setTableFilter('all')}
                    className="mt-4 text-xs font-black text-indigo-600 underline"
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
                      className={`p-4 rounded-2xl border-2 flex flex-col items-center justify-center gap-1.5 transition active:scale-95 ${
                        item.isOccupied
                          ? 'bg-amber-50/70 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/60 hover:border-amber-400'
                          : 'bg-emerald-50/70 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/60 hover:border-emerald-500'
                      }`}
                    >
                      <span className="text-2xl">
                        {item.isOccupied ? '🍽️' : '🪑'}
                      </span>
                      <span className="font-black text-base text-gray-900 dark:text-white">
                        {item.name}
                      </span>
                      <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                        item.isOccupied
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                      }`}>
                        {item.isOccupied ? 'Band (Aktiv)' : "Bo'sh"}
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