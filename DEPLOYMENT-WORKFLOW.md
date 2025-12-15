# 🔄 Workflow für Änderungen am Live-Server

## Standard-Workflow

### 1. Problem/Änderung beschreiben
Sie sagen mir z.B.:
- "Der Login funktioniert nicht"
- "Ich möchte die Farbe ändern"
- "Es fehlt eine Funktion"

### 2. Änderungen lokal machen
- Ich ändere den Code in Ihrem lokalen Projekt
- Wir testen es lokal (optional)

### 3. Code committen und pushen
```bash
git add .
git commit -m "Beschreibung der Änderung"
git push
```

### 4. Automatisches Deployment
- ✅ Vercel erkennt den Push automatisch
- ✅ Startet ein neues Deployment
- ✅ Nach 2-5 Minuten ist es live

**Sie müssen NICHTS manuell in Vercel machen!**

---

## Wichtige Regeln

### ✅ DO (Richtig):
- Immer lokal entwickeln
- Code committen und pushen
- Warten bis Deployment fertig ist
- Testen auf https://spitexsolutions.vercel.app

### ❌ DON'T (Falsch):
- Direkt am Live-Server ändern
- Code ohne Commit pushen
- Während dem Deployment nochmal pushen

---

## Workflow-Beispiel

### Sie sagen:
"Ich möchte, dass die Buttons blau statt grün sind"

### Was passiert:
1. **Ich ändere** `components/ui/button.tsx` lokal
2. **Sie testen** lokal (optional): `npm run dev`
3. **Ich committe**: `git commit -m "Buttons auf blau geändert"`
4. **Ich pushe**: `git push`
5. **Vercel deployt** automatisch (2-5 Minuten)
6. **Fertig!** Live auf https://spitexsolutions.vercel.app

---

## Datenbank-Änderungen

Wenn Sie Datenbank-Änderungen machen wollen:

### Schema-Änderungen:
1. `prisma/schema.prisma` ändern
2. Code committen und pushen
3. **Nach dem Deployment:** Schema zur DB pushen:
   ```bash
   DATABASE_URL="[Production-URL]" npx prisma db push
   ```

### Daten-Änderungen:
- Über die App (Admin-Interface)
- Oder ich erstelle ein Script

---

## Quick-Referenz

**Schnelle Änderung machen:**
1. Sie sagen mir, was geändert werden soll
2. Ich ändere es lokal
3. `git add . && git commit -m "..." && git push`
4. Warten 2-5 Minuten
5. Fertig! ✨

**Fragen?**
- Einfach fragen, ich helfe gerne!








