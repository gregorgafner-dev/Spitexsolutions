import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Dienste mit Zeiten in Minuten und verschiedenen Farben
const services = [
  { name: 'TV', description: null, duration: 8 * 60 + 24, color: '#3b82f6' },      // Blau
  { name: 'FD', description: 'Frühdienst', duration: 8 * 60 + 24, color: '#10b981' },      // Grün
  { name: 'FE', description: 'Ferien', duration: 8 * 60 + 24, color: '#f59e0b' },        // Orange (Ferien - wird auf Pensum angepasst)
  { name: 'FK', description: null, duration: 3 * 60, color: '#ef4444' },          // Rot
  { name: 'sdk', description: null, duration: 3 * 60 + 10, color: '#8b5cf6' },     // Lila
  { name: 'GD', description: null, duration: 9 * 60, color: '#06b6d4' },           // Cyan
  { name: 'NW', description: null, duration: 5 * 60, color: '#ec4899' },            // Pink
  { name: 'BÜ', description: 'Büro', duration: 8 * 60 + 24, color: '#14b8a6' },     // Teal
  { name: 'HO', description: null, duration: 8 * 60 + 24, color: '#f97316' },     // Orange
  { name: 'PB', description: null, duration: 8 * 60 + 24, color: '#84cc16' },      // Lime
  { name: 'WB', description: null, duration: 8 * 60 + 24, color: '#6366f1' },     // Indigo
  { name: 'FW', description: 'Freiwunsch', duration: 0, color: '#94a3b8' },                 // Grau
  { name: 'K', description: 'Krankheit', duration: 8 * 60 + 24, color: '#dc2626' },        // Rot (wird auf Pensum angepasst)
]

async function main() {
  console.log('Erstelle Dienste...')

  for (const service of services) {
    // Prüfe ob Dienst bereits existiert
    const existing = await prisma.service.findFirst({
      where: { name: service.name },
    })

    if (existing) {
      // Aktualisiere bestehenden Dienst
      await prisma.service.update({
        where: { id: existing.id },
        data: {
          description: service.description,
          duration: service.duration,
          color: service.color,
        },
      })
      console.log(`✓ Aktualisiert: ${service.name}${service.description ? ` (${service.description})` : ''} (${service.duration} Min., ${service.color})`)
    } else {
      // Erstelle neuen Dienst
      await prisma.service.create({
        data: service,
      })
      console.log(`✓ Erstellt: ${service.name}${service.description ? ` (${service.description})` : ''} (${service.duration} Min., ${service.color})`)
    }
  }

  console.log('Dienste erfolgreich erstellt/aktualisiert!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

