import React, { useState } from 'react';

export default function KitchenMode({ 
  orders = [], 
  onUpdateStatus, 
  menuItems = [], 
  onToggleItemAvailability 
}) {
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' yoki 'stoplist'

  // Faqat oshpazga taalluqli statuslar
  const pendingOrders = orders.filter(o => o.status === 'Kutilmoqda');
  const cookingOrders = orders.filter(o => o.status === 'Tayyorlanmoqda');

  const safeMenuItems = Array.isArray(menuItems) ? menuItems : [];

  return (
    <div className="h-[calc(100vh-80px)] animate-fade-in max-w-7xl mx-auto flex flex-col">
      
      {/* TEPADAGI TABLAR (Oshxona va Stop-List) */}
      <div className="bg-white dark:bg-gray-800 p-2 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex gap-2 mb-4 shrink-0">
        <button 
          onClick={() => setActiveTab('orders')}
          className={`flex-1 py-3 rounded-xl font-black text-sm md:text-base transition active:scale-95 ${
            activeTab === 'orders' 
              ? 'bg-amber-500 text-white shadow-md' 
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
          }`}
        >
          👨‍🍳 Buyurtmalar
          {(pendingOrders.length > 0 || cookingOrders.length > 0) && (
            <span className="ml-2 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full animate-pulse">
              {pendingOrders.length + cookingOrders.length}
            </span>
          )}
        </button>
        
        <button 
          onClick={() => setActiveTab('stoplist')}
          className={`flex-1 py-3 rounded-xl font-black text-sm md:text-base transition active:scale-95 ${
            activeTab === 'stoplist' 
              ? 'bg-red-500 text-white shadow-md' 
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
          }`}
        >
          🛑 Stop-List
        </button>
      </div>

      {/* 1. BUYURTMALAR EKRANI */}
      {activeTab === 'orders' && (
        <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
          
          {/* CHAP USTUN: Yangi kelgan buyurtmalar */}
          <div className="flex-1 bg-red-50/50 dark:bg-red-900/10 rounded-3xl p-4 border border-red-100 dark:border-red-900/30 flex flex-col h-full">
            
            <h3 className="text-red-600 dark:text-red-400 font-black text-lg mb-4 flex items-center gap-2">
              🔥 Yangi kelganlar ({pendingOrders.length})
            </h3>
            
            <div className="flex-1 overflow-y-auto hide-scrollbar space-y-3 pb-10">
              {pendingOrders.length === 0 ? (
                <div className="text-center text-gray-400 mt-10 font-bold">
                  Kutish zalida bo'shliq...
                </div>
              ) : (
                pendingOrders.map(order => (
                  <div 
                    key={order.id} 
                    className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-red-200 dark:border-red-800"
                  >
                    <div className="flex justify-between items-center border-b dark:border-gray-700 pb-2 mb-2">
                      <span className="font-black text-lg text-gray-900 dark:text-white">
                        {order.table}
                      </span>
                      <span className="text-xs font-bold text-gray-500">
                        {order.time} | {order.waiterName}
                      </span>
                    </div>
                    
                    <ul className="space-y-2 mb-4">
                      {order.items.map((item, idx) => (
                        <li 
                          key={idx} 
                          className="flex justify-between items-center text-sm font-bold text-gray-700 dark:text-gray-300"
                        >
                          <span>
                            {item.quantity} x {item.name}
                          </span>
                        </li>
                      ))}
                    </ul>
                    
                    <button 
                      onClick={() => onUpdateStatus(order.id, 'Tayyorlanmoqda')}
                      className="w-full bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-black shadow-md transition active:scale-95"
                    >
                      PISHIRISHNI BOSHLASH 🍳
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* O'NG USTUN: Tayyorlanayotganlar */}
          <div className="flex-1 bg-amber-50/50 dark:bg-amber-900/10 rounded-3xl p-4 border border-amber-100 dark:border-amber-900/30 flex flex-col h-full">
            
            <h3 className="text-amber-600 dark:text-amber-500 font-black text-lg mb-4 flex items-center gap-2">
              ⏳ Jarayonda ({cookingOrders.length})
            </h3>
            
            <div className="flex-1 overflow-y-auto hide-scrollbar space-y-3 pb-10">
              {cookingOrders.length === 0 ? (
                <div className="text-center text-gray-400 mt-10 font-bold">
                  Hozircha hech narsa pishirilmayapti.
                </div>
              ) : (
                cookingOrders.map(order => (
                  <div 
                    key={order.id} 
                    className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-amber-200 dark:border-amber-800"
                  >
                    <div className="flex justify-between items-center border-b dark:border-gray-700 pb-2 mb-2">
                      <span className="font-black text-lg text-gray-900 dark:text-white">
                        {order.table}
                      </span>
                      <span className="text-xs font-bold text-amber-500 animate-pulse">
                        Pishmoqda...
                      </span>
                    </div>
                    
                    <ul className="space-y-2 mb-4">
                      {order.items.map((item, idx) => (
                        <li 
                          key={idx} 
                          className="flex justify-between items-center text-sm font-bold text-gray-700 dark:text-gray-300"
                        >
                          <span>
                            {item.quantity} x {item.name}
                          </span>
                        </li>
                      ))}
                    </ul>
                    
                    <button 
                      onClick={() => onUpdateStatus(order.id, 'Tayyor')}
                      className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-black shadow-md transition active:scale-95"
                    >
                      TAYYOR (OFITSIANTGA) ✅
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      )}

      {/* 2. STOP-LIST EKRANI */}
      {activeTab === 'stoplist' && (
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-3xl p-4 md:p-6 shadow-sm border border-gray-100 dark:border-gray-700 overflow-y-auto hide-scrollbar">
          
          <div className="mb-6">
            <h2 className="text-xl font-black text-gray-900 dark:text-white">
              🛑 Stop-List Boshqaruvi
            </h2>
            <p className="text-xs md:text-sm font-bold text-gray-500 mt-1">
              Agar masalliq tugasa, shu yerdan ovqatni o'chirib qo'ying. U ofitsiant menyusidan yo'qoladi.
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {safeMenuItems.map(item => (
              <div 
                key={item.id} 
                className={`p-4 rounded-2xl border-2 transition flex justify-between items-center ${
                  item.is_available !== false 
                    ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50' 
                    : 'border-red-500 bg-red-50 dark:bg-red-900/20'
                }`}
              >
                <div>
                  <p className={`font-bold text-sm ${
                    item.is_available !== false 
                      ? 'text-gray-900 dark:text-white' 
                      : 'text-red-700 dark:text-red-400 line-through'
                  }`}>
                    {item.name}
                  </p>
                  <p className="text-[10px] font-bold text-gray-400 mt-0.5">
                    {item.category}
                  </p>
                </div>
                
                <button 
                  onClick={() => onToggleItemAvailability(item.id)}
                  className={`w-14 h-8 rounded-full relative transition-colors ${
                    item.is_available !== false 
                      ? 'bg-emerald-500' 
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${
                    item.is_available !== false 
                      ? 'right-1' 
                      : 'left-1'
                  }`}></div>
                </button>
                
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}