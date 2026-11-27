// "Rad etilgan va bekor qilingan taomlar" hisoboti (src/utils/lossReport.ts) va chekdagi voids yozuvi
// (src/utils/kitchenFlow.ts). Ishga tushirish: npm run test:loss. Kutubxonasiz: Vite yig'adi, node:assert.
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
const lr = await load('src/utils/lossReport.ts');
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
const order = (items, extra = {}) => ({
  id: 'o1', table: '3-Stol', waiter: 'Ali', status: 'Tayyorlanmoqda', serviceFee: 10, createdAt: NOW - 60000, items, ...extra
});

test("Xodim kamaytirsa: voids da narx, kim, sabab va tayyor bo'lgan porsiya", () => {
  const o = kf.markLinesReady(order([line('a', 'Osh', 3)]), ['a'], NOW).order; // 3 tayyor
  const r = kf.reduceLine(o, 'a', 1, { by: 'Ali', reason: 'Mijoz rad etdi (Tasdiqladi: Admin)', now: NOW + 1 });
  assert.equal(r.order.voids.length, 1);
  const v = r.order.voids[0];
  assert.equal(v.qty, 2);
  assert.equal(v.price, 10000);
  assert.equal(v.cookedQty, 2);
  assert.equal(v.by, 'Ali');
});

test('Chek butunlay bekor qilinsa: har bir qator voids ga, ikkinchi marta yozilmaydi', () => {
  const o = order([line('a', 'Osh', 2), line('b', 'Choy', 1, { price: 5000 })]);
  const c = kf.cancelWholeOrder(o, { by: 'Sardor', reason: 'Kassada bekor qilindi', now: NOW });
  assert.equal(c.voids.length, 2);
  assert.equal(kf.cancelWholeOrder(c, { by: 'Sardor', reason: 'yana', now: NOW + 1 }).voids.length, 2);
  const entries = lr.collectLosses([c]);
  assert.equal(entries.length, 2);
  assert.equal(lr.summarizeLosses(entries).voided.amount, 25000);
});

test("Oxirgi taom olib tashlansa (chek bekor): yo'qotish bir marta hisoblanadi", () => {
  const o = order([line('a', 'Osh', 1)]);
  const r = kf.reduceLine(o, 'a', 0, { by: 'Ali', reason: 'Mijoz ketdi', now: NOW });
  assert.equal(r.order.status, 'Bekor qilindi');
  const s = lr.summarizeLosses(lr.collectLosses([r.order]));
  assert.equal(s.voided.qty, 1);
  assert.equal(s.voided.amount, 10000);
});

test("Oshxona rad etgani: sabab, oshpaz, summa; davr hodisa vaqti bo'yicha", () => {
  const o = order([line('a', 'Osh', 2), line('b', "Lag'mon", 1, { price: 30000 })]);
  const r = kf.rejectLines(o, [{ lineId: 'b', qty: 1 }], { reason: 'Taom qolmadi (kech)', by: 'Oshpaz Vali', now: NOW });
  const all = lr.collectLosses([r.order]);
  assert.equal(all.length, 1);
  assert.equal(all[0].kind, 'rejected');
  assert.equal(all[0].amount, 30000);
  assert.equal(all[0].waiter, 'Ali');
  assert.equal(lr.collectLosses([r.order], { startMs: NOW + 1, endMs: NOW + 10 }).length, 0);
  const s = lr.summarizeLosses(all);
  assert.equal(s.byReason[0].key, '❌ Taom qolmadi');
  assert.equal(s.byCook[0].key, 'Oshpaz Vali');
});

test("Eski bekor qilingan chek (voids yo'q): qatorlaridan", () => {
  const old = order([line('a', 'Osh', 2)], { status: 'Bekor qilindi', cancelledAt: NOW, cancelledBy: 'Ali', cancelReason: 'Xato' });
  const e = lr.collectLosses([old]);
  assert.equal(e.length, 1);
  assert.equal(e[0].amount, 20000);
  assert.equal(e[0].by, 'Ali');
});

test("Sabab: tasdiq qo'shimchasi va izoh olib tashlanadi", () => {
  assert.equal(lr.reasonKey('Mijoz rad etdi (Tasdiqladi: Admin)'), 'Mijoz rad etdi');
  assert.equal(lr.reasonKey('Masalliq tugadi (go\'sht)'), 'Masalliq tugadi');
  assert.equal(lr.reasonKey(''), 'Sabab yozilmagan');
});

test('Telegram xabari: yig\'indi va guruhlar', () => {
  const o = order([line('a', 'Osh', 2)]);
  const r = kf.rejectLines(o, [{ lineId: 'a', qty: 1 }], { reason: 'Masalliq tugadi', by: 'Vali', now: NOW });
  const text = lr.lossTelegramLines(lr.summarizeLosses(lr.collectLosses([r.order])), 'Bugun', 'Kafe').join('\n');
  assert.match(text, /Oshxona rad etdi:<\/b> 1 pors/);
  assert.match(text, /Masalliq tugadi/);
  assert.match(lr.lossTelegramLines(lr.summarizeLosses([]), 'Bugun', 'Kafe').join('\n'), /yo'q/);
});

console.log(`✅ Rad etilgan va bekor qilingan taomlar hisoboti: ${passed} ta tekshiruv o'tdi`);
