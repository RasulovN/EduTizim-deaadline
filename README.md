# EduTizim.uz — Moliya moduli

O'quv markaz CRM tizimining moliya moduli: **Foyda va zarar (P&L)**, **Pul oqimi
(Cash Flow)** va **Balans (Balance Sheet)** — uchala hisobot bitta modeldan,
har oy uchun **aniq nol farq** bilan bir-biriga mos keladi.

**Stack:** Node.js + TypeScript + MongoDB (backend), React + TypeScript + Vite (client).

---

## Tez boshlash

Talab: Node.js 20+. **MongoDB o'rnatilishi shart emas** — pastga qarang.

```bash
npm install          # workspaces: backend + client birga o'rnatiladi

npm run seed         # 3.5 yillik ma'lumot (43 oy, 800 o'quvchi, ~11 000 yozuv)
npm run reconcile    # uchala tenglikni hamma oy bo'yicha tekshiradi (exit 0/1)
npm test             # 5 majburiy stsenariy + topshiriq misollari (37 test)
npm run dev          # API (4000) + frontend (5173) birga
npm run bench        # hisobotlar unumdorligi o'lchovi
```

Brauzerda: **http://localhost:5173** — kirgach oy tanlanadi, uchala hisobot ko'rinadi.

**Demo hisob** (seed yaratadi): `director@edutizim.uz` / `demo1234` (rol: Egasi).
Yoki o'zingiz ro'yxatdan o'ting — bo'sh bazada birinchi ro'yxatdan o'tgan
foydalanuvchi avtomatik "Egasi" bo'ladi.

**MongoDB haqida.** Ulanish tartibi: `MONGODB_URI` env → lokal
`mongodb://127.0.0.1:27017` → hech biri topilmasa `mongodb-memory-server`
avtomatik ishga tushadi va ma'lumotni `.mongo-data/` papkasida **doimiy**
saqlaydi (ya'ni `seed` → `reconcile` → `dev` alohida jarayonlarda ham bitta
bazani ko'radi). Birinchi ishga tushishda MongoDB binariysi yuklab olinadi
(~1 daqiqa). Embedded rejimda skriptlarni ketma-ket ishlating (bitta jarayon
bazani band qiladi); real MongoDB bilan bunday cheklov yo'q.

---

## Ma'lumotlar modeli: nima tanladim va nima uchun

### Ko'rilgan variantlar

**A) Hisobot-yo'naltirilgan kolleksiyalar** — `payments`, `salaries`,
`expenses`, har hisobot o'z kolleksiyalaridan o'zicha yig'adi. Eng tez
boshlanadigan yo'l, lekin uchala hisobot uch xil logikadan chiqadi: "investor
kapitali P&L ga tushib qolish", "kredit foizi moliyaviyga ketish" kabi xatolar
kompilyatsiya ham, test ham ushlamaydigan joyda yashaydi. Tengliklar
tasodifan buziladi va "moslashtiruvchi qator" vasvasasi paydo bo'ladi.

**B) Oldindan hisoblangan oylik agregatlar** — har hodisada
`monthly_summaries` yangilanadi. Hisobot O(1), lekin kechikkan/tahrirlangan
yozuvda invalidatsiya muammosi, ikki joyda haqiqat va yana o'sha
"hisobotlar ajralib ketishi" xavfi. 11 ming yozuvda bu optimallashtirish
umuman kerak emas (pastdagi o'lchovlarga qarang).

**C) Ikki tomonlama yozuv (double-entry ledger)** — **tanlangan**. Bitta
`journal_entries` kolleksiyasi yagona haqiqat manbai; har biznes hodisa
balanslangan provodka (Σdebet = Σkredit); uchala hisobot ham faqat shu
yozuvlardan **mustaqil aggregation** orqali chiqadi.

### Nima uchun C to'g'ri javob

Topshiriqning markazi — uchta tenglik. Double-entry da bu tengliklar
"tekshirib turiladigan holat" emas, **strukturaviy kafolat**:

1. Har provodka balanslangani uchun `Aktiv = Majburiyat + Kapital` buzilishi
   uchun yozuv darajasida xato kerak — ledger esa bunday yozuvni bazaga
   umuman kiritmaydi (`backend/src/domain/ledger.ts`).
2. Pul o'zgarishi = pulga tegadigan provodkalar yig'indisi — pul oqimi
   hisoboti ham xuddi shu yozuvlardan chiqadi.
3. Sof foyda = daromad/xarajat hisoblari o'zgarishi = taqsimlanmagan foyda
   o'zgarishi.

Yangi hodisa turi (masalan, qaytariladigan to'lov) — bu faqat yangi provodka
shabloni. Uch hisobotning hech biriga tegilmaydi.

### Kolleksiya sxemasi

```jsonc
// journal_entries — yagona haqiqat manbai
{
  "date":  ISODate("2026-02-20T11:00:00Z"),
  "month": "2026-02",              // UTC dan denormalizatsiya — guruhlash/indeks uchun
  "kind":  "loan_payment",         // biznes hodisa turi (audit uchun)
  "memo":  "Kredit to'lovi: asosiy qarz 9000000, foiz 3000000",
  "lines": [                        // Σdebet === Σkredit — har doim
    { "account": "2300", "debit": 9000000, "credit": 0 },
    { "account": "5500", "debit": 3000000, "credit": 0 },
    { "account": "1100", "debit": 0, "credit": 12000000 }
  ],
  // faqat o'quvchi to'lovlarida: to'lov qaysi oylarni qoplaydi
  "allocations": [ { "month": "2026-01", "amount": 600000 } ]
}
```

Hisoblar rejasi kodda (`domain/accounts.ts`) — har hisob balansdagi turini
(`asset | liability | equity | revenue | expense`) va pul oqimi toifasini
(`cf`) o'zi bilan olib yuradi:

| Kod | Hisob | Turi | Pul oqimi toifasi |
| --- | --- | --- | --- |
| 1000 | Kassa (naqd) | aktiv (pul) | — |
| 1100 | Bank hisobi | aktiv (pul) | — |
| 1500 | Asosiy vositalar | aktiv | investitsion |
| 2100 | Oldindan to'langan darslar | majburiyat | operatsion |
| 2200 | To'lanmagan ish haqi | majburiyat | operatsion |
| 2300 | Bank krediti | majburiyat | moliyaviy |
| 3100 | Kiritilgan kapital | kapital | moliyaviy |
| 4000 | Kurs daromadi | daromad | operatsion |
| 5100–5500 | Xarajatlar (ish haqi, ijara, kommunal, marketing, kredit foizi) | xarajat | operatsion |

### Uchta nozik joy qanday yechilgan

**Pul oqimi klassifikatsiyasi.** Pul hisobiga tegadigan provodkada pulning
**qarshi tomoni** qaysi hisob bo'lsa, o'sha hisobning `cf` toifasi olinadi.
Provodka balanslangani uchun qarshi tomonlarning (kredit − debet) yig'indisi
ayni pul o'zgarishiga teng — shuning uchun 2-tenglik matematik jihatdan
yopiq. Aralash provodkalar avtomatik to'g'ri bo'linadi: kredit to'lovida
2300-qator moliyaviyga (−9 mln), 5500-qator operatsionga (−3 mln) tushadi.
Inkassatsiyada qarshi tomon yo'q (ikkala qator ham pul) → hisobotga tushmaydi.

**Daromadni tan olish.** To'lov `allocations` bilan yoziladi ("qaysi oylar
uchun"). Oy yopilishida bitta agregatsiya oy oxirigacha amalda to'langan
summalarning shu oyga tegishli qismini yig'ib, `2100 → 4000` provodkasini
beradi. 3 oyga oldindan to'lov: pul darhol, daromad oyma-oy, qolgani balansda
majburiyat.

**Taqsimlanmagan foyda saqlanmaydi — hisoblanadi.** Daromad/xarajat
hisoblarining yig'indisi hisobot paytida 3900-qator sifatida chiqariladi.
Yopish provodkalari yo'q → "moslashtiruvchi qator" qo'yishning texnik iloji
ham yo'q.

**Aniqlik:** hamma summa — butun so'm (integer). Float yo'q, yaxlitlash
farqi yo'q — "aniq nol" talabi shu bilan ta'minlanadi.

---

## Uchta tenglik — `npm run reconcile`

Har oy uchun, har tenglikning ikki tomoni **mustaqil pipeline'lardan**:

| Tenglik | Chap tomon | O'ng tomon |
| --- | --- | --- |
| Balans | aktivlar (balans pipeline) | majburiyat + kapital (o'sha pipeline, boshqa turlar) |
| Pul oqimi | oy boshi puli + op+inv+fin (CF pipeline, qarshi-tomon qatorlaridan) | oy oxiri puli (balans pipeline, pul qatorlaridan) |
| Foyda | oy sof foydasi (P&L pipeline) | taqsimlanmagan foyda o'zgarishi (balans pipeline) |

Natija: nechta oy tekshirildi, nechtasi mos kelmadi, farq summasi. Hammasi
mos → `exit 0`, aks holda `exit 1`. Joriy seed'da: **43 oy, uchala tenglik,
farq 0 so'm.**

## Testlar — `npm test`

**37 test, 7 fayl**, har biri **alohida, toza in-memory MongoDB** da:

- Topshiriqdagi **5 majburiy stsenariy** — qiymatlar jadvallarning aynan o'zi
- Topshiriqning **2.3-bo'limidagi yanvar misoli raqamma-raqam**: foyda 13 mln,
  pul +55 mln, oy oxiri 105 mln, ko'prik formulasi bilan birga
- **2.2-jadvalning inkassatsiya qatori**: P&L ga ham, pul oqimiga ham ta'sir
  yo'q, faqat bir aktivdan ikkinchisiga
- Ledger invariantlari: balanslanmagan/kasr/manfiy/noma'lum hisob rad etiladi

## API

| Endpoint | Tavsif |
| --- | --- |
| `GET /api/reports/pnl?month=2026-01` (yoki `from`/`to`) | Foyda va zarar, oylar kesimida |
| `GET /api/reports/cashflow?month=2026-01` | Pul oqimi: ochilish, 3 toifa, yopilish |
| `GET /api/reports/balance?date=2026-01-31` (yoki `month`) | Balans berilgan sanaga |
| `GET /api/reports/monthly?month=` | uchala hisobot bitta so'rovda (frontend) |
| `GET /api/months`, `GET /api/reconcile`, `GET /api/health` | yordamchilar |
| `POST /api/auth/login·register·refresh·logout·forgot·reset` | autentifikatsiya |
| `GET /api/auth/me`, `PATCH /api/auth/profile`, `POST /api/auth/change-password` | profil |
| `/api/users`, `/api/roles`, `/api/logs` (CRUD) | RBAC boshqaruvi va audit |

Hisobot endpointlari `reports.view` ruxsatini talab qiladi.

## Autentifikatsiya va RBAC (bonus)

Topshiriqning 10-bo'limi buni doiradan tashqarida deb belgilagan — shuning
uchun **avval butun moliya yadrosi yakunlanib, tengliklar va testlar toza
o'tgach**, real CRM ehtiyojini ko'rsatish uchun alohida qatlam sifatida
qo'shildi. Hisobot mantiqiga bitta qator ham tegilmagan.

- **Tokenlar:** qisqa umrli JWT access (15 daq) + rotatsiyalanadigan refresh
  sessiya (30 kun), ikkalasi **httpOnly cookie** da — JS ga chiqmaydi
- **Parollar:** Node ichki `scrypt` (xotira-og'ir KDF), timing-safe taqqoslash
- **RBAC:** 4 tizim roli (Egasi / Administrator / Direktor / Kuzatuvchi) +
  maxsus rollar, ruxsatlar: `reports.view`, `users.manage`, `roles.manage`,
  `logs.view`. Himoya qoidalari: oxirgi Egasini o'chirib/bloklab bo'lmaydi,
  o'zini bloklash taqiqlangan, tizim rollari o'chirilmaydi
- **Audit:** login urinishlari (muvaffaqiyatsizlari ham), barcha CRUD va parol
  amallari bazaga yoziladi; filtr + paginatsiya bilan ko'riladi
- **Himoya:** login rate-limit (5 urinish / 15 daq), CSRF Origin tekshiruvi,
  `helmet`, credentials bilan qat'iy CORS, JSON hajm limiti, zod validatsiya
- **Parol tiklash:** bir martalik token (30 daq); SMTP yo'q — havola server
  konsoliga chiqadi (dev rejimda javobda ham qaytadi)

## Unumdorlik (talab: < 1 s)

Ma'lumot: **10 964 jurnal yozuvi, 43 oy** (800 o'quvchi, 22 xodim, 3.5 yil).
O'lchov: `npm run bench`, median (5 urinish), embedded MongoDB, Windows 11:

| Hisobot | Vaqt |
| --- | --- |
| P&L (bitta oy) | **2.2 ms** |
| P&L (butun tarix, 43 oy) | **9.1 ms** |
| Pul oqimi (bitta oy) | **152 ms** |
| Pul oqimi (butun tarix) | **187 ms** |
| Balans (sanaga) | **52 ms** |

Qilingan optimallashtirishlar va sabablari:

1. **`month` maydoni denormalizatsiya qilingan** — oy bo'yicha guruhlash
   sana-funksiyalarsiz, indeks bilan ishlaydi (va timezone xatolarini yo'q qiladi).
2. **Indekslar:** `{date}`, `{month}`, `{lines.account, month}`,
   `{kind, allocations.month}` (daromad tan olish agregatsiyasi uchun).
3. **Agregatsiya bazada** — hujjatlar Node'ga tortilmaydi, faqat guruhlangan
   natija qaytadi.
4. **Reconcile:** oy oxiri holati keyingi oyning "ochilishi" sifatida qayta
   ishlatiladi — 43 oy uchun 9.6 s → 2.5 s.

Oldindan hisoblangan agregatlar (variant B) ataylab qilinmadi: eng og'ir
hisobot 187 ms — talabdan 5 baravar tez, murakkablikka arzimaydi. Ma'lumot
~100× o'ssa, birinchi qadam — oylik snapshot kolleksiyasi (balans uchun
kumulyativ yig'ishni qisqartiradi).

## Loyiha strukturasi (qatlamli arxitektura)

```
backend/src/
  config/       # env (markazlashgan konfiguratsiya), db (ulanish + fallback)
  domain/       # sof biznes qoidalar: accounts (hisoblar rejasi),
                # ledger (invariantlar), dates, types, authTypes
  models/       # kolleksiya modellari: journal-entry, student, employee
                # (tiplar, accessorlar, indekslar — data-access qatlami)
  services/     # postings (hodisa→provodka), reports (3 hisobot), reconcile,
                # authService (JWT/sessiyalar), passwords (scrypt), audit
  controllers/  # HTTP qatlami: validatsiya + servis chaqiruvi
  api/          # server (kompozitsiya), reportsRoutes, authRoutes,
                # adminRoutes, middleware (auth, RBAC, CSRF, rate-limit)
  scripts/      # seed, reconcile (CLI), bench
  tests/        # 37 test: 5 stsenariy + topshiriq misollari + invariantlar
client/src/
  auth/         # AuthContext (sessiya, 401→refresh→retry)
  layouts/      # himoyalangan qobiq (nav ruxsatlarga qarab)
  pages/        # Dashboard, Profil, auth/ (login, register, forgot, reset),
                # admin/ (foydalanuvchilar, rollar, audit loglar)
  components/   # hisobot kartalari, UI bo'laklari
```

**"Modellar qani?"** — `backend/src/models/` da. Mongoose ataylab
ishlatilmagan: ledger invariantlari (Σdebet=Σkredit, butun so'm) ODM sxema
validatsiyasidan kuchliroq kafolat beradi, hisobotlar esa sof aggregation
pipeline — model qatlami tiplangan accessor + indekslar sifatida yetarli
(topshiriq 15-bo'lim: kutubxona tanlovi baholanmaydi).

## Seed nimalarni yaratadi (`npm run seed`)

2023-01 … 2026-07 (43 oy), deterministik (seeded PRNG — har safar bir xil):
800 o'quvchi (chegirmalar, 3 oylik oldindan to'lovchilar ~25%, ba'zi oylarda
to'lamaydiganlar, tashlab ketuvchilar), 22 xodim (ish haqi keyingi oy
5-sanasida), har oy ijara/kommunal/marketing, 2 investor (biri keyinroq
qo'shimcha kiritgan), 18% li bank krediti (har oy 20-sanada asosiy qarz +
foiz), jihoz xaridlari, naqd/bank aralash to'lovlar va oy oxirida
inkassatsiya.

## Topshiriq talablari xaritasi

| Talab (bo'lim) | Qayerda |
| --- | --- |
| Uchta tenglik, aniq nol (4) | `services/reconcile.ts` + `npm run reconcile` — 43 oy, farq 0 |
| 5 majburiy stsenariy (5) | `tests/scenario1..5-*.test.ts` — qiymatlar jadvaldagidek |
| 2.2-jadval mantiqi | `services/postings.ts` — har qator uchun provodka shabloni |
| 2.3-misol | `tests/topshiriq-misollari.test.ts` — raqamma-raqam |
| Seed: 3 yil, 500+ o'quvchi, 20+ xodim, 2 investor, kredit, inkassatsiya (6) | `scripts/seed.ts` — 43 oy, 800 o'quvchi, 22 xodim |
| Uchta hisobot endpointi (7) | `api/reportsRoutes.ts` |
| Frontend: oy → uchala hisobot (8) | `client/src/pages/DashboardPage.tsx` |
| Unumdorlik < 1 s (9) | quyidagi jadval — eng og'iri 187 ms |
| Model tanlovi izohi (13.1) | shu fayl, "Ma'lumotlar modeli" bo'limi |
| Ochiq savol (11) | `DECISIONS.md` |
| AI workflow (12) | `ai-log.md` |

## Muammolarni bartaraf etish

- **Embedded rejimda "port band" (27317) xatosi:** oldingi ishga tushirishdan
  mongod jarayoni qolib ketgan — `taskkill /IM mongod-x64-win32-7.0.24.exe /F`
  (yoki Task Manager) bilan yopib, qayta urining.
- Embedded rejimda skriptlarni **ketma-ket** ishlating (`seed` tugagach `dev`);
  real MongoDB (`MONGODB_URI`) bilan bunday cheklov yo'q.

## Ongli cheklovlar

- **Debitor qarzlar yo'q:** daromad faqat amalda to'langan summalardan tan
  olinadi ("o'quvchi to'lamadi" = o'sha oyda daromad yo'q). Topshiriq
  jadvalidagi barcha hodisalar shu modelga sig'adi; qarzdorlik kiritilsa —
  bu yangi hisob (1200) va yangi provodka shabloni, model buzilmaydi.
- Amortizatsiya, soliq, valyuta, autentifikatsiya — topshiriqda doiradan
  tashqarida deb belgilangan.
- Tarix 2026-07 da to'xtaydi: iyul ish haqi balansda "to'lanmagan" bo'lib
  turibdi (5-avgust to'lovi ataylab kiritilmagan — yopilmagan oy holatini
  ko'rsatadi).
