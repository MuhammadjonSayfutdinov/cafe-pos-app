// Taom rasmlari va qisqacha ma'lumot (admin -> taom qo'shish oynasi).
//
// Menyu yozuvidagi maydonlar (barchasi ixtiyoriy, eski taomlarda yo'q):
//   images: [{ id, src, path? }]  - 5 tagacha; birinchisi asosiy (menyu kartasida shu chiqadi)
//   thumb: 'data:image/...'      - asosiy rasmning kichik nusxasi (160 px). Yozuvning o'zida turadi:
//                                  internetsiz ham ofitsiant/mijoz kartasida darhol ko'rinadi
//   description: string          - qisqacha ma'lumot, 200 belgigacha
//
// src: bulut sozlangan bo'lsa Supabase Storage havolasi (path - o'chirish uchun ombordagi yo'l),
// aks holda kichraytirilgan rasmning o'zi (data:image/...).
//
// Rasm qurilmada qayta chiziladi (canvas): EXIF (joylashuv, telefon modeli) o'chadi va rasm
// niqobidagi boshqa fayl (skript, arxiv) o'tmaydi - faqat piksellar saqlanadi.

export const MAX_MENU_IMAGES = 5;
export const MAX_DESCRIPTION_LENGTH = 200;
/** Tanlanadigan fayl hajmi chegarasi (telefon kamerasi surati 3-12 MB bo'ladi) */
export const MAX_SOURCE_FILE_BYTES = 25 * 1024 * 1024;

/** Bulutga yuklanadigan rasm tomoni (mijoz oynasida 2x ekranda ham tiniq) */
export const CLOUD_IMAGE_SIZE = 800;
/** Bulut yo'q: rasm menyu yozuvining o'zida, shuning uchun kichikroq (qurilma xotirasini tejash) */
export const LOCAL_IMAGE_SIZE = 480;
export const THUMB_SIZE = 160;

export interface MenuImage {
  id: string;
  src: string;
  /** Bulutdagi rasm omboridagi yo'l (o'chirish uchun). data: rasmda yo'q */
  path?: string;
}

interface MenuItemLike {
  images?: unknown;
  thumb?: unknown;
  description?: unknown;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Faqat xavfsiz rasm manzillari: https, data:image (webp/jpeg/png) va blob (oyna ichidagi oldindan ko'rish) */
export function isSafeImageSrc(src: unknown): src is string {
  if (typeof src !== 'string' || src.length < 8) return false;
  if (src.startsWith('https://')) return true;
  if (src.startsWith('blob:')) return true;
  return /^data:image\/(webp|jpeg|png);base64,[a-z0-9+/=]+$/i.test(src);
}

/** Taomning rasmlari (buzilgan yoki xavfli yozuvlar tashlab yuboriladi) */
export function getMenuImages(item: MenuItemLike | null | undefined): MenuImage[] {
  const raw = item && Array.isArray(item.images) ? item.images : [];
  const list: MenuImage[] = [];
  raw.forEach((img: unknown, idx: number) => {
    if (!isObj(img) || !isSafeImageSrc(img.src)) return;
    const out: MenuImage = { id: typeof img.id === 'string' && img.id ? img.id : `img_${idx}`, src: img.src };
    if (typeof img.path === 'string' && img.path) out.path = img.path;
    list.push(out);
  });
  return list.slice(0, MAX_MENU_IMAGES);
}

/** Kartadagi kichik rasm: yozuvdagi thumb (internetsiz ham), bo'lmasa asosiy rasm, bo'lmasa '' */
export function getMenuThumb(item: MenuItemLike | null | undefined): string {
  if (item && isSafeImageSrc(item.thumb) && String(item.thumb).startsWith('data:')) return String(item.thumb);
  return getMenuImages(item)[0]?.src || '';
}

export function getMenuDescription(item: MenuItemLike | null | undefined): string {
  const text = item && typeof item.description === 'string' ? item.description : '';
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_DESCRIPTION_LENGTH);
}

// ==========================================
// Rasmni qayta ishlash (faqat brauzerda)
// ==========================================

export class ImageProcessError extends Error {}

type Drawable = ImageBitmap | HTMLImageElement;

const dimsOf = (img: Drawable) =>
  'naturalWidth' in img ? { w: img.naturalWidth, h: img.naturalHeight } : { w: img.width, h: img.height };

function loadViaElement(url: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ImageProcessError("Rasmni o'qib bo'lmadi"));
    img.src = url;
  });
}

async function decodeFile(file: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    try {
      // Telefon suratidagi aylantirish (EXIF orientation) hisobga olinadi
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // eski brauzer yoki parametr qo'llanmaydi: oddiy <img> orqali
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await loadViaElement(url, false);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Markazdan kvadrat qilib qirqib, size x size ga kichraytiradi */
function drawSquare(img: Drawable, size: number): HTMLCanvasElement {
  const { w, h } = dimsOf(img);
  if (!w || !h) throw new ImageProcessError("Rasm bo'sh yoki buzilgan");
  const side = Math.min(w, h);
  const target = Math.min(size, side);
  const canvas = document.createElement('canvas');
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageProcessError("Brauzer rasmni qayta ishlay olmadi");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, target, target);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  return encode('image/webp').then(async (webp) => {
    // Eski Safari webp yoza olmaydi va o'rniga png qaytaradi: unda jpeg (kichikroq)
    if (webp && webp.type === 'image/webp') return webp;
    const jpeg = await encode('image/jpeg');
    if (!jpeg) throw new ImageProcessError("Rasmni saqlab bo'lmadi");
    return jpeg;
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new ImageProcessError("Rasmni o'qib bo'lmadi"));
    reader.readAsDataURL(blob);
  });
}

export interface ProcessedImage {
  /** Saqlanadigan rasm (webp yoki jpeg) */
  blob: Blob;
  /** Kichik nusxa (data:image/...), taom kartasi uchun */
  thumb: string;
}

/** Tanlangan faylni tekshirib, kvadrat va kichraytirilgan rasmga aylantiradi */
export async function processImageFile(file: File, size: number): Promise<ProcessedImage> {
  if (!file || !String(file.type || '').startsWith('image/')) {
    throw new ImageProcessError('Faqat rasm fayli tanlang (JPG, PNG yoki WEBP).');
  }
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new ImageProcessError("Rasm juda katta (25 MB dan oshmasin).");
  }
  let img: Drawable;
  try {
    img = await decodeFile(file);
  } catch {
    throw new ImageProcessError("Bu rasm turini o'qib bo'lmadi. JPG yoki PNG tanlang (iPhone'da: Sozlamalar → Kamera → Formatlar → \"Eng mos\").");
  }
  try {
    const blob = await canvasToBlob(drawSquare(img, size), 0.8);
    const thumbBlob = await canvasToBlob(drawSquare(img, THUMB_SIZE), 0.72);
    return { blob, thumb: await blobToDataUrl(thumbBlob) };
  } finally {
    if ('close' in img && typeof img.close === 'function') img.close();
  }
}

/** Mavjud rasmdan (havola yoki data:) kichik nusxa. Bo'lmasa '' (karta to'liq rasmni ko'rsatadi) */
export async function makeThumbFromSrc(src: string): Promise<string> {
  if (!isSafeImageSrc(src)) return '';
  try {
    const img = await loadViaElement(src, src.startsWith('https://'));
    return await blobToDataUrl(await canvasToBlob(drawSquare(img, THUMB_SIZE), 0.72));
  } catch {
    return '';
  }
}

/** Bulutdagi rasm ombori yo'li: menu/<taom>/<rasm>.<kengaytma> */
export function cloudImagePath(itemId: string, imageId: string, blob: Blob): string {
  const ext = blob.type === 'image/jpeg' ? 'jpg' : 'webp';
  const safe = (s: string) => String(s).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  return `menu/${safe(itemId)}/${safe(imageId)}.${ext}`;
}
