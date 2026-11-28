// Xodim PIN'ini tekshirish: qurilmada (internetsiz ham) va serverda (supabase/security.sql).
//
// Tartib (kirish oynasi, rahbar tasdig'i, avto-qulf, ofitsiant ekranidagi admin PIN):
//  1. Avval shu qurilmada: xodim yozuvida xesh (yoki shu qurilmada avval serverda kirgan xodimning
//     keshi, src/utils/verifierCache.ts) - darhol, internet kerak emas.
//  2. Topilmasa va server xavfsizligi o'rnatilgan bo'lsa - serverda (pos_pin_check). To'g'ri bo'lsa
//     xodimning tekshiruv ma'lumoti shu qurilmaga keshlanadi (keyingi safar internetsiz ham kiradi).
//  3. Kirish (mode 'login'): server shu qurilmaga xodimning rolini yozadi - u ruxsat bergan ma'lumotni
//     (mijozlar, xarajatlar, hisobotlar) faqat shu paytda yuboradi. Qurilmada kirgan bo'lsa ham orqa
//     fonda serverga bildiriladi (ensureServerLogin); internet yo'q bo'lsa - internet qaytganda.

import {
  applyDeviceState, callRpc, isServerSecurityActive, refreshUserVerifiers, syncNow
} from './engine';
import { cleanPin, findUserByPin, type PinFields } from '../utils/pinHash';
import { hasLocalTwoFactor, hasTwoFactor } from '../utils/twoFactor';
import {
  forgetVerifier, readVerifierCache, rememberVerifier, touchVerifier, writeVerifierCache
} from '../utils/verifierCache';

export type PinMode = 'login' | 'verify' | 'approve';
export type PinGroup = 'management' | 'staff' | null;
export type CodeKind = 'totp' | 'backup';

export interface ServerPinResult {
  ok: boolean;
  reason?: string;
  user_id?: string;
  name?: string;
  role?: string;
  verifier?: unknown;
  device?: unknown;
  attempts_left?: number;
  wait_s?: number;
  message?: string;
}

export interface UserLike {
  id?: unknown;
  [key: string]: unknown;
}

type PinUser = PinFields & UserLike;

export type CodeOutcome =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'reused' | 'locked' | 'offline'; message: string; waitS?: number };

export type StaffPinOutcome<U> =
  | {
    ok: true;
    user: U;
    /** 'local' - qurilmada tekshirildi (serverga hali bildirilmagan), 'server' - serverda */
    source: 'local' | 'server';
    /** Ikkinchi bosqich kodi kerak */
    needCode: boolean;
    /** Kod serverda tekshiriladi (shu qurilmada sir yo'q). Berilmasa - qurilmada */
    checkCode?: (code: string, kind: CodeKind) => Promise<CodeOutcome>;
  }
  | {
    ok: false;
    reason: 'wrong' | 'locked' | 'offline' | 'not_allowed' | 'device' | 'error';
    message: string;
    attemptsLeft?: number;
    waitS?: number;
  };

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object';
const idOf = (u: UserLike | null | undefined): string =>
  u && u.id !== undefined && u.id !== null && u.id !== '' ? String(u.id) : '';
const isOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false;

/** Server PIN tekshiruvi hozir ishlatilishi mumkinmi */
export const serverAuthAvailable = (): boolean => isServerSecurityActive() && isOnline();

function saveVerifier(userId: unknown, verifier: unknown): void {
  const cache = readVerifierCache();
  const next = rememberVerifier(cache, userId, verifier);
  if (next !== cache) {
    writeVerifierCache(next);
    refreshUserVerifiers();
  }
}

/** Server so'rovi (pos_pin_check). Tarmoq xatosi - { ok: false, reason: 'offline' } */
export async function serverPinCheck(opts: {
  pin: string;
  code?: string | null;
  mode: PinMode;
  group?: PinGroup;
  codeKind?: CodeKind;
  label?: string | null;
}): Promise<ServerPinResult> {
  let res: unknown;
  try {
    res = await callRpc('pos_pin_check', {
      p_pin: cleanPin(opts.pin),
      p_code: opts.code ? String(opts.code) : null,
      p_mode: opts.mode,
      p_group: opts.group ?? null,
      p_code_kind: opts.codeKind ?? 'totp',
      p_label: opts.label ?? null
    });
  } catch (e) {
    return { ok: false, reason: 'offline', message: String((e as Error)?.message || e) };
  }
  if (!isObject(res)) return { ok: false, reason: 'error' };
  const out = res as unknown as ServerPinResult;
  if (out.device) applyDeviceState(out.device);
  if (out.ok && out.user_id !== undefined && out.verifier) saveVerifier(out.user_id, out.verifier);
  return out;
}

const waitText = (s: number | undefined): string => `${Math.max(1, Math.ceil(Number(s) || 0))} soniya`;

function failure(res: ServerPinResult): StaffPinOutcome<never> {
  switch (res.reason) {
    case 'locked':
      return { ok: false, reason: 'locked', waitS: res.wait_s, message: `⛔️ Juda ko'p xato urinish! ${waitText(res.wait_s)} kuting.` };
    case 'offline':
      return { ok: false, reason: 'offline', message: "📴 Server bilan aloqa yo'q. Bu xodim shu qurilmada avval kirmagan: internet kerak." };
    case 'device':
    case 'revoked':
    case 'no_device':
      return { ok: false, reason: 'device', message: '⛔️ Qurilma tasdiqlanmagan.' };
    case 'wrong':
    case 'bad_code':
      return {
        ok: false,
        reason: 'wrong',
        attemptsLeft: res.attempts_left,
        waitS: res.wait_s,
        message: Number(res.wait_s) > 0
          ? `⛔️ Juda ko'p xato urinish! ${waitText(res.wait_s)} kuting.`
          : `❌ PIN-kod noto'g'ri!${res.attempts_left !== undefined ? ` Yana ${res.attempts_left} ta urinish qoldi.` : ''}`
      };
    default:
      return { ok: false, reason: 'error', message: '❌ Tekshirib bo\'lmadi. Qayta urinib ko\'ring.' };
  }
}

function codeFailure(res: ServerPinResult): CodeOutcome {
  if (res.reason === 'reused') {
    return { ok: false, reason: 'reused', message: '⏳ Bu kod hozirgina ishlatilgan. Ilovada yangi kod chiqishini kuting.' };
  }
  if (res.reason === 'locked' || Number(res.wait_s) > 0) {
    return { ok: false, reason: 'locked', waitS: res.wait_s, message: `⛔️ Juda ko'p xato! ${waitText(res.wait_s)} kuting.` };
  }
  if (res.reason === 'offline') {
    return { ok: false, reason: 'offline', message: "📴 Server bilan aloqa yo'q: kodni tekshirib bo'lmadi." };
  }
  return {
    ok: false,
    reason: 'invalid',
    message: `❌ Kod noto'g'ri.${res.attempts_left !== undefined ? ` Yana ${res.attempts_left} ta urinish qoldi.` : ''}`
  };
}

/**
 * PIN'ni tekshirish. users - qurilmadagi xodimlar (bulut yozuvi + kesh), filter - kim bo'lishi mumkin
 * (masalan, faqat tasdiqlay oladigan adminlar), group - kirish oynasidagi guruh.
 */
export async function verifyStaffPin<U extends UserLike>(opts: {
  users: readonly U[] | null | undefined;
  pin: string;
  filter?: (u: U) => boolean;
  mode: 'login' | 'verify';
  group?: PinGroup;
}): Promise<StaffPinOutcome<U>> {
  const list = Array.isArray(opts.users) ? opts.users : [];
  const pin = cleanPin(opts.pin);
  const local = findUserByPin(list as unknown as PinUser[], pin, opts.filter as ((u: PinUser) => boolean) | undefined) as U | undefined;
  if (local) {
    const needCode = hasTwoFactor(local as never);
    const localCode = hasLocalTwoFactor(local as never);
    return {
      ok: true,
      user: local,
      source: 'local',
      needCode,
      checkCode: needCode && !localCode && serverAuthAvailable()
        ? makeServerCodeCheck(pin, opts.mode, opts.group ?? null)
        : undefined
    };
  }
  if (!serverAuthAvailable()) {
    return { ok: false, reason: 'wrong', message: "❌ PIN-kod noto'g'ri!" };
  }

  const res = await serverPinCheck({ pin, mode: opts.mode, group: opts.group ?? null });
  const findUser = (id: unknown): U | undefined => {
    const want = String(id ?? '');
    // Kesh yangilangach yozuv qayta bezalgan bo'lishi mumkin: localStorage dan ham qaraymiz
    return list.find(u => idOf(u) === want) || readUsersFromStorage<U>().find(u => idOf(u) === want);
  };
  if (res.ok || res.reason === 'need_code') {
    const user = findUser(res.user_id);
    if (!user || (opts.filter && !opts.filter(user))) {
      return { ok: false, reason: 'not_allowed', message: '⛔️ Bu xodim bu amalni tasdiqlay olmaydi.' };
    }
    if (res.ok) return { ok: true, user, source: 'server', needCode: false };
    return { ok: true, user, source: 'server', needCode: true, checkCode: makeServerCodeCheck(pin, opts.mode, opts.group ?? null) };
  }
  return failure(res);
}

function readUsersFromStorage<U>(): U[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem('pos_users') || '[]');
    return Array.isArray(parsed) ? (parsed as U[]) : [];
  } catch {
    return [];
  }
}

function makeServerCodeCheck(pin: string, mode: 'login' | 'verify', group: PinGroup) {
  return async (code: string, kind: CodeKind): Promise<CodeOutcome> => {
    const res = await serverPinCheck({ pin, code, codeKind: kind, mode, group });
    if (res.ok) return { ok: true };
    return codeFailure(res);
  };
}

// ---------- serverdagi xodim sessiyasi ----------
interface PendingLogin {
  userId: string;
  pin: string;
  group: PinGroup;
  code?: string | null;
  codeKind?: CodeKind;
}

let pendingLogin: PendingLogin | null = null;
let onlineHooked = false;

export type ServerLoginResult = 'ok' | 'skipped' | 'offline' | 'wrong' | 'code' | 'locked' | 'error';

/**
 * Qurilmada kirgan xodimni serverga bildirish (orqa fonda). 'wrong' - serverda PIN boshqa
 * (boshqa qurilmada o'zgartirilgan): xodim chiqarilishi kerak, keshi o'chiriladi.
 */
export async function ensureServerLogin(args: PendingLogin): Promise<ServerLoginResult> {
  if (!isServerSecurityActive()) return 'skipped';
  hookOnline();
  if (!isOnline()) {
    pendingLogin = args;
    return 'offline';
  }
  const res = await serverPinCheck({ pin: args.pin, code: args.code, codeKind: args.codeKind, mode: 'login', group: args.group });
  if (res.ok && String(res.user_id) === args.userId) {
    pendingLogin = null;
    const cache = readVerifierCache();
    const next = touchVerifier(cache, args.userId);
    if (next !== cache) writeVerifierCache(next);
    return 'ok';
  }
  if (res.reason === 'offline') {
    pendingLogin = args;
    return 'offline';
  }
  pendingLogin = null;
  if (res.ok || res.reason === 'wrong') {
    // Serverda bu PIN boshqa xodimniki yoki noto'g'ri: shu qurilmadagi eski kesh ishlatilmasin
    const cache = readVerifierCache();
    const next = forgetVerifier(cache, args.userId);
    if (next !== cache) {
      writeVerifierCache(next);
      refreshUserVerifiers();
    }
    if (res.ok) await serverLogout();
    return 'wrong';
  }
  if (res.reason === 'need_code' || res.reason === 'bad_code' || res.reason === 'reused') return 'code';
  if (res.reason === 'locked') return 'locked';
  return 'error';
}

let loginListener: ((result: ServerLoginResult, args: PendingLogin) => void) | null = null;

/** Internet qaytgach bildirilgan kirish natijasi (App 'wrong' bo'lsa xodimni chiqaradi) */
export function onDeferredServerLogin(fn: ((result: ServerLoginResult, args: PendingLogin) => void) | null): void {
  loginListener = fn;
}

function hookOnline(): void {
  if (onlineHooked || typeof window === 'undefined') return;
  onlineHooked = true;
  window.addEventListener('online', () => {
    setTimeout(() => {
      const args = pendingLogin;
      if (!args) return;
      ensureServerLogin(args).then(result => {
        if (loginListener) loginListener(result, args);
      }).catch(() => {});
    }, 2500);
  });
}

/** Xodim chiqdi: server qurilmani umumiy ruxsatga qaytaradi (maxfiy ma'lumot qurilmadan o'chadi) */
export async function serverLogout(): Promise<void> {
  pendingLogin = null;
  if (!isServerSecurityActive()) return;
  try {
    const res = await callRpc('pos_staff_logout', {});
    if (isObject(res) && res.device) applyDeviceState(res.device);
  } catch {
    // internet yo'q: server sessiyasi 12 soatda o'zi tugaydi, keyingi kirish uni almashtiradi
  }
}

// ---------- qurilma tasdig'i va ro'yxati ----------
/** Tasdiqlanmagan qurilmani Ega yoki admin PIN'i bilan tasdiqlash (shu qurilmaning o'zida) */
export async function approveThisDevice(opts: {
  pin: string;
  code?: string | null;
  codeKind?: CodeKind;
  label?: string;
}): Promise<ServerPinResult> {
  const res = await serverPinCheck({ pin: opts.pin, code: opts.code, codeKind: opts.codeKind, mode: 'approve', label: opts.label || null });
  if (res.ok) syncNow();
  return res;
}

export interface DeviceInfo {
  session: string;
  label: string;
  status: 'pending' | 'trusted' | 'revoked' | string;
  device_key: string | null;
  user_agent: string | null;
  created_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  last_seen_at: string | null;
  staff: string | null;
  locked: boolean;
  current: boolean;
}

export async function listDevices(): Promise<{ ok: true; devices: DeviceInfo[] } | { ok: false; reason: string }> {
  try {
    const res = await callRpc('pos_device_list', {});
    if (isObject(res) && res.ok === true && Array.isArray(res.devices)) return { ok: true, devices: res.devices as DeviceInfo[] };
    return { ok: false, reason: String((isObject(res) && res.reason) || 'error') };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

export async function updateDevice(session: string, action: 'approve' | 'revoke' | 'rename' | 'forget', label?: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await callRpc('pos_device_update', { p_session: session, p_action: action, p_label: label ?? null });
    return isObject(res) ? { ok: res.ok === true, reason: res.reason ? String(res.reason) : undefined } : { ok: false, reason: 'error' };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

/** Yangi PIN bo'shmi (serverdagi barcha xodimlar orasida). null - tekshirib bo'lmadi */
export async function isPinFreeOnServer(pin: string, userId: unknown): Promise<{ available: boolean } | { error: string; waitS?: number } | null> {
  if (!serverAuthAvailable()) return null;
  try {
    const res = await callRpc('pos_pin_available', { p_pin: cleanPin(pin), p_user_id: userId === undefined || userId === null ? null : String(userId) });
    if (!isObject(res)) return null;
    if (res.ok === true) return { available: res.available === true };
    if (res.reason === 'locked') return { error: 'locked', waitS: Number(res.wait_s) || 0 };
    return null;
  } catch {
    return null;
  }
}
