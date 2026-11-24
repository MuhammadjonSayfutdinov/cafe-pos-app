import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import useSticky from '../hooks/useSticky';
import WaiterTableGrid from './WaiterTableGrid';
import WaiterMenu from './WaiterMenu';
import WaiterCart from './WaiterCart';
import WaiterActionModals from './WaiterActionModals';
import DeliveryOrderModal from './DeliveryOrderModal';
import { markUnsavedWork } from '../pwa/update';
import { orderTotalsFields, getItemQty, getItemPrice } from '../utils/orderTotals';
import { getPinLockRemainingMs, registerPinFailure, resetPinGuard } from '../utils/pinGuard';
import {
  CLOSED_ORDER_STATUSES,
  DELIVERY_STATUS,
  KITCHEN_ORDER_STATUSES,
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
  addAuditLog
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
  const [stickyOverrideEnabled] = useSticky('pos_override_enabled', true);
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
  const [pinInput, setPinInput] = useState('');
  const [cancelReasonInput, setCancelReasonInput] = useState('Mijoz rad etdi');
  const [pinError, setPinError] = useState('');

  const prevReadyCountRef = useRef(0);

  useEffect(() => {
    const readyOrCalledCount = safeOrders.filter(
      o => o && (o.status === ORDER_STATUS.READY || o.hasCall)
    ).length;

    if (readyOrCalledCount > prevReadyCountRef.current) {
      playWaiterBeep();
    }
    prevReadyCountRef.current = readyOrCalledCount;
  }, [safeOrders]);

  const currentTableOrder = useMemo(() => {
    if (!selectedTable) return null;
    return (
      safeOrders.find(
        o =>
          o &&
          o.table === selectedTable &&
          !CLOSED_ORDER_STATUSES.includes(o.status)
      ) || null
    );
  }, [safeOrders, selectedTable]);

  // =========================================================
  // 3. 🔥 OSHXONA VA KASSANI JONLI YANGILOVCHI FUNKSIYA (BUG FIX!)
  // =========================================================
  const syncOrderInDatabase = useCallback((nextCartItems) => {
    if (!currentTableOrder) return;

    // AGAR CHEKDAGI BARCHA TAOMLAR O'CHIRILGAN BO'LSA -> BUYURTMANI OSHXONA VA KASSADAN HAM O'CHIRAMIZ!
    if (!Array.isArray(nextCartItems) || nextCartItems.length === 0) {
      updateOrders(prev =>
        (Array.isArray(prev) ? prev : []).filter(
          o => o && String(o.id) !== String(currentTableOrder.id)
        )
      );
      setCart([]);
      setSelectedTable(null);
      return;
    }

    // Agar chekda taomlar qolgan bo'lsa -> Oshxona va Kassadagi buyurtmani darhol yangilaymiz!
    updateOrders(prev =>
      (Array.isArray(prev) ? prev : []).map(o =>
        o && String(o.id) === String(currentTableOrder.id)
          ? {
              ...o,
              items: nextCartItems,
              ...orderTotalsFields(o, nextCartItems, o.serviceFee ?? serviceFee)
            }
          : o
      )
    );
  }, [currentTableOrder, serviceFee, updateOrders]);

  // =========================================================
  // 4. 🔒 ADMIN PIN TEKSHIRUV MOTORI
  // =========================================================
  const requestSecurityApproval = useCallback((actionTitle, onApprovedCallback) => {
    if (stickyOverrideEnabled === false) {
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
  }, [stickyOverrideEnabled]);

  const handleConfirmSecurityPin = (e) => {
    e.preventDefault();
    if (!securityPrompt) return;

    const cleanPin = pinInput.trim();
    const lockLeftMs = getPinLockRemainingMs('waiter_override');
    if (lockLeftMs > 0) {
      setPinError(`⛔️ Bloklangan: ${Math.ceil(lockLeftMs / 1000)} soniya kuting.`);
      return;
    }
    const adminUsers = (Array.isArray(stickyUsers) ? stickyUsers : []).filter(
      u => u && String(u.role || '').toLowerCase() === 'admin'
    );

    const matchedAdmin = cleanPin
      ? adminUsers.find(u => String(u.pin || u.password || '') === cleanPin)
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
  const handleSelectTable = (tableName) => {
    setSelectedTable(tableName);
    setSelectedCategory('Barchasi');
    setSearchQuery('');
    setMobilePanel('menu');

    const existing = safeOrders.find(
      o =>
        o &&
        o.table === tableName &&
        !CLOSED_ORDER_STATUSES.includes(o.status)
    );

    if (existing && Array.isArray(existing.items)) {
      setCart(
        existing.items.map((item, idx) => {
          const currentQ = Number(item.quantity ?? item.qty ?? 1) || 1;
          return {
            ...item,
            cartItemId: item.cartItemId || `${item.id || idx}_${idx}`,
            quantity: currentQ,
            qty: currentQ,
            sentQty: Number(item.sentQty ?? currentQ) || currentQ,
            price: Number(item.price ?? item.variants?.[0]?.price ?? 0) || 0
          };
        })
      );
    } else {
      setCart([]);
    }
  };

  // Stol ekranidan chiqish (yetkazish uchun kiritilgan, lekin yuborilmagan ma'lumot ham tozalanadi)
  const closeSelectedTable = () => {
    setSelectedTable(null);
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
          ...dishItem,
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
          const updatedCart = cart
            .map((item, idx) => {
              if (!item) return null;
              const isMatch =
                item.cartItemId === targetIdentifier ||
                String(item.id) === String(targetIdentifier) ||
                item.name === targetIdentifier ||
                idx === targetIdentifier;
              if (!isMatch) return item;

              return nextQty > 0
                ? {
                    ...item,
                    quantity: nextQty,
                    qty: nextQty,
                    sentQty: Math.min(sentQty, nextQty)
                  }
                : null;
            })
            .filter(Boolean);

          setCart(updatedCart);
          // DARHOL OSHXONA VA KASSANI YANGILASH!
          syncOrderInDatabase(updatedCart);

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
            `📝 <b>Sababi:</b> ${escapeHtml(reason)}`
          ]);
        }
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
  }, [cart, currentTableOrder, selectedTable, currentUser?.name, resolvedCafeName, requestSecurityApproval, syncOrderInDatabase, recordAuditLog]);

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
          const updatedCart = cart.filter((item, idx) => {
            if (!item) return false;
            const isMatch =
              item.cartItemId === targetIdentifier ||
              String(item.id) === String(targetIdentifier) ||
              item.name === targetIdentifier ||
              idx === targetIdentifier;
            return !isMatch;
          });

          setCart(updatedCart);
          // DARHOL OSHXONA VA KASSADAN O'CHIRISH!
          syncOrderInDatabase(updatedCart);

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
            `📝 <b>Sababi:</b> ${escapeHtml(reason)}`
          ]);
        }
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
  }, [cart, currentTableOrder, selectedTable, currentUser?.name, resolvedCafeName, requestSecurityApproval, syncOrderInDatabase, recordAuditLog]);

  // 🔒 Stol buyurtmasini to'liq bekor qilish (Oshxona va Kassadan butunlay o'chirish)
  const handleCancelEntireOrder = useCallback(() => {
    if (!currentTableOrder) return;
    const orderTotal = Number(currentTableOrder.finalTotal || currentTableOrder.total || 0);

    requestSecurityApproval(
      `🛑 ${selectedTable} buyurtmasini to'liq bekor qilish va o'chirish (-${orderTotal.toLocaleString()} s)`,
      (reason) => {
        syncOrderInDatabase([]);

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
      }
    );
  }, [currentTableOrder, selectedTable, currentUser?.name, resolvedCafeName, requestSecurityApproval, syncOrderInDatabase, recordAuditLog]);

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

    // Oshxonaga yangi porsiya ketyaptimi? (sentQty - avval yuborilgan miqdor)
    const hasNewPortions = cart.some(
      item => item && (getItemQty(item) || 1) > (Number(item.sentQty) || 0)
    );

    // Buyurtma oshxonadan o'tib bo'lgan bo'lsa, avval yuborilgan porsiyalar tayyor hisoblanadi
    // (kitchenDoneQty maydoni yo'q eski buyurtmalar uchun)
    const orderPastKitchen = Boolean(
      currentTableOrder && !KITCHEN_ORDER_STATUSES.includes(currentTableOrder.status)
    );

    const normalizedCart = cart.map((item, idx) => {
      const qty = getItemQty(item) || 1;
      const prevDone = item.kitchenDoneQty !== undefined
        ? Number(item.kitchenDoneQty) || 0
        : (orderPastKitchen ? Number(item.sentQty) || 0 : 0);
      return {
        ...item,
        cartItemId: item.cartItemId || `ci_${item.id || idx}_${Date.now()}`,
        price: getItemPrice(item),
        quantity: qty,
        sentQty: qty,
        kitchenDoneQty: Math.min(qty, prevDone)
      };
    });

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
      const feePct = currentTableOrder.serviceFee ?? serviceFee;
      const totalAmount = orderTotalsFields(currentTableOrder, normalizedCart, feePct).total;

      updateOrders(prev =>
        (Array.isArray(prev) ? prev : []).map(o => {
          if (!o || String(o.id) !== String(currentTableOrder.id)) return o;
          // Dozakaz (B3): butun buyurtma emas, faqat yangi porsiyalar oshxonaga qaytadi.
          // Faqat izoh/miqdor kamaygan bo'lsa status o'zgarmaydi.
          const isPastKitchen = !KITCHEN_ORDER_STATUSES.includes(o.status);
          const backToKitchen = hasNewPortions && isPastKitchen;
          return {
            ...o,
            items: normalizedCart,
            ...orderTotalsFields(o, normalizedCart, feePct),
            status: backToKitchen ? ORDER_STATUS.NEW : o.status,
            kitchenRoundAt: backToKitchen ? nowMs : o.kitchenRoundAt
          };
        })
      );
      recordAuditLog(
        'Buyurtma yangilandi',
        `${selectedTable}: ${newPortionsText ? `dozakaz ${newPortionsText} • ` : ''}Jami ${totalAmount.toLocaleString()} so'm (${normalizedCart.length} xil taom)`
      );
    } else {
      const delivery = isDeliveryTable(selectedTable) && pendingDelivery?.table === selectedTable
        ? pendingDelivery
        : null;
      if (isDeliveryTable(selectedTable) && !delivery) {
        notify("⚠️ Yetkazish ma'lumoti topilmadi. Qaytadan \"🛵 Yangi yetkazish\" tugmasini bosing.");
        return;
      }
      // Yetkazish narxi chekda alohida qator (oshxonaga chiqmaydi)
      const orderItems = delivery && delivery.fee > 0
        ? [...normalizedCart, buildDeliveryFeeItem(delivery.fee)]
        : normalizedCart;
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
      const totalAmount = newOrder.total;

      updateOrders(prev => [newOrder, ...(Array.isArray(prev) ? prev : [])]);
      recordAuditLog(
        delivery ? 'Yangi yetkazish buyurtmasi' : 'Yangi buyurtma ochildi',
        `${selectedTable}: ${totalAmount.toLocaleString()} so'm (${normalizedCart.length} xil taom)${newPortionsText ? ` • ${newPortionsText}` : ''}${
          delivery ? ` • ${delivery.customerName || 'Mijoz'}, ${delivery.phone}, ${delivery.address}` : ''
        }`
      );
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
    updateOrders(prev =>
      (Array.isArray(prev) ? prev : []).map(o =>
        o && String(o.id) === String(currentTableOrder.id)
          ? { ...o, status: ORDER_STATUS.DELIVERED }
          : o
      )
    );
    recordAuditLog(
      'Mijozga yetkazildi',
      `${currentTableOrder.table || selectedTable}: ${Number(currentTableOrder.total ?? currentTableOrder.finalTotal ?? 0).toLocaleString()} so'm`
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
      qty: 1,
      sentQty: 1,
      kitchenDoneQty: 1,
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

    updateOrders(prev =>
      (Array.isArray(prev) ? prev : []).map(o =>
        o && String(o.id) === String(transferOrder.id) ? { ...o, table: targetTransferTable } : o
      )
    );
    recordAuditLog("Stol ko'chirildi", `${transferOrder.table} -> ${targetTransferTable}`);
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
      const totalQty = getItemQty(item) || 1;
      const moveQty = Math.min(totalQty, Math.max(0, Math.floor(Number(splitQuantities[idx]) || 0)));
      const doneQty = Math.min(totalQty, Number(item.kitchenDoneQty) || 0);
      // Tayyor porsiyalar avval ko'chiriladigan qismga beriladi
      const movedDone = Math.min(moveQty, doneQty);

      if (moveQty > 0) {
        movedItems.push({
          ...item,
          cartItemId: `${item.cartItemId || item.id || idx}_split_${Date.now()}`,
          quantity: moveQty,
          qty: moveQty,
          sentQty: moveQty,
          kitchenDoneQty: movedDone
        });
      }
      if (totalQty - moveQty > 0) {
        const remQ = totalQty - moveQty;
        remainingItems.push({ ...item, quantity: remQ, qty: remQ, sentQty: remQ, kitchenDoneQty: doneQty - movedDone });
      }
    });

    if (movedItems.length === 0 || remainingItems.length === 0) {
      notify("Chekni bo'lish uchun kamida 1 ta taomni yangi stolga ajrating va eski stolda ham kamida 1 ta taom qolsin!");
      return;
    }

    const feePct = splitOrder.serviceFee ?? serviceFee;
    const splitBase = {
      ...splitOrder,
      id: newId(),
      table: splitTargetTable,
      items: movedItems,
      // Pre-chek eski chekka tegishli, yangi chekka o'tmaydi
      isPreCheckPrinted: false,
      preCheckCount: 0,
      preCheckTotalSnapshot: undefined
    };
    const newSplitOrder = { ...splitBase, ...orderTotalsFields(splitBase, movedItems, feePct) };

    updateOrders(prev => [
      newSplitOrder,
      ...(Array.isArray(prev) ? prev : []).map(o =>
        o && String(o.id) === String(splitOrder.id)
          ? { ...o, items: remainingItems, ...orderTotalsFields(o, remainingItems, feePct) }
          : o
      )
    ]);

    recordAuditLog("Chek bo'lindi", `${splitOrder.table} -> ${splitTargetTable} (${newSplitOrder.total.toLocaleString()} s)`);
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
                {isDeliveryTable(selectedTable) ? '🛵' : '🪑'} {selectedTable}
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
                onLockPreCheck={handleLockAndPrintPreCheck}
                onCancelEntireOrder={handleCancelEntireOrder}
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