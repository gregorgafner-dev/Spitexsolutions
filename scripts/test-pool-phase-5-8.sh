#!/usr/bin/env bash
#
# End-to-End-Test für Pool-Phasen 5–8.
# Setzt einen laufenden Dev-Server unter http://localhost:3000 voraus,
# der gegen die lokale SQLite läuft. Die Test-User müssen bereits angelegt sein:
#   planer@local.test  / TestPlaner123  (PLANNER)
#   member1@local.test / TestMember123  (MEMBER)
#   member2@local.test / TestMember123  (MEMBER)
#
set -euo pipefail

BASE="http://localhost:3000"

PLANNER_JAR=$(mktemp)
M1_JAR=$(mktemp)
M2_JAR=$(mktemp)
trap "rm -f $PLANNER_JAR $M1_JAR $M2_JAR" EXIT

pass() { printf "  \033[32m✓\033[0m %s\n" "$1"; }
fail() { printf "  \033[31m✗\033[0m %s\n" "$1"; exit 1; }
step() { printf "\n\033[1m== %s ==\033[0m\n" "$1"; }

login() {
  local email="$1" password="$2" jar="$3"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" -c "$jar" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}" \
    "$BASE/api/pool/auth/login")
  if [ "$code" != "200" ]; then fail "Login $email fehlgeschlagen (HTTP $code)"; fi
  pass "Login $email"
}

step "Setup: Logins"
login planer@local.test  TestPlaner123  "$PLANNER_JAR"
login member1@local.test TestMember123  "$M1_JAR"
login member2@local.test TestMember123  "$M2_JAR"

# ===========================================================================
step "Phase 5: Member-API Verfügbarkeit"
# ===========================================================================

DATE_PLUS_3="$(date -u -v+3d +%Y-%m-%d 2>/dev/null || date -u -d '+3 day' +%Y-%m-%d)"
DATE_PLUS_4="$(date -u -v+4d +%Y-%m-%d 2>/dev/null || date -u -d '+4 day' +%Y-%m-%d)"
DATE_PLUS_5="$(date -u -v+5d +%Y-%m-%d 2>/dev/null || date -u -d '+5 day' +%Y-%m-%d)"
YEAR="$(date -u +%Y)"
MONTH="$(date -u +%-m)"

resp=$(curl -s -b "$M1_JAR" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"$DATE_PLUS_3\",\"shifts\":[\"EARLY\",\"LATE\"]}" \
  "$BASE/api/pool/me/availability")
echo "  → $resp"
echo "$resp" | grep -q '"ok":true' && pass "Member trägt 2 Schichten ein" || fail "Eintragen fehlgeschlagen"

resp=$(curl -s -b "$M1_JAR" "$BASE/api/pool/me/calendar?year=$YEAR&month=$MONTH")
echo "  → $resp" | head -c 200; echo
echo "$resp" | grep -q "$DATE_PLUS_3" && pass "Eigene Verfügbarkeit im Kalender sichtbar" || fail "Kalender ohne Verfügbarkeit"

resp=$(curl -s -b "$M1_JAR" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"$DATE_PLUS_3\",\"shifts\":[\"EARLY\"]}" \
  "$BASE/api/pool/me/availability")
echo "  → $resp"
echo "$resp" | grep -q '"deleted":1' && pass "Schicht-Toggle löscht nur deselektierte" || fail "Lösch-Logik fehlt"

# zweites Member trägt anderen Tag ein
resp=$(curl -s -b "$M2_JAR" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"$DATE_PLUS_4\",\"shifts\":[\"LATE\"]}" \
  "$BASE/api/pool/me/availability")
echo "$resp" | grep -q '"ok":true' && pass "Member 2 trägt Spätdienst ein" || fail "Member 2 Eintrag fehlgeschlagen"

# Vergangenheit ablehnen
PAST="$(date -u -v-1d +%Y-%m-%d 2>/dev/null || date -u -d '-1 day' +%Y-%m-%d)"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$M1_JAR" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"$PAST\",\"shifts\":[\"EARLY\"]}" \
  "$BASE/api/pool/me/availability")
[ "$code" = "400" ] && pass "Vergangenheit wird abgelehnt (HTTP 400)" || fail "Vergangenheit nicht blockiert (HTTP $code)"

# ===========================================================================
step "Phase 6: Planer-Übersicht"
# ===========================================================================

resp=$(curl -s -b "$PLANNER_JAR" "$BASE/api/pool/availabilities?dateFrom=$DATE_PLUS_3&dateTo=$DATE_PLUS_5")
echo "$resp" | grep -q '"items"' && pass "GET /availabilities liefert items" || fail "Übersicht leer"
echo "  → $(echo "$resp" | head -c 400)"

# Filter nach Schicht
resp=$(curl -s -b "$PLANNER_JAR" "$BASE/api/pool/availabilities?shift=LATE&dateFrom=$DATE_PLUS_3&dateTo=$DATE_PLUS_5")
count=$(echo "$resp" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(len(d["items"]))')
echo "  → LATE only: $count items"
[ "$count" -ge 1 ] && pass "Filter shift=LATE funktioniert" || fail "Filter shift=LATE leer"

# Filter status=open
resp=$(curl -s -b "$PLANNER_JAR" "$BASE/api/pool/availabilities?status=open")
echo "$resp" | grep -q '"isBooked":true' && fail "status=open enthält gebuchte" || pass "Filter status=open ohne Buchungen"

# ===========================================================================
step "Phase 7: Bookings"
# ===========================================================================

# Planer holt Member-ID
MEMBER1_ID=$(curl -s -b "$PLANNER_JAR" "$BASE/api/pool/members" | python3 -c '
import sys,json
d=json.load(sys.stdin)
print(next(m["id"] for m in d["members"] if m["email"]=="member1@local.test"))')
echo "  member1 id=$MEMBER1_ID"

resp=$(curl -s -b "$PLANNER_JAR" \
  -H "Content-Type: application/json" \
  -d "{\"poolUserId\":\"$MEMBER1_ID\",\"date\":\"$DATE_PLUS_3\",\"shift\":\"EARLY\",\"team\":\"MEILEN\",\"notes\":\"E2E-Test\"}" \
  "$BASE/api/pool/bookings")
echo "  → $resp"
echo "$resp" | grep -q '"booking"' && pass "Buchung erfolgreich (Team MEILEN)" || fail "Buchung fehlgeschlagen"
BOOKING_ID=$(echo "$resp" | python3 -c 'import sys,json; print(json.load(sys.stdin)["booking"]["id"])')

# Doppelbuchung im SELBEN Team muss 409 geben
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$PLANNER_JAR" \
  -H "Content-Type: application/json" \
  -d "{\"poolUserId\":\"$MEMBER1_ID\",\"date\":\"$DATE_PLUS_3\",\"shift\":\"EARLY\",\"team\":\"MEILEN\"}" \
  "$BASE/api/pool/bookings")
[ "$code" = "409" ] && pass "Doppelbuchung im selben Team wird abgewiesen (409)" || fail "Doppelbuchung im selben Team nicht geschützt ($code)"

# Member darf nicht zweimal gleichzeitig arbeiten (anderes Team gleicher Slot)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$PLANNER_JAR" \
  -H "Content-Type: application/json" \
  -d "{\"poolUserId\":\"$MEMBER1_ID\",\"date\":\"$DATE_PLUS_3\",\"shift\":\"EARLY\",\"team\":\"HERRLIBERG_ERLENBACH\"}" \
  "$BASE/api/pool/bookings")
[ "$code" = "409" ] && pass "Member-Doppelbuchung anderes Team wird abgewiesen (409)" || fail "Member-Schutz fehlt ($code)"

# Anderes Member im anderen Team gleicher Slot DARF gebucht werden
MEMBER2_ID=$(curl -s -b "$PLANNER_JAR" "$BASE/api/pool/members" | python3 -c '
import sys,json
d=json.load(sys.stdin)
print(next(m["id"] for m in d["members"] if m["email"]=="member2@local.test"))')
resp=$(curl -s -b "$PLANNER_JAR" \
  -H "Content-Type: application/json" \
  -d "{\"poolUserId\":\"$MEMBER2_ID\",\"date\":\"$DATE_PLUS_3\",\"shift\":\"EARLY\",\"team\":\"HERRLIBERG_ERLENBACH\"}" \
  "$BASE/api/pool/bookings")
echo "$resp" | grep -q '"booking"' && pass "Paralleles Team gleicher Slot mit anderem Member geht" || fail "Paralleles Team-Booking fehlgeschlagen"
BOOKING2_ID=$(echo "$resp" | python3 -c 'import sys,json; print(json.load(sys.stdin)["booking"]["id"])')

# Lock: Member kann gebuchte Schicht nicht mehr aushebeln
resp=$(curl -s -b "$M1_JAR" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"$DATE_PLUS_3\",\"shifts\":[]}" \
  "$BASE/api/pool/me/availability")
echo "  → $resp"
echo "$resp" | grep -q '"locked":true' && pass "Member-Lock: Buchungs-Schicht bleibt unangetastet" || fail "Lock fehlt"

# Storno-Workflow
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$PLANNER_JAR" -X DELETE "$BASE/api/pool/bookings/$BOOKING_ID")
[ "$code" = "200" ] && pass "Buchung storniert" || fail "Storno fehlgeschlagen ($code)"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$PLANNER_JAR" -X DELETE "$BASE/api/pool/bookings/$BOOKING2_ID")
[ "$code" = "200" ] && pass "Parallele Team-Buchung storniert" || fail "Storno 2 fehlgeschlagen ($code)"

# ===========================================================================
step "Phase 8: ShiftRequest + FCFS"
# ===========================================================================

# Anfrage ohne Team muss 400 geben
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$PLANNER_JAR" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"$DATE_PLUS_5\",\"shift\":\"EARLY\",\"message\":\"ohne Team\"}" \
  "$BASE/api/pool/shift-requests")
[ "$code" = "400" ] && pass "Anfrage ohne Team wird abgewiesen (400)" || fail "Team-Pflicht greift nicht ($code)"

# Planer erstellt zwei Anfragen auf den GLEICHEN Tag/Schicht in unterschiedlichen Teams
resp=$(curl -s -b "$PLANNER_JAR" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"$DATE_PLUS_5\",\"shift\":\"EARLY\",\"team\":\"MEILEN\",\"message\":\"E2E\"}" \
  "$BASE/api/pool/shift-requests")
echo "  → $resp"
echo "$resp" | grep -q '"request"' && pass "Anfrage erstellt (MEILEN)" || fail "Anfrage MEILEN fehlgeschlagen"
REQUEST_ID=$(echo "$resp" | python3 -c 'import sys,json; print(json.load(sys.stdin)["request"]["id"])')
NOTIFIED=$(echo "$resp" | python3 -c 'import sys,json; print(json.load(sys.stdin)["request"]["notified"])')
[ "$NOTIFIED" -ge 2 ] && pass "An $NOTIFIED Member benachrichtigt" || fail "Zu wenig benachrichtigt ($NOTIFIED)"

resp=$(curl -s -b "$PLANNER_JAR" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"$DATE_PLUS_5\",\"shift\":\"EARLY\",\"team\":\"MAENNEDORF_UETIKON\",\"message\":\"E2E 2\"}" \
  "$BASE/api/pool/shift-requests")
echo "$resp" | grep -q '"request"' && pass "Zweite Anfrage gleicher Slot, anderes Team möglich" || fail "Mehrfach-Anfrage pro Tag/Schicht nicht erlaubt"
REQUEST2_ID=$(echo "$resp" | python3 -c 'import sys,json; print(json.load(sys.stdin)["request"]["id"])')

# Member sieht Anfrage im Postfach
resp=$(curl -s -b "$M1_JAR" "$BASE/api/pool/me/messages")
echo "$resp" | grep -q "$REQUEST_ID" && pass "Member 1 sieht Anfrage im Postfach" || fail "Postfach ohne Anfrage"

# Member 2 nimmt an
resp=$(curl -s -b "$M2_JAR" -X POST "$BASE/api/pool/shift-requests/$REQUEST_ID/accept")
echo "  → $resp"
echo "$resp" | grep -q '"booking"' && pass "Member 2 hat angenommen (FCFS)" || fail "Annahme fehlgeschlagen"

# Member 1 darf nicht mehr annehmen → 409
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$M1_JAR" -X POST "$BASE/api/pool/shift-requests/$REQUEST_ID/accept")
[ "$code" = "409" ] && pass "Member 1 wird beim Zweit-Versuch abgewiesen (409)" || fail "FCFS-Schutz fehlt ($code)"

# Planer/Admin dürfen NICHT über accept-Endpoint annehmen
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$PLANNER_JAR" -X POST "$BASE/api/pool/shift-requests/$REQUEST_ID/accept")
[ "$code" = "403" ] && pass "Planer kann nicht via FCFS-Endpoint annehmen (403)" || fail "Planer-Schutz fehlt ($code)"

# Postfach: nicht abgenommene Member sehen "nicht mehr verfügbar"
resp=$(curl -s -b "$M1_JAR" "$BASE/api/pool/me/messages")
echo "$resp" | python3 -c '
import sys,json
d=json.load(sys.stdin)
for it in d["items"]:
    if it.get("relatedRequest") and it["relatedRequest"]["id"] == "'"$REQUEST_ID"'":
        assert it["relatedRequest"]["status"] == "FILLED"
        assert it["relatedRequest"]["takenByMe"] == False
        print("    relatedRequest.status=FILLED, takenByMe=False — ok")
        sys.exit(0)
sys.exit(1)
' && pass "Member 1 sieht Anfrage als FILLED (von anderem übernommen)" || fail "Status-Update fehlt"

# Member 2 sieht Bestätigung
resp=$(curl -s -b "$M2_JAR" "$BASE/api/pool/me/messages")
echo "$resp" | grep -q '"BOOKING_CONFIRMED"' && pass "Member 2 hat Bestätigungs-Nachricht" || fail "Bestätigung fehlt"

# Mark-as-read
MSG_ID=$(curl -s -b "$M2_JAR" "$BASE/api/pool/me/messages" | python3 -c '
import sys,json
d=json.load(sys.stdin)
print(next(i["id"] for i in d["items"] if i["type"]=="BOOKING_CONFIRMED"))')
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$M2_JAR" -X POST "$BASE/api/pool/me/messages/$MSG_ID/read")
[ "$code" = "200" ] && pass "Mark-as-read erfolgreich" || fail "Mark-as-read fehlgeschlagen ($code)"

# Planer storniert beide Anfragen (REQUEST_ID war von Member 2 übernommen, REQUEST2_ID ist offen)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$PLANNER_JAR" -X DELETE "$BASE/api/pool/shift-requests/$REQUEST_ID")
[ "$code" = "200" ] && pass "Anfrage storniert (inkl. Buchung)" || fail "Storno-Anfrage fehlgeschlagen ($code)"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$PLANNER_JAR" -X DELETE "$BASE/api/pool/shift-requests/$REQUEST2_ID")
[ "$code" = "200" ] && pass "Zweite Anfrage storniert" || fail "Storno-Anfrage 2 fehlgeschlagen ($code)"

# Slot wieder frei (Team MEILEN nach beiden Stornos)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$PLANNER_JAR" \
  -H "Content-Type: application/json" \
  -d "{\"poolUserId\":\"$MEMBER1_ID\",\"date\":\"$DATE_PLUS_5\",\"shift\":\"EARLY\",\"team\":\"MEILEN\"}" \
  "$BASE/api/pool/bookings")
[ "$code" = "201" ] && pass "Slot ist nach Storno wieder buchbar (MEILEN)" || fail "Slot nicht freigegeben ($code)"

echo
echo "===================================="
echo "Alle E2E-Tests Phase 5–8 bestanden."
echo "===================================="
