import { app } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  AlertRecord,
  AppSettings,
  AuditEntry,
  ConfigSnapshot,
  CreatePrinterInput,
  FirmwareUpdateRecord,
  HistorySample,
  MaintenanceInput,
  MaintenanceTask,
  PrinterIdentity,
  PrinterRecord,
  PrinterSettings,
  PrinterStatus,
  SettingsInput,
  UpdatePrinterInput
} from '@shared/types'
import { decryptSecret, encryptSecret } from './secrets'

type Row = Record<string, unknown>

let database: DatabaseSync | null = null
let databasePath = ''

interface InternalSettings {
  pollInterval: number
  retentionDays: number
  theme: 'dark' | 'light'
  httpCounters: boolean
  alertCooldownMinutes: number
  notifyOnError: boolean
  notifyOnWarning: boolean
  notifyOnOffline: boolean
  notifyOnRecovery: boolean
  telegramEnabled: boolean
  telegramChatId: string
  telegramBotToken: string
  emailEnabled: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPassword: string
  emailFrom: string
  emailTo: string
  webhookEnabled: boolean
  webhookUrl: string
  apiEnabled: boolean
  apiPort: number
  apiBind: '127.0.0.1' | '0.0.0.0'
  apiAllowPrint: boolean
  apiToken: string
}

const DEFAULT_INTERNAL_SETTINGS: InternalSettings = {
  pollInterval: 60,
  retentionDays: 30,
  theme: 'dark',
  httpCounters: true,
  alertCooldownMinutes: 15,
  notifyOnError: true,
  notifyOnWarning: true,
  notifyOnOffline: true,
  notifyOnRecovery: true,
  telegramEnabled: false,
  telegramChatId: '',
  telegramBotToken: '',
  emailEnabled: false,
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
  emailFrom: '',
  emailTo: '',
  webhookEnabled: false,
  webhookUrl: '',
  apiEnabled: false,
  apiPort: 3210,
  apiBind: '127.0.0.1',
  apiAllowPrint: false,
  apiToken: ''
}

function db(): DatabaseSync {
  if (!database) throw new Error('Veritabanı başlatılmadı.')
  return database
}

export function initDatabase(): void {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  databasePath = join(dir, 'zebra-saha.db')
  database = new DatabaseSync(databasePath)

  db().exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS printers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      host TEXT NOT NULL DEFAULT '',
      port INTEGER NOT NULL DEFAULT 9100,
      connection_type TEXT NOT NULL DEFAULT 'network',
      windows_printer_name TEXT NOT NULL DEFAULT '',
      site TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      poll_interval INTEGER NOT NULL DEFAULT 60,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS status_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      printer_id INTEGER NOT NULL,
      checked_at TEXT NOT NULL,
      online INTEGER NOT NULL,
      state TEXT NOT NULL,
      latency_ms INTEGER,
      identity_json TEXT,
      memory_json TEXT,
      host_status_json TEXT,
      settings_json TEXT,
      counters_json TEXT,
      errors_json TEXT,
      warnings_json TEXT,
      uptime TEXT,
      raw_json TEXT,
      FOREIGN KEY(printer_id) REFERENCES printers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_samples_printer_time
      ON status_samples(printer_id, checked_at DESC);
    CREATE INDEX IF NOT EXISTS idx_samples_time
      ON status_samples(checked_at DESC);

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      printer_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      resolved_at TEXT,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(printer_id) REFERENCES printers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_printer_active
      ON alerts (printer_id, code, resolved_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS config_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      printer_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      settings_json TEXT NOT NULL,
      identity_json TEXT,
      label_count INTEGER,
      notes TEXT NOT NULL DEFAULT '',
      FOREIGN KEY(printer_id) REFERENCES printers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_config_printer_time
      ON config_snapshots (printer_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS maintenance_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      printer_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'other',
      due_date TEXT,
      due_labels INTEGER,
      notes TEXT NOT NULL DEFAULT '',
      completed_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(printer_id) REFERENCES printers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_maintenance_printer
      ON maintenance_tasks (printer_id, completed_at);

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      printer_id INTEGER,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY(printer_id) REFERENCES printers(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log (created_at DESC);

    CREATE TABLE IF NOT EXISTS firmware_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      printer_id INTEGER NOT NULL,
      version_before TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'started',
      message TEXT NOT NULL DEFAULT '',
      FOREIGN KEY(printer_id) REFERENCES printers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_firmware_printer_time
      ON firmware_updates (printer_id, started_at DESC);
  `)

  // Eski sürümden gelen tabloları uyumlu hale getir.
  const columns = db().prepare('PRAGMA table_info(printers)').all() as Row[]
  const columnNames = new Set(columns.map((column) => text(column.name)))
  if (!columnNames.has('site')) {
    db().exec("ALTER TABLE printers ADD COLUMN site TEXT NOT NULL DEFAULT ''")
  }
  if (!columnNames.has('windows_printer_name')) {
    db().exec("ALTER TABLE printers ADD COLUMN windows_printer_name TEXT NOT NULL DEFAULT ''")
  }
  db().exec('DROP INDEX IF EXISTS idx_printers_host_port;')
  db().exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_printers_network_host_port
     ON printers(host, port) WHERE connection_type = 'network';`
  )

  const now = new Date().toISOString()
  for (const [key, value] of Object.entries(DEFAULT_INTERNAL_SETTINGS)) {
    if (key === 'telegramBotToken' || key === 'smtpPassword' || key === 'apiToken') continue
    db()
      .prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
      .run(key, JSON.stringify(value))
  }
  db()
    .prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
    .run('installedAt', JSON.stringify(now))
}

export function getDatabasePath(): string {
  return databasePath
}

function number(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  return Number(value ?? 0)
}

function text(value: unknown): string {
  return value == null ? '' : String(value)
}

function bool(value: unknown): boolean {
  return value === true || number(value) === 1 || value === 'true'
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function mapPrinter(row: Row): PrinterRecord {
  return {
    id: number(row.id),
    name: text(row.name),
    host: text(row.host),
    port: number(row.port),
    connectionType: row.connection_type === 'usb' ? 'usb' : 'network',
    windowsPrinterName: text(row.windows_printer_name),
    site: text(row.site),
    location: text(row.location),
    notes: text(row.notes),
    enabled: bool(row.enabled),
    pollInterval: number(row.poll_interval) || 60,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at)
  }
}

export function listPrinters(): PrinterRecord[] {
  const rows = db()
    .prepare('SELECT * FROM printers ORDER BY site COLLATE NOCASE ASC, name COLLATE NOCASE ASC')
    .all() as Row[]
  return rows.map(mapPrinter)
}

export function getPrinter(id: number): PrinterRecord | null {
  const row = db().prepare('SELECT * FROM printers WHERE id = ?').get(id) as Row | undefined
  return row ? mapPrinter(row) : null
}

function clampPoll(value: number | undefined): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 60
  return Math.min(3600, Math.max(15, Math.round(parsed)))
}

function validateConnection(connectionType: 'network' | 'usb', host: string, windowsPrinterName: string): void {
  if (connectionType === 'network' && !host) {
    throw new Error('Ağ yazıcısı için IP adresi zorunludur.')
  }
  if (connectionType === 'usb' && !windowsPrinterName) {
    throw new Error('Windows yazıcı kuyruğu adı zorunludur.')
  }
}

export function createPrinter(input: CreatePrinterInput): PrinterRecord {
  const now = new Date().toISOString()
  const name = input.name.trim()
  const connectionType = input.connectionType === 'usb' ? 'usb' : 'network'
  const host = input.host?.trim() ?? ''
  const windowsPrinterName = input.windowsPrinterName?.trim() ?? ''
  if (!name) throw new Error('Yazıcı adı zorunludur.')
  validateConnection(connectionType, host, windowsPrinterName)
  const port = Number(input.port ?? 9100)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Geçerli bir port girin (1-65535).')
  }

  try {
    const result = db()
      .prepare(
        `INSERT INTO printers
          (name, host, port, connection_type, windows_printer_name, site, location, notes,
           enabled, poll_interval, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name,
        host,
        port,
        connectionType,
        windowsPrinterName,
        input.site?.trim() ?? '',
        input.location?.trim() ?? '',
        input.notes?.trim() ?? '',
        input.enabled === false ? 0 : 1,
        clampPoll(input.pollInterval),
        now,
        now
      )
    const created = getPrinter(Number(result.lastInsertRowid))
    if (!created) throw new Error('Yazıcı kaydı oluşturulamadı.')
    addAudit(created.id, 'printer.create', `${created.name} eklendi (${created.host || created.windowsPrinterName})`)
    return created
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('UNIQUE')) {
      throw new Error('Bu IP ve port ile kayıtlı bir yazıcı zaten var.')
    }
    throw error
  }
}

export function updatePrinter(id: number, input: UpdatePrinterInput): PrinterRecord {
  const existing = getPrinter(id)
  if (!existing) throw new Error('Yazıcı bulunamadı.')

  const name = input.name?.trim() ?? existing.name
  const connectionType = input.connectionType ?? existing.connectionType
  const host = input.host?.trim() ?? existing.host
  const windowsPrinterName = input.windowsPrinterName?.trim() ?? existing.windowsPrinterName
  if (!name) throw new Error('Yazıcı adı zorunludur.')
  validateConnection(connectionType, host, windowsPrinterName)
  const port = Number(input.port ?? existing.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Geçerli bir port girin (1-65535).')
  }

  try {
    db()
      .prepare(
        `UPDATE printers SET
          name = ?, host = ?, port = ?, connection_type = ?, windows_printer_name = ?,
          site = ?, location = ?, notes = ?, enabled = ?, poll_interval = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        name,
        host,
        port,
        connectionType,
        windowsPrinterName,
        input.site?.trim() ?? existing.site,
        input.location?.trim() ?? existing.location,
        input.notes?.trim() ?? existing.notes,
        input.enabled === undefined ? (existing.enabled ? 1 : 0) : input.enabled ? 1 : 0,
        input.pollInterval === undefined ? existing.pollInterval : clampPoll(input.pollInterval),
        new Date().toISOString(),
        id
      )
    const updated = getPrinter(id)
    if (!updated) throw new Error('Yazıcı güncellenemedi.')
    addAudit(id, 'printer.update', `${updated.name} bilgileri güncellendi`)
    return updated
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('UNIQUE')) {
      throw new Error('Bu IP ve port ile kayıtlı başka bir yazıcı var.')
    }
    throw error
  }
}

export function deletePrinter(id: number): void {
  const printer = getPrinter(id)
  db().prepare('DELETE FROM printers WHERE id = ?').run(id)
  db().prepare('INSERT INTO audit_log (printer_id, action, detail, created_at) VALUES (NULL, ?, ?, ?)').run(
    'printer.delete',
    printer ? `${printer.name} silindi` : `Yazıcı #${id} silindi`,
    new Date().toISOString()
  )
}

export function insertSample(status: PrinterStatus): void {
  db()
    .prepare(
      `INSERT INTO status_samples
        (printer_id, checked_at, online, state, latency_ms, identity_json, memory_json,
         host_status_json, settings_json, counters_json, errors_json, warnings_json, uptime, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      status.printerId,
      status.checkedAt,
      status.online ? 1 : 0,
      status.state,
      status.latencyMs,
      JSON.stringify(status.identity),
      JSON.stringify(status.memory),
      JSON.stringify(status.hostStatus),
      JSON.stringify(status.settings),
      JSON.stringify(status.counters),
      JSON.stringify(status.errors),
      JSON.stringify(status.warnings),
      status.uptime ?? null,
      JSON.stringify(status.raw)
    )
}

function mapSample(row: Row): PrinterStatus {
  const errors = parseJson<PrinterStatus['errors']>(row.errors_json, [])
  const warnings = parseJson<PrinterStatus['warnings']>(row.warnings_json, [])
  return {
    printerId: number(row.printer_id),
    checkedAt: text(row.checked_at),
    online: bool(row.online),
    state: text(row.state) as PrinterStatus['state'],
    latencyMs: row.latency_ms == null ? null : number(row.latency_ms),
    identity: parseJson(row.identity_json, null),
    memory: parseJson(row.memory_json, null),
    hostStatus: parseJson(row.host_status_json, null),
    settings: parseJson(row.settings_json, {}),
    counters: parseJson(row.counters_json, {}),
    errors,
    warnings,
    issues: [...errors, ...warnings],
    paused: text(row.state) === 'paused',
    uptime: row.uptime == null ? undefined : text(row.uptime),
    raw: parseJson(row.raw_json, {})
  }
}

export function latestStatus(id: number): PrinterStatus | null {
  const row = db()
    .prepare('SELECT * FROM status_samples WHERE printer_id = ? ORDER BY id DESC LIMIT 1')
    .get(id) as Row | undefined
  return row ? mapSample(row) : null
}

export function latestStatuses(): Record<number, PrinterStatus> {
  const rows = db()
    .prepare(
      `SELECT s.* FROM status_samples s
       JOIN (SELECT printer_id, MAX(id) AS max_id FROM status_samples GROUP BY printer_id) latest
         ON latest.max_id = s.id`
    )
    .all() as Row[]
  const result: Record<number, PrinterStatus> = {}
  for (const row of rows) {
    const status = mapSample(row)
    result[status.printerId] = status
  }
  return result
}

function mapHistory(row: Row): HistorySample {
  const errors = parseJson<PrinterStatus['errors']>(row.errors_json, [])
  const warnings = parseJson<PrinterStatus['warnings']>(row.warnings_json, [])
  const counters = parseJson<PrinterStatus['counters']>(row.counters_json, {})
  const firstError = errors[0]?.title ?? warnings[0]?.title ?? ''
  return {
    id: number(row.id),
    printerId: number(row.printer_id),
    printerName: text(row.printer_name),
    checkedAt: text(row.checked_at),
    online: bool(row.online),
    state: text(row.state) as HistorySample['state'],
    latencyMs: row.latency_ms == null ? null : number(row.latency_ms),
    errorCount: errors.length,
    warningCount: warnings.length,
    labelCount: typeof counters.labels === 'number' ? counters.labels : null,
    summary: firstError
  }
}

export function listSamples(printerId: number, limit = 100): HistorySample[] {
  const rows = db()
    .prepare(
      `SELECT s.*, p.name AS printer_name FROM status_samples s
       JOIN printers p ON p.id = s.printer_id
       WHERE s.printer_id = ?
       ORDER BY s.id DESC LIMIT ?`
    )
    .all(printerId, Math.min(500, Math.max(1, limit))) as Row[]
  return rows.map(mapHistory)
}

export function listRecentSamples(limit = 200): HistorySample[] {
  const rows = db()
    .prepare(
      `SELECT s.*, p.name AS printer_name FROM status_samples s
       JOIN printers p ON p.id = s.printer_id
       ORDER BY s.id DESC LIMIT ?`
    )
    .all(Math.min(2000, Math.max(1, limit))) as Row[]
  return rows.map(mapHistory)
}

function mapAlert(row: Row): AlertRecord {
  return {
    id: number(row.id),
    printerId: number(row.printer_id),
    printerName: text(row.printer_name),
    code: text(row.code),
    severity: text(row.severity) as AlertRecord['severity'],
    title: text(row.title),
    detail: text(row.detail),
    firstSeen: text(row.first_seen),
    lastSeen: text(row.last_seen),
    resolvedAt: row.resolved_at == null ? null : text(row.resolved_at),
    acknowledged: bool(row.acknowledged)
  }
}

export function listAlerts(limit = 300): AlertRecord[] {
  const rows = db()
    .prepare(
      `SELECT a.*, p.name AS printer_name FROM alerts a
       JOIN printers p ON p.id = a.printer_id
       ORDER BY a.last_seen DESC LIMIT ?`
    )
    .all(Math.min(2000, Math.max(1, limit))) as Row[]
  return rows.map(mapAlert)
}

export function syncAlerts(status: PrinterStatus): void {
  const now = status.checkedAt
  const activeRows = db()
    .prepare('SELECT * FROM alerts WHERE printer_id = ? AND resolved_at IS NULL')
    .all(status.printerId) as Row[]
  const activeByCode = new Map(activeRows.map((row) => [text(row.code), row]))
  const currentCodes = new Set(status.issues.map((issue) => issue.code))

  for (const issue of status.issues) {
    const existing = activeByCode.get(issue.code)
    const detail = [issue.description, issue.action].filter(Boolean).join(' ')
    if (existing) {
      db()
        .prepare(
          'UPDATE alerts SET severity = ?, title = ?, detail = ?, last_seen = ? WHERE id = ?'
        )
        .run(issue.severity, issue.title, detail, now, number(existing.id))
    } else {
      db()
        .prepare(
          `INSERT INTO alerts
            (printer_id, code, severity, title, detail, first_seen, last_seen, resolved_at, acknowledged)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0)`
        )
        .run(status.printerId, issue.code, issue.severity, issue.title, detail, now, now)
    }
  }

  for (const row of activeRows) {
    const code = text(row.code)
    if (!currentCodes.has(code)) {
      db().prepare('UPDATE alerts SET resolved_at = ? WHERE id = ?').run(now, number(row.id))
    }
  }
}

function readSettingsMap(): Record<string, unknown> {
  const rows = db().prepare('SELECT key, value FROM settings').all() as Row[]
  const map: Record<string, unknown> = {}
  for (const row of rows) {
    map[text(row.key)] = parseJson(text(row.value), null)
  }
  return map
}

function stringSetting(map: Record<string, unknown>, key: string, fallback: string): string {
  const value = map[key]
  return typeof value === 'string' ? value : fallback
}

function numberSetting(
  map: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number
): number {
  const value = Number(map[key])
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function boolSetting(map: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = map[key]
  return typeof value === 'boolean' ? value : fallback
}

export function getSettingsInternal(): InternalSettings {
  const map = readSettingsMap()
  return {
    pollInterval: numberSetting(map, 'pollInterval', 60, 15, 3600),
    retentionDays: numberSetting(map, 'retentionDays', 30, 1, 3650),
    theme: map.theme === 'light' ? 'light' : 'dark',
    httpCounters: boolSetting(map, 'httpCounters', true),
    alertCooldownMinutes: numberSetting(map, 'alertCooldownMinutes', 15, 1, 1440),
    notifyOnError: boolSetting(map, 'notifyOnError', true),
    notifyOnWarning: boolSetting(map, 'notifyOnWarning', true),
    notifyOnOffline: boolSetting(map, 'notifyOnOffline', true),
    notifyOnRecovery: boolSetting(map, 'notifyOnRecovery', true),
    telegramEnabled: boolSetting(map, 'telegramEnabled', false),
    telegramChatId: stringSetting(map, 'telegramChatId', ''),
    telegramBotToken: decryptSecret(stringSetting(map, 'telegramBotToken', '')),
    emailEnabled: boolSetting(map, 'emailEnabled', false),
    smtpHost: stringSetting(map, 'smtpHost', ''),
    smtpPort: numberSetting(map, 'smtpPort', 587, 1, 65535),
    smtpSecure: boolSetting(map, 'smtpSecure', false),
    smtpUser: stringSetting(map, 'smtpUser', ''),
    smtpPassword: decryptSecret(stringSetting(map, 'smtpPassword', '')),
    emailFrom: stringSetting(map, 'emailFrom', ''),
    emailTo: stringSetting(map, 'emailTo', ''),
    webhookEnabled: boolSetting(map, 'webhookEnabled', false),
    webhookUrl: stringSetting(map, 'webhookUrl', ''),
    apiEnabled: boolSetting(map, 'apiEnabled', false),
    apiPort: numberSetting(map, 'apiPort', 3210, 1024, 65535),
    apiBind: map.apiBind === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1',
    apiAllowPrint: boolSetting(map, 'apiAllowPrint', false),
    apiToken: decryptSecret(stringSetting(map, 'apiToken', ''))
  }
}

function toPublicSettings(internal: InternalSettings): AppSettings {
  return {
    pollInterval: internal.pollInterval,
    retentionDays: internal.retentionDays,
    theme: internal.theme,
    httpCounters: internal.httpCounters,
    alertCooldownMinutes: internal.alertCooldownMinutes,
    notifyOnError: internal.notifyOnError,
    notifyOnWarning: internal.notifyOnWarning,
    notifyOnOffline: internal.notifyOnOffline,
    notifyOnRecovery: internal.notifyOnRecovery,
    telegramEnabled: internal.telegramEnabled,
    telegramChatId: internal.telegramChatId,
    telegramTokenConfigured: Boolean(internal.telegramBotToken),
    emailEnabled: internal.emailEnabled,
    smtpHost: internal.smtpHost,
    smtpPort: internal.smtpPort,
    smtpSecure: internal.smtpSecure,
    smtpUser: internal.smtpUser,
    emailFrom: internal.emailFrom,
    emailTo: internal.emailTo,
    smtpPasswordConfigured: Boolean(internal.smtpPassword),
    webhookEnabled: internal.webhookEnabled,
    webhookUrl: internal.webhookUrl,
    apiEnabled: internal.apiEnabled,
    apiPort: internal.apiPort,
    apiBind: internal.apiBind,
    apiAllowPrint: internal.apiAllowPrint,
    apiTokenConfigured: Boolean(internal.apiToken)
  }
}

export function getSettings(): AppSettings {
  return toPublicSettings(getSettingsInternal())
}

export function saveSettings(input: SettingsInput): AppSettings {
  const current = getSettingsInternal()
  const next: InternalSettings = { ...current }

  if (input.pollInterval !== undefined) next.pollInterval = numberSetting({ value: input.pollInterval }, 'value', current.pollInterval, 15, 3600)
  if (input.retentionDays !== undefined) next.retentionDays = numberSetting({ value: input.retentionDays }, 'value', current.retentionDays, 1, 3650)
  if (input.theme !== undefined) next.theme = input.theme === 'light' ? 'light' : 'dark'
  if (input.httpCounters !== undefined) next.httpCounters = Boolean(input.httpCounters)
  if (input.alertCooldownMinutes !== undefined) next.alertCooldownMinutes = numberSetting({ value: input.alertCooldownMinutes }, 'value', current.alertCooldownMinutes, 1, 1440)
  if (input.notifyOnError !== undefined) next.notifyOnError = Boolean(input.notifyOnError)
  if (input.notifyOnWarning !== undefined) next.notifyOnWarning = Boolean(input.notifyOnWarning)
  if (input.notifyOnOffline !== undefined) next.notifyOnOffline = Boolean(input.notifyOnOffline)
  if (input.notifyOnRecovery !== undefined) next.notifyOnRecovery = Boolean(input.notifyOnRecovery)
  if (input.telegramEnabled !== undefined) next.telegramEnabled = Boolean(input.telegramEnabled)
  if (input.telegramChatId !== undefined) next.telegramChatId = input.telegramChatId.trim()
  if (input.telegramBotToken === null) next.telegramBotToken = ''
  else if (typeof input.telegramBotToken === 'string' && input.telegramBotToken.trim()) {
    next.telegramBotToken = input.telegramBotToken.trim()
  }
  if (input.emailEnabled !== undefined) next.emailEnabled = Boolean(input.emailEnabled)
  if (input.smtpHost !== undefined) next.smtpHost = input.smtpHost.trim()
  if (input.smtpPort !== undefined) next.smtpPort = numberSetting({ value: input.smtpPort }, 'value', current.smtpPort, 1, 65535)
  if (input.smtpSecure !== undefined) next.smtpSecure = Boolean(input.smtpSecure)
  if (input.smtpUser !== undefined) next.smtpUser = input.smtpUser.trim()
  if (input.smtpPassword === null) next.smtpPassword = ''
  else if (typeof input.smtpPassword === 'string' && input.smtpPassword.trim()) {
    next.smtpPassword = input.smtpPassword
  }
  if (input.emailFrom !== undefined) next.emailFrom = input.emailFrom.trim()
  if (input.emailTo !== undefined) next.emailTo = input.emailTo.trim()
  if (input.webhookEnabled !== undefined) next.webhookEnabled = Boolean(input.webhookEnabled)
  if (input.webhookUrl !== undefined) next.webhookUrl = input.webhookUrl.trim()
  if (input.apiEnabled !== undefined) next.apiEnabled = Boolean(input.apiEnabled)
  if (input.apiPort !== undefined) next.apiPort = numberSetting({ value: input.apiPort }, 'value', current.apiPort, 1024, 65535)
  if (input.apiBind !== undefined) next.apiBind = input.apiBind === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1'
  if (input.apiAllowPrint !== undefined) next.apiAllowPrint = Boolean(input.apiAllowPrint)
  if (input.apiToken === null) next.apiToken = ''
  else if (typeof input.apiToken === 'string' && input.apiToken.trim()) {
    next.apiToken = input.apiToken.trim()
  }

  if (next.apiEnabled && next.apiBind === '0.0.0.0' && !next.apiToken) {
    throw new Error('API 0.0.0.0 adresine açılacaksa bir API token zorunludur.')
  }

  const statement = db().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  const publicKeys: Array<keyof InternalSettings> = [
    'pollInterval',
    'retentionDays',
    'theme',
    'httpCounters',
    'alertCooldownMinutes',
    'notifyOnError',
    'notifyOnWarning',
    'notifyOnOffline',
    'notifyOnRecovery',
    'telegramEnabled',
    'telegramChatId',
    'emailEnabled',
    'smtpHost',
    'smtpPort',
    'smtpSecure',
    'smtpUser',
    'emailFrom',
    'emailTo',
    'webhookEnabled',
    'webhookUrl',
    'apiEnabled',
    'apiPort',
    'apiBind',
    'apiAllowPrint'
  ]
  for (const key of publicKeys) {
    statement.run(key, JSON.stringify(next[key]))
  }
  statement.run('telegramBotToken', JSON.stringify(encryptSecret(next.telegramBotToken)))
  statement.run('smtpPassword', JSON.stringify(encryptSecret(next.smtpPassword)))
  statement.run('apiToken', JSON.stringify(encryptSecret(next.apiToken)))

  addAudit(null, 'settings.update', 'Bildirim / API ayarları güncellendi')
  return toPublicSettings(next)
}

export function cleanupSamples(retentionDays: number): void {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
  db().prepare('DELETE FROM status_samples WHERE checked_at < ?').run(cutoff)
}

export function pruneOldAlerts(retentionDays: number): void {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
  db()
    .prepare('DELETE FROM alerts WHERE resolved_at IS NOT NULL AND resolved_at < ?')
    .run(cutoff)
}

function mapSnapshot(row: Row): ConfigSnapshot {
  return {
    id: number(row.id),
    printerId: number(row.printer_id),
    printerName: text(row.printer_name),
    createdAt: text(row.created_at),
    source: text(row.source) as ConfigSnapshot['source'],
    settings: parseJson<PrinterSettings>(row.settings_json, {}),
    identity: parseJson<PrinterIdentity | null>(row.identity_json, null),
    labelCount: row.label_count == null ? null : number(row.label_count),
    notes: text(row.notes)
  }
}

export function createConfigSnapshot(
  printerId: number,
  source: ConfigSnapshot['source'],
  settings: PrinterSettings,
  identity: PrinterIdentity | null,
  labelCount: number | null,
  notes = ''
): ConfigSnapshot {
  const printer = getPrinter(printerId)
  if (!printer) throw new Error('Yazıcı bulunamadı.')
  const result = db()
    .prepare(
      `INSERT INTO config_snapshots
        (printer_id, created_at, source, settings_json, identity_json, label_count, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      printerId,
      new Date().toISOString(),
      source,
      JSON.stringify(settings),
      JSON.stringify(identity),
      labelCount,
      notes
    )
  const snapshot = getConfigSnapshot(Number(result.lastInsertRowid))
  if (!snapshot) throw new Error('Ayar yedeği oluşturulamadı.')
  addAudit(printerId, 'config.snapshot', `${printer.name} için ayar yedeği alındı`)
  return snapshot
}

export function listConfigSnapshots(printerId: number): ConfigSnapshot[] {
  const rows = db()
    .prepare(
      `SELECT s.*, p.name AS printer_name FROM config_snapshots s
       JOIN printers p ON p.id = s.printer_id
       WHERE s.printer_id = ?
       ORDER BY s.id DESC`
    )
    .all(printerId) as Row[]
  return rows.map(mapSnapshot)
}

export function getConfigSnapshot(id: number): ConfigSnapshot | null {
  const row = db()
    .prepare(
      `SELECT s.*, p.name AS printer_name FROM config_snapshots s
       JOIN printers p ON p.id = s.printer_id
       WHERE s.id = ?`
    )
    .get(id) as Row | undefined
  return row ? mapSnapshot(row) : null
}

export function deleteConfigSnapshot(id: number): void {
  db().prepare('DELETE FROM config_snapshots WHERE id = ?').run(id)
}

function maintenanceStatus(
  task: Pick<MaintenanceTask, 'completedAt' | 'dueDate' | 'dueLabels'>,
  currentLabels: number | null
): MaintenanceTask['status'] {
  if (task.completedAt) return 'done'
  const today = new Date().toISOString().slice(0, 10)
  if (task.dueDate && task.dueDate < today) return 'overdue'
  if (task.dueLabels != null && currentLabels != null && currentLabels >= task.dueLabels) {
    return 'overdue'
  }
  if (task.dueDate) {
    const diff = new Date(`${task.dueDate}T23:59:59`).getTime() - Date.now()
    if (diff <= 7 * 24 * 60 * 60 * 1000) return 'due-soon'
  }
  if (task.dueLabels != null && currentLabels != null && currentLabels >= task.dueLabels - 1000) {
    return 'due-soon'
  }
  return 'open'
}

export function listMaintenanceTasks(printerId?: number): MaintenanceTask[] {
  const params: number[] = []
  let where = ''
  if (printerId !== undefined) {
    where = 'WHERE t.printer_id = ?'
    params.push(printerId)
  }
  const rows = db()
    .prepare(
      `SELECT t.*, p.name AS printer_name FROM maintenance_tasks t
       JOIN printers p ON p.id = t.printer_id
       ${where}
       ORDER BY t.completed_at IS NOT NULL ASC, t.due_date IS NULL ASC, t.due_date ASC, t.id DESC`
    )
    .all(...params) as Row[]
  const latest = latestStatuses()
  return rows.map((row) => {
    const task: MaintenanceTask = {
      id: number(row.id),
      printerId: number(row.printer_id),
      printerName: text(row.printer_name),
      title: text(row.title),
      type: text(row.type),
      dueDate: row.due_date == null ? null : text(row.due_date),
      dueLabels: row.due_labels == null ? null : number(row.due_labels),
      notes: text(row.notes),
      completedAt: row.completed_at == null ? null : text(row.completed_at),
      createdAt: text(row.created_at),
      currentLabels: latest[number(row.printer_id)]?.counters.labels ?? null,
      status: 'open'
    }
    task.status = maintenanceStatus(task, task.currentLabels)
    return task
  })
}

export function createMaintenanceTask(input: MaintenanceInput): MaintenanceTask {
  const printer = getPrinter(input.printerId)
  if (!printer) throw new Error('Yazıcı bulunamadı.')
  const title = input.title.trim()
  if (!title) throw new Error('Görev başlığı zorunludur.')
  const result = db()
    .prepare(
      `INSERT INTO maintenance_tasks
        (printer_id, title, type, due_date, due_labels, notes, completed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`
    )
    .run(
      input.printerId,
      title,
      input.type?.trim() || 'other',
      input.dueDate?.trim() || null,
      input.dueLabels == null ? null : Math.max(0, Math.round(Number(input.dueLabels))),
      input.notes?.trim() ?? '',
      new Date().toISOString()
    )
  addAudit(input.printerId, 'maintenance.create', `${printer.name}: ${title}`)
  const tasks = listMaintenanceTasks(input.printerId)
  const created = tasks.find((task) => task.id === Number(result.lastInsertRowid))
  if (!created) throw new Error('Bakım görevi oluşturulamadı.')
  return created
}

export function completeMaintenanceTask(id: number): void {
  const row = db().prepare('SELECT * FROM maintenance_tasks WHERE id = ?').get(id) as Row | undefined
  if (!row) throw new Error('Bakım görevi bulunamadı.')
  db().prepare('UPDATE maintenance_tasks SET completed_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    id
  )
  addAudit(number(row.printer_id), 'maintenance.complete', text(row.title))
}

export function deleteMaintenanceTask(id: number): void {
  db().prepare('DELETE FROM maintenance_tasks WHERE id = ?').run(id)
}

export function addAudit(printerId: number | null, action: string, detail: string): void {
  db()
    .prepare('INSERT INTO audit_log (printer_id, action, detail, created_at) VALUES (?, ?, ?, ?)')
    .run(printerId, action, detail, new Date().toISOString())
}

export function listAudit(limit = 300): AuditEntry[] {
  const rows = db()
    .prepare(
      `SELECT a.*, p.name AS printer_name FROM audit_log a
       LEFT JOIN printers p ON p.id = a.printer_id
       ORDER BY a.id DESC LIMIT ?`
    )
    .all(Math.min(2000, Math.max(1, limit))) as Row[]
  return rows.map((row) => ({
    id: number(row.id),
    printerId: row.printer_id == null ? null : number(row.printer_id),
    printerName: row.printer_name == null ? null : text(row.printer_name),
    action: text(row.action),
    detail: text(row.detail),
    createdAt: text(row.created_at)
  }))
}

export function addFirmwareUpdate(
  printerId: number,
  versionBefore: string,
  fileName: string,
  fileSize: number
): number {
  const result = db()
    .prepare(
      `INSERT INTO firmware_updates
        (printer_id, version_before, file_name, file_size, started_at, completed_at, status, message)
       VALUES (?, ?, ?, ?, ?, NULL, 'started', '')`
    )
    .run(printerId, versionBefore, fileName, fileSize, new Date().toISOString())
  return Number(result.lastInsertRowid)
}

export function completeFirmwareUpdate(id: number, status: string, message: string): void {
  db()
    .prepare('UPDATE firmware_updates SET completed_at = ?, status = ?, message = ? WHERE id = ?')
    .run(new Date().toISOString(), status, message, id)
}

export function listFirmwareUpdates(printerId?: number): FirmwareUpdateRecord[] {
  const rows = (
    printerId === undefined
      ? db()
          .prepare(
            `SELECT f.*, p.name AS printer_name FROM firmware_updates f
             JOIN printers p ON p.id = f.printer_id
             ORDER BY f.id DESC LIMIT 200`
          )
          .all()
      : db()
          .prepare(
            `SELECT f.*, p.name AS printer_name FROM firmware_updates f
             JOIN printers p ON p.id = f.printer_id
             WHERE f.printer_id = ?
             ORDER BY f.id DESC LIMIT 200`
          )
          .all(printerId)
  ) as Row[]
  return rows.map((row) => ({
    id: number(row.id),
    printerId: number(row.printer_id),
    printerName: text(row.printer_name),
    versionBefore: text(row.version_before),
    fileName: text(row.file_name),
    fileSize: number(row.file_size),
    startedAt: text(row.started_at),
    completedAt: row.completed_at == null ? null : text(row.completed_at),
    status: text(row.status),
    message: text(row.message)
  }))
}

export interface ReportSample {
  printerId: number
  printerName: string
  site: string
  checkedAt: string
  online: boolean
  state: string
  labelCount: number | null
  errorCount: number
  warningCount: number
}

export function samplesInRange(from: string, to: string): ReportSample[] {
  const rows = db()
    .prepare(
      `SELECT s.*, p.name AS printer_name, p.site AS site FROM status_samples s
       JOIN printers p ON p.id = s.printer_id
       WHERE s.checked_at >= ? AND s.checked_at <= ?
       ORDER BY s.printer_id ASC, s.checked_at ASC`
    )
    .all(from, to) as Row[]
  return rows.map((row) => {
    const errors = parseJson<PrinterStatus['errors']>(row.errors_json, [])
    const warnings = parseJson<PrinterStatus['warnings']>(row.warnings_json, [])
    const counters = parseJson<PrinterStatus['counters']>(row.counters_json, {})
    return {
      printerId: number(row.printer_id),
      printerName: text(row.printer_name),
      site: text(row.site),
      checkedAt: text(row.checked_at),
      online: bool(row.online),
      state: text(row.state),
      labelCount: typeof counters.labels === 'number' ? counters.labels : null,
      errorCount: errors.length,
      warningCount: warnings.length
    }
  })
}

export function alertsInRange(from: string, to: string): AlertRecord[] {
  const rows = db()
    .prepare(
      `SELECT a.*, p.name AS printer_name FROM alerts a
       JOIN printers p ON p.id = a.printer_id
       WHERE a.last_seen >= ? AND a.first_seen <= ?
       ORDER BY a.first_seen ASC`
    )
    .all(from, to) as Row[]
  return rows.map(mapAlert)
}

export function ensureUserDataDir(): string {
  const dir = app.getPath('userData')
  mkdirSync(dirname(join(dir, 'x')), { recursive: true })
  return dir
}
