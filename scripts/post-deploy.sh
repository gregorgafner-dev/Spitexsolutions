#!/bin/bash
# Post-Deploy Script für Vercel
# Dieses Script wird nach dem Deployment ausgeführt, um die Datenbank zu initialisieren

echo "Running post-deploy script..."

# Prisma Client generieren
npx prisma generate

# Datenbank-Schema pushen
npx prisma db push --accept-data-loss

# Seed-Daten erstellen (nur wenn Datenbank leer ist)
npx prisma db seed || echo "Seed skipped (database might already have data)"

echo "Post-deploy script completed!"

