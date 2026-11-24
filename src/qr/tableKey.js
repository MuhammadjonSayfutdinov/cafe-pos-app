// Stol QR kalitlari va "faqat kafe ichidan" (joylashuv) sozlamasi.
//
// QR havolada stol kaliti bor: ?table=3-Stol&k=<kalit>. Kalit = sha256(sir + '|' + stol)
// ning birinchi 12 belgisi. Sir (pos_qr_secret) bulutda saqlanadi, mijoz uni ko'rmaydi.
// Server (supabase/qr.sql -> qr_access) xuddi shu formula bilan tekshiradi.
// Havolani qo'lda yozgan odam (stolda o'tirmagan) kalitni bilmaydi: band stolga
// buyurtma bera olmaydi.
//
// SHA-256 kutubxonasiz: src/utils/sha256.ts (http da ham ishlaydi).

import { sha256Hex, randomBytes, toHex } from '../utils/sha256';

export { sha256Hex };

export const QR_SECRET_KEY = 'pos_qr_secret';
export const QR_GEOFENCE_KEY = 'pos_qr_geofence';
export const DEFAULT_GEOFENCE = Object.freeze({ enabled: false, lat: null, lng: null, radius: 200 });
const TABLE_KEY_LENGTH = 12;

export const isValidQrSecret = (secret) => typeof secret === 'string' && secret.length >= 16;

/** Stol kaliti (QR havolaga yoziladi). Sir yo'q bo'lsa - '' */
export const tableKey = (secret, table) =>
  isValidQrSecret(secret) ? sha256Hex(`${secret}|${String(table || '')}`).slice(0, TABLE_KEY_LENGTH) : '';

export const generateQrSecret = () => toHex(randomBytes(24));

/** "Faqat kafe ichidan" sozlamasini tekshirib, toza ko'rinishga keltiradi */
export function normalizeGeofence(raw) {
  const g = raw && typeof raw === 'object' ? raw : {};
  const lat = Number(g.lat);
  const lng = Number(g.lng);
  const hasPoint = g.lat !== null && g.lng !== null && g.lat !== '' && g.lng !== '' &&
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  const radius = Math.min(2000, Math.max(50, Math.round(Number(g.radius) || DEFAULT_GEOFENCE.radius)));
  return {
    enabled: Boolean(g.enabled) && hasPoint,
    lat: hasPoint ? lat : null,
    lng: hasPoint ? lng : null,
    radius
  };
}

/** "41.311081, 69.240562" (Google Maps'dan nusxa) -> { lat, lng } yoki null */
export function parseLatLng(text) {
  const m = String(text || '').trim().match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1].replace(',', '.'));
  const lng = Number(m[2].replace(',', '.'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
