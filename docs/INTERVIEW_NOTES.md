# Intervyu eslatmalari (o'zim uchun — topshirishga shart emas)

Texnik suhbatda chiqishi mumkin bo'lgan 15 savolga qisqa, aniq javoblar.

**1. Nega double-entry (ikki tomonlama yozuv)?**
Topshiriqning markazi — uchta tenglik har oy aniq nol bilan bajarilishi.
Double-entry'da bu tekshirib turiladigan holat emas, strukturaviy kafolat:
har provodka balanslangani uchun `Aktiv = Majburiyat + Kapital` buzilishi
uchun yozuv darajasida xato kerak — ledger esa bunday yozuvni bazaga
kiritmaydi. Alternativalar (hisobot-per-kolleksiya, oylik agregatlar)
uch hisobotni uch xil mantiqqa ajratib, tengliklarni tasodifga qoldiradi.

**2. Nega MongoDB?**
Topshiriqda majburiy. Model unga yaxshi mos: jurnal yozuvi — o'z qatorlari
bilan bitta hujjat (atomik insert, JOIN'siz), hisobotlar — aggregation
pipeline. `month` denormalizatsiyasi bilan indekslar samarali ishlaydi.

**3. Nega native driver, Mongoose emas?**
Bizning validatsiya (Σdebet=Σkredit, butun so'm, mavjud hisob) Mongoose
sxemasi ifodalay oladigan narsadan kuchliroq — baribir o'z qatlamimiz kerak.
Hisobotlar sof aggregation — ODM bu yerda faqat qatlam qo'shadi. Topshiriq:
kutubxona tanlovi baholanmaydi; tushuntirish osonligi muhim.

**4. Oldindan to'lov qanday ishlaydi?**
To'lovda: Dr Pul / Cr 2100 (majburiyat) + `allocations` (qaysi oyga qancha).
Oy yopilishida bitta agregatsiya oy oxirigacha AMALDA to'langan summalarning
shu oyga tegishli qismini yig'ib Dr 2100 / Cr 4000 qiladi. Daromad pulga emas,
taqsimotga asoslangan. To'lanmagan oy = daromad yo'q (debitor qarz doiradan
tashqarida, hujjatlashtirilgan).

**5. Nega ish haqi xarajati pul chiqishidan farq qiladi?**
Xarajat — xodim ishlagan oyga (accrual): oy oxirida Dr 5100 / Cr 2200.
Pul keyingi oy 5-sanasida chiqadi: Dr 2200 / Cr Bank — bu P&L ga tegmaydi.
2200 qoldig'i — foyda bilan pul orasidagi "ko'prik"ning bir qatori.

**6. Nega kredit asosiy qarzi xarajat emas?**
Pul olganda boylik oshmagan (pul ↑, qarz ↑). Qaytarganda kambag'allashmayapmiz
(pul ↓, qarz ↓) — bu majburiyatning kamayishi. Faqat foiz — pulning "narxi" —
xarajat. Bitta to'lov provodkasi ikkiga bo'linadi: Dr 2300 (moliyaviy) +
Dr 5500 (operatsion) / Cr Bank.

**7. Nega jihoz xarajat emas?**
Pul boshqa aktivga aylandi — boylik kamaygani yo'q. Dr 1500 / Cr Bank.
P&L 0, pul oqimi investitsion. (Amortizatsiya topshiriqda doiradan tashqarida.)

**8. Nega inkassatsiya pul oqimiga tushmaydi?**
Ikkala tomon ham pul hisobi (1000→1100) — jami pul o'zgarmadi. CF
klassifikatsiyam qarshi-tomon hisobidan olinadi; bu yozuvda pul bo'lmagan
qarshi tomon yo'q — hisobotga avtomatik tushmaydi. Regression test bor.

**9. Reconcile mustaqillikni qanday isbotlaydi?**
Har tenglikning ikki tomoni har xil pipeline'dan: (1) balans — hisob turlari
bo'yicha yig'ish; (2) pul qoldiqlari balans yo'lidan vs oqimlar qarshi-tomon
qatorlaridan; (3) oylik sof foyda P&L pipeline'dan vs taqsimlanmagan foyda
balans yo'lidan. Manba bitta (jurnal — yagona haqiqat), lekin hisoblash
yo'llari mustaqil — agregatsiya xatosi darhol farq chiqaradi. Buni
`reconcile-buzilish.test.ts` isbotlaydi: ataylab buzilgan bitta yozuv
tekshiruvni yiqitadi.

**10. Dublikat yozuvlar qanday oldini olinadi?**
Davr-yopish hodisalarida `closeKey` (`revenue_recognition:2026-01`,
`salary_accrual:2026-01`) + MongoDB partial unique indeks. Takror
recognizeMonth — null (hech narsa yozmaydi), takror accrueSalaries — aniq
xato (summasi boshqacha bo'lishi mumkin, jim o'tkazish xatoni yashiradi).
Testlar bor.

**11. Nega taqsimlanmagan foyda kumulyativ foydaga teng?**
Dividend/taqsimot yo'q (doiradan tashqarida), shuning uchun RE = hamma
daromad − hamma xarajat. U saqlanmaydi — hisobot paytida daromad/xarajat
hisoblaridan chiqariladi. "Yopish provodkalari" yo'q — soddaroq va
"moslashtiruvchi qator" qo'yishning texnik iloji ham yo'q.

**12. Nega hech qanday adjustment hisob yo'q?**
Chunki kerak emas: har provodka balanslangan bo'lsa, tengliklar matematik
bajariladi. Farq chiqsa — bu xato, uni yashirish emas, topish kerak
(reconcile aynan shuni qiladi). Topshiriqda bu avtomatik rad sababi.

**13. Hisobotlar qanday 1 soniyadan tez ishlaydi?**
Agregatsiya bazada (hujjatlar Node'ga tortilmaydi), `month` denormalizatsiya,
4+1 indeks (date; month; lines.account+month; kind+allocations.month;
closeKey unique). 11k yozuvda eng og'iri ~130 ms. Oldindan agregatlar
ataylab yo'q — bu hajmda keraksiz murakkablik.

**14. Ma'lumot 100× o'ssa nima o'zgaradi?**
~1.1 mln yozuv. Birinchi qadam — oylik snapshot kolleksiyasi (yopilgan
oylar uchun hisob-qoldiqlar), balansdagi kumulyativ yig'ish O(butun tarix)
dan O(1 oy)ga tushadi. Jurnal baribir yagona haqiqat bo'lib qoladi,
snapshotlar undan qayta quriladi (cache, manba emas). Keyin: davrni yopib
qo'yish (closed periods), arxivlash.

**15. Keyingi arxitektura qadami?**
(a) Debitor qarz (1200) — kechikkan to'lovlar uchun; (b) davr yopish/qulflash;
(c) dividend hisoblari (DECISIONS.md dagi javoblardan keyin); (d) hisobot
snapshotlari. Har biri yangi hisob + provodka shabloni — mavjud hisobotlar
o'zgarmaydi, model shunga qurilgan.
