# ai-log — AI bilan ishlash jarayoni

## Vositalar

- **Claude Code** (Anthropic CLI, Claude Fable 5 modeli) — asosiy vosita:
  arxitektura muhokamasi, kod generatsiyasi, testlarni yozish va ishga
  tushirish, xatolarni topish. Terminal ichida ishlaydi, kodni o'zi yozib,
  o'zi ishga tushirib tekshiradi.

## Ish tartibi

1. Avval topshiriqni to'liq o'qib, **modelni AI bilan muhokama qildim**
   (kod yozishdan oldin) — uch variant ko'rildi, double-entry tanlandi.
2. Har bosqichda AI yozgan kod darhol tekshirildi: `tsc --noEmit`,
   `npm test`, `npm run reconcile` — "ishlayapti deb ishonish" emas,
   "ishga tushirib ko'rish".
3. Har mantiqiy bosqich alohida commit qilindi.

## Eng foydali promptlar

**1. Model tanlash (eng muhimi — kod yozishdan oldin):**
> O'quv markaz moliya moduli uchun 3 hisobot (P&L, Cash Flow, Balans) har oy
> aniq nol farq bilan mos kelishi kerak. MongoDB da 3 variantni solishtir:
> hisobot-yo'naltirilgan kolleksiyalar, oylik agregatlar, double-entry ledger.
> Har birida uchta tenglik qanday buziladi/kafolatlanadi — misol bilan.

**2. Pul oqimi klassifikatsiyasi (eng nozik joy):**
> Kredit to'lovi bitta provodkada: asosiy qarz (moliyaviy) + foiz (operatsion).
> Cash flow toifasini entry darajasida saqlasak, aralash provodka buziladi.
> Toifani pulning qarshi tomonidagi hisobdan chiqaradigan dizayn taklif qil va
> nima uchun bu inkassatsiyani avtomatik chiqarib tashlashini isbotla.

**3. Oldindan to'lov va daromad tan olish:**
> O'quvchi 3 oyga oldindan to'laydi. To'lovga allocations (oy → summa)
> yozib, oy yopilishida faqat "oy oxirigacha amalda to'langan" qismini
> daromadga o'tkazadigan agregatsiya yoz. Debitor qarz modelga kirmasin —
> to'lanmagan oy = daromad yo'q.

**4. Reconcile mustaqilligini himoya qilish:**
> Reconcile'da tenglikning ikki tomoni bitta funksiyadan chiqsa, tekshiruv
> o'z-o'zini tasdiqlaydi. Har tenglik uchun chap va o'ng tomon qaysi mustaqil
> pipeline'lardan olinishini jadval qilib ber, keyin shunga mos refaktor qil.

**5. Seed realizmi (birinchi urinish xatosidan keyin):**
> Seed'da oxirgi oylar zarar ko'rsatyapti — o'quvchilarning 55% i birinchi
> yarim yilda kelib, muddati tugab ketgan. Qabul oqimini butun 3.5 yilga
> tekis taqsimlab, o'sib boruvchi markaz modeliga o'tkaz; reconcile baribir
> nol farq bilan o'tishi shart.

## Nima ishlamadi / nimani qo'lda to'g'riladim

- Birinchi seed versiyasida markaz "so'nayotgan" ko'rinishda edi (oxirgi
  oylarda zarar) — o'quvchi oqimi qayta taqsimlandi (5-prompt).
- Reconcile birinchi versiyasi 9.6 s ishladi: har oy uchun balans 3 marta
  qayta hisoblanayotgan edi. Oy oxiri holatini keyingi oyga qayta ishlatib
  2.5 s ga tushirildi.
- `tsconfig.tsbuildinfo` build artefakti commitga kirib qolgan edi —
  `.gitignore` ga qo'shib, indeksdan chiqarildi.
- Embedded MongoDB jarayoni (mongod) fon rejimda o'ldirilgan serverdan
  keyin tirik qolib, portni band qilgan — topib o'chirildi, README ga
  "muammolarni bartaraf etish" bo'limi qo'shildi.

## Keyingi bosqich: arxitektura va auth (yadro yakunlangandan keyin)

Moliya yadrosi (tengliklar + testlar) toza o'tgach, loyiha qatlamli
arxitekturaga o'tkazildi (config/models/controllers/api) va bonus sifatida
to'liq RBAC autentifikatsiya qo'shildi (JWT + refresh rotatsiya, scrypt,
audit loglar, rollar CRUD). Bunda ishlatilgan qo'shimcha prompt:

> Moliya yadrosiga tegmasdan, hisobot endpointlarini reports.view ruxsati
> bilan himoyala: JWT access httpOnly cookie'da, refresh rotatsiya bilan
> alohida sessiya kolleksiyasida, login rate-limit va har bir amal uchun
> audit log. Birinchi ro'yxatdan o'tgan foydalanuvchi — owner.

## Audit bosqichi (yakuniy)

Yadro tayyor bo'lgach, loyiha topshiriqning har bandiga qarshi tizimli
audit qilindi (tashqi tekshiruv ro'yxati bilan). Auditda topilgan va
tuzatilgan haqiqiy kamchiliklar:

- **Idempotentlik yo'q edi**: `recognizeMonth`/`accrueSalaries` ikki marta
  chaqirilsa dublikat yozardi → `closeKey` + partial unique indeks + testlar.
- **Biznes validatsiya kuchsiz edi**: qoldiqdan ortiq ish haqi/kredit
  to'lovini o'tkazib yuborardi → domen tekshiruvlari + testlar.
- **Reconcile'ning o'zi testlanmagan edi**: ataylab buzilgan yozuv bilan
  fixture testi qo'shildi — reconcile haqiqatan xatoni sezishi isbotlandi.

Bunda ishlatilgan prompt:

> Loyihani topshiriqning har bandiga qarshi audit qil: idempotentlik
> (oy ikki marta yopilsa nima bo'ladi?), qoldiqdan ortiq to'lovlar,
> reconcile haqiqatan buzilishni sezishini isbotlaydigan test. Ortiqcha
> narsa qo'shma — faqat haqiqiy kamchiliklarni tuzat.

## Kod egaligi

Har bir qator kodni tushuntira olaman — model tanlovi, har provodka
shabloni, har pipeline va ularning nima uchun aynan shunday yozilgani
README ("Ma'lumotlar modeli" bo'limi) va kod izohlarida bayon qilingan.
