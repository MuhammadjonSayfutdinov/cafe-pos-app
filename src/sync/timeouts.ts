// Sekin yoki "osilib qolgan" internet uchun vaqt cheklovlari.
//
// Internet umuman yo'q bo'lsa, so'rov darhol xato beradi va dvigatel oflayn rejimga o'tadi.
// Sekin internetda esa so'rov daqiqalab javobsiz turishi mumkin: shu paytda navbatdagi
// o'zgarishlar yuborilmay qolardi. Endi har bir so'rov vaqti cheklangan, cheklovdan oshsa
// xato bo'ladi va dvigatel keyinroq qayta urinadi (ma'lumot qurilmada saqlanib turadi).

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label}: server ${Math.round(ms / 1000)} soniyada javob bermadi (internet sekin)`);
    this.name = 'TimeoutError';
  }
}

/** Promise vaqt ichida tugamasa - TimeoutError */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "So'rov"): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * fetch o'rniga: vaqt tugasa so'rovni bekor qiladi (ulanish band bo'lib qolmaydi).
 * Chaqiruvchining o'z signali bo'lsa, u ham hisobga olinadi.
 */
export function createTimeoutFetch(ms: number, baseFetch: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  return (input, init = {}) => {
    const ctrl = new AbortController();
    const outer = init.signal;
    if (outer) {
      if (outer.aborted) ctrl.abort(outer.reason);
      else outer.addEventListener('abort', () => ctrl.abort(outer.reason), { once: true });
    }
    const timer = setTimeout(() => ctrl.abort(new TimeoutError("So'rov", ms)), ms);
    return baseFetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
  };
}

/** Xato tarmoq bilan bog'liqmi (internet yo'q, sekin, server javob bermadi) */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const e = error as { name?: unknown; message?: unknown; status?: unknown };
  const name = String(e.name ?? '');
  if (name === 'TimeoutError' || name === 'AbortError' || name === 'AuthRetryableFetchError') return true;
  if (e.status === 0) return true;
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|timed out/i
    .test(String(e.message ?? ''));
}
