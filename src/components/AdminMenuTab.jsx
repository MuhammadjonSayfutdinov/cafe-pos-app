import React, { useState, useEffect, useMemo } from 'react';

// Birliklar konvertatsiyasi (Retseptdagi gr/kg/ml/litr ni ombordagi birlikka aniq o'girish)
const RECIPE_UNITS = [
  { value: 'gr', label: 'gr', family: 'weight', factor: 1 },
  { value: 'kg', label: 'kg', family: 'weight', factor: 1000 },
  { value: 'tonna', label: 'tonna', family: 'weight', factor: 1000000 },
  { value: 'ml', label: 'ml', family: 'volume', factor: 1 },
  { value: 'litr', label: 'litr', family: 'volume', factor: 1000 },
  { value: 'dona', label: 'dona', family: 'count', factor: 1 },
  { value: 'porsiya', label: 'pors', family: 'count', factor: 1 },
  { value: 'boglam', label: "bog'lam", family: 'count', factor: 1 },
  { value: 'qadoq', label: 'qadoq', family: 'count', factor: 1 }
];

const normalizeUnit = (uStr) => {
  const u = String(uStr || 'kg').trim().toLowerCase();
  if (['g', 'gr', 'gram', 'gramm'].includes(u)) return 'gr';
  if (['kg', 'kilogram', 'kilogramm', 'kilo'].includes(u)) return 'kg';
  if (['t', 'ton', 'tonna', 'tn'].includes(u)) return 'tonna';
  if (['ml', 'millilitr'].includes(u)) return 'ml';
  if (['l', 'lt', 'litr', 'liter'].includes(u)) return 'litr';
  if (['pors', 'porsiya'].includes(u)) return 'porsiya';
  if (["bog'lam", 'boglam', 'bog'].includes(u)) return 'boglam';
  if (['pachka', 'qadoq'].includes(u)) return 'qadoq';
  return 'dona';
};

const getUnitMeta = (uStr) => {
  const norm = normalizeUnit(uStr);
  return RECIPE_UNITS.find(u => u.value === norm) || {
    value: norm,
    label: norm,
    family: 'count',
    factor: 1
  };
};

// Retseptdagi miqdorni ombordagi asosiy birlikka o'girish (Masalan: 250 gr -> 0.25 kg)
const convertRecipeQtyToInventoryUnit = (qty, recipeUnit, invUnit) => {
  const num = Number(qty) || 0;
  const rMeta = getUnitMeta(recipeUnit || invUnit);
  const iMeta = getUnitMeta(invUnit);

  if (rMeta.value === iMeta.value) return num;
  if (rMeta.family !== iMeta.family) return num;

  const inBase = num * rMeta.factor;
  return Number((inBase / iMeta.factor).toFixed(6));
};

// Ichki xavfsiz xotira o'qigich (Tashqi useSticky fayliga ehtiyoj yo'q)
const readLocalBackup = (key, fallback = []) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

export default function AdminMenuTab({ 
  menuItems = [], 
  setMenuItems, 
  menuCategories = [],
  inventory = [],
  addAuditLog
}) {
  // Agar AdminPanel dan inventory prop uzatilmagan bo'lsa, localStorage dan olamiz
  const [localInventory, setLocalInventory] = useState(() => readLocalBackup('pos_inventory', []));

  useEffect(() => {
    setLocalInventory(readLocalBackup('pos_inventory', []));
  }, []);

  const safeCategories = Array.isArray(menuCategories) && menuCategories.length > 0 
    ? menuCategories 
    : readLocalBackup('pos_categories', ['Asosiy', 'Ichimlik', 'Shirinlik']);

  const safeInventory = Array.isArray(inventory) && inventory.length > 0 
    ? inventory 
    : (Array.isArray(localInventory) ? localInventory : []);

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
    category: safeCategories[0] || 'Asosiy', 
    is_available: true
  });

  const [variantInputs, setVariantInputs] = useState([
    { id: 'v_default', name: '1 porsiya', price: '' }
  ]);
  
  const [recipeInputs, setRecipeInputs] = useState([]);

  // ==========================================
  // 1. TAOM TANNARXI VA SOF FOYDASINI HISOBLASH
  // ==========================================
  const calculateRecipeFoodCost = (recipeList) => {
    if (!Array.isArray(recipeList) || recipeList.length === 0) return 0;

    let totalCost = 0;
    recipeList.forEach(r => {
      if (!r || !(r.inventoryId ?? r.productId)) return;
      const rawQty = Number(r.rawQty ?? r.qty ?? r.amount ?? 0) || 0;
      if (rawQty <= 0) return;

      const invObj = safeInventory.find(
        i => i && String(i.id) === String(r.inventoryId ?? r.productId)
      );
      if (!invObj) return;

      const invCostPrice = Number(invObj.costPrice ?? invObj.price ?? 0) || 0;
      const invUnit = normalizeUnit(invObj.unit || 'kg');
      const recUnit = normalizeUnit(r.recipeUnit || invUnit);

      const qtyInInvUnit = r.rawQty !== undefined
        ? convertRecipeQtyToInventoryUnit(r.rawQty, recUnit, invUnit)
        : (r.recipeUnit ? convertRecipeQtyToInventoryUnit(rawQty, recUnit, invUnit) : Number(r.qty ?? r.amount ?? 0));

      totalCost += qtyInInvUnit * invCostPrice;
    });

    return Math.round(totalCost);
  };

  const modalProfitAnalysis = useMemo(() => {
    const sellingPrice = Number(variantInputs[0]?.price) || 0;
    const foodCost = calculateRecipeFoodCost(recipeInputs);
    const netProfit = sellingPrice - foodCost;
    const foodCostPercent = sellingPrice > 0 ? Number(((foodCost / sellingPrice) * 100).toFixed(1)) : 0;
    const marginPercent = sellingPrice > 0 ? Number(((netProfit / sellingPrice) * 100).toFixed(1)) : 0;

    return {
      sellingPrice,
      foodCost,
      netProfit,
      foodCostPercent,
      marginPercent
    };
  }, [variantInputs, recipeInputs, safeInventory]);

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
  // 3. MODALNI OCHISH VA BOSHQARISH
  // ==========================================
  const handleOpenMenuModal = (item = null) => {
    setLocalInventory(readLocalBackup('pos_inventory', []));

    if (item) {
      setEditingItem(item);
      setNewItemData({
        name: item.name || '',
        category: item.category || safeCategories[0] || 'Asosiy',
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
          item.recipe.map(r => {
            const invObj = safeInventory.find(i => String(i.id) === String(r.inventoryId ?? r.productId));
            const baseU = normalizeUnit(invObj?.unit || r.unit || 'kg');
            return {
              inventoryId: String(r.inventoryId ?? r.productId ?? r.id ?? ''),
              qty: String(r.rawQty ?? r.qty ?? r.amount ?? ''),
              recipeUnit: normalizeUnit(r.recipeUnit || baseU)
            };
          })
        );
      } else {
        setRecipeInputs([]);
      }
    } else {
      setEditingItem(null);
      setNewItemData({ 
        name: '', 
        category: safeCategories[0] || 'Asosiy', 
        is_available: true 
      });
      setVariantInputs([
        { id: `v_${Date.now()}`, name: '1 porsiya', price: '' }
      ]);
      setRecipeInputs([]); 
    }
    setIsMenuModalOpen(true);
  };

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

  const handleAddRecipeInput = () => {
    setRecipeInputs(prev => [...prev, { inventoryId: '', qty: '', recipeUnit: 'gr' }]);
  };

  const handleRecipeChange = (index, field, value) => {
    setRecipeInputs(prev =>
      prev.map((r, i) => {
        if (i !== index) return r;
        if (field === 'inventoryId') {
          const foundInv = safeInventory.find(inv => String(inv.id) === String(value));
          const defUnit = foundInv ? normalizeUnit(foundInv.unit) : 'kg';
          return { ...r, inventoryId: value, recipeUnit: defUnit };
        }
        return { ...r, [field]: value };
      })
    );
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

    const cleanedRecipe = recipeInputs
      .filter(r => r.inventoryId && Number(r.qty) > 0)
      .map(r => {
        const matchedInv = safeInventory.find(i => String(i.id) === String(r.inventoryId));
        const normalizedId = matchedInv ? matchedInv.id : r.inventoryId;
        const invBaseUnit = normalizeUnit(matchedInv?.unit || 'kg');
        const chosenRecUnit = normalizeUnit(r.recipeUnit || invBaseUnit);
        const rawQtyNum = Number(r.qty);

        const qtyInBaseUnit = convertRecipeQtyToInventoryUnit(rawQtyNum, chosenRecUnit, invBaseUnit);

        return {
          inventoryId: normalizedId,
          productId: normalizedId,
          name: matchedInv?.name || '',
          unit: invBaseUnit,
          recipeUnit: chosenRecUnit,
          rawQty: rawQtyNum,
          qty: qtyInBaseUnit,
          amount: qtyInBaseUnit
        };
      });

    const computedCost = calculateRecipeFoodCost(cleanedRecipe);

    if (editingItem) {
      if (typeof setMenuItems === 'function') {
        setMenuItems(prev => prev.map(item => 
          item.id === editingItem.id ? {
            ...item, 
            name: safeName, 
            category: newItemData.category || safeCategories[0], 
            recipe: cleanedRecipe,
            costPrice: computedCost,
            is_available: newItemData.is_available,
            price: cleanedVariants[0].price,
            variants: cleanedVariants
          } : item
        ));
      }
      if (typeof addAuditLog === 'function') {
        addAuditLog(
          "Taom tahrirlandi", 
          `"${safeName}" (Sotish: ${cleanedVariants[0].price.toLocaleString()} s | Tannarx: ${computedCost.toLocaleString()} s)`
        );
      }
    } else {
      const newItem = {
        id: Date.now(), 
        name: safeName, 
        category: newItemData.category || safeCategories[0], 
        is_available: newItemData.is_available, 
        recipe: cleanedRecipe, 
        costPrice: computedCost,
        price: cleanedVariants[0].price,
        variants: cleanedVariants
      };
      if (typeof setMenuItems === 'function') {
        setMenuItems(prev => [...prev, newItem]);
      }
      if (typeof addAuditLog === 'function') {
        addAuditLog(
          "Yangi taom qo'shildi", 
          `"${safeName}" (Sotish: ${cleanedVariants[0].price.toLocaleString()} s | Tannarx: ${computedCost.toLocaleString()} s)`
        );
      }
    }
    setIsMenuModalOpen(false);
  };

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
              🍔 Taomlar, Texnologik Karta va Tannarx (Food Cost)
            </h2>
            <p className="text-xs font-bold text-gray-500 mt-1">
              Har bir porsiyaning xomashyo tannarxi, sof foydasi va rentabellik foizi
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
                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Taom va Toifasi</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Holati</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Sotish Narxi</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Tannarx (Food Cost)</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Sof Foyda (1 pors)</th>
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

                  const mainSellPrice = Number(variants[0]?.price || item.price || 0);
                  const liveFoodCost = calculateRecipeFoodCost(item.recipe) || Number(item.costPrice || 0);
                  const netProfit = mainSellPrice - liveFoodCost;
                  const foodCostPct = mainSellPrice > 0 ? Math.round((liveFoodCost / mainSellPrice) * 100) : 0;
                  const marginPct = mainSellPrice > 0 ? Math.round((netProfit / mainSellPrice) * 100) : 0;

                  return (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-white dark:hover:bg-gray-800 transition ${
                        !isAvailable ? 'opacity-65 bg-red-50/30 dark:bg-red-900/10' : ''
                      }`}
                    >
                      <td className="p-4">
                        <p className="font-black text-gray-900 dark:text-gray-100 text-base">
                          {item.name}
                        </p>
                        <span className="inline-block mt-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2.5 py-0.5 rounded-md text-[11px] font-bold">
                          {item.category}
                        </span>
                      </td>

                      <td className="p-4">
                        <button
                          type="button"
                          onClick={() => handleToggleAvailability(item)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition active:scale-95 ${
                            isAvailable
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200'
                              : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-200'
                          }`}
                        >
                          {isAvailable ? '🟢 Sotuvda' : '🔴 Stop-List'}
                        </button>
                      </td>

                      <td className="p-4">
                        <div className="space-y-1">
                          {variants.map((v, vIdx) => (
                            <div key={vIdx} className="text-xs">
                              <span className="font-black text-amber-600 dark:text-amber-400 text-sm">
                                {Number(v.price || 0).toLocaleString()} s
                              </span>
                              <span className="text-[10px] text-gray-400 font-bold ml-1">
                                ({v.name})
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      
                      <td className="p-4">
                        {Array.isArray(item.recipe) && item.recipe.length > 0 ? (
                          <div className="space-y-1">
                            <span className="font-black text-sm text-gray-800 dark:text-gray-200 block">
                              {liveFoodCost.toLocaleString()} s
                            </span>
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black ${
                              foodCostPct <= 35
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                : foodCostPct <= 55
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            }`}>
                              Food Cost: {foodCostPct}% ({item.recipe.length} masalliq)
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-[11px] font-bold">
                            Retsept kiritilmagan
                          </span>
                        )}
                      </td>

                      <td className="p-4">
                        {Array.isArray(item.recipe) && item.recipe.length > 0 && liveFoodCost > 0 ? (
                          <div>
                            <span className={`font-black text-sm block ${
                              netProfit > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'
                            }`}>
                              {netProfit > 0 ? `+${netProfit.toLocaleString()}` : netProfit.toLocaleString()} s
                            </span>
                            <span className="text-[10px] font-bold text-gray-400">
                              Foyda marjasi: {marginPct}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-gray-400">—</span>
                        )}
                      </td>
                      
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

      {/* MODAL */}
      {isMenuModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-4 my-8 relative max-h-[92vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h3 className="font-black text-lg text-gray-900 dark:text-white">
                {editingItem ? '✏️ Taom va Tannarxni Tahrirlash' : '🍽 Yangi Taom va Tannarx Kalkulyatsiyasi'}
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

              {/* Porsiyalar va Sotish Narxi */}
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
                        placeholder="Sotish narxi (masalan: 45000)"
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

              {/* Texnologik Karta */}
              <div className="bg-amber-50/50 dark:bg-gray-900/30 p-4 rounded-2xl border border-amber-100 dark:border-gray-700 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    Texnologik Karta (1 porsiya uchun masalliqlar va tannarx)
                  </label>
                  <button 
                    type="button" 
                    onClick={handleAddRecipeInput} 
                    className="text-[10px] font-black text-amber-600 bg-amber-100 px-2.5 py-1 rounded-lg uppercase hover:bg-amber-200 transition"
                  >
                    + Masalliq qo'shish
                  </button>
                </div>
                
                {recipeInputs.length === 0 ? (
                  <p className="text-xs font-bold text-gray-400 text-center py-4">
                    Masalliq qo'shsangiz, taomning aniq tannarxi va sof foydasi avtomatik hisoblanadi.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {recipeInputs.map((inp, index) => {
                      const selectedInv = safeInventory.find(
                        i => String(i.id) === String(inp.inventoryId)
                      );
                      const invMeta = getUnitMeta(selectedInv?.unit || 'kg');
                      const compatibleUnits = RECIPE_UNITS.filter(u => u.family === invMeta.family);

                      const qtyInInvUnit = selectedInv && Number(inp.qty) > 0
                        ? convertRecipeQtyToInventoryUnit(inp.qty, inp.recipeUnit, selectedInv.unit)
                        : 0;
                      const lineCost = Math.round(qtyInInvUnit * (Number(selectedInv?.costPrice ?? 0) || 0));

                      return (
                        <div 
                          key={index} 
                          className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm space-y-2"
                        >
                          <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                            <select 
                              required 
                              value={inp.inventoryId} 
                              onChange={e => handleRecipeChange(index, 'inventoryId', e.target.value)}
                              className="flex-1 min-w-[160px] p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 outline-none font-bold text-xs text-gray-900 dark:text-white cursor-pointer"
                            >
                              <option value="">-- Ombordan tanlang --</option>
                              {safeInventory.map(inv => (
                                <option key={inv.id} value={String(inv.id)}>
                                  {inv.name} ({Number(inv.costPrice || 0).toLocaleString()} s/{inv.unit})
                                </option>
                              ))}
                            </select>
                            
                            <input 
                              type="number" 
                              required 
                              min="0.0001" 
                              step="any" 
                              value={inp.qty} 
                              onChange={e => handleRecipeChange(index, 'qty', e.target.value)}
                              className="w-24 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 outline-none font-black text-xs text-gray-900 dark:text-white text-center"
                              placeholder="Miqdor"
                            />

                            <select
                              value={inp.recipeUnit || invMeta.value}
                              onChange={e => handleRecipeChange(index, 'recipeUnit', e.target.value)}
                              disabled={!selectedInv}
                              className="w-24 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 outline-none font-black text-xs text-amber-600 dark:text-amber-400 cursor-pointer"
                            >
                              {(compatibleUnits.length > 0 ? compatibleUnits : [invMeta]).map(u => (
                                <option key={u.value} value={u.value}>{u.label}</option>
                              ))}
                            </select>
                            
                            <button 
                              type="button" 
                              onClick={() => handleRemoveRecipeInput(index)} 
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 text-red-500 font-bold transition shrink-0"
                            >
                              ✕
                            </button>
                          </div>

                          {selectedInv && Number(inp.qty) > 0 && (
                            <div className="flex justify-between items-center text-[11px] font-bold px-1">
                              <span className="text-gray-400">
                                Ombordan yechiladi: {qtyInInvUnit} {selectedInv.unit}
                              </span>
                              <span className="font-black text-indigo-600 dark:text-indigo-400">
                                Tannarxi: {lineCost.toLocaleString()} so'm
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* JONLI TANNARX VA SOF FOYDA XULOSASI */}
                <div className="mt-4 pt-3 border-t border-amber-200 dark:border-gray-700 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="bg-white dark:bg-gray-800 p-2.5 rounded-xl border border-gray-100 dark:border-gray-700">
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">1 Pors Tannarxi</span>
                    <span className="font-black text-sm text-gray-900 dark:text-white">
                      {modalProfitAnalysis.foodCost.toLocaleString()} s
                    </span>
                  </div>

                  <div className="bg-white dark:bg-gray-800 p-2.5 rounded-xl border border-gray-100 dark:border-gray-700">
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Sotish Narxi</span>
                    <span className="font-black text-sm text-amber-600 dark:text-amber-400">
                      {modalProfitAnalysis.sellingPrice.toLocaleString()} s
                    </span>
                  </div>

                  <div className="bg-white dark:bg-gray-800 p-2.5 rounded-xl border border-gray-100 dark:border-gray-700">
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Sof Foyda</span>
                    <span className={`font-black text-sm ${
                      modalProfitAnalysis.netProfit > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                    }`}>
                      {modalProfitAnalysis.netProfit > 0 ? `+${modalProfitAnalysis.netProfit.toLocaleString()}` : modalProfitAnalysis.netProfit.toLocaleString()} s
                    </span>
                  </div>

                  <div className="bg-white dark:bg-gray-800 p-2.5 rounded-xl border border-gray-100 dark:border-gray-700">
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Food Cost / Foyda</span>
                    <span className="font-black text-xs text-indigo-600 dark:text-indigo-400">
                      {modalProfitAnalysis.foodCostPercent}% / {modalProfitAnalysis.marginPercent}%
                    </span>
                  </div>
                </div>
              </div>

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