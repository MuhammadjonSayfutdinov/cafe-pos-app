import React, { useState } from 'react';
import WaiterTableGrid from './WaiterTableGrid';
import WaiterMenu from './WaiterMenu';
import WaiterCart from './WaiterCart';

export default function WaiterMode({ 
  menuItems = [],
  menuCategories = [],
  tables = [],
  orders = [],
  setOrders,
  onOrderSubmit,
  onUpdateStatus,
  onTransferTable,
  onSplitOrder,
  onShowQrTable,
  waiterCalls = [],
  onClearCall,
  currentUser,
  waiterCanSeeSales = false,
  serviceFee = 0,
  requireAdminOverride
}) {
  // ==========================================
  // 1. STATE'LAR
  // ==========================================
  const [selectedTable, setSelectedTable] = useState(null);
  const [cart, setCart] = useState([]);
  
  // Agar taomda bir nechta variant (0.5 / 1 porsiya) bo'lsa, tanlash modali uchun
  const [variantModalItem, setVariantModalItem] = useState(null);

  // Stolni ko'chirish va chekni bo'lish modallari uchun
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [targetTable, setTargetTable] = useState('');
  const [isSplitOpen, setIsSplitOpen] = useState(false);
  const [splitSelection, setSplitSelection] = useState({});

  // ==========================================
  // 2. TANLANGAN STOLGA OID BUYURTMALAR
  // ==========================================
  const activeTableOrders = selectedTable
    ? orders.filter(o => o.table === selectedTable && o.status !== "To'langan" && o.status !== 'Qarz')
    : [];
  const isOccupied = activeTableOrders.length > 0;

  // ==========================================
  // 3. SAVAT BILAN ISHLASH MANTIG'I (variants bilan)
  // ==========================================
  const handleSelectTable = (table) => {
    setSelectedTable(table);
    setCart([]);
  };

  const handleAddItem = (item) => {
    if (!selectedTable) {
      alert("Iltimos, avval chap tomondan stolni tanlang!");
      return;
    }

    const variants = Array.isArray(item.variants) && item.variants.length > 0
      ? item.variants
      : [{ name: 'Standart', price: Number(item.price || 0) }];

    if (variants.length > 1) {
      setVariantModalItem(item);
    } else {
      addVariantToCart(item, variants[0]);
    }
  };

  const addVariantToCart = (item, variant) => {
    const variantName = variant?.name || 'Standart';
    const variantPrice = Number(variant?.price ?? item.price ?? 0);
    const cartItemId = `${item.id}_${variantName}`;
    const displayName = item.variants && item.variants.length > 1
      ? `${item.name} (${variantName})`
      : item.name;

    setCart(prev => {
      const existing = prev.find(i => i.cartItemId === cartItemId);
      if (existing) {
        return prev.map(i => 
          i.cartItemId === cartItemId 
            ? { ...i, quantity: i.quantity + 1 } 
            : i
        );
      }
      return [
        ...prev,
        {
          cartItemId,
          id: item.id,
          name: displayName,
          baseName: item.name,
          variantName,
          price: variantPrice,
          quantity: 1,
          category: item.category
        }
      ];
    });
    setVariantModalItem(null);
  };

  const handleUpdateQuantity = (cartItemId, delta) => {
    setCart(prev => 
      prev
        .map(item => 
          item.cartItemId === cartItemId 
            ? { ...item, quantity: item.quantity + delta } 
            : item
        )
        .filter(item => item.quantity > 0)
    );
  };

  const handleRemoveItem = (cartItemId) => {
    setCart(prev => prev.filter(item => item.cartItemId !== cartItemId));
  };

  const handleSendOrder = () => {
    if (!selectedTable || cart.length === 0) return;

    if (typeof onOrderSubmit === 'function') {
      onOrderSubmit(selectedTable, cart);
    }
    setCart([]);
    setSelectedTable(null);
  };

  // ==========================================
  // 4. STOL KO'CHIRISH VA BO'LISH MANTIG'I
  // ==========================================
  const handleConfirmTransfer = () => {
    if (!selectedTable || !targetTable) return;
    if (typeof onTransferTable === 'function') {
      onTransferTable(selectedTable, targetTable);
    }
    setIsTransferOpen(false);
    setSelectedTable(targetTable);
  };

  const handleConfirmSplit = () => {
    if (!selectedTable || !targetTable || activeTableOrders.length === 0) return;
    const targetOrder = activeTableOrders[0];
    const itemsToMove = (targetOrder.items || []).filter((_, idx) => splitSelection[idx]);

    if (itemsToMove.length === 0) {
      alert("Bo'lish uchun kamida bitta taomni belgilang!");
      return;
    }

    if (typeof onSplitOrder === 'function') {
      onSplitOrder(targetOrder.id, itemsToMove, targetTable);
    }
    setIsSplitOpen(false);
  };

  // ==========================================
  // 5. SHAXSIY SAVDO HISOBOTI
  // ==========================================
  const mySalesTotal = orders
    .filter(o => o.waiter === currentUser?.name && o.status === "To'langan")
    .reduce((sum, o) => sum + Number(o.total || 0), 0);

  // ==========================================
  // 6. RENDER (UI DIZAYN)
  // ==========================================
  return (
    <div className="flex flex-col h-[calc(100vh-110px)] gap-4">
      
      {/* YUQORI MA'LUMOT PANELI */}
      <div className="bg-white dark:bg-gray-800 px-5 py-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-wrap justify-between items-center gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl">👨‍🍳</span>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase">Navbatchi Ofitsiant</p>
            <p className="text-sm font-black text-gray-900 dark:text-white">
              {currentUser?.name || 'Ofitsiant'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {serviceFee > 0 && (
            <span className="text-xs font-black bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-xl">
              Xizmat: {serviceFee}%
            </span>
          )}

          {waiterCanSeeSales && (
            <span className="text-xs font-black bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-xl">
              Shaxsiy savdo: {mySalesTotal.toLocaleString()} s
            </span>
          )}

          {selectedTable && isOccupied && typeof onTransferTable === 'function' && (
            <button
              onClick={() => {
                setTargetTable('');
                setIsTransferOpen(true);
              }}
              className="text-xs font-black bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-xl border border-amber-200 dark:border-amber-700 hover:bg-amber-100 transition"
            >
              🔄 Stolni ko'chirish
            </button>
          )}

          {selectedTable && isOccupied && typeof onSplitOrder === 'function' && (
            <button
              onClick={() => {
                setTargetTable('');
                setSplitSelection({});
                setIsSplitOpen(true);
              }}
              className="text-xs font-black bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-700 hover:bg-purple-100 transition"
            >
              ✂️ Chekni bo'lish
            </button>
          )}
        </div>
      </div>

      {/* ASOSIY 3 USTUNLI ISHCHI OYNA */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
        
        {/* 1-USTUN: STOLLAR XARITASI */}
        <div className={`${selectedTable ? 'hidden lg:block lg:col-span-4' : 'col-span-1 lg:col-span-5'} h-full overflow-hidden`}>
          <WaiterTableGrid 
            tables={tables}
            orders={orders}
            waiterCalls={waiterCalls}
            onSelectTable={handleSelectTable}
            onClearCall={onClearCall}
            onShowQrTable={onShowQrTable}
            onUpdateStatus={onUpdateStatus}
          />
        </div>

        {/* 2-USTUN: MENYU */}
        <div className={`${selectedTable ? 'col-span-1 lg:col-span-5' : 'hidden lg:block lg:col-span-7'} h-full overflow-hidden`}>
          {selectedTable ? (
            <WaiterMenu 
              menuCategories={menuCategories}
              menuItems={menuItems}
              onAddItem={handleAddItem}
            />
          ) : (
            <div className="h-full bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
              <span className="text-6xl mb-4">👈</span>
              <h3 className="text-xl font-black text-gray-700 dark:text-gray-300">
                Buyurtma olish uchun stolni tanlang
              </h3>
              <p className="text-sm font-bold text-gray-400 mt-2">
                Chap tomondagi xaritadan kerakli stol ustiga bosing
              </p>
            </div>
          )}
        </div>

        {/* 3-USTUN: SAVAT */}
        {selectedTable && (
          <div className="col-span-1 lg:col-span-3 h-full overflow-hidden">
            <WaiterCart 
              selectedTable={selectedTable}
              cart={cart}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveItem={handleRemoveItem}
              onSendOrder={handleSendOrder}
              onCancel={() => {
                setSelectedTable(null);
                setCart([]);
              }}
              isOccupied={isOccupied}
            />
          </div>
        )}

      </div>

      {/* VARIANT TANLASH MODALI (Agar taomda >1 variant bo'lsa) */}
      {variantModalItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-gray-900 dark:text-white">
              {variantModalItem.name} — Porsiyani tanlang
            </h3>
            <div className="space-y-2">
              {variantModalItem.variants.map((v, i) => (
                <button
                  key={i}
                  onClick={() => addVariantToCart(variantModalItem, v)}
                  className="w-full flex justify-between items-center p-4 rounded-2xl bg-gray-50 dark:bg-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 border border-gray-200 dark:border-gray-600 font-black transition active:scale-95"
                >
                  <span className="text-gray-900 dark:text-white">{v.name}</span>
                  <span className="text-indigo-600 dark:text-indigo-400">
                    {Number(v.price || 0).toLocaleString()} s
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setVariantModalItem(null)}
              className="w-full py-3 rounded-xl bg-gray-200 dark:bg-gray-700 font-black text-gray-600 dark:text-gray-300 text-sm"
            >
              Bekor qilish
            </button>
          </div>
        </div>
      )}

      {/* STOLNI KO'CHIRISH MODALI */}
      {isTransferOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-gray-900 dark:text-white">
              🔄 {selectedTable} ni boshqa stolga ko'chirish
            </h3>
            <select
              value={targetTable}
              onChange={(e) => setTargetTable(e.target.value)}
              className="w-full p-3.5 rounded-xl bg-gray-100 dark:bg-gray-700 font-bold text-gray-900 dark:text-white outline-none"
            >
              <option value="">Yangi stolni tanlang...</option>
              {tables.filter(t => t !== selectedTable).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => setIsTransferOpen(false)}
                className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 font-black text-xs uppercase"
              >
                Yopish
              </button>
              <button
                onClick={handleConfirmTransfer}
                className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-black text-xs uppercase"
              >
                Ko'chirish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHEKNI BO'LISH MODALI */}
      {isSplitOpen && activeTableOrders.length > 0 && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-gray-900 dark:text-white">
              ✂️ Chekni boshqa stolga bo'lish
            </h3>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {(activeTableOrders[0].items || []).map((item, idx) => (
                <label key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-xl cursor-pointer">
                  <span className="font-bold text-sm text-gray-900 dark:text-white">
                    {item.name} (x{item.quantity || item.qty || 1})
                  </span>
                  <input
                    type="checkbox"
                    checked={Boolean(splitSelection[idx])}
                    onChange={(e) => setSplitSelection(prev => ({ ...prev, [idx]: e.target.checked }))}
                    className="w-5 h-5 accent-indigo-600"
                  />
                </label>
              ))}
            </div>
            <select
              value={targetTable}
              onChange={(e) => setTargetTable(e.target.value)}
              className="w-full p-3.5 rounded-xl bg-gray-100 dark:bg-gray-700 font-bold text-gray-900 dark:text-white outline-none"
            >
              <option value="">Qaysi stolga o'tkaziladi?</option>
              {tables.filter(t => t !== selectedTable).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => setIsSplitOpen(false)}
                className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 font-black text-xs uppercase"
              >
                Yopish
              </button>
              <button
                onClick={handleConfirmSplit}
                className="flex-1 py-3 rounded-xl bg-purple-600 text-white font-black text-xs uppercase"
              >
                Bo'lish
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}