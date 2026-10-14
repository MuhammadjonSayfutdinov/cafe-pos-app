import React from 'react';

export default function WaiterCart({ 
  selectedTable, 
  cart = [], 
  onUpdateQuantity, 
  onRemoveItem, 
  onSendOrder, 
  onCancel,
  isOccupied
}) {
  const totalAmount = cart.reduce(
    (sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 
    0
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
      
      {/* --- HEADER --- */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 rounded-t-3xl">
        <div>
          <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
            🛒 Savat 
            {isOccupied && (
              <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full uppercase">
                Band
              </span>
            )}
          </h2>
          <p className="text-xs font-bold text-indigo-500 mt-1">{selectedTable}</p>
        </div>
        <button 
          onClick={onCancel}
          className="bg-white dark:bg-gray-700 text-gray-500 hover:text-red-500 border border-gray-200 dark:border-gray-600 p-2 rounded-xl text-sm font-bold transition active:scale-95"
        >
          Yopish
        </button>
      </div>

      {/* --- SAVATDAGI TAOMLAR --- */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
            <span className="text-5xl mb-4">🛒</span>
            <p className="font-bold">Savat bo'sh. Taom qo'shing.</p>
          </div>
        ) : (
          cart.map(item => (
            <div 
              key={item.cartItemId} 
              className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl border border-gray-100 dark:border-gray-600"
            >
              <div className="flex-1 pr-2">
                <h4 className="font-bold text-gray-900 dark:text-white text-sm leading-tight">
                  {item.name}
                </h4>
                <p className="text-xs font-black text-amber-600 dark:text-amber-400 mt-1">
                  {(Number(item.price || 0) * Number(item.quantity || 1)).toLocaleString()} s
                </p>
              </div>

              <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                <button 
                  onClick={() => onUpdateQuantity(item.cartItemId, -1)}
                  className="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-gray-700 hover:bg-red-100 hover:text-red-600 rounded-md font-black text-gray-600 dark:text-gray-300 transition"
                >
                  -
                </button>
                
                <span className="w-6 text-center font-black text-gray-900 dark:text-white text-sm">
                  {item.quantity}
                </span>
                
                <button 
                  onClick={() => onUpdateQuantity(item.cartItemId, 1)}
                  className="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-gray-700 hover:bg-emerald-100 hover:text-emerald-600 rounded-md font-black text-gray-600 dark:text-gray-300 transition"
                >
                  +
                </button>

                {typeof onRemoveItem === 'function' && (
                  <button
                    onClick={() => onRemoveItem(item.cartItemId)}
                    className="w-8 h-8 flex items-center justify-center bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-100 rounded-md font-black text-xs transition ml-1"
                    title="O'chirish"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* --- FOOTER (TUGMALAR) --- */}
      <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
        <div className="flex justify-between items-center mb-4">
          <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">Jami Summa:</span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {totalAmount.toLocaleString()} s
          </span>
        </div>

        <button 
          onClick={onSendOrder}
          disabled={cart.length === 0}
          className={`w-full py-4 rounded-xl font-black text-lg md:text-xl shadow-lg transition active:scale-95 ${
            cart.length > 0 
              ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/30' 
              : 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed shadow-none'
          }`}
        >
          {isOccupied ? "QO'SHIMCHA QILISH 🚀" : "OSHXONAGA JO'NATISH 🚀"}
        </button>
      </div>

    </div>
  );
}