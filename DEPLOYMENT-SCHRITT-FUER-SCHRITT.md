# 🎯 DEPLOYMENT - Schritt für Schritt

## SCHRITT 1: In Vercel - Umgebungsvariablen prüfen

1. Gehen Sie zu: **Vercel Dashboard**
2. Öffnen Sie Projekt: **spitexsolutions**
3. Klicken Sie auf: **Settings** (oben rechts)
4. Klicken Sie auf: **Environment Variables** (links im Menü)

**Sehen Sie diese 3 Variablen in der Liste?**

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`

**➜ Schreiben Sie auf, welche FEHLEN**

---

## SCHRITT 2: Fehlende Variablen hinzufügen

Für jede fehlende Variable:

1. Klicken Sie auf **"Create new"** Tab (oben)
2. Füllen Sie aus:
   - **Key:** (siehe unten)
   - **Value:** (siehe unten)
   - **Environments:** All Environments (Dropdown)
3. Klicken Sie auf **"Save"**

### Variable A: DATABASE_URL (falls fehlt)
- **Key:** `DATABASE_URL`
- **Value:** 
  - Klicken Sie bei `POSTGRES_PRISMA_URL` auf das 👁️ Auge-Icon
  - Kopieren Sie den kompletten Wert (beginnt mit postgresql://)
  - Fügen Sie ihn hier ein

### Variable B: NEXTAUTH_URL (falls fehlt)
- **Key:** `NEXTAUTH_URL`
- **Value:** `https://spitexsolutions.vercel.app`

### Variable C: NEXTAUTH_SECRET (falls fehlt)
- **Key:** `NEXTAUTH_SECRET`
- **Value:** `hb0JlH6UCZxcFJTsczSx6XfphcLuIiwPYMX2GFR0cGA=`

---

## SCHRITT 3: Code pushen (wenn alle 3 Variablen vorhanden sind)

1. Öffnen Sie Terminal
2. Navigieren Sie zum Projekt-Ordner
3. Führen Sie aus:

```bash
git add prisma/schema.prisma
git commit -m "Switch to PostgreSQL for production"
git push
```

4. Warten Sie - Vercel deployt automatisch!

---

## SCHRITT 4: Nach dem Deployment - Datenbank initialisieren

Nach erfolgreichem Deployment:
- Ich helfe Ihnen dabei, die Datenbank zu initialisieren

---

**FANGEN SIE MIT SCHRITT 1 AN!**





