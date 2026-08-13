# Ekran yozuvi rejasi (maksimum 30 daqiqa, bitta dubl yetarli)

Tayyorgarlik (yozishdan OLDIN):
- `npm run seed` bajarilgan bo'lsin (demo hisob: director@edutizim.uz / demo1234)
- Bitta terminal loyiha ildizida, bitta terminal `backend/` da ochiq
- Brauzerda http://localhost:5173 login qilib qo'yilgan bo'lsin (dev server alohida oynada)
- VS Code'da ochiq fayllar: `accounts.ts`, `ledger.ts`, `postings.ts`, `reports.ts`, `reconcile.ts`

---

**0–2 daq — Muammo.**
"Direktor uchta savolga javob olishi kerak: foyda qildikmi (P&L), pul qayerdan
kelib qayerga ketdi (Cash Flow), bugun nimamiz bor va kimga qarzmiz (Balans).
Qiyinligi — foyda bilan pul bir xil emas: o'quvchi 3 oyga oldindan to'lasa pul
bugun keladi, daromad esa oyma-oy. Uchala hisobot har oy aniq nol farq bilan
mos kelishi shart edi."

**2–7 daq — Model tanlovi.**
Uch variantni ko'rganimni aytaman (README'dagi bo'lim asosida):
1) hisobot-per-kolleksiya — uch hisobot uch xil mantiq, tengliklar tasodifga qoladi;
2) oylik tayyor agregatlar — invalidatsiya muammosi, ikki joyda haqiqat;
3) **double-entry ledger — tanlaganim**: bitta `journal_entries`, har provodka
   balanslangan, hisobotlar faqat o'qiydi.
`accounts.ts` ni ochib ko'rsataman: har hisob balans turi va pul-oqimi toifasini
o'zi bilan olib yuradi — kredit to'lovi shu tufayli avtomatik moliyaviy+operatsionga
bo'linadi.

**7–12 daq — Hodisa → provodka.**
`postings.ts` dan 2–3 misol: o'quvchi to'lovi (pul ↑, majburiyat ↑, daromad EMAS,
allocations bilan), oy yopilishi (recognizeMonth — faqat to'langanini tan oladi,
closeKey bilan ikki marta yopib bo'lmaydi), kredit to'lovi (asosiy qarz vs foiz).
`ledger.ts` dagi invariantlar: Σdebet=Σkredit, faqat butun so'm.

**12–16 daq — Majburiy testlar.**
`backend/` terminalda:
```
npx vitest run src/tests/scenario1-oldindan-tolov.test.ts
npx vitest run src/tests/topshiriq-misollari.test.ts
```
Ikkinchisi — topshiriqning 2.3-misoli raqamma-raqam (foyda 13 mln, pul +55 mln).
"Jami 48 test, jumladan reconcile ataylab buzilgan yozuvni sezishini isbotlaydigan
test ham bor" — xohlasa `reconcile-buzilish.test.ts` ni ham ko'rsataman.

**16–20 daq — Reconcile JONLI.**
Ildizda:
```
npm run reconcile
```
43 oy × 3 tenglik, farq 0 so'm, exit 0. Tengliklarning ikki tomoni mustaqil
pipeline'lardan kelishini aytaman (`reconcile.ts` ga qisqa nazar).

**20–23 daq — Frontend.**
Brauzer: oy tanlayman, uchta hisobot; "Nega foyda ≠ pul?" kartasi — 2.3-misol
ko'prigi jonli: ikkala yakuniy raqam mustaqil hisoblanadi, mosligi ekranda.
"Uchala tenglik mos" belgisi ham /api/reconcile dan keladi.

**23–26 daq — Unumdorlik.**
```
npm run bench
```
11k yozuv, eng og'ir hisobot ~130 ms (talab < 1 s). Nima qilinganini aytaman:
month denormalizatsiya, indekslar, agregatsiya bazada; oldindan agregatlar
ataylab YO'Q — bu hajmda ortiqcha.

**26–29 daq — Nima ishlamadi (halol).**
1) Birinchi seed'da markaz "so'nayotgan" chiqdi — o'quvchi oqimini qayta taqsimladim.
2) Reconcile 9.6 s edi — oy-oxiri holatini keyingi oyga qayta ishlatib 2.5 s.
3) Auditda idempotentlik kamchiligi topildi: recognizeMonth ikki marta chaqirilsa
   daromad ikkilanardi — closeKey + unique indeks bilan yopdim, testi bor.

**29–30 daq — Chegaralar.**
Ataylab qilinmagani: debitor qarz (to'lanmagan oy = daromad yo'q), amortizatsiya,
soliq (doiradan tashqarida). Auth — bonus, moliya yadrosidan mustaqil. Investor
ulushi — DECISIONS.md: avval 4 ta biznes savolga javob, keyin kod.

---

Maslahatlar: montaj kerak emas; xato qilsangiz — davom etavering; kamera shart
emas; ovoz tushunarli bo'lsa yetarli. O'zbekcha gapiring — qaysi tilda erkin
bo'lsangiz o'shanisi baholanadi.
