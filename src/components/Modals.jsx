import React, { useState, useEffect, useMemo } from 'react';

// =========================================================================
// 1. STOL UCHUN QR-KOD GENERATSIYA VA CHOP ETISH OYNASI (TableQrModal)
// =========================================================================
export function TableQrModal({ 
  table = '1-Stol', 
  cafeName = 'Premium Cafe', 
  onClose 
}) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [imgError, setImgError] = useState(false);

  const safeTable = String(table || '1-Stol');

  // Mijoz skaner qiladigan to'liq URL manzil
  const targetMenuUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const base = window.location.origin + window.location.pathname;
    return `${base}?table=${encodeURIComponent(safeTable)}`;
  }, [safeTable]);

  // QR kodni avtomatik generatsiya qilish
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(targetMenuUrl)}`;

  // Escape bosilganda yopish
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && typeof onClose === 'function') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopyUrl = () => {
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(targetMenuUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div 
      onClick={() => typeof onClose === 'function' && onClose()}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[120] p-4 animate-fade-in"
    >
      {/* QR STIKER UCHUN MAXSUS PRINT CSS */}
      <style>{`
        @media print {
          @page {
            margin: 10mm;
          }
          body * {
            visibility: hidden;
          }
          #printable-qr-card, #printable-qr-card * {
            visibility: visible;
          }
          #printable-qr-card {
            position: absolute;
            left: 50%;
            top: 20px;
            transform: translateX(-50%);
            width: 90mm;
            padding: 20px;
            border: 3px solid #000 !important;
            border-radius: 24px;
            box-shadow: none !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-[2rem] max-w-sm w-full text-center shadow-2xl relative border border-gray-100 dark:border-gray-700"
      >
        {/* Yopish (X) tugmasi */}
        <button
          type="button"
          onClick={onClose}
          className="no-print absolute top-4 right-4 w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-red-100 hover:text-red-500 font-black flex items-center justify-center transition"
          title="Yopish (Esc)"
        >
          ✕
        </button>

        {/* CHOP ETILADIGAN STOL KARTASI */}
        <div id="printable-qr-card" className="pt-2">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-2xl mx-auto mb-3 shadow-md no-print">
            🍽️
          </div>

          <h2 className="text-2xl font-black uppercase text-amber-900 dark:text-amber-400 tracking-wide">
            {cafeName}
          </h2>
          <p className="text-xs font-black uppercase tracking-widest text-gray-400 mt-0.5 mb-4">
            Raqamli QR-Menyu
          </p>

          {/* Stol raqami badge */}
          <div className="inline-block bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-300 px-5 py-1.5 rounded-full font-black text-base mb-5 border border-amber-300 dark:border-amber-700">
            🪑 {safeTable}
          </div>
          
          {/* QR Kod Tasviri */}
          <div className="bg-amber-50/70 dark:bg-white p-5 rounded-3xl border-4 border-dashed border-amber-400 inline-block mb-5 shadow-sm">
            {!imgError ? (
              <img 
                src={qrUrl} 
                alt={`QR Code ${safeTable}`} 
                onError={() => setImgError(true)}
                className="w-48 h-48 mx-auto object-contain" 
              />
            ) : (
              <div className="w-48 h-48 mx-auto flex flex-col items-center justify-center bg-white text-black p-3">
                <div 
                  className="w-36 h-36 bg-cover"
                  style={{
                    backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ3aGl0ZSIvPjxwYXRoIGQ9Ik0xMCAxMGgzMHYzMEgxMHptMTAgMTBoMTB2MTBIMjB6bTQwLTQwaDMwdjMwSDYwem0xMCAxMGgxMHYxMEg3MHpNMTAgNjBoMzB2MzBIMTB6bTEwIDEwaDEwdjEwSDIwem0zMC02MGgyMHYxMEg1MHptMCA0MGgyMHYzMEg1MHpNNzAgNjBoMjB2MTBINzB6IiBmaWxsPSJibGFjayIvPjwvc3ZnPg==")`
                  }}
                />
                <span className="text-[10px] font-black mt-1">{safeTable}</span>
              </div>
            )}
          </div>
          
          <p className="text-xs text-gray-600 dark:text-gray-300 mb-2 font-bold leading-relaxed px-2">
            📱 Telefon kamerangizni QR-kodga yo'naltiring, menyuni ko'ring va ofitsiantni kutmasdan buyurtma bering!
          </p>
        </div>

        {/* Havolani nusxalash (no-print) */}
        <div className="no-print mt-4 mb-5">
          <button
            type="button"
            onClick={handleCopyUrl}
            className="text-xs font-black text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            {copiedLink ? '✅ Havola nusxalandi!' : '🔗 QR-Menyu havolasini nusxalash'}
          </button>
        </div>
        
        {/* Tugmalar */}
        <div className="no-print flex gap-3">
          <button 
            type="button"
            onClick={() => window.print()} 
            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-3.5 rounded-xl font-black text-sm shadow-lg shadow-amber-600/30 transition active:scale-95"
          >
            🖨️ Chop etish
          </button>
          <button 
            type="button"
            onClick={onClose} 
            className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 py-3.5 rounded-xl font-bold text-sm hover:bg-gray-300 transition active:scale-95"
          >
            Yopish
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// 2. CHEK (RECEIPT) CHOP ETISH VA ULASHISH OYNASI (ReceiptModal)
// =========================================================================
export function ReceiptModal({ 
  order, 
  receipt,
  receiptData,
  cafeName = 'Premium Cafe', 
  serviceFee = 10,
  onClose 
}) {
  const [copiedText, setCopiedText] = useState(false);

  // Prop'larni xavfsiz aniqlash
  const resolvedOrder = useMemo(() => {
    if (order && typeof order === 'object') return order.order || order;
    if (receipt && typeof receipt === 'object') return receipt.order || receipt;
    if (receiptData && typeof receiptData === 'object') return receiptData.order || receiptData;
    return null;
  }, [order, receipt, receiptData]);

  // Escape bosilganda yopish
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

  const safeItems = Array.isArray(resolvedOrder.items) ? resolvedOrder.items : [];

  // Xavfsiz matematik hisob-kitoblar
  const calculatedSubTotal = safeItems.reduce((sum, item) => {
    const price = Number(item?.price ?? item?.variants?.[0]?.price ?? 0) || 0;
    const qty = Number(item?.quantity ?? item?.qty ?? 1) || 0;
    return sum + (price * qty);
  }, 0);

  const subTotal = Number(
    resolvedOrder.subTotal ?? resolvedOrder.subtotal ?? calculatedSubTotal
  ) || 0;

  const isTakeaway = resolvedOrder.table === 'Olib ketish';
  const serviceFeePercent = isTakeaway
    ? 0
    : Number(
        resolvedOrder.serviceFeePercent ?? 
        resolvedOrder.serviceFee ?? 
        serviceFee
      ) || 0;

  const serviceFeeAmount = Number(
    resolvedOrder.serviceFeeAmount ?? Math.round((subTotal * serviceFeePercent) / 100)
  ) || 0;

  const discountAmount = Number(
    resolvedOrder.discountAmount ?? resolvedOrder.discount ?? 0
  ) || 0;

  const usedBonus = Number(resolvedOrder.usedBonus ?? 0) || 0;
  const earnedBonus = Number(resolvedOrder.earnedBonus ?? 0) || 0;

  const finalTotal = Number(
    resolvedOrder.finalTotal ?? 
    resolvedOrder.total ?? 
    Math.max(0, subTotal + serviceFeeAmount - discountAmount - usedBonus)
  ) || 0;

  const waiterLabel = resolvedOrder.waiterName || resolvedOrder.waiter || 'Ofitsiant';
  const dateLabel = resolvedOrder.date || new Date().toLocaleDateString();
  const timeLabel = resolvedOrder.closeTime || resolvedOrder.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const tableLabel = resolvedOrder.table || '1-Stol';
  const paymentMethod = resolvedOrder.paymentMethod || 'Naqd';

  // To'lov taqsimoti (ham paymentBreakdown, ham paymentDetails ni o'qiydi)
  const cashPaid = Number(
    resolvedOrder.paymentBreakdown?.naqd ?? 
    resolvedOrder.paymentDetails?.cashAmount ?? 
    resolvedOrder.mixedDetails?.cash ?? 
    0
  ) || 0;

  const cardPaid = Number(
    resolvedOrder.paymentBreakdown?.terminal ?? 
    resolvedOrder.paymentDetails?.cardAmount ?? 
    resolvedOrder.mixedDetails?.card ?? 
    0
  ) || 0;

  const clickPaid = Number(
    resolvedOrder.paymentBreakdown?.click ?? 
    resolvedOrder.paymentDetails?.clickAmount ?? 
    0
  ) || 0;

  const paymePaid = Number(
    resolvedOrder.paymentBreakdown?.payme ?? 
    resolvedOrder.paymentDetails?.paymeAmount ?? 
    0
  ) || 0;

  // Telegram va Nusxalash uchun to'liq chek matni
  const plainReceiptText = [
    `🧾 *${cafeName} — Xarid cheki*`,
    `📅 Sana: ${dateLabel} | ${timeLabel}`,
    `🪑 Joy: ${tableLabel}`,
    `👤 Xodim: ${waiterLabel}`,
    `------------------------`,
    ...safeItems.map(i => {
      const p = Number(i?.price ?? i?.variants?.[0]?.price ?? 0) || 0;
      const q = Number(i?.quantity ?? i?.qty ?? 1) || 0;
      return `• ${i?.name} (${q} x ${p.toLocaleString()}) = ${(p * q).toLocaleString()} so'm`;
    }),
    `------------------------`,
    `Taomlar: ${subTotal.toLocaleString()} so'm`,
    serviceFeeAmount > 0 ? `Xizmat (${serviceFeePercent}%): +${serviceFeeAmount.toLocaleString()} so'm` : null,
    discountAmount > 0 ? `Chegirma: -${discountAmount.toLocaleString()} so'm` : null,
    `💰 *JAMI TO'LOV: ${finalTotal.toLocaleString()} so'm* (${paymentMethod})`,
    `\nTashrifingiz uchun rahmat! 😊`
  ].filter(Boolean).join('\n');

  const tgShareText = encodeURIComponent(plainReceiptText);

  const handleCopyReceipt = () => {
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(plainReceiptText.replace(/\*/g, ''));
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  return (
    <div 
      onClick={() => typeof onClose === 'function' && onClose()}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[120] p-4 print:bg-white print:static print:p-0 animate-fade-in"
    >
      <style>{`
        @media print { 
          @page {
            size: 80mm auto;
            margin: 0mm;
          }
          body * { visibility: hidden; } 
          #receipt-content, #receipt-content * { visibility: visible; } 
          #receipt-content { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 80mm; 
            margin: 0; 
            padding: 8px; 
            box-shadow: none !important; 
            border: none !important; 
          } 
          .no-print { display: none !important; } 
        }
      `}</style>
      
      <div 
        id="receipt-content" 
        onClick={(e) => e.stopPropagation()}
        className="bg-white p-6 rounded-3xl w-full max-w-sm max-h-[92vh] overflow-y-auto shadow-2xl relative text-gray-800 font-mono text-sm print:max-w-full mx-auto"
      >
        {/* 1. HEADER */}
        <div className="text-center mb-5 border-b-2 border-dashed border-gray-300 pb-4">
          <h2 className="font-black text-2xl uppercase mb-1 text-gray-900">{cafeName}</h2>
          <p className="text-xs text-gray-500">Sana: {dateLabel} | {timeLabel}</p>
          <p className="font-black text-lg mt-2 text-gray-900">Joy: {tableLabel}</p>
          <p className="text-xs text-gray-500 mt-1">Xodim: {waiterLabel}</p>
          {(resolvedOrder.customerPhone || resolvedOrder.customerName || resolvedOrder.debtorName) && (
            <p className="text-xs font-bold text-indigo-600 mt-1">
              Mijoz: {resolvedOrder.customerName || resolvedOrder.debtorName || resolvedOrder.customerPhone}
            </p>
          )}
        </div>
        
        {/* 2. TAOMLAR RO'YXATI */}
        <div className="space-y-2.5 mb-4 border-b-2 border-dashed border-gray-300 pb-4">
          <div className="flex justify-between font-black text-xs uppercase text-gray-500 mb-1">
            <span>Taom</span>
            <span>Summa</span>
          </div>
          {safeItems.map((i, idx) => {
            if (!i) return null;
            const price = Number(i.price ?? i.variants?.[0]?.price ?? 0) || 0;
            const qty = Number(i.quantity ?? i.qty ?? 1) || 0;
            const lineTotal = price * qty;

            return (
              <div key={i.cartItemId || i.id || idx} className="flex justify-between items-start text-xs sm:text-sm">
                <div className="pr-2">
                  <span className="font-bold text-gray-900">{i.name}</span>
                  <span className="block text-xs text-gray-500">
                    {qty} x {price.toLocaleString()} s
                  </span>
                  {i.note && (
                    <span className="block text-[11px] italic text-gray-500">
                      * {i.note}
                    </span>
                  )}
                </div>
                <span className="font-black text-gray-900 whitespace-nowrap">
                  {lineTotal.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
        
        {/* 3. HISOB-KITOBLAR */}
        <div className="space-y-1.5 mb-4 text-xs font-semibold text-gray-600 border-b-2 border-dashed border-gray-300 pb-4">
          <div className="flex justify-between">
            <span>Asosiy summa:</span>
            <span className="font-bold">{subTotal.toLocaleString()} so'm</span>
          </div>

          {serviceFeeAmount > 0 && (
            <div className="flex justify-between">
              <span>Xizmat haqi ({serviceFeePercent}%):</span>
              <span className="font-bold">+ {serviceFeeAmount.toLocaleString()} so'm</span>
            </div>
          )}

          {discountAmount > 0 && (
            <div className="flex justify-between text-red-600 font-bold">
              <span>Chegirma:</span>
              <span>- {discountAmount.toLocaleString()} so'm</span>
            </div>
          )}

          {usedBonus > 0 && (
            <div className="flex justify-between text-indigo-600 font-black pt-1">
              <span>Ishlatilgan Bonus:</span>
              <span>- {usedBonus.toLocaleString()} so'm</span>
            </div>
          )}
        </div>
        
        {/* 4. YAKUNIY TO'LOV */}
        <div className="flex justify-between items-center font-black text-lg sm:text-xl mb-3 bg-gray-100 p-3.5 rounded-xl text-gray-900">
          <span>Jami To'lov:</span>
          <span>{finalTotal.toLocaleString()} so'm</span>
        </div>
        
        {/* 5. TO'LOV SHAKLI */}
        <div className="text-right text-xs font-bold text-gray-500 mb-4 uppercase tracking-wider">
          <span>To'lov usuli: <strong className="text-gray-900">{paymentMethod}</strong></span>
          {paymentMethod === 'Aralash' && (
            <div className="mt-1 space-y-0.5 text-[11px]">
              {cashPaid > 0 && <span className="block text-gray-800">Naqd: {cashPaid.toLocaleString()} so'm</span>}
              {cardPaid > 0 && <span className="block text-gray-800">Terminal: {cardPaid.toLocaleString()} so'm</span>}
              {clickPaid > 0 && <span className="block text-gray-800">Click: {clickPaid.toLocaleString()} so'm</span>}
              {paymePaid > 0 && <span className="block text-gray-800">Payme: {paymePaid.toLocaleString()} so'm</span>}
            </div>
          )}
        </div>
        
        {earnedBonus > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 p-2.5 rounded-xl text-center mb-5">
            <span className="text-xs text-indigo-800 font-bold">Raqamingizga bonus yozildi:</span>
            <p className="text-lg font-black text-indigo-600">
              +{Math.floor(earnedBonus).toLocaleString()} so'm 🎁
            </p>
          </div>
        )}
        
        <p className="text-center text-xs text-gray-500 italic mb-5">
          Tashrifingiz uchun rahmat!<br/>Yana kutib qolamiz. 😊
        </p>
        
        {/* 6. BOSHQARUV TUGMALARI (Printda ko'rinmaydi) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 no-print mt-4 font-sans">
          <button 
            type="button"
            onClick={() => window.print()} 
            className="bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-xl font-black shadow-md text-xs transition active:scale-95"
          >
            🖨️ Print
          </button>

          <button
            type="button"
            onClick={handleCopyReceipt}
            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-3 rounded-xl font-black text-xs transition active:scale-95"
          >
            {copiedText ? '✅ Olindi' : '📋 Nusxa'}
          </button>

          <a 
            href={`https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${tgShareText}`} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="bg-sky-500 hover:bg-sky-600 text-white py-3 rounded-xl font-black shadow-md text-center flex items-center justify-center text-xs transition active:scale-95"
          >
            ✈️ TG
          </a>

          <button 
            type="button"
            onClick={onClose} 
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 py-3 rounded-xl font-black text-xs transition active:scale-95"
          >
            ✕ Yopish
          </button>
        </div>
      </div>
    </div>
  );
}

export default { TableQrModal, ReceiptModal };