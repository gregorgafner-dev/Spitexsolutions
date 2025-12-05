# Nächste Schritte nach Neon-Datenbank-Erstellung

## ✅ Schritt 1: Projekt verbinden

1. Klicken Sie auf **"Connect Project"** (oben rechts oder im Bereich "Connect to a project")
2. Wählen Sie das Projekt **"spitexsolutions"** aus
3. Klicken Sie auf "Connect"

Die `DATABASE_URL` wird automatisch als Umgebungsvariable hinzugefügt!

## ✅ Schritt 2: Umgebungsvariablen prüfen und hinzufügen

Gehen Sie zu Vercel → Projekt "spitexsolutions" → **Settings** → **Environment Variables**

Sie sollten bereits sehen:
- ✅ `DATABASE_URL` (automatisch von Neon hinzugefügt)

Fügen Sie jetzt hinzu:

### NEXTAUTH_URL
- **Name:** `NEXTAUTH_URL`
- **Value:** `https://spitexsolutions.vercel.app`
- **Environment:** Production, Preview, Development

### NEXTAUTH_SECRET
- **Name:** `NEXTAUTH_SECRET`
- **Value:** `hb0JlH6UCZxcFJTsczSx6XfphcLuIiwPYMX2GFR0cGA=`
- **Environment:** Production, Preview, Development

## ✅ Schritt 3: Code committen und pushen

Nachdem alle Umgebungsvariablen gesetzt sind:

```bash
git add prisma/schema.prisma
git commit -m "Switch to PostgreSQL for production deployment"
git push
```

Das Deployment startet automatisch!

## ✅ Schritt 4: Datenbank initialisieren (nach dem Deployment)

Nach dem ersten erfolgreichen Deployment müssen Sie die Datenbank initialisieren:

1. Öffnen Sie das Vercel-Dashboard → Projekt "spitexsolutions"
2. Gehen Sie zu **Deployments** → neuestes Deployment
3. Nutzen Sie die Vercel CLI oder fügen Sie ein Build-Script hinzu





