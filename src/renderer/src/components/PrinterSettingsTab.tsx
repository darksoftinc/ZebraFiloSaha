import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconAlertTriangle,
  IconDeviceFloppy,
  IconInfoCircle,
  IconRefresh
} from '@tabler/icons-react'
import type { PrinterRecord, PrinterSettings, PrinterStatus } from '@shared/types'
import { readableError } from '../store'
import { formatNumber } from '../lib/format'

interface Props {
  printer: PrinterRecord
  status?: PrinterStatus
  onRefresh: () => void
}

const PRINT_METHODS = [
  { value: 'direct thermal', label: 'Direct thermal' },
  { value: 'thermal transfer', label: 'Thermal transfer' }
]

const MEDIA_TYPES = [
  { value: 'gap/notch', label: 'Gap / notch' },
  { value: 'continuous', label: 'Continuous' },
  { value: 'mark', label: 'Black mark' }
]

const PRINT_MODES = [
  { value: 'tear off', label: 'Tear off' },
  { value: 'peel off', label: 'Peel off' },
  { value: 'cutter', label: 'Cutter' },
  { value: 'rewind', label: 'Rewind' },
  { value: 'applicator', label: 'Applicator' },
  { value: 'delayed cut', label: 'Delayed cut' }
]

const HEAD_CLOSE = [
  { value: 'calibrate', label: 'Kalibrasyon' },
  { value: 'feed', label: 'Feed' },
  { value: 'length', label: 'Etiket boyu' },
  { value: 'none', label: 'Hiçbir şey' }
]

const POWER_UP = [
  { value: 'calibrate', label: 'Kalibrasyon' },
  { value: 'feed', label: 'Feed' },
  { value: 'length', label: 'Etiket boyu' },
  { value: 'no motion', label: 'Hareket yok' }
]

const ON_OFF = [
  { value: 'on', label: 'Açık' },
  { value: 'off', label: 'Kapalı' }
]

export function PrinterSettingsTab({ printer, status, onRefresh }: Props): React.ReactElement {
  const [darkness, setDarkness] = useState<number | string>('')
  const [speed, setSpeed] = useState<number | string>('')
  const [printMethod, setPrintMethod] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<string | null>(null)
  const [printWidth, setPrintWidth] = useState<number | string>('')
  const [printMode, setPrintMode] = useState<string | null>(null)
  const [headClose, setHeadClose] = useState<string | null>(null)
  const [powerUp, setPowerUp] = useState<string | null>(null)
  const [reprint, setReprint] = useState<string | null>(null)
  const [tearOff, setTearOff] = useState<number | string>('')
  const [energyStar, setEnergyStar] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [saving, setSaving] = useState(false)

  const online = status?.online === true

  const populate = useCallback((settings: PrinterSettings): void => {
    setDarkness(settings.darkness ?? '')
    setSpeed(settings.speedIps ?? '')
    setPrintMethod(settings.printMethod ?? null)
    setMediaType(settings.mediaType ?? null)
    setPrintWidth(settings.printWidthDots ?? '')
    setPrintMode(settings.printMode ?? null)
    setHeadClose(settings.headCloseAction ?? null)
    setPowerUp(settings.mediaPowerUp ?? null)
    setReprint(settings.reprintMode ?? null)
    setTearOff(settings.tearOff ?? '')
    setEnergyStar(settings.energyStar ?? null)
    setInitialized(true)
  }, [])

  useEffect(() => {
    setInitialized(false)
  }, [printer.id])

  useEffect(() => {
    if (status?.settings && !initialized) populate(status.settings)
  }, [status?.settings, initialized, populate])

  const resetFromPrinter = (): void => {
    if (status) {
      populate(status.settings)
      notifications.show({
        color: 'blue',
        title: 'Form yenilendi',
        message: 'Değerler yazıcının son durumundan alındı.'
      })
    }
  }

  const numberValue = (value: number | string, label: string, min: number, max: number): number | undefined => {
    if (value === '' || value === undefined) return undefined
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      throw new Error(`${label} ${min}-${max} aralığında olmalıdır.`)
    }
    return parsed
  }

  const apply = async (): Promise<void> => {
    if (!online) {
      notifications.show({
        color: 'red',
        title: 'Yazıcı çevrimdışı',
        message: 'Ayarları uygulamak için önce yazıcı bağlantısını sağlayın.'
      })
      return
    }
    if (
      !window.confirm(
        `${printer.name} yazıcısının ayarları değiştirilsin mi?\n\nMevcut ayarlar önce otomatik olarak yedeklenecek.`
      )
    ) {
      return
    }

    try {
      const settings: PrinterSettings = {
        darkness: numberValue(darkness, 'Darkness', -30, 30),
        speedIps: numberValue(speed, 'Baskı hızı', 1, 14),
        printMethod: printMethod ?? undefined,
        mediaType: mediaType ?? undefined,
        printWidthDots: numberValue(printWidth, 'Baskı genişliği', 1, 832),
        printMode: printMode ?? undefined,
        headCloseAction: headClose ?? undefined,
        mediaPowerUp: powerUp ?? undefined,
        reprintMode: reprint ?? undefined,
        tearOff: numberValue(tearOff, 'Tear-off', 0, 255),
        energyStar: energyStar ?? undefined
      }

      setSaving(true)
      const result = await window.api.applyPrinterSettings(printer.id, settings)
      notifications.show({
        color: result.ok ? 'teal' : 'red',
        title: result.ok ? 'Ayarlar uygulandı' : 'Ayarlar uygulanamadı',
        message: `${result.message}${
          result.skipped.length > 0 ? `\nAtlanan: ${result.skipped.join(', ')}` : ''
        }`,
        autoClose: result.ok ? 6000 : 10000
      })
      onRefresh()
      setTimeout(() => {
        void window.api.latestStatus(printer.id).then((latest) => {
          if (latest?.settings) populate(latest.settings)
        })
      }, 2500)
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Ayar yazılamadı',
        message: readableError(error)
      })
    } finally {
      setSaving(false)
    }
  }

  const widthDots = typeof printWidth === 'number' ? printWidth : Number(printWidth)
  const widthMm =
    Number.isFinite(widthDots) && status?.identity?.dotsPerMm
      ? widthDots / status.identity.dotsPerMm
      : undefined

  return (
    <Stack gap="md">
      <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} />} title="Canlı ayar değişikliği">
        <Text size="sm">
          Bu ekrandan yapılan değişiklikler yazıcıya anında yazılır. Uygulama öncesi mevcut
          ayarlar otomatik olarak yedeklenir ve işlem denetim kaydına eklenir. Ağ/DHCP
          ayarları bağlantıyı kesmemek için buradan değiştirilmez.
        </Text>
      </Alert>

      {!online ? (
        <Alert color="gray" variant="light" icon={<IconInfoCircle size={18} />}>
          <Text size="sm">
            Yazıcı çevrimdışı. Değerleri düzenleyebilirsiniz ancak uygulamak için bağlantı
            gerekir. Önce “Yenile” ile durumu kontrol edin.
          </Text>
        </Alert>
      ) : null}

      <Paper withBorder radius="md" p="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <NumberInput
            label="Darkness"
            description="Zebra aralığı: -30 … +30. Mevcut değer yüksekse baskı koyu ve kafa yükü fazla olabilir."
            value={darkness}
            onChange={setDarkness}
            min={-30}
            max={30}
            step={1}
            disabled={!online}
          />
          <NumberInput
            label="Baskı hızı (IPS)"
            description="203 dpi ZT411 için en fazla 14 IPS."
            value={speed}
            onChange={setSpeed}
            min={1}
            max={14}
            step={1}
            disabled={!online}
          />
          <Select
            label="Baskı yöntemi"
            value={printMethod}
            onChange={setPrintMethod}
            data={PRINT_METHODS}
            disabled={!online}
            placeholder="Değiştirme"
            allowDeselect
          />
          <Select
            label="Media tipi"
            value={mediaType}
            onChange={setMediaType}
            data={MEDIA_TYPES}
            disabled={!online}
            placeholder="Değiştirme"
            allowDeselect
          />
          <NumberInput
            label="Baskı genişliği (dot)"
            description={widthMm !== undefined ? `≈ ${formatNumber(widthMm, 1)} mm` : '1-832 dot'}
            value={printWidth}
            onChange={setPrintWidth}
            min={1}
            max={832}
            step={1}
            disabled={!online}
          />
          <Select
            label="Baskı modu"
            value={printMode}
            onChange={setPrintMode}
            data={PRINT_MODES}
            disabled={!online}
            placeholder="Değiştirme"
            allowDeselect
          />
          <Select
            label="Kafa kapatma davranışı"
            value={headClose}
            onChange={setHeadClose}
            data={HEAD_CLOSE}
            disabled={!online}
            placeholder="Değiştirme"
            allowDeselect
          />
          <Select
            label="Açılışta media"
            value={powerUp}
            onChange={setPowerUp}
            data={POWER_UP}
            disabled={!online}
            placeholder="Değiştirme"
            allowDeselect
          />
          <Select
            label="Reprint modu"
            value={reprint}
            onChange={setReprint}
            data={ON_OFF}
            disabled={!online}
            placeholder="Değiştirme"
            allowDeselect
          />
          <NumberInput
            label="Tear-off (dot)"
            value={tearOff}
            onChange={setTearOff}
            min={0}
            max={255}
            step={1}
            disabled={!online}
          />
          <Select
            label="Energy Star"
            value={energyStar}
            onChange={setEnergyStar}
            data={ON_OFF}
            disabled={!online}
            placeholder="Değiştirme"
            allowDeselect
          />
          <TextInput
            label="DHCP"
            value={status?.settings.dhcp ?? '—'}
            disabled
            description="Ağ bağlantısını kesmemek için salt okunur."
          />
        </SimpleGrid>
      </Paper>

      <Group justify="space-between">
        <Group gap="sm">
          <Button
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={() => void apply()}
            loading={saving}
            disabled={!online}
          >
            Ayarları Yazıcıya Uygula
          </Button>
          <Button
            variant="default"
            leftSection={<IconRefresh size={16} />}
            onClick={resetFromPrinter}
            disabled={!status}
          >
            Yazıcıdan Yenile
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          Yalnızca baskı ayarları yazılır; IP/DHCP değiştirilmez.
        </Text>
      </Group>
    </Stack>
  )
}
