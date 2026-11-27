import React, { useMemo, useState } from 'react';
import useSticky from '../hooks/useSticky';
import { getOpenShift } from '../shift/shiftReport';
import { collectLosses, lossTelegramLines, reasonKey, summarizeLosses } from '../utils/lossReport';
import { sendTelegramLines } from '../utils/telegramNotifier';
import { notify } from '../utils/notify';

// Statistika: "Rad etilgan va bekor qilingan taomlar" (7-bosqich, 3-qism, 2-qadam).
// Davr - Statistikaning yuqoridagi filtri; filtr yo'q (joriy smena) bo'lsa - ochiq smena boshidan
// (smena yo'q bo'lsa - bugun). Hisob: src/utils/lossReport.ts. Smena yopilganda xulosa Telegramga o'zi boradi.

const fmt = (x) => `${Math.round(Number(x) || 0).toLocaleString()} so'm`;
const timeOf = (ms) => (ms ? new Date(ms).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

const GROUP_TABS = [
  { id: 'byReason', label: 'Sabab' },
  { id: 'byDish', label: 'Taom' },
  { id: 'byCook', label: 'Oshpaz' },
  { id: 'byStaff', label: 'Bekor qilgan' },
  { id: 'byWaiter', label: 'Ofitsiant' }
];

export default function StatsLossReport({ orders = [], activeDateRange, cafeName = '' }) {
  const [shifts] = useSticky('pos_shifts', []);
  const [groupBy, setGroupBy] = useState('byReason');
  const [showAll, setShowAll] = useState(false);
  const [sending, setSending] = useState(false);

  const period = useMemo(() => {
    if (activeDateRange?.isFiltered) {
      return { startMs: activeDateRange.startMs, endMs: activeDateRange.endMs, label: activeDateRange.label || 'Tanlangan davr' };
    }
    const now = Date.now();
    const open = getOpenShift(shifts);
    if (open?.openedAt) return { startMs: Number(open.openedAt), endMs: now, label: `Joriy smena (${timeOf(open.openedAt)} dan)` };
    const d = new Date();
    return { startMs: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), endMs: now, label: 'Bugun' };
  }, [activeDateRange, shifts]);

  const entries = useMemo(() => collectLosses(orders, period), [orders, period]);
  const summary = useMemo(() => summarizeLosses(entries), [entries]);
  const groups = summary[groupBy] || [];
  const visibleEntries = showAll ? entries : entries.slice(0, 8);

  const handleSend = async () => {
    setSending(true);
    // Qo'lda yuborish: "Z-hisobot" belgisi o'chiq bo'lsa ham boradi (faqat Telegram yoqilgan bo'lsin)
    const res = await sendTelegramLines(lossTelegramLines(summary, period.label, cafeName), 'general');
    setSending(false);
    notify(res?.ok
      ? '✅ Telegramga yuborildi'
      : `⚠️ Yuborilmadi: ${res?.error || res?.reason || "Telegram sozlanmagan yoki o'chiq"}`);
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-5 md:p-7 rounded-3xl shadow-xs border border-gray-100 dark:border-gray-700 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h3 className="text-lg md:text-xl font-black text-gray-900 dark:text-white">
            🧾 Rad etilgan va bekor qilingan taomlar
          </h3>
          <p className="text-xs font-bold text-gray-500 mt-1">
            {period.label} • oshxona rad etgani va xodim chekdan olib tashlagani (PIN bilan)
          </p>
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="shrink-0 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-black transition active:scale-95 disabled:opacity-50"
        >
          {sending ? 'Yuborilmoqda...' : '📤 Telegramga yuborish'}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20">
          <p className="text-[11px] font-black uppercase tracking-wider text-red-600 dark:text-red-400">❌ Oshxona rad etdi</p>
          <p className="text-lg font-black text-gray-900 dark:text-white mt-1">{summary.rejected.qty} pors</p>
          <p className="text-xs font-bold text-gray-500">{fmt(summary.rejected.amount)}</p>
        </div>
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
          <p className="text-[11px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">🚫 Xodim bekor qildi</p>
          <p className="text-lg font-black text-gray-900 dark:text-white mt-1">{summary.voided.qty} pors</p>
          <p className="text-xs font-bold text-gray-500">{fmt(summary.voided.amount)}</p>
        </div>
        <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700">
          <p className="text-[11px] font-black uppercase tracking-wider text-gray-500">🍳 Tayyor bo'lib bekor</p>
          <p className="text-lg font-black text-gray-900 dark:text-white mt-1">{summary.voided.cookedQty} pors</p>
          <p className="text-xs font-bold text-gray-500">isrof (masalliq sarflangan)</p>
        </div>
        <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700">
          <p className="text-[11px] font-black uppercase tracking-wider text-gray-500">💰 Jami summa</p>
          <p className="text-lg font-black text-gray-900 dark:text-white mt-1">{fmt(summary.totalAmount)}</p>
          <p className="text-xs font-bold text-gray-500">
            {summary.refundDue > 0 ? `qaytariladi: ${fmt(summary.refundDue)}` : 'chekdan chiqarilgan'}
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-center text-sm font-bold text-gray-400 py-6">✅ Bu davrda rad etilgan yoki bekor qilingan taom yo'q</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {GROUP_TABS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setGroupBy(t.id)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-black transition ${
                    groupBy === t.id
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {groups.length === 0 ? (
              <p className="text-xs font-bold text-gray-400 py-3">Bu bo'limda yozuv yo'q</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700/70 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                {groups.slice(0, 10).map(g => {
                  const max = groups[0]?.amount || 1;
                  return (
                    <li key={g.key} className="px-4 py-2.5 bg-white dark:bg-gray-800">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-bold text-gray-800 dark:text-gray-100 truncate">{g.key}</span>
                        <span className="shrink-0 text-xs font-black text-gray-600 dark:text-gray-300">
                          {g.qty} pors • {fmt(g.amount)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <div className="h-full rounded-full bg-red-400" style={{ width: `${Math.max(4, Math.round((g.amount / max) * 100))}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-gray-400 mb-3">Oxirgi yozuvlar</p>
            <ul className="space-y-2">
              {visibleEntries.map(e => (
                <li key={e.id} className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-gray-900 dark:text-white">
                        {e.kind === 'rejected' ? '❌' : '🚫'} {e.name} <span className="text-brand-600 dark:text-brand-400">x{e.qty}</span>
                      </p>
                      <p className="text-[11px] font-bold text-gray-500 mt-0.5 break-words">
                        {reasonKey(e.reason)} • {e.kind === 'rejected' ? `oshpaz: ${e.by}` : `bekor qildi: ${e.by}`}
                        {e.cookedQty > 0 ? ` • tayyor edi: ${e.cookedQty}` : ''}
                      </p>
                      <p className="text-[10px] font-bold text-gray-400 mt-0.5">
                        {timeOf(e.at)} • {e.table} • ofitsiant: {e.waiter}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-black text-red-600 dark:text-red-400">-{fmt(e.amount)}</span>
                  </div>
                </li>
              ))}
            </ul>
            {entries.length > 8 && (
              <button
                type="button"
                onClick={() => setShowAll(v => !v)}
                className="mt-3 w-full py-2 rounded-xl text-xs font-black text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-900 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
              >
                {showAll ? 'Qisqartirish' : `Hammasini ko'rish (${entries.length})`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
