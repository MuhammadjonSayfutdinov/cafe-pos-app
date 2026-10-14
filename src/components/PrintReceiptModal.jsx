import React, { useEffect } from 'react';

export default function PrintReceiptModal({ 
  cafeName, 
  receiptData, 
  onClose 
}) {
  const { order, totals } = receiptData;

  // Modal ochilganda avtomatik printerni chaqirish
  useEffect(() => {
    // 500 millisekund kutamiz (DOM to'liq chizilishi uchun), keyin print qilamiz
    const timer = setTimeout(() => {
      window.print();
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  if (!order) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      
      {/* 
        PRINTER UCHUN MAXSUS CSS (Faqat shu oyna print qilinadi, orqa fon kesib tashlanadi)
      */}
      <style>
        {`
          @media print {
            body * {
              visibility: hidden;
            }
            #printable-receipt, #printable-receipt * {
              visibility: visible;
            }
            #printable-receipt {
              position: absolute;
              left: 0;
              top: 0;
              width: 80mm; /* Printer qog'ozi kengligi (80mm yoki 58mm) */
              margin: 0;
              padding: 10px;
              box-shadow: none !important;
            }
            /* Printda tugmalar ko'rinmasligi kerak */
            .no-print {
              display: none !important;
            }
          }
        `}
      </style>

      {/* CHEK SHABLONI (Ekranda ko'rinishi) */}
      <div className="relative bg-white text-black p-4 rounded-xl shadow-2xl w-[320px] max-h-[90vh] overflow-y-auto flex flex-col">
        
        {/* Yopish tugmasi (Printda ko'rinmaydi) */}
        <button 
          onClick={onClose}
          className="no-print absolute top-3 right-3 w-8 h-8 bg-red-100 text-red-600 rounded-full font-black text-lg flex items-center justify-center hover:bg-red-200 transition"
        >
          ✕
        </button>

        {/* ========================================== */}
        {/* PRINTERGA KETADIGAN QISM BOSHLANDI         */}
        {/* ========================================== */}
        <div id="printable-receipt" className="font-mono text-sm leading-tight text-black bg-white pt-6">
          
          {/* Header */}
          <div className="text-center mb-4">
            <h2 className="text-xl font-black uppercase mb-1">{cafeName}</h2>
            <p className="text-xs">MChJ "Premium Cafe"</p>
            <p className="text-xs">Toshkent shahar, Chilonzor tumani</p>
            <p className="text-xs">Tel: +998 (90) 123-45-67</p>
          </div>

          <div className="border-b-2 border-dashed border-black mb-3 pb-3 text-xs">
            <div className="flex justify-between mb-1">
              <span>Chek raqami:</span>
              <span className="font-bold">#{order.id.toString().slice(-4)}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span>Stol:</span>
              <span className="font-bold">{order.table}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span>Sana:</span>
              <span>{order.date} {order.closeTime?.split(', ')[1]}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span>Ofitsiant:</span>
              <span>{order.waiterName}</span>
            </div>
            <div className="flex justify-between">
              <span>Kassir:</span>
              <span>{order.cashierName}</span>
            </div>
          </div>

          {/* Table Items */}
          <table className="w-full text-xs mb-3">
            <thead>
              <tr className="border-b border-black">
                <th className="text-left pb-1 font-normal w-1/2">Nomi</th>
                <th className="text-center pb-1 font-normal">Soni</th>
                <th className="text-right pb-1 font-normal">Summa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-300">
              {order.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-1 pr-1 font-bold">
                    {item.name}
                    {item.note && <span className="block text-[10px] font-normal italic">- {item.note}</span>}
                  </td>
                  <td className="py-1 text-center">{item.quantity}</td>
                  <td className="py-1 text-right">
                    {(item.price * item.quantity).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="border-t-2 border-dashed border-black pt-2 mb-4 space-y-1 text-xs">
            <div className="flex justify-between">
              <span>Jami (Taomlar):</span>
              <span>{totals.subTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Xizmat haqi:</span>
              <span>{totals.serviceFeeAmount.toLocaleString()}</span>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between font-bold">
                <span>Chegirma:</span>
                <span>- {totals.discountAmount.toLocaleString()}</span>
              </div>
            )}
            
            <div className="flex justify-between font-black text-sm pt-2 mt-2 border-t border-black">
              <span>TO'LANADIGAN:</span>
              <span>{totals.finalTotal.toLocaleString()}</span>
            </div>
            
            <div className="flex justify-between pt-2">
              <span>To'lov usuli:</span>
              <span className="font-bold">{order.paymentMethod}</span>
            </div>
            
            {/* Aralash to'lov bo'lsa detallarni ko'rsatish */}
            {order.paymentMethod === 'Aralash' && order.paymentDetails && (
              <>
                <div className="flex justify-between text-[10px]">
                  <span className="pl-2">- Naqd:</span>
                  <span>{order.paymentDetails.cashAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="pl-2">- Plastik:</span>
                  <span>{order.paymentDetails.cardAmount.toLocaleString()}</span>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="text-center text-xs mt-6 mb-2">
            <p className="font-bold">XARIDINGIZ UCHUN RAHMAT!</p>
            <p className="mt-1 opacity-70">Bizni yana tashrifingiz bilan quvontiring :)</p>
          </div>
          
          {/* QR Code Simulyatsiyasi */}
          <div className="flex justify-center mt-4 pb-4">
            <div className="w-24 h-24 border-2 border-black flex items-center justify-center p-1">
              <div className="w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ3aGl0ZSIvPjxwYXRoIGQ9Ik0xMCAxMGgzMHYzMEgxMHptMTAgMTBoMTB2MTBIMjB6bTQwLTQwaDMwdjMwSDYwem0xMCAxMGgxMHYxMEg3MHpNMTAgNjBoMzB2MzBIMTB6bTEwIDEwaDEwdjEwSDIwem0zMC02MGgyMHYxMEg1MHptMCA0MGgyMHYzMEg1MHpNNzAgNjBoMjB2MTBINzB6IiBmaWxsPSJibGFjayIvPjwvc3ZnPg==')] bg-cover"></div>
            </div>
          </div>
          
        </div>
        {/* ========================================== */}
        {/* PRINTERGA KETADIGAN QISM TUGADI            */}
        {/* ========================================== */}

        <button 
          onClick={() => window.print()}
          className="no-print w-full bg-indigo-600 text-white font-black py-4 rounded-xl mt-4 shadow-lg hover:bg-indigo-700 transition"
        >
          🖨 Qayta chop etish
        </button>

      </div>
    </div>
  );
}