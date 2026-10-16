import React, { useState, useMemo } from 'react';

// O'lchov birliklari va konvertatsiya koeffitsiyentlari
const UNIT_META = [
  { value: 'gr', label: 'Gramm (gr)', short: 'gr', family: 'weight', factor: 1 },
  { value: 'kg', label: 'Kilogramm (kg)', short: 'kg', family: 'weight', factor: 1000 },
  { value: 'tonna', label: 'Tonna (t)', short: 't', family: 'weight', factor: 1000000 },
  { value: 'ml', label: 'Millilitr (ml)', short: 'ml', family: 'volume', factor: 1 },
  { value: 'litr', label: 'Litr (l)', short: 'l', family: 'volume', factor: 1000 },
  { value: 'dona', label: 'Dona', short: 'dona', family: 'count', factor: 1 },
  { value: 'porsiya', label: 'Porsiya', short: 'pors', family: 'count', factor: 1 },
  { value: 'boglam', label: "Bog'lam", short: "bog'lam", family: 'count', factor: 1 },
  { value: 'qadoq', label: 'Qadoq', short: 'qadoq', family: 'count', factor: 1 },
  { value: 'qop', label: 'Qop', short: 'qop', family: 'count', factor: 1 },
  { value: 'quti', label: 'Quti', short: 'quti', family: 'count', factor: 1 }
];

const normalizeUnit = (unitStr) => {
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

const getUnitInfo = (unitStr) => {
  const norm = normalizeUnit(unitStr);
  return UNIT_META.find(u => u.value === norm) || {
    value: norm,
    label: norm,
    short: norm,
    family: 'count',
    factor: 1
  };
};

// Qiymatni bir birlikdan ikkinchisiga o'girish (gr <-> kg <-> tonna va ml <-> litr)
const convertUnits = (amount, fromUnit, toUnit) => {
  const num = Number(amount) || 0;
  const fromInfo = getUnitInfo(fromUnit);
  const toInfo = getUnitInfo(toUnit);

  if (fromInfo.value === toInfo.value) return num;
  if (fromInfo.family !== toInfo.family) return num;

  const inSmallest = num * fromInfo.factor;
  return Number((inSmallest / toInfo.factor).toFixed(6));
};

// Og'irlik/hajmni uchala birlikda formatlash
const formatTripleScale = (amount, unit) => {
  const num = Number(amount) || 0;
  const info = getUnitInfo(unit);

  if (info.family === 'weight') {
    const gr = Number(convertUnits(num, info.value, 'gr').toFixed(2));
    const kg = Number(convertUnits(num, info.value, 'kg').toFixed(4));
    const t = Number(convertUnits(num, info.value, 'tonna').toFixed(6));
    return `${t} t  |  ${kg.toLocaleString()} kg  |  ${gr.toLocaleString()} gr`;
  }

  if (info.family === 'volume') {
    const ml = Number(convertUnits(num, info.value, 'ml').toFixed(2));
    const l = Number(convertUnits(num, info.value, 'litr').toFixed(4));
    return `${l.toLocaleString()} litr  |  ${ml.toLocaleString()} ml`;
  }

  return `${num.toLocaleString()} ${info.short}`;
};

export default function WarehousePrepTab({ 
  inventory = [], 
  setInventory,
  setInventoryLogs,
  currentUser,
  addAuditLog 
}) {
  const safeInventory = Array.isArray(inventory) ? inventory : [];

  // ==========================================
  // 1. STATE'LAR
  // ==========================================
  // Ishlab chiqariladigan (tayyorlanadigan) mahsulot va uning kiritish birligi
  const [targetItemId, setTargetItemId] = useState('');
  const [produceQty, setProduceQty] = useState('');
  const [produceUnit, setProduceUnit] = useState('kg');
  const [prepNote, setPrepNote] = useState('');
  
  // Sarflanadigan xomashyolar ro'yxati (Retsept) — har birining o'z birligi bor
  const [ingredients, setIngredients] = useState([
    { inventoryId: '', qty: '', inputUnit: 'kg' }
  ]);

  // Tanlangan tayyorlanuvchi mahsulot obyekti
  const targetItem = useMemo(() => {
    return safeInventory.find(i => i && String(i.id) === String(targetItemId)) || null;
  }, [safeInventory, targetItemId]);

  // ==========================================
  // 2. FORMA BOSHQARUV FUNKSIYALARI
  // ==========================================
  const handleSelectTargetItem = (newId) => {
    setTargetItemId(newId);
    const found = safeInventory.find(i => i && String(i.id) === String(newId));
    if (found) {
      setProduceUnit(normalizeUnit(found.unit || 'kg'));
    }
    // Agar xomashyolar ichida shu mahsulot tanlangan bo'lsa, uni tozalaymiz (o'zidan o'zini yasamaslik uchun)
    setIngredients(prev =>
      prev.map(ing =>
        String(ing.inventoryId) === String(newId)
          ? { inventoryId: '', qty: '', inputUnit: 'kg' }
          : ing
      )
    );
  };

  const handleAddIngredient = () => {
    setIngredients(prev => [...prev, { inventoryId: '', qty: '', inputUnit: 'kg' }]);
  };

  const handleRemoveIngredient = (index) => {
    if (ingredients.length <= 1) return;
    setIngredients(prev => prev.filter((_, i) => i !== index));
  };

  const handleIngredientChange = (index, field, value) => {
    setIngredients(prev =>
      prev.map((ing, i) => {
        if (i !== index) return ing;

        // Agar xomashyo o'zgarsa, uning standart birligini avtomatik qo'yamiz
        if (field === 'inventoryId') {
          const selectedInv = safeInventory.find(inv => inv && String(inv.id) === String(value));
          const defaultUnit = selectedInv ? normalizeUnit(selectedInv.unit) : 'kg';
          return { ...ing, inventoryId: value, inputUnit: defaultUnit };
        }

        return { ...ing, [field]: value };
      })
    );
  };

  // Ma'lum bir mahsulot uchun mos tushadigan birliklar ro'yxati (masalan: gr, kg, tonna)
  const getCompatibleUnitsForItem = (invItem) => {
    if (!invItem) return UNIT_META;
    const itemInfo = getUnitInfo(invItem.unit);
    if (itemInfo.family === 'weight' || itemInfo.family === 'volume') {
      return UNIT_META.filter(u => u.family === itemInfo.family);
    }
    return [itemInfo];
  };

  // ==========================================
  // 3. TAYYORLOV AKTINI BAJARISH VA VALIDATSIYA
  // ==========================================
  const handleProduce = (e) => {
    e.preventDefault();

    if (!targetItem || !produceQty || Number(produceQty) <= 0) {
      alert("Iltimos, tayyorlanadigan mahsulotni va miqdorini to'g'ri kiriting!");
      return;
    }

    // 1. Har bir qator to'ldirilganini tekshiramiz va bir xil xomashyolarni umumlashtiramiz
    const requiredByItemId = {};

    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      const rawQty = Number(ing.qty);

      if (!ing.inventoryId || isNaN(rawQty) || rawQty <= 0) {
        alert(`${i + 1}-qatordagi xomashyo va sarf miqdorini to'g'ri kiriting!`);
        return;
      }

      const invItem = safeInventory.find(inv => inv && String(inv.id) === String(ing.inventoryId));
      if (!invItem) {
        alert(`${i + 1}-qatordagi xomashyo omborda topilmadi!`);
        return;
      }

      const itemBaseUnit = normalizeUnit(invItem.unit);
      const convertedNeedInBase = convertUnits(rawQty, ing.inputUnit || itemBaseUnit, itemBaseUnit);

      const key = String(invItem.id);
      if (!requiredByItemId[key]) {
        requiredByItemId[key] = {
          item: invItem,
          baseUnit: itemBaseUnit,
          totalNeededInBase: 0,
          inputDetails: []
        };
      }
      requiredByItemId[key].totalNeededInBase = Number(
        (requiredByItemId[key].totalNeededInBase + convertedNeedInBase).toFixed(6)
      );
      requiredByItemId[key].inputDetails.push(`${rawQty} ${ing.inputUnit || itemBaseUnit}`);
    }

    // 2. Omborda qoldiq yetarli ekanligini tekshiramiz
    for (const key of Object.keys(requiredByItemId)) {
      const req = requiredByItemId[key];
      const availableInBase = Number(req.item.quantity ?? req.item.qty ?? 0) || 0;

      if (availableInBase < req.totalNeededInBase) {
        alert(
          `⛔️ Diqqat! "${req.item.name}" xomashyosi omborda yetarli emas!\n\n` +
          `Talab qilingan: ${req.totalNeededInBase} ${req.baseUnit} (${req.inputDetails.join(' + ')})\n` +
          `Ombordagi qoldiq: ${availableInBase} ${req.baseUnit}`
        );
        return;
      }
    }

    const targetBaseUnit = normalizeUnit(targetItem.unit);
    const producedInTargetBase = convertUnits(produceQty, produceUnit, targetBaseUnit);

    if (
      !window.confirm(
        `Tayyorlov aktini tasdiqlaysizmi?\n\n` +
        `➕ Kirim: +${producedInTargetBase} ${targetBaseUnit} "${targetItem.name}"\n` +
        `➖ Xomashyolar ombordan avtomatik yechiladi.`
      )
    ) {
      return;
    }

    const newInventory = [...safeInventory];
    const logs = [];
    const dateNow = new Date().toLocaleString();

    // 3. Xomashyolarni ombordan minus qilish
    Object.values(requiredByItemId).forEach(req => {
      const invIdx = newInventory.findIndex(i => i && String(i.id) === String(req.item.id));
      if (invIdx === -1) return;

      const usedItem = newInventory[invIdx];
      const oldQty = Number(usedItem.quantity ?? usedItem.qty ?? 0) || 0;
      const newQty = Math.max(0, Number((oldQty - req.totalNeededInBase).toFixed(6)));

      newInventory[invIdx] = { 
        ...usedItem, 
        quantity: newQty,
        qty: newQty,
        lastUpdated: dateNow
      };

      const detailStr = req.inputDetails.join(' + ');
      logs.push({
        id: `${Date.now()}_${Math.random()}`,
        date: dateNow,
        type: 'Chiqim (Tayyorlov)',
        itemName: usedItem.name,
        productName: usedItem.name,
        diffAmount: `-${req.totalNeededInBase}`,
        amount: req.totalNeededInBase,
        unit: req.baseUnit,
        note: `"${targetItem.name}" tayyorlash uchun sarf (${detailStr})${prepNote ? ` • ${prepNote}` : ''}`,
        reason: `"${targetItem.name}" tayyorlash uchun sarf (${detailStr})`,
        user: currentUser?.name || 'Omborchi'
      });
    });

    // 4. Tayyorlangan mahsulotni omborga plus qilish
    const targetIdx = newInventory.findIndex(i => i && String(i.id) === String(targetItem.id));
    if (targetIdx !== -1) {
      const currentTargetQty = Number(newInventory[targetIdx].quantity ?? newInventory[targetIdx].qty ?? 0) || 0;
      const updatedTargetQty = Number((currentTargetQty + producedInTargetBase).toFixed(6));

      newInventory[targetIdx] = {
        ...newInventory[targetIdx],
        quantity: updatedTargetQty,
        qty: updatedTargetQty,
        lastUpdated: dateNow
      };

      const enteredUnitNote = produceUnit !== targetBaseUnit ? ` (${produceQty} ${produceUnit})` : '';
      logs.push({
        id: `${Date.now()}_${Math.random()}`,
        date: dateNow,
        type: 'Kirim (Tayyorlov)',
        itemName: targetItem.name,
        productName: targetItem.name,
        diffAmount: `+${producedInTargetBase}`,
        amount: producedInTargetBase,
        unit: targetBaseUnit,
        note: `Ishlab chiqarish akti${enteredUnitNote}${prepNote ? ` • ${prepNote}` : ''}`,
        reason: `Ishlab chiqarish akti${enteredUnitNote}`,
        user: currentUser?.name || 'Omborchi'
      });
    }

    // 5. Bazani yangilash
    if (typeof setInventory === 'function') {
      setInventory(newInventory);
    }
    if (typeof setInventoryLogs === 'function') {
      setInventoryLogs(prev => [...logs, ...(Array.isArray(prev) ? prev : [])]);
    }
    
    if (typeof addAuditLog === 'function') {
      addAuditLog(
        "Tayyorlov Akti", 
        `+${producedInTargetBase} ${targetBaseUnit} "${targetItem.name}" ishlab chiqarildi`
      );
    }

    // Formani tozalash
    setTargetItemId('');
    setProduceQty('');
    setPrepNote('');
    setIngredients([{ inventoryId: '', qty: '', inputUnit: 'kg' }]);
    alert(`✅ Tayyorlov akti muvaffaqiyatli bajarildi!\n+${producedInTargetBase} ${targetBaseUnit} "${targetItem.name}" omborga kirim qilindi.`);
  };

  // ==========================================
  // 4. RENDER (UI DIZAYN)
  // ==========================================
  const targetCompatibleUnits = getCompatibleUnitsForItem(targetItem);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 p-6 md:p-8 max-w-4xl mx-auto animate-fade-in shadow-sm">
      
      <div className="mb-8">
        <h2 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
          <span>🔪</span> Tayyorlov Akti (Ishlab chiqarish va Konvertatsiya)
        </h2>
        <p className="text-xs sm:text-sm font-bold text-gray-500 mt-1">
          Ombordagi xomashyolarni gramm, kilogramm yoki tonnada sarflab, yangi yarim-tayyor mahsulot (masalan: Qiyma, Xamir, Sous) yaratish bo'limi.
        </p>
      </div>

      {safeInventory.length < 2 ? (
        <div className="p-8 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-center space-y-2">
          <span className="text-4xl block">📦</span>
          <h3 className="font-black text-amber-800 dark:text-amber-300">
            Tayyorlov akti uchun omborda kamida 2 xil mahsulot bo'lishi kerak
          </h3>
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
            Avval "Ombor Qoldig'i" bo'limida xomashyolarni va tayyorlanadigan mahsulot nomini yarating.
          </p>
        </div>
      ) : (
        <form onSubmit={handleProduce} className="space-y-8">
          
          {/* =======================================================
              QISM 1: NIMA ISHLAB CHIQARILYAPTI?
              ======================================================= */}
          <div className="bg-emerald-50 dark:bg-emerald-900/10 p-6 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 space-y-4">
            <h3 className="font-black text-emerald-800 dark:text-emerald-400 uppercase text-xs tracking-widest">
              1. Tayyorlanayotgan Mahsulot (Omborga +Kirim bo'ladi)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Mahsulot tanlash */}
              <div className="md:col-span-6">
                <label className="block text-xs font-bold text-gray-500 mb-2">
                  Mahsulotni tanlang *
                </label>
                <select 
                  value={targetItemId} 
                  onChange={e => handleSelectTargetItem(e.target.value)} 
                  required
                  className="w-full p-3.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-gray-900 dark:text-white outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">-- Tanlang --</option>
                  {safeInventory.map(i => (
                    <option key={i.id} value={String(i.id)}>
                      {i.name} (Joriy qoldiq: {i.quantity} {i.unit})
                    </option>
                  ))}
                </select>
              </div>

              {/* Miqdor */}
              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-gray-500 mb-2">
                  Ishlab chiqarish miqdori *
                </label>
                <input 
                  type="number" 
                  value={produceQty} 
                  onChange={e => setProduceQty(e.target.value)} 
                  required 
                  min="0.0001" 
                  step="any"
                  placeholder="Masalan: 5"
                  className="w-full p-3.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-gray-900 dark:text-white outline-none focus:border-emerald-500"
                />
              </div>

              {/* O'lchov birligi (gr / kg / tonna) */}
              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-gray-500 mb-2">
                  O'lchov birligi *
                </label>
                <select
                  value={produceUnit}
                  onChange={e => setProduceUnit(e.target.value)}
                  disabled={!targetItem}
                  className="w-full p-3.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-emerald-600 dark:text-emerald-400 outline-none cursor-pointer disabled:opacity-50"
                >
                  {targetCompatibleUnits.map(u => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Jonli konvertatsiya ko'rsatkichi */}
            {targetItem && Number(produceQty) > 0 && (
              <div className="bg-white/80 dark:bg-gray-900/60 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/50 flex flex-wrap justify-between items-center gap-2 text-xs font-black">
                <span className="text-gray-500">
                  ⚖️ Uchlik o'lchovda: <strong className="text-gray-900 dark:text-white">{formatTripleScale(produceQty, produceUnit)}</strong>
                </span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  Ombor birligida qo'shiladi: +{convertUnits(produceQty, produceUnit, targetItem.unit).toLocaleString()} {targetItem.unit}
                </span>
              </div>
            )}
          </div>

          {/* =======================================================
              QISM 2: NIMALAR SARFLANYAPTI? (RETSEPT XOMASHYOLARI)
              ======================================================= */}
          <div className="bg-amber-50 dark:bg-amber-900/10 p-6 rounded-2xl border border-amber-100 dark:border-amber-900/30 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-amber-800 dark:text-amber-400 uppercase text-xs tracking-widest">
                2. Sarflanadigan Xomashyolar (Ombordan -Chiqim bo'ladi)
              </h3>
              <button 
                type="button" 
                onClick={handleAddIngredient}
                className="text-amber-700 dark:text-amber-300 bg-amber-200/70 dark:bg-amber-900/40 hover:bg-amber-200 px-3.5 py-2 rounded-xl text-xs font-black transition active:scale-95"
              >
                + Xomashyo Qo'shish
              </button>
            </div>

            <div className="space-y-4">
              {ingredients.map((ing, idx) => {
                const selectedIngItem = safeInventory.find(
                  i => i && String(i.id) === String(ing.inventoryId)
                );
                const compatibleIngUnits = getCompatibleUnitsForItem(selectedIngItem);
                const neededInBase = selectedIngItem && Number(ing.qty) > 0
                  ? convertUnits(ing.qty, ing.inputUnit, selectedIngItem.unit)
                  : 0;
                const currentStock = Number(selectedIngItem?.quantity ?? selectedIngItem?.qty ?? 0) || 0;
                const isEnough = !selectedIngItem || neededInBase <= currentStock;

                return (
                  <div 
                    key={idx} 
                    className={`p-4 rounded-2xl bg-white dark:bg-gray-900 border-2 space-y-2.5 ${
                      !isEnough 
                        ? 'border-red-400 dark:border-red-600' 
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row gap-3 items-end">
                      {/* Xomashyo tanlash */}
                      <div className="flex-1 w-full">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                          Xomashyo #{idx + 1} *
                        </label>
                        <select 
                          value={ing.inventoryId}
                          onChange={e => handleIngredientChange(idx, 'inventoryId', e.target.value)}
                          required
                          className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-bold text-sm text-gray-900 dark:text-white outline-none cursor-pointer"
                        >
                          <option value="">-- Xomashyoni tanlang --</option>
                          {safeInventory
                            .filter(i => i && String(i.id) !== String(targetItemId))
                            .map(i => (
                              <option key={i.id} value={String(i.id)}>
                                {i.name} — Qoldiq: {i.quantity} {i.unit}
                              </option>
                            ))}
                        </select>
                      </div>

                      {/* Sarf miqdori */}
                      <div className="w-full sm:w-36 shrink-0">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                          Sarf miqdori *
                        </label>
                        <input 
                          type="number" 
                          value={ing.qty}
                          onChange={e => handleIngredientChange(idx, 'qty', e.target.value)}
                          required 
                          min="0.0001" 
                          step="any"
                          placeholder="Miqdor"
                          className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white outline-none focus:border-amber-500"
                        />
                      </div>

                      {/* Sarf birligi (gr / kg / tonna) */}
                      <div className="w-full sm:w-40 shrink-0">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                          Birligi (gr/kg/t) *
                        </label>
                        <select
                          value={ing.inputUnit}
                          onChange={e => handleIngredientChange(idx, 'inputUnit', e.target.value)}
                          disabled={!selectedIngItem}
                          className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-black text-sm text-amber-600 dark:text-amber-400 outline-none cursor-pointer disabled:opacity-50"
                        >
                          {compatibleIngUnits.map(u => (
                            <option key={u.value} value={u.value}>{u.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Qatorni o'chirish */}
                      {ingredients.length > 1 && (
                        <button 
                          type="button" 
                          onClick={() => handleRemoveIngredient(idx)}
                          className="w-11 h-11 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 text-red-500 rounded-xl font-black shrink-0 transition active:scale-95 flex items-center justify-center"
                          title="Xomashyoni o'chirish"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Xomashyo konvertatsiyasi va qoldiq tekshiruvi */}
                    {selectedIngItem && Number(ing.qty) > 0 && (
                      <div className="flex flex-wrap justify-between items-center gap-2 pt-1 text-[11px] font-black">
                        <span className="text-gray-400">
                          🔄 {formatTripleScale(ing.qty, ing.inputUnit)}
                        </span>
                        <span className={isEnough ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 animate-pulse'}>
                          {isEnough 
                            ? `Ombordan ayriladi: -${neededInBase} ${selectedIngItem.unit} (Qoladi: ${Number((currentStock - neededInBase).toFixed(4))} ${selectedIngItem.unit})`
                            : `⛔️ Yetarli emas! Kerak: ${neededInBase} ${selectedIngItem.unit}, Omborda bor: ${currentStock} ${selectedIngItem.unit}`}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* QO'SHIMCHA IZOH */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
              Tayyorlov izohi (Ixtiyoriy)
            </label>
            <input
              type="text"
              value={prepNote}
              onChange={e => setPrepNote(e.target.value)}
              placeholder="Masalan: Ertalabki smena uchun somsa xamiri..."
              className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-sm text-gray-900 dark:text-white outline-none focus:border-amber-500"
            />
          </div>

          {/* TASDIQLASH TUGMASI */}
          <button 
            type="submit"
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black py-4 rounded-xl shadow-lg shadow-amber-500/30 transition active:scale-95 uppercase tracking-widest text-base sm:text-lg"
          >
            🔪 Tayyorlov Aktini Tasdiqlash
          </button>

        </form>
      )}
    </div>
  );
}