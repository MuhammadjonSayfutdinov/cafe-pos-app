# Kafe mahalliy serveri (internetsiz ishlash)

Internet uzilsa ham kafedagi qurilmalar (ofitsiant planshetlari, oshxona ekrani, kassa) bir-birini ko'rib
ishlashi uchun kafedagi bitta kompyuterda kichik server ishga tushiriladi.

```
ofitsiant plansheti ─┐
oshxona ekrani ──────┼── kafe Wi-Fi ── KASSA KOMPYUTERI (server) ── internet ── bulut (Supabase)
kassa ───────────────┘                                                         ├─ egasining telefoni
                                                                               └─ mijoz QR-buyurtmasi
```

- **Internet bor:** server bulut bilan sinxronlanadi (har 3 soniyada). Egasining telefoni va mijozlarning
  QR-buyurtmalari ham ishlaydi.
- **Internet yo'q:** kafe ichida hamma narsa ishlayveradi: buyurtma oshxonaga darhol tushadi, kassa ko'radi.
  O'zgarishlar serverda navbatda turadi va internet qaytganda bulutga o'zi yuboriladi.
- **Server kompyuteri o'chsa:** ochiq turgan planshetlar ishlashda davom etadi (o'zgarishlar planshetda
  saqlanadi), lekin bir-birini ko'rmaydi. Server yoqilgach hammasi o'zi yetib boradi.

## 1. Kompyuterni tayyorlash (bir marta)

Server uchun doim yoqiq turadigan kompyuter kerak (odatda kassa kompyuteri). Windows, Linux yoki macOS.

1. **Node.js** o'rnating (20.19 yoki yangiroq): https://nodejs.org → "LTS".
2. Loyihani yuklab oling (GitHub'dan) va papkada terminal oching:
   ```bash
   npm install
   ```
3. Loyiha papkasida `.env.local` faylini yarating (namuna: `.env.example`) va server parolini yozing:
   ```
   HUB_PASSWORD=bu-yerga-kuchli-parol
   ```
   Parol kamida 8 belgi. Planshetlarni ulashda shu parol so'raladi.
4. **Bulut bilan ishlash (tavsiya etiladi):** shu faylga Supabase sozlamalari va kafe hisobini yozing
   ([SUPABASE.md](SUPABASE.md) 2–3-qadamlar):
   ```
   VITE_SUPABASE_URL=https://....supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   HUB_SUPABASE_EMAIL=kafe@sizningkafe.uz
   HUB_SUPABASE_PASSWORD=kafe-hisobi-paroli
   ```
   Bularsiz server faqat kafe ichida ishlaydi (egasining telefoni va QR-buyurtma ko'rinmaydi).
5. Dasturni yig'ing:
   ```bash
   npm run build
   ```
6. **Kompyuter IP manzilini doimiy qiling.** Routerda (Wi-Fi qurilmasi sozlamalarida) "DHCP reservation" /
   "Static lease" bo'limida shu kompyuterga doimiy manzil bering (masalan `192.168.1.10`). Aks holda manzil
   o'zgarib, planshetlar serverni topa olmaydi.

## 2. Serverni ishga tushirish

```bash
npm run hub
```

Ekranda manzil chiqadi, masalan:

```
☕ Kafe mahalliy serveri ishga tushdi
   Qurilmalarda shu manzilni oching: http://192.168.1.10:8080
```

- **Windows:** birinchi marta "Windows Defender Firewall" oynasi chiqadi: **"Private networks"** ni belgilab,
  **"Allow access"** ni bosing. Aks holda planshetlar serverga ulana olmaydi.
- **Windows'da kompyuter yoqilganda o'zi ishga tushsin:** `server/start-windows.bat` fayliga yorliq (shortcut)
  yarating va uni `Win + R` → `shell:startup` papkasiga qo'ying. Bu fayl server to'xtab qolsa ham uni
  qayta ishga tushiradi.
- Oynani yopmang: oyna yopilsa server to'xtaydi.

## 3. Planshet va telefonlarni ulash

1. Qurilma kafe Wi-Fi'siga ulangan bo'lsin.
2. Brauzerda (Chrome) serverning manzilini oching: `http://192.168.1.10:8080`.
3. **"Kafe serveriga ulash"** oynasida server parolini (`HUB_PASSWORD`) kiriting. Bu bir marta qilinadi.
4. Xodimlar odatdagidek PIN bilan kiradi.
5. Qulaylik uchun: Chrome menyusi → **"Bosh ekranga qo'shish"**.

Sarlavhadagi belgi:

| Belgi | Ma'nosi |
|-------|---------|
| `🖥️ Server` | Serverga ulangan, bulut bilan ham aloqa bor |
| `🖥️ Server · bulutsiz (N)` | Internet yo'q: kafe ichida ish davom etadi, N ta o'zgarish serverda navbatda |
| `📴 Oflayn` | Server kompyuteri o'chiq yoki Wi-Fi uzilgan: o'zgarishlar shu qurilmada saqlanadi |

Batafsil: Boshqaruv → Tizim Sozlamalari → "🖥️ Kafe mahalliy serveri".

**Birinchi ulangan qurilma** ma'lumotlarini serverga yuklaydi (server bo'sh bo'lsa). Bulut sozlangan
bo'lsa, server avval bulutdagi ma'lumotni oladi: menyu va xodimlar bulutdan keladi.

## 4. Yangi versiyaga o'tish

Server kompyuterida:

```bash
git pull
```

```bash
npm install
```

```bash
npm run build
```

Keyin serverni qayta ishga tushiring (oynada `Ctrl+C`, so'ng `npm run hub`; `start-windows.bat` ishlatilsa
oynani yopib, qayta oching). Planshetlar yangi versiyaga o'zi o'tadi.

## 5. Xavfsizlik

- Server paroli bilmagan odam kafe Wi-Fi'siga ulansa ham ma'lumotlarni ko'ra olmaydi. 10 ta xato paroldan
  keyin shu manzil 5 daqiqaga bloklanadi.
- **Mijozlar uchun alohida Wi-Fi** (Guest network) qiling: xodimlar qurilmalari va server boshqa tarmoqda bo'lsin.
  Kafe ichidagi aloqa shifrlanmagan (http): bir tarmoqdagi qurilma uni eshitishi mumkin.
- Parolni almashtirish: `.env.local` dagi `HUB_PASSWORD` ni o'zgartirib, serverni qayta ishga tushiring.
  Barcha qurilmalar yangi parol bilan qayta ulanadi (yo'qolgan planshetni shu yo'l bilan uzasiz).

## 6. Ma'lumotlar va zaxira

- Server ma'lumotlari `hub-data/` papkasida (GitHub'ga yuklanmaydi). Elektr o'chsa ham saqlanadi.
- Zaxira: vaqti-vaqti bilan `hub-data/` papkasini fleshkaga nusxalang. Bulut sozlangan bo'lsa,
  ma'lumotlarning asosiy nusxasi bulutda ham bor.
- Serverni boshqa kompyuterga ko'chirish: loyiha va `hub-data/` papkasini ko'chiring. Agar `hub-data/`
  ko'chirilmasa, yangi server bulutdan (yoki birinchi ulangan planshetdan) ma'lumot oladi.

## 7. Cheklovlar

- **Server kompyuteri o'chiq bo'lsa,** planshetda sahifani yangilab (qayta yuklab) bo'lmaydi: dastur
  serverdan ochiladi. Ochiq turgan sahifa ishlashda davom etadi. Favqulodda holatda internet bo'lsa,
  Vercel manzilini ochib bulut orqali ishlash mumkin (u yerda qurilma alohida ulanadi).
- **QR-buyurtmani "Qabul qilish"** uchun internet kerak (so'rov bulutda tasdiqlanadi). Mijozlar QR stikerdagi
  sayt (Vercel) orqali buyurtma beradi: kafe interneti yo'q bo'lsa, mobil internetdagi mijozning
  buyurtmasi bulutda kutib turadi.
- **Telegram xabarlari** internet qaytganda yuboriladi (navbat qurilmada).
- Bir vaqtda bitta server: ikkita kompyuterda server ishga tushirmang.

## Muammolar

| Belgi | Sabab va yechim |
|-------|-----------------|
| Planshet manzilni ochmaydi | Server ishlayaptimi (oyna ochiq)? Planshet o'sha Wi-Fi'dami? Windows Firewall ruxsat berilganmi? IP o'zgarmaganmi? |
| `HUB_PASSWORD kamida 8 belgi...` | `.env.local` faylida `HUB_PASSWORD=` qatorini yozing |
| `Dastur yig'ilmagan` | `npm run build` ni bajaring |
| `8080-port band` | Server allaqachon ishlayapti yoki boshqa dastur portni olgan: `.env.local` ga `HUB_PORT=8081` |
| `Server · bulutsiz` uzoq vaqt | Kompyuterda internetni tekshiring. Boshqaruv → Tizim Sozlamalari da bulut xatosi yoziladi |
| `Kafe hisobiga kirib bo'lmadi` | `HUB_SUPABASE_EMAIL` / `HUB_SUPABASE_PASSWORD` ni tekshiring |
