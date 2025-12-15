# Umgebungsvariablen hinzufügen - Schritt für Schritt

## Was Sie bereits haben:
✅ `POSTGRES_URL`
✅ `POSTGRES_PRISMA_URL`
✅ `DATABASE_URL_UNPOOLED`

## Was Sie noch hinzufügen müssen:

### 1. DATABASE_URL (wichtig!)

Prisma braucht eine Variable namens `DATABASE_URL`. Sie müssen diese manuell hinzufügen:

1. Klicken Sie auf das 👁️ Auge-Icon bei `POSTGRES_PRISMA_URL` um den Wert zu sehen
2. Kopieren Sie den kompletten Wert (beginnt mit `postgresql://...`)
3. In den oberen Eingabefeldern:
   - **Key:** `DATABASE_URL`
   - **Value:** (den kopierten Wert einfügen)
   - **Environments:** All Environments
4. Klicken Sie auf **"Save"**

### 2. NEXTAUTH_URL

1. Klicken Sie auf **"Add Another"** (falls noch ein Feld frei ist) oder nutzen Sie die oberen Felder
2. **Key:** `NEXTAUTH_URL`
3. **Value:** `https://spitexsolutions.vercel.app`
4. **Environments:** All Environments
5. Klicken Sie auf **"Save"**

### 3. NEXTAUTH_SECRET

1. **WICHTIG:** Aktivieren Sie den Toggle **"Sensitive"** (damit der Wert nicht sichtbar ist)
2. Klicken Sie auf **"Add Another"**
3. **Key:** `NEXTAUTH_SECRET`
4. **Value:** `hb0JlH6UCZxcFJTsczSx6XfphcLuIiwPYMX2GFR0cGA=`
5. **Environments:** All Environments
6. Klicken Sie auf **"Save"**

## Am Ende sollten Sie haben:

1. ✅ POSTGRES_URL
2. ✅ POSTGRES_PRISMA_URL
3. ✅ DATABASE_URL_UNPOOLED
4. ✅ DATABASE_URL (neu - wichtig!)
5. ✅ NEXTAUTH_URL (neu)
6. ✅ NEXTAUTH_SECRET (neu - als Sensitive markiert)








