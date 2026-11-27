// "Rad etilgan va bekor qilingan taomlar" hisoboti (7-bosqich, 3-qism, 2-qadam).
//
// Manba (chek yozuvlari, src/utils/kitchenFlow.ts):
//  - order.kitchenRejections - oshxona rad etgan porsiyalar (sabab, oshpaz, narx, to'langan chekda qaytariladigan pul);
//  - order.voids - xodim olib tashlagan porsiyalar (ofitsiant/kassir, PIN bilan): narx, sabab, kim, tayyor bo'lganmi;
//  - eski (voids yozilmagan) "Bekor qilindi" chek: qatorlari, cancelReason, cancelledBy, cancelledAt dan.
// Vaqt - hodisa vaqti (at), chek ochilgan vaqt emas.

type Dict = Record<string, unknown>;

export type LossKind = 'rejected' | 'void';

export interface LossEntry {
  id: string;
  kind: LossKind;
  at: number;
  orderId: string;
  table: string;
  waiter: string;
  name: string;
  qty: number;
  price: number;
  amount: number;
  reason: string;
  /** rad etgan oshpaz yoki olib tashlagan xodim */
  by: string;
  /** xodim olib tashlaganda allaqachon tayyor bo'lgan porsiya (isrof) */
  cookedQty: number;
  /** to'langan chekdan rad etilgan taom: mijozga qaytariladigan pul */
  refundDue: number;
}

export interface LossGroup {
  key: string;
  qty: number;
  amount: number;
  count: number;
}

export interface LossSummary {
  rejected: { qty: number; amount: number; count: number };
  voided: { qty: number; amount: number; count: number; cookedQty: number };
  totalAmount: number;
  refundDue: number;
  byReason: LossGroup[];
  byCook: LossGroup[];
  byStaff: LossGroup[];
  byWaiter: LossGroup[];
  byDish: LossGroup[];
}

const CANCELLED_STATUS = 'Bekor qilindi'; // src/constants/orderStatus.js -> ORDER_STATUS.CANCELLED

const isObj = (x: unknown): x is Dict => x !== null && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};
const str = (x: unknown): string => (x === undefined || x === null ? '' : String(x));
const list = (x: unknown): Dict[] => (Array.isArray(x) ? x.filter(isObj) : []);

/** Sabab matnidan qisqa nom: "Taom qolmadi (izoh)" -> "Taom qolmadi"; PIN tasdig'i qo'shimchasi olib tashlanadi */
export function reasonKey(reason: unknown): string {
  const r = str(reason).replace(/\s*\(Tasdiqladi:[^)]*\)\s*$/u, '').trim();
  if (!r) return "Sabab yozilmagan";
  const head = r.replace(/\s*\(.*$/u, '').trim();
  return head || r;
}

const itemQty = (it: Dict): number => Math.max(0, num(it.quantity ?? it.qty ?? 1));
const itemPrice = (it: Dict): number => num(it.price ?? (Array.isArray(it.variants) ? (it.variants[0] as Dict | undefined)?.price : 0));

/** Davrdagi barcha yo'qotish yozuvlari (eng yangisi birinchi). range berilmasa - hammasi */
export function collectLosses(orders: unknown, range?: { startMs: number; endMs: number } | null): LossEntry[] {
  const out: LossEntry[] = [];
  const inRange = (at: number) => !range || (at >= range.startMs && at <= range.endMs);

  (Array.isArray(orders) ? orders : []).filter(isObj).forEach(order => {
    const base = {
      orderId: str(order.id),
      table: str(order.table) || '—',
      waiter: str(order.waiter) || '—'
    };

    list(order.kitchenRejections).forEach((r, i) => {
      const at = num(r.at);
      if (!inRange(at)) return;
      const qty = Math.max(0, num(r.qty));
      const price = num(r.price);
      out.push({
        ...base,
        id: str(r.id) || `${base.orderId}_rej${i}`,
        kind: 'rejected',
        at,
        name: str(r.name) || 'Taom',
        qty,
        price,
        amount: Math.round(qty * price),
        reason: str(r.reason),
        by: str(r.by) || 'Oshxona',
        cookedQty: 0,
        refundDue: Math.max(0, num(r.refundDue))
      });
    });

    if (Array.isArray(order.voids)) {
      list(order.voids).forEach((v, i) => {
        const at = num(v.at);
        if (!inRange(at)) return;
        const qty = Math.max(0, num(v.qty));
        const price = num(v.price);
        out.push({
          ...base,
          id: str(v.id) || `${base.orderId}_void${i}`,
          kind: 'void',
          at,
          name: str(v.name) || 'Taom',
          qty,
          price,
          amount: Math.round(qty * price),
          reason: str(v.reason),
          by: str(v.by) || '—',
          cookedQty: Math.min(qty, Math.max(0, num(v.cookedQty))),
          refundDue: 0
        });
      });
    } else if (str(order.status) === CANCELLED_STATUS) {
      // Eski yozuv (voids yo'q): bekor qilingan chekning qatorlari
      const at = num(order.cancelledAt) || num(order.createdAt);
      if (!inRange(at)) return;
      list(order.items).filter(it => !it.isDeliveryFee).forEach((it, i) => {
        const qty = itemQty(it);
        if (qty <= 0) return;
        const price = itemPrice(it);
        out.push({
          ...base,
          id: `${base.orderId}_old${i}`,
          kind: 'void',
          at,
          name: str(it.name) || 'Taom',
          qty,
          price,
          amount: Math.round(qty * price),
          reason: str(order.cancelReason),
          by: str(order.cancelledBy) || '—',
          cookedQty: Math.min(qty, Math.max(0, num(it.kitchenDoneQty))),
          refundDue: 0
        });
      });
    }
  });

  return out.sort((a, b) => b.at - a.at);
}

const group = (entries: readonly LossEntry[], keyOf: (e: LossEntry) => string): LossGroup[] => {
  const map = new Map<string, LossGroup>();
  entries.forEach(e => {
    const key = keyOf(e) || '—';
    const g = map.get(key) || { key, qty: 0, amount: 0, count: 0 };
    g.qty += e.qty;
    g.amount += e.amount;
    g.count += 1;
    map.set(key, g);
  });
  return [...map.values()].sort((a, b) => b.amount - a.amount || b.qty - a.qty);
};

export function summarizeLosses(entries: readonly LossEntry[]): LossSummary {
  const rej = entries.filter(e => e.kind === 'rejected');
  const voids = entries.filter(e => e.kind === 'void');
  const sum = (l: readonly LossEntry[], f: (e: LossEntry) => number) => l.reduce((s, e) => s + f(e), 0);
  return {
    rejected: { qty: sum(rej, e => e.qty), amount: sum(rej, e => e.amount), count: rej.length },
    voided: { qty: sum(voids, e => e.qty), amount: sum(voids, e => e.amount), count: voids.length, cookedQty: sum(voids, e => e.cookedQty) },
    totalAmount: sum(entries, e => e.amount),
    refundDue: sum(rej, e => e.refundDue),
    byReason: group(entries, e => `${e.kind === 'rejected' ? '❌' : '🚫'} ${reasonKey(e.reason)}`),
    byCook: group(rej, e => e.by),
    byStaff: group(voids, e => e.by),
    byWaiter: group(entries, e => e.waiter),
    byDish: group(entries, e => e.name)
  };
}

const money = (x: number): string => `${Math.round(x).toLocaleString('ru-RU').replace(/ /g, ' ')} so'm`;
const esc = (s: unknown): string => str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const top = (groups: readonly LossGroup[], n = 5): string[] =>
  groups.slice(0, n).map(g => `  • ${esc(g.key)}: ${g.qty} pors, ${money(g.amount)}`);

/** Telegram xabari (HTML qatorlari): Z-hisobotdan keyin va "Telegramga yuborish" tugmasida */
export function lossTelegramLines(summary: LossSummary, periodLabel: string, cafeName: string): string[] {
  if (summary.rejected.count === 0 && summary.voided.count === 0) {
    return [
      `✅ <b>RAD ETILGAN VA BEKOR QILINGAN TAOMLAR</b> (${esc(cafeName)})`,
      `🗓 ${esc(periodLabel)}: yo'q`
    ];
  }
  return [
    `🧾 <b>RAD ETILGAN VA BEKOR QILINGAN TAOMLAR</b> (${esc(cafeName)})`,
    `🗓 ${esc(periodLabel)}`,
    `━━━━━━━━━━━━━━━━━━`,
    `❌ <b>Oshxona rad etdi:</b> ${summary.rejected.qty} pors, ${money(summary.rejected.amount)}`,
    `🚫 <b>Xodim bekor qildi:</b> ${summary.voided.qty} pors, ${money(summary.voided.amount)}` +
      (summary.voided.cookedQty > 0 ? ` (tayyor bo'lgani: ${summary.voided.cookedQty} pors)` : ''),
    summary.refundDue > 0 ? `💸 <b>To'langan chekdan qaytariladi:</b> ${money(summary.refundDue)}` : '',
    `💰 <b>Jami:</b> ${money(summary.totalAmount)}`,
    summary.byReason.length ? '<b>Sabablar:</b>' : '',
    ...top(summary.byReason),
    summary.byCook.length ? '<b>Oshpaz (rad etgan):</b>' : '',
    ...top(summary.byCook, 3),
    summary.byStaff.length ? '<b>Xodim (bekor qilgan):</b>' : '',
    ...top(summary.byStaff, 3),
    summary.byDish.length ? '<b>Taomlar:</b>' : '',
    ...top(summary.byDish)
  ].filter(Boolean);
}
