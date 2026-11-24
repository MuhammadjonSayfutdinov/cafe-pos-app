// Stol QR kalitlari va "faqat kafe ichidan" (joylashuv) sozlamasi.
//
// QR havolada stol kaliti bor: ?table=3-Stol&k=<kalit>. Kalit = sha256(sir + '|' + stol)
// ning birinchi 12 belgisi. Sir (pos_qr_secret) bulutda saqlanadi, mijoz uni ko'rmaydi.
// Server (supabase/qr.sql -> qr_access) xuddi shu formula bilan tekshiradi.
// Havolani qo'lda yozgan odam (stolda o'tirmagan) kalitni bilmaydi: band stolga
// buyurtma bera olmaydi.
//
// WebCrypto (crypto.subtle) faqat https da ishlaydi, kassa esa 192.168.x.x (http) da ham
// ochiladi. Shuning uchun SHA-256 shu yerda yozilgan (sinxron, kutubxonasiz).

export const QR_SECRET_KEY = 'pos_qr_secret';
export const QR_GEOFENCE_KEY = 'pos_qr_geofence';
export const DEFAULT_GEOFENCE = Object.freeze({ enabled: false, lat: null, lng: null, radius: 200 });
const TABLE_KEY_LENGTH = 12;

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

/** SHA-256 (hex). Matn UTF-8 da kodlanadi (Postgres: convert_to(..., 'UTF8')) */
export function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text));
  const bitLen = bytes.length * 8;
  const total = Math.ceil((bytes.length + 9) / 64) * 64;
  const data = new Uint8Array(total);
  data.set(bytes);
  data[bytes.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(total - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(total - 4, bitLen >>> 0);

  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return Array.from(h, x => x.toString(16).padStart(8, '0')).join('');
}

export const isValidQrSecret = (secret) => typeof secret === 'string' && secret.length >= 16;

/** Stol kaliti (QR havolaga yoziladi). Sir yo'q bo'lsa - '' */
export const tableKey = (secret, table) =>
  isValidQrSecret(secret) ? sha256Hex(`${secret}|${String(table || '')}`).slice(0, TABLE_KEY_LENGTH) : '';

export function generateQrSecret() {
  const buf = new Uint8Array(24);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}

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
