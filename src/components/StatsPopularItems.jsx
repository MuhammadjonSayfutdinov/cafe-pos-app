import React, { useState, useMemo } from 'react';

export default function StatsPopularItems({ 
  popularItems = [], 
  onCloseShift 
}) {
  // Saralash rejimi: 'count' (Porsiya soni bo'yicha) | 'revenue' (Tushumi bo'yicha)
  const [sortBy, setSortBy] = useState('count');

  // ==========================================
  // 1. MA'LUMOTLARNI XAVFSIZ STANDARTLASHTIRISH
  // ==========================================
  const normalizedItems = useMemo(() => {
    if (!Array.isArray(popularItems)) return [];

    const mapped = popularItems
      .map((entry, idx) => {
        if (!entry) return null;

        // 1-format: Object.entries dan kelgan [name, { count, revenue }]
        if (Array.isArray(entry)) {
          const [rawName, rawStats] = entry;
          const count = Number(rawStats?.count ?? rawStats?.quantity ?? rawStats?.qty ?? 0) || 0;
          const revenue = Number(rawStats?.revenue ?? rawStats?.total ?? 0) || 0;
          return {
            id: `${rawName}_${idx}`,
            name: String(rawName || "Noma'lum taom"),
            count,
            revenue,
            avgPrice: count > 0 ? Math.round(revenue / count) : 0
          };
        }

        // 2-format: Obyekt { name, count, revenue }
        if (typeof entry === 'object') {
          const count = Number(entry.count ?? entry.quantity ?? entry.qty ?? 0) || 0;
          const revenue = Number(entry.revenue ?? entry.total ?? 0) || 0;
          return {
            id: entry.id || `${entry.name}_${idx}`,
            name: String(entry.name || "Noma'lum taom"),
            count,
            revenue,
            avgPrice: count > 0 ? Math.round(revenue / count) : 0
          };
        }

        return null;
      })
      .filter(Boolean);

    // Tanlangan rejim bo'yicha saralash ('count' yoki 'revenue')
    return mapped.sort((a, b) => {
      if (sortBy === 'revenue') {
        return b.revenue - a.revenue || b.count - a.count;
      }
      return b.count - a.count || b.revenue - a.revenue;
    });
  }, [popularItems, sortBy]);

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

  // ==========================================
  // 2. O'RINLAR UCHUN MAXSUS RANGLAR VA IKONALAR
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
  // 3. RENDER (UI DIZAYN)
  // ==========================================
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6 mt-4 md:mt-6">
      
      {/* =======================================================
          CHAP TOMON: TOP TAOMLAR REYTINGI (ABC ANALITIKA BILAN)
          ======================================================= */}
      <div className="xl:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between">
        
        <div>
          {/* Sarlavha va Saralash Tugmalari */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
            <div>
              <h3 className="text-lg md:text-xl font-black text-gray-900 dark:text-white">
                🔥 Top-5 Eng Xaridorgir Taomlar
              </h3>
              <p className="text-xs font-bold text-gray-500 mt-1">
                Restoraningizning eng ko'p sotilgan va eng daromadli pozitsiyalari
              </p>
            </div>

            {/* Saralash rejimi switcheri */}
            {normalizedItems.length > 0 && (
              <div className="flex bg-gray-100 dark:bg-gray-900 p-1 rounded-xl w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setSortBy('count')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-black transition ${
                    sortBy === 'count'
                      ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  🔢 Soni bo'yicha
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy('revenue')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-black transition ${
                    sortBy === 'revenue'
                      ? 'bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  💰 Tushumi bo'yicha
                </button>
              </div>
            )}
          </div>
          
          {/* Ro'yxat */}
          {normalizedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
              <span className="text-5xl mb-3 opacity-50">🍽️</span>
              <p className="font-bold text-gray-400 text-sm">
                Hali hech narsa sotilmagan.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {normalizedItems.map((item, index) => {
                const rank = getRankBadge(index);

                // Progress bar kengligi va ulush foizi
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

        {/* Pastki Xulosa Satri */}
        {normalizedItems.length > 0 && (
          <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700 flex flex-wrap justify-between items-center gap-2 text-xs font-bold text-gray-500">
            <span>
              🍽️ Top-5 jami sotuv: <strong className="text-gray-900 dark:text-white">{summaryStats.totalPortions.toLocaleString()} porsiya</strong>
            </span>
            <span>
              💰 Top-5 tushumi: <strong className="text-emerald-600 dark:text-emerald-400">{summaryStats.totalTopRevenue.toLocaleString()} so'm</strong>
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

          {/* Smena Xulosasi Qutisi */}
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