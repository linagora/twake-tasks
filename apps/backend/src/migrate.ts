import { migrateLocked } from './infra/db.ts'

const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL
if (!url) throw new Error('Set DATABASE_MIGRATION_URL or DATABASE_URL')
await migrateLocked(url)
