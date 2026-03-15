import { query } from '../db/pg'
import { logger } from '../utils/logger'

export type RuntimeSettings = {
	instagramUrl?: string
	aboutText?: string
	contactText?: string
}

export class RuntimeSettingsService {
	private cache: RuntimeSettings = {}
	private initialized = false

	async initialize(): Promise<void> {
		if (this.initialized) return
		await this.reload()
		this.initialized = true
	}

	async reload(): Promise<void> {
		const result = await query<{ key: string; value: string }>(
			'SELECT key, value FROM runtime_settings WHERE namespace = $1',
			['bot']
		)
		const next: RuntimeSettings = {}
		for (const row of result.rows) {
			if (row.key === 'instagramUrl') next.instagramUrl = row.value
			if (row.key === 'aboutText') next.aboutText = row.value
			if (row.key === 'contactText') next.contactText = row.value
		}
		this.cache = next
	}

	get(): RuntimeSettings {
		return this.cache
	}

	async update(patch: Partial<RuntimeSettings>): Promise<RuntimeSettings> {
		this.cache = { ...this.cache, ...patch }
		await this.persist(patch)
		return this.cache
	}

	private async persist(patch: Partial<RuntimeSettings>): Promise<void> {
		for (const [key, value] of Object.entries(patch)) {
			await query(
				`INSERT INTO runtime_settings(namespace, key, value, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT(namespace, key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = now()`,
				['bot', key, value ?? '']
			)
		}
	}
}

export const runtimeSettingsService = new RuntimeSettingsService()
