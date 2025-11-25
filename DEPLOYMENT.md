# Deployment-Anleitung: Domus AZD

Diese Anleitung erklärt Schritt für Schritt, wie Sie die Domus AZD Applikation auf einen externen Server deployen.

## 📋 Übersicht

Es gibt zwei Hauptoptionen für das Deployment:

1. **Vercel** (Empfohlen - Einfachste Option für Next.js)
2. **Eigener Server** (VPS, Cloud-Server, etc.)

---

## 🚀 Option 1: Deployment auf Vercel (Empfohlen)

Vercel ist speziell für Next.js optimiert und bietet die einfachste Deployment-Lösung.

### Schritt 1: Vercel-Account erstellen

1. Gehen Sie zu [https://vercel.com](https://vercel.com)
2. Klicken Sie auf "Sign Up"
3. Melden Sie sich mit Ihrem GitHub-Account an (empfohlen)

### Schritt 2: Projekt importieren

1. Nach dem Login klicken Sie auf "Add New Project"
2. Wählen Sie Ihr Repository: `gregorgafner-dev/Spitexsolutions`
3. Klicken Sie auf "Import"

### Schritt 3: Umgebungsvariablen konfigurieren

**WICHTIG:** Bevor Sie deployen, müssen Sie die Umgebungsvariablen setzen:

1. Im Vercel-Dashboard, bei "Environment Variables", fügen Sie hinzu:

   ```
   DATABASE_URL=postgresql://user:password@host:5432/database
   NEXTAUTH_URL=https://ihre-domain.vercel.app
   NEXTAUTH_SECRET=ein-sehr-langer-zufaelliger-string-hier
   ```

   **Erklärung:**
   - `DATABASE_URL`: Sie benötigen eine PostgreSQL-Datenbank (siehe Schritt 4)
   - `NEXTAUTH_URL`: Ihre Vercel-URL (wird automatisch generiert)
   - `NEXTAUTH_SECRET`: Generieren Sie einen zufälligen String (siehe unten)

2. **NEXTAUTH_SECRET generieren:**
   ```bash
   openssl rand -base64 32
   ```
   Oder verwenden Sie einen Online-Generator: [https://generate-secret.vercel.app/32](https://generate-secret.vercel.app/32)

### Schritt 4: Datenbank einrichten

SQLite funktioniert nicht auf Vercel. Sie benötigen eine PostgreSQL-Datenbank:

**Option A: Vercel Postgres (Empfohlen)**
1. Im Vercel-Dashboard → "Storage" → "Create Database"
2. Wählen Sie "Postgres"
3. Erstellen Sie die Datenbank
4. Die `DATABASE_URL` wird automatisch als Umgebungsvariable gesetzt

**Option B: Externe Datenbank (z.B. Supabase, Railway, Neon)**
1. Erstellen Sie einen Account bei einem der Services:
   - [Supabase](https://supabase.com) (kostenlos)
   - [Railway](https://railway.app) (kostenlos)
   - [Neon](https://neon.tech) (kostenlos)
2. Erstellen Sie eine neue PostgreSQL-Datenbank
3. Kopieren Sie die Verbindungs-URL
4. Fügen Sie sie als `DATABASE_URL` in Vercel ein

### Schritt 5: Prisma Schema für PostgreSQL anpassen

**WICHTIG:** Das Prisma Schema muss von SQLite auf PostgreSQL umgestellt werden:

1. Öffnen Sie `prisma/schema.prisma`
2. Ändern Sie:
   ```prisma
   datasource db {
     provider = "sqlite"  // ALT
     url      = env("DATABASE_URL")
   }
   ```
   zu:
   ```prisma
   datasource db {
     provider = "postgresql"  // NEU
     url      = env("DATABASE_URL")
   }
   ```

3. Committen Sie die Änderung:
   ```bash
   git add prisma/schema.prisma
   git commit -m "Switch to PostgreSQL for production"
   git push
   ```

### Schritt 6: Build-Konfiguration

Vercel erkennt Next.js automatisch. Sie können optional eine `vercel.json` erstellen:

```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs"
}
```

### Schritt 7: Deployen

1. Klicken Sie auf "Deploy"
2. Warten Sie, bis der Build abgeschlossen ist (ca. 2-5 Minuten)
3. Nach erfolgreichem Deployment erhalten Sie eine URL wie: `https://spitexsolutions.vercel.app`

### Schritt 8: Datenbank initialisieren

Nach dem ersten Deployment müssen Sie die Datenbank initialisieren:

1. Öffnen Sie die Vercel-Konsole (Terminal im Dashboard)
2. Führen Sie aus:
   ```bash
   npx prisma generate
   npx prisma db push
   npm run db:seed
   ```

**Alternative:** Nutzen Sie Vercel's "Deploy Hooks" oder fügen Sie ein Build-Script hinzu.

### Schritt 9: Domain verbinden (Optional)

1. Im Vercel-Dashboard → "Settings" → "Domains"
2. Fügen Sie Ihre Domain hinzu
3. Folgen Sie den DNS-Anweisungen

---

## 🖥️ Option 2: Deployment auf eigenem Server

### Voraussetzungen

- Server mit Node.js 18+ installiert
- PostgreSQL-Datenbank
- Domain (optional, aber empfohlen)

### Schritt 1: Server vorbereiten

1. **SSH auf den Server:**
   ```bash
   ssh benutzer@ihr-server.de
   ```

2. **Node.js installieren (falls nicht vorhanden):**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **PostgreSQL installieren:**
   ```bash
   sudo apt-get update
   sudo apt-get install postgresql postgresql-contrib
   ```

### Schritt 2: Datenbank erstellen

```bash
sudo -u postgres psql
```

Dann in PostgreSQL:
```sql
CREATE DATABASE domus_azd;
CREATE USER domus_user WITH PASSWORD 'sicheres-passwort';
GRANT ALL PRIVILEGES ON DATABASE domus_azd TO domus_user;
\q
```

### Schritt 3: Projekt klonen

```bash
cd /var/www  # oder ein anderer Ordner Ihrer Wahl
git clone https://github.com/gregorgafner-dev/Spitexsolutions.git
cd Spitexsolutions
```

### Schritt 4: Prisma Schema anpassen

Wie in Option 1, Schritt 5 beschrieben, ändern Sie `prisma/schema.prisma` von SQLite zu PostgreSQL.

### Schritt 5: Umgebungsvariablen setzen

Erstellen Sie eine `.env` Datei:

```bash
nano .env
```

Fügen Sie hinzu:
```env
DATABASE_URL="postgresql://domus_user:sicheres-passwort@localhost:5432/domus_azd"
NEXTAUTH_URL="https://ihre-domain.com"
NEXTAUTH_SECRET="ein-sehr-langer-zufaelliger-string-hier"
```

Speichern Sie mit `Ctrl+X`, dann `Y`, dann `Enter`.

### Schritt 6: Dependencies installieren und Build

```bash
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run build
```

### Schritt 7: App starten

**Option A: Mit PM2 (Empfohlen für Production)**

```bash
# PM2 installieren
sudo npm install -g pm2

# App starten
pm2 start npm --name "domus-azd" -- start

# App beim Neustart automatisch starten
pm2 startup
pm2 save
```

**Option B: Mit systemd**

Erstellen Sie `/etc/systemd/system/domus-azd.service`:

```ini
[Unit]
Description=Domus AZD Next.js App
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/Spitexsolutions
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always

[Install]
WantedBy=multi-user.target
```

Dann:
```bash
sudo systemctl daemon-reload
sudo systemctl enable domus-azd
sudo systemctl start domus-azd
```

### Schritt 8: Reverse Proxy einrichten (Nginx)

Installieren Sie Nginx:
```bash
sudo apt-get install nginx
```

Erstellen Sie `/etc/nginx/sites-available/domus-azd`:

```nginx
server {
    listen 80;
    server_name ihre-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Aktivieren Sie die Site:
```bash
sudo ln -s /etc/nginx/sites-available/domus-azd /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Schritt 9: SSL-Zertifikat (Let's Encrypt)

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d ihre-domain.com
```

---

## 🔄 Nach dem Deployment: Updates deployen

### Mit Git (beide Optionen):

```bash
# Lokal auf Ihrem Computer:
git add .
git commit -m "Beschreibung der Änderungen"
git push

# Auf Vercel: Automatisch nach Push
# Auf eigenem Server:
ssh benutzer@ihr-server.de
cd /var/www/Spitexsolutions
git pull
npm install
npm run build
pm2 restart domus-azd  # oder systemctl restart domus-azd
```

---

## ⚠️ Wichtige Hinweise

1. **Datenbank-Migration:** Bei Schema-Änderungen:
   ```bash
   npx prisma db push
   ```

2. **Backups:** Richten Sie regelmäßige Backups ein:
   ```bash
   # PostgreSQL Backup
   pg_dump -U domus_user domus_azd > backup.sql
   ```

3. **Umgebungsvariablen:** Niemals `.env` Dateien committen!

4. **Monitoring:** Überwachen Sie die App-Logs:
   ```bash
   # PM2
   pm2 logs domus-azd
   
   # systemd
   journalctl -u domus-azd -f
   ```

---

## 🆘 Troubleshooting

### Build-Fehler
- Prüfen Sie die Logs in Vercel/Server
- Stellen Sie sicher, dass alle Dependencies installiert sind
- Prüfen Sie die Node.js Version (sollte 18+ sein)

### Datenbank-Verbindungsfehler
- Prüfen Sie die `DATABASE_URL`
- Stellen Sie sicher, dass PostgreSQL läuft
- Prüfen Sie Firewall-Einstellungen

### App startet nicht
- Prüfen Sie die Logs: `pm2 logs` oder `journalctl -u domus-azd`
- Prüfen Sie, ob Port 3000 frei ist
- Prüfen Sie die Umgebungsvariablen

---

## 📞 Support

Bei Problemen:
1. Prüfen Sie die Logs
2. Prüfen Sie die Umgebungsvariablen
3. Stellen Sie sicher, dass alle Schritte befolgt wurden

