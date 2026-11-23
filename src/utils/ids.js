// Yozuvlar uchun noyob id. Bir nechta qurilma bir millisekundda yozuv yaratsa ham to'qnashmaydi
// (oldin faqat Date.now() ishlatilardi -> ikki qurilmadagi buyurtma bir xil id olib, biri yo'qolardi).
// Boshidagi 13 xonali vaqt saqlanadi: oshxona taymeri va statistika vaqtni id dan ham o'qiydi.
let counter = 0;

export function newId(prefix = '') {
  counter = (counter + 1) % 1296;
  const rand = Math.random().toString(36).slice(2, 7).padEnd(5, '0');
  return `${prefix}${Date.now()}_${rand}${counter.toString(36)}`;
}
