import React from 'react';

export default function CashierReceipt({ 
  selectedOrder, 
  totals = {}, 
  serviceFee = 10,
  matchedCustomer = null,
  earnedCashback = 0,
  cashbackPercent = 5
}) {
  if (!selectedOrder) return null;

  const items = Array.isArray(selectedOrder.items) ? selectedOrder.items : [];
  const subTotal = Number(totals.subTotal) || 0;
  const serviceFeePercent = totals.serviceFeePercent !== undefined ? totals.serviceFeePercent : serviceFee;
  const serviceFeeAmount = Number(totals.serviceFeeAmount) || 0;
  const discountAmount = Number(totals.discountAmount) || 0;
  const usedBonusAmount = Number(totals.usedBonusAmount) || 0;
  const finalTotal = Number(totals.finalTotal) || 0;

  return (
    <div className="flex-1 bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 md:p-6 flex flex-col justify-between min-h-0 overflow-hidden">
      
      {/* CHEK TEPASI */}
      <div>
        <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-700 pb-4 mb-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-lg">
              Chek #{String(selectedOrder.id).slice(-4)}
            </span>
            <h3 className="text-2xl font-black text-gray-900 dark:text-white mt-1.5">
              🪑 {selectedOrder.table}
            </h3>
            <p className="text-xs font-bold text-gray-400 mt-0.5">
              👤 Xodim: {selectedOrder.waiterName || selectedOrder.waiter || 'Ofitsiant'} • 🕒 {selectedOrder.time}
            </p>
          </div>

          {matchedCustomer && (
            <div className="text-right bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-2xl border border-amber-200 dark:border-amber-800/50">
              <span className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-300 block">
                🎁 VIP Mijoz ({cashbackPercent}%)
              </span>
              <span className="font-black text-xs text-gray-900 dark:text-white block">
                {matchedCustomer.name}
              </span>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                Balans: {Number(matchedCustomer.bonusBalance || 0).toLocaleString()} s
              </span>
            </div>
          )}
        </div>
      </div>

      {/* TAOMLAR RO'YXATI */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 my-2">
        {items.length === 0 ? (
          <p className="text-center text-gray-400 font-bold py-8">
            Chek ichida taomlar yo'q
          </p>
        ) : (
          items.map((item, idx) => {
            if (!item) return null;
            const price = Number(item.price ?? item.variants?.[0]?.price ?? 0) || 0;
            const qty = Number(item.quantity ?? item.qty ?? 1) || 0;
            const lineSum = price * qty;

            return (
              <div
                key={item.cartItemId || item.id || idx}
                className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700 flex justify-between items-center gap-3"
              >
                <div className="min-w-0">
                  <p className="font-black text-sm sm:text-base text-gray-900 dark:text-white truncate">
                    {item.name}
                  </p>
                  <p className="text-xs font-bold text-gray-400">
                    {qty} x {price.toLocaleString()} so'm
                  </p>
                  {item.note && (
                    <span className="inline-block mt-1 text-[11px] font-bold italic text-amber-600 dark:text-amber-400">
                      * {item.note}
                    </span>
                  )}
                </div>

                <span className="font-black text-sm sm:text-base text-gray-900 dark:text-white shrink-0">
                  {lineSum.toLocaleString()} s
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* CHEK PASTKI HISOB-KITOB QISMI */}
      <div className="border-t-2 border-dashed border-gray-200 dark:border-gray-700 pt-4 mt-2 space-y-2">
        <div className="flex justify-between text-xs sm:text-sm font-bold text-gray-500 dark:text-gray-400">
          <span>Taomlar summasi:</span>
          <span className="font-black text-gray-800 dark:text-gray-200">
            {subTotal.toLocaleString()} so'm
          </span>
        </div>

        <div className="flex justify-between text-xs sm:text-sm font-bold text-gray-500 dark:text-gray-400">
          <span>Xizmat haqi ({serviceFeePercent}%):</span>
          <span className="font-black text-gray-800 dark:text-gray-200">
            + {serviceFeeAmount.toLocaleString()} so'm
          </span>
        </div>

        {discountAmount > 0 && (
          <div className="flex justify-between text-xs sm:text-sm font-black text-red-500">
            <span>Chegirma (Skidka):</span>
            <span>- {discountAmount.toLocaleString()} so'm</span>
          </div>
        )}

        {usedBonusAmount > 0 && (
          <div className="flex justify-between text-xs sm:text-sm font-black text-indigo-600 dark:text-indigo-400">
            <span>🎁 Bonus balansdan qoplandi:</span>
            <span>- {usedBonusAmount.toLocaleString()} so'm</span>
          </div>
        )}

        {earnedCashback > 0 && (
          <div className="flex justify-between text-xs font-black text-emerald-600 dark:text-emerald-400">
            <span>✨ Mijozga yoziladigan yangi Cashback (+{cashbackPercent}%):</span>
            <span>+ {earnedCashback.toLocaleString()} so'm</span>
          </div>
        )}

        <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <span className="text-sm sm:text-base font-black uppercase text-gray-900 dark:text-white">
            To'lanadigan summa:
          </span>
          <span className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
            {finalTotal.toLocaleString()} <span className="text-sm">so'm</span>
          </span>
        </div>
      </div>

    </div>
  );
}