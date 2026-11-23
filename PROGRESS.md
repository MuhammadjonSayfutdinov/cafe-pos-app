# PROGRESS — cafe-pos-app

Oxirgi yangilanish: 2026-11-23
Joriy bosqich: **3-bosqich (backend)**. 0, 1 va 2-bosqichlar bajarildi (1-bosqich: PR #1; 2-bosqich: `ikkinchi-bosqich` branch).

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

**3-bosqich, 1-qadam:** backend variantini tanlash (pastdagi "Qarorlar" jadvali). Qaror qabul qilinmaguncha kod yozilmaydi.
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
- [ ] Variant tanlash (qarorlar bo'limiga qarang)
- [ ] `useSticky` o'rniga serverdan o'qiydigan hooklar
- [ ] QR-menyu buyurtmasi haqiqatan yetib borishi
- [ ] PIN, audit jurnali, Telegram tokenini serverga ko'chirish

### 4-bosqich. Kafe uchun funksiyalar
- [ ] Smena ochish/yopish, haqiqiy Z-hisobot
- [ ] Oflayn rejim (PWA)
- [ ] Click/Payme integratsiyasi
- [ ] Onlayn-kassa va fiskal chek talablarini tekshirish (O'zbekiston)
- [ ] Texnologik karta bo'yicha ayirish, manfiy qoldiqdan himoya

### 5-bosqich. Sifat
- [ ] `Vitest`: summa, chegirma, bonus, ombor hisobi
- [ ] Joylashtirish (Vercel/Netlify + backend)

## Qarorlar

| Masala | Qaror | Holat |
|--------|-------|-------|
| Ombor qachon ayiriladi | To'lovda (`CashierMode.deductOrderIngredientsFromStock`). Sabab: ofitsiant buyurtmasi `App.jsx` dan o'tmaydi, kassadagi kod birlik va porsiyani hisoblaydi, bekor qilingan chekni qaytarish shart emas | qabul qilindi |
| Taom statusi | Taomda `kitchenDoneQty`; dozakazda oshxona faqat qolgan porsiyani ko'radi | qabul qilindi |
| Backend | Supabase (tez) yoki Node + SQLite/PostgreSQL + WebSocket | tanlanmagan |
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

## Yangi chatning birinchi xabari

```text
Loyiha: https://github.com/MuhammadjonSayfutdinov/cafe-pos-app
PROGRESS.md va ai-context.txt ni o'qi (Claude uchun ko'rsatmalar bor).
Vazifa: PROGRESS.md dagi "Joriy vazifa". Kodni sen yoz.
```