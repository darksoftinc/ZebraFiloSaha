import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Box,
  Button,
  Code,
  Group,
  Modal,
  Paper,
  Progress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  Title
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconAlertTriangle,
  IconBarcode,
  IconCloudUpload,
  IconDeviceFloppy,
  IconDownload,
  IconFileCode,
  IconInfoCircle,
  IconRefresh,
  IconSend,
  IconTrash,
  IconUpload
} from '@tabler/icons-react'
import type {
  ConfigSnapshot,
  FirmwareUpdateRecord,
  PrinterRecord,
  PrinterSettings,
  PrinterStatus
} from '@shared/types'
import { readableError } from '../store'
import { formatDateTime, formatNumber } from '../lib/format'

interface Props {
  printer: PrinterRecord
  status?: PrinterStatus
  onRefresh: () => void
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
  energyStar: 'Energy Star',
  dhcp: 'DHCP'
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manuel',
  template: 'Şablon',
  'pre-restore': 'Geri yükleme öncesi',
  'pre-change': 'Değişiklik öncesi'
}

function valueText(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  return String(value)
}

function DiffTable({
  current,
  snapshot
}: {
  current: PrinterSettings
  snapshot: PrinterSettings
}): React.ReactElement {
  const keys = Object.keys(SETTING_LABELS).filter(
    (key) => key in current || key in snapshot
  ) as Array<keyof PrinterSettings>
  return (
    <Table withTableBorder withColumnBorders striped>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Ayar</Table.Th>
          <Table.Th>Mevcut</Table.Th>
          <Table.Th>Yedek</Table.Th>
          <Table.Th>Durum</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {keys.map((key) => {
          const left = valueText(current[key])
          const right = valueText(snapshot[key])
          const changed = left !== right
          return (
            <Table.Tr key={String(key)}>
              <Table.Td><Text size="xs">{SETTING_LABELS[String(key)]}</Text></Table.Td>
              <Table.Td><Text size="xs" className="mono">{left}</Text></Table.Td>
              <Table.Td><Text size="xs" className="mono">{right}</Text></Table.Td>
              <Table.Td>
                {changed ? <Badge color="yellow" variant="light" size="xs">Farklı</Badge> : <Text size="xs" c="dimmed">Aynı</Text>}
              </Table.Td>
            </Table.Tr>
          )
        })}
      </Table.Tbody>
    </Table>
  )
}

export function PrinterManagementTab({ printer, status, onRefresh }: Props): React.ReactElement {
  const [snapshots, setSnapshots] = useState<ConfigSnapshot[]>([])
  const [firmware, setFirmware] = useState<FirmwareUpdateRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [zplOpened, setZplOpened] = useState(false)
  const [zpl, setZpl] = useState('')
  const [sending, setSending] = useState(false)
  const [diffSnapshot, setDiffSnapshot] = useState<ConfigSnapshot | null>(null)
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string; size: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const online = status?.online === true

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const [snapshotResult, firmwareResult] = await Promise.all([
        window.api.configSnapshots(printer.id),
        window.api.firmwareHistory(printer.id)
      ])
      setSnapshots(snapshotResult)
      setFirmware(firmwareResult)
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Yönetim verileri yüklenemedi',
        message: readableError(error)
      })
    } finally {
      setLoading(false)
    }
  }, [printer.id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const unsubscribe = window.api.onFirmwareProgress((event) => {
      if (event.printerId === printer.id) setProgress(event.percent)
    })
    return unsubscribe
  }, [printer.id])

  const testZpl = useMemo(
    () =>
      [
        '^XA',
        '^CI28',
        '^FO40,40^A0N,34,34^FDZebra Saha^FS',
        `^FO40,90^A0N,20,20^FD${printer.name}^FS`,
        '^FO40,130^BY3^BCN,80,Y,N,N^FD1234567890^FS',
        '^XZ'
      ].join('\r\n'),
    [printer.name]
  )

  const printConfig = async (): Promise<void> => {
    if (!window.confirm(`${printer.name} için yapılandırma etiketi basılsın mı? Bu işlem bir etiket tüketir.`)) return
    try {
      const result = await window.api.printConfigLabel(printer.id)
      notifications.show({
        color: result.ok ? 'teal' : 'red',
        title: result.ok ? 'Yapılandırma etiketi istendi' : 'Baskı başarısız',
        message: result.message
      })
    } catch (error) {
      notifications.show({ color: 'red', title: 'Baskı hatası', message: readableError(error) })
    }
  }

  const sendZpl = async (): Promise<void> => {
    if (!zpl.trim()) {
      notifications.show({ color: 'red', title: 'ZPL boş', message: 'Gönderilecek ZPL kodunu girin.' })
      return
    }
    if (!window.confirm(`${printer.name} için ZPL gönderilsin mi? Bu işlem etiket basabilir.`)) return
    setSending(true)
    try {
      const result = await window.api.testPrint({ printerId: printer.id, zpl })
      notifications.show({
        color: result.ok ? 'teal' : 'red',
        title: result.ok ? 'ZPL gönderildi' : 'ZPL gönderilemedi',
        message: result.message,
        autoClose: result.ok ? 4000 : 8000
      })
      if (result.ok) setZplOpened(false)
    } catch (error) {
      notifications.show({ color: 'red', title: 'ZPL hatası', message: readableError(error) })
    } finally {
      setSending(false)
    }
  }

  const createSnapshot = async (): Promise<void> => {
    try {
      await window.api.createConfigSnapshot(printer.id, '')
      notifications.show({ color: 'teal', title: 'Ayar yedeği alındı', message: printer.name })
      await load()
    } catch (error) {
      notifications.show({ color: 'red', title: 'Yedek alınamadı', message: readableError(error) })
    }
  }

  const restoreSnapshot = async (snapshot: ConfigSnapshot): Promise<void> => {
    if (
      !window.confirm(
        `${printer.name} yazıcısına ${formatDateTime(snapshot.createdAt)} tarihli ayarlar geri yüklensin mi?\n\nMevcut ayarlar otomatik olarak yedeklenir. Bu işlem yazıcı davranışını değiştirir.`
      )
    ) {
      return
    }
    try {
      const result = await window.api.restoreConfigSnapshot(snapshot.id)
      notifications.show({
        color: result.ok ? 'teal' : 'red',
        title: result.ok ? 'Ayarlar geri yüklendi' : 'Geri yükleme başarısız',
        message: result.message,
        autoClose: result.ok ? 6000 : 10000
      })
      onRefresh()
      await load()
    } catch (error) {
      notifications.show({ color: 'red', title: 'Geri yükleme hatası', message: readableError(error) })
    }
  }

  const applyAll = async (snapshot: ConfigSnapshot): Promise<void> => {
    if (
      !window.confirm(
        `#${snapshot.id} numaralı ayar şablonu TÜM ağ yazıcılarına uygulansın mı?\n\nBu işlem her yazıcıda darkness, hız ve media ayarlarını değiştirirebilir.`
      )
    ) {
      return
    }
    try {
      const result = await window.api.applySnapshotToAll(snapshot.id)
      notifications.show({
        color: result.ok ? 'teal' : 'red',
        title: 'Şablon uygulaması',
        message: `${result.message}\n${result.results.map((item) => `${item.printerName}: ${item.ok ? 'OK' : item.message}`).join('\n')}`,
        autoClose: 10000
      })
      await load()
    } catch (error) {
      notifications.show({ color: 'red', title: 'Şablon uygulanamadı', message: readableError(error) })
    }
  }

  const removeSnapshot = async (snapshot: ConfigSnapshot): Promise<void> => {
    if (!window.confirm(`#${snapshot.id} numaralı ayar yedeği silinsin mi?`)) return
    try {
      await window.api.deleteConfigSnapshot(snapshot.id)
      await load()
    } catch (error) {
      notifications.show({ color: 'red', title: 'Yedek silinemedi', message: readableError(error) })
    }
  }

  const selectFirmware = async (): Promise<void> => {
    try {
      const file = await window.api.selectFirmwareFile()
      if (file) setSelectedFile(file)
    } catch (error) {
      notifications.show({ color: 'red', title: 'Dosya seçilemedi', message: readableError(error) })
    }
  }

  const upload = async (): Promise<void> => {
    if (!selectedFile) return
    if (
      !window.confirm(
        `${printer.name} yazıcısına firmware yüklensin mi?\n\nDosya: ${selectedFile.name}\nBoyut: ${(selectedFile.size / 1024 / 1024).toFixed(1)} MB\n\nYükleme sırasında yazıcıyı kapatmayın. İşlem sonunda yazıcı yeniden başlayabilir.`
      )
    ) {
      return
    }
    setUploading(true)
    setProgress(0)
    try {
      const result = await window.api.uploadFirmware(printer.id, selectedFile.path)
      notifications.show({
        color: result.ok ? 'teal' : 'red',
        title: result.ok ? 'Firmware gönderildi' : 'Firmware yüklenemedi',
        message: result.message,
        autoClose: result.ok ? 10000 : 12000
      })
      setSelectedFile(null)
      await load()
      onRefresh()
    } catch (error) {
      notifications.show({ color: 'red', title: 'Firmware hatası', message: readableError(error) })
    } finally {
      setUploading(false)
      setProgress(null)
    }
  }

  return (
    <Stack gap="md">
      <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} />} title="Yetkili işlemler">
        <Text size="sm">
          Bu sekmedeki test baskı, ayar geri yükleme ve firmware işlemleri yazıcıyı doğrudan
          etkiler. Her işlem öncesi onay istenir ve işlem kaydı tutulur.
        </Text>
      </Alert>

      {!online ? (
        <Alert color="gray" variant="light" icon={<IconInfoCircle size={18} />} title="Yazıcı çevrimdışı">
          <Text size="sm">
            Yazdırma ve yazma işlemleri için yazıcının çevrimiçi olması gerekir. Yedekleri ve
            geçmişi görüntülemeye devam edebilirsiniz.
          </Text>
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Paper withBorder radius="md" p="md">
          <Group gap="sm" mb="sm">
            <IconBarcode size={20} color="var(--mantine-color-teal-5)" />
            <Text fw={650}>Test baskı / ZPL</Text>
          </Group>
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Yapılandırma etiketi yazıcının mevcut ayarlarını gösterir. ZPL göndererek özel
              etiket testi yapabilirsiniz.
            </Text>
            <Group>
              <Button
                variant="light"
                leftSection={<IconDeviceFloppy size={16} />}
                onClick={() => void printConfig()}
                disabled={!online}
              >
                Yapılandırma Etiketi
              </Button>
              <Button
                leftSection={<IconFileCode size={16} />}
                onClick={() => {
                  setZpl(testZpl)
                  setZplOpened(true)
                }}
                disabled={!online}
              >
                ZPL Gönder
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              203 dpi · {status?.settings.printMode ?? '—'} · {status?.settings.mediaType ?? '—'}
            </Text>
          </Stack>
        </Paper>

        <Paper withBorder radius="md" p="md">
          <Group gap="sm" mb="sm">
            <IconCloudUpload size={20} color="var(--mantine-color-violet-5)" />
            <Text fw={650}>Firmware</Text>
          </Group>
          <Stack gap="sm">
            <Group>
              <Badge variant="light" color="blue">Mevcut</Badge>
              <Code>{status?.identity?.firmware ?? '—'}</Code>
              <Badge variant="light" color="gray">Link-OS {status?.identity?.linkOsVersion ?? '—'}</Badge>
            </Group>
            <Text size="sm" c="dimmed">
              Zebra firmware dosyasını (.zpl) seçip yükleyin. Güncelleme sırasında yazıcıyı
              kapatmayın; işlem sonunda yazıcı yeniden başlayabilir.
            </Text>
            {selectedFile ? (
              <Text size="xs" className="mono">
                {selectedFile.name} · {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
              </Text>
            ) : null}
            {progress !== null ? <Progress value={progress} animated /> : null}
            <Group>
              <Button variant="light" leftSection={<IconUpload size={16} />} onClick={() => void selectFirmware()} disabled={uploading || !online}>
                Dosya Seç
              </Button>
              <Button leftSection={<IconSend size={16} />} onClick={() => void upload()} loading={uploading} disabled={!selectedFile || !online}>
                Yükle
              </Button>
              <Button variant="subtle" leftSection={<IconRefresh size={16} />} onClick={() => void load()} loading={loading}>
                Yenile
              </Button>
            </Group>
          </Stack>
        </Paper>
      </SimpleGrid>

      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" mb="sm">
          <Group gap="sm">
            <IconDownload size={20} color="var(--mantine-color-teal-5)" />
            <Text fw={650}>Ayar yedekleri ve şablonlar</Text>
          </Group>
          <Group>
            <Button size="xs" variant="light" leftSection={<IconDeviceFloppy size={14} />} onClick={() => void createSnapshot()} disabled={!online}>
              Yedek Al
            </Button>
            <Button size="xs" variant="subtle" leftSection={<IconRefresh size={14} />} onClick={() => void load()} loading={loading}>
              Yenile
            </Button>
          </Group>
        </Group>
        {snapshots.length === 0 ? (
          <Alert color="gray" icon={<IconInfoCircle size={18} />}>
            Henüz ayar yedeği yok. “Yedek Al” ile mevcut ayarları saklayın.
          </Alert>
        ) : (
          <Table.ScrollContainer minWidth={760}>
            <Table withTableBorder withColumnBorders striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>#</Table.Th>
                  <Table.Th>Tarih</Table.Th>
                  <Table.Th>Kaynak</Table.Th>
                  <Table.Th>Etiket</Table.Th>
                  <Table.Th>Not</Table.Th>
                  <Table.Th>İşlem</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {snapshots.map((snapshot) => (
                  <Table.Tr key={snapshot.id}>
                    <Table.Td><Text size="xs">{snapshot.id}</Text></Table.Td>
                    <Table.Td><Text size="xs">{formatDateTime(snapshot.createdAt)}</Text></Table.Td>
                    <Table.Td><Badge size="xs" variant="light" color="blue">{SOURCE_LABELS[snapshot.source] ?? snapshot.source}</Badge></Table.Td>
                    <Table.Td><Text size="xs">{formatNumber(snapshot.labelCount ?? undefined)}</Text></Table.Td>
                    <Table.Td><Text size="xs" lineClamp={2}>{snapshot.notes || '—'}</Text></Table.Td>
                    <Table.Td>
                      <Group gap={2} wrap="nowrap">
                        <Button size="compact-xs" variant="subtle" onClick={() => setDiffSnapshot(snapshot)}>
                          Karşılaştır
                        </Button>
                        <Button size="compact-xs" variant="light" onClick={() => void restoreSnapshot(snapshot)} disabled={!online}>
                          Geri Yükle
                        </Button>
                        <Button size="compact-xs" variant="subtle" onClick={() => void applyAll(snapshot)}>
                          Tümüne Uygula
                        </Button>
                        <Button size="compact-xs" variant="subtle" color="red" onClick={() => void removeSnapshot(snapshot)}>
                          <IconTrash size={12} />
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <Paper withBorder radius="md" p="md">
        <Group gap="sm" mb="sm">
          <IconFileCode size={20} color="var(--mantine-color-gray-5)" />
          <Text fw={650}>Firmware geçmişi</Text>
        </Group>
        {firmware.length === 0 ? (
          <Text size="sm" c="dimmed">Henüz firmware yükleme kaydı yok.</Text>
        ) : (
          <Table.ScrollContainer minWidth={760}>
            <Table withTableBorder withColumnBorders striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Tarih</Table.Th>
                  <Table.Th>Dosya</Table.Th>
                  <Table.Th>Önceki sürüm</Table.Th>
                  <Table.Th>Durum</Table.Th>
                  <Table.Th>Mesaj</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {firmware.map((item) => (
                  <Table.Tr key={item.id}>
                    <Table.Td><Text size="xs">{formatDateTime(item.startedAt)}</Text></Table.Td>
                    <Table.Td><Text size="xs" className="mono">{item.fileName}</Text></Table.Td>
                    <Table.Td><Text size="xs">{item.versionBefore || '—'}</Text></Table.Td>
                    <Table.Td>
                      <Badge size="xs" color={item.status === 'sent' ? 'teal' : item.status === 'failed' ? 'red' : 'gray'} variant="light">
                        {item.status === 'sent' ? 'Gönderildi' : item.status === 'failed' ? 'Başarısız' : item.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td><Text size="xs" lineClamp={2}>{item.message || '—'}</Text></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <Modal opened={zplOpened} onClose={() => setZplOpened(false)} title="ZPL Gönder" size="xl">
        <Stack gap="md">
          <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} />}>
            <Text size="sm">
              Gönderilen ZPL yazıcıda hemen işlenir ve etiket basabilir. Kodu kontrol ettiğinizden
              emin olun.
            </Text>
          </Alert>
          <Textarea
            label="ZPL kodu"
            value={zpl}
            onChange={(event) => setZpl(event.currentTarget.value)}
            minRows={10}
            autosize
            maxRows={20}
            className="mono"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setZplOpened(false)}>Vazgeç</Button>
            <Button leftSection={<IconSend size={16} />} onClick={() => void sendZpl()} loading={sending} disabled={!online}>
              Gönder
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={diffSnapshot !== null}
        onClose={() => setDiffSnapshot(null)}
        title={diffSnapshot ? `Ayar Karşılaştırması · #${diffSnapshot.id}` : 'Ayar Karşılaştırması'}
        size="lg"
      >
        {diffSnapshot ? (
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Sol taraf mevcut ayarlar, sağ taraf yedekteki ayarlar. “Farklı” olan satırlar geri
              yüklemede değişecek alanlardır.
            </Text>
            <ScrollArea.Autosize mah={460} type="auto" offsetScrollbars>
              <DiffTable current={status?.settings ?? {}} snapshot={diffSnapshot.settings} />
            </ScrollArea.Autosize>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDiffSnapshot(null)}>Kapat</Button>
              <Button
                onClick={() => {
                  const snapshot = diffSnapshot
                  setDiffSnapshot(null)
                  void restoreSnapshot(snapshot)
                }}
              >
                Bu Yedeği Geri Yükle
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
    </Stack>
  )
}
