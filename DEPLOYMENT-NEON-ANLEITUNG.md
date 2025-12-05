# Neon PostgreSQL Setup für Vercel

## Schritt 1: Neon auswählen

Im Vercel Storage-Modal:
1. Klicken Sie auf **Neon** (grünes "N" Logo - "Serverless Postgres")
2. Folgen Sie den Anweisungen

## Schritt 2: Neon-Account erstellen (falls nötig)

- Sie werden zu Neon weitergeleitet
- Erstellen Sie einen kostenlosen Account (mit GitHub)
- Vercel verbindet sich automatisch mit Neon

## Schritt 3: Datenbank erstellen

- **Name:** `domus-azd` oder `spitexsolutions`
- **Region:** Wählen Sie eine Region nahe Frankfurt (z.B. `eu-central-1` oder `eu-west-1`)
- **Plan:** Free tier ist ausreichend für den Start

## Schritt 4: Datenbank-URL kopieren

Nach der Erstellung erhalten Sie eine Verbindungs-URL, die automatisch als Umgebungsvariable in Vercel hinzugefügt wird.

Die URL sieht so aus:
```
postgresql://user:password@host.neon.tech/dbname?sslmode=require
```

## Schritt 5: In Vercel prüfen

Gehen Sie zurück zu Vercel → Settings → Environment Variables

Sie sollten sehen:
- `DATABASE_URL` (automatisch hinzugefügt)

Falls nicht:
1. Kopieren Sie die Verbindungs-URL aus Neon
2. Fügen Sie sie manuell als `DATABASE_URL` hinzu





