// To'langan chekdan rad etilgan taom: kassada "Qaytarish" (src/utils/refunds.ts).
// Ishga tushirish: npm run test:refund. Kutubxonasiz: Vite yig'adi, node:assert tekshiradi.
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
const rf = await load('src/utils/refunds.ts');
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
const line = (id, name, quantity, extra = {}) => ({
  cartItemId: id, id: `m_${id}`, name, price: 10000, quantity, sentQty: quantity, kitchenDoneQty: 0, servedQty: 0, ...extra
});
// Oldindan to'langan (oshxona tugatmagan) chek, keyin oshxona 1 porsiyani rad etdi
const paid = {
  id: 'o1', table: 'Olib ketish', waiter: 'Ali', status: "To'langan", paymentMethod: 'Plastik', serviceFee: 0,
  kitchenOpen: true, inventoryDeducted: true, items: [line('a', 'Osh', 2), line('b', 'Choy', 1, { price: 5000 })]
};
const rejected = kf.rejectLines(paid, [{ lineId: 'a', qty: 1 }], { reason: 'Taom qolmadi', by: 'Vali', now: NOW }).order;

test("Rad etilgan taom puli: qaytarilishi kerak bo'lgan cheklar ro'yxatida", () => {
  assert.equal(rf.refundDueOf(rejected), 10000);
  assert.equal(rf.pendingRefundOf(rejected), 10000);
  const list = rf.collectPendingRefunds([paid, rejected]);
  assert.equal(list.length, 1);
  assert.equal(list[0].pending, 10000);
  assert.equal(list[0].lines[0].name, 'Osh');
  assert.equal(rf.defaultRefundMethod(list[0].paymentMethod), 'Plastik');
  assert.equal(rf.defaultRefundMethod('Aralash'), 'Naqd');
});

test('Qaytarish yoziladi, ortiqcha summa qolgandan oshmaydi, ikkinchi marta qaytarilmaydi', () => {
  const lines = rf.restockLinesOf(rejected);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 1);
  const refund = { id: 'ref1', amount: 50000, method: 'Plastik', by: 'Sardor', at: NOW + 1, shiftId: 's1', restocked: true, rejectionIds: [lines[0].rejectionId] };
  const r = rf.applyRefund(rejected, refund, [lines[0].rejectionId]);
  assert.equal(r.amount, 10000);
  assert.equal(rf.pendingRefundOf(r.order), 0);
  assert.equal(rf.collectPendingRefunds([r.order]).length, 0);
  assert.equal(rf.restockLinesOf(r.order).length, 0); // masalliq ikki marta qaytmaydi
  assert.equal(rf.applyRefund(r.order, { ...refund, id: 'ref2' }).amount, 0);
  assert.equal(r.order.status, "To'langan"); // chek summasi va holati o'zgarmaydi
});

test('Qisman qaytarish: qolgani ro\'yxatda qoladi', () => {
  const r = rf.applyRefund(rejected, { id: 'p1', amount: 4000, method: 'Naqd', by: 'S', at: NOW, shiftId: 's1', restocked: false, rejectionIds: [] });
  assert.equal(rf.pendingRefundOf(r.order), 6000);
  assert.equal(rf.restockLinesOf(r.order).length, 1);
});

test('Kassa xarajati: naqd - seyfdan, qolgani - karta; chek va taom yozilgan', () => {
  const refund = { id: 'ref9', amount: 10000, method: 'Naqd', by: 'Sardor', at: NOW, shiftId: 's1', restocked: true,
    rejectionIds: rejected.kitchenRejections.map(r => r.id) };
  const e = rf.refundExpense(rejected, refund, 'Sardor');
  assert.equal(e.category, 'Qaytarish');
  assert.equal(e.paymentSource, 'Naqd');
  assert.equal(e.amount, 10000);
  assert.equal(e.shiftId, 's1');
  assert.match(e.note, /1× Osh/);
  assert.equal(rf.refundExpense(rejected, { ...refund, method: 'Click' }, 'S').paymentSource, 'Plastik');
});

test("To'lanmagan chekdan rad etilgan taom: qaytariladigan pul yo'q", () => {
  const open = { ...paid, status: 'Tayyorlanmoqda', inventoryDeducted: false };
  const r = kf.rejectLines(open, [{ lineId: 'a', qty: 1 }], { reason: 'x', by: 'Vali', now: NOW }).order;
  assert.equal(rf.pendingRefundOf(r), 0);
  assert.equal(rf.restockLinesOf(r).length, 0);
});

console.log(`✅ Kassada qaytarish (rad etilgan taom puli): ${passed} ta tekshiruv o'tdi`);
