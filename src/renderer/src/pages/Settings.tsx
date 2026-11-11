import { useEffect, useState } from 'react'
import {
  Alert,
  Badge,
  Box,
  Button,
  Code,
  CopyButton,
  Divider,
  Group,
  NumberInput,
  Paper,
  PasswordInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title,
  useMantineColorScheme
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconApi,
  IconCheck,
  IconCopy,
  IconDatabase,
  IconDeviceFloppy,
  IconDownload,
  IconInfoCircle,
  IconShieldCheck,
  IconTool
} from '@tabler/icons-react'
import type { ApiStatus, AppInfo } from '@shared/types'
import { useAppData, readableError } from '../store'

function InfoRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <Group justify="space-between" wrap="nowrap" gap="md">
      <Text size="sm" c="dimmed">{label}</Text>
      <Text size="sm" className="mono" ta="right" style={{ wordBreak: 'break-all' }}>
        {value}
      </Text>
    </Group>
  )
}

export function Settings(): React.ReactElement {
  const { settings, saveSettings, exportDiagnostics } = useAppData()
  const { setColorScheme } = useMantineColorScheme()
  const [pollInterval, setPollInterval] = useState<number | string>(settings.pollInterval)
  const [retentionDays, setRetentionDays] = useState<number | string>(settings.retentionDays)
  const [httpCounters, setHttpCounters] = useState(settings.httpCounters)
  const [theme, setTheme] = useState<'dark' | 'light'>(settings.theme)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null)

  const [apiEnabled, setApiEnabled] = useState(settings.apiEnabled)
  const [apiBind, setApiBind] = useState<string>(settings.apiBind)
  const [apiPort, setApiPort] = useState<number | string>(settings.apiPort)
  const [apiAllowPrint, setApiAllowPrint] = useState(settings.apiAllowPrint)
  const [apiToken, setApiToken] = useState('')

  useEffect(() => {
    setPollInterval(settings.pollInterval)
    setRetentionDays(settings.retentionDays)
    setHttpCounters(settings.httpCounters)
    setTheme(settings.theme)
    setApiEnabled(settings.apiEnabled)
    setApiBind(settings.apiBind)
    setApiPort(settings.apiPort)
    setApiAllowPrint(settings.apiAllowPrint)
    setApiToken('')
  }, [settings])

  useEffect(() => {
    void window.api.appInfo().then(setAppInfo).catch(() => setAppInfo(null))
    void window.api.apiStatus().then(setApiStatus).catch(() => setApiStatus(null))
  }, [])

  const refreshApiStatus = async (): Promise<void> => {
    try {
      setApiStatus(await window.api.apiStatus())
    } catch {
      setApiStatus(null)
    }
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await saveSettings({
        pollInterval: typeof pollInterval === 'number' ? pollInterval : Number(pollInterval),
        retentionDays: typeof retentionDays === 'number' ? retentionDays : Number(retentionDays),
        httpCounters,
        theme,
        apiEnabled,
        apiBind: apiBind === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1',
        apiPort: typeof apiPort === 'number' ? apiPort : Number(apiPort),
        apiAllowPrint,
        apiToken: apiToken.trim() || undefined
      })
      setColorScheme(theme)
      setApiToken('')
      await refreshApiStatus()
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Ayarlar kaydedilemedi',
        message: readableError(error)
      })
    } finally {
      setSaving(false)
    }
  }

  const handleExport = async (): Promise<void> => {
    setExporting(true)
    try {
      await exportDiagnostics()
    } finally {
      setExporting(false)
    }
  }

  const clearApiToken = async (): Promise<void> => {
    if (!window.confirm('Kayıtlı API token silinsin mi? API açıksa istekler yetkisiz kalır.')) return
    try {
      await saveSettings({ apiToken: null })
      await refreshApiStatus()
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Token silinemedi',
        message: readableError(error)
      })
    }
  }

  return (
    <Stack gap="lg">
      <Box>
        <Title order={2}>Ayarlar</Title>
        <Text size="sm" c="dimmed" mt={2}>
          İzleme sıklığı, görünüm, veri saklama, ERP API ve tanılama seçenekleri.
        </Text>
      </Box>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Paper withBorder radius="lg" p="lg">
          <Group gap="sm" mb="md">
            <IconTool size={20} color="var(--mantine-color-teal-5)" />
            <Text fw={650}>İzleme</Text>
          </Group>
          <Stack gap="md">
            <NumberInput
              label="Varsayılan sorgu aralığı (saniye)"
              description="Yeni eklenen yazıcılar için geçerlidir. Her yazıcı kendi aralığını kullanır."
              value={pollInterval}
              onChange={setPollInterval}
              min={15}
              max={3600}
              step={15}
            />
            <Switch
              label="Web arayüzünden kesin sayaçları oku"
              description="Yazıcının config sayfası erişilebilirse etiket ve toplam uzunluk sayaçları doğrudan alınır."
              checked={httpCounters}
              onChange={(event) => setHttpCounters(event.currentTarget.checked)}
            />
            <Alert color="blue" variant="light" icon={<IconInfoCircle size={18} />}>
              <Text size="sm">
                Durum sorguları 9100 portuna salt okunur ZPL komutları gönderir. Baskı işlerini
                etkilememek için sorgular kısa tutulur ve yazıcı başına tek bağlantı kullanılır.
              </Text>
            </Alert>
          </Stack>
        </Paper>

        <Paper withBorder radius="lg" p="lg">
          <Group gap="sm" mb="md">
            <IconShieldCheck size={20} color="var(--mantine-color-blue-5)" />
            <Text fw={650}>Görünüm ve veri</Text>
          </Group>
          <Stack gap="md">
            <Box>
              <Text size="sm" fw={500} mb={6}>Tema</Text>
              <SegmentedControl
                value={theme}
                onChange={(value) => {
                  const next = value === 'light' ? 'light' : 'dark'
                  setTheme(next)
                  setColorScheme(next)
                }}
                data={[{ value: 'dark', label: 'Koyu' }, { value: 'light', label: 'Açık' }]}
                fullWidth
              />
            </Box>
            <NumberInput
              label="Veri saklama süresi (gün)"
              description="Bu süreden eski durum kayıtları ve çözülen olaylar temizlenir."
              value={retentionDays}
              onChange={setRetentionDays}
              min={1}
              max={3650}
            />
          </Stack>
        </Paper>
      </SimpleGrid>

      <Paper withBorder radius="lg" p="lg">
        <Group justify="space-between" mb="md">
          <Group gap="sm">
            <IconApi size={20} color="var(--mantine-color-violet-5)" />
            <Text fw={650}>ERP / API entegrasyonu</Text>
          </Group>
          <Badge
            color={apiStatus?.running ? 'teal' : 'gray'}
            variant="light"
            leftSection={apiStatus?.running ? <IconCheck size={12} /> : undefined}
          >
            {apiStatus?.running ? `Çalışıyor · ${apiStatus.message}` : apiStatus?.message ?? 'Kapalı'}
          </Badge>
        </Group>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Yerel bir REST API açar. ERP/WMS sisteminiz yazıcı durumunu okuyabilir, yenileme
            isteyebilir ve izin verirseniz ZPL işi gönderebilir. Varsayılan olarak yalnızca bu
            bilgisayardan erişilebilir.
          </Text>
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
            <Switch
              label="API'yi etkinleştir"
              checked={apiEnabled}
              onChange={(event) => setApiEnabled(event.currentTarget.checked)}
            />
            <Select
              label="Dinlenecek adres"
              value={apiBind}
              onChange={(value) => setApiBind(value ?? '127.0.0.1')}
              data={[
                { value: '127.0.0.1', label: 'Yalnızca bu bilgisayar (127.0.0.1)' },
                { value: '0.0.0.0', label: 'Yerel ağ (0.0.0.0) — token zorunlu' }
              ]}
              allowDeselect={false}
            />
            <NumberInput
              label="Port"
              value={apiPort}
              onChange={setApiPort}
              min={1024}
              max={65535}
            />
          </SimpleGrid>
          <PasswordInput
            label="API token"
            description={
              settings.apiTokenConfigured
                ? 'Kayıtlı token var. Değiştirmek için yenisini girin.'
                : 'ERP tarafında Authorization: Bearer <token> olarak kullanılacak anahtar.'
            }
            placeholder={settings.apiTokenConfigured ? '••••••••' : 'Uzun ve rastgele bir anahtar'}
            value={apiToken}
            onChange={(event) => setApiToken(event.currentTarget.value)}
          />
          <Group justify="space-between">
            <Switch
              label="API üzerinden ZPL ile yazdırmaya izin ver"
              description="Kapalıyken API yalnızca okuma ve yenileme yapabilir."
              checked={apiAllowPrint}
              onChange={(event) => setApiAllowPrint(event.currentTarget.checked)}
            />
            {settings.apiTokenConfigured ? (
              <Button variant="subtle" color="red" size="xs" onClick={() => void clearApiToken()}>
                Tokenı Temizle
              </Button>
            ) : null}
          </Group>
          <Alert color="yellow" variant="light" icon={<IconInfoCircle size={18} />}>
            <Text size="sm">
              <b>0.0.0.0</b> seçilirse API yerel ağa açılır ve token zorunludur. Tokenı yalnızca
              güvenli bir kanaldan paylaşın. Yazdırma izni verildiğinde API'ye erişen herkes
              etiket bastırabilir.
            </Text>
          </Alert>
          <Code block className="mono" style={{ fontSize: 11 }}>
{`GET  http://${apiBind === '0.0.0.0' ? 'SUNUCU_IP' : '127.0.0.1'}:${apiPort}/api/health
GET  /api/printers
GET  /api/printers/1
POST /api/printers/1/refresh
POST /api/printers/1/print   {"zpl":"^XA...^XZ"}
GET  /api/alerts?active=1
GET  /api/reports?from=2026-01-01&to=2026-01-31
Authorization: Bearer <API_TOKEN>`}
          </Code>
        </Stack>
      </Paper>

      <Group justify="flex-end">
        <Button
          leftSection={<IconDeviceFloppy size={16} />}
          onClick={() => void handleSave()}
          loading={saving}
        >
          Ayarları Kaydet
        </Button>
      </Group>

      <Paper withBorder radius="lg" p="lg">
        <Group gap="sm" mb="md">
          <IconDatabase size={20} color="var(--mantine-color-violet-5)" />
          <Text fw={650}>Veri ve tanılama</Text>
        </Group>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Tüm yazıcı bilgileri, son durumlar, son 5.000 kayıt, olaylar, bakım görevleri,
            firmware geçmişi ve config yedekleri tek bir JSON dosyasına aktarılır.
          </Text>
          <Group>
            <Button
              variant="light"
              leftSection={<IconDownload size={16} />}
              onClick={() => void handleExport()}
              loading={exporting}
            >
              Tanılama Paketi İndir
            </Button>
          </Group>
          {appInfo ? (
            <>
              <Divider />
              <Stack gap="xs">
                <InfoRow label="Veritabanı" value={appInfo.dbPath} />
                <InfoRow label="Kullanıcı verisi" value={appInfo.userData} />
                <Group justify="flex-end">
                  <CopyButton value={appInfo.dbPath} timeout={2000}>
                    {({ copied, copy }) => (
                      <Button
                        size="xs"
                        variant="subtle"
                        color={copied ? 'teal' : 'gray'}
                        leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                        onClick={copy}
                      >
                        {copied ? 'Kopyalandı' : 'Veritabanı yolunu kopyala'}
                      </Button>
                    )}
                  </CopyButton>
                </Group>
              </Stack>
            </>
          ) : null}
        </Stack>
      </Paper>

      <Paper withBorder radius="lg" p="lg">
        <Group gap="sm" mb="md">
          <IconInfoCircle size={20} color="var(--mantine-color-gray-5)" />
          <Text fw={650}>Uygulama bilgisi</Text>
        </Group>
        {appInfo ? (
          <Stack gap="xs">
            <InfoRow label="Sürüm" value={appInfo.version} />
            <InfoRow label="Electron" value={appInfo.electron} />
            <InfoRow label="Node.js" value={appInfo.node} />
            <InfoRow label="Chromium" value={appInfo.chrome} />
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">Bilgi yükleniyor…</Text>
        )}
        <Divider my="md" />
        <Text size="xs" c="dimmed">
          Zebra Saha — ZT411 saha tanılama ve filo konsolu. Durum sorguları salt okunurdur;
          yazdırma, ayar ve firmware işlemleri yalnızca onay verdiğinizde çalışır.
        </Text>
      </Paper>
    </Stack>
  )
}
