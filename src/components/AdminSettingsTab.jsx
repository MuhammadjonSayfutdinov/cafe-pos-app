import React, { useState } from 'react';

export default function AdminSettingsTab({ 
  isOverrideEnabled = true, 
  setIsOverrideEnabled,
  tables = [],
  setTables,
  orders = [],
  setOrders,
  inventoryLogs = [],
  setInventoryLogs,
  auditLogs = [],
  setAuditLogs,
  serviceFee = 10,
  addAuditLog
}) {
  // ==========================================
  // 1. STATE'LAR VA XAVFSIZ MA'LUMOTLAR
  // ==========================================
  const safeTables = Array.isArray(tables) && tables.length > 0 
    ? tables 
    : ['1-Stol', '2-Stol', '3-Stol', 'VIP-1', 'VIP-2', 'Olib ketish'];
  const safeOrders = Array.isArray(orders) ? orders : [];

  const [newTableName, setNewTableName] = useState('');
  const [statusMessage, setStatusMessage] = useState(null);

  const showStatus = (msg) => {
    setStatusMessage(msg);
    setTimeout(() => {
      setStatusMessage(prev => (prev === msg ? null : prev));
    }, 3500);
  };

  // ==========================================
  // 2. XAVFSIZLIK REJIMINI (OVERRIDE) BOSHQARISH
  // ==========================================
  const handleToggleOverride = () => {
    if (typeof setIsOverrideEnabled !== 'function') return;
    const nextState = !isOverrideEnabled;
    setIsOverrideEnabled(nextState);

    if (typeof addAuditLog === 'function') {
      addAuditLog(
        nextState ? "Himoya Yoqildi" : "Himoya O'chirildi (Xavfli)",
        `Qat'iy Rahbar Ruxsati (Manager Override) -> ${nextState ? 'YOQILDI 🔒' : "O'CHIRILDI 🔓"}`
      );
    }
    showStatus(nextState ? "🔒 Qat'iy Rahbar Ruxsati yoqildi!" : "🔓 Rahbar Ruxsati vaqtincha o'chirildi!");
  };

  // ==========================================
  // 3. ZAL VA STOLLAR BOSHQARUVI MANTIG'I
  // ==========================================
  const isTableOccupied = (tableName) => {
    return safeOrders.some(
      o => o && o.table === tableName && o.status !== "To'langan" && o.status !== 'Qarz'
    );
  };

  const handleAddTable = (e) => {
    e.preventDefault();
    const cleanTable = newTableName.trim();
    if (!cleanTable) return;

    const exists = safeTables.some(
      t => String(t).toLowerCase() === cleanTable.toLowerCase()
    );
    if (exists) {
      alert(`"${cleanTable}" nomli stol allaqachon mavjud!`);
      return;
    }

    if (typeof setTables === 'function') {
      // "Olib ketish" doim ro'yxat oxirida turishi uchun uning oldiga qo'shamiz
      const withoutTakeaway = safeTables.filter(t => t !== 'Olib ketish');
      const hasTakeaway = safeTables.includes('Olib ketish');
      const updated = hasTakeaway 
        ? [...withoutTakeaway, cleanTable, 'Olib ketish'] 
        : [...safeTables, cleanTable];
      setTables(updated);
    }

    if (typeof addAuditLog === 'function') {
      addAuditLog("Yangi stol qo'shildi", `"${cleanTable}" stoli xaritaga qo'shildi`);
    }

    setNewTableName('');
    showStatus(`✅ "${cleanTable}" muvaffaqiyatli qo'shildi!`);
  };

  const handleDeleteTable = (tableName) => {
    if (tableName === 'Olib ketish') {
      alert("⛔️ 'Olib ketish' tizimning asosiy xizmat turi hisoblanadi, uni o'chirib bo'lmaydi!");
      return;
    }

    if (safeTables.length <= 2) {
      alert("⛔️ Tizimda kamida bitta zal stoli qolishi shart!");
      return;
    }

    if (isTableOccupied(tableName)) {
      alert(`⛔️ "${tableName}" da hozir yopilmagan aktiv buyurtma bor! Avval u stoldagi hisobni yoping yoki boshqa stolga ko'chiring.`);
      return;
    }

    if (window.confirm(`Rostdan ham "${tableName}" stolini xaritadan o'chirmoqchimisiz?`)) {
      if (typeof setTables === 'function') {
        setTables(safeTables.filter(t => t !== tableName));
      }
      if (typeof addAuditLog === 'function') {
        addAuditLog("Stol o'chirildi", `"${tableName}" stoli xaritadan o'chirildi`);
      }
      showStatus(`🗑 "${tableName}" o'chirildi`);
    }
  };

  // ==========================================
  // 4. BAZANI ZAXIRALASH (BACKUP) VA TIKLASH (RESTORE)
  // ==========================================
  const handleExportBackup = () => {
    try {
      const backupData = {
        exportedAt: new Date().toISOString(),
        app: 'Cafe POS App Enterprise',
        data: {
          pos_menu: JSON.parse(localStorage.getItem('pos_menu') || '[]'),
          pos_categories: JSON.parse(localStorage.getItem('pos_categories') || '[]'),
          pos_users: JSON.parse(localStorage.getItem('pos_users') || '[]'),
          pos_tables: JSON.parse(localStorage.getItem('pos_tables') || '[]'),
          pos_inventory: JSON.parse(localStorage.getItem('pos_inventory') || '[]'),
          pos_inv_logs: JSON.parse(localStorage.getItem('pos_inv_logs') || '[]'),
          pos_orders: JSON.parse(localStorage.getItem('pos_orders') || '[]'),
          pos_audit_logs: JSON.parse(localStorage.getItem('pos_audit_logs') || '[]'),
          pos_override_enabled: JSON.parse(localStorage.getItem('pos_override_enabled') || 'true')
        }
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], {
        type: 'application/json;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cafe-pos-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      if (typeof addAuditLog === 'function') {
        addAuditLog("Baza zaxiralandi", "Tizimning to'liq JSON zaxira nusxasi yuklab olindi");
      }
      showStatus("📦 Baza zaxira nusxasi (.json) yuklab olindi!");
    } catch (err) {
      alert("Zaxiralashda xatolik yuz berdi!");
    }
  };

  const handleImportBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const payload = parsed?.data || parsed;

        if (!payload || typeof payload !== 'object') {
          alert("Xato! Tanlangan fayl Cafe POS zaxira fayli emas.");
          return;
        }

        if (window.confirm("DIQQAT! Zaxira faylini yuklasangiz, hozirgi ma'lumotlar yangilanadi. Davom etasizmi?")) {
          Object.keys(payload).forEach(key => {
            if (key.startsWith('pos_')) {
              localStorage.setItem(key, JSON.stringify(payload[key]));
            }
          });
          alert("✅ Baza muvaffaqiyatli tiklandi! Sahifa hozir yangilanadi.");
          window.location.reload();
        }
      } catch {
        alert("Faylni o'qishda xatolik! To'g'ri .json fayl tanlanganini tekshiring.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ==========================================
  // 5. TOZALASH FUNKSIYALARI (TEST CHEKLARNI O'CHIRISH)
  // ==========================================
  const handleClearPaidOrders = () => {
    const activeUnpaidCount = safeOrders.filter(
      o => o && o.status !== "To'langan" && o.status !== 'Qarz'
    ).length;

    const confirmMsg = activeUnpaidCount > 0
      ? `Hozir ${activeUnpaidCount} ta yopilmagan faol buyurtma bor.\nFaqat yakunlangan ("To'langan") cheklar tarixini tozalamoqchimisiz?`
      : "Barcha yakunlangan savdo cheklari tarixini tozalamoqchimisiz?";

    if (window.confirm(confirmMsg)) {
      if (typeof setOrders === 'function') {
        setOrders(prev => 
          (Array.isArray(prev) ? prev : []).filter(
            o => o && o.status !== "To'langan"
          )
        );
      }
      if (typeof addAuditLog === 'function') {
        addAuditLog("Savdo tarixi tozalandi", "Yakunlangan (To'langan) cheklar tarixi tozalandi");
      }
      showStatus("🧹 Yakunlangan cheklar tarixi tozalandi!");
    }
  };

  // ==========================================
  // 6. RENDER (UI DIZAYN)
  // ==========================================
  return (
    <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 animate-fade-in space-y-8">
      
      {/* BILDIRISHNOMA (TOAST) */}
      {statusMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-black text-sm flex items-center justify-between">
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage(null)} className="text-xs font-black">✕</button>
        </div>
      )}

      {/* SARLAVHA */}
      <div>
        <h2 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
          <span>⚙️</span> Tizim va Xavfsizlik Sozlamalari
        </h2>
        <p className="text-xs sm:text-sm font-bold text-gray-500 mt-1">
          Bosh direktor va ma'muriyat uchun ruxsatlar, zal stollari va ma'lumotlar bazasini boshqarish markazi.
        </p>
      </div>

      {/* 1-BO'LIM: XAVFSIZLIK VA AVTOMATIK QULFLASH */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* RAHBAR RUXSATI (OVERRIDE) SOZLAMASI */}
        <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col justify-between gap-6 shadow-sm hover:shadow-md transition-shadow">
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🛡️</span>
                <h3 className="font-black text-gray-900 dark:text-white text-lg">
                  Qat'iy Rahbar Ruxsati (Override)
                </h3>
              </div>

              {/* iOS uslubidagi Toggle Switch */}
              <button 
                type="button"
                onClick={handleToggleOverride}
                className={`relative w-16 h-8 rounded-full flex-shrink-0 transition-colors duration-300 focus:outline-none shadow-inner ${
                  isOverrideEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-300 flex items-center justify-center ${
                  isOverrideEnabled ? 'translate-x-9' : 'translate-x-1'
                }`}>
                  {isOverrideEnabled && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
                </div>
              </button>
            </div>

            <p className="text-xs sm:text-sm font-bold text-gray-500 leading-relaxed">
              Yoqilgan holatda ofitsiant va kassirlar chekdan taom o'chirish yoki chegirma qilish uchun 
              majburiy ravishda <span className="text-red-500 font-black">Admin parolini (6 xonali)</span> kiritishlari talab etiladi. Bu o'g'rilik va suiiste'molchilikning oldini oladi.
            </p>
          </div>

          <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center text-xs font-black">
            <span className="text-gray-400 uppercase">Joriy holat:</span>
            <span className={isOverrideEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}>
              {isOverrideEnabled ? '🔒 Faol (Himoyalangan)' : "🔓 O'chiq (Erkin rejim)"}
            </span>
          </div>
        </div>

        {/* AVTOMATIK QULFLASH VA SERVIS FOIZI MA'LUMOTI */}
        <div className="bg-indigo-50/70 dark:bg-indigo-900/20 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-800/30 flex flex-col justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="text-3xl">⏱️</span>
            <div>
              <h3 className="font-black text-indigo-900 dark:text-indigo-400 text-lg mb-1">
                Avtomatik Qulflash (Auto-Lock) Faol
              </h3>
              <p className="text-xs sm:text-sm font-bold text-indigo-700 dark:text-indigo-300/80 leading-relaxed">
                Tizim xavfsizligini ta'minlash maqsadida, agar istalgan xodim <strong>2 daqiqa</strong> davomida ekranga tegmasa, dastur avtomatik ravishda qulflanadi va LockScreen oynasiga qaytadi.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-indigo-200/60 dark:border-indigo-800/40">
            <div className="bg-white/80 dark:bg-gray-800/80 p-3 rounded-xl">
              <span className="text-[10px] font-black uppercase text-gray-400 block">Xizmat foizi (Zal)</span>
              <span className="text-base font-black text-indigo-600 dark:text-indigo-400">{serviceFee}%</span>
            </div>
            <div className="bg-white/80 dark:bg-gray-800/80 p-3 rounded-xl">
              <span className="text-[10px] font-black uppercase text-gray-400 block">Auto-Lock Taymeri</span>
              <span className="text-base font-black text-indigo-600 dark:text-indigo-400">120 soniya</span>
            </div>
          </div>
        </div>

      </div>

      {/* 2-BO'LIM: ZAL VA STOLLAR BOSHQARUVI */}
      {typeof setTables === 'function' && (
        <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="font-black text-gray-900 dark:text-white text-lg flex items-center gap-2">
                <span>🪑</span> Zal va Stollar Xaritasi Boshqaruvi ({safeTables.length} ta)
              </h3>
              <p className="text-xs font-bold text-gray-500 mt-0.5">
                Ofitsiant va QR-Menyu ekranida chiqadigan stollarni qo'shish yoki o'chirish
              </p>
            </div>

            <form onSubmit={handleAddTable} className="flex gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={newTableName}
                onChange={e => setNewTableName(e.target.value)}
                placeholder="Masalan: 6-Stol yoki Terassa-1"
                className="flex-1 sm:w-56 px-4 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs whitespace-nowrap transition active:scale-95"
              >
                + Stol qo'shish
              </button>
            </form>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {safeTables.map(tbl => {
              const occupied = isTableOccupied(tbl);
              const isSystemTakeaway = tbl === 'Olib ketish';

              return (
                <div
                  key={tbl}
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-2 ${
                    occupied
                      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="truncate">
                    <p className="font-black text-xs sm:text-sm text-gray-900 dark:text-white truncate">
                      {isSystemTakeaway ? '🛍️ ' : '🪑 '}{tbl}
                    </p>
                    <p className="text-[10px] font-bold text-gray-400">
                      {isSystemTakeaway ? 'Tizim xizmati' : occupied ? '🔴 Band' : "🟢 Bo'sh"}
                    </p>
                  </div>

                  {!isSystemTakeaway && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTable(tbl)}
                      title="Stolni o'chirish"
                      className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-900/30 hover:bg-red-100 text-red-500 font-black text-xs flex items-center justify-center shrink-0 transition"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3-BO'LIM: BAZANI ZAXIRALASH (BACKUP / RESTORE) VA TOZALASH */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* ZAXIRALASH VA TIKLASH */}
        <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-4">
          <div>
            <h3 className="font-black text-gray-900 dark:text-white text-base flex items-center gap-2">
              <span>💾</span> Ma'lumotlar Bazasini Zaxiralash (Backup)
            </h3>
            <p className="text-xs font-bold text-gray-500 mt-1">
              Menyu, retseptlar, xodimlar, ombor qoldig'i va savdo tarixini kompyuterga fayl sifatida saqlab oling.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={handleExportBackup}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-emerald-600/20 transition active:scale-95"
            >
              📥 Zaxira yuklab olish (.json)
            </button>

            <label className="flex-1 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-center cursor-pointer transition active:scale-95">
              📂 Zaxirani tiklash
              <input
                type="file"
                accept=".json"
                onChange={handleImportBackup}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* XOTIRANI TOZALASH */}
        <div className="bg-red-50/50 dark:bg-red-900/10 p-6 rounded-2xl border border-red-100 dark:border-red-900/40 space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="font-black text-red-700 dark:text-red-400 text-base flex items-center gap-2">
              <span>🧹</span> Test va Eski Cheklarni Tozalash
            </h3>
            <p className="text-xs font-bold text-red-600/80 dark:text-red-300/70 mt-1">
              Menyu, xodimlar va ombor qoldig'iga zarar yetkazmasdan, faqat yopilgan ("To'langan") eski savdo cheklarini tozalash.
            </p>
          </div>

          <button
            type="button"
            onClick={handleClearPaidOrders}
            className="w-full bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-red-600/20 transition active:scale-95"
          >
            🗑 Yakunlangan cheklar tarixini tozalash
          </button>
        </div>

      </div>

    </div>
  );
}