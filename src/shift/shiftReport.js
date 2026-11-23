// Smena (kassa smenasi) va Z-hisobot hisob-kitobi. Sof funksiyalar: UI ga bog'liq emas.
//
// "Joriy smena" ma'lumotlari avvalgidek: arxivlanmagan to'langan cheklar va xarajatlar.
// Smena yopilganda ular arxivga o'tadi (statistika bo'limi shunga tayanadi).
import { ORDER_STATUS, PAYMENT_METHOD } from '../constants/orderStatus';

const num = (x) => Number(x) || 0;
const orderAmount = (o) => num(o?.total ?? o?.finalTotal);

export const getOpenShift = (shifts) =>
  (Array.isArray(shifts) ? shifts : []).find(s => s && s.status === 'open') || null;

export const getLastClosedShift = (shifts) =>
  (Array.isArray(shifts) ? shifts : [])
    .filter(s => s && s.status === 'closed')
    .sort((a, b) => num(b.closedAt) - num(a.closedAt))[0] || null;

/**
 * Smena hisobotini hisoblaydi.
 * @param {object} p
 * @param {Array} p.orders    barcha buyurtmalar
 * @param {Array} p.expenses  barcha xarajatlar
 * @param {number} p.openingCash smena boshidagi naqd pul
 * @param {number} p.openedAt   smena ochilgan vaqt (ms); shu vaqtdan keyingi qarzlar hisoblanadi
 */
export function computeShiftReport({ orders, expenses, openingCash = 0, openedAt = 0 }) {
  const list = Array.isArray(orders) ? orders.filter(Boolean) : [];
  const paid = list.filter(o => o.status === ORDER_STATUS.PAID);
  const exps = (Array.isArray(expenses) ? expenses : []).filter(e => e && e.status !== ORDER_STATUS.ARCHIVED);

  const byMethod = { Naqd: 0, Plastik: 0, Click: 0, Payme: 0, Aralash: 0 };
  let cashIn = 0;
  let cardIn = 0;
  let subTotal = 0;
  let serviceFee = 0;
  let discount = 0;
  let bonus = 0;
  let revenue = 0;
  const debtCollected = { count: 0, sum: 0 };

  paid.forEach(o => {
    const amount = orderAmount(o);
    revenue += amount;
    subTotal += num(o.subTotal ?? o.subtotal);
    serviceFee += num(o.serviceFeeAmount);
    discount += num(o.discountAmount ?? o.discount);
    bonus += num(o.usedBonus);
    if (o.wasDebt) {
      debtCollected.count += 1;
      debtCollected.sum += amount;
    }

    const method = o.paymentMethod;
    if (method === PAYMENT_METHOD.MIXED) {
      const c = num(o.paymentDetails?.cashAmount ?? o.mixedDetails?.cash);
      const k = num(o.paymentDetails?.cardAmount ?? o.mixedDetails?.card);
      byMethod.Aralash += amount;
      cashIn += c;
      cardIn += k;
    } else if (method === PAYMENT_METHOD.CASH) {
      byMethod.Naqd += amount;
      cashIn += amount;
    } else if ([PAYMENT_METHOD.CARD, PAYMENT_METHOD.CLICK, PAYMENT_METHOD.PAYME].includes(method)) {
      byMethod[method] += amount;
      cardIn += amount;
    }
  });

  const debtsIssued = list.filter(o => o.status === ORDER_STATUS.DEBT && num(o.closedAtMs) >= num(openedAt));
  const debtIssued = { count: debtsIssued.length, sum: debtsIssued.reduce((s, o) => s + orderAmount(o), 0) };

  const expenseSummary = { count: exps.length, cash: 0, card: 0, inkassatsiya: 0 };
  exps.forEach(e => {
    const amt = num(e.amount);
    if (e.paymentSource === 'Plastik') expenseSummary.card += amt;
    else expenseSummary.cash += amt;
    if (e.isInkassatsiya || e.category === 'Inkassatsiya') expenseSummary.inkassatsiya += amt;
  });

  const opening = Math.max(0, Math.round(num(openingCash)));
  return {
    ordersCount: paid.length,
    revenue: Math.round(revenue),
    subTotal: Math.round(subTotal),
    serviceFee: Math.round(serviceFee),
    discount: Math.round(discount),
    bonus: Math.round(bonus),
    byMethod,
    cashIn: Math.round(cashIn),
    cardIn: Math.round(cardIn),
    debtIssued,
    debtCollected,
    expenses: expenseSummary,
    openingCash: opening,
    // Kassada bo'lishi kerak: boshlang'ich + naqd tushum - naqd chiqim (inkassatsiya ham chiqim)
    expectedCash: Math.round(opening + cashIn - expenseSummary.cash)
  };
}

const money = (x) => `${Math.round(num(x)).toLocaleString('ru-RU').replace(/ /g, ' ')} so'm`;
// Chiqim: nol bo'lsa "-0" emas, "0" ko'rinsin
const minus = (x) => (Math.round(num(x)) > 0 ? `-${money(x)}` : money(0));
const dt = (ms) => (ms ? new Date(ms).toLocaleString() : '—');

/** Hisobot qatorlari (Telegram va chop etish uchun umumiy). [label, value] juftliklari. */
export function shiftReportRows(shift) {
  const r = shift?.report || {};
  const diff = num(shift?.difference);
  return [
    ['Smena', `${dt(shift?.openedAt)} — ${dt(shift?.closedAt)}`],
    ['Ochdi / Yopdi', `${shift?.openedBy || '—'} / ${shift?.closedBy || '—'}`],
    ['Cheklar soni', `${r.ordersCount || 0} ta`],
    ['JAMI TUSHUM', money(r.revenue)],
    ['  Xizmat haqi', money(r.serviceFee)],
    ['  Chegirmalar', minus(r.discount)],
    ['  Bonus bilan to\'langan', minus(r.bonus)],
    ['Naqd', money(r.byMethod?.Naqd)],
    ['Plastik', money(r.byMethod?.Plastik)],
    ['Click', money(r.byMethod?.Click)],
    ['Payme', money(r.byMethod?.Payme)],
    ['Aralash', money(r.byMethod?.Aralash)],
    ['Qarzga berildi', `${r.debtIssued?.count || 0} ta, ${money(r.debtIssued?.sum)}`],
    ['Qarz qaytarildi', `${r.debtCollected?.count || 0} ta, ${money(r.debtCollected?.sum)}`],
    ['Xarajatlar (naqd)', minus(r.expenses?.cash)],
    ['Xarajatlar (karta)', minus(r.expenses?.card)],
    ['  shundan inkassatsiya', money(r.expenses?.inkassatsiya)],
    ['Boshlang\'ich naqd', money(r.openingCash)],
    ['KASSADA BO\'LISHI KERAK', money(shift?.expectedCash ?? r.expectedCash)],
    ['SANALGAN NAQD', money(shift?.countedCash)],
    ['FARQ', diff === 0 ? '0 (to\'g\'ri)' : `${diff > 0 ? '+' : '-'}${money(Math.abs(diff))} ${diff > 0 ? '(ortiqcha)' : '(kamomad)'}`]
  ];
}

const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function shiftTelegramLines(shift, cafeName) {
  return [
    `📊 <b>Z-HISOBOT: SMENA YOPILDI</b>`,
    `🏪 <b>Kafe:</b> ${escapeHtml(cafeName)}`,
    `━━━━━━━━━━━━━━━━━━`,
    ...shiftReportRows(shift).map(([k, v]) => `<b>${escapeHtml(k.trim())}:</b> ${escapeHtml(v)}`)
  ];
}

/** Chop etish uchun oddiy HTML (58/80 mm chek printeriga mos) */
export function shiftReportHtml(shift, cafeName) {
  const rows = shiftReportRows(shift)
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td class="v">${escapeHtml(v)}</td></tr>`)
    .join('');
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>Z-hisobot</title>
<style>body{font-family:monospace;font-size:12px;width:72mm;margin:0 auto;padding:4mm}
h1{font-size:14px;text-align:center;margin:0 0 2mm}p{text-align:center;margin:0 0 3mm}
table{width:100%;border-collapse:collapse}td{padding:1px 0;vertical-align:top}td.v{text-align:right;white-space:nowrap}
tr:nth-child(4) td,tr:nth-child(19) td,tr:nth-child(20) td,tr:nth-child(21) td{font-weight:bold;border-top:1px dashed #000}</style>
</head><body><h1>${escapeHtml(cafeName)}</h1><p>Z-HISOBOT</p><table>${rows}</table></body></html>`;
}
