// Buyurtma statuslari va to'lov turlari: kodda qo'lda matn yozilmaydi, shu fayldan olinadi.
//
// Kalit (NEW, PAID ...) kod uchun; qiymat - localStorage'da saqlanadigan va ekranda
// ko'rinadigan o'zbekcha matn. Saqlanadigan qiymatlar eski ma'lumotlar bilan mos bo'lishi
// uchun o'zgartirilmadi. Ekrandagi yozuvni o'zgartirish kerak bo'lsa, ORDER_STATUS_LABEL ga
// yozing (saqlangan qiymatga tegmang).

export const ORDER_STATUS = Object.freeze({
  NEW: 'Yangi',
  COOKING: 'Tayyorlanmoqda',
  READY: 'Tayyor',
  DELIVERED: 'Yetkazildi',
  PAID: "To'langan",
  DEBT: 'Qarz',
  ARCHIVED: 'Arxiv'
});

export const ORDER_STATUS_LABEL = Object.freeze({
  [ORDER_STATUS.NEW]: 'Yangi',
  [ORDER_STATUS.COOKING]: 'Tayyorlanmoqda',
  [ORDER_STATUS.READY]: 'Tayyor',
  [ORDER_STATUS.DELIVERED]: 'Yetkazildi',
  [ORDER_STATUS.PAID]: "To'langan",
  [ORDER_STATUS.DEBT]: 'Qarz',
  [ORDER_STATUS.ARCHIVED]: 'Arxiv'
});

/** Yopilgan buyurtmalar: stol bo'shaydi, oshxona va kassada ko'rinmaydi */
export const CLOSED_ORDER_STATUSES = Object.freeze([
  ORDER_STATUS.PAID,
  ORDER_STATUS.DEBT,
  ORDER_STATUS.ARCHIVED
]);

/** Oshxona hali ishlayotgan statuslar */
export const KITCHEN_ORDER_STATUSES = Object.freeze([ORDER_STATUS.NEW, ORDER_STATUS.COOKING]);

export const isOrderClosed = (order) => Boolean(order) && CLOSED_ORDER_STATUSES.includes(order.status);
export const isOrderOpen = (order) => Boolean(order) && !CLOSED_ORDER_STATUSES.includes(order.status);
export const isInKitchen = (order) => Boolean(order) && KITCHEN_ORDER_STATUSES.includes(order.status);

export const PAYMENT_METHOD = Object.freeze({
  CASH: 'Naqd',
  CARD: 'Plastik',
  CLICK: 'Click',
  PAYME: 'Payme',
  MIXED: 'Aralash',
  DEBT: 'Qarz'
});

export const TAKEAWAY_TABLE = 'Olib ketish';

// ==========================================
// YETKAZIB BERISH (KURYER)
// ==========================================
// Yetkazish buyurtmasi oddiy buyurtma: oshxona va kassadan o'tadi. Qo'shimcha maydonlar:
//   orderType: 'delivery', delivery: { customerName, phone, address, landmark, note, fee,
//   status, courier, courierId, assignedAt, pickedAt, deliveredAt, collectedMethod }
// Stol nomi "Yetkazish #3" ko'rinishida: kassa, oshxona va chek shu nom bilan ko'rsatadi.
export const ORDER_TYPE = Object.freeze({ DINE_IN: 'dine_in', DELIVERY: 'delivery' });

export const DELIVERY_TABLE_PREFIX = 'Yetkazish #';

export const DELIVERY_STATUS = Object.freeze({
  WAITING: 'kutilmoqda',   // kuryer biriktirilmagan yoki hali yo'lga chiqmagan
  ON_WAY: "yo'lda",        // kuryer olib ketdi
  DELIVERED: 'yetkazildi'  // mijozga topshirildi (pulni kassa yopadi)
});

export const isDeliveryTable = (table) =>
  typeof table === 'string' && table.startsWith(DELIVERY_TABLE_PREFIX);

export const isDeliveryOrder = (order) =>
  Boolean(order) && (order.orderType === ORDER_TYPE.DELIVERY || isDeliveryTable(order.table));

/** Xizmat haqi (ofitsiant foizi) olinmaydigan joylar: olib ketish va yetkazib berish */
export const isNoServiceFeeTable = (table) => table === TAKEAWAY_TABLE || isDeliveryTable(table);
