import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Migriert den Service "F" zu "FE" für Ferien
 * - Aktualisiert bestehende Schedule-Entries
 * - Erstellt neuen Service "FE" falls nicht vorhanden
 * - Löscht alten Service "F" falls vorhanden
 */
async function main() {
  console.log('🔄 Starte Migration: F → FE für Ferien...')

  // Hole Service "F" (alt)
  const oldService = await prisma.service.findFirst({
    where: { name: 'F' },
  })

  // Hole Service "FE" (neu)
  let newService = await prisma.service.findFirst({
    where: { name: 'FE' },
  })

  // Erstelle Service "FE" falls nicht vorhanden
  if (!newService) {
    if (oldService) {
      // Verwende Daten vom alten Service
      newService = await prisma.service.create({
        data: {
          name: 'FE',
          description: 'Ferien',
          duration: oldService.duration,
          color: oldService.color,
        },
      })
      console.log('✓ Service "FE" erstellt (basierend auf "F")')
    } else {
      // Erstelle neuen Service mit Standard-Werten
      newService = await prisma.service.create({
        data: {
          name: 'FE',
          description: 'Ferien',
          duration: 8 * 60 + 24, // 8.4 Stunden
          color: '#f59e0b', // Orange
        },
      })
      console.log('✓ Service "FE" erstellt (mit Standard-Werten)')
    }
  } else {
    console.log('✓ Service "FE" existiert bereits')
  }

  // Migriere alle Schedule-Entries von "F" zu "FE"
  if (oldService) {
    const entriesToMigrate = await prisma.scheduleEntry.findMany({
      where: {
        serviceId: oldService.id,
      },
    })

    if (entriesToMigrate.length > 0) {
      console.log(`📝 Migriere ${entriesToMigrate.length} Schedule-Entries...`)
      
      for (const entry of entriesToMigrate) {
        await prisma.scheduleEntry.update({
          where: { id: entry.id },
          data: {
            serviceId: newService.id,
          },
        })
      }
      console.log(`✓ ${entriesToMigrate.length} Schedule-Entries migriert`)
    } else {
      console.log('✓ Keine Schedule-Entries zu migrieren')
    }

    // Lösche alten Service "F" (nur wenn keine anderen Abhängigkeiten existieren)
    try {
      await prisma.service.delete({
        where: { id: oldService.id },
      })
      console.log('✓ Alter Service "F" gelöscht')
    } catch (error) {
      console.warn('⚠️ Konnte Service "F" nicht löschen (möglicherweise noch Abhängigkeiten)')
    }
  } else {
    console.log('✓ Kein alter Service "F" gefunden')
  }

  console.log('✨ Migration abgeschlossen!')
}

main()
  .catch((e) => {
    console.error('❌ Fehler bei der Migration:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })







