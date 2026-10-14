import React from 'react';

export default function CashierOrderList({ 
  activeOrders, 
  selectedOrder, 
  onSelectOrder 
}) {
  return (
    <div className="w-full lg:w-1/3 bg-white dark:bg-gray-800 rounded-3xl p-4 md:p-6 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col h-64 lg:h-full shrink-0">
      
      <div className="mb-4">
        <h2 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
          🧾 Ochiq Cheklar
        </h2>
        <p className="text-xs font-bold text-gray-500 mt-1">
          To'lov kutayotgan stollar ({activeOrders.length} ta)
        </p>
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar space-y-3 pr-2">
        {activeOrders.length === 0 ? (
          <div className="text-center text-gray-400 mt-10 font-bold">
            Hozircha ochiq cheklar yo'q
          </div>
        ) : (
          activeOrders.map((order) => {
            const isSelected = selectedOrder?.id === order.id;
            
            return (
              <div 
                key={order.id} 
                onClick={() => onSelectOrder(order)}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all active:scale-95 flex justify-between items-center ${
                  isSelected 
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' 
                    : 'border-gray-100 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 bg-white dark:bg-gray-800'
                }`}
              >
                <div>
                  <h3 className={`font-black text-lg ${isSelected ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-900 dark:text-white'}`}>
                    {order.table}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-bold text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-md">
                      {order.time}
                    </span>
                    <span className="text-[10px] font-black uppercase text-gray-400">
                      {order.waiterName}
                    </span>
                  </div>
                </div>
                
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xl transition-colors ${
                  isSelected 
                    ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30' 
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                }`}>
                  →
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}