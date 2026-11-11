import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/tr'
import type { IssueSeverity, PrinterState } from '@shared/types'

dayjs.extend(relativeTime)
dayjs.locale('tr')

export function formatNumber(value: number | undefined | null, digits = 0): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('tr-TR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0
  }).format(value)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = dayjs(value)
  return date.isValid() ? date.format('DD.MM.YYYY HH:mm:ss') : '—'
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = dayjs(value)
  return date.isValid() ? date.format('HH:mm:ss') : '—'
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return '—'
  const date = dayjs(value)
  return date.isValid() ? date.fromNow() : '—'
}

export function formatKm(km: number | undefined): string {
  if (km === undefined || !Number.isFinite(km)) return '—'
  if (km < 1) return `${formatNumber(km * 1000, 0)} m`
  return `${formatNumber(km, 1)} km`
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms === undefined || ms === null) return '—'
  return `${formatNumber(ms, 0)} ms`
}

export function formatUptime(value: string | undefined): string {
  if (!value) return '—'
  const days = Number(value.match(/(\d+)\s+days?/i)?.[1] ?? 0)
  const hours = Number(value.match(/(\d+)\s+hours?/i)?.[1] ?? 0)
  const minutes = Number(value.match(/(\d+)\s+(?:mins?|minutes?)/i)?.[1] ?? 0)
  const seconds = Number(value.match(/(\d+)\s+(?:secs?|seconds?)/i)?.[1] ?? 0)
  if (!days && !hours && !minutes && !seconds) return value

  const parts: string[] = []
  if (days > 0) parts.push(`${days} gün`)
  if (hours > 0) parts.push(`${hours} saat`)
  if (minutes > 0) parts.push(`${minutes} dk`)
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds} sn`)
  return parts.join(' ')
}

export function stateLabel(state: PrinterState | undefined): string {
  switch (state) {
    case 'ready':
      return 'Hazır'
    case 'warning':
      return 'Uyarı'
    case 'paused':
      return 'Duraklatıldı'
    case 'error':
      return 'Hata'
    case 'offline':
      return 'Çevrimdışı'
    default:
      return 'Bilinmiyor'
  }
}

export function stateColor(state: PrinterState | undefined): string {
  switch (state) {
    case 'ready':
      return 'teal'
    case 'warning':
      return 'yellow'
    case 'paused':
      return 'orange'
    case 'error':
      return 'red'
    default:
      return 'gray'
  }
}

export function stateOrder(state: PrinterState | undefined): number {
  switch (state) {
    case 'error':
      return 0
    case 'offline':
      return 1
    case 'warning':
      return 2
    case 'paused':
      return 3
    case 'ready':
      return 4
    default:
      return 5
  }
}

export function severityLabel(severity: IssueSeverity): string {
  switch (severity) {
    case 'error':
      return 'Hata'
    case 'warning':
      return 'Uyarı'
    default:
      return 'Bilgi'
  }
}

export function severityColor(severity: IssueSeverity): string {
  switch (severity) {
    case 'error':
      return 'red'
    case 'warning':
      return 'yellow'
    default:
      return 'blue'
  }
}

export function formatMbFromKb(kb: number | undefined): string {
  if (kb === undefined || !Number.isFinite(kb)) return '—'
  return `${formatNumber(kb / 1024, 1)} MB`
}

export function shortHost(host: string): string {
  return host.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
}
