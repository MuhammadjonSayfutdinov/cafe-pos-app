import React, { useState } from 'react';
import { DELIVERY_STATUS, ORDER_STATUS, isDeliveryOrder } from '../constants/orderStatus';
import { kitchenSummary } from '../utils/kitchenFlow';

const DEBT_PAY_METHODS = ['Naqd', 'Plastik', 'Click', 'Payme'];

export default function CashierOrderList({ 
  activeOrders = [], 
  debtOrders = [],
  activeTab = 'active',
  setActiveTab,
  selectedOrder, 
  onSelectOrder,
  onPayOffDebt,
  onDeleteOrder
}) {
  const safeOrders = Array.isArray(activeOrders) ? activeOrders : [];
  const safeDebts = Array.isArray(debtOrders) ? debtOrders : [];
  const isDebtTab = activeTab === 'debt';
  // Qaysi qarz uchun to'lov turi tanlanmoqda
  const [payingDebtId, setPayingDebtId] = useState(null);

  // Chek summasini xavfsiz hisoblash
  const getOrderDisplayTotal = (order) => {
    if (!order) return 0;
    if (order.total !== undefined) return Number(order.total) || 0;
    if (order.finalTotal !== undefined) return Number(order.finalTotal) || 0;

    if (Array.isArray(order.items)) {
      return order.items.reduce((sum, item) => {
        const price = Number(item?.price ?? item?.variants?.[0]?.price ?? 0) || 0;
        const qty = Number(item?.quantity ?? item?.qty ?? 1) || 0;
        return sum + (price * qty);
      }, 0);
    }
    return 0;
  };

  return (
    <div className="w-full lg:w-1/3 bg-white dark:bg-gray-800 rounded-3xl p-4 md:p-6 shadow-xs border border-gray-100 dark:border-gray-700 flex flex-col h-64 lg:h-full shrink-0">
      
      <div className="mb-4">
        <div className="flex gap-1.5 bg-gray-100 dark:bg-gray-900/60 p-1 rounded-2xl mb-3">
          {[
            { id: 'active', label: `🧾 Ochiq (${safeOrders.length})` },
            { id: 'debt', label: `📝 Qarzlar (${safeDebts.length})` }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => typeof setActiveTab === 'function' && setActiveTab(tab.id)}
              className={`flex-1 px-3 py-2 rounded-xl font-black text-xs transition ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-800 text-brand-600 dark:text-brand-300 shadow-xs'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <p className="text-xs font-bold text-gray-500">
          {isDebtTab
            ? `Nasiyaga yozilgan cheklar (${safeDebts.length} ta)`
            : `To'lov kutayotgan stollar (${safeOrders.length} ta)`}
        </p>
      </div>

      {isDebtTab ? (
        <div className="flex-1 overflow-y-auto hide-scrollbar space-y-3 pr-2">
          {safeDebts.length === 0 ? (
            <div className="text-center text-gray-400 mt-10 font-bold">Qarzlar yo'q</div>
          ) : (
            safeDebts.map(order => {
              if (!order) return null;
              const debtor = order.debtorName || order.paymentDetails?.debtorName || "Noma'lum mijoz";
              const phone = order.debtorPhone || order.paymentDetails?.debtorPhone || order.customerPhone || '';
              const isPaying = String(payingDebtId) === String(order.id);
              return (
                <div
                  key={order.id}
                  className="p-4 rounded-2xl border-2 border-orange-100 dark:border-orange-900/50 bg-orange-50/50 dark:bg-orange-900/10 space-y-2"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <h3 className="font-black text-base text-gray-900 dark:text-white truncate">👤 {debtor}</h3>
                      {phone && <p className="text-xs font-bold text-gray-500">📞 {phone}</p>}
                      <p className="text-[11px] font-bold text-gray-400 mt-0.5">
                        {order.table} • {order.closeTime || order.date || ''}
                      </p>
                    </div>
                    <span className="font-black text-sm text-orange-600 dark:text-orange-300 shrink-0">
                      {getOrderDisplayTotal(order).toLocaleString()} so'm
                    </span>
                  </div>

                  {isPaying ? (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-black uppercase text-gray-500">Qanday to'landi?</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {DEBT_PAY_METHODS.map(m => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              if (typeof onPayOffDebt === 'function') onPayOffDebt(order, m);
                              setPayingDebtId(null);
                            }}
                            className="py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition active:scale-95"
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPayingDebtId(null)}
                        className="w-full py-1.5 rounded-xl text-gray-500 font-black text-xs hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        Bekor qilish
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPayingDebtId(order.id)}
                      className="w-full py-2 rounded-xl bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-black text-xs hover:bg-emerald-50 transition"
                    >
                      ✅ Qarzni yopish
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto hide-scrollbar space-y-3 pr-2">
        {safeOrders.length === 0 ? (
          <div className="text-center text-gray-400 mt-10 font-bold">
            Hozircha ochiq cheklar yo'q
          </div>
        ) : (
          safeOrders.map((order) => {
            if (!order) return null;
            const isSelected = selectedOrder?.id === order.id;
            const waiterLabel = order.waiterName || order.waiter || 'Ofitsiant';
            const displayTotal = getOrderDisplayTotal(order);
            
            return (
              <div 
                key={order.id} 
                onClick={() => typeof onSelectOrder === 'function' && onSelectOrder(order)}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all active:scale-95 flex justify-between items-center ${
                  isSelected 
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' 
                    : 'border-gray-100 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-600 bg-white dark:bg-gray-800'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className={`font-black text-lg ${
                      isSelected ? 'text-brand-700 dark:text-brand-400' : 'text-gray-900 dark:text-white'
                    }`}>
                      {order.table || 'Stol'}
                    </h3>

                    {order.status && (
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                        order.status === ORDER_STATUS.DELIVERED
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : order.status === ORDER_STATUS.READY
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {order.status}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-1.5">
                    {order.time && (
                      <span className="text-xs font-bold text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-md">
                        {order.time}
                      </span>
                    )}
                    <span className="text-[10px] font-black uppercase text-gray-400">
                      👤 {waiterLabel}
                    </span>
                  </div>

                  {displayTotal > 0 && (
                    <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 mt-1.5">
                      {displayTotal.toLocaleString()} so'm
                    </p>
                  )}

                  {/* Oshxona holati (taom darajasida): to'lovdan oldin bilish uchun */}
                  {(() => {
                    const k = kitchenSummary(order);
                    if (k.pending === 0 && k.ready === 0) return null;
                    return (
                      <p className="text-[11px] font-black mt-1 flex flex-wrap gap-x-2">
                        {k.pending > 0 && (
                          <span className="text-indigo-600 dark:text-indigo-400">👨‍🍳 Oshxonada: {k.pending} pors</span>
                        )}
                        {k.ready > 0 && (
                          <span className="text-emerald-600 dark:text-emerald-400">🔔 Tayyor: {k.ready} pors</span>
                        )}
                      </p>
                    );
                  })()}

                  {isDeliveryOrder(order) && (
                    <p className="text-[11px] font-black text-orange-600 dark:text-orange-400 mt-1">
                      🛵 {order.delivery?.courier || 'Kuryer biriktirilmagan'}
                      {order.delivery?.status === DELIVERY_STATUS.DELIVERED
                        ? ` • yetkazdi, ${order.delivery?.collectedMethod || 'Naqd'} olib keladi`
                        : order.delivery?.status === DELIVERY_STATUS.ON_WAY
                        ? " • yo'lda"
                        : ''}
                    </p>
                  )}
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                  {typeof onDeleteOrder === 'function' && (
                    <button
                      type="button"
                      title="Chekni bekor qilish"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteOrder(order.id, order.table || 'Stol');
                      }}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-100 transition"
                    >
                      🗑
                    </button>
                  )}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xl transition-colors ${
                    isSelected 
                      ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30' 
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                  }`}>
                    →
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      )}

    </div>
  );
}