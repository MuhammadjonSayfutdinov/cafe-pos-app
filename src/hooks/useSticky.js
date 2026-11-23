import { useState, useEffect, useCallback, useRef } from 'react';
import { notify } from '../utils/notify';
import { SAME_TAB_EVENT } from '../sync/config';
import { localWrite } from '../sync/engine';

// localStorage bilan sinxron state (B11).
//
// Oldingi muammo: har bir komponent o'z eski state'idan hisoblab, butun ro'yxatni
// localStorage'ga qayta yozardi -> ikki komponent/oyna bir vaqtda yozsa, birining
// o'zgarishi yo'qolardi ("oxirgi yozuv g'olib"). Xotira to'lsa, xato faqat konsolga chiqardi.
//
// Endi: funksional yangilanish (prev => ...) har doim localStorage'dagi ENG SO'NGGI
// qiymatdan hisoblanadi va darhol yoziladi. Yozib bo'lmasa, foydalanuvchiga xabar chiqadi.

// Yozib bo'lmagan (xotira to'lgan) qiymatlar: keyingi hisob shulardan davom etadi
const unsavedValues = new Map();
let lastWriteWarningAt = 0;

const readLatest = (key, fallback) => {
  if (unsavedValues.has(key)) return unsavedValues.get(key);
  try {
    const raw = window.localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`useSticky o'qishda xato (${key}):`, error);
    return fallback;
  }
};

const isQuotaError = (error) =>
  error?.name === 'QuotaExceededError' ||
  error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
  error?.code === 22 ||
  error?.code === 1014;

const writeValue = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    unsavedValues.delete(key);
    return true;
  } catch (error) {
    console.error(`useSticky yozishda xato (${key}):`, error);
    unsavedValues.set(key, value);
    const now = Date.now();
    if (now - lastWriteWarningAt > 10000) {
      lastWriteWarningAt = now;
      notify(
        isQuotaError(error)
          ? "❌ Qurilma xotirasi to'ldi! Oxirgi o'zgarishlar saqlanmayapti.\nAdmin → Tizim Sozlamalari: zaxira nusxa oling va eski cheklar tarixini tozalang."
          : `❌ Ma'lumotni saqlab bo'lmadi (${key}). Sahifani yangilashdan oldin zaxira nusxa oling.`,
        'error'
      );
    }
    return false;
  }
};

export function useSticky(key, defaultValue) {
  const defaultRef = useRef(defaultValue);
  const [value, setValue] = useState(() => readLatest(key, defaultValue));

  // Birinchi ishga tushishda standart qiymatni saqlab qo'yish
  // (ba'zi komponentlar localStorage'dan to'g'ridan-to'g'ri o'qiydi)
  useEffect(() => {
    try {
      if (window.localStorage.getItem(key) === null && !unsavedValues.has(key)) {
        writeValue(key, defaultRef.current);
        // Birinchi qurilmaning boshlang'ich ma'lumotlari bulutga ham chiqsin
        localWrite(key, defaultRef.current);
      }
    } catch {
      // localStorage mavjud emas
    }
  }, [key]);

  const setSticky = useCallback((updater) => {
    const latest = readLatest(key, defaultRef.current);
    const next = typeof updater === 'function' ? updater(latest) : updater;
    // O'zgarish bo'lmasa (updater o'sha qiymatni qaytarsa) qayta yozmaymiz
    if (next === undefined || next === latest) return;

    writeValue(key, next);
    // Bulutga sinxronlash (sozlanmagan bo'lsa hech narsa qilmaydi)
    localWrite(key, next);
    setValue(next);
    window.dispatchEvent(new CustomEvent(SAME_TAB_EVENT, { detail: { key, newValue: next } }));
  }, [key]);

  // Shu oynadagi boshqa komponentlar va boshqa oynalar (tablar) o'zgarishlarini tinglash
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key !== key) return;
      if (event.newValue === null) {
        setValue(defaultRef.current);
        return;
      }
      try {
        setValue(JSON.parse(event.newValue));
      } catch (err) {
        console.error(err);
      }
    };

    const handleSameTab = (event) => {
      if (event.detail?.key === key) {
        // Serverdan kelgan qiymat saqlanmagan mahalliy nusxadan ustun
        if (event.detail.source === 'remote') unsavedValues.delete(key);
        setValue(event.detail.newValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(SAME_TAB_EVENT, handleSameTab);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(SAME_TAB_EVENT, handleSameTab);
    };
  }, [key]);

  return [value, setSticky];
}

export default useSticky;
