import { useCallback, useEffect } from 'react';
import useSticky from '../hooks/useSticky';
import { QR_SECRET_KEY, generateQrSecret, isValidQrSecret, tableKey } from './tableKey';

/**
 * QR chiziladigan joylarda (stiker varag'i, ofitsiantning stol QR oynasi) ishlatiladi.
 * Sir hali yo'q bo'lsa, bir marta yaratiladi va bulut orqali barcha qurilmalarga boradi.
 * Qaytaradi: (table) => kalit
 */
export function useQrTableKey() {
  const [secret, setSecret] = useSticky(QR_SECRET_KEY, '');
  useEffect(() => {
    if (!isValidQrSecret(secret)) setSecret(prev => (isValidQrSecret(prev) ? prev : generateQrSecret()));
  }, [secret, setSecret]);
  return useCallback((table) => tableKey(secret, table), [secret]);
}
