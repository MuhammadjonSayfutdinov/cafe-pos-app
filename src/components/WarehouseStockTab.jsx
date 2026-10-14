import React, { useState } from 'react';

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

export default function WarehouseStockTab({ 
  inventory = [], 
  setInventory, 
  setInventoryLogs, 
  currentUser 
}) {
  const safeInventory = Array.isArray(inventory) ? inventory : [];

  // ==========================================
  // MAXSULOT QO'SHISH VA TAHRIRLASH (Toifa bilan)
  // ==========================================
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  const [itemData, setItemData] = useState({ 
    name: '', 
    category: inventoryCategories[0], // YANGI: TOIFA
    unit: 'kg', 
    quantity: '', 
    minLimit: '' 
  });

  const handleOpenItemModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setItemData({ 
        name: item.name, 
        category: item.category || inventoryCategories[7], // Eski mahsulotlar uchun fallback
        unit: item.unit, 
        quantity: item.quantity, 
        minLimit: item.minLimit 
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

  const handleSaveItem = (e) => {
    e.preventDefault();
    const name = itemData.name.trim();
    const category = itemData.category;
    const min = Number(itemData.minLimit);
    const qty = Number(itemData.quantity);

    if (!name || isNaN(min) || isNaN(qty) || min < 0 || qty < 0) {
      alert("Iltimos, ma'lumotlarni to'g'ri (noldan katta) raqamlarda kiriting!"); 
      return;
    }

    if (editingItem) {
      if (typeof setInventory === 'function') {
        setInventory(prev => prev.map(i => 
          i.id === editingItem.id 
            ? { ...i, name, category, unit: itemData.unit, quantity: qty, minLimit: min } 
            : i
        ));
      }
    } else {
      if (typeof setInventory === 'function') {
        setInventory(prev => [
          ...prev, 
          { 
            id: Date.now().toString(), 
            name, 
            category, 
            unit: itemData.unit, 
            quantity: qty, 
            minLimit: min, 
            lastUpdated: new Date().toLocaleString() 
          }
        ]);
      }
    }
    setIsItemModalOpen(false);
  };

  const handleDeleteInventory = (id, name) => {
    if (window.confirm(`Rostdan ham "${name}" ombordan butunlay o'chirilsinmi?`)) {
      if (typeof setInventory === 'function') {
        setInventory(prev => prev.filter(i => i.id !== id));
      }
    }
  };

  // ==========================================
  // KIRIM VA REVIZIYA MODALI
  // ==========================================
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateType, setUpdateType] = useState('kirim'); 
  const [selectedStockItem, setSelectedStockItem] = useState(null);
  const [updateAmount, setUpdateAmount] = useState('');
  const [updateNote, setUpdateNote] = useState(''); 

  const handleOpenUpdateModal = (item, type) => {
    setSelectedStockItem(item);
    setUpdateType(type);
    setUpdateAmount(type === 'reviziya' ? item.quantity : ''); 
    setUpdateNote('');
    setIsUpdateModalOpen(true);
  };

  const handleSaveUpdate = (e) => {
    e.preventDefault();
    const amount = Number(updateAmount);
    if (isNaN(amount) || amount < 0) {
      alert("Iltimos, miqdorni to'g'ri raqamlarda kiriting!"); return;
    }

    let diff = 0;
    let newQty = 0;

    if (updateType === 'kirim') {
      if (amount === 0) return;
      newQty = selectedStockItem.quantity + amount;
      diff = amount;
    } else {
      newQty = amount;
      diff = amount - selectedStockItem.quantity;
    }

    if (typeof setInventory === 'function') {
      setInventory(prev => prev.map(i => 
        i.id === selectedStockItem.id 
          ? { ...i, quantity: newQty, lastUpdated: new Date().toLocaleString() } 
          : i
      ));
    }

    if (typeof setInventoryLogs === 'function' && diff !== 0) {
      const logEntry = {
        id: Date.now().toString(),
        date: new Date().toLocaleString(),
        type: updateType === 'kirim' ? 'Kirim' : 'Reviziya',
        itemName: selectedStockItem.name,
        diffAmount: diff > 0 ? `+${diff}` : `${diff}`,
        unit: selectedStockItem.unit,
        note: updateNote || (updateType === 'kirim' ? 'Oddiy kirim' : 'Qoldiq to\'g\'rilandi'),
        user: currentUser?.name || 'Admin'
      };
      setInventoryLogs(prev => [logEntry, ...prev]);
    }
    setIsUpdateModalOpen(false);
  };

  return (
    <div className="animate-fade-in">
      <div className="flex justify-end mb-4">
        <button 
          onClick={() => handleOpenItemModal(null)} 
          className="w-full md:w-auto bg-purple-600 hover:bg-purple-700 text-white px-6 py-4 md:py-3 rounded-xl font-black transition active:scale-95 shadow-md flex items-center justify-center gap-2"
        >
          <span className="text-xl leading-none">+</span> Yangi Mahsulot 
        </button>
      </div>

      {safeInventory.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-3xl">
          <span className="text-4xl md:text-5xl block mb-2">🗄️</span>
          <p className="font-bold text-gray-400 text-sm md:text-base">Omborda mahsulotlar yaratilmagan.</p>
        </div>
      ) : (
        <>
          {/* MOBILE UCHUN KARTOCHKALAR (Card View) */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {safeInventory.map(item => {
              const isLow = item.quantity <= item.minLimit;
              return (
                <div key={item.id} className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-black text-gray-900 dark:text-white text-lg">{item.name}</h3>
                      {/* TOIFA KO'RSATILDI */}
                      <span className="block text-[11px] text-gray-400 font-bold mb-1 uppercase tracking-wider">{item.category || 'Boshqa'}</span>
                      {isLow && <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded uppercase font-black animate-pulse">Kam qoldi!</span>}
                    </div>
                    <div className="text-right">
                      <span className={`text-xl font-black ${isLow ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {item.quantity}
                      </span>
                      <span className="text-xs font-bold text-gray-500 ml-1">{item.unit}</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button onClick={() => handleOpenUpdateModal(item, 'kirim')} className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 py-3 rounded-xl font-black text-sm flex justify-center items-center gap-1 active:scale-95 transition">
                      📥 Kirim
                    </button>
                    <button onClick={() => handleOpenUpdateModal(item, 'reviziya')} className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 py-3 rounded-xl font-black text-sm flex justify-center items-center gap-1 active:scale-95 transition">
                      ⚖️ Reviziya
                    </button>
                  </div>

                  <div className="flex justify-end gap-3 pt-3 border-t dark:border-gray-700">
                    <button onClick={() => handleOpenItemModal(item)} className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">Tahrirlash</button>
                    <button onClick={() => handleDeleteInventory(item.id, item.name)} className="text-red-500 font-bold text-sm">O'chirish</button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* PLANSHET VA KOMPYUTER UCHUN JADVAL (Table View) */}
          <div className="hidden md:block overflow-x-auto bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b dark:border-gray-700">
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Mahsulot Nomi va Toifasi</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Qoldiq</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Tezkor Amallar</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Tahrirlash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {safeInventory.map(item => {
                  const isLow = item.quantity <= item.minLimit;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                      <td className="p-4 font-bold text-gray-900 dark:text-gray-100">
                        {item.name}
                        {isLow && <span className="ml-2 bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded uppercase font-black animate-pulse">Kam qoldi!</span>}
                        {/* TOIFA KO'RSATILDI */}
                        <span className="block text-[11px] text-gray-400 font-bold mt-0.5 uppercase tracking-wider">{item.category || 'Boshqa'}</span>
                      </td>
                      <td className={`p-4 font-black text-lg ${isLow ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {item.quantity} <span className="text-sm font-bold text-gray-500">{item.unit}</span>
                      </td>
                      <td className="p-4 text-center">
                         <div className="flex justify-center gap-2">
                           <button 
                             onClick={() => handleOpenUpdateModal(item, 'kirim')} 
                             className="bg-emerald-100 dark:bg-emerald-900/30 hover:bg-emerald-200 text-emerald-700 dark:text-emerald-400 px-4 py-2 rounded-lg font-bold text-sm transition active:scale-95"
                           >
                             📥 Kirim qilish
                           </button>
                           <button 
                             onClick={() => handleOpenUpdateModal(item, 'reviziya')} 
                             className="bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 text-orange-700 dark:text-orange-400 px-4 py-2 rounded-lg font-bold text-sm transition active:scale-95"
                           >
                             ⚖️ Reviziya
                           </button>
                         </div>
                      </td>
                      <td className="p-4 text-right space-x-3 whitespace-nowrap">
                        <button onClick={() => handleOpenItemModal(item)} className="text-indigo-500 hover:text-indigo-700 font-bold text-sm">✏️ Tahrir</button>
                        <button onClick={() => handleDeleteInventory(item.id, item.name)} className="text-red-500 hover:text-red-700 font-bold text-sm">🗑 O'chirish</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* =======================================================
          MODAL OYNALAR 
          ======================================================= */}
      {isItemModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center md:p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 w-full md:max-w-xl rounded-t-3xl md:rounded-3xl p-6 shadow-2xl space-y-4">
            
            <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
              <h3 className="font-black text-lg text-gray-900 dark:text-white">
                {editingItem ? '✏️ Mahsulotni Tahrirlash' : '📦 Yangi maxsulot'}
              </h3>
              <button 
                onClick={() => setIsItemModalOpen(false)} 
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-red-500 font-bold text-lg transition"
              >✕</button>
            </div>
            
            <form onSubmit={handleSaveItem} className="space-y-4 pt-2">
              <div>
                 <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Mahsulot Nomi *</label>
                 <input 
                   type="text" required 
                   value={itemData.name} 
                   onChange={e => setItemData({...itemData, name: e.target.value})} 
                   className="w-full p-4 md:p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border outline-none dark:border-gray-600 dark:text-white transition font-bold" 
                   placeholder="Masalan: Go'sht (Lahm)" 
                 />
              </div>

              {/* TOIFA QO'SHILDI */}
              <div>
                 <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Mahsulot Toifasi *</label>
                 <select 
                   value={itemData.category} 
                   onChange={e => setItemData({...itemData, category: e.target.value})} 
                   className="w-full p-4 md:p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border outline-none dark:border-gray-600 dark:text-white cursor-pointer transition font-bold"
                 >
                   {inventoryCategories.map(cat => (
                     <option key={cat} value={cat}>{cat}</option>
                   ))}
                 </select>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                   <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">O'lchov Birligi *</label>
                   <select 
                     value={itemData.unit} 
                     onChange={e => setItemData({...itemData, unit: e.target.value})} 
                     className="w-full p-4 md:p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border outline-none dark:border-gray-600 dark:text-white cursor-pointer transition font-bold"
                   >
                     <option value="kg">Kilogramm (kg)</option>
                     <option value="g">Gramm (g)</option>
                     <option value="litr">Litr (l)</option>
                     <option value="ml">Millilitr (ml)</option>
                     <option value="dona">Dona</option>
                     <option value="quti">Quti (up)</option>
                   </select>
                </div>
                
                <div>
                   <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Hozirgi Qoldiq *</label>
                   <input 
                     type="number" required min="0" step="any" 
                     value={itemData.quantity} 
                     onChange={e => setItemData({...itemData, quantity: e.target.value})} 
                     className="w-full p-4 md:p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border outline-none dark:border-gray-600 dark:text-white transition font-bold" 
                     placeholder="Masalan: 10" 
                   />
                </div>

                <div>
                   <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Qizil chegara *</label>
                   <input 
                     type="number" required min="0" step="any" 
                     value={itemData.minLimit} 
                     onChange={e => setItemData({...itemData, minLimit: e.target.value})} 
                     className="w-full p-4 md:p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border outline-none dark:border-gray-600 dark:text-white transition font-bold" 
                     placeholder="Masalan: 5" 
                   />
                </div>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setIsItemModalOpen(false)} 
                  className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white py-4 rounded-xl font-bold active:scale-95 transition"
                >
                  Bekor
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-purple-600 text-white py-4 rounded-xl font-black shadow-lg shadow-purple-600/30 active:scale-95 transition"
                >
                  Saqlash
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {isUpdateModalOpen && selectedStockItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center md:p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 w-full md:max-w-md rounded-t-3xl md:rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
              <h3 className="font-black text-lg text-gray-900 dark:text-white">
                {updateType === 'kirim' ? '📥 Kirim Qilish' : '⚖ Reviziya'}
              </h3>
              <button onClick={() => setIsUpdateModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-red-500 font-bold text-lg transition">✕</button>
            </div>
            
            <div className="bg-gray-100 dark:bg-gray-900/50 p-4 rounded-xl flex justify-between items-center border border-gray-200 dark:border-gray-700">
              <span className="font-bold text-gray-700 dark:text-gray-300 text-lg">{selectedStockItem.name}</span>
              <span className="text-sm font-bold text-gray-500">Joriy: <span className="text-indigo-500 font-black text-lg">{selectedStockItem.quantity} {selectedStockItem.unit}</span></span>
            </div>

            <form onSubmit={handleSaveUpdate} className="space-y-4 pt-2">
              <div>
                 <label className="block text-xs md:text-sm font-bold text-gray-500 mb-2">
                   {updateType === 'kirim' ? `Qancha qo'shyapmiz? (${selectedStockItem.unit})` : `Omborda ANIQ qancha bor? (${selectedStockItem.unit})`}
                 </label>
                 <input 
                   type="number" required min="0" step="any" 
                   value={updateAmount} 
                   onChange={e => setUpdateAmount(e.target.value)} 
                   autoFocus 
                   className={`w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-700 border-2 outline-none font-black text-2xl text-center text-gray-900 dark:text-white transition ${updateType === 'kirim' ? 'border-emerald-500 focus:ring-4 focus:ring-emerald-500/20' : 'border-orange-500 focus:ring-4 focus:ring-orange-500/20'}`} 
                   placeholder="0" 
                 />
              </div>
              <div>
                 <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Izoh (ixtiyoriy)</label>
                 <input 
                   type="text" 
                   value={updateNote} 
                   onChange={e => setUpdateNote(e.target.value)} 
                   className="w-full p-4 md:p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border outline-none dark:border-gray-600 dark:text-white transition" 
                   placeholder={updateType === 'kirim' ? "Kirim xati raqami..." : "Sababi..."} 
                 />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsUpdateModalOpen(false)} className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white py-4 rounded-xl font-bold active:scale-95 transition">Bekor</button>
                <button type="submit" className={`flex-1 text-white py-4 rounded-xl font-black shadow-lg active:scale-95 transition ${updateType === 'kirim' ? 'bg-emerald-600 shadow-emerald-600/30' : 'bg-orange-600 shadow-orange-600/30'}`}>Tasdiqlash</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}