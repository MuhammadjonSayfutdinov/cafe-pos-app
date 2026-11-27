// Ikki bosqichli kirish (6-bosqich, 2-qadam): PIN + Authenticator ilovasidagi 6 xonali kod.
//
// Saqlanadi: user.twoFactor = { type: 'totp', secret, enabledAt, backupCodes: ["b1$<tuz>$<xesh>", ...] }.
// Zaxira kodlar (10 ta, har biri 10 raqam, bir martalik) faqat xeshi bilan saqlanadi: ochiq ko'rinishi
// faqat yoqish paytida bir marta ko'rsatiladi.
//
// Tekshiruv hozircha qurilmada (internetsiz ham kirish kerak, PIN kabi). Cheklov: sir xodimlar
// ro'yxati bilan qurilmada va bulutda turadi, bazani o'qiy oladigan odam uni ko'chirib olishi mumkin.
// Himoya qiladi: admin PIN'ini bilib olgan xodim telefon (kod) siz kira olmaydi. Keyingi qadam -
// PIN va kodni serverda tekshirish (PROGRESS.md, 6-bosqich, 2-qadam). Zaxira faylga sir yozilmaydi.

import { sha256Hex, toHex, randomBytes } from './sha256';
import { base32Decode, newTotpSecret, verifyTotp } from './totp';

export const BACKUP_CODE_COUNT = 10;
export const BACKUP_CODE_DIGITS = 10;
const BACKUP_SCHEME = 'b1';
const LAST_STEP_KEY = 'pos_2fa_last_step';

export interface TwoFactorRecord {
  type: 'totp';
  secret: string;
  enabledAt: number;
  backupCodes: string[];
}

export interface TwoFactorFields {
  id?: unknown;
  twoFactor?: unknown;
}

export type SecondFactorMode = 'totp' | 'backup';

export type SecondFactorResult =
  | { ok: true; kind: 'totp' }
  | { ok: true; kind: 'backup'; index: number }
  | { ok: false; reason: 'invalid' | 'reused' | 'not-enabled' };

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object';

/** Xodimdagi to'g'ri yozuv (bo'lmasa yoki buzilgan bo'lsa null) */
export function readTwoFactor(user: TwoFactorFields | null | undefined): TwoFactorRecord | null {
  const tf = user?.twoFactor;
  if (!isObject(tf) || tf.type !== 'totp' || typeof tf.secret !== 'string') return null;
  const key = base32Decode(tf.secret);
  if (!key || key.length < 10) return null;
  return {
    type: 'totp',
    secret: tf.secret,
    enabledAt: Number(tf.enabledAt) || 0,
    backupCodes: Array.isArray(tf.backupCodes) ? tf.backupCodes.filter((c): c is string => typeof c === 'string') : []
  };
}

/** Xodimga ikki bosqichli kirish yoqilganmi */
export const hasTwoFactor = (user: TwoFactorFields | null | undefined): boolean => readTwoFactor(user) !== null;

/** Ishlatilmagan zaxira kodlar soni */
export const backupCodesLeft = (user: TwoFactorFields | null | undefined): number =>
  readTwoFactor(user)?.backupCodes.length ?? 0;

/** Yangi sir (Authenticator ilovasiga QR orqali beriladi) */
export const createTwoFactorSecret = (): string => newTotpSecret();

/** Faqat raqamlar */
export const cleanCode = (code: unknown): string => String(code ?? '').replace(/\D/g, '');

/** Zaxira kodlar: 10 ta, har biri 10 raqam (planshetning raqamli klaviaturasida terish oson) */
export function generateBackupCodes(count: number = BACKUP_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    let code = '';
    while (code.length < BACKUP_CODE_DIGITS) {
      for (const byte of randomBytes(16)) {
        // 250 dan katta bayt tashlanadi: har bir raqam teng ehtimolli bo'lsin
        if (byte < 250 && code.length < BACKUP_CODE_DIGITS) code += String(byte % 10);
      }
    }
    codes.add(code);
  }
  return [...codes];
}

/** "1234567890" -> "12345-67890" */
export const formatBackupCode = (code: string): string => {
  const c = cleanCode(code);
  return c.length === BACKUP_CODE_DIGITS ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
};

function hashBackupCode(code: string): string {
  const salt = toHex(randomBytes(8));
  return `${BACKUP_SCHEME}$${salt}$${sha256Hex(`${salt}|${cleanCode(code)}`)}`;
}

/** Zaxira kod qaysi o'rinda (topilmasa -1) */
export function findBackupCode(user: TwoFactorFields | null | undefined, code: unknown): number {
  const record = readTwoFactor(user);
  const entered = cleanCode(code);
  if (!record || entered.length !== BACKUP_CODE_DIGITS) return -1;
  let found = -1;
  record.backupCodes.forEach((stored, index) => {
    const [scheme, salt, hash] = stored.split('$');
    if (scheme !== BACKUP_SCHEME || !salt || !hash) return;
    if (found < 0 && sha256Hex(`${salt}|${entered}`) === hash) found = index;
  });
  return found;
}

type WithoutTwoFactor<T> = Omit<T, 'twoFactor'>;

/** Ikki bosqichli kirishsiz nusxa (o'chirish va zaxira faylga eksport uchun) */
export function stripTwoFactor<T extends TwoFactorFields>(user: T): WithoutTwoFactor<T> {
  const { twoFactor: _twoFactor, ...rest } = user;
  return rest;
}

/** Yoqilgan nusxa. backupCodes - ochiq kodlar (saqlashda xeshlanadi) */
export function withTwoFactor<T extends TwoFactorFields>(
  user: T,
  secret: string,
  backupCodes: readonly string[]
): WithoutTwoFactor<T> & { twoFactor: TwoFactorRecord } {
  return {
    ...stripTwoFactor(user),
    twoFactor: {
      type: 'totp',
      secret,
      enabledAt: Date.now(),
      backupCodes: backupCodes.map(hashBackupCode)
    }
  };
}

/** Ishlatilgan zaxira kod o'chirilgan nusxa */
export function withoutBackupCode<T extends TwoFactorFields>(user: T, index: number): T {
  const record = readTwoFactor(user);
  if (!record || index < 0 || index >= record.backupCodes.length) return user;
  return {
    ...user,
    twoFactor: { ...record, backupCodes: record.backupCodes.filter((_, i) => i !== index) }
  };
}

/** Zaxiradan tiklashda: fayldagi xodim + qurilmadagi hozirgi ikki bosqichli kirish (fayldagisi hech qachon olinmaydi) */
export function keepTwoFactorFrom<T extends TwoFactorFields>(
  user: T,
  source: TwoFactorFields | null | undefined
): WithoutTwoFactor<T> & TwoFactorFields {
  const base: WithoutTwoFactor<T> & TwoFactorFields = stripTwoFactor(user);
  return source && hasTwoFactor(source) ? { ...base, twoFactor: source.twoFactor } : base;
}

// Bir marta ishlatilgan kod shu qurilmada qayta qabul qilinmaydi (yonidan ko'rib olgan odam
// o'sha 30-90 soniya ichida kira olmasin). Faqat shu qurilmada saqlanadi.
function readLastSteps(): Record<string, number> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LAST_STEP_KEY) || '{}');
    return isObject(parsed) ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeLastStep(userKey: string, step: number): void {
  try {
    const all = readLastSteps();
    all[userKey] = step;
    window.localStorage.setItem(LAST_STEP_KEY, JSON.stringify(all));
  } catch {
    // xotira to'lgan bo'lsa ham kirish to'xtamasin
  }
}

/**
 * Ikkinchi bosqich kodini tekshirish.
 * mode 'totp' - ilovadagi 6 xonali kod; 'backup' - 10 raqamli zaxira kod (keyin withoutBackupCode bilan o'chiring).
 */
export function verifySecondFactor(
  user: TwoFactorFields | null | undefined,
  code: unknown,
  mode: SecondFactorMode,
  timeMs: number = Date.now()
): SecondFactorResult {
  const record = readTwoFactor(user);
  if (!record) return { ok: false, reason: 'not-enabled' };

  if (mode === 'backup') {
    const index = findBackupCode(user, code);
    return index >= 0 ? { ok: true, kind: 'backup', index } : { ok: false, reason: 'invalid' };
  }

  const step = verifyTotp(record.secret, code, timeMs);
  if (step === null) return { ok: false, reason: 'invalid' };
  const userKey = String(user?.id ?? '');
  const last = Number(readLastSteps()[userKey]);
  if (Number.isFinite(last) && step <= last) return { ok: false, reason: 'reused' };
  writeLastStep(userKey, step);
  return { ok: true, kind: 'totp' };
}
