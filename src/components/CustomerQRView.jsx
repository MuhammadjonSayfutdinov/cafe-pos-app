import React, { useState, useEffect, useMemo } from 'react';

const QUICK_NOTE_TAGS = [
  'Piyozsiz',
  'Achchiq bo\'lmasin',
  'Sous alohida',
  'Muzsiz',
  'Issiqroq bo\'lsin',
  'Tuzi kamroq'
];

export default function CustomerQRView({ 
  cafeName = 'Restoran Menyusi', 
  table = '1-Stol', 
  menuItems = [], 
  menuCategories = [], 
  orders = [],
  serviceFee = 0,
  isDarkMode = false, 
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

  // Shu stolga tegishli faol buyurtmalar (App.jsx orders'dan yoki lokal tarixdan)
  const myActiveOrders = useMemo(() => {
    const globalTableOrders = safeOrders.filter(
      o => o && o.table === table && o.status !== "To'langan" && o.status !== 'Qarz'
    );
    return globalTableOrders.length > 0 ? globalTableOrders : localSubmittedOrders;
  }, [safeOrders, table, localSubmittedOrders]);

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

  const handleSubmitOrder = () => {
    if (cart.length === 0) return;

    if (typeof onSubmitOrder === 'function') {
      // App.jsx dagi funksiya (cart) yoki (table, cart) kutishiga moslashuvchan chaqiruv
      onSubmitOrder(cart, table);
    }

    // Lokal buyurtmalar tarixiga ham yozib qo'yamiz
    const newSubmittedOrder = {
      id: Date.now(),
      table,
      status: 'Yangi',
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
    showToast("🚀 Buyurtmangiz oshxonaga yuborildi!");
  };

  const handleCallWaiterClick = () => {
    if (isWaiterCalled) return;

    if (typeof onCallWaiter === 'function') {
      onCallWaiter(table);
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
    <div className={`min-h-screen pb-28 font-sans transition-colors duration-300 ${isDarkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      
      {/* --- QALQIB CHIQUVCHI XABARNOMA (TOAST) --- */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-gray-900/95 dark:bg-white/95 text-white dark:text-gray-900 px-5 py-3 rounded-2xl shadow-2xl font-black text-xs sm:text-sm flex items-center gap-2 animate-bounce">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* --- 6.1. HEADER (YUQORI PANEL) --- */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md shadow-sm px-4 py-3.5 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-5xl mx-auto flex justify-between items-center gap-2">
          <div>
            <h1 className="text-lg sm:text-xl font-black text-amber-600 dark:text-amber-500 leading-tight">
              {cafeName}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-black bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
                🪑 {table}
              </span>
              {serviceFeePercent > 0 && (
                <span className="text-[11px] font-bold text-gray-400">
                  • Xizmat: {serviceFeePercent}%
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Ofitsiant chaqirish tugmasi (Header ichida) */}
            <button
              type="button"
              onClick={handleCallWaiterClick}
              disabled={isWaiterCalled}
              className={`px-3.5 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center gap-1.5 transition active:scale-95 ${
                isWaiterCalled
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/30'
              }`}
            >
              <span className={isWaiterCalled ? '' : 'animate-bounce'}>🔔</span>
              <span>{isWaiterCalled ? `${cooldownTime}s` : 'Ofitsiant'}</span>
            </button>

            {typeof onExitGuest === 'function' && (
              <button 
                type="button"
                onClick={onExitGuest}
                className="bg-gray-100 dark:bg-gray-700 hover:bg-red-100 hover:text-red-500 text-gray-600 dark:text-gray-300 font-black px-3.5 py-2.5 rounded-xl text-xs sm:text-sm transition active:scale-95"
              >
                Chiqish
              </button>
            )}
          </div>
        </div>

        {/* --- MENYU VA BUYURTMALARIM TABLARI --- */}
        <div className="max-w-5xl mx-auto mt-3 flex bg-gray-100 dark:bg-gray-900/60 p-1 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('menu')}
            className={`flex-1 py-2 rounded-xl font-black text-xs sm:text-sm transition ${
              activeTab === 'menu'
                ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            📖 Taomnoma ({safeMenuItems.filter(i => i?.is_available !== false).length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('my_orders')}
            className={`flex-1 py-2 rounded-xl font-black text-xs sm:text-sm transition flex items-center justify-center gap-1.5 ${
              activeTab === 'my_orders'
                ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <span>🧾 Buyurtmalarim</span>
            {myActiveOrders.length > 0 && (
              <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                {myActiveOrders.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* =======================================================
          TAB 1: TAOMNOMA (MENYU VA QIDIRUV)
          ======================================================= */}
      {activeTab === 'menu' && (
        <>
          {/* Qidiruv va Kategoriyalar */}
          <div className="bg-white dark:bg-gray-800 shadow-sm mb-4 border-b border-gray-100 dark:border-gray-700">
            <div className="max-w-5xl mx-auto px-4 pt-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="🔍 Sevimli taomingizni qidiring..."
                  className="w-full pl-4 pr-10 py-2.5 rounded-2xl bg-gray-100 dark:bg-gray-700/70 text-gray-900 dark:text-white text-sm font-bold outline-none focus:ring-2 focus:ring-amber-500 transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 font-black"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="max-w-5xl mx-auto flex overflow-x-auto hide-scrollbar p-3 px-4 gap-2">
              {categories.map(cat => (
                <button 
                  key={cat} 
                  type="button"
                  onClick={() => {
                    setActiveCategory(cat);
                    setSearchQuery('');
                  }}
                  className={`px-5 py-2.5 rounded-full font-black text-xs sm:text-sm whitespace-nowrap transition active:scale-95 ${
                    activeCategory === cat && !searchQuery
                      ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30' 
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Taomlar Ro'yxati */}
          <main className="px-4 max-w-5xl mx-auto">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-gray-400 py-20">
                <span className="text-6xl mb-4">🍽️</span>
                <p className="font-bold text-base sm:text-lg">
                  {searchQuery ? `"${searchQuery}" bo'yicha taom topilmadi` : "Bu bo'limda taomlar yo'q"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 sm:gap-4">
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
                      className={`bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm border-2 cursor-pointer active:scale-[0.98] transition flex justify-between items-center relative ${
                        inCartCount > 0
                          ? 'border-amber-400 dark:border-amber-500/70'
                          : 'border-gray-100 dark:border-gray-700'
                      }`}
                    >
                      {inCartCount > 0 && (
                        <span className="absolute -top-2.5 right-4 bg-amber-500 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full shadow">
                          Savatda: {inCartCount} ta
                        </span>
                      )}

                      <div className="pr-3">
                        <h3 className="font-black text-gray-900 dark:text-white text-base sm:text-lg leading-tight mb-1">
                          {item.name}
                        </h3>
                        <p className="text-xs font-bold text-gray-400">
                          {variants.length > 1 
                            ? `${variants.map(v => v.name).join(' / ')}` 
                            : variants[0]?.name}
                        </p>
                        <p className="font-black text-amber-600 dark:text-amber-500 text-base sm:text-lg mt-2">
                          {firstPrice.toLocaleString()} so'm
                        </p>
                      </div>
                      
                      <button 
                        type="button"
                        className="w-12 h-12 shrink-0 bg-amber-50 dark:bg-gray-700 hover:bg-amber-500 hover:text-white rounded-2xl flex items-center justify-center text-amber-600 dark:text-amber-400 text-2xl font-black shadow-sm transition"
                      >
                        +
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
        <main className="px-4 py-6 max-w-3xl mx-auto space-y-4">
          {myActiveOrders.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-10 text-center border border-gray-100 dark:border-gray-700">
              <span className="text-6xl block mb-4">🧾</span>
              <h3 className="text-lg font-black text-gray-900 dark:text-white">
                Hozircha faol buyurtmangiz yo'q
              </h3>
              <p className="text-xs sm:text-sm font-bold text-gray-400 mt-1 mb-6">
                Taomnomadan o'zingizga yoqqan taomlarni tanlab buyurtma bering
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('menu')}
                className="bg-amber-500 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-lg shadow-amber-500/30"
              >
                📖 Taomnomaga o'tish
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
                    className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4"
                  >
                    <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-3">
                      <div>
                        <span className="text-xs font-bold text-gray-400 uppercase">
                          Buyurtma #{String(ord.id).slice(-4)}
                        </span>
                        <h4 className="font-black text-gray-900 dark:text-white text-base">
                          {ord.table || table} {ord.time ? `• ${ord.time}` : ''}
                        </h4>
                      </div>

                      <span className={`px-3.5 py-1.5 rounded-full text-xs font-black uppercase ${
                        ord.status === 'Tayyor'
                          ? 'bg-emerald-500 text-white animate-pulse'
                          : ord.status === 'Yetkazildi'
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      }`}>
                        {ord.status === 'Tayyor' 
                          ? '🥘 Tayyor!' 
                          : ord.status === 'Yetkazildi' 
                          ? '✅ Yetkazildi' 
                          : '⏳ Oshxonada tayyorlanmoqda'}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {ordItems.map((it, i) => (
                        <div key={i} className="flex justify-between items-start text-sm">
                          <div>
                            <span className="font-bold text-gray-800 dark:text-gray-200">
                              {it.name}
                            </span>
                            <span className="text-xs font-black text-amber-600 ml-2">
                              x{it.quantity || it.qty || 1}
                            </span>
                            {it.note && (
                              <p className="text-[11px] font-bold text-indigo-500">
                                💬 {it.note}
                              </p>
                            )}
                          </div>
                          <span className="font-black text-gray-900 dark:text-white">
                            {(Number(it.price || 0) * Number(it.quantity || it.qty || 1)).toLocaleString()} s
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-gray-100 dark:border-gray-700 pt-3 space-y-1 text-xs font-bold">
                      {serviceFeePercent > 0 && (
                        <div className="flex justify-between text-gray-400">
                          <span>Xizmat ko'rsatish ({serviceFeePercent}%):</span>
                          <span>{ordService.toLocaleString()} so'm</span>
                        </div>
                      )}
                      <div className="flex justify-between text-base font-black text-emerald-600 dark:text-emerald-400 pt-1">
                        <span>Jami hisob:</span>
                        <span>{ordTotal.toLocaleString()} so'm</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => setActiveTab('menu')}
                className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-indigo-600/30 transition active:scale-95"
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
            ? 'bg-gray-400 text-white cursor-not-allowed'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/40 active:scale-90'
        }`}
      >
        <span className="text-xl">🔔</span>
        {isWaiterCalled && (
          <span className="text-[9px] font-black">{cooldownTime}s</span>
        )}
      </button>

      {/* --- PASTKI SAVATCHA BAR --- */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 w-full bg-white/95 dark:bg-gray-800/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.08)] p-3.5 sm:p-4 z-40 border-t border-gray-100 dark:border-gray-700">
          <div className="max-w-3xl mx-auto">
            <button 
              type="button"
              onClick={() => setIsCartModalOpen(true)}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-2xl font-black text-base sm:text-lg shadow-lg shadow-emerald-500/30 transition active:scale-95 flex justify-between items-center px-5"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">🛒</span>
                <span>Savatchani ko'rish</span>
                <span className="bg-white text-emerald-600 px-2.5 py-0.5 rounded-full text-xs sm:text-sm font-black">
                  {totalCartItems} ta
                </span>
              </div>
              <span>{totalCartAmount.toLocaleString()} so'm</span>
            </button>
          </div>
        </div>
      )}

      {/* =======================================================
          MODAL 1: TAOM QO'SHISH, PORSIYA VA IZOH TANLASH
          ======================================================= */}
      {selectedItemForAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-700 pb-4">
              <div>
                <h3 className="font-black text-xl sm:text-2xl text-gray-900 dark:text-white">
                  {selectedItemForAdd.name}
                </h3>
                <p className="font-black text-amber-600 dark:text-amber-500 text-lg sm:text-xl mt-1">
                  {currentModalUnitPrice.toLocaleString()} so'm
                </p>
              </div>
              <button 
                type="button"
                onClick={handleCloseAddModal} 
                className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-500 font-black text-xl active:scale-90 transition"
              >
                ✕
              </button>
            </div>

            {/* Porsiya (Variant) tanlash */}
            {activeVariants.length > 1 && (
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
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
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                          : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <div className="font-black text-sm">{variant.name}</div>
                      <div className="text-xs font-bold opacity-80 mt-0.5">
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
                className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-3xl font-black text-gray-600 dark:text-gray-300 active:scale-90 transition"
              >
                -
              </button>
              
              <span className="text-4xl font-black text-gray-900 dark:text-white w-12 text-center">
                {addQty}
              </span>
              
              <button 
                type="button"
                onClick={() => setAddQty(addQty + 1)}
                className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-3xl font-black text-amber-600 active:scale-90 transition"
              >
                +
              </button>
            </div>

            {/* Tezkor izoh chiplari + Maxsus izoh */}
            <div className="space-y-2.5">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
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
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                        isSelected
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
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
                className="w-full p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 outline-none focus:border-amber-500 text-gray-900 dark:text-white text-sm font-bold"
              />
            </div>

            <button 
              type="button"
              onClick={handleAddToCart}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-amber-500/30 active:scale-95 transition flex justify-between items-center px-6"
            >
              <span>Savatga qo'shish</span>
              <span>{currentModalTotalPrice.toLocaleString()} so'm</span>
            </button>
            
          </div>
        </div>
      )}

      {/* =======================================================
          MODAL 2: SAVATNI KO'RISH VA BUYURTMANI TASDIQLASH
          ======================================================= */}
      {isCartModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
            
            <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-black text-xl text-gray-900 dark:text-white">
                  🛒 Sizning Savatingiz
                </h3>
                <p className="text-xs font-bold text-gray-400">{table}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClearCart}
                  className="text-xs font-black text-red-500 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded-xl"
                >
                  Tozalash
                </button>
                <button 
                  type="button"
                  onClick={() => setIsCartModalOpen(false)} 
                  className="w-9 h-9 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-500 font-black text-lg active:scale-90 transition"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar">
              {cart.map(item => (
                <div 
                  key={item.cartItemId} 
                  className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-600"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="pr-3">
                      <h4 className="font-bold text-gray-900 dark:text-white text-base leading-tight">
                        {item.name}
                      </h4>
                      {/* Sintaksis xato tuzatildi: item.price * item.quantity */}
                      <p className="text-sm font-black text-amber-600 dark:text-amber-400 mt-1">
                        {(Number(item.price || 0) * Number(item.quantity || 1)).toLocaleString()} so'm
                      </p>
                      {item.note && (
                        <p className="text-xs font-bold text-indigo-500 mt-1.5 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-lg inline-block">
                          💬 {item.note}
                        </p>
                      )}
                    </div>
                    
                    <button 
                      type="button"
                      onClick={() => handleRemoveFromCart(item.cartItemId)}
                      className="text-red-400 hover:text-red-600 font-black text-lg p-1"
                    >
                      🗑
                    </button>
                  </div>

                  <div className="flex items-center gap-3 bg-white dark:bg-gray-800 p-1.5 rounded-xl w-max shadow-sm border border-gray-200 dark:border-gray-700">
                    <button 
                      type="button"
                      onClick={() => handleUpdateCartQty(item.cartItemId, -1)}
                      className="w-9 h-9 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg font-black text-gray-600 dark:text-gray-300 active:scale-90 transition"
                    >
                      -
                    </button>
                    
                    <span className="w-7 text-center font-black text-gray-900 dark:text-white text-base">
                      {item.quantity}
                    </span>
                    
                    <button 
                      type="button"
                      onClick={() => handleUpdateCartQty(item.cartItemId, 1)}
                      className="w-9 h-9 flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-lg font-black active:scale-90 transition"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-5 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-3xl shrink-0 space-y-4">
              <div className="space-y-1.5 text-xs font-bold">
                <div className="flex justify-between text-gray-500">
                  <span>Taomlar summasi:</span>
                  <span>{totalCartAmount.toLocaleString()} so'm</span>
                </div>
                {serviceFeePercent > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Xizmat ko'rsatish ({serviceFeePercent}%):</span>
                    <span>{cartServiceFee.toLocaleString()} so'm</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span className="font-black text-gray-700 dark:text-gray-300 text-base uppercase">
                    Jami:
                  </span>
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {cartGrandTotal.toLocaleString()} so'm
                  </span>
                </div>
              </div>

              <button 
                type="button"
                onClick={handleSubmitOrder}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-emerald-500/30 active:scale-95 transition"
              >
                BUYURTMANI TASDIQLASH 🚀
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}