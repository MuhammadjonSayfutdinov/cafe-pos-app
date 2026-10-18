import React, { useState, useMemo, useEffect, useRef } from 'react';
import useSticky from '../hooks/useSticky';
import StatsOverviewCards from './StatsOverviewCards';
import StatsPaymentBreakdown from './StatsPaymentBreakdown';
import StatsPopularItems from './StatsPopularItems';
import PrintReceiptModal from './PrintReceiptModal';

// ===============================================
// 1. O'LCHOV BIRLIKLARI KONVERTORI (TANNARX UCHUN)
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

// ===============================================
// 2. SANANI UNIVERSAL O'QISH VA FORMATLASH
// ===============================================
const parseRecordTimestamp = (record) => {
  if (!record) return Date.now();

  if (record.closedAtMs && !isNaN(Number(record.closedAtMs))) return Number(record.closedAtMs);
  if (record.createdAt && !isNaN(Number(record.createdAt))) return Number(record.createdAt);

  const rawStr = String(record.closeTime || record.archiveDate || record.date || '').trim();
  if (rawStr) {
    // DD.MM.YYYY (17.10.2026) formatini aniqlash
    const dmy = rawStr.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (dmy) {
      const day = Number(dmy[1]);
      const month = Number(dmy[2]) - 1;
      const year = Number(dmy[3]);
      const hm = rawStr.match(/(\d{1,2}):(\d{2})/);
      const hh = hm ? Number(hm[1]) : 12;
      const mm = hm ? Number(hm[2]) : 0;
      const dt = new Date(year, month, day, hh, mm).getTime();
      if (!isNaN(dt)) return dt;
    }

    const parsed = Date.parse(rawStr);
    if (!isNaN(parsed)) return parsed;
  }

  const idDigits = String(record.id || '').match(/\d{13}/);
  if (idDigits) {
    const ms = Number(idDigits[0]);
    if (ms > 1600000000000 && ms <= Date.now() + 86400000) return ms;
  }

  return Date.now();
};

const toDateInputStr = (dateObj) => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const escapeHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// ===============================================
// 3. OFITSIANT MAOSH STAVKASI STANDART QOIDASI
// ===============================================
const DEFAULT_WAITER_RULE = {
  serviceSharePercent: 100, // Yig'ilgan xizmat haqidan ofitsiantga tegishli % (Masalan: 100% yoki 70%)
  salesBonusPercent: 0,     // Taom savdosidan qo'shimcha % bonus
  dailyShiftRate: 0,        // 1 kunlik (smena) chiqish puli (so'm)
  fixedMonthlySalary: 0,    // Oylik fiks oklad (so'm)
  manualBonus: 0,           // Qo'shimcha mukofot (+)
  manualDeduction: 0,       // Qo'shimcha avans / jarima (-)
  note: ''
};

export default function StatsMode({ 
  orders, 
  setOrders, 
  menuItems,
  inventory,
  expenses,
  setExpenses,
  users,
  serviceFee,
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
  const [stickyUsers] = useSticky('pos_users', []);
  const [stickyServiceFee] = useSticky('pos_service_fee', 10);
  const [stickyCafeName] = useSticky('pos_cafe_name', 'Premium Cafe');
  const [, setStickyAuditLogs] = useSticky('pos_audit_logs', []);

  // Telefon MB-Sarfi uslubidagi Maqsadli Daromad Limiti (Kunlik/Oylik plan)
  const [revenueTargetLimit, setRevenueTargetLimit] = useSticky('pos_revenue_target_limit', 5000000);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [tempTargetInput, setTempTargetInput] = useState('');

  // Ofitsiantlar maosh va ulush qoidalari xotirasi
  const [payrollRules, setPayrollRules] = useSticky('pos_waiter_payroll_rules', {});

  // Ko'rish rejimi: 'current' (Joriy smena) | 'archived' (Arxiv) | 'all' (Barcha vaqt)
  const [viewScope, setViewScope] = useState('current');
  const [tgSending, setTgSending] = useState(false);

  // DAVR VA SANA ORALIG'I FILTRI
  // 'shift_all' | 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'custom'
  const [periodPreset, setPeriodPreset] = useState('shift_all');

  const todayDateStr = useMemo(() => toDateInputStr(new Date()), []);
  const monthStartStr = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    return toDateInputStr(d);
  }, []);

  const [startDate, setStartDate] = useState(monthStartStr);
  const [endDate, setEndDate] = useState(todayDateStr);
  const [selectedMonthPicker, setSelectedMonthPicker] = useState(() => todayDateStr.slice(0, 7));

  // CHEKLAR RO'YXATI VA ICHKI MA'LUMOTLARINI KO'RISH STATE'LARI
  const [isReceiptsModalOpen, setIsReceiptsModalOpen] = useState(false);
  const [receiptsModalCategory, setReceiptsModalCategory] = useState('paid'); // 'paid' | 'debt' | 'open'
  const [receiptSearchQuery, setReceiptSearchQuery] = useState('');
  const [receiptPaymentFilter, setReceiptPaymentFilter] = useState('Barchasi');
  const [selectedDetailOrder, setSelectedDetailOrder] = useState(null);
  const [reprintOrderData, setReprintOrderData] = useState(null);

  // OFITSIANTLAR ULUSHI VA OYLIK MAOSH JADVALI STATE'LARI
  const payrollSectionRef = useRef(null);
  const [payrollDateMode, setPayrollDateMode] = useState('sync'); // 'sync' | 'today' | 'week' | 'month' | 'last_month' | 'custom'
  const [isPayrollDateOpen, setIsPayrollDateOpen] = useState(false);
  const [payrollCustomStart, setPayrollCustomStart] = useState(monthStartStr);
  const [payrollCustomEnd, setPayrollCustomEnd] = useState(todayDateStr);
  const [waiterSearchQuery, setWaiterSearchQuery] = useState('');
  const [editingWaiterName, setEditingWaiterName] = useState(null);
  const [waiterRuleForm, setWaiterRuleForm] = useState(DEFAULT_WAITER_RULE);
  const [inspectingWaiterRow, setInspectingWaiterRow] = useState(null);

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

  const safeUsers = useMemo(() => {
    if (Array.isArray(users) && users.length > 0) return users;
    return Array.isArray(stickyUsers) ? stickyUsers : [];
  }, [users, stickyUsers]);

  const resolvedServiceFee = serviceFee !== undefined ? Number(serviceFee) : Number(stickyServiceFee ?? 10);

  const updateOrdersState = typeof setOrders === 'function' ? setOrders : setStickyOrders;
  const updateExpensesState = typeof setExpenses === 'function' ? setExpenses : setStickyExpenses;

  // ===============================================
  // 2. SANA ORALIG'I CHEGARALARINI (START/END MS) HISOBLASH
  // ===============================================
  const activeDateRange = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

    if (periodPreset === 'today') {
      return {
        isFiltered: true,
        startMs: todayStart,
        endMs: todayEnd,
        label: `Bugun (${now.toLocaleDateString()})`
      };
    }

    if (periodPreset === 'yesterday') {
      const yStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      const yEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      return {
        isFiltered: true,
        startMs: yStart.getTime(),
        endMs: yEnd.getTime(),
        label: `Kecha (${yStart.toLocaleDateString()})`
      };
    }

    if (periodPreset === 'week') {
      const wStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
      return {
        isFiltered: true,
        startMs: wStart.getTime(),
        endMs: todayEnd,
        label: `Oxirgi 7 kun (${wStart.toLocaleDateString()} — ${now.toLocaleDateString()})`
      };
    }

    if (periodPreset === 'month') {
      const mStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return {
        isFiltered: true,
        startMs: mStart.getTime(),
        endMs: todayEnd,
        label: `Shu oy (${mStart.toLocaleDateString()} — ${now.toLocaleDateString()})`
      };
    }

    if (periodPreset === 'last_month') {
      const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return {
        isFiltered: true,
        startMs: lmStart.getTime(),
        endMs: lmEnd.getTime(),
        label: `O'tgan oy (${lmStart.toLocaleDateString()} — ${lmEnd.toLocaleDateString()})`
      };
    }

    if (periodPreset === 'custom') {
      let sMs = 0;
      let eMs = todayEnd;
      if (startDate) {
        const [sy, sm, sd] = startDate.split('-').map(Number);
        sMs = new Date(sy, sm - 1, sd, 0, 0, 0, 0).getTime();
      }
      if (endDate) {
        const [ey, em, ed] = endDate.split('-').map(Number);
        eMs = new Date(ey, em - 1, ed, 23, 59, 59, 999).getTime();
      }
      return {
        isFiltered: true,
        startMs: sMs,
        endMs: eMs,
        label: `${startDate || '...'} dan ${endDate || '...'} gacha`
      };
    }

    return {
      isFiltered: false,
      startMs: 0,
      endMs: Number.MAX_SAFE_INTEGER,
      label: viewScope === 'current' ? 'Joriy Smena' : viewScope === 'archived' ? 'Arxivlangan Smenalar' : 'Barcha Vaqt'
    };
  }, [periodPreset, startDate, endDate, viewScope]);

  const handleMonthPickerChange = (yyyyMm) => {
    setSelectedMonthPicker(yyyyMm);
    if (!yyyyMm) return;
    const [y, m] = yyyyMm.split('-').map(Number);
    if (!y || !m) return;

    const firstDay = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0);
    setStartDate(toDateInputStr(firstDay));
    setEndDate(toDateInputStr(lastDay));
    setPeriodPreset('custom');
  };

  // ===============================================
  // 3. XAVFSIZ MOLIYAVIY VA TANNARX HISOBLAGICHLARI
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

  const getOrderSubTotal = (order) => {
    if (!order) return 0;
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

  const getOrderFinalAmount = (order) => {
    if (!order) return 0;
    if (order.finalTotal !== undefined) return Number(order.finalTotal) || 0;
    if (order.total !== undefined) return Number(order.total) || 0;
    return getOrderSubTotal(order);
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
    const sub = getOrderSubTotal(order);
    const pct = Number(order.serviceFee ?? resolvedServiceFee) || 0;
    return Math.round((sub * pct) / 100);
  };

  const getOrderDiscount = (order) => {
    if (!order) return 0;
    return Number(order.discountAmount ?? order.discount ?? 0) || 0;
  };

  // ===============================================
  // 4. CHEKLAR VA XARAJATLARNI SMENA HAMDA SANA ORALIG'IGA QARAB AJRATISH
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
    let baseList = currentShiftPaidOrders;
    if (activeDateRange.isFiltered) {
      baseList = viewScope === 'archived'
        ? archivedPaidOrders
        : [...currentShiftPaidOrders, ...archivedPaidOrders];
    } else {
      if (viewScope === 'archived') baseList = archivedPaidOrders;
      if (viewScope === 'all') baseList = [...currentShiftPaidOrders, ...archivedPaidOrders];
    }

    if (!activeDateRange.isFiltered) return baseList;

    return baseList.filter(o => {
      const ts = parseRecordTimestamp(o);
      return ts >= activeDateRange.startMs && ts <= activeDateRange.endMs;
    });
  }, [
    viewScope,
    currentShiftPaidOrders,
    archivedPaidOrders,
    activeDateRange
  ]);

  const scopedExpenses = useMemo(() => {
    let baseExp = safeExpenses.filter(e => e && e.status !== 'Arxiv');
    if (activeDateRange.isFiltered || viewScope === 'all') {
      baseExp = safeExpenses.filter(Boolean);
    } else if (viewScope === 'archived') {
      baseExp = safeExpenses.filter(e => e && e.status === 'Arxiv');
    }

    if (!activeDateRange.isFiltered) return baseExp;

    return baseExp.filter(e => {
      const ts = parseRecordTimestamp(e);
      return ts >= activeDateRange.startMs && ts <= activeDateRange.endMs;
    });
  }, [safeExpenses, viewScope, activeDateRange]);

  // ===============================================
  // 5. ASOSIY MOLIYAVIY KO'RSATKICHLAR VA KUNLIK GRAFIK
  // ===============================================
  const totalRevenue = useMemo(() => {
    return completedOrders.reduce((sum, order) => sum + getOrderFinalAmount(order), 0);
  }, [completedOrders]);

  const totalFoodCost = useMemo(() => {
    return completedOrders.reduce((sum, order) => sum + getOrderFoodCost(order), 0);
  }, [completedOrders, safeMenu, safeInventory]);

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

  const dailyRevenueBreakdown = useMemo(() => {
    const map = {};
    completedOrders.forEach(o => {
      const ts = parseRecordTimestamp(o);
      const dObj = new Date(ts);
      const key = toDateInputStr(dObj);
      const label = dObj.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short' });
      const rev = getOrderFinalAmount(o);

      if (!map[key]) {
        map[key] = { dateKey: key, label, revenue: 0, count: 0 };
      }
      map[key].revenue += rev;
      map[key].count += 1;
    });

    const list = Object.values(map).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    const maxDayRev = list.reduce((m, item) => Math.max(m, item.revenue), 0) || 1;
    return { list: list.slice(-14), maxDayRev };
  }, [completedOrders]);

  const targetProgressPct = useMemo(() => {
    const limit = Math.max(1, Number(revenueTargetLimit) || 5000000);
    return Math.min(100, Number(((totalRevenue / limit) * 100).toFixed(1)));
  }, [totalRevenue, revenueTargetLimit]);
  
  // ===============================================
  // 6. TO'LOV TURLARI VA SEYFDAGI ANIQ NAQD PUL
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
  // 7. OFITSIANTLAR ULUSHI VA OYLIK MAOSH HISOB-KITOBI (HR PAYROLL)
  // ===============================================
  const { payrollFilteredOrders, payrollFilteredExpenses, payrollPeriodLabel } = useMemo(() => {
    if (payrollDateMode === 'sync') {
      return {
        payrollFilteredOrders: completedOrders,
        payrollFilteredExpenses: scopedExpenses,
        payrollPeriodLabel: activeDateRange.label
      };
    }

    const now = new Date();
    let sMs = 0;
    let eMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    let label = 'Tanlangan davr';

    if (payrollDateMode === 'today') {
      sMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
      label = `Bugun (${now.toLocaleDateString()})`;
    } else if (payrollDateMode === 'week') {
      const w = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
      sMs = w.getTime();
      label = 'Oxirgi 7 kun';
    } else if (payrollDateMode === 'month') {
      const m = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      sMs = m.getTime();
      label = 'Shu oy (Oylik maosh)';
    } else if (payrollDateMode === 'last_month') {
      const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      sMs = lmStart.getTime();
      eMs = lmEnd.getTime();
      label = "O'tgan oy";
    } else if (payrollDateMode === 'custom') {
      if (payrollCustomStart) {
        const [sy, sm, sd] = payrollCustomStart.split('-').map(Number);
        sMs = new Date(sy, sm - 1, sd, 0, 0, 0, 0).getTime();
      }
      if (payrollCustomEnd) {
        const [ey, em, ed] = payrollCustomEnd.split('-').map(Number);
        eMs = new Date(ey, em - 1, ed, 23, 59, 59, 999).getTime();
      }
      label = `${payrollCustomStart} dan ${payrollCustomEnd} gacha`;
    }

    const matchingOrders = safeOrders.filter(o => {
      if (!o || !["To'langan", 'Arxiv'].includes(o.status)) return false;
      const t = parseRecordTimestamp(o);
      return t >= sMs && t <= eMs;
    });

    const matchingExpenses = safeExpenses.filter(e => {
      if (!e) return false;
      const t = parseRecordTimestamp(e);
      return t >= sMs && t <= eMs;
    });

    return {
      payrollFilteredOrders: matchingOrders,
      payrollFilteredExpenses: matchingExpenses,
      payrollPeriodLabel: label
    };
  }, [
    payrollDateMode,
    completedOrders,
    scopedExpenses,
    activeDateRange.label,
    safeOrders,
    safeExpenses,
    payrollCustomStart,
    payrollCustomEnd
  ]);

  const waiterPayrollRows = useMemo(() => {
    const map = {};

    // 1. Bazadagi ofitsiant xodimlarni ro'yxatga qo'shamiz
    safeUsers.forEach(u => {
      if (!u || !u.name) return;
      const roleLower = String(u.role || '').toLowerCase();
      if (roleLower === 'waiter' || roleLower === 'ofitsiant') {
        const key = String(u.name).trim();
        map[key] = {
          waiterName: key,
          ordersCount: 0,
          portionsCount: 0,
          workedDaysSet: new Set(),
          subTotalSales: 0,
          totalRevenue: 0,
          totalServiceFeeGenerated: 0,
          ordersList: []
        };
      }
    });

    // 2. Yopilgan cheklarni ofitsiantlar bo'yicha yig'amiz
    payrollFilteredOrders.forEach(order => {
      if (!order) return;
      const rawWaiter = String(order.waiterName || order.waiter || 'Ofitsiant').trim();

      if (!map[rawWaiter]) {
        map[rawWaiter] = {
          waiterName: rawWaiter,
          ordersCount: 0,
          portionsCount: 0,
          workedDaysSet: new Set(),
          subTotalSales: 0,
          totalRevenue: 0,
          totalServiceFeeGenerated: 0,
          ordersList: []
        };
      }

      const items = Array.isArray(order.items) ? order.items : [];
      const sub = getOrderSubTotal(order);
      const feeAmt = getOrderServiceFee(order);
      const finalAmt = getOrderFinalAmount(order);
      const portions = items.reduce((s, it) => s + (Number(it?.quantity ?? it?.qty ?? 1) || 0), 0);
      const dayKey = toDateInputStr(new Date(parseRecordTimestamp(order)));

      map[rawWaiter].ordersCount += 1;
      map[rawWaiter].portionsCount += portions;
      map[rawWaiter].workedDaysSet.add(dayKey);
      map[rawWaiter].subTotalSales += sub;
      map[rawWaiter].totalRevenue += finalAmt;
      map[rawWaiter].totalServiceFeeGenerated += feeAmt;
      map[rawWaiter].ordersList.push({
        ...order,
        computedSub: sub,
        computedFee: feeAmt,
        computedFinal: finalAmt,
        computedPortions: portions
      });
    });

    // 3. Har bir ofitsiant uchun ulush, oklad va avansni hisoblaymiz
    const rows = Object.values(map).map(w => {
      const rule = {
        ...DEFAULT_WAITER_RULE,
        ...((payrollRules && payrollRules[w.waiterName]) || {})
      };

      const workedDaysCount = w.workedDaysSet.size;
      const serviceShareEarned = Math.round(
        (w.totalServiceFeeGenerated * (Number(rule.serviceSharePercent) || 0)) / 100
      );
      const salesBonusEarned = Math.round(
        (w.subTotalSales * (Number(rule.salesBonusPercent) || 0)) / 100
      );
      const shiftSalaryEarned = workedDaysCount * (Number(rule.dailyShiftRate) || 0);
      const fixedSalary = Number(rule.fixedMonthlySalary) || 0;

      // Kassadan shu ofitsiant nomiga berilgan "Avans" chiqimlarini avtomatik topish
      const nameLower = w.waiterName.toLowerCase();
      const cashierAdvances = payrollFilteredExpenses
        .filter(exp => {
          if (!exp || exp.category !== 'Avans') return false;
          const rec = String(exp.recipient || '').toLowerCase();
          const note = String(exp.note || '').toLowerCase();
          return rec.includes(nameLower) || note.includes(nameLower);
        })
        .reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

      const manualBonus = Number(rule.manualBonus) || 0;
      const manualDeduction = Number(rule.manualDeduction) || 0;
      const totalDeductions = cashierAdvances + manualDeduction;

      const grossEarned =
        serviceShareEarned +
        salesBonusEarned +
        shiftSalaryEarned +
        fixedSalary +
        manualBonus;

      const netPayableSalary = grossEarned - totalDeductions;

      return {
        ...w,
        workedDaysCount,
        rule,
        serviceShareEarned,
        salesBonusEarned,
        shiftSalaryEarned,
        fixedSalary,
        cashierAdvances,
        manualBonus,
        manualDeduction,
        totalDeductions,
        grossEarned,
        netPayableSalary
      };
    });

    return rows
      .filter(r => {
        if (!waiterSearchQuery.trim()) return true;
        return r.waiterName.toLowerCase().includes(waiterSearchQuery.trim().toLowerCase());
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue || b.netPayableSalary - a.netPayableSalary);
  }, [safeUsers, payrollFilteredOrders, payrollFilteredExpenses, payrollRules, waiterSearchQuery, resolvedServiceFee]);

  const payrollTotalsSummary = useMemo(() => {
    return waiterPayrollRows.reduce(
      (acc, r) => {
        acc.totalOrders += r.ordersCount;
        acc.totalSales += r.totalRevenue;
        acc.totalServiceCollected += r.totalServiceFeeGenerated;
        acc.totalWaiterServiceShare += r.serviceShareEarned;
        acc.totalAdvances += r.totalDeductions;
        acc.totalNetPayable += r.netPayableSalary;
        return acc;
      },
      {
        totalOrders: 0,
        totalSales: 0,
        totalServiceCollected: 0,
        totalWaiterServiceShare: 0,
        totalAdvances: 0,
        totalNetPayable: 0
      }
    );
  }, [waiterPayrollRows]);

  const handleOpenEditWaiterRule = (waiterRow) => {
    setEditingWaiterName(waiterRow.waiterName);
    setWaiterRuleForm({
      ...DEFAULT_WAITER_RULE,
      ...((payrollRules && payrollRules[waiterRow.waiterName]) || {})
    });
  };

  const handleSaveWaiterRule = (e) => {
    e.preventDefault();
    if (!editingWaiterName) return;

    const cleaned = {
      serviceSharePercent: Math.min(100, Math.max(0, Number(waiterRuleForm.serviceSharePercent) || 0)),
      salesBonusPercent: Math.min(100, Math.max(0, Number(waiterRuleForm.salesBonusPercent) || 0)),
      dailyShiftRate: Math.max(0, Number(waiterRuleForm.dailyShiftRate) || 0),
      fixedMonthlySalary: Math.max(0, Number(waiterRuleForm.fixedMonthlySalary) || 0),
      manualBonus: Math.max(0, Number(waiterRuleForm.manualBonus) || 0),
      manualDeduction: Math.max(0, Number(waiterRuleForm.manualDeduction) || 0),
      note: String(waiterRuleForm.note || '').trim()
    };

    setPayrollRules(prev => ({
      ...(prev || {}),
      [editingWaiterName]: cleaned
    }));

    if (typeof addAuditLog === 'function') {
      addAuditLog(
        'Ofitsiant maosh stavkasi yangilandi',
        `${editingWaiterName}: Xizmat ulushi ${cleaned.serviceSharePercent}%, Kunlik: ${cleaned.dailyShiftRate.toLocaleString()} s, Oklad: ${cleaned.fixedMonthlySalary.toLocaleString()} s`
      );
    }

    setEditingWaiterName(null);
  };

  const handleExportPayrollVedomost = () => {
    const lines = [
      `========================================================`,
      `👨‍🍳 OFITSIANTLAR ULUSHI VA OYLIK MAOSH VEDOMOSTI`,
      `Davr: ${payrollPeriodLabel}`,
      `Sana: ${new Date().toLocaleString()}`,
      `========================================================\n`,
      ...waiterPayrollRows.map(
        (r, i) =>
          `${i + 1}. ${r.waiterName} (${r.workedDaysCount} smena | ${r.ordersCount} ta chek | ${r.portionsCount} pors)\n` +
          `   • Jami savdosi: ${r.totalRevenue.toLocaleString()} so'm\n` +
          `   • Yig'ilgan xizmat haqi: ${r.totalServiceFeeGenerated.toLocaleString()} so'm\n` +
          `   • Xizmatdan ulushi (${r.rule.serviceSharePercent}%): +${r.serviceShareEarned.toLocaleString()} so'm\n` +
          (r.salesBonusEarned > 0 ? `   • Savdodan bonus (${r.rule.salesBonusPercent}%): +${r.salesBonusEarned.toLocaleString()} so'm\n` : '') +
          (r.shiftSalaryEarned + r.fixedSalary > 0 ? `   • Oklad / Smena puli: +${(r.shiftSalaryEarned + r.fixedSalary).toLocaleString()} so'm\n` : '') +
          (r.manualBonus > 0 ? `   • Qo'shimcha mukofot: +${r.manualBonus.toLocaleString()} so'm\n` : '') +
          (r.totalDeductions > 0 ? `   • Olingan Avans / Jarima: -${r.totalDeductions.toLocaleString()} so'm\n` : '') +
          `   💰 QO'LGA TEGADIGAN SOF MAOSH: ${r.netPayableSalary.toLocaleString()} so'm\n`
      ),
      `--------------------------------------------------------`,
      `JAMI TO'LANADIGAN MAOSH FONDI: ${payrollTotalsSummary.totalNetPayable.toLocaleString()} so'm`
    ].join('\n');

    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ofitsiantlar-maoshi-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ===============================================
  // 8. TAOMLAR BO'YICHA STATISTIKA (TOP-5)
  // ===============================================
  const popularItems = useMemo(() => {
    const itemsStats = {};
    const ordersToCount = viewScope === 'archived' 
      ? completedOrders 
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
      .slice(0, 15);
  }, [completedOrders, debtOrders, viewScope, safeMenu, safeInventory]);

  // ===============================================
  // 9. CHEKLAR RO'YXATI MODALIDAGI FILTRLANGAN CHEKLAR
  // ===============================================
  const modalFilteredReceipts = useMemo(() => {
    let source = completedOrders;
    if (receiptsModalCategory === 'debt') source = debtOrders;
    if (receiptsModalCategory === 'open') source = openActiveOrders;

    return source
      .filter(o => {
        if (!o) return false;
        if (receiptPaymentFilter !== 'Barchasi' && (o.paymentMethod || 'Naqd') !== receiptPaymentFilter) {
          return false;
        }
        if (receiptSearchQuery.trim() !== '') {
          const q = receiptSearchQuery.trim().toLowerCase();
          const matchId = String(o.id || '').toLowerCase().includes(q);
          const matchTable = String(o.table || '').toLowerCase().includes(q);
          const matchWaiter = String(o.waiterName || o.waiter || '').toLowerCase().includes(q);
          const matchCustomer = String(o.customerName || o.debtorName || '').toLowerCase().includes(q);
          const matchItem = Array.isArray(o.items) && o.items.some(it => String(it?.name || '').toLowerCase().includes(q));
          return matchId || matchTable || matchWaiter || matchCustomer || matchItem;
        }
        return true;
      })
      .sort((a, b) => parseRecordTimestamp(b) - parseRecordTimestamp(a));
  }, [completedOrders, debtOrders, openActiveOrders, receiptsModalCategory, receiptPaymentFilter, receiptSearchQuery]);

  const handleOpenReceiptsExplorer = (category = 'paid') => {
    setReceiptsModalCategory(category);
    const initialList =
      category === 'debt' ? debtOrders : category === 'open' ? openActiveOrders : completedOrders;
    setSelectedDetailOrder(initialList[0] || null);
    setIsReceiptsModalOpen(true);
  };

  // ===============================================
  // 10. TELEGRAMGA Z-OTCHYOT YUBORISH, .TXT YUKLASH VA SMENA YOPISH
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
        `📊 <b>Z-OTCHYOT VA DAVR HISOBOTI</b>`,
        `🏪 <b>Kafe:</b> ${escapeHtml(stickyCafeName)}`,
        `📅 <b>Davr:</b> ${escapeHtml(customLabel || activeDateRange.label)}`,
        `━━━━━━━━━━━━━━━━━━`,
        `💰 <b>JAMI SAVDO TUSHUMI:</b> ${totalRevenue.toLocaleString()} so'm (${totalOrdersCount} ta chek)`,
        `🥩 <b>Xomashyo Tannarxi (COGS):</b> -${totalFoodCost.toLocaleString()} so'm`,
        `💸 <b>Kunlik Xarajatlar:</b> -${expenseMetrics.operationalExpenses.toLocaleString()} so'm`,
        `💎 <b>HAQIQIY SOF FOYDA:</b> <b>+${totalNetProfit.toLocaleString()} so'm</b>`,
        `━━━━━━━━━━━━━━━━━━`,
        `👨‍🍳 <b>Ofitsiantlar ulushi (Maosh):</b> ${payrollTotalsSummary.totalNetPayable.toLocaleString()} so'm`,
        `🏦 <b>Inkassatsiya:</b> ${expenseMetrics.inkassatsiyaAmount.toLocaleString()} so'm`,
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
      alert('✅ Hisobot Telegramga muvaffaqiyatli yuborildi!');
    } else {
      alert(`❌ ${res.error}`);
    }
  };

  const handleExportZReport = () => {
    const reportLines = [
      `==================================================`,
      `📊 Z-OTCHYOT VA MOLIYAVIY HISOBOT (${activeDateRange.label})`,
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
      `2. OFITSIANTLAR ULUSHI VA MAOSHI:`,
      ...waiterPayrollRows.map(
        (r, idx) =>
          `${idx + 1}. ${r.waiterName} — ${r.ordersCount} ta chek | Savdo: ${r.totalRevenue.toLocaleString()} s | Qo'lga tegadigan maosh: ${r.netPayableSalary.toLocaleString()} so'm`
      ),
      `\n3. TO'LOV TURLARI BO'YICHA:`,
      ...Object.entries(paymentStats).map(([k, v]) => `• ${k}: ${Number(v || 0).toLocaleString()} so'm`),
      `\n4. YOPILGAN CHEKLAR RO'YXATI (${completedOrders.length} ta):`,
      ...(completedOrders.length > 0
        ? completedOrders.map((o, idx) =>
            `${idx + 1}. #${String(o.id).slice(-4)} | ${o.table} | ${o.closeTime || o.date} | ${o.paymentMethod || 'Naqd'} | ${getOrderFinalAmount(o).toLocaleString()} so'm`
          )
        : ['Cheklar mavjud emas']),
      `\n5. KASSA CHIQIMLARI VA XARAJATLAR (${scopedExpenses.length} ta):`,
      ...(scopedExpenses.length > 0
        ? scopedExpenses.map((e, i) => `${i + 1}. [${e.date}] ${e.category}: -${Number(e.amount).toLocaleString()} s (${e.paymentSource}) — ${e.note}`)
        : ['Xarajatlar kiritilmagan'])
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
    const activeShiftExpenses = safeExpenses.filter(e => e && e.status !== 'Arxiv');

    if (currentShiftPaidOrders.length === 0 && activeShiftExpenses.length === 0) {
      alert("ℹ️ Hozirgi smenada yopilishi kerak bo'lgan yangi cheklar yoki xarajatlar yo'q!");
      return;
    }

    const shiftRev = currentShiftPaidOrders.reduce((s, o) => s + getOrderFinalAmount(o), 0);
    const shiftCost = currentShiftPaidOrders.reduce((s, o) => s + getOrderFoodCost(o), 0);
    const shiftExp = activeShiftExpenses
      .filter(e => !e.isInkassatsiya && e.category !== 'Inkassatsiya')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const shiftNet = shiftRev - shiftCost - shiftExp;

    const openWarning = openActiveOrders.length > 0
      ? `\n\n⚠️ Eslatma: Zalda hali yopilmagan ${openActiveOrders.length} ta faol stol (${openTablesAmount.toLocaleString()} so'm) mavjud. Ular keyingi smenada ochiq qoladi.`
      : '';

    const confirmMsg = 
      `⚠️ Diqqat! Z-Otchyotni (Smenani) yopmoqchimisiz?\n\n` +
      `• Yopilgan cheklar: ${currentShiftPaidOrders.length} ta\n` +
      `• Smena tushumi: ${shiftRev.toLocaleString()} so'm\n` +
      `• Xomashyo tannarxi (COGS): -${shiftCost.toLocaleString()} so'm\n` +
      `• Kunlik xarajatlar: -${shiftExp.toLocaleString()} so'm\n` +
      `• Haqiqiy Sof Foyda: +${shiftNet.toLocaleString()} so'm\n\n` +
      `Tasdiqlasangiz, barcha cheklar va xarajatlar Arxivga o'tkaziladi hamda joriy kassa nollanadi.${openWarning}`;

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

    updateExpensesState(prev => {
      const list = Array.isArray(prev) ? prev : safeExpenses;
      return list.map(exp => {
        if (exp && exp.status !== 'Arxiv') {
          return { ...exp, status: 'Arxiv', archiveDate: archiveDateStr };
        }
        return exp;
      });
    });

    sendReportToTelegram('Smena Yopildi (Z-Otchyot)');

    const logDetails = `Smena yopildi: Tushum ${shiftRev.toLocaleString()} s | Xarajat: -${shiftExp.toLocaleString()} s | Sof foyda: +${shiftNet.toLocaleString()} s`;
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

    alert(`✅ Smena muvaffaqiyatli yopildi!\nSof foyda: +${shiftNet.toLocaleString()} so'm`);
  };

  // ===============================================
  // 11. RENDER (UI KOMPONENTLAR)
  // ===============================================
  return (
    <div className="animate-fade-in max-w-7xl mx-auto pb-12 space-y-6">
      
      {/* YUQORI SARLAVHA, OFITSIANTLAR TUGMASI, CHEKLAR TUGMASI, TELEGRAM VA SMENA FILTRI */}
      <div className="bg-white dark:bg-gray-800 p-5 md:p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3">
            <span className="text-3xl md:text-4xl">📈</span> Moliya, Cheklar va Z-Otchyot Markazi
          </h2>
          <p className="text-xs sm:text-sm font-bold text-gray-500 mt-1">
            Sanalar oralig'idagi daromad, yopilgan cheklarning ichki tarkibi, ofitsiantlar ulushi va sof foyda nazorati.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
          {/* Tezkor Ofitsiantlar Maoshi jadvaliga tushish tugmasi */}
          <button
            type="button"
            onClick={() => payrollSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs shadow-md shadow-amber-500/25 transition active:scale-95 whitespace-nowrap flex items-center gap-1.5"
          >
            <span>👨‍🍳</span> Ofitsiantlar Maoshi ({waiterPayrollRows.length})
          </button>

          <button
            type="button"
            onClick={() => handleOpenReceiptsExplorer('paid')}
            className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-md shadow-indigo-600/25 transition active:scale-95 whitespace-nowrap flex items-center gap-1.5"
          >
            <span>🧾</span> Cheklarni ko'rish ({completedOrders.length})
          </button>

          <button
            type="button"
            onClick={handleManualTelegramShare}
            disabled={tgSending}
            className="px-4 py-2.5 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-black text-xs shadow-md shadow-sky-500/20 transition active:scale-95 whitespace-nowrap disabled:opacity-50"
          >
            {tgSending ? '⏳...' : '✈️ Telegram'}
          </button>

          <button
            type="button"
            onClick={handleExportZReport}
            className="px-3.5 py-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 font-black text-xs border border-emerald-200 dark:border-emerald-800/50 transition active:scale-95 whitespace-nowrap"
          >
            📥 .txt
          </button>

          <div className="flex flex-wrap items-center gap-1 bg-gray-100 dark:bg-gray-900 p-1.5 rounded-2xl flex-1 sm:flex-initial">
            <button
              type="button"
              onClick={() => {
                setViewScope('current');
                setPeriodPreset('shift_all');
              }}
              className={`flex-1 sm:flex-initial px-3 py-2 rounded-xl font-black text-xs transition ${
                viewScope === 'current' && periodPreset === 'shift_all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800'
              }`}
            >
              🟢 Smena ({currentShiftPaidOrders.length})
            </button>

            <button
              type="button"
              onClick={() => {
                setViewScope('archived');
                setPeriodPreset('shift_all');
              }}
              className={`flex-1 sm:flex-initial px-3 py-2 rounded-xl font-black text-xs transition ${
                viewScope === 'archived' && periodPreset === 'shift_all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800'
              }`}
            >
              🗄️ Arxiv ({archivedPaidOrders.length})
            </button>

            <button
              type="button"
              onClick={() => {
                setViewScope('all');
                setPeriodPreset('shift_all');
              }}
              className={`flex-1 sm:flex-initial px-3 py-2 rounded-xl font-black text-xs transition ${
                viewScope === 'all' && periodPreset === 'shift_all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800'
              }`}
            >
              📊 Barchasi ({currentShiftPaidOrders.length + archivedPaidOrders.length})
            </button>
          </div>
        </div>
      </div>

      {/* TELEFON "MB SARFI / TRAFIK LIMITI" USLUBIDAGI SANALAR ORALIG'I FILTRI VA DAROMAD GRAFIGI */}
      <div className="bg-white dark:bg-gray-800 p-5 md:p-6 rounded-3xl shadow-sm border-2 border-indigo-100 dark:border-indigo-900/40 space-y-5">
        
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl font-black">
              📅
            </span>
            <div>
              <h3 className="text-base sm:text-lg font-black text-gray-900 dark:text-white leading-tight">
                Davr va Sanalar Oralig'i Bo'yicha Daromad Filtr-Limiti
              </h3>
              <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                Faol davr: {activeDateRange.label} • {totalOrdersCount} ta chek • Tushum: {totalRevenue.toLocaleString()} so'm
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 w-full xl:w-auto">
            {[
              { id: 'shift_all', label: '⚡ Tanlangan smena' },
              { id: 'today', label: '☀️ Bugun (Kun)' },
              { id: 'yesterday', label: '🌤 Kecha' },
              { id: 'week', label: '📆 Hafta (7 kun)' },
              { id: 'month', label: '🗓 Shu oy' },
              { id: 'last_month', label: "⏪ O'tgan oy" },
              { id: 'custom', label: "🎯 Sana oralig'i (... dan ... gacha)" }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPeriodPreset(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-black transition active:scale-95 ${
                  periodPreset === tab.id
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                    : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-gray-50 dark:bg-gray-900/60 p-4 rounded-2xl border border-gray-200/70 dark:border-gray-700">
          <div>
            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">
              📆 Qaysi sanadan boshlab:
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => {
                setStartDate(e.target.value);
                setPeriodPreset('custom');
              }}
              className="w-full p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-black text-gray-900 dark:text-white outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">
              📆 Qaysi sanagacha:
            </label>
            <input
              type="date"
              value={endDate}
              onChange={e => {
                setEndDate(e.target.value);
                setPeriodPreset('custom');
              }}
              className="w-full p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-black text-gray-900 dark:text-white outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">
              🗓 Istalgan oyni tanlash (O'tgan oylar):
            </label>
            <input
              type="month"
              value={selectedMonthPicker}
              onChange={e => handleMonthPickerChange(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-black text-gray-900 dark:text-white outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => handleOpenReceiptsExplorer('paid')}
              className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs shadow-sm transition active:scale-95 flex items-center justify-center gap-1.5"
            >
              <span>👁</span> Shu davrdagi {completedOrders.length} ta chekni ochish
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-center">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/30 border border-indigo-200/70 dark:border-indigo-800/50 space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-black uppercase text-indigo-700 dark:text-indigo-300">
                🎯 Maqsadli Daromad Plani (Limit)
              </span>
              <button
                type="button"
                onClick={() => {
                  setTempTargetInput(String(revenueTargetLimit));
                  setIsEditingTarget(prev => !prev);
                }}
                className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                ✏️ Planni o'zgartirish
              </button>
            </div>

            {isEditingTarget && (
              <div className="flex gap-2">
                <input
                  type="number"
                  min="100000"
                  step="100000"
                  value={tempTargetInput}
                  onChange={e => setTempTargetInput(e.target.value)}
                  className="flex-1 p-2 rounded-lg bg-white dark:bg-gray-800 border border-indigo-300 text-xs font-black"
                />
                <button
                  type="button"
                  onClick={() => {
                    const v = Number(tempTargetInput);
                    if (v > 0) setRevenueTargetLimit(v);
                    setIsEditingTarget(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-black text-xs"
                >
                  Saqlash
                </button>
              </div>
            )}

            <div className="flex justify-between items-baseline">
              <span className="text-xl font-black text-gray-900 dark:text-white">
                {totalRevenue.toLocaleString()} s
              </span>
              <span className="text-xs font-bold text-gray-500">
                / {Number(revenueTargetLimit).toLocaleString()} s ({targetProgressPct}%)
              </span>
            </div>

            <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden p-0.5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${Math.max(3, targetProgressPct)}%` }}
              />
            </div>

            <div className="flex justify-between text-[11px] font-bold text-gray-500">
              <span>Sof foyda: <strong className="text-emerald-600">+{totalNetProfit.toLocaleString()} s</strong></span>
              <span>Cheklar: <strong className="text-indigo-600">{totalOrdersCount} ta</strong></span>
            </div>
          </div>

          <div className="lg:col-span-2 p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-gray-200/70 dark:border-gray-700">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-black uppercase text-gray-500">
                📊 Kunlar Kesimida Daromad Taqsimoti (Kunni bossangiz cheklari ochiladi)
              </span>
              <span className="text-[11px] font-bold text-gray-400">
                {dailyRevenueBreakdown.list.length} faol kun
              </span>
            </div>

            {dailyRevenueBreakdown.list.length === 0 ? (
              <div className="h-24 flex items-center justify-center text-xs font-bold text-gray-400">
                Ushbu sanalar oralig'ida yopilgan cheklar yo'q
              </div>
            ) : (
              <div className="flex items-end gap-2 h-28 overflow-x-auto pb-1 pt-4">
                {dailyRevenueBreakdown.list.map(dayItem => {
                  const heightPct = Math.max(14, Math.round((dayItem.revenue / dailyRevenueBreakdown.maxDayRev) * 100));
                  return (
                    <div
                      key={dayItem.dateKey}
                      onClick={() => {
                        setStartDate(dayItem.dateKey);
                        setEndDate(dayItem.dateKey);
                        setPeriodPreset('custom');
                      }}
                      className="flex-1 min-w-[54px] flex flex-col items-center justify-end h-full cursor-pointer group"
                      title={`${dayItem.dateKey}: ${dayItem.revenue.toLocaleString()} so'm (${dayItem.count} ta chek)`}
                    >
                      <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 mb-1 opacity-85 group-hover:scale-110 transition">
                        {dayItem.revenue >= 1000000
                          ? `${(dayItem.revenue / 1000000).toFixed(1)}M`
                          : `${Math.round(dayItem.revenue / 1000)}k`}
                      </span>
                      <div className="w-full max-w-[34px] bg-gray-200 dark:bg-gray-700 rounded-t-xl h-16 flex items-end overflow-hidden">
                        <div
                          className="w-full bg-indigo-600 group-hover:bg-amber-500 rounded-t-xl transition-all duration-300"
                          style={{ height: `${heightPct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-black text-gray-500 mt-1 whitespace-nowrap">
                        {dayItem.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
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

        <div
          onClick={() => handleOpenReceiptsExplorer('open')}
          className="bg-amber-50/80 dark:bg-amber-900/20 px-5 py-4 rounded-2xl border border-amber-200 dark:border-amber-800/50 flex justify-between items-center cursor-pointer hover:shadow-md transition"
          title="Bosib zaldagi ochiq stollar cheklarini ko'ring"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🍽️</span>
            <div>
              <p className="text-xs font-black uppercase text-amber-700 dark:text-amber-400">
                Hozir zalda ochiq stollar 👁
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

        <div
          onClick={() => handleOpenReceiptsExplorer('debt')}
          className="bg-red-50/80 dark:bg-red-900/20 px-5 py-4 rounded-2xl border border-red-200 dark:border-red-800/50 flex justify-between items-center cursor-pointer hover:shadow-md transition"
          title="Bosib qarz daftaridagi cheklarni ko'ring"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📓</span>
            <div>
              <p className="text-xs font-black uppercase text-red-600 dark:text-red-400">
                Qarz Daftari (Nasiya) 👁
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

      {/* 1. KPI Kartochkalar */}
      <StatsOverviewCards 
        totalRevenue={totalRevenue}
        totalFoodCost={totalFoodCost}
        totalExpenses={expenseMetrics.operationalExpenses}
        totalInkassatsiya={expenseMetrics.inkassatsiyaAmount}
        totalNetProfit={totalNetProfit}
        totalOrdersCount={totalOrdersCount}
        totalServiceFee={totalServiceFee}
        totalDiscount={totalDiscount}
        periodLabel={activeDateRange.label}
        onOpenReceiptsModal={handleOpenReceiptsExplorer}
      />

      {/* =========================================================================
          2. OFITSIANTLAR ULUSHI VA OYLIK MAOSH HISOBLAGICHI (ICHIGA O'RNATILGAN!)
          ========================================================================= */}
      <div
        ref={payrollSectionRef}
        className="bg-white dark:bg-gray-800 p-5 md:p-6 rounded-3xl shadow-sm border-2 border-amber-200 dark:border-amber-800/60 space-y-5"
      >
        {/* Tepa sarlavha va boshqaruv tugmalari */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-2xl shadow-md shadow-amber-500/25 shrink-0">
              👨‍🍳
            </div>
            <div>
              <h3 className="text-lg md:text-xl font-black text-gray-900 dark:text-white leading-tight">
                Ofitsiantlar Ulushi va Oylik Maosh Hisoblagichi (HR Payroll)
              </h3>
              <p className="text-xs font-bold text-gray-500 mt-0.5">
                Hisob davri: <strong className="text-indigo-600 dark:text-indigo-400">{payrollPeriodLabel}</strong> • Xizmat haqidan ulush, oklad, bonus va kassa avanslari
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-between xl:justify-end">
            <input
              type="text"
              value={waiterSearchQuery}
              onChange={e => setWaiterSearchQuery(e.target.value)}
              placeholder="🔍 Ofitsiant ismi..."
              className="px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-amber-500 w-full sm:w-44"
            />

            <button
              type="button"
              onClick={() => setIsPayrollDateOpen(prev => !prev)}
              className={`px-3.5 py-2 rounded-xl font-black text-xs transition flex items-center gap-1.5 ${
                payrollDateMode !== 'sync' || isPayrollDateOpen
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              <span>📅</span>
              <span>{payrollDateMode === 'sync' ? 'Maosh sanalari' : payrollPeriodLabel}</span>
              <span className="text-[10px]">{isPayrollDateOpen ? '▲' : '▼'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportPayrollVedomost}
              className="px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 font-black text-xs border border-emerald-200 dark:border-emerald-800/50 transition active:scale-95 whitespace-nowrap"
            >
              📥 Vedomost (.txt)
            </button>
          </div>
        </div>

        {/* Ochiluvchi Maosh Sanalari Paneli */}
        {isPayrollDateOpen && (
          <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-gray-900/80 border border-amber-200 dark:border-gray-700 space-y-3 animate-fade-in">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <span className="text-xs font-black uppercase text-amber-800 dark:text-amber-400">
                📅 Maosh va ulushlarni qaysi sanalar oralig'i uchun hisoblaymiz?
              </span>
              {payrollDateMode !== 'sync' && (
                <button
                  type="button"
                  onClick={() => setPayrollDateMode('sync')}
                  className="text-[11px] font-black text-red-500 hover:underline"
                >
                  ✕ Asosiy filtr bilan birxillashtirish
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'sync', label: '🔄 Yuqoridagi filtr bilan birga' },
                { id: 'today', label: '☀️ Bugun (Kunlik ulush)' },
                { id: 'week', label: '📆 Oxirgi 7 kun (Haftalik)' },
                { id: 'month', label: '🗓 Shu oy (Oylik maosh)' },
                { id: 'last_month', label: "⏪ O'tgan oy" },
                { id: 'custom', label: '🎯 Sanadan — Sanagacha' }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPayrollDateMode(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                    payrollDateMode === tab.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {payrollDateMode === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">
                    Boshlanish sanasi (... dan)
                  </label>
                  <input
                    type="date"
                    value={payrollCustomStart}
                    onChange={e => setPayrollCustomStart(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-amber-300 dark:border-gray-700 text-xs font-black text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">
                    Tugash sanasi (... gacha)
                  </label>
                  <input
                    type="date"
                    value={payrollCustomEnd}
                    onChange={e => setPayrollCustomEnd(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-amber-300 dark:border-gray-700 text-xs font-black text-gray-900 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4 ta Mini-Karta: Maosh Fondi Xulosasi */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700">
            <span className="text-[10px] font-black uppercase text-gray-400 block">
              🛎 Jami Yig'ilgan Xizmat Haqi
            </span>
            <span className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400">
              {payrollTotalsSummary.totalServiceCollected.toLocaleString()} s
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700">
            <span className="text-[10px] font-black uppercase text-gray-400 block">
              👨‍🍳 Ofitsiantlar Xizmat Ulushi
            </span>
            <span className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400">
              +{payrollTotalsSummary.totalWaiterServiceShare.toLocaleString()} s
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700">
            <span className="text-[10px] font-black uppercase text-gray-400 block">
              💸 Olingan Avans va Ushlanmalar
            </span>
            <span className="text-base sm:text-lg font-black text-red-500">
              {payrollTotalsSummary.totalAdvances > 0 ? `-${payrollTotalsSummary.totalAdvances.toLocaleString()}` : '0'} s
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50">
            <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400 block">
              💰 Jami Qo'lga Tegadigan Maosh
            </span>
            <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400">
              {payrollTotalsSummary.totalNetPayable.toLocaleString()} s
            </span>
          </div>
        </div>

        {/* Asosiy Ofitsiantlar Jadvali */}
        {waiterPayrollRows.length === 0 ? (
          <div className="text-center py-10 bg-gray-50 dark:bg-gray-900/40 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 text-gray-400 font-bold text-sm">
            Ushbu davrda ofitsiantlar sotuvi topilmadi.
          </div>
        ) : (
          <div className="overflow-x-auto bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700 text-[11px] font-black text-gray-500 uppercase tracking-wider">
                  <th className="p-4">Ofitsiant</th>
                  <th className="p-4 text-center">Smena / Cheklar</th>
                  <th className="p-4">Jami Savdosi</th>
                  <th className="p-4">Yig'ilgan Xizmat</th>
                  <th className="p-4">Xizmatdan Ulushi</th>
                  <th className="p-4">Oklad / Bonus</th>
                  <th className="p-4">Avans / Jarima</th>
                  <th className="p-4 text-right">Qo'lga Tegadigan Maosh</th>
                  <th className="p-4 text-center">Amal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/70 dark:divide-gray-700 text-xs sm:text-sm font-bold">
                {waiterPayrollRows.map((row, index) => {
                  const extraFixedAndBonus =
                    row.salesBonusEarned + row.shiftSalaryEarned + row.fixedSalary + row.manualBonus;

                  return (
                    <tr
                      key={row.waiterName}
                      onClick={() => setInspectingWaiterRow(row)}
                      className="hover:bg-white dark:hover:bg-gray-800 transition cursor-pointer group"
                      title="Bosib shu ofitsiant yopgan barcha cheklarni ko'ring"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <span className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-black text-xs flex items-center justify-center shrink-0">
                            #{index + 1}
                          </span>
                          <div>
                            <p className="font-black text-gray-900 dark:text-white text-sm sm:text-base group-hover:text-indigo-600 transition">
                              {row.waiterName}
                            </p>
                            <span className="text-[10px] font-bold text-gray-400">
                              Stavka: {row.rule.serviceSharePercent}% xizmatdan
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="p-4 text-center">
                        <span className="font-black text-gray-900 dark:text-white block">
                          {row.ordersCount} ta chek
                        </span>
                        <span className="text-[11px] text-gray-400">
                          {row.workedDaysCount} kun • {row.portionsCount} pors
                        </span>
                      </td>

                      <td className="p-4">
                        <span className="font-black text-gray-900 dark:text-white block">
                          {row.totalRevenue.toLocaleString()} s
                        </span>
                        <span className="text-[10px] text-gray-400">
                          Taomlar: {row.subTotalSales.toLocaleString()} s
                        </span>
                      </td>

                      <td className="p-4">
                        <span className="font-black text-amber-600 dark:text-amber-400">
                          {row.totalServiceFeeGenerated.toLocaleString()} s
                        </span>
                      </td>

                      <td className="p-4">
                        <span className="font-black text-indigo-600 dark:text-indigo-400 block">
                          +{row.serviceShareEarned.toLocaleString()} s
                        </span>
                        <span className="text-[10px] text-gray-400">
                          ({row.rule.serviceSharePercent}% ulush)
                        </span>
                      </td>

                      <td className="p-4">
                        {extraFixedAndBonus > 0 ? (
                          <div>
                            <span className="font-black text-emerald-600 dark:text-emerald-400 block">
                              +{extraFixedAndBonus.toLocaleString()} s
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {row.rule.salesBonusPercent > 0 ? `Savdodan ${row.rule.salesBonusPercent}% ` : ''}
                              {row.fixedSalary > 0 ? '• Oklad ' : ''}
                              {row.manualBonus > 0 ? '• Mukofot' : ''}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">0 s</span>
                        )}
                      </td>

                      <td className="p-4">
                        {row.totalDeductions > 0 ? (
                          <div>
                            <span className="font-black text-red-500 block">
                              -{row.totalDeductions.toLocaleString()} s
                            </span>
                            {row.cashierAdvances > 0 && (
                              <span className="text-[10px] text-gray-400">
                                Kassa avansi: -{row.cashierAdvances.toLocaleString()} s
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">0 s</span>
                        )}
                      </td>

                      <td className="p-4 text-right">
                        <span className={`text-base sm:text-lg font-black px-3 py-1.5 rounded-xl inline-block ${
                          row.netPayableSalary >= 0
                            ? 'bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                            : 'bg-red-100 text-red-600'
                        }`}>
                          {row.netPayableSalary.toLocaleString()} s
                        </span>
                      </td>

                      <td className="p-4 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditWaiterRule(row)}
                            className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-300 font-black text-xs transition"
                          >
                            ⚙️ Stavka
                          </button>
                          <button
                            type="button"
                            onClick={() => setInspectingWaiterRow(row)}
                            className="px-2.5 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-amber-100 text-gray-700 dark:text-gray-200 font-black text-xs transition"
                            title="Ofitsiant cheklarini ko'rish"
                          >
                            👁
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. To'lov Turlari va O'rtacha Chek */}
      <StatsPaymentBreakdown 
        paymentStats={paymentStats}
        averageReceipt={averageReceipt}
      />

      {/* 4. SMENA XARAJATLARI VA INKASSATSIYA TAFSILOTLARI JADVALI */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h3 className="text-lg md:text-xl font-black text-gray-900 dark:text-white">
              💸 Kassa Xarajatlari va Inkassatsiya Hisoboti ({scopedExpenses.length} ta)
            </h3>
            <p className="text-xs font-bold text-gray-500 mt-0.5">
              Tanlangan davr ichida kiritilgan barcha chiqimlar va rahbarga topshirilgan pullar
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

      {/* 5. Top Taomlar va Smenani Yopish */}
      <StatsPopularItems 
        popularItems={popularItems}
        orders={safeOrders}
        onCloseShift={handleCloseShift}
      />

      {/* =========================================================================
          MODAL 1: ⚙️ OFITSIANT STAVKASI, OKLAD VA AVANSNI SOZLASH MODALI
          ========================================================================= */}
      {editingWaiterName && (
        <div
          onClick={() => setEditingWaiterName(null)}
          className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[160] flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4 border border-gray-100 dark:border-gray-700 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
              <div>
                <h3 className="font-black text-lg text-gray-900 dark:text-white">
                  ⚙️ {editingWaiterName} — Maosh va Ulush Stavkasi
                </h3>
                <p className="text-xs font-bold text-gray-400">
                  Xodimning xizmat haqidan oladigan foizi, okladi va avans/mukofotlari
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingWaiterName(null)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 font-black"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveWaiterRule} className="space-y-4">
              <div className="bg-amber-50/70 dark:bg-gray-900/60 p-4 rounded-2xl border border-amber-200 dark:border-gray-700 space-y-2">
                <label className="block text-xs font-black text-amber-900 dark:text-amber-400 uppercase">
                  1. Yig'ilgan Xizmat Haqidan Ofitsiant Ulushi (%)
                </label>
                <p className="text-[11px] font-bold text-gray-500">
                  Masalan: 100% bo'lsa chekdagi xizmat haqi to'liq ofitsiantga yoziladi; 70% bo'lsa 70% ofitsiantga, 30% kafega qoladi.
                </p>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={waiterRuleForm.serviceSharePercent}
                    onChange={e => setWaiterRuleForm(prev => ({ ...prev, serviceSharePercent: e.target.value }))}
                    className="w-28 p-3 rounded-xl bg-white dark:bg-gray-800 border border-amber-300 font-black text-base text-center text-gray-900 dark:text-white"
                  />
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {[100, 80, 70, 50, 0].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setWaiterRuleForm(prev => ({ ...prev, serviceSharePercent: pct }))}
                        className={`px-3 py-2 rounded-xl font-black text-xs border transition ${
                          Number(waiterRuleForm.serviceSharePercent) === pct
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">
                    Taom savdosidan bonus (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={waiterRuleForm.salesBonusPercent}
                    onChange={e => setWaiterRuleForm(prev => ({ ...prev, salesBonusPercent: e.target.value }))}
                    placeholder="Masalan: 0 yoki 2"
                    className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">
                    1 Kunlik (Smena) Chiqish Puli (s)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={waiterRuleForm.dailyShiftRate}
                    onChange={e => setWaiterRuleForm(prev => ({ ...prev, dailyShiftRate: e.target.value }))}
                    placeholder="Masalan: 50000"
                    className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">
                    Oylik Fiks Oklad (s)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={waiterRuleForm.fixedMonthlySalary}
                    onChange={e => setWaiterRuleForm(prev => ({ ...prev, fixedMonthlySalary: e.target.value }))}
                    placeholder="0"
                    className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black text-emerald-600 uppercase mb-1">
                    + Qo'shimcha Bonus (s)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={waiterRuleForm.manualBonus}
                    onChange={e => setWaiterRuleForm(prev => ({ ...prev, manualBonus: e.target.value }))}
                    placeholder="0"
                    className="w-full p-3 rounded-xl bg-emerald-50/60 dark:bg-gray-900 border border-emerald-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black text-red-600 uppercase mb-1">
                    - Avans / Jarima (s)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={waiterRuleForm.manualDeduction}
                    onChange={e => setWaiterRuleForm(prev => ({ ...prev, manualDeduction: e.target.value }))}
                    placeholder="0"
                    className="w-full p-3 rounded-xl bg-red-50/60 dark:bg-gray-900 border border-red-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">
                  Izoh (Ixtiyoriy)
                </label>
                <input
                  type="text"
                  value={waiterRuleForm.note}
                  onChange={e => setWaiterRuleForm(prev => ({ ...prev, note: e.target.value }))}
                  placeholder="Masalan: Katta ofitsiant, banket bonusi qo'shildi"
                  className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-xs text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingWaiterName(null)}
                  className="flex-1 py-3.5 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-bold text-xs"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-lg shadow-indigo-600/30 transition active:scale-95"
                >
                  💾 Stavkani Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: 👁 OFITSIANT YOPGAN BARCHA CHEKLAR RO'YXATI MODALI
          ========================================================================= */}
      {inspectingWaiterRow && (
        <div
          onClick={() => setInspectingWaiterRow(null)}
          className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[160] flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 w-full max-w-3xl rounded-3xl p-6 shadow-2xl space-y-4 max-h-[88vh] flex flex-col border border-gray-100 dark:border-gray-700"
          >
            <div className="flex justify-between items-start border-b pb-3 dark:border-gray-700">
              <div>
                <h3 className="font-black text-xl text-gray-900 dark:text-white">
                  👨‍🍳 {inspectingWaiterRow.waiterName} — Yopilgan Cheklar Tarixi ({inspectingWaiterRow.ordersCount} ta)
                </h3>
                <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                  Davr: {payrollPeriodLabel} • Jami savdo: {inspectingWaiterRow.totalRevenue.toLocaleString()} s • Sof maosh: {inspectingWaiterRow.netPayableSalary.toLocaleString()} s
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingWaiterRow(null)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 font-black"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {inspectingWaiterRow.ordersList.length === 0 ? (
                <div className="text-center py-12 text-gray-400 font-bold">
                  Ushbu davrda yopilgan cheklar yo'q.
                </div>
              ) : (
                inspectingWaiterRow.ordersList.map(ord => (
                  <div
                    key={ord.id}
                    className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-gray-900 dark:text-white">
                          🪑 {ord.table}
                        </span>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          #{String(ord.id).slice(-4)}
                        </span>
                        <span className="text-xs font-bold text-gray-400">
                          🕒 {ord.closeTime || `${ord.date || ''} ${ord.time || ''}`}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-gray-500">
                        🍽 {(ord.items || []).map(i => `${i.name} (x${i.quantity ?? i.qty ?? 1})`).join(', ')}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-black text-sm text-gray-900 dark:text-white block">
                        Chek: {ord.computedFinal.toLocaleString()} s
                      </span>
                      <span className="text-xs font-black text-amber-600 dark:text-amber-400">
                        Xizmat haqi: +{ord.computedFee.toLocaleString()} s
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: YOPILGAN CHEKLARNING ICHKI TARKIBINI KO'RISH MODALI
          ========================================================================= */}
      {isReceiptsModalOpen && (
        <div
          onClick={() => setIsReceiptsModalOpen(false)}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[150] flex items-center justify-center p-3 sm:p-5 animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 w-full max-w-6xl rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[92vh] overflow-hidden"
          >
            <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/70 space-y-4">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <h3 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                    <span>🧾</span> Cheklar Arxivi va Ichki Ma'lumotlari
                  </h3>
                  <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                    Tanlangan davr: {activeDateRange.label} • Har bir chek ustiga bosib ichidagi taomlarni ko'ring
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsReceiptsModalOpen(false)}
                  className="w-9 h-9 rounded-full bg-white dark:bg-gray-800 text-gray-500 hover:text-red-600 font-black flex items-center justify-center shadow-sm"
                >
                  ✕
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'paid', label: `✅ Yopilgan cheklar (${completedOrders.length})` },
                    { id: 'debt', label: `📓 Qarz daftari (${debtOrders.length})` },
                    { id: 'open', label: `🍽 Ochiq stollar (${openActiveOrders.length})` }
                  ].map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setReceiptsModalCategory(cat.id);
                        setSelectedDetailOrder(null);
                      }}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black transition ${
                        receiptsModalCategory === cat.id
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 flex-1 sm:flex-initial justify-end">
                  <input
                    type="text"
                    value={receiptSearchQuery}
                    onChange={e => setReceiptSearchQuery(e.target.value)}
                    placeholder="🔍 #Chek ID, Stol, Ofitsiant, Taom..."
                    className="px-3.5 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-indigo-500 w-full sm:w-56"
                  />

                  <select
                    value={receiptPaymentFilter}
                    onChange={e => setReceiptPaymentFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-black text-gray-800 dark:text-white outline-none cursor-pointer"
                  >
                    <option value="Barchasi">💳 Barcha to'lovlar</option>
                    <option value="Naqd">💵 Naqd</option>
                    <option value="Plastik">💳 Plastik</option>
                    <option value="Payme">📱 Payme</option>
                    <option value="Click">📲 Click</option>
                    <option value="Aralash">🔄 Aralash</option>
                    <option value="Qarz">📝 Qarz</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-gray-200 dark:divide-gray-700 overflow-hidden">
              
              {/* CHAP USTUN: CHEKLAR RO'YXATI */}
              <div className="w-full lg:w-1/2 overflow-y-auto p-4 space-y-2.5">
                {modalFilteredReceipts.length === 0 ? (
                  <div className="text-center py-16 text-gray-400 font-bold text-sm">
                    Tanlangan mezon bo'yicha cheklar topilmadi.
                  </div>
                ) : (
                  modalFilteredReceipts.map(ord => {
                    const isSelected = selectedDetailOrder && String(selectedDetailOrder.id) === String(ord.id);
                    const finalAmt = getOrderFinalAmount(ord);
                    const itemsCount = Array.isArray(ord.items)
                      ? ord.items.reduce((s, i) => s + (Number(i?.quantity ?? i?.qty ?? 1) || 0), 0)
                      : 0;

                    return (
                      <div
                        key={ord.id}
                        onClick={() => setSelectedDetailOrder(ord)}
                        className={`p-4 rounded-2xl border-2 cursor-pointer transition flex justify-between items-center gap-3 ${
                          isSelected
                            ? 'bg-indigo-50/90 dark:bg-indigo-900/30 border-indigo-500 shadow-sm'
                            : 'bg-gray-50 dark:bg-gray-900/50 border-gray-200/80 dark:border-gray-700 hover:border-indigo-300'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-black text-sm text-gray-900 dark:text-white">
                              🪑 {ord.table}
                            </span>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                              #{String(ord.id).slice(-4)}
                            </span>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                              {ord.paymentMethod || ord.status}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-gray-500 truncate">
                            👤 Ofitsiant: {ord.waiterName || ord.waiter || 'Ofitsiant'} • 🍽 {itemsCount} porsiya
                          </p>
                          <p className="text-[11px] font-bold text-gray-400">
                            🕒 {ord.closeTime || `${ord.date || ''} ${ord.time || ''}`}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400 block">
                            {finalAmt.toLocaleString()} s
                          </span>
                          <span className="text-[10px] font-black text-gray-400">
                            Ichini ko'rish →
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* O'NG USTUN: TANLANGAN CHEKNING ICHKI MA'LUMOTLARI */}
              <div className="w-full lg:w-1/2 overflow-y-auto p-5 bg-gray-50/50 dark:bg-gray-900/40">
                {!selectedDetailOrder ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12 text-gray-400">
                    <span className="text-5xl mb-3">🧾</span>
                    <p className="font-black text-sm">
                      Chap tomondagi ro'yxatdan chekni tanlang
                    </p>
                    <p className="text-xs font-bold mt-1">
                      Chekning ichidagi barcha taomlar, narxlar va foyda hisobi shu yerda ochiladi
                    </p>
                  </div>
                ) : (
                  (() => {
                    const ord = selectedDetailOrder;
                    const sub = getOrderSubTotal(ord);
                    const fee = getOrderServiceFee(ord);
                    const disc = getOrderDiscount(ord);
                    const bonusUsed = Number(ord.usedBonus || 0);
                    const finalAmt = getOrderFinalAmount(ord);
                    const foodCost = getOrderFoodCost(ord);
                    const orderProfit = finalAmt - foodCost;

                    return (
                      <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                        <div className="flex justify-between items-start border-b border-dashed border-gray-200 dark:border-gray-700 pb-4">
                          <div>
                            <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                              Chek #{String(ord.id).slice(-4)} • {ord.status}
                            </span>
                            <h4 className="text-2xl font-black text-gray-900 dark:text-white mt-1.5">
                              🪑 {ord.table}
                            </h4>
                            <p className="text-xs font-bold text-gray-500 mt-0.5">
                              🕒 Vaqt: {ord.closeTime || `${ord.date || ''} ${ord.time || ''}`}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => setReprintOrderData(ord)}
                            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-md transition active:scale-95 flex items-center gap-1.5"
                          >
                            <span>🖨</span> Chop etish
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 text-xs bg-gray-50 dark:bg-gray-900/60 p-3.5 rounded-2xl border border-gray-100 dark:border-gray-700 font-bold">
                          <div>
                            <span className="text-gray-400 block text-[10px] uppercase">Ofitsiant:</span>
                            <span className="font-black text-gray-900 dark:text-white">
                              {ord.waiterName || ord.waiter || 'Ofitsiant'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400 block text-[10px] uppercase">Kassir:</span>
                            <span className="font-black text-gray-900 dark:text-white">
                              {ord.cashierName || 'Kassir'}
                            </span>
                          </div>
                          {(ord.customerName || ord.debtorName) && (
                            <div className="col-span-2 pt-1 border-t border-gray-200 dark:border-gray-700">
                              <span className="text-gray-400 block text-[10px] uppercase">Mijoz:</span>
                              <span className="font-black text-indigo-600 dark:text-indigo-400">
                                {ord.customerName || ord.debtorName} {ord.customerPhone ? `(${ord.customerPhone})` : ''}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-black uppercase text-gray-400">
                            🍽 Buyurtma Qilingan Taomlar ({Array.isArray(ord.items) ? ord.items.length : 0} xil):
                          </p>
                          <div className="divide-y divide-gray-100 dark:divide-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                            {(Array.isArray(ord.items) ? ord.items : []).map((it, idx) => {
                              if (!it) return null;
                              const p = Number(it.price ?? it.variants?.[0]?.price ?? 0) || 0;
                              const q = Number(it.quantity ?? it.qty ?? 1) || 0;
                              const uCost = getDishUnitCost(it);
                              return (
                                <div key={idx} className="p-3 flex justify-between items-center gap-3 text-xs sm:text-sm">
                                  <div>
                                    <p className="font-black text-gray-900 dark:text-white">{it.name}</p>
                                    <p className="text-[11px] font-bold text-gray-400">
                                      {q} pors x {p.toLocaleString()} s
                                      {uCost > 0 ? ` • (Tannarx: ${(uCost * q).toLocaleString()} s)` : ''}
                                    </p>
                                    {it.note && (
                                      <span className="text-[10px] font-bold italic text-amber-600 block">
                                        * {it.note}
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-black text-gray-900 dark:text-white whitespace-nowrap">
                                    {(p * q).toLocaleString()} s
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="border-t-2 border-dashed border-gray-200 dark:border-gray-700 pt-3 space-y-1.5 text-xs font-bold">
                          <div className="flex justify-between text-gray-500">
                            <span>Taomlar summasi:</span>
                            <span className="font-black text-gray-900 dark:text-white">{sub.toLocaleString()} so'm</span>
                          </div>
                          {fee > 0 && (
                            <div className="flex justify-between text-gray-500">
                              <span>Xizmat haqi:</span>
                              <span className="font-black text-gray-900 dark:text-white">+{fee.toLocaleString()} so'm</span>
                            </div>
                          )}
                          {disc > 0 && (
                            <div className="flex justify-between text-red-500">
                              <span>Chegirma (Skidka):</span>
                              <span className="font-black">-{disc.toLocaleString()} so'm</span>
                            </div>
                          )}
                          {bonusUsed > 0 && (
                            <div className="flex justify-between text-indigo-600">
                              <span>Bonusdan qoplandi:</span>
                              <span className="font-black">-{bonusUsed.toLocaleString()} so'm</span>
                            </div>
                          )}
                          <div className="flex justify-between text-base font-black text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700">
                            <span>JAMI TO'LOV ({ord.paymentMethod || 'Naqd'}):</span>
                            <span className="text-emerald-600 dark:text-emerald-400">{finalAmt.toLocaleString()} so'm</span>
                          </div>
                          <div className="flex justify-between text-[11px] pt-1 text-gray-400">
                            <span>Xomashyo tannarxi: -{foodCost.toLocaleString()} s</span>
                            <span className="text-emerald-600 font-black">Sof foyda: +{orderProfit.toLocaleString()} s</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* CHEKNI QAYTA CHOP ETISH MODALI */}
      {reprintOrderData && (
        <PrintReceiptModal
          cafeName={stickyCafeName}
          order={reprintOrderData}
          onClose={() => setReprintOrderData(null)}
        />
      )}
      
    </div>
  );
}