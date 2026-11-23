// Yetkazib berish (kuryer) yordamchilari. Ma'lumot sxemasi: src/constants/orderStatus.js
import {
  CLOSED_ORDER_STATUSES,
  DELIVERY_STATUS,
  DELIVERY_TABLE_PREFIX,
  isDeliveryOrder
} from '../constants/orderStatus';
import { getCreatedTimeMs, isTodayMs } from './dates';

export const phoneDigits = (str) => String(str || '').replace(/\D/g, '');

/** Yetkazish holati (eski yozuvda delivery maydoni bo'lmasa ham) */
export const getDeliveryStatus = (order) => order?.delivery?.status || DELIVERY_STATUS.WAITING;

/**
 * Yangi yetkazish uchun joy nomi: "Yetkazish #N" (bugungi tartib raqami).
 * Ochiq buyurtmadagi nom qayta berilmaydi (kechagi yopilmagan #3 bo'lsa, bugun #3 o'tkazib yuboriladi).
 */
export function nextDeliveryTable(orders) {
  const list = Array.isArray(orders) ? orders : [];
  const busy = new Set();
  let maxToday = 0;
  list.forEach(o => {
    if (!o || !isDeliveryOrder(o)) return;
    const num = Number(String(o.table || '').slice(DELIVERY_TABLE_PREFIX.length)) || 0;
    if (!CLOSED_ORDER_STATUSES.includes(o.status)) busy.add(num);
    if (isTodayMs(getCreatedTimeMs(o))) maxToday = Math.max(maxToday, num);
  });
  let n = maxToday + 1;
  while (busy.has(n)) n += 1;
  return `${DELIVERY_TABLE_PREFIX}${n}`;
}

/** Shu telefon raqamli mijozning oxirgi yetkazish ma'lumoti (manzilni qayta yozmaslik uchun) */
export function findLastDeliveryByPhone(orders, phone) {
  const digits = phoneDigits(phone);
  if (digits.length < 9) return null;
  const tail = digits.slice(-9);
  const list = (Array.isArray(orders) ? orders : [])
    .filter(o => o && o.delivery && phoneDigits(o.delivery.phone).slice(-9) === tail)
    .sort((a, b) => (getCreatedTimeMs(b) || 0) - (getCreatedTimeMs(a) || 0));
  return list[0]?.delivery || null;
}

/**
 * Yetkazish narxi chekda alohida qator bo'lib turadi. Oshxonaga chiqmaydi (kitchenDoneQty = 1),
 * ombordan hech narsa ayirmaydi (menyuda bunday id yo'q).
 */
export function buildDeliveryFeeItem(fee) {
  const price = Math.max(0, Math.round(Number(fee) || 0));
  const id = `delivery_fee_${Date.now()}`;
  return {
    id,
    cartItemId: id,
    name: '🛵 Yetkazib berish xizmati',
    baseName: 'Yetkazib berish xizmati',
    category: 'Yetkazish',
    price,
    quantity: 1,
    qty: 1,
    sentQty: 1,
    kitchenDoneQty: 1,
    isDeliveryFee: true,
    note: ''
  };
}

/** Manzilni xaritada ochish (Yandex Xaritalar O'zbekistonda keng tarqalgan) */
export const mapsUrl = (address) =>
  `https://yandex.uz/maps/?text=${encodeURIComponent(String(address || '').trim())}`;

export const telUrl = (phone) => {
  const d = phoneDigits(phone);
  if (!d) return '';
  return `tel:+${d.length === 9 ? `998${d}` : d}`;
};
