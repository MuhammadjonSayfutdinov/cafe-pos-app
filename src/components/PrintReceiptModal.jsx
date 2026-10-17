import React, { useState, useEffect, useMemo } from 'react';

export default function PrintReceiptModal({ 
  cafeName: cafeNameProp, 
  receiptData, 
  order: orderProp,
  receipt: receiptProp,
  totals: totalsProp,
  serviceFee = 10,
  onClose 
}) {
  // Printer qog'ozi kengligi: '80mm' (standart kassa) yoki '58mm' (kichik mobil printer)
  const [paperSize, setPaperSize] = useState('80mm');
  const [copiedReceipt, setCopiedReceipt] = useState(false);

  // Kafe nomini prop'dan yoki localStorage'dan xavfsiz olish
  const cafeName = useMemo(() => {
    if (cafeNameProp && String(cafeNameProp).trim()) return String(cafeNameProp).trim();
    try {
      const saved = window.localStorage.getItem('pos_cafe_name');
      if (saved) return JSON.parse(saved) || 'Premium Cafe';
    } catch {
      // ignore error
    }
    return 'Premium Cafe';
  }, [cafeNameProp]);

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

  // ==========================================
  // 2. BARCHA SUMMALAR, CHEGIRMA VA BONUSLARNI HISOBLASH
  // ==========================================
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
      : Number(
          rawTotals?.serviceFeePercent ??
          resolvedOrder?.serviceFeePercent ??
          (resolvedOrder?.serviceFee !== undefined ? resolvedOrder.serviceFee : serviceFee)
        ) || 0;

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

    const usedBonusAmount = Number(
      rawTotals?.usedBonusAmount ??
      resolvedOrder?.usedBonus ??
      0
    ) || 0;

    const earnedCashback = Number(
      rawTotals?.earnedCashback ??
      resolvedOrder?.earnedBonus ??
      0
    ) || 0;

    const finalTotal = Number(
      rawTotals?.finalTotal ?? 
      resolvedOrder?.finalTotal ?? 
      resolvedOrder?.total ?? 
      Math.max(0, subTotal + serviceFeeAmount - discountAmount - usedBonusAmount)
    ) || 0;

    // Jami porsiyalar soni
    const totalPortionsCount = safeItems.reduce((sum, item) => {
      return sum + (Number(item?.quantity ?? item?.qty ?? 1) || 0);
    }, 0);

    return {
      subTotal,
      serviceFeePercent: feePct,
      serviceFeeAmount,
      discountAmount,
      usedBonusAmount,
      earnedCashback,
      finalTotal,
      totalPortionsCount
    };
  }, [receiptData, totalsProp, resolvedOrder, safeItems, serviceFee]);

  // ==========================================
  // 3. AVTOMATIK PRINT VA KLAVIATURA (ESC)
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
  // 4. REKVIZITLAR VA ELEKTRON CHEK MATNI
  // ==========================================
  const checkNumber = String(resolvedOrder.id || Date.now()).slice(-4);
  const tableLabel = resolvedOrder.table || '1-Stol';
  const waiterLabel = resolvedOrder.waiterName || resolvedOrder.waiter || 'Ofitsiant';
  const cashierLabel = resolvedOrder.cashierName || 'Kassir';
  const paymentMethodLabel = resolvedOrder.paymentMethod || 'Naqd';
  const isDebtOrder = paymentMethodLabel === 'Qarz' || resolvedOrder.status === 'Qarz';
  const debtorPerson = resolvedOrder.debtorName || resolvedOrder.paymentDetails?.debtorName || '';

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

  // Telegram va Nusxalash uchun matnli chek
  const shareableText = [
    `🧾 *${cafeName} — Xarid Cheki (#${checkNumber})*`,
    `📅 Sana: ${displayDateTime}`,
    `🪑 Joy: ${tableLabel} | 👤 Xodim: ${waiterLabel}`,
    resolvedOrder.customerName ? `👑 Mijoz: ${resolvedOrder.customerName}` : null,
    `--------------------------------`,
    ...safeItems.map(item => {
      const p = Number(item?.price ?? item?.variants?.[0]?.price ?? 0) || 0;
      const q = Number(item?.quantity ?? item?.qty ?? 1) || 0;
      return `• ${item?.name} (${q} x ${p.toLocaleString()}) = ${(p * q).toLocaleString()} so'm`;
    }),
    `--------------------------------`,
    `Taomlar jami: ${resolvedTotals.subTotal.toLocaleString()} so'm`,
    resolvedTotals.serviceFeeAmount > 0 ? `Xizmat haqi (${resolvedTotals.serviceFeePercent}%): +${resolvedTotals.serviceFeeAmount.toLocaleString()} so'm` : null,
    resolvedTotals.discountAmount > 0 ? `Chegirma: -${resolvedTotals.discountAmount.toLocaleString()} so'm` : null,
    resolvedTotals.usedBonusAmount > 0 ? `Bonusdan qoplandi: -${resolvedTotals.usedBonusAmount.toLocaleString()} so'm` : null,
    `💰 *${isDebtOrder ? 'NASIYA (QARZ):' : "JAMI TO'LOV:"} ${resolvedTotals.finalTotal.toLocaleString()} so'm* (${paymentMethodLabel})`,
    resolvedTotals.earnedCashback > 0 ? `🎁 Yangi yozilgan Cashback: +${resolvedTotals.earnedCashback.toLocaleString()} so'm` : null,
    resolvedOrder.customerBonusBalance !== undefined && resolvedOrder.customerName
      ? `💎 Umumiy bonus balansingiz: ${Number(resolvedOrder.customerBonusBalance).toLocaleString()} so'm`
      : null,
    `\nXaridingiz uchun rahmat! 😊`
  ].filter(Boolean).join('\n');

  const handleCopyText = () => {
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(shareableText.replace(/\*/g, ''));
    setCopiedReceipt(true);
    setTimeout(() => setCopiedReceipt(false), 2000);
  };

  // ==========================================
  // 5. RENDER (UI VA PRINT SHABLONI)
  // ==========================================
  return (
    <div 
      id="receipt-modal-backdrop"
      onClick={() => typeof onClose === 'function' && onClose()}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
    >
      {/* TERMOPRINTER UCHUN MAXSUS CSS (KESILIB QOLMASLIK KAFOLATI BILAN) */}
      <style>
        {`
          @media print {
            @page {
              size: ${paperSize} auto;
              margin: 0mm;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              height: auto !important;
              overflow: visible !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body * {
              visibility: hidden;
            }
            #receipt-modal-backdrop,
            #receipt-modal-box {
              position: static !important;
              width: auto !important;
              max-width: none !important;
              max-height: none !important;
              height: auto !important;
              overflow: visible !important;
              padding: 0 !important;
              margin: 0 !important;
              background: transparent !important;
              box-shadow: none !important;
            }
            #printable-receipt,
            #printable-receipt * {
              visibility: visible !important;
            }
            #printable-receipt {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: ${paperSize} !important;
              margin: 0 !important;
              padding: ${paperSize === '58mm' ? '4px' : '10px'} !important;
              box-shadow: none !important;
              background: #ffffff !important;
              color: #000000 !important;
              overflow: visible !important;
            }
            .no-print {
              display: none !important;
            }
          }
        `}
      </style>

      {/* MODAL QUTISI */}
      <div 
        id="receipt-modal-box"
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white text-black p-4 sm:p-5 rounded-3xl shadow-2xl w-full max-w-[370px] max-h-[92vh] overflow-y-auto flex flex-col"
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
            {resolvedOrder.customerName && (
              <div className="flex justify-between pt-0.5 border-t border-dotted border-black">
                <span>Doimiy mijoz:</span>
                <span className="font-black">
                  {resolvedOrder.customerName}
                  {resolvedOrder.customerPhone ? ` (${resolvedOrder.customerPhone})` : ''}
                </span>
              </div>
            )}
          </div>

          {/* 3. TAOMLAR JADVALI */}
          <table className="w-full text-[11px] mb-2.5">
            <thead>
              <tr className="border-b border-black font-black uppercase">
                <th className="text-left pb-1 w-1/2">Taom ({safeItems.length} xil)</th>
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
              <span>Taomlar jami ({resolvedTotals.totalPortionsCount} pors):</span>
              <span className="font-bold">{resolvedTotals.subTotal.toLocaleString()} so'm</span>
            </div>

            {resolvedTotals.serviceFeeAmount > 0 && (
              <div className="flex justify-between">
                <span>Xizmat haqi ({resolvedTotals.serviceFeePercent}%):</span>
                <span className="font-bold">+ {resolvedTotals.serviceFeeAmount.toLocaleString()} so'm</span>
              </div>
            )}

            {resolvedTotals.discountAmount > 0 && (
              <div className="flex justify-between font-bold">
                <span>Chegirma (Skidka):</span>
                <span>- {resolvedTotals.discountAmount.toLocaleString()} so'm</span>
              </div>
            )}

            {resolvedTotals.usedBonusAmount > 0 && (
              <div className="flex justify-between font-black">
                <span>Bonusdan qoplandi:</span>
                <span>- {resolvedTotals.usedBonusAmount.toLocaleString()} so'm</span>
              </div>
            )}
            
            <div className="flex justify-between font-black text-sm pt-2 mt-1.5 border-t border-black">
              <span>{isDebtOrder ? 'NASIYA SUMMASI:' : "JAMI TO'LOV:"}</span>
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

            {/* Qarzga (Nasiyaga) yozilgan bo'lsa — Qarzdor va Imzo joyi */}
            {isDebtOrder && (
              <div className="mt-2 pt-2 border-t border-dashed border-black space-y-1.5 text-[10px]">
                <p className="font-black text-center uppercase">
                  ⚠️ CHEK NASIYAGA (QARZGA) YOZILDI
                </p>
                {debtorPerson && (
                  <div className="flex justify-between">
                    <span>Qarzdor mijoz:</span>
                    <span className="font-black">{debtorPerson}</span>
                  </div>
                )}
                <div className="pt-3 flex justify-between items-end">
                  <span>Mijoz imzosi:</span>
                  <span>___________________</span>
                </div>
              </div>
            )}
          </div>

          {/* 5. CRM CASHBACK VA BONUS BALANSI QUTISI */}
          {(resolvedTotals.earnedCashback > 0 ||
            resolvedTotals.usedBonusAmount > 0 ||
            (resolvedOrder.customerName && resolvedOrder.customerBonusBalance !== undefined)) && (
            <div className="border-2 border-black p-2 rounded-lg text-center mb-3 space-y-0.5 text-[10px]">
              <p className="font-black uppercase border-b border-dotted border-black pb-0.5 mb-1">
                🎁 Jamg'arma Bonus Dasturi
              </p>
              {resolvedTotals.usedBonusAmount > 0 && (
                <div className="flex justify-between">
                  <span>Chegirilgan bonus:</span>
                  <span className="font-bold">-{resolvedTotals.usedBonusAmount.toLocaleString()} so'm</span>
                </div>
              )}
              {resolvedTotals.earnedCashback > 0 && (
                <div className="flex justify-between">
                  <span>Shu xariddan Cashback:</span>
                  <span className="font-black">+{resolvedTotals.earnedCashback.toLocaleString()} so'm</span>
                </div>
              )}
              {resolvedOrder.customerBonusBalance !== undefined && (
                <div className="flex justify-between pt-0.5 border-t border-dotted border-black font-black">
                  <span>Joriy bonus qoldig'i:</span>
                  <span>{Number(resolvedOrder.customerBonusBalance).toLocaleString()} so'm</span>
                </div>
              )}
            </div>
          )}

          {/* 6. FOOTER VA INLINE SVG QR-KOD */}
          <div className="text-center text-[11px] mt-3 mb-2 border-t border-dashed border-black pt-3">
            <p className="font-black uppercase">Xaridingiz uchun rahmat!</p>
            <p className="text-[10px] mt-0.5">Yoqimli ishtaha! Yana kutib qolamiz :)</p>
          </div>
          
          <div className="flex flex-col items-center justify-center mt-2 pb-2">
            <div className="w-20 h-20 border-2 border-black flex items-center justify-center p-1 bg-white">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 100 100"
                className="w-full h-full"
              >
                <rect width="100" height="100" fill="#ffffff" />
                <path
                  d="M10 10h30v30H10zm10 10h10v10H20zm40-10h30v30H60zm10 10h10v10H70zM10 60h30v30H10zm10 10h10v10H20zm30-60h10v20H50zm0 30h20v10H50zm-10 10h10v10H40zm10 10h10v30H50zm20 0h20v10H70zm0 20h10v10H70zm10-10h10v20H80z"
                  fill="#000000"
                />
              </svg>
            </div>
            <span className="text-[9px] font-bold mt-1">
              ID: {resolvedOrder.id || checkNumber}
            </span>
          </div>
          
        </div>
        {/* ========================================== */}
        {/* PRINTERGA KETADIGAN QISM TUGADI            */}
        {/* ========================================== */}

        {/* PASTKI BOSHQARUV TUGMALARI (Printda ko'rinmaydi) */}
        <div className="no-print space-y-2 mt-4 pt-3 border-t border-gray-200">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCopyText}
              className="py-2.5 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-xs transition active:scale-95"
            >
              {copiedReceipt ? '✅ Nusxalandi!' : '📋 Matnni nusxalash'}
            </button>

            <a
              href={`https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent(shareableText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2.5 px-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-black text-xs text-center flex items-center justify-center gap-1 transition active:scale-95"
            >
              <span>✈️</span> Telegramdan ulashish
            </a>
          </div>

          <div className="flex gap-2">
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
    </div>
  );
}