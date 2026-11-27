# PROGRESS — cafe-pos-app

Oxirgi yangilanish: 2026-11-27
Joriy bosqich: **pilot**. 3-bosqich (Supabase) va 4-bosqichning asosiy funksiyalari `tortinchi-bosqich` branch'ida. Sozlash: `SUPABASE.md`.

> Bu fayl Claude uchun yozilgan. Barcha kodni faqat Claude yozadi (Gemini ishlatilmaydi).
> Yangi chatda birinchi navbatda shu faylni va `ai-context.txt` ni o'qi.

## Claude uchun ko'rsatmalar

**Foydalanuvchi:** o'zbek tilida, qisqa va sodda javob yoz. Doimiy qoidalar: `CLAUDE.md` (hamma ishni o'zing qil,
foydalanuvchi qilishi kerak bo'lganini alohida ajrat, har bir buyruq uchun kutilgan javobni yoz).

**Commit va push (foydalanuvchi qarori, 2026-11-25):** GitHub'ga yoza oladigan sessiyada Claude o'zgarishni
o'zi `master` ga commit va push qiladi (so'ramasdan). Oldin `npm run build` o'tishi shart. Foydalanuvchi
kodni VS Code'ga `git pull` bilan oladi.

**Cheklovlar (GitHub'ga yoza olmaydigan sessiyada):** foydalanuvchi kodni VS Code'ga ko'chiradi, sinaydi, xato bo'lsa konsol matnini (5–10 qator) yuboradi.

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
3. Claude `master` ga commit va push qiladi ("<bosqich>: <vazifa>"); foydalanuvchi `git pull` qilib sinaydi.
4. Xato chiqsa, shu chatda konsol matnini yuboradi, Claude tuzatadi.
5. Qabul qilingach, jadvaldagi `[ ]` → `[x]` va commit hash yoziladi.

Ixtiyoriy tekshiruv: commit havolasini `.diff` bilan yuborsa, Claude faqat o'zgarishni o'qiydi:
`https://github.com/MuhammadjonSayfutdinov/cafe-pos-app/commit/<hash>.diff`

## Joriy vazifa

**Ega va admin huquqlari (foydalanuvchi so'rovi, 2026-11-27, 7-bosqich rejasidan oldin):** admin tayinlagan ikkinchi
admin asosiy adminni o'chira olardi (B34). Endi Telegram guruhidagi kabi 👑 Ega: uni hech kim o'zgartira olmaydi, Ega
admin va xodimlarni tayinlaydi, har bir adminga bo'limlarni tugmalar bilan ochadi/yopadi ("🛡️ Huquqlar"). Admin PIN
himoyasi endi har amal uchun alohida tugma (Boshqaruv → "🔐 PIN himoyasi"), uni Ega yoki u ruxsat bergan admin
o'zgartiradi (B35-B40). Batafsil: pastda "Ega va admin huquqlari". Hozirgi ma'lumotda Ega - eng birinchi qo'shilgan
(o'chirilmagan) admin; boshqasi bo'lishi kerak bo'lsa, Ega uning kartasida "👑 Egalikni topshirish" ni bosadi.
Navbatdagi ish: 7-bosqichning "Keyingi qadamlar" ro'yxati (7 ta) tartib bilan. 1-qadam (mijoz telefonida rad
etilgan taom) tayyor: foydalanuvchi `supabase/qr.sql` ni Supabase'da yana bir marta ishga tushirishi kerak.
2-qadam (rad etilgan va bekor qilingan taomlar hisoboti) tayyor. Keyingisi: 3-qadam (ikki qurilma bir chekni
bir vaqtda o'zgartirishi).

**Oshxona va buyurtma oqimi (7-bosqich, foydalanuvchi so'rovi, 2026-11-27):** oshpaz bir nechta taomni
belgilab "Tayyor" bossa butun chek tayyor bo'lib ketardi (B19) - tuzatildi; oshxonaga "Rad etish" oynasi
qo'shildi (B22); shunga o'xshash xatolar (B20-B33) tuzatildi. Reja va qolgan qadamlar: pastda
"7-bosqich". Foydalanuvchi `supabase/qr.sql` ni Supabase'da yana bir marta ishga tushirishi kerak
(bekor qilingan chekning stoli telefon QR uchun ham bo'shaydi). Navbatdagi ish: 7-bosqichning qolgan
qadamlari yoki 6-bosqich (foydalanuvchi tanlaydi).

**Kafe POS 2.0 (foydalanuvchi qarori, 2026-11-27):** foydalanuvchi "boshla" dedi. Reja va bosqichlar
pastda: "6-bosqich. Kafe POS 2.0". Admin uchun ikki bosqichli kirish (PIN + Authenticator) tayyor.
Navbatdagi ish: 1-qadamning qolgan qismi (yorug' rejim, chap menyu, buyurtma turi, promo-kod), keyin
2-qadamning qolgani (server hisoblari, PIN serverda, RLS, xodimga Telegram kodi, passkey).
Taom rasmlari tayyor; foydalanuvchi Supabase'da `supabase/storage.sql` va `supabase/qr.sql` ni
ishga tushirishi kerak (aks holda admin rasm qo'shganda "Rasm ombori yo'q" xabari chiqadi,
mijoz QR-menyusida rasm ko'rinmaydi).

**Pilot:** foydalanuvchi `supabase/qr.sql` ni ishga tushiradi, saytni Vercel'ga joylaydi, kafeda sinaydi.
**QR himoyasi (B15–B18) dan keyin:** `supabase/qr.sql` ni Supabase'da yana bir marta to'liq ishga tushirish,
QR stikerlarni qayta chop etish (yangi stikerda stol kaliti bor), xohlasa Admin → Tizim Sozlamalari →
"🛡️ QR-buyurtma himoyasi" da "Faqat kafe ichidan" ni yoqish. Shu bo'limda yashil "✅ Server tayyor"
chiqishi kerak (qizil "⛔ supabase/qr.sql yangilanmagan!" = SQL ishga tushirilmagan; telefon sahifasi
baribir eski usulda ishlaydi: `qrApi.js` -> `callCompat`).
Stollar uchun QR stikerlar tayyor: Admin → Tizim Sozlamalari → Stollar → "🖨️ QR stikerlar".
Pilotda: sayt manzilini (Vercel) yozib stikerlarni chop etish, bittasini telefon bilan skaner qilib tekshirish.
Yangi kod qurilmalarga faqat `master` ga push qilingach (Vercel joylagach) yetib boradi, keyin o'zi yangilanadi.
**Mahalliy server (1-versiya tayyor, 2026-11-26 dan VAQTINCHA TO'XTATILGAN - foydalanuvchi qarori):**
kod `master` da, lekin kafeda o'rnatilmagan; foydalanuvchi o'zi "davom ettiramiz" demaguncha bu ishni taklif
qilma va eslatma. Davom ettirilganda: kafeda sinash - kassa kompyuterida `MAHALLIY-SERVER.md` bo'yicha
`npm run hub`, planshetlarni `http://<IP>:8080` orqali ulash, Wi-Fi'ni internetdan uzib buyurtma → oshxona → kassa.
Keyin pilot natijasiga qarab: Click/Payme, fiskal chek, Vitest, TypeScript'ga o'tishni davom ettirish
(navbatdagi: `src/sync/engine.js`, `src/utils/dates.js`, `inventoryCalc.js`, keyin komponentlar `.tsx`).
Mahalliy server uchun keyingi qadamlar: server o'chsa ham sahifa ochilishi (https yoki o'rnatiladigan ilova),
serverni avtomatik yangilash.
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
| Ega va huquqlar (B34-B40) | Mantiq: `src/utils/adminRights.ts`, `src/utils/pinRules.ts` (tekshiruv: `npm run test:access`). `App.jsx` (`requireAdminOverride`, `requireOwnerConfirm`, `handleChangePinRules`, menyu va ekranlar), `AdminUsersTab.jsx`, `AdminRightsModal.jsx`, `PinRulesPanel.jsx`, `ManagerOverrideModal.jsx`. PIN qoidasi kalitlari: `WaiterMode`, `CashierMode`, `KitchenMode`, `WarehouseStockTab`, `WarehouseHistoryTab`, `AdminSettingsTab` |
| 7 Oshxona oqimi (B19-B33) | Mantiq: `src/utils/kitchenFlow.ts` (tekshiruv: `npm run test:kitchen`). Ekran: `KitchenMode.jsx`, `KitchenRejectModal.jsx`, `KitchenNoticesPanel.jsx`. Ofitsiant: `WaiterMode.jsx` (`applyToCurrentOrder`, `handleSubmitOrder`, `handleMarkAsDelivered`, `handleConfirmSplit`), `WaiterCart.jsx`, `WaiterTableGrid.jsx`. Kassa: `CashierMode.jsx` (`handlePaymentSubmit`, `handleDeleteOrder`) |

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
| B19 | Oshpaz chekdagi bir nechta taomni belgilab "Tayyor" bossa, chekdagi HAMMA taom tayyor bo'lib ketardi (belgilanmaganlari ham oshxonadan yo'qolardi) | `KitchenMode.jsx` (`handleAdvanceOrderStatus`) | 7 | [x] |
| B20 | Oshxonadagi belgilar ekrandagi tartib raqami bo'yicha va faqat shu qurilmada saqlanardi: sex filtri yoki dozakazdan keyin boshqa taom belgilangan bo'lib qolardi, ikkinchi oshxona ekrani ko'rmasdi | `KitchenMode.jsx` (`checkedSubItems`) | 7 | [x] |
| B21 | Sex (kategoriya) filtrida "Tayyor" bosilsa, boshqa sexning taomlari ham tayyor bo'lib ketardi | `KitchenMode.jsx` | 7 | [x] |
| B22 | Oshxonada taomni yoki chekni rad etish (otkaz) imkoni yo'q edi: mahsulot tugasa ofitsiantga og'zaki aytilib, chekdan admin PIN bilan olinardi | yangi: `KitchenRejectModal.jsx`, `KitchenNoticesPanel.jsx`, `kitchenFlow.ts` | 7 | [x] |
| B23 | Ofitsiant savatchasi chekni eski nusxadan butunlay qayta yozardi: oshxona "tayyor" belgilari nolga tushib eski taomlar oshxonaga qayta chiqardi, boshqa qurilmada qo'shilgan taom (QR-buyurtma) o'chardi, rad etilgan taom chekka qaytardi; chek boshqa qurilmada yopilsa, eski taomlar yangi chek bo'lib ochilardi | `WaiterMode.jsx` (`handleSubmitOrder`, `syncOrderInDatabase`) | 7 | [x] |
| B24 | Chekning bir qismi tayyor bo'lganini ofitsiant bilmasdi (signal faqat butun chek tayyor bo'lganda), "Yetkazildi" esa butun chekni yopardi | `WaiterMode.jsx`, `WaiterCart.jsx`, `WaiterTableGrid.jsx` | 7 | [x] |
| B25 | Kassada to'langan, lekin oshxona hali tayyorlayotgan chek ("Olib ketish"da oldindan to'lov) oshxona ekranidan darhol yo'qolardi: taom tayyorlanmay qolardi | `CashierMode.jsx`, `KitchenMode.jsx` | 7 | [x] |
| B26 | Chek yoki oshxonadagi taom bekor qilinsa (ofitsiant PIN bilan, kassa "o'chirish"), oshxonaga xabar bormasdi va chek jim o'chirilardi: oshpaz bekorga tayyorlardi | `WaiterMode.jsx`, `CashierMode.jsx`, `KitchenMode.jsx` | 7 | [x] |
| B27 | Oshxonadagi chekka dozakaz tushsa ovoz chiqmasdi va qaysi taom yangi qo'shilgani ko'rinmasdi | `KitchenMode.jsx` | 7 | [x] |
| B28 | Oshxonaning "Bugun: N ta chek" SLA hisobi hech qachon nolga tushmasdi (butun vaqt yig'indisi) | `KitchenMode.jsx` | 7 | [x] |
| B29 | Ofitsiant menyusidan qo'shilgan taom chek qatoriga taom rasmlari va tavsifini ko'chirardi (har qator 5-50 KB): qurilma xotirasi va bulut sinxroni tez to'lardi | `WaiterMode.jsx` (`handleAddToCart`) | 7 | [x] |
| B30 | Bir stolda ikki ochiq chek paydo bo'lishi mumkin edi (shu orada boshqa qurilma chek ochganda yangi chek yuborish yoki stolni ko'chirish), biri ekranlarda ko'rinmay qolardi; chekni bo'lish ro'yxat tartibi bo'yicha va eski nusxadan edi | `WaiterMode.jsx` (`handleSubmitOrder`, `handleConfirmTransfer`, `handleConfirmSplit`), `WaiterActionModals.jsx` | 7 | [x] |
| B31 | Admin bosh sahifasidagi "Hozir zalda faol" smena yopilgach arxivdagi cheklarni ham sanardi (stollar soni va summa noto'g'ri) | `AdminDashboard.jsx` | 7 | [x] |
| B32 | Ofitsiant menyusida bitta porsiyali taomning savatchadagi soni ikki barobar ("✓ 2 ta") ko'rinardi | `WaiterMenu.jsx` | 7 | [x] |
| B33 | Ofitsiant savatchasida xizmat haqi joriy sozlamadan hisoblanardi (chekda saqlangan foiz emas): sozlama o'zgarsa ofitsiant va kassa jami summasi farq qilardi | `WaiterMode.jsx` -> `WaiterCart.jsx` | 7 | [x] |
| B34 | Admin tayinlagan ikkinchi admin asosiy adminni o'chira (PIN'ini, ikki bosqichli kirishini o'zgartira) olardi: "Ega" tushunchasi yo'q, har qanday admin har qanday adminni boshqarardi | `AdminUsersTab.jsx`, yangi `adminRights.ts` | Ega | [x] |
| B35 | Admin PIN himoyasi bitta umumiy tugma edi (yoqilsa hamma joyda, o'chirilsa hech qayerda) va uni istalgan admin chap menyudan bir bosishda o'chirardi | `AdminPanel.jsx`, `App.jsx`, yangi `pinRules.ts`, `PinRulesPanel.jsx` | Ega | [x] |
| B36 | Har qanday admin barcha bo'limlarni ko'rardi: adminga bo'lim yopib bo'lmasdi; kassa/ombor admin uchun PIN'ni o'zi chetlab o'tardi (`role !== 'admin'`) | `App.jsx`, `AdminPanel.jsx`, `CashierMode.jsx`, `WarehouseHistoryTab.jsx` | Ega | [x] |
| B37 | Xodim boshqa qurilmada o'chirilsa yoki roli o'zgarsa ham, tizimdan chiqmaguncha eski huquq bilan ishlayverardi | `App.jsx` | Ega | [x] |
| B38 | Xodimga PIN berishda "bu PIN-kod X da bor" deyilardi va urinish cheklanmagan: admin PIN'larni terib, Ega PIN'ini bilib olishi mumkin edi | `AdminUsersTab.jsx` | Ega | [x] |
| B39 | Audit jurnalini tozalash, zaxiradan tiklash (eski PIN'li fayl bilan adminlarni qaytarish), zavod holati, Telegram sozlamasi (Ega xabarlarini boshqa chatga burish) - istalgan adminda edi | `AdminAuditLogsTab.jsx`, `AdminSettingsTab.jsx` | Ega | [x] |
| B40 | Ombordan mahsulot o'chirish, chiqim (spisanie), chekni qarzga yozish, oshxonada rad etishni PIN bilan himoyalab bo'lmasdi | `WarehouseStockTab.jsx`, `CashierMode.jsx`, `KitchenMode.jsx` | Ega | [x] |

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
- [x] B10 `calcOrderTotals()` (yangi `src/utils/orderTotals.ts`)
- [x] B4 + B7 + B8 sana (`src/utils/dates.js`), qarz
- [x] B3 + B9 taom darajasida `kitchenDoneQty`, chekni bo'lish
- [x] B5 + B6 zaxira va PIN xavfsizligi (`src/utils/pinGuard.ts`)

### 2-bosqich. Ma'lumot qatlami va interfeys (2–3 kun)
- [x] Statuslar uchun `src/constants/orderStatus.js` (kalitlar kod uchun; saqlanadigan qiymatlar eski ma'lumot bilan mos bo'lishi uchun o'zgartirilmadi)
- [x] Migratsiya `src/utils/migrate.js` (sxema v2): eski maydonlardan yangilarini to'ldiradi, eskilarini o'chirmaydi
- [x] `ErrorBoundary`; sxema tekshiruvi `migrate.js` da (buzilgan kalit zaxiraga olinadi). `zod` qo'shilmadi: yangi kutubxona uchun ruxsat so'ralmagan
- [x] B11 (`useSticky`), B12 (`telegramNotifier.js`), B13 (`src/utils/notify.js`: toast va tasdiqlash oynasi)

### 3-bosqich. Backend (1–2 hafta)
- [x] Variant tanlash: Supabase (pilot uchun)
- [x] Sinxronlash qatlami `src/sync/` (useSticky o'zgarmadi: localStorage + yozuv darajasida bulut sinxroni, oflayn navbat, realtime)
- [x] QR-menyu: mijoz telefonidan buyurtma (`supabase/qr.sql`, `src/qr/`), ofitsiant tasdig'i bilan, narx serverda
- [x] PIN xeshi (`src/utils/pinHash.ts`): ochiq PIN saqlanmaydi, eski ma'lumot o'zi ko'chiriladi.
  Tekshiruv qurilmada qoldi (oflayn kirish uchun), qarang: "Qarorlar" → "PIN saqlash"
- [x] Sekin internet: so'rov vaqt cheklovi, navbat qismlarda, qayta ochilganda faqat o'zgarishlar,
  service worker sahifani 3,5 s da keshdan beradi (`src/sync/timeouts.ts`, `engine.js`, `sw-template.js`)

### 4-bosqich. Kafe uchun funksiyalar
- [x] Smena ochish/yopish, haqiqiy Z-hisobot (`ShiftPanel.jsx`, `src/shift/shiftReport.js`, `pos_shifts`)
- [x] Oflayn rejim (PWA): manifest, service worker (`src/pwa/`, `vite.config.js` plagini), `vercel.json`
- [x] Avtomatik yangilanish: `/version.json` va build versiyasi (`vite.config.js`), `src/pwa/update.js`,
  `UpdateBanner.jsx`; kirish oynasida versiya yozuvi
- [x] Kafe mahalliy serveri (`server/`, `src/sync/hubTransport.ts`, `MAHALLIY-SERVER.md`): internetsiz
  kafe ichida almashish, server bulut bilan sinxronlanadi, qurilmalar server paroli bilan ulanadi
- [ ] Click/Payme integratsiyasi
- [ ] Onlayn-kassa va fiskal chek talablarini tekshirish (O'zbekiston)
- [x] Texnologik karta bo'yicha ayirish, qoldiq ogohlantirishi, kamomad yozuvi (`src/utils/inventoryCalc.js`)
- [x] Kuryer bo'limi: yetkazib berish buyurtmasi (ofitsiant ekranida "🛵 Yangi yetkazish"), kuryer roli va ekrani
  (`CourierMode.jsx`, `DeliveryOrderModal.jsx`, `src/utils/delivery.js`), kassada kuryer ma'lumoti, kunlik hisobot
- [x] Xodim qo'shishda lavozim nomi qo'lda yoziladi (`user.title`), rollar bitta joyda (`src/constants/roles.js`)
- [x] Stollar uchun QR stikerlar: A4 varaq (3 o'lcham, stollarni tanlash, nusxa soni), QR kod qurilmada chiziladi
  (`QrStickerSheet.jsx`, `src/qr/qrEncode.js`, `src/qr/tableQrUrl.js`); ofitsiantning bitta stol QR oynasi ham shunga o'tdi

### Ega va admin huquqlari (tuzatish, foydalanuvchi so'rovi, 2026-11-27)
Manba: foydalanuvchi xabari (admin tayinlagan ikkinchi admin asosiy adminni o'chirib tashladi) va Telegram guruhining
"Admin huquqlari" hamda "Ruxsatlar" oynalari (rasmlar). Tamoyil: Ega - Telegramdagi guruh egasi kabi; admin faqat Ega
(yoki uni tayinlagan admin) ochib bergan bo'limlarni ko'radi; xavfli amal uchun PIN har biri alohida yoqiladi.
- [x] 👑 Ega (`pos_owner`, yo'q bo'lsa eng birinchi qo'shilgan admin): tahrirlab, o'chirib, 2-bosqichini o'chirib bo'lmaydi;
  o'z ismi va PIN'ini o'zi o'zgartiradi. Egalikni topshirish (Ega PIN'i bilan), oldingi Ega barcha huquqli admin bo'ladi (B34)
- [x] Admin huquqlari (Telegram uslubidagi ro'yxat): 6 ta ekran, 5 ta Boshqaruv bo'limi, maxsus: "Xavfli amalni tasdiqlash",
  "PIN himoyasini boshqarish", "Yangi admin tayinlash". Admin faqat o'zida bor huquqni bera oladi (qolgani 🔒) va faqat
  o'zi tayinlagan adminni o'zgartiradi. Yopilgan bo'lim menyudan yo'qoladi, ochiq turgan ekran darhol yopiladi (B36)
- [x] PIN himoyasi har amal uchun alohida (B35): Ofitsiant (taomni kamaytirish, chekni bekor qilish), Kassa (katta chegirma,
  qarzga yozish, chekni bekor qilish, xarajatni o'chirish), Oshxona (rad etish), Ombor (chiqim, mahsulotni o'chirish,
  tarixni tozalash), Boshqaruv (cheklar tarixini tozalash). Soha "n/m ˅" bilan ochiladi, soha tugmasi hammasini o'zgartiradi.
  Faqat Ega yoki "PIN himoyasini boshqarish" huquqli admin o'zgartiradi; har o'zgarish audit va Telegramga boradi
- [x] Faqat Ega (Ega PIN'i bilan): zaxiradan tiklash, zavod holati, audit jurnalini tozalash, Telegram sozlamasi (B39)
- [x] O'chirilgan xodim boshqa qurilmada ham darhol chiqariladi, huquq o'zgarsa darhol kuchga kiradi (B37);
  band PIN javobi kimniki ekanini aytmaydi va urinishlar cheklangan (B38)
- [ ] Serverda tekshirish (RLS): hozir tekshiruv qurilmada - bazaga to'g'ridan-to'g'ri yoza oladigandan himoya
  6-bosqich, 2-qadamda ("PIN serverda", rol bo'yicha RLS)

### 7-bosqich. Oshxona va buyurtma oqimi (foydalanuvchi so'rovi, 2026-11-27)
Manba: foydalanuvchi xabari (oshxonada belgilanganlar emas, hamma taom tayyor bo'lib ketadi; oshxona uchun
rad etish oynasi) va namunalar (RestroBit POS, iiko, Dribbble POS). Tamoyil: holat BUTUN CHEK emas, TAOM
(chek qatori) darajasida; chek har doim eng so'nggi holatidan o'zgartiriladi; hech narsa jim o'chmaydi.
1. Oshxona to'g'ri ishlashi (bajarildi)
   - [x] Faqat belgilangan taomlar "tayyor" (B19, B21), belgilar qator kaliti bo'yicha (B20), chek statusi
     taomlardan hisoblanadi (`kitchenFlow.ts`: `markLinesReady`, `deriveStatus`); `npm run test:kitchen`
   - [x] "❌ Rad etish" oynasi: taom va porsiya soni, sabab (masalliq tugadi, taom qolmadi, uskuna, uzoq
     kutiladi, noto'g'ri buyurtma, boshqa + izoh), ixtiyoriy stop-list; audit va Telegram (B22)
   - [x] Dozakaz ovozi va "🆕 Qo'shimcha" belgisi (B27), kunlik SLA hisobi (B28)
2. Ofitsiant va kassa (bajarildi)
   - [x] Savatcha chekni eski nusxadan yozmaydi (B23): `applyWaiterCart`, `rebaseCart`, `reduceLine`
   - [x] Qisman tayyor: stol kartasida "🔔 N tayyor", savatchada "Oshxonada / Tayyor / Berildi",
     "✅ Mijozga berildi (N porsiya)" (B24)
   - [x] Ofitsiant/kassa/admin ekranida oshxona xabarlari: rad etilgan taom (chek to'langan bo'lsa qaytariladigan
     pul bilan), oldindan to'langan chek tayyor (B22, B25). Oshxonada "🚫 Bekor qilindi" xabari (B26)
   - [x] To'langan, lekin tayyorlanmagan chek oshxonada qoladi (B25); bekor qilingan chek o'chirilmaydi,
     "Bekor qilindi" statusi (B26); bir stolda ikki ochiq chek bo'lmaydi (B30)
   - [x] Rasm chekka ko'chmaydi (B29), admin bosh sahifasi (B31), menyu soni (B32), xizmat haqi (B33)
3. Keyingi qadamlar (foydalanuvchi so'rovi: tartib bilan bajariladi)
   - [x] Mijoz telefonida (QR) rad etilgan taomni alohida ko'rsatish: so'rov qabul qilinganda taomlarning chekdagi
     qator kalitlari yoziladi (`lineIds`), `qr_request_status` shu qatorlarni va oshxona rad etgan porsiyalarni
     qaytaradi (sabab faqat standart ro'yxatdan). Telefonda har taom: tayyorlanmoqda / tayyor / berildi /
     rad etildi (sabab) / bekor qilindi, rad etilgani hisobga kirmaydi (`src/qr/customerLines.ts`,
     `npm run test:qr`). Kafe ichidagi mijoz ekrani ham shunday. SQL ni qayta ishga tushirish kerak
   - [x] Statistika: "Rad etilgan va bekor qilingan taomlar" hisoboti: oshxona rad etgani va xodim olib tashlagani,
     sabab / taom / oshpaz / bekor qilgan / ofitsiant bo'yicha, tayyor bo'lib bekor qilingani (isrof), qaytariladigan
     pul; davr - Statistika filtri (filtrsiz - joriy smena). Xodim olib tashlagan porsiya endi chekda narxi bilan
     saqlanadi (`order.voids`). Telegramga: smena yopilganda (Z-hisobotdan keyin, bo'lsa) va "📤 Telegramga
     yuborish" tugmasi bilan (`StatsLossReport.jsx`, `src/utils/lossReport.ts`, `npm run test:loss`)
   - [ ] Ikki qurilma bir chekni bir soniyada o'zgartirsa, hozir oxirgi yozuv g'olib (yozuv darajasida):
     oshxona belgilari alohida yozuvga (`pos_kds_marks`) yoki serverda birlashtirish
   - [ ] Har taom uchun alohida taymer (dozakaz o'z vaqtidan), sex ekranlari (bar, issiq sex), KOT chop etish
   - [ ] To'langan chekdan rad etilgan taom: kassada "Qaytarish" amali (pul va ombor yozuvi bilan)
   - [ ] "Olib ketish" uchun ofitsiant ekranida bir vaqtda bir nechta ochiq chek
   - [ ] Vitest (yangi kutubxona: ruxsat kerak); hozircha `scripts/test-kitchen-flow.mjs` (kutubxonasiz)

### 6-bosqich. Kafe POS 2.0 (foydalanuvchi qarori, 2026-11-27)
Manba: foydalanuvchi bilan kelishilgan taklif (Dribbble'dagi RestroBit POS tahlili + uch eshik).
Tartib: xavfsizlik yangi eshiklardan (mijoz ilovasi, kiosk) OLDIN.
1. Yangi ko'rinish va taom rasmlari
   - [x] Taomga 5 tagacha rasm (fayl yoki planshet kamerasi), birinchisi asosiy, ◀ ▶ bilan tartib;
     ixtiyoriy qisqacha ma'lumot (200 belgi). Admin ro'yxati, ofitsiant menyusi, mijoz QR-menyusi
     (karta + galereya). `src/utils/menuImages.ts`, `DishImage.jsx`, `DishGallery.jsx`, `supabase/storage.sql`
   - [ ] Yorug' rejimni Dribbble uslubida pardozlash, admin/kassa uchun chap menyu
   - [ ] Buyurtma turi bitta joyda (zalda / olib ketish / yetkazish), qoralamalar ro'yxati, promo-kod/kupon
2. Xavfsizlik poydevori
   - [ ] Har bir xodim va qurilmaga alohida server hisobi, ishonchli qurilmalar, qurilma ulash kodi
   - [ ] PIN serverda tekshiriladi, 6 xonali PIN; rol bo'yicha RLS (ofitsiant hisobotni o'qimaydi)
   - [x] Admin: PIN + Authenticator (TOTP), 10 ta zaxira kod; kod kirishda, avto-qulfda va xavfli amalda
     (rahbar tasdig'i, ofitsiant ekranidagi admin tasdig'i) so'raladi. `src/utils/totp.ts`, `twoFactor.ts`,
     `TwoFactorCodeModal.jsx`, `TwoFactorSetupModal.jsx`; yoqish: Admin → Xodimlar va Parollar
   - [ ] Xodim: PIN + smena boshida Telegram bot kodi (2 bosqich). Admin uchun 3-bosqich: passkey/barmoq izi
   - [ ] Shubhali amallar hisoboti Telegramga, chegirma chegarasi rol bo'yicha, jurnal o'chirilmaydi
   - [ ] Rasm yuklashni faqat adminga cheklash (hozir: har qanday ulangan qurilma)
3. Mijoz ilovasi (mijoz eshigi)
   - [ ] Telefonni tasdiqlash: kafening o'z Telegram boti (bepul), "📱 Raqamimni yuborish" tugmasi
     (request_contact; contact.user_id == from.id tekshiriladi). Ilova bir martalik token bilan
     t.me/<bot>?start=<token> ni ochadi, bot raqamni serverga (Supabase Edge Function, webhook) yozadi,
     ilova o'zi davom etadi. Bot tokeni faqat serverda (Edge Function secret), qurilmada emas.
     Telegram'i yo'q mijoz: ofitsiant o'z ekranida raqamni tasdiqlaydi (bepul). SMS (Eskiz va b.) keyin,
     kerak bo'lsa (pullik, shartnoma). Telegram Gateway (har kod ~0,01 $) - zaxira variant
   - [ ] Joylashuv (rad etsa menyu ochiladi, buyurtmada qayta so'raladi)
   - [ ] Bosh sahifa, taom sahifasi, savatcha, buyurtma holati, profil va bonus, tarix, bron
4. Kiosk (uchinchi eshik): kafe ichidagi sensorli ekran, doim tayyor
   - [ ] Kutish ekrani, til, joy, menyu, savat, to'lov, raqamli chek, 60+15 s da o'zi tozalanadi
   - [ ] Bir nechta ekran uslubi: vertikal kiosk, gorizontal monitor (kompyuter monitori kattaligida:
     chapda toifalar, o'rtada taomlar, o'ngda savat), planshet. Ekran o'lchami/yo'nalishiga qarab o'zi
     tanlanadi, admin "Kiosklar" da majburan belgilashi mumkin. Sensorli va sichqoncha bilan ham ishlaydi
   - [ ] Admin → Sozlamalar → "Kiosklar": ulash kodi, nomi, holati, ekran uslubi; kiosk faqat menyu + yangi buyurtma
   - [ ] "Kassada to'layman" buyurtmasi oshxonaga qachon tushishi - admin sozlamasi: "To'lovdan keyin"
     (standart) yoki "Darhol"
5. Kengaytirish: Google Play, push xabar, Click/Payme, sharh va baho, bonus darajalari, uch til, navbat ekrani

Foydalanuvchi javoblari (2026-11-27): 5 ta rasm yetarli; telefon tasdig'i - eng arzon va qulay
(Telegram bot tavsiya qilindi); kiosk ekrani kompyuter monitori kattaligida, bir nechta uslubda;
"Kassada to'layman" - admin sozlamasi (standart: to'lovdan keyin).
Admin 2-bosqichi - Authenticator ilovasi; taom ma'lumoti uchun 200 belgi yetarli.
Ochiq savollar: kiosk qurilmasi (Windows tavsiya), videolardan skrinshot.

### 5-bosqich. Sifat
- [x] TypeScript boshlandi: `tsconfig.json` (strict, allowJs), `npm run typecheck`, build avval tekshiradi.
  `.ts`: `sync/config`, `sync/timeouts`, `utils/ids`, `utils/pinGuard`, `utils/orderTotals`, `utils/pinHash`, `utils/sha256`
- [x] Saytning xavfsizlik sarlavhalari (`vercel.json`: CSP, X-Frame-Options, nosniff, Referrer/Permissions-Policy)
- [ ] `Vitest`: summa, chegirma, bonus, ombor hisobi
- [ ] Joylashtirish (Vercel/Netlify + backend)

## Qarorlar

| Masala | Qaror | Holat |
|--------|-------|-------|
| Ombor qachon ayiriladi | To'lovda (`CashierMode.deductOrderIngredientsFromStock`). Sabab: ofitsiant buyurtmasi `App.jsx` dan o'tmaydi, kassadagi kod birlik va porsiyani hisoblaydi, bekor qilingan chekni qaytarish shart emas | qabul qilindi |
| Taom statusi | Taomda `kitchenDoneQty`; dozakazda oshxona faqat qolgan porsiyani ko'radi | qabul qilindi |
| Oshxona holati taom darajasida (7-bosqich) | Qatorda `kitchenDoneQty` (oshxona tayyor degan), `servedQty` (mijozga berilgan), `kitchenSentAt`, `kitchenReadyAt`; eski yozuvda yo'q bo'lsa statusdan taxmin qilinadi va birinchi yozishda qotiriladi. Ochiq chek statusi qatorlardan: oshxonada porsiya bor - 'Yangi'/'Tayyorlanmoqda', hammasi tayyor - 'Tayyor', hammasi berilgan - 'Yetkazildi'. Chekni faqat `src/utils/kitchenFlow.ts` funksiyalari bilan va `setOrders(prev => ...)` ichida (eng so'nggi holatdan) o'zgartirish. Oshpazning tanlovi faqat shu qurilmada (`pos_kds_selected`), holat chekka yoziladi | qabul qilindi |
| Mijoz telefonida taom holati | So'rov qabul qilinganda `pos_qr_requests.lineIds` (so'rov taomlari tartibida chekdagi `cartItemId`). `qr_request_status` faqat shu qatorlarni qaytaradi (boshqa mijoz/ofitsiant taomi ko'rinmaydi): porsiya, tayyor, berilgan va rad etilgan porsiya. Rad etish sababi serverda standart ro'yxatga keltiriladi (oshpazning erkin izohi mijozga chiqmaydi). Qatordagi porsiya kamaygan, lekin rad etilmagan bo'lsa - "bekor qilindi" (ofitsiant olib tashlagan). SQL yangilanmagan yoki eski so'rov - telefon avvalgidek umumiy holatni ko'rsatadi | qabul qilindi |
| Yo'qotish hisoboti | Manba - chekning o'zi: `kitchenRejections` (oshxona) va `voids` (xodim, narx bilan; `reduceLine`, `cancelWholeOrder` yozadi). Eski bekor qilingan chek (voids yo'q) - qatorlaridan. Vaqt - hodisa vaqti. Filtrsiz Statistika - ochiq smena boshidan (smena yo'q - bugun). "Kunlik" Telegram xulosasi smena yopilganda (Z-hisobotdan keyin) yuboriladi: dastur qurilmada ishlaydi, server jadvali yo'q; smena = ish kuni | qabul qilindi |
| Oshxona rad etishi (otkaz) | Faqat hali tayyor bo'lmagan porsiya. Rad etilgan porsiya qatordan ayiriladi (summa, ombor, statistika o'zgarishsiz to'g'ri), yozuv `order.kitchenRejections` da (sabab, oshpaz, vaqt, ko'rildi). PIN so'ralmaydi (oshpaz tez ishlashi kerak), lekin audit + Telegram (xavfsizlik). Chekda taom qolmasa - 'Bekor qilindi'. To'langan chekda summa o'zgarmaydi, `refundDue` (qaytariladigan pul) xabarda chiqadi | qabul qilindi |
| Bekor qilingan chek | Yangi status 'Bekor qilindi' (`ORDER_STATUS.CANCELLED`, yopilganlar ro'yxatida): ofitsiantning "Chekni o'chirish", oxirgi taomni o'chirish va kassadagi "bekor qilish" endi chekni O'CHIRMAYDI. Oshxonada turgan porsiyalar `order.kitchenCancellations` ga yoziladi (oshxonada qizil xabar). Statistika hisoblamaydi, "Cheklar tarixini tozalash" o'chiradi. `qr.sql`: stol bo'sh hisoblanadi, telefonda "❌ Bekor qilindi" ko'rinadi | qabul qilindi |
| Oldindan to'langan chek | Kassa oshxonadagi chekni to'lasa ogohlantiradi, chek `kitchenOpen: true` bilan oshxonada qoladi (24 soatgacha). Tayyor bo'lgach `readyNotice` - ofitsiant/kassa/admin ekranida "🔔 buyurtma tayyor, mijozga bering" | qabul qilindi |
| Backend | Supabase (pilot). Haqiqiy ishga o'tishda shaxsiy ma'lumotlar qonuni sababli mahalliy serverga ko'chish (`supabaseTransport.js` almashtiriladi) | qabul qilindi |
| Id lar | `src/utils/ids.ts` (`newId`): bir nechta qurilmada `Date.now()` to'qnashardi | qabul qilindi |
| Telegram jonli jurnali | Har bir audit yozuvi Telegramga boradi (`src/utils/telegramFeed.js`, `useSticky` orqali). Faqat amal bajarilgan qurilma yuboradi (bulutdan kelgan yozuv yuborilmaydi), amallar 2,5 soniyada bitta xabarga yig'iladi, oflayn navbat qurilmada saqlanadi | qabul qilindi |
| Yangi qurilmani ulash | Qurilma shu kafe hisobi bilan birinchi sinxronni tugatmaguncha ilova ochilmaydi (`SyncGate`, `isFirstSyncPending`). Komponentlarning standart qiymati (`useSticky` seed) birinchi sinxrondan oldin navbatga qo'yilmaydi. Sabab: sekin internetda yangi qurilma namuna xodimlar (777777, 2222) va menyuni bulutga yozib, admin PIN'ini qaytarardi va o'chirilgan xodimlarni tiklardi | qabul qilindi |
| Yetkazib berish | Yetkazish buyurtmasi oddiy buyurtma: stol nomi `Yetkazish #N`, `orderType: 'delivery'`, `delivery: {...}` (sxema: `orderStatus.js`). Oshxona va kassadan o'tadi. Kuryer faqat holatni belgilaydi (oldi, yo'lda, yetkazildi + mijoz qanday to'lagani), chekni kassir yopadi: ombor ayirish va smena hisobi yagona joyda qoladi. Xizmat haqi (%) olinmaydi, yetkazish narxi chekda alohida qator (`isDeliveryFee`, oshxonaga chiqmaydi). Kuryer buyurtmaga ismi bilan biriktiriladi (ismlar takrorlanmaydi) | qabul qilindi |
| Lavozim nomi | `user.title` faqat ko'rsatish uchun (admin o'zi yozadi: "Barmen", "Bosh oshpaz"). Kirish huquqi har doim `role` bo'yicha | qabul qilindi |
| QR kod yaratish | Qurilmaning o'zida (`src/qr/qrEncode.js`, kutubxonasiz). Oldin `api.qrserver.com` ishlatilardi: internetsiz rasm chiqmasdi (o'rniga skanerlanmaydigan soxta rasm), stol havolasi begona serverga ketardi. Sayt manzili `pos_qr_base_url` (bulut orqali barcha qurilmalarga), bo'sh bo'lsa joriy manzil; localhost/192.168.x da ogohlantirish. Stikerda xato tuzatish darajasi Q (25%): stol ustida kir bo'lsa ham o'qiladi | qabul qilindi |
| Yangi versiyaga o'tish | Qurilma `/version.json` ni tekshiradi (ochilganda, 5 daqiqada, fondan qaytganda, internet qaytganda). Versiya = kod fayllari mazmunidan hash: kod o'zgarmasa qayta deploy yangilanish chaqirmaydi. Yangilash xavfsiz paytda: PIN oynasida 20 s harakatsiz, ishlayotgan xodimda 3 daqiqa harakatsiz (xodim o'sha ekranga PIN'siz qaytadi: sessionStorage, 1 daqiqa, bir marta; avto-qulf yopiq bo'lsa PIN so'raladi), savatcha/yetkazish formasi ochiq bo'lsa kutadi. Mijoz QR sahifasi faqat fonga o'tganda. Oldingi "Yangilansinmi?" oynasi olib tashlandi: rad etilsa, qurilma eski versiyada qolib ketardi. Sayt `master` dan joylanadi (README: "Yangi versiyani chiqarish") | qabul qilindi |
| QR-buyurtma himoyasi | Band stolga (to'lanmagan cheki bor) telefondan faqat stoldagi QR bilan: havolada stol kaliti `k` = sha256(`pos_qr_secret` + '\|' + stol) ning 12 belgisi (`src/qr/tableKey.js`, kutubxonasiz, http da ham ishlaydi). Server tekshiradi (`qr.sql` → `qr_access`), sir mijozga ko'rinmaydi. Kalitsiz: faqat bo'sh stol yoki shu telefon o'zi ochgan chek (qabul qilingan so'rovdagi `orderId`). "Faqat kafe ichidan" (`pos_qr_geofence`, ixtiyoriy): buyurtma va chaqiruv telefon GPS kafe radiusida bo'lsa (aniqlik 150 m gacha hisobga olinadi). Mijoz ekrani (kiosk) faqat bo'sh stolni ochadi. Ofitsiant tasdig'i saqlanadi, so'rov kartasida "QR skaner qilingan / kalitsiz havola" ko'rinadi. Telefon so'rov holatini chek bo'yicha kuzatadi: to'langach ro'yxatdan o'chadi | qabul qilindi |
| Dizayn uslubi | Zamonaviy restoran ko'rinishi (namuna: kafe-demo.vercel.app): to'q zinc fon, amber urg'u, Geist shrifti, yumaloq (pill) tugmalar. Ranglar faqat `src/index.css` `@theme` da: `brand-*` = asosiy rang, `gray-*` = neytral zinc. `indigo` faqat amber bilan adashmasligi kerak bo'lgan holat/toifa ranglarida qoldi. Mijoz QR-menyusi doim to'q, kafe rasmi bilan (`public/images/cafe-hero.webp`, Unsplash litsenziyasi). Yangi qurilmada xodimlar ekrani ham to'q rejimda ochiladi (eski qurilmada tanlangan rejim saqlanadi). Mantiq va tuzilma o'zgarmadi: faqat `className` va ko'rinish | qabul qilindi |
| PIN saqlash | `user.pinHash` = `s1$2000$<tuz>$<xesh>` (tuzli, 2000 marta takrorlangan SHA-256, `src/utils/pinHash.ts`) va `user.pinLength`; ochiq `pin`/`password` saqlanmaydi. App ochilganda eski ochiq PIN'lar xeshga o'tadi (bulutdan kelganlari ham). Tekshiruv qurilmada: internetsiz ham kirish kerak. 4-6 xonali PIN'ni xeshdan terib topish mumkin, shuning uchun asosiy himoya - RLS va yopiq ro'yxatdan o'tish. Admin PIN'ni ko'ra olmaydi, faqat yangisini beradi. SHA-256 kutubxonasiz (`src/utils/sha256.ts`): crypto.subtle http (192.168.x.x) da yo'q | qabul qilindi |
| Sekin internet | Supabase so'rovlari 45 s (`createTimeoutFetch`), sessiya tekshiruvi 10 s, QR tasdiqlash 20 s. Navbat 100 tadan yuboriladi, yuborilgan qism darhol navbatdan o'chadi. Ilova ochilganda: oxirgi to'liq sinxrondan 6 soat o'tmagan bo'lsa faqat o'zgarishlar (`since`), aks holda butun baza. Sessiya tokeni tarmoq xatosi sababli yangilanmasa, saqlangan sessiya bilan ishlaydi (qayta kirish so'ralmaydi). Service worker: sahifa 3,5 s da kelmasa keshdan. Javob 4 s dan uzoq - `🐢 Sekin internet` belgisi | qabul qilindi |
| Mahalliy server | Kassa kompyuterida Node server (`npm run hub`, kutubxonasiz; bulut uchun supabase-js). Dasturni ham server beradi (`dist`), sahifa `http://<IP>:8080` dan ochiladi: https sahifadan http LAN manzilga so'rov brauzerda taqiqlangan (mixed content). Server `index.html` ga `<meta name="cafe-hub">` qo'yadi, dastur shundan mahalliy server transportini tanlaydi (`src/sync/index.js`). Qurilma API'si fake server bilan bir xil (`/api/all?since`, `/records`, `/kv`, SSE `/events`, `/rpc/qr_claim_request`), qo'shimcha: server paroli → token (`/api/auth`, 10 xato → 5 daqiqa blok, parol o'zgarsa tokenlar bekor, 401 → ulash oynasi). Ma'lumot: `hub-data/` (snapshot + jurnal, elektr o'chsa ham). Bulut bilan: server bitta "qurilma" (`updated_by = hub_<id>`), har 3 s so'raydi (realtime yo'q: Node 20 da WebSocket yo'q), navbat diskda, qoidalar `engine.js` bilan bir xil (oxirgi yozuv g'olib, yuborilmagan mahalliy ustun). QR tasdiqlash faqat bulut orqali (atomik). http da service worker yo'q: server o'chsa sahifani qayta yuklab bo'lmaydi | qabul qilindi |
| Taom rasmlari | Menyu yozuvida `images: [{id, src, path?}]` (5 tagacha, birinchisi asosiy), `thumb` (asosiy rasmning 160 px nusxasi, data:, yozuvning o'zida: internetsiz ham kartada ko'rinadi), `description` (200 belgi). Rasm qurilmada kvadrat qilib qayta chiziladi (EXIF va yashirin ma'lumot o'chadi). Bulut bo'lsa: 800 px webp, saqlash bosilganda Supabase Storage `menu-images` ga yuklanadi (ochiq o'qish, yozish faqat ulangan qurilma), yozuvda faqat havola; yuklanmasa taom saqlanmaydi, oyna ochiq qoladi. Bulut yo'q (yoki mahalliy server): 480 px rasm yozuvning o'zida. Service worker rasmlarni `menu-images-v1` keshida saqlaydi (400 tagacha). Mijozga `qr_menu` faqat `id, src` va `thumb` beradi. O'chirilgan rasm/taom ombordan ham o'chiriladi (xato bo'lsa jim) | qabul qilindi |
| Admin ikki bosqichli kirish | PIN + Authenticator ilovasi kodi (TOTP: HMAC-SHA1, 6 raqam, 30 s, ±30 s soat farqi; kutubxonasiz, http da ham ishlaydi). Yozuv: `user.twoFactor = {type:'totp', secret, enabledAt, backupCodes}`; 10 ta zaxira kod (10 raqam, bir martalik) faqat xeshi bilan. Kod kirish oynasida, avto-qulfda, rahbar tasdig'ida (ManagerOverrideModal, ofitsiant ekranidagi admin PIN) so'raladi. Faqat xodimning o'zi yoqadi (o'z telefoni), o'zi o'chirishda kod so'raladi; boshqa admin faqat o'chira oladi (telefon yo'qolsa). 5 xato kod - blok (pinGuard) va audit (Telegramga ham boradi). Ishlatilgan kod shu qurilmada qayta qabul qilinmaydi. Zaxira faylga sir yozilmaydi, tiklashda fayldagisi olinmaydi. Tekshiruv hozircha qurilmada (oflayn kirish): PIN'ni bilgan xodimdan himoya qiladi, bazani o'qiy olgandan emas - serverda tekshirish 2-qadamning "PIN serverda" ishi bilan | qabul qilindi |
| Mijoz telefonini tasdiqlash | Kafening o'z Telegram boti, "Raqamimni yuborish" tugmasi: bepul (Bot API pulsiz), kod yozish shart emas, raqam Telegram tomonidan tasdiqlangan. Oddiy SMS pullik (shartnoma, matn tasdig'i), Telegram Gateway ~0,01 $/kod. Telegram'siz mijozni ofitsiant tasdiqlaydi | qabul qilindi (6-bosqich, 3-qadamda) |
| Kiosk "Kassada to'layman" | Admin sozlamasi: oshxonaga "To'lovdan keyin" (standart, hazil buyurtmadan himoya) yoki "Darhol" | qabul qilindi (6-bosqich, 4-qadamda) |
| Ega (kafe egasi) | Telegram guruhidagi Ega kabi. Saqlash: KV `pos_owner = {id, at, by}` (bulut orqali). Ega - shu yozuvdagi admin, bo'lmasa (yoki u admin bo'lmasa) eng birinchi qo'shilgan admin: id dan (1, 2... yoki "user_<vaqt>"), ro'yxat tartibidan emas - barcha qurilmada bir xil, ilova ochilganda hech narsa yozilmaydi (qurilmalar bir-birini bosib ketmaydi). Asosiy admin eski versiyadagi qurilmada o'chirilgan bo'lsa ham Ega o'zi keyingi eng eski adminga o'tadi. Egani hech kim tahrirlay/o'chira olmaydi, o'z rolini o'zi ham o'zgartirmaydi (avval egalikni topshiradi) | qabul qilindi |
| Admin huquqlari | `user.adminRights` (14 ta boolean) va `user.appointedBy`. Yangi admin: Telegram kabi ko'pi ochiq, "Yangi admin tayinlash" va "PIN himoyasini boshqarish" yopiq. Huquqi yozilmagan eski admin: avvalgidek barcha bo'limlar + tasdiqlash (yangilanishda hech kim ishsiz qolmasin). Admin o'zida yo'q huquqni bera olmaydi, faqat o'zi tayinlagan adminni o'zgartiradi. "Boshqaruv" ekrani har adminga ochiq: u yerda o'z PIN'i, ikki bosqichli kirishi va PIN himoyasi ro'yxati (o'qish) | qabul qilindi |
| PIN himoyasi har amal uchun | KV `pos_pin_rules` (11 ta amal). Yozilmagan amal: avval umumiy tugma bilan himoyalangan bo'lsa - eski `pos_override_enabled` qiymati, yangi amal (qarz, rad etish, ombor chiqimi, mahsulotni o'chirish) - o'chiq: yangilanishdan keyin ish o'zgarmaydi. `pos_override_enabled` eski versiyadagi qurilmalar uchun "kamida bitta amal himoyalangan" deb yoziladi. Tasdiqlaydi: Ega va "tasdiqlash" huquqli admin (o'zlari bajarganda PIN so'ralmaydi). Faqat Ega amallari Ega PIN'i (+ Authenticator) bilan | qabul qilindi |
| TypeScript | Bosqichma-bosqich: `allowJs`, faqat `.ts` fayllar strict tekshiriladi. Yangi util/modul `.ts` da. Komponentlar keyinroq (`@types/react` kerak bo'ladi) | qabul qilindi |
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
| 18 | Zamonaviy restoran dizayni (mijoz QR-menyusi va xodimlar ekranlari) | "dizayn: zamonaviy restoran ko'rinishi..." commiti | [x] |
| 19 | Taomga rasmlar va qisqacha ma'lumot (6-bosqich, 1-qadam) | "6: taomga rasmlar va qisqacha ma'lumot" commiti | [x] |
| 19 | PIN xeshi, xavfsizlik sarlavhalari, sekin/oflayn internet, TypeScript boshlandi | "xavfsizlik: PIN xeshi..." commiti | [x] |
| 20 | Kafe mahalliy serveri (internetsiz ishlash) | "4: kafe mahalliy serveri..." commiti | [x] |
| 21 | Admin uchun ikki bosqichli kirish: PIN + Authenticator (6-bosqich, 2-qadam) | "6: admin uchun ikki bosqichli kirish..." commiti | [x] |
| 22 | Oshxona: faqat belgilangan taom tayyor, rad etish oynasi, taom darajasidagi holat va o'xshash xatolar (B19-B33) | "7: oshxona - taom darajasida tayyor, rad etish..." commiti | [x] |
| 23 | Ega va admin huquqlari, PIN himoyasi har amal uchun (B34-B40) | "tuzatish: Ega va admin huquqlari..." commiti | [x] |
| 24 | Mijoz telefonida har taom holati va oshxona rad etgan taom (7-bosqich, 3-qism, 1-qadam) | "7: mijoz telefonida rad etilgan taom..." commiti | [x] |
| 25 | Rad etilgan va bekor qilingan taomlar hisoboti, Telegram xulosasi (7-bosqich, 3-qism, 2-qadam) | "7: rad etilgan va bekor qilingan taomlar hisoboti..." commiti | [x] |

## Yangi chatning birinchi xabari

```text
Loyiha: https://github.com/MuhammadjonSayfutdinov/cafe-pos-app
PROGRESS.md va ai-context.txt ni o'qi (Claude uchun ko'rsatmalar bor).
Vazifa: PROGRESS.md dagi "Joriy vazifa". Kodni sen yoz.
```