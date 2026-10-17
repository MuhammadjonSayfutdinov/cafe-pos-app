import React, { useState, useMemo } from 'react';
import useSticky from '../hooks/useSticky';
import CashierOrderList from './CashierOrderList';
import CashierReceipt from './CashierReceipt';
import CashierPaymentControls from './CashierPaymentControls';
import {
  notifyOrderClosedTelegram,
  sendTelegramMessage
} from '../utils/telegramNotifier';

// ==========================================
// O'LCHOV BIRLIKLARI KONVERTORI (OMBOR UCHUN)
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

export default function CashierMode({
  orders,
  setOrders,
  menuItems,
  inventory,
  setInventory,
  inventoryLogs,
  setInventoryLogs,
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

  const resolvedCafeName = cafeName || stickyCafeName || 'Premium Cafe';
  const updateOrders = typeof setOrders === 'function' ? setOrders : setStickyOrders;
  const updateInventory = typeof setInventory === 'function' ? setInventory : setStickyInventory;
  const updateInventoryLogs = typeof setInventoryLogs === 'function' ? setInventoryLogs : setStickyInventoryLogs;
  const triggerPrintModal = onPrintReceipt || setReceiptToPrint;

  // ==========================================
  // 2. KASSA STATE'LARI
  // ==========================================
  const [activeTab, setActiveTab] = useState('active'); // 'active' (Ochiq cheklar) | 'debt' (Qarz daftari)
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  // To'lov va Chegirma statelari
  const [discountType, setDiscountType] = useState('none'); // 'none' | 'percent' | 'sum'
  const [discountValue, setDiscountValue] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Naqd'); // 'Naqd' | 'Plastik' | 'Payme' | 'Click' | 'Aralash' | 'Qarz'
  const [mixedCash, setMixedCash] = useState('');
  const [mixedCard, setMixedCard] = useState('');
  const [debtorName, setDebtorName] = useState('');

  // ==========================================
  // 3. BUYURTMALARNI FILTRLASH VA TANLANGAN CHEK
  // ==========================================
  // Zalda ochiq turgan faol stollar
  const activeOrders = useMemo(() => {
    return safeOrders.filter(
      o => o && !["To'langan", 'Qarz', 'Arxiv'].includes(o.status)
    );
  }, [safeOrders]);

  // Qarzga yozilgan (Nasiya) cheklar
  const debtOrders = useMemo(() => {
    return safeOrders.filter(o => o && o.status === 'Qarz');
  }, [safeOrders]);

  // Hozir tanlangan buyurtma (Ofitsiant qo'shimcha taom qo'shsa ham jonli yangilanadi)
  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return activeOrders.find(o => String(o.id) === String(selectedOrderId)) || null;
  }, [activeOrders, selectedOrderId]);

  // ==========================================
  // 4. MATEMATIK HISOB-KITOBLAR (TOTALS)
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

    // "Olib ketish" uchun xizmat haqi 0% bo'ladi
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

  // Aralash to'lovda birinchi maydon kiritilganda ikkinchisini avtomatik hisoblash
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
  // 6. OMBORDAN MASALLIQLARNI AVTOMATIK AYIRISH
  // ==========================================
  const deductOrderIngredientsFromStock = (orderToDeduct) => {
    if (!orderToDeduct || orderToDeduct.inventoryDeducted) return [];
    if (!Array.isArray(orderToDeduct.items) || safeInventory.length === 0) return [];

    // Har bir ombor mahsulotidan jami qancha ayrilishini yig'amiz
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

      // Agar mijoz 0.5 porsiya olgan bo'lsa, masalliqni ham proporsional ayiramiz
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
  // 7. TO'LOVNI TASDIQLASH VA CHEKNI YOPISH
  // ==========================================
  const handlePaymentSubmit = () => {
    if (!selectedOrder) return;

    // 1. Aralash to'lov tekshiruvi
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

    // 2. Qarz (Nasiya) tekshiruvi
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

      // 4) ✈️ RAHBARNING TELEGRAMIGA AVTOMATIK XABAR YUBORISH
      notifyOrderClosedTelegram({
        order: closedOrderObject,
        totals,
        cafeName: resolvedCafeName,
        lowStockAlerts
      });

      // 5) Chek chiqarish oynasini ochish
      if (typeof triggerPrintModal === 'function') {
        triggerPrintModal({
          order: closedOrderObject,
          totals
        });
      }

      // 6) Tanlangan chekni yopish va formani tozalash
      setSelectedOrderId(null);
      resetPaymentControls();
    };

    // Agar chegirma 20% dan katta bo'lsa va foydalanuvchi Admin bo'lmasa, Admin parolini so'raymiz
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
  // 8. QARZNI SO'NDIRISH VA CHEKNI O'CHIRISH
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

    // Telegramga qarz to'langani haqida xabar yuborish
    sendTelegramMessage(
      [
        `✅ <b>NASIYA QARZ TO'LANDI (${resolvedCafeName})</b>`,
        `━━━━━━━━━━━━━━━━━━`,
        `👤 <b>Mijoz:</b> ${debtor}`,
        `🪑 <b>Stol:</b> ${debtOrder.table}`,
        `💰 <b>To'langan summa:</b> +${debtAmount.toLocaleString()} so'm`,
        `💻 <b>Qabul qildi:</b> ${currentUser?.name || 'Kassir'}`,
        `🕒 <b>Vaqt:</b> ${paidTime}`
      ].join('\n'),
      'debt'
    );

    alert(`✅ "${debtor}" ning ${debtAmount.toLocaleString()} so'm qarzi muvaffaqiyatli yopildi!`);
  };

  const handleDeleteOrder = (orderId, tableName = 'Stol') => {
    if (!orderId) return;

    const performDelete = () => {
      const targetOrder = safeOrders.find(o => o && String(o.id) === String(orderId));
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

      // Telegramga xavfsizlik ogohlantirishi
      if (targetOrder) {
        sendTelegramMessage(
          [
            `🚨 <b>CHEK BEKOR QILINDI (${resolvedCafeName})</b>`,
            `━━━━━━━━━━━━━━━━━━`,
            `🪑 <b>Joy:</b> ${targetOrder.table || tableName}`,
            `👤 <b>Ofitsiant:</b> ${targetOrder.waiterName || targetOrder.waiter || 'Ofitsiant'}`,
            `💻 <b>O'chirdi:</b> ${currentUser?.name || 'Kassir'}`,
            `🕒 <b>Vaqt:</b> ${new Date().toLocaleString()}`
          ].join('\n'),
          'security'
        );
      }
    };

    if (typeof requireAdminOverride === 'function' && currentUser?.role !== 'admin') {
      requireAdminOverride(`${tableName} chekini bekor qilish va o'chirish`, performDelete);
    } else {
      performDelete();
    }
  };

  // ==========================================
  // 9. RENDER (UI DIZAYN)
  // ==========================================
  return (
    <div className="h-[calc(100vh-105px)] max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 animate-fade-in">
      
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
          
          {/* O'RTA: TANLANGAN CHEK TAFSILOTLARI */}
          <CashierReceipt
            selectedOrder={selectedOrder}
            totals={totals}
            serviceFee={serviceFee}
          />

          {/* O'NG: CHEGIRMA VA TO'LOV USULLARI */}
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
        /* CHEK TANLANMAGAN HOLAT (PLACEHOLDER) */
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-24 h-24 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-5xl mb-4 shadow-inner">
            🧾
          </div>
          <h3 className="text-xl font-black text-gray-800 dark:text-white mb-2">
            Hisob-kitob uchun chekni tanlang
          </h3>
          <p className="text-xs sm:text-sm font-bold text-gray-400 max-w-sm leading-relaxed">
            Chap tomondagi ro'yxatdan ochiq stolni tanlang, chegirma yoki to'lov turini belgilab, chekni yoping.
          </p>

          {(activeOrders.length > 0 || debtOrders.length > 0) && (
            <div className="flex flex-wrap justify-center gap-3 mt-6">
              <span className="px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-black text-xs">
                🍽 Ochiq cheklar: {activeOrders.length} ta
              </span>
              {debtOrders.length > 0 && (
                <span className="px-4 py-2 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-black text-xs">
                  📓 Qarz daftari: {debtOrders.length} ta
                </span>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}