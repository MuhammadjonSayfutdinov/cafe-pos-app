// Stol QR kodidagi havola: <sayt manzili>?table=<stol nomi>&k=<stol kaliti> (o'qiydigan tomoni: src/main.jsx)
// Stol kaliti: src/qr/tableKey.js (band stolga faqat QR skaner qilgan mijoz buyurtma beradi)
//
// Sayt manzili admin sozlamasida (pos_qr_base_url, bulut orqali barcha qurilmalarga boradi).
// Bo'sh bo'lsa, hozirgi ochilgan manzil olinadi. Stikerni kompyuterda "localhost" yoki
// 192.168.x.x orqali chop etilsa, mijoz telefoni bu manzilni ocha olmaydi: ogohlantiramiz.

export const QR_BASE_URL_KEY = 'pos_qr_base_url';

export const currentAppUrl = () => {
  if (typeof window === 'undefined') return '';
  return window.location.origin + window.location.pathname;
};

// Foydalanuvchi yozgan manzilni tekshiradi: faqat http(s), so'rov qismi (?...) va # olib tashlanadi.
// Noto'g'ri bo'lsa '' qaytaradi.
export const normalizeQrBaseUrl = (input) => {
  let text = String(input || '').trim();
  if (!text) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (!url.hostname || url.username || url.password) return '';
    return url.origin + url.pathname;
  } catch {
    return '';
  }
};

export const resolveQrBaseUrl = (saved) => normalizeQrBaseUrl(saved) || currentAppUrl();

export const buildTableQrUrl = (baseUrl, table, key = '') =>
  `${resolveQrBaseUrl(baseUrl)}?table=${encodeURIComponent(String(table || ''))}${key ? `&k=${encodeURIComponent(key)}` : ''}`;

// Faqat shu kompyuter yoki shu Wi-Fi ichida ochiladigan manzil
export const isLocalOnlyUrl = (baseUrl) => {
  try {
    const host = new URL(resolveQrBaseUrl(baseUrl)).hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0' || host === '[::1]') return true;
    const m = host.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
    if (!m) return false;
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
  } catch {
    return false;
  }
};

// Stikerda ko'rsatiladigan qisqa manzil (kamera ishlamasa, qo'lda yozish uchun)
export const displayHost = (baseUrl) => {
  try {
    const url = new URL(resolveQrBaseUrl(baseUrl));
    return url.host + (url.pathname === '/' ? '' : url.pathname.replace(/\/$/, ''));
  } catch {
    return '';
  }
};
