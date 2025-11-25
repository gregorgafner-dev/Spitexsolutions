import { execSync } from 'child_process'
import { existsSync, mkdirSync, copyFileSync } from 'fs'
import { join } from 'path'

const BACKUP_DIR = join(process.cwd(), 'backups')
const DB_PATH = join(process.cwd(), 'prisma', 'dev.db')
const BACKUP_PREFIX = 'dev.db.backup'

function ensureBackupDir() {
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true })
  }
}

function getBackupFileName(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  return `${BACKUP_PREFIX}.${timestamp}.db`
}

export function backupDatabase(): string | null {
  try {
    if (!existsSync(DB_PATH)) {
      console.log('⚠️  Datenbank-Datei nicht gefunden, kein Backup erstellt')
      return null
    }

    ensureBackupDir()
    const backupFileName = getBackupFileName()
    const backupPath = join(BACKUP_DIR, backupFileName)

    copyFileSync(DB_PATH, backupPath)
    
    console.log(`✅ Backup erstellt: ${backupFileName}`)
    return backupPath
  } catch (error) {
    console.error('❌ Fehler beim Erstellen des Backups:', error)
    return null
  }
}

// Cleanup alte Backups (behalte nur die letzten 10)
export function cleanupOldBackups() {
  try {
    if (!existsSync(BACKUP_DIR)) {
      return
    }

    const fs = require('fs')
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f: string) => f.startsWith(BACKUP_PREFIX))
      .map((f: string) => ({
        name: f,
        path: join(BACKUP_DIR, f),
        time: fs.statSync(join(BACKUP_DIR, f)).mtime.getTime()
      }))
      .sort((a: any, b: any) => b.time - a.time)

    // Lösche alle außer den letzten 10
    if (files.length > 10) {
      const toDelete = files.slice(10)
      toDelete.forEach((file: any) => {
        fs.unlinkSync(file.path)
        console.log(`🗑️  Altes Backup gelöscht: ${file.name}`)
      })
    }
  } catch (error) {
    console.error('⚠️  Fehler beim Aufräumen alter Backups:', error)
  }
}

if (require.main === module) {
  backupDatabase()
  cleanupOldBackups()
}




