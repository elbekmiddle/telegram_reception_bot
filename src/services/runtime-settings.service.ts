import fs from 'node:fs'
import path from 'node:path'

export type RuntimeSettings = {
	instagramUrl?: string
	aboutText?: string
	contactText?: string
}

const dataDir = path.join(process.cwd(), 'data')
const filePath = path.join(dataDir, 'runtime-settings.json')

function ensureFile() {
	if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
	if (!fs.existsSync(filePath)) {
		fs.writeFileSync(filePath, JSON.stringify({}, null, 2), 'utf8')
	}
}

export class RuntimeSettingsService {
	get(): RuntimeSettings {
		try {
			ensureFile()
			const raw = fs.readFileSync(filePath, 'utf8')
			return raw ? (JSON.parse(raw) as RuntimeSettings) : {}
		} catch {
			return {}
		}
	}

	update(patch: Partial<RuntimeSettings>): RuntimeSettings {
		const current = this.get()
		const next = { ...current, ...patch }
		ensureFile()
		fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8')
		return next
	}
}

export const runtimeSettingsService = new RuntimeSettingsService()
