// Authenticator ilovasi kodlari (TOTP, RFC 6238): Google Authenticator, Microsoft Authenticator va b.
//
// Kutubxonasiz va sinxron: crypto.subtle http (192.168.x.x) da yo'q (sha256.ts dagi kabi).
// Ilovalar standart bo'yicha HMAC-SHA1, 6 raqam, 30 soniya ishlatadi - shu yerda ham shunday.
// Kod internetsiz ham ishlaydi: faqat qurilma soati to'g'ri bo'lishi kerak.

import { randomBytes } from './sha256';

export const TOTP_PERIOD_SEC = 30;
export const TOTP_DIGITS = 6;
/** Soat farqi uchun oldingi va keyingi kod ham qabul qilinadi (±30 soniya) */
export const TOTP_WINDOW = 1;
const SECRET_BYTES = 20;

const rotl = (x: number, n: number): number => ((x << n) | (x >>> (32 - n))) >>> 0;

/** SHA-1 (RFC 3174): faqat HMAC uchun (TOTP standarti), boshqa joyda ishlatmang */
export function sha1Bytes(bytes: Uint8Array): Uint8Array {
  const bitLen = bytes.length * 8;
  const total = Math.ceil((bytes.length + 9) / 64) * 64;
  const data = new Uint8Array(total);
  data.set(bytes);
  data[bytes.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(total - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(total - 4, bitLen >>> 0);

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const t = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => outView.setUint32(i * 4, h));
  return out;
}

/** HMAC-SHA1 (RFC 2104) */
export function hmacSha1(key: Uint8Array, message: Uint8Array): Uint8Array {
  const block = new Uint8Array(64);
  block.set(key.length > 64 ? sha1Bytes(key) : key);
  const inner = new Uint8Array(64 + message.length);
  const outer = new Uint8Array(64 + 20);
  for (let i = 0; i < 64; i++) {
    inner[i] = block[i] ^ 0x36;
    outer[i] = block[i] ^ 0x5c;
  }
  inner.set(message, 64);
  outer.set(sha1Bytes(inner), 64);
  return sha1Bytes(outer);
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 (RFC 4648), "=" siz: Authenticator ilovalari sirni shu ko'rinishda oladi */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= 0xff;
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Base32 matn -> baytlar. Bo'shliq, "-" va "=" e'tiborsiz; noto'g'ri belgi bo'lsa null */
export function base32Decode(text: unknown): Uint8Array | null {
  const clean = String(text ?? '').toUpperCase().replace(/[\s=-]/g, '');
  if (!clean) return null;
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) return null;
    value = ((value << 5) | idx) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Yangi sir: 20 bayt (160 bit), base32 da 32 belgi */
export const newTotpSecret = (): string => base32Encode(randomBytes(SECRET_BYTES));

/** Vaqt qadami: 30 soniyalik oraliq raqami */
export const totpStep = (timeMs: number): number => Math.floor(timeMs / 1000 / TOTP_PERIOD_SEC);

/** Berilgan qadam uchun kod (HOTP, RFC 4226) */
export function hotp(key: Uint8Array, counter: number, digits: number = TOTP_DIGITS): string {
  const msg = new Uint8Array(8);
  const view = new DataView(msg.buffer);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter >>> 0);
  const mac = hmacSha1(key, msg);
  const off = mac[19] & 0x0f;
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** Hozirgi (yoki berilgan vaqtdagi) kod. Sir noto'g'ri bo'lsa '' */
export function totpCode(secret: unknown, timeMs: number = Date.now(), digits: number = TOTP_DIGITS): string {
  const key = base32Decode(secret);
  if (!key || key.length === 0) return '';
  return hotp(key, totpStep(timeMs), digits);
}

/** Bir xil uzunlikdagi satrlarni vaqti teng solishtirish */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Kodni tekshirish. Mos kelgan qadam raqamini qaytaradi (qayta ishlatishdan himoya uchun),
 * mos kelmasa null.
 */
export function verifyTotp(
  secret: unknown,
  code: unknown,
  timeMs: number = Date.now(),
  window: number = TOTP_WINDOW
): number | null {
  const entered = String(code ?? '').replace(/\D/g, '');
  const key = base32Decode(secret);
  if (!key || key.length === 0 || entered.length !== TOTP_DIGITS) return null;
  const now = totpStep(timeMs);
  let matched: number | null = null;
  // Barcha oynani tekshiramiz (vaqt bo'yicha farq bilinmasin)
  for (let d = -window; d <= window; d++) {
    if (safeEqual(hotp(key, now + d), entered) && matched === null) matched = now + d;
  }
  return matched;
}

/** Authenticator ilovasi skaner qiladigan havola (QR kod ichida) */
export function totpUri(secret: string, accountName: string, issuer: string): string {
  const cleanIssuer = String(issuer || 'Kafe POS').replace(/:/g, ' ').trim() || 'Kafe POS';
  const cleanAccount = String(accountName || 'Admin').replace(/:/g, ' ').trim() || 'Admin';
  const label = `${encodeURIComponent(cleanIssuer)}:${encodeURIComponent(cleanAccount)}`;
  const params = `secret=${secret}&issuer=${encodeURIComponent(cleanIssuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SEC}`;
  return `otpauth://totp/${label}?${params}`;
}

/** Sirni qo'lda yozish uchun 4 tadan guruhlash: "ABCD EFGH ..." */
export const formatSecret = (secret: string): string =>
  String(secret || '').replace(/(.{4})/g, '$1 ').trim();
