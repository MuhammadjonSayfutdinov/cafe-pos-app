import React from 'react';

export default function StatsPaymentBreakdown({ 
  paymentStats = {}, 
  averageReceipt = 0 
}) {
  const safeStats = paymentStats && typeof paymentStats === 'object' ? paymentStats : {};
  const safeAverage = Number(averageReceipt) || 0;

  // Barcha mavjud to'lov usullari ro'yxati
  const paymentMethodsList = [
    { name: 'Naqd', icon: '💵', color: 'text-emerald-600 dark:text-emerald-400', barColor: 'bg-emerald-500' },
    { name: 'Plastik', icon: '💳', color: 'text-indigo-600 dark:text-indigo-400', barColor: 'bg-indigo-500' },
    { name: 'Payme', icon: '📱', color: 'text-cyan-600 dark:text-cyan-400', barColor: 'bg-cyan-500' },
    { name: 'Click', icon: '📲', color: 'text-blue-600 dark:text-blue-400', barColor: 'bg-blue-500' },
    { name: 'Aralash', icon: '🔄', color: 'text-purple-600 dark:text-purple-400', barColor: 'bg-purple-500' },
    { name: 'Qarz', icon: '📝', color: 'text-orange-600 dark:text-orange-400', barColor: 'bg-orange-500' }
  ];

  // Umumiy aylanma va guruhlangan summalar
  const totalAllMethods = paymentMethodsList.reduce(
    (sum, m) => sum + (Number(safeStats[m.name]) || 0),
    0
  );

  const cashTotal = Number(safeStats['Naqd']) || 0;
  const digitalTotal = 
    (Number(safeStats['Plastik']) || 0) + 
    (Number(safeStats['Payme']) || 0) + 
    (Number(safeStats['Click']) || 0);
  const mixedTotal = Number(safeStats['Aralash']) || 0;
  const debtTotal = Number(safeStats['Qarz']) || 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6 mt-4 md:mt-6">
      
      {/* CHAP TOMON: To'lov turlari jadvali */}
      <div className="xl:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between space-y-5">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h3 className="text-lg md:text-xl font-black text-gray-900 dark:text-white">
              💳 To'lov Turlari Bo'yicha Taqsimot
            </h3>
            <p className="text-xs font-bold text-gray-500 mt-1">
              Qaysi usul orqali qancha pul kirganini va ulushini nazorat qiling
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-black">
            <span className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50">
              💵 Naqd: {cashTotal.toLocaleString()} s
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50">
              🏦 Elektron: {digitalTotal.toLocaleString()} s
            </span>
          </div>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
          {paymentMethodsList.map((method) => {
            const amount = Number(safeStats[method.name]) || 0;
            const sharePercent = totalAllMethods > 0 
              ? Math.round((amount / totalAllMethods) * 100) 
              : 0;
            const isDebt = method.name === 'Qarz';

            return (
              <div 
                key={method.name} 
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                  isDebt && amount > 0
                    ? 'bg-orange-50/60 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800/60'
                    : 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{method.icon}</span>
                      <p className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {method.name}
                      </p>
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-white dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700">
                      {sharePercent}%
                    </span>
                  </div>

                  <p className={`text-lg md:text-xl font-black break-words ${method.color}`}>
                    {amount.toLocaleString()}{' '}
                    <span className="text-xs font-bold text-gray-400">s</span>
                  </p>
                </div>

                {/* Ulush indikatori (Progress Bar) */}
                <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mt-3">
                  <div 
                    className={`h-full ${method.barColor} transition-all duration-500`}
                    style={{ width: `${Math.min(100, sharePercent)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Pastki qisqa xulosa */}
        {(mixedTotal > 0 || debtTotal > 0) && (
          <div className="pt-3 border-t border-gray-100 dark:border-gray-700 flex flex-wrap justify-between items-center gap-2 text-xs font-bold text-gray-500">
            <span>🔄 Aralash to'lovlar: <strong className="text-purple-600 dark:text-purple-400">{mixedTotal.toLocaleString()} s</strong></span>
            <span>📝 Kutilayotgan qarzlar: <strong className="text-orange-600 dark:text-orange-400">{debtTotal.toLocaleString()} s</strong></span>
          </div>
        )}
      </div>

      {/* O'NG TOMON: O'rtacha chek */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-8 rounded-3xl shadow-lg text-white flex flex-col justify-center items-center text-center relative overflow-hidden group">
        <div className="absolute right-[-30px] bottom-[-30px] opacity-10 text-9xl group-hover:scale-110 transition-transform select-none pointer-events-none">
          📈
        </div>
        
        <div className="relative z-10 w-full">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 backdrop-blur-sm shadow-inner">
            📊
          </div>
          <p className="text-indigo-100 font-black uppercase tracking-widest mb-2 text-xs sm:text-sm">
            O'rtacha Chek Summasi
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white drop-shadow-md break-words">
            {safeAverage.toLocaleString()}{' '}
            <span className="text-xl sm:text-2xl font-bold opacity-80">s</span>
          </h2>
          <p className="text-xs font-bold text-indigo-100/90 mt-4 max-w-[260px] mx-auto leading-relaxed">
            Har bir yopilgan buyurtmadan restoranga tushayotgan o'rtacha daromad ko'rsatkichi.
          </p>
        </div>
      </div>

    </div>
  );
}