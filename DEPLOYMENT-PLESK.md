# Deployment-Anleitung: Domus AZD auf Plesk (Metanet)

Diese Anleitung erklärt, wie Sie die Domus AZD Applikation auf Ihrem Plesk-Server bei Metanet deployen.

## 📋 Server-Informationen

- **Domain:** spitexsolutions.ch
- **IP-Adresse:** 80.74.156.75
- **Systembenutzer:** watchoutch
- **Control Panel:** Plesk

---

## 🚀 Schritt-für-Schritt Anleitung

### Schritt 1: SSH-Zugang aktivieren (falls noch nicht aktiviert)

1. Im Plesk Control Panel → "Websites & Domains" → "spitexsolutions.ch"
2. Klicken Sie auf "Hosting-Einstellungen" oder "Hosting"
3. Aktivieren Sie "SSH-Zugang" (falls verfügbar)
4. Notieren Sie sich die SSH-Zugangsdaten

### Schritt 2: PostgreSQL-Datenbank erstellen

1. Im Plesk Control Panel → "Websites & Domains" → "spitexsolutions.ch"
2. Klicken Sie auf "Datenbanken" (Databases)
3. Klicken Sie auf "Datenbank hinzufügen" (Add Database)
4. Wählen Sie "PostgreSQL" (falls verfügbar) oder "MySQL" (falls PostgreSQL nicht verfügbar)
5. Erstellen Sie:
   - **Datenbankname:** z.B. `domus_azd`
   - **Datenbankbenutzer:** z.B. `domus_user`
   - **Passwort:** Notieren Sie sich das Passwort!
6. Klicken Sie auf "OK"

**WICHTIG:** Notieren Sie sich:
- Datenbankname
- Datenbankbenutzer
- Passwort
- Host (meist `localhost`)

### Schritt 3: Node.js prüfen/installieren

**Option A: Über Plesk (falls verfügbar)**

1. Im Plesk Control Panel → "Websites & Domains" → "spitexsolutions.ch"
2. Suchen Sie nach "Node.js" oder "Anwendungen" (Applications)
3. Falls Node.js verfügbar ist, aktivieren Sie es und wählen Sie Version 18 oder höher

**Option B: Über SSH**

1. Verbinden Sie sich per SSH:
   ```bash
   ssh watchoutch@80.74.156.75
   # oder
   ssh watchoutch@spitexsolutions.ch
   ```

2. Prüfen Sie Node.js:
   ```bash
   node --version
   ```

3. Falls nicht installiert, installieren Sie Node.js:
   ```bash
   # Mit nvm (empfohlen):
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   source ~/.bashrc
   nvm install 18
   nvm use 18
   ```

### Schritt 4: Projekt auf den Server hochladen

**Option A: Über Git (empfohlen)**

1. SSH-Verbindung zum Server:
   ```bash
   ssh watchoutch@80.74.156.75
   ```

2. In das Web-Verzeichnis wechseln:
   ```bash
   cd ~/spitexsolutions.ch  # oder das entsprechende Verzeichnis
   # Oder falls nicht vorhanden:
   cd ~/httpdocs
   # Oder prüfen Sie in Plesk unter "Hosting-Einstellungen" → "Dokumentenverzeichnis"
   ```

3. Projekt klonen:
   ```bash
   git clone https://github.com/gregorgafner-dev/Spitexsolutions.git
   cd Spitexsolutions
   ```

**Option B: Über Plesk File Manager**

1. Im Plesk Control Panel → "Dateien" (Files)
2. Navigieren Sie zum Web-Verzeichnis (meist `httpdocs` oder `spitexsolutions.ch`)
3. Laden Sie die Projektdateien hoch (oder nutzen Sie Git)

### Schritt 5: Dependencies installieren

```bash
cd ~/spitexsolutions.ch/Spitexsolutions  # oder Ihr Pfad
npm install
```

### Schritt 6: Umgebungsvariablen setzen

Erstellen Sie eine `.env` Datei:

```bash
nano .env
```

Fügen Sie hinzu:

```env
# Datenbank-Verbindung (aus Schritt 2)
DATABASE_URL="postgresql://domus_user:IHR-PASSWORT@localhost:5432/domus_azd"
# Oder falls MySQL:
# DATABASE_URL="mysql://domus_user:IHR-PASSWORT@localhost:3306/domus_azd"

# NextAuth Konfiguration
NEXTAUTH_URL="https://spitexsolutions.ch"

# NextAuth Secret
NEXTAUTH_SECRET="IHR-SICHERER-SECRET-KEY"
```

**NEXTAUTH_SECRET generieren:**
```bash
openssl rand -base64 32
```

Speichern Sie mit `Ctrl+X`, dann `Y`, dann `Enter`.

### Schritt 7: Prisma Client generieren und Datenbank initialisieren

```bash
# Prisma Client generieren
npx prisma generate

# Datenbank-Schema erstellen
npx prisma db push

# Seed-Daten erstellen (Admin-Account)
npm run db:seed
```

### Schritt 8: App bauen

```bash
npm run build
```

### Schritt 9: App starten

**Option A: Mit PM2 (Empfohlen)**

```bash
# PM2 installieren
npm install -g pm2

# App starten
pm2 start npm --name "domus-azd" -- start

# App beim Neustart automatisch starten
pm2 startup
pm2 save
```

**Option B: Über Plesk Node.js (falls verfügbar)**

1. Im Plesk Control Panel → "Anwendungen" (Applications)
2. Aktivieren Sie Node.js für die Domain
3. Geben Sie den Start-Befehl an: `npm start`
4. Geben Sie das Arbeitsverzeichnis an: `/path/to/Spitexsolutions`

### Schritt 10: Reverse Proxy einrichten

Falls die App auf Port 3000 läuft, müssen Sie einen Reverse Proxy einrichten:

1. Im Plesk Control Panel → "Websites & Domains" → "spitexsolutions.ch"
2. Klicken Sie auf "Apache & nginx Einstellungen"
3. Fügen Sie in den "Zusätzliche nginx-Direktiven" hinzu:

```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

4. Klicken Sie auf "OK"

### Schritt 11: SSL-Zertifikat (falls noch nicht vorhanden)

1. Im Plesk Control Panel → "Websites & Domains" → "spitexsolutions.ch"
2. Klicken Sie auf "SSL/TLS-Zertifikate"
3. Aktivieren Sie "Let's Encrypt" (kostenlos)
4. Wählen Sie "spitexsolutions.ch" und "www.spitexsolutions.ch"
5. Klicken Sie auf "Installieren"

---

## 🔄 Updates deployen

Nach Code-Änderungen:

```bash
cd ~/spitexsolutions.ch/Spitexsolutions
git pull
npm install
npm run build
pm2 restart domus-azd
```

---

## ⚠️ Wichtige Hinweise

1. **Port 3000:** Stellen Sie sicher, dass Port 3000 nicht öffentlich zugänglich ist. Nutzen Sie den Reverse Proxy.

2. **Backups:** Richten Sie regelmäßige Backups ein:
   - Im Plesk Control Panel → "Backup Manager"
   - Oder manuell: `pg_dump -U domus_user domus_azd > backup.sql`

3. **Monitoring:** Überwachen Sie die App-Logs:
   ```bash
   pm2 logs domus-azd
   ```

4. **Firewall:** Prüfen Sie in Plesk die Firewall-Einstellungen

---

## 🆘 Troubleshooting

### App startet nicht
- Prüfen Sie die Logs: `pm2 logs domus-azd`
- Prüfen Sie die Umgebungsvariablen
- Prüfen Sie, ob Port 3000 frei ist

### Datenbank-Verbindungsfehler
- Prüfen Sie die `DATABASE_URL` in der `.env` Datei
- Prüfen Sie, ob die Datenbank in Plesk läuft
- Prüfen Sie Benutzername und Passwort

### Build-Fehler
- Prüfen Sie die Node.js Version: `node --version`
- Stellen Sie sicher, dass alle Dependencies installiert sind

---

## 📞 Nächste Schritte

Nach erfolgreichem Deployment können Sie sich anmelden mit:
- Email: `admin@example.com`
- Passwort: `admin123`

**WICHTIG:** Ändern Sie das Passwort nach dem ersten Login!




