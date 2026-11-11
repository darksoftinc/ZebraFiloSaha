import { app, dialog, ipcMain, nativeTheme } from 'electron'
import { statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  AppSettings,
  ConfigApplyAllResult,
  ConfigApplyResult,
  ConfigSnapshot,
  CreatePrinterInput,
  EmailTestInput,
  ExportResult,
  FirmwareFile,
  MaintenanceInput,
  PrinterSettings,
  SettingsInput,
  TelegramTestInput,
  UpdatePrinterInput,
  ZplPrintInput
} from '@shared/types'
import {
  addAudit,
  addFirmwareUpdate,
  alertsInRange,
  completeFirmwareUpdate,
  completeMaintenanceTask,
  createConfigSnapshot,
  createMaintenanceTask,
  createPrinter,
  deleteConfigSnapshot,
  deleteMaintenanceTask,
  deletePrinter,
  getConfigSnapshot,
  getDatabasePath,
  getPrinter,
  getSettings,
  latestStatus,
  latestStatuses,
  listAlerts,
  listAudit,
  listConfigSnapshots,
  listFirmwareUpdates,
  listMaintenanceTasks,
  listPrinters,
  listRecentSamples,
  listSamples,
  samplesInRange,
  saveSettings,
  updatePrinter
} from './db'
import { getApiStatus, restartApiServer } from './api-server'
import { localSubnets, discoverPrinters } from './discovery'
import {
  applySettings,
  listWindowsPrinters,
  printConfigLabel,
  printZpl,
  testLabelZpl,
  uploadFirmware
} from './management'
import { testEmail, testTelegram, testWebhook } from './notifications'
import { poller } from './poller'
import { probePrinter } from './printer/client'
import { buildReport, exportReportPdf, exportReportXlsx } from './reports'

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} zorunludur.`)
  }
  return value.trim()
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error('Geçersiz metin değeri.')
  return value
}

function optionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label} geçerli bir sayı olmalıdır.`)
  return parsed
}

function sanitizeCreate(input: unknown): CreatePrinterInput {
  if (!input || typeof input !== 'object') throw new Error('Geçersiz yazıcı bilgisi.')
  const value = input as Record<string, unknown>
  const connectionType = value.connectionType === 'usb' ? 'usb' : 'network'
  return {
    name: requireString(value.name, 'Yazıcı adı'),
    host: optionalString(value.host)?.trim() ?? '',
    port: optionalNumber(value.port, 'Port'),
    connectionType,
    windowsPrinterName: optionalString(value.windowsPrinterName)?.trim() ?? '',
    site: optionalString(value.site),
    location: optionalString(value.location),
    notes: optionalString(value.notes),
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    pollInterval: optionalNumber(value.pollInterval, 'Sorgu aralığı')
  }
}

function sanitizeUpdate(input: unknown): UpdatePrinterInput {
  if (!input || typeof input !== 'object') throw new Error('Geçersiz yazıcı bilgisi.')
  const value = input as Record<string, unknown>
  return {
    name: value.name === undefined ? undefined : requireString(value.name, 'Yazıcı adı'),
    host: optionalString(value.host)?.trim(),
    port: optionalNumber(value.port, 'Port'),
    connectionType:
      value.connectionType === 'usb'
        ? 'usb'
        : value.connectionType === 'network'
          ? 'network'
          : undefined,
    windowsPrinterName: optionalString(value.windowsPrinterName)?.trim(),
    site: optionalString(value.site),
    location: optionalString(value.location),
    notes: optionalString(value.notes),
    enabled: typeof value.enabled === 'boolean' ? value.enabled : undefined,
    pollInterval: optionalNumber(value.pollInterval, 'Sorgu aralığı')
  }
}

function dateBoundary(value: unknown, endOfDay: boolean): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`)
    return Number.isFinite(date.getTime()) ? date : null
  }
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function ensureDateRange(from: unknown, to: unknown): { from: string; to: string } {
  const end = dateBoundary(to, true) ?? new Date()
  const start = dateBoundary(from, false) ?? new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new Error('Geçersiz tarih aralığı.')
  }
  if (start.getTime() > end.getTime()) {
    throw new Error('Başlangıç tarihi bitiş tarihinden sonra olamaz.')
  }
  return { from: start.toISOString(), to: end.toISOString() }
}

export function registerIpc(): void {
  ipcMain.handle('printers:list', () => listPrinters())

  ipcMain.handle('printers:create', (_event, raw: unknown) => {
    const printer = createPrinter(sanitizeCreate(raw))
    void poller.poll(printer, { httpCounters: true })
    return printer
  })

  ipcMain.handle('printers:update', (_event, id: number, raw: unknown) => {
    const printer = updatePrinter(Number(id), sanitizeUpdate(raw))
    void poller.poll(printer, { httpCounters: true })
    return printer
  })

  ipcMain.handle('printers:delete', (_event, id: number) => {
    deletePrinter(Number(id))
    return { ok: true }
  })

  ipcMain.handle('printers:probe', async (_event, host: unknown, port: unknown) => {
    const cleanHost = requireString(host, 'IP adresi')
    const cleanPort = optionalNumber(port, 'Port') ?? 9100
    if (!Number.isInteger(cleanPort) || cleanPort < 1 || cleanPort > 65535) {
      throw new Error('Geçerli bir port girin (1-65535).')
    }
    const result = await probePrinter(cleanHost, cleanPort)
    return {
      ok: result.status.online,
      message: result.message,
      status: result.status
    }
  })

  ipcMain.handle('printers:refresh', async (_event, id: number) => poller.refresh(Number(id)))
  ipcMain.handle('printers:refreshAll', async () => poller.refreshAll())
  ipcMain.handle('status:latestAll', () => latestStatuses())
  ipcMain.handle('status:latest', (_event, id: number) => latestStatus(Number(id)))

  ipcMain.handle('history:samples', (_event, printerId: number, limit?: number) =>
    listSamples(Number(printerId), Number(limit ?? 100))
  )
  ipcMain.handle('history:recent', (_event, limit?: number) => listRecentSamples(Number(limit ?? 200)))
  ipcMain.handle('history:alerts', (_event, limit?: number) => listAlerts(Number(limit ?? 300)))
  ipcMain.handle('history:audit', (_event, limit?: number) => listAudit(Number(limit ?? 300)))

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:save', async (_event, input: SettingsInput) => {
    const saved = saveSettings(input ?? {})
    nativeTheme.themeSource = saved.theme
    await restartApiServer()
    return saved
  })

  ipcMain.handle('notifications:testTelegram', (_event, input: TelegramTestInput) =>
    testTelegram(input ?? {})
  )
  ipcMain.handle('notifications:testEmail', (_event, input: EmailTestInput) =>
    testEmail(input ?? {})
  )
  ipcMain.handle('notifications:testWebhook', (_event, url?: string) => testWebhook(url))

  ipcMain.handle('discovery:subnets', () => localSubnets())
  ipcMain.handle('discovery:scan', (_event, subnet?: string) => discoverPrinters(subnet))
  ipcMain.handle('windows:printers', () => listWindowsPrinters())

  ipcMain.handle('printer:printConfigLabel', async (_event, printerId: number) => {
    const printer = getPrinter(Number(printerId))
    if (!printer) throw new Error('Yazıcı bulunamadı.')
    const result = await printConfigLabel(printer)
    addAudit(printer.id, 'print.config', `${printer.name} için yapılandırma etiketi istendi`)
    return result
  })

  ipcMain.handle('printer:quickTest', async (_event, printerId: number) => {
    const printer = getPrinter(Number(printerId))
    if (!printer) throw new Error('Yazıcı bulunamadı.')
    const status = latestStatus(printer.id)
    const result = await printZpl(
      printer,
      testLabelZpl({
        name: printer.name,
        host:
          printer.connectionType === 'usb'
            ? printer.windowsPrinterName
            : `${printer.host}:${printer.port}`,
        serial: status?.identity?.serial,
        firmware: status?.identity?.firmware,
        model: status?.identity?.model,
        site: printer.site,
        location: printer.location,
        labels: status?.counters.labels
      })
    )
    addAudit(printer.id, 'print.test', `${printer.name} için tek tık test etiketi gönderildi`)
    return result
  })

  ipcMain.handle(
    'printer:applySettings',
    async (_event, printerId: number, settings: PrinterSettings): Promise<ConfigApplyResult> => {
      const printer = getPrinter(Number(printerId))
      if (!printer) throw new Error('Yazıcı bulunamadı.')
      if (!settings || typeof settings !== 'object') throw new Error('Geçersiz ayar bilgisi.')

      const current = latestStatus(printer.id)
      if (current?.online) {
        createConfigSnapshot(
          printer.id,
          'pre-change',
          current.settings,
          current.identity,
          current.counters.labels ?? null,
          'Ayar değişikliği öncesi otomatik yedek'
        )
      }

      const result = await applySettings(printer, settings)
      addAudit(
        printer.id,
        'settings.apply',
        `${printer.name}: ${result.applied.length} ayar uygulandı${
          result.skipped.length > 0 ? `, atlandı: ${result.skipped.join(', ')}` : ''
        }`
      )
      if (result.ok) void poller.refresh(printer.id)
      return result
    }
  )

  ipcMain.handle('printer:printZpl', async (_event, input: ZplPrintInput) => {
    const printer = getPrinter(Number(input.printerId))
    if (!printer) throw new Error('Yazıcı bulunamadı.')
    const result = await printZpl(printer, input.zpl)
    addAudit(
      printer.id,
      'print.zpl',
      `${printer.name} için ${input.zpl.length} bayt ZPL gönderildi`
    )
    return result
  })

  ipcMain.handle('config:list', (_event, printerId: number) =>
    listConfigSnapshots(Number(printerId))
  )

  ipcMain.handle('config:create', (_event, printerId: number, notes?: string) => {
    const id = Number(printerId)
    const status = latestStatus(id)
    if (!status || !status.online) {
      throw new Error('Ayar yedeği için önce yazıcının çevrimiçi olması gerekir.')
    }
    return createConfigSnapshot(
      id,
      'manual',
      status.settings,
      status.identity,
      status.counters.labels ?? null,
      notes ?? ''
    )
  })

  ipcMain.handle('config:restore', async (_event, snapshotId: number): Promise<ConfigApplyResult> => {
    const snapshot = getConfigSnapshot(Number(snapshotId))
    if (!snapshot) throw new Error('Ayar yedeği bulunamadı.')
    const printer = getPrinter(snapshot.printerId)
    if (!printer) throw new Error('Yazıcı bulunamadı.')

    const current = latestStatus(printer.id)
    if (current) {
      createConfigSnapshot(
        printer.id,
        'pre-restore',
        current.settings,
        current.identity,
        current.counters.labels ?? null,
        'Geri yükleme öncesi otomatik yedek'
      )
    }
    const result = await applySettings(printer, snapshot.settings)
    addAudit(
      printer.id,
      'config.restore',
      `${printer.name} için #${snapshot.id} numaralı ayar yedeği geri yüklendi`
    )
    void poller.refresh(printer.id)
    return result
  })

  ipcMain.handle(
    'config:applyAll',
    async (_event, snapshotId: number): Promise<ConfigApplyAllResult> => {
      const snapshot = getConfigSnapshot(Number(snapshotId))
      if (!snapshot) throw new Error('Ayar yedeği bulunamadı.')
      const printers = listPrinters().filter((printer) => printer.enabled)
      const results: ConfigApplyAllResult['results'] = []
      for (const printer of printers) {
        if (printer.connectionType === 'usb') {
          results.push({
            printerId: printer.id,
            printerName: printer.name,
            ok: false,
            message: 'Windows kuyruğu için SGD ayar yazma desteklenmiyor.'
          })
          continue
        }
        const current = latestStatus(printer.id)
        if (current?.online) {
          createConfigSnapshot(
            printer.id,
            'pre-change',
            current.settings,
            current.identity,
            current.counters.labels ?? null,
            `Şablon #${snapshot.id} uygulanmadan önce otomatik yedek`
          )
        }
        const result = await applySettings(printer, snapshot.settings)
        addAudit(
          printer.id,
          'config.applyAll',
          `${printer.name} için #${snapshot.id} numaralı ayar şablonu uygulandı`
        )
        results.push({
          printerId: printer.id,
          printerName: printer.name,
          ok: result.ok,
          message: result.message
        })
        void poller.refresh(printer.id)
      }
      const success = results.filter((result) => result.ok).length
      return {
        ok: success > 0,
        message: `${success}/${results.length} yazıcıya ayar şablonu uygulandı.`,
        results
      }
    }
  )

  ipcMain.handle('config:delete', (_event, snapshotId: number) => {
    deleteConfigSnapshot(Number(snapshotId))
    return { ok: true }
  })

  ipcMain.handle('firmware:select', async (): Promise<FirmwareFile | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Zebra firmware dosyası seç',
      properties: ['openFile'],
      filters: [{ name: 'Zebra firmware', extensions: ['zpl', 'bin'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    const stats = statSync(filePath)
    return {
      path: filePath,
      name: filePath.split(/[\\/]/).pop() ?? filePath,
      size: stats.size
    }
  })

  ipcMain.handle(
    'firmware:upload',
    async (event, printerId: number, filePath: string) => {
      const printer = getPrinter(Number(printerId))
      if (!printer) throw new Error('Yazıcı bulunamadı.')
      if (printer.connectionType === 'usb') {
        return { ok: false, message: 'Firmware güncellemesi yalnızca ağ bağlantısıyla destekleniyor.' }
      }
      const stats = statSync(filePath)
      const versionBefore = latestStatus(printer.id)?.identity?.firmware ?? ''
      const historyId = addFirmwareUpdate(
        printer.id,
        versionBefore,
        filePath.split(/[\\/]/).pop() ?? filePath,
        stats.size
      )
      const result = await uploadFirmware(printer.id, printer, filePath, (progress) => {
        event.sender.send('firmware:progress', progress)
      })
      completeFirmwareUpdate(historyId, result.ok ? 'sent' : 'failed', result.message)
      addAudit(
        printer.id,
        'firmware.upload',
        `${printer.name}: ${filePath.split(/[\\/]/).pop() ?? filePath} (${result.ok ? 'gönderildi' : 'başarısız'})`
      )
      return result
    }
  )

  ipcMain.handle('firmware:history', (_event, printerId?: number) =>
    listFirmwareUpdates(printerId === undefined ? undefined : Number(printerId))
  )

  ipcMain.handle('maintenance:list', (_event, printerId?: number) =>
    listMaintenanceTasks(printerId === undefined ? undefined : Number(printerId))
  )
  ipcMain.handle('maintenance:create', (_event, input: MaintenanceInput) => {
    if (!input || typeof input !== 'object') throw new Error('Geçersiz bakım görevi.')
    return createMaintenanceTask(input)
  })
  ipcMain.handle('maintenance:complete', (_event, id: number) => {
    completeMaintenanceTask(Number(id))
    return { ok: true }
  })
  ipcMain.handle('maintenance:delete', (_event, id: number) => {
    deleteMaintenanceTask(Number(id))
    return { ok: true }
  })

  ipcMain.handle('reports:build', (_event, from: unknown, to: unknown) => {
    const range = ensureDateRange(from, to)
    return buildReport(range.from, range.to)
  })

  ipcMain.handle('reports:exportXlsx', async (_event, from: unknown, to: unknown) => {
    const range = ensureDateRange(from, to)
    const stamp = new Date().toISOString().slice(0, 10)
    const file = await dialog.showSaveDialog({
      title: 'Excel raporunu kaydet',
      defaultPath: join(app.getPath('downloads'), `zebra-saha-rapor-${stamp}.xlsx`),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (file.canceled || !file.filePath) return { ok: false, message: 'Kaydetme iptal edildi.' }
    await exportReportXlsx(buildReport(range.from, range.to), file.filePath)
    return { ok: true, path: file.filePath, message: 'Excel raporu kaydedildi.' }
  })

  ipcMain.handle('reports:exportPdf', async (_event, from: unknown, to: unknown) => {
    const range = ensureDateRange(from, to)
    const stamp = new Date().toISOString().slice(0, 10)
    const file = await dialog.showSaveDialog({
      title: 'PDF raporunu kaydet',
      defaultPath: join(app.getPath('downloads'), `zebra-saha-rapor-${stamp}.pdf`),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (file.canceled || !file.filePath) return { ok: false, message: 'Kaydetme iptal edildi.' }
    await exportReportPdf(buildReport(range.from, range.to), file.filePath)
    return { ok: true, path: file.filePath, message: 'PDF raporu kaydedildi.' }
  })

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    dbPath: getDatabasePath(),
    userData: app.getPath('userData')
  }))
  ipcMain.handle('api:status', () => getApiStatus())

  ipcMain.handle('diagnostics:export', async (): Promise<ExportResult> => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const result = await dialog.showSaveDialog({
      title: 'Tanılama paketini kaydet',
      defaultPath: join(app.getPath('downloads'), `zebra-saha-tanilama-${stamp}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) {
      return { ok: false, message: 'Kaydetme iptal edildi.' }
    }

    const printers = listPrinters()
    const payload = {
      schema: 'zebra-saha-diagnostics/v2',
      exportedAt: new Date().toISOString(),
      app: {
        version: app.getVersion(),
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome
      },
      settings: getSettings(),
      apiStatus: getApiStatus(),
      printers,
      latestStatuses: latestStatuses(),
      recentSamples: listRecentSamples(5000),
      alerts: listAlerts(2000),
      audit: listAudit(1000),
      maintenance: listMaintenanceTasks(),
      firmware: listFirmwareUpdates(),
      configSnapshots: printers.map((printer) => listConfigSnapshots(printer.id))
    }

    await writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf8')
    return { ok: true, path: result.filePath, message: 'Tanılama paketi kaydedildi.' }
  })
}
