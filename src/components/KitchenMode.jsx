import React, { useState, useMemo } from 'react';
import useSticky from '../hooks/useSticky';

export default function KitchenMode({ 
  orders = [], 
  setOrders,
  onUpdateStatus, 
  menuItems, 
  setMenuItems,
  menuCategories,
  onToggleItemAvailability,
  currentUser,
  addAuditLog
}) {
  // ==========================================
  // 1. STATE'LAR VA ZAXIRA XOTIRA (FALLBACK SYNC)
  // ==========================================
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'stoplist'
  const [selectedStopCategory, setSelectedStopCategory] = useState('Barchasi');
  const [stopListFilter, setStopListFilter] = useState('all'); // 'all' | 'available' | 'stopped'
  const [searchQuery, setSearchQuery] = useState('');

  // Agar App.jsx dan menuItems yoki menuCategories prop sifatida kelmagan bo'lsa, to'g'ridan-to'g'ri bazadan olamiz
  const [stickyMenu, setStickyMenu] = useSticky('pos_menu', []);
  const [stickyCategories] = useSticky('pos_categories', ['Asosiy', 'Ichimlik', 'Shirinlik', 'Boshqalar']);

  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeMenuItems = Array.isArray(menuItems) && menuItems.length > 0 
    ? menuItems 
    : (Array.isArray(stickyMenu) ? stickyMenu : []);

  // Kategoriyalar ro'yxatini shakllantirish
  const categoriesList = useMemo(() => {
    const rawCats = Array.isArray(menuCategories) && menuCategories.length > 0
      ? menuCategories
      : (Array.isArray(stickyCategories) && stickyCategories.length > 0
          ? stickyCategories
          : safeMenuItems.map(i => i?.category));
    const unique = [...new Set([...rawCats, ...safeMenuItems.map(i => i?.category)].filter(Boolean))];
    return unique.length > 0 ? unique : ['Asosiy'];
  }, [menuCategories, stickyCategories, safeMenuItems]);

  // ==========================================
  // 2. OSHXONA BUYURTMALARINI FILTRLASH
  // ==========================================
  // XATO TUZATILDI: Ham 'Yangi', ham 'Kutilmoqda', ham 'pending' statuslarini ushlaydi
  const pendingOrders = useMemo(() => {
    return safeOrders.filter(o => 
      o && ['Yangi', 'Kutilmoqda', 'pending'].includes(o.status)
    );
  }, [safeOrders]);

  const cookingOrders = useMemo(() => {
    return safeOrders.filter(o => 
      o && ['Tayyorlanmoqda', 'cooking'].includes(o.status)
    );
  }, [safeOrders]);

  const readyOrdersCount = useMemo(() => {
    return safeOrders.filter(o => o && o.status === 'Tayyor').length;
  }, [safeOrders]);

  // Oshpaz uchun umumiy porsiyalar yig'indisi (Nechta taomdan jami qancha pishirish kerakligi)
  const aggregatedDishCounts = useMemo(() => {
    const map = {};
    [...pendingOrders, ...cookingOrders].forEach(order => {
      if (Array.isArray(order?.items)) {
        order.items.forEach(item => {
          if (!item?.name) return;
          const qty = Number(item.quantity ?? item.qty ?? 1) || 1;
          map[item.name] = (map[item.name] || 0) + qty;
        });
      }
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [pendingOrders, cookingOrders]);

  // ==========================================
  // 3. STATUS O'ZGARTIRISH VA STOP-LIST MANTIG'I
  // ==========================================
  const handleStatusChange = (orderId, nextStatus) => {
    if (typeof onUpdateStatus === 'function') {
      onUpdateStatus(orderId, nextStatus);
    } else if (typeof setOrders === 'function') {
      setOrders(prev => 
        (Array.isArray(prev) ? prev : []).map(o => 
          o.id === orderId 
            ? { ...o, status: nextStatus, updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } 
            : o
        )
      );
    }
  };

  // Taomni Stop-Listga kiritish yoki sotuvga qaytarish
  const handleToggleAvailability = (itemId) => {
    if (typeof onToggleItemAvailability === 'function') {
      onToggleItemAvailability(itemId);
      return;
    }

    const updateFn = typeof setMenuItems === 'function' ? setMenuItems : setStickyMenu;
    const targetItem = safeMenuItems.find(i => i && i.id === itemId);
    const nextState = targetItem?.is_available === false ? true : false;

    updateFn(prev => {
      const list = Array.isArray(prev) ? prev : safeMenuItems;
      return list.map(item => 
        item && item.id === itemId 
          ? { ...item, is_available: nextState } 
          : item
      );
    });

    if (typeof addAuditLog === 'function' && targetItem) {
      addAuditLog(
        nextState ? "Oshxona: Sotuvga qaytarildi" : "Oshxona: Stop-Listga olindi",
        `"${targetItem.name}" -> ${nextState ? 'Mavjud 🟢' : 'Tugadi 🛑'}`
      );
    }
  };

  // ==========================================
  // 4. STOP-LIST FILTRLARI VA KATEGORIYALARGA BO'LISH
  // ==========================================
  const stoppedItemsCount = useMemo(() => {
    return safeMenuItems.filter(i => i && i.is_available === false).length;
  }, [safeMenuItems]);

  const filteredStopListItems = useMemo(() => {
    return safeMenuItems.filter(item => {
      if (!item) return false;

      // 1. Kategoriya filtri
      if (selectedStopCategory !== 'Barchasi' && item.category !== selectedStopCategory) {
        return false;
      }

      // 2. Holat filtri (Sotuvda / Stop-Listda)
      const isAvail = item.is_available !== false;
      if (stopListFilter === 'available' && !isAvail) return false;
      if (stopListFilter === 'stopped' && isAvail) return false;

      // 3. Qidiruv filtri
      if (searchQuery.trim() !== '') {
        return String(item.name || '').toLowerCase().includes(searchQuery.trim().toLowerCase());
      }

      return true;
    });
  }, [safeMenuItems, selectedStopCategory, stopListFilter, searchQuery]);

  // Stop-listdagi taomlarni kategoriyalar bo'yicha guruhlash
  const groupedStopListByCategory = useMemo(() => {
    const groups = {};
    categoriesList.forEach(cat => {
      const itemsInCat = filteredStopListItems.filter(i => (i.category || 'Asosiy') === cat);
      if (itemsInCat.length > 0) {
        groups[cat] = itemsInCat;
      }
    });

    // Agar ro'yxatda yo'q kategoriyali taom bo'lsa
    const uncategorized = filteredStopListItems.filter(
      i => !categoriesList.includes(i.category || 'Asosiy')
    );
    if (uncategorized.length > 0) {
      groups['Boshqa taomlar'] = uncategorized;
    }

    return Object.entries(groups);
  }, [categoriesList, filteredStopListItems]);

  // ==========================================
  // 5. RENDER (UI DIZAYN)
  // ==========================================
  return (
    <div className="h-[calc(100vh-105px)] animate-fade-in max-w-7xl mx-auto flex flex-col gap-4">
      
      {/* TEPADAGI TABLAR (Oshxona Buyurtmalari va Stop-List) */}
      <div className="bg-white dark:bg-gray-800 p-2 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row gap-2 shrink-0">
        <button 
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-sm md:text-base transition active:scale-95 flex items-center justify-center gap-2 ${
            activeTab === 'orders' 
              ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30' 
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
          }`}
        >
          <span>👨‍🍳 Oshxona Buyurtmalari</span>
          {(pendingOrders.length > 0 || cookingOrders.length > 0) && (
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-black ${
              activeTab === 'orders' ? 'bg-white text-amber-600' : 'bg-red-500 text-white animate-pulse'
            }`}>
              {pendingOrders.length + cookingOrders.length} ta
            </span>
          )}
        </button>
        
        <button 
          type="button"
          onClick={() => setActiveTab('stoplist')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-sm md:text-base transition active:scale-95 flex items-center justify-center gap-2 ${
            activeTab === 'stoplist' 
              ? 'bg-red-500 text-white shadow-md shadow-red-500/30' 
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
          }`}
        >
          <span>🛑 Stop-List (Menyu Boshqaruvi)</span>
          {stoppedItemsCount > 0 && (
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-black ${
              activeTab === 'stoplist' ? 'bg-white text-red-600' : 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300'
            }`}>
              {stoppedItemsCount} ta tugagan
            </span>
          )}
        </button>
      </div>

      {/* =======================================================
          1. BUYURTMALAR EKRANI (KDS - KITCHEN DISPLAY SYSTEM)
          ======================================================= */}
      {activeTab === 'orders' && (
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          
          {/* UMUMIY QOZON HISOBI (JAMI PISHIRILISHI KERAK BO'LGAN TAOMLAR) */}
          {aggregatedDishCounts.length > 0 && (
            <div className="bg-white dark:bg-gray-800 px-4 py-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-3 overflow-x-auto hide-scrollbar shrink-0">
              <span className="text-xs font-black uppercase tracking-wider text-gray-400 whitespace-nowrap">
                🍲 Jami pishirishda:
              </span>
              <div className="flex items-center gap-2">
                {aggregatedDishCounts.map(([dishName, totalQty]) => (
                  <span
                    key={dishName}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800/50 text-xs font-black text-gray-900 dark:text-white whitespace-nowrap"
                  >
                    <span>{dishName}</span>
                    <span className="bg-amber-500 text-white px-2 py-0.5 rounded-lg text-[11px]">
                      x{totalQty}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* IKKI USTUNLI BUYURTMALAR DOSKASI */}
          <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
            
            {/* CHAP USTUN: Yangi kelgan buyurtmalar */}
            <div className="flex-1 bg-red-50/50 dark:bg-red-900/10 rounded-3xl p-4 border border-red-100 dark:border-red-900/30 flex flex-col h-full min-h-0">
              
              <div className="flex justify-between items-center mb-4 shrink-0">
                <h3 className="text-red-600 dark:text-red-400 font-black text-lg flex items-center gap-2">
                  <span>🔥</span> Yangi kelganlar ({pendingOrders.length})
                </h3>
                {pendingOrders.length > 0 && (
                  <span className="text-[11px] font-black uppercase bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 px-2.5 py-1 rounded-lg animate-pulse">
                    Tasdiqlash kutilmoqda
                  </span>
                )}
              </div>
              
              <div className="flex-1 overflow-y-auto hide-scrollbar space-y-3 pb-6">
                {pendingOrders.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-12 font-bold">
                    <span className="text-4xl mb-2 opacity-50">✨</span>
                    <p>Yangi buyurtmalar yo'q</p>
                  </div>
                ) : (
                  pendingOrders.map(order => {
                    const waiterLabel = order.waiterName || order.waiter || 'Ofitsiant';
                    const safeItems = Array.isArray(order.items) ? order.items : [];

                    return (
                      <div 
                        key={order.id} 
                        className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border-2 border-red-200 dark:border-red-800/70 space-y-3"
                      >
                        <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-700 pb-2.5">
                          <div>
                            <span className="font-black text-lg text-gray-900 dark:text-white">
                              {order.table === 'Olib ketish' ? '🛍️ ' : '🪑 '}{order.table}
                            </span>
                            <p className="text-xs font-bold text-gray-400 mt-0.5">
                              👤 {waiterLabel}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-black bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2.5 py-1 rounded-lg">
                              🕒 {order.updatedAt || order.time || 'Hozir'}
                            </span>
                          </div>
                        </div>
                        
                        {/* Taomlar va Mijoz Izohlari */}
                        <ul className="space-y-2">
                          {safeItems.map((item, idx) => {
                            const qty = Number(item?.quantity ?? item?.qty ?? 1);
                            return (
                              <li 
                                key={item?.cartItemId || idx} 
                                className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700"
                              >
                                <div className="flex justify-between items-center text-sm font-black text-gray-900 dark:text-white">
                                  <span>{item?.name}</span>
                                  <span className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2.5 py-0.5 rounded-lg text-xs">
                                    {qty} x
                                  </span>
                                </div>
                                {item?.note && (
                                  <p className="mt-1.5 text-xs font-black text-amber-700 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-900/40 px-2.5 py-1 rounded-lg">
                                    💬 Izoh: {item.note}
                                  </p>
                                )}
                              </li>
                            );
                          })}
                        </ul>

                        {order.note && (
                          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-xs font-black text-amber-700 dark:text-amber-300">
                            📌 Umumiy izoh: {order.note}
                          </div>
                        )}
                        
                        <button 
                          type="button"
                          onClick={() => handleStatusChange(order.id, 'Tayyorlanmoqda')}
                          className="w-full bg-red-500 hover:bg-red-600 text-white py-3.5 rounded-xl font-black shadow-md shadow-red-500/20 transition active:scale-95 text-sm uppercase tracking-wider"
                        >
                          PISHIRISHNI BOSHLASH 🍳
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* O'NG USTUN: Tayyorlanayotganlar */}
            <div className="flex-1 bg-amber-50/50 dark:bg-amber-900/10 rounded-3xl p-4 border border-amber-100 dark:border-amber-900/30 flex flex-col h-full min-h-0">
              
              <div className="flex justify-between items-center mb-4 shrink-0">
                <h3 className="text-amber-600 dark:text-amber-500 font-black text-lg flex items-center gap-2">
                  <span>⏳</span> Jarayonda ({cookingOrders.length})
                </h3>
                {readyOrdersCount > 0 && (
                  <span className="text-xs font-black bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-3 py-1 rounded-lg">
                    ✅ Ofitsiant kutmoqda: {readyOrdersCount} ta
                  </span>
                )}
              </div>
              
              <div className="flex-1 overflow-y-auto hide-scrollbar space-y-3 pb-6">
                {cookingOrders.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-12 font-bold">
                    <span className="text-4xl mb-2 opacity-50">🍳</span>
                    <p>Hozircha hech narsa pishirilmayapti</p>
                  </div>
                ) : (
                  cookingOrders.map(order => {
                    const waiterLabel = order.waiterName || order.waiter || 'Ofitsiant';
                    const safeItems = Array.isArray(order.items) ? order.items : [];

                    return (
                      <div 
                        key={order.id} 
                        className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border-2 border-amber-300 dark:border-amber-700 space-y-3"
                      >
                        <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-700 pb-2.5">
                          <div>
                            <span className="font-black text-lg text-gray-900 dark:text-white">
                              {order.table === 'Olib ketish' ? '🛍️ ' : '🪑 '}{order.table}
                            </span>
                            <p className="text-xs font-bold text-gray-400 mt-0.5">
                              👤 {waiterLabel} • 🕒 {order.time}
                            </p>
                          </div>
                          <span className="text-xs font-black text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2.5 py-1 rounded-lg animate-pulse">
                            🔥 Pishmoqda...
                          </span>
                        </div>
                        
                        <ul className="space-y-2">
                          {safeItems.map((item, idx) => {
                            const qty = Number(item?.quantity ?? item?.qty ?? 1);
                            return (
                              <li 
                                key={item?.cartItemId || idx} 
                                className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700"
                              >
                                <div className="flex justify-between items-center text-sm font-black text-gray-900 dark:text-white">
                                  <span>{item?.name}</span>
                                  <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2.5 py-0.5 rounded-lg text-xs">
                                    {qty} x
                                  </span>
                                </div>
                                {item?.note && (
                                  <p className="mt-1.5 text-xs font-black text-amber-700 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-900/40 px-2.5 py-1 rounded-lg">
                                    💬 Izoh: {item.note}
                                  </p>
                                )}
                              </li>
                            );
                          })}
                        </ul>

                        {order.note && (
                          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-xs font-black text-amber-700 dark:text-amber-300">
                            📌 Umumiy izoh: {order.note}
                          </div>
                        )}
                        
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleStatusChange(order.id, 'Yangi')}
                            title="Orqaga qaytarish"
                            className="px-3.5 py-3.5 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-600 dark:text-gray-300 font-black text-xs transition active:scale-95"
                          >
                            ↩️
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleStatusChange(order.id, 'Tayyor')}
                            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3.5 rounded-xl font-black shadow-md shadow-emerald-500/25 transition active:scale-95 text-sm uppercase tracking-wider"
                          >
                            TAYYOR (OFITSIANTGA) ✅
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* =======================================================
          2. STOP-LIST EKRANI (KATEGORIYALARGA BO'LINGAN)
          ======================================================= */}
      {activeTab === 'stoplist' && (
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-3xl p-4 md:p-6 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col min-h-0 space-y-5">
          
          {/* SARLAVHA VA QIDIRUV */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 shrink-0">
            <div>
              <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                <span>🛑</span> Stop-List Boshqaruvi (Kategoriyalar bo'yicha)
              </h2>
              <p className="text-xs md:text-sm font-bold text-gray-500 mt-1">
                Masalliq tugasa, taomni o'chirib qo'ying — u darhol Ofitsiant va QR-Menyudan olib tashlanadi.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <div className="relative flex-1 sm:w-64">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="🔍 Taom nomini qidiring..."
                  className="w-full pl-4 pr-9 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs sm:text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-red-500"
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

              <div className="flex bg-gray-100 dark:bg-gray-900 p-1 rounded-xl">
                {[
                  { id: 'all', label: `Barchasi (${safeMenuItems.length})` },
                  { id: 'available', label: `🟢 Sotuvda (${safeMenuItems.length - stoppedItemsCount})` },
                  { id: 'stopped', label: `🛑 Stop (${stoppedItemsCount})` }
                ].map(st => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setStopListFilter(st.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
                      stopListFilter === st.id
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* KATEGORIYALAR GORIZONTAL TUGMALARI */}
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1 shrink-0 border-b border-gray-100 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setSelectedStopCategory('Barchasi')}
              className={`px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm whitespace-nowrap transition active:scale-95 ${
                selectedStopCategory === 'Barchasi'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                  : 'bg-gray-100 dark:bg-gray-700/70 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              📁 Barcha toifalar ({safeMenuItems.length})
            </button>

            {categoriesList.map(cat => {
              const totalInCat = safeMenuItems.filter(i => (i?.category || 'Asosiy') === cat).length;
              const stoppedInCat = safeMenuItems.filter(i => (i?.category || 'Asosiy') === cat && i?.is_available === false).length;
              const isSelected = selectedStopCategory === cat;

              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedStopCategory(cat)}
                  className={`px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm whitespace-nowrap transition active:scale-95 flex items-center gap-2 ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                      : 'bg-gray-100 dark:bg-gray-700/70 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                  }`}
                >
                  <span>{cat}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    stoppedInCat > 0
                      ? 'bg-red-500 text-white'
                      : isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                  }`}>
                    {stoppedInCat > 0 ? `${stoppedInCat} stop` : totalInCat}
                  </span>
                </button>
              );
            })}
          </div>

          {/* KATEGORIYALAR BO'YICHA BO'LINGAN TAOMLAR RO'YXATI */}
          <div className="flex-1 overflow-y-auto hide-scrollbar space-y-6 pr-1">
            {groupedStopListByCategory.length === 0 ? (
              <div className="text-center py-16 text-gray-400 font-bold">
                <span className="text-5xl block mb-3">🍽️</span>
                <p>Tanlangan filtr bo'yicha taomlar topilmadi.</p>
              </div>
            ) : (
              groupedStopListByCategory.map(([categoryName, itemsInGroup]) => {
                const stoppedInGroup = itemsInGroup.filter(i => i.is_available === false).length;

                return (
                  <div key={categoryName} className="space-y-3">
                    
                    {/* Kategoriya Sarlavhasi */}
                    <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-900/60 px-4 py-2.5 rounded-xl border border-gray-100 dark:border-gray-700">
                      <div className="flex items-center gap-2">
                        <span className="text-base">📂</span>
                        <h3 className="font-black text-sm sm:text-base text-gray-900 dark:text-white uppercase tracking-wider">
                          {categoryName}
                        </h3>
                        <span className="text-xs font-bold text-gray-400">
                          ({itemsInGroup.length} xil taom)
                        </span>
                      </div>

                      {stoppedInGroup > 0 ? (
                        <span className="text-xs font-black bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-3 py-1 rounded-lg">
                          🛑 {stoppedInGroup} tasi Stop-Listda
                        </span>
                      ) : (
                        <span className="text-xs font-black bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-lg">
                          🟢 Barchasi sotuvda
                        </span>
                      )}
                    </div>

                    {/* Shu kategoriyadagi taomlar kartochkalari */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {itemsInGroup.map(item => {
                        const isAvailable = item.is_available !== false;
                        const displayPrice = Number(item?.variants?.[0]?.price ?? item?.price ?? 0);

                        return (
                          <div 
                            key={item.id} 
                            onClick={() => handleToggleAvailability(item.id)}
                            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all active:scale-[0.98] flex justify-between items-center gap-3 ${
                              isAvailable 
                                ? 'border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/40 hover:border-emerald-400' 
                                : 'border-red-500 bg-red-50 dark:bg-red-900/20 shadow-sm'
                            }`}
                          >
                            <div className="pr-2">
                              <p className={`font-black text-sm sm:text-base leading-tight ${
                                isAvailable 
                                  ? 'text-gray-900 dark:text-white' 
                                  : 'text-red-700 dark:text-red-400 line-through'
                              }`}>
                                {item.name}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                                  {displayPrice.toLocaleString()} s
                                </span>
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                                  isAvailable
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                    : 'bg-red-500 text-white'
                                }`}>
                                  {isAvailable ? 'Sotuvda' : 'Tugadi'}
                                </span>
                              </div>
                            </div>
                            
                            {/* Toggle Switch */}
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleAvailability(item.id);
                              }}
                              className={`w-14 h-8 rounded-full relative transition-colors shrink-0 ${
                                isAvailable 
                                  ? 'bg-emerald-500' 
                                  : 'bg-red-500'
                              }`}
                            >
                              <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-transform ${
                                isAvailable 
                                  ? 'right-1' 
                                  : 'left-1'
                              }`}></div>
                            </button>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                );
              })
            )}
          </div>

        </div>
      )}

    </div>
  );
}