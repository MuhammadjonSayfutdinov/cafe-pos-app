import React, { useState, useMemo } from 'react';
import useSticky from '../hooks/useSticky';
import StatsOverviewCards from './StatsOverviewCards';
import StatsPaymentBreakdown from './StatsPaymentBreakdown';
import StatsPopularItems from './StatsPopularItems';

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

const escapeHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export default function StatsMode({ 
  orders, 
  setOrders, 
  menuItems,
  inventory,
  expenses,
  setExpenses,
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
  const [stickyExpenses, setStickyExpenses] = useSticky('pos_expenses', []);
  const [stickyCafeName] = useSticky('pos_cafe_name', 'Premium Cafe');
  const [, setStickyAuditLogs] = useSticky('pos_audit_logs', []);

  // Ko'rish rejimi: 'current' (Joriy smena) | 'archived' (Arxiv) | 'all' (Barcha vaqt)
  const [viewScope, setViewScope] = useState('current');
  const [tgSending, setTgSending] = useState(false);

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

  const safeExpenses = useMemo(() => {
    if (Array.isArray(expenses)) return expenses;
    return Array.isArray(stickyExpenses) ? stickyExpenses : [];
  }, [expenses, stickyExpenses]);

  const updateOrdersState = typeof setOrders === 'function' ? setOrders : setStickyOrders;
  const updateExpensesState = typeof setExpenses === 'function' ? setExpenses : setStickyExpenses;

  // ===============================================
  // 2. XAVFSIZ MOLIYAVIY VA TANNARX HISOBLAGICHLARI
  // ===============================================
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

  // ===============================================
  // 3. CHEKLAR VA XARAJATLARNI SMENAGA QARAB AJRATISH
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

  // Xarajatlarni ham tanlangan smena ('current' | 'archived' | 'all') bo'yicha ajratish
  const scopedExpenses = useMemo(() => {
    if (viewScope === 'archived') {
      return safeExpenses.filter(e => e && e.status === 'Arxiv');
    }
    if (viewScope === 'all') {
      return safeExpenses.filter(Boolean);
    }
    return safeExpenses.filter(e => e && e.status !== 'Arxiv');
  }, [safeExpenses, viewScope]);

  // ===============================================
  // 4. ASOSIY MOLIYAVIY HISOB-KITOBLAR (KPI + XARAJATLAR)
  // ===============================================
  const totalRevenue = useMemo(() => {
    return completedOrders.reduce((sum, order) => sum + getOrderFinalAmount(order), 0);
  }, [completedOrders]);

  const totalFoodCost = useMemo(() => {
    return completedOrders.reduce((sum, order) => sum + getOrderFoodCost(order), 0);
  }, [completedOrders, safeMenu, safeInventory]);

  // Operatsion xarajatlar (Sof foydadan ayriladi) va Inkassatsiya (Sof foydadan ayrilmaydi, faqat seyfdan ayriladi)
  const expenseMetrics = useMemo(() => {
    let operationalExpenses = 0;
    let inkassatsiyaAmount = 0;
    let cashOutTotal = 0;
    let cardOutTotal = 0;

    scopedExpenses.forEach(exp => {
      const amt = Number(exp.amount) || 0;
      const isInkass = Boolean(exp.isInkassatsiya || exp.category === 'Inkassatsiya');

      if (isInkass) {
        inkassatsiyaAmount += amt;
      } else {
        operationalExpenses += amt;
      }

      if (exp.paymentSource === 'Plastik') {
        cardOutTotal += amt;
      } else {
        cashOutTotal += amt;
      }
    });

    return {
      operationalExpenses,
      inkassatsiyaAmount,
      cashOutTotal,
      cardOutTotal,
      totalAllOutflows: operationalExpenses + inkassatsiyaAmount
    };
  }, [scopedExpenses]);

  // Haqiqiy Sof Foyda = Savdo Tushumi - Xomashyo Tannarxi (COGS) - Operatsion Xarajatlar
  const totalNetProfit = useMemo(() => {
    return totalRevenue - totalFoodCost - expenseMetrics.operationalExpenses;
  }, [totalRevenue, totalFoodCost, expenseMetrics.operationalExpenses]);

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
  // 5. TO'LOV TURLARI VA SEYFDAGI ANIQ NAQD PUL
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

  // Seyfda bo'lishi shart bo'lgan aniq naqd pul (Naqd cheklar + Aralashning naqd qismi - Naqd chiqimlar)
  const expectedCashInDrawer = useMemo(() => {
    let rawCashIn = 0;
    completedOrders.forEach(o => {
      const amt = getOrderFinalAmount(o);
      if (o.paymentMethod === 'Naqd') {
        rawCashIn += amt;
      } else if (o.paymentMethod === 'Aralash') {
        rawCashIn += Number(o.paymentDetails?.cashAmount ?? o.mixedDetails?.cash ?? 0) || 0;
      }
    });
    return rawCashIn - expenseMetrics.cashOutTotal;
  }, [completedOrders, expenseMetrics.cashOutTotal]);

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
  // 7. TELEGRAMGA Z-OTCHYOT YUBORISH VA .TXT YUKLASH
  // ===============================================
  const sendReportToTelegram = async (customLabel = null) => {
    try {
      const raw = window.localStorage.getItem('pos_telegram_config');
      if (!raw) return { ok: false, error: 'Telegram Bot sozlanmagan!' };
      const cfg = JSON.parse(raw);
      const token = String(cfg?.botToken || '').trim();
      const rawIds = String(cfg?.chatId || '').trim();

      if (!token || !rawIds) {
        return { ok: false, error: 'Admin Sozlamalarida Bot Token va Chat ID kiritilmagan!' };
      }

      const htmlMsg = [
        `📊 <b>Z-OTCHYOT VA KASSA BALANSI</b>`,
        `🏪 <b>Kafe:</b> ${escapeHtml(stickyCafeName)}`,
        `📌 <b>Hisobot:</b> ${escapeHtml(customLabel || (viewScope === 'current' ? 'Joriy Smena' : 'Umumiy Hisobot'))}`,
        `📅 <b>Sana:</b> ${escapeHtml(new Date().toLocaleString())}`,
        `━━━━━━━━━━━━━━━━━━`,
        `💰 <b>JAMI SAVDO TUSHUMI:</b> ${totalRevenue.toLocaleString()} so'm (${totalOrdersCount} ta chek)`,
        `🥩 <b>Xomashyo Tannarxi (COGS):</b> -${totalFoodCost.toLocaleString()} so'm`,
        `💸 <b>Kunlik Xarajatlar:</b> -${expenseMetrics.operationalExpenses.toLocaleString()} so'm`,
        `💎 <b>HAQIQIY SOF FOYDA:</b> <b>+${totalNetProfit.toLocaleString()} so'm</b>`,
        `━━━━━━━━━━━━━━━━━━`,
        `🏦 <b>Inkassatsiya (Topshirildi):</b> ${expenseMetrics.inkassatsiyaAmount.toLocaleString()} so'm`,
        `🗄 <b>SEYFDA QOLGAN SOF NAQD PUL:</b> <b>${expectedCashInDrawer.toLocaleString()} so'm</b>`,
        `━━━━━━━━━━━━━━━━━━`,
        `💳 <b>TO'LOV TURLARI:</b>`,
        ...Object.entries(paymentStats).map(([k, v]) => `  • ${escapeHtml(k)}: ${Number(v || 0).toLocaleString()} so'm`)
      ].join('\n');

      const chatIds = rawIds.split(',').map(s => s.trim()).filter(Boolean);
      await Promise.all(
        chatIds.map(id =>
          fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: id,
              text: htmlMsg,
              parse_mode: 'HTML'
            })
          })
        )
      );
      return { ok: true };
    } catch {
      return { ok: false, error: 'Internet xatosi!' };
    }
  };

  const handleManualTelegramShare = async () => {
    setTgSending(true);
    const res = await sendReportToTelegram();
    setTgSending(false);
    if (res.ok) {
      alert('✅ Z-Otchyot hisoboti Telegramga muvaffaqiyatli yuborildi!');
    } else {
      alert(`❌ ${res.error}`);
    }
  };

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
      `• Kunlik Operatsion Xarajatlar: -${expenseMetrics.operationalExpenses.toLocaleString()} so'm`,
      `• HAQIQIY SOF FOYDA: +${totalNetProfit.toLocaleString()} so'm`,
      `• Inkassatsiya (Rahbarga topshirilgan): ${expenseMetrics.inkassatsiyaAmount.toLocaleString()} so'm`,
      `• SEYFDA QOLISHI SHART BO'LGAN NAQD PUL: ${expectedCashInDrawer.toLocaleString()} so'm\n`,
      `2. TO'LOV TURLARI BO'YICHA:`,
      ...Object.entries(paymentStats).map(([k, v]) => `• ${k}: ${Number(v || 0).toLocaleString()} so'm`),
      `\n3. KASSA CHIQIMLARI VA XARAJATLAR (${scopedExpenses.length} ta):`,
      ...(scopedExpenses.length > 0
        ? scopedExpenses.map((e, i) => `${i + 1}. [${e.date}] ${e.category}: -${Number(e.amount).toLocaleString()} s (${e.paymentSource}) — ${e.note}`)
        : ['Xarajatlar kiritilmagan']),
      `\n4. TOP-5 XARIDORGIR TAOMLAR:`,
      ...(popularItems.length > 0
        ? popularItems.map(([name, st], idx) => 
            `${idx + 1}. ${name} — ${st.count} pors | Tushum: ${st.revenue.toLocaleString()} s`
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

  // ===============================================
  // 8. Z-OTCHYOT (SMENANI YOPISH MANTIG'I)
  // ===============================================
  const handleCloseShift = () => {
    const activeShiftExpenses = safeExpenses.filter(e => e && e.status !== 'Arxiv');

    if (currentShiftPaidOrders.length === 0 && activeShiftExpenses.length === 0) {
      alert("ℹ️ Hozirgi smenada yopilishi kerak bo'lgan yangi cheklar yoki xarajatlar yo'q!");
      return;
    }

    const openWarning = openActiveOrders.length > 0
      ? `\n\n⚠️ Eslatma: Zalda hali yopilmagan ${openActiveOrders.length} ta faol stol (${openTablesAmount.toLocaleString()} so'm) mavjud. Ular keyingi smenada ochiq qoladi.`
      : '';

    const confirmMsg = 
      `⚠️ Diqqat! Z-Otchyotni (Smenani) yopmoqchimisiz?\n\n` +
      `• Yopilgan cheklar: ${currentShiftPaidOrders.length} ta\n` +
      `• Smena tushumi: ${totalRevenue.toLocaleString()} so'm\n` +
      `• Xomashyo tannarxi (COGS): -${totalFoodCost.toLocaleString()} so'm\n` +
      `• Kunlik xarajatlar: -${expenseMetrics.operationalExpenses.toLocaleString()} so'm\n` +
      `• Haqiqiy Sof Foyda: +${totalNetProfit.toLocaleString()} so'm\n` +
      `• Seyfdagi sof naqd pul: ${expectedCashInDrawer.toLocaleString()} so'm\n\n` +
      `Tasdiqlasangiz, barcha cheklar va xarajatlar Arxivga o'tkaziladi hamda joriy kassa nollanadi.${openWarning}`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    const archiveDateStr = new Date().toLocaleString();

    // 1. Cheklarni arxivga o'tkazish
    updateOrdersState(prev => {
      const list = Array.isArray(prev) && prev.length > 0 ? prev : safeOrders;
      return list.map(order => {
        if (order && order.status === "To'langan") {
          return { ...order, status: 'Arxiv', archiveDate: archiveDateStr };
        }
        return order;
      });
    });

    // 2. Smena xarajatlarini ham arxivga o'tkazish
    updateExpensesState(prev => {
      const list = Array.isArray(prev) ? prev : safeExpenses;
      return list.map(exp => {
        if (exp && exp.status !== 'Arxiv') {
          return { ...exp, status: 'Arxiv', archiveDate: archiveDateStr };
        }
        return exp;
      });
    });

    // 3. Telegramga avtomatik Z-Otchyot yuborish
    sendReportToTelegram('Smena Yopildi (Z-Otchyot)');

    // 4. Audit Log
    const logDetails = `Smena yopildi: Tushum ${totalRevenue.toLocaleString()} s | Xarajat: -${expenseMetrics.operationalExpenses.toLocaleString()} s | Sof foyda: +${totalNetProfit.toLocaleString()} s`;
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
      `• Jami tushum: ${totalRevenue.toLocaleString()} so'm\n` +
      `• Kunlik xarajatlar: -${expenseMetrics.operationalExpenses.toLocaleString()} so'm\n` +
      `• Haqiqiy Sof Foyda: +${totalNetProfit.toLocaleString()} so'm`
    );
  };

  // ===============================================
  // 9. RENDER (UI KOMPONENTLAR)
  // ===============================================
  return (
    <div className="animate-fade-in max-w-7xl mx-auto pb-12 space-y-6">
      
      {/* YUQORI SARLAVHA, TELEGRAM, EKSPORT VA SMENA FILTRI */}
      <div className="bg-white dark:bg-gray-800 p-5 md:p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3">
            <span className="text-3xl md:text-4xl">📈</span> Moliya, Xarajatlar va Z-Otchyot Markazi
          </h2>
          <p className="text-xs sm:text-sm font-bold text-gray-500 mt-1">
            Savdo tushumi, xomashyo tannarxi (COGS), kassa chiqimlari va haqiqiy sof foyda nazorati.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
          <button
            type="button"
            onClick={handleManualTelegramShare}
            disabled={tgSending}
            className="px-4 py-2.5 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-black text-xs shadow-md shadow-sky-500/20 transition active:scale-95 whitespace-nowrap disabled:opacity-50"
          >
            {tgSending ? '⏳ Yuborilmoqda...' : '✈️ Telegramga yuborish'}
          </button>

          <button
            type="button"
            onClick={handleExportZReport}
            className="px-4 py-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 font-black text-xs border border-emerald-200 dark:border-emerald-800/50 transition active:scale-95 whitespace-nowrap"
          >
            📥 Yuklash (.txt)
          </button>

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

      {/* ZALDAGI OCHIQ STOLLAR, NASIYALAR VA SEYF NAQD PUL BALANSI SATRI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-indigo-50/80 dark:bg-indigo-900/20 px-5 py-4 rounded-2xl border border-indigo-200 dark:border-indigo-800/50 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔒</span>
            <div>
              <p className="text-xs font-black uppercase text-indigo-600 dark:text-indigo-400">
                Seyfda Qolishi Shart Naqd Pul
              </p>
              <p className="text-[11px] font-bold text-gray-500">
                Naqd savdo minus Naqd chiqim/inkassatsiya
              </p>
            </div>
          </div>
          <span className="text-lg font-black text-indigo-700 dark:text-indigo-300">
            {expectedCashInDrawer.toLocaleString()} s
          </span>
        </div>

        <div className="bg-amber-50/80 dark:bg-amber-900/20 px-5 py-4 rounded-2xl border border-amber-200 dark:border-amber-800/50 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🍽️</span>
            <div>
              <p className="text-xs font-black uppercase text-amber-700 dark:text-amber-400">
                Hozir zalda ochiq stollar
              </p>
              <p className="text-[11px] font-bold text-gray-500">
                Yopilmagan {openActiveOrders.length} ta faol buyurtma
              </p>
            </div>
          </div>
          <span className="text-lg font-black text-amber-700 dark:text-amber-300">
            {openTablesAmount.toLocaleString()} s
          </span>
        </div>

        <div className="bg-red-50/80 dark:bg-red-900/20 px-5 py-4 rounded-2xl border border-red-200 dark:border-red-800/50 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📓</span>
            <div>
              <p className="text-xs font-black uppercase text-red-600 dark:text-red-400">
                Qarz Daftari (Nasiya)
              </p>
              <p className="text-[11px] font-bold text-gray-500">
                Kutilayotgan {debtOrders.length} ta qarz cheki
              </p>
            </div>
          </div>
          <span className="text-lg font-black text-red-600 dark:text-red-400">
            {totalDebtAmount.toLocaleString()} s
          </span>
        </div>
      </div>

      {/* 1. KPI Kartochkalar (6 ta to'liq moliyaviy ko'rsatkich + Xarajatlar) */}
      <StatsOverviewCards 
        totalRevenue={totalRevenue}
        totalFoodCost={totalFoodCost}
        totalExpenses={expenseMetrics.operationalExpenses}
        totalInkassatsiya={expenseMetrics.inkassatsiyaAmount}
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

      {/* 3. SMENA XARAJATLARI VA INKASSATSIYA TAFSILOTLARI JADVALI */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h3 className="text-lg md:text-xl font-black text-gray-900 dark:text-white">
              💸 Kassa Xarajatlari va Inkassatsiya Hisoboti ({scopedExpenses.length} ta)
            </h3>
            <p className="text-xs font-bold text-gray-500 mt-0.5">
              Kassir tomonidan smena davomida kiritilgan barcha chiqimlar va rahbarga topshirilgan pullar
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-black">
            <span className="px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300">
              📉 Xarajatlar: -{expenseMetrics.operationalExpenses.toLocaleString()} s
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300">
              🏦 Inkassatsiya: {expenseMetrics.inkassatsiyaAmount.toLocaleString()} s
            </span>
          </div>
        </div>

        {scopedExpenses.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 dark:bg-gray-900/40 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 text-gray-400 font-bold text-sm">
            Ushbu davrda kassadan chiqim yoki xarajat qilinmagan.
          </div>
        ) : (
          <div className="overflow-x-auto bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700 text-xs font-black text-gray-500 uppercase">
                  <th className="p-3.5">Vaqt</th>
                  <th className="p-3.5">Toifa</th>
                  <th className="p-3.5">Sababi / Izoh</th>
                  <th className="p-3.5">Olgan shaxs / Kassir</th>
                  <th className="p-3.5 text-right">Summa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/70 dark:divide-gray-700 text-xs sm:text-sm font-bold">
                {scopedExpenses.map(exp => (
                  <tr key={exp.id} className="hover:bg-white dark:hover:bg-gray-800 transition">
                    <td className="p-3.5 text-gray-500 whitespace-nowrap">{exp.date}</td>
                    <td className="p-3.5">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${
                        exp.isInkassatsiya || exp.category === 'Inkassatsiya'
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                      }`}>
                        {exp.categoryLabel || exp.category}
                      </span>
                    </td>
                    <td className="p-3.5 text-gray-900 dark:text-white font-black">{exp.note}</td>
                    <td className="p-3.5 text-gray-500">
                      {exp.recipient && exp.recipient !== '-' ? `${exp.recipient} • ` : ''}{exp.cashierName} ({exp.paymentSource})
                    </td>
                    <td className="p-3.5 text-right font-black text-red-600 dark:text-red-400 whitespace-nowrap">
                      -{Number(exp.amount || 0).toLocaleString()} so'm
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Top Taomlar va Smenani Yopish tugmasi */}
      <StatsPopularItems 
        popularItems={popularItems}
        onCloseShift={handleCloseShift}
      />
      
    </div>
  );
}