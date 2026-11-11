export type ConnectionType = 'network' | 'usb'

export type PrinterState = 'ready' | 'warning' | 'paused' | 'error' | 'offline' | 'unknown'

export type IssueSeverity = 'error' | 'warning' | 'info'

export interface PrinterRecord {
  id: number
  name: string
  host: string
  port: number
  connectionType: ConnectionType
  windowsPrinterName: string
  site: string
  location: string
  notes: string
  enabled: boolean
  pollInterval: number
  createdAt: string
  updatedAt: string
}

export interface CreatePrinterInput {
  name: string
  host?: string
  port?: number
  connectionType?: ConnectionType
  windowsPrinterName?: string
  site?: string
  location?: string
  notes?: string
  enabled?: boolean
  pollInterval?: number
}

export interface UpdatePrinterInput {
  name?: string
  host?: string
  port?: number
  connectionType?: ConnectionType
  windowsPrinterName?: string
  site?: string
  location?: string
  notes?: string
  enabled?: boolean
  pollInterval?: number
}

export interface StatusIssue {
  code: string
  title: string
  description: string
  action: string
  severity: IssueSeverity
  rawCode?: string
}

export interface HostStatus {
  paperOut: boolean
  pause: boolean
  labelLengthDots: number
  formatsInBuffer: number
  bufferFull: boolean
  diagnosticMode: boolean
  partialFormat: boolean
  corruptRam: boolean
  underTemperature: boolean
  overTemperature: boolean
  headUp: boolean
  ribbonOut: boolean
  thermalTransfer: boolean
  printMode: string
  printWidthMode: number
  labelWaiting: boolean
  labelsRemaining: number
  graphicsInMemory: number
}

export interface PrinterIdentity {
  model: string
  firmware: string
  dotsPerMm: number
  ramKb: number
  serial?: string
  friendlyName?: string
  configurationNumber?: string
  linkOsVersion?: string
}

export interface PrinterMemory {
  totalKb: number
  maxKb: number
  freeKb: number
}

export interface PrinterSettings {
  darkness?: number
  speedIps?: number
  printMethod?: string
  mediaType?: string
  printWidthDots?: number
  printMode?: string
  headCloseAction?: string
  mediaPowerUp?: string
  reprintMode?: string
  tearOff?: number
  energyStar?: string
  dhcp?: string
  labelLengthDots?: number
}

export interface PrinterCounters {
  labels?: number
  inches?: number
  km?: number
  source?: 'printer' | 'http' | 'estimated' | 'none'
}

export interface RawResponses {
  hostStatus?: string
  systemStatus?: string
  identification?: string
  memory?: string
  settings?: string
  error?: string
}

export interface PrinterStatus {
  printerId: number
  checkedAt: string
  online: boolean
  state: PrinterState
  latencyMs: number | null
  identity: PrinterIdentity | null
  memory: PrinterMemory | null
  hostStatus: HostStatus | null
  settings: PrinterSettings
  counters: PrinterCounters
  errors: StatusIssue[]
  warnings: StatusIssue[]
  issues: StatusIssue[]
  paused: boolean
  uptime?: string
  raw: RawResponses
}

export interface HistorySample {
  id: number
  printerId: number
  printerName: string
  checkedAt: string
  online: boolean
  state: PrinterState
  latencyMs: number | null
  errorCount: number
  warningCount: number
  labelCount: number | null
  summary: string
}

export interface AlertRecord {
  id: number
  printerId: number
  printerName: string
  code: string
  severity: IssueSeverity
  title: string
  detail: string
  firstSeen: string
  lastSeen: string
  resolvedAt: string | null
  acknowledged: boolean
}

export interface AuditEntry {
  id: number
  printerId: number | null
  printerName: string | null
  action: string
  detail: string
  createdAt: string
}

export interface AppSettings {
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
  telegramTokenConfigured: boolean
  emailEnabled: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  emailFrom: string
  emailTo: string
  smtpPasswordConfigured: boolean
  webhookEnabled: boolean
  webhookUrl: string
  apiEnabled: boolean
  apiPort: number
  apiBind: '127.0.0.1' | '0.0.0.0'
  apiAllowPrint: boolean
  apiTokenConfigured: boolean
}

export interface SettingsInput {
  pollInterval?: number
  retentionDays?: number
  theme?: 'dark' | 'light'
  httpCounters?: boolean
  alertCooldownMinutes?: number
  notifyOnError?: boolean
  notifyOnWarning?: boolean
  notifyOnOffline?: boolean
  notifyOnRecovery?: boolean
  telegramEnabled?: boolean
  telegramChatId?: string
  telegramBotToken?: string | null
  emailEnabled?: boolean
  smtpHost?: string
  smtpPort?: number
  smtpSecure?: boolean
  smtpUser?: string
  smtpPassword?: string | null
  emailFrom?: string
  emailTo?: string
  webhookEnabled?: boolean
  webhookUrl?: string
  apiEnabled?: boolean
  apiPort?: number
  apiBind?: '127.0.0.1' | '0.0.0.0'
  apiAllowPrint?: boolean
  apiToken?: string | null
}

export interface AppInfo {
  version: string
  electron: string
  node: string
  chrome: string
  dbPath: string
  userData: string
}

export interface ProbeResult {
  ok: boolean
  message: string
  status?: PrinterStatus
}

export interface DeleteResult {
  ok: boolean
}

export interface ExportResult {
  ok: boolean
  path?: string
  message: string
}

export interface PrintResult {
  ok: boolean
  message: string
}

export interface ZplPrintInput {
  printerId: number
  zpl: string
}

export interface ConfigSnapshot {
  id: number
  printerId: number
  printerName: string
  createdAt: string
  source: 'manual' | 'template' | 'pre-restore' | 'pre-change'
  settings: PrinterSettings
  identity: PrinterIdentity | null
  labelCount: number | null
  notes: string
}

export interface ConfigDiffRow {
  key: string
  label: string
  current: string
  snapshot: string
  changed: boolean
}

export interface ConfigApplyResult {
  ok: boolean
  message: string
  applied: string[]
  skipped: string[]
}

export interface ConfigApplyAllResult {
  ok: boolean
  message: string
  results: Array<{ printerId: number; printerName: string; ok: boolean; message: string }>
}

export interface FirmwareFile {
  path: string
  name: string
  size: number
}

export interface FirmwareProgress {
  printerId: number
  sentBytes: number
  totalBytes: number
  percent: number
}

export interface FirmwareUpdateRecord {
  id: number
  printerId: number
  printerName: string
  versionBefore: string
  fileName: string
  fileSize: number
  startedAt: string
  completedAt: string | null
  status: string
  message: string
}

export interface MaintenanceTask {
  id: number
  printerId: number
  printerName: string
  title: string
  type: string
  dueDate: string | null
  dueLabels: number | null
  notes: string
  completedAt: string | null
  createdAt: string
  currentLabels: number | null
  status: 'open' | 'done' | 'overdue' | 'due-soon'
}

export interface MaintenanceInput {
  printerId: number
  title: string
  type?: string
  dueDate?: string | null
  dueLabels?: number | null
  notes?: string
}

export interface ReportRow {
  printerId: number
  printerName: string
  site: string
  labelsStart: number | null
  labelsEnd: number | null
  labelsPrinted: number | null
  samples: number
  errorEvents: number
  warningEvents: number
  downtimeMinutes: number
  mtbfHours: number | null
  mttrMinutes: number | null
  onlinePercent: number
}

export interface ReportResult {
  from: string
  to: string
  rows: ReportRow[]
  totals: {
    labelsPrinted: number
    errorEvents: number
    warningEvents: number
    downtimeMinutes: number
  }
}

export interface LocalSubnet {
  cidr: string
  interfaceName: string
  address: string
}

export interface DiscoveredPrinter {
  host: string
  port: number
  model?: string
  firmware?: string
  serial?: string
  status?: string
  alreadyAdded: boolean
}

export interface DiscoveryResult {
  subnet: string
  scanned: number
  found: DiscoveredPrinter[]
  durationMs: number
}

export interface TestNotificationResult {
  ok: boolean
  message: string
}

export interface TelegramTestInput {
  token?: string
  chatId?: string
}

export interface EmailTestInput {
  smtpHost?: string
  smtpPort?: number
  smtpSecure?: boolean
  smtpUser?: string
  smtpPassword?: string
  emailFrom?: string
  emailTo?: string
}

export interface WindowsPrinterInfo {
  name: string
  driverName: string
  portName: string
  status: string
}

export interface ApiStatus {
  running: boolean
  port: number
  bind: string
  message: string
}
