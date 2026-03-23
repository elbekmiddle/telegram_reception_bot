import { query, withTransaction } from '../../db/pg'

export type TransitionResult =
	| { kind: 'updated'; telegramId: bigint }
	| { kind: 'already'; telegramId: bigint }
	| { kind: 'not_found' }
	| { kind: 'conflict'; telegramId: bigint; status: string }

const terminalStatuses = new Set(['APPROVED', 'REJECTED', 'CANCELLED'])

export async function claimAdminAction(actionKey: string): Promise<boolean> {
	const result = await query<{ claimed: boolean }>(
		`INSERT INTO processed_actions (action_key, processed_at)
     VALUES ($1, now())
     ON CONFLICT (action_key) DO NOTHING
     RETURNING true AS claimed`,
		[actionKey]
	)

	return result.rowCount > 0
}

export async function transitionApplicationStatus(params: {
	applicationId: string
	adminTelegramId: number
	nextStatus: 'IN_PROGRESS' | 'APPROVED' | 'REJECTED'
	rejectionReason?: string
}): Promise<TransitionResult> {
	return withTransaction(async client => {
		const current = await client.query<{ telegram_id: string; status: string }>(
			`SELECT telegram_id, status
       FROM applications
       WHERE id = $1
       FOR UPDATE`,
			[params.applicationId]
		)

		if (!current.rows[0]) return { kind: 'not_found' }

		const row = current.rows[0]
		const telegramId = BigInt(row.telegram_id)
		const status = row.status

		if (status === params.nextStatus) {
			return { kind: 'already', telegramId }
		}

		if (terminalStatuses.has(status) && params.nextStatus !== 'IN_PROGRESS') {
			return { kind: 'conflict', telegramId, status }
		}

		await client.query(
			`UPDATE applications
       SET status = $2,
           reviewed_at = now(),
           reviewed_by = $3,
           rejection_reason = $4,
           updated_at = now()
       WHERE id = $1`,
			[
				params.applicationId,
				params.nextStatus,
				BigInt(params.adminTelegramId),
				params.nextStatus === 'REJECTED' ? params.rejectionReason ?? null : null
			]
		)

		return { kind: 'updated', telegramId }
	})
}

export async function transitionEnrollmentStatus(params: {
	enrollmentId: string
	nextStatus: 'APPROVED' | 'REJECTED'
}): Promise<
	| { kind: 'updated'; telegramId: bigint; fullName: string; phone: string; courseTitle: string; createdAt: Date }
	| { kind: 'already'; telegramId: bigint; fullName: string; phone: string; courseTitle: string; createdAt: Date }
	| { kind: 'not_found' }
> {
	return withTransaction(async client => {
		const current = await client.query<{
			status: string
			telegram_id: string
			full_name: string
			phone: string
			course_title: string
			created_at: Date
		}>(
			`SELECT ce.status,
              u.telegram_id,
              ce.full_name,
              ce.phone,
              c.title AS course_title,
              ce.created_at
       FROM course_enrollments ce
       JOIN users u ON u.id = ce.user_id
       JOIN courses c ON c.id = ce.course_id
       WHERE ce.id = $1
       FOR UPDATE`,
			[params.enrollmentId]
		)

		if (!current.rows[0]) return { kind: 'not_found' }

		const row = current.rows[0]
		const payload = {
			telegramId: BigInt(row.telegram_id),
			fullName: row.full_name,
			phone: row.phone,
			courseTitle: row.course_title,
			createdAt: row.created_at
		}

		if (row.status === params.nextStatus) {
			return { kind: 'already', ...payload }
		}

		await client.query(
			`UPDATE course_enrollments
       SET status = $2,
           updated_at = now()
       WHERE id = $1`,
			[params.enrollmentId, params.nextStatus]
		)

		return { kind: 'updated', ...payload }
	})
}

export async function getApplicationTelegramId(applicationId: string): Promise<bigint | null> {
	const result = await query<{ telegram_id: string }>(
		'SELECT telegram_id FROM applications WHERE id = $1',
		[applicationId]
	)

	if (!result.rows[0]) return null
	return BigInt(result.rows[0].telegram_id)
}
