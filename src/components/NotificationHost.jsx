import React, { useEffect, useState } from 'react';
import { subscribeNotifications, dismissToast, resolveConfirm } from '../utils/notify';

const TOAST_STYLES = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  warning: 'bg-amber-500 text-white',
  info: 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
};

// Toastlar va tasdiqlash oynasini chizadi. main.jsx da bir marta joylashtiriladi.
export default function NotificationHost() {
  const [state, setState] = useState({ toasts: [], confirms: [] });

  useEffect(() => subscribeNotifications(setState), []);

  const activeConfirm = state.confirms[0] || null;

  // Enter = tasdiqlash, Escape = bekor qilish
  useEffect(() => {
    if (!activeConfirm) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolveConfirm(activeConfirm.id, false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        resolveConfirm(activeConfirm.id, true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeConfirm]);

  return (
    <>
      {/* TOASTLAR */}
      <div
        className="fixed top-3 inset-x-3 sm:inset-x-auto sm:right-4 sm:w-96 z-[200] flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
      >
        {state.toasts.map(t => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto rounded-2xl px-4 py-3 shadow-lg font-bold text-sm flex items-start gap-3 ${TOAST_STYLES[t.type] || TOAST_STYLES.info}`}
          >
            <p className="flex-1 whitespace-pre-line break-words">{t.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="shrink-0 opacity-70 hover:opacity-100 font-black"
              aria-label="Yopish"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* TASDIQLASH OYNASI */}
      {activeConfirm && (
        <div
          className="fixed inset-0 z-[190] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => resolveConfirm(activeConfirm.id, false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-gray-700"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-gray-900 dark:text-white font-bold text-sm sm:text-base whitespace-pre-line break-words">
              {activeConfirm.message}
            </p>
            <div className="mt-6 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => resolveConfirm(activeConfirm.id, false)}
                className="px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-black text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition"
              >
                {activeConfirm.cancelText}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => resolveConfirm(activeConfirm.id, true)}
                className={`px-5 py-2.5 rounded-xl text-white font-black text-sm transition active:scale-95 ${
                  activeConfirm.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {activeConfirm.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
