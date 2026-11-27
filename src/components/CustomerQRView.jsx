import React, { useState, useEffect, useMemo } from 'react';
import { CLOSED_ORDER_STATUSES, ORDER_STATUS } from '../constants/orderStatus';
import DishImage from './DishImage';
import DishGallery from './DishGallery';
import { getMenuImages, getMenuThumb, getMenuDescription } from '../utils/menuImages';

const QUICK_NOTE_TAGS = [
  'Piyozsiz',
  'Achchiq bo\'lmasin',
  'Sous alohida',
  'Muzsiz',
  'Issiqroq bo\'lsin',
  'Tuzi kamroq'
];

// Mijoz sahifasidagi chiziqli ikonkalar (faqat ko'rinish uchun)
const ICON_PATHS = {
  bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  search: ['M21 21l-4.3-4.3', 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z'],
  bag: ['M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z', 'M3 6h18', 'M16 10a4 4 0 0 1-8 0'],
  book: ['M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z', 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'],
  receipt: ['M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z', 'M8 7h8', 'M8 11h8', 'M8 15h5'],
  coffee: ['M10 2v2', 'M14 2v2', 'M6 2v2', 'M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  trash: ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  chair: ['M5 11V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7', 'M3 11h18v3H3z', 'M5 14v8', 'M19 14v8']
};

const Icon = ({ name, className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {(ICON_PATHS[name] || []).map(d => <path key={d} d={d} />)}
  </svg>
);

export default function CustomerQRView({ 
  cafeName = 'Restoran Menyusi', 
  table = '1-Stol', 
  menuItems = [], 
  menuCategories = [], 
  // orders berilsa (App yoki QR sahifa), "Buyurtmalarim" faqat shundan olinadi
  orders,
  serviceFee = 0,
  isDarkMode = false, 
  // Mijozga ogohlantirish: { tone: 'warn' | 'info', text } (masalan: band stol, joylashuv)
  notice = null,
  onSubmitOrder, 
  onCallWaiter, 
  onExitGuest 
}) {
  // ==========================================
  // 1. XAVFSIZ MA'LUMOTLARNI TAYYORLASH
  // ==========================================
  const safeMenuItems = Array.isArray(menuItems) ? menuItems : [];
  const safeOrders = Array.isArray(orders) ? orders : [];

  const categories = useMemo(() => {
    const rawCats = Array.isArray(menuCategories) && menuCategories.length > 0
      ? menuCategories
      : safeMenuItems.map(item => item?.category);
    const uniqueCats = [...new Set(rawCats.filter(Boolean))];
    return ['Barchasi', ...uniqueCats];
  }, [menuCategories, safeMenuItems]);

  // ==========================================
  // 2. STATE'LAR (Holatni boshqarish)
  // ==========================================
  const [activeTab, setActiveTab] = useState('menu'); // 'menu' | 'my_orders'
  const [activeCategory, setActiveCategory] = useState('Barchasi');
  const [searchQuery, setSearchQuery] = useState('');

  // Savatchani sahifa yangilanganda yo'qolmasligi uchun localStorage bilan bog'laymiz
  const cartStorageKey = `qr_draft_cart_${table}`;
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem(cartStorageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Modallar va Bildirishnomalar
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [selectedItemForAdd, setSelectedItemForAdd] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Taom qo'shish modalining ichki statelari
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [addQty, setAddQty] = useState(1);
  const [addNote, setAddNote] = useState('');

  // Mijoz ushbu sessiyada yuborgan buyurtmalar tarixi (agar App.jsx orders prop bermasa zaxira sifatida)
  const [localSubmittedOrders, setLocalSubmittedOrders] = useState([]);

  // Ofitsiant chaqirish Anti-Spam taymeri
  const [isWaiterCalled, setIsWaiterCalled] = useState(false);
  const [cooldownTime, setCooldownTime] = useState(0);

  // Savatchani xotirada saqlab borish
  useEffect(() => {
    try {
      localStorage.setItem(cartStorageKey, JSON.stringify(cart));
    } catch {
      // Xotira to'lgan bo'lsa xato bermasligi uchun
    }
  }, [cart, cartStorageKey]);

  // Qo'ng'iroqcha taymerini xavfsiz boshqarish (Memory Leak'siz)
  useEffect(() => {
    if (!isWaiterCalled || cooldownTime <= 0) return;

    const timer = setInterval(() => {
      setCooldownTime(prev => {
        if (prev <= 1) {
          setIsWaiterCalled(false);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isWaiterCalled, cooldownTime]);

  // ==========================================
  // 3. YORDAMCHI FUNKSIYALAR
  // ==========================================
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 3500);
  };

  const getItemVariants = (item) => {
    if (Array.isArray(item?.variants) && item.variants.length > 0) {
      return item.variants.map(v => ({
        name: v?.name || 'Standart',
        price: Number(v?.price || 0)
      }));
    }
    return [{ name: 'Standart', price: Number(item?.price || 0) }];
  };

  // Filtrlangan menyu (Faqat aktiv taomlar va qidiruvga moslari)
  const filteredItems = useMemo(() => {
    return safeMenuItems.filter(item => {
      if (!item || item.is_available === false || item.available === false) {
        return false;
      }
      if (searchQuery.trim() !== '') {
        return item.name?.toLowerCase().includes(searchQuery.trim().toLowerCase());
      }
      if (activeCategory === 'Barchasi') {
        return true;
      }
      return item.category === activeCategory;
    });
  }, [safeMenuItems, activeCategory, searchQuery]);

  // Shu stolga tegishli faol (yopilmagan) buyurtmalar.
  // orders berilgan bo'lsa FAQAT shundan: oldin chek to'langach ro'yxat bo'shab qolsa, shu sahifada
  // yuborilgan taomlarning lokal nusxasi "⏳ Oshxonada tayyorlanmoqda" (sariq) bo'lib qayta chiqardi.
  const hasParentOrders = Array.isArray(orders);
  const myActiveOrders = useMemo(() => {
    if (!hasParentOrders) return localSubmittedOrders;
    return safeOrders.filter(
      o => o && o.table === table && !CLOSED_ORDER_STATUSES.includes(o.status)
    );
  }, [hasParentOrders, safeOrders, table, localSubmittedOrders]);

  const noticeBox = notice?.text ? (
    <div
      className={`px-4 py-3 rounded-2xl border text-xs sm:text-sm font-semibold break-words ${
        notice.tone === 'warn'
          ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
          : 'bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-500/30 text-sky-800 dark:text-sky-200'
      }`}
    >
      {notice.text}
    </div>
  ) : null;

  // ==========================================
  // 4. SAVAT (CART) MANTIG'I (SMART MERGE BILAN)
  // ==========================================
  const handleOpenAddModal = (item) => {
    setSelectedItemForAdd(item);
    setSelectedVariantIdx(0);
    setAddQty(1);
    setAddNote('');
  };

  const handleCloseAddModal = () => {
    setSelectedItemForAdd(null);
    setSelectedVariantIdx(0);
    setAddQty(1);
    setAddNote('');
  };

  const handleToggleQuickNote = (tag) => {
    setAddNote(prev => {
      const current = prev.trim();
      if (current.toLowerCase().includes(tag.toLowerCase())) {
        return current
          .replace(new RegExp(`${tag},?\\s*`, 'i'), '')
          .trim();
      }
      return current ? `${current}, ${tag}` : tag;
    });
  };

  const handleAddToCart = () => {
    if (!selectedItemForAdd) return;

    const variants = getItemVariants(selectedItemForAdd);
    const chosenVariant = variants[selectedVariantIdx] || variants[0];
    const unitPrice = Number(chosenVariant?.price || 0);
    const cleanNote = addNote.trim();
    const qtyToAdd = Math.max(1, Number(addQty || 1));

    const displayName = variants.length > 1
      ? `${selectedItemForAdd.name} (${chosenVariant.name})`
      : selectedItemForAdd.name;

    // Bir xil taom, bir xil porsiya va bir xil izoh bo'lsa, ularni birlashtiramiz
    const mergeKey = `${selectedItemForAdd.id}_${chosenVariant.name}_${cleanNote.toLowerCase()}`;

    setCart(prev => {
      const existingIndex = prev.findIndex(i => i.mergeKey === mergeKey);
      if (existingIndex > -1) {
        const updated = [...prev];
        const newQuantity = Number(updated[existingIndex].quantity || 1) + qtyToAdd;
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: newQuantity,
          qty: newQuantity
        };
        return updated;
      }

      return [
        ...prev,
        {
          cartItemId: `${Date.now()}_${Math.random()}`,
          mergeKey,
          id: selectedItemForAdd.id,
          name: displayName,
          baseName: selectedItemForAdd.name,
          variantName: chosenVariant.name,
          price: unitPrice,
          quantity: qtyToAdd,
          qty: qtyToAdd,
          note: cleanNote,
          category: selectedItemForAdd.category
        }
      ];
    });

    showToast(`✅ "${displayName}" savatga qo'shildi`);
    handleCloseAddModal();
  };

  const handleUpdateCartQty = (cartItemId, delta) => {
    setCart(prev =>
      prev
        .map(item => {
          if (item.cartItemId === cartItemId) {
            const newQty = Number(item.quantity || 1) + delta;
            return newQty > 0 ? { ...item, quantity: newQty, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  const handleRemoveFromCart = (cartItemId) => {
    setCart(prev => prev.filter(item => item.cartItemId !== cartItemId));
  };

  const handleClearCart = () => {
    setCart([]);
    setIsCartModalOpen(false);
  };

  // ==========================================
  // 5. BUYURTMANI YUBORISH VA OFITSIANT CHAQIRISH
  // ==========================================
  const totalCartAmount = useMemo(() => {
    return cart.reduce(
      (sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)),
      0
    );
  }, [cart]);

  const totalCartItems = useMemo(() => {
    return cart.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  }, [cart]);

  const serviceFeePercent = Number(serviceFee || 0);
  const cartServiceFee = Math.round((totalCartAmount * serviceFeePercent) / 100);
  const cartGrandTotal = totalCartAmount + cartServiceFee;

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitOrder = async () => {
    if (cart.length === 0 || isSubmitting) return;

    let result = null;
    if (typeof onSubmitOrder === 'function') {
      // App.jsx dagi funksiya (cart) yoki (table, cart) kutishiga moslashuvchan chaqiruv.
      // Mijoz telefonidagi QR sahifada natija qaytadi: { ok, message | error }
      setIsSubmitting(true);
      try {
        result = await onSubmitOrder(cart, table);
      } finally {
        setIsSubmitting(false);
      }
    }
    if (result && result.ok === false) {
      showToast(`❌ ${result.error || "Buyurtma yuborilmadi"}`);
      return; // savat saqlanib qoladi
    }

    // Lokal buyurtmalar tarixiga ham yozib qo'yamiz
    const newSubmittedOrder = {
      id: Date.now(),
      table,
      status: ORDER_STATUS.NEW,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      items: [...cart],
      subtotal: totalCartAmount,
      total: cartGrandTotal
    };
    setLocalSubmittedOrders(prev => [newSubmittedOrder, ...prev]);

    setCart([]);
    localStorage.removeItem(cartStorageKey);
    setIsCartModalOpen(false);
    setActiveTab('my_orders');
    showToast(result?.message || "🚀 Buyurtmangiz oshxonaga yuborildi!");
  };

  const handleCallWaiterClick = async () => {
    if (isWaiterCalled) return;

    if (typeof onCallWaiter === 'function') {
      const result = await onCallWaiter(table);
      if (result && result.ok === false) {
        showToast(`❌ ${result.error || "Ofitsiantni chaqirib bo'lmadi"}`);
        return;
      }
    }

    setIsWaiterCalled(true);
    setCooldownTime(60);
    showToast("🔔 Ofitsiant chaqirildi! Tez orada stolingizga keladi.");
  };

  // ==========================================
  // 6. RENDER (UI DIZAYN)
  // ==========================================
  const activeVariants = selectedItemForAdd ? getItemVariants(selectedItemForAdd) : [];
  const currentModalUnitPrice = Number(activeVariants[selectedVariantIdx]?.price || 0);
  const currentModalTotalPrice = currentModalUnitPrice * addQty;

  return (
    <div className={`min-h-screen pb-28 font-sans antialiased transition-colors duration-300 ${isDarkMode ? 'dark bg-zinc-950 text-zinc-300' : 'bg-zinc-50 text-zinc-700'}`}>

      {/* --- QALQIB CHIQUVCHI XABARNOMA (TOAST) --- */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] w-max max-w-[92vw] bg-zinc-900/95 text-zinc-100 border border-zinc-700/60 px-5 py-3 rounded-2xl shadow-2xl shadow-black/40 backdrop-blur-md font-semibold text-xs sm:text-sm flex items-center gap-2 animate-fade-in-up">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* --- 6.1. HERO (KAFE RASMI, NOMI VA STOL) --- */}
      <section className="relative isolate overflow-hidden">
        <img
          src="/images/cafe-hero.webp"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-20 w-full h-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/80 via-black/65 via-75% to-zinc-50 dark:to-zinc-950" />

        <div className="max-w-5xl mx-auto px-5 pt-5 pb-12 sm:pb-16">
          <div className="flex justify-between items-center gap-3">
            <span className="text-xl sm:text-2xl font-bold tracking-tight text-white truncate">
              {cafeName}
            </span>

            <div className="flex items-center gap-2 shrink-0">
              {/* Ofitsiant chaqirish tugmasi (Header ichida) */}
              <button
                type="button"
                onClick={handleCallWaiterClick}
                disabled={isWaiterCalled}
                className={`px-4 py-2.5 rounded-full font-semibold text-xs sm:text-sm flex items-center gap-2 transition active:scale-95 ${
                  isWaiterCalled
                    ? 'bg-white/10 text-zinc-300 border border-white/15 backdrop-blur-md cursor-not-allowed'
                    : 'bg-brand-600 hover:bg-brand-700 text-white shadow-lg shadow-brand-900/40'
                }`}
              >
                <Icon name="bell" className="w-4 h-4" />
                <span>{isWaiterCalled ? `${cooldownTime}s` : 'Ofitsiant'}</span>
              </button>

              {typeof onExitGuest === 'function' && (
                <button
                  type="button"
                  onClick={onExitGuest}
                  className="px-4 py-2.5 rounded-full bg-white/10 hover:bg-red-500/80 border border-white/15 backdrop-blur-md text-zinc-100 font-semibold text-xs sm:text-sm transition active:scale-95"
                >
                  Chiqish
                </button>
              )}
            </div>
          </div>

          <div className="text-center pt-10 sm:pt-16 space-y-4 sm:space-y-5 animate-fade-in-up">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/15 backdrop-blur-md text-xs sm:text-sm font-semibold text-zinc-100">
              <Icon name="chair" className="w-4 h-4 text-brand-400" />
              {table}
              {serviceFeePercent > 0 && (
                <span className="text-zinc-400 font-medium">• Xizmat: {serviceFeePercent}%</span>
              )}
            </span>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-tight">
              Xush kelibsiz,
              <br />
              <span className="text-brand-500">{cafeName}</span>
            </h1>
            <p className="text-sm sm:text-lg text-zinc-300 font-light max-w-xl mx-auto px-2">
              Taomnomadan tanlang va stolingizdan turmasdan buyurtma bering.
            </p>
          </div>
        </div>
      </section>

      {/* --- MENYU VA BUYURTMALARIM TABLARI (yuqorida yopishib turadi) --- */}
      <div className="sticky top-0 z-30 bg-zinc-50/85 dark:bg-zinc-950/85 backdrop-blur-md border-b border-zinc-200/70 dark:border-zinc-800/60">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="max-w-xl mx-auto flex p-1 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setActiveTab('menu')}
              className={`flex-1 py-2.5 rounded-full font-semibold text-xs sm:text-sm transition flex items-center justify-center gap-2 ${
                activeTab === 'menu'
                  ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/30'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <Icon name="book" className="w-4 h-4" />
              <span>Taomnoma ({safeMenuItems.filter(i => i?.is_available !== false).length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('my_orders')}
              className={`flex-1 py-2.5 rounded-full font-semibold text-xs sm:text-sm transition flex items-center justify-center gap-2 ${
                activeTab === 'my_orders'
                  ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/30'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <Icon name="receipt" className="w-4 h-4" />
              <span>Buyurtmalarim</span>
              {myActiveOrders.length > 0 && (
                <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {myActiveOrders.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {noticeBox && <div className="max-w-5xl mx-auto px-4 pt-4">{noticeBox}</div>}

      {/* =======================================================
          TAB 1: TAOMNOMA (MENYU VA QIDIRUV)
          ======================================================= */}
      {activeTab === 'menu' && (
        <>
          {/* Qidiruv va Kategoriyalar */}
          <div className="max-w-5xl mx-auto px-4 pt-8">
            <div className="text-center mb-6">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                Taomnoma
              </h2>
              <div className="w-16 md:w-24 h-1 md:h-1.5 bg-brand-600 mx-auto rounded-full mt-3" />
            </div>

            <div className="relative max-w-xl mx-auto">
              <Icon name="search" className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Sevimli taomingizni qidiring..."
                className="w-full pl-12 pr-11 py-3 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-sm font-medium outline-hidden focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition"
                >
                  <Icon name="x" className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex sm:flex-wrap sm:justify-center overflow-x-auto hide-scrollbar gap-3 py-5 -mx-4 px-4">
              {categories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setActiveCategory(cat);
                    setSearchQuery('');
                  }}
                  className={`px-5 sm:px-6 py-2.5 sm:py-3 rounded-full font-semibold text-xs sm:text-sm whitespace-nowrap transition-all duration-300 active:scale-95 ${
                    activeCategory === cat && !searchQuery
                      ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/40 scale-105'
                      : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Taomlar Ro'yxati */}
          <main className="px-4 max-w-5xl mx-auto pt-2">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-zinc-500 py-20">
                <Icon name="coffee" className="w-10 h-10 mb-4 text-zinc-300 dark:text-zinc-700" />
                <p className="font-medium text-sm sm:text-base text-center">
                  {searchQuery ? `"${searchQuery}" bo'yicha taom topilmadi` : "Bu bo'limda taomlar yo'q"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
                {filteredItems.map(item => {
                  const variants = getItemVariants(item);
                  const firstPrice = Number(variants[0]?.price || 0);
                  const inCartCount = cart
                    .filter(c => c.id === item.id)
                    .reduce((sum, c) => sum + Number(c.quantity || 1), 0);

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleOpenAddModal(item)}
                      className={`group bg-white dark:bg-zinc-900 p-4 sm:p-5 rounded-3xl border cursor-pointer active:scale-[0.98] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-black/40 transition-all duration-300 flex items-center gap-4 relative ${
                        inCartCount > 0
                          ? 'border-brand-500/70 ring-1 ring-brand-500/30'
                          : 'border-zinc-200 dark:border-zinc-800/70 hover:border-zinc-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      {inCartCount > 0 && (
                        <span className="absolute -top-2.5 right-5 bg-brand-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-lg shadow-brand-900/40">
                          Savatda: {inCartCount} ta
                        </span>
                      )}

                      <DishImage
                        src={getMenuThumb(item)}
                        alt={item.name}
                        className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-2xl object-cover bg-zinc-100 dark:bg-zinc-800"
                        fallback={
                          <div className="w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br from-brand-500/20 to-brand-700/5 border border-brand-500/20 flex items-center justify-center text-2xl font-extrabold text-brand-600 dark:text-brand-500">
                            {String(item.name || '?').trim().charAt(0).toUpperCase()}
                          </div>
                        }
                      />

                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base sm:text-lg leading-snug">
                          {item.name}
                        </h3>
                        {getMenuDescription(item) && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                            {getMenuDescription(item)}
                          </p>
                        )}
                        <p className="text-xs font-medium text-zinc-500 mt-0.5">
                          {variants.length > 1
                            ? `${variants.map(v => v.name).join(' / ')}`
                            : variants[0]?.name}
                        </p>
                        <p className="font-bold text-brand-600 dark:text-brand-500 text-base sm:text-lg mt-1.5">
                          {firstPrice.toLocaleString()} so'm
                        </p>
                      </div>

                      <button
                        type="button"
                        className="w-11 h-11 shrink-0 bg-brand-600 group-hover:bg-brand-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-brand-900/30 transition"
                      >
                        <Icon name="plus" className="w-5 h-5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </>
      )}

      {/* =======================================================
          TAB 2: MENING BUYURTMALARIM (LIVE ORDER TRACKER)
          ======================================================= */}
      {activeTab === 'my_orders' && (
        <main className="px-4 py-8 max-w-3xl mx-auto space-y-4">
          {myActiveOrders.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 rounded-3xl p-10 text-center border border-zinc-200 dark:border-zinc-800/70">
              <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-zinc-100 dark:bg-zinc-950 border-2 border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-brand-500">
                <Icon name="receipt" className="w-8 h-8" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100">
                Hozircha faol buyurtmangiz yo'q
              </h3>
              <p className="text-xs sm:text-sm text-zinc-500 mt-1.5 mb-6">
                Taomnomadan o'zingizga yoqqan taomlarni tanlab buyurtma bering
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('menu')}
                className="bg-brand-600 hover:bg-brand-700 text-white px-7 py-3 rounded-full font-semibold text-sm shadow-lg shadow-brand-900/40 transition active:scale-95"
              >
                Taomnomaga o'tish
              </button>
            </div>
          ) : (
            <>
              {myActiveOrders.map((ord, idx) => {
                const ordItems = Array.isArray(ord.items) ? ord.items : [];
                const ordSubtotal = ordItems.reduce(
                  (s, it) => s + (Number(it.price || 0) * Number(it.quantity || it.qty || 1)),
                  0
                );
                const ordService = Math.round((ordSubtotal * serviceFeePercent) / 100);
                const ordTotal = ordSubtotal + ordService;

                return (
                  <div
                    key={ord.id || idx}
                    className="bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-6 border border-zinc-200 dark:border-zinc-800/70 space-y-4 animate-fade-in-up"
                  >
                    <div className="flex flex-wrap justify-between items-start gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4">
                      <div>
                        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                          Buyurtma #{String(ord.id).slice(-4)}
                        </span>
                        <h4 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">
                          {ord.table || table} {ord.time ? `• ${ord.time}` : ''}
                        </h4>
                      </div>

                      <span className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${
                        ord.status === 'rejected'
                          ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                          : ord.status === 'pending'
                          ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                          : ord.status === ORDER_STATUS.READY
                          ? 'bg-emerald-500 text-white animate-pulse'
                          : ord.status === ORDER_STATUS.DELIVERED
                          ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                      }`}>
                        {ord.status === 'pending'
                          ? '⏳ Ofitsiant tasdiqlashini kutmoqda'
                          : ord.status === 'rejected'
                          ? '❌ Rad etildi'
                          : ord.status === 'accepted'
                          ? '✅ Qabul qilindi, tayyorlanmoqda'
                          : ord.status === ORDER_STATUS.READY
                          ? '🥘 Tayyor!'
                          : ord.status === ORDER_STATUS.DELIVERED
                          ? '✅ Yetkazildi'
                          : '⏳ Oshxonada tayyorlanmoqda'}
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {ordItems.map((it, i) => (
                        <div key={i} className="flex justify-between items-start gap-3 text-sm">
                          <div>
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                              {it.name}
                            </span>
                            <span className="text-xs font-bold text-brand-600 dark:text-brand-500 ml-2">
                              x{it.quantity || it.qty || 1}
                            </span>
                            {it.note && (
                              <p className="text-[11px] font-medium text-sky-600 dark:text-sky-400 mt-0.5">
                                💬 {it.note}
                              </p>
                            )}
                          </div>
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                            {(Number(it.price || 0) * Number(it.quantity || it.qty || 1)).toLocaleString()} s
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3 space-y-1 text-xs font-medium">
                      {serviceFeePercent > 0 && (
                        <div className="flex justify-between text-zinc-500">
                          <span>Xizmat ko'rsatish ({serviceFeePercent}%):</span>
                          <span>{ordService.toLocaleString()} so'm</span>
                        </div>
                      )}
                      <div className="flex justify-between text-base font-bold text-zinc-900 dark:text-zinc-100 pt-1">
                        <span>Jami hisob:</span>
                        <span className="text-brand-600 dark:text-brand-500">{ordTotal.toLocaleString()} so'm</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => setActiveTab('menu')}
                className="w-full py-4 rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm shadow-lg shadow-brand-900/40 transition active:scale-95"
              >
                + Yana qo'shimcha buyurtma berish
              </button>
            </>
          )}
        </main>
      )}

      {/* --- SUZUVCHI OFITSIANT CHAQIRISH TUGMASI (FAB) --- */}
      <button
        type="button"
        onClick={handleCallWaiterClick}
        disabled={isWaiterCalled}
        title="Ofitsiantni chaqirish"
        className={`fixed bottom-[95px] right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition z-30 flex-col ${
          isWaiterCalled
            ? 'bg-zinc-300 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 cursor-not-allowed'
            : 'bg-brand-600 hover:bg-brand-700 text-white shadow-brand-900/50 ring-4 ring-brand-500/15 active:scale-90'
        }`}
      >
        <Icon name="bell" className="w-6 h-6" />
        {isWaiterCalled && (
          <span className="text-[9px] font-bold">{cooldownTime}s</span>
        )}
      </button>

      {/* --- PASTKI SAVATCHA BAR --- */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 w-full p-3.5 sm:p-4 z-40 bg-gradient-to-t from-zinc-50 via-zinc-50/90 to-transparent dark:from-zinc-950 dark:via-zinc-950/90">
          <div className="max-w-3xl mx-auto">
            <button
              type="button"
              onClick={() => setIsCartModalOpen(true)}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white py-4 rounded-full font-semibold text-base sm:text-lg shadow-xl shadow-brand-900/40 transition active:scale-95 flex justify-between items-center px-6"
            >
              <div className="flex items-center gap-2.5">
                <Icon name="bag" className="w-5 h-5" />
                <span>Savatchani ko'rish</span>
                <span className="bg-white/20 text-white px-2.5 py-0.5 rounded-full text-xs sm:text-sm font-bold">
                  {totalCartItems} ta
                </span>
              </div>
              <span className="font-bold">{totalCartAmount.toLocaleString()} so'm</span>
            </button>
          </div>
        </div>
      )}

      {/* =======================================================
          MODAL 1: TAOM QO'SHISH, PORSIYA VA IZOH TANLASH
          ======================================================= */}
      {selectedItemForAdd && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4 animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="sm:hidden w-10 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto -mt-2" />

            <DishGallery images={getMenuImages(selectedItemForAdd)} alt={selectedItemForAdd.name} />

            <div className="flex justify-between items-start gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4">
              <div className="min-w-0">
                <h3 className="font-bold text-xl sm:text-2xl tracking-tight text-zinc-900 dark:text-zinc-100">
                  {selectedItemForAdd.name}
                </h3>
                <p className="font-bold text-brand-600 dark:text-brand-500 text-lg sm:text-xl mt-1">
                  {currentModalUnitPrice.toLocaleString()} so'm
                </p>
                {getMenuDescription(selectedItemForAdd) && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mt-2">
                    {getMenuDescription(selectedItemForAdd)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleCloseAddModal}
                className="w-10 h-10 shrink-0 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full flex items-center justify-center text-zinc-500 dark:text-zinc-400 active:scale-90 transition"
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>

            {/* Porsiya (Variant) tanlash */}
            {activeVariants.length > 1 && (
              <div>
                <label className="block text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wider">
                  Porsiyani tanlang:
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {activeVariants.map((variant, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedVariantIdx(idx)}
                      className={`p-3 rounded-2xl border-2 text-left transition active:scale-95 ${
                        selectedVariantIdx === idx
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400'
                          : 'border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600'
                      }`}
                    >
                      <div className="font-bold text-sm">{variant.name}</div>
                      <div className="text-xs font-medium opacity-80 mt-0.5">
                        {variant.price.toLocaleString()} so'm
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Miqdor tanlash (Sintaksis xato tuzatildi: addQty - 1) */}
            <div className="flex justify-center items-center gap-6 py-1">
              <button
                type="button"
                onClick={() => setAddQty(Math.max(1, addQty - 1))}
                className="w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300 active:scale-90 transition"
              >
                <Icon name="minus" className="w-6 h-6" />
              </button>

              <span className="text-4xl font-extrabold text-zinc-900 dark:text-zinc-100 w-12 text-center tabular-nums">
                {addQty}
              </span>

              <button
                type="button"
                onClick={() => setAddQty(addQty + 1)}
                className="w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-700 flex items-center justify-center text-white shadow-lg shadow-brand-900/30 active:scale-90 transition"
              >
                <Icon name="plus" className="w-6 h-6" />
              </button>
            </div>

            {/* Tezkor izoh chiplari + Maxsus izoh */}
            <div className="space-y-2.5">
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Oshpazga izoh (Ixtiyoriy)
              </label>

              <div className="flex flex-wrap gap-1.5">
                {QUICK_NOTE_TAGS.map(tag => {
                  const isSelected = addNote.toLowerCase().includes(tag.toLowerCase());
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleToggleQuickNote(tag)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                        isSelected
                          ? 'bg-brand-600 border-brand-600 text-white'
                          : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-500'
                      }`}
                    >
                      {isSelected ? `✓ ${tag}` : `+ ${tag}`}
                    </button>
                  );
                })}
              </div>

              <input
                type="text"
                value={addNote}
                onChange={e => setAddNote(e.target.value)}
                placeholder="Yoki o'zingiz izoh yozing..."
                className="w-full px-4 py-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 outline-hidden focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 text-sm font-medium transition"
              />
            </div>

            <button
              type="button"
              onClick={handleAddToCart}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white py-4 rounded-full font-semibold text-base sm:text-lg shadow-lg shadow-brand-900/40 active:scale-95 transition flex justify-between items-center px-6"
            >
              <span>Savatga qo'shish</span>
              <span className="font-bold">{currentModalTotalPrice.toLocaleString()} so'm</span>
            </button>

          </div>
        </div>
      )}

      {/* =======================================================
          MODAL 2: SAVATNI KO'RISH VA BUYURTMANI TASDIQLASH
          ======================================================= */}
      {isCartModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4 animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">

            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-500 flex items-center justify-center">
                  <Icon name="bag" className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg sm:text-xl tracking-tight text-zinc-900 dark:text-zinc-100">
                    Sizning Savatingiz
                  </h3>
                  <p className="text-xs font-medium text-zinc-500">{table}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClearCart}
                  className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 px-3.5 py-2 rounded-full transition"
                >
                  Tozalash
                </button>
                <button
                  type="button"
                  onClick={() => setIsCartModalOpen(false)}
                  className="w-9 h-9 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full flex items-center justify-center text-zinc-500 dark:text-zinc-400 active:scale-90 transition"
                >
                  <Icon name="x" className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar">
              {cart.map(item => (
                <div
                  key={item.cartItemId}
                  className="bg-zinc-50 dark:bg-zinc-950/60 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="pr-3">
                      <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base leading-tight">
                        {item.name}
                      </h4>
                      {/* Sintaksis xato tuzatildi: item.price * item.quantity */}
                      <p className="text-sm font-bold text-brand-600 dark:text-brand-500 mt-1">
                        {(Number(item.price || 0) * Number(item.quantity || 1)).toLocaleString()} so'm
                      </p>
                      {item.note && (
                        <p className="text-xs font-medium text-sky-700 dark:text-sky-300 mt-1.5 bg-sky-50 dark:bg-sky-500/10 px-2.5 py-1 rounded-full inline-block">
                          💬 {item.note}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveFromCart(item.cartItemId)}
                      className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition"
                    >
                      <Icon name="trash" className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-3 bg-white dark:bg-zinc-900 p-1 rounded-full w-max border border-zinc-200 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => handleUpdateCartQty(item.cartItemId, -1)}
                      className="w-9 h-9 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 rounded-full text-zinc-600 dark:text-zinc-300 active:scale-90 transition"
                    >
                      <Icon name="minus" className="w-4 h-4" />
                    </button>

                    <span className="w-7 text-center font-bold text-zinc-900 dark:text-zinc-100 text-base tabular-nums">
                      {item.quantity}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleUpdateCartQty(item.cartItemId, 1)}
                      className="w-9 h-9 flex items-center justify-center bg-brand-600 text-white rounded-full active:scale-90 transition"
                    >
                      <Icon name="plus" className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 rounded-b-3xl shrink-0 space-y-4">
              <div className="space-y-1.5 text-xs font-medium">
                <div className="flex justify-between text-zinc-500">
                  <span>Taomlar summasi:</span>
                  <span>{totalCartAmount.toLocaleString()} so'm</span>
                </div>
                {serviceFeePercent > 0 && (
                  <div className="flex justify-between text-zinc-500">
                    <span>Xizmat ko'rsatish ({serviceFeePercent}%):</span>
                    <span>{cartServiceFee.toLocaleString()} so'm</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  <span className="font-bold text-zinc-700 dark:text-zinc-300 text-base uppercase tracking-wide">
                    Jami:
                  </span>
                  <span className="text-2xl font-extrabold text-brand-600 dark:text-brand-500">
                    {cartGrandTotal.toLocaleString()} so'm
                  </span>
                </div>
              </div>

              {noticeBox}

              <button
                type="button"
                onClick={handleSubmitOrder}
                disabled={isSubmitting}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white py-4 rounded-full font-bold text-base sm:text-lg shadow-lg shadow-brand-900/40 active:scale-95 transition"
              >
                {isSubmitting ? 'YUBORILMOQDA...' : 'BUYURTMANI TASDIQLASH 🚀'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
