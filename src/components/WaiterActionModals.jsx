import React from 'react';
import PrintReceiptModal from './PrintReceiptModal';
import { TableQrModal } from './Modals';

export default function WaiterActionModals({
  // 1. Admin PIN Security Modal props
  securityPrompt,
  setSecurityPrompt,
  pinInput,
  setPinInput,
  cancelReasonInput,
  setCancelReasonInput,
  pinError,
  setPinError,
  onConfirmSecurityPin,

  // 2. Stol Ko'chirish (Transfer) Modal props
  transferOrder,
  setTransferOrder,
  targetTransferTable,
  setTargetTransferTable,
  freeTablesForAction = [],
  onConfirmTransfer,

  // 3. Chekni Bo'lish (Split) Modal props
  splitOrder,
  setSplitOrder,
  splitTargetTable,
  setSplitTargetTable,
  splitQuantities = {},
  setSplitQuantities,
  onConfirmSplit,

  // 4. Pre-Chek Print va QR Modal props
  localPreCheckPrintOrder,
  setLocalPreCheckPrintOrder,
  qrModalTable,
  setQrModalTable,
  cafeName = 'Premium Cafe',
  serviceFee = 10
}) {
  return (
    <>
      {/* =========================================================
          1. 🔒 ADMIN PIN VA SABAB TASDIQLASH MODALI (ANTI-FRAUD)
          ========================================================= */}
      {securityPrompt && (
        <div
          onClick={() => setSecurityPrompt(null)}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[180] flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 w-full max-w-md rounded-3xl p-6 shadow-2xl border-2 border-red-400 dark:border-red-600 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center text-2xl shrink-0 shadow-md">
                🔒
              </div>
              <div>
                <h3 className="font-black text-lg text-gray-900 dark:text-white">
                  Xavfsizlik Qulfi (Admin Tasdig'i)
                </h3>
                <p className="text-xs font-bold text-red-600 dark:text-red-400 mt-0.5">
                  {securityPrompt.title}
                </p>
              </div>
            </div>

            <form onSubmit={onConfirmSecurityPin} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-black uppercase text-gray-500 mb-1">
                  Bekor qilish / kamaytirish sababi *
                </label>
                <select
                  value={cancelReasonInput}
                  onChange={e => setCancelReasonInput(e.target.value)}
                  className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-xs text-gray-900 dark:text-white outline-none focus:border-red-500 cursor-pointer"
                >
                  <option value="Mijoz rad etdi">🙅‍♂️ Mijoz taomni rad etdi</option>
                  <option value="Ofitsiant adashib urgan">✍️ Ofitsiant adashib urgan</option>
                  <option value="Oshxonada mahsulot tugagan">🛑 Oshxonada mahsulot tugab qoldi</option>
                  <option value="Boshqa stolga o'tkazildi">🔄 Boshqa stolga o'tkazildi</option>
                  <option value="Mijoz ketib qoldi">🚶‍♂️ Mijoz kutmasdan ketib qoldi</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase text-gray-500 mb-1">
                  Admin PIN-Kodi *
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={pinInput}
                  onChange={e => {
                    setPinInput(e.target.value);
                    if (typeof setPinError === 'function') setPinError('');
                  }}
                  placeholder="••••••"
                  className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border-2 border-red-300 dark:border-red-700 font-black text-xl text-center tracking-widest text-gray-900 dark:text-white outline-none focus:border-red-500"
                />
                {pinError && (
                  <p className="text-xs font-black text-red-600 mt-1 text-center">
                    {pinError}
                  </p>
                )}
              </div>

              <div className="bg-amber-50 dark:bg-gray-900/70 p-2.5 rounded-xl border border-amber-200 dark:border-gray-700 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                ℹ️ Tasdiqlangach, taom darhol <b>Oshxona</b> va <b>Kassa</b> ekranlaridan o'chiriladi hamda <b>Audit Tarixga</b> yoziladi.
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setSecurityPrompt(null)}
                  className="flex-1 py-3.5 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-bold text-xs"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-red-600/30 transition active:scale-95"
                >
                  🔓 Tasdiqlash va O'chirish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          2. 🔄 STOLNI BOSHQA BO'SH STOLGA KO'CHIRISH MODALI
          ========================================================= */}
      {transferOrder && (
        <div
          onClick={() => setTransferOrder(null)}
          className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4 border border-gray-100 dark:border-gray-700"
          >
            <h3 className="font-black text-lg text-gray-900 dark:text-white">
              🔄 {transferOrder.table} ni Boshqa Stolga Ko'chirish
            </h3>
            <form onSubmit={onConfirmTransfer} className="space-y-4">
              <select
                required
                value={targetTransferTable}
                onChange={e => setTargetTransferTable(e.target.value)}
                className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white outline-none focus:border-indigo-500"
              >
                <option value="">-- Bo'sh stolni tanlang --</option>
                {freeTablesForAction.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTransferOrder(null)}
                  className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-bold text-xs"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs"
                >
                  Ko'chirish ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          3. ✂️ CHEKNI BO'LISH (SPLIT BILL) MODALI
          ========================================================= */}
      {splitOrder && (
        <div
          onClick={() => setSplitOrder(null)}
          className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 max-h-[88vh] flex flex-col border border-gray-100 dark:border-gray-700"
          >
            <h3 className="font-black text-lg text-gray-900 dark:text-white">
              ✂️ {splitOrder.table} Chekini Bo'lish
            </h3>
            <form onSubmit={onConfirmSplit} className="space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Qaysi bo'sh stolga ajratamiz?
                </label>
                <select
                  required
                  value={splitTargetTable}
                  onChange={e => setSplitTargetTable(e.target.value)}
                  className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-xs text-gray-900 dark:text-white outline-none focus:border-purple-500"
                >
                  <option value="">-- Stolni tanlang --</option>
                  {freeTablesForAction.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                {(splitOrder.items || []).map((it, idx) => {
                  const maxQ = Number(it.quantity ?? it.qty ?? 1) || 1;
                  const chosenQ = Number(splitQuantities[idx]) || 0;
                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 flex justify-between items-center"
                    >
                      <div>
                        <p className="font-black text-xs text-gray-900 dark:text-white">{it.name}</p>
                        <span className="text-[10px] font-bold text-gray-400">Mavjud: {maxQ} pors</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSplitQuantities(prev => ({
                              ...prev,
                              [idx]: Math.max(0, chosenQ - 1)
                            }))
                          }
                          className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-gray-700 font-black text-gray-800 dark:text-white"
                        >
                          -
                        </button>
                        <span className="font-black text-xs w-6 text-center text-gray-900 dark:text-white">
                          {chosenQ}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setSplitQuantities(prev => ({
                              ...prev,
                              [idx]: Math.min(maxQ, chosenQ + 1)
                            }))
                          }
                          className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-black"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSplitOrder(null)}
                  className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-bold text-xs"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-black text-xs"
                >
                  ✂️ Chekni Ajratish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          4. PRE-CHEK CHOP ETISH VA QR-KOD MODALLARI
          ========================================================= */}
      {localPreCheckPrintOrder && (
        <PrintReceiptModal
          cafeName={cafeName}
          order={localPreCheckPrintOrder}
          serviceFee={serviceFee}
          onClose={() => setLocalPreCheckPrintOrder(null)}
        />
      )}

      {qrModalTable && (
        <TableQrModal
          table={qrModalTable}
          cafeName={cafeName}
          onClose={() => setQrModalTable(null)}
        />
      )}
    </>
  );
}
