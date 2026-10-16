import React from 'react';

export default function StatsOverviewCards({ 
  totalRevenue = 0, 
  totalFoodCost = 0,
  totalNetProfit,
  totalOrdersCount = 0, 
  totalServiceFee = 0, 
  totalDiscount = 0 
}) {
  // Xavfsiz raqamlar (Oq oyna va NaN xatosidan 100% himoya)
  const safeRevenue = Number(totalRevenue) || 0;
  const safeFoodCost = Number(totalFoodCost) || 0;
  const safeNetProfit = totalNetProfit !== undefined 
    ? (Number(totalNetProfit) || 0) 
    : (safeRevenue - safeFoodCost);
  const safeOrdersCount = Number(totalOrdersCount) || 0;
  const safeServiceFee = Number(totalServiceFee) || 0;
  const safeDiscount = Number(totalDiscount) || 0;

  // Analitik ko'rsatkichlar va foizlar
  const netFoodRevenue = Math.max(0, safeRevenue - safeServiceFee);
  const averageCheck = safeOrdersCount > 0 
    ? Math.round(safeRevenue / safeOrdersCount) 
    : 0;

  const foodCostPercent = safeRevenue > 0 
    ? ((safeFoodCost / safeRevenue) * 100).toFixed(1) 
    : '0.0';

  const netMarginPercent = safeRevenue > 0 
    ? ((safeNetProfit / safeRevenue) * 100).toFixed(1) 
    : '0.0';

  const serviceSharePercent = safeRevenue > 0 
    ? ((safeServiceFee / safeRevenue) * 100).toFixed(1) 
    : '0.0';

  const grossBeforeDiscount = safeRevenue + safeDiscount;
  const discountRatePercent = grossBeforeDiscount > 0 
    ? ((safeDiscount / grossBeforeDiscount) * 100).toFixed(1) 
    : '0.0';

  const profitPerOrder = safeOrdersCount > 0 
    ? Math.round(safeNetProfit / safeOrdersCount) 
    : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
      
      {/* 1. JAMI TUSHUM KARTASI */}
      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/80 dark:from-emerald-900/30 dark:to-emerald-800/20 p-6 rounded-3xl border border-emerald-200 dark:border-emerald-800/50 shadow-sm hover:shadow-md transition-all relative overflow-hidden group flex flex-col justify-between">
        <div className="absolute right-[-16px] top-[-16px] opacity-10 text-8xl group-hover:scale-110 transition-transform select-none pointer-events-none">
          💰
        </div>
        <div className="relative z-10">
          <p className="text-emerald-700 dark:text-emerald-400 text-xs font-black uppercase tracking-wider mb-2">
            1. Jami Kassaga Tushum
          </p>
          <h2 className="text-2xl sm:text-3xl xl:text-4xl font-black text-gray-900 dark:text-white tracking-tight break-words">
            {safeRevenue.toLocaleString()}{' '}
            <span className="text-base sm:text-lg text-emerald-600 dark:text-emerald-400 font-extrabold">
              s
            </span>
          </h2>
        </div>
        <div className="relative z-10 mt-4 pt-3 border-t border-emerald-200/60 dark:border-emerald-800/40 flex justify-between items-center text-xs font-bold text-emerald-800/80 dark:text-emerald-300/80">
          <span>🍔 Taomlar sotuvi (xizmat haqisiz):</span>
          <span className="font-black">{netFoodRevenue.toLocaleString()} s</span>
        </div>
      </div>

      {/* 2. SOTILGAN TAOMLAR TANNARXI (FOOD COST / COGS) */}
      <div className="bg-gradient-to-br from-orange-50 to-amber-100/80 dark:from-orange-900/30 dark:to-amber-800/20 p-6 rounded-3xl border border-orange-200 dark:border-orange-800/50 shadow-sm hover:shadow-md transition-all relative overflow-hidden group flex flex-col justify-between">
        <div className="absolute right-[-16px] top-[-16px] opacity-10 text-8xl group-hover:scale-110 transition-transform select-none pointer-events-none">
          🥩
        </div>
        <div className="relative z-10">
          <p className="text-orange-700 dark:text-orange-400 text-xs font-black uppercase tracking-wider mb-2">
            2. Xomashyo Tannarxi (Food Cost)
          </p>
          <h2 className="text-2xl sm:text-3xl xl:text-4xl font-black text-gray-900 dark:text-white tracking-tight break-words">
            {safeFoodCost.toLocaleString()}{' '}
            <span className="text-base sm:text-lg text-orange-600 dark:text-orange-400 font-extrabold">
              s
            </span>
          </h2>
        </div>
        <div className="relative z-10 mt-4 pt-3 border-t border-orange-200/60 dark:border-orange-800/40 flex justify-between items-center text-xs font-bold text-orange-800/80 dark:text-orange-300/80">
          <span>🧮 Tushumdagi xomashyo ulushi:</span>
          <span className="font-black">{foodCostPercent}%</span>
        </div>
      </div>

      {/* 3. HAQIQIY SOF FOYDA (TUSHUM MINUS TANNARX) */}
      <div className="bg-gradient-to-br from-teal-50 to-cyan-100/80 dark:from-teal-900/30 dark:to-cyan-800/20 p-6 rounded-3xl border border-teal-200 dark:border-teal-800/50 shadow-sm hover:shadow-md transition-all relative overflow-hidden group flex flex-col justify-between">
        <div className="absolute right-[-16px] top-[-16px] opacity-10 text-8xl group-hover:scale-110 transition-transform select-none pointer-events-none">
          💎
        </div>
        <div className="relative z-10">
          <p className="text-teal-700 dark:text-teal-400 text-xs font-black uppercase tracking-wider mb-2">
            3. Haqiqiy Sof Foyda (Marja)
          </p>
          <h2 className={`text-2xl sm:text-3xl xl:text-4xl font-black tracking-tight break-words ${
            safeNetProfit >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-600 dark:text-red-400'
          }`}>
            {safeNetProfit > 0 ? `+${safeNetProfit.toLocaleString()}` : safeNetProfit.toLocaleString()}{' '}
            <span className="text-base sm:text-lg text-teal-600 dark:text-teal-400 font-extrabold">
              s
            </span>
          </h2>
        </div>
        <div className="relative z-10 mt-4 pt-3 border-t border-teal-200/60 dark:border-teal-800/40 flex justify-between items-center text-xs font-bold text-teal-800/80 dark:text-teal-300/80">
          <span>📊 Rentabellik ({netMarginPercent}%):</span>
          <span className="font-black">1 chekdan: +{profitPerOrder.toLocaleString()} s</span>
        </div>
      </div>
      
      {/* 4. YOPILGAN CHEKLAR KARTASI */}
      <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/80 dark:from-indigo-900/30 dark:to-indigo-800/20 p-6 rounded-3xl border border-indigo-200 dark:border-indigo-800/50 shadow-sm hover:shadow-md transition-all relative overflow-hidden group flex flex-col justify-between">
        <div className="absolute right-[-16px] top-[-16px] opacity-10 text-8xl group-hover:scale-110 transition-transform select-none pointer-events-none">
          🧾
        </div>
        <div className="relative z-10">
          <p className="text-indigo-700 dark:text-indigo-400 text-xs font-black uppercase tracking-wider mb-2">
            4. Yopilgan Cheklar Soni
          </p>
          <h2 className="text-2xl sm:text-3xl xl:text-4xl font-black text-gray-900 dark:text-white tracking-tight">
            {safeOrdersCount.toLocaleString()}{' '}
            <span className="text-base sm:text-lg text-indigo-600 dark:text-indigo-400 font-extrabold">
              ta
            </span>
          </h2>
        </div>
        <div className="relative z-10 mt-4 pt-3 border-t border-indigo-200/60 dark:border-indigo-800/40 flex justify-between items-center text-xs font-bold text-indigo-800/80 dark:text-indigo-300/80">
          <span>📈 O'rtacha chek summasi:</span>
          <span className="font-black">{averageCheck.toLocaleString()} s</span>
        </div>
      </div>
      
      {/* 5. XIZMAT HAQI (+FOYDA) KARTASI */}
      <div className="bg-gradient-to-br from-amber-50 to-amber-100/80 dark:from-amber-900/30 dark:to-amber-800/20 p-6 rounded-3xl border border-amber-200 dark:border-amber-800/50 shadow-sm hover:shadow-md transition-all relative overflow-hidden group flex flex-col justify-between">
        <div className="absolute right-[-16px] top-[-16px] opacity-10 text-8xl group-hover:scale-110 transition-transform select-none pointer-events-none">
          🛎️
        </div>
        <div className="relative z-10">
          <p className="text-amber-700 dark:text-amber-400 text-xs font-black uppercase tracking-wider mb-2">
            5. Xizmat Haqi (+Qo'shimcha)
          </p>
          <h2 className="text-2xl sm:text-3xl xl:text-4xl font-black text-gray-900 dark:text-white tracking-tight break-words">
            {safeServiceFee.toLocaleString()}{' '}
            <span className="text-base sm:text-lg text-amber-600 dark:text-amber-400 font-extrabold">
              s
            </span>
          </h2>
        </div>
        <div className="relative z-10 mt-4 pt-3 border-t border-amber-200/60 dark:border-amber-800/40 flex justify-between items-center text-xs font-bold text-amber-800/80 dark:text-amber-300/80">
          <span>👨‍🍳 Jami tushumdagi ulushi:</span>
          <span className="font-black">{serviceSharePercent}%</span>
        </div>
      </div>
      
      {/* 6. CHEGIRMALAR KARTASI */}
      <div className="bg-gradient-to-br from-red-50 to-red-100/80 dark:from-red-900/30 dark:to-red-800/20 p-6 rounded-3xl border border-red-200 dark:border-red-800/50 shadow-sm hover:shadow-md transition-all relative overflow-hidden group flex flex-col justify-between">
        <div className="absolute right-[-16px] top-[-16px] opacity-10 text-8xl group-hover:scale-110 transition-transform select-none pointer-events-none">
          🎁
        </div>
        <div className="relative z-10">
          <p className="text-red-700 dark:text-red-400 text-xs font-black uppercase tracking-wider mb-2">
            6. Mijozlarga Chegirma
          </p>
          <h2 className="text-2xl sm:text-3xl xl:text-4xl font-black text-gray-900 dark:text-white tracking-tight break-words">
            {safeDiscount.toLocaleString()}{' '}
            <span className="text-base sm:text-lg text-red-600 dark:text-red-400 font-extrabold">
              s
            </span>
          </h2>
        </div>
        <div className="relative z-10 mt-4 pt-3 border-t border-red-200/60 dark:border-red-800/40 flex justify-between items-center text-xs font-bold text-red-800/80 dark:text-red-300/80">
          <span>🏷️ Chegirma darajasi:</span>
          <span className="font-black">{discountRatePercent}%</span>
        </div>
      </div>

    </div>
  );
}