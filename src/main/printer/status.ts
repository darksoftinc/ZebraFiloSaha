import type {
  HostStatus,
  IssueSeverity,
  PrinterIdentity,
  PrinterMemory,
  PrinterState,
  StatusIssue
} from '@shared/types'

interface BitDefinition {
  mask: number
  code: string
  title: string
  description: string
  action: string
  severity: IssueSeverity
}

const ERROR_BITS: BitDefinition[] = [
  {
    mask: 0x00000001,
    code: 'MEDIA_OUT',
    title: 'Kağıt / etiket bitti',
    description: 'Medya sensörü etiket bulamıyor veya rulo bitmiş.',
    action: 'Yeni rulo takın, medya yolunu kontrol edin ve kalibrasyon yapın.',
    severity: 'error'
  },
  {
    mask: 0x00000002,
    code: 'RIBBON_OUT',
    title: 'Ribon bitti',
    description: 'Termal transfer modunda ribon yok veya bitmiş.',
    action: 'Ribon takın. Direct thermal kullanıyorsanız baskı yöntemini kontrol edin.',
    severity: 'error'
  },
  {
    mask: 0x00000004,
    code: 'HEAD_OPEN',
    title: 'Kafa açık',
    description: 'Printhead kapağı açık veya kilitlenmemiş.',
    action: 'Kapağı kapatın; kilit sensörünü ve kafa kablosunu kontrol edin.',
    severity: 'error'
  },
  {
    mask: 0x00000008,
    code: 'CUTTER_FAULT',
    title: 'Kesici arızası',
    description: 'Kesici bıçağı sıkışmış veya arızalı.',
    action: 'Kesici bölgesini temizleyin; sorun sürerse servis gerekir.',
    severity: 'error'
  },
  {
    mask: 0x00000010,
    code: 'HEAD_OVER_TEMP',
    title: 'Kafa aşırı sıcak',
    description: 'Printhead sıcaklığı güvenli sınırın üzerinde.',
    action: "Yazıcıyı soğutun; hızı ve darkness'ı düşürün; havalandırmayı kontrol edin.",
    severity: 'error'
  },
  {
    mask: 0x00000020,
    code: 'MOTOR_OVER_TEMP',
    title: 'Motor aşırı sıcak',
    description: 'Motor sıcaklığı yüksek.',
    action: 'Soğumaya bırakın; yükü azaltın; tekrarlarsa servis gerekir.',
    severity: 'error'
  },
  {
    mask: 0x00000040,
    code: 'BAD_HEAD_ELEMENT',
    title: 'Arızalı kafa elemanı',
    description: 'Printhead üzerinde yanmış veya bozuk elemanlar var.',
    action: 'Test etiketi basın; eksik çizgi varsa printhead değişimi gerekir.',
    severity: 'error'
  },
  {
    mask: 0x00000080,
    code: 'HEAD_DETECTION_ERROR',
    title: 'Kafa algılama hatası',
    description: 'Printhead algılanamıyor.',
    action: 'Kafa bağlantısını ve kabloyu kontrol edin; gerekirse kafa değiştirin.',
    severity: 'error'
  },
  {
    mask: 0x00000100,
    code: 'INVALID_FIRMWARE_CONFIG',
    title: 'Geçersiz firmware yapılandırması',
    description: 'Firmware yapılandırması bozuk.',
    action: "Firmware'i yeniden yükleyin; gerekirse fabrika ayarlarına dönün.",
    severity: 'error'
  },
  {
    mask: 0x00000200,
    code: 'HEAD_THERMISTOR_OPEN',
    title: 'Kafa termistörü açık',
    description: 'Sıcaklık sensörü devresi açık.',
    action: 'Printhead / termistör bağlantısını kontrol edin; servis gerekebilir.',
    severity: 'error'
  },
  {
    mask: 0x00100000,
    code: 'PAUSED',
    title: 'Duraklatıldı',
    description: 'Yazdırma duraklatılmış.',
    action: 'Kontrol panelinden Resume veya FEED ile devam ettirin.',
    severity: 'warning'
  }
]

const WARNING_BITS: BitDefinition[] = [
  {
    mask: 0x00000001,
    code: 'NEED_CALIBRATION',
    title: 'Kalibrasyon gerekli',
    description: 'Medya kalibrasyonu öneriliyor.',
    action: 'Yazıcı menüsünden medya kalibrasyonu çalıştırın.',
    severity: 'warning'
  },
  {
    mask: 0x00000002,
    code: 'CLEAN_HEAD',
    title: 'Kafa temizliği gerekli',
    description: 'Printhead temizliği zamanı.',
    action: "Printhead'i Zebra temizlik kalemi ile temizleyin.",
    severity: 'warning'
  },
  {
    mask: 0x00000004,
    code: 'REPLACE_HEAD',
    title: 'Kafa değişimi öneriliyor',
    description: 'Printhead ömrünü tamamlamış olabilir.',
    action: 'Baskı kalitesini kontrol edin; kafa değişimini planlayın.',
    severity: 'warning'
  },
  {
    mask: 0x00000008,
    code: 'PAPER_NEAR_END',
    title: 'Kağıt azalıyor',
    description: 'Rulo bitmek üzere.',
    action: 'Yeni rulo hazırlayın.',
    severity: 'warning'
  }
]

const EXTRA_ISSUES: Record<string, StatusIssue> = {
  HEAD_UNDER_TEMP: {
    code: 'HEAD_UNDER_TEMP',
    title: 'Kafa sıcaklığı düşük',
    description: 'Ortam sıcaklığı çalışma aralığının altında.',
    action: 'Ortamı ısıtın; yazıcının normal çalışma sıcaklığına gelmesini bekleyin.',
    severity: 'warning'
  },
  CORRUPT_RAM: {
    code: 'CORRUPT_RAM',
    title: 'Bellek bozulması',
    description: 'Yapılandırma verisi kaybolmuş olabilir.',
    action: 'Ayarları kontrol edin; gerekirse fabrika ayarlarına dönün.',
    severity: 'error'
  },
  OFFLINE: {
    code: 'OFFLINE',
    title: 'Çevrimdışı',
    description: 'Yazıcıya ağdan ulaşılamıyor.',
    action: 'IP adresi, güvenlik duvarı ve kablo bağlantısını kontrol edin; yazıcı açık mı?',
    severity: 'error'
  },
  NO_RESPONSE: {
    code: 'NO_RESPONSE',
    title: 'Durum alınamadı',
    description: 'Yazıcı TCP bağlantısını kabul etti ancak durum sorgusuna yanıt vermedi.',
    action: 'Kısa süre sonra tekrar deneyin; sorun sürerse yazıcıyı yeniden başlatın.',
    severity: 'warning'
  },
  UNKNOWN_ERROR: {
    code: 'UNKNOWN_ERROR',
    title: 'Bilinmeyen hata',
    description: 'Yazıcı tanımlanmamış bir hata bildirdi.',
    action: 'Zebra teknik destek ile iletişime geçin.',
    severity: 'error'
  }
}

function issueFromDefinition(definition: BitDefinition, rawCode: string): StatusIssue {
  return {
    code: definition.code,
    title: definition.title,
    description: definition.description,
    action: definition.action,
    severity: definition.severity,
    rawCode
  }
}

export interface DecodedSystemStatus {
  paused: boolean
  errorFlag: boolean
  warningFlag: boolean
  errors: StatusIssue[]
  warnings: StatusIssue[]
  errorGroup1: number
  errorGroup2: number
  warningGroup1: number
  warningGroup2: number
  parsed: boolean
}

export function decodeSystemStatus(raw: string): DecodedSystemStatus {
  const empty: DecodedSystemStatus = {
    paused: false,
    errorFlag: false,
    warningFlag: false,
    errors: [],
    warnings: [],
    errorGroup1: 0,
    errorGroup2: 0,
    warningGroup1: 0,
    warningGroup2: 0,
    parsed: false
  }
  if (!raw) return empty

  const clean = raw.replace(/["\r\n]/g, '')
  const values = clean.split(',').map((item) => item.trim())
  if (values.length >= 7) {
    const paused = values[0] === '1'
    const errorFlag = values[1] === '1'
    const errorGroup2 = Number.parseInt(values[2], 16) || 0
    const errorGroup1 = Number.parseInt(values[3], 16) || 0
    const warningFlag = values[4] === '1'
    const warningGroup2 = Number.parseInt(values[5], 16) || 0
    const warningGroup1 = Number.parseInt(values[6], 16) || 0

    return {
      paused,
      errorFlag,
      warningFlag,
      errors: decodeBits(ERROR_BITS, errorGroup1, errorGroup2),
      warnings: decodeBits(WARNING_BITS, warningGroup1, warningGroup2),
      errorGroup1,
      errorGroup2,
      warningGroup1,
      warningGroup2,
      parsed: true
    }
  }

  return decodeHqesText(raw)
}

function decodeBits(definitions: BitDefinition[], group1: number, group2: number): StatusIssue[] {
  const result: StatusIssue[] = []
  for (const definition of definitions) {
    if ((group1 & definition.mask) !== 0) {
      result.push(issueFromDefinition(definition, definition.mask.toString(16).toUpperCase().padStart(8, '0')))
    }
  }
  if (group2 !== 0) {
    const unknown = EXTRA_ISSUES.UNKNOWN_ERROR
    result.push({
      ...unknown,
      rawCode: group2.toString(16).toUpperCase().padStart(8, '0')
    })
  }
  return result
}

function decodeHqesText(raw: string): DecodedSystemStatus {
  const errorMatch = raw.match(/ERRORS:\s*(\d+)\s+([0-9a-fA-F]{8})\s+([0-9a-fA-F]{8})/)
  const warningMatch = raw.match(/WARNINGS:\s*(\d+)\s+([0-9a-fA-F]{8})\s+([0-9a-fA-F]{8})/)
  const errorGroup2 = errorMatch ? Number.parseInt(errorMatch[2], 16) || 0 : 0
  const errorGroup1 = errorMatch ? Number.parseInt(errorMatch[3], 16) || 0 : 0
  const warningGroup2 = warningMatch ? Number.parseInt(warningMatch[2], 16) || 0 : 0
  const warningGroup1 = warningMatch ? Number.parseInt(warningMatch[3], 16) || 0 : 0
  return {
    paused: false,
    errorFlag: Boolean(errorMatch && errorMatch[1] === '1'),
    warningFlag: Boolean(warningMatch && warningMatch[1] === '1'),
    errors: decodeBits(ERROR_BITS, errorGroup1, errorGroup2),
    warnings: decodeBits(WARNING_BITS, warningGroup1, warningGroup2),
    errorGroup1,
    errorGroup2,
    warningGroup1,
    warningGroup2,
    parsed: Boolean(errorMatch || warningMatch)
  }
}

export function parseHostStatus(raw: string): HostStatus | null {
  if (!raw) return null
  const clean = raw.replace(/\x02|\x03/g, '').replace(/\r/g, '')
  const lines = clean
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const first = lines.find((line) => line.split(',').length === 12)
  const second = lines.find((line) => line.split(',').length === 11)
  if (!first || !second) return null

  const a = first.split(',').map((part) => part.trim())
  const b = second.split(',').map((part) => part.trim())
  const printMode = describePrintMode(b[5])

  return {
    paperOut: a[1] === '1',
    pause: a[2] === '1',
    labelLengthDots: Number.parseInt(a[3], 10) || 0,
    formatsInBuffer: Number.parseInt(a[4], 10) || 0,
    bufferFull: a[5] === '1',
    diagnosticMode: a[6] === '1',
    partialFormat: a[7] === '1',
    corruptRam: a[9] === '1',
    underTemperature: a[10] === '1',
    overTemperature: a[11] === '1',
    headUp: b[2] === '1',
    ribbonOut: b[3] === '1',
    thermalTransfer: b[4] === '1',
    printMode,
    printWidthMode: Number.parseInt(b[6], 10) || 0,
    labelWaiting: b[7] === '1',
    labelsRemaining: Number.parseInt(b[8], 10) || 0,
    graphicsInMemory: Number.parseInt(b[10], 10) || 0
  }
}

function describePrintMode(value: string): string {
  const modes: Record<string, string> = {
    '0': 'Rewind',
    '1': 'Peel-off',
    '2': 'Tear-off',
    '3': 'Cutter',
    '4': 'Applicator',
    '5': 'Delayed cut',
    '6': 'Linerless peel',
    '7': 'Linerless rewind',
    '8': 'Partial cutter',
    '9': 'RFID',
    K: 'Kiosk',
    S: 'Kiosk cut'
  }
  return modes[value] ?? value
}

export function parseHostIdentification(raw: string): PrinterIdentity | null {
  if (!raw) return null
  const clean = raw.replace(/[\x00-\x1F"]/g, '').trim()
  if (!clean) return null
  const parts = clean.split(',').map((part) => part.trim())
  const model = (parts[0] || 'Bilinmiyor').trim()
  const firmware = parts[1] || ''
  const dotsPerMm = Number.parseInt(parts[2], 10) || 8
  const ramKb = Number.parseInt((parts[3] || '').replace(/[^0-9]/g, ''), 10) || 0
  return { model, firmware, dotsPerMm, ramKb }
}

export function parseHostMemory(raw: string): PrinterMemory | null {
  if (!raw) return null
  const clean = raw.replace(/[\x00-\x1F"]/g, '').trim()
  const parts = clean.split(',').map((part) => Number.parseInt(part.trim(), 10) || 0)
  if (parts.length < 3) return null
  return { totalKb: parts[0], maxKb: parts[1], freeKb: parts[2] }
}

function extractQuotedValues(raw: string): string[] {
  const quoted = [...raw.matchAll(/"([^"]*)"/g)].map((match) => match[1])
  if (quoted.length > 0) return quoted
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/[\x00-\x1F"]/g, '').trim())
    .filter((line) => line.length > 0)
}

export function parseSgdValue(raw: string): string | undefined {
  if (!raw) return undefined
  const values = extractQuotedValues(raw)
  if (values.length === 0) return undefined
  const value = values[0].replace(/[\x00-\x1F]/g, '').trim()
  if (value === '' || value === '?') return undefined
  return value
}

export function parseSgdBatch(raw: string): Array<string | undefined> {
  return extractQuotedValues(raw).map((value) => {
    const clean = value.replace(/[\x00-\x1F]/g, '').trim()
    return clean === '' || clean === '?' ? undefined : clean
  })
}

export function toNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number.parseFloat(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}

export function buildIssues(params: {
  online: boolean
  decoded: DecodedSystemStatus
  hostStatus: HostStatus | null
  sawStatusResponse: boolean
}): StatusIssue[] {
  const { online, decoded, hostStatus, sawStatusResponse } = params
  const issues: StatusIssue[] = []
  const seen = new Set<string>()

  const add = (issue: StatusIssue): void => {
    if (seen.has(issue.code)) return
    seen.add(issue.code)
    issues.push(issue)
  }

  if (!online) {
    add(EXTRA_ISSUES.OFFLINE)
    return issues
  }

  for (const issue of decoded.errors) add(issue)
  for (const issue of decoded.warnings) add(issue)

  const addFromDefinition = (code: string, rawCode = 'HS'): void => {
    const definition = ERROR_BITS.find((item) => item.code === code)
    if (definition) add(issueFromDefinition(definition, rawCode))
  }

  if (hostStatus) {
    if (hostStatus.paperOut) addFromDefinition('MEDIA_OUT')
    if (hostStatus.headUp) addFromDefinition('HEAD_OPEN')
    if (hostStatus.ribbonOut) addFromDefinition('RIBBON_OUT')
    if (hostStatus.overTemperature) addFromDefinition('HEAD_OVER_TEMP')
    if (hostStatus.underTemperature) add(EXTRA_ISSUES.HEAD_UNDER_TEMP)
    if (hostStatus.corruptRam) add(EXTRA_ISSUES.CORRUPT_RAM)
    if (hostStatus.pause) addFromDefinition('PAUSED')
  }

  if (!sawStatusResponse) add(EXTRA_ISSUES.NO_RESPONSE)

  return issues
}

export function deriveState(params: {
  online: boolean
  issues: StatusIssue[]
  paused: boolean
  sawStatusResponse: boolean
}): PrinterState {
  if (!params.online) return 'offline'
  if (params.issues.some((issue) => issue.severity === 'error')) return 'error'
  if (params.paused) return 'paused'
  if (params.issues.some((issue) => issue.severity === 'warning')) return 'warning'
  if (!params.sawStatusResponse) return 'unknown'
  return 'ready'
}
