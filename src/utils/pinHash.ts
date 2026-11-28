// Xodim PIN kodlari: ochiq matn o'rniga tuzli (salt) va ko'p marta takrorlangan SHA-256 xeshi.
//
// Saqlanadi: user.pinHash = "s1$<takror>$<tuz hex>$<xesh hex>", user.pinLength = 4 | 6.
// Eski ma'lumotda user.pin (yoki undan ham eski user.password) ochiq matnda turadi: ular ham
// tekshiriladi, App.jsx ishga tushganda migrateUserPins() bilan xeshga o'tkaziladi.
//
// supabase/security.sql dan keyin: xesh bulutdagi xodim yozuvida YO'Q (serverda, pos_staff_secrets),
// PIN serverda tekshiriladi (src/sync/staffAuth.ts). Yozuvda faqat belgilar: pinOn, pinLength,
// pinSetAt (PIN qachon o'rnatilgani: server yangisini shu bo'yicha ajratadi). Internetsiz kirish
// uchun qurilma o'zida kirgan xodimlarning xeshini saqlaydi (src/utils/verifierCache.ts) va sinxron
// dvigateli uni yozuvga qo'shib qo'yadi: shu fayldagi funksiyalar avvalgidek ishlaydi.
// Cheklov: 4-6 xonali PIN'da variant oz (10 000 / 1 000 000): qurilmadagi xeshni terib topish mumkin,
// shuning uchun yangi PIN - 6 xonali va server urinishlarni cheklaydi.

import { sha256Bytes, utf8, toHex, randomBytes } from './sha256';

const SCHEME = 's1';
/** Takrorlar soni: zaif telefonda ham bir tekshiruv bir necha millisekund */
export const PIN_HASH_ITERATIONS = 2000;
const SALT_BYTES = 16;
const MIN_ITERATIONS = 1;
const MAX_ITERATIONS = 200000;

export interface PinFields {
  pin?: unknown;
  password?: unknown;
  pinHash?: unknown;
  pinLength?: unknown;
  /** Server belgisi: xodimda PIN bor (xeshning o'zi serverda) */
  pinOn?: unknown;
  /** PIN o'rnatilgan vaqt (ms): yangi PIN eskisidan katta bo'ladi */
  pinSetAt?: unknown;
  /** Server belgisi: PIN namuna (777777, 1111...) */
  pinSample?: unknown;
}

interface ParsedHash {
  iterations: number;
  salt: string;
  hash: string;
}

const HEX = /^[0-9a-f]+$/;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function parseHash(value: unknown): ParsedHash | null {
  if (typeof value !== 'string') return null;
  const parts = value.split('$');
  if (parts.length !== 4 || parts[0] !== SCHEME) return null;
  const iterations = Number(parts[1]);
  const [, , salt, hash] = parts;
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) return null;
  if (!HEX.test(salt) || salt.length % 2 !== 0 || salt.length > 64 || !HEX.test(hash) || hash.length !== 64) return null;
  return { iterations, salt, hash };
}

// Bir xil (tuz, PIN) qayta hisoblanmasin: kirish oynasi har bir xodimni tekshiradi
const cache = new Map<string, string>();
const CACHE_LIMIT = 512;

function digest(pin: string, salt: string, iterations: number): string {
  const cacheKey = `${iterations}$${salt}$${pin}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  // Har takrorda 32 bayt xesh + 16 bayt tuz = 48 bayt: SHA-256 ning bitta bloki (tez)
  const saltBytes = hexToBytes(salt);
  const buf = new Uint8Array(32 + saltBytes.length);
  buf.set(saltBytes, 32);
  let d = sha256Bytes(utf8(`${salt}|${pin}`));
  for (let i = 1; i < iterations; i++) {
    buf.set(d, 0);
    d = sha256Bytes(buf);
  }
  const hex = toHex(d);

  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(cacheKey, hex);
  return hex;
}

/** Bir xil uzunlikdagi satrlarni vaqti teng solishtirish */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const cleanPin = (pin: unknown): string => String(pin ?? '').trim();

/** Eski formatdagi ochiq PIN (bo'lmasa '') */
const plainPin = (user: PinFields | null | undefined): string =>
  cleanPin(user?.pin ?? '') || cleanPin(user?.password ?? '');

/** Yangi PIN xeshi */
export function hashPin(pin: unknown, iterations: number = PIN_HASH_ITERATIONS): string {
  const salt = toHex(randomBytes(SALT_BYTES));
  return `${SCHEME}$${iterations}$${salt}$${digest(cleanPin(pin), salt, iterations)}`;
}

export const isPinHash = (value: unknown): boolean => parseHash(value) !== null;

/** Xodimda PIN bormi (xesh, server belgisi yoki eski ochiq matn) */
export const hasPin = (user: PinFields | null | undefined): boolean =>
  Boolean(user) && (isPinHash(user?.pinHash) || user?.pinOn === true || plainPin(user).length > 0);

/** Xodimning PIN'i shu qurilmada tekshirilishi mumkinmi (xesh yozuvda yoki keshdan qo'shilgan) */
export const hasLocalPin = (user: PinFields | null | undefined): boolean =>
  Boolean(user) && (isPinHash(user?.pinHash) || plainPin(user).length > 0);

/** Xodim kiritgan PIN to'g'rimi */
export function checkPin(user: PinFields | null | undefined, pin: unknown): boolean {
  const entered = cleanPin(pin);
  if (!user || !entered) return false;
  const parsed = parseHash(user.pinHash);
  if (parsed) return safeEqual(digest(entered, parsed.salt, parsed.iterations), parsed.hash);
  const legacy = plainPin(user);
  return legacy.length > 0 && safeEqual(legacy, entered);
}

/** PIN uzunligi (raqamlar soni). Noma'lum bo'lsa - fallback */
export function pinLengthOf(user: PinFields | null | undefined, fallback = 4): number {
  const stored = Number(user?.pinLength);
  if (Number.isInteger(stored) && stored >= 4 && stored <= 8) return stored;
  const legacy = plainPin(user);
  return legacy.length > 0 ? legacy.length : fallback;
}

type WithoutPinFields<T> = Omit<T, 'pin' | 'password' | 'pinHash' | 'pinLength' | 'pinOn' | 'pinSetAt' | 'pinSample'>;

/** PIN bilan bog'liq barcha maydonlarsiz nusxa (zaxira faylga eksport uchun) */
export function stripPin<T extends PinFields>(user: T): WithoutPinFields<T> {
  const {
    pin: _pin, password: _password, pinHash: _pinHash, pinLength: _pinLength,
    pinOn: _pinOn, pinSetAt: _pinSetAt, pinSample: _pinSample, ...rest
  } = user;
  return rest;
}

/** Yangi PIN vaqti: eskisidan doim katta (qurilma soati orqada bo'lsa ham server yangi deb qabul qiladi) */
export function nextPinSetAt(user: PinFields | null | undefined, now: number = Date.now()): number {
  const prev = Number(user?.pinSetAt);
  return Math.max(now, Number.isFinite(prev) && prev > 0 ? prev + 1 : 0);
}

/** Yangi PIN o'rnatilgan nusxa: ochiq matn saqlanmaydi */
export function withPin<T extends PinFields>(
  user: T,
  pin: unknown
): WithoutPinFields<T> & { pinHash: string; pinLength: number; pinSetAt: number } {
  const clean = cleanPin(pin);
  return { ...stripPin(user), pinHash: hashPin(clean), pinLength: clean.length, pinSetAt: nextPinSetAt(user) };
}

/** Boshqa yozuvdagi PIN'ni ko'chirish (zaxiradan tiklashda: fayldagi xodim + hozirgi PIN) */
export function copyPinFrom<T extends PinFields>(user: T, source: PinFields | null | undefined): WithoutPinFields<T> & PinFields {
  const base: WithoutPinFields<T> & PinFields = stripPin(user);
  if (!source) return base;
  // PIN vaqti ham ko'chadi: server buni yangi PIN deb qabul qilmaydi (tiklash PIN'ni o'zgartirmaydi)
  const meta: PinFields = source.pinSetAt !== undefined ? { pinSetAt: source.pinSetAt } : {};
  if (isPinHash(source.pinHash)) return { ...base, ...meta, pinHash: source.pinHash, pinLength: pinLengthOf(source) };
  if (source.pinOn === true) return { ...base, ...meta, pinOn: true, pinLength: source.pinLength };
  const legacy = plainPin(source);
  return legacy ? { ...base, pinHash: hashPin(legacy), pinLength: legacy.length } : base;
}

/** Ochiq PIN'li xodimlarni xeshga o'tkazish. O'zgarish bo'lmasa - o'sha ro'yxatning o'zi */
export function migrateUserPins<T extends PinFields>(users: T[]): T[] {
  if (!Array.isArray(users)) return users;
  let changed = false;
  const next = users.map(u => {
    if (!u || typeof u !== 'object') return u;
    const hasLegacyFields = u.pin !== undefined || u.password !== undefined;
    if (!hasLegacyFields) return u;
    changed = true;
    if (isPinHash(u.pinHash)) return stripPin(u) as unknown as T; // xesh bor, ochiq nusxa ortiqcha
    const legacy = plainPin(u);
    return (legacy ? withPin(u, legacy) : stripPin(u)) as unknown as T;
  });
  return changed ? next : users;
}

/** PIN bo'yicha xodimni topish (kirish oynasi). filter - qaysi xodimlar orasidan */
export function findUserByPin<T extends PinFields>(
  users: readonly T[] | null | undefined,
  pin: unknown,
  filter?: (user: T) => boolean
): T | undefined {
  const entered = cleanPin(pin);
  if (!entered || !Array.isArray(users)) return undefined;
  return users.find(u => Boolean(u) && (!filter || filter(u)) && checkPin(u, entered));
}

/** Bu PIN boshqa xodimda bormi (PIN takrorlanmasligi kerak: kirish faqat PIN bilan) */
export function findPinOwner<T extends PinFields & { id?: unknown }>(
  users: readonly T[] | null | undefined,
  pin: unknown,
  exceptId?: unknown
): T | undefined {
  return findUserByPin(users, pin, u => exceptId === undefined || exceptId === null || String(u.id) !== String(exceptId));
}
