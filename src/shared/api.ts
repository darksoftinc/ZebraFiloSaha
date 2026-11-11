import type {
  AlertRecord,
  ApiStatus,
  AppInfo,
  AppSettings,
  AuditEntry,
  ConfigApplyAllResult,
  ConfigApplyResult,
  ConfigSnapshot,
  CreatePrinterInput,
  DeleteResult,
  DiscoveryResult,
  EmailTestInput,
  ExportResult,
  FirmwareFile,
  FirmwareUpdateRecord,
  HistorySample,
  LocalSubnet,
  MaintenanceInput,
  MaintenanceTask,
  PrinterRecord,
  PrinterSettings,
  PrinterStatus,
  ProbeResult,
  ReportResult,
  SettingsInput,
  TelegramTestInput,
  TestNotificationResult,
  UpdatePrinterInput,
  WindowsPrinterInfo,
  ZplPrintInput
} from './types'

export interface ZebraApi {
  listPrinters: () => Promise<PrinterRecord[]>
  createPrinter: (input: CreatePrinterInput) => Promise<PrinterRecord>
  updatePrinter: (id: number, input: UpdatePrinterInput) => Promise<PrinterRecord>
  deletePrinter: (id: number) => Promise<DeleteResult>
  probePrinter: (host: string, port?: number) => Promise<ProbeResult>
  refreshPrinter: (id: number) => Promise<PrinterStatus>
  refreshAll: () => Promise<PrinterStatus[]>
  latestStatuses: () => Promise<Record<number, PrinterStatus>>
  latestStatus: (id: number) => Promise<PrinterStatus | null>
  samples: (printerId: number, limit?: number) => Promise<HistorySample[]>
  recentSamples: (limit?: number) => Promise<HistorySample[]>
  alerts: (limit?: number) => Promise<AlertRecord[]>
  audit: (limit?: number) => Promise<AuditEntry[]>
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: SettingsInput) => Promise<AppSettings>
  testTelegram: (input: TelegramTestInput) => Promise<TestNotificationResult>
  testEmail: (input: EmailTestInput) => Promise<TestNotificationResult>
  testWebhook: (url?: string) => Promise<TestNotificationResult>
  localSubnets: () => Promise<LocalSubnet[]>
  discoverPrinters: (subnet?: string) => Promise<DiscoveryResult>
  listWindowsPrinters: () => Promise<WindowsPrinterInfo[]>
  testPrint: (input: ZplPrintInput) => Promise<TestNotificationResult>
  quickTestPrint: (printerId: number) => Promise<TestNotificationResult>
  printConfigLabel: (printerId: number) => Promise<TestNotificationResult>
  applyPrinterSettings: (printerId: number, settings: PrinterSettings) => Promise<ConfigApplyResult>
  configSnapshots: (printerId: number) => Promise<ConfigSnapshot[]>
  createConfigSnapshot: (printerId: number, notes?: string) => Promise<ConfigSnapshot>
  restoreConfigSnapshot: (snapshotId: number) => Promise<ConfigApplyResult>
  applySnapshotToAll: (snapshotId: number) => Promise<ConfigApplyAllResult>
  deleteConfigSnapshot: (snapshotId: number) => Promise<DeleteResult>
  selectFirmwareFile: () => Promise<FirmwareFile | null>
  uploadFirmware: (printerId: number, filePath: string) => Promise<TestNotificationResult>
  firmwareHistory: (printerId?: number) => Promise<FirmwareUpdateRecord[]>
  maintenanceTasks: (printerId?: number) => Promise<MaintenanceTask[]>
  createMaintenanceTask: (input: MaintenanceInput) => Promise<MaintenanceTask>
  completeMaintenanceTask: (id: number) => Promise<DeleteResult>
  deleteMaintenanceTask: (id: number) => Promise<DeleteResult>
  buildReport: (from: string, to: string) => Promise<ReportResult>
  exportReportXlsx: (from: string, to: string) => Promise<ExportResult>
  exportReportPdf: (from: string, to: string) => Promise<ExportResult>
  exportDiagnostics: () => Promise<ExportResult>
  apiStatus: () => Promise<ApiStatus>
  appInfo: () => Promise<AppInfo>
  onPrinterUpdate: (callback: (status: PrinterStatus) => void) => () => void
  onFirmwareProgress: (callback: (progress: { printerId: number; sentBytes: number; totalBytes: number; percent: number }) => void) => () => void
}
