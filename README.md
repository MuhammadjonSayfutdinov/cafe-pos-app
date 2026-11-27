# Cafe POS

Kafe va restoranlar uchun kassa tizimi (POS): ofitsiant, kassa, oshxona ekrani, ombor,
statistika, admin paneli va mijozlar uchun QR-menyu. Interfeys o'zbek tilida.

## Imkoniyatlar

- **Ofitsiant:** stollar xaritasi, buyurtma va dozakaz, chekni bo'lish, stolni ko'chirish, bron, VIP soatbay taymer;
  qaysi taom oshxonada, qaysi biri tayyor va berilgan - taom darajasida, tayyorlarini qisman topshirish
- **Oshxona (KDS):** buyurtmalar navbati, kechikish ogohlantirishi (SLA), stop-list; bir nechta taomni belgilab faqat
  ularni "tayyor" qilish; taomni yoki butun chekni sabab bilan rad etish (ofitsiant va kassaga darhol xabar,
  ixtiyoriy stop-list); dozakazda faqat yangi porsiyalar chiqadi (ovoz va "🆕 Qo'shimcha" belgisi); xodim bekor qilgan
  taom haqida qizil xabar; oldindan to'langan chek tayyor bo'lguncha oshxonada qoladi
- **Kassa:** naqd, plastik, Click/Payme, aralash va qarzga to'lov; chegirma, bonus/keshbek, pre-chek, qarzlar ro'yxati;
  smena ochish/yopish, sanalgan naqd va farq, Z-hisobot (chop etish, Telegram), smenalar tarixi
- **Mijoz QR-menyusi:** stoldagi QR kod orqali o'z telefonidan buyurtma (ofitsiant tasdiqlaydi), ofitsiantni chaqirish
  (chaqiruv ofitsiant, kassa va admin ekranida qizil bo'lib chiqadi). Band stolga faqat stoldagi QR bilan buyurtma
  beriladi; ixtiyoriy "Faqat kafe ichidan" (telefon joylashuvi) — uzoqdan "o'yin" buyurtmasi o'tmaydi.
  Barcha stollar uchun QR stikerlarni bitta A4 varaqda chop etish: Boshqaruv → Tizim Sozlamalari → "🖨️ QR stikerlar"
  (QR kod qurilmaning o'zida yaratiladi, internet shart emas)
- **Kuryer (yetkazib berish):** ofitsiant ekranida "🛵 Yangi yetkazish" (telefon, manzil, mo'ljal, yetkazish narxi;
  doimiy mijozning manzili o'zi to'ladi), kuryer o'z telefonida buyurtmani oladi, tayyor bo'lgach yo'lga chiqadi,
  yetkazgach mijoz qanday to'laganini belgilaydi; pulni kassaga topshiradi, kassir chekni yopadi.
  Admin uchun kuryerlar bo'yicha kunlik hisobot (yetkazishlar soni, yetkazish haqi, qo'lidagi naqd)
- **Ombor:** qoldiqlar, kirim/chiqim tarixi, texnologik karta bo'yicha avtomatik ayirish (to'lov paytida);
  ofitsiant menyusida "N porsiyaga yetadi / yetarli emas" belgisi, yetmasa kamomad yozuvi
- **Statistika:** tushum, tannarx, sof foyda, ofitsiantlar maoshi, Z-hisobot (Telegram'ga yuborish)
- **Admin:** menyu, kategoriyalar, xodimlar va PIN kodlar (lavozim nomini o'zingiz yozasiz, masalan "Barmen"), audit jurnali, zaxira nusxa, Telegram sozlamalari
- **Ega va admin huquqlari (Telegram guruhidagi kabi):** 👑 Ega - kafe egasi, uni hech kim tahrirlay yoki o'chira
  olmaydi. Ega admin va xodimlarni tayinlaydi, har bir adminga qaysi bo'limlar ochiq ekanini tugmalar bilan
  belgilaydi ("🛡️ Huquqlar"). Egalikni boshqa adminga topshirish mumkin (Ega PIN'i bilan)
- **Telegram:** har bir amal (kirish-chiqish, buyurtma, dozakaz, oshxona, to'lov, ombor, xodim, menyu) rahbar
  Telegramiga jonli jurnal bo'lib boradi; Z-hisobot, qarz, chegirma, ombor ogohlantirishlari alohida xabar
- **Xavfsizlik:** xavfli amallar admin PIN bilan tasdiqlanadi - qaysi amalda so'ralishi har biri uchun alohida
  (Boshqaruv → "🔐 PIN himoyasi": ofitsiant, kassa, oshxona, ombor bo'yicha tugmalar), 5 ta xato PIN'dan keyin vaqtincha bloklash;
  PIN kodlar ochiq matnda emas, xesh (tuzli SHA-256) ko'rinishida saqlanadi; saytda xavfsizlik sarlavhalari (CSP)
- **Planshetga o'rnatish (PWA):** bosh ekranga qo'shiladi, internet uzilib sahifa yangilansa ham ochiladi
- **Oflayn va sekin internet:** internet uzilsa ham ish davom etadi (o'zgarishlar qurilmada navbatda turadi va
  internet qaytganda o'zi yuboriladi). Sekin internetda dastur keshdan tez ochiladi, so'rovlar osilib qolmaydi,
  sarlavhada `🐢 Sekin internet` belgisi chiqadi
- **Kafe mahalliy serveri:** kassa kompyuterida `npm run hub` - internet butunlay uzilsa ham ofitsiant,
  oshxona va kassa Wi-Fi orqali bir-birini ko'radi; internet qaytganda server bulut bilan o'zi sinxronlanadi
  (qo'llanma: [MAHALLIY-SERVER.md](MAHALLIY-SERVER.md))
- **Avtomatik yangilanish:** saytga yangi versiya chiqsa, telefon, planshet va kompyuter o'zi yangilanadi
  (ish to'xtaganda; xodim o'z ekraniga PIN'siz qaytadi). Qurilmadagi versiya kirish oynasining pastida yozilgan

## Texnologiyalar

React 19, Vite 7, Tailwind CSS 4, TypeScript (bosqichma-bosqich: yangi va ko'chirilgan modullar `.ts`,
qolganlari hozircha `.js/.jsx`). Ma'lumotlar qurilmada (`localStorage`) saqlanadi; ixtiyoriy ravishda
**Supabase** orqali bir nechta qurilma o'rtasida sinxronlanadi (sozlash: [SUPABASE.md](SUPABASE.md)).

## Ishga tushirish

Node.js 20.19 yoki undan yangi versiya kerak (Vite 7 talabi).

```bash
npm install
npm run dev
```

Brauzerda `http://localhost:5173` ni oching. `npm run dev` serverni mahalliy tarmoqqa ham ochadi
(`--host`), shuning uchun bir xil Wi-Fi'dagi planshet yoki telefondan ham kirish mumkin.

Tayyor (production) versiyani yig'ish (avval TypeScript tekshiruvi o'tadi):

```bash
npm run build
npm run preview
```

Kafe mahalliy serveri (build'dan keyin, qo'llanma: [MAHALLIY-SERVER.md](MAHALLIY-SERVER.md)):

```bash
npm run hub
```

Faqat turlarni (TypeScript) tekshirish:

```bash
npm run typecheck
```

Oshxona mantig'ini (taom darajasida tayyor, rad etish, dozakaz, to'langan chek) tekshirish:

```bash
npm run test:kitchen
```

Ega, admin huquqlari va PIN himoyasi qoidalarini tekshirish:

```bash
npm run test:access
```

## Birinchi kirish

| Rol | Ism | PIN |
|-----|-----|-----|
| Admin | Admin | `777777` |
| Kassir | Sardor | `1111` |
| Ofitsiant | Ali | `2222` |
| Oshpaz | Oshpaz | `3333` |
| Omborchi | Omborchi | `444444` |

Admin va omborchi "BOSHQARUV" orqali (6 xonali PIN), qolganlar "XODIMLAR" orqali (4 xonali PIN) kiradi.
Kuryer namunada yo'q: Boshqaruv → "Xodimlar va Parollar" → "Qaysi bo'limda ishlaydi" = "🛵 Kuryer".
**Birinchi kirishdan keyin barcha PIN kodlarni almashtiring:** Boshqaruv → "Xodimlar va Parollar".
Admin standart PIN bilan ishlasa, ekranning tepasida ogohlantirish chiqib turadi.

## Ma'lumotlar haqida muhim

- Supabase sozlanmagan bo'lsa, ma'lumotlar faqat shu brauzer va shu qurilmada saqlanadi.
  Bir nechta qurilmani (ofitsiant, oshxona, kassa) ulash uchun: [SUPABASE.md](SUPABASE.md).
- Brauzer tarixi yoki sayt ma'lumotlari tozalansa, hamma narsa o'chadi. **Muntazam zaxira nusxa oling:**
  Boshqaruv → Tizim Sozlamalari → zaxira nusxani yuklab olish.
- Zaxira fayliga PIN kodlar va Telegram bot tokeni yozilmaydi. Tokenni alohida, xavfsiz joyda saqlang.
- PIN kodlarni hech kim (admin ham) ko'ra olmaydi: xodim PIN'ini unutsa, admin "Xodimlar va Parollar" da
  yangisini beradi.
- Xotira to'lsa, dastur ogohlantiradi. Shunda zaxira nusxa olib, eski cheklar tarixini tozalang.

## Yangi versiyani chiqarish (qurilmalarga yetkazish)

Qurilmalar (telefon, planshet, kompyuter) dasturni **Vercel'dagi saytdan** oladi. Vercel faqat `master`
branch'ini joylaydi. Shuning uchun yangi kod qurilmalarga yetib borishi uchun:

1. O'zgarishlarni `master` ga qo'shing va GitHub'ga yuboring (`git push origin master`).
2. Vercel 1–2 daqiqada saytni yangilaydi (Vercel → Deployments: "Ready").
3. Qurilmalar 5 daqiqa ichida (yoki ilova qayta ochilganda) yangi versiyani ko'radi:
   - kirish (PIN) oynasida: 20 soniyadan keyin o'zi yangilanadi;
   - xodim ishlayotgan bo'lsa: ekran pastida "Yangilash" tugmasi chiqadi, 3 daqiqa hech narsa
     bosilmasa o'zi yangilanadi (xodim o'sha ekranga PIN'siz qaytadi);
   - ofitsiant savatchasida yuborilmagan taom yoki ochiq yetkazish formasi bo'lsa, yangilanish kutadi.
4. Tekshirish: kirish oynasining pastidagi "Versiya: ..." yozuvi barcha qurilmalarda bir xil bo'lishi kerak.

`npm run dev` faqat shu kompyuterda ishlaydi: telefon undagi o'zgarishni ko'rmaydi.

## Loyiha tuzilishi

```
supabase/schema.sql       Supabase jadvallari va xavfsizlik qoidalari
server/                   kafe mahalliy serveri: hub.mjs (HTTP, qurilmalar), store.mjs (disk),
                          upstream.mjs (bulut bilan sinxron), start-windows.bat
scripts/                  sinov uchun soxta sinxron server
src/
  App.jsx                 global state, rollar bo'yicha ekranlar, QR-buyurtma
  main.jsx                ishga tushirish: migratsiya, ErrorBoundary, bildirishnomalar
  components/             ekranlar (Waiter*, Cashier*, Kitchen*, Warehouse*, Stats*, Admin*)
  constants/orderStatus.js  buyurtma statuslari, to'lov turlari, yetkazib berish sxemasi
  constants/roles.js      xodim rollari (bo'limlar) va PIN uzunligi
  hooks/useSticky.js      localStorage bilan sinxron state
  sync/                   sinxronlash: dvigatel, transportlar (Supabase, hubTransport.ts - mahalliy server),
                          types.ts (transport shartnomasi), timeouts.ts (sekin internet)
  pwa/                    oflayn ishlash (service worker) va avtomatik yangilanish (update.js)
  qr/                     mijoz QR-menyusi (PublicQrApp), QR kod yaratish (qrEncode.js), stol havolasi (tableQrUrl.js)
  utils/
    ids.ts                noyob id (bir nechta qurilmada to'qnashmaydi)
    orderTotals.ts        buyurtma summasini hisoblashning yagona joyi
    delivery.js           yetkazib berish: "Yetkazish #N" nomi, yetkazish narxi qatori, doimiy mijoz manzili
    dates.js              sana bilan ishlash (millisekund bo'yicha)
    pinGuard.ts           xato PIN urinishlarini cheklash
    pinHash.ts            PIN xeshi: saqlash, tekshirish, eski ochiq PIN'larni ko'chirish
    sha256.ts             SHA-256 (kutubxonasiz, http da ham ishlaydi)
    notify.js             toast va tasdiqlash oynasi
    migrate.js            eski ma'lumotlarni yangi sxemaga keltirish
    telegramNotifier.js   Telegram xabarlari
    telegramFeed.js       Telegram jonli jurnali: har bir amal, navbat va oflayn qayta yuborish
```

## Dasturchilar uchun

- Kod yozish qoidalari va ma'lumotlar sxemasi: [`ai-context.txt`](ai-context.txt)
- Reja, ma'lum xatolar va bajarilganlar: [`PROGRESS.md`](PROGRESS.md)
- Avtomatik commit qiluvchi vositalarni (GitDoc, `autosync`) yoqmang: ular har bir saqlashni
  commit qilib, GitHub'ga yuborib yuboradi.
