// Ishga tushishda localStorage ma'lumotlarini tekshirish va yangi sxemaga keltirish.
// Hech qachon ilovani to'xtatmaydi: xato bo'lsa, konsolga yozadi va davom etadi.
//
// Qoida: eski maydonlar O'CHIRILMAYDI (eski kod ularni o'qishi mumkin), faqat yangi
// nomdagi maydon yo'q bo'lsa, eskisidan to'ldiriladi.

import { getCreatedTimeMs } from './dates';
import { notify } from './notify';

export const SCHEMA_VERSION = 2;
const VERSION_KEY = 'pos_schema_version';

// Ro'yxat bo'lishi shart bo'lgan kalitlar
const ARRAY_KEYS = [
  'pos_orders', 'pos_menu', 'pos_categories', 'pos_tables', 'pos_users',
  'pos_inventory', 'pos_inv_logs', 'pos_customers', 'pos_expenses',
  'pos_audit_logs', 'pos_calls'
];

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

const read = (key) => {
  const raw = window.localStorage.getItem(key);
  if (raw === null) return { exists: false };
  try {
    return { exists: true, value: JSON.parse(raw), raw };
  } catch {
    return { exists: true, invalid: true, raw };
  }
};

const write = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));

// 1) Sxema tekshiruvi: buzilgan kalit zaxiraga olinadi va o'chiriladi (standart qiymat ishlaydi)
function quarantineBrokenKeys() {
  const broken = [];
  ARRAY_KEYS.forEach(key => {
    const r = read(key);
    if (!r.exists) return;
    if (r.invalid || !Array.isArray(r.value)) {
      try {
        window.localStorage.setItem(`pos_buzilgan_${key}_${Date.now()}`, r.raw);
      } catch {
        // xotira to'lgan bo'lsa ham asl kalitni o'chiramiz, aks holda ilova ishlamaydi
      }
      window.localStorage.removeItem(key);
      broken.push(key);
    } else if (r.value.some(x => x === null || x === undefined)) {
      write(key, r.value.filter(x => x !== null && x !== undefined));
    }
  });
  return broken;
}

// 2) Buyurtmalar: yangi maydon nomlarini to'ldirish (v1 -> v2)
function normalizeOrder(order) {
  if (!isObj(order)) return null;
  const o = { ...order };

  if (!Array.isArray(o.items)) o.items = [];
  o.items = o.items.filter(isObj).map(it => {
    if (it.quantity === undefined && it.qty !== undefined) {
      return { ...it, quantity: Number(it.qty) || 1 };
    }
    return it;
  });

  if (o.id === undefined || o.id === null) o.id = `mig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  if (!o.createdAt) {
    const ms = getCreatedTimeMs(o);
    if (ms) o.createdAt = ms;
  }
  if (!o.waiter && o.waiterName) o.waiter = o.waiterName;
  if (o.subTotal === undefined && o.subtotal !== undefined) o.subTotal = Number(o.subtotal) || 0;
  if (o.total === undefined && o.finalTotal !== undefined) o.total = Number(o.finalTotal) || 0;
  if (o.serviceFee === undefined && o.serviceFeePercent !== undefined) o.serviceFee = Number(o.serviceFeePercent) || 0;
  return o;
}

// 3) Menyu retsepti: inventoryId / qty nomlari
function normalizeMenuItem(item) {
  if (!isObj(item)) return null;
  if (!Array.isArray(item.recipe)) return item;
  return {
    ...item,
    recipe: item.recipe.filter(isObj).map(r => ({
      ...r,
      inventoryId: r.inventoryId ?? r.productId ?? r.id,
      qty: r.qty ?? r.amount ?? 0
    }))
  };
}

function migrateToV2() {
  const orders = read('pos_orders');
  if (orders.exists && Array.isArray(orders.value)) {
    write('pos_orders', orders.value.map(normalizeOrder).filter(Boolean));
  }
  const menu = read('pos_menu');
  if (menu.exists && Array.isArray(menu.value)) {
    write('pos_menu', menu.value.map(normalizeMenuItem).filter(Boolean));
  }
}

export function runMigrations() {
  try {
    const broken = quarantineBrokenKeys();
    if (broken.length > 0) {
      notify(
        `⚠️ Buzilgan ma'lumot topildi va zaxiraga olindi: ${broken.join(', ')}.\nBu bo'limlar standart holatda ochildi.`,
        'warning'
      );
    }

    const current = Number(window.localStorage.getItem(VERSION_KEY)) || 1;
    if (current < 2) migrateToV2();
    if (current < SCHEMA_VERSION) window.localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
  } catch (error) {
    console.error("Migratsiyada xato (ilova davom etadi):", error);
  }
}
