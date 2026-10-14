import React, { useState, useEffect } from 'react';

export default function WaiterMenu({ 
  menuCategories = [], 
  menuItems = [], 
  onAddItem 
}) {
  // ==========================================
  // 1. STATE'LAR (Holatni boshqarish)
  // ==========================================
  const safeCategories = Array.isArray(menuCategories) ? menuCategories : [];
  const safeItems = Array.isArray(menuItems) ? menuItems : [];

  const [activeCategory, setActiveCategory] = useState(
    safeCategories.length > 0 ? safeCategories[0] : 'Barchasi'
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Agar kategoriyalar bazadan keyinroq yuklansa, birinchi kategoriyani avtomatik tanlash
  useEffect(() => {
    if (!activeCategory && safeCategories.length > 0) {
      setActiveCategory(safeCategories[0]);
    }
  }, [safeCategories, activeCategory]);

  // ==========================================
  // 2. NARX VA VARIANTNI XAVFSIZ OLISH FUNKSIYASI
  // ==========================================
  const getDisplayPrice = (item) => {
    if (Array.isArray(item?.variants) && item.variants.length > 0) {
      return Number(item.variants[0]?.price || 0);
    }
    return Number(item?.price || 0);
  };

  const getDisplayVariantName = (item) => {
    if (Array.isArray(item?.variants) && item.variants.length > 0) {
      return item.variants[0]?.name || 'Standart';
    }
    return 'Standart';
  };

  // ==========================================
  // 3. TAOMLARNI FILTRLASH MANTIG'I
  // ==========================================
  const filteredItems = safeItems.filter(item => {
    if (!item || item.is_available === false || item.available === false) {
      return false;
    }

    // Qidiruv yozilgan bo'lsa, barcha kategoriyalar ichidan qidiradi
    if (searchQuery.trim() !== '') {
      return item.name?.toLowerCase().includes(searchQuery.trim().toLowerCase());
    }

    // "Barchasi" tanlangan bo'lsa hammasini ko'rsatadi
    if (activeCategory === 'Barchasi') {
      return true;
    }

    return item.category === activeCategory;
  });

  // ==========================================
  // 4. RENDER (UI DIZAYN)
  // ==========================================
  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      
      {/* --- QIDIRUV VA KATEGORIYALAR PANELI --- */}
      <div className="bg-gray-50 dark:bg-gray-900/50 p-3 border-b border-gray-100 dark:border-gray-700 space-y-2.5 shrink-0">
        
        {/* Tezkor qidiruv */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 Taomni tez qidirish..."
            className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-xs md:text-sm font-bold outline-none focus:border-indigo-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 font-black text-sm"
            >
              ✕
            </button>
          )}
        </div>

        {/* Kategoriyalar ro'yxati */}
        <div className="overflow-x-auto hide-scrollbar flex gap-2 pb-0.5">
          <button
            onClick={() => {
              setActiveCategory('Barchasi');
              setSearchQuery('');
            }}
            className={`px-4 py-2.5 rounded-xl font-black text-xs md:text-sm whitespace-nowrap transition active:scale-95 ${
              activeCategory === 'Barchasi' && !searchQuery
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Barchasi
          </button>

          {safeCategories.map(cat => (
            <button 
              key={cat} 
              onClick={() => {
                setActiveCategory(cat);
                setSearchQuery('');
              }}
              className={`px-4 py-2.5 rounded-xl font-black text-xs md:text-sm whitespace-nowrap transition active:scale-95 ${
                activeCategory === cat && !searchQuery
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' 
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

      </div>

      {/* --- TAOMLAR RO'YXATI --- */}
      <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
        {filteredItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 py-12">
            <span className="text-4xl mb-3">🍽️</span>
            <p className="font-bold text-sm">
              {searchQuery ? `"${searchQuery}" bo'yicha taom topilmadi` : "Bu toifada taom yo'q"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredItems.map(item => {
              const displayPrice = getDisplayPrice(item);
              const variantName = getDisplayVariantName(item);
              const hasMultipleVariants = Array.isArray(item.variants) && item.variants.length > 1;

              return (
                <div 
                  key={item.id} 
                  onClick={() => typeof onAddItem === 'function' && onAddItem(item)}
                  className="bg-gray-50 dark:bg-gray-700/30 p-3 md:p-4 rounded-2xl border border-gray-200 dark:border-gray-600 cursor-pointer hover:border-indigo-400 hover:shadow-md transition active:scale-95 flex flex-col justify-between min-h-[110px] relative group"
                >
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-sm md:text-base leading-tight mb-2">
                      {item.name}
                    </h3>
                  </div>

                  <div className="flex items-end justify-between gap-2 mt-2">
                    <div>
                      <p className="font-black text-indigo-600 dark:text-indigo-400 text-sm md:text-base">
                        {displayPrice.toLocaleString()} s
                      </p>
                      <p className="text-[10px] font-bold text-gray-400 mt-0.5">
                        {hasMultipleVariants ? `${item.variants.length} xil variant` : variantName}
                      </p>
                    </div>

                    <span className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center font-black text-sm transition">
                      +
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}