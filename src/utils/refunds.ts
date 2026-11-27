// To'langan chekdan oshxona rad etgan taom puli: kassada "Qaytarish" (7-bosqich, 3-qism, 5-qadam).
//
// Oshxona to'langan chekdagi taomni rad etsa (kitchenFlow.rejectLines), chekda refundDue (qaytariladigan
// pul) va rad etish yozuvida refundDue paydo bo'ladi. Kassir "💸 Qaytarish" bosadi:
//  - chekka refunds [{ id, amount, method, by, at, shiftId, restocked }] yoziladi (chek summasi o'zgarmaydi:
//    to'lov bo'lgan, qaytarish alohida harakat);
//  - kassa xarajati "Qaytarish" (Naqd - seyfdagi kutilgan naqdni kamaytiradi, Z-hisobotga kiradi);
//  - rad etilgan taom masalliqlari omborga qaytadi (to'lovda ayirilgan edi, taom tayyorlanmagan).

type Dict = Record<string, unknown>;

export const REFUND_CATEGORY = 'Qaytarish';
export const REFUND_METHODS = ['Naqd', 'Plastik', 'Click', 'Payme'] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

export interface RefundRecord {
  id: string;
  amount: number;
  method: RefundMethod;
  by: string;
  at: number;
  shiftId: string;
  restocked: boolean;
  /** qaysi rad etish yozuvlari uchun */
  rejectionIds: string[];
}

export interface RestockLine {
  rejectionId: string;
  id: unknown;
  name: string;
  price: number;
  quantity: number;
}

export interface PendingRefund {
  orderId: string;
  table: string;
  waiter: string;
  paymentMethod: string;
  due: number;
  refunded: number;
  pending: number;
  lines: { name: string; qty: number; reason: string }[];
  at: number;
}

const isObj = (x: unknown): x is Dict => x !== null && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};
const str = (x: unknown): string => (x === undefined || x === null ? '' : String(x));
const list = (x: unknown): Dict[] => (Array.isArray(x) ? x.filter(isObj) : []);

export const refundDueOf = (order: unknown): number => (isObj(order) ? Math.max(0, Math.round(num(order.refundDue))) : 0);
export const refundedOf = (order: unknown): number =>
  isObj(order) ? list(order.refunds).reduce((s, r) => s + Math.max(0, num(r.amount)), 0) : 0;
export const pendingRefundOf = (order: unknown): number => Math.max(0, refundDueOf(order) - refundedOf(order));

/** Qaytarilishi kerak bo'lgan cheklar (eng yangi rad etish birinchi) */
export function collectPendingRefunds(orders: unknown): PendingRefund[] {
  return (Array.isArray(orders) ? orders : [])
    .filter(isObj)
    .map(o => {
      const pending = pendingRefundOf(o);
      if (pending <= 0) return null;
      const rej = list(o.kitchenRejections).filter(r => num(r.refundDue) > 0);
      return {
        orderId: str(o.id),
        table: str(o.table) || '—',
        waiter: str(o.waiter),
        paymentMethod: str(o.paymentMethod),
        due: refundDueOf(o),
        refunded: refundedOf(o),
        pending,
        lines: rej.map(r => ({ name: str(r.name) || 'Taom', qty: Math.max(0, num(r.qty)), reason: str(r.reason) })),
        at: rej.reduce((m, r) => Math.max(m, num(r.at)), 0)
      };
    })
    .filter((x): x is PendingRefund => x !== null)
    .sort((a, b) => b.at - a.at);
}

/** Omborga qaytariladigan taomlar: to'langan chekdan rad etilgan va hali qaytarilmagan porsiyalar */
export function restockLinesOf(order: unknown): RestockLine[] {
  if (!isObj(order) || order.inventoryDeducted === false) return [];
  return list(order.kitchenRejections)
    .filter(r => num(r.refundDue) > 0 && !r.restockedAt)
    .map(r => ({
      rejectionId: str(r.id),
      id: r.menuId ?? null,
      name: str(r.name) || 'Taom',
      price: num(r.price),
      quantity: Math.max(0, num(r.qty))
    }))
    .filter(l => l.quantity > 0);
}

/** Qaytarish usuli: chek qanday to'langan bo'lsa (aralash yoki noma'lum - naqd) */
export const defaultRefundMethod = (paymentMethod: unknown): RefundMethod => {
  const m = str(paymentMethod);
  return (REFUND_METHODS as readonly string[]).includes(m) ? (m as RefundMethod) : 'Naqd';
};

/**
 * Chekka qaytarishni yozish (eng so'nggi holatiga). amount ko'pi bilan qolgan qarzga teng.
 * restockedIds - masalliqlari omborga qaytgan rad etish yozuvlari (qayta qaytarilmaydi).
 */
export function applyRefund(
  order: Dict,
  refund: Omit<RefundRecord, 'amount'> & { amount: number },
  restockedIds: readonly string[] = []
): { order: Dict; amount: number } {
  const amount = Math.min(Math.max(0, Math.round(num(refund.amount))), pendingRefundOf(order));
  if (amount <= 0) return { order, amount: 0 };
  const ids = new Set(restockedIds);
  return {
    order: {
      ...order,
      refunds: [...list(order.refunds), { ...refund, amount }],
      kitchenRejections: list(order.kitchenRejections).map(r =>
        ids.has(str(r.id)) && !r.restockedAt ? { ...r, restockedAt: refund.at } : r
      )
    },
    amount
  };
}

/** Kassa xarajati yozuvi (smena hisobotiga kiradi: Naqd - seyfdagi naqddan, qolganlari - kartadan) */
export function refundExpense(order: Dict, refund: RefundRecord, cashierName: string): Dict {
  const lines = list(order.kitchenRejections)
    .filter(r => refund.rejectionIds.includes(str(r.id)))
    .map(r => `${num(r.qty)}× ${str(r.name)}`)
    .join(', ');
  return {
    id: `exp_${refund.id}`,
    date: new Date(refund.at).toLocaleString(),
    createdAt: refund.at,
    category: REFUND_CATEGORY,
    categoryLabel: "💸 Mijozga qaytarish (oshxona rad etgan taom)",
    isInkassatsiya: false,
    isRefund: true,
    orderId: str(order.id),
    amount: refund.amount,
    paymentSource: refund.method === 'Naqd' ? 'Naqd' : 'Plastik',
    refundMethod: refund.method,
    recipient: `Mijoz (${str(order.table) || '—'})`,
    note: `Qaytarish: ${lines || 'rad etilgan taom'} (${refund.method})`,
    cashierName,
    shiftId: refund.shiftId,
    status: 'Faol'
  };
}
