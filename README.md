# Domus AZD - Arbeitszeiterfassung & Dienstplanung

Eine vollständige Web-Anwendung für Arbeitszeiterfassung und Dienstplanung mit separaten Bereichen für Mitarbeiter und Administratoren.

## Features

### Mitarbeiter-Bereich
- ✅ Tägliche Arbeitszeiterfassung
- ✅ Automatische Saldo-Berechnung basierend auf Soll-Arbeitszeit (Kanton Zug)
- ✅ Pausenregel: Max. 6 Stunden am Stück, dann mindestens 45 Minuten Pause
- ✅ Monatssaldo-Anzeige mit Saldo-Vortrag
- ✅ Unterstützung für Monatslohn- und Stundenlohn-Angestellte

### Admin-Bereich
- ✅ Mitarbeiterverwaltung (CRUD)
- ✅ Verwaltung von Anstellungs-Pensum
- ✅ Dienstverwaltung (Bezeichnung, Dauer, Farbe)
- ✅ Monats-Dienstplanung mit Live-Berechnungen
- ✅ Anzeige der geplanten Stunden pro Mitarbeiter
- ✅ Live-Anzeige der Saldo-Auswirkung bei Planung

## Tech Stack

- **Next.js 14** (App Router) mit TypeScript
- **Prisma** (SQLite für Entwicklung)
- **NextAuth.js** für Authentifizierung
- **Tailwind CSS** + **shadcn/ui** für UI
- **date-fns** für Datumsberechnungen

## Installation

1. **Dependencies installieren:**
```bash
npm install
```

2. **Umgebungsvariablen einrichten:**
Erstellen Sie eine `.env` Datei:
```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here-change-in-production"
```

3. **Datenbank initialisieren:**
```bash
npm run db:generate
npm run db:push
```

4. **Seed-Daten erstellen (Admin-Account):**
```bash
npm run db:seed
```

Dies erstellt einen Admin-Account mit:
- Email: `admin@example.com`
- Passwort: `admin123`
- ⚠️ **Bitte ändern Sie das Passwort nach dem ersten Login!**

5. **Entwicklungsserver starten:**
```bash
npm run dev
```

Die App läuft dann auf [http://localhost:3000](http://localhost:3000)

## Erste Schritte

### Admin-Account

Nach dem Ausführen von `npm run db:seed` können Sie sich mit folgenden Daten anmelden:
- Email: `admin@example.com`
- Passwort: `admin123`

Alternativ können Sie auch Prisma Studio verwenden, um manuell einen Admin-Account zu erstellen:

```bash
npm run db:studio
```

### Mitarbeiter erstellen

1. Als Admin einloggen
2. Zu "Mitarbeiter verwalten" navigieren
3. Neuen Mitarbeiter anlegen mit:
   - Name, Email, Passwort
   - Anstellungstyp (Monatslohn/Stundenlohn)
   - Pensum (0.0 - 1.0)
   - Entsprechende Lohnangaben

### Dienste erstellen

1. Als Admin zu "Dienste verwalten" navigieren
2. Dienste mit Bezeichnung, Dauer (Minuten) und Farbe erstellen

### Dienstplanung

1. Als Admin zu "Dienstplanung" navigieren
2. Monat auswählen
3. Dienst aus der Dropdown-Liste wählen
4. Auf Zellen im Kalender klicken, um Dienste zu planen
5. Die geplanten Stunden und Saldo-Auswirkung werden live berechnet

## Soll-Arbeitszeit

Die App verwendet standardmäßig **42.5 Stunden pro Woche** als Soll-Arbeitszeit für den Kanton Zug, Schweiz. Diese wird automatisch mit dem Pensum des Mitarbeiters multipliziert.

Die effektive Soll-Arbeitszeit pro Monat wird basierend auf:
- Wochenstunden (42.5h)
- Pensum (z.B. 0.5 = 50%)
- Anzahl Tage im Monat

berechnet.

## Saldo-Berechnung

Der Monatssaldo wird wie folgt berechnet:
```
Saldo = (Tatsächlich gearbeitete Stunden - Soll-Stunden) + Vormonatssaldo
```

Bei der Dienstplanung wird der projizierte Saldo angezeigt:
```
Projizierter Saldo = (Tatsächliche Stunden + Geplante Stunden - Soll-Stunden) + Vormonatssaldo
```

## Pausenregel

- Arbeitszeit-Blöcke dürfen maximal 6 Stunden am Stück sein
- Nach 6 Stunden muss eine Pause von mindestens 45 Minuten eingetragen werden
- Die App warnt automatisch, wenn diese Regel verletzt wird

## Projektstruktur

```
domus-azd/
├── app/
│   ├── (auth)/
│   │   ├── login/              # Mitarbeiter Login
│   │   └── admin/login/         # Admin Login
│   ├── (dashboard)/
│   │   ├── admin/               # Admin-Bereich
│   │   │   ├── dashboard/       # Admin Dashboard
│   │   │   ├── employees/       # Mitarbeiterverwaltung
│   │   │   ├── services/        # Dienstverwaltung
│   │   │   └── schedule/        # Dienstplanung
│   │   └── employee/            # Mitarbeiter-Bereich
│   │       ├── dashboard/       # Mitarbeiter Dashboard
│   │       └── time-tracking/   # Arbeitszeiterfassung
│   └── api/                      # API Routes
├── components/
│   ├── ui/                      # UI-Komponenten (shadcn/ui)
│   └── admin/                   # Admin-spezifische Komponenten
├── lib/
│   ├── auth.ts                  # NextAuth Konfiguration
│   ├── db.ts                    # Prisma Client
│   ├── calculations.ts          # Berechnungslogik
│   └── get-session.ts           # Session Helper
├── prisma/
│   └── schema.prisma            # Datenbank-Schema
└── types/
    └── next-auth.d.ts           # TypeScript Types für NextAuth
```

## Scripts

- `npm run dev` - Startet den Entwicklungsserver
- `npm run build` - Erstellt Production Build
- `npm run start` - Startet Production Server
- `npm run db:generate` - Generiert Prisma Client
- `npm run db:push` - Synchronisiert Schema mit Datenbank
- `npm run db:seed` - Erstellt Seed-Daten (Admin-Account)
- `npm run db:studio` - Öffnet Prisma Studio

## Lizenz

MIT

