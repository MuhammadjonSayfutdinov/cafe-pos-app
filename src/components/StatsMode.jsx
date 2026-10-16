import React, { useState, useMemo } from 'react';
import useSticky from '../hooks/useSticky';
import StatsOverviewCards from './StatsOverviewCards';
import StatsPaymentBreakdown from './StatsPaymentBreakdown';
import StatsPopularItems from './StatsPopularItems';
import { sendZReportTelegram } from '../utils/telegramNotifier';

// ===============================================
// O'LCHOV BIRLIKLARI KONVERTORI (TANNARX UCHUN)
// ===============================================
const UNIT_FACTORS = {
  gr: { family: 'weight', factor: 1 },
  kg: { family: 'weight', factor: 1000 },
  tonna: { family: 'weight', factor: 1000000 },
  ml: { family: 'volume', factor: 1 },
  litr: { family: 'volume', factor: 1000 }
};

const normalizeUnit = (unitStr) => {
  const u = String(unitStr || 'kg').trim().toLowerCase();
  if (['g', 'gr', 'gram', 'gramm'].includes(u)) return 'gr';
  if (['kg', 'kilogram', 'kilogramm', 'kilo'].includes(u)) return 'kg';
  if (['t', 'ton', 'tonna', 'tn'].includes(u)) return 'tonna';
  if (['ml', 'millilitr'].includes(u)) return 'ml';
  if (['l', 'lt', 'litr', 'liter'].includes(u)) return 'litr';
  return u;
};

const convertToInventoryUnit = (amount, fromUnit, toInvUnit) => {
  const num = Number(amount) || 0;
  const fromNorm = normalizeUnit(fromUnit || toInvUnit);
  const toNorm = normalizeUnit(toInvUnit);

  if (fromNorm === toNorm) return num;

  const fromMeta = UNIT_FACTORS[fromNorm];
  const toMeta = UNIT_FACTORS[toNorm];

  if (fromMeta && toMeta && fromMeta.family === toMeta.family) {
    const inBase = num * fromMeta.factor;
    return Number((inBase / toMeta.factor).toFixed(6));
  }
  return num;
};

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
  // ===============================================
  // 1. ZAXIRA XOTIRA VA STATE'LAR (FALLBACK SYNC)
  // ===============================================
  const [stickyOrders, setStickyOrders] = useSticky('pos_orders', []);
  const [stickyMenu] = useSticky('pos_menu', []);
  const [stickyInventory] = useSticky('pos_inventory', []);
  const [, setStickyAuditLogs] = useSticky('pos_audit_logs', []);

  // Ko'rish rejimi: 'current' (Joriy smena) | 'archived' (Arxiv) | 'all' (Barcha vaqt)
  const [viewScope, setViewScope] = useState('current');

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

  // ===============================================
  // 2. XAVFSIZ MOLIYAVIY VA TANNARX HISOBLAGICHLARI
  // ===============================================
  // Bitta sotilgan taomning 1 porsiya tannarxini (Food Cost) hisoblash
  const getDishUnitCost = (cartItem) => {
    if (!cartItem) return 0;

    const matchedMenu = safeMenu.find(
      m => m && (
        String(m.id) === String(cartItem.id) || 
        m.name === cartItem.baseName || 
        m.name === cartItem.name
      )
    );

    if (!matchedMenu) {
      return Number(cartItem.costPrice || 0) || 0;
    }

    // Agar mijoz 0.5 porsiya yoki boshqa variant olgan bo'lsa, narx proporsiyasini aniqlaymiz
    const mainMenuPrice = Number(matchedMenu.variants?.[0]?.price ?? matchedMenu.price ?? 0) || 0;
    const soldItemPrice = Number(cartItem.price ?? mainMenuPrice) || 0;
    const portionRatio = (mainMenuPrice > 0 && soldItemPrice > 0)
      ? Math.min(2, Math.max(0.25, soldItemPrice / mainMenuPrice))
      : 1;

    const recipeList = matchedMenu.recipe || matchedMenu.ingredients;
    if (Array.isArray(recipeList) && recipeList.length > 0 && safeInventory.length > 0) {
      let recipeCost = 0;

      recipeList.forEach(r => {
        if (!r) return;
        const targetId = String(r.inventoryId ?? r.productId ?? r.id ?? '');
        const invItem = safeInventory.find(i => i && String(i.id) === targetId);

        if (invItem) {
          const invCostPrice = Number(invItem.costPrice ?? invItem.price ?? 0) || 0;
          const invUnit = normalizeUnit(invItem.unit || 'kg');

          // Agar rawQty va recipeUnit bo'lsa konvertatsiya qilamiz, aks holda tayyor qty ni olamiz
          let usedQtyInInvUnit = Number(r.qty ?? r.amount ?? 0) || 0;
          if (r.rawQty !== undefined && r.recipeUnit) {
            usedQtyInInvUnit = convertToInventoryUnit(r.rawQty, r.recipeUnit, invUnit);
          }

          recipeCost += usedQtyInInvUnit * invCostPrice;
        }
      });

      if (recipeCost > 0) {
        return Math.round(recipeCost * portionRatio);
      }
    }

    const fallbackCost = Number(matchedMenu.costPrice || 0) || 0;
    return Math.round(fallbackCost * portionRatio);
  };

  // Chekning yakuniy summasi
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

  // Chekdagi barcha taomlarning xomashyo tannarxi (COGS)
  const getOrderFoodCost = (order) => {
    if (!order || !Array.isArray(order.items)) return 0;
    return order.items.reduce((sum, it) => {
      const qty = Number(it?.quantity ?? it?.qty ?? 1) || 0;
      return sum + (getDishUnitCost(it) * qty);
    }, 0);
  };

  // Chekning xizmat haqi summasi
  const getOrderServiceFee = (order) => {
    if (!order) return 0;
    if (order.serviceFeeAmount !== undefined) return Number(order.serviceFeeAmount) || 0;
    if (order.table === 'Olib ketish') return 0;
    const sub = Number(order.subTotal ?? order.subtotal ?? 0) || 0;
    const pct = Number(order.serviceFee ?? 10) || 0;
    return Math.round((sub * pct) / 100);
  };

  // Chekning chegirma summasi
  const getOrderDiscount = (order) => {
    if (!order) return 0;
    return Number(order.discountAmount ?? order.discount ?? 0) || 0;
  };

  // ===============================================
  // 3. CHEKLARNI SMENA REJIMIGA QARAB AJRATISH
  // ===============================================
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

  // ===============================================
  // 4. ASOSIY MOLIYAVIY HISOB-KITOBLAR (KPI)
  // ===============================================
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
  
  const averageReceipt = totalOrdersCount > 0 
    ? Math.round(totalRevenue / totalOrdersCount) 
    : 0;
  
  // ===============================================
  // 5. TO'LOV TURLARI BO'YICHA HISOB-KITOB
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
  // 6. TAOMLAR BO'YICHA STATISTIKA (TOP-5 + TANNARX)
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
          const itemUnitCost = getDishUnitCost(item);

          if (!itemsStats[itemName]) {
            itemsStats[itemName] = { count: 0, revenue: 0, cost: 0, profit: 0 };
          }
          
          const lineRev = itemPrice * itemQuantity;
          const lineCost = itemUnitCost * itemQuantity;

          itemsStats[itemName].count += itemQuantity;
          itemsStats[itemName].revenue += lineRev;
          itemsStats[itemName].cost += lineCost;
          itemsStats[itemName].profit += (lineRev - lineCost);
        });
      }
    });
    
    return Object.entries(itemsStats)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);
  }, [completedOrders, debtOrders, archivedPaidOrders, viewScope, safeMenu, safeInventory]);

  // ===============================================
  // 7. Z-OTCHYOTNI (.TXT) YUKLAB OLISH VA SMENANI YOPISH
  // ===============================================
  const handleExportZReport = () => {
    const scopeTitle = 
      viewScope === 'current' ? 'JORIY SMENA HISOBOTI' :
      viewScope === 'archived' ? 'ARXIVLANGAN SMENALAR HISOBOTI' :
      'BARCHA VAQT UCHUN UMUMIY HISOBOT';

    const reportLines = [
      `==================================================`,
      `📊 Z-OTCHYOT VA MOLIYAVIY HISOBOT (${scopeTitle})`,
      `Sana va vaqt: ${new Date().toLocaleString()}`,
      `Mas'ul shaxs: ${currentUser?.name || 'Admin'}`,
      `==================================================\n`,
      `1. ASOSIY MOLIYAVIY KO'RSATKICHLAR:`,
      `• Yopilgan cheklar soni: ${totalOrdersCount} ta`,
      `• Jami Savdo Tushumi: ${totalRevenue.toLocaleString()} so'm`,
      `• Xomashyo Tannarxi (Food Cost): -${totalFoodCost.toLocaleString()} so'm`,
      `• HAQIQIY SOF FOYDA: +${totalNetProfit.toLocaleString()} so'm`,
      `• Xizmat haqi (+Foyda): ${totalServiceFee.toLocaleString()} so'm`,
      `• Berilgan chegirmalar: ${totalDiscount.toLocaleString()} so'm`,
      `• O'rtacha chek summasi: ${averageReceipt.toLocaleString()} so'm\n`,
      `2. TO'LOV TURLARI BO'YICHA:`,
      ...Object.entries(paymentStats).map(([k, v]) => `• ${k}: ${Number(v || 0).toLocaleString()} so'm`),
      `\n3. TOP-5 XARIDORGIR TAOMLAR:`,
      ...(popularItems.length > 0
        ? popularItems.map(([name, st], idx) => 
            `${idx + 1}. ${name} — ${st.count} pors | Tushum: ${st.revenue.toLocaleString()} s | Sof foyda: +${st.profit.toLocaleString()} s`
          )
        : ['Sotuvlar mavjud emas'])
    ].join('\n');

    const blob = new Blob([reportLines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `z-otchyot-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCloseShift = () => {
    if (currentShiftPaidOrders.length === 0) {
      alert("ℹ️ Hozirgi smenada yopilishi kerak bo'lgan yangi 'To'langan' cheklar yo'q!");
      return;
    }

    const shiftRevenue = currentShiftPaidOrders.reduce((sum, o) => sum + getOrderFinalAmount(o), 0);
    const shiftCost = currentShiftPaidOrders.reduce((sum, o) => sum + getOrderFoodCost(o), 0);
    const shiftNetProfit = shiftRevenue - shiftCost;

    const openWarning = openActiveOrders.length > 0
      ? `\n\n⚠️ Eslatma: Zalda hali yopilmagan ${openActiveOrders.length} ta faol stol (${openTablesAmount.toLocaleString()} so'm) mavjud. Ular keyingi smenada ochiq qoladi.`
      : '';

    const confirmMsg = 
      `⚠️ Diqqat! Z-Otchyotni (Smenani) yopmoqchimisiz?\n\n` +
      `• Yopilgan cheklar: ${currentShiftPaidOrders.length} ta\n` +
      `• Smena tushumi: ${shiftRevenue.toLocaleString()} so'm\n` +
      `• Xomashyo tannarxi (COGS): -${shiftCost.toLocaleString()} so'm\n` +
      `• Haqiqiy Sof Foyda: +${shiftNetProfit.toLocaleString()} so'm\n\n` +
      `Tasdiqlasangiz, ushbu cheklar Arxivga o'tkaziladi va joriy smena kassasi nollanadi.${openWarning}`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    const archiveDateStr = new Date().toLocaleString();

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

    const logDetails = `Smena yopildi: ${currentShiftPaidOrders.length} ta chek | Tushum: ${shiftRevenue.toLocaleString()} s | Tannarx: ${shiftCost.toLocaleString()} s | Sof foyda: +${shiftNetProfit.toLocaleString()} s`;
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

    alert(
      `✅ Smena muvaffaqiyatli yopildi!\n\n` +
      `• Arxivga o'tkazildi: ${currentShiftPaidOrders.length} ta chek\n` +
      `• Jami tushum: ${shiftRevenue.toLocaleString()} so'm\n` +
      `• Sof foyda: +${shiftNetProfit.toLocaleString()} so'm`
    );
  };

  // ===============================================
  // 8. RENDER (UI KOMPONENTLAR)
  // ===============================================
  return (
    <div className="animate-fade-in max-w-7xl mx-auto pb-12 space-y-6">
      
      {/* YUQORI SARLAVHA, EKSPORT VA SMENA FILTRI */}
      <div className="bg-white dark:bg-gray-800 p-5 md:p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3">
            <span className="text-3xl md:text-4xl">📈</span> Boshqaruv Paneli, Tannarx va Z-Otchyot
          </h2>
          <p className="text-xs sm:text-sm font-bold text-gray-500 mt-1">
            Smena tushumi, xomashyo tannarxi (Food Cost), haqiqiy sof foyda, qarzlar va moliyaviy nazorat markazi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
          {/* Hisobotni yuklab olish tugmasi */}
          <button
            type="button"
            onClick={handleExportZReport}
            className="px-4 py-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 font-black text-xs border border-emerald-200 dark:border-emerald-800/50 transition active:scale-95 whitespace-nowrap"
          >
            📥 Hisobotni yuklash (.txt)
          </button>

          {/* Smena / Arxiv / Barchasi Switcher */}
          <div className="flex flex-wrap items-center gap-1.5 bg-gray-100 dark:bg-gray-900 p-1.5 rounded-2xl flex-1 sm:flex-initial">
            <button
              type="button"
              onClick={() => setViewScope('current')}
              className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl font-black text-xs transition ${
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
              className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl font-black text-xs transition ${
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
              className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl font-black text-xs transition ${
                viewScope === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800'
              }`}
            >
              📊 Barchasi ({currentShiftPaidOrders.length + archivedPaidOrders.length})
            </button>
          </div>
        </div>
      </div>

      {/* ZALDAGI OCHIQ STOLLAR VA NASIYALAR HAQIDA JONLI MA'LUMOT SATRI (TIKLANDI) */}
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

      {/* 1. KPI Kartochkalar (6 ta to'liq moliyaviy ko'rsatkich) */}
      <StatsOverviewCards 
        totalRevenue={totalRevenue}
        totalFoodCost={totalFoodCost}
        totalNetProfit={totalNetProfit}
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