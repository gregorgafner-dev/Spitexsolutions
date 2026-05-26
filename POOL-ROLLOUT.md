# Spitex Zürichsee Pool – Produktions-Rollout

Diese Anleitung beschreibt, wie der Pool-Bereich (Phasen 1–8) in der
Vercel-/Postgres-Produktionsumgebung aktiviert wird. Alle Schritte sind
manuell auszuführen – das Repo enthält bewusst kein Auto-Push-Skript, damit
keine Migration unbeabsichtigt gefahren wird.

## Voraussetzungen

- Aktuelle `main`-Branch ist auf Vercel deployt
  (Pool-Features sind dann bereits im Build enthalten, aber inaktiv, weil die
  Tabellen in Postgres noch fehlen).
- `DATABASE_URL` in Vercel zeigt auf das Produktions-Postgres
  (siehe `DEPLOYMENT-VERCEL-CHECKLIST.md`).
- Lokal hast du Zugriff auf dieselbe Datenbank über `.env.local`.

## 1. Neue ENV-Variablen in Vercel setzen

Im Vercel-Dashboard → Project → Settings → Environment Variables für
*Production* hinzufügen:

| Name               | Wert                                              | Bemerkung |
| ------------------ | ------------------------------------------------- | --------- |
| `POOL_AUTH_SECRET` | Langer Zufalls-String (≥ 32 Zeichen)              | Wird zum Signieren der `pool-session`-JWT-Cookies verwendet. Lokal generieren z.B. via `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Fällt das Secret weg, greift als Fallback `NEXTAUTH_SECRET`. |

Optional, falls noch nicht gesetzt:

| Name | Wert | Bemerkung |
| ---- | ---- | --------- |
| `NEXTAUTH_URL` | Produktions-URL | Wird für SZS-Admin-Login bereits genutzt. |

Nach dem Setzen einmal das Projekt redeployen (Vercel → Deployments → Redeploy
letztes Deployment ohne Build-Cache).

## 2. Postgres-Schema aktualisieren

> Wir verwenden `prisma db push` statt Migrations, weil im Projekt schon der
> Schema-Push-Workflow etabliert ist (siehe `DEPLOYMENT-DATENBANK-INITIALISIEREN.md`).

```bash
# Lokal, mit Produktions-DB
export DATABASE_URL='postgres://...PRODUKTION...'   # NICHT in Git checken
npx prisma db push --schema prisma/schema.postgres.prisma
```

`db push` erzeugt fünf neue Tabellen:
`pool_users`, `pool_availabilities`, `pool_bookings`,
`pool_shift_requests`, `pool_messages`. Bestehende Tabellen werden nicht
verändert.

> Hinweis Team-Modell: `pool_bookings` und `pool_shift_requests` enthalten
> jeweils ein `team`-Feld (zulässig: `MAENNEDORF_UETIKON`, `MEILEN`,
> `HERRLIBERG_ERLENBACH`, siehe `lib/pool/teams.ts`). Der Unique-Constraint
> auf `pool_bookings` ist `(date, shift, team)` + `(poolUserId, date, shift)`,
> sodass am gleichen Tag/in derselben Schicht mehrere Teams parallel Dienste
> haben können, eine Person aber nie zwei Schichten gleichzeitig.

Falls Prisma einen Reset vorschlägt: **Abbrechen**. Bei Fragen lieber
`DEPLOYMENT-DATENBANK-INITIALISIEREN.md` konsultieren.

## 3. Initialen Pool-Planer anlegen

Wir nutzen das vorhandene Seed-Skript `scripts/create-pool-user.ts` – es
verwendet `DATABASE_URL` und bcrypt-hasht das Passwort sicher.

```bash
export DATABASE_URL='postgres://...PRODUKTION...'
npx tsx scripts/create-pool-user.ts \
  --email "planung@spitex-zuerichsee.ch" \
  --first "Vorname" \
  --last "Nachname" \
  --role PLANNER \
  --password 'EinSicheresStartPasswort!'
```

Der Planer kann sich anschliessend unter `https://<deine-domain>/pool/login`
einloggen.

> Zusätzliche SZS-Admins benötigen kein separates Pool-Konto – sie haben
> über den Dual-Auth-Helper (`lib/pool/actor.ts`) bereits planerische
> Befugnisse, sobald sie als `ADMIN_SZS` im Hauptsystem angemeldet sind.

## 4. Erste Mitarbeitende erfassen

In der UI:

- Als Planer: `https://<deine-domain>/pool/planung/mitarbeitende`
- Als SZS-Admin: `https://<deine-domain>/szs-admin/pool/mitarbeitende`

Pro Mitarbeitende:in „+ Mitarbeitende:r" → E-Mail, Vor-/Nachname, Rolle
`MEMBER`, Start-Passwort, optional Telefon/Notizen. Die Person erhält die
Zugangsdaten ausserhalb des Systems (E-Mail/Brief) und kann das Passwort
nach dem ersten Login nicht selbst ändern – ein „Passwort zurücksetzen"-
Dialog steht jedoch in der gleichen Seite zur Verfügung.

## 5. Smoke-Test in Produktion

Nach Setup folgende Pfade testen (jeweils 200/Redirect erwartet):

- `/pool/login` (öffentlich)
- `/pool/dashboard` (nach Member-Login)
- `/pool/postfach` (nach Member-/Planer-Login)
- `/pool/planung` (nach Planer-Login)
- `/pool/planung/mitarbeitende`
- `/pool/planung/verfuegbarkeiten`
- `/pool/planung/anfragen`
- `/szs-admin/pool` (nach SZS-Admin-Login)
- `/szs-admin/pool/mitarbeitende`
- `/szs-admin/pool/verfuegbarkeiten`
- `/szs-admin/pool/anfragen`

API-Smoke-Test mit curl (Member-Token aus dem Browser kopieren):

```bash
curl -s -H "Cookie: pool-session=$POOL_TOKEN" \
  https://<deine-domain>/api/pool/me/messages | jq '.unread'
```

## 6. Rückbau / Notfall

Falls die Pool-Tabellen wieder entfernt werden müssen (z.B. um nochmals von
0 zu starten), kann pro Tabelle gezielt `DROP TABLE` ausgeführt werden.
**Vorsicht**: Die Mitarbeitenden-, Verfügbarkeits- und Buchungsdaten gehen
verloren. Sicherung vorher erstellen.

```sql
-- Reihenfolge wegen FK-Constraints:
DROP TABLE IF EXISTS pool_messages;
DROP TABLE IF EXISTS pool_bookings;
DROP TABLE IF EXISTS pool_shift_requests;
DROP TABLE IF EXISTS pool_availabilities;
DROP TABLE IF EXISTS pool_users;
```

## 7. Übersicht der neuen Endpunkte / Routen

| Route | Wer | Zweck |
| ----- | --- | ----- |
| `POST /api/pool/auth/login` | öffentlich | Pool-Login (Planer / Member) |
| `POST /api/pool/auth/logout` | öffentlich | Pool-Logout |
| `GET /api/pool/members` | Planer/Admin | Mitarbeitende auflisten |
| `POST /api/pool/members` | Planer/Admin | Mitarbeitende anlegen |
| `PATCH /api/pool/members/[id]` | Planer/Admin | Mitarbeitende editieren |
| `DELETE /api/pool/members/[id]` | Planer/Admin | Mitarbeitende löschen |
| `POST /api/pool/members/[id]/password` | Planer/Admin | Passwort zurücksetzen |
| `GET /api/pool/me/calendar?year&month` | Member/Planer | Eigene Verfügbarkeit + Buchungen pro Monat |
| `POST /api/pool/me/availability` | Member/Planer | Eigene Verfügbarkeit eintragen/aktualisieren |
| `GET /api/pool/availabilities` | Planer/Admin | Übersicht mit Filtern |
| `POST /api/pool/bookings` | Planer/Admin | Slot verbindlich buchen |
| `DELETE /api/pool/bookings/[id]` | Planer/Admin | Buchung stornieren |
| `GET /api/pool/shift-requests` | Member/Planer/Admin | Anfragen auflisten |
| `POST /api/pool/shift-requests` | Planer/Admin | Anfrage erstellen + an Member verteilen |
| `POST /api/pool/shift-requests/[id]/accept` | nur Member | FCFS-Annahme |
| `DELETE /api/pool/shift-requests/[id]` | Planer/Admin | Anfrage stornieren |
| `GET /api/pool/me/messages` | Member/Planer | Postfach |
| `POST /api/pool/me/messages/[id]/read` | Member/Planer | Nachricht gelesen |
