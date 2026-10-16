import React, { useState, useMemo } from 'react';

// O'lchov birliklarini konvertatsiya qilish yordamchisi
const UNIT_FACTORS = {
  gr: { family: 'weight', factor: 1 },
  kg: { family: 'weight', factor: 1000 },
  tonna: { family: 'weight', factor: 1000000 },
  ml: { family: 'volume', factor: 1 },
  litr: { family: 'volume', factor: 1000 }
};

const normalizeUnit = (unitStr) => {
  const u = String(unitStr || '').trim().toLowerCase();
  if (['g', 'gr', 'gram', 'gramm'].includes(u)) return 'gr';
  if (['kg', 'kilogram', 'kilogramm', 'kilo'].includes(u)) return 'kg';
  if (['t', 'ton', 'tonna', 'tn'].includes(u)) return 'tonna';
  if (['ml', 'millilitr'].includes(u)) return 'ml';
  if (['l', 'lt', 'litr', 'liter'].includes(u)) return 'litr';
  return u;
};

// Harakat miqdorini gr / kg / tonna ko'rinishida qo'shimcha ko'rsatish
const getConvertedSubtext = (rawDiff, unitStr) => {
  const norm = normalizeUnit(unitStr);
  const meta = UNIT_FACTORS[norm];
  if (!meta) return null;

  const numericVal = Math.abs(parseFloat(String(rawDiff).replace(/[^0-9.-]/g, '')));
  if (!numericVal || isNaN(numericVal)) return null;

  if (meta.family === 'weight') {
    const inGrams = numericVal * meta.factor;
    const inKg = Number((inGrams / 1000).toFixed(4));
    const inTons = Number((inGrams / 1000000).toFixed(6));
    const inGr = Number(inGrams.toFixed(2));
    return `${inTons} t • ${inKg.toLocaleString()} kg • ${inGr.toLocaleString()} gr`;
  }

  if (meta.family === 'volume') {
    const inMl = numericVal * meta.factor;
    const inLitr = Number((inMl / 1000).toFixed(4));
    return `${inLitr.toLocaleString()} litr • ${Math.round(inMl).toLocaleString()} ml`;
  }

  return null;
};

export default function WarehouseHistoryTab({ 
  inventoryLogs = [],
  setInventoryLogs,
  currentUser,
  requireAdminOverride,
  addAuditLog
}) {
  const safeLogs = Array.isArray(inventoryLogs) ? inventoryLogs : [];

  // ==========================================
  // 1. STATE'LAR (QIDIRUV VA FILTR)
  // ==========================================
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'kirim' | 'chiqim' | 'prep' | 'reviziya'

  // ==========================================
  // 2. LOG MA'LUMOTLARINI XAVFSIZ STANDARTLASHTIRISH
  // ==========================================
  const normalizeLogEntry = (log, index) => {
    if (!log) return null;

    const rawType = String(log.type || 'Harakat');
    const typeLower = rawType.toLowerCase();

    // Mahsulot nomi (itemName yoki productName)
    const itemName = log.itemName || log.productName || "Noma'lum mahsulot";
    // Izoh (note yoki reason)
    const note = log.note || log.reason || '-';
    // Foydalanuvchi
    const user = log.user || log.userName || 'Omborchi';
    // Birlik
    const unit = log.unit || '';

    // Miqdor o'zgarishi (diffAmount yoki amount)
    let diffStr = '';
    if (log.diffAmount !== undefined && log.diffAmount !== null && String(log.diffAmount).trim() !== '') {
      diffStr = String(log.diffAmount).trim();
    } else if (log.amount !== undefined && log.amount !== null) {
      const numAmt = Number(log.amount);
      if (!isNaN(numAmt)) {
        const isDeduction = typeLower.includes('chiqim') || typeLower.includes('sotuv');
        diffStr = isDeduction ? `-${Math.abs(numAmt)}` : `+${Math.abs(numAmt)}`;
      } else {
        diffStr = String(log.amount);
      }
    } else {
      diffStr = '-';
    }

    // Kategoriya va ranglarni aniqlash
    let category = 'chiqim';
    let badgeLabel = rawType;
    let badgeStyle = 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300';
    let barColor = 'bg-orange-500';

    if (typeLower.includes('tayyorlov') || typeLower.includes('zagatovka')) {
      category = 'prep';
      badgeLabel = rawType;
      badgeStyle = 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
      barColor = 'bg-amber-500';
    } else if (typeLower.includes('kirim')) {
      category = 'kirim';
      badgeLabel = '📥 Kirim';
      badgeStyle = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
      barColor = 'bg-emerald-500';
    } else if (typeLower.includes('reviziya')) {
      category = 'reviziya';
      badgeLabel = '⚖️ Reviziya';
      badgeStyle = 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300';
      barColor = 'bg-indigo-500';
    } else if (typeLower.includes('sotuv') || typeLower.includes('avto')) {
      category = 'chiqim';
      badgeLabel = '🧾 Sotuv (Avto)';
      badgeStyle = 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300';
      barColor = 'bg-purple-500';
    } else {
      category = 'chiqim';
      badgeLabel = '📤 Chiqim';
      badgeStyle = 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
      barColor = 'bg-red-500';
    }

    const isPositive = diffStr.startsWith('+');
    const isNegative = diffStr.startsWith('-') && diffStr !== '-';

    return {
      id: log.id || `log_${index}`,
      date: log.date || '-',
      rawType,
      category,
      badgeLabel,
      badgeStyle,
      barColor,
      itemName,
      diffStr,
      unit,
      isPositive,
      isNegative,
      convertedSubtext: getConvertedSubtext(diffStr, unit),
      note,
      user
    };
  };

  const normalizedLogs = useMemo(() => {
    return safeLogs.map((l, idx) => normalizeLogEntry(l, idx)).filter(Boolean);
  }, [safeLogs]);

  // ==========================================
  // 3. FILTRLASH MANTIG'I
  // ==========================================
  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return normalizedLogs.filter(item => {
      if (typeFilter !== 'all' && item.category !== typeFilter) {
        return false;
      }

      if (!q) return true;

      return (
        item.itemName.toLowerCase().includes(q) ||
        item.note.toLowerCase().includes(q) ||
        item.user.toLowerCase().includes(q) ||
        item.date.toLowerCase().includes(q) ||
        item.rawType.toLowerCase().includes(q)
      );
    });
  }, [normalizedLogs, typeFilter, searchQuery]);

  // ==========================================
  // 4. YUKLAB OLISH VA TARIXNI TOZALASH
  // ==========================================
  const handleExportHistory = () => {
    if (filteredLogs.length === 0) return;

    const lines = filteredLogs.map(
      (l, i) => `${i + 1}. [${l.date}] ${l.rawType} | ${l.itemName}: ${l.diffStr} ${l.unit} | Izoh: ${l.note} | Xodim: ${l.user}`
    );
    const content = `OMBORXONA HARAKATLAR TARIXI\nSana: ${new Date().toLocaleString()}\n==========================================================\n\n` + lines.join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ombor-tarixi-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleClearHistory = () => {
    if (typeof setInventoryLogs !== 'function' || safeLogs.length === 0) return;

    const performClear = () => {
      if (window.confirm("Rostdan ham barcha ombor harakatlari tarixini o'chirib tozalamoqchimisiz? (Ombor qoldig'i o'zgarmaydi)")) {
        setInventoryLogs([]);
        if (typeof addAuditLog === 'function') {
          addAuditLog("Ombor tarixi tozalandi", "Ombor harakatlari jurnali tozalandi");
        }
      }
    };

    if (typeof requireAdminOverride === 'function' && currentUser?.role !== 'admin') {
      requireAdminOverride("Ombor harakatlari tarixini tozalash", performClear);
    } else {
      performClear();
    }
  };

  // ==========================================
  // 5. RENDER (UI DIZAYN)
  // ==========================================
  if (safeLogs.length === 0) {
    return (
      <div className="animate-fade-in text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-3xl">
        <span className="text-5xl block mb-3 opacity-50">📜</span>
        <p className="font-bold text-gray-400">Hali hech qanday ombor harakati bajarilmagan.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-4">
      
      {/* YUQORI PANEL: QIDIRUV, FILTR TUGMALARI VA EKSPORT */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3 bg-gray-50 dark:bg-gray-900/50 p-3.5 rounded-2xl border border-gray-100 dark:border-gray-700">
        
        <div className="flex flex-col sm:flex-row gap-2.5 flex-1">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="🔍 Mahsulot, xodim, sana yoki izohni qidiring..."
              className="w-full pl-4 pr-9 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs sm:text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-emerald-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 font-black"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex bg-gray-200/70 dark:bg-gray-800 p-1 rounded-xl overflow-x-auto hide-scrollbar">
            {[
              { id: 'all', label: `Barchasi (${normalizedLogs.length})` },
              { id: 'kirim', label: '📥 Kirim' },
              { id: 'chiqim', label: '📤 Chiqim / Sotuv' },
              { id: 'prep', label: '🔪 Tayyorlov' },
              { id: 'reviziya', label: '⚖️ Reviziya' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTypeFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black whitespace-nowrap transition ${
                  typeFilter === tab.id
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportHistory}
            disabled={filteredLogs.length === 0}
            className="flex-1 lg:flex-none px-4 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 font-black text-xs transition active:scale-95 disabled:opacity-40 whitespace-nowrap"
          >
            📥 Yuklab olish (.txt)
          </button>

          {typeof setInventoryLogs === 'function' && (
            <button
              type="button"
              onClick={handleClearHistory}
              className="px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/30 hover:bg-red-100 text-red-600 dark:text-red-400 font-black text-xs transition active:scale-95 whitespace-nowrap"
            >
              🗑 Tozalash
            </button>
          )}
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="text-center py-12 text-gray-400 font-bold">
          Tanlangan filtr bo'yicha yozuvlar topilmadi.
        </div>
      ) : (
        <>
          {/* MOBILE UCHUN KARTOCHKALAR (History) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredLogs.map(log => (
              <div 
                key={log.id} 
                className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden"
              >
                <div className={`absolute top-0 left-0 w-1.5 h-full ${log.barColor}`}></div>
                
                <div className="flex justify-between items-start mb-2 pl-2">
                  <span className="text-xs font-bold text-gray-400">{log.date}</span>
                  <span className={`px-2.5 py-1 rounded-md text-[10px] uppercase font-black tracking-wider ${log.badgeStyle}`}>
                    {log.badgeLabel}
                  </span>
                </div>

                <div className="flex justify-between items-start pl-2 gap-2">
                  <span className="font-black text-gray-900 dark:text-white text-base">
                    {log.itemName}
                  </span>
                  <div class