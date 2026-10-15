import React, { useState } from 'react';

export default function AdminCategoriesTab({ 
  menuCategories = [], 
  setMenuCategories,
  menuItems = [],
  setMenuItems,
  addAuditLog
}) {
  // ==========================================
  // 1. STATE'LAR VA XAVFSIZ MASSIVLAR
  // ==========================================
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [catName, setCatName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const safeCategories = Array.isArray(menuCategories) && menuCategories.length > 0 
    ? menuCategories 
    : ['Asosiy'];
  const safeMenuItems = Array.isArray(menuItems) ? menuItems : [];

  // Har bir toifa ichida nechta taom borligini hisoblash
  const getCategoryItemCount = (categoryName) => {
    return safeMenuItems.filter(item => item && item.category === categoryName).length;
  };

  // ==========================================
  // 2. MODAL OCHISH VA SAQLASH MANTIG'I
  // ==========================================
  const handleOpenModal = (index = null) => {
    if (index !== null) {
      setEditingIndex(index);
      setCatName(safeCategories[index] || '');
    } else {
      setEditingIndex(null);
      setCatName('');
    }
    setIsCatModalOpen(true);
  };

  const handleSaveCategory = (e) => {
    e.preventDefault();
    const safeCat = catName.trim();
    if (!safeCat) {
      alert("Iltimos, toifa nomini kiriting!");
      return;
    }

    // Bir xil nomli toifa qo'shilishidan himoya
    const isDuplicate = safeCategories.some(
      (c, i) => String(c).toLowerCase() === safeCat.toLowerCase() && i !== editingIndex
    );
    if (isDuplicate) {
      alert("Bu nomdagi toifa allaqachon mavjud!");
      return;
    }

    if (editingIndex !== null) {
      // TAHRIRLASH VA TAOMLARNI AVTOMATIK YANGILASH (CASCADING UPDATE)
      const oldCategoryName = safeCategories[editingIndex];
      const newCats = [...safeCategories];
      newCats[editingIndex] = safeCat;

      if (typeof setMenuCategories === 'function') {
        setMenuCategories(newCats);
      }

      // Shu toifaga tegishli barcha taomlarning toifa nomini ham yangilaymiz
      if (oldCategoryName !== safeCat && typeof setMenuItems === 'function') {
        setMenuItems(prevItems => {
          const list = Array.isArray(prevItems) ? prevItems : [];
          return list.map(item => 
            item && item.category === oldCategoryName 
              ? { ...item, category: safeCat } 
              : item
          );
        });
      }

      if (typeof addAuditLog === 'function') {
        addAuditLog("Toifa tahrirlandi", `"${oldCategoryName}" -> "${safeCat}"`);
      }
    } else {
      // YANGI TOIFA QO'SHISH
      if (typeof setMenuCategories === 'function') {
        setMenuCategories([...safeCategories, safeCat]);
      }

      if (typeof addAuditLog === 'function') {
        addAuditLog("Yangi toifa qo'shildi", `"${safeCat}" toifasi yaratildi`);
      }
    }

    setIsCatModalOpen(false);
    setCatName('');
    setEditingIndex(null);
  };

  // ==========================================
  // 3. TOIFANI O'CHIRISH VA TARTIBLASH MANTIG'I
  // ==========================================
  const handleDeleteCategory = (index, name) => {
    if (safeCategories.length <= 1) {
      alert("Tizimda kamida bitta asosiy toifa qolishi shart!");
      return;
    }

    const linkedItemsCount = getCategoryItemCount(name);
    const fallbackCategory = safeCategories.find((_, i) => i !== index) || 'Asosiy';

    const confirmMessage = linkedItemsCount > 0
      ? `"${name}" toifasida ${linkedItemsCount} ta taom mavjud.\n\nToifani o'chirsangiz, undagi taomlar avtomatik "${fallbackCategory}" toifasiga o'tkaziladi. Davom etasizmi?`
      : `Rostdan ham "${name}" toifasini o'chirmoqchimisiz?`;

    if (window.confirm(confirmMessage)) {
      if (typeof setMenuCategories === 'function') {
        setMenuCategories(prev => prev.filter((_, i) => i !== index));
      }

      // Agar ichida taomlar bo'lsa, ularni zaxira toifaga o'tkazamiz (yo'qolib qolmasligi uchun)
      if (linkedItemsCount > 0 && typeof setMenuItems === 'function') {
        setMenuItems(prevItems => {
          const list = Array.isArray(prevItems) ? prevItems : [];
          return list.map(item =>
            item && item.category === name
              ? { ...item, category: fallbackCategory }
              : item
          );
        });
      }

      if (typeof addAuditLog === 'function') {
        addAuditLog(
          "Toifa o'chirildi", 
          `"${name}" o'chirildi (${linkedItemsCount} ta taom "${fallbackCategory}" ga o'tkazildi)`
        );
      }
    }
  };

  // Toifani menyuda yuqoriga yoki pastga surish
  const handleMoveCategory = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= safeCategories.length) return;

    const reordered = [...safeCategories];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    if (typeof setMenuCategories === 'function') {
      setMenuCategories(reordered);
    }
  };

  const filteredCategories = safeCategories
    .map((cat, originalIndex) => ({ name: cat, originalIndex }))
    .filter(item => 
      !searchQuery.trim() || 
      String(item.name).toLowerCase().includes(searchQuery.trim().toLowerCase())
    );

  // ==========================================
  // 4. RENDER (UI DIZAYN)
  // ==========================================
  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-4 md:p-6 shadow-sm border border-gray-100 dark:border-gray-700 animate-fade-in max-w-4xl mx-auto space-y-5">
        
        {/* SARLAVHA VA QO'SHISH TUGMASI */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">
              📁 Toifalar (Kategoriyalar) Boshqaruvi
            </h2>
            <p className="text-xs font-bold text-gray-500 mt-1">
              Menyu bo'limlarini tahrirlash, tartiblash yoki yangi toifa qo'shish
            </p>
          </div>
          <button 
            type="button"
            onClick={() => handleOpenModal(null)} 
            className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-black transition active:scale-95 shadow-md shadow-emerald-600/20 flex justify-center items-center gap-2"
          >
            <span>+</span> Yangi Toifa Qo'shish
          </button>
        </div>

        {/* QIDIRUV SATRI */}
        {safeCategories.length > 3 && (
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="🔍 Toifa nomini qidiring..."
              className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-emerald-500"
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
        )}

        {/* TOIFALAR RO'YXATI */}
        <div className="space-y-3">
          {filteredCategories.length === 0 ? (
            <div className="text-center py-8 text-gray-400 font-bold">
              Toifalar topilmadi.
            </div>
          ) : (
            filteredCategories.map(({ name: cat, originalIndex }) => {
              const itemCount = getCategoryItemCount(cat);

              return (
                <div 
                  key={`${cat}_${originalIndex}`} 
                  className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 transition hover:shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs font-black text-gray-500">
                      {originalIndex + 1}
                    </span>
                    <div>
                      <span className="font-black text-gray-900 dark:text-white text-base">
                        {cat}
                      </span>
                      <span className={`ml-2.5 text-[11px] font-black px-2.5 py-0.5 rounded-full ${
                        itemCount > 0
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}>
                        {itemCount} ta taom
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    {/* Tartibni o'zgartirish tugmalari (Yuqoriga / Pastga) */}
                    {!searchQuery && (
                      <div className="flex items-center gap-1 mr-1">
                        <button
                          type="button"
                          disabled={originalIndex === 0}
                          onClick={() => handleMoveCategory(originalIndex, -1)}
                          title="Yuqoriga ko'tarish"
                          className="w-8 h-8 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-black text-xs disabled:opacity-30 hover:bg-gray-100 transition"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={originalIndex === safeCategories.length - 1}
                          onClick={() => handleMoveCategory(originalIndex, 1)}
                          title="Pastga tushirish"
                          className="w-8 h-8 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-black text-xs disabled:opacity-30 hover:bg-gray-100 transition"
                        >
                          ↓
                        </button>
                      </div>
                    )}

                    <button 
                      type="button"
                      onClick={() => handleOpenModal(originalIndex)} 
                      className="px-3.5 py-2 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 rounded-xl font-bold text-xs transition"
                    >
                      Tahrirlash
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleDeleteCategory(originalIndex, cat)} 
                      className="px-3.5 py-2 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 text-red-600 dark:text-red-400 rounded-xl font-bold text-xs transition"
                    >
                      O'chirish
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* TOIFALAR MODALI */}
      {isCatModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
              <h3 className="font-black text-lg text-gray-900 dark:text-white">
                {editingIndex !== null ? '✏️ Toifani Tahrirlash' : '📁 Yangi Toifa'}
              </h3>
              <button 
                type="button"
                onClick={() => setIsCatModalOpen(false)} 
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-red-500 font-bold flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSaveCategory} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">
                  Toifa Nomi *
                </label>
                <input 
                  type="text" 
                  required 
                  autoFocus
                  value={catName} 
                  onChange={e => setCatName(e.target.value)} 
                  className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 font-bold text-gray-900 dark:text-white outline-none focus:border-emerald-500 transition" 
                  placeholder="Masalan: Milliy taomlar" 
                />
                {editingIndex !== null && (
                  <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-2">
                    ℹ️ Toifa nomi o'zgarsa, uning ichidagi barcha taomlar ham avtomatik yangi nomga o'tadi.
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => setIsCatModalOpen(false)} 
                  className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white py-3 rounded-xl font-bold transition active:scale-95"
                >
                  Bekor qilish
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-black shadow-lg shadow-emerald-600/30 transition active:scale-95"
                >
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}