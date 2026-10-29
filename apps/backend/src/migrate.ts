import { migrateLocked } from './infra/db.ts'

const serving = process.env.DATABASE_URL
const url = process.env.DATABASE_MIGRATION_URL || serving
if (!url) throw new Error('Set DATABASE_MIGRATION_URL or DATABASE_URL')
await migrateLocked(url, serving || url)
