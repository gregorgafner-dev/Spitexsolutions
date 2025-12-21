# ✅ Finale Deployment-Checkliste

## Umgebungsvariablen prüfen:

Schauen Sie in Vercel → Settings → Environment Variables

### Haben Sie diese 3 Variablen?

1. ✅ **DATABASE_URL** → JA / NEIN
2. ✅ **NEXTAUTH_URL** → JA / NEIN  
3. ✅ **NEXTAUTH_SECRET** → JA / NEIN

### Wenn NEIN - dann hinzufügen:

**NEXTAUTH_URL:**
- Key: `NEXTAUTH_URL`
- Value: `https://spitexsolutions.vercel.app`

**NEXTAUTH_SECRET:**
- Key: `NEXTAUTH_SECRET`
- Value: `hb0JlH6UCZxcFJTsczSx6XfphcLuIiwPYMX2GFR0cGA=`

**DATABASE_URL:**
- Wert von POSTGRES_PRISMA_URL kopieren
- Als neue Variable DATABASE_URL speichern

## Wenn alle 3 vorhanden → Code pushen

```bash
git add prisma/schema.prisma
git commit -m "Switch to PostgreSQL"
git push
```










