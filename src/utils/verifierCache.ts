// Qurilmadagi PIN keshi: internetsiz kirish uchun (6-bosqich, 2-qadam).
//
// supabase/security.sql dan keyin xodimlar ro'yxatida (pos_users) PIN xeshi va Authenticator siri
// yo'q: ular serverda, PIN serverda tekshiriladi. Internet bo'lmasa ham kirish uchun shu qurilma
// faqat O'ZIDA serverda kirgan xodimlarning tekshiruv ma'lumotini saqlaydi (kalit faqat shu qurilmada,
// bulutga chiqmaydi). Sinxron dvigateli (src/sync/engine.js) bulutdan kelgan xodim yozuviga shu
// ma'lumotni qo'shib qo'yadi: checkPin, findUserByPin, verifySecondFactor avvalgidek ishlaydi.
//
// Eskirish: yozuvdagi pinSetAt / twoFactorAt (server qo'yadi) keshdagidan farq qilsa - PIN yoki
// ikki bosqichli kirish boshqa qurilmada o'zgargan, keshdagisi ishlatilmaydi. 30 kun shu qurilmada
// kirmagan xodimning keshi o'chadi.

import { isPinHash } from './pinHash';

// 'pos_' bilan boshlanmaydi: favqulodda nusxa fayliga (ErrorBoundary) xeshlar tushmasin
export const VERIFIER_CACHE_KEY = 'cafe_pin_cache';
/** Bir marta: yangilanishdan oldingi qurilmadagi xeshlar keshga ko'chirildi */
export const VERIFIER_SEEDED_KEY = 'cafe_pin_cache_seeded';
export const VERIFIER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface VerifierEntry {
  pinHash: string;
  pinLength: number;
  pinSetAt: number;
  /** Authenticator siri va zaxira kod xeshlari (yoqilmagan bo'lsa null) */
  twoFactor: unknown;
  twoFactorAt: number;
  /** Shu qurilmada oxirgi marta kirgan vaqt */
  usedAt: number;
}

export type VerifierCache = Record<string, VerifierEntry>;

export interface UserRecordLike {
  id?: unknown;
  pinHash?: unknown;
  pinLength?: unknown;
  pinSetAt?: unknown;
  twoFactor?: unknown;
  twoFactorAt?: unknown;
  [key: string]: unknown;
}

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

const idOf = (u: UserRecordLike | null | undefined): string =>
  u && u.id !== undefined && u.id !== null && u.id !== '' ? String(u.id) : '';

const numOf = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const pinSetAtOf = (u: UserRecordLike | null | undefined): number => numOf(u?.pinSetAt);
export const twoFactorAtOf = (u: UserRecordLike | null | undefined): number => numOf(u?.twoFactorAt);

function normalizeEntry(raw: unknown): VerifierEntry | null {
  if (!isObject(raw) || !isPinHash(raw.pinHash)) return null;
  const len = Number(raw.pinLength);
  return {
    pinHash: String(raw.pinHash),
    pinLength: Number.isInteger(len) && len >= 4 && len <= 8 ? len : 4,
    pinSetAt: numOf(raw.pinSetAt),
    twoFactor: isObject(raw.twoFactor) ? raw.twoFactor : null,
    twoFactorAt: numOf(raw.twoFactorAt),
    usedAt: numOf(raw.usedAt)
  };
}

export function readVerifierCache(): VerifierCache {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(VERIFIER_CACHE_KEY) || '{}');
    if (!isObject(parsed)) return {};
    const out: VerifierCache = {};
    Object.entries(parsed).forEach(([id, raw]) => {
      const entry = normalizeEntry(raw);
      if (entry) out[id] = entry;
    });
    return out;
  } catch {
    return {};
  }
}

export function writeVerifierCache(cache: VerifierCache): void {
  try {
    window.localStorage.setItem(VERIFIER_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // xotira to'lgan bo'lsa ham ish to'xtamasin (internetsiz kirish bo'lmaydi, xolos)
  }
}

/** Keshdagi ma'lumot shu yozuvga to'g'ri keladimi (PIN boshqa qurilmada o'zgarmagan, muddati o'tmagan) */
export function isEntryValid(entry: VerifierEntry | null | undefined, record: UserRecordLike | null | undefined, now: number = Date.now()): boolean {
  if (!entry || !record) return false;
  if (entry.pinSetAt !== pinSetAtOf(record)) return false;
  if (entry.twoFactorAt !== twoFactorAtOf(record)) return false;
  return now - entry.usedAt < VERIFIER_TTL_MS;
}

/** Bulutdan kelgan yozuv + keshdagi tekshiruv ma'lumoti (yozuvda xesh bo'lsa - o'zi) */
export function decorateUser<T extends UserRecordLike>(record: T, entry: VerifierEntry | null | undefined, now: number = Date.now()): T {
  if (!isObject(record) || isPinHash(record.pinHash) || !isEntryValid(entry, record, now) || !entry) return record;
  const next: T = { ...record, pinHash: entry.pinHash, pinLength: entry.pinLength };
  if (entry.twoFactor && !isObject(record.twoFactor)) (next as UserRecordLike).twoFactor = entry.twoFactor;
  return next;
}

/** Ro'yxatni bezash. O'zgarish bo'lmasa - o'sha ro'yxatning o'zi */
export function decorateUsers<T extends UserRecordLike>(list: T[], cache: VerifierCache, now: number = Date.now()): T[] {
  if (!Array.isArray(list)) return list;
  let changed = false;
  const next = list.map(u => {
    const id = idOf(u);
    if (!id || !cache[id]) return u;
    const d = decorateUser(u, cache[id], now);
    if (d !== u) changed = true;
    return d;
  });
  return changed ? next : list;
}

/** Server tekshirgan xodimning ma'lumoti (pos_pin_check -> verifier) */
export function rememberVerifier(cache: VerifierCache, userId: unknown, verifier: unknown, now: number = Date.now()): VerifierCache {
  const id = userId === undefined || userId === null ? '' : String(userId);
  const entry = normalizeEntry(isObject(verifier) ? { ...verifier, usedAt: now } : null);
  if (!id || !entry) return cache;
  return { ...cache, [id]: entry };
}

/** Xodim shu qurilmada (keshdagi PIN bilan) kirdi: muddat yangilanadi */
export function touchVerifier(cache: VerifierCache, userId: unknown, now: number = Date.now()): VerifierCache {
  const id = String(userId ?? '');
  if (!cache[id]) return cache;
  return { ...cache, [id]: { ...cache[id], usedAt: now } };
}

export function forgetVerifier(cache: VerifierCache, userId: unknown): VerifierCache {
  const id = String(userId ?? '');
  if (!cache[id]) return cache;
  const next = { ...cache };
  delete next[id];
  return next;
}

/** Zaxira kod ishlatildi (internetsiz): keshda ham qayta ishlamasin */
export function dropCachedBackupCode(cache: VerifierCache, userId: unknown, index: number): VerifierCache {
  const id = String(userId ?? '');
  const entry = cache[id];
  const tf = entry && isObject(entry.twoFactor) ? entry.twoFactor : null;
  if (!tf || !Array.isArray(tf.backupCodes) || index < 0 || index >= tf.backupCodes.length) return cache;
  const backupCodes = tf.backupCodes.filter((_, i) => i !== index);
  return { ...cache, [id]: { ...entry, twoFactor: { ...tf, backupCodes } } };
}

/**
 * Yangilanishdan oldin qurilmadagi xodim yozuvlarida xesh bor edi: ular keshga o'tadi (shu qurilmada
 * xodimlar internetsiz ham kira olishda davom etadi). Yozuvda xesh bo'lmasa - o'zgarishsiz.
 */
export function seedFromUsers(cache: VerifierCache, users: readonly UserRecordLike[] | null | undefined, now: number = Date.now()): VerifierCache {
  if (!Array.isArray(users)) return cache;
  let next = cache;
  users.forEach(u => {
    const id = idOf(u);
    if (!id || next[id] || !isPinHash(u.pinHash)) return;
    const entry = normalizeEntry({
      pinHash: u.pinHash,
      pinLength: u.pinLength,
      pinSetAt: u.pinSetAt,
      twoFactor: u.twoFactor,
      twoFactorAt: u.twoFactorAt,
      usedAt: now
    });
    if (entry) next = { ...next, [id]: entry };
  });
  return next;
}

/**
 * Qurilma o'zi yangi PIN bergan (yozuvda xesh va yangi pinSetAt) xodim keshda bo'lsa, kesh ham
 * yangilanadi: aks holda server javobidan keyin shu qurilmada internetsiz kira olmay qolardi.
 */
export function refreshFromOwnWrite(cache: VerifierCache, record: UserRecordLike | null | undefined, now: number = Date.now()): VerifierCache {
  const id = idOf(record);
  if (!id || !cache[id] || !record || !isPinHash(record.pinHash)) return cache;
  const entry = normalizeEntry({
    pinHash: record.pinHash,
    pinLength: record.pinLength,
    pinSetAt: record.pinSetAt,
    twoFactor: isObject(record.twoFactor) ? record.twoFactor : null,
    twoFactorAt: record.twoFactorAt,
    usedAt: cache[id].usedAt || now
  });
  return entry ? { ...cache, [id]: entry } : cache;
}

/** Muddati o'tgan va o'chirilgan xodimlarning keshi o'chadi */
export function pruneVerifiers(cache: VerifierCache, users: readonly UserRecordLike[] | null | undefined, now: number = Date.now()): VerifierCache {
  const ids = new Set((Array.isArray(users) ? users : []).map(idOf).filter(Boolean));
  let changed = false;
  const next: VerifierCache = {};
  Object.entries(cache).forEach(([id, entry]) => {
    if ((ids.size > 0 && !ids.has(id)) || now - entry.usedAt >= VERIFIER_TTL_MS) {
      changed = true;
      return;
    }
    next[id] = entry;
  });
  return changed ? next : cache;
}
