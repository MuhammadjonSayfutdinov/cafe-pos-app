import React, { useState, useMemo } from 'react';

export default function WaiterMenu({
  menuItems,
  menu,
  menuCategories,
  categories,
  selectedCategory: selectedCategoryProp,
  setSelectedCategory: setSelectedCategoryProp,
  activeCategory: activeCategoryProp,
  setActiveCategory: setActiveCategoryProp,
  searchQuery: searchQueryProp,
  setSearchQuery: setSearchQueryProp,
  searchTerm: searchTermProp,
  setSearchTerm: setSearchTermProp,
  cart = [],
  onAddToCart,
  addToCart
}) {
  // Ichki fallback state (Agar prop uzatilmagan bo'lsa ham mustaqil ishlaydi)
  const [localCategory, setLocalCategory] = useState('Barchasi');
  const [localSearch, setLocalSearch] = useState('');

  const currentCategory = selectedCategoryProp ?? activeCategoryProp ?? localCategory;
  const updateCategory = setSelectedCategoryProp || setActiveCategoryProp || setLocalCategory;

  const currentSearch = searchQueryProp ?? searchTermProp ?? localSearch;
  const updateSearch = setSearchQueryProp || setSearchTermProp || setLocalSearch;

  const handleAddDish = onAddToCart || addToCart;

  const safeMenu = useMemo(() => {
    if (Array.isArray(menuItems) && menuItems.length > 0) return menuItems;
    if (Array.isArray(menu) && menu.length > 0) return menu;
    try {
      const saved = window.localStorage.getItem('pos_menu');
      if (saved) return JSON.parse(saved) || [];
    } catch {
      // ignore
    }
    return [];
  }, [menuItems, menu]);

  const safeCategories = useMemo(() => {
    const raw =
      Array.isArray(menuCategories) && menuCategories.length > 0
        ? menuCategories
        : Array.isArray(categories) && categories.length > 0
        ? categories
        : Array.from(new Set(safeMenu.map(i => i?.category).filter(Boolean)));
    return raw.includes('Barchasi') ? raw : ['Barchasi', ...raw];
  }, [menuCategories, categories, safeMenu]);

  // Filtrlash
  const filteredDishes = useMemo(() => {
    return safeMenu.filter(dish => {
      if (!dish) return false;
      if (currentCategory !== 'Barchasi' && dish.category !== currentCategory) {
        return false;
      }
      if (String(currentSearch || '').trim() !== '') {
        const q = String(currentSearch).trim().toLowerCase();
        return (
          String(dish.name || '').toLowerCase().includes(q) ||
          String(dish.category || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [safeMenu, currentCategory, currentSearch]);

  // Savatchada qaysi taomdan nechta borligini hisoblash
  const cartCountByDishName = useMemo(() => {
    const map = {};
    if (!Array.isArray(cart)) return map;
    cart.forEach(c => {
      if (!c) return;
      const baseKey = c.baseName || c.name;
      const qty = Number(c.quantity ?? c.qty ?? 1) || 0;
      map[baseKey] = (map[baseKey] || 0) + qty;
      map[c.name] = (map[c.name] || 0) + qty;
    });
    return map;
  }, [cart]);

  return (
    <div className="flex-1 bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 sm:p-5 flex flex-col min-h-0 overflow-hidden">
      
      {/* 1. QIDIRUV VA KATEGORIYALAR PANELI */}
      <div className="space-y-3 pb-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
        <div className="relative">
          <input
            type="text"
            value={currentSearch}
            onChange={e => updateSearch(e.target.value)}
            placeholder="🔍 Taom nomini qidiring..."
            className="w-full pl-4 pr-10 py-3 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm font-black text-gray-900 dark:text-white outline-none focus:border-amber-500 transition"
          />
          {currentSearch && (
            <button
              type="button"
              onClick={() => updateSearch('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 font-black"
            >
              ✕
            </button>
          )}
        </div>

        {/* Toifalar (Categories) */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
          {safeCategories.map(cat => {
            const isActive = currentCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => updateCategory(cat)}
                className={`px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm whitespace-nowrap transition active:scale-95 ${
                  isActive
                    ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25'
                    : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                {cat === 'Barchasi' ? '🍽 Barchasi' : cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. TAOMLAR RO'YXATI GRIDI */}
      <div className="flex-1 overflow-y-auto pt-4 pr-1">
        {filteredDishes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-12 text-gray-400">
            <span className="text-5xl mb-2">🍽️</span>
            <p className="font-black text-sm">Taomlar topilmadi</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {filteredDishes.map(dish => {
              const isAvailable = dish.is_available !== false;
              const variants =
                Array.isArray(dish.variants) && dish.variants.length > 0
                  ? dish.variants
                  : [{ id: 'v_def', name: '1 porsiya', price: Number(dish.price || 0) }];

              const hasMultipleVariants = variants.length > 1;
              const mainPrice = Number(variants[0]?.price ?? dish.price ?? 0) || 0;
              const inCartCount = cartCountByDishName[dish.name] || 0;

              return (
                <div
                  key={dish.id}
                  onClick={() => {
                    if (!isAvailable) return;
                    if (!hasMultipleVariants && typeof handleAddDish === 'function') {
                      handleAddDish(dish, variants[0]);
                    }
                  }}
                  className={`p-4 rounded-2xl border-2 transition-all flex flex-col justify-between select-none relative ${
                    !isAvailable
                      ? 'bg-gray-100 dark:bg-gray-900/40 border-gray-200 dark:border-gray-800 opacity-60 cursor-not-allowed'
                      : inCartCount > 0
                      ? 'bg-amber-50/70 dark:bg-amber-900/20 border-amber-400 dark:border-amber-600 shadow-sm cursor-pointer'
                      : 'bg-gray-50 dark:bg-gray-900/60 border-gray-200/80 dark:border-gray-700 hover:border-amber-400 hover:shadow-md cursor-pointer active:scale-[0.98]'
                  }`}
                >
                  {/* Savatchadagi soni badge */}
                  {inCartCount > 0 && (
                    <span className="absolute top-3 right-3 px-2.5 py-0.5 rounded-full bg-amber-500 text-white font-black text-xs shadow-sm">
                      ✓ {inCartCount} ta
                    </span>
                  )}

                  <div className="pr-12">
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block mb-0.5">
                      {dish.category}
                    </span>
                    <h4 className="font-black text-sm sm:text-base text-gray-900 dark:text-white leading-snug">
                      {dish.name}
                    </h4>
                  </div>

                  {/* Pastki qism: Narxi yoki Porsiya variantlari tugmalari */}
                  <div className="mt-3 pt-2.5 border-t border-gray-200/60 dark:border-gray-700/70">
                    {!isAvailable ? (
                      <span className="inline-block w-full text-center py-1.5 rounded-xl bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 font-black text-xs uppercase">
                        🛑 Tugagan (Stop-List)
                      </span>
                    ) : hasMultipleVariants ? (
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-black uppercase text-gray-400 block">
                          Porsiyani tanlang:
                        </span>
                        <div className="grid grid-cols-2 gap-1.5">
                          {variants.map((v, vIdx) => (
                            <button
                              key={v.id || vIdx}
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                if (typeof handleAddDish === 'function') {
                                  handleAddDish(dish, v);
                                }
                              }}
                              className="py-2 px-2 rounded-xl bg-white dark:bg-gray-800 hover:bg-amber-500 hover:text-white border border-amber-300 dark:border-gray-600 text-left transition active:scale-95 shadow-sm"
                            >
                              <span className="text-[10px] font-bold block truncate opacity-80">
                                {v.name}
                              </span>
                              <span className="font-black text-xs block">
                                + {Number(v.price || 0).toLocaleString()} s
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center">
                        <span className="font-black text-base text-amber-600 dark:text-amber-400">
                          {mainPrice.toLocaleString()} <span className="text-xs">so'm</span>
                        </span>
                        <span className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs shadow-sm">
                          + Qo'shish
                        </span>
                      </div>
                    )}
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