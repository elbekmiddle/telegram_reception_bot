import * as XLSX from 'xlsx'

interface ApplicationData {
  id: string
  createdAt: Date
  status: string
  vacancy?: { title: string } | null
  user?: { fullName: string; telegramId: bigint } | null
  answers: { fieldKey: string; fieldValue: string }[]
}

interface CourseEnrollmentData {
  id: string
  createdAt: Date
  status: string
  course?: { title: string } | null
  user?: { fullName: string; telegramId: bigint } | null
}

export async function exportToExcel(
  applications: ApplicationData[],
  courses: CourseEnrollmentData[]
): Promise<Buffer> {
  // Arizalar uchun worksheet
  const appData = applications.map(app => {
    const answersMap = new Map(app.answers.map(a => [a.fieldKey, a.fieldValue]))
    
    return {
      'ID': app.id.slice(0, 8),
      'Sana': new Date(app.createdAt).toLocaleString('uz-UZ'),
      'Holat': app.status,
      'Vakansiya': app.vacancy?.title || '-',
      'Foydalanuvchi': app.user?.fullName || '-',
      'Telegram ID': app.user?.telegramId?.toString() || '-',
      'Ism': answersMap.get('full_name') || '-',
      'Telefon': answersMap.get('phone') || '-',
      'Tug\'ilgan sana': answersMap.get('birth_date') || '-',
      'Manzil': answersMap.get('address') || '-',
      'Oilaviy holati': answersMap.get('family_status') || '-'
    }
  })

  // Kurs yozilishlari uchun worksheet
  const courseData = courses.map(c => ({
    'ID': c.id.slice(0, 8),
    'Sana': new Date(c.createdAt).toLocaleString('uz-UZ'),
    'Holat': c.status,
    'Kurs': c.course?.title || '-',
    'Foydalanuvchi': c.user?.fullName || '-',
    'Telegram ID': c.user?.telegramId?.toString() || '-'
  }))

  // Workbook yaratish
  const wb = XLSX.utils.book_new()
  
  const appWs = XLSX.utils.json_to_sheet(appData)
  const courseWs = XLSX.utils.json_to_sheet(courseData)

  XLSX.utils.book_append_sheet(wb, appWs, 'Arizalar')
  XLSX.utils.book_append_sheet(wb, courseWs, 'Kurs yozilishlari')

  // Buffer ga yozish
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return buffer
}