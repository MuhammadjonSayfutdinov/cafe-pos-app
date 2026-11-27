// Ikki qurilma bir chekni bir vaqtda o'zgartirsa (src/sync/mergeOrder.ts): ikkala o'zgarish saqlanadi.
// Ishga tushirish: npm run test:merge. Kutubxonasiz: Vite yig'adi, node:assert tekshiradi.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = async (rel) => {
  const out = await build({
    configFile: false,
    root,
    logLevel: 'silent',
    build: { write: false, minify: false, lib: { entry: path.join(root, rel), formats: ['es'], fileName: 'm' } }
  });
  const chunk = (Array.isArray(out) ? out[0] : out).output.find(o => o.type === 'chunk');
  return import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
};
const mo = await load('src/sync/mergeOrder.ts');
const kf = await load('src/utils/kitchenFlow.ts');

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed += 1;
  } catch (e) {
    console.error(`❌ ${name}`);
    throw e;
  }
};

const NOW = 1_800_000_000_000;
const S = { NEW: 'Yangi', COOKING: 'Tayyorlanmoqda', READY: 'Tayyor', DELIVERED: 'Yetkazildi', PAID: "To'langan", CANCELLED: 'Bekor qilindi' };
const line = (id, name, quantity, extra = {}) => ({
  cartItemId: id, id: `m_${id}`, name, price: 10000, quantity, sentQty: quantity, kitchenDoneQty: 0, servedQty: 0,
  kitchenSentAt: NOW - 1000, ...extra
});
const order = (items, extra = {}) => kf.materializeOrder({
  id: 'o1', table: '3-Stol', waiter: 'Ali', status: S.NEW, serviceFee: 10, createdAt: NOW - 60000, items, ...extra
});
const find = (o, id) => (o.items || []).find(it => it.cartItemId === id);
const both = (base, a, b) => {
  const ab = mo.mergeOrder3(base, a, b);
  const ba = mo.mergeOrder3(base, b, a);
  assert.deepEqual(ab, ba, 'birlashtirish ikki tomonda bir xil chiqishi kerak (simmetrik)');
  return ab;
};

test("Oshpaz 'tayyor' + ofitsiant dozakaz (yangi taom): ikkalasi saqlanadi", () => {
  const base = order([line('a', 'Osh', 2)]);
  const kitchen = kf.markLinesReady(base, ['a'], NOW).order;
  const waiter = kf.appendKitchenItems(base, [{ cartItemId: 'b', id: 'm_b', name: 'Choy', price: 5000, quantity: 1 }], NOW + 1);
  const m = both(base, kitchen, waiter);
  assert.equal(find(m, 'a').kitchenDoneQty, 2);
  assert.equal(find(m, 'b').quantity, 1);
  assert.equal(find(m, 'b').kitchenDoneQty, 0);
  assert.equal(m.status, S.NEW); // Choy hali oshxonada
  assert.equal(m.subTotal, 25000);
});

test("Dozakaz shu taomga (+1) va oshpaz 2 tasini tayyor qildi: 3 porsiya, 2 tayyor", () => {
  const base = order([line('a', 'Osh', 2)]);
  const kitchen = kf.markLinesReady(base, ['a'], NOW).order;
  const cart = kf.rebaseCart([], base).map(c => ({ ...c, quantity: 3 }));
  const waiter = kf.applyWaiterCart(base, cart, NOW + 1).order;
  const m = both(base, kitchen, waiter);
  assert.equal(find(m, 'a').quantity, 3);
  assert.equal(find(m, 'a').kitchenDoneQty, 2);
  assert.equal(kf.pendingQtyOf(find(m, 'a'), m), 1);
});

test('Oshxona 1 tasini rad etdi, ofitsiant +1 qo\'shdi: 2 porsiya, rad etish yozuvi saqlanadi', () => {
  const base = order([line('a', 'Osh', 2)]);
  const kitchen = kf.rejectLines(base, [{ lineId: 'a', qty: 1 }], { reason: 'Taom qolmadi', by: 'Vali', now: NOW }).order;
  const cart = kf.rebaseCart([], base).map(c => ({ ...c, quantity: 3 }));
  const waiter = kf.applyWaiterCart(base, cart, NOW + 1).order;
  const m = both(base, kitchen, waiter);
  assert.equal(find(m, 'a').quantity, 2);
  assert.equal(m.kitchenRejections.length, 1);
});

test("Ofitsiant taomni o'chirdi, oshpaz uni tayyor qildi: taom o'chgan qoladi", () => {
  const base = order([line('a', 'Osh', 1), line('b', 'Choy', 1)]);
  const kitchen = kf.markLinesReady(base, ['a'], NOW).order;
  const waiter = kf.reduceLine(base, 'a', 0, { by: 'Ali', reason: 'Mijoz rad etdi', now: NOW }).order;
  const m = both(base, kitchen, waiter);
  assert.equal(find(m, 'a'), undefined);
  assert.equal(find(m, 'b').quantity, 1);
  assert.equal(m.voids.length, 1);
});

test("Kassir to'ladi, oshpaz shu payt tayyor qildi: to'langan, oshxona belgisi ham bor", () => {
  const base = order([line('a', 'Osh', 2)], { status: S.COOKING });
  const kitchen = kf.markLinesReady(base, ['a'], NOW).order;
  const paid = { ...base, status: S.PAID, paymentMethod: 'Naqd', total: 22000, closedAtMs: NOW, kitchenOpen: true };
  const m = both(base, kitchen, paid);
  assert.equal(m.status, S.PAID);
  assert.equal(m.total, 22000);
  assert.equal(find(m, 'a').kitchenDoneQty, 2);
});

test("Kassir to'ladi, ofitsiant shu payt yangi taom qo'shdi: to'langan chekka to'lanmagan taom kirmaydi", () => {
  const base = order([line('a', 'Osh', 1)]);
  const paid = { ...base, status: S.PAID, paymentMethod: 'Naqd', total: 11000 };
  const waiter = kf.appendKitchenItems(base, [{ cartItemId: 'b', id: 'm_b', name: 'Choy', price: 5000, quantity: 1 }], NOW);
  const m = both(base, paid, waiter);
  assert.equal(m.status, S.PAID);
  assert.equal(find(m, 'b'), undefined);
  assert.equal(m.total, 11000);
});

test("Rad etish va 'ko'rildi' belgisi: yozuvlar birlashadi, belgi yo'qolmaydi", () => {
  const base0 = order([line('a', 'Osh', 2), line('b', 'Choy', 2)]);
  const base = kf.rejectLines(base0, [{ lineId: 'a', qty: 1 }], { reason: 'x', by: 'Vali', now: NOW }).order;
  const waiterAck = kf.ackNotices(base, 'rejections', 'Ali', NOW + 1);
  const kitchen2 = kf.rejectLines(base, [{ lineId: 'b', qty: 1 }], { reason: 'y', by: 'Vali', now: NOW + 2 }).order;
  const m = both(base, waiterAck, kitchen2);
  assert.equal(m.kitchenRejections.length, 2);
  assert.equal(m.kitchenRejections.find(r => r.reason === 'x').ackBy, 'Ali');
});

test('Bir xil o\'zgarish yoki bir tomon o\'zgarmagan: oddiy natija', () => {
  const base = order([line('a', 'Osh', 1)]);
  const k = kf.markLinesReady(base, ['a'], NOW).order;
  assert.deepEqual(mo.mergeOrder3(base, k, base), mo.withoutRev(k));
  assert.deepEqual(mo.mergeOrder3(base, k, k), mo.withoutRev(k));
});

test("Kalitsiz (eski) qatorli chek birlashtirilmaydi (eski usul)", () => {
  const base = { id: 'o', status: S.NEW, items: [{ name: 'Osh', quantity: 1 }] };
  assert.equal(mo.mergeOrder3(base, { ...base, note: 'a' }, { ...base, note: 'b' }), null);
});

test('Versiya kelib chiqishi: yangi, eski, bir vaqtda', () => {
  const v0 = mo.stampRev({ id: 'o' }, 'r0', []);
  const v1 = mo.stampRev({ id: 'o', x: 1 }, 'r1', [v0]);
  const v2 = mo.stampRev({ id: 'o', x: 2 }, 'r2', [v1]);
  const w1 = mo.stampRev({ id: 'o', y: 1 }, 'w1', [v0]);
  assert.equal(mo.relationOf(v1, v2), 'newer');
  assert.equal(mo.relationOf(v2, v1), 'older');
  assert.equal(mo.relationOf(v2, v2), 'same');
  assert.equal(mo.relationOf(v1, w1), 'concurrent');
  assert.equal(mo.relationOf({ id: 'o' }, v1), 'unknown');
  assert.equal(mo.commonAncestor(v2, w1, () => true), 'r0');
  const m = mo.stampRev({ id: 'o' }, 'm1', [w1, v2]);
  assert.deepEqual(m._revs.slice(0, 2), ['w1', 'r2']);
  assert.equal(mo.relationOf(v2, m), 'newer');
  assert.equal(mo.relationOf(w1, m), 'newer');
  assert.equal(mo.sameContent({ a: 1, _rev: 'x' }, { a: 1, _rev: 'y', _revs: ['x'] }), true);
});

console.log(`✅ Chekni birlashtirish (ikki qurilma bir vaqtda): ${passed} ta tekshiruv o'tdi`);
