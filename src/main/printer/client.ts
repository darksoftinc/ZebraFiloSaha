import { Socket } from 'node:net'
import type { PrinterCounters, PrinterStatus } from '@shared/types'
import { log } from '../log'
import {
  buildIssues,
  decodeSystemStatus,
  deriveState,
  parseHostIdentification,
  parseHostMemory,
  parseHostStatus,
  parseSgdBatch,
  toNumber
} from './status'

export interface QueryResult {
  connected: boolean
  latencyMs: number | null
  data: string
  error?: string
  durationMs: number
}

interface QueryOptions {
  connectTimeoutMs?: number
  idleMs?: number
  hardTimeoutMs?: number
}

export interface ReadOptions {
  httpCounters?: boolean
  idleMs?: number
  hardTimeoutMs?: number
}

const SGD_KEYS = [
  'odometer.total_label_count',
  'media.speed',
  'print.tone',
  'ezpl.print_method',
  'ezpl.media_type',
  'ezpl.print_width',
  'ezpl.print_mode',
  'ezpl.head_close_action',
  'ezpl.media_power_up',
  'ezpl.reprint_mode',
  'ezpl.tear_off',
  'power.energy_star.enable',
  'ip.dhcp.enable',
  'device.uptime',
  'appl.link_os_version',
  'device.friendly_name',
  'device.configuration_number',
  'device.unique_id'
] as const

function runQuery(host: string, port: number, payload: string, options: QueryOptions = {}): Promise<QueryResult> {
  const connectTimeoutMs = options.connectTimeoutMs ?? 4000
  const idleMs = options.idleMs ?? 500
  const hardTimeoutMs = options.hardTimeoutMs ?? 6000

  return new Promise((resolve) => {
    const socket = new Socket()
    const startedAt = Date.now()
    let connected = false
    let latencyMs: number | null = null
    let data = ''
    let settled = false
    let idleTimer: NodeJS.Timeout | null = null
    let hardTimer: NodeJS.Timeout | null = null

    const finish = (error?: string): void => {
      if (settled) return
      settled = true
      if (idleTimer) clearTimeout(idleTimer)
      if (hardTimer) clearTimeout(hardTimer)
      socket.destroy()
      if (error || !connected) {
        log('sorgu hatası', {
          host,
          port,
          payload: payload.split('\r\n')[0],
          connected,
          latencyMs,
          bytes: data.length,
          error
        })
      }
      resolve({
        connected,
        latencyMs,
        data,
        error,
        durationMs: Date.now() - startedAt
      })
    }

    const armIdle = (): void => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => finish(), idleMs)
    }

    hardTimer = setTimeout(() => finish('Zaman aşımı'), hardTimeoutMs)
    socket.setTimeout(connectTimeoutMs)

    socket.once('connect', () => {
      connected = true
      latencyMs = Date.now() - startedAt
      socket.setTimeout(0)
      socket.write(payload)
      armIdle()
    })

    socket.on('data', (chunk) => {
      data += chunk.toString('latin1')
      armIdle()
    })

    socket.once('error', (error) => {
      finish(error.message)
    })

    socket.once('timeout', () => {
      finish('Bağlantı zaman aşımı')
    })

    socket.connect(port, host)
  })
}

export function queryOnce(host: string, port: number, command: string, options: QueryOptions = {}): Promise<QueryResult> {
  return runQuery(host, port, `${command}\r\n`, options)
}

export function querySgdBatch(host: string, port: number, keys: readonly string[], options: QueryOptions = {}): Promise<QueryResult> {
  const payload = `${keys.map((key) => `! U1 getvar "${key}"`).join('\r\n')}\r\n`
  return runQuery(host, port, payload, { idleMs: 600, hardTimeoutMs: 5000, ...options })
}

export function offlineStatus(printerId: number, error?: string): PrinterStatus {
  return {
    printerId,
    checkedAt: new Date().toISOString(),
    online: false,
    state: 'offline',
    latencyMs: null,
    identity: null,
    memory: null,
    hostStatus: null,
    settings: {},
    counters: {},
    errors: [
      {
        code: 'OFFLINE',
        title: 'Çevrimdışı',
        description: 'Yazıcıya ağdan ulaşılamıyor.',
        action: 'IP adresi, güvenlik duvarı ve kablo bağlantısını kontrol edin; yazıcı açık mı?',
        severity: 'error'
      }
    ],
    warnings: [],
    issues: [
      {
        code: 'OFFLINE',
        title: 'Çevrimdışı',
        description: 'Yazıcıya ağdan ulaşılamıyor.',
        action: 'IP adresi, güvenlik duvarı ve kablo bağlantısını kontrol edin; yazıcı açık mı?',
        severity: 'error'
      }
    ],
    paused: false,
    raw: error ? { error } : {}
  }
}

export async function fetchHttpCounters(host: string): Promise<PrinterCounters | null> {
  try {
    const response = await fetch(`http://${host}/config.html`, {
      signal: AbortSignal.timeout(2500)
    })
    if (!response.ok) return null
    const html = await response.text()
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')

    const labelsMatch = text.match(/([\d,]+)\s+LABELS\s+NONRESET CNTR/i)
    const inchesMatch = text.match(/([\d,]+)\s+IN\s+NONRESET CNTR/i)
    const cmMatch = text.match(/([\d,]+)\s+CM\s+NONRESET CNTR/i)
    if (!labelsMatch && !inchesMatch && !cmMatch) return null

    const labels = labelsMatch ? Number.parseInt(labelsMatch[1].replace(/,/g, ''), 10) : undefined
    const inches = inchesMatch ? Number.parseInt(inchesMatch[1].replace(/,/g, ''), 10) : undefined
    const cm = cmMatch ? Number.parseInt(cmMatch[1].replace(/,/g, ''), 10) : undefined
    const km = cm !== undefined ? cm / 100000 : inches !== undefined ? inches * 0.0000254 : undefined

    return { labels, inches, km, source: 'http' }
  } catch {
    return null
  }
}

export async function readPrinter(
  printerId: number,
  host: string,
  port: number,
  options: ReadOptions = {}
): Promise<PrinterStatus> {
  const timeoutOptions: QueryOptions = {
    idleMs: options.idleMs ?? 500,
    hardTimeoutMs: options.hardTimeoutMs ?? 6000
  }

  let hs = await queryOnce(host, port, '~HS', timeoutOptions)
  if (!hs.connected) {
    // Energy Star / uyku modundan çıkan yazıcılar ilk bağlantıyı geciktirebilir.
    // Çevrimdışı damgası vurmadan önce daha uzun timeout ile bir kez daha dene.
    await new Promise((resolve) => setTimeout(resolve, 900))
    hs = await queryOnce(host, port, '~HS', {
      connectTimeoutMs: 7000,
      idleMs: 700,
      hardTimeoutMs: 9000
    })
  }
  if (!hs.connected) {
    return offlineStatus(printerId, hs.error)
  }

  const hqes = await queryOnce(host, port, '~HQES', timeoutOptions)
  const hi = await queryOnce(host, port, '~HI', timeoutOptions)
  const hm = await queryOnce(host, port, '~HM', timeoutOptions)
  const sgd = await querySgdBatch(host, port, SGD_KEYS)

  const values = parseSgdBatch(sgd.data)
  const value = (index: number): string | undefined => values[index]

  const identity = parseHostIdentification(hi.data)
  const memory = parseHostMemory(hm.data)
  const hostStatus = parseHostStatus(hs.data)
  const decoded = decodeSystemStatus(hqes.data)
  const sawStatusResponse = Boolean(hs.data || hqes.data)
  const issues = buildIssues({
    online: true,
    decoded,
    hostStatus,
    sawStatusResponse
  })
  const paused = decoded.paused || hostStatus?.pause === true
  const state = deriveState({
    online: true,
    issues,
    paused,
    sawStatusResponse
  })

  if (identity) {
    identity.serial = value(17) ?? value(15)
    identity.friendlyName = value(15)
    identity.configurationNumber = value(16)
    identity.linkOsVersion = value(14)
  }

  const labels = toNumber(value(0))
  const labelLengthDots = hostStatus?.labelLengthDots ?? 0
  const dotsPerMm = identity?.dotsPerMm ?? 8
  const estimatedKm =
    labels !== undefined && labelLengthDots > 0
      ? (labels * (labelLengthDots / dotsPerMm)) / 1_000_000
      : undefined

  let counters: PrinterCounters = {
    labels,
    km: estimatedKm,
    source: 'estimated'
  }

  if (options.httpCounters !== false) {
    const httpCounters = await fetchHttpCounters(host)
    if (httpCounters) {
      counters = {
        ...httpCounters,
        labels: httpCounters.labels ?? labels,
        km: httpCounters.km ?? estimatedKm,
        source: 'http'
      }
    }
  }

  const settings = {
    darkness: toNumber(value(2)),
    speedIps: toNumber(value(1)),
    printMethod: value(3),
    mediaType: value(4),
    printWidthDots: toNumber(value(5)),
    printMode: value(6),
    headCloseAction: value(7),
    mediaPowerUp: value(8),
    reprintMode: value(9),
    tearOff: toNumber(value(10)),
    energyStar: value(11),
    dhcp: value(12),
    labelLengthDots: hostStatus?.labelLengthDots
  }

  const errors = issues.filter((issue) => issue.severity === 'error')
  const warnings = issues.filter((issue) => issue.severity !== 'error')

  return {
    printerId,
    checkedAt: new Date().toISOString(),
    online: true,
    state,
    latencyMs: hs.latencyMs ?? hqes.latencyMs ?? null,
    identity,
    memory,
    hostStatus,
    settings,
    counters,
    errors,
    warnings,
    issues,
    paused,
    uptime: value(13),
    raw: {
      hostStatus: hs.data || undefined,
      systemStatus: hqes.data || undefined,
      identification: hi.data || undefined,
      memory: hm.data || undefined,
      settings: sgd.data || undefined,
      error: hs.error ?? hqes.error ?? hi.error ?? hm.error ?? sgd.error
    }
  }
}

export async function probePrinter(host: string, port = 9100): Promise<{ status: PrinterStatus; message: string }> {
  const status = await readPrinter(0, host, port, { httpCounters: false, idleMs: 500 })
  if (!status.online) {
    return { status, message: 'Bağlantı kurulamadı. IP, port ve ağ bağlantısını kontrol edin.' }
  }
  const model = status.identity?.model ?? 'Zebra yazıcı'
  const firmware = status.identity?.firmware ? ` / ${status.identity.firmware}` : ''
  const stateText =
    status.state === 'ready'
      ? 'hazır'
      : status.state === 'error'
        ? 'hata durumunda'
        : status.state === 'paused'
          ? 'duraklatılmış'
          : status.state === 'warning'
            ? 'uyarı durumunda'
            : 'durum bilinmiyor'
  return {
    status,
    message: `${model}${firmware} bulundu; yazıcı ${stateText}.`
  }
}
