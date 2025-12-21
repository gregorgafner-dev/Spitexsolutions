# Troubleshooting: Connect Button funktioniert nicht

## Problem
Der "Connect" Button reagiert nicht beim Klicken.

## Lösung 1: Modal schließen und Umgebungsvariablen prüfen

1. Klicken Sie auf **"Cancel"** um das Modal zu schließen
2. Gehen Sie zu: **Vercel → Projekt "spitexsolutions" → Settings → Environment Variables**
3. Prüfen Sie, ob `DATABASE_URL` bereits vorhanden ist

## Lösung 2: Datenbank-URL manuell hinzufügen

Falls die DATABASE_URL nicht vorhanden ist:

1. Gehen Sie zur Neon-Datenbank "domus-azd"
2. Klicken Sie auf **"Quickstart"** Tab
3. Klicken Sie auf **"Show secret"** bei `.env.local`
4. Kopieren Sie die `DATABASE_URL` (beginnt mit `postgresql://...`)
5. Gehen Sie zu Vercel → Settings → Environment Variables
6. Fügen Sie manuell hinzu:
   - **Name:** `DATABASE_URL`
   - **Value:** (die kopierte URL)
   - **Environment:** Production, Preview, Development

## Lösung 3: Browser-Cache leeren

1. Drücken Sie `Ctrl+Shift+R` (Windows) oder `Cmd+Shift+R` (Mac) für Hard Reload
2. Oder: Browser-Cache leeren und Seite neu laden

## Lösung 4: In einem anderen Browser versuchen

Manchmal hilft es, in einem anderen Browser oder Inkognito-Modus zu testen.










