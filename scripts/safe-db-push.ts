#!/usr/bin/env tsx

/**
 * Sicherer db push - erstellt immer ein Backup vor Schema-Änderungen
 */

import { execSync } from 'child_process'
import { backupDatabase } from './backup-database'

const args = process.argv.slice(2)
const hasForceReset = args.includes('--force-reset')

function pickSchema() {
  const url = process.env.DATABASE_URL || ''
  if (url.startsWith('postgresql://') || url.startsWith('postgres://')) {
    return 'prisma/schema.postgres.prisma'
  }
  return 'prisma/schema.prisma'
}

if (hasForceReset) {
  console.log('⚠️  WARNUNG: --force-reset erkannt!')
  console.log('⚠️  Dies wird ALLE Daten löschen!')
  console.log('⚠️  Backup wird erstellt...')
}

// Erstelle immer ein Backup
const backupPath = backupDatabase()

if (!backupPath && hasForceReset) {
  console.error('❌ FEHLER: Backup konnte nicht erstellt werden!')
  console.error('❌ Abbreche Operation zum Schutz Ihrer Daten!')
  process.exit(1)
}

if (hasForceReset) {
  console.log('')
  console.log('⚠️  WARNUNG: Die Datenbank wird jetzt zurückgesetzt!')
  console.log('⚠️  Alle Daten werden gelöscht!')
  console.log('')
}

// Führe prisma db push aus
try {
  const schema = pickSchema()
  console.log(`🔧 Using schema: ${schema}`)
  execSync(`npx prisma db push --schema ${schema} ${args.join(' ')}`.trim(), { stdio: 'inherit' })
  console.log('')
  console.log('✅ Schema erfolgreich aktualisiert')
  if (backupPath) {
    console.log(`💾 Backup verfügbar bei: ${backupPath}`)
  }
} catch (error) {
  console.error('❌ Fehler beim db push:', error)
  if (backupPath) {
    console.log('')
    console.log('💡 Tipp: Sie können das Backup wiederherstellen mit:')
    console.log(`   npm run db:restore`)
  }
  process.exit(1)
}







