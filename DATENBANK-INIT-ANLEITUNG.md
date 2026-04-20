# Datenbank initialisieren - Einfache Anleitung

## Schritt 1: DATABASE_URL kopieren

1. Gehen Sie zu Vercel → Settings → Environment Variables
2. Klicken Sie bei `DATABASE_URL` auf das 👁️ Auge-Icon
3. Kopieren Sie den kompletten Wert

## Schritt 2: Lokale .env.local erstellen

Erstellen Sie eine Datei `.env.local` im Projekt-Verzeichnis mit:

```env
DATABASE_URL="[HIER DEN KOPIERTEN WERT EINFÜGEN]"
NEXTAUTH_URL="https://spitexsolutions.vercel.app"
NEXTAUTH_SECRET="hb0JlH6UCZxcFJTsczSx6XfphcLuIiwPYMX2GFR0cGA="
```

## Schritt 3: Datenbank initialisieren

Führen Sie aus:

```bash
# Prisma Client generieren
npx prisma generate

# Schema zur Datenbank pushen
npx prisma db push --schema prisma/schema.postgres.prisma

# Seed-Daten erstellen (Admin-Account)
npm run db:seed
```

## Fertig!

Danach können Sie sich anmelden mit:
- Email: `admin@example.com`
- Passwort: `admin123`










