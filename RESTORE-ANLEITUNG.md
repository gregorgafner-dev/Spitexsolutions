# Anleitung: Mitarbeiter und Dienste aus Backup wiederherstellen

## Schritt 1: Production-DATABASE_URL aus Vercel holen

1. Gehe zu: https://vercel.com/gregorgafner-dev/spitexsolutions/settings/environment-variables
2. Klicke auf die `DATABASE_URL` Variable
3. Kopiere den Wert (beginnt mit `postgresql://...`)

## Schritt 2: DATABASE_URL setzen und Skript ausführen

**Option A: Als Umgebungsvariable (empfohlen)**

```bash
# Setze die Production-DATABASE_URL
export DATABASE_URL="postgresql://..."

# Führe das Restore-Skript aus
npm run db:restore-from-backup
```

**Option B: Direkt beim Aufruf**

```bash
DATABASE_URL="postgresql://..." npm run db:restore-from-backup
```

## Schritt 3: Prüfen

Nach der Wiederherstellung:
1. Gehe zu: https://spitexsolutions.vercel.app/test-db
2. Prüfe, ob die Mitarbeiter wiederhergestellt wurden
3. Gehe zu: https://spitexsolutions.vercel.app/admin/employees
4. Prüfe, ob die Mitarbeiter sichtbar sind

## Was wird wiederhergestellt?

- ✅ Alle Mitarbeiter (11 gefunden im Backup)
- ✅ Alle Dienste
- ✅ Soll-Stunden werden für jeden Mitarbeiter berechnet

## Wichtig

- Das Skript überspringt bereits vorhandene Mitarbeiter/Dienste
- Passwörter werden aus dem Backup übernommen (bereits gehasht)
- Die lokale .env-Datei wird NICHT verändert

