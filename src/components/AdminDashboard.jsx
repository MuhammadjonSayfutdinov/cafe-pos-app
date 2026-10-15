import React, { useState, useMemo } from 'react';

export default function AdminDashboard({ 
  orders = [],
  menuItems = [],
  users = [],
  tables = [],
  inventory = [],
  auditLogs = [],
  onNavigateTab
}) {
  // ==========================================
  // 1. STATE VA XAVFSIZ MA'LUMOTLAR
  // ==========================================
  const [periodFilter, setPeriodFilter] = useState('all'); // 'today' | 'all'

  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeMenu = Array.isArray(menuItems) ? menuItems : [];
  const safeInventory = Array.isArray(inventory) ? inventory : [];

  const todayDateStr = new Date().toLocaleDateString();

  // Chek summasini xavfsiz olish (finalTotal -> total -> subtotal)
  const getOrderAmount = (order) => {
    if (!order) return 0;
    const raw = order.finalTotal ?? order.total ?? order.subtotal ?? 0;
    return Number(raw) || 0;
  };

  // Xizmat haqini xavfsiz olish
  const getOrderServiceFee = (order) => {
    if (!order) return 0;
    if (order.serviceFeeAmount !== undefined) {
      return Number(order.serviceFeeAmount) || 0;
    }
    const sub = Number(order.subtotal || 0);
    const feePct = Number(order.serviceFee || 0);
    return Math.round((sub * feePct) / 100);
  };

  // Chegirma summasini xavfsiz olish
  const getOrderDiscount = (order) => {
    if (!order) return 0;
    return Number(order.discountAmount ?? order.discount ?? 0) || 0;
  };

  // ==========================================
  // 2. DAVR BO'YICHA FILTRLASH (BUGUN / BARCHASI)
  // ==========================================
  const periodOrders = useMemo(() => {
    if (periodFilter === 'today') {
      return safeOrders.filter(o => o && (!o.date || o.date === todayDateStr));
    }
    return safeOrders;
  }, [safeOrders, periodFilter, todayDateStr]);

  // To'langan cheklar, Qarz cheklar va Hozirgi faol (ochiq) cheklar
  const completedOrders = useMemo(() => {
    return periodOrders.filter(o => o?.status === "To'langan");
  }, [periodOrders]);

  const debtOrders = useMemo(() => {
    return periodOrders.filter(
      o => o?.status === 'Qarz' || o?.paymentMethod === 'Qarz'
    );
  }, [periodOrders]);

  const activeOpenOrders = useMemo(() => {
    return safeOrders.filter(
      o => o && o.status !== "To'langan" && o.status !== 'Qarz'
    );
  }, [safeOrders]);

  // ==========================================
  // 3. ASOSIY MOLIYA KO'RSATKICHLARI (KPI)
  // ==========================================
  const totalRevenue = useMemo(() => {
    return completedOrders.reduce((sum, order) => sum + getOrderAmount(order), 0);
  }, [completedOrders]);

  const totalDebtAmount = useMemo(() => {
    return debtOrders.reduce((sum, order) => sum + getOrderAmount(order), 0);
  }, [debtOrders]);

  const activeTablesRevenue = useMemo(() => {
    return activeOpenOrders.reduce((sum, order) => sum + getOrderAmount(order), 0);
  }, [activeOpenOrders]);

  const totalDiscount = useMemo(() => {
    return [...completedOrders, ...debtOrders].reduce(
      (sum, order) => sum + getOrderDiscount(order), 
      0
    );
  }, [completedOrders, debtOrders]);

  const totalServiceFee = useMemo(() => {
    return completedOrders.reduce(
      (sum, order) => sum + getOrderServiceFee(order), 
      0
    );
  }, [completedOrders]);

  const totalOrdersCount = completedOrders.length;
  const averageReceipt = totalOrdersCount > 0 ? Math.round(totalRevenue / totalOrdersCount) : 0;

  // ==========================================
  // 4. TO'LOV TURLARI BO'YICHA TUSHUM (6 XIL USUL)
  // ==========================================
  const paymentStats = useMemo(() => {
    const stats = {
      Naqd: 0,
      Plastik: 0,
      Payme: 0,
      Click: 0,
      Aralash: 0,
      Qarz: totalDebtAmount
    };

    completedOrders.forEach(order => {
      const method = order?.paymentMethod || 'Naqd';
      const amount = getOrderAmount(order);

      // Agar aralash to'lov tafsilotlari bo'lsa (splitPayment / mixedDetails)
      if (method === 'Aralash' && order?.mixedDetails) {
        stats.Aralash += amount;
      } else if (stats[method] !== undefined) {
        stats[method] += amount;
      } else {
        stats[method] = (stats[method] || 0) + amount;
      }
    });

    return stats;
  }, [completedOrders, totalDebtAmount]);

  // ==========================================
  // 5. TOP-5 TAOMLAR VA OFITSIANTLAR REYTINGI
  // ==========================================
  const popularItems = useMemo(() => {
    const itemsStats = {};
    [...completedOrders, ...debtOrders].forEach(order => {
      if (Array.isArray(order?.items)) {
        order.items.forEach(item => {
          if (!item?.name) return;
          const qty = Number(item.quantity ?? item.qty ?? 1) || 0;
          const price = Number(item.price ?? item.variants?.[0]?.price ?? 0) || 0;

          if (!itemsStats[item.name]) {
            itemsStats[item.name] = { count: 0, revenue: 0 };
          }
          itemsStats[item.name].count += qty;
          itemsStats[item.name].revenue += price * qty;
        });
      }
    });

    return Object.entries(itemsStats)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);
  }, [completedOrders, debtOrders]);

  const waiterRanking = useMemo(() => {
    const waiterMap = {};
    completedOrders.forEach(order => {
      const wName = order?.waiter || "Noma'lum";
      if (!waiterMap[wName]) {
        waiterMap[wName] = { ordersCount: 0, revenue: 0 };
      }
      waiterMap[wName].ordersCount += 1;
      waiterMap[wName].revenue += getOrderAmount(order);
    });

    return Object.entries(waiterMap)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5);
  }, [completedOrders]);

  // Stop-listdagi taomlar va kam qolgan ombor mahsulotlari
  const stopListItemsCount = safeMenu.filter(m => m?.is_available === false).length;
  const lowStockCount = safeInventory.filter(
    i => Number(i?.quantity ?? i?.qty ?? 0) <= Number(i?.minLimit ?? 5)
  ).length;

  // ==========================================
  // 6. RENDER (UI DIZAYN)
  // ==========================================
  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* YUQORI PANEL: SARLAVHA VA VAQT FILTRI */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
        <div>
          <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span>📊</span> Restoran Moliyaviy Ko'rsatkichlari
          </h2>
          <p className="text-xs font-bold text-gray-500 mt-0.5">
            Jonli tushum, to'lov turlari, eng xaridorgir taomlar va zal holati
          </p>
        </div>

        <div className="flex bg-white dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setPeriodFilter('today')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-black transition ${
              periodFilter === 'today'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            📅 Bugungi ({todayDateStr})
          </button>
          <button
            type="button"
            onClick={() => setPeriodFilter('all')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-black transition ${
              periodFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            🗂 Barcha vaqt
          </button>
        </div>
      </div>

      {/* 1-QATOR: ASOSIY KPI KARTOCHKALAR */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-6 rounded-3xl border border-emerald-100 dark:border-emerald-800/50 shadow-sm">
          <p className="text-emerald-600 dark:text-emerald-400 text-xs font-black uppercase tracking-wider mb-1">
            💰 Jami Sof Tushum
          </p>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
            {totalRevenue.toLocaleString()} <span className="text-base">s</span>
          </h2>
          <p className="text-[11px] font-bold text-emerald-700/70 dark:text-emerald-300/70 mt-2">
            Yopilgan cheklar bo'yicha
          </p>
        </div>
        
        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-6 rounded-3xl border border-indigo-100 dark:border-indigo-800/50 shadow-sm">
          <p className="text-indigo-600 dark:text-indigo-400 text-xs font-black uppercase tracking-wider mb-1">
            🧾 Yopilgan Cheklar
          </p>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
            {totalOrdersCount} <span className="text-base">ta</span>
          </h2>
          <p className="text-[11px] font-bold text-indigo-700/70 dark:text-indigo-300/70 mt-2">
            Hozir zalda faol: {activeOpenOrders.length} ta stol
          </p>
        </div>
        
        <div className="bg-amber-50 dark:bg-amber-900/20 p-6 rounded-3xl border border-amber-100 dark:border-amber-800/50 shadow-sm">
          <p className="text-amber-600 dark:text-amber-400 text-xs font-black uppercase tracking-wider mb-1">
            👨‍🍳 Xizmat Haqi (Foyda)
          </p>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
            {totalServiceFee.toLocaleString()} <span className="text-base">s</span>
          </h2>
          <p className="text-[11px] font-bold text-amber-700/70 dark:text-amber-300/70 mt-2">
            Ofitsiant xizmati ulushi
          </p>
        </div>
        
        <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-3xl border border-red-100 dark:border-red-800/50 shadow-sm">
          <p className="text-red-600 dark:text-red-400 text-xs font-black uppercase tracking-wider mb-1">
            🎁 Chegirma va Nasiya
          </p>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
            {totalDiscount.toLocaleString()} <span className="text-base">s</span>
          </h2>
          <p className="text-[11px] font-bold text-red-700/70 dark:text-red-300/70 mt-2">
            Qarzga yopilgan: {totalDebtAmount.toLocaleString()} s
          </p>
        </div>
      </div>

      {/* 2-QATOR: JONLI ZAL HOLATI VA TEZKOR OGOHLANTIRISHLAR */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase text-gray-400">🍽️ Hozir stollardagi ochiq cheklar</p>
            <p className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-0.5">
              {activeTablesRevenue.toLocaleString()} so'm ({activeOpenOrders.length} ta stol)
            </p>
          </div>
          <span className="text-2xl">⏳</span>
        </div>

        <div 
          onClick={() => typeof onNavigateTab === 'function' && onNavigateTab('menu')}
          className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 flex items-center justify-between cursor-pointer hover:border-amber-400 transition"
        >
          <div>
            <p className="text-[11px] font-black uppercase text-gray-400">🔴 Stop-Listdagi taomlar</p>
            <p className={`text-lg font-black mt-0.5 ${stopListItemsCount > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
              {stopListItemsCount > 0 ? `${stopListItemsCount} ta taom tugagan` : 'Barcha taomlar sotuvda'}
            </p>
          </div>
          <span className="text-2xl">🍔</span>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase text-gray-400">📦 Ombor ogohlantirishi</p>
            <p className={`text-lg font-black mt-0.5 ${lowStockCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {lowStockCount > 0 ? `${lowStockCount} xil mahsulot kam qoldi` : 'Ombor qoldig\'i yetarli'}
            </p>
          </div>
          <span className="text-2xl">📦</span>
        </div>
      </div>

      {/* 3-QATOR: TO'LOV TURLARI VA O'RTACHA CHEK */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-black text-gray-800 dark:text-gray-100 mb-4">
            💳 To'lov turlari bo'yicha tushum
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {['Naqd', 'Plastik', 'Payme', 'Click', 'Aralash', 'Qarz'].map(method => {
              const amount = paymentStats[method] || 0;
              const isDebt = method === 'Qarz';
              return (
                <div 
                  key={method} 
                  className={`p-4 rounded-2xl border ${
                    isDebt && amount > 0
                      ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50'
                      : 'bg-gray-50 dark:bg-gray-900/50 border-gray-100 dark:border-gray-700'
                  }`}
                >
                  <p className={`text-[10px] font-black uppercase tracking-wider ${
                    isDebt ? 'text-red-500' : 'text-gray-500'
                  }`}>
                    {method}
                  </p>
                  <p className="text-base sm:text-lg font-black text-gray-900 dark:text-gray-100 mt-1">
                    {amount.toLocaleString()} <span className="text-xs font-bold">s</span>
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 rounded-3xl shadow-md text-white flex flex-col justify-center items-center text-center">
          <p className="text-indigo-100 text-xs font-black uppercase tracking-wider mb-2">
            📈 O'rtacha Chek Summasi
          </p>
          <h2 className="text-3xl sm:text-4xl font-black">
            {averageReceipt.toLocaleString()} s
          </h2>
          <p className="text-xs font-bold text-indigo-100/80 mt-2">
            Har bir stolning o'rtacha xarajati
          </p>
        </div>
      </div>

      {/* 4-QATOR: TOP-5 TAOMLAR VA TOP OFITSIANTLAR */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Top-5 Taomlar */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-black text-gray-800 dark:text-gray-100 mb-4">
            🔥 Top-5 Eng Ko'p Sotilgan Taomlar
          </h3>
          {popularItems.length === 0 ? (
            <div className="text-center py-10 text-gray-400 font-bold text-sm">
              Hali hech narsa sotilmagan.
            </div>
          ) : (
            <div className="space-y-3">
              {popularItems.map(([name, stats], index) => (
                <div 
                  key={name} 
                  className="flex justify-between items-center p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-8 h-8 flex items-center justify-center rounded-full font-black text-xs ${
                      index === 0 
                        ? 'bg-amber-400 text-white shadow-md' 
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}>
                      #{index + 1}
                    </span>
                    <span className="font-bold text-sm text-gray-800 dark:text-gray-200">
                      {name}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-sm text-indigo-600 dark:text-indigo-400">
                      {stats.count} porsiya
                    </p>
                    <p className="text-[11px] font-bold text-gray-500">
                      {stats.revenue.toLocaleString()} so'm
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Ofitsiantlar va Xizmat Kanallari */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-black text-gray-800 dark:text-gray-100 mb-4">
            🏆 Faol Ofitsiantlar va Savdo Kanallari
          </h3>
          {waiterRanking.length === 0 ? (
            <div className="text-center py-10 text-gray-400 font-bold text-sm">
              Yopilgan cheklar hali mavjud emas.
            </div>
          ) : (
            <div className="space-y-3">
              {waiterRanking.map(([waiterName, wStats], idx) => (
                <div
                  key={waiterName}
                  className="flex justify-between items-center p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-8 h-8 flex items-center justify-center rounded-full font-black text-xs ${
                      idx === 0
                        ? 'bg-emerald-500 text-white shadow-md'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}>
                      {idx === 0 ? '👑' : `#${idx + 1}`}
                    </span>
                    <div>
                      <p className="font-bold text-sm text-gray-800 dark:text-gray-200">
                        {waiterName}
                      </p>
                      <p className="text-[11px] font-bold text-gray-400">
                        {wStats.ordersCount} ta yopilgan chek
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-sm text-emerald-600 dark:text-emerald-400">
                      {wStats.revenue.toLocaleString()} so'm
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
      
    </div>
  );
}