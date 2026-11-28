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
5. Taom rasmlari uchun: yana **New query** oching, [`supabase/storage.sql`](supabase/storage.sql) faylini
   joylab, **Run** bosing ("Success. No rows returned"). Rasm ombori (`menu-images`) yaratiladi:
   rasmlarni hamma ko'ra oladi (mijoz menyusi uchun), yuklash va o'chirish faqat ulangan qurilmadan.
   Tekshirish: chap menyu **Storage** → `menu-images` papkasi ko'rinadi. Ishga tushirilmasa, admin
   rasm qo'shganda "Rasm ombori yo'q: supabase/storage.sql ni ishga tushiring" xabari chiqadi.
6. Server xavfsizligi uchun: yana **New query**, [`supabase/security.sql`](supabase/security.sql) → **Run**
   ("Success. No rows returned"). Nima qilishi va tartibi: pastda "6. Server xavfsizligi".

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
   - **iPhone/iPad:** bosh ekrandagi belgi Safari'dan alohida xotiraga ega. Avval bosh ekranga qo'shing,
     keyin **belgidan** ochib qurilmani ulang. Safari'da ulangan bo'lsa ham, belgidan ochilganda yana bir marta ulash kerak.
   - Yangi qurilma bulutdan menyu va xodimlarni olmaguncha ochilmaydi (namuna xodimlar bulutdagi
     ma'lumotni buzmasligi uchun). Internet sekin bo'lsa, "yuklanmoqda" ekrani biroz turadi.

GitHub'ga yangi commit push qilinganda Vercel saytni avtomatik yangilaydi.

## 6. Server xavfsizligi (`security.sql`)

Shu fayl ishga tushirilgach:

- **Yangi qurilma tasdiqlanadi.** Kafe hisobiga (email + parol) ulangan yangi qurilmada "🔐 Qurilma tasdiqlanmagan"
  oynasi chiqadi: Ega yoki "Tizim sozlamalari" huquqli admin shu yerda PIN'ini kiritadi (qurilmaga nom beradi) yoki
  boshqa qurilmada Boshqaruv → Tizim sozlamalari → **📱 Qurilmalar** → ✅ Tasdiqlash. Tasdiqlanmagan qurilma hech
  narsa o'qiy olmaydi va yoza olmaydi: kafe paroli tarqalib ketsa ham ma'lumot himoyalangan. Yo'qolgan planshetni
  shu ro'yxatda **⛔️ Bloklash** mumkin (undagi maxfiy ma'lumot o'chadi).
- **PIN va Authenticator siri faqat serverda.** Xodimlar ro'yxatida endi PIN xeshi yo'q, PIN serverda tekshiriladi:
  5 marta xato - qurilma 30 soniya, keyin har safar 2 baravar ko'proq (15 daqiqagacha) bloklanadi. Internetsiz kirish:
  qurilma faqat o'zida (internet bor paytda) kirgan xodimlarning PIN'ini eslab qoladi (30 kun).
- **Har bir xodim faqat o'ziga ruxsat berilgan ma'lumotni ko'radi.** Mijozlar (telefon raqamlari), xarajatlar,
  smenalar, ombor tarixi va audit jurnali ofitsiant, oshpaz va kuryer qurilmasiga umuman kelmaydi; kassirga - mijoz,
  xarajat va smena; adminga - huquqlariga qarab (Ega - hammasi). Xodim chiqqach bu ma'lumot qurilmadan o'chadi.
- **O'zgartirish huquq bo'yicha.** Xodimlar, taom narxi va sozlamalarni faqat huquqi bor admin o'zgartiradi (oshxona
  faqat "tugadi" belgisini qo'yadi), audit jurnaliga faqat yoziladi (tozalash - faqat Ega), taom rasmini faqat
  "Taomlar" huquqli admin yuklaydi. Ruxsat yo'q o'zgarish sarlavhada `⏸ Kutmoqda` bo'lib turadi: huquqi bor xodim
  shu qurilmada internet bilan kirsa, o'zi qayta yuboriladi (yoki Tizim sozlamalarida "Voz kechish").
- **Yangi PIN - 6 xonali** (hamma uchun). Eski 4 xonali PIN'lar ishlayveradi: kirish oynasida 4 raqamni terib
  "✓ Kirish" bosiladi.

**Tartib (muhim):**

1. Avval dasturning yangi versiyasi barcha qurilmalarga yetib borsin: `master` ga push → Vercel joylaydi →
   qurilmalar 5 daqiqa ichida o'zi yangilanadi (kirish oynasining pastidagi versiya hamma qurilmada bir xil bo'lsin).
2. Keyin `security.sql` ni ishga tushiring. Shu paytda ulangan barcha qurilmalar avtomatik **ishonchli** bo'ladi.
3. Har bir qurilmada xodimlar bir marta chiqib, PIN bilan qayta kirsin (sarlavhada `🔑 Qayta kiring` chiqsa - bosing):
   server ularning rolini shunda biladi.
4. Tekshirish: Boshqaruv → Tizim sozlamalari → "☁️ Bulut sinxronlash" da yashil
   **"🔐 Server xavfsizligi yoqilgan"** va pastda "📱 Qurilmalar" ro'yxati.

Eski versiyadagi qurilma (yangilanmagan) `security.sql` dan keyin yoza olmaydi (sarlavhada `📴 Oflayn`): sahifani
yangilang. `schema.sql`, `qr.sql`, `storage.sql` ni keyin qayta ishga tushirish xavfsizlikni bekor qilmaydi.

## Mijoz telefonidan QR-buyurtma

1. Admin → Tizim Sozlamalari → "🖨️ QR stikerlar" (yoki ofitsiant ekranidagi 📱) → chop eting va stolga yopishtiring.
   QR kod `https://sizning-sayt/?table=3-Stol&k=<stol kaliti>` manzilini ochadi.
2. Mijoz skanerlaydi → menyu ochiladi (kirish talab qilinmaydi) → savatga qo'shib "Buyurtmani tasdiqlash".
3. Xodim ekranida "📱 QR-buyurtma: 3-Stol" chiqadi (ovozli signal bilan) → **Qabul qilish** yoki **Rad etish**.
4. Mijoz "Buyurtmalarim" bo'limida holatni ko'radi: kutilmoqda → qabul qilindi / rad etildi.
5. Mijoz "🔔 Ofitsiant" tugmasini bossa, ofitsiant, kassa va admin ekranining tepasida qizil
   "🔔 3-Stol: mijoz ofitsiantni chaqiryapti" chiqadi (ovoz bilan) → **✓ Bordim**.
6. Chek kassada to'langach, mijoz telefonidagi "Buyurtmalarim" bo'shaydi.

**Uzoqdan "o'yin" buyurtmasidan himoya** (Admin → Tizim Sozlamalari → "🛡️ QR-buyurtma himoyasi"):

- Band stolga (to'lanmagan cheki bor) faqat o'sha stoldagi QR kodni skaner qilgan mijoz buyurtma beradi:
  stikerda stolning maxfiy kaliti bor. Havolani qo'lda yozgan odam faqat bo'sh stolga so'rov yubora oladi,
  ofitsiant ekranida "⚠️ kalitsiz havola" deb ko'rinadi.
- **Faqat kafe ichidan** (ixtiyoriy): kafe joylashuvini kiriting (Google Maps'dan nusxa yoki "📍 Shu qurilma
  turgan joy") va radiusni tanlang (200 m tavsiya). Shunda buyurtma va chaqiruv faqat telefon joylashuvi
  shu radiusda bo'lsa qabul qilinadi.
- Stiker surati tarqalib ketsa: "🔄 QR kalitlarini yangilash" → stikerlarni qayta chop eting.
- Dastur yangilanganda `supabase/qr.sql` ni **yana bir marta to'liq** ishga tushiring, keyin
  **QR stikerlarni qayta chop eting** (eski stikerda kalit yo'q: band stolga buyurtma o'tmaydi).
  2026-11-27 dan: SQL yangilangach mijoz telefonida har bir taomning holati ko'rinadi (tayyor, berildi)
  va oshxona rad etgan taom alohida, sababi bilan chiqadi (hisobga kirmaydi). SQL yangilanmasa telefon
  avvalgidek ishlaydi (faqat umumiy holat).
- Tekshirish: Admin → Tizim Sozlamalari → "🛡️ QR-buyurtma himoyasi" da yashil
  **"✅ Server tayyor: supabase/qr.sql yangi versiyada"** yozuvi chiqishi kerak. Qizil
  "⛔ supabase/qr.sql yangilanmagan!" chiqsa, SQL ishga tushirilmagan (QR sahifa baribir ishlaydi,
  lekin band stol va joylashuv himoyasi ishlamaydi).

Mijozga faqat sotuvdagi taomlar nomi va narxi ko'rinadi. Xodimlar, PIN kodlar, mijozlar ro'yxati va boshqa
stollarning buyurtmalari ko'rinmaydi.

## 7. Pilot oldidan tekshiruv ro'yxati

- [ ] Admin va barcha xodimlarning PIN kodlari almashtirilgan ("Xodimlar va Parollar")
- [ ] Menyu, narxlar, stollar va kategoriyalar kiritilgan
- [ ] Supabase'da ochiq ro'yxatdan o'tish o'chirilgan (3-qadam)
- [ ] `supabase/qr.sql` ishga tushirilgan, QR stikerlar chop etilgan, telefondan sinov buyurtmasi berilgan
- [ ] `supabase/storage.sql` ishga tushirilgan, bitta taomga rasm qo'shildi va telefondagi QR-menyuda ko'rindi
- [ ] Telefondan "🔔 Ofitsiant" bosildi → kassa/ofitsiant ekranida qizil chaqiruv chiqdi
- [ ] "🛡️ QR-buyurtma himoyasi": kafe joylashuvi kiritilgan, "Faqat kafe ichidan" yoqilgan (ixtiyoriy)
- [ ] Har bir qurilma ulangan, sarlavhada `☁️ Bulut` belgisi ko'rinadi
- [ ] `supabase/security.sql` ishga tushirilgan; "📱 Qurilmalar" da barcha qurilmalar 🟢 va nomlangan; yangi
  qurilma (masalan, boshqa brauzer) ulanganda tasdiqlash oynasi chiqdi
- [ ] Sinov: ofitsiant planshetidan buyurtma → oshxona ekranida chiqdi → kassada to'landi
- [ ] Sinov: Wi-Fi o'chirildi → buyurtma berildi (`📴 Oflayn`) → Wi-Fi yoqildi → boshqa qurilmaga yetib keldi
- [ ] Har kuni ish oxirida zaxira nusxa: Boshqaruv → Tizim Sozlamalari → zaxira nusxani yuklab olish

## Cheklovlar (pilot versiyasi)

- **QR-buyurtma ofitsiant tasdig'idan o'tadi.** Mijoz telefonidan kelgan buyurtma ofitsiant/kassir/admin
  ekranida "📱 QR-buyurtma" bo'lib chiqadi va "Qabul qilish" bosilgandan keyingina oshxonaga tushadi.
  Bitta stoldan daqiqasiga 3 tadan ortiq so'rov qabul qilinmaydi. Narx telefondan emas, serverdagi menyudan olinadi.
- **PIN tekshiruvi** (`security.sql` dan keyin): serverda; internetsiz - qurilmada, faqat shu qurilmada avval
  (internet bilan) kirgan xodimlar uchun. Qurilmadagi PIN keshini terib topish mumkin (6 xonali PIN'da 1 000 000
  variant), shuning uchun planshetlarni qulflang va yo'qolganini "📱 Qurilmalar" da bloklang. `security.sql`
  bo'lmasa - PIN avvalgidek faqat qurilmada tekshiriladi va xeshlar bulutdagi xodimlar ro'yxatida turadi.
- **Ikki bosqichli kirish (admin):** Admin → "Xodimlar va Parollar" → "🔐 Ikki bosqichli kirishni yoqish".
  Shundan keyin PIN'dan keyin telefondagi Authenticator kodi so'raladi (kirish, avto-qulf, rahbar tasdig'i).
  `security.sql` dan keyin sir faqat serverda (va admin o'zi kirgan qurilmada) turadi, kod serverda tekshiriladi.
  Zaxira faylga sir yozilmaydi.
- **Bir xil qurilmada bir nechta xodim:** server qurilmaga oxirgi kirgan xodimning ruxsatini beradi. Internetsiz
  kirgan xodim serverga internet qaytganda bildiriladi; shu orada uning "faqat admin" o'zgarishlari `⏸ Kutmoqda`
  bo'lib turadi.
- **PIN xeshiga o'tish:** yangi versiya ochilganda eski ochiq PIN'lar o'zi xeshga o'tadi. Shundan keyin
  eski versiyada qolgan qurilmada xodimlar kira olmaydi. Qurilmalar yangi versiyaga o'zi o'tadi (avtomatik
  yangilanish); o'tmagan bo'lsa, sahifani yangilang.
- **Internet butunlay uzilsa** (qurilmalar to'g'ridan-to'g'ri bulutga ulangan bo'lsa) har bir qurilma alohida
  ishlashda davom etadi, lekin bir-biriga ma'lumot uzata olmaydi. Yechim - kafe mahalliy serveri:
  [MAHALLIY-SERVER.md](MAHALLIY-SERVER.md) (qurilmalar Wi-Fi orqali serverga, server bulutga ulanadi).
- **Saytning xavfsizlik sarlavhalari** (`vercel.json`, CSP): brauzer faqat shu sayt, `*.supabase.co` va
  `api.telegram.org` ga ulanadi. Supabase uchun o'z domeningizni ishlatsangiz, `vercel.json` dagi
  `connect-src` ga uni qo'shing (aks holda sinxronlash ishlamaydi).
- **Shaxsiy ma'lumotlar:** O'zbekiston qonunchiligiga ko'ra fuqarolarning shaxsiy ma'lumotlari
  mamlakat ichidagi serverlarda saqlanishi talab qilinadi. Pilotdan haqiqiy ishga o'tishda mahalliy
  serverga ko'chish rejalashtirilgan. Kod shunga tayyor: faqat transport qatlami
  (`src/sync/supabaseTransport.js`) almashtiriladi.

## Muammolar

| Belgi | Sabab va yechim |
|-------|-----------------|
| "Email yoki parol noto'g'ri" | 3-qadamdagi hisobni tekshiring, foydalanuvchi "Confirmed" bo'lishi kerak |
| Yangi qurilmada "Bulutdan ma'lumot olib bo'lmadi" | Internetni tekshiring va "Qayta urinish" ni bosing. Supabase loyihasi uxlab qolgan bo'lishi mumkin (Dashboard → Restore) |
| Doim `📴 Oflayn` | Internetni tekshiring. Supabase loyihasi uxlab qolgan bo'lishi mumkin (Dashboard → Restore) |
| Boshqa qurilmaga o'zgarish kelmayapti | SQL'dagi 5-qism (Realtime) bajarilganini tekshiring. Belgini bosing: "Hozir sinxronlash" |
| Qurilmani boshqa kafe hisobiga ulash kerak | Tizim Sozlamalari → "Qurilmani bulutdan uzish" |
| Admin telefoni ham, zaxira kodlari ham yo'qoldi | Boshqa admin: "Xodimlar va Parollar" → shu admin kartasida "O'chirish (tiklash)". Yagona admin bo'lsa: Supabase → SQL Editor → `update public.pos_staff_secrets set two_factor = null, two_factor_at = (extract(epoch from now()) * 1000)::bigint where two_factor is not null; update public.pos_records set data = public.pos_public_user(id, data), updated_by = 'sql' where collection = 'pos_users';` → Run. Bir daqiqadan keyin admin faqat PIN bilan kiradi va telefonni qayta ulaydi. (`security.sql` o'rnatilmagan bo'lsa: `update public.pos_records set data = data - 'twoFactor', updated_by = 'sql' where collection = 'pos_users' and data ? 'twoFactor';`) |
| "🔐 Qurilma tasdiqlanmagan" | Ega yoki admin shu oynada PIN'ini kiritadi, yoki boshqa qurilmada Tizim sozlamalari → 📱 Qurilmalar → ✅ Tasdiqlash. Oyna 15 soniyada o'zi yangilanadi |
| Barcha qurilmalar bloklandi / Ega PIN'ini unutdi | Supabase → SQL Editor. Qurilmalarni ochish: `update public.pos_devices set status = 'trusted' where status = 'revoked';`. Ega PIN'ini almashtirish (`'1'` - Ega id si, `'123456'` - yangi PIN): `update public.pos_staff_secrets set pin_hash = public.pos_make_pin_hash('123456'), pin_length = 6, pin_set_at = (extract(epoch from now()) * 1000)::bigint where user_id = '1'; update public.pos_records set data = public.pos_public_user(id, data), updated_by = 'sql' where collection = 'pos_users';` → Run, keyin darhol yangi PIN'ni dasturda o'zgartiring |
| Sarlavhada `⏸ Kutmoqda (n)` | Server bu o'zgarishni qabul qilmadi (ruxsat yo'q). Huquqi bor xodim shu qurilmada internet bilan kirsa, o'zi yuboriladi. Ro'yxat va "Voz kechish": Tizim sozlamalari → Bulut sinxronlash |

## Dasturchilar uchun: avtomatik sinov

Supabase'siz, soxta server bilan:

```bash
node scripts/fake-sync-server.mjs
VITE_FAKE_SYNC_URL=http://localhost:8787 npx vite build --mode e2e --outDir dist-e2e
npx vite preview --outDir dist-e2e --port 4174
```

Kirish: istalgan email, parol `parol123`. Ikki xil brauzer profilida oching: ular ikki qurilma bo'lib ishlaydi.
