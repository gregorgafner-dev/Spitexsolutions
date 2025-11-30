import { existsSync, readdirSync, statSync, copyFileSync } from 'fs'
import { join } from 'path'

const BACKUP_DIR = join(process.cwd(), 'backups')
const DB_PATH = join(process.cwd(), 'prisma', 'dev.db')
const BACKUP_PREFIX = 'dev.db.backup'

function listBackups() {
  if (!existsSync(BACKUP_DIR)) {
    console.log('❌ Backup-Verzeichnis existiert nicht')
    return []
  }

  const files = readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith(BACKUP_PREFIX))
    .map(f => ({
      name: f,
      path: join(BACKUP_DIR, f),
      time: statSync(join(BACKUP_DIR, f)).mtime
    }))
    .sort((a, b) => b.time.getTime() - a.time.getTime())

  return files
}

export function restoreDatabase(backupFileName?: string): boolean {
  try {
    const backups = listBackups()

    if (backups.length === 0) {
      console.log('❌ Keine Backups gefunden')
      return false
    }

    let backupToRestore

    if (backupFileName) {
      backupToRestore = backups.find(b => b.name === backupFileName)
      if (!backupToRestore) {
        console.log(`❌ Backup "${backupFileName}" nicht gefunden`)
        return false
      }
    } else {
      // Verwende das neueste Backup
      backupToRestore = backups[0]
    }

    console.log(`📦 Stelle wieder her: ${backupToRestore.name}`)
    console.log(`   Erstellt am: ${backupToRestore.time.toLocaleString('de-DE')}`)

    // Erstelle Backup der aktuellen DB vor Wiederherstellung
    if (existsSync(DB_PATH)) {
      const currentBackup = `${DB_PATH}.before-restore.${Date.now()}`
      copyFileSync(DB_PATH, currentBackup)
      console.log(`💾 Aktuelle DB gesichert als: ${currentBackup}`)
    }

    // Stelle wieder her
    copyFileSync(backupToRestore.path, DB_PATH)
    console.log(`✅ Datenbank wiederhergestellt!`)
    return true
  } catch (error) {
    console.error('❌ Fehler beim Wiederherstellen:', error)
    return false
  }
}

if (require.main === module) {
  const backupName = process.argv[2]
  restoreDatabase(backupName)
}







