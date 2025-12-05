#!/bin/bash

# Skript zum Wiederherstellen von Mitarbeitern und Diensten aus Backup
# Verwendet die Production-DATABASE_URL aus Vercel

echo "🔄 Starte Wiederherstellung aus Backup für Production..."
echo ""

# Prüfe ob DATABASE_URL gesetzt ist
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL ist nicht gesetzt!"
  echo ""
  echo "Bitte setze die Production-DATABASE_URL:"
  echo "  export DATABASE_URL='postgresql://...'"
  echo ""
  echo "Oder führe das Skript so aus:"
  echo "  DATABASE_URL='postgresql://...' npm run db:restore-from-backup"
  echo ""
  exit 1
fi

# Prüfe ob es eine PostgreSQL-URL ist
if [[ ! "$DATABASE_URL" =~ ^postgres(ql)?:// ]]; then
  echo "❌ DATABASE_URL muss auf eine PostgreSQL-Datenbank zeigen!"
  echo "   Aktuelle URL beginnt mit: ${DATABASE_URL:0:20}..."
  exit 1
fi

echo "📡 Verwende Production-DATABASE_URL"
echo ""

# Führe das TypeScript-Skript aus
npm run db:restore-from-backup

