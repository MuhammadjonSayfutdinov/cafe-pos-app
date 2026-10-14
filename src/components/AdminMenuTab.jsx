import React, { useState, useMemo } from 'react';

export default function AdminMenuTab({ 
  menuItems = [], 
  setMenuItems, 
  menuCategories = [],
  inventory = [],
  addAuditLog
}) {
  // ==========================================
  // 1. XAVFSIZ MA'LUMOTLAR VA STATE'LAR
  // ==========================================
  const safeCategories = Array.isArray(menuCategories) && menuCategories.length > 0 
    ? menuCategories 
    : ['Asosiy'];
  const safeInventory = Array.isArray(inventory) ? inventory : [];
  const safeMenuItems = Array.isArray(menuItems) ? menuItems : [];

  // Qidiruv va Filtr statelari
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('Barchasi');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'active' | 'stop'

  // Modal statelari
  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  const [newItemData, setNewItemData] = useState({
    name: '', 
    category: safeCategories[0], 
    is_available: true
  });

  // Ko'p porsiyali variantlar (masalan: 1 porsiya, 0.5 porsiya)
  const [variantInputs, setVariantInputs] = useState([
    { id: 'v_default', name: '1 porsiya', price: '' }
  ]);
  
  // Texnologik karta (Retsept masalliqlari)
  const [recipeInputs, setRecipeInputs] = useState([]);

  // ==========================================
  // 2. JADVAL FILTRLASH MANTIG'I
  // ==========================================
  const filteredMenuItems = useMemo(() => {
    return safeMenuItems.filter(item => {
      if (!item) return false;

      const matchesSearch = !searchQuery.trim() || 
        item.name?.toLowerCase().includes(searchQuery.trim().toLowerCase());

      const matchesCat = filterCategory === 'Barchasi' || item.category === filterCategory;

      const isAvailable = item.is_available !== false;
      const matchesStatus = 
        filterStatus === 'all' ? true :
        filterStatus === 'active' ? isAvailable : !isAvailable;

      return matchesSearch && matchesCat && matchesStatus;
    });
  }, [safeMenuItems, searchQuery, filterCategory, filterStatus]);

  // ==========================================
  // 3. MODALNI OCHISH VA VARIANT/RETSEPT BOSHQARUVI
  // ==========================================
  const handleOpenMenuModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setNewItemData({
        name: item.name || '',
        category: item.category || safeCategories[0],
        is_available: item.is_available !== false
      });

      if (Array.isArray(item.variants) && item.variants.length > 0) {
        setVariantInputs(
          item.variants.map((v, idx) => ({
            id: v.id || `v_${idx}_${Date.now()}`,
            name: v.name || '1 porsiya',
            price: v.price !== undefined ? String(v.price) : ''
          }))
        );
      } else {
        setVariantInputs([
          { id: `v_${Date.now()}`, name: '1 porsiya', price: item.price ? String(item.price) : '' }
        ]);
      }

      if (Array.isArray(item.recipe) && item.recipe.length > 0) {
        setRecipeInputs(
          item.recipe.map(r => ({
            inventoryId: String(r.inventoryId ?? r.productId ?? r.id ?? ''),
            qty: String(r.qty ?? r.amount ?? r.quantity ?? '')
          }))
        );
      } else {
        setRecipeInputs([]);
      }
    } else {
      setEditingItem(null);
      setNewItemData({ 
        name: '', 
        category: safeCategories[0], 
        is_available: true 
      });
      setVariantInputs([
        { id: `v_${Date.now()}`, name: '1 porsiya', price: '' }
      ]);
      setRecipeInputs([]); 
    }
    setIsMenuModalOpen(true);
  };

  // --- Variantlar (Porsiyalar) funksiyalari ---
  const handleAddVariantInput = () => {
    setVariantInputs(prev => [
      ...prev,
      { id: `v_${Date.now()}_${Math.random()}`, name: '0.5 porsiya', price: '' }
    ]);
  };

  const handleVariantChange = (index, field, value) => {
    setVariantInputs(prev => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  };

  const handleRemoveVariantInput = (index) => {
    if (variantInputs.length <= 1) {
      alert("Taomda kamida bitta narx (porsiya) bo'lishi shart!");
      return;
    }
    setVariantInputs(prev => prev.filter((_, i) => i !== index));
  };

  // --- Retsept (Texnologik karta) funksiyalari ---
  const handleAddRecipeInput = () => {
    setRecipeInputs(prev => [...prev, { inventoryId: '', qty: '' }]);
  };

  const handleRecipeChange = (index, field, value) => {
    setRecipeInputs(prev => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const handleRemoveRecipeInput = (index) => {
    setRecipeInputs(prev => prev.filter((_, i) => i !== index));
  };

  // ==========================================
  // 4. TAOMNI SAQLASH, STOP-LIST VA O'CHIRISH
  // ==========================================
  const handleSaveMenuItem = (e) => {
    e.preventDefault(); 
    
    const safeName = newItemData.name.trim();
    if (!safeName) {
      alert("Iltimos, taom nomini kiriting!");
      return;
    }

    // Variantlarni tekshirish va tozalash
    const cleanedVariants = variantInputs
      .map((v, idx) => ({
        id: v.id || `v_${Date.now()}_${idx}`,
        name: (v.name || '').trim() || '1 porsiya',
        price: Number(v.price)
      }))
      .filter(v => !isNaN(v.price) && v.price > 0);

    if (cleanedVariants.length === 0) {
      alert("Iltimos, taom narxini to'g'ri kiriting (0 dan katta raqam)!"); 
      return;
    }

    // Retseptni ombor ID turlariga (Number/String) moslab tozalash
    const cleanedRecipe = recipeInputs
      .filter(r => r.inventoryId && Number(r.qty) > 0)
      .map(r => {
        const matchedInv = safeInventory.find(i => String(i.id) === String(r.inventoryId));
        const normalizedId = matchedInv ? matchedInv.id : r.inventoryId;
        const numericQty = Number(r.qty);

        return {
          inventoryId: normalizedId,
          productId: normalizedId,
          name: matchedInv?.name || '',
          unit: matchedInv?.unit || '',
          qty: numericQty,
          amount: numericQty
        };
      });

    if (editingItem) {
      if (typeof setMenuItems === 'function') {
        setMenuItems(prev => prev.map(item => 
          item.id === editingItem.id ? {
            ...item, 
            name: safeName, 
            category: newItemData.category || safeCategories[0], 
            recipe: cleanedRecipe,
            is_available: newItemData.is_available,
            price: cleanedVariants[0].price,
            variants: cleanedVariants
          } : item
        ));
      }
      if (typeof addAuditLog === 'function') {
        addAuditLog("Taom tahrirlandi", `"${safeName}" (${cleanedVariants[0].price.toLocaleString()} so'm)`);
      }
    } else {
      const newItem = {
        id: Date.now(), 
        name: safeName, 
        category: newItemData.category || safeCategories[0], 
        is_available: newItemData.is_available, 
        recipe: cleanedRecipe, 
        price: cleanedVariants[0].price,
        variants: cleanedVariants
      };
      if (typeof setMenuItems === 'function') {
        setMenuItems(prev => [...prev, newItem]);
      }
      if (typeof addAuditLog === 'function') {
        addAuditLog("Yangi taom qo'shildi", `"${safeName}" (${cleanedVariants[0].price.toLocaleString()} so'm)`);
      }
    }
    setIsMenuModalOpen(false);
  };

  // Taomni bir bosishda Stop-Listga tushirish yoki Sotuvga qaytarish
  const handleToggleAvailability = (item) => {
    if (typeof setMenuItems !== 'function') return;
    const nextStatus = item.is_available === false ? true : false;

    setMenuItems(prev => prev.map(m => 
      m.id === item.id ? { ...m, is_available: nextStatus } : m
    ));

    if (typeof addAuditLog === 'function') {
      addAuditLog(
        nextStatus ? "Sotuvga qaytarildi" : "Stop-Listga olindi",
        `"${item.name}" -> ${nextStatus ? 'Sotuvda mavjud' : 'Vaqtincha tugadi'}`
      );
    }
  };

  const handleDeleteMenuItem = (id, itemName) => {
    if (window.confirm(`Rostdan ham "${itemName}" taomini menyudan butunlay o'chirmoqchimisiz?`)) {
      if (typeof setMenuItems === 'function') {
        setMenuItems(prev => prev.filter(item => item.id !== id));
      }
      if (typeof addAuditLog === 'function') {
        addAuditLog("Taom o'chirildi", `"${itemName}" menyudan o'chirildi`);
      }
    }
  };

  // ==========================================
  // 5. RENDER (UI DIZAYN)
  // ==========================================
  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-4 md:p-6 shadow-sm border border-gray-100 dark:border-gray-700 animate-fade-in space-y-5">
        
        {/* SARLAVHA VA YANGI QO'SHISH TUGMASI */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">
              🍔 Taomlar ro'yxati va Texnologik Karta
            </h2>
            <p className="text-xs font-bold text-gray-500 mt-1">
              Restoran menyusi, porsiya narxlari, Stop-list va ombor kalkulyatsiyasi
            </p>
          </div>
          <button 
            type="button"
            onClick={() => handleOpenMenuModal(null)} 
            className="w-full md:w-auto bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-xl font-black transition active:scale-95 shadow-md flex items-center justify-center gap-2"
          >
            <span>+</span> Yangi Taom Qo'shish
          </button>
        </div>

        {/* QIDIRUV VA FILTR PANELI */}
        <div className="flex flex-col lg:flex-row gap-3 justify-between items-stretch lg:items-center bg-gray-50 dark:bg-gray-900/50 p-3 rounded-2xl border border-gray-100 dark:border-gray-700">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="🔍 Taom nomini qidiring..."
              className="w-full pl-4 pr-9 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-amber-500"
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

          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-black text-gray-700 dark:text-gray-200 outline-none cursor-pointer"
            >
              <option value="Barchasi">📁 Barcha toifalar</option>
              {safeCategories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <div className="flex bg-gray-200/70 dark:bg-gray-800 p-1 rounded-xl">
              {[
                { id: 'all', label: 'Barchasi' },
                { id: 'active', label: '🟢 Sotuvda' },
                { id: 'stop', label: '🔴 Stop-List' }
              ].map(st => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setFilterStatus(st.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
                    filterStatus === st.id
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

        {/* TAOMLAR JADVALI */}
        <div className="overflow-x-auto bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700">
                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Taom Nomi</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Toifasi</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Holati (Stop-List)</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Kalkulyatsiya</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Narxi / Porsiya</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredMenuItems.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-10 font-bold text-gray-400">
                    Menyuda taomlar topilmadi.
                  </td>
                </tr>
              ) : (
                filteredMenuItems.map(item => {
                  const isAvailable = item.is_available !== false;
                  const variants = Array.isArray(item.variants) && item.variants.length > 0
                    ? item.variants
                    : [{ name: '1 porsiya', price: Number(item.price || 0) }];

                  return (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-white dark:hover:bg-gray-800 transition ${
                        !isAvailable ? 'opacity-65 bg-red-50/30 dark:bg-red-900/10' : ''
                      }`}
                    >
                      {/* 1. Taom nomi */}
                      <td className="p-4 font-black text-gray-900 dark:text-gray-100">
                        {item.name}
                      </td>
                      
                      {/* 2. Toifasi */}
                      <td className="p-4 text-sm font-bold text-indigo-500">
                        <span className="bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-lg text-xs">
                          {item.category}
                        </span>
                      </td>

                      {/* 3. Stop-List tugmasi */}
                      <td className="p-4">
                        <button
                          type="button"
                          onClick={() => handleToggleAvailability(item)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition active:scale-95 ${
                            isAvailable
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200'
                              : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-200'
                          }`}
                          title="Holatni o'zgartirish uchun bosing"
                        >
                          {isAvailable ? '🟢 Sotuvda' : '🔴 Stop-List'}
                        </button>
                      </td>
                      
                      {/* 4. Kalkulyatsiya (Retsept) */}
                      <td className="p-4">
                        {Array.isArray(item.recipe) && item.recipe.length > 0 ? (
                          <div className="space-y-1">
                            <span className="bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-2.5 py-1 rounded-md text-[10px] font-black uppercase inline-block">
                              {item.recipe.length} ta masalliq
                            </span>
                            <p className="text-[11px] font-bold text-gray-400 max-w-[200px] truncate">
                              {item.recipe.map(r => {
                                const invObj = safeInventory.find(i => String(i.id) === String(r.inventoryId ?? r.productId));
                                const rName = invObj?.name || r.name || 'Xomashyo';
                                const rUnit = invObj?.unit || r.unit || '';
                                return `${rName} (${r.qty ?? r.amount}${rUnit})`;
                              }).join(', ')}
                            </p>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-[10px] font-bold uppercase">
                            Tarkib kiritilmagan
                          </span>
                        )}
                      </td>
                      
                      {/* 5. Narxi va Variantlari */}
                      <td className="p-4">
                        <div className="space-y-1">
                          {variants.map((v, vIdx) => (
                            <div key={vIdx} className="text-xs">
                              <span className="font-black text-amber-600 dark:text-amber-400">
                                {Number(v.price || 0).toLocaleString()} s
                              </span>
                              <span className="text-[10px] text-gray-400 font-bold ml-1.5">
                                ({v.name})
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      
                      {/* 6. Amallar */}
                      <td className="p-4 text-right space-x-2 whitespace-nowrap">
                        <button 
                          type="button"
                          onClick={() => handleOpenMenuModal(item)} 
                          className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 rounded-lg font-bold text-xs transition"
                        >
                          Tahrirlash
                        </button>
                        <button 
                          type="button"
                          onClick={() => handleDeleteMenuItem(item.id, item.name)} 
                          className="px-4 py-2 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 text-red-600 dark:text-red-400 rounded-lg font-bold text-xs transition"
                        >
                          O'chirish
                        </button>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =======================================================
          MODAL: YANGI TAOM / TAHRIRLASH VA TEXNOLOGIK KARTA
          ======================================================= */}
      {isMenuModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4 my-8 relative max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h3 className="font-black text-lg text-gray-900 dark:text-white">
                {editingItem ? '✏️ Taom va Kalkulyatsiyani Tahrirlash' : '🍽 Yangi Taom va Texnologik Karta'}
              </h3>
              <button 
                type="button"
                onClick={() => setIsMenuModalOpen(false)} 
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-red-500 font-bold transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMenuItem} className="space-y-5 pt-2">
              
              {/* 1. Taom Nomi va Toifasi */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">
                    Taom Nomi *
                  </label>
                  <input 
                    type="text" 
                    required 
                    value={newItemData.name} 
                    onChange={e => setNewItemData({ ...newItemData, name: e.target.value })} 
                    className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 outline-none focus:border-amber-500 text-gray-900 dark:text-white font-bold" 
                    placeholder="Masalan: Qozonkabob" 
                  />
                </div>
                
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">
                    Toifasi *
                  </label>
                  <select 
                    value={newItemData.category} 
                    onChange={e => setNewItemData({ ...newItemData, category: e.target.value })} 
                    className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 outline-none text-gray-900 dark:text-white font-bold cursor-pointer"
                  >
                    {safeCategories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 2. Porsiyalar va Narxlar (Multi-Variant) */}
              <div className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    Porsiyalar va Sotish Narxi (so'mda) *
                  </label>
                  <button
                    type="button"
                    onClick={handleAddVariantInput}
                    className="text-[10px] font-black text-indigo-600 bg-indigo-100 dark:bg-indigo-900/40 dark:text-indigo-300 px-2.5 py-1 rounded-lg uppercase hover:bg-indigo-200 transition"
                  >
                    + Porsiya qo'shish
                  </button>
                </div>

                <div className="space-y-2.5">
                  {variantInputs.map((vInp, idx) => (
                    <div key={vInp.id || idx} className="flex gap-2 items-center">
                      <input
                        type="text"
                        required
                        value={vInp.name}
                        onChange={e => handleVariantChange(idx, 'name', e.target.value)}
                        placeholder="1 porsiya / 0.5 pors"
                        className="w-2/5 p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 outline-none text-xs font-bold text-gray-900 dark:text-white"
                      />
                      <input
                        type="number"
                        required
                        min="1"
                        value={vInp.price}
                        onChange={e => handleVariantChange(idx, 'price', e.target.value)}
                        placeholder="Narxi (masalan: 45000)"
                        className="flex-1 p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 outline-none focus:border-amber-500 text-xs font-black text-gray-900 dark:text-white"
                      />
                      {variantInputs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveVariantInput(idx)}
                          className="w-9 h-9 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 font-black text-xs flex items-center justify-center shrink-0"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Texnologik Karta (Ombor Masalliqlari) */}
              <div className="bg-amber-50/50 dark:bg-gray-900/30 p-4 rounded-2xl border border-amber-100 dark:border-gray-700">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    Texnologik Karta (1 porsiya uchun masalliqlar)
                  </label>
                  <button 
                    type="button" 
                    onClick={handleAddRecipeInput} 
                    className="text-[10px] font-black text-amber-600 bg-amber-100 px-2.5 py-1 rounded-lg uppercase hover:bg-amber-200 transition"
                  >
                    + Tarkib qo'shish
                  </button>
                </div>
                
                {recipeInputs.length === 0 ? (
                  <p className="text-xs font-bold text-gray-400 text-center py-4">
                    Bu taom hech qanday xomashyoni ombordan ayirmaydi.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {recipeInputs.map((inp, index) => {
                      // XATO TUZATILDI: String(i.id) === String(inp.inventoryId)
                      const selectedInv = safeInventory.find(
                        i => String(i.id) === String(inp.inventoryId)
                      );
                      return (
                        <div 
                          key={index} 
                          className="flex gap-2 items-center bg-white dark:bg-gray-800 p-2 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm"
                        >
                          <select 
                            required 
                            value={inp.inventoryId} 
                            onChange={e => handleRecipeChange(index, 'inventoryId', e.target.value)}
                            className="flex-1 p-2 rounded-lg bg-gray-50 dark:bg-gray-700 outline-none font-bold text-xs text-gray-900 dark:text-white cursor-pointer"
                          >
                            <option value="">-- Ombordan tanlang --</option>
                            {safeInventory.map(inv => (
                              <option key={inv.id} value={String(inv.id)}>
                                {inv.name} ({inv.unit || 'dona'}) — Qoldiq: {inv.quantity ?? inv.qty ?? 0}
                              </option>
                            ))}
                          </select>
                          
                          <div className="relative w-32">
                            <input 
                              type="number" 
                              required 
                              min="0.001" 
                              step="any" 
                              value={inp.qty} 
                              onChange={e => handleRecipeChange(index, 'qty', e.target.value)}
                              className="w-full p-2 pr-10 rounded-lg bg-gray-50 dark:bg-gray-700 outline-none font-black text-xs text-gray-900 dark:text-white text-center"
                              placeholder="Miqdor"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-amber-600">
                              {selectedInv ? selectedInv.unit : ''}
                            </span>
                          </div>
                          
                          <button 
                            type="button" 
                            onClick={() => handleRemoveRecipeInput(index)} 
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 text-red-500 font-bold transition shrink-0"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 4. Sotuv holati (Stop-List switch) */}
              <label className="flex items-center justify-between p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 cursor-pointer">
                <div>
                  <span className="font-black text-xs text-gray-900 dark:text-white block">
                    Taom sotuvda mavjudmi?
                  </span>
                  <span className="text-[11px] font-bold text-gray-400">
                    O'chirib qo'ysangiz, taom vaqtincha Stop-Listga tushadi
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={newItemData.is_available}
                  onChange={e => setNewItemData({ ...newItemData, is_available: e.target.checked })}
                  className="w-5 h-5 accent-emerald-600 cursor-pointer"
                />
              </label>

              {/* 5. Saqlash va Bekor qilish */}
              <div className="flex gap-3 pt-4 border-t dark:border-gray-700">
                <button 
                  type="button" 
                  onClick={() => setIsMenuModalOpen(false)} 
                  className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white py-3 rounded-xl font-bold transition active:scale-95"
                >
                  Bekor qilish
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-xl font-black shadow-lg shadow-amber-600/30 transition active:scale-95"
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