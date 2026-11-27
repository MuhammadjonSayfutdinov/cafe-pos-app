// Mijoz ekranidagi taom holati (src/qr/customerLines.ts): telefonda oshxona rad etgan taom alohida.
// Ishga tushirish: npm run test:qr. Kutubxonasiz: TypeScript'ni Vite yig'adi, node:assert tekshiradi.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = await build({
  configFile: false,
  root,
  logLevel: 'silent',
  build: { write: false, minify: false, lib: { entry: path.join(root, 'src/qr/customerLines.ts'), formats: ['es'], fileName: 'm' } }
});
const chunk = (Array.isArray(out) ? out[0] : out).output.find(o => o.type === 'chunk');
const cl = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);

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
const pick = (lines) => lines.map(l => `${l.name}:${l.qty}:${l.state}${l.reason ? `:${l.reason}` : ''}`);

// Telefon so'rovi: Osh x2 (1 tayyor), Lag'mon x2 (oshxona hammasini rad etdi), Somsa x3 (1 rad, 1 ofitsiant olib tashladi)
const record = {
  status: 'accepted',
  items: [
    { name: 'Osh', price: 35000, quantity: 2 },
    { name: "Lag'mon", price: 30000, quantity: 2 },
    { name: 'Somsa', price: 8000, quantity: 3, note: 'issiq' }
  ],
  lineIds: ['ci_a', 'ci_b', 'ci_c'],
  lines: [
    { lineId: 'ci_a', qty: 2, done: 1, served: 0 },
    { lineId: 'ci_c', qty: '1', done: 0, served: 0 }
  ],
  rejected: [
    { lineId: 'ci_b', qty: 2, reason: 'Taom qolmadi' },
    { lineId: 'ci_c', qty: 1, reason: null }
  ]
};

test("So'rov taomlari: tayyorlanmoqda, tayyor, rad etildi (sabab bilan), bekor qilindi", () => {
  assert.deepEqual(pick(cl.buildRequestLines(record)), [
    'Osh:1:cooking',
    'Osh:1:ready',
    "Lag'mon:2:rejected:Taom qolmadi",
    'Somsa:1:cooking',
    'Somsa:1:rejected',
    'Somsa:1:cancelled'
  ]);
});

test('Hisobga rad etilgan va bekor qilingan porsiya kirmaydi', () => {
  assert.equal(cl.billableSubtotal(cl.buildRequestLines(record)), 2 * 35000 + 8000);
});

test('Berilgan porsiya alohida', () => {
  const r = { ...record, lines: [{ lineId: 'ci_a', qty: 2, done: 2, served: 1 }], rejected: [] };
  assert.deepEqual(pick(cl.buildRequestLines(r)).slice(0, 2), ['Osh:1:ready', 'Osh:1:served']);
});

test("Server ma'lumoti yo'q (SQL yangilanmagan yoki eski so'rov) - null, ekran eski usulda", () => {
  assert.equal(cl.buildRequestLines({ ...record, lineIds: [] }), null);
  assert.equal(cl.buildRequestLines({ ...record, lines: undefined }), null);
  assert.equal(cl.buildRequestLines(null), null);
});

test("Oshpazning erkin izohi mijozga chiqmaydi", () => {
  assert.equal(cl.publicReason('Masalliq tugadi (kecha tugadi)'), 'Masalliq tugadi');
  assert.equal(cl.publicReason("Noto'g'ri buyurtma"), "Noto'g'ri buyurtma");
  assert.equal(cl.publicReason('Oshpaz kayfiyati yo\'q'), '');
});

test("Kafe ichidagi mijoz ekrani: to'liq chek + oshxona rad etgan taomlar", () => {
  const order = {
    id: 'o1',
    status: 'Tayyorlanmoqda',
    items: [
      { cartItemId: 'a', name: 'Osh', price: 35000, quantity: 1, sentQty: 1, kitchenDoneQty: 1, servedQty: 0 },
      { cartItemId: 'b', name: 'Choy', price: 5000, quantity: 2, sentQty: 2, kitchenDoneQty: 0, servedQty: 0 }
    ],
    kitchenRejections: [{ id: 'r1', lineId: 'c', name: 'Kabob', price: 20000, qty: 1, reason: 'Masalliq tugadi (go\'sht)' }]
  };
  const lines = cl.buildOrderLines(order, order.status);
  assert.deepEqual(pick(lines), ['Osh:1:ready', 'Choy:2:cooking', 'Kabob:1:rejected:Masalliq tugadi']);
  assert.equal(cl.billableSubtotal(lines), 35000 + 10000);
});

test("Oshxona belgisisiz taom: holat chek statusidan (Tayyor / kutilmoqda)", () => {
  const req = { status: 'Tayyor', items: [{ name: 'Non', price: 3000, quantity: 1 }] };
  assert.deepEqual(pick(cl.buildOrderLines(req, 'Tayyor')), ['Non:1:ready']);
  assert.deepEqual(pick(cl.buildOrderLines(req, 'pending')), ['Non:1:waiting']);
});

console.log(`✅ Mijoz ekrani (taom holati, rad etilgan taom): ${passed} ta tekshiruv o'tdi`);
