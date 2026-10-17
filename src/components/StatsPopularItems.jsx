import React, { useState, useMemo } from 'react';

// =========================================================
// BUYURTMA SANASINI HAR QANDAY FORMATDAN XAVFSIZ O'QISH
// =========================================================
const parseOrderTimeMs = (order) => {
  if (!order) return Date.now();

  if (order.closedAtMs && !isNaN(Number(order.closedAtMs))) return Number(order.closedAtMs);
  if (order.createdAt && !isNaN(Number(order.createdAt))) return Number(order.createdAt);

  const rawDateStr = String(order.closeTime || order.archiveDate || order.date || '').trim();
  if (rawDateStr) {
    // 1) DD.MM.YYYY formatini tekshirish (Masalan: 17.10.2026 yoki 17.10.2026, 14:20)
    const dmyMatch = rawDateStr.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (dmyMatch) {
      const day = Number(dmyMatch[1]);
      const month = Number(dmyMatch[2]) - 1;
      const year = Number(dmyMatch[3]);
      const timeMatch = rawDateStr.match(/(\d{1,2}):(\d{2})/);
      const hh = timeMatch ? Number(timeMatch[1]) : 12;
      const mm = timeMatch ? Number(timeMatch[2]) : 0;
      const constructed = new Date(year, month, day, hh, mm).getTime();
      if (!isNaN(constructed)) return constructed;
    }

    // 2) Standart ISO yoki inglizcha sanani tekshirish
    const parsed = Date.parse(rawDateStr);
    if (!isNaN(parsed)) return parsed;
  }

  // 3) Order ID ichida 13 xonali timestamp bo'lsa
  const idMatch = String(order.id || '').match(/\d{13}/);
  if (idMatch) {
    const idMs = Number(idMatch[0]);
    if (idMs > 1600000000000 && idMs <= Date.now() + 86400000) return idMs;
  }

  return Date.now();
};

const toDateInputValue = (dateObj) => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export default function StatsPopularItems({ 
  popularItems = [], 
  orders = [],
  onCloseShift 
}) {
  // Saralash rejimi: 'count' (Porsiya soni bo'yicha) | 'revenue' (Tushumi bo'yicha)
  const [sortBy, setSortBy] = useState('count');
  const [showAllRanks, setShowAllRanks] = useState(false);

  // YANGI: 2-Skrinshot bo'yicha taomlar uchun maxsus Sana Oralig'i filtri
  // 'sync' (Umumiy filtr bilan) | 'today' (Bugun) | 'week' (Hafta) | 'month' (Shu oy) | 'last_month' (O'tgan oy) | 'custom' (Sana oralig'i)
  const [itemDateMode, setItemDateMode] = useState('sync');
  const [isDatePanelOpen, setIsDatePanelOpen] = useState(false);

  const todayStr = useMemo(() => toDateInputValue(new Date()), []);
  const firstDayOfMonthStr = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    return toDateInputValue(d);
  }, []);

  const [customStartDate, setCustomStartDate] = useState(firstDayOfMonthStr);
  const [customEndDate, setCustomEndDate] = useState(todayStr);

  // ==========================================
  // 1. TANLANGAN SANALAR ORALIG'I BO'YICHA TAOMLARNI HISOBLASH
  // ==========================================
  const computedPopularSource = useMemo(() => {
    // Agar 'sync' tanlangan bo'lsa yoki orders prop berilmagan bo'lsa, StatsMode dan kelgan popularItems ni ishlatamiz
    if (itemDateMode === 'sync' || !Array.isArray(orders) || orders.length === 0) {
      return popularItems;
    }

    const now = new Date();
    let startMs = 0;
    let endMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

    if (itemDateMode === 'today') {
      startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    } else if (itemDateMode === 'week') {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      d.setDate(d.getDate() - 6);
      startMs = d.getTime();
    } else if (itemDateMode === 'month') {
      startMs = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
    } else if (itemDateMode === 'last_month') {
      startMs = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0).getTime();
      endMs = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime();
    } else if (itemDateMode === 'custom') {
      if (customStartDate) {
        const [sy, sm, sd] = customStartDate.split('-').map(Number);
        startMs = new Date(sy, sm - 1, sd, 0, 0, 0, 0).getTime();
      }
      if (customEndDate) {
        const [ey, em, ed] = customEndDate.split('-').map(Number);
        endMs = new Date(ey, em - 1, ed, 23, 59, 59, 999).getTime();
      }
    }

    const validOrders = orders.filter(o => {
      if (!o || !["To'langan", 'Arxiv', 'Qarz'].includes(o.status)) return false;
      const tMs = parseOrderTimeMs(o);
      return tMs >= startMs && tMs <= endMs;
    });

    const map = {};
    validOrders.forEach(order => {
      if (!Array.isArray(order.items)) return;
      order.items.forEach(item => {
        if (!item) return;
        const rawName = String(item.name || "Noma'lum taom").trim();
        const qty = Number(item.quantity ?? item.qty ?? 1) || 0;
        const price = Number(item.price ?? item.variants?.[0]?.price ?? 0) || 0;

        // Katta-kichik harf xatosini tuzatish (Masalan: "manti" va "Manti" bir xil narxda bo'lsa birlashtiriladi)
        const normalizedKey = `${rawName.toLowerCase()}__${price}`;
        const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

        if (!map[normalizedKey]) {
          map[normalizedKey] = {
            name: displayName,
            count: 0,
            revenue: 0
          };
        }
        map[normalizedKey].count += qty;
        map[normalizedKey].revenue += qty * price;
      });
    });

    return Object.values(map).map(st => [st.name, { count: st.count, revenue: st.revenue }]);
  }, [itemDateMode, orders, popularItems, customStartDate, customEndDate]);

  // ==========================================
  // 2. MA'LUMOTLARNI STANDARTLASHTIRISH VA SARALASH
  // ==========================================
  const normalizedItems = useMemo(() => {
    if (!Array.isArray(computedPopularSource)) return [];

    // Bir xil nomdagi taomlarni (masalan "manti" va "Manti") chiroyli birlashtirish
    const mergedByName = {};

    computedPopularSource.forEach((entry, idx) => {
      if (!entry) return;
      let rawName = '';
      let count = 0;
      let revenue = 0;

      if (Array.isArray(entry)) {
        rawName = String(entry[0] || "Noma'lum taom").trim();
        count = Number(entry[1]?.count ?? entry[1]?.quantity ?? entry[1]?.qty ?? 0) || 0;
        revenue = Number(entry[1]?.revenue ?? entry[1]?.total ?? 0) || 0;
      } else if (typeof entry === 'object') {
        rawName = String(entry.name || "Noma'lum taom").trim();
        count = Number(entry.count ?? entry.quantity ?? entry.qty ?? 0) || 0;
        revenue = Number(entry.revenue ?? entry.total ?? 0) || 0;
      }

      if (!rawName || (count <= 0 && revenue <= 0)) return;

      const avgUnit = count > 0 ? Math.round(revenue / count) : 0;
      const mergeKey = `${rawName.toLowerCase()}__${avgUnit}`;
      const prettyName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

      if (!mergedByName[mergeKey]) {
        mergedByName[mergeKey] = {
          id: `${mergeKey}_${idx}`,
          name: prettyName,
          count: 0,
          revenue: 0
        };
      }
      mergedByName[mergeKey].count += count;
      mergedByName[mergeKey].revenue += revenue;
    });

    const mapped = Object.values(mergedByName).map(item => ({
      ...item,
      avgPrice: item.count > 0 ? Math.round(item.revenue / item.count) : 0
    }));

    const sorted = mapped.sort((a, b) => {
      if (sortBy === 'revenue') {
        return b.revenue - a.revenue || b.count - a.count;
      }
      return b.count - a.count || b.revenue - a.revenue;
    });

    return showAllRanks ? sorted.slice(0, 15) : sorted.slice(0, 5);
  }, [computedPopularSource, sortBy, showAllRanks]);

  // Umumiy ko'rsatkichlar (Progress bar va pastki xulosa uchun)
  const summaryStats = useMemo(() => {
    const totalPortions = normalizedItems.reduce((sum, item) => sum + item.count, 0);
    const totalTopRevenue = normalizedItems.reduce((sum, item) => sum + item.revenue, 0);
    const maxCount = normalizedItems.reduce((max, item) => Math.max(max, item.count), 0);
    const maxRevenue = normalizedItems.reduce((max, item) => Math.max(max, item.revenue), 0);

    return {
      totalPortions,
      totalTopRevenue,
      maxCount: maxCount || 1,
      maxRevenue: maxRevenue || 1
    };
  }, [normalizedItems]);

  const activeDateBadgeLabel = useMemo(() => {
    switch (itemDateMode) {
      case 'today': return 'Bugun';
      case 'week': return 'Oxirgi 7 kun';
      case 'month': return 'Shu oy';
      case 'last_month': return "O'tgan oy";
      case 'custom': return `${customStartDate} — ${customEndDate}`;
      default: return 'Sana oralig\'i';
    }
  }, [itemDateMode, customStartDate, customEndDate]);

  // ==========================================
  // 3. O'RINLAR UCHUN MAXSUS RANGLAR VA IKONALAR
  // ==========================================
  const getRankBadge = (index) => {
    switch (index) {
      case 0:
        return {
          bg: 'bg-yellow-400',
          text: 'text-yellow-950',
          shadow: 'shadow-yellow-400/40',
          bar: 'bg-amber-500',
          icon: '👑'
        };
      case 1:
        return {
          bg: 'bg-gray-300 dark:bg-gray-600',
          text: 'text-gray-900 dark:text-white',
          shadow: 'shadow-gray-400/30',
          bar: 'bg-indigo-500',
          icon: '🥈'
        };
      case 2:
        return {
          bg: 'bg-amber-700',
          text: 'text-white',
          shadow: 'shadow-amber-700/40',
          bar: 'bg-amber-700',
          icon: '🥉'
        };
      default:
        return {
          bg: 'bg-gray-100 dark:bg-gray-700',
          text: 'text-gray-600 dark:text-gray-300',
          shadow: 'shadow-none',
          bar: 'bg-emerald-500',
          icon: `#${index + 1}`
        };
    }
  };

  // ==========================================
  // 4. RENDER (UI DIZAYN)
  // ==========================================
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6 mt-4 md:mt-6">
      
      {/* =======================================================
          CHAP TOMON: TOP TAOMLAR REYTINGI + SANA ORALIG'I FILTRI
          ======================================================= */}
      <div className="xl:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between">
        
        <div>
          {/* Sarlavha va 3 ta Boshqaruv Punkti: Soni | Tushumi | Sana oralig'i */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 mb-4">
            <div>
              <h3 className="text-lg md:text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                <span>🔥</span> Top-{showAllRanks ? '15' : '5'} Eng Xaridorgir Taomlar
              </h3>
              <p className="text-xs font-bold text-gray-500 mt-1">
                Restoraningizning eng ko'p sotilgan va eng daromadli pozitsiyalari
              </p>
            </div>

            {/* Soni bo'yicha | Tushumi bo'yicha | 📅 Sana oralig'i */}
            <div className="flex flex-wrap items-center gap-1.5 bg-gray-100 dark:bg-gray-900 p-1.5 rounded-2xl w-full lg:w-auto">
              <button
                type="button"
                onClick={() => setSortBy('count')}
                className={`flex-1 sm:flex-initial px-3 py-2 rounded-xl text-xs font-black transition whitespace-nowrap ${
                  sortBy === 'count'
                    ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800'
                }`}
              >
                🔢 Soni bo'yicha
              </button>

              <button
                type="button"
                onClick={() => setSortBy('revenue')}
                className={`flex-1 sm:flex-initial px-3 py-2 rounded-xl text-xs font-black transition whitespace-nowrap ${
                  sortBy === 'revenue'
                    ? 'bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800'
                }`}
              >
                💰 Tushumi bo'yicha
              </button>

              <button
                type="button"
                onClick={() => setIsDatePanelOpen(prev => !prev)}
                className={`flex-1 sm:flex-initial px-3 py-2 rounded-xl text-xs font-black transition whitespace-nowrap flex items-center justify-center gap-1 ${
                  itemDateMode !== 'sync' || isDatePanelOpen
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'bg-white/70 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-white'
                }`}
              >
                <span>📅</span>
                <span>{activeDateBadgeLabel}</span>
                <span className="text-[10px]">{isDatePanelOpen ? '▲' : '▼'}</span>
              </button>
            </div>
          </div>

          {/* OCHILUVCHI SANA ORALIG'I PANELI (2-Skrinshot a-talabi) */}
          {isDatePanelOpen && (
            <div className="mb-5 p-4 rounded-2xl bg-amber-50/70 dark:bg-gray-900/80 border border-amber-200 dark:border-gray-700 space-y-3 animate-fade-in">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black uppercase text-amber-800 dark:text-amber-400">
                  📅 Qaysi davr ichida ko'p sotilgan taomlarni ko'ramiz?
                </span>
                {itemDateMode !== 'sync' && (
                  <button
                    type="button"
                    onClick={() => setItemDateMode('sync')}
                    className="text-[11px] font-black text-red-500 hover:underline"
                  >
                    ✕ Asosiy filtrga qaytarish
                  </button>
                )}
              </div>

              {/* Tezkor davr tugmalari */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'sync', label: '🔄 Umumiy filtr bilan birga' },
                  { id: 'today', label: '☀️ Bugun' },
                  { id: 'week', label: '📆 Oxirgi 7 kun' },
                  { id: 'month', label: '🗓 Shu oy' },
                  { id: 'last_month', label: "⏪ O'tgan oy" },
                  { id: 'custom', label: '🎯 Aniq sana oralig\'i' }
                ].map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setItemDateMode(p.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                      itemDateMode === p.id
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Sanadan - Sanagacha kalendar inputlari */}
              {itemDateMode === 'custom' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">
                      Boshlanish sanasi (... dan)
                    </label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={e => setCustomStartDate(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-amber-300 dark:border-gray-700 text-xs font-black text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">
                      Tugash sanasi (... gacha)
                    </label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={e => setCustomEndDate(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-amber-300 dark:border-gray-700 text-xs font-black text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Taomlar Reytingi Ro'yxati */}
          {normalizedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
              <span className="text-5xl mb-3 opacity-50">🍽️</span>
              <p className="font-bold text-gray-400 text-sm">
                Tanlangan sanalar oralig'ida sotuvlar topilmadi.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {normalizedItems.map((item, index) => {
                const rank = getRankBadge(index);

                const progressPercent = sortBy === 'revenue'
                  ? Math.round((item.revenue / summaryStats.maxRevenue) * 100)
                  : Math.round((item.count / summaryStats.maxCount) * 100);

                const shareOfTop = sortBy === 'revenue'
                  ? (summaryStats.totalTopRevenue > 0 ? Math.round((item.revenue / summaryStats.totalTopRevenue) * 100) : 0)
                  : (summaryStats.totalPortions > 0 ? Math.round((item.count / summaryStats.totalPortions) * 100) : 0);

                return (
                  <div 
                    key={item.id} 
                    className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all group space-y-2.5"
                  >
                    <div className="flex justify-between items-center gap-3">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <span className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-xl font-black text-sm md:text-base ${rank.bg} ${rank.text} shadow-md ${rank.shadow} transition-transform group-hover:scale-110`}>
                          {rank.icon}
                        </span>
                        <div className="min-w-0">
                          <span className="font-black text-gray-900 dark:text-white text-sm sm:text-base md:text-lg block leading-tight truncate">
                            {item.name}
                          </span>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] md:text-xs font-bold text-gray-500 dark:text-gray-400">
                            <span>
                              Tushum: <strong className="text-emerald-600 dark:text-emerald-400">{item.revenue.toLocaleString()} s</strong>
                            </span>
                            {item.avgPrice > 0 && (
                              <span className="text-gray-400">
                                • (1 pors: {item.avgPrice.toLocaleString()} s)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-right bg-white dark:bg-gray-800 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm shrink-0">
                        <p className="font-black text-indigo-600 dark:text-indigo-400 text-base md:text-xl leading-none">
                          {item.count.toLocaleString()}{' '}
                          <span className="text-xs font-bold text-gray-500">pors</span>
                        </p>
                        <span className="text-[10px] font-black text-gray-400 block mt-1">
                          Ulushi: {shareOfTop}%
                        </span>
                      </div>
                    </div>

                    {/* Vizual Progress Bar */}
                    <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${rank.bar} transition-all duration-500`}
                        style={{ width: `${Math.max(6, Math.min(100, progressPercent))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pastki Xulosa Satri va Ko'proq ko'rish tugmasi */}
        {normalizedItems.length > 0 && (
          <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700 flex flex-wrap justify-between items-center gap-2 text-xs font-bold text-gray-500">
            <span>
              🍽️ Top jami sotuv: <strong className="text-gray-900 dark:text-white">{summaryStats.totalPortions.toLocaleString()} porsiya</strong>
            </span>
            <button
              type="button"
              onClick={() => setShowAllRanks(prev => !prev)}
              className="text-indigo-600 dark:text-indigo-400 font-black hover:underline"
            >
              {showAllRanks ? '▲ Top-5 talikni qoldirish' : '▼ Top-15 talikni ko\'rish'}
            </button>
            <span>
              💰 Top tushumi: <strong className="text-emerald-600 dark:text-emerald-400">{summaryStats.totalTopRevenue.toLocaleString()} so'm</strong>
            </span>
          </div>
        )}
      </div>

      {/* =======================================================
          O'NG TOMON: SMENANI YOPISH (Z-OTCHYOT BOSHQARUVI)
          ======================================================= */}
      <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between">
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="w-14 h-14 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center text-3xl shadow-sm">
              📊
            </div>
            <span className="text-[11px] font-black uppercase px-3 py-1 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50">
              Kunlik Yopish
            </span>
          </div>

          <div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2">
              Z-Otchyot (Smena yopish)
            </h3>
            <p className="text-xs sm:text-sm font-bold text-gray-500 leading-relaxed">
              Smenani yopish orqali siz barcha joriy to'langan tushumlarni va cheklarni arxivga o'tkazasiz. 
              Ertangi kun uchun kassa nollanadi va yangi hisobot boshlanadi.
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-900/60 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 space-y-2 text-xs font-bold">
            <div className="flex justify-between text-gray-500">
              <span>📅 Sana:</span>
              <span className="font-black text-gray-800 dark:text-gray-200">
                {new Date().toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>🍲 Top taomlar sotuvi:</span>
              <span className="font-black text-indigo-600 dark:text-indigo-400">
                {summaryStats.totalPortions} porsiya
              </span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>ℹ️ Ochiq va Qarz cheklar:</span>
              <span className="font-black text-emerald-600 dark:text-emerald-400">
                Saqlanib qoladi
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
          <button 
            type="button"
            onClick={() => typeof onCloseShift === 'function' && onCloseShift()}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-5 rounded-2xl font-black shadow-lg shadow-purple-600/30 transition-all active:scale-95 flex justify-center items-center gap-2 text-base sm:text-lg uppercase tracking-wider"
          >
            <span>Smenani Yopish</span> <span>🔒</span>
          </button>
        </div>
        
      </div>

    </div>
  );
}