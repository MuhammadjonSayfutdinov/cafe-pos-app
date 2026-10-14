import React from 'react';

export default function StatsOverviewCards({ 
  totalRevenue, 
  totalOrdersCount, 
  totalServiceFee, 
  totalDiscount 
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
      
      {/* JAMI TUSHUM KARTASI */}
      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/20 p-6 rounded-3xl border border-emerald-200 dark:border-emerald-800/50 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
        <div className="absolute right-[-20px] top-[-20px] opacity-10 text-8xl group-hover:scale-110 transition-transform">💰</div>
        <p className="text-emerald-700 dark:text-emerald-400 text-xs md:text-sm font-black uppercase tracking-wider mb-2 relative z-10">
          Jami Tushum
        </p>
        <h2 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white relative z-10">
          {totalRevenue.toLocaleString()} <span className="text-xl text-emerald-600 dark:text-emerald-500">s</span>
        </h2>
      </div>
      
      {/* YOPILGAN CHEKLAR KARTASI */}
      <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/30 dark:to-indigo-800/20 p-6 rounded-3xl border border-indigo-200 dark:border-indigo-800/50 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
        <div className="absolute right-[-20px] top-[-20px] opacity-10 text-8xl group-hover:scale-110 transition-transform">🧾</div>
        <p className="text-indigo-700 dark:text-indigo-400 text-xs md:text-sm font-black uppercase tracking-wider mb-2 relative z-10">
          Yopilgan Cheklar
        </p>
        <h2 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white relative z-10">
          {totalOrdersCount} <span className="text-xl text-indigo-600 dark:text-indigo-500">ta</span>
        </h2>
      </div>
      
      {/* XIZMAT HAQI (FOYDA) KARTASI */}
      <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/20 p-6 rounded-3xl border border-amber-200 dark:border-amber-800/50 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
        <div className="absolute right-[-20px] top-[-20px] opacity-10 text-8xl group-hover:scale-110 transition-transform">🛎️</div>
        <p className="text-amber-700 dark:text-amber-400 text-xs md:text-sm font-black uppercase tracking-wider mb-2 relative z-10">
          Xizmat Haqi (+Foyda)
        </p>
        <h2 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white relative z-10">
          {totalServiceFee.toLocaleString()} <span className="text-xl text-amber-600 dark:text-amber-500">s</span>
        </h2>
      </div>
      
      {/* CHEGIRMALAR KARTASI */}
      <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/20 p-6 rounded-3xl border border-red-200 dark:border-red-800/50 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
        <div className="absolute right-[-20px] top-[-20px] opacity-10 text-8xl group-hover:scale-110 transition-transform">🎁</div>
        <p className="text-red-700 dark:text-red-400 text-xs md:text-sm font-black uppercase tracking-wider mb-2 relative z-10">
          Mijozlarga Chegirma
        </p>
        <h2 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white relative z-10">
          {totalDiscount.toLocaleString()} <span className="text-xl text-red-600 dark:text-red-500">s</span>
        </h2>
      </div>

    </div>
  );
}