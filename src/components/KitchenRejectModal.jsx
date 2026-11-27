import React, { useMemo, useState } from 'react';

// Oshxona: taomni (yoki butun chekni) rad etish oynasi.
// Faqat hali tayyor bo'lmagan porsiyalar rad etiladi. Rad etilgan porsiya chekdan olib tashlanadi,
// ofitsiant va kassirga darhol xabar boradi (src/utils/kitchenFlow.ts -> rejectLines).

export const KITCHEN_REJECT_REASONS = [
  { id: 'ingredient', label: '🥩 Masalliq tugadi', stopList: true },
  { id: 'soldout', label: '🛑 Taom qolmadi', stopList: true },
  { id: 'equipment', label: "🔧 Uskuna ishlamayapti", stopList: false },
  { id: 'slow', label: '⏱️ Juda uzoq kutiladi', stopList: false },
  { id: 'wrong', label: "❓ Noto'g'ri buyurtma", stopList: false },
  { id: 'other', label: '✍️ Boshqa sabab', stopList: false }
];

const clean = (label) => String(label || '').replace(/^\S+\s/u, '');

export default function KitchenRejectModal({ order, preselectedIds = [], onCancel, onConfirm }) {
  const lines = useMemo(
    () => (Array.isArray(order?.displayItems) ? order.displayItems : []).filter(l => l && l.pending > 0),
    [order]
  );

  // Boshlanishiga: oshpaz kartada belgilagan taomlar (to'liq miqdori bilan)
  const [qtyById, setQtyById] = useState(() => {
    const pre = new Set(preselectedIds);
    const init = {};
    lines.forEach(l => {
      init[l.lineId] = pre.has(l.lineId) ? l.pending : 0;
    });
    return init;
  });
  const [reasonId, setReasonId] = useState('');
  const [comment, setComment] = useState('');
  const [stopList, setStopList] = useState(false);
  const [stopListTouched, setStopListTouched] = useState(false);

  const reason = KITCHEN_REJECT_REASONS.find(r => r.id === reasonId) || null;
  const totalQty = lines.reduce((s, l) => s + (Number(qtyById[l.lineId]) || 0), 0);
  const allChosen = lines.length > 0 && lines.every(l => (Number(qtyById[l.lineId]) || 0) === l.pending);
  const commentText = comment.trim();
  const reasonText = reason
    ? (reason.id === 'other' ? commentText : `${clean(reason.label)}${commentText ? ` (${commentText})` : ''}`)
    : '';
  const canSubmit = totalQty > 0 && Boolean(reasonText);
  const refundPreview = order?.isPaidOrder
    ? lines.reduce((s, l) => s + (Number(qtyById[l.lineId]) || 0) * (Number(l.price) || 0), 0)
    : 0;

  const setQty = (lineId, next, max) => {
    setQtyById(prev => ({ ...prev, [lineId]: Math.max(0, Math.min(max, next)) }));
  };

  const chooseReason = (r) => {
    setReasonId(r.id);
    if (!stopListTouched) setStopList(r.stopList);
  };

  const toggleAll = () => {
    const next = {};
    lines.forEach(l => {
      next[l.lineId] = allChosen ? 0 : l.pending;
    });
    setQtyById(next);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onConfirm({
      requests: lines
        .map(l => ({
          lineId: l.lineId,
          qty: Number(qtyById[l.lineId]) || 0,
          menuId: l.id,
          baseName: l.baseName,
          name: l.name
        }))
        .filter(r => r.qty > 0),
      reason: reasonText,
      addToStopList: stopList
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/65 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      onClick={onCancel}
    >
      <form
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        data-testid="kitchen-reject-modal"
        className="bg-white dark:bg-gray-800 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 max-h-[92vh] flex flex-col"
      >
        <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-start gap-3">
          <div className="min-w-0">
            <h3 className="font-black text-lg text-gray-900 dark:text-white">❌ Taomni rad etish</h3>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mt-0.5 break-words">
              {order?.table} • #{String(order?.id || '').slice(-4)} — rad etilgan porsiya chekdan olinadi,
              ofitsiantga darhol xabar boradi.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-9 h-9 shrink-0 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-red-500 font-black flex items-center justify-center"
            aria-label="Yopish"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {/* 1. Qaysi taom va nechta porsiya */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-black uppercase text-gray-400">1. Qaysi taom?</span>
              <button
                type="button"
                onClick={toggleAll}
                className="text-[11px] font-black text-brand-600 dark:text-brand-400 hover:underline"
              >
                {allChosen ? 'Tanlovni bekor qilish' : 'Butun chekni rad etish'}
              </button>
            </div>
            {lines.map(l => {
              const q = Number(qtyById[l.lineId]) || 0;
              const on = q > 0;
              return (
                <div
                  key={l.lineId}
                  className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition ${
                    on
                      ? 'bg-red-50 dark:bg-red-900/25 border-red-300 dark:border-red-700'
                      : 'bg-gray-50 dark:bg-gray-900/60 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setQty(l.lineId, on ? 0 : l.pending, l.pending)}
                    className="flex items-start gap-2.5 min-w-0 text-left flex-1"
                  >
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${
                      on ? 'bg-red-600 text-white' : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-transparent'
                    }`}>
                      ✓
                    </span>
                    <span className="min-w-0">
                      <span className="block font-black text-sm text-gray-900 dark:text-white break-words">{l.name}</span>
                      <span className="block text-[11px] font-bold text-gray-400">Oshxonada: {l.pending} pors</span>
                    </span>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setQty(l.lineId, q - 1, l.pending)}
                      className="w-8 h-8 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 font-black text-gray-800 dark:text-white"
                      aria-label="Kamaytirish"
                    >
                      −
                    </button>
                    <span className="w-6 text-center font-black text-sm text-gray-900 dark:text-white">{q}</span>
                    <button
                      type="button"
                      onClick={() => setQty(l.lineId, q + 1, l.pending)}
                      className="w-8 h-8 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black"
                      aria-label="Ko'paytirish"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 2. Sabab */}
          <div className="space-y-2">
            <span className="text-[11px] font-black uppercase text-gray-400 block">2. Sabab</span>
            <div className="flex flex-wrap gap-2">
              {KITCHEN_REJECT_REASONS.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => chooseReason(r)}
                  className={`px-3 py-2 rounded-xl text-xs font-black transition active:scale-95 border ${
                    reasonId === r.id
                      ? 'bg-red-600 text-white border-red-600 shadow-md shadow-red-600/25'
                      : 'bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-red-400'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={comment}
              maxLength={120}
              onChange={e => setComment(e.target.value)}
              placeholder={reasonId === 'other' ? 'Sababni yozing (majburiy)' : "Izoh (ixtiyoriy): masalan, 20 daqiqada bo'ladi"}
              className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-900 dark:text-white outline-hidden focus:border-red-500"
            />
          </div>

          {/* 3. Stop-list */}
          <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={stopList}
              onChange={e => {
                setStopList(e.target.checked);
                setStopListTouched(true);
              }}
              className="w-5 h-5 mt-0.5 accent-red-600 shrink-0"
            />
            <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
              🛑 Bu taom(lar)ni stop-listga qo'shish
              <span className="block text-[11px] text-gray-400 font-bold mt-0.5">
                Ofitsiant menyusida va mijoz QR-menyusida "tugagan" bo'lib ko'rinadi
              </span>
            </span>
          </label>

          {order?.isPaidOrder && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-900/25 border border-amber-300 dark:border-amber-700 text-xs font-bold text-amber-800 dark:text-amber-200">
              💳 Bu chek to'langan: rad etilgan taom puli
              {refundPreview > 0 ? ` (taxminan ${refundPreview.toLocaleString()} so'm + xizmat haqi)` : ''} mijozga
              qaytarilishi kerak. Kassirga xabar boradi.
            </div>
          )}
        </div>

        <div className="p-5 pt-3 border-t border-gray-100 dark:border-gray-700 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white font-black text-xs sm:text-sm"
          >
            Orqaga
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-[1.4] py-3.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-black text-xs sm:text-sm shadow-lg shadow-red-600/25 transition active:scale-95"
          >
            {totalQty > 0 ? `❌ Rad etish (${totalQty} pors)` : 'Taomni tanlang'}
          </button>
        </div>
      </form>
    </div>
  );
}
