import React, { useState, useMemo } from 'react';
import useSticky from '../hooks/useSticky';
import CashierOrderList from './CashierOrderList';
import CashierReceipt from './CashierReceipt';
import CashierPaymentControls from './CashierPaymentControls';

// ==========================================
// 1. XARAJAT TOIFALARI RO'YXATI
// ==========================================
const EXPENSE_CATEGORIES = [
  { id: 'Bozorlik', label: '🍅 Bozorlik va mahsulot xaridi', isInkassatsiya: false },
  { id: 'Avans', label: '👨‍🍳 Xodim avansi / Kunlik ish haqi', isInkassatsiya: false },
  { id: 'Kuryer', label: "🚕 Kuryer, Taksi va Yo'l kira", isInkassatsiya: false },
  { id: 'Xojalik', label: "🧹 Xo'jalik mollari va Ta'mir", isInkassatsiya: false },
  { id: 'Kommunal', label: "💡 Kommunal va Ijara to'lovi", isInkassatsiya: false },
  { id: 'Inkassatsiya', label: '🏦 Inkassatsiya (Rahbarga pul topshirish)', isInkassatsiya: true },
  { id: 'Boshqa', label: '📌 Boshqa xarajatlar', isInkassatsiya: false }
];

// ==========================================
// 2. O'LCHOV BIRLIKLARI KONVERTORI (OMBOR UCHUN)
// ==========================================
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

const convertRecipeToInventoryUnit = (amount, fromUnit, toInvUnit) => {
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

// ==========================================
// 3. ICHKI XAVFSIZ TELEGRAM XABAR YUBORGICH
// ==========================================
const escapeHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

async function sendCashierTelegramAlert(linesArray, checkKey = null) {
  try {
    const raw = window.localStorage.getItem('pos_telegram_config');
    if (!raw) return;
    const cfg = JSON.parse(raw);
    if (!cfg || !cfg.enabled) return;
    if (checkKey && cfg[checkKey] === false) return;

    const token = String(cfg.botToken || '').trim();
    const rawIds = String(cfg.chatId || '').trim();
    if (!token || !rawIds) return;

    const text = linesArray.filter(Boolean).join('\n');
    const chatIds = rawIds.split(',').map(s => s.trim()).filter(Boolean);

    await Promise.all(
      chatIds.map(id =>
        fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: id,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true
          })
        })
      )
    );
  } catch {
    // Internet bo'lmasa kassa ishlashiga xalaqit bermaydi
  }
}

export default function CashierMode({
  orders,
  setOrders,
  menuItems,
  inventory,
  setInventory,
  inventoryLogs,
  setInventoryLogs,
  expenses,
  setExpenses,
  serviceFee = 10,
  cafeName,
  currentUser,
  onPrintReceipt,
  setReceiptToPrint,
  requireAdminOverride,
  addAuditLog
}) {
  // ==========================================
  // 1. ZAXIRA XOTIRA (FALLBACK SYNC)
  // ==========================================
  const [stickyOrders, setStickyOrders] = useSticky('pos_orders', []);
  const [stickyMenu] = useSticky('pos_menu', []);
  const [stickyInventory, setStickyInventory] = useSticky('pos_inventory', []);
  const [, setStickyInventoryLogs] = useSticky('pos_inventory_logs', []);
  const [stickyExpenses, setStickyExpenses] = useSticky('pos_expenses', []);
  const [stickyCafeName] = useSticky('pos_cafe_name', 'Premium Cafe');

  const safeOrders = useMemo(() => {
    if (Array.isArray(orders)) return orders;
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

  const resolvedCafeName = cafeName || stickyCafeName || 'Premium Cafe';
  const updateOrders = typeof setOrders === 'function' ? setOrders : setStickyOrders;
  const updateInventory = typeof setInventory === 'function' ? setInventory : setStickyInventory;
  const updateInventoryLogs = typeof setInventoryLogs === 'function' ? setInventoryLogs : setStickyInventoryLogs;
  const updateExpenses = typeof setExpenses === 'function' ? setExpenses : setStickyExpenses;
  const triggerPrintModal = onPrintReceipt || setReceiptToPrint;

  // ==========================================
  // 2. KASSA VA XARAJATLAR STATE'LARI
  // ==========================================
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'debt'
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  // To'lov va Chegirma statelari
  const [discountType, setDiscountType] = useState('none');
  const [discountValue, setDiscountValue] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Naqd');
  const [mixedCash, setMixedCash] = useState('');
  const [mixedCard, setMixedCard] = useState('');
  const [debtorName, setDebtorName] = useState('');

  // YANGI: Kassadan Chiqim / Xarajat Modallari statelari
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isExpenseListModalOpen, setIsExpenseListModalOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    category: EXPENSE_CATEGORIES[0].id,
    amount: '',
    paymentSource: 'Naqd', // 'Naqd' | 'Plastik'
    recipient: '',
    note: ''
  });

  // ==========================================
  // 3. CHEKLAR VA KASSA SEYFI BALANSI HISOB-KITOBI
  // ==========================================
  const activeOrders = useMemo(() => {
    return safeOrders.filter(
      o => o && !["To'langan", 'Qarz', 'Arxiv'].includes(o.status)
    );
  }, [safeOrders]);

  const debtOrders = useMemo(() => {
    return safeOrders.filter(o => o && o.status === 'Qarz');
  }, [safeOrders]);

  // Joriy smenada to'langan cheklar
  const currentShiftPaidOrders = useMemo(() => {
    return safeOrders.filter(o => o && o.status === "To'langan");
  }, [safeOrders]);

  // Joriy smenadagi faol xarajatlar (Arxivga o'tmaganlari)
  const currentShiftExpenses = useMemo(() => {
    return safeExpenses.filter(e => e && e.status !== 'Arxiv');
  }, [safeExpenses]);

  // Kassa Seyfi (Cash Drawer) jonli balansi
  const cashDrawerSummary = useMemo(() => {
    // 1. Smenada kirgan jami Naqd pul (Naqd cheklar + Aralash to'lovning naqd qismi)
    let cashSalesIn = 0;
    let cardSalesIn = 0;

    currentShiftPaidOrders.forEach(order => {
      const finalAmt = Number(order.finalTotal ?? order.total ?? 0) || 0;
      if (order.paymentMethod === 'Naqd') {
        cashSalesIn += finalAmt;
      } else if (order.paymentMethod === 'Aralash') {
        const cPart = Number(order.paymentDetails?.cashAmount ?? order.mixedDetails?.cash ?? 0) || 0;
        const kPart = Number(order.paymentDetails?.cardAmount ?? order.mixedDetails?.card ?? 0) || 0;
        cashSalesIn += cPart;
        cardSalesIn += kPart;
      } else if (['Plastik', 'Payme', 'Click'].includes(order.paymentMethod)) {
        cardSalesIn += finalAmt;
      }
    });

    // 2. Smenada kassadan chiqqan Naqd va Plastik chiqimlar
    let cashExpensesOut = 0;
    let cardExpensesOut = 0;
    let operationalExpensesTotal = 0;
    let inkassatsiyaTotal = 0;

    currentShiftExpenses.forEach(exp => {
      const amt = Number(exp.amount) || 0;
      const isInkass = exp.category === 'Inkassatsiya' || exp.isInkassatsiya;

      if (exp.paymentSource === 'Plastik') {
        cardExpensesOut += amt;
      } else {
        cashExpensesOut += amt;
      }

      if (isInkass) {
        inkassatsiyaTotal += amt;
      } else {
        operationalExpensesTotal += amt;
      }
    });

    // 3. Seyfda (Kassa tortmasida) hozir bo'lishi shart bo'lgan aniq naqd pul
    const expectedCashInDrawer = cashSalesIn - cashExpensesOut;

    return {
      cashSalesIn,
      cardSalesIn,
      cashExpensesOut,
      cardExpensesOut,
      operationalExpensesTotal,
      inkassatsiyaTotal,
      totalOutflow: cashExpensesOut + cardExpensesOut,
      expectedCashInDrawer
    };
  }, [currentShiftPaidOrders, currentShiftExpenses]);

  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return activeOrders.find(o => String(o.id) === String(selectedOrderId)) || null;
  }, [activeOrders, selectedOrderId]);

  // ==========================================
  // 4. TANLANGAN CHEK MATEMATIKASI (TOTALS)
  // ==========================================
  const totals = useMemo(() => {
    if (!selectedOrder) {
      return {
        subTotal: 0,
        serviceFeePercent: 0,
        serviceFeeAmount: 0,
        discountAmount: 0,
        finalTotal: 0
      };
    }

    const items = Array.isArray(selectedOrder.items) ? selectedOrder.items : [];
    const subTotal = items.reduce((sum, item) => {
      if (!item) return sum;
      const price = Number(item.price ?? item.variants?.[0]?.price ?? 0) || 0;
      const qty = Number(item.quantity ?? item.qty ?? 1) || 0;
      return sum + (price * qty);
    }, 0);

    const isTakeaway = selectedOrder.table === 'Olib ketish';
    const effectiveFeePercent = isTakeaway
      ? 0
      : Number(selectedOrder.serviceFee !== undefined ? selectedOrder.serviceFee : serviceFee) || 0;

    const serviceFeeAmount = Math.round((subTotal * effectiveFeePercent) / 100);
    const grossTotal = subTotal + serviceFeeAmount;

    let discountAmount = 0;
    const rawDiscVal = Math.max(0, Number(discountValue) || 0);

    if (discountType === 'percent') {
      const validPercent = Math.min(100, rawDiscVal);
      discountAmount = Math.round((grossTotal * validPercent) / 100);
    } else if (discountType === 'sum') {
      discountAmount = Math.min(grossTotal, rawDiscVal);
    }

    const finalTotal = Math.max(0, grossTotal - discountAmount);

    return {
      subTotal,
      serviceFeePercent: effectiveFeePercent,
      serviceFeeAmount,
      discountAmount,
      finalTotal
    };
  }, [selectedOrder, serviceFee, discountType, discountValue]);

  // ==========================================
  // 5. FORMALARNI TOZALASH VA CHEK TANLASH
  // ==========================================
  const resetPaymentControls = () => {
    setDiscountType('none');
    setDiscountValue('');
    setPaymentMethod('Naqd');
    setMixedCash('');
    setMixedCard('');
    setDebtorName('');
  };

  const handleSelectOrder = (order) => {
    if (!order) {
      setSelectedOrderId(null);
      resetPaymentControls();
      return;
    }
    setSelectedOrderId(order.id);
    resetPaymentControls();
  };

  const handleMixedCashChange = (val) => {
    setMixedCash(val);
    const numCash = Math.max(0, Number(val) || 0);
    if (val !== '' && numCash <= totals.finalTotal) {
      setMixedCard(String(totals.finalTotal - numCash));
    }
  };

  const handleMixedCardChange = (val) => {
    setMixedCard(val);
    const numCard = Math.max(0, Number(val) || 0);
    if (val !== '' && numCard <= totals.finalTotal) {
      setMixedCash(String(totals.finalTotal - numCard));
    }
  };

  // ==========================================
  // 6. KASSADAN XARAJAT / CHIQIM QO'SHISH VA O'CHIRISH
  // ==========================================
  const handleSaveExpense = (e) => {
    e.preventDefault();
    const amountNum = Number(expenseForm.amount);
    const cleanNote = (expenseForm.note || '').trim();
    const cleanRecipient = (expenseForm.recipient || '').trim();

    if (isNaN(amountNum) || amountNum <= 0) {
      alert("Iltimos, xarajat summasini to'g'ri (0 dan katta) raqamda kiriting!");
      return;
    }

    if (!cleanNote) {
      alert("Iltimos, xarajat sababini (izohni) kiriting! (Masalan: 20 ta non olindi)");
      return;
    }

    // Agar Naqd kassadan chiqim qilinayotgan bo'lsa va kassada naqd pul yetmasa ogohlantiramiz
    if (
      expenseForm.paymentSource === 'Naqd' &&
      amountNum > cashDrawerSummary.expectedCashInDrawer
    ) {
      const proceed = window.confirm(
        `⚠️ Diqqat! Hozir kassada smena bo'yicha ${cashDrawerSummary.expectedCashInDrawer.toLocaleString()} so'm naqd pul bor.\n` +
        `Siz ${amountNum.toLocaleString()} so'm chiqim kiritmoqdasiz (Kassa balansi manfiyga o'tadi). Davom etamizmi?`
      );
      if (!proceed) return;
    }

    const catObj = EXPENSE_CATEGORIES.find(c => c.id === expenseForm.category) || EXPENSE_CATEGORIES[0];
    const nowStr = new Date().toLocaleString();

    const newExpense = {
      id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: nowStr,
      category: catObj.id,
      categoryLabel: catObj.label,
      isInkassatsiya: Boolean(catObj.isInkassatsiya),
      amount: Math.round(amountNum),
      paymentSource: expenseForm.paymentSource, // 'Naqd' | 'Plastik'
      recipient: cleanRecipient || '-',
      note: cleanNote,
      cashierName: currentUser?.name || 'Kassir',
      status: 'Faol' // Smena yopilganda 'Arxiv' ga o'tadi
    };

    updateExpenses(prev => [newExpense, ...(Array.isArray(prev) ? prev : [])]);

    if (typeof addAuditLog === 'function') {
      addAuditLog(
        newExpense.isInkassatsiya ? 'Kassa: Inkassatsiya' : 'Kassa: Kunlik Xarajat',
        `${newExpense.category}: -${newExpense.amount.toLocaleString()} s (${newExpense.paymentSource}) • Sabab: ${newExpense.note}`
      );
    }

    // ✈️ Rahbarning Telegramiga darhol chiqim xabarini yuborish
    const nextCashBalance = expenseForm.paymentSource === 'Naqd'
      ? cashDrawerSummary.expectedCashInDrawer - newExpense.amount
      : cashDrawerSummary.expectedCashInDrawer;

    sendCashierTelegramAlert(
      [
        newExpense.isInkassatsiya
          ? `🏦 <b>INKASSATSIYA — KASSADAN PUL TOPSHIRILDI</b>`
          : `💸 <b>KASSADAN CHIQIM (XARAJAT) KIRITILDI</b>`,
        `🏪 <b>Kafe:</b> ${escapeHtml(resolvedCafeName)}`,
        `━━━━━━━━━━━━━━━━━━`,
        `📂 <b>Toifa:</b> ${escapeHtml(catObj.label)}`,
        `💰 <b>Summa:</b> <b>-${newExpense.amount.toLocaleString()} so'm</b>`,
        `💳 <b>Manba:</b> Kassadagi ${escapeHtml(newExpense.paymentSource)} puldan`,
        cleanRecipient ? `👤 <b>Kimga berildi:</b> ${escapeHtml(cleanRecipient)}` : null,
        `📝 <b>Sababi / Izoh:</b> ${escapeHtml(cleanNote)}`,
        `💻 <b>Kiritdi:</b> ${escapeHtml(newExpense.cashierName)}`,
        `🕒 <b>Vaqt:</b> ${escapeHtml(nowStr)}`,
        `━━━━━━━━━━━━━━━━━━`,
        `🗄 <b>Seyfda qolgan naqd pul:</b> <b>${nextCashBalance.toLocaleString()} so'm</b>`
      ],
      'notifyOnSecurity'
    );

    setExpenseForm({
      category: EXPENSE_CATEGORIES[0].id,
      amount: '',
      paymentSource: 'Naqd',
      recipient: '',
      note: ''
    });
    setIsExpenseModalOpen(false);
  };

  const handleDeleteExpense = (expItem) => {
    if (!expItem) return;

    const performDelete = () => {
      if (
        !window.confirm(
          `Rostdan ham "${expItem.note}" (-${Number(expItem.amount).toLocaleString()} so'm) xarajat yozuvini o'chirib tashlamoqchimisiz?`
        )
      ) {
        return;
      }

      updateExpenses(prev =>
        (Array.isArray(prev) ? prev : []).filter(e => e && String(e.id) !== String(expItem.id))
      );

      if (typeof addAuditLog === 'function') {
        addAuditLog(
          "Kassa xarajati o'chirildi",
          `${expItem.category}: ${Number(expItem.amount).toLocaleString()} s (${expItem.note}) o'chirildi`
        );
      }
    };

    if (typeof requireAdminOverride === 'function' && currentUser?.role !== 'admin') {
      requireAdminOverride(
        `Kassa xarajatini o'chirish (${Number(expItem.amount).toLocaleString()} s)`,
        performDelete
      );
    } else {
      performDelete();
    }
  };

  // ==========================================
  // 7. OMBORDAN MASALLIQLARNI AVTOMATIK AYIRISH
  // ==========================================
  const deductOrderIngredientsFromStock = (orderToDeduct) => {
    if (!orderToDeduct || orderToDeduct.inventoryDeducted) return [];
    if (!Array.isArray(orderToDeduct.items) || safeInventory.length === 0) return [];

    const deductionsByInvId = {};

    orderToDeduct.items.forEach(cartItem => {
      if (!cartItem) return;
      const itemQty = Number(cartItem.quantity ?? cartItem.qty ?? 1) || 0;
      if (itemQty <= 0) return;

      const matchedMenu = safeMenu.find(
        m => m && (
          String(m.id) === String(cartItem.id) ||
          m.name === cartItem.baseName ||
          m.name === cartItem.name
        )
      );

      const mainMenuPrice = Number(matchedMenu?.variants?.[0]?.price ?? matchedMenu?.price ?? 0) || 0;
      const soldItemPrice = Number(cartItem.price ?? mainMenuPrice) || 0;
      const portionFactor = (mainMenuPrice > 0 && soldItemPrice > 0)
        ? Math.min(2, Math.max(0.25, soldItemPrice / mainMenuPrice))
        : 1;

      const recipeList = matchedMenu?.recipe || cartItem?.recipe;
      if (!Array.isArray(recipeList) || recipeList.length === 0) return;

      recipeList.forEach(r => {
        if (!r) return;
        const targetId = String(r.inventoryId ?? r.productId ?? r.id ?? '');
        const invItem = safeInventory.find(i => i && String(i.id) === targetId);
        if (!invItem) return;

        const invBaseUnit = normalizeUnit(invItem.unit || 'kg');
        let singlePortionInBase = Number(r.qty ?? r.amount ?? 0) || 0;

        if (r.rawQty !== undefined && r.recipeUnit) {
          singlePortionInBase = convertRecipeToInventoryUnit(r.rawQty, r.recipeUnit, invBaseUnit);
        }

        const totalUsedInBase = Number((singlePortionInBase * portionFactor * itemQty).toFixed(6));
        if (totalUsedInBase <= 0) return;

        if (!deductionsByInvId[targetId]) {
          deductionsByInvId[targetId] = {
            invItem,
            baseUnit: invBaseUnit,
            totalDeduct: 0,
            dishes: []
          };
        }

        deductionsByInvId[targetId].totalDeduct = Number(
          (deductionsByInvId[targetId].totalDeduct + totalUsedInBase).toFixed(6)
        );
        deductionsByInvId[targetId].dishes.push(`${cartItem.name} (x${itemQty})`);
      });
    });

    const deductionKeys = Object.keys(deductionsByInvId);
    if (deductionKeys.length === 0) return [];

    const nowStr = new Date().toLocaleString();
    const lowStockAlerts = [];
    const newLogs = [];

    const updatedInventoryList = safeInventory.map(inv => {
      if (!inv) return inv;
      const d = deductionsByInvId[String(inv.id)];
      if (!d) return inv;

      const currentQty = Number(inv.quantity ?? inv.qty ?? 0) || 0;
      const nextQty = Math.max(0, Number((currentQty - d.totalDeduct).toFixed(6)));
      const minLim = Number(inv.minLimit ?? 0) || 0;

      if (nextQty <= minLim) {
        lowStockAlerts.push({
          id: inv.id,
          name: inv.name,
          quantity: nextQty,
          minLimit: minLim,
          unit: inv.unit
        });
      }

      newLogs.push({
        id: `${Date.now()}_${Math.random()}`,
        date: nowStr,
        type: 'Sotuv (Avto)',
        itemName: inv.name,
        productName: inv.name,
        diffAmount: `-${d.totalDeduct}`,
        amount: d.totalDeduct,
        unit: d.baseUnit,
        note: `${orderToDeduct.table}: ${d.dishes.join(', ')}`,
        reason: `${orderToDeduct.table}: ${d.dishes.join(', ')}`,
        user: currentUser?.name || 'Kassir'
      });

      return {
        ...inv,
        quantity: nextQty,
        qty: nextQty,
        lastUpdated: nowStr
      };
    });

    updateInventory(updatedInventoryList);
    if (newLogs.length > 0) {
      updateInventoryLogs(prev => [...newLogs, ...(Array.isArray(prev) ? prev : [])]);
    }

    return lowStockAlerts;
  };

  // ==========================================
  // 8. TO'LOVNI TASDIQLASH VA CHEKNI YOPISH
  // ==========================================
  const handlePaymentSubmit = () => {
    if (!selectedOrder) return;

    let cashAmount = 0;
    let cardAmount = 0;

    if (paymentMethod === 'Aralash') {
      cashAmount = Math.max(0, Number(mixedCash) || 0);
      cardAmount = Math.max(0, Number(mixedCard) || 0);

      if (Math.round(cashAmount + cardAmount) !== Math.round(totals.finalTotal)) {
        alert(
          `⛔️ Diqqat! Aralash to'lovda Naqd (${cashAmount.toLocaleString()} s) va Plastik (${cardAmount.toLocaleString()} s) yig'indisi jami to'lanadigan summaga (${totals.finalTotal.toLocaleString()} s) teng bo'lishi shart!`
        );
        return;
      }
    }

    const cleanDebtor = debtorName.trim();
    if (paymentMethod === 'Qarz' && !cleanDebtor) {
      alert("⛔️ Iltimos, qarzga yozish uchun qarzdor mijozning ismi va telefon raqamini kiriting!");
      return;
    }

    const executeCloseOrder = () => {
      const closeTimeStr = new Date().toLocaleString();
      const nextStatus = paymentMethod === 'Qarz' ? 'Qarz' : "To'langan";

      const paymentDetails = {
        cashAmount: paymentMethod === 'Naqd' ? totals.finalTotal : paymentMethod === 'Aralash' ? cashAmount : 0,
        cardAmount: paymentMethod === 'Plastik' ? totals.finalTotal : paymentMethod === 'Aralash' ? cardAmount : 0,
        paymeAmount: paymentMethod === 'Payme' ? totals.finalTotal : 0,
        clickAmount: paymentMethod === 'Click' ? totals.finalTotal : 0,
        debtorName: paymentMethod === 'Qarz' ? cleanDebtor : ''
      };

      const closedOrderObject = {
        ...selectedOrder,
        status: nextStatus,
        paymentMethod,
        subTotal: totals.subTotal,
        subtotal: totals.subTotal,
        serviceFee: totals.serviceFeePercent,
        serviceFeePercent: totals.serviceFeePercent,
        serviceFeeAmount: totals.serviceFeeAmount,
        discountType,
        discountValue: Number(discountValue) || 0,
        discountAmount: totals.discountAmount,
        discount: totals.discountAmount,
        finalTotal: totals.finalTotal,
        total: totals.finalTotal,
        debtorName: paymentMethod === 'Qarz' ? cleanDebtor : (selectedOrder.debtorName || ''),
        paymentDetails,
        cashierName: currentUser?.name || 'Kassir',
        closeTime: closeTimeStr,
        inventoryDeducted: true,
        hasCall: false
      };

      // 1) Ombordan masalliqlarni yechish
      const lowStockAlerts = deductOrderIngredientsFromStock(selectedOrder);

      // 2) Buyurtmalar ro'yxatida statusni yangilash
      updateOrders(prev =>
        (Array.isArray(prev) ? prev : []).map(o =>
          o && String(o.id) === String(selectedOrder.id) ? closedOrderObject : o
        )
      );

      // 3) Audit Log'ga yozish
      if (typeof addAuditLog === 'function') {
        addAuditLog(
          paymentMethod === 'Qarz' ? 'Chek qarzga yopildi' : "Chek to'landi",
          `${closedOrderObject.table}: ${totals.finalTotal.toLocaleString()} s (${paymentMethod})${
            totals.discountAmount > 0 ? ` • Chegirma: -${totals.discountAmount.toLocaleString()} s` : ''
          }`
        );
      }

      // 4) Telegramga xabar yuborish
      const isDebt = paymentMethod === 'Qarz';
      const hasDiscount = totals.discountAmount > 0;
      const tgFlagKey = isDebt ? 'notifyOnDebt' : hasDiscount ? 'notifyOnDiscount' : 'notifyOnEverySale';

      sendCashierTelegramAlert(
        [
          isDebt
            ? `📝 <b>YANGI NASIYA (QARZ) CHEKI!</b>`
            : hasDiscount
            ? `🎁 <b>CHEGIRMALI CHEK YOPILDI</b>`
            : `🧾 <b>YANGI CHEK YOPILDI</b>`,
          `🏪 <b>Kafe:</b> ${escapeHtml(resolvedCafeName)}`,
          `🪑 <b>Joy:</b> ${escapeHtml(closedOrderObject.table)}`,
          `👤 <b>Ofitsiant:</b> ${escapeHtml(closedOrderObject.waiterName || closedOrderObject.waiter || 'Ofitsiant')}`,
          isDebt ? `⚠️ <b>Qarzdor:</b> ${escapeHtml(cleanDebtor)}` : null,
          hasDiscount ? `🎁 <b>Chegirma:</b> -${totals.discountAmount.toLocaleString()} so'm` : null,
          `💰 <b>JAMI TO'LOV:</b> <b>${totals.finalTotal.toLocaleString()} so'm</b> (${escapeHtml(paymentMethod)})`,
          `🕒 <b>Vaqt:</b> ${escapeHtml(closeTimeStr)}`
        ],
        tgFlagKey
      );

      if (lowStockAlerts.length > 0) {
        sendCashierTelegramAlert(
          [
            `⚠️ <b>OMBOR OGOHLANTIRISHI (${escapeHtml(resolvedCafeName)})</b>`,
            ...lowStockAlerts.map(
              it => `🔻 <b>${escapeHtml(it.name)}:</b> ${it.quantity} ${escapeHtml(it.unit)} qoldi`
            )
          ],
          'notifyOnLowStock'
        );
      }

      // 5) Chek chiqarish oynasini ochish
      if (typeof triggerPrintModal === 'function') {
        triggerPrintModal({
          order: closedOrderObject,
          totals
        });
      }

      // 6) Tanlangan chekni yopish
      setSelectedOrderId(null);
      resetPaymentControls();
    };

    const isHighDiscount =
      totals.discountAmount > 0 &&
      totals.subTotal > 0 &&
      totals.discountAmount / (totals.subTotal + totals.serviceFeeAmount) >= 0.2;

    if (isHighDiscount && currentUser?.role !== 'admin' && typeof requireAdminOverride === 'function') {
      requireAdminOverride(
        `${selectedOrder.table} uchun katta chegirma (-${totals.discountAmount.toLocaleString()} s)`,
        executeCloseOrder
      );
    } else {
      executeCloseOrder();
    }
  };

  // ==========================================
  // 9. QARZNI SO'NDIRISH VA CHEKNI O'CHIRISH
  // ==========================================
  const handlePayOffDebt = (debtOrder) => {
    if (!debtOrder) return;
    const debtAmount = Number(debtOrder.finalTotal ?? debtOrder.total ?? 0) || 0;
    const debtor = debtOrder.debtorName || debtOrder.paymentDetails?.debtorName || "Noma'lum mijoz";

    if (
      !window.confirm(
        `💰 "${debtor}" ning ${debtAmount.toLocaleString()} so'm qarzini to'landi deb tasdiqlaysizmi?`
      )
    ) {
      return;
    }

    const paidTime = new Date().toLocaleString();

    updateOrders(prev =>
      (Array.isArray(prev) ? prev : []).map(o =>
        o && String(o.id) === String(debtOrder.id)
          ? {
              ...o,
              status: "To'langan",
              paymentMethod: 'Naqd',
              debtPaidAt: paidTime,
              closeTime: paidTime
            }
          : o
      )
    );

    if (typeof addAuditLog === 'function') {
      addAuditLog(
        "Qarz to'landi",
        `${debtor} (${debtOrder.table}): +${debtAmount.toLocaleString()} so'm kassaga kirim qilindi`
      );
    }

    sendCashierTelegramAlert(
      [
        `✅ <b>NASIYA QARZ TO'LANDI (${escapeHtml(resolvedCafeName)})</b>`,
        `👤 <b>Mijoz:</b> ${escapeHtml(debtor)}`,
        `💰 <b>To'langan summa:</b> +${debtAmount.toLocaleString()} so'm`,
        `🕒 <b>Vaqt:</b> ${escapeHtml(paidTime)}`
      ],
      'notifyOnDebt'
    );

    alert(`✅ "${debtor}" ning ${debtAmount.toLocaleString()} so'm qarzi muvaffaqiyatli yopildi!`);
  };

  const handleDeleteOrder = (orderId, tableName = 'Stol') => {
    if (!orderId) return;

    const performDelete = () => {
      if (!window.confirm(`⚠️ Rostdan ham "${tableName}" buyurtmasini butunlay bekor qilib o'chirmoqchimisiz?`)) {
        return;
      }

      updateOrders(prev =>
        (Array.isArray(prev) ? prev : []).filter(o => o && String(o.id) !== String(orderId))
      );

      if (String(selectedOrderId) === String(orderId)) {
        setSelectedOrderId(null);
        resetPaymentControls();
      }

      if (typeof addAuditLog === 'function') {
        addAuditLog("Chek bekor qilindi (O'chirildi)", `${tableName} buyurtmasi kassadan o'chirildi`);
      }
    };

    if (typeof requireAdminOverride === 'function' && currentUser?.role !== 'admin') {
      requireAdminOverride(`${tableName} chekini bekor qilish va o'chirish`, performDelete);
    } else {
      performDelete();
    }
  };

  // ==========================================
  // 10. RENDER (UI DIZAYN)
  // ==========================================
  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-4 pb-6 animate-fade-in">
      
      {/* =======================================================
          TEPADAGI JONLI KASSA SEYFI BALANSI VA XARAJAT TUGMALARI
          ======================================================= */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4">
        
        {/* 3 ta jonli kassa ko'rsatkichi */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
          <div className="bg-emerald-50/70 dark:bg-emerald-900/20 px-4 py-2.5 rounded-2xl border border-emerald-200/70 dark:border-emerald-800/50 flex justify-between items-center">
            <div>
              <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400 block">
                💵 Smena Naqd Kirimi
              </span>
              <span className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
                +{cashDrawerSummary.cashSalesIn.toLocaleString()} s
              </span>
            </div>
            <span className="text-xl">📥</span>
          </div>

          <div className="bg-red-50/70 dark:bg-red-900/20 px-4 py-2.5 rounded-2xl border border-red-200/70 dark:border-red-800/50 flex justify-between items-center">
            <div>
              <span className="text-[10px] font-black uppercase text-red-700 dark:text-red-400 block">
                📤 Kassadan Chiqim ({currentShiftExpenses.length} ta)
              </span>
              <span className="text-base sm:text-lg font-black text-red-600 dark:text-red-400">
                -{cashDrawerSummary.totalOutflow.toLocaleString()} s
              </span>
            </div>
            <span className="text-xl">💸</span>
          </div>

          <div className="bg-indigo-50/80 dark:bg-indigo-900/30 px-4 py-2.5 rounded-2xl border-2 border-indigo-300 dark:border-indigo-700 flex justify-between items-center">
            <div>
              <span className="text-[10px] font-black uppercase text-indigo-700 dark:text-indigo-300 block">
                🗄️ Seyfdagi Sof Naqd Pul
              </span>
              <span className={`text-base sm:text-lg font-black ${
                cashDrawerSummary.expectedCashInDrawer >= 0
                  ? 'text-indigo-700 dark:text-indigo-300'
                  : 'text-red-600'
              }`}>
                {cashDrawerSummary.expectedCashInDrawer.toLocaleString()} s
              </span>
            </div>
            <span className="text-xl">🔒</span>
          </div>
        </div>

        {/* Chiqim kiritish va Xarajatlar Jurnali tugmalari */}
        <div className="flex gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsExpenseModalOpen(true)}
            className="flex-1 sm:flex-initial px-5 py-3.5 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black text-xs sm:text-sm shadow-lg shadow-red-600/25 transition active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <span>💸</span>
            <span>+ Xarajat / Inkassatsiya</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpenseListModalOpen(true)}
            className="px-4 py-3.5 rounded-2xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-black text-xs sm:text-sm transition active:scale-95 flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <span>📋</span>
            <span>Chiqimlar ({currentShiftExpenses.length})</span>
          </button>
        </div>
      </div>

      {/* =======================================================
          ASOSIY KASSA ISHCHI MAYDONI (3 USTUNLI)
          ======================================================= */}
      <div className="h-[calc(100vh-195px)] min-h-[540px] flex flex-col lg:flex-row gap-6">
        
        {/* 1-USTUN (CHAP): OCHIQ CHEKLAR VA QARZ DAFTARI RO'YXATI */}
        <CashierOrderList
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          activeOrders={activeOrders}
          debtOrders={debtOrders}
          selectedOrder={selectedOrder}
          onSelectOrder={handleSelectOrder}
          onPayOffDebt={handlePayOffDebt}
          onDeleteOrder={handleDeleteOrder}
        />

        {/* 2 VA 3-USTUNLAR (O'RTA VA O'NG): CHEK HAMDA TO'LOV BOSHQARUVI */}
        {selectedOrder ? (
          <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
            
            <CashierReceipt
              selectedOrder={selectedOrder}
              totals={totals}
              serviceFee={serviceFee}
            />

            <CashierPaymentControls
              discountType={discountType}
              setDiscountType={setDiscountType}
              discountValue={discountValue}
              setDiscountValue={setDiscountValue}
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
              mixedCash={mixedCash}
              setMixedCash={handleMixedCashChange}
              mixedCard={mixedCard}
              setMixedCard={handleMixedCardChange}
              debtorName={debtorName}
              setDebtorName={setDebtorName}
              onPaymentSubmit={handlePaymentSubmit}
            />

          </div>
        ) : (
          <div className="flex-1 bg-white dark:bg-gray-800 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-24 h-24 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-5xl mb-4 shadow-inner">
              🧾
            </div>
            <h3 className="text-xl font-black text-gray-800 dark:text-white mb-2">
              Hisob-kitob uchun chekni tanlang
            </h3>
            <p className="text-xs sm:text-sm font-bold text-gray-400 max-w-sm leading-relaxed">
              Chap tomondagi ro'yxatdan ochiq stolni tanlang yoki tepadagi tugma orqali kunlik kassa xarajatlarini kiriting.
            </p>
          </div>
        )}
      </div>

      {/* =======================================================
          MODAL 1: YANGI XARAJAT YOKI INKASSATSIYA KIRITISH
          ======================================================= */}
      {isExpenseModalOpen && (
        <div
          onClick={() => setIsExpenseModalOpen(false)}
          className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-end md:items-center justify-center md:p-4 animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 w-full md:max-w-lg rounded-t-3xl md:rounded-3xl p-6 shadow-2xl space-y-4 border border-gray-100 dark:border-gray-700"
          >
            <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
              <h3 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2">
                <span>💸</span> Kassadan Chiqim / Xarajat Kiritish
              </h3>
              <button
                type="button"
                onClick={() => setIsExpenseModalOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-red-500 font-black flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-4">
              {/* 1. Toifa tanlash */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Chiqim Toifasi *
                </label>
                <select
                  value={expenseForm.category}
                  onChange={e => setExpenseForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white outline-none focus:border-red-500 cursor-pointer"
                >
                  {EXPENSE_CATEGORIES.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Qaysi puldan berildi (Naqd yoki Plastik) */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Qaysi hisobdan berildi? *
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { id: 'Naqd', label: `💵 Naqd puldan (${cashDrawerSummary.expectedCashInDrawer.toLocaleString()} s)` },
                    { id: 'Plastik', label: '💳 Karta / Perechisleniye' }
                  ].map(src => (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => setExpenseForm(prev => ({ ...prev, paymentSource: src.id }))}
                      className={`py-3 px-3 rounded-xl font-black text-xs border-2 transition ${
                        expenseForm.paymentSource === src.id
                          ? 'bg-red-600 text-white border-red-600 shadow-sm'
                          : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      {src.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Summa va Oluvchi shaxs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Summa (so'mda) *
                  </label>
                  <input
                    type="number"
                    required
                    min="100"
                    step="any"
                    autoFocus
                    value={expenseForm.amount}
                    onChange={e => setExpenseForm(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="Masalan: 50000"
                    className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border-2 border-red-300 dark:border-red-700 font-black text-lg text-gray-900 dark:text-white outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Kimga berildi? (Ixtiyoriy)
                  </label>
                  <input
                    type="text"
                    value={expenseForm.recipient}
                    onChange={e => setExpenseForm(prev => ({ ...prev, recipient: e.target.value }))}
                    placeholder="Masalan: Oshpaz Ali / Nonvoy"
                    className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-sm text-gray-900 dark:text-white outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {/* Tezkor summa tugmalari */}
              <div className="flex flex-wrap gap-1.5">
                {[10000, 20000, 50000, 100000, 200000, 500000].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setExpenseForm(prev => ({ ...prev, amount: String(preset) }))}
                    className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-red-100 dark:hover:bg-red-900/40 text-gray-700 dark:text-gray-200 font-black text-xs transition"
                  >
                    {(preset / 1000).toLocaleString()} ming
                  </button>
                ))}
              </div>

              {/* 4. Sababi / Izoh */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Aniq sababi / Izoh *
                </label>
                <input
                  type="text"
                  required
                  value={expenseForm.note}
                  onChange={e => setExpenseForm(prev => ({ ...prev, note: e.target.value }))}
                  placeholder="Masalan: Bozordan ko'kat, limon va 30 ta non olindi"
                  className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-sm text-gray-900 dark:text-white outline-none focus:border-red-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="flex-1 py-4 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-bold text-sm"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="flex-1 py-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-sm shadow-lg shadow-red-600/30 transition active:scale-95"
                >
                  Chiqimni Tasdiqlash ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =======================================================
          MODAL 2: JORIY SMENADAGI XARAJATLAR VA INKASSATSIYA RO'YXATI
          ======================================================= */}
      {isExpenseListModalOpen && (
        <div
          onClick={() => setIsExpenseListModalOpen(false)}
          className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-4 max-h-[88vh] flex flex-col border border-gray-100 dark:border-gray-700"
          >
            <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
              <div>
                <h3 className="font-black text-lg text-gray-900 dark:text-white">
                  📋 Joriy Smena Chiqimlari va Inkassatsiya Jurnali
                </h3>
                <p className="text-xs font-bold text-gray-400">
                  Jami chiqim: -{cashDrawerSummary.totalOutflow.toLocaleString()} so'm ({currentShiftExpenses.length} ta yozuv)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsExpenseListModalOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-red-500 font-black flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {currentShiftExpenses.length === 0 ? (
                <div className="text-center py-12 text-gray-400 font-bold">
                  Hozirgi smenada hali hech qanday xarajat kiritilmagan.
                </div>
              ) : (
                currentShiftExpenses.map(exp => (
                  <div
                    key={exp.id}
                    className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 flex justify-between items-start gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase ${
                          exp.isInkassatsiya || exp.category === 'Inkassatsiya'
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        }`}>
                          {exp.categoryLabel || exp.category}
                        </span>
                        <span className="text-xs font-bold text-gray-400">
                          {exp.date}
                        </span>
                      </div>

                      <p className="font-black text-sm text-gray-900 dark:text-white">
                        {exp.note}
                      </p>
                      <p className="text-xs font-bold text-gray-500">
                        Olgan: {exp.recipient || '-'} • Kassir: {exp.cashierName} • Manba: {exp.paymentSource}
                      </p>
                    </div>

                    <div className="text-right shrink-0 space-y-2">
                      <span className="font-black text-base text-red-600 dark:text-red-400 block">
                        -{Number(exp.amount || 0).toLocaleString()} s
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteExpense(exp)}
                        className="text-xs font-black text-gray-400 hover:text-red-600 transition"
                      >
                        🗑 O'chirish
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t dark:border-gray-700 flex justify-between items-center">
              <span className="text-xs font-black text-gray-500">
                🗄️ Seyfda qolishi shart bo'lgan naqd pul: <strong className="text-indigo-600 dark:text-indigo-400 text-sm">{cashDrawerSummary.expectedCashInDrawer.toLocaleString()} so'm</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsExpenseListModalOpen(false);
                  setIsExpenseModalOpen(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-red-600 text-white font-black text-xs"
              >
                + Yangi Chiqim Qo'shish
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}