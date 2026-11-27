import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ORDER_STATUS, isDeliveryOrder } from '../constants/orderStatus';
import { localWrite } from '../sync/engine';
import {
  ackNotices,
  collectKitchenCancellations,
  doneQtyOf,
  isClosedStatus,
  isKitchenItem,
  isKitchenVisible,
  kitchenSummary,
  markLinesReady,
  orderLines,
  pendingQtyOf,
  rejectLines,
  startCooking
} from '../utils/kitchenFlow';
import KitchenRejectModal from './KitchenRejectModal';
import KitchenStationsModal from './KitchenStationsModal';
import useSticky from '../hooks/useSticky';
import { notify } from '../utils/notify';
import { sendTelegramLines, escapeHtml } from '../utils/telegramNotifier';
import {
  AUTO_PRINT_KEY, DEVICE_STATION_KEY, PRINTED_KEY, STATIONS_KEY, formatTimer, kotDocument, lineCategory,
  lineSentMs, normalizeStations, printHtml, prunePrinted, selectionCategories, selectionLabel, slaLevelOf,
  unprintedLines
} from '../utils/kitchenStations';

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
  localWrite(key, value); // sinxronlanadigan kalit bo'lsa bulutga ham (pos_kds_* faqat qurilmada)
};

// Kunlik SLA hisobining sanasi (yangi kunda o'zi nolga tushadi)
const dayKeyOf = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const EMPTY_SLA = { onTimeCount: 0, delayedCount: 0, totalCookSeconds: 0 };
// Oshpaz tanlagan taomlar (faqat shu qurilmada): { "chekId|qatorKaliti": true }
const SELECTED_KEY = 'pos_kds_selected';
const selKey = (orderId, lineId) => `${orderId}|${lineId}`;
const linesText = (lines) => lines.map(l => `${l.qty}× ${l.name}`).join(', ');

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
  // Rahbar tasdig'i: Admin -> PIN himoyasida "Oshxona: taomni rad etish" yoqilsa (standart: o'chiq)
  requireAdminOverride,
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
  // Oshpaz tanlagan taomlar. Oldin ekrandagi tartib raqami bo'yicha saqlanardi: sex filtri yoki
  // dozakazdan keyin boshqa taom belgilangan bo'lib qolardi. Bu faqat tanlov: "Tayyor" bosilgach
  // holat chekning o'ziga (taom qatoriga) yoziladi va barcha qurilmalarga boradi.
  const [selected, setSelected] = useState(() => readLocalJSON(SELECTED_KEY, {}) || {});
  // Rad etish oynasi: { orderId, preselectedIds }
  const [rejectTarget, setRejectTarget] = useState(null);
  // Ovozli trevogasi o'chirilgan (mute qilingan) buyurtmalar
  const [mutedOrderIds, setMutedOrderIds] = useState([]);
  // SLA sozlamalari
  const [slaConfig, setSlaConfig] = useState(() => ({
    ...DEFAULT_SLA_CONFIG,
    ...(readLocalJSON('pos_kds_sla_config', {}) || {})
  }));
  // Kunlik SLA statistikasi (Nechta vaqtida, nechta kechikib chiqdi). day - qaysi kunniki:
  // oldin hech qachon nolga tushmasdi ("Bugun" yozuvi butun vaqt yig'indisini ko'rsatardi)
  const [slaHistory, setSlaHistory] = useState(() => {
    const saved = readLocalJSON('pos_kds_sla_history', null);
    const today = dayKeyOf(Date.now());
    return saved && saved.day === today ? saved : { ...EMPTY_SLA, day: today };
  });

  // UI Statelari
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'stoplist'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'delayed' | 'new' | 'cooking'
  // Sex: ro'yxat barcha qurilmalarda bir xil, qaysi sexni ko'rsatishi - shu qurilmada (src/utils/kitchenStations.ts)
  const [stationsRaw, setStationsRaw] = useSticky(STATIONS_KEY, []);
  const stations = useMemo(() => normalizeStations(stationsRaw), [stationsRaw]);
  const [stationSelection, setStationSelection] = useSticky(DEVICE_STATION_KEY, 'all');
  const stationCats = useMemo(() => selectionCategories(stationSelection, stations), [stationSelection, stations]);
  const [isStationsModalOpen, setIsStationsModalOpen] = useState(false);
  // Avtomatik oshxona cheki (KOT): faqat shu qurilmada
  const [autoPrint, setAutoPrint] = useSticky(AUTO_PRINT_KEY, false);
  const [stopSearch, setStopSearch] = useState('');
  const [stopCategoryFilter, setStopCategoryFilter] = useState('Barchasi');
  const [isSlaModalOpen, setIsSlaModalOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Har chekdagi oshxona porsiyalari soni (yangi chek yoki dozakaz tushganda ovoz chiqarish uchun)
  const prevPendingRef = useRef(null);
  const prevCancelCountRef = useRef(null);
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
    writeLocalJSON(SELECTED_KEY, selected);
  }, [selected]);

  // Eski (tartib raqami bo'yicha) belgilar endi ishlatilmaydi
  useEffect(() => {
    try {
      window.localStorage.removeItem('pos_kds_checked_items');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    writeLocalJSON('pos_kds_sla_history', slaHistory);
  }, [slaHistory]);

  // =========================================================
  // 3. BUYURTMANING ANIQ BOSHLANGAN VAQTINI ANIQLASH
  // =========================================================
  const getOrderStartMs = useCallback((order) => {
    if (!order) return nowMs;
    const idKey = String(order.id);

    // 0. Dozakaz: oshxonaga qayta tushgan vaqt
    if (order.kitchenRoundAt && !isNaN(Number(order.kitchenRoundAt))) {
      return Number(order.kitchenRoundAt);
    }

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

  // Oshxonaga tegishli faol buyurtmalar: 'Yangi', 'Tayyorlanmoqda' va oshxona tugatmasdan to'langan
  // cheklar (oldin kassa chekni yopishi bilan u oshxona ekranidan yo'qolib, taom tayyorlanmay qolardi)
  const kitchenActiveOrders = useMemo(() => {
    const now = Date.now();
    return safeOrders.filter(o => o && isKitchenVisible(o, now));
  }, [safeOrders]);

  // Yangi tushgan buyurtmalarga boshlang'ich vaqt muhrini qo'yish va ovoz chalish
  useEffect(() => {
    let updatedMap = null;
    const pendingById = new Map();

    kitchenActiveOrders.forEach(o => {
      const key = String(o.id);
      pendingById.set(key, kitchenSummary(o).pending);
      if (!orderStartTimes[key]) {
        if (!updatedMap) updatedMap = { ...orderStartTimes };
        updatedMap[key] = getOrderStartMs(o);
      }
    });

    if (updatedMap) {
      setOrderStartTimes(updatedMap);
      writeLocalJSON('pos_kds_start_times', updatedMap);
    }

    // Yangi chek YOKI oshxonadagi chekka qo'shimcha porsiya tushsa "Ding-Dong"
    // (oldin faqat yangi chekda chalinardi: oshxonadagi chekka dozakaz jim tushardi)
    if (prevPendingRef.current !== null) {
      const prev = prevPendingRef.current;
      const grew = [...pendingById].some(([id, p]) => p > (prev.get(id) || 0));
      if (grew && slaConfig.soundEnabled) {
        playKitchenSound('new_order');
      }
    }
    prevPendingRef.current = pendingById;
  }, [kitchenActiveOrders, orderStartTimes, getOrderStartMs, slaConfig.soundEnabled]);

  // =========================================================
  // 4. HAR BIR BUYURTMA UCHUN SLA HOLATINI HISOBLASH
  // =========================================================
  // Sex (bir nechta kategoriya) yoki bitta kategoriya filtri: taom shu sexnikimi
  const stationMatches = useCallback((it) => {
    if (!stationCats) return true;
    return stationCats.has(lineCategory(it, safeMenuItems));
  }, [stationCats, safeMenuItems]);

  const enrichedOrders = useMemo(() => {
    const warnSec = (Number(slaConfig.warningMinutes) || 10) * 60;
    const critSec = (Number(slaConfig.criticalMinutes) || 20) * 60;

    return kitchenActiveOrders.map(order => {
      const startMs = getOrderStartMs(order);
      let elapsedSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));
      let formattedTimer = formatTimer(elapsedSeconds);
      let slaLevel = slaLevelOf(elapsedSeconds, warnSec, critSec); // 'normal' | 'warning' | 'critical'
      let slaProgressPct = Math.min(100, Math.round((elapsedSeconds / critSec) * 100));

      // To'langan (oshxona tugatmagan) chek oshxonada "tayyorlanmoqda" bosqichida ko'rinadi
      const isPaidOrder = isClosedStatus(String(order.status || ''));
      const kitchenStatus = isPaidOrder ? ORDER_STATUS.COOKING : order.status;

      // Faqat hali tayyorlanmagan porsiyalar (dozakazda eski taomlar qayta chiqmaydi, B3).
      // Har qatorning doimiy kaliti (lineId): tanlov va amallar shu kalit bo'yicha (B20).
      // Har taomning o'z taymeri: oshxonaga tushgan vaqtidan (dozakaz - o'z vaqtidan)
      const lines = orderLines(order);
      const pendingLines = lines
        .map(({ item, lineId }) => {
          const pending = pendingQtyOf(item, order);
          if (pending <= 0) return null;
          const sentMs = lineSentMs(item, startMs);
          const lineSeconds = Math.max(0, Math.floor((nowMs - sentMs) / 1000));
          return {
            ...item,
            lineId,
            pending,
            sentMs,
            lineTimer: formatTimer(lineSeconds),
            lineSla: slaLevelOf(lineSeconds, warnSec, critSec),
            // Oshxonadagi chekka keyin qo'shilgan taom (dozakaz)
            isAddition: Number(item.kitchenSentAt) > startMs + 60000
          };
        })
        .filter(Boolean);
      const displayItems = pendingLines.filter(stationMatches);
      // Kartadagi taymer: shu sexda eng uzoq kutayotgan taomdan (oldin chek boshidan: dozakaz kech ko'rinardi)
      if (displayItems.length > 0) {
        const oldest = Math.min(...displayItems.map(l => l.sentMs));
        elapsedSeconds = Math.max(0, Math.floor((nowMs - oldest) / 1000));
        formattedTimer = formatTimer(elapsedSeconds);
        slaLevel = slaLevelOf(elapsedSeconds, warnSec, critSec);
        slaProgressPct = Math.min(100, Math.round((elapsedSeconds / critSec) * 100));
      }
      // Shu bosqichda tayyor bo'lganlar (oshpazga ma'lumot: qolganini tayyorlash kerak)
      const readyNow = lines
        .filter(({ item }) =>
          isKitchenItem(item) && Number(item.kitchenReadyAt) >= startMs &&
          doneQtyOf(item, order) > 0 && stationMatches(item))
        .map(({ item, lineId }) => ({ lineId, name: item.name, qty: doneQtyOf(item, order) }));

      return {
        ...order,
        elapsedSeconds,
        formattedTimer,
        slaLevel,
        slaProgressPct,
        isPaidOrder,
        kitchenStatus,
        displayItems,
        readyNow,
        totalPending: pendingLines.reduce((sum, l) => sum + l.pending, 0),
        visiblePending: displayItems.reduce((sum, l) => sum + l.pending, 0)
      };
    }).filter(o => o.displayItems.length > 0);
  }, [kitchenActiveOrders, getOrderStartMs, nowMs, slaConfig, stationMatches]);

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
      if (statusFilter === 'new') return o.kitchenStatus === ORDER_STATUS.NEW;
      if (statusFilter === 'cooking') return o.kitchenStatus === ORDER_STATUS.COOKING;
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
      order.displayItems.forEach(item => {
        if (!item?.name) return;
        const name = String(item.name).trim();
        const qty = Number(item.pending) || 0;
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
  }, [enrichedOrders]);

  const kitchenKpi = useMemo(() => {
    const totalActive = enrichedOrders.length;
    const criticalCount = enrichedOrders.filter(o => o.slaLevel === 'critical').length;
    const warningCount = enrichedOrders.filter(o => o.slaLevel === 'warning').length;
    const newCount = enrichedOrders.filter(o => o.kitchenStatus === ORDER_STATUS.NEW).length;

    const todaySla = slaHistory && slaHistory.day === dayKeyOf(nowMs) ? slaHistory : EMPTY_SLA;
    const totalCompletedToday = (todaySla.onTimeCount || 0) + (todaySla.delayedCount || 0);
    const avgCookSeconds = totalCompletedToday > 0
      ? Math.round((todaySla.totalCookSeconds || 0) / totalCompletedToday)
      : 0;
    const avgCookMins = Math.floor(avgCookSeconds / 60);
    const avgCookSecs = avgCookSeconds % 60;

    const slaComplianceRate = totalCompletedToday > 0
      ? Math.round(((todaySla.onTimeCount || 0) / totalCompletedToday) * 100)
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
  }, [enrichedOrders, slaHistory, nowMs]);

  // =========================================================
  // 6. OSHPAZ HARAKATLARI (STATUS O'ZGARTIRISH VA SUB-ITEM)
  // =========================================================
  const actorName = currentUser?.name || 'Oshpaz';

  // Chekni ENG SO'NGGI holatidan o'zgartiradi (boshqa qurilmadagi o'zgarish o'chib ketmaydi).
  // fn(order) -> { order, ... } ; natija qaytariladi (audit va xabar uchun)
  const applyToOrder = useCallback((orderId, fn) => {
    let result = null;
    updateOrdersState(prev => (Array.isArray(prev) ? prev : []).map(o => {
      if (!o || String(o.id) !== String(orderId)) return o;
      result = fn(o);
      return result && result.order ? result.order : o;
    }));
    return result;
  }, [updateOrdersState]);

  const handleToggleLine = (orderId, lineId) => {
    const key = selKey(orderId, lineId);
    setSelected(prev => {
      const next = { ...(prev || {}) };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  };

  const clearSelectionFor = useCallback((orderId, lineIds = null) => {
    const prefix = `${orderId}|`;
    setSelected(prev => {
      const next = {};
      let changed = false;
      Object.keys(prev || {}).forEach(k => {
        const drop = k.startsWith(prefix) && (!lineIds || lineIds.includes(k.slice(prefix.length)));
        if (drop) changed = true;
        else next[k] = prev[k];
      });
      return changed ? next : prev;
    });
  }, []);

  // Tanlov eskirmasin: ekrandan ketgan (tayyor, rad etilgan, boshqa sex) taom tanlovdan chiqadi
  useEffect(() => {
    const alive = new Set();
    enrichedOrders.forEach(o => o.displayItems.forEach(l => alive.add(selKey(o.id, l.lineId))));
    setSelected(prev => {
      const keys = Object.keys(prev || {});
      if (keys.every(k => alive.has(k))) return prev;
      const next = {};
      keys.forEach(k => {
        if (alive.has(k)) next[k] = true;
      });
      return next;
    });
  }, [enrichedOrders]);

  const handleStartCooking = (order) => {
    applyToOrder(order.id, o => ({ order: startCooking(o, Date.now()) }));
    if (typeof addAuditLog === 'function') {
      addAuditLog('Oshxona: Pishirish boshlandi', `${order.table} (${order.formattedTimer} kutdi)`);
    }
  };

  // FAQAT berilgan taomlar tayyor bo'ladi (belgilanganlar yoki ekrandagi hammasi).
  // Oldin har doim butun chek "Tayyor" bo'lardi: belgilanmagan taomlar ham oshxonadan yo'qolardi (B19)
  const handleMarkReady = (order, lines) => {
    const list = Array.isArray(lines) ? lines : [];
    const ids = list.map(l => l.lineId);
    if (ids.length === 0) return;
    const now = Date.now();
    const result = applyToOrder(order.id, o => {
      const r = markLinesReady(o, ids, now);
      if (r.completed && !isClosedStatus(String(r.order.status || ''))) {
        r.order = { ...r.order, cookDurationSeconds: order.elapsedSeconds };
      }
      return r;
    });
    if (!result || result.marked === 0) {
      notify("⚠️ Bu taomlar allaqachon tayyor yoki chek boshqa qurilmada o'zgargan");
      return;
    }
    clearSelectionFor(order.id, ids);

    // SLA statistikasi: chek to'liq tayyor bo'lganda bir marta
    if (result.completed) {
      const critSec = (Number(slaConfig.criticalMinutes) || 20) * 60;
      const isDelayed = (order.elapsedSeconds || 0) >= critSec;
      const today = dayKeyOf(now);
      setSlaHistory(prev => {
        const base = prev && prev.day === today ? prev : { ...EMPTY_SLA, day: today };
        return {
          day: today,
          onTimeCount: (base.onTimeCount || 0) + (isDelayed ? 0 : 1),
          delayedCount: (base.delayedCount || 0) + (isDelayed ? 1 : 0),
          totalCookSeconds: (base.totalCookSeconds || 0) + (order.elapsedSeconds || 0)
        };
      });
    }

    if (typeof addAuditLog === 'function') {
      addAuditLog(
        result.completed ? "Oshxona: Taom tayyor bo'ldi" : 'Oshxona: Taomning bir qismi tayyor',
        `${order.table}: ${linesText(list.map(l => ({ qty: l.pending, name: l.name })))} (${order.formattedTimer} ichida)${
          result.completed ? '' : ' • qolgani oshxonada'
        }`
      );
    }
  };

  // Rad etish oynasidan: porsiyalar chekdan olinadi, ofitsiant va kassirga xabar boradi
  const handleConfirmReject = ({ requests, reason, addToStopList }) => {
    const target = rejectTarget
      ? enrichedOrders.find(o => String(o.id) === String(rejectTarget.orderId))
      : null;
    setRejectTarget(null);
    if (!target) return;
    const run = () => performReject(target, { requests, reason, addToStopList });
    if (typeof requireAdminOverride === 'function') {
      const count = (Array.isArray(requests) ? requests : []).reduce((sum, r) => sum + (Number(r?.qty) || 0), 0);
      requireAdminOverride(`${target.table}: ${count} porsiya taomni rad etish (${reason})`, run, 'kitchenReject');
    } else {
      run();
    }
  };

  // Rad etish (tasdiqdan keyin): chek eng so'nggi holatidan o'zgartiriladi (applyToOrder)
  const performReject = (target, { requests, reason, addToStopList }) => {
    const now = Date.now();
    const result = applyToOrder(target.id, o => rejectLines(o, requests, { reason, by: actorName, now }));
    if (!result || result.rejected === 0) {
      notify("⚠️ Rad etib bo'lmadi: taom allaqachon tayyor bo'lgan yoki chek boshqa qurilmada o'zgargan");
      return;
    }
    clearSelectionFor(target.id);
    const what = linesText(result.records);

    if (addToStopList) {
      updateMenuState(prev => (Array.isArray(prev) ? prev : []).map(m => {
        if (!m || m.is_available === false) return m;
        const hit = requests.some(r =>
          (r.menuId !== undefined && r.menuId !== null && String(m.id) === String(r.menuId)) ||
          (r.baseName && m.name === r.baseName));
        return hit ? { ...m, is_available: false } : m;
      }));
    }

    if (typeof addAuditLog === 'function') {
      addAuditLog(
        'Oshxona: taom rad etildi',
        `${target.table}: ${what} • Sabab: ${reason}${
          result.refundDue > 0 ? ` • To'langan chek: ${result.refundDue.toLocaleString()} so'm qaytariladi` : ''
        }${result.cancelled ? ' • chekda taom qolmadi (bekor qilindi)' : ''}${addToStopList ? ' • stop-listga olindi' : ''}`
      );
    }
    sendTelegramLines([
      '❌ <b>OSHXONA TAOMNI RAD ETDI</b>',
      `🪑 <b>Joy:</b> ${escapeHtml(target.table)}`,
      `🍽 <b>Taom:</b> ${escapeHtml(what)}`,
      `📝 <b>Sabab:</b> ${escapeHtml(reason)}`,
      `👨‍🍳 <b>Oshpaz:</b> ${escapeHtml(actorName)}`,
      result.refundDue > 0 ? `💸 <b>To'langan chek, qaytarish:</b> ${result.refundDue.toLocaleString()} so'm` : null,
      result.cancelled ? '🛑 Chekda taom qolmadi: chek bekor qilindi' : null
    ], 'security');
    notify(`❌ ${target.table}: ${what} rad etildi. Ofitsiantga xabar ketdi.`);
  };

  // =========================================================
  // 6.1 SEXLAR VA OSHXONA CHEKI (KOT)
  // =========================================================
  const [cafeName] = useSticky('pos_cafe_name', '');
  const kotLinesOf = (order) => (Array.isArray(order?.displayItems) ? order.displayItems : []).map(l => ({
    lineId: l.lineId,
    name: l.name,
    qty: l.pending,
    total: Number(l.quantity ?? l.qty ?? l.pending) || l.pending,
    note: l.note,
    isAddition: l.isAddition
  }));
  const kotBaseOf = (order) => ({
    cafeName: String(cafeName || ''),
    table: String(order.table || ''),
    waiter: String(order.waiterName || order.waiter || ''),
    orderId: String(order.id),
    station: selectionLabel(stationSelection, stations),
    printedAt: Date.now()
  });

  // Qo'lda chop etish: shu sexdagi oshxonada turgan taomlar. Avtomatik chop etish ularni qayta chiqarmaydi
  const handlePrintKot = (order) => {
    const lines = kotLinesOf(order);
    if (lines.length === 0) return;
    printHtml(kotDocument([{ ...kotBaseOf(order), lines }]));
    const printed = readLocalJSON(PRINTED_KEY, {}) || {};
    writeLocalJSON(PRINTED_KEY, unprintedLines(lines, printed).next);
  };

  const handleChangeStations = (next) => {
    setStationsRaw(next);
    if (stationSelection.startsWith?.('st:') && !next.some(s => `st:${s.id}` === stationSelection)) {
      setStationSelection('all');
    }
    if (typeof addAuditLog === 'function') {
      addAuditLog('Oshxona sexlari', next.map(s => `${s.icon} ${s.name}: ${s.categories.join(', ')}`).join(' • ') || "sex yo'q");
    }
  };

  // Yoqilganda hozir oshxonada turgan taomlar "chop etilgan" deb olinadi: eskilari birdan chiqib ketmasin
  const handleToggleAutoPrint = (next) => {
    if (next) {
      let printed = readLocalJSON(PRINTED_KEY, {}) || {};
      enrichedOrders.forEach(o => {
        printed = unprintedLines(kotLinesOf(o), printed).next;
      });
      writeLocalJSON(PRINTED_KEY, printed);
    }
    setAutoPrint(Boolean(next));
  };

  // Avtomatik oshxona cheki: yangi buyurtma yoki dozakaz porsiyalari (shu qurilmaning sexi bo'yicha)
  useEffect(() => {
    if (!autoPrint) return;
    const printed = readLocalJSON(PRINTED_KEY, {}) || {};
    let next = printed;
    const tickets = [];
    enrichedOrders.forEach(order => {
      const res = unprintedLines(kotLinesOf(order), next);
      next = res.next;
      if (res.lines.length > 0) {
        tickets.push({ ...kotBaseOf(order), lines: res.lines, isUpdate: res.lines.some(l => l.isAddition) });
      }
    });
    // Oshxonadan chiqqan cheklar qatorlari xaritadan o'chadi (cheksiz o'smasin)
    const keep = new Set(kitchenActiveOrders.flatMap(o => orderLines(o).map(l => l.lineId)));
    next = prunePrinted(next, keep);
    if (JSON.stringify(next) !== JSON.stringify(printed)) writeLocalJSON(PRINTED_KEY, next);
    if (tickets.length > 0) printHtml(kotDocument(tickets));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrint, enrichedOrders, kitchenActiveOrders]);

  // Xodim bekor qilgan, oshxonada turgan taomlar (oshpaz bekorga tayyorlamasin)
  const kitchenCancelNotices = useMemo(
    () => collectKitchenCancellations(safeOrders, Date.now()),
    [safeOrders]
  );

  useEffect(() => {
    const n = kitchenCancelNotices.length;
    if (prevCancelCountRef.current !== null && n > prevCancelCountRef.current && slaConfig.soundEnabled) {
      playKitchenSound('sla_breach');
    }
    prevCancelCountRef.current = n;
  }, [kitchenCancelNotices.length, slaConfig.soundEnabled]);

  const handleAckCancellations = (orderId) => {
    applyToOrder(orderId, o => ({ order: ackNotices(o, 'cancellations', actorName, Date.now()) }));
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
      <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-3xl shadow-xs border border-gray-100 dark:border-gray-700 space-y-4">
        
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
              className="px-4 py-2.5 rounded-xl bg-brand-50 dark:bg-brand-900/30 hover:bg-brand-100 text-brand-700 dark:text-brand-300 font-black text-xs border border-brand-200 dark:border-brand-800 transition flex items-center gap-1.5"
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
              <p className="text-base sm:text-lg font-black text-brand-600 dark:text-brand-400 mt-0.5">
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
          {/* XODIM BEKOR QILGAN TAOMLAR: oshpaz bekorga tayyorlamasin */}
          {kitchenCancelNotices.length > 0 && (
            <div className="space-y-2" data-testid="kitchen-cancel-notices">
              {kitchenCancelNotices.map(n => (
                <div
                  key={n.orderId}
                  className="p-3 sm:p-4 rounded-2xl bg-red-600 text-white shadow-lg shadow-red-600/30 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm sm:text-base break-words">
                      🚫 {n.table}: BEKOR QILINDI — {linesText(n.lines)}
                    </p>
                    <p className="text-xs font-bold text-red-100 break-words">
                      {new Date(n.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {n.by ? ` • ${n.by}` : ''}
                      {n.reasons.length > 0 ? ` • Sabab: ${n.reasons.join('; ')}` : ''}
                      {' • tayyorlamang'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAckCancellations(n.orderId)}
                    className="shrink-0 px-4 py-2.5 rounded-xl bg-white text-red-600 hover:bg-red-50 font-black text-sm transition active:scale-95"
                  >
                    ✓ Ko'rdim
                  </button>
                </div>
              ))}
            </div>
          )}

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
                    className={`px-3.5 py-2 rounded-2xl border flex items-center gap-2.5 shadow-xs ${
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
                      ? 'bg-brand-600 text-white shadow-xs'
                      : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Oshxona sexi: sozlangan sexlar (bar, issiq sex) va kategoriyalar. Tanlov shu qurilmada saqlanadi */}
            <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
              <span className="text-[10px] font-black uppercase text-gray-400 whitespace-nowrap pl-1">
                👨‍🍳 Sex:
              </span>
              {[
                { id: 'all', label: 'Barchasi' },
                ...stations.map(s => ({ id: `st:${s.id}`, label: `${s.icon} ${s.name}` })),
                ...safeCategories.map(cat => ({ id: `cat:${cat}`, label: cat }))
              ].map(opt => {
                const active = stationSelection === opt.id ||
                  (opt.id === 'all' && (!stationSelection || stationSelection === 'Barchasi')) ||
                  (opt.id === `cat:${stationSelection}`);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setStationSelection(opt.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition ${
                      active
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setIsStationsModalOpen(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                title="Sexlar va oshxona cheki (KOT) sozlamasi"
              >
                ⚙️ Sexlar{autoPrint ? ' • 🖨' : ''}
              </button>
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

                const isNew = order.kitchenStatus === ORDER_STATUS.NEW;

                // Oshpaz tanlagan taomlar: "Tayyor" faqat shularga tegadi (B19)
                const selectedLines = order.displayItems.filter(l => selected[selKey(order.id, l.lineId)]);
                const selectedPortions = selectedLines.reduce((sum, l) => sum + l.pending, 0);
                const hiddenPending = Math.max(0, order.totalPending - order.visiblePending);

                const cardBorderStyle = isCritical
                  ? 'border-red-500 dark:border-red-500 ring-4 ring-red-500/20'
                  : isWarning
                  ? 'border-amber-400 dark:border-amber-500 ring-2 ring-amber-400/20'
                  : isNew
                  ? 'border-indigo-400 dark:border-indigo-500'
                  : 'border-emerald-400 dark:border-emerald-600';

                const headerBgStyle = isCritical
                  ? 'bg-red-600 text-white'
                  : isWarning
                  ? 'bg-amber-500 text-white'
                  : isNew
                  ? 'bg-indigo-600 text-white'
                  : 'bg-emerald-600 text-white';

                return (
                  <div
                    key={order.id}
                    data-testid="kitchen-order-card"
                    className={`bg-white dark:bg-gray-800 rounded-3xl border-2 shadow-md overflow-hidden flex flex-col justify-between transition-all ${cardBorderStyle}`}
                  >
                    <div>
                      {/* KARTOCHKA TEPASI: STOL, JONLI SEKUNDOMER VA STATUS */}
                      <div className={`p-4 ${headerBgStyle} transition-colors`}>
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-xl font-black tracking-tight">
                                {isDeliveryOrder(order) ? '🛵' : '🪑'} {order.table}
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
                            {order.isPaidOrder && (
                              <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-white/90 text-emerald-700 text-[10px] font-black uppercase">
                                💳 To'langan: tayyor bo'lgach kassaga xabar boradi
                              </span>
                            )}
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

                      {/* TAOMLAR RO'YXATI: bosib tanlang -> "Tanlanganlar tayyor" yoki "Rad etish" */}
                      <div className="p-4 space-y-2.5">
                        <div className="flex justify-between items-center gap-2 text-[11px] font-black text-gray-400 uppercase">
                          <span>Taomlar (bosib tanlang)</span>
                          <span className="flex items-center gap-2">
                            <span className={selectedLines.length > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}>
                              {selectedLines.length > 0
                                ? `Tanlandi: ${selectedLines.length}/${order.displayItems.length}`
                                : `${order.visiblePending} pors`}
                            </span>
                            <button
                              type="button"
                              data-testid="kitchen-kot-button"
                              onClick={() => handlePrintKot(order)}
                              className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-900 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 normal-case transition"
                              title="Oshxona chekini (KOT) chop etish"
                            >
                              🖨 Chek
                            </button>
                          </span>
                        </div>

                        <div className="space-y-2">
                          {order.displayItems.map(item => {
                            const isPicked = Boolean(selected[selKey(order.id, item.lineId)]);
                            return (
                              <button
                                type="button"
                                key={item.lineId}
                                data-testid="kitchen-line"
                                aria-pressed={isPicked}
                                onClick={() => handleToggleLine(order.id, item.lineId)}
                                className={`w-full text-left p-3 rounded-2xl border cursor-pointer transition select-none flex justify-between items-start gap-3 ${
                                  isPicked
                                    ? 'bg-emerald-50 dark:bg-emerald-900/25 border-emerald-400 dark:border-emerald-600 ring-2 ring-emerald-400/30'
                                    : 'bg-gray-50 dark:bg-gray-900/60 border-gray-200/80 dark:border-gray-700 hover:border-amber-400'
                                }`}
                              >
                                <span className="flex items-start gap-2.5 min-w-0">
                                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${
                                    isPicked
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-transparent'
                                  }`}>
                                    ✓
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block font-black text-sm sm:text-base leading-snug text-gray-900 dark:text-white break-words">
                                      {item.name}
                                    </span>
                                    {item.isAddition && (
                                      <span className="inline-block mt-1 mr-1 px-2 py-0.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-black uppercase">
                                        🆕 Qo'shimcha
                                      </span>
                                    )}
                                    {/* Mijoz yoki Ofitsiant izohi */}
                                    {item.note && (
                                      <span className="inline-block mt-1 px-2.5 py-0.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-black break-words">
                                        ⚠️ Izoh: {item.note}
                                      </span>
                                    )}
                                  </span>
                                </span>

                                <span className="flex flex-col items-end gap-1 shrink-0">
                                  <span className={`px-3 py-1 rounded-xl font-black text-sm ${
                                    isPicked
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-amber-500 text-white shadow-xs'
                                  }`}>
                                    x{item.pending}
                                  </span>
                                  {/* Taomning o'z taymeri (dozakaz - o'z vaqtidan) */}
                                  <span
                                    data-testid="kitchen-line-timer"
                                    className={`font-mono text-[11px] font-black px-1.5 rounded-md ${
                                      item.lineSla === 'critical'
                                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                        : item.lineSla === 'warning'
                                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                          : 'text-gray-400'
                                    }`}
                                  >
                                    ⏱ {item.lineTimer}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Shu bosqichda tayyor bo'lganlar (ofitsiantga ketgan) */}
                        {order.readyNow.length > 0 && (
                          <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl px-3 py-2 break-words">
                            ✅ Tayyor (ofitsiantga ketdi): {linesText(order.readyNow)}
                          </p>
                        )}
                        {hiddenPending > 0 && (
                          <p className="text-[11px] font-bold text-gray-400">
                            👨‍🍳 Boshqa sexda yana {hiddenPending} porsiya bor
                          </p>
                        )}
                      </div>
                    </div>

                    {/* PASTKI HARAKAT TUGMALARI */}
                    <div className="p-4 pt-0 space-y-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          data-testid="kitchen-reject-button"
                          onClick={() => setRejectTarget({
                            orderId: order.id,
                            preselectedIds: selectedLines.map(l => l.lineId)
                          })}
                          className="shrink-0 px-4 py-3 min-h-[56px] rounded-2xl bg-red-50 dark:bg-red-900/25 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800 font-black text-xs sm:text-sm transition active:scale-95"
                          title="Taomni yoki butun chekni rad etish (sabab bilan)"
                        >
                          ❌ Rad etish
                        </button>
                        <button
                          type="button"
                          data-testid="kitchen-primary-button"
                          onClick={() => {
                            if (selectedLines.length > 0) handleMarkReady(order, selectedLines);
                            else if (isNew) handleStartCooking(order);
                            else handleMarkReady(order, order.displayItems);
                          }}
                          className={`flex-1 min-w-0 py-3 px-3 min-h-[56px] rounded-2xl font-black text-sm text-white text-center leading-tight shadow-lg transition active:scale-95 flex items-center justify-center gap-2 ${
                            selectedLines.length === 0 && isNew
                              ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/30'
                              : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30'
                          }`}
                        >
                          {selectedLines.length > 0 ? (
                            <span>✅ Tanlanganlar tayyor ({selectedPortions} pors)</span>
                          ) : isNew ? (
                            <span>🔥 Pishirishni boshlash</span>
                          ) : (
                            <span>
                              ✅ {hiddenPending > 0 ? 'Shu sexdagilar' : 'Hammasi'} tayyor ({order.visiblePending} pors)
                            </span>
                          )}
                        </button>
                      </div>
                      {selectedLines.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => clearSelectionFor(order.id)}
                          className="w-full text-[11px] font-black text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                          Tanlovni tozalash
                        </button>
                      ) : (
                        <p className="text-[10px] font-bold text-gray-400 text-center">
                          Bir nechta taom tayyor bo'lsa, ularni bosib tanlang: faqat tanlanganlar ofitsiantga ketadi
                        </p>
                      )}
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
        <div className="bg-white dark:bg-gray-800 p-5 md:p-6 rounded-3xl shadow-xs border border-gray-100 dark:border-gray-700 space-y-5">
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
                className="px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-900 dark:text-white outline-hidden focus:border-red-500"
              />

              <select
                value={stopCategoryFilter}
                onChange={e => setStopCategoryFilter(e.target.value)}
                className="px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs font-black text-gray-800 dark:text-white outline-hidden cursor-pointer"
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
                      : 'bg-red-600 text-white shadow-xs'
                  }`}>
                    {isAvailable ? '🟢 Bor' : '🛑 Tugagan'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isStationsModalOpen && (
        <KitchenStationsModal
          stations={stations}
          categories={safeCategories}
          selection={stationSelection}
          autoPrint={Boolean(autoPrint)}
          onChangeStations={handleChangeStations}
          onSelect={setStationSelection}
          onToggleAutoPrint={handleToggleAutoPrint}
          onClose={() => setIsStationsModalOpen(false)}
        />
      )}

      {rejectTarget && (() => {
        const target = enrichedOrders.find(o => String(o.id) === String(rejectTarget.orderId));
        if (!target) return null;
        return (
          <KitchenRejectModal
            key={String(target.id)}
            order={target}
            preselectedIds={rejectTarget.preselectedIds}
            onCancel={() => setRejectTarget(null)}
            onConfirm={handleConfirmReject}
          />
        );
      })()}

      {/* =======================================================
          MODAL: SLA TAYMER VA SIGNALIZATSIYA SOZLAMALARI
          ======================================================= */}
      {isSlaModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
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
                  className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-gray-900 dark:text-white outline-hidden focus:border-amber-500"
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
                  className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-gray-900 dark:text-white outline-hidden focus:border-red-500"
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
                  className="w-5 h-5 accent-brand-600"
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
                className="flex-1 py-3.5 rounded-xl bg-brand-600 text-white font-black text-xs"
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