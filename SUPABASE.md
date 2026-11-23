# Bulutda sinxronlash (Supabase) — sozlash qo'llanmasi

Bu qo'llanma kafeda bir nechta qurilmani (ofitsiant planshetlari, oshxona ekrani, kassa)
bitta bazaga ulashni tushuntiradi. Sozlanmasa ham dastur avvalgidek bitta qurilmada ishlaydi.

## Qanday ishlaydi

- Har bir qurilma o'z xotirasida ishlaydi, shuning uchun **internet uzilsa ham dastur to'xtamaydi**.
  O'zgarishlar navbatda turadi va internet qaytganda yuboriladi (sarlavhada `📴 Oflayn (n)` belgisi).
- Bir qurilmadagi o'zgarish boshqalariga 1–2 soniyada yetib boradi: ofitsiant buyurtma beradi,
  oshxona ekranida darhol chiqadi.
- Har bir buyurtma, taom va xodim alohida saqlanadi. Ikki ofitsiant bir vaqtda turli stollarga
  buyurtma bersa, ikkalasi ham saqlanadi. **Bitta** buyurtmani ikki qurilmada bir vaqtda
  o'zgartirsangiz, oxirgisi qoladi.
- Qurilma kafe hisobiga **bir marta** email va parol bilan ulanadi. Keyin xodimlar odatdagidek
  PIN bilan kiradi.

## 1. Supabase loyihasini yarating

1. https://supabase.com saytida ro'yxatdan o'ting va **New project** bosing.
2. Nom bering (masalan, `cafe-pos`), ma'lumotlar bazasi parolini o'ylab topib, xavfsiz joyga yozib qo'ying.
3. Region: O'zbekistonga eng yaqini (masalan, Frankfurt — `eu-central-1`).
4. Bepul (Free) tarif pilot uchun yetarli. E'tibor bering: bepul loyiha **7 kun ishlatilmasa uxlab qoladi**.
   Dashboard'dan bir bosish bilan qayta yoqiladi.

## 2. Jadvallarni yarating

1. Chap menyudan **SQL Editor** → **New query**.
2. Loyihadagi [`supabase/schema.sql`](supabase/schema.sql) faylini to'liq nusxalab joylang va **Run** bosing.
3. "Success" chiqishi kerak. Faylni qayta ishga tushirish xavfsiz: mavjud ma'lumot o'chmaydi.
4. Mijoz telefonidan QR-buyurtma uchun: yana **New query** oching, [`supabase/qr.sql`](supabase/qr.sql)
   faylini joylab, **Run** bosing ("Success. No rows returned" chiqishi kerak).

## 3. Kafe hisobini yarating va ro'yxatdan o'tishni yoping (MUHIM)

1. **Authentication → Users → Add user → Create new user**.
   Email (masalan, `kafe@sizningkafe.uz`) va kuchli parol kiriting, **Auto Confirm User** ni belgilang.
   Barcha qurilmalar shu bitta hisob bilan ulanadi.
2. **Authentication → Sign In / Providers** (yoki Settings) bo'limida
   **"Allow new users to sign up"** ni **o'chiring**.

   > ⚠️ Buni o'chirmasangiz, saytingizni ochgan istalgan odam o'zi hisob ochib, barcha
   > ma'lumotlarni (mijozlar telefonlari, xodimlar PIN kodlari) o'qiy oladi.

## 4. Dasturga ulang

1. **Project Settings → API** (yoki **API Keys**) sahifasidan ikki qiymatni oling:
   - **Project URL** (masalan, `https://abcdefgh.supabase.co`)
   - **anon public** yoki **publishable** kalit.
     `service_role` yoki `secret` kalitni **hech qachon** ishlatmang: u barcha himoyani chetlab o'tadi.
2. Loyiha papkasida `.env.example` faylini `.env.local` nomi bilan nusxalang va qiymatlarni yozing:

   ```
   VITE_SUPABASE_URL=https://abcdefgh.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

   `.env.local` GitHub'ga yuklanmaydi (`.gitignore` da).
3. Dasturni qayta ishga tushiring:

   ```bash
   npm install
   npm run dev
   ```

4. Brauzerda **"Qurilmani ulash"** ekrani chiqadi. 3-qadamdagi email va parolni kiriting.
   - **Birinchi** ulangan qurilma o'z ma'lumotlarini (menyu, xodimlar, sozlamalar) bulutga yuklaydi.
     Shuning uchun menyu va xodimlar to'g'ri kiritilgan qurilmani birinchi ulang.
   - Keyingi qurilmalar bulutdagi ma'lumotni oladi, o'zining boshlang'ich ma'lumotini yuklamaydi.

## 5. Internetga joylash (Vercel, bepul)

Planshet va telefonlar dasturni oddiy havola orqali ochishi uchun:

1. https://vercel.com ga GitHub orqali kiring → **Add New → Project** → `cafe-pos-app` repozitoriyasini tanlang.
2. Framework avtomatik **Vite** deb aniqlanadi. **Environment Variables** bo'limiga
   `VITE_SUPABASE_URL` va `VITE_SUPABASE_ANON_KEY` ni qo'shing.
3. **Deploy** bosing. Bir necha daqiqada `https://cafe-pos-app-xxxx.vercel.app` kabi havola beriladi.
4. Har bir qurilmada shu havolani oching. Brauzer menyusidan **"Bosh ekranga qo'shish"** ni tanlang:
   dastur ilovaga o'xshab ochiladi.

GitHub'ga yangi commit push qilinganda Vercel saytni avtomatik yangilaydi.

## Mijoz telefonidan QR-buyurtma

1. Ofitsiant ekranida stol kartochkasidagi 📱 tugmasi → QR kodni chop eting va stolga yopishtiring.
   QR kod `https://sizning-sayt/?table=3-Stol` manzilini ochadi.
2. Mijoz skanerlaydi → menyu ochiladi (kirish talab qilinmaydi) → savatga qo'shib "Buyurtmani tasdiqlash".
3. Xodim ekranida "📱 QR-buyurtma: 3-Stol" chiqadi (ovozli signal bilan) → **Qabul qilish** yoki **Rad etish**.
4. Mijoz "Buyurtmalarim" bo'limida holatni ko'radi: kutilmoqda → qabul qilindi / rad etildi.
5. Mijoz "🔔 Ofitsiant" tugmasini bossa, xodim qurilmalarida chaqiruv chiqadi.

Mijozga faqat sotuvdagi taomlar nomi va narxi ko'rinadi. Xodimlar, PIN kodlar, mijozlar ro'yxati va boshqa
stollarning buyurtmalari ko'rinmaydi.

## 6. Pilot oldidan tekshiruv ro'yxati

- [ ] Doimiy manzil tanlangan: Vercel → Settings → Domains'da qisqa `.vercel.app` manzil qo'shilgan,
      eski manzil yangisiga yo'naltirilgan (Redirect). Qurilmalar faqat shu manzildan ulanadi
- [ ] Admin va barcha xodimlarning PIN kodlari almashtirilgan ("Xodimlar va Parollar")
- [ ] Menyu, narxlar, stollar va kategoriyalar kiritilgan
- [ ] Supabase'da ochiq ro'yxatdan o'tish o'chirilgan (3-qadam)
- [ ] `supabase/qr.sql` ishga tushirilgan, telefondan sinov buyurtmasi berilgan
- [ ] QR stikerlar **yangi manzildan** ochilgan qurilmada chop etilgan (QR kod qurilma ochilgan manzilni oladi)
- [ ] Har bir qurilma ulangan, sarlavhada `☁️ Bulut` belgisi ko'rinadi
- [ ] Sinov: ofitsiant planshetidan buyurtma → oshxona ekranida chiqdi → kassada to'landi
- [ ] Sinov: Wi-Fi o'chirildi → buyurtma berildi (`📴 Oflayn`) → Wi-Fi yoqildi → boshqa qurilmaga yetib keldi
- [ ] Har kuni ish oxirida zaxira nusxa: Boshqaruv → Tizim Sozlamalari → zaxira nusxani yuklab olish

## Cheklovlar (pilot versiyasi)

- **QR-buyurtma ofitsiant tasdig'idan o'tadi.** Mijoz telefonidan kelgan buyurtma ofitsiant/kassir/admin
  ekranida "📱 QR-buyurtma" bo'lib chiqadi va "Qabul qilish" bosilgandan keyingina oshxonaga tushadi.
  Bitta stoldan daqiqasiga 3 tadan ortiq so'rov qabul qilinmaydi. Narx telefondan emas, serverdagi menyudan olinadi.
- **PIN tekshiruvi qurilmada** bajariladi. Bulutdagi ma'lumot kafe hisobi bilan himoyalangan, lekin
  ulangan qurilmani qo'lga kiritgan odam ma'lumotlarni ko'ra oladi. Planshetlarni qulflab qo'ying.
- **Shaxsiy ma'lumotlar:** O'zbekiston qonunchiligiga ko'ra fuqarolarning shaxsiy ma'lumotlari
  mamlakat ichidagi serverlarda saqlanishi talab qilinadi. Pilotdan haqiqiy ishga o'tishda mahalliy
  serverga ko'chish rejalashtirilgan. Kod shunga tayyor: faqat transport qatlami
  (`src/sync/supabaseTransport.js`) almashtiriladi.

## Muammolar

| Belgi | Sabab va yechim |
|-------|-----------------|
| "Email yoki parol noto'g'ri" | 3-qadamdagi hisobni tekshiring, foydalanuvchi "Confirmed" bo'lishi kerak |
| Doim `📴 Oflayn` | Internetni tekshiring. Supabase loyihasi uxlab qolgan bo'lishi mumkin (Dashboard → Restore) |
| Boshqa qurilmaga o'zgarish kelmayapti | SQL'dagi 5-qism (Realtime) bajarilganini tekshiring. Belgini bosing: "Hozir sinxronlash" |
| Qurilmani boshqa kafe hisobiga ulash kerak | Tizim Sozlamalari → "Qurilmani bulutdan uzish" |

## Dasturchilar uchun: avtomatik sinov

Supabase'siz, soxta server bilan:

```bash
node scripts/fake-sync-server.mjs
VITE_FAKE_SYNC_URL=http://localhost:8787 npx vite build --mode e2e --outDir dist-e2e
npx vite preview --outDir dist-e2e --port 4174
```

Kirish: istalgan email, parol `parol123`. Ikki xil brauzer profilida oching: ular ikki qurilma bo'lib ishlaydi.
