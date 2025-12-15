# ✅ Umgebungsvariablen prüfen - Checkliste

## PRÜFUNG 1: DATABASE_URL muss PostgreSQL sein

1. Gehen Sie zu: Settings → Environment Variables
2. Finden Sie: `DATABASE_URL`
3. Klicken Sie auf das 👁️ Auge-Icon
4. **Prüfen Sie:** Beginnt der Wert mit `postgresql://...`?
   - ✅ **Richtig:** `postgresql://user:password@host.neon.tech/dbname?sslmode=require`
   - ❌ **Falsch:** `file:./dev.db` (SQLite - das wäre falsch!)

## PRÜFUNG 2: Alle Environments müssen gesetzt sein

Für jede Variable (`DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`):

1. Klicken Sie auf die Variable (oder das Bearbeiten-Icon)
2. **Prüfen Sie:** Ist "All Environments" ausgewählt?
   - Oder sind Production, Preview UND Development alle aktiviert?
3. Falls nicht: Klicken Sie auf "Edit" und aktivieren Sie alle drei!

## PRÜFUNG 3: Werte prüfen

### DATABASE_URL
- Muss mit `postgresql://` beginnen
- Sollte von Neon sein (enthält `.neon.tech` oder ähnlich)

### NEXTAUTH_URL
- Sollte sein: `https://spitexsolutions.vercel.app`
- Oder: `https://spitexsolutions-*.vercel.app` (mit Branch-Name)

### NEXTAUTH_SECRET
- Sollte ein langer String sein (z.B. `hb0JlH6UCZxcFJTsczSx6XfphcLuIiwPYMX2GFR0cGA=`)

## Wenn etwas falsch ist:

1. Klicken Sie auf die Variable
2. Klicken Sie auf "Edit" (oder das Stift-Icon)
3. Korrigieren Sie den Wert
4. Aktivieren Sie alle Environments
5. Speichern Sie








