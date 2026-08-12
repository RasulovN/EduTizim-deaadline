# DECISIONS — Investor ulushi (11-bo'lim)

> Talab: "Har oyda foydadan menga tegishli ulushni hisoblab, hisobotda
> ko'rsatinglar." Boshqa tafsilot yo'q, investor aloqada emas.

## Qaysi savollarni kimga beraman

**Investorga (aloqaga chiqishi bilan):**

1. Shartnomada ulush qanday ta'riflangan — **foiz qancha va asos nima**:
   oylik sof foydami, operatsion foydami, yoki naqd pul oqimimi? (Bizda bu
   uchtasi har oy har xil raqam — 2.3-bo'limdagi misolning o'zi buni
   ko'rsatadi: foyda 13 mln, pul +55 mln.)
2. **Zarar oylari qanday hisoblanadi?** Yanvar −20 mln, fevral +50 mln bo'lsa,
   fevral ulushi 50 mln dan olinadimi yoki avval yanvar zarari qoplanadimi
   (carry-forward)?
3. Bu raqam **faqat ma'lumotmi yoki to'lov talabi ham?** Ya'ni har oy ulush
   e'lon qilingan dividend (majburiyat) sifatida yozilsinmi, yoki "shu oyda
   ulushingiz shuncha bo'lardi" degan ko'rsatkichmi?
4. Ikkinchi investor bor va ikkalangiz **turli vaqtda, turli summa**
   kiritgansiz. Taqsimot joriy kapital ulushlariga proportsionalmi, yoki
   shartnomada boshqa nisbat bormi?

**Direktorga (bugun):**

5. Investor shartnomalarining nusxasi bormi — yuqoridagilarning bir qismi
   o'sha yerda yozilgan bo'lishi mumkin.
6. Bu qator hisobotda **kimga ko'rinadi**? (Har investor faqat o'z ulushini
   ko'rishi kerak bo'lsa, bu keyin kirish huquqi talabiga aylanadi.)

## Javob kutmasdan o'zim qabul qiladigan qarorlar

- **Faqat hisobot qatori, ledger yozuvi emas.** E'lon qilinmagan dividend —
  majburiyat emas; provodka yozsak, balans va tengliklar hali kelishilmagan
  raqamga qarab o'zgarib qoladi. Hisobot qatori esa xavfsiz: noto'g'ri
  chiqsa, formulani almashtiramiz, ma'lumot buzilmaydi. *(Qaytarish oson
  bo'lgan qaror — kutmasdan qilamiz; qaytarish qiyinini — so'raymiz.)*
- **Standart asos: oylik sof foyda** (P&L bilan bir xil raqam) — eng keng
  tarqalgan talqin va foydalanuvchi allaqachon ko'rib turgan raqam bilan izchil.
- **Standart taqsimot: joriy kiritilgan kapitalga proportsional** — bizda har
  kapital kirimi investor nomi bilan yozilgan (`capital_injection.meta`),
  shuning uchun bu hisoblab bo'ladigan yagona obyektiv standart.
- **Zarar oyi: manfiy ulush ko'rsatiladi** va yoniga kumulyativ qator beriladi
  — ma'lumot yashirilmaydi, talqinni shartnoma hal qiladi.

## Ma'lumotlar modeli va hisobotlarga ta'siri

Sxema o'zgarishi — **nol**. Kerakli hamma narsa bor: oylik sof foyda (P&L
pipeline) va investorlar kapitali (`capital_injection` yozuvlari, `meta.investor`
bilan). Qo'shiladigani: kichik konfiguratsiya (investor → ulush %) va P&L
javobida ixtiyoriy `investorShare` bloki + frontendda bitta qator. Uchala
tenglikka ta'sir yo'q — chunki ledger'ga yozilmaydi.

Keyinchalik "to'lov talabi" deb kelishilsa, model chiroyli kengayadi: yangi
hisoblar (3800 "E'lon qilingan dividendlar", 2400 "Dividend majburiyati") va
ikkita yangi provodka shabloni (e'lon qilish, to'lash) — mavjud hisobotlar
o'z-o'zidan to'g'ri qoladi.

## Birinchi versiyaga kirmaydi

Dividend to'lovlari va majburiyat provodkalari (3-savol javobisiz), zarar
carry-forward sozlamasi (2-savol), vaqt bo'yicha o'lchangan kapital ulushi
(4-savol javobisiz — joriy qoldiq yetarli), soliq hisob-kitobi va
investor-bazlik kirish huquqlari.
