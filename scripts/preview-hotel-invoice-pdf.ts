import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { endOfMonth, startOfMonth } from 'date-fns'
import { renderHotelInvoicePdf, type HotelInvoiceRenderParams } from '../lib/hotel-invoice-pdf'

async function main() {
  const jspdfMod: any = await import('jspdf')
  const jsPDF =
    typeof jspdfMod?.jsPDF === 'function'
      ? jspdfMod.jsPDF
      : typeof jspdfMod?.default === 'function'
        ? jspdfMod.default
        : jspdfMod?.default?.jsPDF

  const year = 2026
  const monthDate = new Date(2026, 1, 1) // Februar 2026
  const periodStart = startOfMonth(monthDate)
  const periodEnd = endOfMonth(monthDate)
  periodEnd.setHours(23, 59, 59, 999)

  const klvHours = 644.33
  const workMonthlySalary = 621.25
  const workHourlyWage = 464.04
  const totalSleepHours = 174.58
  const totalWorkHours = workMonthlySalary + workHourlyWage
  const productivity = (klvHours / totalWorkHours) * 100
  const leerstundenWork = totalWorkHours - klvHours
  const leerstundenSleep = totalSleepHours
  const verrechnungArbeitTotal = leerstundenWork * 52.84
  const verrechnungSchlafTotal = leerstundenSleep * 28.9
  const totalHotelCost = (leerstundenWork * 0.5) * 52.84 + (leerstundenSleep * 1.0) * 28.9
  const diffToPauschale = totalHotelCost - 12000
  const mwstBetrag = 12000 * 0.081
  const pauschaleTotal = 12000 + mwstBetrag

  const params: HotelInvoiceRenderParams = {
    now: new Date(2026, 2, 27, 12, 0, 0),
    year,
    monthDate,
    periodStart,
    periodEnd,
    klvHours,
    workMonthlySalary,
    workHourlyWage,
    totalSleepHours,
    productivity,
    leerstundenWork,
    leerstundenSleep,
    verrechnungArbeitTotal,
    verrechnungSchlafTotal,
    totalHotelCost,
    diffToPauschale,
    mwstBetrag,
    pauschaleTotal,
  }

  let logoBase64: string | null = null
  try {
    const logo = await readFile(join(process.cwd(), 'public', 'hotel-logo.png'))
    logoBase64 = logo.toString('base64')
  } catch {
    logoBase64 = null
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  renderHotelInvoicePdf({ doc, logoBase64, params, debugRunId: 'preview-local' })

  const outDir = join(process.cwd(), 'tmp', 'hotel-invoice-preview')
  await mkdir(outDir, { recursive: true })
  await writeFile(join(outDir, 'preview.pdf'), Buffer.from(doc.output('arraybuffer')))

  // Separate export for page 2 preview (for thumbnailing)
  try {
    const doc2 = new jsPDF({ unit: 'mm', format: 'a4' })
    renderHotelInvoicePdf({ doc: doc2, logoBase64, params, debugRunId: 'preview-local' })
    if (typeof (doc2 as any).deletePage === 'function') {
      ;(doc2 as any).deletePage(1)
    }
    await writeFile(join(outDir, 'preview-page2.pdf'), Buffer.from(doc2.output('arraybuffer')))
  } catch {
    // ignore
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

