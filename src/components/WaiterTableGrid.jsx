import React, { useState, useEffect, useMemo } from 'react';

// =========================================================
// SOATBAY TARIF SHABLONLARI (VIP-KABINA / PS5 / BILLIARD)
// =========================================================
const TIMER_PRESETS = [
  { title: '👑 VIP-Kabina vaqti', rate: 50000 },
  { title: '🎮 PlayStation 5 vaqti', rate: 40000 },
  { title: '🎱 Billiard stoli', rate: 60000 },
  { title: '🎤 Karaoke VIP xona', rate: 100000 }
];

export default function WaiterTableGrid({
  tables = [],
  orders = [],
  reservations = {},
  tableTimers = {},
  selectedTable,
  onSelectTable,
  onClearTableCall,
  onOpenTransferModal,
  onOpenSplitModal,
  onOpenQrModal,
  onSaveReservation,
  onCancelReservation,
  onConvertReservationToOrder,
  onStartTableTimer,
  onPauseResumeTableTimer,
  onFinishTimerAndAddToOrder,
  onCancelTableTimer
}) {
  // =========================================================
  // 1. FILTR, QIDIRUV VA JONLI VAQT STATE'LARI
  // =========================================================
  const [tableFilter, setTableFilter] = useState('all'); // 'all' | 'busy' | 'free' | 'reserved' | 'timed' | 'calls'
  const [searchQuery, setSearchQuery] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Bron qilish modali statelari
  const [bookingModalTable, setBookingModalTable] = useState(null);
  const [bookingForm, setBookingForm] = useState({
    customerName: '',
    customerPhone: '',
    time: '19:00',
    guestsCount: '4',
    depositAmount: '',
    note: ''
  });

  // VIP Soatbay Taymer boshlash modali statelari
  const [timerModalTable, setTimerModalTable] = useState(null);
  const [timerForm, setTimerForm] = useState({
    serviceTitle: TIMER_PRESETS[0].title,
    hourlyRate: String(TIMER_PRESETS[0].rate)
  });

  // Har 1 soniyada VIP-taymerlarni yangilab turish
  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const safeTables = useMemo(() => {
    const base = Array.isArray(tables) && tables.length > 0
      ? tables
      : Array.from({ length: 15 }, (_, i) => `${i + 1}-Stol`);
    return base.includes('Olib ketish') ? base : ['Olib ketish', ...base];
  }, [tables]);

  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeReservations = reservations && typeof reservations === 'object' ? reservations : {};
  const safeTimers = tableTimers && typeof tableTimers === 'object' ? tableTimers : {};

  // =========================================================
  // 2. TAYMER VAQTINI VA PULINI ANIQ HISOBLASH YORDAMCHISI
  // =========================================================
  const computeTimerLiveStats = (timerObj) => {
    if (!timerObj || !timerObj.startTimeMs) return null;

    const accruedMs = Number(timerObj.accruedMs) || 0;
    const activeDeltaMs = timerObj.isPaused
      ? 0
      : Math.max(0, nowMs - Number(timerObj.startTimeMs));

    const totalElapsedSeconds = Math.floor((accruedMs + activeDeltaMs) / 1000);
    const hours = Math.floor(totalElapsedSeconds / 3600);
    const minutes = Math.floor((totalElapsedSeconds % 3600) / 60);
    const seconds = totalElapsedSeconds % 60;

    const formattedClock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    const durationHuman = hours > 0 ? `${hours} soat ${minutes} daq` : `${ Math.max(1, minutes) } daq`;

    const rate = Number(timerObj.hourlyRate) || 0;
    // Daqiqasigacha proporsional hisoblab, 500 so'mga yaxlitlaymiz (eng kami 1 daqiqa)
    const rawCost = (Math.max(60, totalElapsedSeconds) / 3600) * rate;
    const roundedCost = Math.max(1000, Math.round(rawCost / 500) * 500);

    return {
      totalElapsedSeconds,
      formattedClock,
      durationHuman,
      currentCost: roundedCost,
      hourlyRate: rate,
      serviceTitle: timerObj.serviceTitle || 'VIP-Kabina vaqti',
      isPaused: Boolean(timerObj.isPaused)
    };
  };

  // =========================================================
  // 3. HAR BIR STOL HOLATINI BIRLASHTIRISH
  // =========================================================
  const tableCardsData = useMemo(() => {
    return safeTables.map(tableName => {
      const activeOrder = safeOrders.find(
        o =>
          o &&
          o.table === tableName &&
          !["To'langan", 'Qarz', 'Arxiv'].includes(o.status)
      );

      const reservation = safeReservations[tableName] || null;
      const timerRaw = safeTimers[tableName] || null;
      const timerLive = computeTimerLiveStats(timerRaw);

      const items = Array.isArray(activeOrder?.items) ? activeOrder.items : [];
      const orderSubTotal = items.reduce((sum, it) => {
        const p = Number(it?.price ?? it?.variants?.[0]?.price ?? 0) || 0;
        const q = Number(it?.quantity ?? it?.qty ?? 1) || 0;
        return sum + p * q;
      }, 0);

      const hasCall = Boolean(activeOrder?.hasCall);
      const isBusy = Boolean(activeOrder);
      const isReserved = Boolean(reservation);
      const isTimed = Boolean(timerLive);

      return {
        tableName,
        isTakeaway: tableName === 'Olib ketish',
        activeOrder,
        reservation,
        timerLive,
        orderSubTotal,
        itemsCount: items.reduce((s, i) => s + (Number(i?.quantity ?? i?.qty ?? 1) || 0), 0),
        hasCall,
        isBusy,
        isReserved,
        isTimed
      };
    });
  }, [safeTables, safeOrders, safeReservations, safeTimers, nowMs]);

  // Ko'rsatkichlar (Badges)
  const counts = useMemo(() => {
    return {
      all: tableCardsData.length,
      busy: tableCardsData.filter(t => t.isBusy).length,
      free: tableCardsData.filter(t => !t.isBusy && !t.isReserved && !t.isTakeaway).length,
      reserved: tableCardsData.filter(t => t.isReserved).length,
      timed: tableCardsData.filter(t => t.isTimed).length,
      calls: tableCardsData.filter(t => t.hasCall).length
    };
  }, [tableCardsData]);

  // Filtrlangan stollar
  const filteredTables = useMemo(() => {
    return tableCardsData.filter(t => {
      if (tableFilter === 'busy' && !t.isBusy) return false;
      if (tableFilter === 'free' && (t.isBusy || t.isReserved || t.isTakeaway)) return false;
      if (tableFilter === 'reserved' && !t.isReserved) return false;
      if (tableFilter === 'timed' && !t.isTimed) return false;
      if (tableFilter === 'calls' && !t.hasCall) return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.trim().toLowerCase();
        const matchTable = t.tableName.toLowerCase().includes(q);
        const matchWaiter = String(t.activeOrder?.waiterName || t.activeOrder?.waiter || '').toLowerCase().includes(q);
        const matchGuest = String(t.reservation?.customerName || t.reservation?.customerPhone || '').toLowerCase().includes(q);
        return matchTable || matchWaiter || matchGuest;
      }

      return true;
    });
  }, [tableCardsData, tableFilter, searchQuery]);

  // =========================================================
  // 4. BRON VA TAYMER FORMALARI HANDLERLARI
  // =========================================================
  const handleOpenBookingModal = (e, tableName) => {
    e.stopPropagation();
    const existing = safeReservations[tableName];
    setBookingModalTable(tableName);
    setBookingForm({
      customerName: existing?.customerName || '',
      customerPhone: existing?.customerPhone || '',
      time: existing?.time || '19:00',
      guestsCount: existing?.guestsCount ? String(existing.guestsCount) : '4',
      depositAmount: existing?.depositAmount ? String(existing.depositAmount) : '',
      note: existing?.note || ''
    });
  };

  const handleSubmitBooking = (e) => {
    e.preventDefault();
    if (!bookingModalTable) return;
    if (!bookingForm.customerName.trim() || !bookingForm.time.trim()) {
      alert("Iltimos, mehmon ismini va kelish vaqtini kiriting!");
      return;
    }

    if (typeof onSaveReservation === 'function') {
      onSaveReservation(bookingModalTable, {
        id: `res_${Date.now()}`,
        table: bookingModalTable,
        customerName: bookingForm.customerName.trim(),
        customerPhone: bookingForm.customerPhone.trim(),
        time: bookingForm.time.trim(),
        guestsCount: Math.max(1, Number(bookingForm.guestsCount) || 1),
        depositAmount: Math.max(0, Number(bookingForm.depositAmount) || 0),
        note: bookingForm.note.trim(),
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    }
    setBookingModalTable(null);
  };

  const handleOpenTimerModal = (e, tableName) => {
    e.stopPropagation();
    setTimerModalTable(tableName);
    setTimerForm({
      serviceTitle: TIMER_PRESETS[0].title,
      hourlyRate: String(TIMER_PRESETS[0].rate)
    });
  };

  const handleSubmitTimer = (e) => {
    e.preventDefault();
    if (!timerModalTable) return;
    const rate = Number(timerForm.hourlyRate);
    if (isNaN(rate) || rate <= 0) {
      alert("Iltimos, 1 soatlik tarif narxini to'g'ri kiriting!");
      return;
    }

    if (typeof onStartTableTimer === 'function') {
      onStartTableTimer(timerModalTable, {
        serviceTitle: timerForm.serviceTitle.trim() || 'VIP-Kabina vaqti',
        hourlyRate: Math.round(rate)
      });
    }
    setTimerModalTable(null);
  };

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'Yangi':
        return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300';
      case 'Tayyorlanmoqda':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300';
      case 'Tayyor':
        return 'bg-emerald-500 text-white animate-bounce shadow-md shadow-emerald-500/30';
      case 'Yetkazildi':
        return 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  // =========================================================
  // 5. RENDER (UI DIZAYN)
  // =========================================================
  return (
    <div className="space-y-4 animate-fade-in">
      
      {/* YUQORI FILTR VA QIDIRUV PANELI */}
      <div className="bg-white dark:bg-gray-800 p-3.5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3">
        
        {/* Filtr Tablari */}
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-1 lg:pb-0">
          {[
            { id: 'all', label: `Barchasi (${counts.all})` },
            { id: 'busy', label: `🔴 Band (${counts.busy})` },
            { id: 'free', label: `🟢 Bo'sh (${counts.free})` },
            { id: 'reserved', label: `📌 Bronlar (${counts.reserved})` },
            { id: 'timed', label: `⏱️ VIP Vaqt (${counts.timed})` },
            ...(counts.calls > 0 ? [{ id: 'calls', label: `🔔 Chaqiruv (${counts.calls})` }] : [])
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTableFilter(tab.id)}
              className={`px-3.5 py-2 rounded-xl font-black text-xs whitespace-nowrap transition active:scale-95 ${
                tableFilter === tab.id
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Stol yoki Mehmon qidiruvi */}
        <div className="relative w-full lg:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="🔍 Stol yoki bron mehmioni..."
            className="w-full pl-3.5 pr-8 py-2 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-amber-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 font-black text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* STOLLAR VA KABINALAR GRIDI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredTables.map(card => {
          const {
            tableName,
            isTakeaway,
            activeOrder,
            reservation,
            timerLive,
            orderSubTotal,
            itemsCount,
            hasCall,
            isBusy,
            isReserved,
            isTimed
          } = card;

          const isSelected = selectedTable === tableName;

          return (
            <div
              key={tableName}
              onClick={() => typeof onSelectTable === 'function' && onSelectTable(tableName)}
              className={`rounded-3xl p-4 border-2 transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden group ${
                hasCall
                  ? 'bg-red-50 dark:bg-red-950/40 border-red-500 ring-4 ring-red-500/20 animate-pulse'
                  : isSelected
                  ? 'bg-amber-50/90 dark:bg-amber-900/30 border-amber-500 ring-4 ring-amber-500/20 shadow-lg'
                  : isBusy
                  ? 'bg-white dark:bg-gray-800 border-amber-300 dark:border-amber-700/80 shadow-sm hover:shadow-md'
                  : isReserved
                  ? 'bg-purple-50/60 dark:bg-purple-950/25 border-purple-300 dark:border-purple-700/80 shadow-sm hover:shadow-md'
                  : isTimed
                  ? 'bg-cyan-50/60 dark:bg-cyan-950/25 border-cyan-400 dark:border-cyan-700 shadow-sm hover:shadow-md'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-emerald-400 dark:hover:border-emerald-600'
              }`}
            >
              {/* 1. TEPA QISM: STOL NOMI, STATUS VA QR TUGMASI */}
              <div>
                <div className="flex justify-between items-start gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl font-black shadow-sm ${
                        isTakeaway
                          ? 'bg-indigo-600 text-white'
                          : isBusy
                          ? 'bg-amber-500 text-white'
                          : isReserved
                          ? 'bg-purple-600 text-white'
                          : isTimed
                          ? 'bg-cyan-600 text-white'
                          : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {isTakeaway ? '🛍️' : isReserved ? '📌' : isTimed ? '⏱️' : '🪑'}
                    </div>
                    <div>
                      <h3 className="font-black text-base sm:text-lg text-gray-900 dark:text-white leading-tight">
                        {tableName}
                      </h3>
                      <span className="text-[11px] font-bold text-gray-400 block">
                        {isBusy
                          ? `👤 ${activeOrder.waiterName || activeOrder.waiter || 'Ofitsiant'}`
                          : isReserved
                          ? `🕒 Bron: ${reservation.time}`
                          : isTimed
                          ? '⏱️ Soatbay tarif faol'
                          : "🟢 Bo'sh stol"}
                      </span>
                    </div>
                  </div>

                  {/* QR-Kod va Buyurtma Statusi */}
                  <div className="flex items-center gap-1.5">
                    {isBusy && activeOrder?.status && (
                      <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase ${getStatusBadgeStyle(activeOrder.status)}`}>
                        {activeOrder.status === 'Tayyor' ? '🔔 Tayyor!' : activeOrder.status}
                      </span>
                    )}

                    {!isTakeaway && typeof onOpenQrModal === 'function' && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onOpenQrModal(tableName);
                        }}
                        className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-amber-100 text-gray-600 dark:text-gray-300 flex items-center justify-center text-xs font-black transition"
                        title="Stol QR-Kodi"
                      >
                        📱
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. MIJOZ QO'NG'IROQCHASI (AGAR CHAQIRGAN BO'LSA) */}
                {hasCall && (
                  <div className="mb-3 p-2.5 rounded-2xl bg-red-600 text-white flex justify-between items-center shadow-md">
                    <span className="text-xs font-black flex items-center gap-1.5">
                      <span>🔔</span> Mijoz chaqirmoqda!
                    </span>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        if (typeof onClearTableCall === 'function') onClearTableCall(tableName);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white text-red-600 font-black text-[10px] uppercase"
                    >
                      Javob berildi ✓
                    </button>
                  </div>
                )}

                {/* 3. 📌 BRON (RESERVATION) BLOKI */}
                {isReserved && reservation && (
                  <div className="mb-3 p-3 rounded-2xl bg-purple-100/80 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-purple-600 text-white">
                        📌 BRON: {reservation.time}
                      </span>
                      <span className="text-[11px] font-black text-purple-800 dark:text-purple-300">
                        👥 {reservation.guestsCount} kishi
                      </span>
                    </div>

                    <p className="font-black text-xs sm:text-sm text-gray-900 dark:text-white truncate">
                      👤 {reservation.customerName}
                      {reservation.customerPhone ? ` (${reservation.customerPhone})` : ''}
                    </p>

                    {Number(reservation.depositAmount) > 0 && (
                      <p className="text-[11px] font-black text-emerald-700 dark:text-emerald-400">
                        💰 Depozit: {Number(reservation.depositAmount).toLocaleString()} so'm
                      </p>
                    )}

                    {reservation.note && (
                      <p className="text-[10px] font-bold italic text-gray-600 dark:text-gray-300 truncate">
                        * {reservation.note}
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          if (typeof onConvertReservationToOrder === 'function') {
                            onConvertReservationToOrder(tableName, reservation);
                          }
                        }}
                        className="py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase transition"
                      >
                        ✅ Mijoz keldi
                      </button>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          if (typeof onCancelReservation === 'function') {
                            onCancelReservation(tableName);
                          }
                        }}
                        className="py-1.5 px-2 rounded-lg bg-white dark:bg-gray-800 hover:bg-red-50 text-red-600 font-black text-[10px] uppercase border border-red-200 dark:border-gray-700 transition"
                      >
                        ✕ Bekor qilish
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. ⏱️ SOATBAY VIP-KABINA / TARIFIKATOR BLOKI */}
                {isTimed && timerLive && (
                  <div className="mb-3 p-3 rounded-2xl bg-cyan-100/80 dark:bg-cyan-900/30 border border-cyan-300 dark:border-cyan-700 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase text-cyan-800 dark:text-cyan-300 truncate pr-1">
                        {timerLive.serviceTitle}
                      </span>
                      <span className="font-mono font-black text-xs sm:text-sm px-2 py-0.5 rounded-lg bg-cyan-700 text-white">
                        {timerLive.formattedClock}
                      </span>
                    </div>

                    <div className="flex justify-between items-baseline">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                        Tarif: {(timerLive.hourlyRate / 1000).toLocaleString()}k / soat
                      </span>
                      <span className="font-black text-sm text-cyan-800 dark:text-cyan-300">
                        +{timerLive.currentCost.toLocaleString()} s
                      </span>
                    </div>

                    <div className="flex gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          if (typeof onPauseResumeTableTimer === 'function') {
                            onPauseResumeTableTimer(tableName);
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-black text-[10px] border border-cyan-300 dark:border-gray-600"
                      >
                        {timerLive.isPaused ? '▶️ Davom' : '⏸ Pauza'}
                      </button>

                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          if (typeof onFinishTimerAndAddToOrder === 'function') {
                            onFinishTimerAndAddToOrder(tableName, timerLive);
                          }
                        }}
                        className="flex-1 py-1.5 px-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-black text-[10px] uppercase transition"
                      >
                        🧾 Chekka qo'shish
                      </button>

                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          if (typeof onCancelTableTimer === 'function') {
                            onCancelTableTimer(tableName);
                          }
                        }}
                        className="px-2 py-1.5 rounded-lg bg-red-50 text-red-600 font-black text-[10px]"
                        title="Taymerni o'chirish"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                {/* 5. FAOL BUYURTMA SUMMASI */}
                {isBusy && (
                  <div className="p-3 rounded-2xl bg-amber-50/70 dark:bg-gray-900/70 border border-amber-200/70 dark:border-gray-700 mb-3">
                    <div className="flex justify-between items-center text-xs font-bold text-gray-500 mb-1">
                      <span>🍽 {itemsCount} porsiya taom</span>
                      <span>🕒 {activeOrder.time}</span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-[11px] font-black uppercase text-gray-400">Joriy hisob:</span>
                      <span className="text-lg font-black text-amber-600 dark:text-amber-400">
                        {(orderSubTotal + (timerLive?.currentCost || 0)).toLocaleString()} s
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 6. PASTKI TEZKOR AMALLAR TUGMALARI */}
              <div className="pt-2 border-t border-gray-100 dark:border-gray-700/80 flex flex-wrap gap-1.5">
                {isBusy ? (
                  <>
                    {typeof onOpenTransferModal === 'function' && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onOpenTransferModal(activeOrder);
                        }}
                        className="flex-1 py-2 px-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-gray-700 dark:text-gray-200 font-black text-[11px] transition"
                      >
                        🔄 Ko'chirish
                      </button>
                    )}

                    {typeof onOpenSplitModal === 'function' && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onOpenSplitModal(activeOrder);
                        }}
                        className="flex-1 py-2 px-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-gray-700 dark:text-gray-200 font-black text-[11px] transition"
                      >
                        ✂️ Bo'lish
                      </button>
                    )}

                    {!isTimed && !isTakeaway && (
                      <button
                        type="button"
                        onClick={e => handleOpenTimerModal(e, tableName)}
                        className="py-2 px-2.5 rounded-xl bg-cyan-50 dark:bg-cyan-900/30 hover:bg-cyan-100 text-cyan-700 dark:text-cyan-300 font-black text-[11px] transition"
                        title="Soatbay VIP taymerni yoqish"
                      >
                        ⏱️ Vaqt
                      </button>
                    )}
                  </>
                ) : (
                  !isTakeaway && (
                    <>
                      <button
                        type="button"
                        onClick={e => handleOpenBookingModal(e, tableName)}
                        className="flex-1 py-2 px-2.5 rounded-xl bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 text-purple-700 dark:text-purple-300 font-black text-[11px] transition"
                      >
                        📌 {isReserved ? 'Bronni tahrirlash' : 'Bron qilish'}
                      </button>

                      {!isTimed && (
                        <button
                          type="button"
                          onClick={e => handleOpenTimerModal(e, tableName)}
                          className="flex-1 py-2 px-2.5 rounded-xl bg-cyan-50 dark:bg-cyan-900/30 hover:bg-cyan-100 text-cyan-700 dark:text-cyan-300 font-black text-[11px] transition"
                        >
                          ⏱️ VIP Taymer
                        </button>
                      )}
                    </>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* =========================================================
          MODAL 1: 📌 STOL BRON QILISH VA DEPOZIT MODALI
          ========================================================= */}
      {bookingModalTable && (
        <div
          onClick={() => setBookingModalTable(null)}
          className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-end md:items-center justify-center md:p-4 animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 w-full md:max-w-md rounded-t-3xl md:rounded-3xl p-6 shadow-2xl space-y-4 border border-gray-100 dark:border-gray-700"
          >
            <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
              <h3 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2">
                <span>📌</span> {bookingModalTable} — Band Qilish (Bron)
              </h3>
              <button
                type="button"
                onClick={() => setBookingModalTable(null)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 font-black"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitBooking} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Mehmon Ismi *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={bookingForm.customerName}
                  onChange={e => setBookingForm(prev => ({ ...prev, customerName: e.target.value }))}
                  placeholder="Masalan: Sardor aka"
                  className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                    Kelish Vaqti *
                  </label>
                  <input
                    type="time"
                    required
                    value={bookingForm.time}
                    onChange={e => setBookingForm(prev => ({ ...prev, time: e.target.value }))}
                    className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                    Mehmonlar Soni
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={bookingForm.guestsCount}
                    onChange={e => setBookingForm(prev => ({ ...prev, guestsCount: e.target.value }))}
                    className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                    Telefon Raqami
                  </label>
                  <input
                    type="tel"
                    value={bookingForm.customerPhone}
                    onChange={e => setBookingForm(prev => ({ ...prev, customerPhone: e.target.value }))}
                    placeholder="90 123 45 67"
                    className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-sm text-gray-900 dark:text-white outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-emerald-600 uppercase mb-1">
                    Oldindan Depozit (s)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={bookingForm.depositAmount}
                    onChange={e => setBookingForm(prev => ({ ...prev, depositAmount: e.target.value }))}
                    placeholder="Masalan: 100000"
                    className="w-full p-3.5 rounded-xl bg-emerald-50/60 dark:bg-gray-900 border border-emerald-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Qo'shimcha Izoh
                </label>
                <input
                  type="text"
                  value={bookingForm.note}
                  onChange={e => setBookingForm(prev => ({ ...prev, note: e.target.value }))}
                  placeholder="Masalan: Tug'ilgan kun, bolalar stuli kerak"
                  className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-sm text-gray-900 dark:text-white outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setBookingModalTable(null)}
                  className="flex-1 py-3.5 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-bold text-sm"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-black text-sm shadow-lg shadow-purple-600/30 transition active:scale-95"
                >
                  📌 Bronni Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 2: ⏱️ SOATBAY VIP-KABINA / TARIFIKATOR MODALI
          ========================================================= */}
      {timerModalTable && (
        <div
          onClick={() => setTimerModalTable(null)}
          className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-end md:items-center justify-center md:p-4 animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 w-full md:max-w-md rounded-t-3xl md:rounded-3xl p-6 shadow-2xl space-y-4 border border-gray-100 dark:border-gray-700"
          >
            <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
              <h3 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2">
                <span>⏱️</span> {timerModalTable} — Soatbay Taymer Yoqish
              </h3>
              <button
                type="button"
                onClick={() => setTimerModalTable(null)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 font-black"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitTimer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">
                  Tayyor Tarif Shablonlari
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TIMER_PRESETS.map(p => (
                    <button
                      key={p.title}
                      type="button"
                      onClick={() =>
                        setTimerForm({
                          serviceTitle: p.title,
                          hourlyRate: String(p.rate)
                        })
                      }
                      className={`p-3 rounded-xl border text-left transition ${
                        timerForm.serviceTitle === p.title
                          ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm'
                          : 'bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <span className="font-black text-xs block truncate">{p.title}</span>
                      <span className="text-[11px] font-bold opacity-85">
                        {p.rate.toLocaleString()} s / soat
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Chekda Chiqadigan Xizmat Nomi *
                </label>
                <input
                  type="text"
                  required
                  value={timerForm.serviceTitle}
                  onChange={e => setTimerForm(prev => ({ ...prev, serviceTitle: e.target.value }))}
                  className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  1 Soatlik Tarif Narxi (so'mda) *
                </label>
                <input
                  type="number"
                  required
                  min="1000"
                  step="any"
                  value={timerForm.hourlyRate}
                  onChange={e => setTimerForm(prev => ({ ...prev, hourlyRate: e.target.value }))}
                  className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border-2 border-cyan-400 font-black text-lg text-gray-900 dark:text-white outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTimerModalTable(null)}
                  className="flex-1 py-3.5 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-bold text-sm"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-black text-sm shadow-lg shadow-cyan-600/30 transition active:scale-95"
                >
                  ▶️ Vaqtni Boshlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}