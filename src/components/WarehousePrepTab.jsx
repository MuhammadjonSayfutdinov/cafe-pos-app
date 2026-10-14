import React, { useState } from 'react';

export default function WarehousePrepTab({ 
  inventory = [], 
  setInventory,
  setInventoryLogs,
  currentUser,
  addAuditLog 
}) {
  // Ishlab chiqariladigan mahsulot
  const [targetItemId, setTargetItemId] = useState('');
  const [produceQty, setProduceQty] = useState('');
  
  // Sarflanadigan xomashyolar ro'yxati (Retsept)
  const [ingredients, setIngredients] = useState([{ inventoryId: '', qty: '' }]);

  const handleAddIngredient = () => {
    setIngredients([...ingredients, { inventoryId: '', qty: '' }]);
  };

  const handleRemoveIngredient = (index) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const handleIngredientChange = (index, field, value) => {
    const newIngs = [...ingredients];
    newIngs[index][field] = value;
    setIngredients(newIngs);
  };

  const handleProduce = (e) => {
    e.preventDefault();

    if (!targetItemId || !produceQty || Number(produceQty) <= 0) {
      alert("Tayyorlanadigan mahsulot va miqdorni to'g'ri kiriting!");
      return;
    }

    // Xomashyolarni validatsiya qilish
    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      if (!ing.inventoryId || !ing.qty || Number(ing.qty) <= 0) {
        alert(`${i + 1}-qator xomashyosini to'liq kiriting!`);
        return;
      }
      
      const invItem = inventory.find(inv => inv.id === ing.inventoryId);
      if (!invItem || invItem.quantity < Number(ing.qty)) {
        alert(`Diqqat! "${invItem ? invItem.name : 'Noma\'lum'}" xomashyosi omborda yetarli emas. \nKerak: ${ing.qty}, Qoldiq: ${invItem?.quantity || 0}`);
        return;
      }
    }

    if (!window.confirm("Tayyorlov aktini tasdiqlaysizmi? Xomashyolar yechiladi.")) return;

    const newInventory = [...inventory];
    const logs = [];
    const dateNow = new Date().toLocaleString();
    const targetItem = inventory.find(i => i.id === targetItemId);

    // 1. Xomashyolarni ombordan minus qilish
    ingredients.forEach(ing => {
      const invIdx = newInventory.findIndex(i => i.id === ing.inventoryId);
      const usedQty = Number(ing.qty);
      const usedItem = newInventory[invIdx];

      newInventory[invIdx] = { 
        ...usedItem, 
        quantity: usedItem.quantity - usedQty,
        lastUpdated: dateNow
      };

      logs.push({
        id: Date.now().toString() + Math.random(),
        date: dateNow,
        type: 'Chiqim (Tayyorlov)',
        itemName: usedItem.name,
        diffAmount: `-${usedQty}`,
        unit: usedItem.unit,
        note: `${targetItem.name} tayyorlash uchun sarf`,
        user: currentUser?.name || 'Omborchi'
      });
    });

    // 2. Tayyorlangan mahsulotni omborga plus qilish
    const targetIdx = newInventory.findIndex(i => i.id === targetItemId);
    const prodQty = Number(produceQty);
    
    newInventory[targetIdx] = {
      ...targetItem,
      quantity: targetItem.quantity + prodQty,
      lastUpdated: dateNow
    };

    logs.push({
      id: Date.now().toString() + Math.random(),
      date: dateNow,
      type: 'Kirim (Tayyorlov)',
      itemName: targetItem.name,
      diffAmount: `+${prodQty}`,
      unit: targetItem.unit,
      note: 'Ishlab chiqarish akti',
      user: currentUser?.name || 'Omborchi'
    });

    // Bazani yangilash
    if (typeof setInventory === 'function') setInventory(newInventory);
    if (typeof setInventoryLogs === 'function') {
      setInventoryLogs(prev => [...logs, ...prev]);
    }
    
    if (typeof addAuditLog === 'function') {
      addAuditLog("Tayyorlov Akti", `${prodQty} ${targetItem.unit} ${targetItem.name} ishlab chiqarildi.`);
    }

    // Formani tozalash
    setTargetItemId('');
    setProduceQty('');
    setIngredients([{ inventoryId: '', qty: '' }]);
    alert("✅ Tayyorlov akti muvaffaqiyatli bajarildi!");
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 p-6 md:p-8 max-w-4xl mx-auto animate-fade-in shadow-sm">
      
      <div className="mb-8">
        <h2 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
          <span>🔪</span> Tayyorlov Akti (Ishlab chiqarish)
        </h2>
        <p className="text-sm font-bold text-gray-500 mt-2">
          Ombordagi xomashyolarni sarflab, yangi yarim-tayyor mahsulot (masalan, Qiymat, Xamir) yaratish bo'limi.
        </p>
      </div>

      <form onSubmit={handleProduce} className="space-y-8">
        
        {/* QISM 1: NIMA ISHLAB CHIQARILYAPTI? */}
        <div className="bg-emerald-50 dark:bg-emerald-900/10 p-6 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
          <h3 className="font-black text-emerald-800 dark:text-emerald-400 mb-4 uppercase text-xs tracking-widest">
            1. Tayyorlanayotgan Mahsulot
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2">Mahsulotni tanlang:</label>
              <select 
                value={targetItemId} 
                onChange={e => setTargetItemId(e.target.value)} 
                required
                className="w-full p-3.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold"
              >
                <option value="">-- Tanlang --</option>
                {inventory.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2">Miqdori:</label>
              <input 
                type="number" 
                value={produceQty} 
                onChange={e => setProduceQty(e.target.value)} 
                required min="0.01" step="0.01"
                placeholder="Masalan: 5"
                className="w-full p-3.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold"
              />
            </div>
          </div>
        </div>

        {/* QISM 2: NIMALAR SARFLANYAPTI? */}
        <div className="bg-amber-50 dark:bg-amber-900/10 p-6 rounded-2xl border border-amber-100 dark:border-amber-900/30">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-black text-amber-800 dark:text-amber-400 uppercase text-xs tracking-widest">
              2. Sarflanadigan Xomashyolar
            </h3>
            <button 
              type="button" 
              onClick={handleAddIngredient}
              className="text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 rounded-lg text-xs font-black transition active:scale-95"
            >
              + Xomashyo Qo'shish
            </button>
          </div>

          <div className="space-y-3">
            {ingredients.map((ing, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-[10px] font-bold text-gray-400 mb-1">Xomashyo {idx + 1}</label>
                  <select 
                    value={ing.inventoryId}
                    onChange={e => handleIngredientChange(idx, 'inventoryId', e.target.value)}
                    required
                    className="w-full p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-sm"
                  >
                    <option value="">-- Tanlang --</option>
                    {inventory.filter(i => i.id !== targetItemId).map(i => (
                      <option key={i.id} value={i.id}>{i.name} (Qoldiq: {i.quantity} {i.unit})</option>
                    ))}
                  </select>
                </div>
                <div className="w-full sm:w-32 shrink-0">
                  <label className="block text-[10px] font-bold text-gray-400 mb-1">Sarf miqdori</label>
                  <input 
                    type="number" 
                    value={ing.qty}
                    onChange={e => handleIngredientChange(idx, 'qty', e.target.value)}
                    required min="0.01" step="0.01"
                    placeholder="Miqdor"
                    className="w-full p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-sm"
                  />
                </div>
                {ingredients.length > 1 && (
                  <button 
                    type="button" 
                    onClick={() => handleRemoveIngredient(idx)}
                    className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-xl font-black shrink-0 transition active:scale-95"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* TASDIQLASH */}
        <button 
          type="submit"
          className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black py-4 rounded-xl shadow-lg shadow-amber-500/30 transition active:scale-95 uppercase tracking-widest text-lg"
        >
          Akti tasdiqlash
        </button>

      </form>
    </div>
  );
}