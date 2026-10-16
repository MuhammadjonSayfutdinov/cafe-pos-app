import React, { useState, useMemo } from 'react';
import useSticky from '../hooks/useSticky';
import StatsOverviewCards from './StatsOverviewCards';
import StatsPaymentBreakdown from './StatsPaymentBreakdown';
import StatsPopularItems from './StatsPopularItems';

export default function StatsMode({ 
  orders, 
  setOrders, 
  currentUser,
  auditLogs,
  setAuditLogs,
  addAuditLog
}) {
  // ===============================================
  // 1. ZAXIRA XOTIRA VA STATE'LAR (FALLBACK SYNC)
  // ===============================================
  // Agar App.jsx dan setOrders uzatilmagan bo'lsa, bevosita useSticky orqali bazani boshqaramiz
  const [stickyOrders, setStickyOrders] = useSticky('pos_orders', []);
  const [, setStickyAuditLogs] = useSticky('pos_audit_logs', []);

  // Ko'rish rejimi: 'current' (Joriy smena) | 'archived' (Arxiv) | 'all' (Barcha vaqt)
  const [viewScope, setViewScope] = useState('current');

  const safeOrders = useMemo(() => {
    if (Array.isArray(orders) && orders.length > 0) return orders;
    return Array.isArray(stickyOrders) ? stickyOrders : [];
  }, [orders, stickyOrders]);

  const updateOrdersState = typeof setOrders === 'function' ? setOrders : setStickyOrders;

  // ===============================================
  // 2. XAVFSIZ HISOBLASH YORDAMCHILARI
  // ===============================================
  const getOrderFinalAmount = (order) => {
    if (!order) return 0;
    if (order.finalTotal !== undefined) return Number(order.finalTotal) || 0;
    if (order.total !== undefined) return Number(order.total) || 0;
    if (order.subTotal !== undefined) return Number(order.subTotal) || 0;
    if (order.subtotal !== undefined) return Number(order.subtotal) || 0;

    if (Array.isArray(order.items)) {
      return order.items.reduce((sum, it) => {
        const p = Number(it?.price ?? it?.variants?.[0]?.price ?? 0) || 0;
        const q = Number(it?.quantity ?? it?.qty ?? 1) || 0;
        return sum + (p * q);
      }, 0);
    }
    return 0;
  };

  const getOrderServiceFee = (order) => {
    if (!order) return 0;
    if (order.serviceFeeAmount !== undefined) return Number(order.serviceFeeAmount) || 0;
    if (order.table === 'Olib ketish') return 0;
    const sub = Number(order.subTotal ?? order.subtotal ?? 0) || 0;
    const pct = Number(order.serviceFee ?? 10) || 0;
    return Math.round((sub * pct) / 100);
  };

  const getOrderDiscount = (order) => {
    if (!order) return 0;
    return Number(order.discountAmount ?? order.discount ?? 0) || 0;
  };

  // ===============================================
  // 3. CHEKLARNI SMENA REJIMIGA QARAB AJRATISH
  // ===============================================
  // Joriy smenadagi "To'langan" cheklar
  const currentShiftPaidOrders = useMemo(() => {
    return safeOrders.filter(o => o && o.status === "To'langan");
  }, [safeOrders]);

  // Arxivlangan ("Arxiv") cheklar
  const archivedPaidOrders = useMemo(() => {
    return safeOrders.filter(o => o && o.status === 'Arxiv');
  }, [safeOrders]);

  // Qarz daftaridagi ("Qarz") cheklar
  const debtOrders = useMemo(() => {
    return safeOrders.filter(o => o && o.status === 'Qarz');
  }, [safeOrders]);

  // Zalda hali yopilmagan faol cheklar
  const openActiveOrders = useMemo(() => {
    return safeOrders.filter(
      o => o && !["To'langan", 'Qarz', 'Arxiv'].includes(o.status)
    );
  }, [safeOrders]);

  // Tanlangan tabga ('current' | 'archived' | 'all') mos to'langan cheklar
  const completedOrders = useMemo(() => {
    if (viewScope === 'archived') return archivedPaidOrders;
    if (viewScope === 'all') return [...currentShiftPaidOrders, ...archivedPaidOrders];
    return currentShiftPaidOrders;
  }, [viewScope, currentShiftPaidOrders, archivedPaidOrders]);

  // ===============================================
  // 4. ASOSIY MOLIYAVIY HISOB-KITOBLAR (KPI)
  // ===============================================
  const totalRevenue = useMemo(() => {
    return completedOrders.reduce((sum, order) => sum + getOrderFinalAmount(order), 0);
  }, [completedOrders]);

  const totalDebtAmount = useMemo(() => {
    return debtOrders.reduce((sum, order) => sum + getOrderFinalAmount(order), 0);
  }, [debtOrders]);

  const openTablesAmount = useMemo(() => {
    return openActiveOrders.reduce((sum, order) => sum + getOrderFinalAmount(order), 0);
  }, [openActiveOrders]);

  const totalDiscount = useMemo(() => {
    return completedOrders.reduce((sum, order) => sum + getOrderDiscount(order), 0);
  }, [completedOrders]);

  const totalServiceFee = useMemo(() => {
    return completedOrders.reduce((sum, order) => sum + getOrderServiceFee(order), 0);
  }, [completedOrders]);

  const totalOrdersCount = completedOrders.length;
  
  const averageReceipt = totalOrdersCount > 0 
    ? Math.round(totalRevenue / totalOrdersCount) 
    : 0;
  
  // ===============================================
  // 5. TO'LOV TURLARI BO'YICHA HISOB-KITOB (6 XIL USUL)
  // ===============================================
  const paymentStats = useMemo(() => {
    const baseStats = {
      Naqd: 0,
      Plastik: 0,
      Payme: 0,
      Click: 0,
      Aralash: 0,
      Qarz: viewScope === 'archived' ? 0 : totalDebtAmount
    };

    completedOrders.forEach(order => {
      const method = order?.paymentMethod || 'Naqd';
      const amount = getOrderFinalAmount(order);
      
      if (baseStats[method] !== undefined) {
        baseStats[method] += amount;
      } else {
        baseStats[method] = (baseStats[method] || 0) + amount;
      }
    });

    return baseStats;
  }, [completedOrders, totalDebtAmount, viewScope]);

  // ===============================================
  // 6. TAOMLAR BO'YICHA STATISTIKA (TOP-5)
  // ===============================================
  const popularItems = useMemo(() => {
    const itemsStats = {};
    const ordersToCount = viewScope === 'archived' 
      ? archivedPaidOrders 
      : [...completedOrders, ...debtOrders];

    ordersToCount.forEach(order => {
      if (Array.isArray(order?.items)) {
        order.items.forEach(item => {
          if (!item) return;
          const itemName = String(item.name || "Noma'lum taom").trim();
          const itemQuantity = Number(item.quantity ?? item.qty ?? 1) || 0;
          const itemPrice = Number(item.price ?? item.variants?.[0]?.price ?? 0) || 0;

          if (!itemsStats[itemName]) {
            itemsStats[itemName] = { count: 0, revenue: 0 };
          }
          
          itemsStats[itemName].count += itemQuantity;
          itemsStats[itemName].revenue += (itemPrice * itemQuantity);
        });
      }
    });
    
    return Object.entries(itemsStats)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);
  }, [completedOrders, debtOrders, archivedPaidOrders, viewScope]);

  // ===============================================
  // 7. Z-OTCHYOT (SMENANI YOPISH MANTIG'I)
  // ===============================================
  const handleCloseShift = () => {
    if (currentShiftPaidOrders.length === 0) {
      alert("ℹ️ Hozirgi smenada yopilishi kerak bo'lgan yangi 'To'langan' cheklar yo'q!");
      return;
    }

    const shiftRevenue = currentShiftPaidOrders.reduce(
      (sum, o) => sum + getOrderFinalAmount(o), 
      0
    );

    const openWarning = openActiveOrders.length > 0
      ? `\n\n⚠️ Eslatma: Zalda hali yopilmagan ${openActiveOrders.length} ta faol stol (${openTablesAmount.toLocaleString()} so'm) mavjud. Ular keyingi smenada ochiq qoladi.`
      : '';

    const confirmMsg = 
      `⚠️ Diqqat! Z-Otchyotni (Smenani) yopmoqchimisiz?\n\n` +
      `• Yopilgan cheklar: ${currentShiftPaidOrders.length} ta\n` +
      `• Smena tushumi: ${shiftRevenue.toLocaleString()} so'm\n\n` +
      `Tasdiqlasangiz, ushbu cheklar Arxivga o'tkaziladi va joriy smena kassasi nollanadi.${openWarning}`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    const archiveDateStr = new Date().toLocaleString();

    // Cheklarni 'Arxiv' statusiga o'tkazish (setOrders yoki useSticky orqali)
    updateOrdersState(prev => {
      const list = Array.isArray(prev) && prev.length > 0 ? prev : safeOrders;
      return list.map(order => {
        if (order && order.status === "To'langan") {
          return { 
            ...order, 
            status: 'Arxiv', 
            archiveDate: archiveDateStr 
          };
        }
        return order;
      });
    });

    // Audit Log'ga yozish
    const logDetails = `Smena yopildi: ${currentShiftPaidOrders.length} ta chek, Jami tushum: ${shiftRevenue.toLocaleString()} so'm`;
    if (typeof addAuditLog === 'function') {
      addAuditLog("Z-Otchyot (Smena Yopildi)", logDetails);
    } else {
      const writeAudit = typeof setAuditLogs === 'function' ? setAuditLogs : setStickyAuditLogs;
      writeAudit(prev => [
        {
          id: `${Date.now()}_${Math.random()}`,
          date: archiveDateStr,
          action: "Z-Otchyot (Smena Yopildi)",
          details: logDetails,
          userName: currentUser?.name || 'Admin',
          role: currentUser?.role || 'admin'
        },
        ...(Array.isArray(prev) ? prev : [])
      ]);
    }

    alert(`✅ Smena muvaffaqiyatli yopildi!\n${currentShiftPaidOrders.length} ta chek (${shiftRevenue.toLocaleString()} so'm) arxivga o'tkazildi.`);
  };

  // ===============================================
  // 8. RENDER (UI KOMPONENTLAR)
  // ===============================================
  return (
    <div className="animate-fade-in max-w-7xl mx-auto pb-12 space-y-6">
      
      {/* YUQORI SARLAVHA VA SMENA FILTRI */}
      <div className="bg-white dark:bg-gray-800 p-5 md:p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3">
            <span className="text-3xl md:text-4xl">📈</span> Boshqaruv Paneli va Z-Otchyot
          </h2>
          <p className="text-xs sm:text-sm font-bold text-gray-500 mt-1">
            Hozirgi smena tushumlari, sof foyda, qarzlar va to'liq moliyaviy nazorat markazi.
          </p>
        </div>

        {/* Smena / Arxiv / Barchasi Switcher */}
        <div className="flex flex-wrap items-center gap-2 bg-gray-100 dark:bg-gray-900 p-1.5 rounded-2xl w-full lg:w-auto">
          <button
            type="button"
            onClick={() => setViewScope('current')}
            className={`flex-1 lg:flex-initial px-4 py-2.5 rounded-xl font-black text-xs transition ${
              viewScope === 'current'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800'
            }`}
          >
            🟢 Joriy Smena ({currentShiftPaidOrders.length})
          </button>

          <button
            type="button"
            onClick={() => setViewScope('archived')}
            className={`flex-1 lg:flex-initial px-4 py-2.5 rounded-xl font-black text-xs transition ${
              viewScope === 'archived'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800'
            }`}
          >
            🗄️ Arxiv ({archivedPaidOrders.length})
          </button>

          <button
            type="button"
            onClick={() => setViewScope('all')}
            className={`flex-1 lg:flex-initial px-4 py-2.5 rounded-xl font-black text-xs transition ${
              viewScope === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800'
            }`}
          >
            📊 Barcha Vaqt ({currentShiftPaidOrders.length + archivedPaidOrders.length})
          </button>
        </div>
      </div>

      {/* ZALDAGI OCHIQ STOLLAR VA NASIYALAR HAQIDA JONLI MA'LUMOT SATRI */}
      {(openActiveOrders.length > 0 || debtOrders.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {openActiveOrders.length > 0 && (
            <div className="bg-indigo-50/80 dark:bg-indigo-900/20 px-5 py-3.5 rounded-2xl border border-indigo-200 dark:border-indigo-800/50 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🍽️</span>
                <div>
                  <p className="text-xs font-black uppercase text-indigo-600 dark:text-indigo-400">
                    Hozir zalda faol (ochiq) stollar
                  </p>
                  <p className="text-xs font-bold text-gray-500">
                    Kassada hali yopilmagan {openActiveOrders.length} ta chek
                  </p>
                </div>
              </div>
              <span className="text-lg font-black text-indigo-700 dark:text-indigo-300">
                {openTablesAmount.toLocaleString()} s
              </span>
            </div>
          )}

          {debtOrders.length > 0 && (
            <div className="bg-red-50/80 dark:bg-red-900/20 px-5 py-3.5 rounded-2xl border border-red-200 dark:border-red-800/50 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📓</span>
                <div>
                  <p className="text-xs font-black uppercase text-red-600 dark:text-red-400">
                    Qarz daftaridagi cheklar (Nasiya)
                  </p>
                  <p className="text-xs font-bold text-gray-500">
                    To'lanishi kutilayotgan {debtOrders.length} ta qarz
                  </p>
                </div>
              </div>
              <span className="text-lg font-black text-red-600 dark:text-red-400">
                {totalDebtAmount.toLocaleString()} s
              </span>
            </div>
          )}
        </div>
      )}

      {/* 1. KPI Kartochkalar (Tushum, Cheklar, Foyda, Chegirma) */}
      <StatsOverviewCards 
        totalRevenue={totalRevenue}
        totalOrdersCount={totalOrdersCount}
        totalServiceFee={totalServiceFee}
        totalDiscount={totalDiscount}
      />

      {/* 2. To'lov Turlari (Naqd, Plastik, Payme, Click, Aralash, Qarz) va O'rtacha Chek */}
      <StatsPaymentBreakdown 
        paymentStats={paymentStats}
        averageReceipt={averageReceipt}
      />

      {/* 3. Top Taomlar va Smenani Yopish tugmasi */}
      <StatsPopularItems 
        popularItems={popularItems}
        onCloseShift={handleCloseShift}
      />
      
    </div>
  );
}