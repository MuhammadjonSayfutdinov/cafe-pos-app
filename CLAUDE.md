# Claude uchun doimiy qoidalar (foydalanuvchi qarori)

Bu fayl har bir yangi sessiyada avtomatik o'qiladi. Batafsil reja va qarorlar: `PROGRESS.md`,
kod yozish qoidalari: `ai-context.txt`.

## Ish tartibi

1. **Qila oladigan hamma ishni o'zing qil:** kod yozish, tekshirish (`npm run build`, sinovlar),
   hujjatlarni yangilash, `master` ga commit va push. Foydalanuvchidan ruxsat so'rama.
2. **Faqat foydalanuvchi qilishi shart bo'lgan ishlarni** (uning kompyuteri, kafedagi qurilmalar,
   Supabase/Vercel/router sozlamalari, parollar) javob oxirida alohida bo'limda ajratib ko'rsat:
   "**Siz qilishingiz kerak:**". Bunday ish bo'lmasa, "Sizdan hech narsa talab qilinmaydi" deb yoz.
3. **Har bir buyruq uchun** (VS Code terminali, cmd, brauzer, sozlama oynasi):
   - qayerda bajariladi (masalan: VS Code → Terminal → New Terminal);
   - aniq buyruq (har biri alohida kod blokida);
   - **to'g'ri bo'lsa ekranda nima chiqadi** (kutilgan javob);
   - xato chiqsa nima qilish kerak (yoki xato matnini menga yuboring).
4. Javob o'zbek tilida, sodda va qisqa. Texnik atamani ishlatsang, oddiy so'z bilan izohla.

## Loyiha haqida qisqa

- Dastur: kafe POS (React + Vite, TypeScript'ga bosqichma-bosqich o'tilmoqda).
- Bulut: Supabase (asosiy ma'lumot ombori), sayt: Vercel (`master` dan avtomatik joylanadi).
- Kafe mahalliy serveri (ixtiyoriy): `server/`, qo'llanma `MAHALLIY-SERVER.md`.
