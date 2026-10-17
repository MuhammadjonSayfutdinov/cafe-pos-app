import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';

// =========================================================
// STANDART SLA SOZLAMALARI (DAQIQALARDA)
// =========================================================
const DEFAULT_SLA_CONFIG = {
  warningMinutes: 10,  // 10 daqiqadan keyin SARIQ (Shoshiling)
  criticalMinutes: 20, // 20 daqiqadan keyin QIZIL + TREVOGA (Kechikdi)
  soundEnabled: true,  // Ovozli signalizatsiya
  autoSortByWait: true // Eng ko'p kutib qolgan buyurtmalarni tepaga chiqarish
};

const readLocalJSON = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeLocalJSON = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
};

// =========================================================
// WEB AUDIO API OVOZ GENERATORI (MP3 FAYLLAR KERAK EMAS)
// =========================================================
const playKitchenSound = (type = 'new_order') => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === 'new_order') {
      // Yoqimli 2 tonli "Ding-Dong" (Yangi buyurtma tushganda)
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now); // E5
      osc1.frequency.setValueAtTime(880, now + 0.18); // A5
      gain1.gain.setValueAtTime(0.25, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.65);
    } else if (type === 'sla_breach') {
      // Kechikish trevogasi (3 marta tezkor ogohlantiruvchi signal)
      [0, 0.22, 0.44].forEach((offset) => {
        const now = ctx.currentTime + offset;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(920, now);
        osc.frequency.setValueAtTime(520, now + 0.1);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
      });
    }
  } catch {
    // Brauzer avto-ovozni bloklagan bo'lsa xato bermaydi
  }
};

export default function KitchenMode({
  orders,
  setOrders,
  menuItems,
  setMenuItems,
  menuCategories,
  currentUser,
  addAuditLog
}) {
  // =========================================================
  // 1. ZAXIRA XOTIRA VA PROP HIMOYASI
  // =========================================================
  const [localOrders, setLocalOrders] = useState(() => readLocalJSON('pos_orders', []));
  const [localMenu, setLocalMenu] = useState(() => readLocalJSON('pos_menu', []));
  const [localCategories] = useState(() => readLocalJSON('pos_categories', ['Asosiy', 'Ichimlik', 'Shirinlik']));

  // Har bir buyurtmaning boshlangan vaqtini saqlovchi xarita (Refreshda ham yo'qolmaydi)
  const [orderStartTimes, setOrderStartTimes] = useState(() => readLocalJSON('pos_kds_start_times', {}));
  // Chek ichidagi alohida pishgan taomlarni belgilash xaritasi
  const [checkedSubItems, setCheckedSubItems] = useState(() => readLocalJSON('pos_kds_checked_items', {}));
  // Ovozli trevogasi o'chirilgan (mute qilingan) buyurtmalar
  const [mutedOrderIds, setMutedOrderIds] = useState([]);
  // SLA sozlamalari
  const [slaConfig, setSlaConfig] = useState(() => ({
    ...DEFAULT_SLA_CONFIG,
    ...(readLocalJSON('pos_kds_sla_config', {}) || {})
  }));
  // Kunlik SLA statistikasi (Nechta vaqtida, nechta kechikib chiqdi)
  const [slaHistory, setSlaHistory] = useState(() =>
    readLocalJSON('pos_kds_sla_history', { onTimeCount: 0, delayedCount: 0, totalCookSeconds: 0 })
  );

  // UI Statelari
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'stoplist'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'delayed' | 'new' | 'cooking'
  const [stationCategory, setStationCategory] = useState('Barchasi'); // Sex filtri
  const [stopSearch, setStopSearch] = useState('');
  const [stopCategoryFilter, setStopCategoryFilter] = useState('Barchasi');
  const [isSlaModalOpen, setIsSlaModalOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Oldingi buyurtmalar sonini eslab qolish (yangi buyurtma tushganda ovoz chiqarish uchun)
  const prevOrderIdsRef = useRef(null);
  const lastAlertedBreachIdsRef = useRef(new Set());

  const safeOrders = Array.isArray(orders) ? orders : localOrders;
  const safeMenuItems = Array.isArray(menuItems) ? menuItems : localMenu;
  const safeCategories = Array.isArray(menuCategories) && menuCategories.length > 0
    ? menuCategories
    : localCategories;

  const updateOrdersState = useCallback((updater) => {
    if (typeof setOrders === 'function') {
      setOrders(updater);
    } else {
      setLocalOrders(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        writeLocalJSON('pos_orders', next);
        return next;
      });
    }
  }, [setOrders]);

  const updateMenuState = useCallback((updater) => {
    if (typeof setMenuItems === 'function') {
      setMenuItems(updater);
    } else {
      setLocalMenu(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        writeLocalJSON('pos_menu', next);
        return next;
      });
    }
  }, [setMenuItems]);

  // =========================================================
  // 2. JONLI SEKUNDOMER (HAR 1 SONIYADA YANGILANADI)
  // =========================================================
  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    writeLocalJSON('pos_kds_sla_config', slaConfig);
  }, [slaConfig]);

  useEffect(() => {
    writeLocalJSON('pos_kds_checked_items', checkedSubItems);
  }, [checkedSubItems]);

  useEffect(() => {
    writeLocalJSON('pos_kds_sla_history', slaHistory);
  }, [slaHistory]);

  // =========================================================
  // 3. BUYURTMANING ANIQ BOSHLANGAN VAQTINI ANIQLASH
  // =========================================================
  const getOrderStartMs = useCallback((order) => {
    if (!order) return nowMs;
    const idKey = String(order.id);

    // 1. Agar order ichida tayyor timestamp bo'lsa
    if (order.createdAt && !isNaN(Number(order.createdAt))) {
      return Number(order.createdAt);
    }
    if (order.startTimeMs && !isNaN(Number(order.startTimeMs))) {
      return Number(order.startTimeMs);
    }

    // 2. Agar orderStartTimes xotirasida saqlangan bo'lsa
    if (orderStartTimes[idKey]) {
      return Number(orderStartTimes[idKey]);
    }

    // 3. Agar order.id ning o'zi 13 xonali timestamp bo'lsa (Masalan: 1729158000000 yoki ord_1729158000000)
    const idDigits = String(order.id).match(/\d{13}/);
    if (idDigits) {
      const parsedIdMs = Number(idDigits[0]);
      if (parsedIdMs > 1700000000000 && parsedIdMs <= Date.now() + 60000) {
        return parsedIdMs;
      }
    }

    // 4. Agar order.time ("14:35") bo'lsa, bugungi sana bilan hisoblaymiz
    if (typeof order.time === 'string' && /^\d{1,2}:\d{2}/.test(order.time.trim())) {
      const [hh, mm] = order.time.trim().split(':').map(Number);
      if (!isNaN(hh) && !isNaN(mm)) {
        const d = new Date();
        d.setHours(hh, mm, 0, 0);
        if (d.getTime() <= Date.now()) {
          return d.getTime();
        }
      }
    }

    return nowMs;
  }, [orderStartTimes, nowMs]);

  // Oshxonaga tegishli faol buyurtmalar ('Yangi' va 'Tayyorlanmoqda')
  const kitchenActiveOrders = useMemo(() => {
    return safeOrders.filter(
      o => o && (o.status === 'Yangi' || o.status === 'Tayyorlanmoqda')
    );
  }, [safeOrders]);

  // Yangi tushgan buyurtmalarga boshlang'ich vaqt muhrini qo'yish va ovoz chalish
  useEffect(() => {
    let updatedMap = null;
    const currentIds = new Set();

    kitchenActiveOrders.forEach(o => {
      const key = String(o.id);
      currentIds.add(key);
      if (!orderStartTimes[key]) {
        if (!updatedMap) updatedMap = { ...orderStartTimes };
        updatedMap[key] = getOrderStartMs(o);
      }
    });

    if (updatedMap) {
      setOrderStartTimes(updatedMap);
      writeLocalJSON('pos_kds_start_times', updatedMap);
    }

    // Yangi buyurtma qo'shilganini tekshirish va "Ding-Dong" chalish
    if (prevOrderIdsRef.current !== null) {
      const hasBrandNew = kitchenActiveOrders.some(
        o => !prevOrderIdsRef.current.has(String(o.id))
      );
      if (hasBrandNew && slaConfig.soundEnabled) {
        playKitchenSound('new_order');
      }
    }
    prevOrderIdsRef.current = currentIds;
  }, [kitchenActiveOrders, orderStartTimes, getOrderStartMs, slaConfig.soundEnabled]);

  // =========================================================
  // 4. HAR BIR BUYURTMA UCHUN SLA HOLATINI HISOBLASH
  // =========================================================
  const enrichedOrders = useMemo(() => {
    const warnSec = (Number(slaConfig.warningMinutes) || 10) * 60;
    const critSec = (Number(slaConfig.criticalMinutes) || 20) * 60;

    return kitchenActiveOrders.map(order => {
      const startMs = getOrderStartMs(order);
      const elapsedSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));
      const mins = Math.floor(elapsedSeconds / 60);
      const secs = elapsedSeconds % 60;
      const formattedTimer = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      let slaLevel = 'normal'; // 'normal' | 'warning' | 'critical'
      if (elapsedSeconds >= critSec) {
        slaLevel = 'critical';
      } else if (elapsedSeconds >= warnSec) {
        slaLevel = 'warning';
      }

      const slaProgressPct = Math.min(100, Math.round((elapsedSeconds / critSec) * 100));

      // Sex filtri uchun taomlarni tekshirish
      const items = Array.isArray(order.items) ? order.items : [];
      const filteredItemsByStation = stationCategory === 'Barchasi'
        ? items
        : items.filter(it => {
            if (it?.category === stationCategory) return true;
            const foundMenu = safeMenuItems.find(
              m => m && (String(m.id) === String(it?.id) || m.name === it?.baseName || m.name === it?.name)
            );
            return foundMenu?.category === stationCategory;
          });

      return {
        ...order,
        elapsedSeconds,
        formattedTimer,
        slaLevel,
        slaProgressPct,
        displayItems: filteredItemsByStation
      };
    }).filter(o => o.displayItems.length > 0);
  }, [kitchenActiveOrders, getOrderStartMs, nowMs, slaConfig, stationCategory, safeMenuItems]);

  // Kechikish chegarasiga (Critical) o'tgan buyurtmalar uchun ovozli trevoga chalish
  useEffect(() => {
    if (!slaConfig.soundEnabled) return;

    let shouldBeep = false;
    enrichedOrders.forEach(o => {
      const idStr = String(o.id);
      if (
        o.slaLevel === 'critical' &&
        !mutedOrderIds.includes(idStr) &&
        !lastAlertedBreachIdsRef.current.has(idStr)
      ) {
        shouldBeep = true;
        lastAlertedBreachIdsRef.current.add(idStr);
      }
    });

    if (shouldBeep) {
      playKitchenSound('sla_breach');
    }
  }, [enrichedOrders, mutedOrderIds, slaConfig.soundEnabled]);

  // Filtrlash va Saralash
  const visibleOrders = useMemo(() => {
    const filtered = enrichedOrders.filter(o => {
      if (statusFilter === 'delayed') return o.slaLevel === 'critical' || o.slaLevel === 'warning';
      if (statusFilter === 'new') return o.status === 'Yangi';
      if (statusFilter === 'cooking') return o.status === 'Tayyorlanmoqda';
      return true;
    });

    return filtered.sort((a, b) => {
      if (slaConfig.autoSortByWait) {
        return b.elapsedSeconds - a.elapsedSeconds; // Eng ko'p kutganlar eng tepada
      }
      return a.elapsedSeconds - b.elapsedSeconds;
    });
  }, [enrichedOrders, statusFilter, slaConfig.autoSortByWait]);

  // =========================================================
  // 5. UMUMIY QOZON HISOBI (BATCH AGGREGATION) VA KPI
  // =========================================================
  const batchSummary = useMemo(() => {
    const map = {};
    enrichedOrders.forEach(order => {
      order.displayItems.forEach((item, idx) => {
        if (!item?.name) return;
        const subKey = `${order.id}_${idx}`;
        // Agar oshpaz bu porsiyani allaqachon "pishdi" deb belgilagan bo'lsa, qozon hisobidan kamaytiramiz
        if (checkedSubItems[subKey]) return;

        const name = String(item.name).trim();
        const qty = Number(item.quantity ?? item.qty ?? 1) || 0;
        if (!map[name]) {
          map[name] = { count: 0, tables: new Set(), hasUrgent: false };
        }
        map[name].count += qty;
        map[name].tables.add(order.table);
        if (order.slaLevel === 'critical') {
          map[name].hasUrgent = true;
        }
      });
    });

    return Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  }, [enrichedOrders, checkedSubItems]);

  const kitchenKpi = useMemo(() => {
    const totalActive = enrichedOrders.length;
    const criticalCount = enrichedOrders.filter(o => o.slaLevel === 'critical').length;
    const warningCount = enrichedOrders.filter(o => o.slaLevel === 'warning').length;
    const newCount = enrichedOrders.filter(o => o.status === 'Yangi').length;

    const totalCompletedToday = (slaHistory.onTimeCount || 0) + (slaHistory.delayedCount || 0);
    const avgCookSeconds = totalCompletedToday > 0
      ? Math.round((slaHistory.totalCookSeconds || 0) / totalCompletedToday)
      : 0;
    const avgCookMins = Math.floor(avgCookSeconds / 60);
    const avgCookSecs = avgCookSeconds % 60;

    const slaComplianceRate = totalCompletedToday > 0
      ? Math.round((slaHistory.onTimeCount / totalCompletedToday) * 100)
      : 100;

    return {
      totalActive,
      criticalCount,
      warningCount,
      newCount,
      totalCompletedToday,
      avgCookFormatted: `${avgCookMins}d ${avgCookSecs}s`,
      slaComplianceRate
    };
  }, [enrichedOrders, slaHistory]);

  // =========================================================
  // 6. OSHPAZ HARAKATLARI (STATUS O'ZGARTIRISH VA SUB-ITEM)
  // =========================================================
  const handleToggleSubItem = (orderId, itemIndex) => {
    const key = `${orderId}_${itemIndex}`;
    setCheckedSubItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleAdvanceOrderStatus = (order) => {
    if (!order) return;
    const currentStatus = order.status;
    const nextStatus = currentStatus === 'Yangi' ? 'Tayyorlanmoqda' : 'Tayyor';
    const nowTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Agar taom 'Tayyor' bo'layotgan bo'lsa, SLA statistikasiga yozamiz
    if (nextStatus === 'Tayyor') {
      const critSec = (Number(slaConfig.criticalMinutes) || 20) * 60;
      const isDelayed = (order.elapsedSeconds || 0) >= critSec;

      setSlaHistory(prev => ({
        onTimeCount: (prev.onTimeCount || 0) + (isDelayed ? 0 : 1),
        delayedCount: (prev.delayedCount || 0) + (isDelayed ? 1 : 0),
        totalCookSeconds: (prev.totalCookSeconds || 0) + (order.elapsedSeconds || 0)
      }));
    }

    updateOrdersState(prev =>
      (Array.isArray(prev) ? prev : []).map(o => {
        if (!o || String(o.id) !== String(order.id)) return o;
        return {
          ...o,
          status: nextStatus,
          cookingStartedAt: nextStatus === 'Tayyorlanmoqda' ? nowTimeStr : o.cookingStartedAt,
          readyTime: nextStatus === 'Tayyor' ? nowTimeStr : o.readyTime,
          cookDurationSeconds: nextStatus === 'Tayyor' ? order.elapsedSeconds : o.cookDurationSeconds
        };
      })
    );

    if (typeof addAuditLog === 'function') {
      addAuditLog(
        nextStatus === 'Tayyorlanmoqda' ? "Oshxona: Pishirish boshlandi" : "Oshxona: Taom tayyor bo'ldi",
        `${order.table} (${order.formattedTimer} ichida -> ${nextStatus})`
      );
    }
  };

  const handleMuteOrderAlarm = (orderId) => {
    const idStr = String(orderId);
    setMutedOrderIds(prev => (prev.includes(idStr) ? prev : [...prev, idStr]));
  };

  // Stop-List funksiyasi
  const handleToggleDishAvailability = (dish) => {
    if (!dish) return;
    const nextAvailable = dish.is_available === false ? true : false;

    updateMenuState(prev =>
      (Array.isArray(prev) ? prev : []).map(item =>
        item && String(item.id) === String(dish.id)
          ? { ...item, is_available: nextAvailable }
          : item
      )
    );

    if (typeof addAuditLog === 'function') {
      addAuditLog(
        nextAvailable ? "Oshxona: Taom sotuvga qaytarildi" : "Oshxona: Stop-Listga olindi",
        `"${dish.name}" (${ currentUser?.name || 'Oshpaz' })`
      );
    }
  };

  const filteredStopListDishes = useMemo(() => {
    return safeMenuItems.filter(item => {
      if (!item) return false;
      if (stopCategoryFilter !== 'Barchasi' && item.category !== stopCategoryFilter) return false;
      if (stopSearch.trim() !== '') {
        return String(item.name || '').toLowerCase().includes(stopSearch.trim().toLowerCase());
      }
      return true;
    });
  }, [safeMenuItems, stopCategoryFilter, stopSearch]);

  const stopListCount = useMemo(() => {
    return safeMenuItems.filter(i => i && i.is_available === false).length;
  }, [safeMenuItems]);

  // =========================================================
  // 7. RENDER (UI DIZAYN)
  // =========================================================
  return (
    <div className="max-w-7xl mx-auto pb-12 space-y-5 animate-fade-in">
      
      {/* =======================================================
          TEPADAGI SLA TELEMETRIYA VA BOSHQARUV PANELI
          ======================================================= */}
      <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
        
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          {/* Asosiy 2 ta Tab: Buyurtmalar va Stop-List */}
          <div className="flex flex-wrap gap-2 w-full lg:w-auto">
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className={`flex-1 sm:flex-initial px-5 py-3 rounded-2xl font-black text-xs sm:text-sm transition flex items-center justify-center gap-2 ${
                activeTab === 'orders'
                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
                  : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300'
              }`}
            >
              <span>🔥</span>
              <span>Faol Buyurtmalar ({kitchenKpi.totalActive})</span>
              {kitchenKpi.criticalCount > 0 && (
                <span className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-full animate-pulse">
                  {kitchenKpi.criticalCount} kechikdi!
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('stoplist')}
              className={`flex-1 sm:flex-initial px-5 py-3 rounded-2xl font-black text-xs sm:text-sm transition flex items-center justify-center gap-2 ${
                activeTab === 'stoplist'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                  : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300'
              }`}
            >
              <span>🛑</span>
              <span>Stop-List Boshqaruvi</span>
              {stopListCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                  {stopListCount} ta tugagan
                </span>
              )}
            </button>
          </div>

          {/* Ovoz va SLA Sozlamalari Tugmalari */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
            <button
              type="button"
              onClick={() => {
                const nextSound = !slaConfig.soundEnabled;
                setSlaConfig(prev => ({ ...prev, soundEnabled: nextSound }));
                if (nextSound) playKitchenSound('new_order');
              }}
              className={`px-4 py-2.5 rounded-xl font-black text-xs transition flex items-center gap-1.5 border ${
                slaConfig.soundEnabled
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 border-gray-200 dark:border-gray-600'
              }`}
            >
              <span>{slaConfig.soundEnabled ? '🔊 Signal Yoqilgan' : "🔇 Signal O'chiq"}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSlaModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 font-black text-xs border border-indigo-200 dark:border-indigo-800 transition flex items-center gap-1.5"
            >
              <span>⏱️ SLA Normativ:</span>
              <span className="text-amber-600 dark:text-amber-400">{slaConfig.warningMinutes}d</span>
              <span>/</span>
              <span className="text-red-600 dark:text-red-400">{slaConfig.criticalMinutes}d</span>
              <span>⚙️</span>
            </button>
          </div>
        </div>

        {/* 4 TA JONLI SLA MONITORING KARTASI */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div className="bg-gray-50 dark:bg-gray-900/60 p-3.5 rounded-2xl border border-gray-200/80 dark:border-gray-700 flex justify-between items-center">
            <div>
              <span className="text-[10px] font-black uppercase text-gray-400 block">
                ⏱️ O'rtacha Pishirish Vaqti
              </span>
              <p className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400 mt-0.5">
                {kitchenKpi.avgCookFormatted}
              </p>
              <span className="text-[10px] font-bold text-gray-400">
                Bugun: {kitchenKpi.totalCompletedToday} ta chek chiqdi
              </span>
            </div>
            <span className="text-2xl">⚡</span>
          </div>

          <div className="bg-gray-50 dark:bg-gray-900/60 p-3.5 rounded-2xl border border-gray-200/80 dark:border-gray-700 flex justify-between items-center">
            <div>
              <span className="text-[10px] font-black uppercase text-emerald-600 block">
                🎯 SLA Sifat Ko'rsatkichi
              </span>
              <p className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                {kitchenKpi.slaComplianceRate}% vaqtida
              </p>
              <span className="text-[10px] font-bold text-gray-400">
                Normativ: {slaConfig.criticalMinutes} daqiqagacha
              </span>
            </div>
            <span className="text-2xl">🟢</span>
          </div>

          <div className="bg-amber-50/70 dark:bg-amber-900/20 p-3.5 rounded-2xl border border-amber-200 dark:border-amber-800/50 flex justify-between items-center">
            <div>
              <span className="text-[10px] font-black uppercase text-amber-600 block">
                🟡 Shoshilinch ({slaConfig.warningMinutes}+ daqiqa)
              </span>
              <p className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 mt-0.5">
                {kitchenKpi.warningCount} ta buyurtma
              </p>
              <span className="text-[10px] font-bold text-amber-700/70 dark:text-amber-300/70">
                Tezlashtirish kerak
              </span>
            </div>
            <span className="text-2xl">⏳</span>
          </div>

          <div className={`p-3.5 rounded-2xl border flex justify-between items-center transition ${
            kitchenKpi.criticalCount > 0
              ? 'bg-red-100 dark:bg-red-900/40 border-red-400 dark:border-red-600 animate-pulse'
              : 'bg-gray-50 dark:bg-gray-900/60 border-gray-200/80 dark:border-gray-700'
          }`}>
            <div>
              <span className="text-[10px] font-black uppercase text-red-600 block">
                🔴 Kechikkan ({slaConfig.criticalMinutes}+ daqiqa)
              </span>
              <p className="text-base sm:text-lg font-black text-red-600 dark:text-red-400 mt-0.5">
                {kitchenKpi.criticalCount} ta buyurtma
              </p>
              <span className="text-[10px] font-bold text-red-500">
                {kitchenKpi.criticalCount > 0 ? '🚨 Zudlik bilan chiqaring!' : 'Kechikkanlar yo\'q'}
              </span>
            </div>
            <span className="text-2xl">🚨</span>
          </div>
        </div>
      </div>

      {/* =======================================================
          1-EKRAN: OSHXONA BUYURTMALARI VA SLA TAYMERLARI
          ======================================================= */}
      {activeTab === 'orders' && (
        <>
          {/* UMUMIY QOZON HISOBI (BATCH SUMMARY) */}
          {batchSummary.length > 0 && (
            <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 dark:from-amber-900/20 dark:to-red-900/20 p-4 rounded-3xl border border-amber-200 dark:border-amber-800/50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <span>🍲</span> Umumiy Qozon Hisobi (Hozir pishirilishi kerak bo'lgan jami porsiyalar)
                </h3>
                <span className="text-[11px] font-bold text-gray-500">
                  {batchSummary.length} xil taom
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {batchSummary.map(([dishName, info]) => (
                  <div
                    key={dishName}
                    className={`px-3.5 py-2 rounded-2xl border flex items-center gap-2.5 shadow-sm ${
                      info.hasUrgent
                        ? 'bg-red-50 dark:bg-red-900/40 border-red-300 dark:border-red-700'
                        : 'bg-white dark:bg-gray-800 border-amber-200 dark:border-gray-700'
                    }`}
                  >
                    <span className="font-black text-xs sm:text-sm text-gray-900 dark:text-white">
                      {dishName}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-xl font-black text-xs text-white ${
                      info.hasUrgent ? 'bg-red-600' : 'bg-amber-500'
                    }`}>
                      {info.count} pors
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SEX VA STATUS FILTRLARI */}
          <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 bg-white dark:bg-gray-800 p-3.5 rounded-2xl border border-gray-100 dark:border-gray-700">
            {/* Holat va SLA filtri */}
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
              {[
                { id: 'all', label: `Barchasi (${enrichedOrders.length})` },
                { id: 'delayed', label: `🚨 Kechikayotganlar (${kitchenKpi.criticalCount + kitchenKpi.warningCount})` },
                { id: 'new', label: `🆕 Yangi (${kitchenKpi.newCount})` },
                { id: 'cooking', label: '🔥 Pishirilmoqda' }
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black whitespace-nowrap transition ${
                    statusFilter === f.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Oshxona Sexi (Kategoriya) filtri */}
            <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
              <span className="text-[10px] font-black uppercase text-gray-400 whitespace-nowrap pl-1">
                👨‍🍳 Sex:
              </span>
              {['Barchasi', ...safeCategories].map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setStationCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition ${
                    stationCategory === cat
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* BUYURTMA KARTOCHKALARI GRIDI */}
          {visibleOrders.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-16 text-center border-2 border-dashed border-gray-200 dark:border-gray-700">
              <span className="text-6xl block mb-4">👨‍🍳✨</span>
              <h3 className="text-xl font-black text-gray-800 dark:text-white">
                Oshxonada kutilayotgan buyurtmalar yo'q!
              </h3>
              <p className="text-xs sm:text-sm font-bold text-gray-400 mt-1">
                Yangi buyurtma tushishi bilan ovozli signal chalinadi va sekundomer avtomatik ishga tushadi.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {visibleOrders.map(order => {
                const isCritical = order.slaLevel === 'critical';
                const isWarning = order.slaLevel === 'warning';
                const isMuted = mutedOrderIds.includes(String(order.id));

                // Chek ichida nechta taom pishib bo'lganini hisoblash
                const totalSubItems = order.displayItems.length;
                const completedSubItems = order.displayItems.filter(
                  (_, idx) => checkedSubItems[`${order.id}_${idx}`]
                ).length;

                const cardBorderStyle = isCritical
                  ? 'border-red-500 dark:border-red-500 ring-4 ring-red-500/20'
                  : isWarning
                  ? 'border-amber-400 dark:border-amber-500 ring-2 ring-amber-400/20'
                  : order.status === 'Yangi'
                  ? 'border-indigo-400 dark:border-indigo-500'
                  : 'border-emerald-400 dark:border-emerald-600';

                const headerBgStyle = isCritical
                  ? 'bg-red-600 text-white'
                  : isWarning
                  ? 'bg-amber-500 text-white'
                  : order.status === 'Yangi'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-emerald-600 text-white';

                return (
                  <div
                    key={order.id}
                    className={`bg-white dark:bg-gray-800 rounded-3xl border-2 shadow-md overflow-hidden flex flex-col justify-between transition-all ${cardBorderStyle}`}
                  >
                    <div>
                      {/* KARTOCHKA TEPASI: STOL, JONLI SEKUNDOMER VA STATUS */}
                      <div className={`p-4 ${headerBgStyle} transition-colors`}>
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-xl font-black tracking-tight">
                                🪑 {order.table}
                              </h3>
                              {isCritical && (
                                <span className="px-2 py-0.5 rounded-md bg-white text-red-600 text-[10px] font-black uppercase animate-bounce">
                                  🚨 KECHIKDI!
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-bold opacity-90 mt-0.5">
                              👤 {order.waiterName || order.waiter || 'Ofitsiant'} • #{String(order.id).slice(-4)}
                            </p>
                          </div>

                          {/* KATTA JONLI SLA SEKUNDOMERI */}
                          <div className="text-right">
                            <div className={`px-3 py-1.5 rounded-2xl font-mono font-black text-lg sm:text-xl shadow-inner flex items-center gap-1.5 ${
                              isCritical
                                ? 'bg-red-900/60 text-white animate-pulse'
                                : 'bg-black/20 text-white'
                            }`}>
                              <span>⏱️</span>
                              <span>{order.formattedTimer}</span>
                            </div>
                            <span className="text-[10px] font-black uppercase opacity-85 block mt-1">
                              {isCritical
                                ? 'Me\'yordan oshdi!'
                                : isWarning
                                ? 'Shoshiling!'
                                : 'Vaqt me\'yorida'}
                            </span>
                          </div>
                        </div>

                        {/* Vizual SLA vaqt to'lish chizig'i */}
                        <div className="w-full h-1.5 bg-black/20 rounded-full overflow-hidden mt-3">
                          <div
                            className="h-full bg-white transition-all duration-1000"
                            style={{ width: `${order.slaProgressPct}%` }}
                          />
                        </div>
                      </div>

                      {/* KECHIKKAN BUYURTMA UCHUN SIGNALNI O'CHIRISH PANELI */}
                      {isCritical && !isMuted && (
                        <div className="bg-red-50 dark:bg-red-900/30 px-4 py-2 border-b border-red-200 dark:border-red-800 flex justify-between items-center">
                          <span className="text-[11px] font-black text-red-600 dark:text-red-300">
                            🔔 Buyurtma {slaConfig.criticalMinutes} daqiqadan oshib ketdi!
                          </span>
                          <button
                            type="button"
                            onClick={() => handleMuteOrderAlarm(order.id)}
                            className="text-[10px] font-black bg-white dark:bg-gray-800 text-red-600 px-2.5 py-1 rounded-lg border border-red-200 hover:bg-red-100 transition"
                          >
                            🔕 Ovozni tinchlantirish
                          </button>
                        </div>
                      )}

                      {/* TAOMLAR RO'YXATI (USTIGA BOSIB ✅ BELGILASH MUMKIN) */}
                      <div className="p-4 space-y-2.5">
                        <div className="flex justify-between items-center text-[11px] font-black text-gray-400 uppercase">
                          <span>Taomlar (Bosib belgilang)</span>
                          <span>Tayyor: {completedSubItems}/{totalSubItems}</span>
                        </div>

                        <div className="space-y-2">
                          {order.displayItems.map((item, idx) => {
                            const subKey = `${order.id}_${idx}`;
                            const isSubDone = Boolean(checkedSubItems[subKey]);
                            const qty = Number(item.quantity ?? item.qty ?? 1) || 1;

                            return (
                              <div
                                key={item.cartItemId || idx}
                                onClick={() => handleToggleSubItem(order.id, idx)}
                                className={`p-3 rounded-2xl border cursor-pointer transition select-none flex justify-between items-start gap-3 ${
                                  isSubDone
                                    ? 'bg-emerald-50/70 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50 opacity-65'
                                    : 'bg-gray-50 dark:bg-gray-900/60 border-gray-200/80 dark:border-gray-700 hover:border-amber-400'
                                }`}
                              >
                                <div className="flex items-start gap-2.5 min-w-0">
                                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${
                                    isSubDone
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-transparent'
                                  }`}>
                                    ✓
                                  </span>
                                  <div className="min-w-0">
                                    <p className={`font-black text-sm sm:text-base leading-snug ${
                                      isSubDone
                                        ? 'line-through text-gray-400 dark:text-gray-500'
                                        : 'text-gray-900 dark:text-white'
                                    }`}>
                                      {item.name}
                                    </p>

                                    {/* Mijoz yoki Ofitsiant izohi */}
                                    {item.note && (
                                      <span className="inline-block mt-1 px-2.5 py-0.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-black">
                                        ⚠️ Izoh: {item.note}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <span className={`px-3 py-1 rounded-xl font-black text-sm shrink-0 ${
                                  isSubDone
                                    ? 'bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200'
                                    : 'bg-amber-500 text-white shadow-sm'
                                }`}>
                                  x{qty}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* PASTKI HARAKAT TUGMASI */}
                    <div className="p-4 pt-0">
                      <button
                        type="button"
                        onClick={() => handleAdvanceOrderStatus(order)}
                        className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider text-white shadow-lg transition active:scale-95 flex items-center justify-center gap-2 ${
                          order.status === 'Yangi'
                            ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/30'
                            : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30'
                        }`}
                      >
                        {order.status === 'Yangi' ? (
                          <>
                            <span>🔥</span> Pishirishni Boshlash
                          </>
                        ) : (
                          <>
                            <span>✅</span> Taom Tayyor (Ofitsiantni chaqirish)
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* =======================================================
          2-EKRAN: STOP-LIST BOSHQARUVI (KATEGORIYALAR BILAN)
          ======================================================= */}
      {activeTab === 'stoplist' && (
        <div className="bg-white dark:bg-gray-800 p-5 md:p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-5">
          <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
            <div>
              <h3 className="text-lg font-black text-gray-900 dark:text-white">
                🛑 Oshxona Stop-List Boshqaruvi
              </h3>
              <p className="text-xs font-bold text-gray-500">
                Tugab qolgan taomni bossangiz, Ofitsiant va QR-Menyuda darhol bloklanadi
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={stopSearch}
                onChange={e => setStopSearch(e.target.value)}
                placeholder="🔍 Taomni qidiring..."
                className="px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-red-500"
              />

              <select
                value={stopCategoryFilter}
                onChange={e => setStopCategoryFilter(e.target.value)}
                className="px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs font-black text-gray-800 dark:text-white outline-none cursor-pointer"
              >
                <option value="Barchasi">📁 Barcha toifalar</option>
                {safeCategories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredStopListDishes.map(dish => {
              const isAvailable = dish.is_available !== false;
              return (
                <div
                  key={dish.id}
                  onClick={() => handleToggleDishAvailability(dish)}
                  className={`p-4 rounded-2xl border-2 cursor-pointer transition flex justify-between items-center gap-3 select-none active:scale-95 ${
                    isAvailable
                      ? 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 hover:border-emerald-400'
                      : 'bg-red-50 dark:bg-red-900/20 border-red-400 dark:border-red-700'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-black text-sm text-gray-900 dark:text-white truncate">
                      {dish.name}
                    </p>
                    <span className="text-[11px] font-bold text-gray-400">
                      {dish.category} • {Number(dish.price || 0).toLocaleString()} s
                    </span>
                  </div>

                  <span className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 ${
                    isAvailable
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-red-600 text-white shadow-sm'
                  }`}>
                    {isAvailable ? '🟢 Bor' : '🛑 Tugagan'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =======================================================
          MODAL: SLA TAYMER VA SIGNALIZATSIYA SOZLAMALARI
          ======================================================= */}
      {isSlaModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 border border-gray-100 dark:border-gray-700">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-3">
              <h3 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2">
                <span>⏱️</span> Oshxona SLA Normativ Sozlamalari
              </h3>
              <button
                type="button"
                onClick={() => setIsSlaModalOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-red-500 font-black flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-amber-600 uppercase mb-1">
                  🟡 Sariq Ogohlantirish Chegarasi (Daqiqa)
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={slaConfig.warningMinutes}
                  onChange={e => setSlaConfig(prev => ({ ...prev, warningMinutes: Number(e.target.value) || 10 }))}
                  className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-gray-900 dark:text-white outline-none focus:border-amber-500"
                />
                <span className="text-[11px] font-bold text-gray-400">
                  Buyurtma shu daqiqaga yetganda sariq rangga kiradi (Standart: 10 daqiqa)
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-red-600 uppercase mb-1">
                  🔴 Qizil Trevoga va Kechikish Chegarasi (Daqiqa)
                </label>
                <input
                  type="number"
                  min="2"
                  max="120"
                  value={slaConfig.criticalMinutes}
                  onChange={e => setSlaConfig(prev => ({ ...prev, criticalMinutes: Number(e.target.value) || 20 }))}
                  className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-gray-900 dark:text-white outline-none focus:border-red-500"
                />
                <span className="text-[11px] font-bold text-gray-400">
                  Buyurtma shu vaqtdan oshsa qizil miltillab, ovozli trevoga chaladi (Standart: 20 daqiqa)
                </span>
              </div>

              <label className="flex items-center justify-between p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 cursor-pointer">
                <span className="text-xs font-black text-gray-800 dark:text-white">
                  Eng ko'p kutgan cheklarni avtomatik tepaga chiqarish
                </span>
                <input
                  type="checkbox"
                  checked={slaConfig.autoSortByWait}
                  onChange={e => setSlaConfig(prev => ({ ...prev, autoSortByWait: e.target.checked }))}
                  className="w-5 h-5 accent-indigo-600"
                />
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => playKitchenSound('sla_breach')}
                className="flex-1 py-3.5 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-black text-xs"
              >
                🔊 Signalni sinash
              </button>
              <button
                type="button"
                onClick={() => setIsSlaModalOpen(false)}
                className="flex-1 py-3.5 rounded-xl bg-indigo-600 text-white font-black text-xs"
              >
                Saqlash ✓
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}