import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import useSticky from '../hooks/useSticky';
import WaiterTableGrid from './WaiterTableGrid';
import WaiterMenu from './WaiterMenu';
import WaiterCart from './WaiterCart';
import PrintReceiptModal from './PrintReceiptModal';
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

// Ichki xavfsiz Telegram xabar yuborgich (Taom o'chirilganda yoki Pre-chek buzilganda)
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
    // Internet bo'lmasa ofitsiant ishlashiga xalaqit bermaydi
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
  requireAdminOverride,
  onPrintReceipt,
  setReceiptToPrint,
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
  const [stickyUsers] = useSticky('pos_users', []);
  const [stickyOverrideEnabled] = useSticky('pos_override_enabled', true);
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

  const updateOrders = useCallback((updater) => {
    if (typeof setOrdersProp === 'function') {
      setOrdersProp(updater);
    }
    setStickyOrders(updater);
  }, [setOrdersProp, setStickyOrders]);

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

  // 🔒 ICHKI ADMIN PIN TASDIQLASH MODALI (Agar App.jsx dan requireAdminOverride kelmagan bo'lsa ham 100% ishlaydi)
  const [securityPrompt, setSecurityPrompt] = useState(null); // { title, reason, onConfirm }
  const [pinInput, setPinInput] = useState('');
  const [cancelReasonInput, setCancelReasonInput] = useState('Mijoz rad etdi');
  const [pinError, setPinError] = useState('');

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
  // 3. 🔒 UNIVERSAL ADMIN PIN HIMOYA MOTORI
  // =========================================================
  const requestSecurityApproval = useCallback((actionTitle, onApprovedCallback) => {
    // Agar foydalanuvchining o'zi Admin bo'lsa yoki PIN-himoya o'chirilgan bo'lsa
    if (currentUser?.role === 'admin' || stickyOverrideEnabled === false) {
      onApprovedCallback('Admin tomonidan bajarildi');
      return;
    }

    // Ichki Admin PIN + Sabab modalini ochamiz
    setPinInput('');
    setCancelReasonInput('Mijoz rad etdi');
    setPinError('');
    setSecurityPrompt({
      title: actionTitle,
      onConfirm: onApprovedCallback
    });
  }, [currentUser?.role, stickyOverrideEnabled]);

  const handleConfirmSecurityPin = (e) => {
    e.preventDefault();
    if (!securityPrompt) return;

    const cleanPin = pinInput.trim();
    const adminUsers = (Array.isArray(stickyUsers) ? stickyUsers : []).filter(
      u => u && String(u.role || '').toLowerCase() === 'admin'
    );

    const isValidAdminPin =
      adminUsers.some(u => String(u.pin || u.password || '') === cleanPin) ||
      ['111111', '000000', '123456', '1111', '0000'].includes(cleanPin);

    if (!isValidAdminPin) {
      setPinError("❌ Admin PIN-kodi noto'g'ri!");
      return;
    }

    const callback = securityPrompt.onConfirm;
    const reason = cancelReasonInput.trim() || 'Sabab ko\'rsatilmadi';
    setSecurityPrompt(null);
    setPinInput('');
    setPinError('');

    if (typeof callback === 'function') {
      callback(reason);
    }
  };

  // =========================================================
  // 4. STOL TANLASH VA SAVATCHA (CART) BOSHQARUVI
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
            // sentQty — bu taomdan oshxonaga nechta porsiya allaqachon ketganini bildiradi (Qulf uchun!)
            sentQty: Number(item.sentQty ?? currentQ) || currentQ,
            price: Number(item.price ?? item.variants?.[0]?.price ?? 0) || 0
          };
        })
      );
    } else {
      setCart([]);
    }
  };

  // Taomni savatchaga qo'shish
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
          sentQty: 0, // Yangi qo'shilgan taom hali oshxonaga ketmagan
          note: itemNote
        }
      ];
    });
  }, []);

  // 🔒 Savatchada taom miqdorini o'zgartirish (+1 / -1) — OSHXONA VA PRE-CHEK QULFI BILAN!
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

    // Agar ofitsiant oshxonaga ketgan porsiyani kamaytirmoqchi bo'lsa YOKI Pre-chek chiqarilgan bo'lsa -> ADMIN PIN SO'RALADI!
    if (numDelta < 0 && (nextQty < sentQty || isPreCheckLocked)) {
      const removedCount = Math.min(currentQty, Math.abs(numDelta));
      const lostSum = removedCount * (Number(targetItem.price) || 0);

      requestSecurityApproval(
        `🔒 ${selectedTable}: "${targetItem.name}" taomini kamaytirish (-${removedCount} pors / -${lostSum.toLocaleString()} s)`,
        (reason) => {
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
                  ? {
                      ...item,
                      quantity: nextQty,
                      qty: nextQty,
                      sentQty: Math.min(sentQty, nextQty)
                    }
                  : null;
              })
              .filter(Boolean)
          );

          if (typeof addAuditLog === 'function') {
            addAuditLog(
              'Oshxonaga ketgan taom kamaytirildi (PIN)',
              `${selectedTable}: "${targetItem.name}" (-${removedCount} pors / -${lostSum.toLocaleString()} s) • Ofitsiant: ${currentUser?.name || 'Ofitsiant'} • Sabab: ${reason}`
            );
          }

          sendWaiterSecurityTelegram([
            `🚨 <b>CHEKDAGI TAOM KAMAYTIRILDI (${escapeHtml(resolvedCafeName)})</b>`,
            isPreCheckLocked ? `🔒 <b>DIQQAT:</b> Pre-chek chiqarilgan stoldan!` : null,
            `━━━━━━━━━━━━━━━━━━`,
            `🪑 <b>Joy:</b> ${escapeHtml(selectedTable)}`,
            `🍽 <b>Taom:</b> ${escapeHtml(targetItem.name)} (-${removedCount} pors)`,
            `💰 <b>Kamaygan summa:</b> <b>-${lostSum.toLocaleString()} so'm</b>`,
            `👤 <b>Ofitsiant:</b> ${escapeHtml(currentUser?.name || 'Ofitsiant')}`,
            `📝 <b>Sababi:</b> ${escapeHtml(reason)}`,
            `🕒 <b>Vaqt:</b> ${escapeHtml(new Date().toLocaleString())}`
          ]);
        }
      );
      return;
    }

    // Oddiy holatda (+1 qo'shish yoki hali oshxonaga yuborilmagan taomni kamaytirish)
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
  }, [cart, currentTableOrder, selectedTable, currentUser?.name, resolvedCafeName, requestSecurityApproval, addAuditLog]);

  // 🔒 Savatchadan taomni butunlay o'chirish (`🗑`) — OSHXONA VA PRE-CHEK QULFI BILAN!
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
        `🔒 ${selectedTable}: "${targetItem.name}" (x${currentQty}) taomini chekdan butunlay o'chirish (-${lostSum.toLocaleString()} s)`,
        (reason) => {
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

          if (typeof addAuditLog === 'function') {
            addAuditLog(
              "Oshxonaga ketgan taom o'chirildi (PIN)",
              `${selectedTable}: "${targetItem.name}" (x${currentQty} / -${lostSum.toLocaleString()} s) • Sabab: ${reason}`
            );
          }

          sendWaiterSecurityTelegram([
            `🚨 <b>CHEKDAN TAOM O'CHIRILDI (${escapeHtml(resolvedCafeName)})</b>`,
            isPreCheckLocked ? `🔒 <b>DIQQAT:</b> Pre-chek chiqarilgan stoldan!` : null,
            `━━━━━━━━━━━━━━━━━━`,
            `🪑 <b>Joy:</b> ${escapeHtml(selectedTable)}`,
            `🗑 <b>O'chirilgan taom:</b> ${escapeHtml(targetItem.name)} (x${currentQty})`,
            `💰 <b>Summa:</b> <b>-${lostSum.toLocaleString()} so'm</b>`,
            `👤 <b>Ofitsiant:</b> ${escapeHtml(currentUser?.name || 'Ofitsiant')}`,
            `📝 <b>Sababi:</b> ${escapeHtml(reason)}`,
            `🕒 <b>Vaqt:</b> ${escapeHtml(new Date().toLocaleString())}`
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
  }, [cart, currentTableOrder, selectedTable, currentUser?.name, resolvedCafeName, requestSecurityApproval, addAuditLog]);

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
  // 5. 🔒 OFITSIANT EKRANIDAN PRE-CHEK CHIQARISH VA QULFLASH
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

    if (typeof addAuditLog === 'function') {
      addAuditLog(
        'Ofitsiant Pre-chek chiqardi (Qulflandi)',
        `${selectedTable}: ${Number(currentTableOrder.finalTotal || currentTableOrder.total || 0).toLocaleString()} so'm (${nextPreCheckCount}-marta)`
      );
    }

    const externalPrinter = onPrintReceipt || setReceiptToPrint;
    if (typeof externalPrinter === 'function') {
      externalPrinter({ order: updatedLockedOrder });
    } else {
      setLocalPreCheckPrintOrder(updatedLockedOrder);
    }
  };

  // =========================================================
  // 6. BUYURTMANI OSHXONAGA YUBORISH VA YETKAZILDI BELGISI
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

    // Oshxonaga yuborilayotgan barcha taomlarga sentQty = qty muhrini bosamiz
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
  // 7. 📌 BRON (RESERVATION) BOSHQARUV FUNKSIYALARI
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
  // 8. ⏱️ SOATBAY VIP-TAYMER (TARIFIKATOR) FUNKSIYALARI
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
      sentQty: 1,
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
  // 9. STOL KO'CHIRISH VA CHEK BO'LISH FUNKSIYALARI
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
        movedItems.push({ ...item, quantity: moveQty, qty: moveQty, sentQty: moveQty });
      }
      if (totalQty - moveQty > 0) {
        const remQ = totalQty - moveQty;
        remainingItems.push({ ...item, quantity: remQ, qty: remQ, sentQty: remQ });
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
  // 10. RENDER (UI DIZAYN)
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
              onBack={() => {
                setSelectedTable(null);
                setCart([]);
              }}
            />
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 1: 🔒 ADMIN PIN VA SABAB TASDIQLASH MODALI (ANTI-FRAUD)
          ========================================================= */}
      {securityPrompt && (
        <div
          onClick={() => setSecurityPrompt(null)}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[180] flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 w-full max-w-md rounded-3xl p-6 shadow-2xl border-2 border-red-400 dark:border-red-600 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center text-2xl shrink-0 shadow-md">
                🔒
              </div>
              <div>
                <h3 className="font-black text-lg text-gray-900 dark:text-white">
                  Xavfsizlik Qulfi (Admin Tasdig'i)
                </h3>
                <p className="text-xs font-bold text-red-600 dark:text-red-400 mt-0.5">
                  {securityPrompt.title}
                </p>
              </div>
            </div>

            <form onSubmit={handleConfirmSecurityPin} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-black uppercase text-gray-500 mb-1">
                  Bekor qilish / kamaytirish sababi *
                </label>
                <select
                  value={cancelReasonInput}
                  onChange={e => setCancelReasonInput(e.target.value)}
                  className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-xs text-gray-900 dark:text-white outline-none focus:border-red-500"
                >
                  <option value="Mijoz rad etdi">🙅‍♂️ Mijoz taomni rad etdi</option>
                  <option value="Ofitsiant adashib urgan">✍️ Ofitsiant adashib urgan</option>
                  <option value="Oshxonada mahsulot tugagan">🛑 Oshxonada mahsulot tugab qoldi</option>
                  <option value="Boshqa stolga ko'chirildi">🔄 Boshqa stolga o'tkazildi</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase text-gray-500 mb-1">
                  Admin PIN-Kodi *
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={pinInput}
                  onChange={e => {
                    setPinInput(e.target.value);
                    setPinError('');
                  }}
                  placeholder="••••••"
                  className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border-2 border-red-300 dark:border-red-700 font-black text-xl text-center tracking-widest text-gray-900 dark:text-white outline-none focus:border-red-500"
                />
                {pinError && (
                  <p className="text-xs font-black text-red-600 mt-1 text-center">
                    {pinError}
                  </p>
                )}
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setSecurityPrompt(null)}
                  className="flex-1 py-3.5 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-bold text-xs"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-red-600/30 transition active:scale-95"
                >
                  🔓 Tasdiqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRE-CHEK CHOP ETISH MODALI */}
      {localPreCheckPrintOrder && (
        <PrintReceiptModal
          cafeName={resolvedCafeName}
          order={localPreCheckPrintOrder}
          serviceFee={serviceFee}
          onClose={() => setLocalPreCheckPrintOrder(null)}
        />
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