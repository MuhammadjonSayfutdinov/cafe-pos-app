// Ikki qurilma bir chekni bir vaqtda o'zgartirsa - ikkala o'zgarish ham saqlanadi (7-bosqich, 3-qism, 3-qadam).
//
// Oldin chek yozuvi butunligicha "oxirgi yozuv g'olib" edi: oshpaz taomni "tayyor" deb belgilagan paytda
// ofitsiant dozakaz yuborsa, ikkisidan biri yo'qolardi.
//
// Endi har bir yuborilgan chek versiyasida kelib chiqish belgisi bor (src/sync/engine.js qo'yadi):
//   _rev  - shu versiya kaliti, _revs - ota-bobolari (oxirgi 16 tasi).
// Qurilma serverdan chek olganda bilgan versiyasi bilan solishtiradi (relationOf):
//   'newer'      - yangi versiya shu qurilma bilganidan kelib chiqqan: oddiy qabul (yuborilmagan
//                  mahalliy o'zgarish bo'lsa - ikkalasi birlashtiriladi);
//   'older'/'same' - eskirgan (kechikkan) xabar: e'tiborsiz (oldin eski versiya yangisini bosib ketardi);
//   'concurrent' - ikki qurilma bir xil asosdan alohida o'zgartirgan: mergeOrder3 bilan birlashtirib,
//                  natija serverga qayta yuboriladi.
// Birlashtirish taom (chek qatori) darajasida: porsiya hisoblagichlari farq (delta) bilan qo'shiladi,
// qo'shilgan qatorlar ikkalasidan olinadi, o'chirilgani o'chadi, oshxona/bekor yozuvlari id bo'yicha
// birlashadi. Natija ikki tomonda bir xil chiqadi (simmetrik): qurilmalar bir-birini cheksiz bosmaydi.

import { CLOSED_ORDER_STATUSES, ORDER_STATUS } from '../constants/orderStatus';
import { orderTotalsFields } from '../utils/orderTotals';
import type { OrderItemLike, OrderLike } from '../utils/orderTotals';
import { deriveStatus } from '../utils/kitchenFlow';

type Dict = Record<string, unknown>;

export const MAX_REVS = 16;

const CLOSED: readonly string[] = CLOSED_ORDER_STATUSES;
/** Taom qatoridagi porsiya hisoblagichlari: ikki tomon o'zgarishi qo'shiladi */
const LINE_COUNTERS = ['quantity', 'sentQty', 'kitchenDoneQty', 'servedQty'] as const;
/** Faqat qo'shiladigan yozuvlar ro'yxati (id bo'yicha) */
const RECORD_LISTS = ['kitchenRejections', 'kitchenCancellations', 'voids'] as const;
/** Ikki tomon bir vaqtda yopsa: qaysi holat ustun (pul olingani muhimroq) */
const CLOSED_RANK: Record<string, number> = {
  [ORDER_STATUS.PAID]: 4,
  [ORDER_STATUS.DEBT]: 3,
  [ORDER_STATUS.ARCHIVED]: 2,
  [ORDER_STATUS.CANCELLED]: 1
};

const isObj = (x: unknown): x is Dict => x !== null && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};
const str = (x: unknown): string => (x === undefined || x === null ? '' : String(x));
const stable = (v: unknown): string => JSON.stringify(v === undefined ? null : v);
const uniq = (list: string[]): string[] => list.filter((v, i) => v && list.indexOf(v) === i);

// ---------- versiya belgilari ----------
export const revOf = (r: unknown): string => (isObj(r) ? str(r._rev) : '');
export const ancestorsOf = (r: unknown): string[] =>
  isObj(r) && Array.isArray(r._revs) ? r._revs.map(str).filter(Boolean) : [];

export function withoutRev(r: Dict): Dict {
  const { _rev: _a, _revs: _b, ...rest } = r;
  return rest;
}

/** Mazmuni bir xilmi (versiya belgilarisiz) */
export const sameContent = (a: unknown, b: unknown): boolean =>
  stable(isObj(a) ? withoutRev(a) : a) === stable(isObj(b) ? withoutRev(b) : b);

export type Relation = 'same' | 'older' | 'newer' | 'concurrent' | 'unknown';

/** known - shu qurilma bilgan server versiyasi, incoming - serverdan kelgani */
export function relationOf(known: unknown, incoming: unknown): Relation {
  const k = revOf(known);
  const i = revOf(incoming);
  if (!k || !i) return 'unknown';
  if (k === i) return 'same';
  if (ancestorsOf(known).includes(i)) return 'older';
  if (ancestorsOf(incoming).includes(k)) return 'newer';
  return 'concurrent';
}

/** Yuborishdan oldin: yangi versiya kaliti va ota-bobolari (avval to'g'ridan-to'g'ri otalar) */
export function stampRev(data: Dict, rev: string, parents: readonly unknown[]): Dict {
  const direct = parents.map(revOf);
  const deeper = parents.flatMap(ancestorsOf);
  return { ...data, _rev: rev, _revs: uniq([...direct, ...deeper]).slice(0, MAX_REVS) };
}

/** Ikki versiyaning umumiy otasi (bilgan versiyalar ichidan): incoming ning eng yaqin otasi */
export function commonAncestor(known: unknown, incoming: unknown, has: (rev: string) => boolean): string {
  const mine = new Set([revOf(known), ...ancestorsOf(known)].filter(Boolean));
  return ancestorsOf(incoming).find(r => mine.has(r) && has(r)) || '';
}

// ---------- birlashtirish ----------
/** Bitta qiymat: kim o'zgartirgan bo'lsa o'shaniki; ikkalasi har xil o'zgartirsa - bir xil (simmetrik) tanlov */
function merge3Value(base: unknown, a: unknown, b: unknown): unknown {
  const sa = stable(a);
  const sb = stable(b);
  if (sa === sb) return a;
  if (sa === stable(base)) return b;
  if (sb === stable(base)) return a;
  return sa > sb ? a : b;
}

const qtyOf = (it: Dict): number => num(it.quantity ?? it.qty ?? 1);

/** Qatorlar kaliti bo'yicha. Kalitsiz (eski) qator bo'lsa - null: bunday chek birlashtirilmaydi */
function lineMap(order: Dict): Map<string, Dict> | null {
  const items = Array.isArray(order.items) ? order.items.filter(isObj) : [];
  const map = new Map<string, Dict>();
  for (const it of items) {
    const key = str(it.cartItemId).trim();
    if (!key || map.has(key)) return null;
    map.set(key, it);
  }
  return map;
}

function mergeLine(base: Dict, a: Dict, b: Dict): Dict {
  const out: Dict = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(a), ...Object.keys(b)]);
  keys.forEach(k => {
    if (k === 'qty' || (LINE_COUNTERS as readonly string[]).includes(k)) return;
    const v = merge3Value(base[k], a[k], b[k]);
    if (v !== undefined) out[k] = v;
  });
  const q = Math.max(0, Math.round(qtyOf(base) + (qtyOf(a) - qtyOf(base)) + (qtyOf(b) - qtyOf(base))));
  out.quantity = q;
  (['sentQty', 'kitchenDoneQty', 'servedQty'] as const).forEach(k => {
    if (base[k] === undefined && a[k] === undefined && b[k] === undefined) return;
    out[k] = Math.round(num(base[k]) + (num(a[k]) - num(base[k])) + (num(b[k]) - num(base[k])));
  });
  if (out.sentQty !== undefined) out.sentQty = Math.min(q, Math.max(0, num(out.sentQty)));
  if (out.kitchenDoneQty !== undefined) out.kitchenDoneQty = Math.min(q, Math.max(0, num(out.kitchenDoneQty)));
  if (out.servedQty !== undefined) {
    const done = out.kitchenDoneQty !== undefined ? num(out.kitchenDoneQty) : q;
    out.servedQty = Math.min(done, Math.max(0, num(out.servedQty)));
  }
  return out;
}

const sentAt = (it: Dict): number => num(it.kitchenSentAt);

/** Qatorlar: asosdagi tartib, keyin yangi qo'shilganlar (yuborilgan vaqti, keyin kaliti bo'yicha) */
function mergeLines(base: Map<string, Dict>, a: Map<string, Dict>, b: Map<string, Dict>): Dict[] {
  const out: Dict[] = [];
  base.forEach((lb, key) => {
    const la = a.get(key);
    const lc = b.get(key);
    if (!la || !lc) return; // bir tomon o'chirgan
    const merged = mergeLine(lb, la, lc);
    if (num(merged.quantity) > 0) out.push(merged);
  });
  const added = new Map<string, Dict>();
  [a, b].forEach(side => side.forEach((it, key) => {
    if (base.has(key)) return;
    const prev = added.get(key);
    added.set(key, prev ? (merge3Value(undefined, prev, it) as Dict) : it);
  }));
  [...added.entries()]
    .sort(([ka, ia], [kb, ib]) => sentAt(ia) - sentAt(ib) || (ka < kb ? -1 : ka > kb ? 1 : 0))
    .forEach(([, it]) => out.push(it));
  return out;
}

/** Faqat qo'shiladigan yozuvlar (rad etish, bekor qilish): id bo'yicha birlashma, "ko'rildi" belgisi saqlanadi */
function mergeRecords(base: unknown, a: unknown, b: unknown): Dict[] | undefined {
  if (base === undefined && a === undefined && b === undefined) return undefined;
  const list = (x: unknown) => (Array.isArray(x) ? x.filter(isObj) : []);
  const baseMap = new Map(list(base).map(r => [str(r.id), r]));
  const result = new Map<string, Dict>();
  const order: string[] = [];
  const put = (r: Dict) => {
    const id = str(r.id) || stable(r);
    const prev = result.get(id);
    if (!prev) {
      result.set(id, r);
      order.push(id);
      return;
    }
    if (sameContent(prev, r)) return;
    const b0 = baseMap.get(id) || {};
    const keys = new Set([...Object.keys(prev), ...Object.keys(r)]);
    const merged: Dict = {};
    keys.forEach(k => {
      const v = merge3Value(b0[k], prev[k], r[k]);
      if (v !== undefined) merged[k] = v;
    });
    // "Ko'rildi" belgisi yo'qolmasin
    if (!merged.ackAt && (prev.ackAt || r.ackAt)) merged.ackAt = prev.ackAt || r.ackAt;
    result.set(id, merged);
  };
  list(base).forEach(r => {
    const id = str(r.id);
    const inA = list(a).find(x => str(x.id) === id);
    const inB = list(b).find(x => str(x.id) === id);
    if (inA) put(inA);
    if (inB) put(inB);
    if (!inA && !inB) put(r);
  });
  const fresh = [...list(a), ...list(b)].filter(r => !baseMap.has(str(r.id)));
  fresh
    .sort((x, y) => num(x.at) - num(y.at) || (str(x.id) < str(y.id) ? -1 : str(x.id) > str(y.id) ? 1 : 0))
    .forEach(put);
  return order.map(id => result.get(id) as Dict);
}

function mergeReadyNotice(base: unknown, a: unknown, b: unknown): unknown {
  if (isObj(a) && isObj(b) && (a.ackAt || b.ackAt) && !(a.ackAt && b.ackAt)) return a.ackAt ? a : b;
  return merge3Value(base, a, b);
}

/**
 * Uch tomonlama birlashtirish: base - umumiy ota, a va b - undan alohida o'zgargan versiyalar.
 * Kalitsiz (eski) qatorli chekda null (eski usul: oxirgi yozuv).
 */
export function mergeOrder3(baseIn: unknown, aIn: unknown, bIn: unknown): Dict | null {
  if (!isObj(baseIn) || !isObj(aIn) || !isObj(bIn)) return null;
  const base = withoutRev(baseIn);
  const a = withoutRev(aIn);
  const b = withoutRev(bIn);
  if (sameContent(a, b)) return a;
  if (sameContent(a, base)) return b;
  if (sameContent(b, base)) return a;

  const lb = lineMap(base);
  const la = lineMap(a);
  const lc = lineMap(b);
  if (!lb || !la || !lc) return null;

  const special = new Set<string>(['items', 'status', 'readyNotice', ...RECORD_LISTS]);
  const out: Dict = {};
  new Set([...Object.keys(base), ...Object.keys(a), ...Object.keys(b)]).forEach(k => {
    if (special.has(k)) return;
    const v = merge3Value(base[k], a[k], b[k]);
    if (v !== undefined) out[k] = v;
  });
  RECORD_LISTS.forEach(k => {
    const v = mergeRecords(base[k], a[k], b[k]);
    if (v !== undefined) out[k] = v;
  });
  const notice = mergeReadyNotice(base.readyNotice, a.readyNotice, b.readyNotice);
  if (notice !== undefined) out.readyNotice = notice;

  const sBase = str(base.status);
  const sa = str(a.status);
  const sb = str(b.status);
  const baseClosed = CLOSED.includes(sBase);
  const aClosed = CLOSED.includes(sa) && !baseClosed;
  const bClosed = CLOSED.includes(sb) && !baseClosed;

  if (aClosed || bClosed) {
    // Bir tomon chekni yopdi (to'lov, qarz, bekor): uning qatorlari va summasi qoladi (shuning uchun pul
    // olingan), ikkinchi tomonning oshxona belgilari (tayyor, berildi) mavjud qatorlarga qo'shiladi
    const closerIsA = aClosed && (!bClosed || (CLOSED_RANK[sa] || 0) > (CLOSED_RANK[sb] || 0) ||
      ((CLOSED_RANK[sa] || 0) === (CLOSED_RANK[sb] || 0) && stable(a) >= stable(b)));
    const closer = closerIsA ? a : b;
    const closerLines = closerIsA ? la : lc;
    const other = closerIsA ? lc : la;
    const items: Dict[] = [];
    closerLines.forEach((line, key) => {
      const o = other.get(key);
      const lbase = lb.get(key);
      if (!o || !lbase) {
        items.push(line);
        return;
      }
      const m = mergeLine(lbase, line, o);
      items.push({ ...m, quantity: qtyOf(line), ...(line.sentQty !== undefined ? { sentQty: line.sentQty } : {}) });
    });
    ['subTotal', 'serviceFee', 'serviceFeeAmount', 'total', 'subtotal', 'serviceFeePercent', 'finalTotal',
      'discount', 'discountAmount', 'paymentMethod', 'paymentDetails', 'closeTime', 'closedAtMs'].forEach(k => {
      if (closer[k] !== undefined) out[k] = closer[k];
    });
    return { ...out, items, status: closer.status };
  }

  const items = mergeLines(lb, la, lc);
  let status = str(merge3Value(sBase, sa, sb));
  if (!baseClosed && !CLOSED.includes(status)) {
    const cooking = sa === ORDER_STATUS.COOKING || sb === ORDER_STATUS.COOKING;
    status = deriveStatus({ ...out, status } as Dict, items, cooking);
  }
  const merged: Dict = { ...out, items, status };
  if (baseClosed) return merged; // yopilgan chekda summa o'zgarmaydi (oshxona belgilari, xabarlar)
  return { ...merged, ...orderTotalsFields(merged as OrderLike, items as OrderItemLike[]) };
}
