import React, { useState, useMemo } from 'react';
import ToggleSwitch from './ToggleSwitch';
import {
  ADMIN_RIGHTS,
  ADMIN_RIGHT_GROUPS,
  clampRights,
  countRights,
  getUserRights,
  grantableRights,
  userIdOf
} from '../utils/adminRights';

// Admin huquqlari ro'yxati (Telegram'dagi "Admin huquqlari" kabi): har qatorda bo'lim nomi va o'ng
// chekkada tugma. Bera olmaydigan huquq (o'zida yo'q) - 🔒 qulf bilan.
export function AdminRightsEditor({ value, onChange, grantable, disabled = false }) {
  const rights = value || {};
  const total = countRights(rights);

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-700">
        <p className="text-xs font-black uppercase tracking-wider text-brand-600 dark:text-brand-400">
          🛡️ Admin huquqlari
        </p>
        <span className="text-[11px] font-black text-gray-500 dark:text-gray-400">
          Ochiq: {total.on}/{total.total}
        </span>
      </div>

      {ADMIN_RIGHT_GROUPS.map(group => {
        const items = ADMIN_RIGHTS.filter(r => r.group === group.id);
        const count = countRights(rights, group.id);
        return (
          <div key={group.id}>
            <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-wider text-gray-400">{group.label}</p>
              <span className="text-[10px] font-black text-gray-400">{count.on}/{count.total}</span>
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/70">
              {items.map(meta => {
                const locked = disabled || !grantable?.[meta.key];
                return (
                  <li key={meta.key} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-lg w-7 text-center shrink-0" aria-hidden="true">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-white leading-tight">{meta.label}</p>
                      {meta.hint && (
                        <p className="text-[11px] font-semibold text-gray-400 leading-snug mt-0.5">{meta.hint}</p>
                      )}
                    </div>
                    <ToggleSwitch
                      checked={Boolean(rights[meta.key])}
                      locked={locked}
                      label={meta.label}
                      onChange={(next) => typeof onChange === 'function' && onChange({ ...rights, [meta.key]: next })}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// Mavjud adminning huquqlarini o'zgartirish oynasi. Saqlashda bera olmaydigan huquq o'zgarmaydi
// (clampRights), natija onSave(rights, before) ga beriladi.
export default function AdminRightsModal({ target, actor, ownerId, users = [], onSave, onCancel }) {
  const before = useMemo(() => getUserRights(target, ownerId), [target, ownerId]);
  const grantable = useMemo(() => grantableRights(actor, ownerId), [actor, ownerId]);
  const [rights, setRights] = useState(before);

  if (!target) return null;
  const appointer = (Array.isArray(users) ? users : []).find(
    u => u && target.appointedBy !== undefined && userIdOf(u) === String(target.appointedBy)
  );
  const lockedCount = ADMIN_RIGHTS.filter(r => !grantable[r.key]).length;

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-gray-50 dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700"
      >
        <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
          <div className="w-11 h-11 rounded-2xl bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 font-black flex items-center justify-center text-lg shrink-0">
            {String(target.name || 'A').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-gray-900 dark:text-white truncate">{String(target.name || 'Admin')}</h3>
            <p className="text-[11px] font-bold text-gray-500 truncate">
              🛡️ Admin{appointer ? ` • tayinlagan: ${String(appointer.name || '')}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-red-500 font-black flex items-center justify-center transition"
            title="Yopish"
          >
            ✕
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 leading-relaxed">
            Yoqilgan bo'limlar shu adminga ochiq, o'chirilganlari yopiq (menyuda ko'rinmaydi).
            O'zgarish barcha qurilmalarga darhol yetib boradi.
          </p>

          <AdminRightsEditor value={rights} onChange={setRights} grantable={grantable} />

          {lockedCount > 0 && (
            <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
              🔒 Qulf belgisi: bu huquq sizda yo'q, shuning uchun uni bera olmaysiz (faqat Ega beradi).
            </p>
          )}
        </div>

        <div className="sticky bottom-0 flex gap-3 px-4 sm:px-5 py-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-2xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-black text-sm transition active:scale-95"
          >
            Bekor qilish
          </button>
          <button
            type="button"
            onClick={() => typeof onSave === 'function' && onSave(clampRights(rights, actor, ownerId, before), before)}
            className="flex-1 py-3 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white font-black text-sm shadow-lg shadow-brand-900/30 transition active:scale-95"
          >
            Saqlash ✓
          </button>
        </div>
      </div>
    </div>
  );
}
