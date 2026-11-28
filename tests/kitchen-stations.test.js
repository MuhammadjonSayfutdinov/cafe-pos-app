// Oshxona sexlari, taom taymeri va oshxona cheki (src/utils/kitchenStations.ts).
// Ishga tushirish: npm test (yoki npm run test:stations)
import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as ks from '../src/utils/kitchenStations';

const stations = ks.normalizeStations([
  { id: 'bar', name: 'Bar', icon: '🍹', categories: ['Ichimlik', 'Shirinlik'] },
  { id: 'hot', name: 'Issiq sex', icon: '🔥', categories: ['Asosiy'] },
  { id: '', name: 'Buzuq' },
  'xato'
]);
const menu = [{ id: 1, name: 'Osh', category: 'Asosiy' }, { id: 2, name: 'Choy', category: 'Ichimlik' }];

test("Sexlar ro'yxati tozalanadi (buzuq yozuv tashlanadi)", () => {
  assert.equal(stations.length, 2);
  assert.deepEqual(stations[0].categories, ['Ichimlik', 'Shirinlik']);
});

test('Sex tanlovi: bir nechta kategoriya, bitta kategoriya, hammasi', () => {
  assert.equal(ks.selectionCategories('all', stations), null);
  assert.equal(ks.selectionCategories('Barchasi', stations), null);
  assert.deepEqual([...ks.selectionCategories('st:bar', stations)], ['Ichimlik', 'Shirinlik']);
  assert.deepEqual([...ks.selectionCategories('cat:Asosiy', stations)], ['Asosiy']);
  assert.deepEqual([...ks.selectionCategories('Asosiy', stations)], ['Asosiy']); // eski qiymat
  assert.equal(ks.selectionCategories('st:yoq', stations), null); // o'chirilgan sex - hammasi
  assert.equal(ks.selectionLabel('st:hot', stations), '🔥 Issiq sex');
});

test('Taom kategoriyasi: qatordan yoki menyudan', () => {
  assert.equal(ks.lineCategory({ id: 2, name: 'Choy (Qora)', baseName: 'Choy' }, menu), 'Ichimlik');
  assert.equal(ks.lineCategory({ id: 9, name: 'Somsa', category: 'Pishiriq' }, menu), 'Pishiriq');
  assert.equal(ks.lineCategory({ id: 9, name: "Noma'lum" }, menu), '');
});

test("Taymer: dozakaz o'z vaqtidan; SLA darajasi", () => {
  assert.equal(ks.lineSentMs({ kitchenSentAt: 5000 }, 1000), 5000);
  assert.equal(ks.lineSentMs({}, 1000), 1000);
  assert.equal(ks.formatTimer(125), '02:05');
  assert.equal(ks.slaLevelOf(100, 600, 1200), 'normal');
  assert.equal(ks.slaLevelOf(700, 600, 1200), 'warning');
  assert.equal(ks.slaLevelOf(1300, 600, 1200), 'critical');
});

test("Avtomatik chek: faqat yangi porsiyalar; tayyor bo'lgani va rad etilgani qayta chiqmaydi", () => {
  // yangi qator: 2 porsiya
  let r = ks.unprintedLines([{ lineId: 'a', name: 'Osh', qty: 2, total: 2 }], {});
  assert.deepEqual(r.lines.map(l => l.qty), [2]);
  let printed = r.next;
  // 1 tasi tayyor bo'ldi: hech narsa chiqmaydi
  r = ks.unprintedLines([{ lineId: 'a', name: 'Osh', qty: 1, total: 2 }], printed);
  assert.equal(r.lines.length, 0);
  printed = r.next;
  // dozakaz +1: faqat 1 porsiya, "qo'shimcha"
  r = ks.unprintedLines([{ lineId: 'a', name: 'Osh', qty: 2, total: 3 }], printed);
  assert.deepEqual(r.lines.map(l => [l.qty, l.isAddition]), [[1, true]]);
  printed = r.next;
  // 1 tasi rad etildi (jami 2), keyin yana +1 (jami 3): 1 porsiya chiqadi
  r = ks.unprintedLines([{ lineId: 'a', name: 'Osh', qty: 1, total: 2 }], printed);
  assert.equal(r.lines.length, 0);
  r = ks.unprintedLines([{ lineId: 'a', name: 'Osh', qty: 2, total: 3 }], r.next);
  assert.deepEqual(r.lines.map(l => l.qty), [1]);
});

test("Xaritada yo'q eski qator: tayyor porsiyalar chop etilgan deb olinadi", () => {
  const r = ks.unprintedLines([{ lineId: 'b', name: 'Choy', qty: 1, total: 3 }], {});
  assert.deepEqual(r.lines.map(l => l.qty), [1]);
  assert.deepEqual(ks.prunePrinted({ a: 2, b: 3 }, new Set(['b'])), { b: 3 });
});

test('Oshxona cheki: stol, sex, taom soni, izoh; bir nechta chek - alohida qog\'oz', () => {
  const html = ks.kotDocument([
    { cafeName: 'Kafe', table: '3-Stol', waiter: 'Ali', orderId: 'o_12345', station: '🔥 Issiq sex', printedAt: 0,
      lines: [{ lineId: 'a', name: 'Osh <b>', qty: 2, note: 'achchiq' }] },
    { cafeName: 'Kafe', table: '5-Stol', waiter: 'Vali', orderId: 'o_99', station: 'Bar', printedAt: 0, isUpdate: true,
      lines: [{ lineId: 'c', name: 'Choy', qty: 1, isAddition: true }] }
  ]);
  assert.match(html, /3-Stol/);
  assert.match(html, /2×/);
  assert.match(html, /Osh &lt;b&gt;/); // HTML qochiriladi
  assert.match(html, /achchiq/);
  assert.match(html, /DOZAKAZ/);
  assert.equal((html.match(/class="kot"/g) || []).length, 2);
});
