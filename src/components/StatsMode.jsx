import React, { useState, useMemo } from 'react';
import useSticky from '../hooks/useSticky';
import StatsOverviewCards from './StatsOverviewCards';
import StatsPaymentBreakdown from './StatsPaymentBreakdown';
import StatsPopularItems from './StatsPopularItems';

export default function StatsMode({ 
  orders, 
  setOrders, 
  menuItems,
  inventory,
  currentUser,
  auditLogs,
  setAuditLogs,
  addAuditLog
}) {
  // Zaxira xotira (App.jsx dan prop kelmasa ham 100% ishlaydi)
  const [stickyOrders, setStickyOrders] = useSticky('pos_orders', []);
  const [stickyMenu] = useSticky('pos_menu', []);
  const [stickyInventory] = useSticky('pos_inventory', []);
  const [, setStickyAuditLogs] = useSticky('pos_audit_logs', []);

  const [viewScope, setViewScope] = useState('current'); // 'current' | 'archived' | 'all'

  const safeOrders = useMemo(() => {
    if (Array.isArray(orders) && orders.length > 0) return orders;
    return Array.isArray(stickyOrders) ? stickyOrders : [];
  }, [orders, stickyOrders]);

  const safeMenu = useMemo(() => {
    if (Array.isArray(menuItems) && menuItems.length > 0) return menuItems;
    return Array.isArray(stickyMenu) ? stickyMenu : [];
  }, [menuItems, stickyMenu]);

  const safeInventory = useMemo(() => {
    if (Array.isArray(inventory) && inventory.length > 0) return inventory;
    return Array.isArray(stickyInventory) ? stickyInventory : [];
  }, [inventory, stickyInventory]);

  const updateOrdersState = typeof setOrders === 'function' ? setOrders : setStickyOrders;

  // Bitta taomning 1 porsiya tannarxini (Food Cost) hisoblash
  const getDishUnitCost = (cartItem) => {
    if (!cartItem) return 0;
    const matchedMenu = safeMenu.find(
      m => m && (String(m.id) === String(cartItem.id) || m.name === cartItem.baseName || m.name === cartItem.name)
    );

    if (!matchedMenu) return 0;

    if ( Array.isArray(matchedMenu.recipe) && matchedMenu.recipe.length > 0 && safeInventory.length > 0) {
      let recipeCost = 0;
      matchedMenu.recipe.forEach(r => {
        const invItem = safeInventory.find(i => i && String(i.id) === String(r.inventoryId ?? r.productId));
        if (invItem) {
          const usedQtyInBase = Number(r.qty ?? r.amount ?? 0) || 0;
          const unitCost = Number(invItem.costPrice ?? invItem.price ?? 0) || 0;
          recipeCost += usedQtyInBase * unitCost;
        }
      });
      if (recipeCost > 0) return Math.round(recipeCost);
    }

    return Number(matchedMenu.costPrice || 0) || 0;
  };

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

  const getOrderFoodCost = (order) => {
    if (!order || !Array.isArray(order.items)) return 0;
    return order.items.reduce((sum, it) => {
      const qty = Number(it?.quantity ?? it?.qty ?? 1) || 0;
      return sum + (getDishUnitCost(it) * qty);
    }, 0);
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

  // Cheklarni smena rejimiga qarab ajratish
  const currentShiftPaidOrders = useMemo(() => {
    return safeOrders.filter(o => o && o.status === "To'langan");
  }, [safeOrders]);

  const archivedPaidOrders = useMemo(() => {
    return safeOrders.filter(o => o && o.status === 'Arxiv');
  }, [safeOrders]);

  const debtOrders = useMemo(() => {
    return safeOrders.filter(o => o && o.status === 'Qarz');
  }, [safeOrders]);

  const openActiveOrders = useMemo(() => {
    return safeOrders.filter(
      o => o && !["To'langan", 'Qarz', 'Arxiv'].includes(o.status)
    );
  }, [safeOrders]);

  const completedOrders = useMemo(() => {
    if (viewScope === 'archived') return archivedPaidOrders;
    if (viewScope === 'all') return [...currentShiftPaidOrders, ...archivedPaidOrders];
    return currentShiftPaidOrders;
  }, [viewScope, currentShiftPaidOrders, archivedPaidOrders]);

  // Asosiy moliyaviy ko'rsatkichlar (Tushum, Tannarx va Haqiqiy Sof Foyda)
  const totalRevenue = useMemo(() => {
    return completedOrders.reduce((sum, order) => sum + getOrderFinalAmount(order), 0);
  }, [completedOrders]);

  const totalFoodCost = useMemo(() => {
    return completedOrders.reduce((sum, order) => sum + getOrderFoodCost(order), 0);
  }, [completedOrders, safeMenu, safeInventory]);

  const totalNetProfit = useMemo(() => {
    return totalRevenue - totalFoodCost;
  }, [totalRevenue, totalFoodCost]);

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
  const averageReceipt = totalOrdersCount > 0 ? Math.round(totalRevenue / totalOrdersCount) : 0;
  
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

  const handleCloseShift = () => {
    if (currentShiftPaidOrders.length === 0) {
      alert("ℹ️ Hozirgi smenada yopilishi kerak bo'lgan yangi 'To'langan' cheklar yo'q!");
      return;
    }

    const shiftRevenue = currentShiftPaidOrders.reduce((sum, o) => sum + getOrderFinalAmount(o), 0);
    const shiftCost = currentShiftPaidOrders.reduce((sum, o) => sum + getOrderFoodCost(o), 0);
    const shiftNetProfit = shiftRevenue - shiftCost;

    const confirmMsg = 
      `⚠️ Diqqat! Z-Otchyotni (Smenani) yopmoqchimisiz?\n\n` +
      `• Yopilgan cheklar: ${currentShiftPaidOrders.length} ta\n` +
      `• Smena tushumi: ${shiftRevenue.toLocaleString()} so'm\n` +
      `• Xomashyo tannarxi: -${shiftCost.toLocaleString()} so'm\n` +
      `• Haqiqiy Sof Foyda: +${shiftNetProfit.toLocaleString()} so'm\n\n` +
      `Tasdiqlasangiz, cheklar Arxivga o'tkaziladi va kassa nollanadi.`;

    if (!window.confirm(confirmMsg)) return;

    const archiveDateStr = new Date().toLocaleString();

    updateOrdersState(prev => {
      const list = Array.isArray(prev) && prev.length > 0 ? prev : safeOrders;
      return list.map(order => {
        if (order && order.status === "To'langan") {
          return { ...order, status: 'Arxiv', archiveDate: archiveDateStr };
        }
        return order;
      });
    });

    const logDetails = `Smena yopildi: Tushum ${shiftRevenue.toLocaleString()} s | Tannarx: ${shiftCost.toLocaleString()} s | Sof foyda: ${shiftNetProfit.toLocaleString()} s`;
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

    alert(`✅ Smena muvaffaqiyatli yopildi!\nSof foyda: ${shiftNetProfit.toLocaleString()} so'm`);
  };

  return (
    <div className="animate-fade-in max-w-7xl mx-auto pb-12 space-y-6">
      
      {/* YUQORI SARLAVHA VA SMENA FILTRI */}
      <div className="bg-white dark:bg-gray-800 p-5 md:p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3">
            <span className="text-3xl md:text-4xl">📈</span> Boshqaruv Paneli, Tannarx va Z-Otchyot
          </h2>
          <p className="text-xs sm:text-sm font-bold text-gray-500 mt-1">
            Smena tushumi, xomashyo tannarxi (Food Cost), haqiqiy sof foyda va moliyaviy nazorat.
          </p>
        </div>

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

      {/* 1. KPI Kartochkalar (Tushum, Tannarx, Haqiqiy Sof Foyda, Chegirma) */}
      <StatsOverviewCards 
        totalRevenue={totalRevenue}
        totalFoodCost={totalFoodCost}
        totalNetProfit={totalNetProfit}
        totalOrdersCount={totalOrdersCount}
        totalServiceFee={totalServiceFee}
        totalDiscount={totalDiscount}
      />

      {/* 2. To'lov Turlari va O'rtacha Chek */}
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