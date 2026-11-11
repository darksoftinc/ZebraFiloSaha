import { useEffect, useState } from 'react'
import {
  Alert,
  Autocomplete,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconDeviceFloppy,
  IconPlugConnected,
  IconRefresh,
  IconTrash
} from '@tabler/icons-react'
import type { PrinterRecord, ProbeResult, WindowsPrinterInfo } from '@shared/types'
import { useAppData, readableError } from '../store'
import { formatNumber, stateLabel } from '../lib/format'

interface Props {
  opened: boolean
  onClose: () => void
  printer?: PrinterRecord | null
}

interface FieldErrors {
  name?: string
  host?: string
  port?: string
  windowsPrinterName?: string
}

export function PrinterFormModal({ opened, onClose, printer }: Props): React.ReactElement {
  const { createPrinter, updatePrinter, deletePrinter, settings } = useAppData()
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState<number | string>(9100)
  const [site, setSite] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [pollInterval, setPollInterval] = useState<number | string>(settings.pollInterval)
  const [enabled, setEnabled] = useState(true)
  const [connectionType, setConnectionType] = useState<string>('network')
  const [windowsPrinterName, setWindowsPrinterName] = useState('')
  const [windowsPrinters, setWindowsPrinters] = useState<WindowsPrinterInfo[]>([])
  const [loadingQueues, setLoadingQueues] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [probe, setProbe] = useState<ProbeResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)

  const isEdit = Boolean(printer)
  const isUsb = connectionType === 'usb'

  useEffect(() => {
    if (!opened) return
    setName(printer?.name ?? '')
    setHost(printer?.host ?? '')
    setPort(printer?.port ?? 9100)
    setSite(printer?.site ?? '')
    setLocation(printer?.location ?? '')
    setNotes(printer?.notes ?? '')
    setPollInterval(printer?.pollInterval ?? settings.pollInterval)
    setEnabled(printer?.enabled ?? true)
    setConnectionType(printer?.connectionType ?? 'network')
    setWindowsPrinterName(printer?.windowsPrinterName ?? '')
    setErrors({})
    setProbe(null)
  }, [opened, printer, settings.pollInterval])

  const portNumber = typeof port === 'number' ? port : Number(port)

  const validate = (): boolean => {
    const next: FieldErrors = {}
    if (!name.trim()) next.name = 'Yazıcı adı zorunludur.'
    if (isUsb) {
      if (!windowsPrinterName.trim()) next.windowsPrinterName = 'Windows yazıcı kuyruğu seçin.'
    } else {
      if (!host.trim()) next.host = 'IP adresi veya sunucu adı zorunludur.'
      if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
        next.port = '1-65535 aralığında bir port girin.'
      }
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const loadQueues = async (): Promise<void> => {
    setLoadingQueues(true)
    try {
      const list = await window.api.listWindowsPrinters()
      setWindowsPrinters(list)
      notifications.show({
        color: list.length > 0 ? 'teal' : 'gray',
        title: 'Windows yazıcı kuyrukları',
        message:
          list.length > 0
            ? `${list.length} kuyruk bulundu.`
            : 'Kuyruk bulunamadı. Yazıcı sürücüsü kurulu mu?'
      })
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Kuyruklar listelenemedi',
        message: readableError(error)
      })
    } finally {
      setLoadingQueues(false)
    }
  }

  const handleTest = async (): Promise<void> => {
    if (!validate()) return
    if (isUsb) {
      setTesting(true)
      try {
        const list = await window.api.listWindowsPrinters()
        setWindowsPrinters(list)
        const found = list.find((item) => item.name === windowsPrinterName.trim())
        notifications.show({
          color: found ? 'teal' : 'red',
          title: found ? 'Kuyruk bulundu' : 'Kuyruk bulunamadı',
          message: found
            ? `${found.name} · ${found.status} · ${found.portName}`
            : 'Windows yazıcı kuyruğu bulunamadı. Sürücü kurulu ve kuyruk adı doğru mu?'
        })
      } catch (error) {
        notifications.show({
          color: 'red',
          title: 'Kuyruk kontrolü başarısız',
          message: readableError(error)
        })
      } finally {
        setTesting(false)
      }
      return
    }
    setTesting(true)
    setProbe(null)
    try {
      const result = await window.api.probePrinter(host.trim(), portNumber)
      setProbe(result)
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Test başarısız',
        message: readableError(error)
      })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!validate()) return
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        host: isUsb ? '' : host.trim(),
        port: isUsb ? 9100 : portNumber,
        connectionType: (isUsb ? 'usb' : 'network') as 'usb' | 'network',
        windowsPrinterName: isUsb ? windowsPrinterName.trim() : '',
        site: site.trim(),
        location: location.trim(),
        notes: notes.trim(),
        enabled,
        pollInterval: typeof pollInterval === 'number' ? pollInterval : Number(pollInterval)
      }
      if (printer) {
        await updatePrinter(printer.id, payload)
      } else {
        await createPrinter(payload)
      }
      onClose()
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Kayıt başarısız',
        message: readableError(error)
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!printer) return
    const approved = window.confirm(
      `${printer.name} silinsin mi? Bu yazıcıya ait durum geçmişi, bakım ve olay kayıtları da silinir.`
    )
    if (!approved) return
    setSaving(true)
    try {
      await deletePrinter(printer.id)
      onClose()
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Silme başarısız',
        message: readableError(error)
      })
    } finally {
      setSaving(false)
    }
  }

  const probeColor = !probe
    ? 'gray'
    : !probe.ok
      ? 'red'
      : probe.status?.state === 'error'
        ? 'yellow'
        : 'teal'

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? 'Yazıcıyı Düzenle' : 'Yeni Zebra Yazıcı'}
      size="lg"
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
    >
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <TextInput
            label="Yazıcı adı"
            placeholder="Örn. Üretim Hattı 1"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            error={errors.name}
            required
            data-autofocus
          />
          <TextInput
            label="Saha / tesis"
            placeholder="Örn. Merkez Tesis"
            value={site}
            onChange={(event) => setSite(event.currentTarget.value)}
            description="Raporlarda ve filtrelerde kullanılır."
          />
          <Select
            label="Bağlantı türü"
            value={connectionType}
            onChange={(value) => {
              setConnectionType(value ?? 'network')
              setErrors({})
            }}
            data={[
              { value: 'network', label: 'Ağ (Ethernet / Wi-Fi)' },
              { value: 'usb', label: 'Windows yazıcı kuyruğu (USB)' }
            ]}
            allowDeselect={false}
          />
          {isUsb ? (
            <Autocomplete
              label="Windows yazıcı kuyruğu"
              placeholder="Kuyruk adını yazın veya listeyi açın"
              value={windowsPrinterName}
              onChange={setWindowsPrinterName}
              data={windowsPrinters.map((item) => item.name)}
              error={errors.windowsPrinterName}
              rightSection={
                <Button
                  size="compact-xs"
                  variant="subtle"
                  onClick={() => void loadQueues()}
                  loading={loadingQueues}
                  px={4}
                >
                  <IconRefresh size={14} />
                </Button>
              }
              required
            />
          ) : (
            <TextInput
              label="IP adresi / sunucu adı"
              placeholder="192.168.1.102"
              value={host}
              onChange={(event) => setHost(event.currentTarget.value)}
              error={errors.host}
              required
              className="mono"
            />
          )}
          {!isUsb ? (
            <NumberInput
              label="Port"
              description="Zebra ham baskı portu genellikle 9100'dir."
              value={port}
              onChange={setPort}
              min={1}
              max={65535}
              error={errors.port}
            />
          ) : null}
          <NumberInput
            label="Sorgu aralığı (saniye)"
            description="15-3600 saniye arasında."
            value={pollInterval}
            onChange={setPollInterval}
            min={15}
            max={3600}
            step={15}
          />
          <TextInput
            label="Konum"
            placeholder="Örn. Paketleme / Hat 2"
            value={location}
            onChange={(event) => setLocation(event.currentTarget.value)}
          />
        </SimpleGrid>

        <Textarea
          label="Notlar"
          placeholder="Bakım notu, sorumlu kişi, etiket türü…"
          value={notes}
          onChange={(event) => setNotes(event.currentTarget.value)}
          minRows={2}
          autosize
        />

        <Switch
          label="İzlemeye dahil et"
          description="Kapalıysa otomatik durum sorgusu yapılmaz."
          checked={enabled}
          onChange={(event) => setEnabled(event.currentTarget.checked)}
        />

        <Divider />

        <Group justify="space-between">
          <Button
            variant="light"
            leftSection={<IconPlugConnected size={16} />}
            onClick={() => void handleTest()}
            loading={testing}
            disabled={saving}
          >
            {isUsb ? 'Kuyruk Bilgisini Kontrol Et' : 'Bağlantıyı Test Et'}
          </Button>
          <Text size="xs" c="dimmed">
            {isUsb
              ? 'USB durumu, Windows yazıcı kuyruğundan okunur.'
              : 'Test, yazıcıya salt okunur durum sorgusu gönderir.'}
          </Text>
        </Group>

        {probe ? (
          <Alert
            color={probeColor}
            icon={probe.ok ? <IconCircleCheck size={18} /> : <IconAlertTriangle size={18} />}
            title={probe.ok ? 'Bağlantı başarılı' : 'Bağlantı kurulamadı'}
          >
            <Stack gap={4}>
              <Text size="sm">{probe.message}</Text>
              {probe.status?.identity ? (
                <Text size="xs" c="dimmed">
                  {probe.status.identity.model} · {probe.status.identity.firmware} ·{' '}
                  {stateLabel(probe.status.state)} · {formatNumber(probe.status.counters.labels)}{' '}
                  etiket
                </Text>
              ) : null}
              {probe.status?.issues.slice(0, 3).map((issue) => (
                <Text key={issue.code} size="xs" c="dimmed">
                  • {issue.title}
                </Text>
              ))}
            </Stack>
          </Alert>
        ) : null}

        {isUsb && windowsPrinters.length > 0 ? (
          <Alert color="blue" variant="light">
            <Text size="xs">
              Bulunan kuyruklar: {windowsPrinters.map((item) => item.name).join(', ')}
            </Text>
          </Alert>
        ) : null}

        <Group justify="space-between" mt="xs">
          <div>
            {isEdit ? (
              <Button
                color="red"
                variant="subtle"
                leftSection={<IconTrash size={16} />}
                onClick={() => void handleDelete()}
                disabled={saving}
              >
                Sil
              </Button>
            ) : null}
          </div>
          <Group gap="sm">
            <Button variant="default" onClick={onClose} disabled={saving}>
              Vazgeç
            </Button>
            <Button
              leftSection={<IconDeviceFloppy size={16} />}
              onClick={() => void handleSave()}
              loading={saving}
            >
              Kaydet
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
