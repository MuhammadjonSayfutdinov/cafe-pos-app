# PROGRESS — cafe-pos-app

Oxirgi yangilanish: 2026-11-24
Joriy bosqich: **pilot**. 3-bosqich (Supabase) va 4-bosqichning asosiy funksiyalari `tortinchi-bosqich` branch'ida. Sozlash: `SUPABASE.md`.

> Bu fayl Claude uchun yozilgan. Barcha kodni faqat Claude yozadi (Gemini ishlatilmaydi).
> Yangi chatda birinchi navbatda shu faylni va `ai-context.txt` ni o'qi.

## Claude uchun ko'rsatmalar

**Foydalanuvchi:** o'zbek tilida, qisqa javob yoz. Butun faylni qayta yozma: faqat o'zgargan funksiyani yoz.

**Cheklovlar:** dasturni ishga tushira olmayman va GitHub'ga yoza olmayman. Foydalanuvchi kodni VS Code'ga ko'chiradi, sinaydi, xato bo'lsa konsol matnini (5–10 qator) yuboradi.

**Sessiya boshida:**
1. Bu fayl va `ai-context.txt` ni o'qi.
2. "Joriy vazifa" dagi fayllarni so'ra yoki GitHub'dan o'qi. Butun repoga, zipga va `node_modules` ga tegma.
3. Katta fayllarda (`CashierMode`, `StatsMode`, `WaiterMode`) faqat kerakli funksiyani so'ra yoki qatorlar oralig'ini o'qi.

**Javob formati (har vazifa):**
1. Nima o'zgaradi: 1–2 jumla.
2. Har fayl uchun: fayl nomi, funksiya nomi, to'liq yangi funksiya (yoki "eski → yangi" bloki).
3. "Sinab ko'rish": 2–3 qadam.
4. "PROGRESS.md da yangila": qaysi qatorni `[x]` qilish va commit xabari.

**Token tejash:** bitta vazifa = bitta chat. Tahlilni uzaytirma, tuzatishni ber. Kod yozish qoidalari: `ai-context.txt` 2-bo'lim.

## Ish tartibi

1. Foydalanuvchi yangi chat ochadi va "Joriy vazifa" ni yozadi (pastdagi andoza).
2. Claude kerakli fayllarni o'qiydi va tuzatishni beradi.
3. Foydalanuvchi VS Code'da qo'llaydi, sinaydi va commit qiladi ("<bosqich>: <vazifa>").
4. Xato chiqsa, shu chatda konsol matnini yuboradi, Claude tuzatadi.
5. Qabul qilingach, jadvaldagi `[ ]` → `[x]` va commit hash yoziladi.

Ixtiyoriy tekshiruv: commit havolasini `.diff` bilan yuborsa, Claude faqat o'zgarishni o'qiydi:
`https://github.com/MuhammadjonSayfutdinov/cafe-pos-app/commit/<hash>.diff`

## Joriy vazifa

**Pilot:** foydalanuvchi `supabase/qr.sql` ni ishga tushiradi, saytni Vercel'ga joylaydi, kafeda sinaydi.
**QR himoyasi (B15–B18) dan keyin:** `supabase/qr.sql` ni Supabase'da yana bir marta to'liq ishga tushirish,
QR stikerlarni qayta chop etish (yangi stikerda stol kaliti bor), xohlasa Admin → Tizim Sozlamalari →
"🛡️ QR-buyurtma himoyasi" da "Faqat kafe ichidan" ni yoqish. Shu bo'limda yashil "✅ Server tayyor"
chiqishi kerak (qizil "⛔ supabase/qr.sql yangilanmagan!" = SQL ishga tushirilmagan; telefon sahifasi
baribir eski usulda ishlaydi: `qrApi.js` -> `callCompat`).
Stollar uchun QR stikerlar tayyor: Admin → Tizim Sozlamalari → Stollar → "🖨️ QR stikerlar".
Pilotda: sayt manzilini (Vercel) yozib stikerlarni chop etish, bittasini telefon bilan skaner qilib tekshirish.
Yangi kod qurilmalarga faqat `master` ga push qilingach (Vercel joylagach) yetib boradi, keyin o'zi yangilanadi.
Keyin pilot natijasiga qarab: PIN tekshiruvini serverga ko'chirish, Click/Payme, fiskal chek, Vitest.
Kichik ishlar (istalgan vaqtda): `barcha-kodlar.txt` (eskirgan kod nusxasi) va `preview.html` kerakmi, ko'rib chiqish.

## Vazifa → kerakli fayllar

Qator raqamlari 2026-10-26 holatiga ko'ra, kod o'zgargach siljiydi.

| Vazifa | Fayl va funksiyalar |
|--------|---------------------|
| 0 Tozalash | `.gitignore`, `package.json`, `index.html`, `src/index.css`, `.vscode/*`, `autosync.cjs` |
| 1 Ombor (B1) | `App.jsx`: `deductInventoryForItems` (214), `handleOrderSubmit` (265). `CashierMode.jsx`: `deductOrderIngredientsFromStock` (647, chaqiruv 874), `handleDeleteOrder` (1009) |
| 2 Jami summa (B10) | `App.jsx`: `handleOrderSubmit`, `handleSplitOrder` (403). `CashierMode.jsx`: jami hisob (~325–400) |
| 3 Sana va qarz (B4, B7, B8) | `AdminDashboard.jsx` (~52), `WaiterMode.jsx` (~688), `CashierMode.jsx`: `handlePaymentSubmit` (766), `handlePayOffDebt` (983) |
| 4 Xavfsizlik (B5, B6) | `LockScreen.jsx`, `ManagerOverrideModal.jsx`, `AdminSettingsTab.jsx`: `handleExportBackup` (254), `handleImportBackup` (284), `handleClearOrdersOnly` (318) |
| 5 Dozakaz va bo'lish (B3, B9) | `App.jsx`: `handleOrderSubmit`, `handleUpdateStatus` (366), `handleSplitOrder`. `KitchenMode.jsx`, `WaiterTableGrid.jsx` |

## Ma'lum xatolar

| ID | Xato | Fayl | Bosqich | Holat |
|----|------|------|---------|-------|
| B1 | Ombor ikki marta ayiriladi (buyurtma yuborilganda va to'lovda); bekor qilinsa qaytmaydi | `App.jsx`, `CashierMode.jsx` (~647) | 1 | [x] |
| B2 | Tailwind CDN ga bog'liq, versiyalar aralash (3 va 4), `index.css` da import yo'q | `index.html`, `package.json`, `index.css` | 0 | [x] |
| B3 | Dozakaz butun buyurtmani `'Yangi'` ga qaytaradi | `App.jsx` (`handleOrderSubmit`) | 1 | [x] |
| B4 | Sana `toLocaleDateString()` bilan solishtiriladi; `date` yo'q buyurtma "bugungi" | `AdminDashboard.jsx:52`, `WaiterMode.jsx:688` | 1 | [x] |
| B5 | Zaxira faylida PIN va Telegram tokeni ochiq; import tekshiruvsiz | `AdminSettingsTab.jsx` | 1 | [x] |
| B6 | `LockScreen` da urinishlar cheklanmagan; standart `777777` zaxirasi | `LockScreen.jsx`, `ManagerOverrideModal.jsx` | 1 | [x] |
| B7 | Qarz yopilganda to'lov turi `'Naqd'` ga almashadi, sana siljiydi | `CashierMode.jsx` (`handlePayOffDebt`) | 1 | [x] |
| B8 | Qarzga yozishda telefon tekshirilmaydi (faqat ism) | `CashierMode.jsx` | 1 | [x] |
| B9 | Chekni bo'lishda chegirma yo'qoladi, qisman miqdor ko'chirilmaydi | `App.jsx` (`handleSplitOrder`) | 1 | [x] |
| B10 | Jami summa formulasi 4+ joyda nusxalangan; takroriy maydonlar | `App.jsx`, `CashierMode.jsx` | 1 | [x] |
| B11 | `useSticky`: oxirgi yozuv g'olib; to'lib qolsa xato faqat konsolga | `useSticky.js` | 2 | [x] |
| B12 | Telegram yuborish kodi 3 joyda nusxalangan, `telegramNotifier.js` ishlatilmaydi | `CashierMode`, `WaiterMode`, `StatsMode` | 2 | [x] |
| B13 | Taxminan 70 ta `alert/confirm` | ko'p fayllar | 2 | [x] |
| B14 | Chekni bo'lishda `movTotals` aniqlanmagan: bo'lingandan keyin xato chiqib, oyna yopilmasdi (qayta bosilsa ikki marta bo'linardi) | `WaiterMode.jsx` (`handleConfirmSplit`) | 4 | [x] |
| B15 | Telefondan ofitsiant chaqiruvi xodim ekraniga chiqmasdi: `pos_calls` ni hech bir ekran o'qimasdi (faqat buyurtmadagi `hasCall`); javobsiz qolgan chaqiruv serverda yangisini to'sardi | `App.jsx`, `WaiterMode.jsx`, `WaiterTableGrid.jsx`, `WaiterCallsPanel.jsx`, `qr.sql` | pilot | [x] |
| B16 | Chek to'langach taom mijoz "Buyurtmalarim" da sariq "tayyorlanmoqda" bo'lib qolardi: telefon chek holatini bilmasdi; mijoz ekranida ro'yxat bo'shasa lokal nusxa qayta chiqardi | `CustomerQRView.jsx`, `PublicQrApp.jsx`, `App.jsx` (`handleQrRequest`), `qr.sql` (`qr_request_status`) | pilot | [x] |
| B17 | Mijoz ekranida (kirish oynasi → "Mijoz uchun QR-Menyu") band stolni tanlab, boshqa mijozning chekiga buyurtma berish mumkin edi | `LockScreen.jsx`, `App.jsx` | pilot | [x] |
| B18 | QR havolani qo'lda yozib (stolda o'tirmasdan, uzoqdan) istalgan stolga buyurtma va chaqiruv yuborish mumkin edi | `qr.sql` (`qr_access`), `src/qr/tableKey.js`, `QrSecuritySection.jsx`, `PublicQrApp.jsx` | pilot | [x] |

## Bosqichlar

### 0-bosqich. Tozalash (~1 kun)
- [x] `.gitignore` (node_modules, dist, .env) va `git rm -r --cached node_modules`
- [x] `autosync.cjs`, `tasks.json` dagi task va `gitdoc` sozlamalarini o'chirish
- [x] Tailwind 4 ga to'liq o'tish, CDN ni olib tashlash (B2)
- [x] `index.html` da `lang="uz"`
- [x] README
- [x] `ai-context.txt` va `PROGRESS.md` ni repoga qo'shish

### 1-bosqich. Mantiq xatolari (2–3 kun)
- [x] B1 ombor bitta joyda (to'lovda); bekor qilingan to'lanmagan chekda ayirish yo'q
- [x] B10 `calcOrderTotals()` (yangi `src/utils/orderTotals.js`)
- [x] B4 + B7 + B8 sana (`src/utils/dates.js`), qarz
- [x] B3 + B9 taom darajasida `kitchenDoneQty`, chekni bo'lish
- [x] B5 + B6 zaxira va PIN xavfsizligi (`src/utils/pinGuard.js`)

### 2-bosqich. Ma'lumot qatlami va interfeys (2–3 kun)
- [x] Statuslar uchun `src/constants/orderStatus.js` (kalitlar kod uchun; saqlanadigan qiymatlar eski ma'lumot bilan mos bo'lishi uchun o'zgartirilmadi)
- [x] Migratsiya `src/utils/migrate.js` (sxema v2): eski maydonlardan yangilarini to'ldiradi, eskilarini o'chirmaydi
- [x] `ErrorBoundary`; sxema tekshiruvi `migrate.js` da (buzilgan kalit zaxiraga olinadi). `zod` qo'shilmadi: yangi kutubxona uchun ruxsat so'ralmagan
- [x] B11 (`useSticky`), B12 (`telegramNotifier.js`), B13 (`src/utils/notify.js`: toast va tasdiqlash oynasi)

### 3-bosqich. Backend (1–2 hafta)
- [x] Variant tanlash: Supabase (pilot uchun)
- [x] Sinxronlash qatlami `src/sync/` (useSticky o'zgarmadi: localStorage + yozuv darajasida bulut sinxroni, oflayn navbat, realtime)
- [x] QR-menyu: mijoz telefonidan buyurtma (`supabase/qr.sql`, `src/qr/`), ofitsiant tasdig'i bilan, narx serverda
- [ ] PIN tekshiruvini serverga ko'chirish (hozir ma'lumot RLS bilan himoyalangan, PIN qurilmada tekshiriladi)

### 4-bosqich. Kafe uchun funksiyalar
- [x] Smena ochish/yopish, haqiqiy Z-hisobot (`ShiftPanel.jsx`, `src/shift/shiftReport.js`, `pos_shifts`)
- [x] Oflayn rejim (PWA): manifest, service worker (`src/pwa/`, `vite.config.js` plagini), `vercel.json`
- [x] Avtomatik yangilanish: `/version.json` va build versiyasi (`vite.config.js`), `src/pwa/update.js`,
  `UpdateBanner.jsx`; kirish oynasida versiya yozuvi
- [ ] Click/Payme integratsiyasi
- [ ] Onlayn-kassa va fiskal chek talablarini tekshirish (O'zbekiston)
- [x] Texnologik karta bo'yicha ayirish, qoldiq ogohlantirishi, kamomad yozuvi (`src/utils/inventoryCalc.js`)
- [x] Kuryer bo'limi: yetkazib berish buyurtmasi (ofitsiant ekranida "🛵 Yangi yetkazish"), kuryer roli va ekrani
  (`CourierMode.jsx`, `DeliveryOrderModal.jsx`, `src/utils/delivery.js`), kassada kuryer ma'lumoti, kunlik hisobot
- [x] Xodim qo'shishda lavozim nomi qo'lda yoziladi (`user.title`), rollar bitta joyda (`src/constants/roles.js`)
- [x] Stollar uchun QR stikerlar: A4 varaq (3 o'lcham, stollarni tanlash, nusxa soni), QR kod qurilmada chiziladi
  (`QrStickerSheet.jsx`, `src/qr/qrEncode.js`, `src/qr/tableQrUrl.js`); ofitsiantning bitta stol QR oynasi ham shunga o'tdi

### 5-bosqich. Sifat
- [ ] `Vitest`: summa, chegirma, bonus, ombor hisobi
- [ ] Joylashtirish (Vercel/Netlify + backend)

## Qarorlar

| Masala | Qaror | Holat |
|--------|-------|-------|
| Ombor qachon ayiriladi | To'lovda (`CashierMode.deductOrderIngredientsFromStock`). Sabab: ofitsiant buyurtmasi `App.jsx` dan o'tmaydi, kassadagi kod birlik va porsiyani hisoblaydi, bekor qilingan chekni qaytarish shart emas | qabul qilindi |
| Taom statusi | Taomda `kitchenDoneQty`; dozakazda oshxona faqat qolgan porsiyani ko'radi | qabul qilindi |
| Backend | Supabase (pilot). Haqiqiy ishga o'tishda shaxsiy ma'lumotlar qonuni sababli mahalliy serverga ko'chish (`supabaseTransport.js` almashtiriladi) | qabul qilindi |
| Id lar | `src/utils/ids.js` (`newId`): bir nechta qurilmada `Date.now()` to'qnashardi | qabul qilindi |
| Telegram jonli jurnali | Har bir audit yozuvi Telegramga boradi (`src/utils/telegramFeed.js`, `useSticky` orqali). Faqat amal bajarilgan qurilma yuboradi (bulutdan kelgan yozuv yuborilmaydi), amallar 2,5 soniyada bitta xabarga yig'iladi, oflayn navbat qurilmada saqlanadi | qabul qilindi |
| Yangi qurilmani ulash | Qurilma shu kafe hisobi bilan birinchi sinxronni tugatmaguncha ilova ochilmaydi (`SyncGate`, `isFirstSyncPending`). Komponentlarning standart qiymati (`useSticky` seed) birinchi sinxrondan oldin navbatga qo'yilmaydi. Sabab: sekin internetda yangi qurilma namuna xodimlar (777777, 2222) va menyuni bulutga yozib, admin PIN'ini qaytarardi va o'chirilgan xodimlarni tiklardi | qabul qilindi |
| Yetkazib berish | Yetkazish buyurtmasi oddiy buyurtma: stol nomi `Yetkazish #N`, `orderType: 'delivery'`, `delivery: {...}` (sxema: `orderStatus.js`). Oshxona va kassadan o'tadi. Kuryer faqat holatni belgilaydi (oldi, yo'lda, yetkazildi + mijoz qanday to'lagani), chekni kassir yopadi: ombor ayirish va smena hisobi yagona joyda qoladi. Xizmat haqi (%) olinmaydi, yetkazish narxi chekda alohida qator (`isDeliveryFee`, oshxonaga chiqmaydi). Kuryer buyurtmaga ismi bilan biriktiriladi (ismlar takrorlanmaydi) | qabul qilindi |
| Lavozim nomi | `user.title` faqat ko'rsatish uchun (admin o'zi yozadi: "Barmen", "Bosh oshpaz"). Kirish huquqi har doim `role` bo'yicha | qabul qilindi |
| QR kod yaratish | Qurilmaning o'zida (`src/qr/qrEncode.js`, kutubxonasiz). Oldin `api.qrserver.com` ishlatilardi: internetsiz rasm chiqmasdi (o'rniga skanerlanmaydigan soxta rasm), stol havolasi begona serverga ketardi. Sayt manzili `pos_qr_base_url` (bulut orqali barcha qurilmalarga), bo'sh bo'lsa joriy manzil; localhost/192.168.x da ogohlantirish. Stikerda xato tuzatish darajasi Q (25%): stol ustida kir bo'lsa ham o'qiladi | qabul qilindi |
| Yangi versiyaga o'tish | Qurilma `/version.json` ni tekshiradi (ochilganda, 5 daqiqada, fondan qaytganda, internet qaytganda). Versiya = kod fayllari mazmunidan hash: kod o'zgarmasa qayta deploy yangilanish chaqirmaydi. Yangilash xavfsiz paytda: PIN oynasida 20 s harakatsiz, ishlayotgan xodimda 3 daqiqa harakatsiz (xodim o'sha ekranga PIN'siz qaytadi: sessionStorage, 1 daqiqa, bir marta; avto-qulf yopiq bo'lsa PIN so'raladi), savatcha/yetkazish formasi ochiq bo'lsa kutadi. Mijoz QR sahifasi faqat fonga o'tganda. Oldingi "Yangilansinmi?" oynasi olib tashlandi: rad etilsa, qurilma eski versiyada qolib ketardi. Sayt `master` dan joylanadi (README: "Yangi versiyani chiqarish") | qabul qilindi |
| QR-buyurtma himoyasi | Band stolga (to'lanmagan cheki bor) telefondan faqat stoldagi QR bilan: havolada stol kaliti `k` = sha256(`pos_qr_secret` + '\|' + stol) ning 12 belgisi (`src/qr/tableKey.js`, kutubxonasiz, http da ham ishlaydi). Server tekshiradi (`qr.sql` → `qr_access`), sir mijozga ko'rinmaydi. Kalitsiz: faqat bo'sh stol yoki shu telefon o'zi ochgan chek (qabul qilingan so'rovdagi `orderId`). "Faqat kafe ichidan" (`pos_qr_geofence`, ixtiyoriy): buyurtma va chaqiruv telefon GPS kafe radiusida bo'lsa (aniqlik 150 m gacha hisobga olinadi). Mijoz ekrani (kiosk) faqat bo'sh stolni ochadi. Ofitsiant tasdig'i saqlanadi, so'rov kartasida "QR skaner qilingan / kalitsiz havola" ko'rinadi. Telefon so'rov holatini chek bo'yicha kuzatadi: to'langach ro'yxatdan o'chadi | qabul qilindi |
| Autosync / GitDoc | O'chirilgan: ish jarayonida avtomatik commit va push qilib, `git am` ni buzdi | qabul qilindi |

## Commit jurnali

| # | Vazifa | Commit hash | Holat |
|---|--------|-------------|-------|
| 0 | Repo tozalash va Tailwind 4 | c638460 | [x] |
| 1 | Ombor bitta joyda | 65b1dd6 | [x] |
| 2 | calcOrderTotals | 65b1dd6 | [x] |
| 3 | Sana va qarz | da57106 | [x] |
| 4 | PIN va zaxira xavfsizligi | 68b7dcf | [x] |
| 5 | Taom darajasidagi status | 65b1dd6 | [x] |
| 6 | useSticky, konstantalar, migratsiya, ErrorBoundary | 4f520b7 | [x] |
| 7 | Telegram kodi bitta joyda | dbcf7fc | [x] |
| 8 | alert/confirm o'rniga toast va oyna | ef25712 | [x] |
| 9 | Supabase bilan bulutda sinxronlash | 78fa71f | [x] |
| 10 | PWA (oflayn, o'rnatish) | cdfe026 | [x] |
| 11 | Mijoz telefonidan QR-buyurtma | a3ea5a4 | [x] |
| 12 | Kassa smenasi va Z-hisobot | 7338932 | [x] |
| 13 | Ombor nazorati va kamomad | 285e607 | [x] |
| 14 | Kuryer bo'limi va xodim lavozim nomi | "4: kuryer bo'limi..." commiti | [x] |
| 15 | Stollar uchun QR stikerlar | "4: stollar uchun QR stikerlar..." commiti | [x] |
| 16 | Avtomatik yangilanish (telefon va kompyuter) | "pilot: yangi versiya qurilmalarga o'zi keladi..." commiti | [x] |
| 17 | Chaqiruv xodimga yetadi, to'langan QR-buyurtma yo'qoladi, band stol va uzoqdan buyurtma himoyasi (B15–B18) | "pilot: ofitsiant chaqiruvi, to'langan QR-buyurtma va QR himoyasi" commiti | [x] |

## Yangi chatning birinchi xabari

```text
Loyiha: https://github.com/MuhammadjonSayfutdinov/cafe-pos-app
PROGRESS.md va ai-context.txt ni o'qi (Claude uchun ko'rsatmalar bor).
Vazifa: PROGRESS.md dagi "Joriy vazifa". Kodni sen yoz.
```