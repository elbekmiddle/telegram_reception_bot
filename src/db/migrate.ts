import fs from 'node:fs/promises'
import path from 'node:path'
import { db } from './sql'
import { logger } from '../utils/logger'
async function main() { const content = await fs.readFile(path.join(process.cwd(),'sql','001_init.sql'),'utf8'); await db.query(content); logger.info('migration applied'); await db.close() }
main().catch(async error => { logger.error({ error }, 'migration failed'); await db.close().catch(() => undefined); process.exit(1) })
