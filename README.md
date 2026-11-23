# Cafe POS

Kafe va restoranlar uchun kassa tizimi (POS): ofitsiant, kassa, oshxona ekrani, ombor,
statistika, admin paneli va mijozlar uchun QR-menyu. Interfeys o'zbek tilida.

## Imkoniyatlar

- **Ofitsiant:** stollar xaritasi, buyurtma va dozakaz, chekni bo'lish, stolni ko'chirish, bron, VIP soatbay taymer
- **Oshxona (KDS):** buyurtmalar navbati, kechikish ogohlantirishi (SLA), stop-list; dozakazda faqat yangi porsiyalar chiqadi
- **Kassa:** naqd, plastik, Click/Payme, aralash va qarzga to'lov; chegirma, bonus/keshbek, pre-chek, qarzlar ro'yxati
- **Ombor:** qoldiqlar, kirim/chiqim tarixi, texnologik karta bo'yicha avtomatik ayirish (to'lov paytida)
- **Statistika:** tushum, tannarx, sof foyda, ofitsiantlar maoshi, Z-hisobot (Telegram'ga yuborish)
- **Admin:** menyu, kategoriyalar, xodimlar va PIN kodlar, audit jurnali, zaxira nusxa, Telegram sozlamalari
- **Xavfsizlik:** xavfli amallar admin PIN bilan tasdiqlanadi, 5 ta xato PIN'dan keyin vaqtincha bloklash

## Texnologiyalar

React 19, Vite 7, Tailwind CSS 4. Ma'lumotlar qurilmada (`localStorage`) saqlanadi; ixtiyoriy ravishda
**Supabase** orqali bir nechta qurilma o'rtasida sinxronlanadi (sozlash: [SUPABASE.md](SUPABASE.md)).

## Ishga tushirish

Node.js 20.19 yoki undan yangi versiya kerak (Vite 7 talabi).

```bash
npm install
npm run dev
```

Brauzerda `http://localhost:5173` ni oching. `npm run dev` serverni mahalliy tarmoqqa ham ochadi
(`--host`), shuning uchun bir xil Wi-Fi'dagi planshet yoki telefondan ham kirish mumkin.

Tayyor (production) versiyani yig'ish:

```bash
npm run build
npm run preview
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
**Birinchi kirishdan keyin barcha PIN kodlarni almashtiring:** Boshqaruv → "Xodimlar va Parollar".
Admin standart PIN bilan ishlasa, ekranning tepasida ogohlantirish chiqib turadi.

## Ma'lumotlar haqida muhim

- Supabase sozlanmagan bo'lsa, ma'lumotlar faqat shu brauzer va shu qurilmada saqlanadi.
  Bir nechta qurilmani (ofitsiant, oshxona, kassa) ulash uchun: [SUPABASE.md](SUPABASE.md).
- Brauzer tarixi yoki sayt ma'lumotlari tozalansa, hamma narsa o'chadi. **Muntazam zaxira nusxa oling:**
  Boshqaruv → Tizim Sozlamalari → zaxira nusxani yuklab olish.
- Zaxira fayliga PIN kodlar va Telegram bot tokeni yozilmaydi. Tokenni alohida, xavfsiz joyda saqlang.
- Xotira to'lsa, dastur ogohlantiradi. Shunda zaxira nusxa olib, eski cheklar tarixini tozalang.

## Loyiha tuzilishi

```
supabase/schema.sql       Supabase jadvallari va xavfsizlik qoidalari
scripts/                  sinov uchun soxta sinxron server
src/
  App.jsx                 global state, rollar bo'yicha ekranlar, QR-buyurtma
  main.jsx                ishga tushirish: migratsiya, ErrorBoundary, bildirishnomalar
  components/             ekranlar (Waiter*, Cashier*, Kitchen*, Warehouse*, Stats*, Admin*)
  constants/orderStatus.js  buyurtma statuslari va to'lov turlari
  hooks/useSticky.js      localStorage bilan sinxron state
  sync/                   bulutda sinxronlash (dvigatel, Supabase transporti)
  utils/
    ids.js                noyob id (bir nechta qurilmada to'qnashmaydi)
    orderTotals.js        buyurtma summasini hisoblashning yagona joyi
    dates.js              sana bilan ishlash (millisekund bo'yicha)
    pinGuard.js           xato PIN urinishlarini cheklash
    notify.js             toast va tasdiqlash oynasi
    migrate.js            eski ma'lumotlarni yangi sxemaga keltirish
    telegramNotifier.js   Telegram xabarlari
```

## Dasturchilar uchun

- Kod yozish qoidalari va ma'lumotlar sxemasi: [`ai-context.txt`](ai-context.txt)
- Reja, ma'lum xatolar va bajarilganlar: [`PROGRESS.md`](PROGRESS.md)
- Avtomatik commit qiluvchi vositalarni (GitDoc, `autosync`) yoqmang: ular har bir saqlashni
  commit qilib, GitHub'ga yuborib yuboradi.
