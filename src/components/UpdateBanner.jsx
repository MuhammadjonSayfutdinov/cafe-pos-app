import React, { useEffect, useState } from 'react';
import { applyUpdateFromUser, getUpdateState, subscribeUpdate } from '../pwa/update';

// Yangi versiya chiqqanda ekran pastida ko'rinadi. Bosilmasa ham ish to'xtaganda o'zi yangilanadi.
export default function UpdateBanner() {
  const [update, setUpdate] = useState(getUpdateState);

  useEffect(() => subscribeUpdate(setUpdate), []);

  if (!update.ready) return null;

  return (
    <div
      role="status"
      className="fixed bottom-3 left-3 right-3 sm:right-auto sm:max-w-md z-[150] flex items-center gap-3 p-3 pl-4 rounded-2xl bg-brand-600 text-white shadow-2xl shadow-brand-900/30 border border-brand-400/40"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <span className="text-2xl shrink-0" aria-hidden="true">🔄</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black leading-tight">Dasturning yangi versiyasi chiqdi</p>
        <p className="text-[11px] font-bold text-brand-100 leading-snug mt-0.5">
          {update.unsaved
            ? "Yuborilmagan buyurtma bor: yuborilgach o'zi yangilanadi"
            : "Ish to'xtaganda o'zi yangilanadi. Hozir yangilash ham mumkin."}
        </p>
      </div>
      <button
        type="button"
        onClick={applyUpdateFromUser}
        className="shrink-0 px-4 py-2.5 rounded-xl bg-white text-brand-700 font-black text-sm shadow-md transition active:scale-95 hover:bg-brand-50"
      >
        Yangilash
      </button>
    </div>
  );
}
