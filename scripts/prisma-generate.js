#!/usr/bin/env node
/**
 * Generiert Prisma Client mit dem passenden Schema basierend auf DATABASE_URL.
 * - file:...  -> SQLite Schema
 * - postgres:// oder postgresql:// -> Postgres Schema
 *
 * Keine DB-Migration, kein db push, keine Datenänderung.
 */

const { execSync } = require('child_process')

function pickSchema() {
  const url = process.env.DATABASE_URL || ''
  if (url.startsWith('postgresql://') || url.startsWith('postgres://')) {
    return 'prisma/schema.postgres.prisma'
  }
  // default: sqlite (inkl. file:./dev.db oder unset)
  return 'prisma/schema.prisma'
}

function main() {
  const schema = pickSchema()
  console.log(`[prisma-generate] Using schema: ${schema}`)
  execSync(`npx prisma generate --schema ${schema}`, { stdio: 'inherit' })
}

main()


