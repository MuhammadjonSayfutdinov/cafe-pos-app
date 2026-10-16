import React, { useState, useEffect, useMemo } from 'react';

export default function PrintReceiptModal({ 
  cafeName = 'Premium Cafe', 
  receiptData, 
  order: orderProp,
  receipt: receiptProp,
  totals: totalsProp,
  serviceFee = 10,
  onClose 
}) {
  // Printer qog'ozi kengligi: '80mm' (standart) yoki '58mm' (kichik kassa)
  const [paperSize, setPaperSize] = useState('80mm');

  // ==========================================
  // 1. PROP'LARNI XAVFSIZ ANIQLASH (CRASH PROTECTION)
  // ==========================================
  const resolvedOrder = useMemo(() => {
    if (receiptData && typeof receiptData === 'object') {
      if (receiptData.order) return receiptData.order;
      if (Array.isArray(receiptData.items) || receiptData.table) return receiptData;
    }
    if (orderProp && typeof orderProp === 'object') {
      if (orderProp.order) return orderProp.order;
      return orderProp;
    }
    if (receiptProp && typeof receiptProp === 'object') {
      if (receiptProp.order) return receiptProp.order;
      return receiptProp;
    }
    return null;
  }, [receiptData, orderProp, receiptProp]);

  const safeItems = useMemo(() => {
    return Array.isArray(resolvedOrder?.items) ? resolvedOrder.items : [];
  }, [resolvedOrder]);

  // Agar totals alohida uzatilmagan bo'lsa, order ichidan avtomatik hisoblaymiz
  const resolvedTotals = useMemo(() => {
    const rawTotals = receiptData?.totals || totalsProp;

    const calculatedSubTotal = safeItems.reduce((sum, item) => {
      const price = Number(item?.price ?? item?.variants?.[0]?.price ?? 0) || 0;
      const qty = Number(item?.quantity ?? item?.qty ?? 1) || 0;
      return sum + (price * qty);
    }, 0);

    const subTotal = Number(
      rawTotals?.subTotal ?? 
      resolvedOrder?.subTotal ?? 
      resolvedOrder?.subtotal ?? 
      calculatedSubTotal
    ) || 0;

    const isTakeaway = resolvedOrder?.table === 'Olib ketish';
    const feePct = isTakeaway 
      ? 0 
      : Number(resolvedOrder?.serviceFee !== undefined ? resolvedOrder.serviceFee : serviceFee) || 0;

    const serviceFeeAmount = Number(
      rawTotals?.serviceFeeAmount ?? 
      resolvedOrder?.serviceFeeAmount ?? 
      Math.round((subTotal * feePct) / 100)
    ) || 0;

    const discountAmount = Number(
      rawTotals?.discountAmount ?? 
      resolvedOrder?.discountAmount ?? 
      resolvedOrder?.discount ?? 
      0
    ) || 0;

    const finalTotal = Number(
      rawTotals?.finalTotal ?? 
      resolvedOrder?.finalTotal ?? 
      resolvedOrder?.total ?? 
      Math.max(0, subTotal + serviceFeeAmount - discountAmount)
    ) || 0;

    return {
      subTotal,
      serviceFeePercent: feePct,
      serviceFeeAmount,
      discountAmount,
      finalTotal
    };
  }, [receiptData, totalsProp, resolvedOrder, safeItems, serviceFee]);

  // ==========================================
  // 2. AVTOMATIK PRINT VA KLAVIATURA (ESC)
  // ==========================================
  useEffect(() => {
    if (!resolvedOrder) return;
    const timer = setTimeout(() => {
      window.print();
    }, 450);

    return () => clearTimeout(timer);
  }, [resolvedOrder]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && typeof onClose === 'function') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!resolvedOrder) return null;

  // ==========================================
  // 3. YORDAMCHI MA'LUMOTLARNI FORMATLASH
  // ==========================================
  const checkNumber = String(resolvedOrder.id || Date.now()).slice(-4);
  const tableLabel = resolvedOrder.table || '1-Stol';
  const waiterLabel = resolvedOrder.waiterName || resolvedOrder.waiter || 'Ofitsiant';
  const cashierLabel = resolvedOrder.cashierName || 'Kassir';
  const paymentMethodLabel = resolvedOrder.paymentMethod || 'Naqd';

  // Sana va vaqtni xavfsiz shakllantirish (undefined chiqmasligi uchun)
  const displayDateTime = (() => {
    if (resolvedOrder.closeTime) return resolvedOrder.closeTime;
    if (resolvedOrder.date && resolvedOrder.time) return `${resolvedOrder.date} ${resolvedOrder.time}`;
    return new Date().toLocaleString();
  })();

  const cashPart = Number(
    resolvedOrder.paymentDetails?.cashAmount ?? 
    resolvedOrder.mixedDetails?.cash ?? 
    0
  ) || 0;

  const cardPart = Number(
    resolvedOrder.paymentDetails?.cardAmount ?? 
    resolvedOrder.mixedDetails?.card ?? 
    0
  ) || 0;

  // ==========================================
  // 4. RENDER (UI VA PRINT SHABLONI)
  // ==========================================
  return (
    <div 
      onClick={() => typeof onClose === 'function' && onClose()}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
    >
      {/* TERMOPRINTER UCHUN MAXSUS CSS */}
      <style>
        {`
          @media print {
            @page {
              size: ${paperSize} auto;
              margin: 0mm;
            }
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
              width: ${paperSize};
              margin: 0;
              padding: ${paperSize === '58mm' ? '4px' : '10px'};
              box-shadow: none !important;
              background: #ffffff !important;
              color: #000000 !important;
            }
            .no-print {
              display: none !important;
            }
          }
        `}
      </style>

      {/* MODAL QUTISI */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white text-black p-4 sm:p-5 rounded-3xl shadow-2xl w-full max-w-[360px] max-h-[92vh] overflow-y-auto flex flex-col"
      >
        
        {/* YUQORI BOSHQARUV PANELI (Printda ko'rinmaydi) */}
        <div className="no-print flex justify-between items-center pb-3 mb-2 border-b border-gray-200">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setPaperSize('80mm')}
              className={`px-2.5 py-1 rounded-lg text-xs font-black transition ${
                paperSize === '80mm' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600'
              }`}
            >
              🖨 80mm
            </button>
            <button
              type="button"
              onClick={() => setPaperSize('58mm')}
              className={`px-2.5 py-1 rounded-lg text-xs font-black transition ${
                paperSize === '58mm' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600'
              }`}
            >
              🧾 58mm
            </button>
          </div>

          <button 
            type="button"
            onClick={onClose}
            className="w-8 h-8 bg-red-100 text-red-600 rounded-full font-black text-base flex items-center justify-center hover:bg-red-200 transition"
            title="Yopish (Esc)"
          >
            ✕
          </button>
        </div>

        {/* ========================================== */}
        {/* PRINTERGA KETADIGAN HAQIQIY CHEK QISMI     */}
        {/* ========================================== */}
        <div 
          id="printable-receipt" 
          className="font-mono text-xs leading-snug text-black bg-white pt-2"
        >
          
          {/* 1. HEADER (Kafe nomi va manzili) */}
          <div className="text-center mb-3">
            <h2 className="text-lg font-black uppercase tracking-wider mb-0.5">
              {cafeName}
            </h2>
            <p className="text-[11px] font-bold">MChJ "{cafeName}"</p>
            <p className="text-[10px]">Toshkent shahar, Chilonzor tumani</p>
            <p className="text-[10px]">Tel: +998 (90) 123-45-67</p>
          </div>

          {/* 2. CHEK REKVIZITLARI */}
          <div className="border-y-2 border-dashed border-black py-2 mb-2.5 space-y-0.5 text-[11px]">
            <div className="flex justify-between">
              <span>Chek raqami:</span>
              <span className="font-black">#{checkNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>Joy / Xizmat:</span>
              <span className="font-black">{tableLabel}</span>
            </div>
            <div className="flex justify-between">
              <span>Sana va vaqt:</span>
              <span className="font-bold">{displayDateTime}</span>
            </div>
            <div className="flex justify-between">
              <span>Xizmat ko'rsatdi:</span>
              <span className="font-bold">{waiterLabel}</span>
            </div>
            <div className="flex justify-between">
              <span>Kassir:</span>
              <span className="font-bold">{cashierLabel}</span>
            </div>
          </div>

          {/* 3. TAOMLAR JADVALI */}
          <table className="w-full text-[11px] mb-2.5">
            <thead>
              <tr className="border-b border-black font-black uppercase">
                <th className="text-left pb-1 w-1/2">Taom</th>
                <th className="text-center pb-1">Soni</th>
                <th className="text-right pb-1">Summa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dashed divide-gray-300">
              {safeItems.map((item, idx) => {
                if (!item) return null;
                const price = Number(item.price ?? item.variants?.[0]?.price ?? 0) || 0;
                const qty = Number(item.quantity ?? item.qty ?? 1) || 0;
                const lineSum = price * qty;

                return (
                  <tr key={item.cartItemId || item.id || idx}>
                    <td className="py-1.5 pr-1">
                      <span className="font-bold block">{item.name}</span>
                      <span className="text-[10px] text-gray-600 block">
                        {price.toLocaleString()} x {qty}
                      </span>
                      {item.note && (
                        <span className="block text-[10px] italic">
                          * {item.note}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-center font-bold align-top">
                      {qty}
                    </td>
                    <td className="py-1.5 text-right font-bold align-top">
                      {lineSum.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* 4. YAKUNIY HISOB-KITOBLAR */}
          <div className="border-t-2 border-dashed border-black pt-2 mb-3 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span>Taomlar jami:</span>
              <span className="font-bold">{resolvedTotals.subTotal.toLocaleString()} so'm</span>
            </div>

            {resolvedTotals.serviceFeeAmount > 0 && (
              <div className="flex justify-between">
                <span>Xizmat haqi ({resolvedTotals.serviceFeePercent}%):</span>
                <span className="font-bold">{resolvedTotals.serviceFeeAmount.toLocaleString()} so'm</span>
              </div>
            )}

            {resolvedTotals.discountAmount > 0 && (
              <div className="flex justify-between font-bold">
                <span>Chegirma (Skidka):</span>
                <span>- {resolvedTotals.discountAmount.toLocaleString()} so'm</span>
              </div>
            )}
            
            <div className="flex justify-between font-black text-sm pt-2 mt-1.5 border-t border-black">
              <span>JAMI TO'LOV:</span>
              <span>{resolvedTotals.finalTotal.toLocaleString()} so'm</span>
            </div>
            
            <div className="flex justify-between pt-1.5">
              <span>To'lov turi:</span>
              <span className="font-black uppercase">{paymentMethodLabel}</span>
            </div>
            
            {/* Aralash to'lov detallari */}
            {paymentMethodLabel === 'Aralash' && (
              <div className="pl-2 space-y-0.5 text-[10px] border-l-2 border-black mt-1">
                <div className="flex justify-between">
                  <span>- Naqd pulda:</span>
                  <span className="font-bold">{cashPart.toLocaleString()} so'm</span>
                </div>
                <div className="flex justify-between">
                  <span>- Plastik kartada:</span>
                  <span className="font-bold">{cardPart.toLocaleString()} so'm</span>
                </div>
              </div>
            )}

            {/* Qarzga yozilgan bo'lsa */}
            {paymentMethodLabel === 'Qarz' && (resolvedOrder.debtorName || resolvedOrder.paymentDetails?.debtorName) && (
              <div className="flex justify-between text-[10px] pt-1">
                <span>Mijoz (Qarzdor):</span>
                <span className="font-black">
                  {resolvedOrder.debtorName || resolvedOrder.paymentDetails?.debtorName}
                </span>
              </div>
            )}
          </div>

          {/* 5. FOOTER VA FISKAL QR-KOD */}
          <div className="text-center text-[11px] mt-4 mb-2 border-t border-dashed border-black pt-3">
            <p className="font-black uppercase">Xaridingiz uchun rahmat!</p>
            <p className="text-[10px] mt-0.5">Yoqimli ishtaha! Yana kutib qolamiz :)</p>
          </div>
          
          <div className="flex flex-col items-center justify-center mt-2 pb-2">
            <div className="w-20 h-20 border-2 border-black flex items-center justify-center p-1">
              <div 
                className="w-full h-full bg-cover"
                style={{
                  backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ3aGl0ZSIvPjxwYXRoIGQ9Ik0xMCAxMGgzMHYzMEgxMHptMTAgMTBoMTB2MTBIMjB6bTQwLTQwaDMwdjMwSDYwem0xMCAxMGgxMHYxMEg3MHpNMTAgNjBoMzB2MzBIMTB6bTEwIDEwaDEwdjEwSDIwem0zMC02MGgyMHYxMEg1MHptMCA0MGgyMHYzMEg1MHpNNzAgNjBoMjB2MTBINzB6IiBmaWxsPSJibGFjayIvPjwvc3ZnPg==")`
                }}
              />
            </div>
            <span className="text-[9px] font-bold mt-1">
              ID: {resolvedOrder.id || checkNumber}
            </span>
          </div>
          
        </div>
        {/* ========================================== */}
        {/* PRINTERGA KETADIGAN QISM TUGADI            */}
        {/* ========================================== */}

        {/* PASTKI TUGMALAR (Printda ko'rinmaydi) */}
        <div className="no-print flex gap-2 mt-4 pt-3 border-t border-gray-200">
          <button 
            type="button"
            onClick={onClose}
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-black py-3.5 rounded-2xl text-sm transition active:scale-95"
          >
            Yopish
          </button>
          <button 
            type="button"
            onClick={() => window.print()}
            className="flex-[1.5] bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3.5 rounded-2xl text-sm shadow-lg shadow-indigo-600/30 transition active:scale-95 flex items-center justify-center gap-1.5"
          >
            <span>🖨</span> Qayta chop etish
          </button>
        </div>

      </div>
    </div>
  );
}