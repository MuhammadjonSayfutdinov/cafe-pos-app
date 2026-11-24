import React, { useMemo, useState } from 'react';
import useSticky from '../hooks/useSticky';
import { ORDER_STATUS, CLOSED_ORDER_STATUSES } from '../constants/orderStatus';
import {
  computeShiftReport, getOpenShift, getLastClosedShift,
  shiftReportRows, shiftTelegramLines, shiftReportHtml
} from '../shift/shiftReport';
import { sendTelegramLines } from '../utils/telegramNotifier';
import { newId } from '../utils/ids';
import { notify } from '../utils/notify';

// Kassa smenasi: ochish (boshlang'ich naqd), yopish (sanalgan naqd, farq, Z-hisobot), tarix.

const fmt = (x) => `${Math.round(Number(x) || 0).toLocaleString()} so'm`;
const timeOf = (ms) => (ms ? new Date(ms).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

export function printShiftReport(shift, cafeName) {
  const w = window.open('', '_blank', 'width=420,height=700');
  if (!w) {
    notify("⚠️ Chop etish oynasi bloklandi. Brauzerda qalqib chiquvchi oynalarga ruxsat bering.");
    return;
  }
  w.document.write(shiftReportHtml(shift, cafeName));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-[150] bg-black/50 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[92vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-3xl p-5 sm:p-6 shadow-2xl border border-gray-100 dark:border-gray-700`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-black text-gray-900 dark:text-white">{title}</h3>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 font-black text-gray-500" aria-label="Yopish">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ReportTable({ shift }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {shiftReportRows(shift).map(([k, v]) => {
          const strong = /^(JAMI|KASSADA|SANALGAN|FARQ)/.test(k);
          const bad = k === 'FARQ' && Number(shift?.difference) < 0;
          return (
            <tr key={k} className={strong ? 'border-t border-dashed border-gray-300 dark:border-gray-600' : ''}>
              <td className={`py-1 pr-3 ${strong ? 'font-black text-gray-900 dark:text-white' : 'font-bold text-gray-500 dark:text-gray-400'}`}>{k}</td>
              <td className={`py-1 text-right whitespace-nowrap ${strong ? 'font-black' : 'font-bold'} ${bad ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>{v}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Smenani yopish oynasi (Kassa va Statistika bo'limlaridan ochiladi) */
export function CloseShiftModal({ orders, expenses, setOrders, setExpenses, currentUser, cafeName, addAuditLog, onClose, onClosed }) {
  const [shifts, setShifts] = useSticky('pos_shifts', []);
  const openShift = getOpenShift(shifts);
  const [counted, setCounted] = useState('');

  const report = useMemo(() => computeShiftReport({
    orders, expenses, openingCash: openShift?.openingCash || 0, openedAt: openShift?.openedAt || 0
  }), [orders, expenses, openShift]);

  const openTables = (Array.isArray(orders) ? orders : []).filter(o => o && !CLOSED_ORDER_STATUSES.includes(o.status));
  const countedNum = counted === '' ? null : Math.round(Number(counted));
  const diff = countedNum === null || Number.isNaN(countedNum) ? null : countedNum - report.expectedCash;

  const handleClose = () => {
    if (countedNum === null || Number.isNaN(countedNum) || countedNum < 0) {
      notify("Kassadagi naqd pulni sanab, summasini kiriting");
      return;
    }
    const closedAt = Date.now();
    const base = openShift || {
      id: newId('shift_'),
      openedAt: 0,
      openedBy: '—',
      openingCash: 0
    };
    const closed = {
      ...base,
      status: 'closed',
      closedAt,
      closedBy: currentUser?.name || 'Kassir',
      countedCash: countedNum,
      expectedCash: report.expectedCash,
      difference: countedNum - report.expectedCash,
      report
    };

    setShifts(prev => {
      const list = Array.isArray(prev) ? prev : [];
      return openShift ? list.map(s => (s && s.id === openShift.id ? closed : s)) : [closed, ...list];
    });

    // Joriy smena cheklari va xarajatlari arxivga (statistika "Arxiv" bo'limi shunga tayanadi)
    const archiveDate = new Date(closedAt).toLocaleString();
    setOrders(prev => (Array.isArray(prev) ? prev : []).map(o =>
      o && o.status === ORDER_STATUS.PAID ? { ...o, status: ORDER_STATUS.ARCHIVED, archiveDate, shiftId: o.shiftId || closed.id } : o
    ));
    setExpenses(prev => (Array.isArray(prev) ? prev : []).map(e =>
      e && e.status !== ORDER_STATUS.ARCHIVED ? { ...e, status: ORDER_STATUS.ARCHIVED, archiveDate, shiftId: e.shiftId || closed.id } : e
    ));

    sendTelegramLines(shiftTelegramLines(closed, cafeName), 'z_report');
    if (typeof addAuditLog === 'function') {
      addAuditLog(
        'Z-hisobot (smena yopildi)',
        `Tushum ${fmt(report.revenue)} | Kutilgan naqd ${fmt(report.expectedCash)} | Sanalgan ${fmt(countedNum)} | Farq ${closed.difference}`
      );
    }
    if (closed.difference < 0) {
      sendTelegramLines([
        `🚨 <b>KASSADA KAMOMAD</b>`,
        `Smena: ${closed.closedBy}`,
        `Kutilgan: ${fmt(report.expectedCash)}, sanalgan: ${fmt(countedNum)}`,
        `Kamomad: <b>${fmt(Math.abs(closed.difference))}</b>`
      ], 'security');
    }
    notify('✅ Smena yopildi');
    if (typeof onClosed === 'function') onClosed(closed);
  };

  return (
    <Modal title="🔒 Smenani yopish (Z-hisobot)" onClose={onClose} wide>
      {openTables.length > 0 && (
        <p className="mb-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs font-black">
          ⚠️ {openTables.length} ta stol hali to'lanmagan. Ular keyingi smenaga o'tadi.
        </p>
      )}
      {!openShift && (
        <p className="mb-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60 text-gray-600 dark:text-gray-300 text-xs font-bold">
          Smena ochilmagan edi: boshlang'ich naqd 0 deb hisoblanadi.
        </p>
      )}
      <ReportTable shift={{ ...openShift, report, expectedCash: report.expectedCash, countedCash: countedNum ?? 0, difference: diff ?? 0 }} />
      <label className="block mt-4">
        <span className="text-[11px] font-black uppercase text-gray-500">Kassadagi naqd pulni sanab kiriting</span>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          value={counted}
          onChange={e => setCounted(e.target.value)}
          placeholder={String(report.expectedCash)}
          className="mt-1 w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-lg text-gray-900 dark:text-white outline-hidden focus:border-brand-500"
        />
      </label>
      {diff !== null && (
        <p className={`mt-2 text-sm font-black ${diff === 0 ? 'text-emerald-600' : diff > 0 ? 'text-amber-600' : 'text-red-600'}`}>
          {diff === 0 ? "✅ Kassa to'g'ri" : diff > 0 ? `Ortiqcha: +${fmt(diff)}` : `Kamomad: -${fmt(Math.abs(diff))}`}
        </p>
      )}
      <button
        type="button"
        onClick={handleClose}
        className="mt-4 w-full py-3.5 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black"
      >
        Smenani yopish
      </button>
    </Modal>
  );
}

/** Kassa ekranining tepasidagi smena paneli */
export default function ShiftPanel({ orders, expenses, setOrders, setExpenses, currentUser, cafeName, addAuditLog }) {
  const [shifts, setShifts] = useSticky('pos_shifts', []);
  const openShift = getOpenShift(shifts);
  const lastClosed = getLastClosedShift(shifts);

  const [modal, setModal] = useState(null); // 'open' | 'close' | 'history' | { report: shift }
  const [openingCash, setOpeningCash] = useState('');

  const handleOpen = () => {
    const value = Math.round(Number(openingCash || 0));
    if (Number.isNaN(value) || value < 0) {
      notify("Boshlang'ich naqd summani to'g'ri kiriting");
      return;
    }
    if (getOpenShift(shifts)) {
      notify('⚠️ Smena allaqachon ochiq');
      setModal(null);
      return;
    }
    const shift = {
      id: newId('shift_'),
      status: 'open',
      openedAt: Date.now(),
      openedBy: currentUser?.name || 'Kassir',
      openingCash: value
    };
    setShifts(prev => [shift, ...(Array.isArray(prev) ? prev : [])]);
    if (typeof addAuditLog === 'function') addAuditLog('Smena ochildi', `Boshlang'ich naqd: ${fmt(value)}`);
    notify('✅ Smena ochildi');
    setModal(null);
  };

  const closedShifts = (Array.isArray(shifts) ? shifts : []).filter(s => s && s.status === 'closed')
    .sort((a, b) => Number(b.closedAt) - Number(a.closedAt));

  return (
    <>
      <div
        data-testid="shift-panel"
        className={`p-3 sm:p-4 rounded-3xl border flex flex-col sm:flex-row sm:items-center gap-3 ${
          openShift
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
        }`}
      >
        <div className="flex-1 min-w-0">
          {openShift ? (
            <>
              <p className="font-black text-emerald-800 dark:text-emerald-200">🟢 Smena ochiq</p>
              <p className="text-xs font-bold text-gray-600 dark:text-gray-300">
                {timeOf(openShift.openedAt)} dan • {openShift.openedBy} • boshlang'ich naqd {fmt(openShift.openingCash)}
              </p>
            </>
          ) : (
            <>
              <p className="font-black text-red-700 dark:text-red-300">🔴 Smena ochilmagan</p>
              <p className="text-xs font-bold text-gray-600 dark:text-gray-300">To'lov qabul qilish uchun smenani oching</p>
            </>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={() => setModal('history')} className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-black text-xs text-gray-700 dark:text-gray-200">
            📜 Smenalar
          </button>
          {openShift ? (
            <button type="button" onClick={() => setModal('close')} className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs">
              🔒 Smenani yopish
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { setOpeningCash(String(lastClosed?.countedCash ?? '')); setModal('open'); }}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs"
            >
              🟢 Smenani ochish
            </button>
          )}
        </div>
      </div>

      {modal === 'open' && (
        <Modal title="🟢 Smenani ochish" onClose={() => setModal(null)}>
          <label className="block">
            <span className="text-[11px] font-black uppercase text-gray-500">Kassadagi boshlang'ich naqd pul</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              autoFocus
              value={openingCash}
              onChange={e => setOpeningCash(e.target.value)}
              placeholder="0"
              className="mt-1 w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-lg text-gray-900 dark:text-white outline-hidden focus:border-emerald-500"
            />
          </label>
          {lastClosed && (
            <p className="mt-2 text-xs font-bold text-gray-500">
              Oldingi smena yopilganda sanalgan: {fmt(lastClosed.countedCash)}
            </p>
          )}
          <button type="button" onClick={handleOpen} className="mt-4 w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black">
            Smenani ochish
          </button>
        </Modal>
      )}

      {modal === 'close' && (
        <CloseShiftModal
          orders={orders}
          expenses={expenses}
          setOrders={setOrders}
          setExpenses={setExpenses}
          currentUser={currentUser}
          cafeName={cafeName}
          addAuditLog={addAuditLog}
          onClose={() => setModal(null)}
          onClosed={(closed) => setModal({ report: closed })}
        />
      )}

      {modal?.report && (
        <Modal title="📊 Z-hisobot" onClose={() => setModal(null)} wide>
          <ReportTable shift={modal.report} />
          <button type="button" onClick={() => printShiftReport(modal.report, cafeName)} className="mt-4 w-full py-3.5 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-black">
            🖨 Chop etish
          </button>
        </Modal>
      )}

      {modal === 'history' && (
        <Modal title="📜 Smenalar tarixi" onClose={() => setModal(null)} wide>
          {closedShifts.length === 0 ? (
            <p className="text-sm font-bold text-gray-500">Hali yopilgan smena yo'q</p>
          ) : (
            <div className="space-y-2">
              {closedShifts.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setModal({ report: s })}
                  className="w-full text-left p-3 rounded-2xl bg-gray-50 dark:bg-gray-900/60 hover:bg-brand-50 dark:hover:bg-brand-900/30 flex justify-between gap-3"
                >
                  <span className="min-w-0">
                    <span className="block font-black text-sm text-gray-900 dark:text-white">{timeOf(s.openedAt)} — {timeOf(s.closedAt)}</span>
                    <span className="block text-xs font-bold text-gray-500">{s.closedBy} • {s.report?.ordersCount || 0} chek</span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block font-black text-sm text-gray-900 dark:text-white">{fmt(s.report?.revenue)}</span>
                    <span className={`block text-xs font-black ${Number(s.difference) < 0 ? 'text-red-600' : Number(s.difference) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      farq {Number(s.difference) > 0 ? '+' : ''}{Math.round(Number(s.difference) || 0).toLocaleString()}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
