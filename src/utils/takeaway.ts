// "Olib ketish": bir vaqtda bir nechta ochiq chek (7-bosqich, 3-qism, 6-qadam).
//
// Barcha olib ketish cheklari avvalgidek bitta "Olib ketish" stolida (xizmat haqi yo'q, QR serverda band
// emas, statistika o'zgarmaydi), lekin har biri o'z kunlik raqamini oladi (takeawayNo: #1, #2 ...).
// Ofitsiant ekranida har bir ochiq chek alohida karta, chek id si bo'yicha tanlanadi (stol nomi bilan emas).

import { CLOSED_ORDER_STATUSES, TAKEAWAY_TABLE } from '../constants/orderStatus';

type Dict = Record<string, unknown>;

const isObj = (x: unknown): x is Dict => x !== null && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};
const CLOSED: readonly string[] = CLOSED_ORDER_STATUSES;

export const isTakeawayTable = (table: unknown): boolean => String(table ?? '') === TAKEAWAY_TABLE;

/** Ochiq olib ketish cheklari (eng eskisi birinchi) */
export function openTakeawayOrders(orders: unknown): Dict[] {
  return (Array.isArray(orders) ? orders : [])
    .filter((o): o is Dict => isObj(o) && isTakeawayTable(o.table) && !CLOSED.includes(String(o.status ?? '')))
    .sort((a, b) => num(a.createdAt) - num(b.createdAt));
}

const dayStart = (ms: number): number => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Bugungi keyingi raqam (har kuni 1 dan boshlanadi) */
export function nextTakeawayNo(orders: unknown, nowMs: number = Date.now()): number {
  const start = dayStart(nowMs);
  const max = (Array.isArray(orders) ? orders : [])
    .filter((o): o is Dict => isObj(o) && isTakeawayTable(o.table) && num(o.createdAt) >= start)
    .reduce((m, o) => Math.max(m, num(o.takeawayNo)), 0);
  return max + 1;
}

/** Ekranda ko'rinadigan nom: "Olib ketish #3" (raqam bo'lsa) */
export function orderLabel(order: unknown): string {
  if (!isObj(order)) return '';
  const table = String(order.table ?? '');
  const no = num(order.takeawayNo);
  return isTakeawayTable(table) && no > 0 ? `${table} #${no}` : table;
}
