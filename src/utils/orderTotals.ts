// Buyurtma summasini hisoblashning YAGONA joyi (B10).
// Pul butun so'mda hisoblanadi.

import { isNoServiceFeeTable } from '../constants/orderStatus';

/** Chekdagi taom (eski yozuvlarda qty yoki variants[0].price bo'lishi mumkin) */
export interface OrderItemLike {
  quantity?: unknown;
  qty?: unknown;
  price?: unknown;
  variants?: ReadonlyArray<{ price?: unknown }> | null;
}

/** Buyurtma (faqat summa uchun kerakli maydonlar; eski nomlar ham) */
export interface OrderLike {
  items?: ReadonlyArray<OrderItemLike | null | undefined>;
  table?: string;
  serviceFee?: number;
  serviceFeePercent?: number;
  discountAmount?: number;
  discount?: number;
  usedBonus?: number;
}

export interface OrderTotalsInput {
  items?: ReadonlyArray<OrderItemLike | null | undefined> | null;
  serviceFeePercent?: unknown;
  table?: string;
  discountAmount?: unknown;
  usedBonus?: unknown;
}

export interface OrderTotals {
  subTotal: number;
  serviceFee: number;
  serviceFeeAmount: number;
  discountAmount: number;
  usedBonus: number;
  total: number;
}

export interface OrderTotalsFields {
  subTotal: number;
  serviceFee: number;
  serviceFeeAmount: number;
  total: number;
  subtotal: number;
  serviceFeePercent: number;
  finalTotal: number;
}

export const getItemQty = (item: OrderItemLike | null | undefined): number => {
  const q = Number(item?.quantity ?? item?.qty ?? 1);
  return Number.isFinite(q) && q > 0 ? q : 0;
};

export const getItemPrice = (item: OrderItemLike | null | undefined): number =>
  Number(item?.price ?? item?.variants?.[0]?.price ?? 0) || 0;

/**
 * items - buyurtmadagi taomlar; serviceFeePercent - xizmat haqi foizi;
 * table - 'Olib ketish' yoki 'Yetkazish #N' bo'lsa xizmat haqi 0;
 * discountAmount - chegirma (so'm); usedBonus - ishlatilgan bonus (so'm)
 */
export function calcOrderTotals({
  items,
  serviceFeePercent = 0,
  table,
  discountAmount = 0,
  usedBonus = 0
}: OrderTotalsInput = {}): OrderTotals {
  const list = Array.isArray(items) ? items : [];
  const subTotal = Math.round(
    list.reduce<number>((sum, it) => (it ? sum + getItemPrice(it) * getItemQty(it) : sum), 0)
  );
  const feePct = isNoServiceFeeTable(table) ? 0 : Math.max(0, Number(serviceFeePercent) || 0);
  const serviceFeeAmount = Math.round((subTotal * feePct) / 100);
  const gross = subTotal + serviceFeeAmount;
  const discount = Math.min(gross, Math.max(0, Math.round(Number(discountAmount) || 0)));
  const bonus = Math.min(gross - discount, Math.max(0, Math.round(Number(usedBonus) || 0)));
  const total = gross - discount - bonus;

  return { subTotal, serviceFee: feePct, serviceFeeAmount, discountAmount: discount, usedBonus: bonus, total };
}

/**
 * Buyurtma obyektiga yoziladigan summa maydonlari.
 * Eski nomlar (subtotal, finalTotal, serviceFeePercent) hozircha bir xil qiymat bilan
 * yoziladi: ko'p komponentlar avval eski nomni o'qiydi va eskirgan qiymat qolib ketmasin.
 * 2-bosqichdagi migratsiyadan keyin olib tashlanadi.
 */
export function orderTotalsFields(
  order: OrderLike | null | undefined,
  items: OrderTotalsInput['items'] = order?.items,
  serviceFeePercent?: unknown
): OrderTotalsFields {
  const pct = serviceFeePercent ?? order?.serviceFee ?? order?.serviceFeePercent ?? 0;
  const t = calcOrderTotals({
    items,
    serviceFeePercent: pct,
    table: order?.table,
    discountAmount: order?.discountAmount ?? order?.discount ?? 0,
    usedBonus: order?.usedBonus ?? 0
  });

  return {
    subTotal: t.subTotal,
    serviceFee: t.serviceFee,
    serviceFeeAmount: t.serviceFeeAmount,
    total: t.total,
    // eski maydonlar (faqat moslik uchun)
    subtotal: t.subTotal,
    serviceFeePercent: t.serviceFee,
    finalTotal: t.total
  };
}
