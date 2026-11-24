// PIN terishdagi xato urinishlarni cheklash (B6).
// Holat localStorage'da saqlanadi: sahifani yangilash bilan cheklov yo'qolmaydi.

const STORAGE_KEY = 'pos_pin_guard';
const MAX_ATTEMPTS = 5;
const BASE_LOCK_MS = 30 * 1000;
const MAX_LOCK_MS = 5 * 60 * 1000;

interface GuardEntry {
  fails: number;
  lockLevel: number;
  lockedUntil: number;
}

type GuardState = Record<string, GuardEntry | undefined>;

export interface PinFailureResult {
  attemptsLeft: number;
  lockedMs: number;
}

const readAll = (): GuardState => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeAll = (data: GuardState): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // xotira to'lgan bo'lsa ham ilova to'xtamasin
  }
};

/** Qulf tugashiga qolgan millisekund (0 = qulf yo'q). */
export function getPinLockRemainingMs(scope: string): number {
  const entry = readAll()[scope];
  if (!entry || !entry.lockedUntil) return 0;
  return Math.max(0, Number(entry.lockedUntil) - Date.now());
}

/** Xato urinishni yozadi. Qaytaradi: { attemptsLeft, lockedMs }. */
export function registerPinFailure(scope: string): PinFailureResult {
  const all = readAll();
  const entry: GuardEntry = all[scope] || { fails: 0, lockLevel: 0, lockedUntil: 0 };
  entry.fails = (Number(entry.fails) || 0) + 1;

  let lockedMs = 0;
  if (entry.fails >= MAX_ATTEMPTS) {
    lockedMs = Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** (Number(entry.lockLevel) || 0));
    entry.lockedUntil = Date.now() + lockedMs;
    entry.lockLevel = (Number(entry.lockLevel) || 0) + 1;
    entry.fails = 0;
  }

  all[scope] = entry;
  writeAll(all);
  return { attemptsLeft: lockedMs ? 0 : MAX_ATTEMPTS - entry.fails, lockedMs };
}

/** To'g'ri PIN terilganda hisoblagichni tozalaydi. */
export function resetPinGuard(scope: string): void {
  const all = readAll();
  if (all[scope]) {
    delete all[scope];
    writeAll(all);
  }
}
