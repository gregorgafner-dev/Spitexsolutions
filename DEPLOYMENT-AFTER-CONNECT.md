# Nach dem "Connect" - Was jetzt?

## ✅ Schritt 1: Nach "Connect" klicken

Das Modal sollte verschwinden und die Datenbank ist jetzt verbunden.

## ✅ Schritt 2: Umgebungsvariablen prüfen

Gehen Sie zu:
**Vercel → Projekt "spitexsolutions" → Settings → Environment Variables**

Sie sollten jetzt sehen:
- `DATABASE_URL` (oder `STORAGE_DATABASE_URL` wenn Custom Prefix verwendet wurde)

## ✅ Schritt 3: Fehlende Umgebungsvariablen hinzufügen

Fügen Sie diese hinzu (falls noch nicht vorhanden):

### NEXTAUTH_URL
- **Name:** `NEXTAUTH_URL`
- **Value:** `https://spitexsolutions.vercel.app`
- **Environment:** Production, Preview, Development

### NEXTAUTH_SECRET  
- **Name:** `NEXTAUTH_SECRET`
- **Value:** `hb0JlH6UCZxcFJTsczSx6XfphcLuIiwPYMX2GFR0cGA=`
- **Environment:** Production, Preview, Development

**WICHTIG:** Falls die DATABASE_URL einen Prefix hat (z.B. `STORAGE_DATABASE_URL`), müssen Sie eine neue Variable `DATABASE_URL` erstellen und den Wert kopieren!

## ✅ Schritt 4: Code pushen

Nachdem alle Umgebungsvariablen gesetzt sind, committen und pushen Sie den Code.

