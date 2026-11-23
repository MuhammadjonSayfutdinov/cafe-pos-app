// Sana bilan ishlashning yagona joyi (B4).
// Qoida: sanani matn sifatida solishtirmang. Hisob uchun millisekund (createdAt / closedAtMs).

const parseDateText = (rawStr) => {
  const str = String(rawStr || '').trim();
  if (!str) return null;

  // 23.11.2026 (uz/ru), 23-11-2026 yoki 11/23/2026 (en-US)
  const m = str.match(/(\d{1,2})([./-])(\d{1,2})\2(\d{4})/);
  if (m) {
    let a = Number(m[1]);
    let b = Number(m[3]);
    const year = Number(m[4]);
    // "/" ajratgich odatda en-US (oy/kun/yil); "." va "-" esa kun.oy.yil
    let day = m[2] === '/' ? b : a;
    let month = m[2] === '/' ? a : b;
    if (month > 12 && day <= 12) [day, month] = [month, day];
    const hm = str.match(/(\d{1,2}):(\d{2})/);
    const dt = new Date(year, month - 1, day, hm ? Number(hm[1]) : 12, hm ? Number(hm[2]) : 0);
    if (!isNaN(dt.getTime()) && dt.getDate() === day) return dt.getTime();
  }

  const parsed = Date.parse(str);
  return isNaN(parsed) ? null : parsed;
};

/**
 * Yozuv (buyurtma, xarajat) vaqtini millisekundda qaytaradi.
 * Aniqlab bo'lmasa null qaytaradi: sanasiz yozuv "bugungi" deb hisoblanmaydi.
 */
export function getRecordTimeMs(record) {
  if (!record) return null;

  for (const key of ['closedAtMs', 'createdAt']) {
    const v = Number(record[key]);
    if (record[key] && Number.isFinite(v) && v > 0) return v;
  }

  const fromText = parseDateText(record.closeTime || record.archiveDate || record.date);
  if (fromText !== null) return fromText;

  const idDigits = String(record.id || '').match(/\d{13}/);
  if (idDigits) {
    const ms = Number(idDigits[0]);
    if (ms > 1600000000000 && ms <= Date.now() + 86400000) return ms;
  }

  return null;
}

/** Buyurtma yaratilgan vaqt (to'lov vaqtidan qat'i nazar). */
export function getCreatedTimeMs(record) {
  if (!record) return null;
  const v = Number(record.createdAt);
  if (record.createdAt && Number.isFinite(v) && v > 0) return v;
  return getRecordTimeMs({ ...record, closedAtMs: undefined, closeTime: undefined });
}

export function startOfDayMs(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** ms bugungi kunga tegishlimi (mahalliy vaqt bo'yicha). */
export function isTodayMs(ms, now = new Date()) {
  if (ms === null || ms === undefined || !Number.isFinite(Number(ms))) return false;
  const start = startOfDayMs(now);
  return Number(ms) >= start && Number(ms) < start + 86400000;
}
