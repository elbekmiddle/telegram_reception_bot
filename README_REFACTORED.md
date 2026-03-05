# Telegram Reception Bot - Refactored Version

## Yangi o'zgarishlar

### 1. Ma'lumotlar bazasi strukturasi
- **Vakansiya**: faqat nomi va maoshi (text)
- **Savol**: har bir vakansiya uchun 6tagacha savol
- **Variant**: har bir savol uchun 6tagacha variant
- **Savol turlari**: TEXT, SINGLE_SELECT, MULTI_SELECT

### 2. Ariza berish oqimi (Foydalanuvchilar)
Foydalanuvchi faqat **3ta ma'lumot** kiritadi:
1. **Ism-familiya**
2. **Telefon raqam** (requestContact tugmasi)
3. **Rasm** (beldan yuqori, yuz bilan)

Keyin vakansiyaga tegishli savollar dinamik ravishda so'raladi.

### 3. Rasm yuklash
- Rasm cheklovi yo'q
- Demo rasm ko'rsatiladi
- Yuz detection kerak bo'ladi

### 4. Admin panel
- Vakansiya yaratish/tahrirlash
- Kurs yaratish/tahrirlash  
- Ariza ko'rish va tasdiqlash
- 5tadan ko'rsatish

## O'rnatish

### 1. Prisma migration
```bash
cd telegram-reception-bot-refactored
npm install
npx prisma generate
npx prisma migrate deploy
```

### 2. Environment o'zgartirish kerak emas
Hamma env o'zgaruvchilar avvalgidek ishlaydi.

### 3. Botni ishga tushirish
```bash
npm run dev
```

## Fayllar

### Yangi fayllar:
- `src/bot/conversations/flow-helpers.ts` - Helper funksiyalar
- `src/services/vacancy.service.ts` - To'liq qayta yozildi
- `src/services/course.service.ts` - To'liq qayta yozildi
- `src/bot/conversations/application.flow.ts` - Soddalashtirildi
- `prisma/schema.prisma` - Yangilandi
- `prisma/migrations/...` - Yangi migration

### O'zgartirilgan fayllar:
- `src/bot/conversations/admin.flow.ts` - To'liq qayta yozish kerak

## Xususiyatlar

✅ Foydalanuvchi uchun sodda interfeys
✅ Dinamik savollar (vakansiyaga bog'liq)
✅ Demo rasm ko'rsatish
✅ 3x yaratish bugini hal qilindi
✅ 5tadan ko'rsatish
✅ Oddiy va aniq callback nomlari

## Keyingi qadamlar

Admin flow ni to'liq yozish kerak:
1. Vakansiya CRUD
2. Kurs CRUD
3. Ariza ko'rish
4. Kurs yozilishini ko'rish

Batafsil ma'lumot uchun `REFACTORING_PLAN.md` ga qarang.
