import React, { useMemo, useState } from 'react';
import ToggleSwitch from './ToggleSwitch';
import { REFUND_METHODS, collectPendingRefunds, defaultRefundMethod } from '../utils/refunds';

// Kassa: to'langan chekdan oshxona rad etgan taom puli - "💸 Qaytarish" (7-bosqich, 3-qism, 5-qadam).
// Mantiq: src/utils/refunds.ts. Tasdiqlash (PIN) va yozish - CashierMode.handleRefund.

const fmt = (x) => `${Math.round(Number(x) || 0).toLocaleString()} so'm`;

function RefundModal({ item, onConfirm, onCancel }) {
  const [amount, setAmount] = useState(String(item.pending));
  const [method, setMethod] = useState(defaultRefundMethod(item.paymentMethod));
  const [restock, setRestock] = useState(true);
  const amountNum = Math.round(Number(amount) || 0);
  const valid = amountNum > 0 && amountNum <= item.pending;

  return (
    <div onClick={onCancel} className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onConfirm({ orderId: item.orderId, amount: amountNum, method, restock });
        }}
        className="w-full sm:max-w-md bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-black text-lg text-gray-900 dark:text-white">💸 Mijozga pul qaytarish</h3>
            <p className="text-xs font-bold text-gray-500 mt-0.5">
              {item.table} • {item.lines.map(l => `${l.qty}× ${l.name}`).join(', ')}
            </p>
          </div>
          <button type="button" onClick={onCancel} className="w-9 h-9 shrink-0 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-red-500 font-black" title="Yopish">✕</button>
        </div>

        <div>
          <label className="block text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1.5">
            Summa (qolgan: {fmt(item.pending)})
          </label>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max={item.pending}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-lg text-gray-900 dark:text-white outline-hidden focus:border-brand-500"
          />
          {!valid && (
            <p className="text-[11px] font-bold text-red-500 mt-1">Summa 1 dan {fmt(item.pending)} gacha bo'lishi kerak</p>
          )}
        </div>

        <div>
          <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1.5">
            Qanday qaytariladi {item.paymentMethod ? `(chek: ${item.paymentMethod})` : ''}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {REFUND_METHODS.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`py-2.5 rounded-xl text-xs font-black transition ${
                  method === m ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <p className="text-[11px] font-bold text-gray-400 mt-1.5">
            {method === 'Naqd' ? "Seyfdagi naqd puldan: smena hisobotida chiqim bo'lib turadi" : "Karta / ilova orqali: naqd kassaga ta'sir qilmaydi"}
          </p>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700">
          <div className="flex-1">
            <p className="text-sm font-black text-gray-900 dark:text-white">📦 Masalliqlarni omborga qaytarish</p>
            <p className="text-[11px] font-bold text-gray-500">To'lovda ayirilgan edi, taom tayyorlanmadi</p>
          </div>
          <ToggleSwitch checked={restock} onChange={setRestock} label="Masalliqlarni omborga qaytarish" />
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-2xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-black text-sm transition active:scale-95">
            Bekor qilish
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="flex-1 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black text-sm shadow-lg shadow-red-600/30 transition active:scale-95 disabled:opacity-40"
          >
            Qaytarish ✓
          </button>
        </div>
      </form>
    </div>
  );
}

export default function CashierRefundsPanel({ orders = [], onRefund }) {
  const pending = useMemo(() => collectPendingRefunds(orders), [orders]);
  const [active, setActive] = useState(null);

  if (pending.length === 0) return null;
  const total = pending.reduce((s, p) => s + p.pending, 0);

  return (
    <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-3xl p-4 space-y-3" data-testid="cashier-refunds">
      <div className="flex items-center justify-between gap-3">
        <p className="font-black text-sm sm:text-base text-red-700 dark:text-red-300">
          💸 Mijozga qaytarilishi kerak: {pending.length} ta chek, {fmt(total)}
        </p>
      </div>
      <ul className="space-y-2">
        {pending.map(p => (
          <li key={p.orderId} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-2xl bg-white dark:bg-gray-800 border border-red-100 dark:border-red-500/20">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-gray-900 dark:text-white">
                {p.table} • {fmt(p.pending)}
                {p.refunded > 0 && <span className="text-[11px] font-bold text-gray-400"> (qaytarilgan: {fmt(p.refunded)})</span>}
              </p>
              <p className="text-[11px] font-bold text-gray-500 break-words">
                ❌ Oshxona rad etdi: {p.lines.map(l => `${l.qty}× ${l.name}`).join(', ')}
                {p.paymentMethod ? ` • to'lov: ${p.paymentMethod}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActive(p)}
              className="shrink-0 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black transition active:scale-95"
            >
              💸 Qaytarish
            </button>
          </li>
        ))}
      </ul>
      {active && (
        <RefundModal
          item={active}
          onCancel={() => setActive(null)}
          onConfirm={(data) => {
            setActive(null);
            if (typeof onRefund === 'function') onRefund(data);
          }}
        />
      )}
    </div>
  );
}
