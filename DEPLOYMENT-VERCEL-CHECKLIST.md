# Vercel Deployment Checkliste

## ✅ Schritt 1: PostgreSQL-Datenbank einrichten

1. Im Vercel-Dashboard → **Storage** (linkes Menü)
2. Klicken Sie auf **"Create Database"**
3. Wählen Sie **"Postgres"**
4. Name: `domus-azd-db` (oder ein anderer Name)
5. Region: **Frankfurt (fra1)** (empfohlen)
6. Klicken Sie auf **"Create"**

Nach der Erstellung wird die `DATABASE_URL` automatisch als Umgebungsvariable hinzugefügt.

## ✅ Schritt 2: Umgebungsvariablen konfigurieren

Im Projekt "spitexsolutions" → **Settings** → **Environment Variables**

Fügen Sie folgende Variablen hinzu:

### 1. DATABASE_URL (automatisch)
Die Datenbank erstellt automatisch `POSTGRES_PRISMA_URL`. 
- **Name:** `DATABASE_URL`
- **Value:** Kopieren Sie den Wert aus `POSTGRES_PRISMA_URL`
- **Environment:** Production, Preview, Development

### 2. NEXTAUTH_URL
- **Name:** `NEXTAUTH_URL`
- **Value:** `https://spitexsolutions.vercel.app`
- **Environment:** Production, Preview, Development

### 3. NEXTAUTH_SECRET
- **Name:** `NEXTAUTH_SECRET`
- **Value:** (wird generiert - siehe Terminal-Ausgabe)
- **Environment:** Production, Preview, Development

## ✅ Schritt 3: Code committen und pushen

```bash
git add prisma/schema.prisma
git commit -m "Switch to PostgreSQL for production"
git push
```

## ✅ Schritt 4: Deployment

Das Deployment läuft automatisch nach dem Push. Sie können es im Vercel-Dashboard unter **Deployments** überwachen.

## ✅ Schritt 5: Datenbank initialisieren (nach dem ersten Deployment)

1. Im Vercel-Dashboard → Projekt "spitexsolutions"
2. Gehen Sie zu **Deployments**
3. Klicken Sie auf den neuesten Deployment
4. Klicken Sie auf **"Functions"** Tab oder nutzen Sie die Vercel CLI

**Option A: Mit Vercel CLI (empfohlen)**
```bash
# Installieren Sie Vercel CLI (falls noch nicht vorhanden)
npm i -g vercel

# Login
vercel login

# Link zum Projekt (im Projekt-Verzeichnis)
vercel link

# Datenbank initialisieren
vercel env pull .env.local
npx prisma db push
npx prisma db seed
```

**Option B: Über Vercel Dashboard (Build Command erweitern)**
Fügen Sie ein Post-Deployment Script hinzu, das automatisch läuft.

## ✅ Schritt 6: Domain verbinden (Optional)

1. Im Vercel-Dashboard → **Settings** → **Domains**
2. Klicken Sie auf **"Add"**
3. Geben Sie Ihre Domain ein (z.B. `spitexsolutions.ch`)
4. Folgen Sie den DNS-Anweisungen

---

## 🔧 Troubleshooting

### Build-Fehler
- Prüfen Sie die Build-Logs im Vercel-Dashboard
- Stellen Sie sicher, dass alle Umgebungsvariablen gesetzt sind
- Prüfen Sie, ob `prisma generate` im Build-Prozess läuft

### Datenbank-Verbindungsfehler
- Prüfen Sie die `DATABASE_URL` Umgebungsvariable
- Stellen Sie sicher, dass die PostgreSQL-Datenbank läuft
- Prüfen Sie die Firewall-Einstellungen

### Migration-Probleme
- Nutzen Sie `prisma db push` für Development
- Für Production sollten Sie Prisma Migrate verwenden (für zukünftige Updates)





