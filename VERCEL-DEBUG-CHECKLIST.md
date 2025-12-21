# Vercel Deployment Debugging Checklist

## Probleme: Login funktioniert nicht (weder Admin noch Mitarbeiter)

### 1. Umgebungsvariablen prüfen
Gehe zu Vercel Dashboard → Projekt → Settings → Environment Variables

**Notwendige Variablen:**
- ✅ `DATABASE_URL` - PostgreSQL Connection String (von Neon)
- ✅ `NEXTAUTH_URL` - Deine Vercel URL (z.B. `https://spitexsolutions.vercel.app`)
- ✅ `NEXTAUTH_SECRET` - Ein zufälliger Secret (z.B. generiert mit `openssl rand -base64 32`)

### 2. Prisma Client Generation prüfen
Prisma Client muss während des Builds generiert werden.

**Prüfen in Vercel Build Logs:**
- Öffne Vercel Dashboard → Projekt → Deployments → Neuestes Deployment → Build Logs
- Suche nach: `prisma generate`
- Es sollte eine Zeile wie diese erscheinen: `✔ Generated Prisma Client`

### 3. Datenbankverbindung testen
Besuche: `https://spitexsolutions.vercel.app/test-db`

Diese Seite zeigt:
- Ob Umgebungsvariablen gesetzt sind
- Ob die Datenbankverbindung funktioniert
- Wie viele User in der Datenbank sind

### 4. Build-Logs analysieren
In Vercel Build Logs nach Fehlern suchen:
- `Prisma Client could not be found`
- `Can't reach database server`
- `Invalid DATABASE_URL`

### 5. Mögliche Lösungen

#### Lösung 1: Prisma Client nicht generiert
Falls `prisma generate` nicht läuft:
- `postinstall` Script ist in `package.json` vorhanden
- `build` Script enthält `prisma generate && next build`
- `vercel.json` Build-Command enthält `prisma generate`

#### Lösung 2: DATABASE_URL falsch
- Prüfe, ob die DATABASE_URL mit `postgresql://` beginnt
- Prüfe, ob die Neon-Datenbank läuft
- Teste die Verbindung lokal mit: `npx prisma db pull`

#### Lösung 3: NEXTAUTH_SECRET fehlt
- Generiere einen neuen Secret: `openssl rand -base64 32`
- Füge ihn zu Vercel Environment Variables hinzu
- Stelle sicher, dass er für alle Environments gesetzt ist (Production, Preview, Development)

#### Lösung 4: NEXTAUTH_URL falsch
- Sollte genau die Vercel-URL sein: `https://spitexsolutions.vercel.app`
- OHNE trailing slash
- OHNE `/admin` oder andere Pfade

### 6. Manuelle Tests

1. **Test-DB-Seite besuchen:**
   ```
   https://spitexsolutions.vercel.app/test-db
   ```
   Sollte alle Checks grün zeigen.

2. **Browser Console prüfen:**
   - Öffne DevTools (F12)
   - Gehe zu Console
   - Versuche Login
   - Kopiere alle Fehler-Meldungen

3. **Vercel Function Logs prüfen:**
   - Vercel Dashboard → Projekt → Logs
   - Filtere nach `/api/auth/[...nextauth]`
   - Prüfe die Logs beim Login-Versuch

### 7. Häufige Fehler

#### "Prisma Client could not be found"
**Lösung:** Füge zu `package.json` hinzu:
```json
{
  "scripts": {
    "postinstall": "prisma generate"
  }
}
```

#### "Can't reach database server"
**Lösung:** 
- Prüfe DATABASE_URL
- Prüfe Neon-Datenbank Status
- Prüfe Firewall-Regeln in Neon

#### "Invalid credentials" obwohl User existiert
**Lösung:**
- Prüfe, ob User in Production-DB existiert
- Prüfe Passwort-Hash (sollte bcrypt sein)
- Prüfe NEXTAUTH_SECRET

### 8. Notfall: Neues Deployment erzwingen
Falls nichts funktioniert:
1. Mache eine kleine Änderung (z.B. Leerzeichen in README.md)
2. Committe und pushe
3. Vercel baut automatisch neu

### 9. Support-Informationen sammeln
Falls weiterhin Probleme:
1. Vercel Build Logs exportieren
2. Browser Console Logs kopieren
3. Screenshot der `/test-db` Seite
4. Screenshot der Vercel Environment Variables (ohne Werte!)










