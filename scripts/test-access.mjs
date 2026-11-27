// Ega, admin huquqlari (src/utils/adminRights.ts) va PIN himoyasi (src/utils/pinRules.ts) tekshiruvlari.
// Ishga tushirish: npm run test:access. Kutubxonasiz: TypeScript'ni Vite yig'adi, node:assert tekshiradi.
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

const ar = await load('src/utils/adminRights.ts');
const pr = await load('src/utils/pinRules.ts');

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

// Namuna: birinchi admin (id 1, dastlabki), u tayinlagan admin B, oddiy xodimlar
const A = { id: 1, name: 'Admin', role: 'admin' };
const B = { id: 'user_1764000000000_abc1', name: 'Bek', role: 'admin', appointedBy: '1', adminRights: { ...ar.defaultAdminRights(), addAdmins: true } };
const C = { id: 'user_1765000000000_xyz2', name: 'Doniyor', role: 'admin', appointedBy: 'user_1764000000000_abc1', adminRights: ar.defaultAdminRights() };
const W = { id: 3, name: 'Ali', role: 'waiter' };
const K = { id: 4, name: 'Oshpaz', role: 'kitchen' };
const users = [B, W, A, C, K]; // tartib ataylab aralash: Ega ro'yxat tartibidan emas, id dan aniqlanadi

test('Ega yozilmagan: eng birinchi qo\'shilgan admin Ega', () => {
  assert.equal(ar.resolveOwnerId(users, null), '1');
});

test("pos_owner dagi admin Ega (egalik topshirilgan)", () => {
  assert.equal(ar.resolveOwnerId(users, { id: B.id, at: 1, by: 'Admin' }), B.id);
});

test("pos_owner dagi xodim o'chirilgan yoki admin emas: eng eski admin", () => {
  assert.equal(ar.resolveOwnerId(users, { id: 'yoq' }), '1');
  assert.equal(ar.resolveOwnerId(users, { id: 3 }), '1');
});

test("Foydalanuvchi holati: asosiy admin (eski versiyada) o'chirilgan - qolgan eng eski admin Ega bo'ladi", () => {
  const left = users.filter(u => u.id !== 1);
  assert.equal(ar.resolveOwnerId(left, null), B.id);
});

test('Admin yo\'q - Ega yo\'q', () => {
  assert.equal(ar.resolveOwnerId([W, K], null), null);
});

const ownerId = ar.resolveOwnerId(users, null);

test("Egani hech kim o'zgartira olmaydi (o'zi tayinlagan admin ham)", () => {
  assert.equal(ar.canManageUser(B, A, ownerId), false);
  assert.equal(ar.canManageUser(C, A, ownerId), false);
  assert.equal(ar.canManageUser(A, A, ownerId), false); // o'zini - alohida (faqat ism va PIN)
});

test('Ega hammani boshqaradi', () => {
  assert.equal(ar.canManageUser(A, B, ownerId), true);
  assert.equal(ar.canManageUser(A, C, ownerId), true);
  assert.equal(ar.canManageUser(A, W, ownerId), true);
  assert.deepEqual(ar.getUserRights(A, ownerId), { ...ar.ALL_RIGHTS });
});

test("Admin faqat o'zi tayinlagan adminni boshqaradi (\"Yangi admin tayinlash\" huquqi bilan)", () => {
  assert.equal(ar.canManageUser(B, C, ownerId), true);
  assert.equal(ar.canManageUser(C, B, ownerId), false);
  const bNoAdd = { ...B, adminRights: { ...B.adminRights, addAdmins: false } };
  assert.equal(ar.canManageUser(bNoAdd, C, ownerId), false);
});

test('Oddiy xodimni "Xodimlar" huquqi bor admin boshqaradi', () => {
  assert.equal(ar.canManageUser(C, W, ownerId), true);
  const noStaff = { ...C, adminRights: { ...C.adminRights, staff: false } };
  assert.equal(ar.canManageUser(noStaff, W, ownerId), false);
  assert.equal(ar.canManageUser(W, K, ownerId), false); // admin bo'lmagan hech kimni boshqarmaydi
});

test("Eski admin (huquq yozilmagan): avvalgidek barcha bo'limlar, admin tayinlay olmaydi", () => {
  const legacy = { id: 'user_1766000000000_q', role: 'admin', name: 'Eski' };
  const r = ar.getUserRights(legacy, ownerId);
  assert.equal(r.stats && r.cashier && r.settings && r.staff, true);
  assert.equal(r.approve, true);
  assert.equal(r.addAdmins, false);
  assert.equal(r.pinRules, false);
});

test("Admin o'zida yo'q huquqni bera olmaydi; bera olmaydigan huquq o'zgarmaydi", () => {
  const bNoStats = { ...B, adminRights: { ...B.adminRights, stats: false } };
  const given = ar.clampRights({ ...ar.ALL_RIGHTS }, bNoStats, ownerId, null);
  assert.equal(given.stats, false);
  assert.equal(given.addAdmins, true);
  assert.equal(given.pinRules, false); // B da yo'q
  const prev = { ...ar.defaultAdminRights(), stats: true, pinRules: true };
  const kept = ar.clampRights({ ...ar.NO_RIGHTS }, bNoStats, ownerId, prev);
  assert.equal(kept.stats, true); // B o'zgartira olmaydi - oldingi qiymat qoladi
  assert.equal(kept.pinRules, true);
  assert.equal(kept.cashier, false); // B da bor - o'chirildi
});

test("Admin huquqsiz admin tayinlay olmaydi (hech narsa bera olmaydi)", () => {
  assert.deepEqual(ar.grantableRights(C, ownerId), { ...ar.NO_RIGHTS });
});

test("Yopilgan bo'lim ekranda ochilmaydi, Boshqaruv doim ochiq", () => {
  const noCash = { ...C, adminRights: { ...C.adminRights, cashier: false } };
  assert.equal(ar.canOpenAdminView(noCash, ownerId, 'cashier'), false);
  assert.equal(ar.canOpenAdminView(noCash, ownerId, 'stats'), true);
  assert.equal(ar.canOpenAdminView(noCash, ownerId, 'admin'), true);
  assert.equal(ar.canOpenAdminView(W, ownerId, 'admin'), false);
});

test('Tasdiqlash huquqi: Ega har doim, admin - huquq bilan', () => {
  assert.equal(ar.canApproveOverride(A, ownerId), true);
  assert.equal(ar.canApproveOverride({ ...C, adminRights: { ...C.adminRights, approve: false } }, ownerId), false);
  assert.equal(ar.canApproveOverride(W, ownerId), false);
});

test("Huquq o'zgarishi jurnal uchun", () => {
  const before = ar.defaultAdminRights();
  const after = { ...before, stats: false, addAdmins: true };
  const text = ar.describeRightsChange(before, after);
  assert.match(text, /ochildi: Yangi admin tayinlash/);
  assert.match(text, /yopildi: Statistika/);
});

// ---------- PIN himoyasi ----------
test("Eski umumiy tugma yoqilgan: avval himoyalangan amallar yoqiq, yangilari o'chiq", () => {
  const r = pr.resolvePinRules(null, true);
  assert.equal(r.waiterCancelOrder, true);
  assert.equal(r.cashierDiscount, true);
  assert.equal(r.adminClearOrders, true);
  assert.equal(r.cashierDebt, false);
  assert.equal(r.kitchenReject, false);
  assert.equal(r.warehouseWriteOff, false);
});

test("Eski umumiy tugma o'chiq: hammasi o'chiq", () => {
  const r = pr.resolvePinRules(undefined, false);
  assert.equal(Object.values(r).some(Boolean), false);
});

test('Yozilgan qoida eski tugmadan ustun, alohida amal', () => {
  const r = pr.resolvePinRules({ waiterCancelOrder: false, kitchenReject: true }, true);
  assert.equal(r.waiterCancelOrder, false);
  assert.equal(r.waiterReduceItem, true);
  assert.equal(r.kitchenReject, true);
  assert.equal(pr.isPinRuleOn(r, 'waiterCancelOrder'), false);
  assert.equal(pr.isPinRuleOn(r, 'kitchenReject'), true);
});

test("Noma'lum amal kaliti: kamida bitta qoida yoqiq bo'lsa - himoyalangan (ehtiyot)", () => {
  assert.equal(pr.isPinRuleOn(pr.resolvePinRules(null, true), undefined), true);
  assert.equal(pr.isPinRuleOn(pr.resolvePinRules(null, false), 'boshqa'), false);
});

test("Guruhni o'zgartirish faqat shu amallarni o'zgartiradi", () => {
  const r = pr.resolvePinRules(null, true);
  const next = pr.withPinRules(r, { cashierDiscount: false, cashierDebt: true, nimadir: true });
  assert.equal(next.cashierDiscount, false);
  assert.equal(next.cashierDebt, true);
  assert.equal(next.waiterCancelOrder, true);
  assert.equal('nimadir' in next, false);
  assert.deepEqual(pr.countPinRules(next, ['cashierDiscount', 'cashierDebt']), { on: 1, total: 2 });
});

console.log(`✅ Ega, huquqlar va PIN himoyasi: ${passed} ta tekshiruv o'tdi`);
