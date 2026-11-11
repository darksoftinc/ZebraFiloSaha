import type { PrinterRecord, PrinterStatus } from '@shared/types'
import { getPrinter, getSettings, insertSample, latestStatus, listPrinters, syncAlerts } from './db'
import { log } from './log'
import { readWindowsPrinter } from './management'
import { notifyStatusChange } from './notifications'
import { offlineStatus, readPrinter } from './printer/client'

type UpdateHandler = (status: PrinterStatus) => void

class PrinterPoller {
  private timer: NodeJS.Timeout | null = null
  private inFlight = new Map<number, Promise<PrinterStatus>>()
  private lastPoll = new Map<number, number>()
  private onUpdate: UpdateHandler | null = null
  private started = false

  setUpdateHandler(handler: UpdateHandler): void {
    this.onUpdate = handler
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.timer = setInterval(() => {
      void this.tick()
    }, 10_000)
    void this.tick()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.started = false
  }

  private async tick(): Promise<void> {
    const printers = listPrinters().filter((printer) => printer.enabled)
    const now = Date.now()
    for (const printer of printers) {
      if (this.inFlight.has(printer.id)) continue
      const last = this.lastPoll.get(printer.id) ?? 0
      if (now - last < printer.pollInterval * 1000) continue
      void this.poll(printer)
    }
  }

  poll(printer: PrinterRecord, options: { httpCounters?: boolean } = {}): Promise<PrinterStatus> {
    const existing = this.inFlight.get(printer.id)
    if (existing) return existing

    const task = this.performPoll(printer, options).finally(() => {
      this.inFlight.delete(printer.id)
    })
    this.inFlight.set(printer.id, task)
    return task
  }

  private async performPoll(
    printer: PrinterRecord,
    options: { httpCounters?: boolean }
  ): Promise<PrinterStatus> {
    this.lastPoll.set(printer.id, Date.now())
    try {
      const settings = getSettings()
      const previous = latestStatus(printer.id)
      const status =
        printer.connectionType === 'usb'
          ? await readWindowsPrinter(printer)
          : await readPrinter(printer.id, printer.host, printer.port, {
              httpCounters: options.httpCounters ?? settings.httpCounters
            })
      log('poll bitti', {
        id: printer.id,
        online: status.online,
        state: status.state,
        latency: status.latencyMs,
        errors: status.errors.length,
        labels: status.counters.labels
      })
      insertSample(status)
      syncAlerts(status)
      void notifyStatusChange(printer, previous, status)
      this.onUpdate?.(status)
      return status
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log('poll hata', { id: printer.id, message })
      const status = offlineStatus(printer.id, message)
      try {
        insertSample(status)
        syncAlerts(status)
      } catch {
        // Yazıcı bu sırada silinmiş olabilir.
      }
      this.onUpdate?.(status)
      return status
    }
  }

  async refresh(printerId: number): Promise<PrinterStatus> {
    const printer = getPrinter(printerId)
    if (!printer) throw new Error('Yazıcı bulunamadı.')
    return this.poll(printer, { httpCounters: true })
  }

  async refreshAll(): Promise<PrinterStatus[]> {
    const printers = listPrinters().filter((printer) => printer.enabled)
    const results: PrinterStatus[] = []
    for (const printer of printers) {
      results.push(await this.poll(printer, { httpCounters: true }))
    }
    return results
  }

  isPolling(printerId: number): boolean {
    return this.inFlight.has(printerId)
  }
}

export const poller = new PrinterPoller()
