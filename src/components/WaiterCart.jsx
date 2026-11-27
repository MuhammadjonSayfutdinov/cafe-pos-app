import React, { useState, useMemo } from 'react';
import { isDeliveryTable, isNoServiceFeeTable } from '../constants/orderStatus';
import { confirmAsync } from '../utils/notify';
import {
  isKitchenItem,
  kitchenSummary,
  orderLines,
  pendingQtyOf,
  readyQtyOf,
  servedQtyOf
} from '../utils/kitchenFlow';

const linesText = (list) => list.map(l => `${l.qty}× ${l.name}`).join(', ');

const QUICK_CHEF_NOTES = [
  "Piyozsiz",
  "Achchiq bo'lmasin",
  "Kam tuzli",
  "O'rab berilsin (С собой)",
  "Issiqroq bo'lsin",
  "Muzsiz"
];

export default function WaiterCart({
  selectedTable,
  table,
  cart = [],
  setCart,
  currentTableOrder,
  activeOrder,
  existingOrder,
  serviceFee = 10,
  onUpdateQuantity,
  updateQuantity,
  updateQty,
  onRemoveItem,
  removeFromCart,
  onUpdateNote,
  updateItemNote,
  onSubmitOrder,
  submitOrder,
  handleSendOrder,
  onMarkAsDelivered,
  markAsServed,
  onLockPreCheck,
  onCancelEntireOrder,
  // Admin -> PIN himoyasi: oshxonaga ketgan taomni kamaytirish uchun PIN so'raladimi (🔒 belgisi)
  reduceNeedsPin = true
}) {
  const [expandedNoteId, setExpandedNoteId] = useState(null);

  const resolvedTable = selectedTable || table || '1-Stol';
  const resolvedOrder = currentTableOrder || activeOrder || existingOrder || null;

  const handleQtyChange = onUpdateQuantity || updateQuantity || updateQty;
  const handleRemove = onRemoveItem || removeFromCart;
  const handleNoteChange = onUpdateNote || updateItemNote;
  const handleSend = onSubmitOrder || submitOrder || handleSendOrder;
  const handleDeliver = onMarkAsDelivered || markAsServed;

  const safeCart = Array.isArray(cart) ? cart : [];
  const isPreCheckLocked = Boolean(resolvedOrder?.isPreCheckPrinted);
  const preCheckCount = Number(resolvedOrder?.preCheckCount) || 0;

  // Oshxona holati (taom darajasida): tayyor, lekin mijozga hali berilmagan porsiyalar va
  // oshxona rad etgan taomlar (src/utils/kitchenFlow.ts)
  const kitchenInfo = useMemo(() => {
    if (!resolvedOrder) return { summary: null, readyLines: [], rejections: [] };
    const summary = kitchenSummary(resolvedOrder);
    const readyLines = orderLines(resolvedOrder)
      .filter(({ item }) => isKitchenItem(item) && readyQtyOf(item, resolvedOrder) > 0)
      .map(({ item }) => ({ name: item.name, qty: readyQtyOf(item, resolvedOrder) }));
    const rejections = (Array.isArray(resolvedOrder.kitchenRejections) ? resolvedOrder.kitchenRejections : [])
      .filter(r => r && r.qty > 0)
      .slice(-6);
    return { summary, readyLines, rejections };
  }, [resolvedOrder]);

  // Savatcha matematikasi
  const cartSummary = useMemo(() => {
    const subTotal = safeCart.reduce((sum, item) => {
      if (!item) return sum;
      const p = Number(item.price ?? item.variants?.[0]?.price ?? 0) || 0;
      const q = Number(item.quantity ?? item.qty ?? 1) || 0;
      return sum + p * q;
    }, 0);

    const totalPortions = safeCart.reduce((sum, item) => {
      if (!item) return sum;
      return sum + (Number(item.quantity ?? item.qty ?? 1) || 0);
    }, 0);

    // Olib ketish va yetkazib berishda xizmat haqi olinmaydi
    const feePct = isNoServiceFeeTable(resolvedTable) ? 0 : Number(serviceFee) || 0;
    const feeAmount = Math.round((subTotal * feePct) / 100);
    const finalTotal = subTotal + feeAmount;

    return {
      subTotal,
      totalPortions,
      feePct,
      feeAmount,
      finalTotal
    };
  }, [safeCart, resolvedTable, serviceFee]);

  const changeItemQty = (itemKey, delta) => {
    if (typeof handleQtyChange === 'function') {
      handleQtyChange(itemKey, delta);
      return;
    }
    if (typeof setCart === 'function') {
      setCart(prev =>
        (Array.isArray(prev) ? prev : [])
          .map(it => {
            const k = it.cartItemId || it.id || it.name;
            if (k !== itemKey) return it;
            const nq = (Number(it.quantity ?? it.qty ?? 1) || 1) + delta;
            return nq > 0 ? { ...it, quantity: nq, qty: nq } : null;
          })
          .filter(Boolean)
      );
    }
  };

  const removeItem = (itemKey) => {
    if (typeof handleRemove === 'function') {
      handleRemove(itemKey);
      return;
    }
    changeItemQty(itemKey, -9999);
  };

  const updateNoteText = (itemKey, text) => {
    if (typeof handleNoteChange === 'function') {
      handleNoteChange(itemKey, text);
      return;
    }
    if (typeof setCart === 'function') {
      setCart(prev =>
        (Array.isArray(prev) ? prev : []).map(it => {
          const k = it.cartItemId || it.id || it.name;
          return k === itemKey ? { ...it, note: text } : it;
        })
      );
    }
  };

  return (
    <div className="w-full lg:w-96 bg-white dark:bg-gray-800 rounded-3xl shadow-xs border border-gray-100 dark:border-gray-700 p-4 sm:p-5 flex flex-col justify-between min-h-0 overflow-hidden shrink-0">
      
      {/* 1. SAVATCHA TEPASI VA PRE-CHEK QULF INDIKATORI */}
      <div className="pb-3 border-b border-gray-100 dark:border-gray-700 space-y-2 shrink-0">
        <div className="flex justify-between items-start gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-1.5">
                <span>🛒</span> Buyurtma Savatchasi
              </h3>
              {isPreCheckLocked && (
                <span className="px-2 py-0.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 font-black text-[10px] uppercase border border-red-200 dark:border-red-800">
                  🔒 Pre-chek ({preCheckCount}x)
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-gray-400 mt-0.5">
              {isDeliveryTable(resolvedTable) ? '🛵' : '🪑'} {resolvedTable} • {cartSummary.totalPortions} porsiya taom
            </p>
          </div>

          {/* Agar yangi buyurtma bo'lsa — Tozalash, agar aktiv buyurtma bo'lsa — Pre-chek va Bekor qilish */}
          {safeCart.length > 0 && typeof setCart === 'function' && !resolvedOrder ? (
            <button
              type="button"
              onClick={async () => {
                if (await confirmAsync("Savatchadagi barcha taomlarni tozalaymizmi?")) {
                  setCart([]);
                }
              }}
              className="text-xs font-black text-red-500 hover:underline"
            >
              Tozalash
            </button>
          ) : (
            resolvedOrder && (
              <div className="flex items-center gap-1.5 shrink-0">
                {typeof onLockPreCheck === 'function' && (
                  <button
                    type="button"
                    onClick={onLockPreCheck}
                    className={`px-2.5 py-1.5 rounded-xl font-black text-[11px] transition active:scale-95 flex items-center gap-1 border ${
                      isPreCheckLocked
                        ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 border-red-200 dark:border-red-800'
                        : 'bg-brand-50 dark:bg-brand-900/30 hover:bg-brand-100 text-brand-600 dark:text-brand-300 border-brand-200 dark:border-brand-800'
                    }`}
                    title="Mijozga hisob (Pre-chek) chiqarish va chekni qulflash"
                  >
                    <span>{isPreCheckLocked ? '🔒' : '🧾'}</span>
                    <span>Pre-chek</span>
                  </button>
                )}

                {typeof onCancelEntireOrder === 'function' && (
                  <button
                    type="button"
                    onClick={onCancelEntireOrder}
                    className="px-2.5 py-1.5 rounded-xl bg-red-50 dark:bg-red-900/30 hover:bg-red-100 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800 font-black text-[11px] transition active:scale-95"
                    title="Stol buyurtmasini to'liq bekor qilish (Admin PIN bilan)"
                  >
                    🗑 Chekni o'chirish
                  </button>
                )}
              </div>
            )
          )}
        </div>

        {/* Qulflangan chek eslatmasi */}
        {resolvedOrder && (
          <div className={`px-3 py-1.5 rounded-xl text-[10px] font-bold flex items-center justify-between ${
            isPreCheckLocked
              ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60'
              : 'bg-amber-50/70 dark:bg-gray-900 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-gray-700'
          }`}>
            <span>
              {isPreCheckLocked
                ? '🔒 Pre-chek chiqarilgan! O\'chirish Admin PIN orqali Oshxona va Kassadan ham o\'chiradi.'
                : '🛡️ Oshxonadagi taomni o\'chirsangiz (PIN bilan), Oshxona va Kassada darhol yangilanadi.'}
            </span>
          </div>
        )}
      </div>

      {/* OSHXONADA TAYYOR BO'LGAN TAOMLAR (chekning bir qismi bo'lsa ham) — TOPSHIRISH TUGMASI */}
      {resolvedOrder && kitchenInfo.readyLines.length > 0 && (
        <div className="my-2.5 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 border-2 border-emerald-400 dark:border-emerald-600 space-y-2 shrink-0 animate-fade-in" data-testid="waiter-ready-block">
          <p className="text-xs font-black text-emerald-800 dark:text-emerald-200 flex items-start gap-1.5 break-words">
            <span>🔔</span>
            <span>Tayyor, olib boring: {linesText(kitchenInfo.readyLines)}</span>
          </p>
          {kitchenInfo.summary?.pending > 0 && (
            <p className="text-[11px] font-bold text-emerald-700/80 dark:text-emerald-300/80">
              👨‍🍳 Qolgan {kitchenInfo.summary.pending} porsiya hali oshxonada
            </p>
          )}
          <button
            type="button"
            onClick={() => typeof handleDeliver === 'function' && handleDeliver()}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider shadow-md transition active:scale-95"
          >
            ✅ Mijozga berildi ({kitchenInfo.summary?.ready || 0} porsiya)
          </button>
        </div>
      )}

      {/* OSHXONA RAD ETGAN TAOMLAR (chekdan olib tashlangan, mijozga ayting) */}
      {resolvedOrder && kitchenInfo.rejections.length > 0 && (
        <div className="my-1.5 p-3 rounded-2xl bg-red-50 dark:bg-red-900/25 border border-red-300 dark:border-red-800 space-y-1 shrink-0" data-testid="waiter-rejections">
          <p className="text-[11px] font-black uppercase text-red-700 dark:text-red-300">❌ Oshxona rad etdi (chekdan olindi)</p>
          {kitchenInfo.rejections.map(r => (
            <p key={r.id} className={`text-xs font-bold break-words ${r.ackAt ? 'text-gray-500 dark:text-gray-400' : 'text-red-700 dark:text-red-200'}`}>
              {r.qty}× {r.name} — {r.reason}
              {r.at ? ` (${new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}
            </p>
          ))}
        </div>
      )}

      {/* 2. SAVATCHADAGI TAOMLAR RO'YXATI */}
      <div className="flex-1 overflow-y-auto my-2.5 pr-1 space-y-2.5">
        {safeCart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-12 text-gray-400">
            <span className="text-5xl mb-2 opacity-60">🍽️</span>
            <p className="font-black text-sm">Savatcha hozircha bo'sh</p>
            <p className="text-xs font-bold mt-1 max-w-[220px]">
              Menyudan taomlarni bosib savatchaga qo'shing
            </p>
          </div>
        ) : (
          safeCart.map((item, idx) => {
            if (!item) return null;
            const itemKey = item.cartItemId || item.id || item.name || idx;
            const price = Number(item.price ?? item.variants?.[0]?.price ?? 0) || 0;
            const qty = Number(item.quantity ?? item.qty ?? 1) || 1;
            const sentQty = Number(item.sentQty ?? 0) || 0;
            const lineTotal = price * qty;
            const isNoteOpen = expandedNoteId === itemKey;

            const isReductionProtected = reduceNeedsPin && (isPreCheckLocked || (sentQty > 0 && qty <= sentQty));
            const isDeleteProtected = reduceNeedsPin && (isPreCheckLocked || sentQty > 0);
            // Chekdagi (yuborilgan) qism uchun oshxona holati
            const sentPart = { ...item, quantity: sentQty };
            const isKitchenLine = isKitchenItem(item);
            const pendingQ = sentQty > 0 && resolvedOrder ? pendingQtyOf(sentPart, resolvedOrder) : 0;
            const readyQ = sentQty > 0 && resolvedOrder ? readyQtyOf(sentPart, resolvedOrder) : 0;
            const servedQ = sentQty > 0 && resolvedOrder ? servedQtyOf(sentPart, resolvedOrder) : 0;
            const unsentQ = Math.max(0, qty - sentQty);

            return (
              <div
                key={itemKey}
                className={`p-3.5 rounded-2xl border space-y-2.5 transition ${
                  sentQty > 0
                    ? 'bg-gray-50/90 dark:bg-gray-900/70 border-gray-200 dark:border-gray-700'
                    : 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/50'
                }`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h4 className="font-black text-sm text-gray-900 dark:text-white leading-snug">
                        {item.name}
                      </h4>
                      {sentQty > 0 && isKitchenLine && pendingQ > 0 && (
                        <span className="px-1.5 py-0.5 rounded-sm bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-black text-[9px] uppercase">
                          👨‍🍳 Oshxonada: {pendingQ}
                        </span>
                      )}
                      {sentQty > 0 && isKitchenLine && readyQ > 0 && (
                        <span className="px-1.5 py-0.5 rounded-sm bg-emerald-500 text-white font-black text-[9px] uppercase">
                          🔔 Tayyor: {readyQ}
                        </span>
                      )}
                      {sentQty > 0 && isKitchenLine && servedQ > 0 && (
                        <span className="px-1.5 py-0.5 rounded-sm bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-black text-[9px] uppercase">
                          🍽 Berildi: {servedQ}
                        </span>
                      )}
                      {sentQty > 0 && !isKitchenLine && (
                        <span className="px-1.5 py-0.5 rounded-sm bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-black text-[9px] uppercase">
                          🔒 Chekda
                        </span>
                      )}
                      {unsentQ > 0 && (
                        <span className="px-1.5 py-0.5 rounded-sm bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-black text-[9px] uppercase">
                          🆕 Yangi{sentQty > 0 ? `: +${unsentQ}` : ''}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 block mt-0.5">
                      {price.toLocaleString()} s × {qty} = <strong>{lineTotal.toLocaleString()} s</strong>
                    </span>
                  </div>

                  {/* Miqdor (- / +) va O'chirish tugmalari */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => changeItemQty(itemKey, -1)}
                      className={`w-8 h-8 rounded-xl border font-black text-sm flex items-center justify-center transition active:scale-90 ${
                        isReductionProtected
                          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
                          : 'bg-white dark:bg-gray-800 hover:bg-red-50 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white'
                      }`}
                      title={isReductionProtected ? "Oshxonaga ketgan taomni kamaytirish (Admin PIN talab qilinadi)" : "Kamaytirish (-1)"}
                    >
                      {isReductionProtected ? '🔒' : '−'}
                    </button>

                    <span className="w-7 text-center font-black text-sm text-gray-900 dark:text-white">
                      {qty}
                    </span>

                    <button
                      type="button"
                      onClick={() => changeItemQty(itemKey, 1)}
                      className="w-8 h-8 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-base flex items-center justify-center shadow-xs transition active:scale-90"
                      title="Qo'shish (+1)"
                    >
                      +
                    </button>

                    <button
                      type="button"
                      onClick={() => removeItem(itemKey)}
                      className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center transition ml-0.5 ${
                        isDeleteProtected
                          ? 'bg-red-100 dark:bg-red-900/40 text-red-600 border border-red-200 dark:border-red-800'
                          : 'bg-red-50 dark:bg-red-900/30 hover:bg-red-100 text-red-500'
                      }`}
                      title={isDeleteProtected ? "Oshxonaga ketgan taomni o'chirish (Admin PIN talab qilinadi)" : "O'chirish"}
                    >
                      🗑
                    </button>
                  </div>
                </div>

                {/* Oshpazga Izoh Qismi */}
                <div>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setExpandedNoteId(isNoteOpen ? null : itemKey)}
                      className="text-[11px] font-black text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                    >
                      <span>📝</span>
                      <span>{item.note ? `Izoh: "${item.note}"` : "+ Oshpazga izoh qo'shish"}</span>
                    </button>
                  </div>

                  {isNoteOpen && (
                    <div className="mt-2 space-y-2 animate-fade-in">
                      <input
                        type="text"
                        value={item.note || ''}
                        onChange={e => updateNoteText(itemKey, e.target.value)}
                        placeholder="Masalan: Piyozsiz, kam tuzli..."
                        className="w-full p-2 rounded-xl bg-white dark:bg-gray-800 border border-brand-200 dark:border-gray-600 text-xs font-bold text-gray-900 dark:text-white outline-hidden focus:border-brand-500"
                      />
                      <div className="flex flex-wrap gap-1">
                        {QUICK_CHEF_NOTES.map(chip => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => {
                              const curr = String(item.note || '').trim();
                              const next = curr ? `${curr}, ${chip}` : chip;
                              updateNoteText(itemKey, next);
                            }}
                            className="px-2 py-1 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[10px] font-bold text-gray-600 dark:text-gray-300 hover:border-amber-400"
                          >
                            + {chip}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 3. PASTKI HISOB-KITOB VA OSHXONAGA YUBORISH TUGMASI */}
      <div className="pt-3.5 border-t-2 border-dashed border-gray-200 dark:border-gray-700 space-y-3 shrink-0">
        <div className="space-y-1 text-xs font-bold">
          <div className="flex justify-between text-gray-500">
            <span>Taomlar summasi:</span>
            <span className="font-black text-gray-900 dark:text-white">
              {cartSummary.subTotal.toLocaleString()} so'm
            </span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Xizmat haqi ({cartSummary.feePct}%):</span>
            <span className="font-black text-gray-900 dark:text-white">
              + {cartSummary.feeAmount.toLocaleString()} so'm
            </span>
          </div>
          <div className="flex justify-between items-baseline text-base font-black text-gray-900 dark:text-white pt-1.5 border-t border-gray-100 dark:border-gray-700">
            <span>JAMI HISOB:</span>
            <span className="text-xl text-amber-600 dark:text-amber-400">
              {cartSummary.finalTotal.toLocaleString()} so'm
            </span>
          </div>
        </div>

        <button
          type="button"
          disabled={safeCart.length === 0}
          onClick={() => typeof handleSend === 'function' && handleSend()}
          className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white font-black text-sm sm:text-base uppercase tracking-wider shadow-lg shadow-amber-500/30 transition active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>🚀</span>
          <span>
            {resolvedOrder ? 'Buyurtmani Yangilash' : 'Oshxonaga Yuborish'}
          </span>
        </button>
      </div>

    </div>
  );
}