import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import useSticky from '../hooks/useSticky';
import WaiterTableGrid from './WaiterTableGrid';
import WaiterMenu from './WaiterMenu';
import WaiterCart from './WaiterCart';
import WaiterActionModals from './WaiterActionModals';
import DeliveryOrderModal from './DeliveryOrderModal';
import { collectTableCalls } from './WaiterCallsPanel';
import { markUnsavedWork } from '../pwa/update';
import { orderTotalsFields, getItemQty } from '../utils/orderTotals';
import { getPinLockRemainingMs, registerPinFailure, resetPinGuard } from '../utils/pinGuard';
import {
  CLOSED_ORDER_STATUSES,
  DELIVERY_STATUS,
  ORDER_STATUS,
  ORDER_TYPE,
  isDeliveryOrder,
  isDeliveryTable
} from '../constants/orderStatus';
import { buildDeliveryFeeItem, getDeliveryStatus, nextDeliveryTable } from '../utils/delivery';
import { sendTelegramLines, escapeHtml } from '../utils/telegramNotifier';
import { notify, confirmAsync } from '../utils/notify';
import { newId } from '../utils/ids';
import { reservedByOpenOrders, stockStatus } from '../utils/inventoryCalc';
import { findUserByPin } from '../utils/pinHash';
import { hasTwoFactor } from '../utils/twoFactor';
import { OWNER_KEY, canApproveOverride, resolveOwnerId } from '../utils/adminRights';
import { LEGACY_OVERRIDE_KEY, PIN_RULES_KEY, isPinRuleOn, resolvePinRules } from '../utils/pinRules';
import { isTakeawayTable, nextTakeawayNo, orderLabel } from '../utils/takeaway';
import TwoFactorCodeModal from './TwoFactorCodeModal';
import {
  applyWaiterCart,
  cancelWholeOrder,
  deriveStatus,
  doneQtyOf,
  kitchenSummary,
  lineIdOf,
  materializeOrder,
  newKitchenLine,
  rebaseCart,
  reduceLine,
  sameCart,
  servedQtyOf,
  serveReadyLines,
  stripHeavyFields
} from '../utils/kitchenFlow';

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
    osc.frequency.setValueAtTime(784, now);
    osc.frequency.setValueAtTime(1046.5, now + 0.15);
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

// Telegram: yagona joy - src/utils/telegramNotifier.js (B12)
const sendWaiterSecurityTelegram = (linesArray) => sendTelegramLines(linesArray, 'security');

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
  inventory: inventoryProp,
  currentUser,
  onPrintReceipt,
  setReceiptToPrint,
  addAuditLog,
  // Mijoz chaqiruvlari (pos_calls: telefondagi QR sahifa va mijoz ekrani) va ularni o'chirish
  waiterCalls,
  onClearCall
}) {
  // =========================================================
  // 1. ZAXIRA XOTIRA VA AUDIT LOG SINXRONIZATORI
  // =========================================================
  const [stickyTables] = useSticky(
    'pos_tables',
    Array.from({ length: 15 }, (_, i) => `${i + 1}-Stol`)
  );
  const [stickyOrders, setStickyOrders] = useSticky('pos_orders', []);
  const [stickyMenu] = useSticky('pos_menu', []);
  const [stickyCategories] = useSticky('pos_categories', ['Asosiy', 'Ichimlik', 'Shirinlik']);
  const [stickyUsers] = useSticky('pos_users', []);
  // Admin PIN himoyasi har amal uchun alohida (src/utils/pinRules.ts) va kim tasdiqlay oladi (Ega va
  // "tasdiqlash" huquqi bor admin: src/utils/adminRights.ts)
  const [stickyOverrideEnabled] = useSticky(LEGACY_OVERRIDE_KEY, true);
  const [stickyPinRules] = useSticky(PIN_RULES_KEY, null);
  const [stickyOwner] = useSticky(OWNER_KEY, null);
  const [stickyCafeName] = useSticky('pos_cafe_name', 'Premium Cafe');
  const [, setStickyAuditLogs] = useSticky('pos_audit_logs', []);

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

  const [stickyInventory] = useSticky('pos_inventory', []);
  const safeInventory = Array.isArray(inventoryProp) ? inventoryProp : (Array.isArray(stickyInventory) ? stickyInventory : []);

  // Buyurtmalarni FAQAT bitta joy orqali yozish (App.jsx bo'lsa o'sha, aks holda o'zining nusxasi).
  // Ikkalasiga birdan yozilsa, yangilanish ikki marta qo'llanadi (masalan, buyurtma ikki marta qo'shiladi).
  const updateOrders = useCallback((updater) => {
    if (typeof setOrdersProp === 'function') {
      setOrdersProp(updater);
    } else {
      setStickyOrders(updater);
    }
  }, [setOrdersProp, setStickyOrders]);

  // 🕵️‍♂️ KAFOLATLANGAN AUDIT LOG YOZUVCHISI (App.jsx dan prop kelmasa ham 100% Tarixga yozadi!)
  const recordAuditLog = useCallback((action, details) => {
    const nowStr = new Date().toLocaleString();
    const newEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date: nowStr,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      user: currentUser?.name || 'Ofitsiant',
      userName: currentUser?.name || 'Ofitsiant',
      role: currentUser?.role || 'waiter',
      action,
      details
    };

    // useSticky endi darhol va ishonchli yozadi: qo'shimcha to'g'ridan-to'g'ri yozuv kerak emas
    if (typeof addAuditLog === 'function') {
      addAuditLog(action, details);
    } else {
      setStickyAuditLogs(prev => [newEntry, ...(Array.isArray(prev) ? prev : [])]);
    }
  }, [addAuditLog, currentUser, setStickyAuditLogs]);

  // =========================================================
  // 2. OFITSIANT ISHCHI VA XAVFSIZLIK STATE'LARI
  // =========================================================
  const [selectedTable, setSelectedTable] = useState(null);
  // "Olib ketish": bir vaqtda bir nechta ochiq chek - qaysi biri tanlangan (null - yangi chek)
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [cart, setCart] = useState([]);
  // Savatchada yuborilmagan taom bor ekan, dastur yangilanishi kutadi (src/pwa/update.js)
  useEffect(() => {
    markUnsavedWork('waiter_cart', Array.isArray(cart) && cart.length > 0);
  }, [cart]);
  useEffect(() => () => markUnsavedWork('waiter_cart', false), []);
  const [selectedCategory, setSelectedCategory] = useState('Barchasi');
  const [searchQuery, setSearchQuery] = useState('');
  // Telefon/planshetda (lg dan kichik) menyu va savatcha alohida ko'rsatiladi: 'menu' | 'cart'
  const [mobilePanel, setMobilePanel] = useState('menu');
  const [qrModalTable, setQrModalTable] = useState(null);
  const [localPreCheckPrintOrder, setLocalPreCheckPrintOrder] = useState(null);

  // Yetkazib berish: mijoz ma'lumoti oshxonaga yuborilguncha shu yerda turadi
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [pendingDelivery, setPendingDelivery] = useState(null);

  // Stol ko'chirish va Chek bo'lish modallari
  const [transferOrder, setTransferOrder] = useState(null);
  const [targetTransferTable, setTargetTransferTable] = useState('');
  const [splitOrder, setSplitOrder] = useState(null);
  const [splitTargetTable, setSplitTargetTable] = useState('');
  const [splitQuantities, setSplitQuantities] = useState({});

  // Admin PIN tasdiqlash modali statelari
  const [securityPrompt, setSecurityPrompt] = useState(null);
  // Admin PIN to'g'ri, ikki bosqichli kirish yoqilgan: telefondagi kod kutilmoqda
  const [twoFactorAdmin, setTwoFactorAdmin] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [cancelReasonInput, setCancelReasonInput] = useState('Mijoz rad etdi');
  const [pinError, setPinError] = useState('');

  const prevReadyCountRef = useRef(0);

  // Ovoz: oshxona taom tayyorladi (chekning bir qismi bo'lsa ham) yoki mijoz chaqirdi
  useEffect(() => {
    const readyOrCalledCount = safeOrders.reduce((sum, o) => {
      if (!o || CLOSED_ORDER_STATUSES.includes(o.status)) return sum;
      return sum + kitchenSummary(o).ready + (o.hasCall ? 1 : 0);
    }, 0);

    if (readyOrCalledCount > prevReadyCountRef.current) {
      playWaiterBeep();
    }
    prevReadyCountRef.current = readyOrCalledCount;
  }, [safeOrders]);

  const currentTableOrder = useMemo(() => {
    if (!selectedTable) return null;
    if (isTakeawayTable(selectedTable)) {
      // Olib ketish: chek id si bo'yicha (bir nechta ochiq chek bo'lishi mumkin)
      if (!selectedOrderId) return null;
      return safeOrders.find(
        o => o && String(o.id) === String(selectedOrderId) && !CLOSED_ORDER_STATUSES.includes(o.status)
      ) || null;
    }
    return (
      safeOrders.find(
        o =>
          o &&
          o.table === selectedTable &&
          !CLOSED_ORDER_STATUSES.includes(o.status)
      ) || null
    );
  }, [safeOrders, selectedTable, selectedOrderId]);

  // =========================================================
  // 3. CHEKNI ENG SO'NGGI HOLATIDAN O'ZGARTIRISH
  // =========================================================
  // Oldin savatchaning eski nusxasi butun chekni qayta yozardi: oshxona "tayyor" belgilari,
  // oshxona rad etgan taomlar va boshqa qurilmada qo'shilgan taomlar (QR-buyurtma) o'chib ketardi.
  // Endi o'zgarish chekning eng so'nggi holatiga qo'llanadi (src/utils/kitchenFlow.ts).
  const applyToCurrentOrder = useCallback((fn) => {
    if (!currentTableOrder) return null;
    const orderId = String(currentTableOrder.id);
    let result = null;
    updateOrders(prev => (Array.isArray(prev) ? prev : []).map(o => {
      if (!o || String(o.id) !== orderId) return o;
      result = fn(o);
      return result && result.order ? result.order : o;
    }));
    return result;
  }, [currentTableOrder, updateOrders]);

  // Savatcha chekning eng so'nggi holatiga moslashadi (oshxona rad etdi, QR-buyurtma qo'shildi,
  // kassa yopdi): shu qurilmada qo'shilgan, hali yuborilmagan porsiyalar saqlanadi
  useEffect(() => {
    if (!selectedTable) return;
    setCart(prev => {
      const next = rebaseCart(prev, currentTableOrder);
      return sameCart(prev, next) ? prev : next;
    });
  }, [selectedTable, currentTableOrder]);

  // Ochiq turgan stolning cheki boshqa qurilmada yopilsa yoki bekor qilinsa - xabar
  const lastOpenOrderRef = useRef({ table: null, id: null });
  useEffect(() => {
    const id = currentTableOrder ? String(currentTableOrder.id) : null;
    const last = lastOpenOrderRef.current;
    if (selectedTable && last.table === selectedTable && last.id && !id) {
      notify(`ℹ️ ${selectedTable} cheki boshqa qurilmada yopildi yoki bekor qilindi`);
    }
    lastOpenOrderRef.current = { table: selectedTable, id };
  }, [currentTableOrder, selectedTable]);

  // =========================================================
  // 4. 🔒 ADMIN PIN TEKSHIRUV MOTORI
  // =========================================================
  const pinRules = useMemo(
    () => resolvePinRules(stickyPinRules, stickyOverrideEnabled),
    [stickyPinRules, stickyOverrideEnabled]
  );

  const requestSecurityApproval = useCallback((actionTitle, onApprovedCallback, ruleKey) => {
    // Shu amal uchun PIN himoyasi o'chiq (Admin -> PIN himoyasi): xodim o'zi bajaradi
    if (!isPinRuleOn(pinRules, ruleKey)) {
      onApprovedCallback('Erkin rejimda bajarildi');
      return;
    }

    setPinInput('');
    setCancelReasonInput('Mijoz rad etdi');
    setPinError('');
    setSecurityPrompt({
      title: actionTitle,
      onConfirm: onApprovedCallback
    });
  }, [pinRules]);

  const handleConfirmSecurityPin = (e) => {
    e.preventDefault();
    if (!securityPrompt) return;

    const cleanPin = pinInput.trim();
    const lockLeftMs = getPinLockRemainingMs('waiter_override');
    if (lockLeftMs > 0) {
      setPinError(`⛔️ Bloklangan: ${Math.ceil(lockLeftMs / 1000)} soniya kuting.`);
      return;
    }
    // Faqat tasdiqlash huquqi bor admin (va Ega) PIN'i qabul qilinadi
    const safeStickyUsers = Array.isArray(stickyUsers) ? stickyUsers : [];
    const ownerId = resolveOwnerId(safeStickyUsers, stickyOwner);
    const adminUsers = safeStickyUsers.filter(u => u && canApproveOverride(u, ownerId));

    const matchedAdmin = cleanPin
      ? findUserByPin(adminUsers, cleanPin)
      : null;

    // Faqat haqiqiy admin PIN qabul qilinadi (oldin '0000', '123456' kabi kodlar ham o'tardi)
    if (!matchedAdmin) {
      const { attemptsLeft, lockedMs } = registerPinFailure('waiter_override');
      setPinError(
        lockedMs > 0
          ? `⛔️ Juda ko'p xato! ${Math.ceil(lockedMs / 1000)} soniya kuting.`
          : `❌ Admin PIN-kodi noto'g'ri! (${attemptsLeft} ta urinish qoldi)`
      );
      return;
    }
    resetPinGuard('waiter_override');

    if (hasTwoFactor(matchedAdmin)) {
      setTwoFactorAdmin(matchedAdmin);
      setPinInput('');
      setPinError('');
      return;
    }
    finishSecurityApproval(matchedAdmin);
  };

  const finishSecurityApproval = (matchedAdmin) => {
    if (!securityPrompt) return;
    const adminLabel = matchedAdmin?.name || 'Admin';
    const callback = securityPrompt.onConfirm;
    const reason = `${cancelReasonInput} (Tasdiqladi: ${adminLabel})`;

    setSecurityPrompt(null);
    setPinInput('');
    setPinError('');

    if (typeof callback === 'function') {
      callback(reason);
    }
  };

  // =========================================================
  // 5. STOL TANLASH VA SAVATCHA HARAKATLARI
  // =========================================================
  const handleSelectTable = (tableName, orderId) => {
    setSelectedTable(tableName);
    // Olib ketish: kartadagi chek (yoki yangi chek). Boshqa stol: stolning ochiq cheki
    const takeawayId = isTakeawayTable(tableName) && orderId ? String(orderId) : null;
    setSelectedOrderId(takeawayId);
    setSelectedCategory('Barchasi');
    setSearchQuery('');
    setMobilePanel('menu');

    const existing = isTakeawayTable(tableName)
      ? (takeawayId
        ? safeOrders.find(o => o && String(o.id) === takeawayId && !CLOSED_ORDER_STATUSES.includes(o.status))
        : null)
      : safeOrders.find(
        o =>
          o &&
          o.table === tableName &&
          !CLOSED_ORDER_STATUSES.includes(o.status)
      );

    // Savatcha = chekdagi qatorlar (sentQty = chekdagi porsiya). Qator kaliti chek yozuvidagi bilan
    // bir xil (lineIdOf): yuborilganda eski taom yangi qator bo'lib ikkilanib qolmaydi
    setCart(existing ? rebaseCart([], existing) : []);
  };

  // Stol ekranidan chiqish (yetkazish uchun kiritilgan, lekin yuborilmagan ma'lumot ham tozalanadi)
  const closeSelectedTable = () => {
    setSelectedTable(null);
    setSelectedOrderId(null);
    setCart([]);
    setPendingDelivery(null);
  };

  // =========================================================
  // 5.1 🛵 YETKAZIB BERISH (KURYER) BUYURTMALARI
  // =========================================================
  const openDeliveryOrders = useMemo(
    () => safeOrders.filter(o => o && isDeliveryOrder(o) && !CLOSED_ORDER_STATUSES.includes(o.status)),
    [safeOrders]
  );

  // Mijoz ma'lumoti kiritildi -> "Yetkazish #N" joyi ochiladi, taomlar oddiy menyudan tanlanadi
  const handleStartDelivery = (info) => {
    const table = nextDeliveryTable(safeOrders);
    setIsDeliveryModalOpen(false);
    handleSelectTable(table);
    setPendingDelivery({ ...info, table });
  };

  const selectedDeliveryInfo = currentTableOrder?.delivery
    || (pendingDelivery && pendingDelivery.table === selectedTable ? pendingDelivery : null);

  // Ochiq buyurtmalar va savatdagi yuborilmagan porsiyalar band qilgan masalliq (ombor nazorati)
  const reservedStock = useMemo(() => reservedByOpenOrders(
    safeOrders, safeMenu, safeInventory,
    cart.map(c => ({ item: c, qty: Math.max(0, (Number(c.quantity ?? c.qty ?? 1) || 0) - (Number(c.sentQty) || 0)) }))
  ), [safeOrders, safeMenu, safeInventory, cart]);

  // Telefondagi savatcha tugmasi uchun: jami porsiya, oshxonaga hali yuborilmaganlari va summa
  const cartStats = useMemo(() => {
    let portions = 0;
    let newPortions = 0;
    let subTotal = 0;
    cart.forEach(c => {
      if (!c) return;
      const q = Number(c.quantity ?? c.qty ?? 1) || 0;
      portions += q;
      newPortions += Math.max(0, q - (Number(c.sentQty) || 0));
      subTotal += (Number(c.price) || 0) * q;
    });
    return { portions, newPortions, subTotal };
  }, [cart]);

  const openMobilePanel = (panel) => {
    setMobilePanel(panel);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getStock = useCallback(
    (dish, variant) => stockStatus(dish, variant, safeInventory, reservedStock),
    [safeInventory, reservedStock]
  );

  const handleAddToCart = useCallback(async (dishItem, chosenVariant = null, customNote = '') => {
    if (!dishItem || dishItem.is_available === false) return;

    const variants = Array.isArray(dishItem.variants) ? dishItem.variants : [];
    const activeVariant = chosenVariant || (variants.length > 0 ? variants[0] : null);

    // Omborda masalliq yetmasa ogohlantiramiz (ombor ma'lumoti noaniq bo'lishi mumkin: taqiqlamaymiz)
    const stock = stockStatus(dishItem, activeVariant, safeInventory, reservedStock);
    if (stock.portions <= 0) {
      const proceed = await confirmAsync(
        `⚠️ "${dishItem.name}" uchun omborda masalliq yetmaydi${stock.limitingName ? ` (${stock.limitingName})` : ''}.\nBaribir qo'shilsinmi?`,
        { confirmText: "Baribir qo'shish", danger: true }
      );
      if (!proceed) return;
    }

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
          // Menyu rasmlari (5-50 KB) va tavsifi chek qatoriga ko'chirilmaydi: oldin har bir taom
          // qatori rasm nusxasini olib, qurilma xotirasi va bulut sinxroni tez to'lardi
          ...stripHeavyFields(dishItem),
          id: dishItem.id,
          baseName: dishItem.name,
          name: fullDisplayName,
          variantName: activeVariant?.name || '1 porsiya',
          cartItemId: `ci_${dishItem.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          price: itemPrice,
          quantity: 1,
          qty: 1,
          sentQty: 0,
          note: itemNote
        }
      ];
    });
  }, [safeInventory, reservedStock]);

  // 🔒 Miqdorni o'zgartirish (+1 / -1) -> Oshxona va Kassani DARHOL yangilaydi!
  const handleUpdateQuantity = useCallback((targetIdentifier, delta = 0) => {
    const numDelta = Number(delta) || 0;
    if (numDelta === 0) return;

    const targetItem = cart.find((item, idx) => {
      if (!item) return false;
      return (
        item.cartItemId === targetIdentifier ||
        String(item.id) === String(targetIdentifier) ||
        item.name === targetIdentifier ||
        idx === targetIdentifier
      );
    });

    if (!targetItem) return;

    const currentQty = Number(targetItem.quantity ?? targetItem.qty ?? 1) || 1;
    const sentQty = Number(targetItem.sentQty ?? 0) || 0;
    const nextQty = currentQty + numDelta;
    const isPreCheckLocked = Boolean(currentTableOrder?.isPreCheckPrinted);

    if (numDelta < 0 && (nextQty < sentQty || isPreCheckLocked)) {
      const removedCount = Math.min(currentQty, Math.abs(numDelta));
      const lostSum = removedCount * (Number(targetItem.price) || 0);

      requestSecurityApproval(
        `🔒 ${selectedTable}: "${targetItem.name}" taomini kamaytirish (-${removedCount} pors / -${lostSum.toLocaleString()} s)`,
        (reason) => {
          const lineId = String(targetItem.cartItemId || '');
          // Chekdagi porsiya (yuborilmagan qism ham kamaytirilgan bo'ladi)
          const nextOrderQty = Math.max(0, Math.min(sentQty, nextQty));
          const result = applyToCurrentOrder(o => reduceLine(o, lineId, nextOrderQty, {
            by: currentUser?.name || 'Ofitsiant',
            reason,
            now: Date.now()
          }));

          setCart(prev => prev
            .map(item => {
              if (!item || item.cartItemId !== lineId) return item;
              return nextQty > 0
                ? { ...item, quantity: nextQty, qty: nextQty, sentQty: Math.min(sentQty, nextQty) }
                : null;
            })
            .filter(Boolean));
          // Oxirgi taom ham olindi: chek "Bekor qilindi", stol bo'shaydi
          if (result?.order?.status === ORDER_STATUS.CANCELLED) {
            setCart([]);
            setSelectedTable(null);
          }

          // DARHOL AUDIT LOG'GA YOZISH!
          recordAuditLog(
            'Oshxonaga ketgan taom kamaytirildi (PIN)',
            `${selectedTable}: "${targetItem.name}" (-${removedCount} pors / -${lostSum.toLocaleString()} s) • Xodim: ${currentUser?.name || 'Ofitsiant'} • Sabab: ${reason}`
          );

          sendWaiterSecurityTelegram([
            `🚨 <b>CHEKDAGI TAOM KAMAYTIRILDI (${escapeHtml(resolvedCafeName)})</b>`,
            isPreCheckLocked ? `🔒 <b>DIQQAT:</b> Pre-chek chiqarilgan stoldan!` : null,
            `🪑 <b>Joy:</b> ${escapeHtml(selectedTable)}`,
            `🍽 <b>Taom:</b> ${escapeHtml(targetItem.name)} (-${removedCount} pors)`,
            `💰 <b>Kamaygan summa:</b> <b>-${lostSum.toLocaleString()} so'm</b>`,
            `👤 <b>Ofitsiant:</b> ${escapeHtml(currentUser?.name || 'Ofitsiant')}`,
            `📝 <b>Sababi:</b> ${escapeHtml(reason)}`,
            result?.cancelledPending > 0 ? `👨‍🍳 Oshxonaga xabar ketdi: ${result.cancelledPending} porsiya tayyorlanmaydi` : null
          ]);
        },
        'waiterReduceItem'
      );
      return;
    }

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
          return nextQty > 0
            ? { ...item, quantity: nextQty, qty: nextQty }
            : null;
        })
        .filter(Boolean)
    );
  }, [cart, currentTableOrder, selectedTable, currentUser?.name, resolvedCafeName, requestSecurityApproval, applyToCurrentOrder, recordAuditLog]);

  // 🔒 Taomni savatchadan butunlay o'chirish (`🗑`) -> Oshxona va Kassadan DARHOL o'chiradi!
  const handleRemoveFromCart = useCallback((targetIdentifier) => {
    const targetItem = cart.find((item, idx) => {
      if (!item) return false;
      return (
        item.cartItemId === targetIdentifier ||
        String(item.id) === String(targetIdentifier) ||
        item.name === targetIdentifier ||
        idx === targetIdentifier
      );
    });

    if (!targetItem) return;

    const currentQty = Number(targetItem.quantity ?? targetItem.qty ?? 1) || 1;
    const sentQty = Number(targetItem.sentQty ?? 0) || 0;
    const isPreCheckLocked = Boolean(currentTableOrder?.isPreCheckPrinted);

    if (sentQty > 0 || isPreCheckLocked) {
      const lostSum = currentQty * (Number(targetItem.price) || 0);

      requestSecurityApproval(
        `🔒 ${selectedTable}: "${targetItem.name}" (x${currentQty}) taomini o'chirish (-${lostSum.toLocaleString()} s)`,
        (reason) => {
          const lineId = String(targetItem.cartItemId || '');
          const result = sentQty > 0
            ? applyToCurrentOrder(o => reduceLine(o, lineId, 0, {
              by: currentUser?.name || 'Ofitsiant',
              reason,
              now: Date.now()
            }))
            : null;

          setCart(prev => prev.filter(item => item && item.cartItemId !== lineId));
          // Oxirgi taom ham olindi: chek "Bekor qilindi", stol bo'shaydi
          if (result?.order?.status === ORDER_STATUS.CANCELLED) {
            setCart([]);
            setSelectedTable(null);
          }

          // DARHOL AUDIT LOG'GA YOZISH!
          recordAuditLog(
            "Oshxonaga ketgan taom o'chirildi (PIN)",
            `${selectedTable}: "${targetItem.name}" (x${currentQty} / -${lostSum.toLocaleString()} s) • Xodim: ${currentUser?.name || 'Ofitsiant'} • Sabab: ${reason}`
          );

          sendWaiterSecurityTelegram([
            `🚨 <b>CHEKDAN TAOM O'CHIRILDI (${escapeHtml(resolvedCafeName)})</b>`,
            isPreCheckLocked ? `🔒 <b>DIQQAT:</b> Pre-chek chiqarilgan stoldan!` : null,
            `🪑 <b>Joy:</b> ${escapeHtml(selectedTable)}`,
            `🗑 <b>O'chirilgan taom:</b> ${escapeHtml(targetItem.name)} (x${currentQty})`,
            `💰 <b>Summa:</b> <b>-${lostSum.toLocaleString()} so'm</b>`,
            `👤 <b>Ofitsiant:</b> ${escapeHtml(currentUser?.name || 'Ofitsiant')}`,
            `📝 <b>Sababi:</b> ${escapeHtml(reason)}`,
            result?.cancelledPending > 0 ? `👨‍🍳 Oshxonaga xabar ketdi: ${result.cancelledPending} porsiya tayyorlanmaydi` : null
          ]);
        },
        'waiterReduceItem'
      );
      return;
    }

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
  }, [cart, currentTableOrder, selectedTable, currentUser?.name, resolvedCafeName, requestSecurityApproval, applyToCurrentOrder, recordAuditLog]);

  // 🔒 Stol buyurtmasini to'liq bekor qilish. Chek o'chirilmaydi: "Bekor qilindi" bo'ladi (stol bo'shaydi,
  // statistika hisoblamaydi), oshxonada turgan taomlar haqida oshxonaga xabar boradi
  const handleCancelEntireOrder = useCallback(() => {
    if (!currentTableOrder) return;
    const orderTotal = Number(currentTableOrder.finalTotal || currentTableOrder.total || 0);

    requestSecurityApproval(
      `🛑 ${selectedTable} buyurtmasini to'liq bekor qilish (-${orderTotal.toLocaleString()} s)`,
      (reason) => {
        applyToCurrentOrder(o => ({
          order: cancelWholeOrder(o, { by: currentUser?.name || 'Ofitsiant', reason, now: Date.now() })
        }));
        setCart([]);
        setSelectedTable(null);

        recordAuditLog(
          "Stol buyurtmasi to'liq bekor qilindi (PIN)",
          `${selectedTable} cheki (-${orderTotal.toLocaleString()} s) o'chirildi • Xodim: ${currentUser?.name || 'Ofitsiant'} • Sabab: ${reason}`
        );

        sendWaiterSecurityTelegram([
          `🚨 <b>STOL BUYURTMASI TO'LIQ BEKOR QILINDI (${escapeHtml(resolvedCafeName)})</b>`,
          `🪑 <b>Joy:</b> ${escapeHtml(selectedTable)}`,
          `💰 <b>Bekor bo'lgan summa:</b> <b>-${orderTotal.toLocaleString()} so'm</b>`,
          `👤 <b>Ofitsiant:</b> ${escapeHtml(currentUser?.name || 'Ofitsiant')}`,
          `📝 <b>Sababi:</b> ${escapeHtml(reason)}`
        ]);
      },
      'waiterCancelOrder'
    );
  }, [currentTableOrder, selectedTable, currentUser?.name, resolvedCafeName, requestSecurityApproval, applyToCurrentOrder, recordAuditLog]);

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
  // 6. PRE-CHEK CHIQARISH VA BUYURTMANI OSHXONAGA YUBORISH
  // =========================================================
  const handleLockAndPrintPreCheck = () => {
    if (!currentTableOrder) return;

    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const nextPreCheckCount = (Number(currentTableOrder.preCheckCount) || 0) + 1;

    const updatedLockedOrder = {
      ...currentTableOrder,
      isPreCheckPrinted: true,
      preCheckTime: nowTime,
      preCheckCount: nextPreCheckCount,
      preCheckTotalSnapshot: currentTableOrder.finalTotal || currentTableOrder.total,
      paymentMethod: 'PRE-CHEK (HISOB)'
    };

    updateOrders(prev =>
      (Array.isArray(prev) ? prev : []).map(o =>
        o && String(o.id) === String(currentTableOrder.id)
          ? {
              ...o,
              isPreCheckPrinted: true,
              preCheckTime: nowTime,
              preCheckCount: nextPreCheckCount,
              preCheckTotalSnapshot: o.finalTotal || o.total
            }
          : o
      )
    );

    recordAuditLog(
      'Ofitsiant Pre-chek chiqardi (Qulflandi)',
      `${selectedTable}: ${Number(currentTableOrder.finalTotal || currentTableOrder.total || 0).toLocaleString()} so'm (${nextPreCheckCount}-marta)`
    );

    const externalPrinter = onPrintReceipt || setReceiptToPrint;
    if (typeof externalPrinter === 'function') {
      externalPrinter({ order: updatedLockedOrder });
    } else {
      setLocalPreCheckPrintOrder(updatedLockedOrder);
    }
  };

  const handleSubmitOrder = () => {
    if (!selectedTable || !Array.isArray(cart) || cart.length === 0) return;

    // Jurnal (va Telegram) uchun: oshxonaga shu safar ketayotgan porsiyalar, masalan "2× Osh, 1× Choy"
    const newPortionsText = cart
      .map(item => {
        if (!item) return null;
        const added = (getItemQty(item) || 1) - (Number(item.sentQty) || 0);
        return added > 0 ? `${added}× ${item.name || 'Taom'}` : null;
      })
      .filter(Boolean)
      .join(', ');

    const nowMs = Date.now();
    const nowDate = new Date(nowMs).toLocaleDateString();
    const nowTime = new Date(nowMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const activeBooking = reservations?.[selectedTable];

    if (currentTableOrder) {
      // Dozakaz (B3): faqat yangi porsiyalar oshxonaga qaytadi. Chekning eng so'nggi holatiga qo'llanadi:
      // oshxona belgilari, rad etilganlar va boshqa qurilmada qo'shilgan taomlar saqlanadi (B23)
      const result = applyToCurrentOrder(o => applyWaiterCart(o, cart, nowMs));
      if (result?.blocked) {
        // Chek shu soniyada boshqa qurilmada yopilgan: savatcha yangilanadi, qayta bosilsa yangi chek ochiladi
        notify(`⚠️ ${selectedTable} cheki boshqa qurilmada yopildi. Yangi taomlarni yangi chek sifatida yuborish uchun qayta bosing.`);
        return;
      }
      const saved = result?.order || currentTableOrder;
      const totalAmount = Number(saved.total ?? saved.finalTotal ?? 0) || 0;
      const kinds = Array.isArray(saved.items) ? saved.items.length : 0;
      recordAuditLog(
        'Buyurtma yangilandi',
        `${selectedTable}: ${newPortionsText ? `dozakaz ${newPortionsText} • ` : ''}Jami ${totalAmount.toLocaleString()} so'm (${kinds} xil taom)`
      );
    } else {
      const delivery = isDeliveryTable(selectedTable) && pendingDelivery?.table === selectedTable
        ? pendingDelivery
        : null;
      if (isDeliveryTable(selectedTable) && !delivery) {
        notify("⚠️ Yetkazish ma'lumoti topilmadi. Qaytadan \"🛵 Yangi yetkazish\" tugmasini bosing.");
        return;
      }
      const kitchenLines = cart
        .filter(item => item && (getItemQty(item) || 0) > 0)
        .map(item => newKitchenLine(item, getItemQty(item) || 1, nowMs));
      // Yetkazish narxi chekda alohida qator (oshxonaga chiqmaydi)
      const orderItems = delivery && delivery.fee > 0
        ? [...kitchenLines, buildDeliveryFeeItem(delivery.fee)]
        : kitchenLines;
      const baseOrder = {
        id: newId(),
        createdAt: nowMs,
        table: selectedTable,
        waiter: currentUser?.name || 'Ofitsiant',
        date: nowDate,
        time: nowTime,
        status: ORDER_STATUS.NEW,
        items: orderItems,
        customerName: delivery ? delivery.customerName : (activeBooking?.customerName || ''),
        customerPhone: delivery ? delivery.phone : (activeBooking?.customerPhone || ''),
        depositPaid: Number(activeBooking?.depositAmount || 0),
        // Olib ketish: kunlik raqam (bir vaqtda bir nechta ochiq chek, "Olib ketish #3")
        ...(isTakeawayTable(selectedTable) ? { takeawayNo: nextTakeawayNo(safeOrders, nowMs) } : {}),
        ...(delivery ? {
          orderType: ORDER_TYPE.DELIVERY,
          delivery: {
            customerName: delivery.customerName,
            phone: delivery.phone,
            address: delivery.address,
            landmark: delivery.landmark,
            note: delivery.note,
            fee: delivery.fee,
            status: DELIVERY_STATUS.WAITING,
            courier: '',
            courierId: null
          }
        } : {})
      };
      const newOrder = { ...baseOrder, ...orderTotalsFields(baseOrder, orderItems, serviceFee) };

      // Shu orada boshqa qurilma shu stolga chek ochgan bo'lsa (masalan, QR-buyurtma qabul qilindi),
      // ikkinchi ochiq chek ochilmaydi: taomlar o'sha chekka qo'shiladi (oldin ikki chek bo'lib, biri
      // ofitsiant va kassa ekranida ko'rinmay qolardi)
      let mergedInto = null;
      updateOrders(prev => {
        const list = Array.isArray(prev) ? prev : [];
        // Yetkazish va olib ketish: har buyurtma alohida chek (stol band bo'lmaydi)
        const idx = delivery || isTakeawayTable(selectedTable)
          ? -1
          : list.findIndex(o => o && o.table === selectedTable && !CLOSED_ORDER_STATUSES.includes(o.status));
        if (idx === -1) return [newOrder, ...list];
        const merged = applyWaiterCart(list[idx], cart, nowMs).order;
        mergedInto = merged;
        const next = [...list];
        next[idx] = merged;
        return next;
      });

      if (mergedInto) {
        recordAuditLog(
          'Buyurtma yangilandi',
          `${selectedTable}: ochiq chekka qo'shildi${newPortionsText ? ` • ${newPortionsText}` : ''} • Jami ${Number(mergedInto.total || 0).toLocaleString()} so'm`
        );
      } else {
        recordAuditLog(
          delivery ? 'Yangi yetkazish buyurtmasi' : 'Yangi buyurtma ochildi',
          `${selectedTable}: ${newOrder.total.toLocaleString()} so'm (${kitchenLines.length} xil taom)${newPortionsText ? ` • ${newPortionsText}` : ''}${
            delivery ? ` • ${delivery.customerName || 'Mijoz'}, ${delivery.phone}, ${delivery.address}` : ''
          }`
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

    closeSelectedTable();
  };

  const handleMarkAsDelivered = () => {
    if (!currentTableOrder) return;
    // Yetkazish buyurtmasini kuryer o'z bo'limida "Yetkazildi" deb belgilaydi (pul usuli bilan)
    if (isDeliveryOrder(currentTableOrder)) {
      notify("🛵 Bu yetkazish buyurtmasi: uni kuryer o'z bo'limida \"Mijozga yetkazildi\" deb belgilaydi");
      return;
    }
    // Faqat tayyor porsiyalar beriladi; oshxonada qolgani bo'lsa chek oshxonada qoladi
    const result = applyToCurrentOrder(o => serveReadyLines(o, Date.now()));
    if (!result || result.served === 0) {
      notify("⚠️ Mijozga beriladigan tayyor taom yo'q");
      return;
    }
    const allDone = result.order.status === ORDER_STATUS.DELIVERED;
    recordAuditLog(
      'Mijozga yetkazildi',
      `${currentTableOrder.table || selectedTable}: ${result.served} porsiya${allDone ? '' : ' (qolgani hali oshxonada)'} • ${Number(result.order.total ?? result.order.finalTotal ?? 0).toLocaleString()} so'm`
    );
    if (allDone) {
      setSelectedTable(null);
      setCart([]);
    }
  };

  // Chaqiruv bor stollar: telefondan kelgan chaqiruv (pos_calls) va eski usuldagi hasCall belgisi.
  // Oldin faqat hasCall o'qilardi: telefondan chaqirilsa stol kartochkasida hech narsa chiqmasdi.
  const calledTables = useMemo(
    () => new Set(collectTableCalls(waiterCalls, safeOrders).map(c => c.table)),
    [waiterCalls, safeOrders]
  );

  const handleClearTableCall = (tableName) => {
    if (typeof onClearCall === 'function') {
      onClearCall(tableName); // App.jsx: pos_calls va hasCall ikkalasini o'chiradi
      return;
    }
    updateOrders(prev =>
      (Array.isArray(prev) ? prev : []).map(o =>
        o && o.table === tableName && o.hasCall ? { ...o, hasCall: false } : o
      )
    );
  };

  // =========================================================
  // 7. BRON, VIP-TAYMER, KO'CHIRISH VA BO'LISH FUNKSIYALARI
  // =========================================================
  const handleSaveReservation = (tableName, bookingData) => {
    setReservations(prev => ({ ...(prev || {}), [tableName]: bookingData }));
    recordAuditLog(
      'Stol bron qilindi',
      `${tableName}: ${bookingData.customerName} (${bookingData.time}, ${bookingData.guestsCount} kishi)`
    );
  };

  const handleCancelReservation = async (tableName) => {
    if (!await confirmAsync(`"${tableName}" uchun qilingan bronni bekor qilasizmi?`)) return;
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
    recordAuditLog(
      'VIP Taymer yoqildi',
      `${tableName}: ${config.serviceTitle} (${config.hourlyRate.toLocaleString()} s/soat)`
    );
  };

  const handlePauseResumeTableTimer = (tableName) => {
    setTableTimers(prev => {
      const current = prev?.[tableName];
      if (!current) return prev;
      if (current.isPaused) {
        return { ...prev, [tableName]: { ...current, startTimeMs: Date.now(), isPaused: false } };
      }
      const addedMs = Math.max(0, Date.now() - Number(current.startTimeMs));
      return {
        ...prev,
        [tableName]: { ...current, accruedMs: (Number(current.accruedMs) || 0) + addedMs, isPaused: true }
      };
    });
  };

  const handleCancelTableTimer = async (tableName) => {
    if (!await confirmAsync(`"${tableName}" dagi soatbay vaqt hisoblagichni bekor qilasizmi?`)) return;
    setTableTimers(prev => {
      const next = { ...(prev || {}) };
      delete next[tableName];
      return next;
    });
  };

  const handleFinishTimerAndAddToOrder = async (tableName, timerStats) => {
    if (!timerStats) return;
    const lineItemName = `${timerStats.serviceTitle} (${timerStats.durationHuman})`;
    const lineItemPrice = Number(timerStats.currentCost) || 0;

    if (
      !await confirmAsync(
        `⏱️ "${tableName}" vaqt hisobini yakunlab, chekka qo'shamizmi?\n\n• Vaqt: ${timerStats.durationHuman}\n• Summa: ${lineItemPrice.toLocaleString()} so'm`
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
      sentQty: 1,
      kitchenDoneQty: 1,
      servedQty: 1,
      noKitchen: true,
      note: `Tarif: ${timerStats.hourlyRate.toLocaleString()} s/soat`
    };

    const existingOrder = safeOrders.find(
      o => o && o.table === tableName && !CLOSED_ORDER_STATUSES.includes(o.status)
    );

    if (existingOrder) {
      updateOrders(prev =>
        (Array.isArray(prev) ? prev : []).map(o => {
          if (!o || String(o.id) !== String(existingOrder.id)) return o;
          const nextItems = [...(Array.isArray(o.items) ? o.items : []), timerLineItem];
          return { ...o, items: nextItems, ...orderTotalsFields(o, nextItems, o.serviceFee ?? serviceFee) };
        })
      );
    } else {
      const baseOrder = {
        id: newId(),
        createdAt: Date.now(),
        table: tableName,
        waiter: currentUser?.name || 'Ofitsiant',
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: ORDER_STATUS.DELIVERED,
        items: [timerLineItem]
      };
      const newOrder = { ...baseOrder, ...orderTotalsFields(baseOrder, baseOrder.items, serviceFee) };
      updateOrders(prev => [newOrder, ...(Array.isArray(prev) ? prev : [])]);
    }

    setTableTimers(prev => {
      const next = { ...(prev || {}) };
      delete next[tableName];
      return next;
    });

    recordAuditLog("VIP Vaqt chekka qo'shildi", `${tableName}: ${lineItemName} — +${lineItemPrice.toLocaleString()} so'm`);
  };

  const freeTablesForAction = useMemo(() => {
    const busySet = new Set(
      safeOrders
        .filter(o => o && !CLOSED_ORDER_STATUSES.includes(o.status))
        .map(o => o.table)
    );
    return safeTables.filter(t => t !== 'Olib ketish' && !busySet.has(t));
  }, [safeTables, safeOrders]);

  const handleConfirmTransfer = (e) => {
    e.preventDefault();
    if (!transferOrder || !targetTransferTable) return;

    // Shu orada boshqa qurilma maqsad stolga chek ochgan bo'lsa, ko'chirilmaydi (bir stolda ikki
    // ochiq chek bo'lib, biri ekranlarda ko'rinmay qolardi)
    let blocked = false;
    updateOrders(prev => {
      const list = Array.isArray(prev) ? prev : [];
      blocked = list.some(o =>
        o && o.table === targetTransferTable && !CLOSED_ORDER_STATUSES.includes(o.status) &&
        String(o.id) !== String(transferOrder.id));
      if (blocked) return prev;
      return list.map(o =>
        o && String(o.id) === String(transferOrder.id) ? { ...o, table: targetTransferTable } : o
      );
    });
    if (blocked) {
      notify(`⚠️ ${targetTransferTable} band bo'lib qoldi: boshqa stolni tanlang`);
      return;
    }
    recordAuditLog("Stol ko'chirildi", `${transferOrder.table} -> ${targetTransferTable}`);
    setTransferOrder(null);
    setTargetTransferTable('');
  };

  const handleConfirmSplit = (e) => {
    e.preventDefault();
    if (!splitOrder || !splitTargetTable) return;

    const nowMs = Date.now();
    const feePct = splitOrder.serviceFee ?? serviceFee;
    // Bo'lish chekning ENG SO'NGGI holatidan (oyna ochiq turganda oshxona taom tayyorlagan yoki
    // rad etgan bo'lishi mumkin) va qator kaliti bo'yicha (oldin ro'yxatdagi tartib raqami bo'yicha)
    let outcome = null;
    updateOrders(prev => {
      const list = Array.isArray(prev) ? prev : [];
      const idx = list.findIndex(o => o && String(o.id) === String(splitOrder.id));
      if (idx === -1 || CLOSED_ORDER_STATUSES.includes(list[idx].status)) {
        outcome = { error: "Chek topilmadi yoki yopilgan" };
        return prev;
      }
      if (list.some(o => o && o.table === splitTargetTable && !CLOSED_ORDER_STATUSES.includes(o.status))) {
        outcome = { error: `${splitTargetTable} band bo'lib qoldi: boshqa stolni tanlang` };
        return prev;
      }
      const latest = materializeOrder(list[idx]);
      const remainingItems = [];
      const movedItems = [];
      (Array.isArray(latest.items) ? latest.items : []).forEach((item, i) => {
        if (!item) return;
        const lineId = lineIdOf(item, i, latest.id);
        const totalQty = getItemQty(item) || 1;
        const moveQty = Math.min(totalQty, Math.max(0, Math.floor(Number(splitQuantities[lineId]) || 0)));
        const doneQty = doneQtyOf(item, latest);
        const servedQty = servedQtyOf(item, latest);
        // Tayyor (va berilgan) porsiyalar avval ko'chiriladigan qismga beriladi
        const movedDone = Math.min(moveQty, doneQty);
        const movedServed = Math.min(movedDone, servedQty);

        if (moveQty > 0) {
          movedItems.push({
            ...item,
            cartItemId: `${lineId}_split_${nowMs}`,
            quantity: moveQty,
            sentQty: moveQty,
            kitchenDoneQty: movedDone,
            servedQty: movedServed
          });
        }
        if (totalQty - moveQty > 0) {
          const remQ = totalQty - moveQty;
          remainingItems.push({
            ...item,
            quantity: remQ,
            sentQty: remQ,
            kitchenDoneQty: doneQty - movedDone,
            servedQty: Math.min(servedQty - movedServed, doneQty - movedDone)
          });
        }
      });

      if (movedItems.length === 0 || remainingItems.length === 0) {
        outcome = { error: "Chekni bo'lish uchun kamida 1 ta taomni yangi stolga ajrating va eski stolda ham kamida 1 ta taom qolsin!" };
        return prev;
      }

      const splitBase = {
        ...latest,
        id: newId(),
        table: splitTargetTable,
        items: movedItems,
        // Pre-chek va oshxona xabarlari eski chekka tegishli, yangi chekka o'tmaydi
        isPreCheckPrinted: false,
        preCheckCount: 0,
        preCheckTotalSnapshot: undefined,
        kitchenRejections: [],
        kitchenCancellations: []
      };
      // Status har bir chekning o'z taomlaridan (masalan, oshxonadagilari ko'chgan bo'lsa eski chek "Tayyor")
      const newSplitOrder = {
        ...splitBase,
        ...orderTotalsFields(splitBase, movedItems, feePct),
        status: deriveStatus(splitBase, movedItems)
      };
      outcome = { newSplitOrder };
      const next = [...list];
      next[idx] = {
        ...latest,
        items: remainingItems,
        ...orderTotalsFields(latest, remainingItems, feePct),
        status: deriveStatus(latest, remainingItems)
      };
      return [newSplitOrder, ...next];
    });

    if (!outcome || outcome.error) {
      notify(outcome?.error || "Chekni bo'lib bo'lmadi");
      return;
    }

    recordAuditLog("Chek bo'lindi", `${splitOrder.table} -> ${splitTargetTable} (${outcome.newSplitOrder.total.toLocaleString()} s)`);
    setSplitOrder(null);
    setSplitTargetTable('');
    setSplitQuantities({});
  };

  // =========================================================
  // 8. RENDER (UI DIZAYN)
  // =========================================================
  return (
    <div className="max-w-7xl mx-auto pb-8">
      {!selectedTable && (
        <div className="mb-4 bg-white dark:bg-gray-800 p-3 rounded-3xl shadow-xs border border-orange-100 dark:border-orange-900/50 flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            type="button"
            onClick={() => setIsDeliveryModalOpen(true)}
            className="shrink-0 px-4 py-3 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black text-sm shadow-md shadow-orange-500/25 flex items-center justify-center gap-2 transition active:scale-95"
          >
            <span>🛵</span> Yangi yetkazish
          </button>
          {openDeliveryOrders.length === 0 ? (
            <p className="text-xs font-bold text-gray-400">
              Telefon orqali buyurtma: mijoz manzilini yozing, taomlarni tanlang. Kuryer o'z bo'limida ko'radi.
            </p>
          ) : (
            <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-0.5">
              {openDeliveryOrders.map(o => {
                const st = getDeliveryStatus(o);
                const label = st === DELIVERY_STATUS.ON_WAY
                  ? "🛵 yo'lda"
                  : st === DELIVERY_STATUS.DELIVERED
                  ? '✅ yetkazildi'
                  : o.delivery?.courier
                  ? `👤 ${o.delivery.courier}`
                  : '⏳ kuryer kutmoqda';
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => handleSelectTable(o.table)}
                    className="shrink-0 text-left px-3 py-2 rounded-2xl bg-orange-50 dark:bg-gray-900 border border-orange-200 dark:border-gray-700 hover:border-orange-400 transition active:scale-95"
                  >
                    <span className="block font-black text-xs text-gray-900 dark:text-white whitespace-nowrap">
                      {o.table} • {o.status}
                    </span>
                    <span className="block text-[11px] font-bold text-gray-500 whitespace-nowrap max-w-[220px] truncate">
                      {label} • {o.delivery?.customerName || o.delivery?.phone || ''}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!selectedTable ? (
        <WaiterTableGrid
          tables={safeTables}
          orders={safeOrders}
          reservations={reservations}
          tableTimers={tableTimers}
          selectedTable={selectedTable}
          selectedOrderId={selectedOrderId}
          onSelectTable={handleSelectTable}
          calledTables={calledTables}
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
        <div className="space-y-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-xs border border-gray-100 dark:border-gray-700 flex justify-between items-center">
            <button
              type="button"
              onClick={closeSelectedTable}
              className="px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-800 dark:text-white font-black text-xs sm:text-sm flex items-center gap-2 transition active:scale-95"
            >
              <span>⬅️</span> Zaldagi stollarga qaytish
            </button>

            <div className="text-right min-w-0">
              <span className="text-xs font-bold text-gray-400 block">Tanlangan joy:</span>
              <span className={`font-black text-lg ${isDeliveryTable(selectedTable) ? 'text-orange-600 dark:text-orange-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {isDeliveryTable(selectedTable) ? '🛵' : isTakeawayTable(selectedTable) ? '🛍️' : '🪑'}{' '}
                {currentTableOrder ? orderLabel(currentTableOrder) : isTakeawayTable(selectedTable) ? `${selectedTable} • yangi chek` : selectedTable}
              </span>
            </div>
          </div>

          {selectedDeliveryInfo && (
            <div className="bg-orange-50 dark:bg-gray-800 p-3.5 rounded-2xl border border-orange-200 dark:border-orange-900/50 text-xs font-bold text-gray-700 dark:text-gray-200 flex flex-wrap gap-x-4 gap-y-1">
              <span>👤 {selectedDeliveryInfo.customerName || 'Mijoz'}</span>
              <span>📞 {selectedDeliveryInfo.phone}</span>
              <span className="break-words">📍 {selectedDeliveryInfo.address}{selectedDeliveryInfo.landmark ? ` (${selectedDeliveryInfo.landmark})` : ''}</span>
              {Number(selectedDeliveryInfo.fee) > 0 && (
                <span>🛵 Yetkazish: {Number(selectedDeliveryInfo.fee).toLocaleString()} so'm{currentTableOrder ? '' : ' (yuborilganda chekka qo\'shiladi)'}</span>
              )}
              {selectedDeliveryInfo.note && <span className="text-amber-700 dark:text-amber-300">📝 {selectedDeliveryInfo.note}</span>}
            </div>
          )}

          {/* Telefon/planshet: menyu va savatcha almashtirgichi (katta ekranda ikkalasi yonma-yon) */}
          <div className="lg:hidden grid grid-cols-2 gap-1.5 p-1.5 bg-white dark:bg-gray-800 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700">
            {[
              { id: 'menu', label: '🍽 Menyu' },
              { id: 'cart', label: '🛒 Savatcha' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => openMobilePanel(tab.id)}
                className={`py-2.5 rounded-xl font-black text-sm flex items-center justify-center gap-1.5 transition active:scale-95 ${
                  mobilePanel === tab.id
                    ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {tab.label}
                {tab.id === 'cart' && cartStats.portions > 0 && (
                  <span className={`min-w-6 px-1.5 py-0.5 rounded-full text-xs ${
                    mobilePanel === 'cart' ? 'bg-white text-amber-600' : 'bg-amber-500 text-white'
                  }`}>
                    {cartStats.portions}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Katta ekranda balandlik qat'iy (ichida scroll), telefonda sahifa o'zi aylanadi:
              aks holda savatcha butun joyni egallab, taomlar ro'yxati ko'rinmay qolardi */}
          <div className="flex flex-col gap-4 lg:flex-row lg:gap-6 lg:h-[calc(100vh-190px)] lg:min-h-[560px]">
            <div className={mobilePanel === 'menu' ? 'contents' : 'hidden lg:contents'}>
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
                getStock={getStock}
                onUpdateQuantity={handleUpdateQuantity}
              />
            </div>

            <div className={mobilePanel === 'cart' ? 'contents' : 'hidden lg:contents'}>
              <WaiterCart
                selectedTable={selectedTable}
                table={selectedTable}
                cart={cart}
                setCart={setCart}
                currentTableOrder={currentTableOrder}
                activeOrder={currentTableOrder}
                existingOrder={currentTableOrder}
                serviceFee={currentTableOrder ? (currentTableOrder.serviceFee ?? serviceFee) : serviceFee}
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
                onLockPreCheck={handleLockAndPrintPreCheck}
                onCancelEntireOrder={handleCancelEntireOrder}
                reduceNeedsPin={isPinRuleOn(pinRules, 'waiterReduceItem')}
                onBack={closeSelectedTable}
              />
            </div>
          </div>

          {/* Telefonda menyu ko'rinib turganda pastda yopishib turadigan savatcha tugmasi */}
          {mobilePanel === 'menu' && cartStats.portions > 0 && (
            <button
              type="button"
              onClick={() => openMobilePanel('cart')}
              className="lg:hidden sticky bottom-3 z-30 w-full px-4 py-3.5 rounded-2xl bg-gray-900 dark:bg-amber-500 text-white font-black text-sm shadow-2xl flex items-center justify-between gap-3 transition active:scale-[0.98]"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="px-2 py-0.5 rounded-full bg-amber-500 dark:bg-white dark:text-amber-600 text-xs shrink-0">
                  {cartStats.portions}
                </span>
                <span className="truncate">
                  {cartStats.newPortions > 0 ? `${cartStats.newPortions} ta yangi porsiya` : 'Savatcha'}
                </span>
              </span>
              <span className="shrink-0">
                {cartStats.subTotal.toLocaleString()} so'm ➜
              </span>
            </button>
          )}
        </div>
      )}

      {isDeliveryModalOpen && (
        <DeliveryOrderModal
          orders={safeOrders}
          onClose={() => setIsDeliveryModalOpen(false)}
          onSubmit={handleStartDelivery}
        />
      )}

      {twoFactorAdmin && securityPrompt && (
        <TwoFactorCodeModal
          user={twoFactorAdmin}
          title="🔒 Admin tasdig'i: 2-bosqich"
          actionLabel={securityPrompt.title}
          onVerified={(admin) => {
            setTwoFactorAdmin(null);
            finishSecurityApproval(admin);
          }}
          onCancel={() => setTwoFactorAdmin(null)}
          onAudit={(action, details) => recordAuditLog(action, details)}
        />
      )}

      {/* BARCHA MODALLAR ALOHIDA FAYLDA */}
      <WaiterActionModals
        securityPrompt={securityPrompt}
        setSecurityPrompt={setSecurityPrompt}
        pinInput={pinInput}
        setPinInput={setPinInput}
        cancelReasonInput={cancelReasonInput}
        setCancelReasonInput={setCancelReasonInput}
        pinError={pinError}
        setPinError={setPinError}
        onConfirmSecurityPin={handleConfirmSecurityPin}
        transferOrder={transferOrder}
        setTransferOrder={setTransferOrder}
        targetTransferTable={targetTransferTable}
        setTargetTransferTable={setTargetTransferTable}
        freeTablesForAction={freeTablesForAction}
        onConfirmTransfer={handleConfirmTransfer}
        splitOrder={splitOrder}
        setSplitOrder={setSplitOrder}
        splitTargetTable={splitTargetTable}
        setSplitTargetTable={setSplitTargetTable}
        splitQuantities={splitQuantities}
        setSplitQuantities={setSplitQuantities}
        onConfirmSplit={handleConfirmSplit}
        localPreCheckPrintOrder={localPreCheckPrintOrder}
        setLocalPreCheckPrintOrder={setLocalPreCheckPrintOrder}
        qrModalTable={qrModalTable}
        setQrModalTable={setQrModalTable}
        cafeName={resolvedCafeName}
        serviceFee={serviceFee}
      />
    </div>
  );
}