import * as XLSX from 'xlsx'

interface ApplicationData {
  id: string
  createdAt: Date
  status: string
  vacancy?: { title: string } | null
  user?: { fullName?: string | null; telegramId: bigint } | null
  answers: { fieldKey: string; fieldValue: string }[]
}

interface CourseEnrollmentData {
  id: string
  createdAt: Date
  status: string
  course?: { title: string } | null
  user?: { fullName?: string | null; telegramId: bigint } | null
}

interface UserData {
  telegramId: bigint
  fullName?: string | null
  phone?: string | null
  language?: string | null
  createdAt?: Date | null
}

function autoWidth(rows: Record<string, unknown>[]) {
  if (!rows.length) return []
  const headers = Object.keys(rows[0])
  return headers.map(header => ({
    wch: Math.min(40, Math.max(header.length, ...rows.map(row => String(row[header] ?? '').length)) + 2)
  }))
}

export async function exportToExcel(
  applications: ApplicationData[],
  courses: CourseEnrollmentData[],
  users: UserData[] = []
): Promise<Buffer> {
  const appRows = applications.map(app => {
    const answers = new Map(app.answers.map(a => [a.fieldKey, a.fieldValue]))
    return {
      ID: app.id.slice(0, 8),
      Sana: new Date(app.createdAt).toLocaleString('uz-UZ'),
      Holat: app.status,
      Vakansiya: app.vacancy?.title || '-',
      Foydalanuvchi: app.user?.fullName || answers.get('full_name') || '-',
      'Telegram ID': app.user?.telegramId?.toString() || '-',
      Telefon: answers.get('phone_number') || answers.get('phone') || '-',
      Manzil: answers.get('address') || '-',
      'Oilaviy holati': answers.get('family_status') || '-',
      Mutaxassislik: answers.get('speciality') || '-',
      'Kutilayotgan oylik': answers.get('salary_expectation') || '-'
    }
  })

  const courseRows = courses.map(c => ({
    ID: c.id.slice(0, 8),
    Sana: new Date(c.createdAt).toLocaleString('uz-UZ'),
    Holat: c.status,
    Kurs: c.course?.title || '-',
    Foydalanuvchi: c.user?.fullName || '-',
    'Telegram ID': c.user?.telegramId?.toString() || '-'
  }))

  const userRows = users.map(u => ({
    'Telegram ID': u.telegramId.toString(),
    'F.I.Sh': u.fullName || '-',
    Telefon: u.phone || '-',
    Til: u.language || '-',
    Sana: u.createdAt ? new Date(u.createdAt).toLocaleString('uz-UZ') : '-'
  }))

  const safeAppRows = appRows.length ? appRows : [{ Malumot: 'Arizalar yo‘q' }]
  const safeCourseRows = courseRows.length ? courseRows : [{ Malumot: 'Kurs yozilishlari yo‘q' }]
  const safeUserRows = userRows.length ? userRows : [{ Malumot: 'Userlar yo‘q' }]

  const wb = XLSX.utils.book_new()
  const appWs = XLSX.utils.json_to_sheet(safeAppRows)
  const courseWs = XLSX.utils.json_to_sheet(safeCourseRows)
  const userWs = XLSX.utils.json_to_sheet(safeUserRows)

  appWs['!cols'] = autoWidth(safeAppRows)
  courseWs['!cols'] = autoWidth(safeCourseRows)
  userWs['!cols'] = autoWidth(safeUserRows)

  XLSX.utils.book_append_sheet(wb, appWs, 'Arizalar')
  XLSX.utils.book_append_sheet(wb, courseWs, 'Kurslar')
  XLSX.utils.book_append_sheet(wb, userWs, 'Userlar')

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer | Uint8Array
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
}
