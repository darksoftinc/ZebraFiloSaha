import { networkInterfaces } from 'node:os'
import { Socket } from 'node:net'
import type { DiscoveredPrinter, DiscoveryResult, LocalSubnet } from '@shared/types'
import { listPrinters } from './db'
import { queryOnce } from './printer/client'
import { parseHostIdentification } from './printer/status'

export function localSubnets(): LocalSubnet[] {
  const result: LocalSubnet[] = []
  const seen = new Set<string>()
  const interfaces = networkInterfaces()
  for (const [interfaceName, addresses] of Object.entries(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue
      if (address.address.startsWith('169.254.')) continue
      const parts = address.address.split('.')
      if (parts.length !== 4) continue
      const cidr = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
      if (seen.has(cidr)) continue
      seen.add(cidr)
      result.push({ cidr, interfaceName, address: address.address })
    }
  }

  const priority = (interfaceName: string): number => {
    const name = interfaceName.toLowerCase()
    if (name.includes('tailscale')) return 10
    if (name.includes('vethernet') || name.includes('docker') || name.includes('vmware') || name.includes('virtualbox')) return 8
    if (name.includes('wi-fi') || name.includes('wifi') || name.includes('wlan')) return 0
    if (name.includes('ethernet') || name.includes('eth') || name.includes('lan')) return 1
    return 5
  }

  return result.sort((left, right) => {
    const priorityDiff = priority(left.interfaceName) - priority(right.interfaceName)
    return priorityDiff !== 0 ? priorityDiff : left.cidr.localeCompare(right.cidr)
  })
}

function normalizeSubnet(input?: string): { prefix: string; cidr: string; hosts: string[] } {
  const raw = (input?.trim() || localSubnets()[0]?.cidr || '192.168.1.0/24').replace(/\s+/g, '')
  const base = raw.includes('/') ? raw.split('/')[0] : raw
  const parts = base.split('.')
  if (parts.length < 3) throw new Error('Alt ağ 192.168.1.0/24 biçiminde olmalıdır.')
  const prefix = `${Number(parts[0])}.${Number(parts[1])}.${Number(parts[2])}`
  if (prefix.split('.').some((part) => !Number.isInteger(Number(part)) || Number(part) < 0 || Number(part) > 255)) {
    throw new Error('Geçersiz alt ağ.')
  }
  const hosts = Array.from({ length: 254 }, (_, index) => `${prefix}.${index + 1}`)
  return { prefix, cidr: `${prefix}.0/24`, hosts }
}

function probeTcp(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket()
    let settled = false
    const finish = (value: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, host)
  })
}

async function identifyHost(host: string, port: number): Promise<DiscoveredPrinter | null> {
  const hi = await queryOnce(host, port, '~HI', {
    connectTimeoutMs: 900,
    idleMs: 350,
    hardTimeoutMs: 1800
  })
  const identity = parseHostIdentification(hi.data)

  let serial: string | undefined
  let status: string | undefined
  let zebraPage = false
  try {
    const response = await fetch(`http://${host}/`, {
      signal: AbortSignal.timeout(1500)
    })
    if (response.ok) {
      const html = await response.text()
      zebraPage = /zebra technologies|zt\d|zd\d|zq\d/i.test(html)
      const title = html.match(/<TITLE>([^<]*)<\/TITLE>/i)?.[1]?.trim()
      if (title) {
        const parts = title.split(' - ')
        serial = parts[0]?.trim() || undefined
        status = parts.slice(1).join(' - ').trim() || undefined
      }
    }
  } catch {
    // HTTP kapalı olabilir; 9100 yanıtı yeterli.
  }

  const model = identity?.model
  const looksZebra = Boolean(model && /^(ZT|ZD|ZQ|ZM|ZE|ZR|ZX|Zebra)/i.test(model)) || zebraPage
  if (!looksZebra) return null

  return {
    host,
    port,
    model,
    firmware: identity?.firmware,
    serial,
    status,
    alreadyAdded: false
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let index = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = index++
      results[current] = await worker(items[current])
    }
  })
  await Promise.all(runners)
  return results
}

export async function discoverPrinters(subnet?: string): Promise<DiscoveryResult> {
  const started = Date.now()
  const normalized = normalizeSubnet(subnet)
  const existing = new Set(
    listPrinters()
      .filter((printer) => printer.connectionType === 'network')
      .map((printer) => `${printer.host}:${printer.port}`)
  )

  const candidates = await mapWithConcurrency(normalized.hosts, 64, async (host) => {
    const open = await probeTcp(host, 9100, 320)
    if (!open) return null
    return identifyHost(host, 9100)
  })

  const found: DiscoveredPrinter[] = []
  for (const candidate of candidates) {
    if (!candidate) continue
    candidate.alreadyAdded = existing.has(`${candidate.host}:${candidate.port}`)
    found.push(candidate)
  }
  found.sort((a, b) => {
    const left = a.host.split('.').map(Number)
    const right = b.host.split('.').map(Number)
    for (let i = 0; i < 4; i += 1) {
      if (left[i] !== right[i]) return left[i] - right[i]
    }
    return 0
  })

  return {
    subnet: normalized.cidr,
    scanned: normalized.hosts.length,
    found,
    durationMs: Date.now() - started
  }
}
