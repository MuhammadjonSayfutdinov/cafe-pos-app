import React from 'react';

export default function CashierReceipt({ 
  selectedOrder, 
  totals, 
  serviceFee 
}) {
  return (
    <div className="flex-1 bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col relative overflow-hidden">
      
      {/* Chek tepasidagi bezak */}
      <div className="absolute top-0 left-0 w-full h-2 bg-indigo-500"></div>

      <div className="text-center mb-6 pt-2 border-b-2 border-dashed border-gray-200 dark:border-gray-700 pb-6">
        <h3 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-widest">
          {selectedOrder.table}
        </h3>
        <p className="text-sm font-bold text-gray-500 mt-1">
          Xizmat ko'rsatuvchi: {selectedOrder.waiterName}
        </p>
        <p className="text-xs font-bold text-gray-400 mt-1">
          Ochilgan vaqt: {selectedOrder.time}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar mb-6">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
              <th className="pb-2 w-1/2">Nomi</th>
              <th className="pb-2 text-center">Soni</th>
              <th className="pb-2 text-right">Summa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {selectedOrder.items.map((item, idx) => (
              <tr key={idx}>
                <td className="py-3 pr-2">
                  <p className="font-bold text-gray-900 dark:text-white text-sm">
                    {item.name}
                  </p>
                  {item.note && (
                    <p className="text-[10px] font-bold text-indigo-500 mt-0.5">
                      Izoh: {item.note}
                    </p>
                  )}
                </td>
                <td className="py-3 text-center">
                  <span className="font-black text-gray-600 dark:text-gray-300 text-sm">
                    {item.quantity}
                  </span>
                </td>
                <td className="py-3 text-right">
                  <span className="font-black text-gray-900 dark:text-white text-sm">
                    {(item.price * item.quantity).toLocaleString()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Hisob-kitoblar qismi */}
      <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl space-y-2 border border-gray-100 dark:border-gray-700 shrink-0">
        <div className="flex justify-between items-center text-sm">
          <span className="font-bold text-gray-500">Jami (taomlar):</span>
          <span className="font-black text-gray-700 dark:text-gray-300">
            {totals.subTotal.toLocaleString()} s
          </span>
        </div>
        
        <div className="flex justify-between items-center text-sm">
          <span className="font-bold text-gray-500">Xizmat haqi ({serviceFee}%):</span>
          <span className="font-black text-gray-700 dark:text-gray-300">
            {totals.serviceFeeAmount.toLocaleString()} s
          </span>
        </div>
        
        {totals.discountAmount > 0 && (
          <div className="flex justify-between items-center text-sm text-red-500">
            <span className="font-bold">Chegirma:</span>
            <span className="font-black">
              - {totals.discountAmount.toLocaleString()} s
            </span>
          </div>
        )}
        
        <div className="pt-3 border-t-2 border-dashed border-gray-200 dark:border-gray-700 mt-3 flex justify-between items-end">
          <span className="font-black text-gray-400 uppercase tracking-widest text-xs mb-1">
            To'lanadigan:
          </span>
          <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400">
            {totals.finalTotal.toLocaleString()} <span className="text-lg">s</span>
          </span>
        </div>
      </div>

    </div>
  );
}import React from 'react';

export default function CashierReceipt({ 
  selectedOrder, 
  totals = {}, 
  serviceFee = 0 
}) {
  if (!selectedOrder) return null;

  const safeItems = Array.isArray(selectedOrder.items) ? selectedOrder.items : [];
  const waiterLabel = selectedOrder.waiterName || selectedOrder.waiter || 'Ofitsiant';
  const effectiveServiceFee = selectedOrder.table === 'Olib ketish' 
    ? 0 
    : (selectedOrder.serviceFee !== undefined ? selectedOrder.serviceFee : serviceFee);

  const subTotal = Number(totals?.subTotal || 0);
  const serviceFeeAmount = Number(totals?.serviceFeeAmount || 0);
  const discountAmount = Number(totals?.discountAmount || 0);
  const finalTotal = Number(totals?.finalTotal || 0);

  return (
    <div className="flex-1 bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col relative overflow-hidden">
      
      {/* Chek tepasidagi bezak */}
      <div className="absolute top-0 left-0 w-full h-2 bg-indigo-500"></div>

      <div className="text-center mb-6 pt-2 border-b-2 border-dashed border-gray-200 dark:border-gray-700 pb-6">
        <h3 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-widest">
          {selectedOrder.table || 'Stol'}
        </h3>
        <p className="text-sm font-bold text-gray-500 mt-1">
          Xizmat ko'rsatuvchi: <span className="text-gray-700 dark:text-gray-300">{waiterLabel}</span>
        </p>
        {selectedOrder.time && (
          <p className="text-xs font-bold text-gray-400 mt-1">
            Ochilgan vaqt: {selectedOrder.time}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar mb-6">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
              <th className="pb-2 w-1/2">Nomi</th>
              <th className="pb-2 text-center">Soni</th>
              <th className="pb-2 text-right">Summa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {safeItems.map((item, idx) => {
              if (!item) return null;
              const price = Number(item.price ?? item.variants?.[0]?.price ?? 0) || 0;
              const quantity = Number(item.quantity ?? item.qty ?? 1) || 0;
              const lineTotal = price * quantity;

              return (
                <tr key={item.cartItemId || item.id || idx}>
                  <td className="py-3 pr-2">
                    <p className="font-bold text-gray-900 dark:text-white text-sm">
                      {item.name}
                    </p>
                    <p className="text-[11px] font-bold text-gray-400">
                      {price.toLocaleString()} s / dona
                    </p>
                    {item.note && (
                      <p className="text-[10px] font-bold text-indigo-500 mt-0.5">
                        Izoh: {item.note}
                      </p>
                    )}
                  </td>
                  <td className="py-3 text-center">
                    <span className="font-black text-gray-600 dark:text-gray-300 text-sm">
                      x{quantity}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <span className="font-black text-gray-900 dark:text-white text-sm">
                      {lineTotal.toLocaleString()}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Hisob-kitoblar qismi */}
      <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl space-y-2 border border-gray-100 dark:border-gray-700 shrink-0">
        <div className="flex justify-between items-center text-sm">
          <span className="font-bold text-gray-500">Jami (taomlar):</span>
          <span className="font-black text-gray-700 dark:text-gray-300">
            {subTotal.toLocaleString()} s
          </span>
        </div>
        
        <div className="flex justify-between items-center text-sm">
          <span className="font-bold text-gray-500">Xizmat haqi ({effectiveServiceFee}%):</span>
          <span className="font-black text-gray-700 dark:text-gray-300">
            {serviceFeeAmount.toLocaleString()} s
          </span>
        </div>
        
        {discountAmount > 0 && (
          <div className="flex justify-between items-center text-sm text-red-500">
            <span className="font-bold">Chegirma:</span>
            <span className="font-black">
              - {discountAmount.toLocaleString()} s
            </span>
          </div>
        )}
        
        <div className="pt-3 border-t-2 border-dashed border-gray-200 dark:border-gray-700 mt-3 flex justify-between items-end">
          <span className="font-black text-gray-400 uppercase tracking-widest text-xs mb-1">
            To'lanadigan:
          </span>
          <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400">
            {finalTotal.toLocaleString()} <span className="text-lg">s</span>
          </span>
        </div>
      </div>

    </div>
  );
}