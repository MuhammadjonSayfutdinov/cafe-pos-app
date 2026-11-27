// Oshxona oqimi (src/utils/kitchenFlow.ts) uchun tekshiruvlar. Ishga tushirish: npm run test:kitchen
// Qo'shimcha kutubxonasiz: TypeScript faylni Vite (loyihada bor) bitta modulga yig'adi, node:assert tekshiradi.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = await build({
  configFile: false,
  root,
  logLevel: 'silent',
  build: {
    write: false,
    minify: false,
    lib: { entry: path.join(root, 'src/utils/kitchenFlow.ts'), formats: ['es'], fileName: 'kitchenFlow' }
  }
});
const chunk = (Array.isArray(out) ? out[0] : out).output.find(o => o.type === 'chunk');
const kf = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);

const S = { NEW: 'Yangi', COOKING: 'Tayyorlanmoqda', READY: 'Tayyor', DELIVERED: 'Yetkazildi', PAID: "To'langan", CANCELLED: 'Bekor qilindi' };
const NOW = 1_800_000_000_000;

const line = (id, name, quantity, extra = {}) => ({
  cartItemId: id, id: `m_${id}`, name, price: 10000, quantity, sentQty: quantity, kitchenDoneQty: 0, servedQty: 0, ...extra
});
const order = (items, extra = {}) => ({
  id: 'o1', table: '3-Stol', status: S.COOKING, serviceFee: 10, createdAt: NOW - 60000, items, ...extra
});
const find = (o, id) => o.items.find(it => it.cartItemId === id);

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

test("faqat belgilangan taomlar tayyor bo'ladi (asosiy xato)", () => {
  const o = order([line('a', 'Osh', 2), line('b', 'Salat', 1), line('c', 'Choy', 1)]);
  const r = kf.markLinesReady(o, ['a', 'c'], NOW);
  assert.equal(r.marked, 3);
  assert.equal(r.completed, false);
  assert.equal(find(r.order, 'a').kitchenDoneQty, 2);
  assert.equal(find(r.order, 'b').kitchenDoneQty, 0);
  assert.equal(find(r.order, 'c').kitchenDoneQty, 1);
  assert.equal(r.order.status, S.COOKING, 'qolgan taom oshxonada: status o\'zgarmaydi');
  const s = kf.kitchenSummary(r.order);
  assert.deepEqual([s.pending, s.ready], [1, 3]);
  const r2 = kf.markLinesReady(r.order, ['b'], NOW + 1000);
  assert.equal(r2.completed, true);
  assert.equal(r2.order.status, S.READY);
});

test("yangi chekda tanlangan taom tayyor bo'lsa status 'Tayyorlanmoqda'", () => {
  const o = order([line('a', 'Osh', 1), line('b', 'Salat', 1)], { status: S.NEW });
  const r = kf.markLinesReady(o, ['a'], NOW);
  assert.equal(r.order.status, S.COOKING);
});

test("tayyor taomni berish: qolgani oshxonada qoladi", () => {
  const o = kf.markLinesReady(order([line('a', 'Osh', 2), line('b', 'Salat', 1)]), ['a'], NOW).order;
  const sv = kf.serveReadyLines(o, NOW + 1);
  assert.equal(sv.served, 2);
  assert.equal(sv.order.status, S.COOKING);
  assert.equal(kf.kitchenSummary(sv.order).ready, 0);
  const done = kf.markLinesReady(sv.order, null, NOW + 2).order;
  assert.equal(done.status, S.READY);
  const fin = kf.serveReadyLines(done, NOW + 3).order;
  assert.equal(fin.status, S.DELIVERED);
});

test("eski chek (maydonlarsiz, 'Tayyor'): hammasi tayyor, berilgach 'Yetkazildi'", () => {
  const legacy = { id: 'old', table: '1-Stol', status: S.READY, items: [{ name: 'Osh', price: 5, quantity: 2 }, { name: 'Choy', price: 1, qty: 1 }] };
  const s = kf.kitchenSummary(legacy);
  assert.deepEqual([s.pending, s.ready, s.served], [0, 3, 0]);
  const sv = kf.serveReadyLines(legacy, NOW);
  assert.equal(sv.order.status, S.DELIVERED);
  assert.ok(sv.order.items.every(it => it.cartItemId), "eski qatorga doimiy kalit yoziladi");
});

test("dozakaz (savatcha) 'Yetkazildi' chekni oshxonaga qaytaradi, eski taomlar qayta chiqmaydi", () => {
  const o = order([line('a', 'Osh', 1, { kitchenDoneQty: 1, servedQty: 1 })], { status: S.DELIVERED });
  const cart = kf.rebaseCart([], o);
  cart.push({ cartItemId: 'n1', id: 'm_n', name: 'Somsa', price: 7000, quantity: 2, sentQty: 0, images: [{ src: 'data:x' }], thumb: 'data:y', description: 'uzun' });
  const r = kf.applyWaiterCart(o, cart, NOW);
  assert.equal(r.addedPortions, 2);
  assert.equal(r.order.status, S.NEW);
  assert.equal(r.order.kitchenRoundAt, NOW);
  assert.equal(kf.kitchenSummary(r.order).pending, 2);
  const somsa = find(r.order, 'n1');
  assert.equal(somsa.thumb, undefined, "rasm chekka yozilmaydi");
  assert.equal(somsa.images, undefined);
  assert.equal(somsa.description, undefined);
  assert.equal(r.order.subTotal, 10000 + 14000);
});

test("eski savatcha oshxona belgisini o'chirmaydi va boshqa qurilma qo'shgan taomni saqlaydi", () => {
  const start = order([line('a', 'Osh', 2)]);
  const staleCart = kf.rebaseCart([], start);
  staleCart[0] = { ...staleCart[0], quantity: 3 }; // ofitsiant +1 porsiya qo'shdi (yuborilmagan)
  // shu orada: oshxona Osh ni tayyor qildi, kassir QR-buyurtmani (Choy) qabul qildi
  let latest = kf.markLinesReady(start, ['a'], NOW).order;
  latest = kf.appendKitchenItems(latest, [{ cartItemId: 'qr1', id: 'm_t', name: 'Choy', price: 3000, quantity: 1 }], NOW);
  const r = kf.applyWaiterCart(latest, staleCart, NOW + 5);
  const osh = find(r.order, 'a');
  assert.equal(osh.quantity, 3);
  assert.equal(osh.kitchenDoneQty, 2, "oshxona tayyor degan 2 porsiya saqlanadi");
  assert.ok(find(r.order, 'qr1'), "QR-buyurtma o'chmaydi");
  assert.equal(kf.kitchenSummary(r.order).pending, 2); // Osh 1 + Choy 1
});

test("oshxona rad etishi: porsiya chekdan ayiriladi, summa kamayadi, xabar yoziladi", () => {
  const o = order([line('a', 'Osh', 3), line('b', 'Salat', 1)], { subTotal: 40000 });
  const r = kf.rejectLines(o, [{ lineId: 'a', qty: 1 }], { reason: 'Masalliq tugadi', by: 'Oshpaz', now: NOW });
  assert.equal(r.rejected, 1);
  assert.equal(find(r.order, 'a').quantity, 2);
  assert.equal(r.order.subTotal, 30000);
  assert.equal(r.order.serviceFeeAmount, 3000);
  assert.equal(r.order.total, 33000);
  assert.equal(r.order.kitchenRejections.length, 1);
  assert.equal(r.order.status, S.COOKING);
  const notices = kf.collectStaffNotices([r.order], NOW + 1000);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].kind, 'rejected');
  assert.deepEqual(notices[0].lines, [{ name: 'Osh', qty: 1 }]);
  const acked = kf.ackNotices(r.order, 'rejections', 'Ali', NOW + 2000);
  assert.equal(kf.collectStaffNotices([acked], NOW + 3000).length, 0);
});

test("tayyor bo'lgan porsiyani oshxona rad eta olmaydi; hammasi rad etilsa chek bekor bo'ladi", () => {
  const o = kf.markLinesReady(order([line('a', 'Osh', 2), line('b', 'Salat', 1)]), ['a'], NOW).order;
  const r1 = kf.rejectLines(o, [{ lineId: 'a', qty: 2 }], { reason: 'x', by: 'k', now: NOW });
  assert.equal(r1.rejected, 0, "tayyor porsiya rad etilmaydi");
  const r2 = kf.rejectLines(o, [{ lineId: 'b', qty: 5 }], { reason: 'x', by: 'k', now: NOW });
  assert.equal(r2.rejected, 1);
  assert.equal(r2.order.status, S.READY, "qolgan Osh tayyor: chek 'Tayyor'");
  const fresh = order([line('a', 'Osh', 1)]);
  const r3 = kf.rejectLines(fresh, [{ lineId: 'a', qty: 1 }], { reason: 'Masalliq tugadi', by: 'k', now: NOW });
  assert.equal(r3.cancelled, true);
  assert.equal(r3.order.status, S.CANCELLED);
  assert.equal(r3.order.total, 0);
});

test("to'langan, lekin oshxona tugatmagan chek oshxonada qoladi va tayyor bo'lgach xabar beradi", () => {
  const o = order([line('a', 'Osh', 1), line('b', 'Choy', 1)], { table: 'Olib ketish', status: S.NEW });
  const paid = { ...o, ...kf.keepInKitchenOnPayment(o), status: S.PAID, total: 22000 };
  assert.equal(paid.kitchenOpen, true);
  assert.equal(kf.isKitchenVisible(paid, NOW), true);
  const r = kf.markLinesReady(paid, null, NOW);
  assert.equal(r.order.status, S.PAID, "to'langan chek statusi o'zgarmaydi");
  assert.equal(r.order.kitchenOpen, false);
  assert.equal(kf.isKitchenVisible(r.order, NOW), false);
  const n = kf.collectStaffNotices([r.order], NOW + 1);
  assert.equal(n.length, 1);
  assert.equal(n[0].kind, 'ready');
  assert.equal(kf.isKitchenVisible({ ...paid, createdAt: NOW - 25 * 3600000 }, NOW), false, '24 soatdan eski chek tushadi');
});

test("to'langan chekdan rad etilsa: summa o'zgarmaydi, qaytariladigan pul hisoblanadi", () => {
  const o = order([line('a', 'Osh', 2), line('b', 'Choy', 1)], { status: S.NEW });
  const paid = { ...o, ...kf.keepInKitchenOnPayment(o), status: S.PAID, total: 33000 };
  const r = kf.rejectLines(paid, [{ lineId: 'a', qty: 1 }], { reason: 'Masalliq tugadi', by: 'k', now: NOW });
  assert.equal(r.refundDue, 11000, "10 000 + 10% xizmat haqi");
  assert.equal(r.order.total, 33000);
  assert.equal(r.order.refundDue, 11000);
  assert.equal(r.order.kitchenOpen, true);
  assert.equal(kf.collectStaffNotices([r.order], NOW + 1)[0].refundDue, 11000);
});

test("savatcha qayta moslashadi: rad etilgan qatorning yuborilmagan qismi yangi qator bo'lib qoladi", () => {
  const o = order([line('a', 'Osh', 2), line('b', 'Salat', 1)]);
  const cart = kf.rebaseCart([], o);
  cart[0] = { ...cart[0], quantity: 3 }; // +1 yuborilmagan
  const after = kf.rejectLines(o, [{ lineId: 'a', qty: 2 }], { reason: 'x', by: 'k', now: NOW }).order;
  const next = kf.rebaseCart(cart, after);
  assert.equal(next.length, 2);
  const osh = next.find(c => c.cartItemId === 'a');
  assert.equal(osh.quantity, 1);
  assert.equal(osh.sentQty, 0);
  assert.equal(kf.sameCart(next, kf.rebaseCart(next, after)), true);
});

test("ofitsiant kamaytirsa: avval oshxonadagi porsiya, oshxonaga xabar; oxirgi taom - chek bekor", () => {
  const o = kf.markLinesReady(order([line('a', 'Osh', 3)]), ['a'], NOW).order; // 3 tayyor
  const withNew = kf.applyWaiterCart(o, kf.rebaseCart([], o).map(c => ({ ...c, quantity: 5 })), NOW + 1).order; // +2 oshxonaga
  const r = kf.reduceLine(withNew, 'a', 4, { by: 'Ali', reason: 'Mijoz rad etdi', now: NOW + 2 });
  assert.equal(r.cancelledPending, 1);
  assert.equal(find(r.order, 'a').kitchenDoneQty, 3);
  assert.equal(kf.collectKitchenCancellations([r.order], NOW + 3).length, 1);
  const gone = kf.reduceLine(r.order, 'a', 0, { by: 'Ali', reason: 'Mijoz ketdi', now: NOW + 4 });
  assert.equal(gone.order.status, S.CANCELLED);
  const whole = kf.cancelWholeOrder(order([line('a', 'Osh', 1)], { status: S.NEW }), { by: 'Ali', reason: 'xato', now: NOW });
  assert.equal(whole.status, S.CANCELLED);
  assert.equal(whole.kitchenCancellations.length, 1);
  assert.equal(kf.ackNotices(whole, 'cancellations', 'Oshpaz', NOW).kitchenCancellations[0].ackBy, 'Oshpaz');
});

test("yopilgan (to'langan) chekka savatcha taom qo'sha olmaydi", () => {
  const paid = order([line('a', 'Osh', 1, { kitchenDoneQty: 1, servedQty: 1 })], { status: S.PAID });
  const cart = kf.rebaseCart([], paid).map(c => ({ ...c, quantity: 2 }));
  const r = kf.applyWaiterCart(paid, cart, NOW);
  assert.equal(r.blocked, true);
  assert.equal(r.order, paid);
  // savatcha yopilgan chekdan ajraladi: faqat yangi porsiya qoladi
  const rebased = kf.rebaseCart(cart, null);
  assert.deepEqual(rebased.map(c => [c.quantity, c.sentQty]), [[1, 0]]);
});

test("cartItemId siz eski qator: savatcha va yozuv bir xil kalit ishlatadi (ikkilanmaydi)", () => {
  const legacy = { id: 'L', table: '2-Stol', status: S.COOKING, items: [{ name: 'Osh', price: 5000, quantity: 1, kitchenDoneQty: 0 }] };
  const cart = kf.rebaseCart([], legacy);
  cart[0] = { ...cart[0], quantity: 2 };
  const r = kf.applyWaiterCart(legacy, cart, NOW);
  assert.equal(r.order.items.length, 1);
  assert.equal(r.order.items[0].quantity, 2);
});

test("VIP vaqt va yetkazish narxi oshxonaga chiqmaydi", () => {
  const o = order([line('a', 'Osh', 1), { cartItemId: 'vip_time_1', id: 'vip_time_1', name: 'VIP', price: 1, quantity: 1, category: 'VIP Xizmat' }, { cartItemId: 'fee', name: 'Yetkazish', isDeliveryFee: true, price: 1, quantity: 1, kitchenDoneQty: 1 }]);
  assert.equal(kf.kitchenSummary(o).kitchenQty, 1);
  assert.equal(kf.markLinesReady(o, null, NOW).order.status, S.READY);
});

console.log(`✅ kitchenFlow: ${passed} ta tekshiruv o'tdi`);
