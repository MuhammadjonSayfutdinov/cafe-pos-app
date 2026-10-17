import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  menuCategories: categoriesProp,
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

  // YANGI: Stol Bronlari va Soatbay VIP-Taymerlar xotirasi
  const [reservations, setReservations] = useSticky('pos_reservations', {});
  const [tableTimers, setTableTimers] = useSticky('pos_table_timers', {});

  const safeTables = Array.isArray(tablesProp) && tablesProp.length > 0 ? tablesProp : stickyTables;
  const safeOrders = Array.isArray(ordersProp) ? ordersProp : stickyOrders;
  const safeMenu = Array.isArray(menuProp) && menuProp.length > 0 ? menuProp : stickyMenu;
  const safeCategories = Array.isArray(categoriesProp) && categoriesProp.length > 0
    ? categoriesProp
    : stickyCategories;
  const resolvedCafeName = cafeNameProp || stickyCafeName || 'Premium Cafe';

  const updateOrders = typeof setOrdersProp === 'function' ? setOrdersProp : setStickyOrders;

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
    const existing = safeOrders.find(
      o =>
        o &&
        o.table === tableName &&
        !["To'langan", 'Qarz', 'Arxiv'].includes(o.status)
    );
    setCart(existing && Array.isArray(existing.items) ? [...existing.items] : []);
  };

  const handleAddToCart = (dishItem) => {
    if (!dishItem || dishItem.is_available === false) return;

    const itemPrice = Number(dishItem.price ?? dishItem.variants?.[0]?.price ?? 0) || 0;
    const itemName = dishItem.name;
    const itemNote = (dishItem.note || '').trim();

    setCart(prev => {
      const existingIndex = prev.findIndex(
        c => c.name === itemName && Number(c.price) === itemPrice && (c.note || '') === itemNote
      );

      if (existingIndex > -1) {
        return prev.map((c, idx) =>
          idx === existingIndex
            ? { ...c, quantity: (Number(c.quantity ?? c.qty ?? 1) || 1) + 1 }
            : c
        );
      }

      return [
        ...prev,
        {
          ...dishItem,
          cartItemId: `${dishItem.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          price: itemPrice,
          quantity: 1,
          note: itemNote
        }
      ];
    });
  };

  const handleUpdateQuantity = (cartItemId, delta) => {
    setCart(prev =>
      prev
        .map(item => {
          const key = item.cartItemId || item.id || item.name;
          if (key !== cartItemId) return item;
          const nextQty = (Number(item.quantity ?? item.qty ?? 1) || 1) + delta;
          return nextQty > 0 ? { ...item, quantity: nextQty, qty: nextQty } : null;
        })
        .filter(Boolean)
    );
  };

  const handleUpdateNote = (cartItemId, nextNote) => {
    setCart(prev =>
      prev.map(item => {
        const key = item.cartItemId || item.id || item.name;
        return key === cartItemId ? { ...item, note: nextNote } : item;
      })
    );
  };

  // =========================================================
  // 4. BUYURTMANI OSHXONAGA YUBORISH VA YETKAZILDI BELGISI
  // =========================================================
  const handleSubmitOrder = () => {
    if (!selectedTable || cart.length === 0) return;

    const subTotal = cart.reduce((sum, item) => {
      const p = Number(item.price ?? item.variants?.[0]?.price ?? 0) || 0;
      const q = Number(item.quantity ?? item.qty ?? 1) || 0;
      return sum + p * q;
    }, 0);

    const isTakeaway = selectedTable === 'Olib ketish';
    const feePct = isTakeaway ? 0 : Number(serviceFee) || 0;
    const serviceFeeAmount = Math.round((subTotal * feePct) / 100);
    const totalAmount = subTotal + serviceFeeAmount;

    const nowDate = new Date().toLocaleDateString();
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Agar shu stolda bron bo'lsa, mehmon ma'lumotlarini buyurtmaga biriktiramiz
    const activeBooking = reservations?.[selectedTable];

    if (currentTableOrder) {
      updateOrders(prev =>
        (Array.isArray(prev) ? prev : []).map(o =>
          o && String(o.id) === String(currentTableOrder.id)
            ? {
                ...o,
                items: cart,
                subTotal,
                subtotal: subTotal,
                serviceFee: feePct,
                serviceFeeAmount,
                total: totalAmount,
                finalTotal: totalAmount,
                status: 'Yangi'
              }
            : o
        )
      );
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
        items: cart,
        subTotal,
        subtotal: subTotal,
        serviceFee: feePct,
        serviceFeeAmount,
        total: totalAmount,
        finalTotal: totalAmount,
        customerName: activeBooking?.customerName || '',
        customerPhone: activeBooking?.customerPhone || '',
        depositPaid: Number(activeBooking?.depositAmount || 0)
      };

      updateOrders(prev => [newOrder, ...(Array.isArray(prev) ? prev : [])]);
    }

    // Agar stolda bron bo'lgan bo'lsa, buyurtma ochilishi bilan bronni yopamiz
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

  const handleConvertReservationToOrder = (tableName, bookingData) => {
    // Mijoz keldi deb bosilganda stolni darhol ochib beramiz
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

  // Vaqtni to'xtatib, hisoblangan summani stolning chekiga qo'shish
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

    // Taymerni o'chirish
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
      addAuditLog('Stol ko\'chirildi', `${transferOrder.table} -> ${targetTransferTable}`);
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
        /* 2-EKRAN: TANLANGAN STOL MENYUSI VA SAVATCHASI */
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

          <div className="h-[calc(100vh-190px)] min-h-[540px] flex flex-col lg:flex-row gap-6">
            <WaiterMenu
              menuItems={safeMenu}
              menuCategories={safeCategories}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onAddToCart={handleAddToCart}
            />

            <WaiterCart
              selectedTable={selectedTable}
              cart={cart}
              currentTableOrder={currentTableOrder}
              onUpdateQuantity={handleUpdateQuantity}
              onUpdateNote={handleUpdateNote}
              onSubmitOrder={handleSubmitOrder}
              onMarkAsDelivered={handleMarkAsDelivered}
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