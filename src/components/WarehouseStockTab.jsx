import React, { useState, useMemo } from 'react';

// Ombor uchun tayyor toifalar ro'yxati
const inventoryCategories = [
  "Go'sht va parrandalar",
  "Sut va yog' mahsulotlari",
  "Sabzavot va mevalar",
  "Don, un va yormalar",
  "Ziravorlar va souslar",
  "Ichimliklar",
  "Xo'jalik mollari",
  "Boshqa"
];

// O'lchov birliklari va konvertatsiya koeffitsiyentlari
const UNIT_OPTIONS = [
  { value: 'gr', label: 'Gramm (gr)', family: 'weight', factorToBase: 1 },
  { value: 'kg', label: 'Kilogramm (kg)', family: 'weight', factorToBase: 1000 },
  { value: 'tonna', label: 'Tonna (t)', family: 'weight', factorToBase: 1000000 },
  { value: 'ml', label: 'Millilitr (ml)', family: 'volume', factorToBase: 1 },
  { value: 'litr', label: 'Litr (l)', family: 'volume', factorToBase: 1000 },
  { value: 'dona', label: 'Dona', family: 'count', factorToBase: 1 },
  { value: 'porsiya', label: 'Porsiya (pors)', family: 'count', factorToBase: 1 },
  { value: 'boglam', label: "Bog'lam (ko'kat/non)", family: 'count', factorToBase: 1 },
  { value: 'qadoq', label: 'Qadoq / Pachka', family: 'count', factorToBase: 1 },
  { value: 'qop', label: 'Qop', family: 'count', factorToBase: 1 },
  { value: 'quti', label: 'Quti / Karobka', family: 'count', factorToBase: 1 }
];

const normalizeUnitCode = (unitStr) => {
  const u = String(unitStr || 'kg').trim().toLowerCase();
  if (['g', 'gr', 'gram', 'gramm'].includes(u)) return 'gr';
  if (['kg', 'kilogram', 'kilogramm', 'kilo'].includes(u)) return 'kg';
  if (['t', 'ton', 'tonna', 'tn'].includes(u)) return 'tonna';
  if (['ml', 'millilitr'].includes(u)) return 'ml';
  if (['l', 'lt', 'litr', 'liter'].includes(u)) return 'litr';
  if (['pors', 'porsiya'].includes(u)) return 'porsiya';
  if (["bog'lam", 'boglam', 'bog'].includes(u)) return 'boglam';
  if (['pachka', 'qadoq'].includes(u)) return 'qadoq';
  if (['quti', 'karobka', 'blok'].includes(u)) return 'quti';
  if (['dona', 'ta', 'sht'].includes(u)) return 'dona';
  return u;
};

const getUnitMeta = (unitStr) => {
  const norm = normalizeUnitCode(unitStr);
  return UNIT_OPTIONS.find(u => u.value === norm) || {
    value: norm,
    label: norm,
    family: 'count',
    factorToBase: 1
  };
};

// Qiymatni bir birlikdan ikkinchi birlikka o'girish (gr <-> kg <-> tonna va ml <-> litr)
const convertValueBetweenUnits = (val, fromUnit, toUnit) => {
  const num = Number(val) || 0;
  const fromMeta = getUnitMeta(fromUnit);
  const toMeta = getUnitMeta(toUnit);

  if (fromMeta.value === toMeta.value) return num;
  if (fromMeta.family !== toMeta.family) return num;

  const inBase = num * fromMeta.factorToBase;
  return Number((inBase / toMeta.factorToBase).toFixed(6));
};

// Og'irlik yoki hajmni barcha birliklarda (gr, kg, tonna) hisoblab berish
const getMultiScaleBreakdown = (qty, unit) => {
  const num = Number(qty) || 0;
  const meta = getUnitMeta(unit);

  if (meta.family === 'weight') {
    return {
      isConvertible: true,
      family: 'weight',
      gr: Number(convertValueBetweenUnits(num, meta.value, 'gr').toFixed(2)),
      kg: Number(convertValueBetweenUnits(num, meta.value, 'kg').toFixed(4)),
      tonna: Number(convertValueBetweenUnits(num, meta.value, 'tonna').toFixed(6))
    };
  }

  if (meta.family === 'volume') {
    return {
      isConvertible: true,
      family: 'volume',
      ml: Number(convertValueBetweenUnits(num, meta.value, 'ml').toFixed(2)),
      litr: Number(convertValueBetweenUnits(num, meta.value, 'litr').toFixed(4))
    };
  }

  return { isConvertible: false, family: 'count' };
};

export default function WarehouseStockTab({ 
  inventory = [], 
  setInventory, 
  setInventoryLogs, 
  currentUser,
  addAuditLog,
  displayUnitMode = 'all'
}) {
  const safeInventory = Array.isArray(inventory) ? inventory : [];

  // ==========================================
  // 1. QIDIRUV VA FILTR STATE'LARI
  // ==========================================
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Barchasi');
  const [stockFilter, setStockFilter] = useState('all'); // 'all' | 'low' | 'out'

  // ==========================================
  // 2. MAHSULOT QO'SHISH VA TAHRIRLASH MODALI
  // ==========================================
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  const [itemData, setItemData] = useState({ 
    name: '', 
    category: inventoryCategories[0], 
    unit: 'kg', 
    quantity: '', 
    minLimit: '' 
  });

  const handleOpenItemModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setItemData({ 
        name: item.name || '', 
        category: item.category || inventoryCategories[7], 
        unit: normalizeUnitCode(item.unit || 'kg'), 
        quantity: item.quantity !== undefined ? String(item.quantity) : '0', 
        minLimit: item.minLimit !== undefined ? String(item.minLimit) : '0'
      });
    } else {
      setEditingItem(null);
      setItemData({ 
        name: '', 
        category: inventoryCategories[0],
        unit: 'kg', 
        quantity: '', 
        minLimit: '' 
      });
    }
    setIsItemModalOpen(true);
  };

  // Tahrirlash vaqtida birlik o'zgartirilsa (masalan kg -> gr), qoldiq va limitni avtomatik konvertatsiya qilish
  const handleModalUnitChange = (nextUnitRaw) => {
    const nextUnit = normalizeUnitCode(nextUnitRaw);
    const prevUnit = normalizeUnitCode(itemData.unit);
    const prevMeta = getUnitMeta(prevUnit);
    const nextMeta = getUnitMeta(nextUnit);

    if (prevMeta.family === nextMeta.family && prevUnit !== nextUnit) {
      const convertedQty = itemData.quantity !== '' 
        ? String(convertValueBetweenUnits(itemData.quantity, prevUnit, nextUnit)) 
        : '';
      const convertedMin = itemData.minLimit !== '' 
        ? String(convertValueBetweenUnits(itemData.minLimit, prevUnit, nextUnit)) 
        : '';

      setItemData(prev => ({
        ...prev,
        unit: nextUnit,
        quantity: convertedQty,
        minLimit: convertedMin
      }));
    } else {
      setItemData(prev => ({ ...prev, unit: nextUnit }));
    }
  };

  const handleSaveItem = (e) => {
    e.preventDefault();
    const name = (itemData.name || '').trim();
    const category = itemData.category || inventoryCategories[0];
    const normUnit = normalizeUnitCode(itemData.unit);
    const min = Number(itemData.minLimit);
    const qty = Number(itemData.quantity);

    if (!name || isNaN(min) || isNaN(qty) || min < 0 || qty < 0) {
      alert("Iltimos, ma'lumotlarni to'g'ri (manfiy bo'lmagan) raqamlarda kiriting!"); 
      return;
    }

    // Bir xil nomli mahsulotdan himoya
    const isDuplicate = safeInventory.some(
      i => i && String(i.name || '').trim().toLowerCase() === name.toLowerCase() && i.id !== editingItem?.id
    );
    if (isDuplicate) {
      alert(`⛔️ "${name}" nomli mahsulot omborda allaqachon mavjud!`);
      return;
    }

    const cleanQty = Number(qty.toFixed(6));
    const cleanMin = Number(min.toFixed(6));

    if (editingItem) {
      if (typeof setInventory === 'function') {
        setInventory(prev => prev.map(i => 
          i.id === editingItem.id 
            ? { 
                ...i, 
                name, 
                category, 
                unit: normUnit, 
                quantity: cleanQty, 
                qty: cleanQty,
                minLimit: cleanMin,
                lastUpdated: new Date().toLocaleString()
              } 
            : i
        ));
      }
      if (typeof addAuditLog === 'function') {
        addAuditLog("Ombor mahsuloti tahrirlandi", `${name} (${cleanQty} ${normUnit})`);
      }
    } else {
      const newItemObj = { 
        id: Date.now().toString(), 
        name, 
        category, 
        unit: normUnit, 
        quantity: cleanQty, 
        qty: cleanQty,
        minLimit: cleanMin, 
        lastUpdated: new Date().toLocaleString() 
      };

      if (typeof setInventory === 'function') {
        setInventory(prev => [...prev, newItemObj]);
      }

      if (typeof setInventoryLogs === 'function') {
        setInventoryLogs(prev => [
          {
            id: `${Date.now()}_${Math.random()}`,
            date: new Date().toLocaleString(),
            type: 'Kirim',
            itemName: name,
            productName: name,
            diffAmount: `+${cleanQty}`,
            amount: cleanQty,
            unit: normUnit,
            note: "Yangi mahsulot boshlang'ich qoldig'i",
            reason: "Yangi mahsulot boshlang'ich qoldig'i",
            user: currentUser?.name || 'Omborchi'
          },
          ...(Array.isArray(prev) ? prev : [])
        ]);
      }

      if (typeof addAuditLog === 'function') {
        addAuditLog("Omborga yangi mahsulot qo'shildi", `${name} (${cleanQty} ${normUnit})`);
      }
    }
    setIsItemModalOpen(false);
  };

  const handleDeleteInventory = (id, name) => {
    if (window.confirm(`Rostdan ham "${name}" mahsulotini ombordan butunlay o'chirilsinmi?`)) {
      if (typeof setInventory === 'function') {
        setInventory(prev => prev.filter(i => i.id !== id));
      }
      if (typeof addAuditLog === 'function') {
        addAuditLog("Ombordan mahsulot o'chirildi", `"${name}" ombor ro'yxatidan o'chirildi`);
      }
    }
  };

  // ==========================================
  // 3. KIRIM, CHIQIM VA REVIZIYA MODALI (GR / KG / TONNA KONVERTATSIYASI BILAN)
  // ==========================================
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateType, setUpdateType] = useState('kirim'); // 'kirim' | 'chiqim' | 'reviziya'
  const [selectedStockItem, setSelectedStockItem] = useState(null);
  const [updateAmount, setUpdateAmount] = useState('');
  const [updateInputUnit, setUpdateInputUnit] = useState('kg'); // Foydalanuvchi qaysi birlikda kiritayotgani
  const [updateNote, setUpdateNote] = useState(''); 

  const handleOpenUpdateModal = (item, type) => {
    const baseUnit = normalizeUnitCode(item.unit || 'kg');
    setSelectedStockItem(item);
    setUpdateType(type);
    setUpdateInputUnit(baseUnit);
    setUpdateAmount(type === 'reviziya' ? String(item.quantity ?? 0) : ''); 
    setUpdateNote('');
    setIsUpdateModalOpen(true);
  };

  // Kirim/Reviziya oynasida birlik o'zgartirilganda
  const handleUpdateUnitSwitch = (newUnit) => {
    if (updateType === 'reviziya' && updateAmount !== '') {
      const converted = convertValueBetweenUnits(updateAmount, updateInputUnit, newUnit);
      setUpdateAmount(String(converted));
    }
    setUpdateInputUnit(newUnit);
  };

  const handleSaveUpdate = (e) => {
    e.preventDefault();
    if (!selectedStockItem) return;

    const rawEnteredAmount = Number(updateAmount);
    if (isNaN(rawEnteredAmount) || rawEnteredAmount < 0) {
      alert("Iltimos, miqdorni to'g'ri raqamlarda kiriting!"); 
      return;
    }

    const itemBaseUnit = normalizeUnitCode(selectedStockItem.unit || 'kg');
    const currentStockQty = Number(selectedStockItem.quantity ?? selectedStockItem.qty ?? 0) || 0;

    // Foydalanuvchi kiritgan miqdorni (masalan: gr yoki tonna) mahsulotning asosiy birligiga (masalan: kg) o'tkazamiz
    const amountInBaseUnit = convertValueBetweenUnits(rawEnteredAmount, updateInputUnit, itemBaseUnit);

    let diffInBase = 0;
    let newQtyInBase = 0;

    if (updateType === 'kirim') {
      if (amountInBaseUnit <= 0) return;
      newQtyInBase = Number((currentStockQty + amountInBaseUnit).toFixed(6));
      diffInBase = Number(amountInBaseUnit.toFixed(6));
    } else if (updateType === 'chiqim') {
      if (amountInBaseUnit <= 0) return;
      if (amountInBaseUnit > currentStockQty) {
        alert(`⛔️ Omborda yetarli qoldiq yo'q! Joriy qoldiq: ${currentStockQty} ${itemBaseUnit}`);
        return;
      }
      newQtyInBase = Number(Math.max(0, currentStockQty - amountInBaseUnit).toFixed(6));
      diffInBase = -Number(amountInBaseUnit.toFixed(6));
    } else {
      // 'reviziya'
      newQtyInBase = Number(amountInBaseUnit.toFixed(6));
      diffInBase = Number((newQtyInBase - currentStockQty).toFixed(6));
    }

    if (typeof setInventory === 'function') {
      setInventory(prev => prev.map(i => 
        i.id === selectedStockItem.id 
          ? { 
              ...i, 
              quantity: newQtyInBase, 
              qty: newQtyInBase,
              lastUpdated: new Date().toLocaleString() 
            } 
          : i
      ));
    }

    if (typeof setInventoryLogs === 'function' && diffInBase !== 0) {
      const enteredLabel = updateInputUnit !== itemBaseUnit 
        ? ` (Kiritildi: ${rawEnteredAmount} ${updateInputUnit})` 
        : '';

      const logTypeLabel = 
        updateType === 'kirim' ? 'Kirim' : 
        updateType === 'chiqim' ? 'Chiqim' : 'Reviziya';

      const defaultNote = 
        updateType === 'kirim' ? `Ombor kirimi${enteredLabel}` : 
        updateType === 'chiqim' ? `Ombor chiqimi / Spisaniya${enteredLabel}` : 
        `Qoldiq reviziya qilindi${enteredLabel}`;

      const logEntry = {
        id: `${Date.now()}_${Math.random()}`,
        date: new Date().toLocaleString(),
        type: logTypeLabel,
        itemName: selectedStockItem.name,
        productName: selectedStockItem.name,
        diffAmount: diffInBase > 0 ? `+${diffInBase}` : `${diffInBase}`,
        amount: Math.abs(diffInBase),
        unit: itemBaseUnit,
        note: updateNote ? `${updateNote}${enteredLabel}` : defaultNote,
        reason: updateNote ? `${updateNote}${enteredLabel}` : defaultNote,
        user: currentUser?.name || 'Omborchi'
      };
      setInventoryLogs(prev => [logEntry, ...(Array.isArray(prev) ? prev : [])]);
    }

    if (typeof addAuditLog === 'function' && diffInBase !== 0) {
      addAuditLog(
        `Ombor: ${updateType.toUpperCase()}`,
        `${selectedStockItem.name}: ${diffInBase > 0 ? `+${diffInBase}` : diffInBase} ${itemBaseUnit} (Yangi qoldiq: ${newQtyInBase} ${itemBaseUnit})`
      );
    }

    setIsUpdateModalOpen(false);
  };

  // ==========================================
  // 4. FILTRLANGAN RO'YXAT VA YORDAMCHI RENDER
  // ==========================================
  const filteredInventory = useMemo(() => {
    return safeInventory.filter(item => {
      if (!item) return false;

      if (selectedCategory !== 'Barchasi' && (item.category || 'Boshqa') !== selectedCategory) {
        return false;
      }

      const qty = Number(item.quantity ?? item.qty ?? 0) || 0;
      const min = Number(item.minLimit ?? 0) || 0;

      if (stockFilter === 'low' && (qty > min || qty <= 0)) return false;
      if (stockFilter === 'out' && qty > 0) return false;

      if (searchQuery.trim() !== '') {
        return String(item.name || '').toLowerCase().includes(searchQuery.trim().toLowerCase());
      }

      return true;
    });
  }, [safeInventory, selectedCategory, stockFilter, searchQuery]);

  // Mahsulotning gr / kg / tonna ko'rinishini chizib beruvchi funksiya
  const renderMultiUnitBadges = (item) => {
    const qty = Number(item.quantity ?? item.qty ?? 0) || 0;
    const unit = normalizeUnitCode(item.unit || 'kg');
    const breakdown = getMultiScaleBreakdown(qty, unit);

    if (breakdown.family === 'weight') {
      if (displayUnitMode === 'gr') {
        return (
          <div className="font-black text-lg text-indigo-600 dark:text-indigo-400">
            {breakdown.gr.toLocaleString()} <span className="text-xs">gr</span>
          </div>
        );
      }
      if (displayUnitMode === 'kg') {
        return (
          <div className="font-black text-lg text-emerald-600 dark:text-emerald-400">
            {breakdown.kg.toLocaleString()} <span className="text-xs">kg</span>
          </div>
        );
      }
      if (displayUnitMode === 'tonna') {
        return (
          <div className="font-black text-lg text-amber-600 dark:text-amber-400">
            {breakdown.tonna.toLocaleString()} <span className="text-xs">tonna</span>
          </div>
        );
      }

      // 'all' yoki 'auto' rejimda uchala o'lchovni (t / kg / gr) birgalikda ko'rsatadi
      return (
        <div className="space-y-1">
          <div className="font-black text-lg">
            {qty.toLocaleString()} <span className="text-xs font-bold uppercase">{unit}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px] font-black">
            <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/50">
              {breakdown.tonna} t
            </span>
            <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50">
              {breakdown.kg.toLocaleString()} kg
            </span>
            <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50">
              {breakdown.gr.toLocaleString()} gr
            </span>
          </div>
        </div>
      );
    }

    if (breakdown.family === 'volume') {
      return (
        <div className="space-y-1">
          <div className="font-black text-lg">
            {qty.toLocaleString()} <span className="text-xs font-bold uppercase">{unit}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px] font-black">
            <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
              {breakdown.litr.toLocaleString()} litr
            </span>
            <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
              {breakdown.ml.toLocaleString()} ml
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="font-black text-lg">
        {qty.toLocaleString()} <span className="text-xs font-bold text-gray-500 uppercase">{unit}</span>
      </div>
    );
  };

  // Modal ichidagi jonli konvertatsiya preview'si
  const itemModalBreakdown = getMultiScaleBreakdown(itemData.quantity, itemData.unit);
  const selectedItemFamily = selectedStockItem ? getUnitMeta(selectedStockItem.unit).family : 'count';
  const compatibleUpdateUnits = UNIT_OPTIONS.filter(u => u.family === selectedItemFamily);

  // ==========================================
  // 5. RENDER (UI DIZAYN)
  // ==========================================
  return (
    <div className="animate-fade-in space-y-4">
      
      {/* YUQORI BOSHQARUV PANELI: QIDIRUV, FILTR VA YANGI QO'SHISH */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3 bg-gray-50 dark:bg-gray-900/50 p-3.5 rounded-2xl border border-gray-100 dark:border-gray-700">
        
        <div className="flex flex-col sm:flex-row gap-2.5 flex-1">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="🔍 Mahsulot nomini qidiring..."
              className="w-full pl-4 pr-9 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-purple-500"
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

          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-black text-gray-700 dark:text-gray-200 outline-none cursor-pointer"
          >
            <option value="Barchasi">📁 Barcha toifalar ({safeInventory.length})</option>
            {inventoryCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <div className="flex bg-gray-200/70 dark:bg-gray-800 p-1 rounded-xl">
            {[
              { id: 'all', label: 'Barchasi' },
              { id: 'low', label: '⚠️ Kam qoldi' },
              { id: 'out', label: '🛑 Tugagan' }
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStockFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black whitespace-nowrap transition ${
                  stockFilter === f.id
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <button 
          type="button"
          onClick={() => handleOpenItemModal(null)} 
          className="w-full lg:w-auto bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-black transition active:scale-95 shadow-md flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <span className="text-xl leading-none">+</span> Yangi Mahsulot 
        </button>
      </div>

      {/* RO'YXAT BO'SH BO'LSA */}
      {filteredInventory.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-3xl">
          <span className="text-4xl md:text-5xl block mb-2">🗄️</span>
          <p className="font-bold text-gray-400 text-sm md:text-base">
            Omborda mahsulotlar topilmadi.
          </p>
        </div>
      ) : (
        <>
          {/* MOBILE UCHUN KARTOCHKALAR (Card View) */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {filteredInventory.map(item => {
              const qty = Number(item.quantity ?? item.qty ?? 0) || 0;
              const min = Number(item.minLimit ?? 0) || 0;
              const isLow = qty <= min;

              return (
                <div key={item.id} className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                  <div className="flex justify-between items-start mb-4 gap-2">
                    <div>
                      <h3 className="font-black text-gray-900 dark:text-white text-lg">{item.name}</h3>
                      <span className="block text-[11px] text-gray-400 font-bold mb-1 uppercase tracking-wider">
                        {item.category || 'Boshqa'}
                      </span>
                      {isLow && (
                        <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded uppercase font-black animate-pulse inline-block">
                          {qty <= 0 ? 'Tugagan!' : 'Kam qoldi!'}
                        </span>
                      )}
                    </div>
                    <div className={`text-right ${isLow ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {renderMultiUnitBadges(item)}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <button 
                      type="button"
                      onClick={() => handleOpenUpdateModal(item, 'kirim')} 
                      className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 py-2.5 rounded-xl font-black text-xs flex justify-center items-center gap-1 active:scale-95 transition"
                    >
                      📥 Kirim
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleOpenUpdateModal(item, 'chiqim')} 
                      className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 py-2.5 rounded-xl font-black text-xs flex justify-center items-center gap-1 active:scale-95 transition"
                    >
                      📤 Chiqim
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleOpenUpdateModal(item, 'reviziya')} 
                      className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 py-2.5 rounded-xl font-black text-xs flex justify-center items-center gap-1 active:scale-95 transition"
                    >
                      ⚖️ Reviziya
                    </button>
                  </div>

                  <div className="flex justify-end gap-3 pt-3 border-t dark:border-gray-700">
                    <button type="button" onClick={() => handleOpenItemModal(item)} className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                      ✏️ Tahrirlash
                    </button>
                    <button type="button" onClick={() => handleDeleteInventory(item.id, item.name)} className="text-red-500 font-bold text-sm">
                      🗑 O'chirish
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* PLANSHET VA KOMPYUTER UCHUN JADVAL (Table View) */}
          <div className="hidden md:block overflow-x-auto bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b dark:border-gray-700">
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Mahsulot Nomi va Toifasi</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Qoldiq (t / kg / gr)</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Tezkor Amallar</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Tahrirlash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredInventory.map(item => {
                  const qty = Number(item.quantity ?? item.qty ?? 0) || 0;
                  const min = Number(item.minLimit ?? 0) || 0;
                  const isLow = qty <= min;

                  return (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                      <td className="p-4 font-bold text-gray-900 dark:text-gray-100">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black">{item.name}</span>
                          {isLow && (
                            <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded uppercase font-black animate-pulse">
                              {qty <= 0 ? 'Tugagan!' : 'Kam qoldi!'}
                            </span>
                          )}
                        </div>
                        <span className="block text-[11px] text-gray-400 font-bold mt-0.5 uppercase tracking-wider">
                          {item.category || 'Boshqa'} • Min. chegara: {min} {item.unit}
                        </span>
                      </td>

                      <td className={`p-4 ${isLow ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {renderMultiUnitBadges(item)}
                      </td>

                      <td className="p-4 text-center">
                        <div className="flex justify-center gap-2">
                          <button 
                            type="button"
                            onClick={() => handleOpenUpdateModal(item, 'kirim')} 
                            className="bg-emerald-100 dark:bg-emerald-900/30 hover:bg-emerald-200 text-emerald-700 dark:text-emerald-400 px-3.5 py-2 rounded-lg font-bold text-xs transition active:scale-95"
                          >
                            📥 Kirim
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleOpenUpdateModal(item, 'chiqim')} 
                            className="bg-red-100 dark:bg-red-900/30 hover:bg-red-200 text-red-700 dark:text-red-400 px-3.5 py-2 rounded-lg font-bold text-xs transition active:scale-95"
                          >
                            📤 Chiqim
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleOpenUpdateModal(item, 'reviziya')} 
                            className="bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 text-orange-700 dark:text-orange-400 px-3.5 py-2 rounded-lg font-bold text-xs transition active:scale-95"
                          >
                            ⚖️ Reviziya
                          </button>
                        </div>
                      </td>

                      <td className="p-4 text-right space-x-3 whitespace-nowrap">
                        <button type="button" onClick={() => handleOpenItemModal(item)} className="text-indigo-500 hover:text-indigo-700 font-bold text-sm">
                          ✏️ Tahrir
                        </button>
                        <button type="button" onClick={() => handleDeleteInventory(item.id, item.name)} className="text-red-500 hover:text-red-700 font-bold text-sm">
                          🗑 O'chirish
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* =======================================================
          MODAL 1: YANGI MAHSULOT QO'SHISH YOKI TAHRIRLASH
          ======================================================= */}
      {isItemModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center md:p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 w-full md:max-w-xl rounded-t-3xl md:rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
              <h3 className="font-black text-lg text-gray-900 dark:text-white">
                {editingItem ? '✏️ Mahsulotni Tahrirlash' : '📦 Yangi Mahsulot Qo\'shish'}
              </h3>
              <button 
                type="button"
                onClick={() => setIsItemModalOpen(false)} 
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-red-500 font-bold text-lg transition"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSaveItem} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">
                  Mahsulot Nomi *
                </label>
                <input 
                  type="text" 
                  required 
                  value={itemData.name} 
                  onChange={e => setItemData({ ...itemData, name: e.target.value })} 
                  className="w-full p-4 md:p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 outline-none focus:border-purple-500 text-gray-900 dark:text-white transition font-bold" 
                  placeholder="Masalan: Go'sht (Lahm)" 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">
                  Mahsulot Toifasi *
                </label>
                <select 
                  value={itemData.category} 
                  onChange={e => setItemData({ ...itemData, category: e.target.value })} 
                  className="w-full p-4 md:p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 outline-none text-gray-900 dark:text-white cursor-pointer transition font-bold"
                >
                  {inventoryCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">
                    Asosiy O'lchov Birligi *
                  </label>
                  <select 
                    value={itemData.unit} 
                    onChange={e => handleModalUnitChange(e.target.value)} 
                    className="w-full p-4 md:p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 outline-none text-gray-900 dark:text-white cursor-pointer transition font-bold"
                  >
                    {UNIT_OPTIONS.map(u => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">
                    Hozirgi Qoldiq ({itemData.unit}) *
                  </label>
                  <input 
                    type="number" 
                    required 
                    min="0" 
                    step="any" 
                    value={itemData.quantity} 
                    onChange={e => setItemData({ ...itemData, quantity: e.target.value })} 
                    className="w-full p-4 md:p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 outline-none focus:border-purple-500 text-gray-900 dark:text-white transition font-bold" 
                    placeholder="Masalan: 10" 
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">
                    Qizil chegara ({itemData.unit}) *
                  </label>
                  <input 
                    type="number" 
                    required 
                    min="0" 
                    step="any" 
                    value={itemData.minLimit} 
                    onChange={e => setItemData({ ...itemData, minLimit: e.target.value })} 
                    className="w-full p-4 md:p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 outline-none focus:border-purple-500 text-gray-900 dark:text-white transition font-bold" 
                    placeholder="Masalan: 5" 
                  />
                </div>
              </div>

              {/* JONLI KONVERTATSIYA JADVALI (GR / KG / TONNA) */}
              {itemModalBreakdown.isConvertible && Number(itemData.quantity) > 0 && (
                <div className="bg-purple-50 dark:bg-purple-900/20 p-3.5 rounded-2xl border border-purple-200 dark:border-purple-800/50">
                  <p className="text-[10px] font-black uppercase text-purple-600 dark:text-purple-300 mb-2">
                    ⚖️ Avtomatik Birliklar Konvertatsiyasi:
                  </p>
                  {itemModalBreakdown.family === 'weight' ? (
                    <div className="grid grid-cols-3 gap-2 text-center text-xs font-black">
                      <div className="bg-white dark:bg-gray-800 p-2 rounded-xl">
                        <span className="block text-[10px] text-gray-400">TONNA</span>
                        <span className="text-amber-600">{itemModalBreakdown.tonna} t</span>
                      </div>
                      <div className="bg-white dark:bg-gray-800 p-2 rounded-xl">
                        <span className="block text-[10px] text-gray-400">KILOGRAMM</span>
                        <span className="text-emerald-600">{itemModalBreakdown.kg.toLocaleString()} kg</span>
                      </div>
                      <div className="bg-white dark:bg-gray-800 p-2 rounded-xl">
                        <span className="block text-[10px] text-gray-400">GRAMM</span>
                        <span className="text-indigo-600">{itemModalBreakdown.gr.toLocaleString()} gr</span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 text-center text-xs font-black">
                      <div className="bg-white dark:bg-gray-800 p-2 rounded-xl">
                        <span className="block text-[10px] text-gray-400">LITR</span>
                        <span className="text-emerald-600">{itemModalBreakdown.litr.toLocaleString()} l</span>
                      </div>
                      <div className="bg-white dark:bg-gray-800 p-2 rounded-xl">
                        <span className="block text-[10px] text-gray-400">MILLILITR</span>
                        <span className="text-indigo-600">{itemModalBreakdown.ml.toLocaleString()} ml</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setIsItemModalOpen(false)} 
                  className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white py-4 rounded-xl font-bold active:scale-95 transition"
                >
                  Bekor qilish
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-4 rounded-xl font-black shadow-lg shadow-purple-600/30 active:scale-95 transition"
                >
                  Saqlash
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* =======================================================
          MODAL 2: KIRIM, CHIQIM VA REVIZIYA (ISTALGAN BIRLIKDA!)
          ======================================================= */}
      {isUpdateModalOpen && selectedStockItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center md:p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 w-full md:max-w-md rounded-t-3xl md:rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
              <h3 className="font-black text-lg text-gray-900 dark:text-white">
                {updateType === 'kirim' ? '📥 Omborga Kirim Qilish' : updateType === 'chiqim' ? '📤 Ombordan Chiqim Qilish' : '⚖️ Qoldiqni Reviziya Qilish'}
              </h3>
              <button 
                type="button"
                onClick={() => setIsUpdateModalOpen(false)} 
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-red-500 font-bold text-lg transition"
              >
                ✕
              </button>
            </div>
            
            <div className="bg-gray-100 dark:bg-gray-900/50 p-4 rounded-xl flex justify-between items-center border border-gray-200 dark:border-gray-700">
              <span className="font-black text-gray-800 dark:text-gray-200 text-base">
                {selectedStockItem.name}
              </span>
              <span className="text-xs font-bold text-gray-500">
                Joriy: <strong className="text-indigo-600 dark:text-indigo-400 text-base">{selectedStockItem.quantity} {selectedStockItem.unit}</strong>
              </span>
            </div>

            <form onSubmit={handleSaveUpdate} className="space-y-4 pt-1">
              
              {/* QAYSI BIRLIKDA KIRITISHNI TANLASH (GR / KG / TONNA) */}
              {compatibleUpdateUnits.length > 1 && (
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">
                    Qaysi o'lchov birligida kiritasiz?
                  </label>
                  <div className="grid grid-cols-3 gap-2 bg-gray-100 dark:bg-gray-900 p-1 rounded-xl">
                    {compatibleUpdateUnits.map(u => (
                      <button
                        key={u.value}
                        type="button"
                        onClick={() => handleUpdateUnitSwitch(u.value)}
                        className={`py-2 rounded-lg text-xs font-black transition ${
                          updateInputUnit === u.value
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800'
                        }`}
                      >
                        {u.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs md:text-sm font-bold text-gray-500 mb-2">
                  {updateType === 'kirim' 
                    ? `Qancha qo'shyapmiz? (${updateInputUnit})` 
                    : updateType === 'chiqim'
                    ? `Qancha ayiryapmiz? (${updateInputUnit})`
                    : `Omborda ANIQ qancha bor? (${updateInputUnit})`}
                </label>
                <input 
                  type="number" 
                  required 
                  min="0" 
                  step="any" 
                  value={updateAmount} 
                  onChange={e => setUpdateAmount(e.target.value)} 
                  autoFocus 
                  className={`w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-700 border-2 outline-none font-black text-2xl text-center text-gray-900 dark:text-white transition ${
                    updateType === 'kirim' 
                      ? 'border-emerald-500 focus:ring-4 focus:ring-emerald-500/20' 
                      : updateType === 'chiqim'
                      ? 'border-red-500 focus:ring-4 focus:ring-red-500/20'
                      : 'border-orange-500 focus:ring-4 focus:ring-orange-500/20'
                  }`} 
                  placeholder="0" 
                />

                {/* Agar boshqa birlikda kiritilgan bo'lsa, asosiy birlikda qancha bo'lishini ko'rsatadi */}
                {updateAmount !== '' && Number(updateAmount) > 0 && updateInputUnit !== normalizeUnitCode(selectedStockItem.unit) && (
                  <p className="text-xs font-black text-indigo-600 dark:text-indigo-400 text-center mt-2 bg-indigo-50 dark:bg-indigo-900/30 py-1.5 rounded-lg">
                    🔄 Asosiy birlikda: {convertValueBetweenUnits(updateAmount, updateInputUnit, selectedStockItem.unit).toLocaleString()} {selectedStockItem.unit}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">
                  Izoh (ixtiyoriy)
                </label>
                <input 
                  type="text" 
                  value={updateNote} 
                  onChange={e => setUpdateNote(e.target.value)} 
                  className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 outline-none text-gray-900 dark:text-white font-bold transition" 
                  placeholder={updateType === 'kirim' ? "Yuk xati yoki yetkazib beruvchi..." : "Sababi..."} 
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setIsUpdateModalOpen(false)} 
                  className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white py-4 rounded-xl font-bold active:scale-95 transition"
                >
                  Bekor qilish
                </button>
                <button 
                  type="submit" 
                  className={`flex-1 text-white py-4 rounded-xl font-black shadow-lg active:scale-95 transition ${
                    updateType === 'kirim' 
                      ? 'bg-emerald-600 shadow-emerald-600/30' 
                      : updateType === 'chiqim'
                      ? 'bg-red-600 shadow-red-600/30'
                      : 'bg-orange-600 shadow-orange-600/30'
                  }`}
                >
                  Tasdiqlash ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}