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
  // CRM & CASHBACK PROP'LARI
  customers = [],
  customerPhone = '',
  setCustomerPhone,
  customerName = '',
  setCustomerName,
  matchedCustomer = null,
  useBonusAmount = '',
  setUseBonusAmount,
  maxUsableBonus = 0,
  earnedCashback = 0,
  cashbackPercent = 5,
  onOpenCrmModal,
  onPaymentSubmit
}) {
  const paymentMethods = [
    { id: 'Naqd', label: '💵 Naqd', activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-emerald-500/30' },
    { id: 'Plastik', label: '💳 Plastik', activeClass: 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-500/30' },
    { id: 'Payme', label: '📱 Payme', activeClass: 'bg-cyan-600 text-white border-cyan-600 shadow-cyan-500/30' },
    { id: 'Click', label: '📲 Click', activeClass: 'bg-blue-600 text-white border-blue-600 shadow-blue-500/30' },
    { id: 'Aralash', label: '🔄 Aralash', activeClass: 'bg-purple-600 text-white border-purple-600 shadow-purple-500/30' },
    { id: 'Qarz', label: '📝 Qarzga', activeClass: 'bg-orange-600 text-white border-orange-600 shadow-orange-500/30' }
  ];

  const availableBonus = Number(matchedCustomer?.bonusBalance || 0);

  return (
    <div className="w-full lg:w-96 bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 flex flex-col justify-between overflow-y-auto space-y-5">
      
      <div className="space-y-5">
        
        {/* =======================================================
            1-BLOK: 🎁 MIJOZ VA CASHBACK / BONUS (CRM) TIZIMI
            ======================================================= */}
        <div className="bg-gradient-to-br from-amber-50/90 to-orange-50/70 dark:from-gray-900 dark:to-gray-900 p-4 rounded-2xl border-2 border-amber-200/80 dark:border-amber-800/50 space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-xs font-black text-amber-900 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>🎁</span> Mijoz va Bonus (CRM)
            </label>
            {typeof onOpenCrmModal === 'function' && (
              <button
                type="button"
                onClick={onOpenCrmModal}
                className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-800 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-gray-700 hover:bg-indigo-50 transition"
              >
                👥 Baza ({Array.isArray(customers) ? customers.length : 0})
              </button>
            )}
          </div>

          {/* Telefon raqam kiritish */}
          <div className="relative">
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => typeof setCustomerPhone === 'function' && setCustomerPhone(e.target.value)}
              placeholder="📞 Tel: 90 123 45 67 (yoki ism)"
              className="w-full pl-3.5 pr-9 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-amber-300 dark:border-gray-700 text-xs sm:text-sm font-black text-gray-900 dark:text-white outline-none focus:border-amber-500"
            />
            {customerPhone && (
              <button
                type="button"
                onClick={() => {
                  if (typeof setCustomerPhone === 'function') setCustomerPhone('');
                  if (typeof setCustomerName === 'function') setCustomerName('');
                  if (typeof setUseBonusAmount === 'function') setUseBonusAmount('');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 font-black text-xs"
                title="Tozalash"
              >
                ✕
              </button>
            )}
          </div>

          {/* Agar mijoz bazadan topilsa */}
          {matchedCustomer ? (
            <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-emerald-300 dark:border-emerald-700/70 space-y-2.5 shadow-sm">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                    ✓ Doimiy mijoz ({cashbackPercent}% Cashback)
                  </span>
                  <p className="font-black text-sm text-gray-900 dark:text-white mt-1">
                    👤 {matchedCustomer.name}
                  </p>
                  <p className="text-[11px] font-bold text-gray-400">
                    Tashriflar: {matchedCustomer.visitsCount || 1} marta • Xarid: {Number(matchedCustomer.totalSpent || 0).toLocaleString()} s
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[10px] font-bold text-gray-400 block uppercase">Mavjud Bonus</span>
                  <span className="font-black text-base text-amber-600 dark:text-amber-400">
                    {availableBonus.toLocaleString()} s
                  </span>
                </div>
              </div>

              {/* Bonusdan ishlatish qismi */}
              {availableBonus > 0 && paymentMethod !== 'Qarz' && (
                <div className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
                  <div className="flex justify-between items-center text-[11px] font-bold">
                    <span className="text-gray-500">Bonusdan chegirish:</span>
                    <span className="text-indigo-600 dark:text-indigo-400">
                      Maks: {Number(maxUsableBonus || 0).toLocaleString()} s
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      max={maxUsableBonus}
                      value={useBonusAmount}
                      onChange={(e) => typeof setUseBonusAmount === 'function' && setUseBonusAmount(e.target.value)}
                      placeholder="Bonus summasi..."
                      className="flex-1 p-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs font-black text-indigo-600 dark:text-indigo-400 outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        typeof setUseBonusAmount === 'function' &&
                        setUseBonusAmount(String(maxUsableBonus))
                      }
                      className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs transition active:scale-95"
                    >
                      MAX
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Agar telefon raqam kiritilgan bo'lsa-yu, bazada topilmasa -> Yangi mijoz sifatida qo'shish */
            customerPhone.trim().length >= 4 && (
              <div className="bg-white/90 dark:bg-gray-800 p-3 rounded-xl border border-amber-200 dark:border-gray-700 space-y-2">
                <span className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 block">
                  🆕 Yangi mijoz — Avtomatik bonus ochiladi (+5%)
                </span>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => typeof setCustomerName === 'function' && setCustomerName(e.target.value)}
                  placeholder="Mijoz ismini kiriting (Masalan: Jasur aka)"
                  className="w-full p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-amber-500"
                />
              </div>
            )
          )}

          {/* Ushbu chekdan yig'iladigan yangi Cashback ko'rsatkichi */}
          {(matchedCustomer || customerPhone.trim().length >= 4) && paymentMethod !== 'Qarz' && earnedCashback > 0 && (
            <div className="flex justify-between items-center px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-black text-emerald-700 dark:text-emerald-300">
              <span>🎁 Shu chekdan yoziladi (+{cashbackPercent}%):</span>
              <span>+{earnedCashback.toLocaleString()} so'm</span>
            </div>
          )}
        </div>

        {/* =======================================================
            2-BLOK: CHEGIRMA (SKIDKA) TANLASH
            ======================================================= */}
        <div className="space-y-2.5">
          <label className="block text-xs font-black text-gray-500 uppercase tracking-wider">
            🏷️ Chegirma (Skidka)
          </label>
          <div className="grid grid-cols-3 gap-2 bg-gray-100 dark:bg-gray-900 p-1 rounded-2xl">
            {[
              { id: 'none', label: "Yo'q" },
              { id: 'percent', label: 'Foiz (%)' },
              { id: 'sum', label: "So'mda" }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setDiscountType(tab.id);
                  setDiscountValue('');
                }}
                className={`py-2.5 rounded-xl font-black text-xs transition ${
                  discountType === tab.id
                    ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {discountType !== 'none' && (
            <div className="space-y-2 pt-1 animate-fade-in">
              <input
                type="number"
                min="0"
                max={discountType === 'percent' ? '100' : undefined}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === 'percent' ? 'Necha foiz? (Masalan: 10)' : 'Necha so\'m? (Masalan: 15000)'}
                className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border-2 border-indigo-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white outline-none focus:border-indigo-500"
              />

              {/* Tezkor chegirma tugmalari */}
              {discountType === 'percent' && (
                <div className="flex gap-1.5">
                  {[5, 10, 15, 20, 50].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setDiscountValue(String(pct))}
                      className="flex-1 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-300 font-black text-xs transition"
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* =======================================================
            3-BLOK: TO'LOV USULINI TANLASH
            ======================================================= */}
        <div className="space-y-2.5">
          <label className="block text-xs font-black text-gray-500 uppercase tracking-wider">
            💳 To'lov Usuli
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {paymentMethods.map(m => {
              const isSelected = paymentMethod === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  className={`py-3.5 px-3 rounded-2xl font-black text-xs sm:text-sm border-2 transition active:scale-95 flex items-center justify-center gap-2 ${
                    isSelected
                      ? `${m.activeClass} shadow-md`
                      : 'bg-gray-50 dark:bg-gray-900/60 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-indigo-300'
                  }`}
                >
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ARALASH TO'LOV INPUTLARI */}
        {paymentMethod === 'Aralash' && (
          <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/50 space-y-3 animate-fade-in">
            <div>
              <label className="block text-[10px] font-black uppercase text-purple-700 dark:text-purple-300 mb-1">
                💵 Naqd pul qismi (so'm)
              </label>
              <input
                type="number"
                min="0"
                value={mixedCash}
                onChange={(e) => setMixedCash(e.target.value)}
                placeholder="Naqd summa..."
                className="w-full p-3 rounded-xl bg-white dark:bg-gray-900 border border-purple-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-purple-700 dark:text-purple-300 mb-1">
                💳 Plastik karta qismi (so'm)
              </label>
              <input
                type="number"
                min="0"
                value={mixedCard}
                onChange={(e) => setMixedCard(e.target.value)}
                placeholder="Plastik summa..."
                className="w-full p-3 rounded-xl bg-white dark:bg-gray-900 border border-purple-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white outline-none focus:border-purple-500"
              />
            </div>
          </div>
        )}

        {/* QARZGA YOZISH INPUTI */}
        {paymentMethod === 'Qarz' && (
          <div className="p-4 rounded-2xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 space-y-2 animate-fade-in">
            <label className="block text-[10px] font-black uppercase text-orange-700 dark:text-orange-300">
              📝 Qarzdor mijoz ismi va telefoni *
            </label>
            <input
              type="text"
              required
              value={debtorName}
              onChange={(e) => setDebtorName(e.target.value)}
              placeholder="Masalan: Rustam aka (90 123-45-67)"
              className="w-full p-3 rounded-xl bg-white dark:bg-gray-900 border border-orange-300 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white outline-none focus:border-orange-500"
            />
          </div>
        )}

      </div>

      {/* YAKUNIY TO'LOVNI TASDIQLASH TUGMASI */}
      <button
        type="button"
        onClick={onPaymentSubmit}
        className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base uppercase tracking-wider shadow-lg shadow-emerald-600/30 transition active:scale-95 flex items-center justify-center gap-2"
      >
        <span>To'lovni Yakunlash</span>
        <span>✅</span>
      </button>

    </div>
  );
}