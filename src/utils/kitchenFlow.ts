// Oshxona oqimi: taom (chek qatori) darajasidagi holat. YAGONA joy (7-bosqich, B19-B26).
//
// Oldingi muammolar:
//  - oshpaz bir nechta taomni belgilab "Tayyor" bossa ham chekdagi HAMMA taom tayyor bo'lib ketardi;
//  - belgilar faqat shu qurilmada, ekrandagi tartib raqami bo'yicha saqlanardi (sex filtri yoki
//    dozakazdan keyin boshqa taom belgilangan bo'lib qolardi);
//  - ofitsiant savatchasi chekni eski nusxadan butunlay qayta yozib, oshxona belgilarini va boshqa
//    qurilmada qo'shilgan taomlarni o'chirardi.
//
// Qator (order.items[]) maydonlari:
//   cartItemId      qatorning doimiy kaliti (eski qatorda yo'q bo'lsa: lineIdOf, yozishda saqlanadi)
//   quantity        chekdagi porsiya. Rad etilgan / bekor qilingan porsiya shu yerdan ayiriladi:
//                   summa, ombor va statistika boshqa joyda o'zgarishsiz to'g'ri hisoblanadi
//   kitchenDoneQty  oshxona "tayyor" degan porsiya (0..quantity)
//   servedQty       ofitsiant mijozga bergan porsiya (0..kitchenDoneQty). Eski yozuvda yo'q:
//                   status 'Tayyor' bo'lsa 0, aks holda kitchenDoneQty deb olinadi
//   kitchenSentAt   oshxonaga oxirgi marta porsiya qo'shilgan vaqt (ms): "🆕 qo'shimcha" belgisi
//   kitchenReadyAt  oxirgi "tayyor" vaqti (ms)
//   noKitchen       oshxonaga chiqmaydigan qator (VIP vaqt). Yetkazish narxi: isDeliveryFee
//
// Buyurtma maydonlari:
//   kitchenRejections    oshxona rad etgan porsiyalar: ofitsiant va kassirga xabar (ackAt bilan)
//   kitchenCancellations xodim bekor qilgan, oshxonada turgan porsiyalar: oshxonaga xabar
//   kitchenOpen          chek oshxona tugatmasdan to'langan: oshxona ekranida qoladi
//   readyNotice          to'langan chek tayyor bo'ldi: { at, ackAt?, ackBy? }
//   refundDue            to'langan chekdan rad etilgan taom puli (mijozga qaytariladi)

import {
  CLOSED_ORDER_STATUSES,
  KITCHEN_ORDER_STATUSES,
  ORDER_STATUS
} from '../constants/orderStatus';
import { calcOrderTotals, getItemPrice, getItemQty, orderTotalsFields } from './orderTotals';
import type { OrderItemLike, OrderLike } from './orderTotals';
import { newId } from './ids';

export type Dict = Record<string, unknown>;
export type OrderItem = Dict;
export type Order = Dict;

const KITCHEN: readonly string[] = KITCHEN_ORDER_STATUSES;
const CLOSED: readonly string[] = CLOSED_ORDER_STATUSES;
const HOUR_MS = 60 * 60 * 1000;
/** To'langan, lekin oshxona tugatmagan chek shuncha vaqtdan keyin oshxona ekranidan tushadi */
const KITCHEN_OPEN_MAX_AGE_MS = 24 * HOUR_MS;

/** Chek qatorida saqlanmaydigan og'ir menyu maydonlari (rasm 5-50 KB: xotira tez to'lardi) */
const HEAVY_MENU_FIELDS = ['images', 'thumb', 'description'] as const;

const isObj = (x: unknown): x is Dict => x !== null && typeof x === 'object' && !Array.isArray(x);
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
const clampInt = (v: unknown, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Math.floor(num(v))));

const qtyOf = (it: Dict): number => getItemQty(it as OrderItemLike);
const priceOf = (it: Dict): number => getItemPrice(it as OrderItemLike);
const listOf = (v: unknown): Dict[] => (Array.isArray(v) ? v.filter(isObj) : []);

export const statusOf = (order: unknown): string => (isObj(order) ? str(order.status) : '');
export const isClosedStatus = (status: string): boolean => CLOSED.includes(status);

/** Oshxonaga chiqadigan qatormi (yetkazish narxi va VIP vaqt chiqmaydi) */
export function isKitchenItem(it: unknown): boolean {
  if (!isObj(it)) return false;
  if (it.isDeliveryFee || it.noKitchen) return false;
  if (str(it.category) === 'VIP Xizmat') return false;
  return !str(it.id).startsWith('vip_time_') && !str(it.cartItemId).startsWith('vip_time_');
}

/** Qatorning doimiy kaliti. Eski qatorda cartItemId bo'lmasa: chek id si + o'rni */
export function lineIdOf(it: unknown, idx: number, orderId?: unknown): string {
  const own = isObj(it) ? str(it.cartItemId).trim() : '';
  return own || `ci_${str(orderId) || 'x'}_${idx}`;
}

export interface OrderLine {
  item: OrderItem;
  idx: number;
  lineId: string;
}

export function orderLines(order: unknown): OrderLine[] {
  if (!isObj(order) || !Array.isArray(order.items)) return [];
  const out: OrderLine[] = [];
  order.items.forEach((it: unknown, idx: number) => {
    if (isObj(it)) out.push({ item: it, idx, lineId: lineIdOf(it, idx, order.id) });
  });
  return out;
}

// Eski yozuv (maydon yo'q): oshxonadagi chekda hali tayyor emas, oshxonadan o'tganida tayyor
const kitchenStillOpen = (order: unknown): boolean =>
  KITCHEN.includes(statusOf(order)) || (isObj(order) && order.kitchenOpen === true);

/** Oshxona tayyor degan porsiya */
export function doneQtyOf(it: unknown, order?: unknown): number {
  if (!isObj(it)) return 0;
  const q = qtyOf(it);
  if (!isKitchenItem(it)) return q;
  if (it.kitchenDoneQty === undefined || it.kitchenDoneQty === null) return kitchenStillOpen(order) ? 0 : q;
  return clampInt(it.kitchenDoneQty, 0, q);
}

/** Mijozga berilgan porsiya */
export function servedQtyOf(it: unknown, order?: unknown): number {
  if (!isObj(it)) return 0;
  if (!isKitchenItem(it)) return qtyOf(it);
  const done = doneQtyOf(it, order);
  if (it.servedQty === undefined || it.servedQty === null) return statusOf(order) === ORDER_STATUS.READY ? 0 : done;
  return clampInt(it.servedQty, 0, done);
}

/** Oshxonada turgan (hali tayyor emas) porsiya */
export const pendingQtyOf = (it: unknown, order?: unknown): number =>
  isObj(it) && isKitchenItem(it) ? Math.max(0, qtyOf(it) - doneQtyOf(it, order)) : 0;

/** Tayyor, lekin mijozga hali berilmagan porsiya */
export const readyQtyOf = (it: unknown, order?: unknown): number =>
  isObj(it) && isKitchenItem(it) ? Math.max(0, doneQtyOf(it, order) - servedQtyOf(it, order)) : 0;

export interface KitchenSummary {
  /** oshxona qatorlaridagi jami porsiya */
  kitchenQty: number;
  /** oshxonada (hali tayyor emas) */
  pending: number;
  /** tayyor, mijozga berilmagan */
  ready: number;
  /** mijozga berilgan */
  served: number;
}

export function kitchenSummary(order: unknown): KitchenSummary {
  const s: KitchenSummary = { kitchenQty: 0, pending: 0, ready: 0, served: 0 };
  orderLines(order).forEach(({ item }) => {
    if (!isKitchenItem(item)) return;
    s.kitchenQty += qtyOf(item);
    s.pending += pendingQtyOf(item, order);
    s.ready += readyQtyOf(item, order);
    s.served += servedQtyOf(item, order);
  });
  return s;
}

/** Oshxona ekranida ko'rinadimi: oshxonadagi chek yoki oshxona tugatmasdan to'langan chek */
export function isKitchenVisible(order: unknown, now: number = Date.now()): boolean {
  if (!isObj(order)) return false;
  const st = statusOf(order);
  if (KITCHEN.includes(st)) return true;
  if (order.kitchenOpen !== true || st === ORDER_STATUS.CANCELLED || !CLOSED.includes(st)) return false;
  const created = num(order.createdAt) || num(order.closedAtMs);
  return !created || now - created < KITCHEN_OPEN_MAX_AGE_MS;
}

/** Qatordagi qty (eski nom) ni olib tashlab, quantity yoziladi */
function withQty(it: OrderItem, q: number): OrderItem {
  const next: OrderItem = { ...it, quantity: q };
  if ('qty' in next) delete next.qty;
  return next;
}

/** Chek qatori uchun yengil nusxa: menyu rasmlari va tavsifi chekka yozilmaydi */
export function stripHeavyFields(it: OrderItem): OrderItem {
  if (!HEAVY_MENU_FIELDS.some(k => k in it)) return it;
  const next: OrderItem = { ...it };
  HEAVY_MENU_FIELDS.forEach(k => {
    delete next[k];
  });
  return next;
}

/** Oshxonaga yangi ketayotgan qator */
export function newKitchenLine(src: OrderItem, q: number, now: number): OrderItem {
  const line: OrderItem = stripHeavyFields({
    ...src,
    cartItemId: str(src.cartItemId).trim() || newId('ci_'),
    price: priceOf(src),
    sentQty: q,
    kitchenDoneQty: 0,
    servedQty: 0,
    kitchenSentAt: now
  });
  delete line.kitchenReadyAt;
  delete line.mergeKey;
  return withQty(line, q);
}

/**
 * Yozishdan oldin: har qatorda aniq cartItemId, kitchenDoneQty va servedQty
 * (eski yozuvdagi taxminlar shu paytdagi status bo'yicha qotiriladi).
 */
export function materializeOrder(order: Order): Order {
  const lines = orderLines(order);
  const items = lines.map(({ item, lineId }) => {
    let next: OrderItem = item;
    const put = (key: string, value: unknown) => {
      if (next[key] === value) return;
      if (next === item) next = { ...item };
      next[key] = value;
    };
    put('cartItemId', lineId);
    if (isKitchenItem(item)) {
      put('kitchenDoneQty', doneQtyOf(item, order));
      put('servedQty', servedQtyOf(item, order));
    }
    return next;
  });
  return { ...order, items };
}

/** Ochiq chekning statusi qatorlardan: oshxonada / tayyor / berildi */
export function deriveStatus(order: Order, items: OrderItem[], cooking = false): string {
  const prev = statusOf(order);
  if (CLOSED.includes(prev)) return prev;
  const s = kitchenSummary({ ...order, items });
  if (s.kitchenQty === 0) return prev || ORDER_STATUS.NEW;
  if (s.pending > 0) return cooking || prev === ORDER_STATUS.COOKING ? ORDER_STATUS.COOKING : ORDER_STATUS.NEW;
  return s.ready > 0 ? ORDER_STATUS.READY : ORDER_STATUS.DELIVERED;
}

/** Ochiq chekda qatorlar o'zgargach: summa, status va oshxonaga qaytish vaqti */
function finishOpenUpdate(base: Order, items: OrderItem[], now: number, cooking = false): Order {
  const prev = statusOf(base);
  const status = deriveStatus(base, items, cooking);
  const next: Order = {
    ...base,
    items,
    ...orderTotalsFields(base as OrderLike, items as OrderItemLike[]),
    status
  };
  if (!KITCHEN.includes(prev) && KITCHEN.includes(status)) next.kitchenRoundAt = now;
  if (KITCHEN.includes(prev) && !KITCHEN.includes(status) && !next.readyTime) {
    next.readyTime = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return next;
}

// =========================================================
// OSHXONA AMALLARI
// =========================================================

export interface ReadyResult {
  order: Order;
  /** tayyor deb belgilangan porsiya */
  marked: number;
  /** oshxonada boshqa porsiya qolmadi */
  completed: boolean;
}

/**
 * Faqat tanlangan qatorlar tayyor (lineIds = null: chekdagi hammasi).
 * Qolgan taomlar oshxonada qoladi; chek statusi qatorlardan hisoblanadi.
 */
export function markLinesReady(order: Order, lineIds: readonly string[] | null, now: number): ReadyResult {
  const base = materializeOrder(order);
  const want = lineIds ? new Set(lineIds) : null;
  let marked = 0;
  const items = orderLines(base).map(({ item, lineId }) => {
    if (want && !want.has(lineId)) return item;
    const pending = pendingQtyOf(item, base);
    if (pending <= 0) return item;
    marked += pending;
    return { ...item, kitchenDoneQty: qtyOf(item), kitchenReadyAt: now };
  });
  if (marked === 0) return { order, marked: 0, completed: false };
  const completed = kitchenSummary({ ...base, items }).pending === 0;
  if (CLOSED.includes(statusOf(base))) {
    // To'langan chek: status va summa o'zgarmaydi; tayyor bo'lgach xodimlarga xabar
    return {
      order: { ...base, items, ...(completed ? { kitchenOpen: false, readyNotice: { at: now } } : {}) },
      marked,
      completed
    };
  }
  return { order: finishOpenUpdate(base, items, now, true), marked, completed };
}

/** "Pishirishni boshlash": yangi chek oshxonada tayyorlanmoqda */
export function startCooking(order: Order, now: number): Order {
  if (statusOf(order) !== ORDER_STATUS.NEW) return order;
  return {
    ...order,
    status: ORDER_STATUS.COOKING,
    cookingStartedAt: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
}

export interface RejectRequest {
  lineId: string;
  qty: number;
}

export interface RejectionRecord {
  id: string;
  lineId: string;
  menuId: unknown;
  name: string;
  qty: number;
  price: number;
  reason: string;
  by: string;
  at: number;
  /** to'langan chekda: shu porsiyalar uchun mijozga qaytariladigan pul */
  refundDue?: number;
  ackAt?: number;
  ackBy?: string;
}

export interface RejectResult {
  order: Order;
  records: RejectionRecord[];
  /** rad etilgan porsiyalar soni */
  rejected: number;
  /** to'langan chekda mijozga qaytariladigan pul (ochiq chekda 0: summa o'zi kamayadi) */
  refundDue: number;
  /** chekda taom qolmadi: chek bekor qilindi */
  cancelled: boolean;
}

/**
 * Oshxona taomni rad etadi: faqat hali tayyor bo'lmagan porsiyalar. Rad etilgan porsiya
 * chekdan olib tashlanadi (ofitsiant va kassirga xabar boradi). Ochiq chekda summa kamayadi;
 * to'langan chekda summa o'zgarmaydi, refundDue (qaytariladigan pul) yoziladi.
 */
export function rejectLines(
  order: Order,
  requests: readonly RejectRequest[],
  info: { reason: string; by: string; now: number }
): RejectResult {
  const base = materializeOrder(order);
  const want = new Map<string, number>();
  requests.forEach(r => {
    if (r && r.lineId) want.set(r.lineId, (want.get(r.lineId) || 0) + Math.max(0, Math.floor(num(r.qty))));
  });
  const closed = CLOSED.includes(statusOf(base));
  const records: RejectionRecord[] = [];
  const items: OrderItem[] = [];
  let rejected = 0;

  orderLines(base).forEach(({ item, lineId }) => {
    const take = Math.min(want.get(lineId) || 0, pendingQtyOf(item, base));
    if (take <= 0) {
      items.push(item);
      return;
    }
    rejected += take;
    records.push({
      id: newId('rej_'),
      lineId,
      menuId: item.id ?? null,
      name: str(item.name) || 'Taom',
      qty: take,
      price: priceOf(item),
      reason: info.reason,
      by: info.by,
      at: info.now
    });
    const q = qtyOf(item) - take;
    if (q > 0) items.push(withQty({ ...item, sentQty: q }, q));
  });

  if (rejected === 0) return { order, records: [], rejected: 0, refundDue: 0, cancelled: false };

  // Qaytariladigan pul: taom narxi + xizmat haqi ulushi (chegirmani kassir hisobga oladi)
  const gross = (list: OrderItem[]) => {
    const t = calcOrderTotals({
      items: list as OrderItemLike[],
      serviceFeePercent: base.serviceFee ?? base.serviceFeePercent ?? 0,
      table: str(base.table)
    });
    return t.subTotal + t.serviceFeeAmount;
  };
  const refundDue = closed ? Math.max(0, gross(orderLines(base).map(l => l.item)) - gross(items)) : 0;
  if (closed && refundDue > 0 && records.length > 0) {
    // Pulni yozuvlar bo'yicha taqsimlaymiz (xabarda ko'rinadi), qoldiq oxirgisiga
    const total = records.reduce((s, r) => s + r.price * r.qty, 0) || 1;
    let left = refundDue;
    records.forEach((r, i) => {
      const part = i === records.length - 1 ? left : Math.round((refundDue * r.price * r.qty) / total);
      r.refundDue = part;
      left -= part;
    });
  }

  const withRecords: Order = {
    ...base,
    kitchenRejections: [...listOf(base.kitchenRejections), ...records]
  };

  if (closed) {
    const left = kitchenSummary({ ...withRecords, items });
    const anyDone = orderLines({ ...withRecords, items }).some(({ item }) => isKitchenItem(item) && doneQtyOf(item) > 0);
    return {
      order: {
        ...withRecords,
        items,
        refundDue: num(base.refundDue) + refundDue,
        kitchenOpen: left.pending > 0,
        ...(left.pending === 0 && anyDone && !isObj(base.readyNotice) ? { readyNotice: { at: info.now } } : {})
      },
      records,
      rejected,
      refundDue,
      cancelled: false
    };
  }

  if (items.length === 0) {
    return {
      order: {
        ...withRecords,
        items,
        ...orderTotalsFields(withRecords as OrderLike, []),
        status: ORDER_STATUS.CANCELLED,
        cancelledAt: info.now,
        cancelledBy: info.by,
        cancelReason: `Oshxona rad etdi: ${info.reason}`,
        kitchenOpen: false
      },
      records,
      rejected,
      refundDue: 0,
      cancelled: true
    };
  }

  return { order: finishOpenUpdate(withRecords, items, info.now), records, rejected, refundDue: 0, cancelled: false };
}

// =========================================================
// OFITSIANT AMALLARI
// =========================================================

/** Tayyor porsiyalar mijozga berildi. Oshxonada qolgani bo'lsa, chek oshxonada qoladi */
export function serveReadyLines(order: Order, now: number): { order: Order; served: number } {
  const base = materializeOrder(order);
  let served = 0;
  const items = orderLines(base).map(({ item }) => {
    const r = readyQtyOf(item, base);
    if (r <= 0) return item;
    served += r;
    return { ...item, servedQty: doneQtyOf(item, base) };
  });
  if (served === 0) return { order, served: 0 };
  if (CLOSED.includes(statusOf(base))) return { order: { ...base, items }, served };
  return { order: finishOpenUpdate(base, items, now), served };
}

export interface CancellationRecord {
  id: string;
  lineId: string;
  name: string;
  qty: number;
  by: string;
  reason: string;
  at: number;
  ackAt?: number;
  ackBy?: string;
}

/**
 * Xodim chekdan olib tashlagan porsiya (hisobot uchun, narxi bilan): "Rad etilgan va bekor qilingan
 * taomlar" (src/utils/lossReport.ts). Oshxonaga xabar alohida - kitchenCancellations (faqat oshxonadagisi).
 */
export interface VoidRecord {
  id: string;
  lineId: string;
  menuId: unknown;
  name: string;
  qty: number;
  price: number;
  /** olib tashlanganda allaqachon tayyor bo'lgan (yoki berilgan) porsiya - isrof */
  cookedQty: number;
  by: string;
  reason: string;
  at: number;
}

/**
 * Xodim (PIN bilan) qatorni kamaytiradi yoki o'chiradi (newQty = 0). Avval oshxonada turgan
 * porsiyalar ayiriladi, keyin tayyorlari. Oshxonada turgan porsiya bekor bo'lsa, oshxonaga xabar.
 * Chekda taom qolmasa, chek "Bekor qilindi" bo'ladi (yozuv o'chirilmaydi).
 */
export function reduceLine(
  order: Order,
  lineId: string,
  newQty: number,
  info: { by: string; reason: string; now: number }
): { order: Order; removed: number; cancelledPending: number } {
  const base = materializeOrder(order);
  const inKitchen = isKitchenVisible(base, info.now);
  const items: OrderItem[] = [];
  let removed = 0;
  let cancelledPending = 0;
  let lastRemovedLine: OrderItem | null = null;
  const cancels: CancellationRecord[] = [];
  const voids: VoidRecord[] = [];

  orderLines(base).forEach(({ item, lineId: id }) => {
    if (id !== lineId) {
      items.push(item);
      return;
    }
    const q = qtyOf(item);
    const target = clampInt(newQty, 0, q);
    const cut = q - target;
    if (cut <= 0) {
      items.push(item);
      return;
    }
    removed += cut;
    const pending = pendingQtyOf(item, base);
    const fromPending = Math.min(cut, pending);
    const done = Math.max(0, doneQtyOf(item, base) - (cut - fromPending));
    const served = Math.min(servedQtyOf(item, base), done);
    if (fromPending > 0 && inKitchen && isKitchenItem(item)) {
      cancelledPending += fromPending;
      cancels.push({
        id: newId('kc_'), lineId: id, name: str(item.name) || 'Taom', qty: fromPending,
        by: info.by, reason: info.reason, at: info.now
      });
    }
    voids.push({
      id: newId('void_'), lineId: id, menuId: item.id ?? null, name: str(item.name) || 'Taom', qty: cut,
      price: priceOf(item), cookedQty: cut - fromPending, by: info.by, reason: info.reason, at: info.now
    });
    if (target > 0) {
      items.push(withQty({ ...item, sentQty: target, kitchenDoneQty: done, servedQty: served }, target));
    } else {
      lastRemovedLine = item;
    }
  });

  if (removed === 0) return { order, removed: 0, cancelledPending: 0 };

  const withCancels: Order = {
    ...base,
    ...(cancels.length > 0 ? { kitchenCancellations: [...listOf(base.kitchenCancellations), ...cancels] } : {}),
    voids: [...listOf(base.voids), ...voids]
  };

  if (items.length === 0) {
    // Oxirgi taom ham olib tashlandi: chek bekor qilinadi, oxirgi qator yozuvda qoladi (nima bekor bo'lgani)
    const kept = lastRemovedLine ? [lastRemovedLine] : [];
    return {
      order: {
        ...withCancels,
        items: kept,
        status: ORDER_STATUS.CANCELLED,
        cancelledAt: info.now,
        cancelledBy: info.by,
        cancelReason: info.reason,
        kitchenOpen: false
      },
      removed,
      cancelledPending
    };
  }
  if (CLOSED.includes(statusOf(base))) return { order: { ...withCancels, items }, removed, cancelledPending };
  return { order: finishOpenUpdate(withCancels, items, info.now), removed, cancelledPending };
}

/** Butun chek bekor qilinadi (yozuv o'chirilmaydi). Oshxonada turgan porsiyalar haqida oshxonaga xabar */
export function cancelWholeOrder(order: Order, info: { by: string; reason: string; now: number }): Order {
  const base = materializeOrder(order);
  const cancels: CancellationRecord[] = isKitchenVisible(base, info.now)
    ? orderLines(base)
      .filter(({ item }) => pendingQtyOf(item, base) > 0)
      .map(({ item, lineId }) => ({
        id: newId('kc_'), lineId, name: str(item.name) || 'Taom', qty: pendingQtyOf(item, base),
        by: info.by, reason: info.reason, at: info.now
      }))
    : [];
  // Hisobot uchun: chekdagi barcha porsiyalar bekor bo'ldi (qatorlar yozuvda qoladi)
  const voids: VoidRecord[] = CLOSED.includes(statusOf(base))
    ? []
    : orderLines(base)
      .filter(({ item }) => qtyOf(item) > 0)
      .map(({ item, lineId }) => ({
        id: newId('void_'), lineId, menuId: item.id ?? null, name: str(item.name) || 'Taom', qty: qtyOf(item),
        price: priceOf(item), cookedQty: Math.min(qtyOf(item), doneQtyOf(item, base)), by: info.by,
        reason: info.reason, at: info.now
      }));
  return {
    ...base,
    status: ORDER_STATUS.CANCELLED,
    cancelledAt: info.now,
    cancelledBy: info.by,
    cancelReason: info.reason,
    kitchenOpen: false,
    ...(cancels.length > 0 ? { kitchenCancellations: [...listOf(base.kitchenCancellations), ...cancels] } : {}),
    voids: [...listOf(base.voids), ...voids]
  };
}

/** Kassada to'lanayotgan chek: oshxona hali tugatmagan bo'lsa, oshxona ekranida qoladi */
export function keepInKitchenOnPayment(order: Order): Dict {
  if (!KITCHEN.includes(statusOf(order)) || kitchenSummary(order).pending === 0) return {};
  return { kitchenOpen: true, items: materializeOrder(order).items };
}

// =========================================================
// OFITSIANT SAVATCHASI (bir nechta qurilma bir chek bilan ishlaganda)
// =========================================================

const cartUnsent = (c: Dict): number => Math.max(0, qtyOf(c) - Math.max(0, Math.floor(num(c.sentQty))));

/**
 * Savatcha = chekdagi qatorlar (eng so'nggi holat) + shu qurilmada qo'shilgan, hali yuborilmagan
 * porsiyalar. Chek boshqa qurilmada o'zgarsa (oshxona rad etdi, QR-buyurtma qo'shildi, kassa yopdi),
 * savatcha shunga moslashadi va eski nusxa chekni qayta yozmaydi. sentQty = chekdagi porsiya.
 */
export function rebaseCart(cart: unknown, order: unknown): OrderItem[] {
  const cartList = listOf(cart);
  const byId = new Map(cartList.map(c => [str(c.cartItemId), c] as const));
  const out: OrderItem[] = [];
  const used = new Set<string>();
  orderLines(order).forEach(({ item, lineId }) => {
    const c = byId.get(lineId);
    const q = qtyOf(item);
    used.add(lineId);
    out.push(withQty({
      ...item,
      cartItemId: lineId,
      sentQty: q,
      price: priceOf(item),
      note: c && c.note !== undefined ? c.note : item.note
    }, q + (c ? cartUnsent(c) : 0)));
  });
  cartList.forEach(c => {
    if (used.has(str(c.cartItemId))) return;
    const unsent = cartUnsent(c);
    if (unsent > 0) out.push(withQty({ ...c, sentQty: 0 }, unsent));
  });
  return out;
}

/** Ikki savatcha ekranda bir xilmi (keraksiz qayta chizishning oldini olish uchun) */
export function sameCart(a: unknown, b: unknown): boolean {
  const sig = (list: unknown) => JSON.stringify(listOf(list).map(c => [
    str(c.cartItemId), qtyOf(c), num(c.sentQty), str(c.note), num(c.kitchenDoneQty), num(c.servedQty), priceOf(c)
  ]));
  return sig(a) === sig(b);
}

export interface CartApplyResult {
  order: Order;
  /** oshxonaga yangi ketgan porsiyalar */
  addedPortions: number;
  /** chek shu orada yopilgan (to'langan/bekor qilingan): hech narsa yozilmadi */
  blocked?: boolean;
}

/**
 * Ofitsiant savatchasini ENG SO'NGGI chekka qo'llaydi: faqat yangi porsiyalar va izohlar.
 * Oshxona belgilari, rad etilganlar va boshqa qurilmada qo'shilgan taomlar saqlanadi.
 */
export function applyWaiterCart(order: Order, cart: unknown, now: number): CartApplyResult {
  // Yopilgan chekka taom qo'shilmaydi (pul olingan): savatcha yangi chek sifatida yuboriladi
  if (CLOSED.includes(statusOf(order))) return { order, addedPortions: 0, blocked: true };
  const base = materializeOrder(order);
  const cartList = listOf(cart);
  const byId = new Map(cartList.map(c => [str(c.cartItemId), c] as const));
  const seen = new Set<string>();
  let added = 0;
  let noteChanged = false;

  const items: OrderItem[] = orderLines(base).map(({ item, lineId }) => {
    const c = byId.get(lineId);
    if (!c) return item;
    seen.add(lineId);
    const unsent = cartUnsent(c);
    const note = c.note !== undefined ? str(c.note) : item.note;
    const sameNote = str(note) === str(item.note);
    if (unsent === 0 && sameNote) return item;
    if (!sameNote) noteChanged = true;
    added += unsent;
    const q = qtyOf(item) + unsent;
    return withQty({ ...item, note, sentQty: q, ...(unsent > 0 ? { kitchenSentAt: now } : {}) }, q);
  });
  cartList.forEach(c => {
    if (seen.has(str(c.cartItemId))) return;
    const unsent = cartUnsent(c);
    if (unsent <= 0) return;
    added += unsent;
    items.push(newKitchenLine(c, unsent, now));
  });

  if (added === 0 && !noteChanged) return { order, addedPortions: 0 };
  return { order: finishOpenUpdate(base, items, now), addedPortions: added };
}

/** Mavjud ochiq chekka yangi taomlar (QR-buyurtma, mijoz ekrani, dozakaz) */
export function appendKitchenItems(order: Order, incoming: unknown, now: number): Order {
  const base = materializeOrder(order);
  const extra = listOf(incoming).map(it => newKitchenLine(it, qtyOf(it) || 1, now));
  if (extra.length === 0) return order;
  return finishOpenUpdate(base, [...orderLines(base).map(l => l.item), ...extra], now);
}

// =========================================================
// XABARLAR (ofitsiant/kassir paneli va oshxona)
// =========================================================

export type NoticeKind = 'rejections' | 'cancellations' | 'ready';

/** Xabar ko'rildi (✓): yozuvlarga ackAt va ackBy qo'yiladi */
export function ackNotices(order: Order, kind: NoticeKind, by: string, now: number): Order {
  if (kind === 'ready') {
    const rn = order.readyNotice;
    if (!isObj(rn) || rn.ackAt) return order;
    return { ...order, readyNotice: { ...rn, ackAt: now, ackBy: by } };
  }
  const key = kind === 'rejections' ? 'kitchenRejections' : 'kitchenCancellations';
  const list = Array.isArray(order[key]) ? (order[key] as unknown[]) : [];
  if (!list.some(r => isObj(r) && !r.ackAt)) return order;
  return { ...order, [key]: list.map(r => (isObj(r) && !r.ackAt ? { ...r, ackAt: now, ackBy: by } : r)) };
}

export interface NoticeLine {
  name: string;
  qty: number;
}

export interface StaffNotice {
  key: string;
  orderId: string;
  table: string;
  kind: 'rejected' | 'ready';
  at: number;
  lines: NoticeLine[];
  reasons: string[];
  by: string;
  refundDue: number;
  paid: boolean;
}

const groupLines = (records: Dict[]): NoticeLine[] => {
  const map = new Map<string, number>();
  records.forEach(r => {
    const name = str(r.name) || 'Taom';
    map.set(name, (map.get(name) || 0) + Math.max(0, Math.floor(num(r.qty))));
  });
  return [...map.entries()].map(([name, qty]) => ({ name, qty }));
};

const unique = (list: string[]): string[] => [...new Set(list.filter(Boolean))];

/**
 * Ofitsiant/kassir/admin uchun: oshxona rad etgan taomlar (ko'rilmagan) va
 * oshxona tugatmasdan to'langan chek tayyor bo'lgani. Eng yangisi tepada.
 */
export function collectStaffNotices(orders: unknown, now: number, maxAgeMs = 12 * HOUR_MS): StaffNotice[] {
  const out: StaffNotice[] = [];
  listOf(orders).forEach(o => {
    const orderId = str(o.id);
    const table = str(o.table) || 'Stol';
    const paid = CLOSED.includes(statusOf(o)) && statusOf(o) !== ORDER_STATUS.CANCELLED;
    const fresh = listOf(o.kitchenRejections).filter(r => !r.ackAt && now - num(r.at) < maxAgeMs);
    if (fresh.length > 0) {
      out.push({
        key: `${orderId}:rejected`,
        orderId,
        table,
        kind: 'rejected',
        at: Math.max(...fresh.map(r => num(r.at))),
        lines: groupLines(fresh),
        reasons: unique(fresh.map(r => str(r.reason))),
        by: unique(fresh.map(r => str(r.by))).join(', '),
        refundDue: fresh.reduce((s, r) => s + num(r.refundDue), 0),
        paid
      });
    }
    const rn = o.readyNotice;
    if (isObj(rn) && !rn.ackAt && paid && now - num(rn.at) < maxAgeMs) {
      out.push({
        key: `${orderId}:ready`,
        orderId,
        table,
        kind: 'ready',
        at: num(rn.at),
        lines: groupLines(orderLines(o)
          .filter(({ item }) => isKitchenItem(item) && readyQtyOf(item, o) > 0)
          .map(({ item }) => ({ name: item.name, qty: readyQtyOf(item, o) }))),
        reasons: [],
        by: '',
        refundDue: 0,
        paid
      });
    }
  });
  return out.sort((a, b) => b.at - a.at);
}

export interface KitchenCancelNotice {
  orderId: string;
  table: string;
  at: number;
  lines: NoticeLine[];
  by: string;
  reasons: string[];
}

/** Oshxona uchun: xodim bekor qilgan, oshxonada turgan taomlar (ko'rilmagan) */
export function collectKitchenCancellations(orders: unknown, now: number, maxAgeMs = 6 * HOUR_MS): KitchenCancelNotice[] {
  const out: KitchenCancelNotice[] = [];
  listOf(orders).forEach(o => {
    const fresh = listOf(o.kitchenCancellations).filter(r => !r.ackAt && now - num(r.at) < maxAgeMs);
    if (fresh.length === 0) return;
    out.push({
      orderId: str(o.id),
      table: str(o.table) || 'Stol',
      at: Math.max(...fresh.map(r => num(r.at))),
      lines: groupLines(fresh),
      by: unique(fresh.map(r => str(r.by))).join(', '),
      reasons: unique(fresh.map(r => str(r.reason)))
    });
  });
  return out.sort((a, b) => b.at - a.at);
}

/** Ochiq chekdagi ko'rilmagan rad etishlar soni (stol kartochkasidagi belgi) */
export const unackedRejections = (order: unknown): number =>
  isObj(order) ? listOf(order.kitchenRejections).filter(r => !r.ackAt).length : 0;
