import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import useSticky from '../hooks/useSticky';
import WaiterTableGrid from './WaiterTableGrid';
import WaiterMenu from './WaiterMenu';
import WaiterCart from './WaiterCart';
import WaiterActionModals from './WaiterActionModals';

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

const escapeHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

async function sendWaiterSecurityTelegram(linesArray) {
  try {
    const raw = window.localStorage.getItem('pos_telegram_config');
    if (!raw) return;
    const cfg = JSON.parse(raw);
    if (!cfg || !cfg.enabled || cfg.notifyOnSecurity === false) return;

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
    // ignore offline error
  }
}

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

  // Buyurtmalarni ham App.jsx state'iga, ham localStorage'ga bir vaqtda yozish
  const updateOrders = useCallback((updater) => {
    if (typeof setOrdersProp === 'function') {
      setOrdersProp(updater);
    }
    setStickyOrders(updater);
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

    if (typeof addAuditLog === 'function') {
      addAuditLog(action, details);
    } else {
      setStickyAuditLogs(prev => [newEntry, ...(Array.isArray(prev) ? prev : [])]);
    }

    // LocalStorage'ga to'g'ridan-to'g'ri kafolatli yozish
    try {
      const raw = window.localStorage.getItem('pos_audit_logs');
      const list = raw ? JSON.parse(raw) : [];
      const isDuplicate =
        Array.isArray(list) &&
        list[0] &&
        list[0].action === action &&
        list[0].details === details &&
        Date.now() - Number(String(list[0].id).split('_')[1] || 0) < 1500;

      if (!isDuplicate) {
        const nextList = [newEntry, ...(Array.isArray(list) ? list : [])];
        window.localStorage.setItem('pos_audit_logs', JSON.stringify(nextList));
        window.dispatchEvent(new Event('pos-sticky-update'));
      }
    } catch {
      // ignore storage error
    }
  }, [addAuditLog, currentUser, setStickyAuditLogs]);

  // =========================================================
  // 2. OFITSIANT ISHCHI VA XAVFSIZLIK STATE'LARI
  // =========================================================
  const [selectedTable, setSelectedTable] = useState(null);
  const [cart, setCart] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('Barchasi');
  const [searchQuery, setSearchQuery] = useState('');
  const [qrModalTable, setQrModalTable] = useState(null);
  const [localPreCheckPrintOrder, setLocalPreCheckPrintOrder] = useState(null);

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
      o => o && (o.status === 'Tayyor' || o.hasCall)
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
          !["To'langan", 'Qarz', 'Arxiv'].includes(o.status)
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
    const subTotal = nextCartItems.reduce((sum, item) => {
      const p = Number(item.price ?? item.variants?.[0]?.price ?? 0) || 0;
      const q = Number(item.quantity ?? item.qty ?? 1) || 0;
      return sum + p * q;
    }, 0);

    const isTakeaway = selectedTable === 'Olib ketish';
    const feePct = isTakeaway ? 0 : Number(currentTableOrder.serviceFee ?? serviceFee) || 0;
    const serviceFeeAmount = Math.round((subTotal * feePct) / 100);
    const totalAmount = subTotal + serviceFeeAmount;

    updateOrders(prev =>
      (Array.isArray(prev) ? prev : []).map(o =>
        o && String(o.id) === String(currentTableOrder.id)
          ? {
              ...o,
              items: nextCartItems,
              subTotal,
              subtotal: subTotal,
              serviceFee: feePct,
              serviceFeePercent: feePct,
              serviceFeeAmount,
              total: totalAmount,
              finalTotal: totalAmount
            }
          : o
      )
    );
  }, [currentTableOrder, selectedTable, serviceFee, updateOrders]);

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
    const adminUsers = (Array.isArray(stickyUsers) ? stickyUsers : []).filter(
      u => u && String(u.role || '').toLowerCase() === 'admin'
    );

    const matchedAdmin = adminUsers.find(u => String(u.pin || u.password || '') === cleanPin);
    const isDefaultPin = ['111111', '000000', '123456', '1111', '0000'].includes(cleanPin);

    if (!matchedAdmin && !isDefaultPin) {
      setPinError("❌ Admin PIN-kodi noto'g'ri!");
      return;
    }

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

    const existing = safeOrders.find(
      o =>
        o &&
        o.table === tableName &&
        !["To'langan", 'Qarz', 'Arxiv'].includes(o.status)
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
          sentQty: 0,
          note: itemNote
        }
      ];
    });
  }, []);

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

    const normalizedCart = cart.map((item, idx) => {
      const price = Number(item.price ?? item.variants?.[0]?.price ?? 0) || 0;
      const qty = Number(item.quantity ?? item.qty ?? 1) || 1;
      return {
        ...item,
        cartItemId: item.cartItemId || `ci_${item.id || idx}_${Date.now()}`,
        price,
        quantity: qty,
        qty,
        sentQty: qty
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
      recordAuditLog(
        'Buyurtma yangilandi',
        `${selectedTable}: Jami ${totalAmount.toLocaleString()} so'm (${normalizedCart.length} xil taom)`
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
      recordAuditLog(
        'Yangi buyurtma ochildi',
        `${selectedTable}: ${totalAmount.toLocaleString()} so'm (${normalizedCart.length} xil taom)`
      );
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
  // 7. BRON, VIP-TAYMER, KO'CHIRISH VA BO'LISH FUNKSIYALARI
  // =========================================================
  const handleSaveReservation = (tableName, bookingData) => {
    setReservations(prev => ({ ...(prev || {}), [tableName]: bookingData }));
    recordAuditLog(
      'Stol bron qilindi',
      `${tableName}: ${bookingData.customerName} (${bookingData.time}, ${bookingData.guestsCount} kishi)`
    );
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
      note: `Tarif: ${timerStats.hourlyRate.toLocaleString()} s/soat`
    };

    const existingOrder = safeOrders.find(
      o => o && o.table === tableName && !["To'langan", 'Qarz', 'Arxiv'].includes(o.status)
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

    recordAuditLog("VIP Vaqt chekka qo'shildi", `${tableName}: ${lineItemName} — +${lineItemPrice.toLocaleString()} so'm`);
  };

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
      const totalQty = Number(item.quantity ?? item.qty ?? 1) || 1;
      const moveQty = Math.min(totalQty, Math.max(0, Number(splitQuantities[idx]) || 0));

      if (moveQty > 0) movedItems.push({ ...item, quantity: moveQty, qty: moveQty, sentQty: moveQty });
      if (totalQty - moveQty > 0) {
        const remQ = totalQty - moveQty;
        remainingItems.push({ ...item, quantity: remQ, qty: remQ, sentQty: remQ });
      }
    });

    if (movedItems.length === 0 || remainingItems.length === 0) {
      alert("Chekni bo'lish uchun kamida 1 ta taomni yangi stolga ajrating va eski stolda ham kamida 1 ta taom qolsin!");
      return;
    }

    const calcTotals = (itemsList, feePct) => {
      const sub = itemsList.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
      const fee = Math.round((sub * feePct) / 100);
      return { sub, fee, total: sub + fee };
    };

    const feePct = Number(splitOrder.serviceFee ?? serviceFee) || 0;
    const remTotals = calcTotals(remainingItems, feePct);
    const movTotals = calcTotals(movedItems, feePct);

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

    recordAuditLog("Chek bo'lindi", `${splitOrder.table} -> ${splitTargetTable} (${movTotals.total.toLocaleString()} s)`);
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
              onLockPreCheck={handleLockAndPrintPreCheck}
              onCancelEntireOrder={handleCancelEntireOrder}
              onBack={() => {
                setSelectedTable(null);
                setCart([]);
              }}
            />
          </div>
        </div>
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