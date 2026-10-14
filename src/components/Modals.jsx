import React from 'react';

// ================= 1. QR-KOD CHOP ETISH OYNASI =================
export function TableQrModal({ table, cafeName, onClose }) {
  // QR kodni avtomatik generatsiya qilish
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(window.location.origin + window.location.pathname + '?table=' + encodeURIComponent(table))}`;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[80] p-4">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] max-w-sm w-full text-center shadow-2xl relative">
        <h2 className="text-xl font-black uppercase text-amber-900 dark:text-amber-500 mb-1">{cafeName}</h2>
        <p className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-6">{table} uchun maxsus QR-Menyu</p>
        
        <div className="bg-amber-50 dark:bg-white p-5 rounded-2xl border-4 border-dashed border-amber-300 inline-block mb-6 shadow-sm">
          <img src={qrUrl} alt={`QR Code ${table}`} className="w-48 h-48 mx-auto" />
        </div>
        
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-8 font-medium leading-relaxed">
          Ushbu kodni chop etib, stol ustiga qo'ying. Mijozlar telefon orqali menyuni ko'rib o'zlari buyurtma berishadi.
        </p>
        
        <div className="flex gap-3">
          <button onClick={() => window.print()} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-3.5 rounded-xl font-bold text-sm shadow-md transition active:scale-95">🖨️ Chop etish</button>
          <button onClick={onClose} className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 py-3.5 rounded-xl font-bold text-sm hover:bg-gray-300 transition">Yopish</button>
        </div>
      </div>
    </div>
  );
}

// ================= 2. CHEK (RECEIPT) CHOP ETISH OYNASI =================
export function ReceiptModal({ order, cafeName, onClose }) {
  if (!order) return null;
  
  // Telegram orqali chekni mijozga yuborish uchun matn
  const tgShareText = encodeURIComponent(`🧾 *${cafeName} - Xarid cheki*\n\nSana: ${order.date} ${order.time}\nStol: ${order.table}\n\nJami to'lov: ${(order.finalTotal || order.total).toLocaleString()} so'm\n\nTashrifingiz uchun rahmat! 😊`);
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[80] p-4 print:bg-white print:static print:p-0">
      <style>{`
        @media print { 
          body * { visibility: hidden; } 
          #receipt-content, #receipt-content * { visibility: visible; } 
          #receipt-content { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; box-shadow: none; border: none; } 
          .no-print { display: none !important; } 
        }
      `}</style>
      
      <div id="receipt-content" className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl relative text-gray-800 font-mono text-sm print:max-w-full mx-auto">
        <div className="text-center mb-6 border-b-2 border-dashed border-gray-300 pb-4">
          <h2 className="font-extrabold text-2xl uppercase mb-1">{cafeName}</h2>
          <p className="text-xs text-gray-500">Sana: {order.date} | Vaqt: {order.time}</p>
          <p className="font-bold text-lg mt-2">Stol: {order.table}</p>
          {order.waiterName && <p className="text-xs text-gray-500 mt-1">Xodim: {order.waiterName}</p>}
          {order.customerPhone && <p className="text-xs font-bold text-indigo-600 mt-1">Mijoz: {order.customerName || order.customerPhone}</p>}
        </div>
        
        <div className="space-y-2 mb-4 border-b-2 border-dashed border-gray-300 pb-4">
          <div className="flex justify-between font-bold text-xs uppercase text-gray-500 mb-1">
            <span>Taom</span><span>Summa</span>
          </div>
          {order.items.map((i, idx) => (
            <div key={idx} className="flex justify-between items-start">
              <div className="pr-2">
                <span className="font-bold">{i.name}</span>
                <span className="block text-xs text-gray-500">{i.quantity} x {(i.price || 0).toLocaleString()}</span>
              </div>
              <span className="font-bold whitespace-nowrap">{((i.price || 0) * i.quantity).toLocaleString()}</span>
            </div>
          ))}
        </div>
        
        <div className="space-y-1 mb-4 text-xs font-semibold text-gray-600 border-b-2 border-dashed border-gray-300 pb-4">
          <div className="flex justify-between"><span>Asosiy summa:</span><span>{(order.subtotal || order.total).toLocaleString()} so'm</span></div>
          {(order.serviceFeeAmount > 0) && <div className="flex justify-between"><span>Xizmat haqi ({order.serviceFeePercent}%):</span><span>+ {order.serviceFeeAmount.toLocaleString()} so'm</span></div>}
          {(order.discount > 0) && <div className="flex justify-between text-red-500 font-bold"><span>Chegirma:</span><span>- {order.discount.toLocaleString()} so'm</span></div>}
          {(order.usedBonus > 0) && <div className="flex justify-between text-indigo-600 font-black pt-1"><span>Ishlatilgan Bonus:</span><span>- {order.usedBonus.toLocaleString()} so'm</span></div>}
        </div>
        
        <div className="flex justify-between font-extrabold text-xl mb-3 bg-gray-50 p-3 rounded-lg">
          <span>Jami To'lov:</span>
          <span>{(order.finalTotal || order.total).toLocaleString()} so'm</span>
        </div>
        
        <div className="text-right text-xs font-bold text-gray-500 mb-4 uppercase tracking-wider">
          To'lov shakli: 
          {order.paymentBreakdown?.naqd > 0 && <span className="block text-gray-800 mt-1">Naqd: {order.paymentBreakdown.naqd.toLocaleString()} so'm</span>}
          {order.paymentBreakdown?.terminal > 0 && <span className="block text-gray-800 mt-1">Terminal: {order.paymentBreakdown.terminal.toLocaleString()} so'm</span>}
          {order.paymentBreakdown?.click > 0 && <span className="block text-gray-800 mt-1">Click: {order.paymentBreakdown.click.toLocaleString()} so'm</span>}
        </div>
        
        {order.earnedBonus > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 p-2 rounded-lg text-center mb-6">
            <span className="text-xs text-indigo-800 font-bold">Raqamingizga bonus yozildi:</span>
            <p className="text-lg font-black text-indigo-600">+{Math.floor(order.earnedBonus).toLocaleString()} so'm 🎁</p>
          </div>
        )}
        
        <p className="text-center text-xs text-gray-500 italic mb-6">Tashrifingiz uchun rahmat!<br/>Yana kutib qolamiz. 😊</p>
        
        <div className="flex gap-2 no-print mt-4">
          <button onClick={() => window.print()} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-xl font-bold shadow-md text-xs transition">🖨️ Chop etish</button>
          <a href={`https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${tgShareText}`} target="_blank" rel="noopener noreferrer" className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-xl font-bold shadow-md text-center flex items-center justify-center text-xs transition">✈️ Telegram</a>
          <button onClick={onClose} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-3 rounded-xl font-bold text-xs transition">✕ Yopish</button>
        </div>
      </div>
    </div>
  );
}