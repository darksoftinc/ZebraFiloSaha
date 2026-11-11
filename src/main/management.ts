import { execFile } from 'node:child_process'
import { createReadStream, existsSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Socket } from 'node:net'
import { promisify } from 'node:util'
import type {
  ConfigApplyResult,
  FirmwareProgress,
  PrinterRecord,
  PrinterSettings,
  PrinterStatus,
  StatusIssue,
  WindowsPrinterInfo
} from '@shared/types'

const execFileAsync = promisify(execFile)

const POWERSHELL = 'powershell.exe'

function powershell(script: string): Promise<string> {
  return execFileAsync(
    POWERSHELL,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { timeout: 20000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 }
  ).then((result) => result.stdout)
}

function sendRawSocket(
  host: string,
  port: number,
  payload: Buffer,
  waitAfterMs = 1200
): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    const socket = new Socket()
    let settled = false
    const finish = (ok: boolean, message: string): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ ok, message })
    }
    socket.setTimeout(10000)
    socket.once('error', (error) => finish(false, error.message))
    socket.once('timeout', () => finish(false, 'Yazıcı bağlantısı zaman aşımı.'))
    socket.once('connect', () => {
      socket.write(payload, (error) => {
        if (error) {
          finish(false, error.message)
          return
        }
        setTimeout(() => finish(true, 'Veri yazıcıya gönderildi.'), waitAfterMs)
      })
    })
    socket.connect(port, host)
  })
}

export async function printZpl(
  printer: PrinterRecord,
  zpl: string
): Promise<{ ok: boolean; message: string }> {
  if (!zpl.trim()) return { ok: false, message: 'ZPL içeriği boş.' }
  if (printer.connectionType === 'usb') {
    return sendWindowsRaw(printer.windowsPrinterName, zpl)
  }
  return sendRawSocket(printer.host, printer.port, Buffer.from(zpl, 'utf8'))
}

export async function printConfigLabel(
  printer: PrinterRecord
): Promise<{ ok: boolean; message: string }> {
  if (printer.connectionType === 'usb') {
    return sendWindowsRaw(printer.windowsPrinterName, '~WC\r\n')
  }
  return sendRawSocket(printer.host, printer.port, Buffer.from('~WC\r\n', 'latin1'), 1800)
}

export interface TestLabelInfo {
  name?: string
  host?: string
  serial?: string
  firmware?: string
  model?: string
  site?: string
  location?: string
  labels?: number
}

const TURKISH_ASCII: Record<string, string> = {
  ç: 'c',
  Ç: 'C',
  ğ: 'g',
  Ğ: 'G',
  ı: 'i',
  İ: 'I',
  ö: 'o',
  Ö: 'O',
  ş: 's',
  Ş: 'S',
  ü: 'u',
  Ü: 'U'
}

function zplText(value: string | undefined, maxLength = 32, fallback = '-'): string {
  if (!value) return fallback
  const transliterated = [...value]
    .map((character) => TURKISH_ASCII[character] ?? character)
    .join('')
  const cleaned = transliterated
    .replace(/[\^~\\]/g, ' ')
    .replace(/[\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return fallback
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 3)}...` : cleaned
}

function labelTimestamp(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(
    now.getHours()
  )}:${pad(now.getMinutes())}`
}

export function testLabelZpl(info: TestLabelInfo = {}): string {
  const name = zplText(info.name, 26, 'ZT411')
  const host = zplText(info.host, 24, '-')
  const serial = zplText(info.serial, 20, '-')
  const firmware = zplText(info.firmware, 18, '-')
  const model = zplText(info.model, 18, 'ZEBRA')
  const site = zplText(info.site, 26, '-')
  const location = zplText(info.location, 26, '-')
  const stamp = labelTimestamp()
  const qrData = zplText(
    `ZEBRA SAHA|${info.name ?? 'ZT411'}|${info.host ?? '-'}|${info.serial ?? '-'}`,
    80
  )
  const barcodeData = zplText(
    info.serial ? `SN-${info.serial}` : `TEST-${Date.now()}`,
    26,
    'TEST'
  )

  const stripes = Array.from({ length: 12 }, (_, index) => {
    const x = 6 + index * 60
    return `^FO${x},64^GB28,8,8^FS`
  })

  return [
    '^XA',
    '^CI28',
    '^PW719',
    '^LL443',
    '^FX --- outer frame ---',
    '^FO2,2^GB715,439,2^FS',
    '^FX --- black header band ---',
    '^FO2,2^GB715,58,58^FS',
    '^FO18,12^A0N,34,34^FR^FDZEBRA SAHA^FS',
    '^FO505,20^A0N,18,18^FR^FDTEST ETIKETI^FS',
    '^FX --- zebra stripe motif ---',
    ...stripes,
    '^FX --- left information block ---',
    '^FO24,88^A0N,14,14^FDYAZICI / PRINTER^FS',
    `^FO24,104^A0N,26,26^FD${name}^FS`,
    '^FO24,136^A0N,13,13^FDSAHA / SITE^FS',
    `^FO24,151^A0N,17,17^FD${site}${location !== '-' ? ` - ${location}` : ''}^FS`,
    '^FO24,178^A0N,13,13^FDIP ADRESI^FS',
    `^FO24,193^A0N,19,19^FD${host}^FS`,
    '^FO24,220^A0N,13,13^FDSERI NO^FS',
    `^FO24,235^A0N,19,19^FD${serial}^FS`,
    '^FO24,262^A0N,13,13^FDFIRMWARE^FS',
    `^FO24,277^A0N,19,19^FD${firmware}^FS`,
    '^FO24,304^A0N,13,13^FDTARIH / DATE^FS',
    `^FO24,319^A0N,18,18^FD${stamp}^FS`,
    '^FX --- QR code ---',
    '^FO520,86^GB178,178,2^FS',
    `^FO540,106^BQN,2,4^FDLA,${qrData}^FS`,
    '^FO552,276^A0N,13,13^FDTARA / SCAN^FS',
    '^FX --- barcode ---',
    '^FO24,350^GB670,2,2^FS',
    `^FO24,360^BY2^BCN,36,Y,N,N^FD${barcodeData}^FS`,
    '^FO24,424^A0N,10,10^FDZebra Saha Filo Konsolu - Test etiketi^FS',
    `^FO560,424^A0N,10,10^FD${model}^FS`,
    '^XZ',
    ''
  ].join('\r\n')
}

const SETTING_LABELS: Record<string, string> = {
  darkness: 'Darkness',
  speedIps: 'Hız (IPS)',
  printMethod: 'Baskı yöntemi',
  mediaType: 'Media tipi',
  printWidthDots: 'Baskı genişliği',
  printMode: 'Baskı modu',
  headCloseAction: 'Kafa kapatma',
  mediaPowerUp: 'Açılışta media',
  reprintMode: 'Reprint',
  tearOff: 'Tear-off',
  energyStar: 'Energy Star'
}

function validNumber(value: number | undefined, min: number, max: number): number | null {
  if (value === undefined || !Number.isFinite(value)) return null
  return Math.min(max, Math.max(min, Math.round(value)))
}

function buildSetvarCommands(
  settings: PrinterSettings
): { commands: string[]; applied: string[]; skipped: string[] } {
  const commands: string[] = []
  const applied: string[] = []
  const skipped: string[] = []

  const add = (key: string, label: string, value: string | null): void => {
    if (value === null) {
      skipped.push(label)
      return
    }
    commands.push(`! U1 setvar "${key}" "${value}"`)
    applied.push(label)
  }

  const darkness = validNumber(settings.darkness, -30, 30)
  add('print.tone', SETTING_LABELS.darkness, darkness === null ? null : String(darkness))
  const speed = validNumber(settings.speedIps, 1, 14)
  add('media.speed', SETTING_LABELS.speedIps, speed === null ? null : String(speed))

  const printMethods = new Set(['direct thermal', 'thermal transfer'])
  add(
    'ezpl.print_method',
    SETTING_LABELS.printMethod,
    settings.printMethod && printMethods.has(settings.printMethod.toLowerCase())
      ? settings.printMethod.toLowerCase()
      : null
  )
  const mediaTypes = new Set(['gap/notch', 'continuous', 'mark'])
  add(
    'ezpl.media_type',
    SETTING_LABELS.mediaType,
    settings.mediaType && mediaTypes.has(settings.mediaType.toLowerCase())
      ? settings.mediaType.toLowerCase()
      : null
  )
  const width = validNumber(settings.printWidthDots, 1, 832)
  add('ezpl.print_width', SETTING_LABELS.printWidthDots, width === null ? null : String(width))

  const printModes = new Set([
    'tear off',
    'peel off',
    'cutter',
    'rewind',
    'applicator',
    'delayed cut'
  ])
  add(
    'ezpl.print_mode',
    SETTING_LABELS.printMode,
    settings.printMode && printModes.has(settings.printMode.toLowerCase())
      ? settings.printMode.toLowerCase()
      : null
  )

  const headClose = new Set(['calibrate', 'feed', 'length', 'none'])
  add(
    'ezpl.head_close_action',
    SETTING_LABELS.headCloseAction,
    settings.headCloseAction && headClose.has(settings.headCloseAction.toLowerCase())
      ? settings.headCloseAction.toLowerCase()
      : null
  )

  const powerUp = new Set(['calibrate', 'feed', 'length', 'no motion'])
  add(
    'ezpl.media_power_up',
    SETTING_LABELS.mediaPowerUp,
    settings.mediaPowerUp && powerUp.has(settings.mediaPowerUp.toLowerCase())
      ? settings.mediaPowerUp.toLowerCase()
      : null
  )

  const reprint = new Set(['off', 'on'])
  add(
    'ezpl.reprint_mode',
    SETTING_LABELS.reprintMode,
    settings.reprintMode && reprint.has(settings.reprintMode.toLowerCase())
      ? settings.reprintMode.toLowerCase()
      : null
  )

  const tearOff = validNumber(settings.tearOff, 0, 255)
  add('ezpl.tear_off', SETTING_LABELS.tearOff, tearOff === null ? null : String(tearOff))

  const energy = new Set(['on', 'off'])
  add(
    'power.energy_star.enable',
    SETTING_LABELS.energyStar,
    settings.energyStar && energy.has(settings.energyStar.toLowerCase())
      ? settings.energyStar.toLowerCase()
      : null
  )

  skipped.push('DHCP / IP ayarları (bağlantıyı kesmemek için atlandı)')
  return { commands, applied, skipped }
}

export async function applySettings(
  printer: PrinterRecord,
  settings: PrinterSettings
): Promise<ConfigApplyResult> {
  if (printer.connectionType === 'usb') {
    return {
      ok: false,
      message: 'Windows kuyruğu üzerinden SGD ayar yazma desteklenmiyor.',
      applied: [],
      skipped: []
    }
  }
  const { commands, applied, skipped } = buildSetvarCommands(settings)
  if (commands.length === 0) {
    return {
      ok: false,
      message: 'Uygulanabilir ayar bulunamadı.',
      applied,
      skipped
    }
  }
  const payload = Buffer.from(`${commands.join('\r\n')}\r\n`, 'utf8')
  const result = await sendRawSocket(printer.host, printer.port, payload, 2500)
  return {
    ok: result.ok,
    message: result.ok
      ? `${applied.length} ayar yazıcıya gönderildi.${
          skipped.length > 0 ? ` Atlandı: ${skipped.join(', ')}` : ''
        }`
      : result.message,
    applied,
    skipped
  }
}

export async function uploadFirmware(
  printerId: number,
  printer: PrinterRecord,
  filePath: string,
  onProgress: (progress: FirmwareProgress) => void
): Promise<{ ok: boolean; message: string }> {
  if (printer.connectionType === 'usb') {
    return { ok: false, message: 'Firmware güncellemesi yalnızca ağ bağlantısıyla destekleniyor.' }
  }
  if (!existsSync(filePath)) return { ok: false, message: 'Firmware dosyası bulunamadı.' }
  const stats = statSync(filePath)
  if (!stats.isFile() || stats.size <= 0) return { ok: false, message: 'Geçersiz firmware dosyası.' }
  if (stats.size > 250 * 1024 * 1024) return { ok: false, message: 'Dosya 250 MB sınırından büyük.' }
  if (!/\.(zpl|bin)$/i.test(filePath)) {
    return { ok: false, message: 'Firmware dosyası .zpl (veya .bin) olmalıdır.' }
  }

  return new Promise((resolve) => {
    const socket = new Socket()
    let settled = false
    let sent = 0
    const finish = (ok: boolean, message: string): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ ok, message })
    }

    socket.setTimeout(30000)
    socket.once('error', (error) => finish(false, error.message))
    socket.once('timeout', () => finish(false, 'Firmware aktarımı zaman aşımına uğradı.'))
    socket.once('connect', () => {
      const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 })
      stream.on('data', (chunk) => {
        sent += chunk.length
        onProgress({
          printerId,
          sentBytes: sent,
          totalBytes: stats.size,
          percent: Math.min(100, Math.round((sent / stats.size) * 100))
        })
        const canContinue = socket.write(chunk)
        if (!canContinue) stream.pause()
        socket.once('drain', () => stream.resume())
      })
      stream.once('error', (error) => finish(false, error.message))
      stream.once('end', () => {
        socket.end()
        setTimeout(
          () =>
            finish(
              true,
              'Firmware dosyası gönderildi. Yazıcı güncellemeyi tamamlıyor; birkaç dakika bekleyin ve durumu yenileyin.'
            ),
          3000
        )
      })
    })
    socket.connect(printer.port, printer.host)
  })
}

export async function listWindowsPrinters(): Promise<WindowsPrinterInfo[]> {
  try {
    const output = await powershell(
      'Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus | ConvertTo-Json -Compress'
    )
    const parsed = JSON.parse(output || '[]') as unknown
    const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
    return rows.map((item) => {
      const row = item as Record<string, unknown>
      return {
        name: String(row.name ?? row.Name ?? ''),
        driverName: String(row.driverName ?? row.DriverName ?? ''),
        portName: String(row.portName ?? row.PortName ?? ''),
        status: String(row.status ?? row.PrinterStatus ?? 'Unknown')
      }
    })
  } catch {
    return []
  }
}

function windowsIssues(status: string): StatusIssue[] {
  const normalized = status.toLowerCase()
  if (normalized.includes('offline')) {
    return [
      {
        code: 'WINDOWS_OFFLINE',
        title: 'Windows kuyruğu çevrimdışı',
        description: 'Yazıcı Windows spooler tarafından çevrimdışı görünüyor.',
        action: 'USB kablosunu, yazıcı gücünü ve Windows yazıcı kuyruğunu kontrol edin.',
        severity: 'error'
      }
    ]
  }
  if (normalized.includes('paused')) {
    return [
      {
        code: 'WINDOWS_PAUSED',
        title: 'Windows kuyruğu duraklatıldı',
        description: 'Yazdırma kuyruğu duraklatılmış.',
        action: 'Windows Yazıcılar ekranından kuyruğu devam ettirin.',
        severity: 'warning'
      }
    ]
  }
  if (
    normalized.includes('error') ||
    normalized.includes('paper') ||
    normalized.includes('jam') ||
    normalized.includes('door') ||
    normalized.includes('offline') ||
    normalized.includes('user intervention')
  ) {
    return [
      {
        code: 'WINDOWS_ERROR',
        title: 'Windows yazıcı hatası',
        description: `Windows kuyruğu hata durumu bildiriyor: ${status}`,
        action: 'Windows Yazıcılar ekranından ayrıntıyı kontrol edin; kabloyu ve media durumunu doğrulayın.',
        severity: 'error'
      }
    ]
  }
  return []
}

export async function readWindowsPrinter(printer: PrinterRecord): Promise<PrinterStatus> {
  const checkedAt = new Date().toISOString()
  let status = 'Unknown'
  try {
    const script = `$p = Get-Printer -Name '${printer.windowsPrinterName.replace(/'/g, "''")}' -ErrorAction Stop; $p.PrinterStatus | ConvertTo-Json -Compress`
    const output = await powershell(script)
    status = output.replace(/^"|"$/g, '').trim() || 'Unknown'
  } catch {
    status = 'Offline'
  }
  const issues = windowsIssues(status)
  const state: PrinterStatus['state'] =
    status.toLowerCase().includes('offline')
      ? 'offline'
      : status.toLowerCase().includes('paused')
        ? 'paused'
        : issues.some((issue) => issue.severity === 'error')
          ? 'error'
          : issues.length > 0
            ? 'warning'
            : 'ready'
  const errors = issues.filter((issue) => issue.severity === 'error')
  const warnings = issues.filter((issue) => issue.severity !== 'error')
  return {
    printerId: printer.id,
    checkedAt,
    online: state !== 'offline',
    state,
    latencyMs: null,
    identity: null,
    memory: null,
    hostStatus: null,
    settings: {},
    counters: { source: 'none' },
    errors,
    warnings,
    issues,
    paused: state === 'paused',
    raw: { error: `Windows PrinterStatus: ${status}` }
  }
}

const RAW_PRINTER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DOCINFOW {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOW di);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
  public static void Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("OpenPrinter failed");
    try {
      DOCINFOW di = new DOCINFOW();
      di.pDocName = "Zebra Saha";
      di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, ref di)) throw new Exception("StartDocPrinter failed");
      try {
        if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter failed");
        try {
          IntPtr p = Marshal.AllocCoTaskMem(data.Length);
          Marshal.Copy(data, 0, p, data.Length);
          int written;
          if (!WritePrinter(h, p, data.Length, out written)) throw new Exception("WritePrinter failed");
          Marshal.FreeCoTaskMem(p);
        } finally { EndPagePrinter(h); }
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
"@
$bytes = [System.IO.File]::ReadAllBytes($env:ZEBRA_RAW_FILE)
[RawPrinterHelper]::Send($env:ZEBRA_PRINTER_NAME, $bytes)
`

export async function sendWindowsRaw(
  printerName: string,
  data: string
): Promise<{ ok: boolean; message: string }> {
  if (!printerName.trim()) return { ok: false, message: 'Windows yazıcı kuyruğu adı boş.' }
  const filePath = join(tmpdir(), `zebra-saha-${Date.now()}.raw`)
  try {
    writeFileSync(filePath, data, 'utf8')
    await powershell(RAW_PRINTER_SCRIPT)
    return { ok: true, message: 'Veri Windows yazıcı kuyruğuna gönderildi.' }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }
  } finally {
    try {
      unlinkSync(filePath)
    } catch {
      // Geçici dosya silinemezse sorun değil.
    }
  }
}
