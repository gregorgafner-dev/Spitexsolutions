# Deployment-Anleitung: Domus AZD auf Metanet.ch Server

Diese Anleitung erklärt Schritt für Schritt, wie Sie die Domus AZD Applikation auf Ihrem Metanet.ch Server deployen.

## 📋 Voraussetzungen

- SSH-Zugang zu Ihrem Metanet-Server
- Node.js 18+ auf dem Server
- PostgreSQL-Datenbank (auf dem Server oder extern)
- Domain (optional, aber empfohlen)

---

## 🚀 Schritt-für-Schritt Anleitung

### Schritt 1: Server-Zugang prüfen

1. **SSH-Verbindung zum Server:**
   ```bash
   ssh benutzer@ihr-server.metanet.ch
   ```
   (Ersetzen Sie `benutzer` und `ihr-server.metanet.ch` mit Ihren Metanet-Zugangsdaten)

2. **Node.js Version prüfen:**
   ```bash
   node --version
   ```
   Sollte 18.x oder höher sein. Falls nicht, installieren Sie Node.js (siehe unten).

### Schritt 2: Node.js installieren (falls nötig)

Falls Node.js nicht installiert ist oder die Version zu alt ist:

```bash
# Für Debian/Ubuntu-basierte Systeme:
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Für andere Systeme, nutzen Sie nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
```

### Schritt 3: PostgreSQL-Datenbank einrichten

**Option A: PostgreSQL auf dem Metanet-Server installieren**

```bash
# PostgreSQL installieren
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib

# PostgreSQL starten
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**Option B: Externe PostgreSQL-Datenbank nutzen**

- Nutzen Sie eine externe Datenbank (z.B. von Metanet, wenn verfügbar)
- Oder nutzen Sie einen kostenlosen Service wie Supabase, Railway, oder Neon

### Schritt 4: Datenbank erstellen

```bash
# Als PostgreSQL-Administrator einloggen
sudo -u postgres psql
```

Dann in PostgreSQL:

```sql
CREATE DATABASE domus_azd;
CREATE USER domus_user WITH PASSWORD 'IHR-SICHERES-PASSWORT-HIER';
GRANT ALL PRIVILEGES ON DATABASE domus_azd TO domus_user;
\q
```

**WICHTIG:** Notieren Sie sich das Passwort - Sie benötigen es für die `DATABASE_URL`.

### Schritt 5: Projekt auf den Server klonen

```bash
# In ein geeignetes Verzeichnis wechseln (z.B. /var/www oder ~/apps)
cd /var/www  # oder ein anderer Ordner Ihrer Wahl
git clone https://github.com/gregorgafner-dev/Spitexsolutions.git
cd Spitexsolutions
```

### Schritt 6: Dependencies installieren

```bash
npm install
```

### Schritt 7: Umgebungsvariablen setzen

Erstellen Sie eine `.env` Datei:

```bash
nano .env
```

Fügen Sie folgende Variablen hinzu:

```env
# Datenbank-Verbindung
# Wenn PostgreSQL auf dem Server läuft:
DATABASE_URL="postgresql://domus_user:IHR-PASSWORT@localhost:5432/domus_azd"

# Oder wenn externe Datenbank:
# DATABASE_URL="postgresql://user:password@host:5432/database"

# NextAuth Konfiguration
NEXTAUTH_URL="https://ihre-domain.metanet.ch"
# Oder für lokale Tests:
# NEXTAUTH_URL="http://localhost:3000"

# NextAuth Secret - Generieren Sie einen zufälligen String
NEXTAUTH_SECRET="IHR-SICHERER-SECRET-KEY-HIER"
```

**NEXTAUTH_SECRET generieren:**
```bash
openssl rand -base64 32
```

Speichern Sie mit `Ctrl+X`, dann `Y`, dann `Enter`.

### Schritt 8: Prisma Client generieren und Datenbank initialisieren

```bash
# Prisma Client generieren
npx prisma generate

# Datenbank-Schema erstellen
npx prisma db push

# Seed-Daten erstellen (Admin-Account)
npm run db:seed
```

### Schritt 9: App bauen

```bash
npm run build
```

### Schritt 10: App starten

**Option A: Mit PM2 (Empfohlen für Production)**

```bash
# PM2 installieren
sudo npm install -g pm2

# App starten
pm2 start npm --name "domus-azd" -- start

# App beim Neustart automatisch starten
pm2 startup
pm2 save

# Status prüfen
pm2 status
pm2 logs domus-azd
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
sudo systemctl status domus-azd
```

### Schritt 11: Reverse Proxy einrichten (Nginx)

Falls Sie Nginx verwenden:

```bash
# Nginx installieren (falls nicht vorhanden)
sudo apt-get install nginx
```

Erstellen Sie `/etc/nginx/sites-available/domus-azd`:

```nginx
server {
    listen 80;
    server_name ihre-domain.metanet.ch;

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

### Schritt 12: SSL-Zertifikat (Let's Encrypt)

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d ihre-domain.metanet.ch
```

---

## 🔄 Updates deployen

Nach Code-Änderungen:

```bash
cd /var/www/Spitexsolutions
git pull
npm install
npm run build
pm2 restart domus-azd  # oder systemctl restart domus-azd
```

---

## ⚠️ Wichtige Hinweise

1. **Firewall:** Stellen Sie sicher, dass Port 3000 (oder der Port Ihrer Wahl) nicht öffentlich zugänglich ist. Nutzen Sie Nginx als Reverse Proxy.

2. **Backups:** Richten Sie regelmäßige Backups ein:
   ```bash
   # PostgreSQL Backup
   pg_dump -U domus_user domus_azd > backup_$(date +%Y%m%d).sql
   ```

3. **Monitoring:** Überwachen Sie die App-Logs:
   ```bash
   pm2 logs domus-azd
   # oder
   journalctl -u domus-azd -f
   ```

4. **Umgebungsvariablen:** Niemals `.env` Dateien committen!

---

## 🆘 Troubleshooting

### App startet nicht
- Prüfen Sie die Logs: `pm2 logs` oder `journalctl -u domus-azd`
- Prüfen Sie, ob Port 3000 frei ist: `netstat -tulpn | grep 3000`
- Prüfen Sie die Umgebungsvariablen

### Datenbank-Verbindungsfehler
- Prüfen Sie die `DATABASE_URL` in der `.env` Datei
- Stellen Sie sicher, dass PostgreSQL läuft: `sudo systemctl status postgresql`
- Prüfen Sie Firewall-Einstellungen

### Build-Fehler
- Prüfen Sie die Node.js Version: `node --version`
- Stellen Sie sicher, dass alle Dependencies installiert sind: `npm install`
- Prüfen Sie die Logs

---

## 📞 Support

Bei Problemen:
1. Prüfen Sie die Logs
2. Prüfen Sie die Umgebungsvariablen
3. Stellen Sie sicher, dass alle Schritte befolgt wurden




