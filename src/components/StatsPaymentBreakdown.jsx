import React from 'react';

export default function StatsPaymentBreakdown({ 
  paymentStats, 
  averageReceipt 
}) {
  // Barcha mavjud to'lov usullari ro'yxati
  const paymentMethodsList = [
    { name: 'Naqd', icon: '💵', color: 'text-emerald-500' },
    { name: 'Plastik', icon: '💳', color: 'text-indigo-500' },
    { name: 'Payme', icon: '📱', color: 'text-cyan-500' },
    { name: 'Click', icon: '📲', color: 'text-blue-500' },
    { name: 'Aralash', icon: '🔄', color: 'text-purple-500' },
    { name: 'Qarz', icon: '📝', color: 'text-orange-500' }
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6 mt-4 md:mt-6">
      
      {/* CHap tomon: To'lov turlari jadvali */}
      <div className="xl:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
        
        <div className="mb-6">
          <h3 className="text-lg md:text-xl font-black text-gray-900 dark:text-white">
            💳 To'lov Turlari Bo'yicha Taqsimot
          </h3>
          <p className="text-xs font-bold text-gray-500 mt-1">
            Qaysi usul orqali qancha pul kirganini nazorat qiling
          </p>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
          {paymentMethodsList.map(method => {
            const amount = paymentStats[method.name] || 0;
            return (
              <div 
                key={method.name} 
                className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{method.icon}</span>
                  <p className="text-xs font-black text-gray-500 uppercase tracking-wider">
                    {method.name}
                  </p>
                </div>
                <p className={`text-lg md:text-xl font-black ${method.color}`}>
                  {amount.toLocaleString()} <span className="text-sm font-bold text-gray-400">s</span>
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* O'ng tomon: O'rtacha chek */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-8 rounded-3xl shadow-lg text-white flex flex-col justify-center items-center text-center relative overflow-hidden group">
         <div className="absolute right-[-30px] bottom-[-30px] opacity-10 text-9xl group-hover:scale-110 transition-transform">📈</div>
         
         <div className="relative z-10">
           <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 backdrop-blur-sm">
             📊
           </div>
           <p className="text-indigo-100 font-bold uppercase tracking-widest mb-2 text-sm">
             O'rtacha Chek Summasi
           </p>
           <h2 className="text-4xl md:text-5xl font-black text-white drop-shadow-md">
             {averageReceipt.toLocaleString()} <span className="text-2xl font-bold opacity-80">s</span>
           </h2>
           <p className="text-xs font-medium text-indigo-200 mt-4 max-w-[250px] mx-auto">
             Bitta stoldan o'rtacha tushayotgan daromad ko'rsatkichi.
           </p>
         </div>
      </div>

    </div>
  );
}