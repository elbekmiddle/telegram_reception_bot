# O'RNATISH VA FOYDALANISH YO'RIQNOMASI

## 1. Loyihani yuklab olish

Arxivni ochish:
```bash
tar -xzf telegram-reception-bot-refactored.tar.gz
cd telegram-reception-bot-refactored
```

## 2. Paketlarni o'rnatish

```bash
npm install
```

## 3. Ma'lumotlar bazasini yangilash

### Prisma client yaratish:
```bash
npx prisma generate
```

### Migration ishga tushirish:
```bash
npx prisma migrate deploy
```

Agar xatolik bo'lsa, avval database backup oling, keyin:
```bash
npx prisma migrate reset
npx prisma migrate deploy
```

## 4. Botni ishga tushirish

### Development rejimda:
```bash
npm run dev
```

### Production rejimda:
```bash
npm run build
npm start
```

## 5. Asosiy o'zgarishlar

### ✅ Tayyor qismlar:

1. **Database struktura** - to'liq yangilandi
2. **Vakansiya servisi** - CRUD tayyor
3. **Kurs servisi** - CRUD tayyor
4. **Application flow** - soddalashtirildi, faqat 3ta field so'raydi
5. **Helper funksiyalar** - `flow-helpers.ts` faylida

### ❌ Bajarilishi kerak:

1. **Admin flow** - to'liq qayta yozish kerak
   - Namuna kod: `admin-flow-example.ts`
   - To'liq implementatsiya qilish kerak

2. **Course enrollment flow** - yangi kod yozish kerak

3. **Photo validation** - yuz detection qo'shish

## 6. Qanday ishlaydi

### Foydalanuvchi uchun (Application Flow):

1. `/start` bosadi
2. Vakansiyani tanlaydi
3. Ism-familiyasini yozadi
4. Telefon raqamini yuboradi (tugma orqali)
5. Rasmini yuklaydi (demo ko'rsatiladi)
6. Vakansiya savollariga javob beradi (dinamik)
7. Tasdiqlaydi va yuboradi

### Admin uchun:

Admin flow hozircha yarim-tayyor. To'liq qilish kerak:

**Vakansiya:**
- ✅ Yaratish (nomi + maoshi)
- ✅ Savol qo'shish (TEXT/SINGLE/MULTI)
- ✅ Variantlar qo'shish (6tagacha)
- ✅ Ko'rish
- ❌ Tahrirlash
- ❌ O'chirish

**Kurs:**
- ❌ Hammasi qilish kerak

**Ariza:**
- ❌ Ko'rish va tasdiqlash

## 7. Fayl strukturasi

```
src/
├── bot/
│   └── conversations/
│       ├── flow-helpers.ts          ✅ TAYYOR
│       ├── application.flow.ts      ✅ TAYYOR (soddalashtirildi)
│       ├── admin-flow-example.ts    ⚠️ NAMUNA (to'ldirish kerak)
│       └── admin.flow.ts            ❌ ESKI (o'chirish/qayta yozish)
├── services/
│   ├── vacancy.service.ts           ✅ TAYYOR
│   ├── course.service.ts            ✅ TAYYOR
│   └── application.service.ts       ✅ ISHLAYDI
└── prisma/
    ├── schema.prisma                ✅ YANGILANDI
    └── migrations/                  ✅ TAYYOR
```

## 8. Admin panel yaratish bo'yicha maslahat

`admin-flow-example.ts` faylida namuna ko'rsatilgan. 

Kerakli bo'lgan asosiy funksiyalar:

1. `createVacancy()` - ✅ Tayyor
2. `addQuestionToVacancy()` - ✅ Tayyor
3. `viewVacancy()` - ✅ Tayyor
4. `editVacancy()` - ❌ Qilish kerak
5. `deleteVacancy()` - ❌ Qilish kerak
6. `listVacancies()` - ✅ Tayyor
7. `createCourse()` - ❌ Qilish kerak (vakansiya kabi)
8. `viewApplications()` - ❌ Qilish kerak
9. `approveApplication()` - ❌ Qilish kerak

## 9. Test qilish

1. Botni ishga tushiring
2. `/start` yuboring
3. Vakansiya tanlang (agar bo'lsa)
4. Ariza to'ldiring
5. `/admin` yuboring (admin bo'lsangiz)
6. Vakansiya yaratib ko'ring

## 10. Muammolar va yechimlar

### Agar migration ishlamasa:
```bash
# Backupni olish
pg_dump DATABASE_URL > backup.sql

# Reset qilish
npx prisma migrate reset --force

# Qayta ishga tushirish
npx prisma migrate deploy
```

### Agar bot ishlamasa:
- `.env` faylini tekshiring
- `npm run dev` loglarini ko'ring
- Database connection tekshiring

### Agar admin panel ochilmasa:
- `.env` da `ADMIN_IDS` ni tekshiring
- Telegram ID to'g'ri yozilganligini tekshiring

## 11. Keyingi qadamlar

1. **Admin flow**ni to'liq yozish
2. **Course enrollment** flow yaratish
3. **Photo validation** qo'shish (face detection)
4. Test qilish va xatolarni tuzatish
5. Production ga deploy qilish

## Yordam

Agar savol bo'lsa:
- `REFACTORING_PLAN.md` o'qing
- `admin-flow-example.ts` ni ko'ring
- `flow-helpers.ts` dagi funksiyalardan foydalaning

Omad! 🚀
