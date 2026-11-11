import { app } from 'electron'
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

let logPath = ''

export function initLog(): void {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  logPath = join(dir, 'main.log')
  try {
    if (statSync(logPath).size > 5 * 1024 * 1024) {
      renameSync(logPath, `${logPath}.old`)
    }
  } catch {
    // Dosya henüz yoksa sorun değil.
  }
  log('--- uygulama başladı ---')
}

export function log(message: string, data?: unknown): void {
  if (!logPath) return
  const suffix = data === undefined ? '' : ` ${JSON.stringify(data)}`
  try {
    appendFileSync(logPath, `${new Date().toISOString()} ${message}${suffix}\n`, 'utf8')
  } catch {
    // Log yazılamazsa uygulamayı durdurma.
  }
}
