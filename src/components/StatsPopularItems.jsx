import React from 'react';

export default function StatsPopularItems({ 
  popularItems, 
  onCloseShift 
}) {
  
  // PRO DIZAYN: O'rinlar uchun maxsus ranglar va ikonalar
  const getRankBadge = (index) => {
    switch(index) {
      case 0: return { bg: 'bg-yellow-400', text: 'text-yellow-900', shadow: 'shadow-yellow-400/50', icon: '👑' };
      case 1: return { bg: 'bg-gray-300', text: 'text-gray-800', shadow: 'shadow-gray-400/50', icon: '🥈' };
      case 2: return { bg: 'bg-amber-700', text: 'text-white', shadow: 'shadow-amber-700/50', icon: '🥉' };
      default: return { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-500 dark:text-gray-400', shadow: 'shadow-none', icon: `#${index + 1}` };
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6 mt-4 md:mt-6">
      
      {/* CHap tomon: Top Taomlar Reytingi */}
      <div className="xl:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
        
        <div className="mb-6">
          <h3 className="text-lg md:text-xl font-black text-gray-900 dark:text-white">
            🔥 Top-5 Eng Ko'p Sotilgan Taomlar
          </h3>
          <p className="text-xs font-bold text-gray-500 mt-1">
            Restoraningizning eng xaridorgir pozitsiyalari reytingi
          </p>
        </div>
        
        {popularItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <span className="text-5xl mb-3 opacity-50">🍽️</span>
            <p className="font-bold text-gray-400">Hali hech narsa sotilmagan.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {popularItems.map(([name, stats], index) => {
              const rank = getRankBadge(index);
              return (
                <div 
                  key={name} 
                  className="flex justify-between items-center p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow group"
                >
                  <div className="flex items-center gap-4">
                    <span className={`w-10 h-10 flex items-center justify-center rounded-xl font-black text-sm md:text-base ${rank.bg} ${rank.text} shadow-md ${rank.shadow} transition-transform group-hover:scale-110`}>
                      {rank.icon}
                    </span>
                    <div>
                      <span className="font-black text-gray-900 dark:text-white md:text-lg block leading-tight">
                        {name}
                      </span>
                      <span className="text-[10px] md:text-xs font-bold text-gray-400">
                        Umumiy tushum: {stats.revenue.toLocaleString()} s
                      </span>
                    </div>
                  </div>
                  
                  <div className="text-right bg-white dark:bg-gray-800 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <p className="font-black text-indigo-600 dark:text-indigo-400 text-lg md:text-xl">
                      {stats.count} <span className="text-xs font-bold text-gray-500">ta porsiya</span>
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* O'ng tomon: Smenani Yopish (Z-Otchyot) */}
      <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between">
        
        <div className="mb-8">
          <div className="w-14 h-14 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center text-3xl mb-4">
            📊
          </div>
          <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2">
            Z-Otchyot (Smena yopish)
          </h3>
          <p className="text-sm font-bold text-gray-500 leading-relaxed">
            Smenani yopish orqali siz barcha joriy tushumlarni va cheklarni arxivga o'tkazasiz. 
            Ertangi kun uchun kassa nollanadi va yangi hisobot boshlanadi.
          </p>
        </div>

        <button 
          onClick={onCloseShift}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white py-5 rounded-2xl font-black shadow-lg shadow-purple-600/30 transition-all active:scale-95 flex justify-center items-center gap-2 text-lg uppercase tracking-wider"
        >
          <span>Smenani Yopish</span> <span>🔒</span>
        </button>
        
      </div>

    </div>
  );
}