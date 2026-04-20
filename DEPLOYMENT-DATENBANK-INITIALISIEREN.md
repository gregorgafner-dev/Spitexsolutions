# Datenbank initialisieren nach Deployment

## ✅ Deployment erfolgreich!

Die App läuft jetzt auf: `https://spitexsolutions.vercel.app`

## 🗄️ Datenbank initialisieren

Wir müssen jetzt:
1. Prisma Schema zur PostgreSQL-Datenbank pushen
2. Seed-Daten erstellen (Admin-Account)

## Option A: Mit Vercel CLI (empfohlen)

```bash
# Vercel CLI installieren (falls noch nicht vorhanden)
npm i -g vercel

# Login
vercel login

# Im Projekt-Verzeichnis: Umgebungsvariablen lokal laden
vercel env pull .env.local

# Datenbank initialisieren
npx prisma db push --schema prisma/schema.postgres.prisma
npx prisma db seed
```

## Option B: Über Vercel Dashboard Terminal

1. Gehen Sie zu: Deployments → Neuestes Deployment
2. Öffnen Sie die "Functions" oder "Logs"
3. Nutzen Sie die Vercel CLI über das Dashboard

## Option C: Build Command erweitern (automatisch)

Wir können das Schema-Push automatisch beim Build machen lassen.










