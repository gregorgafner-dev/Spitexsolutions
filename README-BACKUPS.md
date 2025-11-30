# Datenbank-Backup-System

## Automatische Backups

Das System erstellt automatisch Backups vor jeder Schema-Änderung.

## Verfügbare Befehle

### Backup erstellen
```bash
npm run db:backup
```

### Schema aktualisieren (mit automatischem Backup)
```bash
npm run db:push
```

### Schema mit Reset aktualisieren (mit automatischem Backup)
```bash
npm run db:push:force
```
⚠️ **WARNUNG:** Dies löscht ALLE Daten! Ein Backup wird automatisch erstellt.

### Backup wiederherstellen
```bash
npm run db:restore
```

Oder ein spezifisches Backup wiederherstellen:
```bash
npm run db:restore dev.db.backup.2025-11-21T12-00-00.db
```

## Backup-Verzeichnis

Backups werden im Verzeichnis `backups/` gespeichert.

- Die letzten 10 Backups werden automatisch behalten
- Ältere Backups werden automatisch gelöscht

## Wiederherstellung

1. Liste aller Backups anzeigen:
   ```bash
   ls -lh backups/
   ```

2. Backup wiederherstellen:
   ```bash
   npm run db:restore
   ```

3. Nach Wiederherstellung Prisma Client neu generieren:
   ```bash
   npm run db:generate
   ```

## Sicherheitshinweise

- ⚠️ **NIEMALS** `prisma db push --force-reset` direkt verwenden!
- ⚠️ **IMMER** `npm run db:push:force` verwenden (erstellt automatisch Backup)
- ⚠️ Vor wichtigen Änderungen manuell ein Backup erstellen: `npm run db:backup`







