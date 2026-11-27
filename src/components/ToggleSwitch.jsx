import React from 'react';

// Telegram uslubidagi yoqish/o'chirish tugmasi: yoqilgan - ✓ (asosiy rang), o'chiq - ✕ (qizil),
// o'zgartirib bo'lmaydi - 🔒. Ro'yxat qatorining o'ng chekkasida turadi (AdminRightsEditor, PinRulesPanel).
export default function ToggleSwitch({ checked, onChange, locked = false, disabled = false, label = '' }) {
  const isOn = Boolean(checked);
  const blocked = locked || disabled;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label={label || undefined}
      title={locked ? "O'zgartirish huquqingiz yo'q" : undefined}
      disabled={blocked}
      onClick={(e) => {
        e.stopPropagation();
        if (!blocked && typeof onChange === 'function') onChange(!isOn);
      }}
      className={`relative shrink-0 inline-flex items-center w-12 h-7 rounded-full transition-colors duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 ${
        isOn ? 'bg-emerald-500' : 'bg-red-500'
      } ${blocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
    >
      <span
        className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-sm flex items-center justify-center text-[11px] font-black leading-none transition-all duration-200 ${
          isOn ? 'left-[22px] text-emerald-600' : 'left-0.5 text-red-500'
        }`}
      >
        {locked ? '🔒' : isOn ? '✓' : '✕'}
      </span>
    </button>
  );
}
