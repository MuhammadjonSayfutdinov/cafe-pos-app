import React from 'react';

export default function WaiterTableGrid({ 
  tables = [], 
  orders = [], 
  waiterCalls = [], 
  onSelectTable, 
  onClearCall,
  onShowQrTable,
  onUpdateStatus
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-3xl p-4 md:p-6 shadow-sm border border-gray-100 dark:border-gray-700 h-full flex flex-col">
      
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white">
            🗺️ Stollar xaritasi
          </h2>
          <p className="text-xs md:text-sm font-bold text-gray-500 mt-1">
            Xizmat ko'rsatish uchun stolni tanlang
          </p>
        </div>
      </div>

      {/* MIJOZ CHAQIRUVLARI BANNERI */}
      {waiterCalls.length > 0 && (
        <div className="mb-4 space-y-2">
          {waiterCalls.map((call, idx) => {
            const callTableName = typeof call === 'object' ? call.table : call;
            const callId = typeof call === 'object' ? (call.id ?? call.table) : call;

            return (
              <div 
                key={callId || idx}
                className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-700 p-3 rounded-2xl flex justify-between items-center gap-3 animate-pulse"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🔔</span>
                  <div>
                    <p className="text-xs md:text-sm font-black text-amber-800 dark:text-amber-300">
                      {callTableName} chaqirmoqda!
                    </p>
                    {typeof call === 'object' && call.time && (
                      <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                        Vaqt: {call.time}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onClearCall && onClearCall(callId)}
                  className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl font-black text-xs transition active:scale-95"
                >
                  Bordim ✓
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4 overflow-y-auto hide-scrollbar pb-20">
        {tables.map(table => {
          
          // Stolga tegishli barcha aktiv cheklarni topamiz
          const tableOrders = orders.filter(
            o => o.table === table && o.status !== "To'langan" && o.status !== 'Qarz'
          );
          const isOccupied = tableOrders.length > 0;
          
          // Oshxona "Tayyor" degan cheklarni ajratib olamiz
          const readyOrders = tableOrders.filter(o => o.status === 'Tayyor');
          const hasReadyFood = readyOrders.length > 0;

          // Chaqiruvni obyekt yoki oddiy matn sifatida qidiramiz
          const currentCall = waiterCalls.find(c => 
            (typeof c === 'object' ? c.table === table : c === table)
          );

          return (
            <div 
              key={table} 
              className={`relative group rounded-2xl p-4 md:p-5 border-2 cursor-pointer transition flex flex-col items-center justify-center text-center h-28 md:h-32 shadow-sm ${
                isOccupied 
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 hover:border-red-400' 
                  : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50 hover:border-emerald-400 active:scale-95'
              }`}
              onClick={() => {
                if (!hasReadyFood) {
                  onSelectTable(table);
                }
              }}
            >
              
              {/* OSHXONADAN XABAR (TAYYOR!) */}
              {hasReadyFood && (
                <div className="absolute inset-0 bg-amber-500 rounded-xl flex flex-col items-center justify-center z-20 shadow-lg shadow-amber-500/50 animate-pulse">
                  <span className="text-white font-black text-base md:text-lg mb-2 tracking-widest uppercase">
                    TAYYOR 🥘
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      readyOrders.forEach(o => onUpdateStatus(o.id, 'Yetkazildi'));
                    }}
                    className="bg-white text-amber-600 px-3 py-2 rounded-lg font-black text-xs md:text-sm active:scale-90 transition shadow-sm"
                  >
                    QABUL QILDIM
                  </button>
                </div>
              )}

              <span className={`text-3xl md:text-4xl mb-2 block transition-transform group-hover:scale-110 ${hasReadyFood ? 'opacity-0' : 'opacity-100'}`}>
                {table === 'Olib ketish' ? '🛍️' : '🍽️'}
              </span>
              
              <span className={`font-black text-sm md:text-base ${isOccupied ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'} ${hasReadyFood ? 'opacity-0' : 'opacity-100'}`}>
                {table}
              </span>

              {/* Ofitsiant chaqiruvi (Qo'ng'iroq) */}
              {currentCall && !hasReadyFood && (
                <div 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    const callId = typeof currentCall === 'object' ? (currentCall.id ?? currentCall.table) : currentCall;
                    onClearCall(callId); 
                  }}
                  className="absolute -top-2 -right-2 bg-amber-500 text-white w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center shadow-lg shadow-amber-500/40 animate-bounce cursor-pointer z-30 text-lg md:text-xl"
                  title="Chaqiruvni o'chirish"
                >
                  🔔
                </div>
              )}

              {/* QR kod tugmasi */}
              {table !== 'Olib ketish' && !hasReadyFood && typeof onShowQrTable === 'function' && (
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    onShowQrTable(table); 
                  }}
                  className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-gray-700 text-gray-500 hover:text-indigo-600 p-1.5 rounded-lg shadow-sm text-xs"
                  title="QR kodni ko'rish"
                >
                  📱
                </button>
              )}

            </div>
          );
        })}
      </div>
    </div>
  );
}