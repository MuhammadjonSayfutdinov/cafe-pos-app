import React from 'react';

export default function CashierPaymentControls({
  discountType = 'none', 
  setDiscountType,
  discountValue = '', 
  setDiscountValue,
  paymentMethod = 'Naqd', 
  setPaymentMethod,
  mixedCash = '', 
  setMixedCash,
  mixedCard = '', 
  setMixedCard,
  debtorName = '', 
  setDebtorName,
  onPaymentSubmit
}) {
  const paymentMethods = [
    { id: 'Naqd', icon: '💵', label: 'Naqd' },
    { id: 'Plastik', icon: '💳', label: 'Plastik' },
    { id: 'Payme', icon: '📱', label: 'Payme' },
    { id: 'Click', icon: '📲', label: 'Click' },
    { id: 'Aralash', icon: '🔄', label: 'Aralash' },
    { id: 'Qarz', icon: '📝', label: 'Qarzga' }
  ];

  // Chegirma turini o'zgartirganda eski qiymatni tozalash
  const handleDiscountTypeChange = (newType) => {
    if (typeof setDiscountType === 'function') {
      setDiscountType(newType);
    }
    if (typeof setDiscountValue === 'function') {
      setDiscountValue('');
    }
  };

  // Chegirma qiymatini xavfsiz kiritish (manfiy va >100% dan himoya)
  const handleDiscountValueChange = (val) => {
    if (typeof setDiscountValue !== 'function') return;
    if (val === '') {
      setDiscountValue('');
      return;
    }
    const num = Math.max(0, Number(val) || 0);
    if (discountType === 'percent') {
      setDiscountValue(String(Math.min(100, num)));
    } else {
      setDiscountValue(String(num));
    }
  };

  return (
    <div className="w-full lg:w-[320px] flex flex-col gap-4 shrink-0">
      
      {/* 1. CHEGIRMA BO'LIMI */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h4 className="text-sm font-black text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <span>🎁</span> Chegirma (Skidka)
        </h4>
        
        <div className="flex gap-2 mb-3 bg-gray-100 dark:bg-gray-900 p-1 rounded-xl">
          <button 
            type="button"
            onClick={() => handleDiscountTypeChange('none')}
            className={`flex-1 py-2 text-xs font-black rounded-lg transition ${
              discountType === 'none' 
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Yo'q
          </button>
          <button 
            type="button"
            onClick={() => handleDiscountTypeChange('percent')}
            className={`flex-1 py-2 text-xs font-black rounded-lg transition ${
              discountType === 'percent' 
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Foiz (%)
          </button>
          <button 
            type="button"
            onClick={() => handleDiscountTypeChange('sum')}
            className={`flex-1 py-2 text-xs font-black rounded-lg transition ${
              discountType === 'sum' 
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Summa
          </button>
        </div>

        {discountType !== 'none' && (
          <div className="space-y-2">
            <input 
              type="number" 
              min="0"
              max={discountType === 'percent' ? '100' : undefined}
              value={discountValue}
              onChange={(e) => handleDiscountValueChange(e.target.value)}
              placeholder={discountType === 'percent' ? 'Masalan: 10%' : 'Masalan: 15000'}
              className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 outline-none focus:border-indigo-500 text-gray-900 dark:text-white font-bold text-center transition"
            />

            {discountType === 'percent' && (
              <div className="grid grid-cols-4 gap-1.5">
                {[5, 10, 15, 20].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => handleDiscountValueChange(String(pct))}
                    className={`py-1.5 rounded-lg text-xs font-black border transition ${
                      Number(discountValue) === pct
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. TO'LOV USULI BO'LIMI */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex-1 flex flex-col">
        <h4 className="text-sm font-black text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <span>💳</span> To'lov Turini Tanlang
        </h4>
        
        <div className="grid grid-cols-2 gap-2 mb-4">
          {paymentMethods.map((method) => (
            <button
              key={method.id}
              type="button"
              onClick={() => typeof setPaymentMethod === 'function' && setPaymentMethod(method.id)}
              className={`p-3 rounded-xl border-2 transition flex flex-col items-center justify-center gap-1 active:scale-95 ${
                paymentMethod === method.id 
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' 
                  : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 hover:border-indigo-300'
              }`}
            >
              <span className="text-xl">{method.icon}</span>
              <span className={`text-[10px] font-black uppercase tracking-wider ${
                paymentMethod === method.id ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-500'
              }`}>
                {method.label}
              </span>
            </button>
          ))}
        </div>

        {/* 2.1 Aralash to'lov maydonlari */}
        {paymentMethod === 'Aralash' && (
          <div className="space-y-3 mb-4 animate-fade-in bg-gray-50 dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                Naqd qismi (so'm)
              </label>
              <input 
                type="number" 
                min="0"
                value={mixedCash} 
                onChange={(e) => typeof setMixedCash === 'function' && setMixedCash(e.target.value)} 
                placeholder="0"
                className="w-full p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 outline-none focus:border-indigo-500 text-gray-900 dark:text-white font-bold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                Plastik qismi (so'm)
              </label>
              <input 
                type="number" 
                min="0"
                value={mixedCard} 
                onChange={(e) => typeof setMixedCard === 'function' && setMixedCard(e.target.value)} 
                placeholder="0"
                className="w-full p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 outline-none focus:border-indigo-500 text-gray-900 dark:text-white font-bold"
              />
            </div>
          </div>
        )}

        {/* 2.2 Qarz maydoni */}
        {paymentMethod === 'Qarz' && (
          <div className="mb-4 animate-fade-in">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">
              Qarzdorning ismi yoki raqami:
            </label>
            <input 
              type="text" 
              value={debtorName} 
              onChange={(e) => typeof setDebtorName === 'function' && setDebtorName(e.target.value)} 
              placeholder="Masalan: Sardor aka 99890..." 
              className="w-full p-3.5 rounded-xl bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-800 outline-none focus:border-orange-500 text-gray-900 dark:text-white font-bold"
            />
          </div>
        )}

        {/* 3. TASDIQLASH TUGMASI */}
        <div className="mt-auto pt-2">
          <button 
            type="button"
            onClick={onPaymentSubmit}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-5 rounded-2xl font-black text-lg shadow-lg shadow-indigo-600/30 transition active:scale-95 uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <span>To'lov qilish</span> <span>✅</span>
          </button>
        </div>
      </div>
      
    </div>
  );
}