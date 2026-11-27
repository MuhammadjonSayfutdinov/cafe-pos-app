import React, { useState } from 'react';
import ToggleSwitch from './ToggleSwitch';
import { OWNER_ONLY_ACTIONS, PIN_RULE_GROUPS, countPinRules } from '../utils/pinRules';

// Admin PIN himoyasi: qaysi amalda rahbar (admin) PIN-kodi so'raladi. Telegram guruhidagi ruxsatlar
// ro'yxati kabi: soha (Ofitsiant, Kassa...) "n/m ˅" bilan ochiladi, har amalning o'z tugmasi bor.
// O'zgartirish: Ega yoki "PIN himoyasini boshqarish" huquqi bor admin (qolganlar faqat ko'radi).
export default function PinRulesPanel({ rules, canEdit = false, ownerName = '', onChange }) {
  const [openGroups, setOpenGroups] = useState(() => new Set(PIN_RULE_GROUPS.map(g => g.id)));
  const total = countPinRules(rules);

  const toggleOpen = (id) => setOpenGroups(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const change = (changes) => {
    if (canEdit && typeof onChange === 'function') onChange(changes);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 md:p-6 border border-gray-100 dark:border-gray-700 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">🔐 Admin PIN himoyasi</h2>
            <p className="text-xs sm:text-sm font-bold text-gray-500 mt-1 leading-relaxed">
              Qaysi amalda rahbar (admin) PIN-kodi so'ralishini belgilang. Yoqilgan amalni xodim
              admin tasdig'isiz bajara olmaydi, o'chirilganini o'zi bajaradi.
            </p>
          </div>
          <span className={`shrink-0 self-start sm:self-center px-3 py-1.5 rounded-xl text-xs font-black ${
            total.on > 0
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
          }`}>
            {total.on > 0 ? `🔒 ${total.on}/${total.total} amal himoyalangan` : "🔓 Himoya o'chiq"}
          </span>
        </div>

        {!canEdit && (
          <p className="mt-4 px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-xs font-bold text-amber-700 dark:text-amber-300">
            🔒 Faqat Ega{ownerName ? ` (${ownerName})` : ''} yoki u ruxsat bergan admin o'zgartira oladi. Siz faqat ko'rasiz.
          </p>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-xs overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/70">
        {PIN_RULE_GROUPS.map(group => {
          const keys = group.rules.map(r => r.key);
          const count = countPinRules(rules, keys);
          const someOn = count.on > 0;
          const isOpen = openGroups.has(group.id);
          return (
            <div key={group.id}>
              <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
                <button
                  type="button"
                  onClick={() => toggleOpen(group.id)}
                  aria-expanded={isOpen}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left"
                >
                  <span className="text-xl w-7 text-center shrink-0" aria-hidden="true">{group.icon}</span>
                  <span className="text-sm sm:text-base font-black text-gray-900 dark:text-white truncate">{group.label}</span>
                  <span className="text-xs font-black text-gray-500 dark:text-gray-400 shrink-0">{count.on}/{count.total}</span>
                  <span className={`text-gray-400 text-xs shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true">▼</span>
                </button>
                <span className="w-px h-7 bg-gray-200 dark:bg-gray-700 shrink-0" aria-hidden="true" />
                <ToggleSwitch
                  checked={someOn}
                  locked={!canEdit}
                  label={`${group.label}: barchasi`}
                  onChange={(next) => change(Object.fromEntries(keys.map(k => [k, next])))}
                />
              </div>

              {isOpen && (
                <ul className="bg-gray-50/70 dark:bg-gray-900/40 divide-y divide-gray-100 dark:divide-gray-700/50">
                  {group.rules.map(rule => (
                    <li key={rule.key} className="flex items-center gap-3 pl-12 sm:pl-14 pr-4 sm:pr-5 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800 dark:text-gray-100 leading-tight">{rule.label}</p>
                        {rule.hint && (
                          <p className="text-[11px] font-semibold text-gray-400 mt-0.5 leading-snug">{rule.hint}</p>
                        )}
                      </div>
                      <ToggleSwitch
                        checked={Boolean(rules?.[rule.key])}
                        locked={!canEdit}
                        label={rule.label}
                        onChange={(next) => change({ [rule.key]: next })}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 border border-gray-100 dark:border-gray-700">
          <p className="text-xs font-black uppercase tracking-wider text-gray-400 mb-2">Kim tasdiqlaydi</p>
          <p className="text-xs font-bold text-gray-600 dark:text-gray-300 leading-relaxed">
            👑 Ega va "✅ Xavfli amalni PIN bilan tasdiqlash" huquqi bor adminlar. Ular o'zlari bajarganda
            PIN so'ralmaydi. Huquqlar: Boshqaruv → Xodimlar va Parollar → admin kartasidagi "🛡️ Huquqlar".
          </p>
        </div>
        <div className="bg-amber-50/70 dark:bg-amber-500/5 rounded-3xl p-5 border border-amber-200 dark:border-amber-500/20">
          <p className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2">👑 Faqat Ega bajaradi</p>
          <ul className="space-y-1">
            {OWNER_ONLY_ACTIONS.map(a => (
              <li key={a} className="text-xs font-bold text-gray-700 dark:text-gray-300">🔒 {a}</li>
            ))}
          </ul>
          <p className="text-[11px] font-semibold text-gray-400 mt-2">Ega PIN-kodi (va yoqilgan bo'lsa Authenticator kodi) bilan.</p>
        </div>
      </div>
    </div>
  );
}
