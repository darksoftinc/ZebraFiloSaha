import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { app } from 'electron'
import type { ApiStatus } from '@shared/types'
import {
  addAudit,
  getPrinter,
  getSettingsInternal,
  latestStatus,
  latestStatuses,
  listAlerts,
  listPrinters
} from './db'
import { log } from './log'
import { printZpl } from './management'
import { poller } from './poller'
import { buildReport } from './reports'

let server: Server | null = null
let currentStatus: ApiStatus = {
  running: false,
  port: 0,
  bind: '',
  message: 'API kapalı'
}

export function getApiStatus(): ApiStatus {
  return currentStatus
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload, null, 2)
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  })
  response.end(body)
}

function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8')
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error('İstek gövdesi 2 MB sınırını aştı.'))
        request.destroy()
      }
    })
    request.on('end', () => {
      if (!body.trim()) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(body))
      } catch {
        reject(new Error('Geçersiz JSON gövdesi.'))
      }
    })
    request.on('error', reject)
  })
}

function authorized(request: IncomingMessage): boolean {
  const settings = getSettingsInternal()
  if (!settings.apiToken) return true
  const authorization = request.headers.authorization ?? ''
  const headerToken = request.headers['x-api-token']
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : typeof headerToken === 'string'
      ? headerToken.trim()
      : ''
  return token === settings.apiToken
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const path = url.pathname
  const method = request.method ?? 'GET'

  if (path === '/api/health') {
    sendJson(response, 200, {
      ok: true,
      app: 'Zebra Saha',
      version: app.getVersion(),
      time: new Date().toISOString()
    })
    return
  }

  if (!authorized(request)) {
    sendJson(response, 401, { ok: false, error: 'Yetkisiz. API token gerekli.' })
    return
  }

  if (method === 'GET' && path === '/api/printers') {
    const statuses = latestStatuses()
    sendJson(response, 200, {
      ok: true,
      printers: listPrinters().map((printer) => ({
        ...printer,
        status: statuses[printer.id] ?? null
      }))
    })
    return
  }

  const printerMatch = path.match(/^\/api\/printers\/(\d+)(?:\/(print|refresh))?$/)
  if (printerMatch) {
    const printerId = Number(printerMatch[1])
    const action = printerMatch[2]
    const printer = getPrinter(printerId)
    if (!printer) {
      sendJson(response, 404, { ok: false, error: 'Yazıcı bulunamadı.' })
      return
    }

    if (method === 'GET' && !action) {
      sendJson(response, 200, {
        ok: true,
        printer,
        status: latestStatus(printerId)
      })
      return
    }

    if (method === 'POST' && action === 'refresh') {
      const status = await poller.refresh(printerId)
      sendJson(response, 200, { ok: true, printer, status })
      return
    }

    if (method === 'POST' && action === 'print') {
      const settings = getSettingsInternal()
      if (!settings.apiAllowPrint) {
        sendJson(response, 403, {
          ok: false,
          error: 'API üzerinden yazdırma kapalı. Ayarlar > Entegrasyon bölümünden açın.'
        })
        return
      }
      const body = (await readJson(request)) as { zpl?: unknown }
      if (typeof body.zpl !== 'string' || !body.zpl.trim()) {
        sendJson(response, 400, { ok: false, error: 'zpl alanı zorunludur.' })
        return
      }
      const result = await printZpl(printer, body.zpl)
      addAudit(
        printerId,
        'api.print',
        `${printer.name} için API üzerinden ZPL gönderildi (${body.zpl.length} bayt)`
      )
      sendJson(response, result.ok ? 200 : 502, result)
      return
    }

    sendJson(response, 405, { ok: false, error: 'Desteklenmeyen metot.' })
    return
  }

  if (method === 'GET' && path === '/api/alerts') {
    const active = url.searchParams.get('active') === '1'
    const limit = Number(url.searchParams.get('limit') ?? 100)
    const alerts = listAlerts(Number.isFinite(limit) ? limit : 100).filter(
      (alert) => !active || alert.resolvedAt === null
    )
    sendJson(response, 200, { ok: true, alerts })
    return
  }

  if (method === 'GET' && path === '/api/reports') {
    const now = new Date()
    const from = url.searchParams.get('from') ?? new Date(now.getTime() - 7 * 86400000).toISOString()
    const to = url.searchParams.get('to') ?? now.toISOString()
    try {
      const report = buildReport(from, to)
      sendJson(response, 200, { ok: true, report })
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
    return
  }

  sendJson(response, 404, { ok: false, error: 'Bulunamadı.' })
}

export async function stopApiServer(): Promise<void> {
  const active = server
  server = null
  if (!active) {
    currentStatus = { ...currentStatus, running: false, message: 'API kapalı' }
    return
  }
  await new Promise<void>((resolve) => {
    active.close(() => resolve())
  })
  currentStatus = { ...currentStatus, running: false, message: 'API kapalı' }
}

export async function restartApiServer(): Promise<ApiStatus> {
  await stopApiServer()
  const settings = getSettingsInternal()
  if (!settings.apiEnabled) {
    currentStatus = {
      running: false,
      port: settings.apiPort,
      bind: settings.apiBind,
      message: 'API kapalı'
    }
    return currentStatus
  }
  if (settings.apiBind === '0.0.0.0' && !settings.apiToken) {
    currentStatus = {
      running: false,
      port: settings.apiPort,
      bind: settings.apiBind,
      message: '0.0.0.0 için API token zorunludur.'
    }
    return currentStatus
  }

  return new Promise((resolve) => {
    const httpServer = createServer((request, response) => {
      void handleRequest(request, response).catch((error) => {
        if (!response.headersSent) {
          sendJson(response, 500, {
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          })
        } else {
          response.end()
        }
      })
    })

    httpServer.once('error', (error) => {
      currentStatus = {
        running: false,
        port: settings.apiPort,
        bind: settings.apiBind,
        message: error.message
      }
      log('API başlatılamadı', error.message)
      resolve(currentStatus)
    })

    httpServer.listen(settings.apiPort, settings.apiBind, () => {
      server = httpServer
      currentStatus = {
        running: true,
        port: settings.apiPort,
        bind: settings.apiBind,
        message: `http://${settings.apiBind}:${settings.apiPort}`
      }
      log('API hazır', currentStatus.message)
      resolve(currentStatus)
    })
  })
}
