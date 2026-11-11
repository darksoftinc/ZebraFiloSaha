import { createWriteStream, existsSync } from 'node:fs'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import type { AlertRecord, ReportResult, ReportRow } from '@shared/types'
import { alertsInRange, listPrinters, samplesInRange, type ReportSample } from './db'

function parseDate(value: string): number {
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : Date.now()
}

function buildRow(
  printerId: number,
  printerName: string,
  site: string,
  samples: ReportSample[],
  alerts: AlertRecord[],
  from: string,
  to: string
): ReportRow {
  const labelValues = samples
    .map((sample) => sample.labelCount)
    .filter((value): value is number => typeof value === 'number')
  const labelsStart = labelValues.length > 0 ? labelValues[0] : null
  const labelsEnd = labelValues.length > 0 ? labelValues[labelValues.length - 1] : null
  const labelsPrinted =
    labelsStart !== null && labelsEnd !== null ? Math.max(0, labelsEnd - labelsStart) : null

  const onlineSamples = samples.filter((sample) => sample.online).length
  const onlinePercent = samples.length > 0 ? (onlineSamples / samples.length) * 100 : 0

  let downtimeMinutes = 0
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    const deltaMinutes = Math.min(60, Math.max(0, (parseDate(current.checkedAt) - parseDate(previous.checkedAt)) / 60000))
    if (previous.state === 'error' || previous.state === 'offline' || previous.state === 'paused') {
      downtimeMinutes += deltaMinutes
    }
  }

  const printerAlerts = alerts.filter((alert) => alert.printerId === printerId)
  const errorAlerts = printerAlerts.filter((alert) => alert.severity === 'error')
  const warningAlerts = printerAlerts.filter((alert) => alert.severity !== 'error')
  const resolvedErrors = errorAlerts.filter((alert) => alert.resolvedAt !== null)

  let alertDowntime = 0
  for (const alert of errorAlerts) {
    const start = parseDate(alert.firstSeen)
    const end = alert.resolvedAt ? parseDate(alert.resolvedAt) : Date.now()
    alertDowntime += Math.max(0, Math.min(end, Date.now()) - start) / 60000
  }
  downtimeMinutes = Math.max(downtimeMinutes, alertDowntime)

  const periodHours = Math.max(
    0.01,
    (parseDate(to) - parseDate(from)) / (60 * 60 * 1000)
  )
  const availableHours = Math.max(0.01, periodHours - downtimeMinutes / 60)
  const mtbfHours = errorAlerts.length > 0 ? availableHours / errorAlerts.length : null
  const mttrMinutes = resolvedErrors.length > 0 ? alertDowntime / resolvedErrors.length : null

  return {
    printerId,
    printerName,
    site,
    labelsStart,
    labelsEnd,
    labelsPrinted,
    samples: samples.length,
    errorEvents: errorAlerts.length,
    warningEvents: warningAlerts.length,
    downtimeMinutes: Math.round(downtimeMinutes),
    mtbfHours: mtbfHours === null ? null : Math.round(mtbfHours * 10) / 10,
    mttrMinutes: mttrMinutes === null ? null : Math.round(mttrMinutes),
    onlinePercent: Math.round(onlinePercent * 10) / 10
  }
}

export function buildReport(from: string, to: string): ReportResult {
  const fromIso = new Date(from).toISOString()
  const toIso = new Date(to).toISOString()
  const samples = samplesInRange(fromIso, toIso)
  const alerts = alertsInRange(fromIso, toIso)
  const printers = listPrinters()

  const rows: ReportRow[] = printers.map((printer) => {
    const printerSamples = samples.filter((sample) => sample.printerId === printer.id)
    return buildRow(
      printer.id,
      printer.name,
      printer.site,
      printerSamples,
      alerts.filter((alert) => alert.printerId === printer.id),
      fromIso,
      toIso
    )
  })

  const totals = rows.reduce(
    (accumulator, row) => {
      accumulator.labelsPrinted += row.labelsPrinted ?? 0
      accumulator.errorEvents += row.errorEvents
      accumulator.warningEvents += row.warningEvents
      accumulator.downtimeMinutes += row.downtimeMinutes
      return accumulator
    },
    { labelsPrinted: 0, errorEvents: 0, warningEvents: 0, downtimeMinutes: 0 }
  )

  return { from: fromIso, to: toIso, rows, totals }
}

export async function exportReportXlsx(report: ReportResult, filePath: string): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Zebra Saha'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet('Filo Raporu', {
    views: [{ state: 'frozen', ySplit: 4 }]
  })

  sheet.mergeCells('A1:I1')
  sheet.getCell('A1').value = 'Zebra Saha — Filo Raporu'
  sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF0F766E' } }
  sheet.mergeCells('A2:I2')
  sheet.getCell('A2').value = `Dönem: ${new Date(report.from).toLocaleString('tr-TR')} — ${new Date(report.to).toLocaleString('tr-TR')}`
  sheet.getCell('A2').font = { size: 10, color: { argb: 'FF475569' } }

  const headers = [
    'Yazıcı',
    'Saha',
    'Etiket',
    'Hata',
    'Uyarı',
    'Duruş (dk)',
    'MTBF (sa)',
    'MTTR (dk)',
    'Çevrimiçi %'
  ]
  const headerRow = sheet.addRow(headers)
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  for (const row of report.rows) {
    const excelRow = sheet.addRow([
      row.printerName,
      row.site || '-',
      row.labelsPrinted ?? 0,
      row.errorEvents,
      row.warningEvents,
      row.downtimeMinutes,
      row.mtbfHours ?? '',
      row.mttrMinutes ?? '',
      row.onlinePercent
    ])
    excelRow.getCell(9).numFmt = '0.0'
    excelRow.getCell(3).numFmt = '#,##0'
  }

  const totalRow = sheet.addRow([
    'TOPLAM',
    '',
    report.totals.labelsPrinted,
    report.totals.errorEvents,
    report.totals.warningEvents,
    report.totals.downtimeMinutes,
    '',
    '',
    ''
  ])
  totalRow.font = { bold: true }
  totalRow.getCell(3).numFmt = '#,##0'

  sheet.columns = [
    { width: 24 },
    { width: 18 },
    { width: 14 },
    { width: 10 },
    { width: 10 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 14 }
  ]
  sheet.autoFilter = { from: 'A3', to: 'I3' }

  await workbook.xlsx.writeFile(filePath)
}

function pdfText(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

export async function exportReportPdf(report: ReportResult, filePath: string): Promise<void> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 32,
    info: { Title: 'Zebra Saha Filo Raporu', Author: 'Zebra Saha' }
  })
  const stream = doc.pipe(createWriteStream(filePath))
  const fontPath = 'C:\\Windows\\Fonts\\segoeui.ttf'
  if (existsSync(fontPath)) {
    doc.registerFont('Segoe', fontPath)
    doc.font('Segoe')
  }

  doc.fontSize(18).fillColor('#0f766e').text('Zebra Saha — Filo Raporu')
  doc.moveDown(0.25)
  doc
    .fontSize(9)
    .fillColor('#475569')
    .text(
      `Dönem: ${new Date(report.from).toLocaleString('tr-TR')} — ${new Date(report.to).toLocaleString('tr-TR')}`
    )
  doc.moveDown(0.8)

  const columns = [
    { label: 'Yazıcı', width: 110 },
    { label: 'Saha', width: 80 },
    { label: 'Etiket', width: 70 },
    { label: 'Hata', width: 45 },
    { label: 'Uyarı', width: 45 },
    { label: 'Duruş (dk)', width: 65 },
    { label: 'MTBF (sa)', width: 60 },
    { label: 'MTTR (dk)', width: 60 },
    { label: 'Çevrimiçi %', width: 65 }
  ]
  const startX = 32
  let y = doc.y
  const rowHeight = 20

  const drawHeader = (): void => {
    let x = startX
    doc.rect(startX, y, columns.reduce((sum, column) => sum + column.width, 0), rowHeight).fill('#0f766e')
    doc.fillColor('#ffffff').fontSize(8)
    for (const column of columns) {
      doc.text(column.label, x + 4, y + 6, { width: column.width - 8 })
      x += column.width
    }
    y += rowHeight
    doc.fillColor('#111827')
  }

  drawHeader()

  for (const row of report.rows) {
    if (y > 520) {
      doc.addPage()
      y = 32
      drawHeader()
    }
    const values = [
      row.printerName,
      row.site || '-',
      row.labelsPrinted ?? 0,
      row.errorEvents,
      row.warningEvents,
      row.downtimeMinutes,
      row.mtbfHours ?? '-',
      row.mttrMinutes ?? '-',
      row.onlinePercent
    ]
    let x = startX
    doc.fontSize(8).fillColor('#111827')
    for (let index = 0; index < columns.length; index += 1) {
      const column = columns[index]
      doc.rect(x, y, column.width, rowHeight).strokeColor('#e2e8f0').stroke()
      doc.text(pdfText(values[index]), x + 4, y + 6, { width: column.width - 8 })
      x += column.width
    }
    y += rowHeight
  }

  y += 8
  doc.fontSize(9).fillColor('#0f766e').text(
    `Toplam: ${report.totals.labelsPrinted.toLocaleString('tr-TR')} etiket · ${report.totals.errorEvents} hata · ${report.totals.warningEvents} uyarı · ${report.totals.downtimeMinutes} dk duruş`,
    startX,
    y
  )
  doc
    .fontSize(7)
    .fillColor('#64748b')
    .text(
      'MTBF: ortalama arızasız çalışma süresi · MTTR: ortalama onarım süresi. Değerler toplanan durum kayıtlarına göre tahminidir.',
      startX,
      y + 16,
      { width: 760 }
    )

  doc.end()
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve())
    stream.on('error', (error) => reject(error))
  })
}
