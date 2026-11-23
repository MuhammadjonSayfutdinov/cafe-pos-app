// Ombor (masalliq) hisobi: retsept bo'yicha qancha xomashyo ketadi, nechta porsiya qoldi.
// Kassadagi ayirish (CashierMode) va ofitsiant menyusidagi qoldiq ogohlantirishi shu yerdan hisoblaydi.
import { CLOSED_ORDER_STATUSES } from '../constants/orderStatus';

const UNIT_FACTORS = {
  gr: { family: 'weight', factor: 1 },
  kg: { family: 'weight', factor: 1000 },
  tonna: { family: 'weight', factor: 1000000 },
  ml: { family: 'volume', factor: 1 },
  litr: { family: 'volume', factor: 1000 }
};

export const normalizeUnit = (unitStr) => {
  const u = String(unitStr || 'kg').trim().toLowerCase();
  if (['g', 'gr', 'gram', 'gramm'].includes(u)) return 'gr';
  if (['kg', 'kilogram', 'kilogramm', 'kilo'].includes(u)) return 'kg';
  if (['t', 'ton', 'tonna', 'tn'].includes(u)) return 'tonna';
  if (['ml', 'millilitr'].includes(u)) return 'ml';
  if (['l', 'lt', 'litr', 'liter'].includes(u)) return 'litr';
  return u;
};

export const convertRecipeToInventoryUnit = (amount, fromUnit, toInvUnit) => {
  const n = Number(amount) || 0;
  const fromNorm = normalizeUnit(fromUnit || toInvUnit);
  const toNorm = normalizeUnit(toInvUnit);
  if (fromNorm === toNorm) return n;
  const fromMeta = UNIT_FACTORS[fromNorm];
  const toMeta = UNIT_FACTORS[toNorm];
  if (fromMeta && toMeta && fromMeta.family === toMeta.family) {
    return Number(((n * fromMeta.factor) / toMeta.factor).toFixed(6));
  }
  return n;
};

const round6 = (x) => Number((Number(x) || 0).toFixed(6));

export const findMenuItem = (menuItems, cartItem) =>
  (Array.isArray(menuItems) ? menuItems : []).find(
    m => m && cartItem && (
      String(m.id) === String(cartItem.id) || m.name === cartItem.baseName || m.name === cartItem.name
    )
  ) || null;

/**
 * Bitta taom qatori uchun masalliq sarfi: Map(inventoryId -> miqdor ombor birligida).
 * Porsiya koeffitsienti narx nisbatidan (0.7 porsiya = 0.7 baravar masalliq), 0.25..2 oralig'ida.
 */
export function itemUsage(cartItem, menuItems, inventory, qtyOverride) {
  const usage = new Map();
  if (!cartItem) return usage;
  const qty = qtyOverride ?? (Number(cartItem.quantity ?? cartItem.qty ?? 1) || 0);
  if (qty <= 0) return usage;

  const menu = findMenuItem(menuItems, cartItem);
  const mainPrice = Number(menu?.variants?.[0]?.price ?? menu?.price ?? 0) || 0;
  const soldPrice = Number(cartItem.price ?? mainPrice) || 0;
  const portionFactor = mainPrice > 0 && soldPrice > 0 ? Math.min(2, Math.max(0.25, soldPrice / mainPrice)) : 1;

  const recipe = menu?.recipe || cartItem.recipe;
  if (!Array.isArray(recipe)) return usage;
  const inv = Array.isArray(inventory) ? inventory : [];

  recipe.forEach(r => {
    if (!r) return;
    const id = String(r.inventoryId ?? r.productId ?? r.id ?? '');
    const invItem = inv.find(i => i && String(i.id) === id);
    if (!invItem) return;
    const baseUnit = normalizeUnit(invItem.unit || 'kg');
    let perPortion = Number(r.qty ?? r.amount ?? 0) || 0;
    if (r.rawQty !== undefined && r.recipeUnit) {
      perPortion = convertRecipeToInventoryUnit(r.rawQty, r.recipeUnit, baseUnit);
    }
    const total = round6(perPortion * portionFactor * qty);
    if (total > 0) usage.set(id, round6((usage.get(id) || 0) + total));
  });
  return usage;
}

/** Ochiq (hali to'lanmagan) buyurtmalar band qilgan masalliq. Ombordan to'lovda ayiriladi. */
export function reservedByOpenOrders(orders, menuItems, inventory, extraItems = []) {
  const reserved = new Map();
  const add = (map) => map.forEach((v, k) => reserved.set(k, round6((reserved.get(k) || 0) + v)));
  (Array.isArray(orders) ? orders : [])
    .filter(o => o && !CLOSED_ORDER_STATUSES.includes(o.status) && !o.inventoryDeducted)
    .forEach(o => (Array.isArray(o.items) ? o.items : []).forEach(it => add(itemUsage(it, menuItems, inventory))));
  (Array.isArray(extraItems) ? extraItems : []).forEach(({ item, qty }) => add(itemUsage(item, menuItems, inventory, qty)));
  return reserved;
}

/**
 * Taomning berilgan porsiyasidan yana nechtasini tayyorlash mumkin.
 * Retsept yoki omborda bog'langan masalliq bo'lmasa: Infinity (nazorat qilinmaydi).
 */
export function portionsAvailable(menuItem, variant, inventory, reserved) {
  const probe = {
    id: menuItem?.id,
    name: menuItem?.name,
    baseName: menuItem?.name,
    price: Number(variant?.price ?? menuItem?.variants?.[0]?.price ?? menuItem?.price ?? 0)
  };
  const perPortion = itemUsage(probe, [menuItem], inventory, 1);
  if (perPortion.size === 0) return Infinity;
  const inv = Array.isArray(inventory) ? inventory : [];
  let min = Infinity;
  perPortion.forEach((need, id) => {
    const item = inv.find(i => i && String(i.id) === id);
    const left = (Number(item?.quantity ?? item?.qty ?? 0) || 0) - (reserved?.get(id) || 0);
    min = Math.min(min, Math.floor(round6(left / need)));
  });
  return Math.max(0, min);
}

/** portionsAvailable + qaysi masalliq cheklayapti (ogohlantirish matni uchun) */
export function stockStatus(menuItem, variant, inventory, reserved) {
  const probe = {
    id: menuItem?.id,
    name: menuItem?.name,
    baseName: menuItem?.name,
    price: Number(variant?.price ?? menuItem?.variants?.[0]?.price ?? menuItem?.price ?? 0)
  };
  const perPortion = itemUsage(probe, [menuItem], inventory, 1);
  if (perPortion.size === 0) return { portions: Infinity, limitingName: null };
  const inv = Array.isArray(inventory) ? inventory : [];
  let best = { portions: Infinity, limitingName: null };
  perPortion.forEach((need, id) => {
    const item = inv.find(i => i && String(i.id) === id);
    const left = (Number(item?.quantity ?? item?.qty ?? 0) || 0) - (reserved?.get(id) || 0);
    const p = Math.max(0, Math.floor(round6(left / need)));
    if (p < best.portions) best = { portions: p, limitingName: item?.name || null };
  });
  return best;
}
