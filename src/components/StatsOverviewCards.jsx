import React from 'react';

export default function StatsOverviewCards({ 
  totalRevenue = 0, 
  totalFoodCost = 0,
  totalNetProfit,
  totalOrdersCount = 0, 
  totalServiceFee = 0, 
  totalDiscount = 0 
}) {
  const safeRevenue = Number(totalRevenue) || 0;
  const safeFoodCost = Number(totalFoodCost) || 0;
  const safeNetProfit = totalNetProfit !== undefined 
    ? Number(totalNetProfit) || 0 
    : (safeRevenue - safeFoodCost);
  const safeOrdersCount = Number(totalOrdersCount) || 0;
  const safeServiceFee = Number(totalServiceFee) || 0;
  const safeDiscount = Number(totalDiscount) || 0;

  const foodCostPercent = safeRevenue > 0 
    ? ((safeFoodCost / safeRevenue) * 100).toFixed(1) 
    : '0.0';
  const netMarginPercent = safeRevenue > 0 
    ? ((safeNetProfit / safeRevenue) * 100).toFixed(1) 
    : '0.0';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
      
      {/* 1. JAMI SAVDO TUSHUMI */}
      <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/80 dark:from-indigo-900/30 dark:to-indigo-800/20 p-6 rounded-3xl border border-indigo-200 dark:border-indigo-800/50 shadow-sm hover:shadow-md transition-all relative overflow-hidden group flex flex-col justify-between">
        <div className="absolute right-[-16px] top-[-16px] opacity-10 text-8xl group-hover:scale-110 transition-transform select-none pointer-events-none">
          🧾
        </div>
        <div className="relative z-10">
          <p className="text-indigo-700 dark:text-indigo-400 text-xs font-black uppercase tracking-wider mb-2">
            Jami Savdo Tushumi
          </p>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight break-words">
            {safeRevenue.toLocaleString()}{' '}
            <span className="text-base text-indigo-600 dark:text-indigo-400 font-extrabold">s</span>
          </h2>
        </div>
        <div className="relative z-10 mt-4 pt-3 border-t border-indigo-200/60 dark:border-indigo-800/40 flex justify-between items-center text-xs font-bold text-indigo-800/80 dark:text-indigo-300/80">
          <span>Yopilgan cheklar:</span>
          <span className="font-black">{safeOrdersCount} ta</span>
        </div>
      </div>

      {/* 2. SOTILGAN TAOMLAR TANNARXI (FOOD COST / COGS) */}
      <div className="bg-gradient-to-br from-amber-50 to-amber-100/80 dark:from-amber-900/30 dark:to-amber-800/20 p-6 rounded-3xl border border-amber-200 dark:border-amber-800/50 shadow-sm hover:shadow-md transition-all relative overflow-hidden group flex flex-col justify-between">
        <div className="absolute right-[-16px] top-[-16px] opacity-10 text-8xl group-hover:scale-110 transition-transform select-none pointer-events-none">
          🥩
        </div>
        <div className="relative z-10">
          <p className="text-amber-700 dark:text-amber-400 text-xs font-black uppercase tracking-wider mb-2">
            Xomashyo Tannarxi (COGS)
          </p>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight break-words">
            {safeFoodCost.toLocaleString()}{' '}
            <span className="text-base text-amber-600 dark:text-amber-400 font-extrabold">s</span>
          </h2>
        </div>
        <div className="relative z-10 mt-4 pt-3 border-t border-amber-200/60 dark:border-amber-800/40 flex justify-between items-center text-xs font-bold text-amber-800/80 dark:text-amber-300/80">
          <span>🧮 Food Cost ko'rsatkichi:</span>
          <span className="font-black">{foodCostPercent}%</span>
        </div>
      </div>

      {/* 3. HAQIQIY SOF FOYDA (TUSHUM MINUS TANNARX) */}
      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/80 dark:from-emerald-900/30 dark:to-emerald-800/20 p-6 rounded-3xl border border-emerald-200 dark:border-emerald-800/50 shadow-sm hover:shadow-md transition-all relative overflow-hidden group flex flex-col justify-between">
        <div className="absolute right-[-16px] top-[-16px] opacity-10 text-8xl group-hover:scale-110 transition-transform select-none pointer-events-none">
          💰
        </div>
        <div className="relative z-10">
          <p className="text-emerald-700 dark:text-emerald-400 text-xs font-black uppercase tracking-wider mb-2">
            Haqiqiy Sof Foyda (Marja)
          </p>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight break-words">
            {safeNetProfit.toLocaleString()}{' '}
            <span className="text-base text-emerald-600 dark:text-emerald-400 font-extrabold">s</span>
          </h2>
        </div>
        <div className="relative z-10 mt-4 pt-3 border-t border-emerald-200/60 dark:border-emerald-800/40 flex justify-between items-center text-xs font-bold text-emerald-800/80 dark:text-emerald-300/80">
          <span>📈 Rentabellik ({netMarginPercent}%):</span>
          <span className="font-black">Xizmat: +{safeServiceFee.toLocaleString()} s</span>
        </div>
      </div>
      
      {/* 4. CHEGIRMALAR KARTASI */}
      <div className="bg-gradient-to-br from-red-50 to-red-100/80 dark:from-red-900/30 dark:to-red-800/20 p-6 rounded-3xl border border-red-200 dark:border-red-800/50 shadow-sm hover:shadow-md transition-all relative overflow-hidden group flex flex-col justify-between">
        <div className="absolute right-[-16px] top-[-16px] opacity-10 text-8xl group-hover:scale-110 transition-transform select-none pointer-events-none">
          🎁
        </div>
        <div className="relative z-10">
          <p className="text-red-700 dark:text-red-400 text-xs font-black uppercase tracking-wider mb-2">
            Mijozlarga Chegirma
          </p>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight break-words">
            {safeDiscount.toLocaleString()}{' '}
            <span className="text-base text-red-600 dark:text-red-400 font-extrabold">s</span>
          </h2>
        </div>
        <div className="relative z-10 mt-4 pt-3 border-t border-red-200/60 dark:border-red-800/40 flex justify-between items-center text-xs font-bold text-red-800/80 dark:text-red-300/80">
          <span>🏷️ Jami berilgan skidka</span>
          <span className="font-black">Nazorat ostida</span>
        </div>
      </div>

    </div>
  );
}