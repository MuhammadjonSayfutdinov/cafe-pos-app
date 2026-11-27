// Mijoz ekranidagi "Buyurtmalarim": har bir taomning holati (7-bosqich, mijoz telefonida rad etilgan taom).
//
// Ikki manba:
//  - telefondagi QR sahifa (PublicQrApp): so'rov yozuvi + serverdan (supabase/qr.sql -> qr_request_status)
//    shu so'rov qatorlarining holati: lineIds (so'rov taomlari tartibida), lines, rejected;
//  - kafe ichidagi mijoz ekrani (App -> CustomerQRView): to'liq chek (items, kitchenRejections).
// Rad etish sababi mijozga faqat standart ro'yxatdan ko'rinadi (oshpazning erkin izohi chiqmaydi).

import { doneQtyOf, orderLines, servedQtyOf } from '../utils/kitchenFlow';

type Dict = Record<string, unknown>;

export type CustomerLineState = 'waiting' | 'cooking' | 'ready' | 'served' | 'rejected' | 'cancelled';

export interface CustomerLine {
  key: string;
  name: string;
  note: string;
  price: number;
  /** Ko'rsatiladigan porsiya (rad etilgan/bekor qilingan qatorda - shu porsiya) */
  qty: number;
  state: CustomerLineState;
  /** Rad etish sababi (standart ro'yxatdan) */
  reason: string;
}

/** Mijozga ko'rsatiladigan rad etish sabablari (KitchenRejectModal dagi standart sabablar) */
export const PUBLIC_REJECT_REASONS: readonly string[] = Object.freeze([
  'Masalliq tugadi',
  'Taom qolmadi',
  'Uskuna ishlamayapti',
  'Juda uzoq kutiladi',
  "Noto'g'ri buyurtma"
]);

const isObj = (x: unknown): x is Dict => x !== null && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};
const str = (x: unknown): string => (x === undefined || x === null ? '' : String(x));
const list = (x: unknown): Dict[] => (Array.isArray(x) ? x.filter(isObj) : []);

export const publicReason = (reason: unknown): string => {
  const r = str(reason).trim();
  return PUBLIC_REJECT_REASONS.find(p => r.startsWith(p)) || '';
};

const qtyOf = (it: Dict): number => Math.max(0, num(it.quantity ?? it.qty ?? 1));

// Qolgan porsiyalar holati: oshxonada / tayyor / berildi (qisman bo'lsa - bir nechta qator)
function splitByKitchen(base: Omit<CustomerLine, 'qty' | 'state'>, qty: number, done: number, served: number, fallback: CustomerLineState): CustomerLine[] {
  if (qty <= 0) return [];
  const servedQ = Math.min(qty, Math.max(0, served));
  const readyQ = Math.min(qty - servedQ, Math.max(0, done - servedQ));
  const restQ = qty - servedQ - readyQ;
  const out: CustomerLine[] = [];
  if (restQ > 0) out.push({ ...base, key: `${base.key}:c`, qty: restQ, state: fallback });
  if (readyQ > 0) out.push({ ...base, key: `${base.key}:r`, qty: readyQ, state: 'ready' });
  if (servedQ > 0) out.push({ ...base, key: `${base.key}:s`, qty: servedQ, state: 'served' });
  return out;
}

/**
 * Telefondagi so'rov: so'ralgan taomlar (record.items) + serverdan kelgan qator holati.
 * Server ma'lumoti bo'lmasa (SQL hali yangilanmagan yoki so'rov qabul qilinmagan) - null.
 */
export function buildRequestLines(record: unknown): CustomerLine[] | null {
  if (!isObj(record)) return null;
  const lineIds = Array.isArray(record.lineIds) ? record.lineIds.map(str) : [];
  if (lineIds.length === 0 || !Array.isArray(record.lines)) return null;
  const items = list(record.items);
  const lines = new Map(list(record.lines).map(l => [str(l.lineId), l]));
  const rejected = list(record.rejected);
  const out: CustomerLine[] = [];

  items.forEach((it, idx) => {
    const lineId = lineIds[idx] || '';
    const base = {
      key: lineId || `i${idx}`,
      name: str(it.name) || 'Taom',
      note: str(it.note),
      price: num(it.price),
      reason: ''
    };
    const requested = qtyOf(it);
    if (!lineId) {
      out.push({ ...base, qty: requested, state: 'cooking' });
      return;
    }
    const rej = rejected.filter(r => str(r.lineId) === lineId);
    const rejQty = rej.reduce((s, r) => s + Math.max(0, num(r.qty)), 0);
    const line = lines.get(lineId);
    const current = line ? Math.max(0, num(line.qty)) : 0;
    out.push(...splitByKitchen(base, current, num(line?.done), num(line?.served), 'cooking'));
    if (rejQty > 0) {
      const reason = rej.map(r => publicReason(r.reason)).find(Boolean) || '';
      out.push({ ...base, key: `${lineId}:x`, qty: rejQty, state: 'rejected', reason });
    }
    // Xodim olib tashlagan porsiya (ofitsiant kamaytirgan yoki o'chirgan)
    const missing = requested - current - rejQty;
    if (missing > 0) out.push({ ...base, key: `${lineId}:k`, qty: missing, state: 'cancelled' });
  });
  return out;
}

/** Kafe ichidagi mijoz ekrani: to'liq chekdan (qatorlar + oshxona rad etgan taomlar) */
export function buildOrderLines(order: unknown, status: string, waitingStatus = 'pending'): CustomerLine[] {
  if (!isObj(order)) return [];
  // Taomda oshxona belgisi yo'q (so'rov yozuvi yoki eski chek): holat chek statusidan
  // ('Tayyor', 'Yetkazildi' - src/constants/orderStatus.js dagi saqlanadigan qiymatlar)
  const fallback: CustomerLineState = status === waitingStatus
    ? 'waiting'
    : status === 'Tayyor' ? 'ready' : status === 'Yetkazildi' ? 'served' : 'cooking';
  const out: CustomerLine[] = [];
  orderLines(order).forEach(({ item, lineId }) => {
    const base = { key: lineId, name: str(item.name) || 'Taom', note: str(item.note), price: num(item.price), reason: '' };
    const hasKitchen = item.kitchenDoneQty !== undefined || item.servedQty !== undefined;
    if (!hasKitchen) {
      out.push({ ...base, qty: qtyOf(item), state: fallback });
      return;
    }
    out.push(...splitByKitchen(base, qtyOf(item), doneQtyOf(item, order), servedQtyOf(item, order), fallback));
  });
  list(order.kitchenRejections).forEach((r, i) => {
    out.push({
      key: `rej${str(r.id) || i}`,
      name: str(r.name) || 'Taom',
      note: '',
      price: num(r.price),
      qty: Math.max(0, num(r.qty)),
      state: 'rejected',
      reason: publicReason(r.reason)
    });
  });
  return out;
}

/** Hisobga kiradigan summa: rad etilgan va bekor qilingan porsiyalarsiz */
export const billableSubtotal = (lines: readonly CustomerLine[]): number =>
  lines.reduce((s, l) => (l.state === 'rejected' || l.state === 'cancelled' ? s : s + l.price * l.qty), 0);
