import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { useMantineColorScheme } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import type {
  AppSettings,
  CreatePrinterInput,
  ExportResult,
  PrinterRecord,
  PrinterStatus,
  SettingsInput,
  UpdatePrinterInput
} from '@shared/types'
import { stateOrder } from './lib/format'

const DEFAULT_SETTINGS: AppSettings = {
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
  telegramTokenConfigured: false,
  emailEnabled: false,
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  emailFrom: '',
  emailTo: '',
  smtpPasswordConfigured: false,
  webhookEnabled: false,
  webhookUrl: '',
  apiEnabled: false,
  apiPort: 3210,
  apiBind: '127.0.0.1',
  apiAllowPrint: false,
  apiTokenConfigured: false
}

interface Summary {
  total: number
  online: number
  errors: number
  warnings: number
  offline: number
}

interface AppDataContextValue {
  loading: boolean
  printers: PrinterRecord[]
  sortedPrinters: PrinterRecord[]
  statuses: Record<number, PrinterStatus>
  settings: AppSettings
  summary: Summary
  refreshingAll: boolean
  refreshingIds: Set<number>
  testingIds: Set<number>
  getPrinter: (id: number) => PrinterRecord | undefined
  getStatus: (id: number) => PrinterStatus | undefined
  createPrinter: (input: CreatePrinterInput) => Promise<PrinterRecord>
  updatePrinter: (id: number, input: UpdatePrinterInput) => Promise<PrinterRecord>
  deletePrinter: (id: number) => Promise<void>
  refreshPrinter: (id: number, silent?: boolean) => Promise<PrinterStatus | null>
  quickTestPrint: (id: number) => Promise<void>
  refreshAll: () => Promise<void>
  saveSettings: (input: SettingsInput) => Promise<void>
  exportDiagnostics: () => Promise<ExportResult>
}

const AppDataContext = createContext<AppDataContextValue | null>(null)

export function readableError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim()
}

function showError(error: unknown, title = 'İşlem başarısız'): void {
  notifications.show({
    color: 'red',
    title,
    message: readableError(error),
    autoClose: 6000
  })
}

export function AppDataProvider({ children }: { children: ReactNode }): ReactNode {
  const [loading, setLoading] = useState(true)
  const [printers, setPrinters] = useState<PrinterRecord[]>([])
  const [statuses, setStatuses] = useState<Record<number, PrinterStatus>>({})
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [refreshingAll, setRefreshingAll] = useState(false)
  const [refreshingIds, setRefreshingIds] = useState<Set<number>>(new Set())
  const [testingIds, setTestingIds] = useState<Set<number>>(new Set())
  const { setColorScheme } = useMantineColorScheme()

  useEffect(() => {
    setColorScheme(settings.theme)
  }, [settings.theme, setColorScheme])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const [printerList, latest, loadedSettings] = await Promise.all([
          window.api.listPrinters(),
          window.api.latestStatuses(),
          window.api.getSettings()
        ])
        if (!active) return
        setPrinters(printerList)
        setStatuses(latest)
        setSettings(loadedSettings)
      } catch (error) {
        if (active) showError(error, 'Başlangıç verileri yüklenemedi')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.api.onPrinterUpdate((status) => {
      setStatuses((previous) => ({ ...previous, [status.printerId]: status }))
    })
    return unsubscribe
  }, [])

  const refreshPrinter = useCallback(async (id: number, silent = false): Promise<PrinterStatus | null> => {
    setRefreshingIds((previous) => new Set(previous).add(id))
    try {
      const status = await window.api.refreshPrinter(id)
      setStatuses((previous) => ({ ...previous, [status.printerId]: status }))
      return status
    } catch (error) {
      if (!silent) showError(error, 'Yazıcı sorgulanamadı')
      return null
    } finally {
      setRefreshingIds((previous) => {
        const next = new Set(previous)
        next.delete(id)
        return next
      })
    }
  }, [])

  const quickTestPrint = useCallback(
    async (id: number): Promise<void> => {
      const printer = printers.find((item) => item.id === id)
      setTestingIds((previous) => new Set(previous).add(id))
      try {
        const result = await window.api.quickTestPrint(id)
        notifications.show({
          color: result.ok ? 'teal' : 'red',
          title: result.ok ? 'Test baskısı gönderildi' : 'Test baskısı başarısız',
          message: printer ? `${printer.name}: ${result.message}` : result.message,
          autoClose: result.ok ? 4500 : 8000
        })
      } catch (error) {
        showError(error, 'Test baskısı gönderilemedi')
      } finally {
        setTestingIds((previous) => {
          const next = new Set(previous)
          next.delete(id)
          return next
        })
      }
    },
    [printers]
  )

  const createPrinter = useCallback(
    async (input: CreatePrinterInput): Promise<PrinterRecord> => {
      const created = await window.api.createPrinter(input)
      setPrinters((previous) => [...previous, created])
      notifications.show({
        color: 'teal',
        title: 'Yazıcı eklendi',
        message: `${created.name} kaydedildi, ilk sorgu başlatıldı.`
      })
      void refreshPrinter(created.id, true)
      return created
    },
    [refreshPrinter]
  )

  const updatePrinter = useCallback(
    async (id: number, input: UpdatePrinterInput): Promise<PrinterRecord> => {
      const updated = await window.api.updatePrinter(id, input)
      setPrinters((previous) => previous.map((printer) => (printer.id === id ? updated : printer)))
      notifications.show({
        color: 'teal',
        title: 'Yazıcı güncellendi',
        message: `${updated.name} bilgileri kaydedildi.`
      })
      void refreshPrinter(updated.id, true)
      return updated
    },
    [refreshPrinter]
  )

  const deletePrinter = useCallback(async (id: number): Promise<void> => {
    await window.api.deletePrinter(id)
    setPrinters((previous) => previous.filter((printer) => printer.id !== id))
    setStatuses((previous) => {
      const next = { ...previous }
      delete next[id]
      return next
    })
    notifications.show({
      color: 'gray',
      title: 'Yazıcı silindi',
      message: 'Kayıt ve geçmiş verileri kaldırıldı.'
    })
  }, [])

  const refreshAll = useCallback(async (): Promise<void> => {
    if (printers.length === 0) {
      notifications.show({
        color: 'blue',
        title: 'Yazıcı yok',
        message: 'Önce bir yazıcı ekleyin.'
      })
      return
    }
    setRefreshingAll(true)
    try {
      const result = await window.api.refreshAll()
      setStatuses((previous) => {
        const next = { ...previous }
        for (const status of result) next[status.printerId] = status
        return next
      })
      notifications.show({
        color: 'teal',
        title: 'Yenileme tamamlandı',
        message: `${result.length} yazıcı sorgulandı.`
      })
    } catch (error) {
      showError(error, 'Yazıcılar yenilenemedi')
    } finally {
      setRefreshingAll(false)
    }
  }, [printers.length])

  const saveSettings = useCallback(async (input: SettingsInput): Promise<void> => {
    const saved = await window.api.saveSettings(input)
    setSettings(saved)
    notifications.show({
      color: 'teal',
      title: 'Ayarlar kaydedildi',
      message: 'Değişiklikler uygulandı.'
    })
  }, [])

  const exportDiagnostics = useCallback(async (): Promise<ExportResult> => {
    try {
      const result = await window.api.exportDiagnostics()
      if (result.ok) {
        notifications.show({
          color: 'teal',
          title: 'Tanılama paketi hazır',
          message: result.path ?? result.message,
          autoClose: 8000
        })
      } else {
        notifications.show({
          color: 'gray',
          title: 'Dışa aktarma',
          message: result.message
        })
      }
      return result
    } catch (error) {
      showError(error, 'Tanılama paketi oluşturulamadı')
      return { ok: false, message: readableError(error) }
    }
  }, [])

  const getPrinter = useCallback(
    (id: number): PrinterRecord | undefined => printers.find((printer) => printer.id === id),
    [printers]
  )

  const getStatus = useCallback((id: number): PrinterStatus | undefined => statuses[id], [statuses])

  const sortedPrinters = useMemo(
    () =>
      [...printers].sort((a, b) => {
        const diff = stateOrder(statuses[a.id]?.state) - stateOrder(statuses[b.id]?.state)
        return diff !== 0 ? diff : a.name.localeCompare(b.name, 'tr')
      }),
    [printers, statuses]
  )

  const summary = useMemo<Summary>(() => {
    let online = 0
    let errors = 0
    let warnings = 0
    let offline = 0

    for (const printer of printers) {
      const status = statuses[printer.id]
      if (!status) {
        offline += 1
        continue
      }
      if (status.online) online += 1
      if (status.state === 'error') errors += 1
      else if (status.state === 'warning' || status.state === 'paused') warnings += 1
      else if (status.state === 'offline' || status.state === 'unknown') offline += 1
    }

    return { total: printers.length, online, errors, warnings, offline }
  }, [printers, statuses])

  const value: AppDataContextValue = {
    loading,
    printers,
    sortedPrinters,
    statuses,
    settings,
    summary,
    refreshingAll,
    refreshingIds,
    testingIds,
    getPrinter,
    getStatus,
    createPrinter,
    updatePrinter,
    deletePrinter,
    refreshPrinter,
    quickTestPrint,
    refreshAll,
    saveSettings,
    exportDiagnostics
  }

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData(): AppDataContextValue {
  const context = useContext(AppDataContext)
  if (!context) throw new Error('useAppData, AppDataProvider içinde kullanılmalıdır.')
  return context
}
