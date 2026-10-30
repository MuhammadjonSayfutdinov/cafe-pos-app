# PROGRESS — cafe-pos-app

Oxirgi yangilanish: 2026-10-26
Joriy bosqich: **0-bosqich (tozalash)**. Kod hali o'zgartirilmagan, audit tugagan.

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

**0-bosqich, 1-qadam:** `.gitignore` qo'shish, `node_modules` ni indeksdan chiqarish, `autosync.cjs` va `gitdoc` ni o'chirish.
Fayllar: `package.json`, `index.html`, `src/index.css`, `.vscode/settings.json`, `.vscode/tasks.json`.
Tugagach shu bo'limni keyingi vazifaga almashtiring.

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
| B1 | Ombor ikki marta ayiriladi (buyurtma yuborilganda va to'lovda); bekor qilinsa qaytmaydi | `App.jsx`, `CashierMode.jsx` (~647) | 1 | [ ] |
| B2 | Tailwind CDN ga bog'liq, versiyalar aralash (3 va 4), `index.css` da import yo'q | `index.html`, `package.json`, `index.css` | 0 | [ ] |
| B3 | Dozakaz butun buyurtmani `'Yangi'` ga qaytaradi | `App.jsx` (`handleOrderSubmit`) | 1 | [ ] |
| B4 | Sana `toLocaleDateString()` bilan solishtiriladi; `date` yo'q buyurtma "bugungi" | `AdminDashboard.jsx:52`, `WaiterMode.jsx:688` | 1 | [ ] |
| B5 | Zaxira faylida PIN va Telegram tokeni ochiq; import tekshiruvsiz | `AdminSettingsTab.jsx` | 1 | [ ] |
| B6 | `LockScreen` da urinishlar cheklanmagan; standart `777777` zaxirasi | `LockScreen.jsx`, `ManagerOverrideModal.jsx` | 1 | [ ] |
| B7 | Qarz yopilganda to'lov turi `'Naqd'` ga almashadi, sana siljiydi | `CashierMode.jsx` (`handlePayOffDebt`) | 1 | [ ] |
| B8 | Qarzga yozishda telefon tekshirilmaydi (faqat ism) | `CashierMode.jsx` | 1 | [ ] |
| B9 | Chekni bo'lishda chegirma yo'qoladi, qisman miqdor ko'chirilmaydi | `App.jsx` (`handleSplitOrder`) | 1 | [ ] |
| B10 | Jami summa formulasi 4+ joyda nusxalangan; takroriy maydonlar | `App.jsx`, `CashierMode.jsx` | 1 | [ ] |
| B11 | `useSticky`: oxirgi yozuv g'olib; to'lib qolsa xato faqat konsolga | `useSticky.js` | 2 | [ ] |
| B12 | Telegram yuborish kodi 3 joyda nusxalangan, `telegramNotifier.js` ishlatilmaydi | `CashierMode`, `WaiterMode`, `StatsMode` | 2 | [ ] |
| B13 | Taxminan 70 ta `alert/confirm` | ko'p fayllar | 2 | [ ] |

## Bosqichlar

### 0-bosqich. Tozalash (~1 kun)
- [x] `.gitignore` (node_modules, dist, .env) va `git rm -r --cached node_modules`
- [x ] `autosync.cjs`, `tasks.json` dagi task va `gitdoc` sozlamalarini o'chirish
- [ x] Tailwind 4 ga to'liq o'tish, CDN ni olib tashlash (B2)
- [ ] `index.html` da `lang="uz"`
- [ ] README
- [ ] `ai-context.txt` va `PROGRESS.md` ni repoga qo'shish

### 1-bosqich. Mantiq xatolari (2–3 kun)
- [ ] B1 ombor bitta joyda + bekor qilinganda qaytarish
- [ ] B10 `calcOrderTotals()` (yangi `src/utils/orderTotals.js`)
- [ ] B4 + B7 + B8 sana, qarz
- [ ] B3 + B9 taom darajasidagi status, chekni bo'lish
- [ ] B5 + B6 zaxira va PIN xavfsizligi

### 2-bosqich. Ma'lumot qatlami va interfeys (2–3 kun)
- [ ] Statuslar uchun `constants` fayli (kodlar o'zbekcha yozuvlardan alohida)
- [ ] Yagona sxema, eski ma'lumotlarni ko'chiruvchi migratsiya
- [ ] `ErrorBoundary`, sxema tekshiruvi (`zod`)
- [ ] B11, B12, B13

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
| Ombor qachon ayiriladi | Buyurtma yuborilganda (`App.jsx`); to'lovda ayirilmaydi | taklif, tasdiqlang |
| Taom statusi | Taom darajasida; buyurtma statusi undan hisoblanadi | taklif |
| Backend | Supabase (tez) yoki Node + SQLite/PostgreSQL + WebSocket | tanlanmagan |
| Autosync | O'chiriladi; commit qo'lda yoki `wip` branchda | taklif |

## Commit jurnali

| # | Vazifa | Commit hash | Holat |
|---|--------|-------------|-------|
| 0 | Repo tozalash va Tailwind 4 | | [ ] |
| 1 | Ombor bitta joyda | | [ ] |
| 2 | calcOrderTotals | | [ ] |
| 3 | Sana va qarz | | [ ] |
| 4 | PIN va zaxira xavfsizligi | | [ ] |
| 5 | Taom darajasidagi status | | [ ] |

## Yangi chatning birinchi xabari

```text
Loyiha: https://github.com/MuhammadjonSayfutdinov/cafe-pos-app
PROGRESS.md va ai-context.txt ni o'qi (Claude uchun ko'rsatmalar bor).
Vazifa: PROGRESS.md dagi "Joriy vazifa". Kodni sen yoz.
```