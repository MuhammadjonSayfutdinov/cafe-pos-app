import { useState, useEffect } from 'react';

export function useSticky(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stickyValue = window.localStorage.getItem(key);
      return stickyValue !== null ? JSON.parse(stickyValue) : defaultValue;
    } catch (error) {
      console.error(`useSticky o'qishda xato (${key}):`, error);
      return defaultValue;
    }
  });

  // 1. O'zgarish bo'lganda localStorage'ga yozish va shu oynadagi komponentlarga bildirish
  useEffect(() => {
    try {
      const serialized = JSON.stringify(value);
      const currentInStorage = window.localStorage.getItem(key);

      if (currentInStorage !== serialized) {
        window.localStorage.setItem(key, serialized);
        window.dispatchEvent(
          new CustomEvent('local-storage-update', { detail: { key, newValue: value } })
        );
      }
    } catch (error) {
      console.error(`useSticky yozishda xato (${key}):`, error);
    }
  }, [key, value]);

  // 2. Boshqa oynadan (tabdan) kelgan o'zgarishlarni F5 bosmasdan jonli ushlash
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key === key && event.newValue !== null) {
        try {
          setValue(JSON.parse(event.newValue));
        } catch (err) {
          console.error(err);
        }
      }
    };

    const handleCustomEvent = (event) => {
      if (event.detail?.key === key) {
        setValue(event.detail.newValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('local-storage-update', handleCustomEvent);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('local-storage-update', handleCustomEvent);
    };
  }, [key]);

  return [value, setValue];
}

export default useSticky;