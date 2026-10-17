import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import useSticky from '../hooks/useSticky';
import WaiterTableGrid from './WaiterTableGrid';
import WaiterMenu from './WaiterMenu';
import WaiterCart from './WaiterCart';
import { TableQrModal } from './Modals';

// Ovozli bildirishnoma (Taom tayyor bo'lganda yoki mijoz chaqirganda)
const playWaiterBeep = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(784, now); // G5
    osc.frequency.setValueAtTime(1046.5, now + 0.15); // C6
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.5);
  } catch {
    // ignore audio block
  }
};

export default function WaiterMode({
  tables: tablesProp,
  orders: ordersProp,
  setOrders: setOrdersProp,
  menuItems: menuProp,
  menu: altMenuProp,
  menuCategories: categoriesProp,
  categories: altCategoriesProp,
  cafeName: cafeNameProp,
  serviceFee = 10,
  currentUser,
  addAuditLog
}) {
  // =========================================================
  // 1. ZAXIRA XOTIRA VA BRON / VIP-TAYMER STATE'LARI
  // =========================================================
  const [stickyTables] = useSticky(
    'pos_tables',
    Array.from({ length: 15 }, (_, i) => `${i + 1}-Stol`)
  );
  const [stickyOrders, setStickyOrders] = useSticky('pos_orders', []);
  const [stickyMenu] = useSticky('pos_menu', []);
  const [stickyCategories] = useSticky('pos_categories', ['Asosiy', 'Ichimlik', 'Shirinlik']);
  const [stickyCafeName] = useSticky('pos_cafe_name', 'Premium Cafe');

  // Stol Bronlari va Soatbay VIP-Taymerlar xotirasi
  const [reservations, setReservations] = useSticky('pos_reservations', {});
  const [tableTimers, setTableTimers] = useSticky('pos_table_timers', {});

  const safeTables = useMemo(() => {
    if (Array.isArray(tablesProp) && tablesProp.length > 0) return tablesProp;
    return Array.isArray(stickyTables) && stickyTables.length > 0
      ? stickyTables
      : Array.from({ length: 15 }, (_, i) => `${i + 1}-Stol`);
  }, [tablesProp, stickyTables]);

  const safeOrders = useMemo(() => {
    if (Array.isArray(ordersProp)) return ordersProp;
    return Array.isArray(stickyOrders) ? stickyOrders : [];
  }, [ordersProp, stickyOrders]);

  const safeMenu = useMemo(() => {
    if (Array.isArray(menuProp) && menuProp.length > 0) return menuProp;
    if (Array.isArray(altMenuProp) && altMenuProp.length > 0) return altMenuProp;
    return Array.isArray(stickyMenu) ? stickyMenu : [];
  }, [menuProp, altMenuProp, stickyMenu]);

  const safeCategories = useMemo(() => {
    if (Array.isArray(categoriesProp) && categoriesProp.length > 0) return categoriesProp;
    if (Array.isArray(altCategoriesProp) && altCategoriesProp.length > 0) return altCategoriesProp;
    if (Array.isArray(stickyCategories) && stickyCategories.length > 0) return stickyCategories;
    const extracted = Array.from(new Set(safeMenu.map(m => m?.category).filter(Boolean)));
    return extracted.length > 0 ? extracted : ['Asosiy'];
  }, [categoriesProp, altCategoriesProp, stickyCategories, safeMenu]);

  const resolvedCafeName = cafeNameProp || stickyCafeName || 'Premium Cafe';

  // Buyurtmalarni ham App.jsx state'iga, ham localStorage'ga bir vaqtda yozish
  const updateOrders = useCallback((updater) => {
    if (typeof setOrdersProp === 'function') {
      setOrdersProp(updater);
    }
    setStickyOrders(updater);
  }, [setOrdersProp, setStickyOrders]);

  // =========================================================
  // 2. OFITSIANT ISHCHI STATE'LARI
  // =========================================================
  const [selectedTable, setSelectedTable] = useState(null);
  const [cart, setCart] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('Barchasi');
  const [searchQuery, setSearchQuery] = useState('');
  const [qrModalTable, setQrModalTable] = useState(null);

  // Stol ko'chirish va Chek bo'lish modallari
  const [transferOrder, setTransferOrder] = useState(null);
  const [targetTransferTable, setTargetTransferTable] = useState('');
  const [splitOrder, setSplitOrder] = useState(null);
  const [splitTargetTable, setSplitTargetTable] = useState('');
  const [splitQuantities, setSplitQuantities] = useState({});

  // Tayyor taom yoki mijoz chaqiruvi uchun ovozli signal nazorati
  const prevReadyCountRef = useRef(0);

  useEffect(() => {
    const readyOrCalledCount = safeOrders.filter(
      o => o && (o.status === 'Tayyor' || o.hasCall)
    ).length;

    if (readyOrCalledCount > prevReadyCountRef.current) {
      playWaiterBeep();
    }
    prevReadyCountRef.current = readyOrCalledCount;
  }, [safeOrders]);

  // Tanlangan stolning joriy ochiq buyurtmasi
  const currentTableOrder = useMemo(() => {
    if (!selectedTable) return null;
    return (
      safeOrders.find(
        o =>
          o &&
          o.table === selectedTable &&
          !["To'langan", 'Qarz', 'Arxiv'].includes(o.status)
      ) || null
    );
  }, [safeOrders, selectedTable]);

  // =========================================================
  // 3. STOL TANLASH VA SAVATCHA (CART) BOSHQARUVI
  // =========================================================
  const handleSelectTable = (tableName) => {
    setSelectedTable(tableName);
    setSelectedCategory('Barchasi');
    setSearchQuery('');

    const existing = safeOrders.find(
      o =>
        o &&
        o.table === tableName &&
        !["To'langan", 'Qarz', 'Arxiv'].includes(o.status)
    );

    if (existing && Array.isArray(existing.items)) {
      setCart(
        existing.items.map((item, idx) => ({
          ...item,
          cartItemId: item.cartItemId || `${item.id || idx}_${idx}`,
          quantity: Number(item.quantity ?? item.qty ?? 1) || 1,
          qty: Number(item.quantity ?? item.qty ?? 1) || 1,
          price: Number(item.price ?? item.variants?.[0]?.price ?? 0) || 0
        }))
      );
    } else {
      setCart([]);
    }
  };

  // Taomni savatchaga qo'shish (Variant/Porsiya bilan yoki oddiy)
  const handleAddToCart = useCallback((dishItem, chosenVariant = null, customNote = '') => {
    if (!dishItem || dishItem.is_available === false) return;

    const variants = Array.isArray(dishItem.variants) ? dishItem.variants : [];
    const activeVariant = chosenVariant || (variants.length > 0 ? variants[0] : null);

    const itemPrice = Number(
      activeVariant?.price ?? dishItem.price ?? variants[0]?.price ?? 0
    ) || 0;

    const showVariantSuffix =
      activeVariant &&
      activeVariant.name &&
      (variants.length > 1 || activeVariant.name.toLowerCase() !== '1 porsiya');

    const fullDisplayName = showVariantSuffix
      ? `${dishItem.name} (${activeVariant.name})`
      : dishItem.name;

    const itemNote = String(customNote || dishItem.note || '').trim();

    setCart(prev => {
      const existingIndex = prev.findIndex(
        c =>
          c &&
          c.name === fullDisplayName &&
          Number(c.price) === itemPrice &&
          String(c.note || '').trim() === itemNote
      );

      if (existingIndex > -1) {
        return prev.map((c, idx) => {
          if (idx !== existingIndex) return c;
          const nextQty = (Number(c.quantity ?? c.qty ?? 1) || 1) + 1;
          return { ...c, quantity: nextQty, qty: nextQty };
        });
      }

      return [
        ...prev,
        {
          ...dishItem,
          id: dishItem.id,
          baseName: dishItem.name,
          name: fullDisplayName,
          variantName: activeVariant?.name || '1 porsiya',
          cartItemId: `ci_${dishItem.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          price: itemPrice,
          quantity: 1,
          qty: 1,
          note: itemNote
        }
      ];
    });
  }, []);

  // Savatchada taom miqdorini o'zgartirish (+1 / -1)
  const handleUpdateQuantity = useCallback((targetIdentifier, delta = 0) => {
    setCart(prev =>
      prev
        .map((item, idx) => {
          if (!item) return null;
          const isMatch =
            item.cartItemId === targetIdentifier ||
            String(item.id) === String(targetIdentifier) ||
            item.name === targetIdentifier ||
            idx === targetIdentifier;

          if (!isMatch) return item;

          const currentQty = Number(item.quantity ?? item.qty ?? 1) || 1;
          const nextQty = currentQty + Number(delta);
          return nextQty > 0
            ? { ...item, quantity: nextQty, qty: nextQty }
            : null;
        })
        .filter(Boolean)
    );
  }, []);

  // Savatchadan taomni butunlay o'chirish
  const handleRemoveFromCart = useCallback((targetIdentifier) => {
    setCart(prev =>
      prev.filter((item, idx) => {
        if (!item) return false;
        const isMatch =
          item.cartItemId === targetIdentifier ||
          String(item.id) === String(targetIdentifier) ||
          item.name === targetIdentifier ||
          idx === targetIdentifier;
        return !isMatch;
      })
    );
  }, []);

  // Savatchadagi taomga oshpaz uchun izoh yozish
  const handleUpdateNote = useCallback((targetIdentifier, nextNote) => {
    setCart(prev =>
      prev.map((item, idx) => {
        if (!item) return item;
        const isMatch =
          item.cartItemId === targetIdentifier ||
          String(item.id) === String(targetIdentifier) ||
          item.name === targetIdentifier ||
          idx === targetIdentifier;
        return isMatch ? { ...item, note: nextNote } : item;
      })
    );
  }, []);

  // =========================================================
  // 4. BUYURTMANI OSHXONAGA YUBORISH VA YETKAZILDI BELGISI
  // =========================================================
  const handleSubmitOrder = () => {
    if (!selectedTable) {
      alert("Iltimos, avval stolni tanlang!");
      return;
    }
    if (!Array.isArray(cart) || cart.length === 0) {
      alert("Savatcha bo'sh! Iltimos, menyudan kamida 1 ta taom tanlang.");
      return;
    }

    const normalizedCart = cart.map((item, idx) => {
      const price = Number(item.price ?? item.variants?.[0]?.price ?? 0) || 0;
      const qty = Number(item.quantity ?? item.qty ?? 1) || 1;
      return {
        ...item,
        cartItemId: item.cartItemId || `ci_${item.id || idx}_${Date.now()}`,
        price,
        quantity: qty,
        qty
      };
    });

    const subTotal = normalizedCart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const isTakeaway = selectedTable === 'Olib ketish';
    const feePct = isTakeaway ? 0 : Number(serviceFee) || 0;
    const serviceFeeAmount = Math.round((subTotal * feePct) / 100);
    const totalAmount = subTotal + serviceFeeAmount;

    const nowDate = new Date().toLocaleDateString();
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const activeBooking = reservations?.[selectedTable];

    if (currentTableOrder) {
      updateOrders(prev =>
        (Array.isArray(prev) ? prev : []).map(o =>
          o && String(o.id) === String(currentTableOrder.id)
            ? {
                ...o,
                items: normalizedCart,
                subTotal,
                subtotal: subTotal,
                serviceFee: feePct,
                serviceFeePercent: feePct,
                serviceFeeAmount,
                total: totalAmount,
                finalTotal: totalAmount,
                status: 'Yangi'
              }
            : o
        )
      );

      if (typeof addAuditLog === 'function') {
        addAuditLog(
          'Buyurtma yangilandi',
          `${selectedTable}: Jami ${totalAmount.toLocaleString()} so'm (${normalizedCart.length} xil taom)`
        );
      }
    } else {
      const newOrder = {
        id: Date.now().toString(),
        createdAt: Date.now(),
        table: selectedTable,
        waiter: currentUser?.name || 'Ofitsiant',
        waiterName: currentUser?.name || 'Ofitsiant',
        date: nowDate,
        time: nowTime,
        status: 'Yangi',
        items: normalizedCart,
        subTotal,
        subtotal: subTotal,
        serviceFee: feePct,
        serviceFeePercent: feePct,
        serviceFeeAmount,
        total: totalAmount,
        finalTotal: totalAmount,
        customerName: activeBooking?.customerName || '',
        customerPhone: activeBooking?.customerPhone || '',
        depositPaid: Number(activeBooking?.depositAmount || 0)
      };

      updateOrders(prev => [newOrder, ...(Array.isArray(prev) ? prev : [])]);

      if (typeof addAuditLog === 'function') {
        addAuditLog(
          'Yangi buyurtma ochildi',
          `${selectedTable}: ${totalAmount.toLocaleString()} so'm (${normalizedCart.length} xil taom)`
        );
      }
    }

    if (activeBooking) {
      setReservations(prev => {
        const next = { ...(prev || {}) };
        delete next[selectedTable];
        return next;
      });
    }

    setSelectedTable(null);
    setCart([]);
  };

  const handleMarkAsDelivered = () => {
    if (!currentTableOrder) return;
    updateOrders(prev =>
      (Array.isArray(prev) ? prev : []).map(o =>
        o && String(o.id) === String(currentTableOrder.id)
          ? { ...o, status: 'Yetkazildi' }
          : o
      )
    );
    setSelectedTable(null);
    setCart([]);
  };

  const handleClearTableCall = (tableName) => {
    updateOrders(prev =>
      (Array.isArray(prev) ? prev : []).map(o =>
        o && o.table === tableName ? { ...o, hasCall: false } : o
      )
    );
  };

  // =========================================================
  // 5. 📌 BRON (RESERVATION) BOSHQARUV FUNKSIYALARI
  // =========================================================
  const handleSaveReservation = (tableName, bookingData) => {
    setReservations(prev => ({
      ...(prev || {}),
      [tableName]: bookingData
    }));

    if (typeof addAuditLog === 'function') {
      addAuditLog(
        'Stol bron qilindi',
        `${tableName}: ${bookingData.customerName} (${bookingData.time}, ${bookingData.guestsCount} kishi)`
      );
    }
  };

  const handleCancelReservation = (tableName) => {
    if (!window.confirm(`"${tableName}" uchun qilingan bronni bekor qilasizmi?`)) return;
    setReservations(prev => {
      const next = { ...(prev || {}) };
      delete next[tableName];
      return next;
    });
  };

  const handleConvertReservationToOrder = (tableName) => {
    setReservations(prev => {
      const next = { ...(prev || {}) };
      delete next[tableName];
      return next;
    });
    handleSelectTable(tableName);
  };

  // =========================================================
  // 6. ⏱️ SOATBAY VIP-TAYMER (TARIFIKATOR) FUNKSIYALARI
  // =========================================================
  const handleStartTableTimer = (tableName, config) => {
    setTableTimers(prev => ({
      ...(prev || {}),
      [tableName]: {
        table: tableName,
        serviceTitle: config.serviceTitle,
        hourlyRate: config.hourlyRate,
        startTimeMs: Date.now(),
        accruedMs: 0,
        isPaused: false
      }
    }));

    if (typeof addAuditLog === 'function') {
      addAuditLog(
        'VIP Taymer yoqildi',
        `${tableName}: ${config.serviceTitle} (${config.hourlyRate.toLocaleString()} s/soat)`
      );
    }
  };

  const handlePauseResumeTableTimer = (tableName) => {
    setTableTimers(prev => {
      const current = prev?.[tableName];
      if (!current) return prev;

      if (current.isPaused) {
        return {
          ...prev,
          [tableName]: {
            ...current,
            startTimeMs: Date.now(),
            isPaused: false
          }
        };
      } else {
        const addedMs = Math.max(0, Date.now() - Number(current.startTimeMs));
        return {
          ...prev,
          [tableName]: {
            ...current,
            accruedMs: (Number(current.accruedMs) || 0) + addedMs,
            isPaused: true
          }
        };
      }
    });
  };

  const handleCancelTableTimer = (tableName) => {
    if (!window.confirm(`"${tableName}" dagi soatbay vaqt hisoblagichni bekor qilasizmi?`)) return;
    setTableTimers(prev => {
      const next = { ...(prev || {}) };
      delete next[tableName];
      return next;
    });
  };

  const handleFinishTimerAndAddToOrder = (tableName, timerStats) => {
    if (!timerStats) return;

    const lineItemName = `${timerStats.serviceTitle} (${timerStats.durationHuman})`;
    const lineItemPrice = Number(timerStats.currentCost) || 0;

    if (
      !window.confirm(
        `⏱️ "${tableName}" vaqt hisobini yakunlab, chekka qo'shamizmi?\n\n` +
        `• Vaqt: ${timerStats.durationHuman} (${timerStats.formattedClock})\n` +
        `• Hisoblangan summa: ${lineItemPrice.toLocaleString()} so'm`
      )
    ) {
      return;
    }

    const timerLineItem = {
      id: `vip_time_${Date.now()}`,
      cartItemId: `vip_time_${Date.now()}`,
      name: lineItemName,
      category: 'VIP Xizmat',
      price: lineItemPrice,
      quantity: 1,
      qty: 1,
      note: `Tarif: ${timerStats.hourlyRate.toLocaleString()} s/soat`
    };

    const existingOrder = safeOrders.find(
      o =>
        o &&
        o.table === tableName &&
        !["To'langan", 'Qarz', 'Arxiv'].includes(o.status)
    );

    if (existingOrder) {
      const nextItems = [...(Array.isArray(existingOrder.items) ? existingOrder.items : []), timerLineItem];
      const nextSubTotal = nextItems.reduce(
        (s, it) => s + (Number(it.price) || 0) * (Number(it.quantity ?? it.qty ?? 1) || 1),
        0
      );
      const feePct = tableName === 'Olib ketish' ? 0 : Number(existingOrder.serviceFee ?? serviceFee) || 0;
      const nextFeeAmt = Math.round((nextSubTotal * feePct) / 100);

      updateOrders(prev =>
        (Array.isArray(prev) ? prev : []).map(o =>
          o && String(o.id) === String(existingOrder.id)
            ? {
                ...o,
                items: nextItems,
                subTotal: nextSubTotal,
                subtotal: nextSubTotal,
                serviceFeeAmount: nextFeeAmt,
                total: nextSubTotal + nextFeeAmt,
                finalTotal: nextSubTotal + nextFeeAmt
              }
            : o
        )
      );
    } else {
      const feePct = tableName === 'Olib ketish' ? 0 : Number(serviceFee) || 0;
      const feeAmt = Math.round((lineItemPrice * feePct) / 100);
      const newOrder = {
        id: Date.now().toString(),
        createdAt: Date.now(),
        table: tableName,
        waiter: currentUser?.name || 'Ofitsiant',
        waiterName: currentUser?.name || 'Ofitsiant',
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'Yetkazildi',
        items: [timerLineItem],
        subTotal: lineItemPrice,
        subtotal: lineItemPrice,
        serviceFee: feePct,
        serviceFeeAmount: feeAmt,
        total: lineItemPrice + feeAmt,
        finalTotal: lineItemPrice + feeAmt
      };
      updateOrders(prev => [newOrder, ...(Array.isArray(prev) ? prev : [])]);
    }

    setTableTimers(prev => {
      const next = { ...(prev || {}) };
      delete next[tableName];
      return next;
    });

    if (typeof addAuditLog === 'function') {
      addAuditLog(
        "VIP Vaqt chekka qo'shildi",
        `${tableName}: ${lineItemName} — +${lineItemPrice.toLocaleString()} so'm`
      );
    }
  };

  // =========================================================
  // 7. STOL KO'CHIRISH VA CHEK BO'LISH FUNKSIYALARI
  // =========================================================
  const freeTablesForAction = useMemo(() => {
    const busySet = new Set(
      safeOrders
        .filter(o => o && !["To'langan", 'Qarz', 'Arxiv'].includes(o.status))
        .map(o => o.table)
    );
    return safeTables.filter(t => t !== 'Olib ketish' && !busySet.has(t));
  }, [safeTables, safeOrders]);

  const handleConfirmTransfer = (e) => {
    e.preventDefault();
    if (!transferOrder || !targetTransferTable) return;

    updateOrders(prev =>
      (Array.isArray(prev) ? prev : []).map(o =>
        o && String(o.id) === String(transferOrder.id)
          ? { ...o, table: targetTransferTable }
          : o
      )
    );

    if (typeof addAuditLog === 'function') {
      addAuditLog("Stol ko'chirildi", `${transferOrder.table} -> ${targetTransferTable}`);
    }

    setTransferOrder(null);
    setTargetTransferTable('');
  };

  const handleConfirmSplit = (e) => {
    e.preventDefault();
    if (!splitOrder || !splitTargetTable) return;

    const originalItems = Array.isArray(splitOrder.items) ? splitOrder.items : [];
    const remainingItems = [];
    const movedItems = [];

    originalItems.forEach((item, idx) => {
      const totalQty = Number(item.quantity ?? item.qty ?? 1) || 1;
      const moveQty = Math.min(totalQty, Math.max(0, Number(splitQuantities[idx]) || 0));

      if (moveQty > 0) {
        movedItems.push({ ...item, quantity: moveQty, qty: moveQty });
      }
      if (totalQty - moveQty > 0) {
        remainingItems.push({ ...item, quantity: totalQty - moveQty, qty: totalQty - moveQty });
      }
    });

    if (movedItems.length === 0 || remainingItems.length === 0) {
      alert("Chekni bo'lish uchun kamida 1 ta taomni yangi stolga ajrating va eski stolda ham kamida 1 ta taom qolsin!");
      return;
    }

    const calcOrderTotals = (itemsList, feePct) => {
      const sub = itemsList.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
      const fee = Math.round((sub * feePct) / 100);
      return { sub, fee, total: sub + fee };
    };

    const feePct = Number(splitOrder.serviceFee ?? serviceFee) || 0;
    const remTotals = calcOrderTotals(remainingItems, feePct);
    const movTotals = calcOrderTotals(movedItems, feePct);

    const newSplitOrder = {
      ...splitOrder,
      id: `${Date.now()}`,
      table: splitTargetTable,
      items: movedItems,
      subTotal: movTotals.sub,
      subtotal: movTotals.sub,
      serviceFeeAmount: movTotals.fee,
      total: movTotals.total,
      finalTotal: movTotals.total
    };

    updateOrders(prev => [
      newSplitOrder,
      ...(Array.isArray(prev) ? prev : []).map(o =>
        o && String(o.id) === String(splitOrder.id)
          ? {
              ...o,
              items: remainingItems,
              subTotal: remTotals.sub,
              subtotal: remTotals.sub,
              serviceFeeAmount: remTotals.fee,
              total: remTotals.total,
              finalTotal: remTotals.total
            }
          : o
      )
    ]);

    setSplitOrder(null);
    setSplitTargetTable('');
    setSplitQuantities({});
  };

  // =========================================================
  // 8. RENDER (UI DIZAYN)
  // =========================================================
  return (
    <div className="max-w-7xl mx-auto pb-8">
      {!selectedTable ? (
        /* 1-EKRAN: ZAL STOLLARI, BRONLAR VA VIP-TAYMERLAR XARITASI */
        <WaiterTableGrid
          tables={safeTables}
          orders={safeOrders}
          reservations={reservations}
          tableTimers={tableTimers}
          selectedTable={selectedTable}
          onSelectTable={handleSelectTable}
          onClearTableCall={handleClearTableCall}
          onOpenTransferModal={ord => {
            setTransferOrder(ord);
            setTargetTransferTable(freeTablesForAction[0] || '');
          }}
          onOpenSplitModal={ord => {
            setSplitOrder(ord);
            setSplitTargetTable(freeTablesForAction[0] || '');
            setSplitQuantities({});
          }}
          onOpenQrModal={tbl => setQrModalTable(tbl)}
          onSaveReservation={handleSaveReservation}
          onCancelReservation={handleCancelReservation}
          onConvertReservationToOrder={handleConvertReservationToOrder}
          onStartTableTimer={handleStartTableTimer}
          onPauseResumeTableTimer={handlePauseResumeTableTimer}
          onFinishTimerAndAddToOrder={handleFinishTimerAndAddToOrder}
          onCancelTableTimer={handleCancelTableTimer}
        />
      ) : (
        /* 2-EKRAN: TANLANGAN STOL MENYUSI VA SAVATCHASI (BARCHA PROP ALIASLARI BILAN) */
        <div className="space-y-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex justify-between items-center">
            <button
              type="button"
              onClick={() => {
                setSelectedTable(null);
                setCart([]);
              }}
              className="px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-800 dark:text-white font-black text-xs sm:text-sm flex items-center gap-2 transition active:scale-95"
            >
              <span>⬅️</span> Zaldagi stollarga qaytish
            </button>

            <div className="text-right">
              <span className="text-xs font-bold text-gray-400 block">Tanlangan joy:</span>
              <span className="font-black text-lg text-amber-600 dark:text-amber-400">
                🪑 {selectedTable}
              </span>
            </div>
          </div>

          <div className="h-[calc(100vh-190px)] min-h-[560px] flex flex-col lg:flex-row gap-6">
            <WaiterMenu
              menuItems={safeMenu}
              menu={safeMenu}
              menuCategories={safeCategories}
              categories={safeCategories}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              activeCategory={selectedCategory}
              setActiveCategory={setSelectedCategory}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchTerm={searchQuery}
              setSearchTerm={setSearchQuery}
              cart={cart}
              onAddToCart={handleAddToCart}
              addToCart={handleAddToCart}
              onUpdateQuantity={handleUpdateQuantity}
            />

            <WaiterCart
              selectedTable={selectedTable}
              table={selectedTable}
              cart={cart}
              setCart={setCart}
              currentTableOrder={currentTableOrder}
              activeOrder={currentTableOrder}
              existingOrder={currentTableOrder}
              serviceFee={serviceFee}
              onUpdateQuantity={handleUpdateQuantity}
              updateQuantity={handleUpdateQuantity}
              updateQty={handleUpdateQuantity}
              onRemoveItem={handleRemoveFromCart}
              removeFromCart={handleRemoveFromCart}
              onUpdateNote={handleUpdateNote}
              updateItemNote={handleUpdateNote}
              onSubmitOrder={handleSubmitOrder}
              submitOrder={handleSubmitOrder}
              handleSendOrder={handleSubmitOrder}
              onMarkAsDelivered={handleMarkAsDelivered}
              markAsServed={handleMarkAsDelivered}
              onBack={() => {
                setSelectedTable(null);
                setCart([]);
              }}
            />
          </div>
        </div>
      )}

      {/* QR-KOD MODALI */}
      {qrModalTable && (
        <TableQrModal
          table={qrModalTable}
          cafeName={resolvedCafeName}
          onClose={() => setQrModalTable(null)}
        />
      )}

      {/* STOL KO'CHIRISH MODALI */}
      {transferOrder && (
        <div
          onClick={() => setTransferOrder(null)}
          className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4"
          >
            <h3 className="font-black text-lg text-gray-900 dark:text-white">
              🔄 {transferOrder.table} ni Boshqa Stolga Ko'chirish
            </h3>
            <form onSubmit={handleConfirmTransfer} className="space-y-4">
              <select
                required
                value={targetTransferTable}
                onChange={e => setTargetTransferTable(e.target.value)}
                className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white"
              >
                <option value="">-- Bo'sh stolni tanlang --</option>
                {freeTablesForAction.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTransferOrder(null)}
                  className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-bold text-xs"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-black text-xs"
                >
                  Ko'chirish ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CHEKNI BO'LISH MODALI */}
      {splitOrder && (
        <div
          onClick={() => setSplitOrder(null)}
          className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 max-h-[88vh] flex flex-col"
          >
            <h3 className="font-black text-lg text-gray-900 dark:text-white">
              ✂️ {splitOrder.table} Chekini Bo'lish
            </h3>
            <form onSubmit={handleConfirmSplit} className="space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Qaysi bo'sh stolga ajratamiz?
                </label>
                <select
                  required
                  value={splitTargetTable}
                  onChange={e => setSplitTargetTable(e.target.value)}
                  className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-xs text-gray-900 dark:text-white"
                >
                  <option value="">-- Stolni tanlang --</option>
                  {freeTablesForAction.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                {(splitOrder.items || []).map((it, idx) => {
                  const maxQ = Number(it.quantity ?? it.qty ?? 1) || 1;
                  const chosenQ = Number(splitQuantities[idx]) || 0;
                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 flex justify-between items-center"
                    >
                      <div>
                        <p className="font-black text-xs text-gray-900 dark:text-white">{it.name}</p>
                        <span className="text-[10px] font-bold text-gray-400">Mavjud: {maxQ} pors</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSplitQuantities(prev => ({
                              ...prev,
                              [idx]: Math.max(0, chosenQ - 1)
                            }))
                          }
                          className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-gray-700 font-black"
                        >
                          -
                        </button>
                        <span className="font-black text-xs w-6 text-center">{chosenQ}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setSplitQuantities(prev => ({
                              ...prev,
                              [idx]: Math.min(maxQ, chosenQ + 1)
                            }))
                          }
                          className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-black"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSplitOrder(null)}
                  className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-bold text-xs"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-purple-600 text-white font-black text-xs"
                >
                  ✂️ Chekni Ajratish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}