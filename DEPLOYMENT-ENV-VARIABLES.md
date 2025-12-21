# Umgebungsvariablen in Vercel hinzufügen

## ✅ Schritt 1: Zu den Umgebungsvariablen gehen

1. Klicken Sie oben auf **"spitexsolutions"** (um zurück zum Projekt zu gelangen)
2. Oder gehen Sie zu: https://vercel.com/gregorgafner-dev/spitexsolutions/settings/environment-variables
3. Klicken Sie auf **Settings** → **Environment Variables**

## ✅ Schritt 2: Prüfen Sie vorhandene Variablen

Sie sollten bereits sehen:
- ✅ `DATABASE_URL` (automatisch von Neon hinzugefügt)

## ✅ Schritt 3: Fehlende Umgebungsvariablen hinzufügen

Klicken Sie auf **"Add New"** und fügen Sie diese beiden Variablen hinzu:

### Variable 1: NEXTAUTH_URL
- **Key:** `NEXTAUTH_URL`
- **Value:** `https://spitexsolutions.vercel.app`
- **Environments:** ✅ Production, ✅ Preview, ✅ Development
- Klicken Sie auf **"Save"**

### Variable 2: NEXTAUTH_SECRET
- **Key:** `NEXTAUTH_SECRET`
- **Value:** `hb0JlH6UCZxcFJTsczSx6XfphcLuIiwPYMX2GFR0cGA=`
- **Environments:** ✅ Production, ✅ Preview, ✅ Development
- Klicken Sie auf **"Save"**

## ✅ Schritt 4: Prüfen

Am Ende sollten Sie 3 Umgebungsvariablen haben:
1. `DATABASE_URL`
2. `NEXTAUTH_URL`
3. `NEXTAUTH_SECRET`

## ✅ Schritt 5: Code pushen

Nachdem alle Variablen gesetzt sind, können wir den Code committen und pushen!










