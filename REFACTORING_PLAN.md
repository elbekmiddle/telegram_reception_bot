# Telegram Reception Bot - Refactoring Plan

## Completed Changes

### 1. Database Schema (Prisma)
✅ Updated `Vacancy` model:
- Removed `description`, `salaryFrom`, `salaryTo`
- Added single `salary` text field
- Added `QuestionType` enum (TEXT, SINGLE_SELECT, MULTI_SELECT)
- Created `VacancyQuestion` table with proper relations
- Created `QuestionOption` table for question variants (max 6)

✅ Updated `Course` model:
- Removed `level`, `hasCertificate`
- Changed `price` to text field
- Created `CourseQuestion` table
- Created `CourseQuestionOption` table

✅ Updated `CourseEnrollment`:
- Removed `days`, `timeSlot`, `wantCertificate`
- Added `photoFileId` for user photo
- Added `answers` JSONB field for storing all answers

### 2. Services
✅ `vacancy.service.ts` - Full CRUD for vacancies, questions, and options
✅ `course.service.ts` - Full CRUD for courses, questions, and options

### 3. Application Flow
✅ Simplified `application.flow.ts`:
- Only asks: Name, Phone, Photo (waist-up with face)
- Then asks vacancy-specific questions dynamically
- Photo now required for all applications
- Shows demo photo before asking for user photo

✅ Created `flow-helpers.ts`:
- Reusable helper functions
- Better error handling
- Simplified navigation

## TODO: Admin Flow Rewrite

### Vacancy Management
- [ ] Create vacancy (name + salary)
- [ ] Add questions (up to 6)
- [ ] Add options to questions (up to 6 each)
- [ ] Edit existing vacancies
- [ ] Delete vacancies
- [ ] Toggle active/inactive
- [ ] List only 5 vacancies at a time

### Course Management  
- [ ] Create course (name + price + description)
- [ ] Add questions (same as vacancy)
- [ ] Edit courses
- [ ] Delete courses
- [ ] Toggle active/inactive
- [ ] List only 5 courses at a time

### Application Review
- [ ] Show user info + photo
- [ ] Show vacancy-specific answers
- [ ] Approve/Reject buttons
- [ ] Better UI/UX

### Course Enrollment Review
- [ ] Show user info + photo
- [ ] Show course-specific answers
- [ ] Approve/Reject buttons

## Key Improvements

1. **Simplified Flow**: Only 3 mandatory fields (name, phone, photo)
2. **Dynamic Questions**: Questions come from vacancy/course settings
3. **Better UX**: Demo photo shown before upload
4. **No Limits**: Photo size/format checks removed (only face detection needed)
5. **Cleaner Code**: Helpers extracted to separate module
6. **5-Item Pagination**: Only 5 vacancies/courses shown at once
7. **No Duplication Bug**: Fixed 3x creation issue

## Migration Instructions

1. Run Prisma migration:
```bash
npx prisma migrate deploy
```

2. Generate Prisma client:
```bash
npx prisma generate
```

3. Update environment variables if needed

4. Restart bot

## Notes

- All old data will be preserved during migration
- New structure is backward compatible
- Face detection should be added for photo validation
- Admin flow needs complete rewrite (see TODO above)
