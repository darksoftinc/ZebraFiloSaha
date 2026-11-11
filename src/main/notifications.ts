import nodemailer from 'nodemailer'
import type {
  EmailTestInput,
  PrinterRecord,
  PrinterStatus,
  StatusIssue,
  TelegramTestInput,
  TestNotificationResult
} from '@shared/types'
import { getSettingsInternal } from './db'
import { log } from './log'

interface InternalNotificationSettings {
  telegramEnabled: boolean
  telegramChatId: string
  telegramBotToken: string
  emailEnabled: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPassword: string
  emailFrom: string
  emailTo: string
  webhookEnabled: boolean
  webhookUrl: string
  notifyOnError: boolean
  notifyOnWarning: boolean
  notifyOnOffline: boolean
  notifyOnRecovery: boolean
  alertCooldownMinutes: number
}

const lastNotified = new Map<string, number>()

function formatTimestamp(): string {
  return new Date().toLocaleString('tr-TR')
}

function printerLabel(printer: PrinterRecord): string {
  return `${printer.name} (${printer.host || printer.windowsPrinterName || 'yerel'})`
}

function stateTitle(state: PrinterStatus['state']): string {
  switch (state) {
    case 'error':
      return 'HATA'
    case 'warning':
      return 'UYARI'
    case 'paused':
      return 'DURAKLATILDI'
    case 'offline':
      return 'ÇEVRİMDIŞI'
    default:
      return 'DURUM'
  }
}

export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string
): Promise<TestNotificationResult> {
  if (!token || !chatId) {
    return { ok: false, message: 'Telegram bot token ve chat ID gerekli.' }
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true
      }),
      signal: AbortSignal.timeout(15000)
    })
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; description?: string }
    if (!response.ok || payload.ok === false) {
      return {
        ok: false,
        message: payload.description ?? `Telegram HTTP ${response.status}`
      }
    }
    return { ok: true, message: 'Telegram mesajı gönderildi.' }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function sendEmailMessage(
  config: {
    host: string
    port: number
    secure: boolean
    user: string
    password: string
    from: string
    to: string
  },
  subject: string,
  text: string
): Promise<TestNotificationResult> {
  if (!config.host || !config.to || !config.from) {
    return { ok: false, message: 'SMTP sunucusu, gönderen ve alıcı adresi gerekli.' }
  }
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000
    })
    await transporter.sendMail({
      from: config.from,
      to: config.to,
      subject,
      text
    })
    return { ok: true, message: 'E-posta gönderildi.' }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function sendWebhookMessage(
  url: string,
  payload: unknown
): Promise<TestNotificationResult> {
  if (!url) return { ok: false, message: 'Webhook adresi gerekli.' }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000)
    })
    if (!response.ok) {
      return { ok: false, message: `Webhook HTTP ${response.status}` }
    }
    return { ok: true, message: 'Webhook gönderildi.' }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function testTelegram(input: TelegramTestInput): Promise<TestNotificationResult> {
  const settings = getSettingsInternal()
  const token = input.token?.trim() || settings.telegramBotToken
  const chatId = input.chatId?.trim() || settings.telegramChatId
  return sendTelegramMessage(
    token,
    chatId,
    `Zebra Saha test mesajı\n${formatTimestamp()}`
  )
}

export async function testEmail(input: EmailTestInput): Promise<TestNotificationResult> {
  const settings = getSettingsInternal()
  return sendEmailMessage(
    {
      host: input.smtpHost?.trim() || settings.smtpHost,
      port: Number(input.smtpPort ?? settings.smtpPort) || 587,
      secure: input.smtpSecure ?? settings.smtpSecure,
      user: input.smtpUser?.trim() || settings.smtpUser,
      password: input.smtpPassword || settings.smtpPassword,
      from: input.emailFrom?.trim() || settings.emailFrom,
      to: input.emailTo?.trim() || settings.emailTo
    },
    'Zebra Saha test e-postası',
    `Zebra Saha bildirim altyapısı çalışıyor.\n\nTarih: ${formatTimestamp()}`
  )
}

export async function testWebhook(url?: string): Promise<TestNotificationResult> {
  const settings = getSettingsInternal()
  return sendWebhookMessage(url?.trim() || settings.webhookUrl, {
    event: 'test',
    app: 'Zebra Saha',
    timestamp: new Date().toISOString()
  })
}

function shouldNotify(issue: StatusIssue, settings: InternalNotificationSettings): boolean {
  if (issue.code === 'OFFLINE') return settings.notifyOnOffline
  if (issue.severity === 'error') return settings.notifyOnError
  return settings.notifyOnWarning
}

function buildMessage(
  printer: PrinterRecord,
  status: PrinterStatus,
  issues: StatusIssue[],
  recovery: boolean
): { subject: string; text: string } {
  if (recovery) {
    const subject = `Zebra Saha: ${printer.name} — sorun giderildi`
    const text = [
      `✅ SORUN GİDERİLDİ — ${printerLabel(printer)}`,
      `Durum: ${stateTitle(status.state)}`,
      `Konum: ${printer.site || '-'} / ${printer.location || '-'}`,
      `Zaman: ${formatTimestamp()}`
    ].join('\n')
    return { subject, text }
  }

  const subject = `Zebra Saha: ${printer.name} — ${stateTitle(status.state)}`
  const lines = [
    `⚠️ ${stateTitle(status.state)} — ${printerLabel(printer)}`,
    `Konum: ${printer.site || '-'} / ${printer.location || '-'}`,
    `Zaman: ${formatTimestamp()}`,
    ''
  ]
  for (const issue of issues) {
    lines.push(`• ${issue.title}`)
    if (issue.description) lines.push(`  ${issue.description}`)
    if (issue.action) lines.push(`  Öneri: ${issue.action}`)
  }
  lines.push('', 'Zebra Saha filo konsolu')
  return { subject, text: lines.join('\n') }
}

export async function notifyStatusChange(
  printer: PrinterRecord,
  previous: PrinterStatus | null,
  status: PrinterStatus
): Promise<void> {
  try {
    const settings = getSettingsInternal()
    if (!settings.telegramEnabled && !settings.emailEnabled && !settings.webhookEnabled) return

    const previousCodes = new Set((previous?.issues ?? []).map((issue) => issue.code))
    const currentCodes = new Set(status.issues.map((issue) => issue.code))
    const newIssues = status.issues.filter(
      (issue) => !previousCodes.has(issue.code) && shouldNotify(issue, settings)
    )
    const resolvedIssues = (previous?.issues ?? []).filter(
      (issue) => !currentCodes.has(issue.code)
    )

    const cooldownMs = settings.alertCooldownMinutes * 60 * 1000
    const now = Date.now()

    const eligible = newIssues.filter((issue) => {
      const key = `${printer.id}:${issue.code}`
      const last = lastNotified.get(key) ?? 0
      if (now - last < cooldownMs) return false
      lastNotified.set(key, now)
      return true
    })

    if (eligible.length > 0) {
      const message = buildMessage(printer, status, eligible, false)
      await dispatch(settings, message.subject, message.text, {
        event: 'printer.issue',
        timestamp: status.checkedAt,
        printer: {
          id: printer.id,
          name: printer.name,
          host: printer.host,
          site: printer.site,
          location: printer.location
        },
        state: status.state,
        issues: eligible
      })
      log('bildirim gönderildi', {
        printer: printer.name,
        issues: eligible.map((issue) => issue.code)
      })
    }

    if (settings.notifyOnRecovery && resolvedIssues.length > 0) {
      const key = `${printer.id}:recovery`
      const last = lastNotified.get(key) ?? 0
      if (now - last >= cooldownMs) {
        lastNotified.set(key, now)
        const message = buildMessage(printer, status, [], true)
        await dispatch(settings, message.subject, message.text, {
          event: 'printer.recovery',
          timestamp: status.checkedAt,
          printer: {
            id: printer.id,
            name: printer.name,
            host: printer.host,
            site: printer.site,
            location: printer.location
          },
          state: status.state,
          resolved: resolvedIssues.map((issue) => issue.code)
        })
      }
    }
  } catch (error) {
    log('bildirim hatası', {
      printer: printer.name,
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

async function dispatch(
  settings: InternalNotificationSettings,
  subject: string,
  text: string,
  webhookPayload: unknown
): Promise<void> {
  const tasks: Array<Promise<TestNotificationResult>> = []
  if (settings.telegramEnabled && settings.telegramBotToken && settings.telegramChatId) {
    tasks.push(sendTelegramMessage(settings.telegramBotToken, settings.telegramChatId, text))
  }
  if (settings.emailEnabled && settings.smtpHost && settings.emailTo && settings.emailFrom) {
    tasks.push(
      sendEmailMessage(
        {
          host: settings.smtpHost,
          port: settings.smtpPort,
          secure: settings.smtpSecure,
          user: settings.smtpUser,
          password: settings.smtpPassword,
          from: settings.emailFrom,
          to: settings.emailTo
        },
        subject,
        text
      )
    )
  }
  if (settings.webhookEnabled && settings.webhookUrl) {
    tasks.push(sendWebhookMessage(settings.webhookUrl, webhookPayload))
  }
  const results = await Promise.all(tasks)
  for (const result of results) {
    if (!result.ok) log('bildirim kanalı hatası', result.message)
  }
}
