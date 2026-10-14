import React from 'react';

export default function AdminDashboard({ orders = [] }) {
  const safeOrders = Array.isArray(orders) ? orders : [];
  const completedOrders = safeOrders.filter(o => o?.status === 'To\'langan');
  
  const totalRevenue = completedOrders.reduce((sum, order) => sum + (Number(order?.finalTotal) || 0), 0);
  const totalDiscount = completedOrders.reduce((sum, order) => sum + (Number(order?.discountAmount) || 0), 0);
  const totalServiceFee = completedOrders.reduce((sum, order) => sum + (Number(order?.serviceFeeAmount) || 0), 0);
  const totalOrdersCount = completedOrders.length;
  const averageReceipt = totalOrdersCount > 0 ? Math.round(totalRevenue / totalOrdersCount) : 0;
  
  // To'lov statlarini yig'ish
  const paymentStats = completedOrders.reduce((acc, order) => {
    const method = order?.paymentMethod || 'Naqd';
    acc[method] = (acc[method] || 0) + (Number(order?.finalTotal) || 0);
    return acc;
  }, {});

  const itemsStats = {};
  completedOrders.forEach(order => {
    if (Array.isArray(order?.items)) {
      order.items.forEach(item => {
        if (!itemsStats[item.name]) {
          itemsStats[item.name] = { count: 0, revenue: 0 };
        }
        itemsStats[item.name].count += (Number(item.quantity) || 0);
        itemsStats[item.name].revenue += ((Number(item.price) || 0) * (Number(item.quantity) || 0));
      });
    }
  });
  
  const popularItems = Object.entries(itemsStats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5); 

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* KPI Kartochkalar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-6 rounded-3xl border border-emerald-100 dark:border-emerald-800/50 shadow-sm">
          <p className="text-emerald-600 dark:text-emerald-400 text-sm font-bold uppercase mb-1">Jami Tushum</p>
          <h2 className="text-3xl font-black text-gray-900 dark:text-white">{totalRevenue.toLocaleString()} <span className="text-lg">s</span></h2>
        </div>
        
        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-6 rounded-3xl border border-indigo-100 dark:border-indigo-800/50 shadow-sm">
          <p className="text-indigo-600 dark:text-indigo-400 text-sm font-bold uppercase mb-1">Yopilgan Cheklar</p>
          <h2 className="text-3xl font-black text-gray-900 dark:text-white">{totalOrdersCount} <span className="text-lg">ta</span></h2>
        </div>
        
        <div className="bg-amber-50 dark:bg-amber-900/20 p-6 rounded-3xl border border-amber-100 dark:border-amber-800/50 shadow-sm">
          <p className="text-amber-600 dark:text-amber-400 text-sm font-bold uppercase mb-1">Xizmat Haqi (Foyda)</p>
          <h2 className="text-3xl font-black text-gray-900 dark:text-white">{totalServiceFee.toLocaleString()} <span className="text-lg">s</span></h2>
        </div>
        
        <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-3xl border border-red-100 dark:border-red-800/50 shadow-sm">
          <p className="text-red-600 dark:text-red-400 text-sm font-bold uppercase mb-1">Mijozlarga Chegirma</p>
          <h2 className="text-3xl font-black text-gray-900 dark:text-white">{totalDiscount.toLocaleString()} <span className="text-lg">s</span></h2>
        </div>
      </div>

      {/* To'lov Turlari va O'rtacha Chek */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-black text-gray-800 dark:text-gray-100 mb-4">💳 To'lov turlari bo'yicha tushum</h3>
          
          {/* YANGILIK: 6 ta to'lov turi uchun grid-cols moslandi */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {['Naqd', 'Plastik', 'Payme', 'Click', 'Aralash', 'Qarz'].map(method => (
              <div 
                key={method} 
                className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700"
              >
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{method}</p>
                <p className="text-lg font-black text-gray-800 dark:text-gray-200 mt-1">
                  {(paymentStats[method] || 0).toLocaleString()} 
                </p>
              </div>
            ))}
          </div>

        </div>

        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 rounded-3xl shadow-md text-white flex flex-col justify-center items-center text-center">
           <p className="text-indigo-100 font-bold uppercase tracking-wider mb-2">O'rtacha Chek Summasi</p>
           <h2 className="text-4xl font-black">{averageReceipt.toLocaleString()} s</h2>
        </div>
      </div>

      {/* Top Taomlar */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="text-lg font-black text-gray-800 dark:text-gray-100 mb-4">🔥 Top-5 Eng Ko'p Sotilgan Taomlar</h3>
        {popularItems.length === 0 ? (
          <div className="text-center py-10 text-gray-400 font-bold">Hali hech narsa sotilmagan.</div>
        ) : (
          <div className="space-y-3">
            {popularItems.map(([name, stats], index) => (
              <div 
                key={name} 
                className="flex justify-between items-center p-3 rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 flex items-center justify-center rounded-full font-black text-sm ${
                    index === 0 ? 'bg-amber-400 text-white shadow-md' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}>
                    #{index + 1}
                  </span>
                  <span className="font-bold text-gray-800 dark:text-gray-200">{name}</span>
                </div>
                <div className="text-right">
                  <p className="font-black text-indigo-600 dark:text-indigo-400">{stats.count} ta sotildi</p>
                  <p className="text-[10px] font-bold text-gray-500">{stats.revenue.toLocaleString()} so'm</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
    </div>
  );
}