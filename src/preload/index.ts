import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ZebraApi } from '@shared/api'
import type { FirmwareProgress, PrinterStatus } from '@shared/types'

const api: ZebraApi = {
  listPrinters: () => ipcRenderer.invoke('printers:list'),
  createPrinter: (input) => ipcRenderer.invoke('printers:create', input),
  updatePrinter: (id, input) => ipcRenderer.invoke('printers:update', id, input),
  deletePrinter: (id) => ipcRenderer.invoke('printers:delete', id),
  probePrinter: (host, port) => ipcRenderer.invoke('printers:probe', host, port),
  refreshPrinter: (id) => ipcRenderer.invoke('printers:refresh', id),
  refreshAll: () => ipcRenderer.invoke('printers:refreshAll'),
  latestStatuses: () => ipcRenderer.invoke('status:latestAll'),
  latestStatus: (id) => ipcRenderer.invoke('status:latest', id),
  samples: (printerId, limit) => ipcRenderer.invoke('history:samples', printerId, limit),
  recentSamples: (limit) => ipcRenderer.invoke('history:recent', limit),
  alerts: (limit) => ipcRenderer.invoke('history:alerts', limit),
  audit: (limit) => ipcRenderer.invoke('history:audit', limit),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  testTelegram: (input) => ipcRenderer.invoke('notifications:testTelegram', input),
  testEmail: (input) => ipcRenderer.invoke('notifications:testEmail', input),
  testWebhook: (url) => ipcRenderer.invoke('notifications:testWebhook', url),
  localSubnets: () => ipcRenderer.invoke('discovery:subnets'),
  discoverPrinters: (subnet) => ipcRenderer.invoke('discovery:scan', subnet),
  listWindowsPrinters: () => ipcRenderer.invoke('windows:printers'),
  testPrint: (input) => ipcRenderer.invoke('printer:printZpl', input),
  quickTestPrint: (printerId) => ipcRenderer.invoke('printer:quickTest', printerId),
  printConfigLabel: (printerId) => ipcRenderer.invoke('printer:printConfigLabel', printerId),
  applyPrinterSettings: (printerId, settings) =>
    ipcRenderer.invoke('printer:applySettings', printerId, settings),
  configSnapshots: (printerId) => ipcRenderer.invoke('config:list', printerId),
  createConfigSnapshot: (printerId, notes) => ipcRenderer.invoke('config:create', printerId, notes),
  restoreConfigSnapshot: (snapshotId) => ipcRenderer.invoke('config:restore', snapshotId),
  applySnapshotToAll: (snapshotId) => ipcRenderer.invoke('config:applyAll', snapshotId),
  deleteConfigSnapshot: (snapshotId) => ipcRenderer.invoke('config:delete', snapshotId),
  selectFirmwareFile: () => ipcRenderer.invoke('firmware:select'),
  uploadFirmware: (printerId, filePath) => ipcRenderer.invoke('firmware:upload', printerId, filePath),
  firmwareHistory: (printerId) => ipcRenderer.invoke('firmware:history', printerId),
  maintenanceTasks: (printerId) => ipcRenderer.invoke('maintenance:list', printerId),
  createMaintenanceTask: (input) => ipcRenderer.invoke('maintenance:create', input),
  completeMaintenanceTask: (id) => ipcRenderer.invoke('maintenance:complete', id),
  deleteMaintenanceTask: (id) => ipcRenderer.invoke('maintenance:delete', id),
  buildReport: (from, to) => ipcRenderer.invoke('reports:build', from, to),
  exportReportXlsx: (from, to) => ipcRenderer.invoke('reports:exportXlsx', from, to),
  exportReportPdf: (from, to) => ipcRenderer.invoke('reports:exportPdf', from, to),
  exportDiagnostics: () => ipcRenderer.invoke('diagnostics:export'),
  apiStatus: () => ipcRenderer.invoke('api:status'),
  appInfo: () => ipcRenderer.invoke('app:info'),
  onPrinterUpdate: (callback) => {
    const listener = (_event: IpcRendererEvent, status: PrinterStatus): void => {
      callback(status)
    }
    ipcRenderer.on('printer:update', listener)
    return () => {
      ipcRenderer.removeListener('printer:update', listener)
    }
  },
  onFirmwareProgress: (callback) => {
    const listener = (_event: IpcRendererEvent, progress: FirmwareProgress): void => {
      callback(progress)
    }
    ipcRenderer.on('firmware:progress', listener)
    return () => {
      ipcRenderer.removeListener('firmware:progress', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
