// Buyurtma summasini hisoblashning YAGONA joyi (B10).
// Pul butun so'mda hisoblanadi.

const TAKEAWAY_TABLE = 'Olib ketish';

export const getItemQty = (item) => {
  const q = Number(item?.quantity ?? item?.qty ?? 1);
  return Number.isFinite(q) && q > 0 ? q : 0;
};

export const getItemPrice = (item) =>
  Number(item?.price ?? item?.variants?.[0]?.price ?? 0) || 0;

/**
 * @param {object} p
 * @param {Array}  p.items              buyurtmadagi taomlar
 * @param {number} p.serviceFeePercent  xizmat haqi foizi
 * @param {string} [p.table]            'Olib ketish' bo'lsa xizmat haqi 0
 * @param {number} [p.discountAmount]   chegirma (so'm)
 * @param {number} [p.usedBonus]        ishlatilgan bonus (so'm)
 */
export function calcOrderTotals({
  items,
  serviceFeePercent = 0,
  table,
  discountAmount = 0,
  usedBonus = 0
} = {}) {
  const list = Array.isArray(items) ? items : [];
  const subTotal = Math.round(
    list.reduce((sum, it) => (it ? sum + getItemPrice(it) * getItemQty(it) : sum), 0)
  );
  const feePct = table === TAKEAWAY_TABLE ? 0 : Math.max(0, Number(serviceFeePercent) || 0);
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
export function orderTotalsFields(order, items = order?.items, serviceFeePercent) {
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
