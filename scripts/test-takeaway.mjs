// "Olib ketish": bir vaqtda bir nechta ochiq chek (src/utils/takeaway.ts).
// Ishga tushirish: npm run test:takeaway. Kutubxonasiz: Vite yig'adi, node:assert tekshiradi.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = await build({
  configFile: false,
  root,
  logLevel: 'silent',
  build: { write: false, minify: false, lib: { entry: path.join(root, 'src/utils/takeaway.ts'), formats: ['es'], fileName: 'm' } }
});
const chunk = (Array.isArray(out) ? out[0] : out).output.find(o => o.type === 'chunk');
const tk = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);

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

const now = new Date(2026, 10, 28, 14, 0).getTime();
const yesterday = now - 24 * 3600000;
const orders = [
  { id: 'a', table: 'Olib ketish', status: 'Yangi', createdAt: now - 600000, takeawayNo: 1 },
  { id: 'b', table: 'Olib ketish', status: "To'langan", createdAt: now - 500000, takeawayNo: 2 },
  { id: 'c', table: 'Olib ketish', status: 'Tayyor', createdAt: now - 100000, takeawayNo: 3 },
  { id: 'd', table: 'Olib ketish', status: 'Yangi', createdAt: yesterday, takeawayNo: 9 },
  { id: 'e', table: '3-Stol', status: 'Yangi', createdAt: now }
];

test("Ochiq olib ketish cheklari (to'langani yo'q, eng eskisi birinchi)", () => {
  assert.deepEqual(tk.openTakeawayOrders(orders).map(o => o.id), ['d', 'a', 'c']);
});

test('Kunlik raqam: bugungi eng kattasidan keyingi, ertasiga 1 dan', () => {
  assert.equal(tk.nextTakeawayNo(orders, now), 4);
  assert.equal(tk.nextTakeawayNo(orders, now + 24 * 3600000), 1);
  assert.equal(tk.nextTakeawayNo([], now), 1);
});

test('Ekrandagi nom', () => {
  assert.equal(tk.orderLabel(orders[2]), 'Olib ketish #3');
  assert.equal(tk.orderLabel(orders[4]), '3-Stol');
  assert.equal(tk.orderLabel({ table: 'Olib ketish' }), 'Olib ketish');
});

console.log(`✅ Olib ketish (bir nechta ochiq chek): ${passed} ta tekshiruv o'tdi`);
