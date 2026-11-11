import { useEffect, useState } from 'react'
import {
  Accordion,
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Code,
  CopyButton,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  ThemeIcon,
  Tooltip
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconBarcode,
  IconCheck,
  IconCircleCheck,
  IconCopy,
  IconEdit,
  IconInfoCircle,
  IconNetwork,
  IconRefresh,
  IconTool,
  IconWifiOff
} from '@tabler/icons-react'
import type { HistorySample, PrinterRecord, PrinterStatus, StatusIssue } from '@shared/types'
import { useAppData } from '../store'
import {
  formatDateTime,
  formatKm,
  formatLatency,
  formatMbFromKb,
  formatNumber,
  formatRelative,
  formatUptime,
  severityColor,
  severityLabel,
  stateColor,
  stateLabel
} from '../lib/format'
import { StatusBadge } from './StatusBadge'
import { PrinterManagementTab } from './PrinterManagementTab'
import { PrinterSettingsTab } from './PrinterSettingsTab'

interface Props {
  opened: boolean
  printerId: number | null
  onClose: () => void
  onEdit: (printer: PrinterRecord) => void
}

function InfoItem({
  label,
  value,
  mono = false
}: {
  label: string
  value: string | undefined | null
  mono?: boolean
}): React.ReactElement {
  return (
    <Box>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={550} className={mono ? 'mono' : undefined} style={{ wordBreak: 'break-word' }}>
        {value && value.length > 0 ? value : '—'}
      </Text>
    </Box>
  )
}

function MetricCard({
  label,
  value,
  hint
}: {
  label: string
  value: string
  hint?: string
}): React.ReactElement {
  return (
    <Paper withBorder radius="md" p="md">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="xl" fw={700} className="metric-value" mt={2}>
        {value}
      </Text>
      {hint ? (
        <Text size="xs" c="dimmed" mt={4}>
          {hint}
        </Text>
      ) : null}
    </Paper>
  )
}

function IssueCard({ issue }: { issue: StatusIssue }): React.ReactElement {
  const color = severityColor(issue.severity)
  return (
    <Paper
      withBorder
      radius="md"
      p="md"
      style={{ borderLeft: `4px solid var(--mantine-color-${color}-6)` }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <Badge color={color} variant="light" size="sm">
            {severityLabel(issue.severity)}
          </Badge>
          <Text fw={600} size="sm">
            {issue.title}
          </Text>
        </Group>
        {issue.rawCode ? (
          <Text size="xs" c="dimmed" className="mono">
            {issue.rawCode}
          </Text>
        ) : null}
      </Group>
      <Text size="sm" c="dimmed" mt="xs">
        {issue.description}
      </Text>
      <Group gap={6} mt="xs" align="flex-start" wrap="nowrap">
        <IconTool size={14} color="var(--mantine-color-teal-5)" style={{ marginTop: 2, flexShrink: 0 }} />
        <Text size="sm">{issue.action}</Text>
      </Group>
    </Paper>
  )
}

function RawBlock({ title, value }: { title: string; value?: string }): React.ReactElement {
  return (
    <Accordion.Item value={title}>
      <Accordion.Control>{title}</Accordion.Control>
      <Accordion.Panel>
        {value ? (
          <Stack gap="xs">
            <Group justify="flex-end">
              <CopyButton value={value} timeout={2000}>
                {({ copied, copy }) => (
                  <Button
                    size="xs"
                    variant="subtle"
                    color={copied ? 'teal' : 'gray'}
                    leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    onClick={copy}
                  >
                    {copied ? 'Kopyalandı' : 'Kopyala'}
                  </Button>
                )}
              </CopyButton>
            </Group>
            <ScrollArea.Autosize mah={280} type="auto" offsetScrollbars>
              <Code block className="mono scroll-area-code" style={{ whiteSpace: 'pre-wrap' }}>
                {value}
              </Code>
            </ScrollArea.Autosize>
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">
            Veri yok.
          </Text>
        )}
      </Accordion.Panel>
    </Accordion.Item>
  )
}

export function PrinterDetailModal({ opened, printerId, onClose, onEdit }: Props): React.ReactElement {
  const { getPrinter, getStatus, refreshPrinter, refreshingIds, testingIds, quickTestPrint } =
    useAppData()
  const printer = printerId ? getPrinter(printerId) : undefined
  const status = printerId ? getStatus(printerId) : undefined
  const [tab, setTab] = useState<string>('general')
  const [samples, setSamples] = useState<HistorySample[]>([])
  const [samplesLoading, setSamplesLoading] = useState(false)

  useEffect(() => {
    if (!opened) return
    setTab('general')
    if (!printerId) return
    setSamplesLoading(true)
    void window.api
      .samples(printerId, 100)
      .then(setSamples)
      .catch(() => setSamples([]))
      .finally(() => setSamplesLoading(false))
    void refreshPrinter(printerId, true)
  }, [opened, printerId, refreshPrinter])

  const reloadSamples = (): void => {
    if (!printerId) return
    setSamplesLoading(true)
    void window.api
      .samples(printerId, 100)
      .then(setSamples)
      .catch(() => setSamples([]))
      .finally(() => setSamplesLoading(false))
  }

  const color = stateColor(status?.state)
  const issues = status?.issues ?? []
  const errorIssues = issues.filter((issue) => issue.severity === 'error')
  const warningIssues = issues.filter((issue) => issue.severity !== 'error')
  const refreshing = printerId ? refreshingIds.has(printerId) : false
  const testing = printerId ? testingIds.has(printerId) : false
  const labelMm =
    status?.hostStatus && status.identity
      ? status.hostStatus.labelLengthDots / status.identity.dotsPerMm
      : undefined

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="xl"
      title={
        printer ? (
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon size={34} radius="md" variant="light" color={color}>
              <IconNetwork size={18} />
            </ThemeIcon>
            <Box>
              <Group gap="xs">
                <Text fw={650}>{printer.name}</Text>
                <StatusBadge state={status?.state} size="xs" />
              </Group>
              <Text size="xs" c="dimmed">
                {printer.host}:{printer.port} · {printer.location || 'Konum belirtilmedi'}
              </Text>
            </Box>
          </Group>
        ) : (
          'Yazıcı Detayı'
        )
      }
      closeOnClickOutside
    >
      {!printer ? (
        <Alert color="yellow" icon={<IconAlertTriangle size={18} />}>
          Yazıcı kaydı bulunamadı. Silinmiş olabilir.
        </Alert>
      ) : (
        <Stack gap="md">
          <Group justify="space-between">
            <Group gap="xs">
              <Button
                variant="light"
                leftSection={<IconRefresh size={16} />}
                onClick={() => void refreshPrinter(printer.id)}
                loading={refreshing}
              >
                Yenile
              </Button>
              <Button
                variant="light"
                color="teal"
                leftSection={<IconBarcode size={16} />}
                onClick={() => void quickTestPrint(printer.id)}
                loading={testing}
              >
                Test Baskısı
              </Button>
              <Button
                variant="default"
                leftSection={<IconEdit size={16} />}
                onClick={() => onEdit(printer)}
              >
                Düzenle
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              Son sorgu: {formatRelative(status?.checkedAt)}
            </Text>
          </Group>

          <Tabs value={tab} onChange={(value) => setTab(value ?? 'general')} keepMounted={false}>
            <Tabs.List>
              <Tabs.Tab value="general">Genel</Tabs.Tab>
              <Tabs.Tab
                value="issues"
                rightSection={
                  issues.length > 0 ? (
                    <Badge size="xs" color={errorIssues.length > 0 ? 'red' : 'yellow'} variant="filled">
                      {issues.length}
                    </Badge>
                  ) : undefined
                }
              >
                Sorunlar
              </Tabs.Tab>
              <Tabs.Tab value="counters">Sayaçlar</Tabs.Tab>
              <Tabs.Tab value="settings">Ayarlar</Tabs.Tab>
              <Tabs.Tab value="history">Geçmiş</Tabs.Tab>
              <Tabs.Tab value="management">Yönetim</Tabs.Tab>
              <Tabs.Tab value="raw">Ham Veri</Tabs.Tab>
            </Tabs.List>

            <ScrollArea.Autosize mah="62vh" type="auto" offsetScrollbars mt="md">
              <Box pr="sm">
                <Tabs.Panel value="general">
                  <Stack gap="md">
                    <Paper withBorder radius="md" p="md">
                      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                        <InfoItem label="Model" value={status?.identity?.model} />
                        <InfoItem label="Seri numarası" value={status?.identity?.serial} mono />
                        <InfoItem label="Firmware" value={status?.identity?.firmware} mono />
                        <InfoItem label="Link-OS" value={status?.identity?.linkOsVersion} />
                        <InfoItem
                          label="Yapılandırma numarası"
                          value={status?.identity?.configurationNumber}
                          mono
                        />
                        <InfoItem label="Dost ad" value={status?.identity?.friendlyName} mono />
                        <InfoItem label="IP / port" value={`${printer.host}:${printer.port}`} mono />
                        <InfoItem
                          label="Bağlantı"
                          value={printer.connectionType === 'usb' ? 'USB' : 'Ağ'}
                        />
                        <InfoItem label="Konum" value={printer.location} />
                        <InfoItem label="Uptime" value={formatUptime(status?.uptime)} />
                        <InfoItem label="Gecikme" value={formatLatency(status?.latencyMs)} />
                        <InfoItem
                          label="RAM"
                          value={
                            status?.memory
                              ? `${formatMbFromKb(status.memory.freeKb)} boş / ${formatMbFromKb(
                                  status.memory.totalKb
                                )}`
                              : undefined
                          }
                        />
                        <InfoItem label="Son görülme" value={formatDateTime(status?.checkedAt)} />
                        <InfoItem
                          label="Sorgu aralığı"
                          value={`${printer.pollInterval} saniye`}
                        />
                        <InfoItem
                          label="Kayıt tarihi"
                          value={formatDateTime(printer.createdAt)}
                        />
                      </SimpleGrid>
                    </Paper>

                    {printer.notes ? (
                      <Alert color="blue" variant="light" icon={<IconInfoCircle size={18} />} title="Notlar">
                        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                          {printer.notes}
                        </Text>
                      </Alert>
                    ) : null}

                    {status ? (
                      <Alert
                        color={color}
                        variant="light"
                        icon={
                          status.state === 'error' ? (
                            <IconAlertTriangle size={18} />
                          ) : status.state === 'offline' ? (
                            <IconWifiOff size={18} />
                          ) : (
                            <IconInfoCircle size={18} />
                          )
                        }
                        title={`Durum: ${stateLabel(status.state)}`}
                      >
                        <Text size="sm">
                          {status.state === 'ready'
                            ? 'Yazıcı hazır ve aktif hata/uyarı bildirmiyor.'
                            : status.state === 'offline'
                              ? 'Yazıcıya ağ üzerinden ulaşılamıyor. IP, kablo ve güvenlik duvarı ayarlarını kontrol edin.'
                              : `${status.errors.length} hata ve ${status.warnings.length} uyarı bildirildi. Sorunlar sekmesini inceleyin.`}
                        </Text>
                      </Alert>
                    ) : (
                      <Alert color="gray" icon={<Loader size={16} />}>
                        İlk durum sorgusu bekleniyor…
                      </Alert>
                    )}
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="issues">
                  <Stack gap="md">
                    {issues.length === 0 ? (
                      <Alert color="teal" icon={<IconCircleCheck size={18} />} title="Aktif sorun yok">
                        <Text size="sm">
                          Yazıcı normal çalışıyor. Hata veya uyarı bayrağı bildirilmedi.
                        </Text>
                      </Alert>
                    ) : (
                      <>
                        {errorIssues.length > 0 ? (
                          <Stack gap="xs">
                            <Text size="xs" fw={600} c="red.4" tt="uppercase">
                              Hatalar ({errorIssues.length})
                            </Text>
                            {errorIssues.map((issue) => (
                              <IssueCard key={`${issue.code}-${issue.rawCode ?? ''}`} issue={issue} />
                            ))}
                          </Stack>
                        ) : null}
                        {warningIssues.length > 0 ? (
                          <Stack gap="xs">
                            <Text size="xs" fw={600} c="yellow.4" tt="uppercase">
                              Uyarılar ({warningIssues.length})
                            </Text>
                            {warningIssues.map((issue) => (
                              <IssueCard key={`${issue.code}-${issue.rawCode ?? ''}`} issue={issue} />
                            ))}
                          </Stack>
                        ) : null}
                      </>
                    )}
                    <Text size="xs" c="dimmed">
                      Bu değerler yazıcının ~HQES ve ~HS durum yanıtlarından üretilir. Eşikler
                      Zebra ZPL dokümanındaki hata bayraklarına dayanır.
                    </Text>
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="counters">
                  <Stack gap="md">
                    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                      <MetricCard
                        label="Toplam etiket"
                        value={formatNumber(status?.counters.labels)}
                        hint="Yazıcı sayacı (non-reset)"
                      />
                      <MetricCard
                        label="Toplam uzunluk"
                        value={formatKm(status?.counters.km)}
                        hint={
                          status?.counters.source === 'http'
                            ? 'Yazıcı web arayüzünden'
                            : 'Etiket boyundan tahmini'
                        }
                      />
                      <MetricCard
                        label="Etiket boyu"
                        value={labelMm !== undefined ? `${formatNumber(labelMm, 1)} mm` : '—'}
                        hint="~HS etiket uzunluğu"
                      />
                    </SimpleGrid>
                    <Paper withBorder radius="md" p="md">
                      <Group gap="xs">
                        <IconInfoCircle size={16} color="var(--mantine-color-dimmed)" />
                        <Text size="sm" c="dimmed">
                          Etiket sayısı yazıcıdan alınır. Toplam uzunluk, web arayüzü sayaçları
                          okunabiliyorsa kesin; okunamıyorsa mevcut etiket boyu × etiket sayısı
                          ile tahmin edilir.
                        </Text>
                      </Group>
                    </Paper>
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="settings">
                  <PrinterSettingsTab
                    printer={printer}
                    status={status}
                    onRefresh={() => void refreshPrinter(printer.id)}
                  />
                </Tabs.Panel>

                <Tabs.Panel value="history">
                  <Stack gap="md">
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">
                        Son 100 durum kaydı
                      </Text>
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={<IconRefresh size={14} />}
                        onClick={reloadSamples}
                        loading={samplesLoading}
                      >
                        Geçmişi Yenile
                      </Button>
                    </Group>
                    {samplesLoading ? (
                      <Group justify="center" py="lg">
                        <Loader size="sm" />
                      </Group>
                    ) : samples.length === 0 ? (
                      <Alert color="gray" icon={<IconInfoCircle size={18} />}>
                        Henüz geçmiş kaydı yok. Yazıcı sorgulandıkça kayıtlar burada birikecek.
                      </Alert>
                    ) : (
                      <Table.ScrollContainer minWidth={720}>
                        <Table withTableBorder withColumnBorders striped>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Zaman</Table.Th>
                              <Table.Th>Durum</Table.Th>
                              <Table.Th>Hata</Table.Th>
                              <Table.Th>Uyarı</Table.Th>
                              <Table.Th>Etiket</Table.Th>
                              <Table.Th>Gecikme</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {samples.map((sample) => (
                              <Table.Tr key={sample.id}>
                                <Table.Td>
                                  <Text size="xs">{formatDateTime(sample.checkedAt)}</Text>
                                </Table.Td>
                                <Table.Td>
                                  <StatusBadge state={sample.state} size="xs" />
                                </Table.Td>
                                <Table.Td>
                                  <Text size="xs" c={sample.errorCount > 0 ? 'red.4' : 'dimmed'}>
                                    {sample.errorCount}
                                  </Text>
                                </Table.Td>
                                <Table.Td>
                                  <Text size="xs" c={sample.warningCount > 0 ? 'yellow.4' : 'dimmed'}>
                                    {sample.warningCount}
                                  </Text>
                                </Table.Td>
                                <Table.Td>
                                  <Text size="xs">{formatNumber(sample.labelCount)}</Text>
                                </Table.Td>
                                <Table.Td>
                                  <Text size="xs">{formatLatency(sample.latencyMs)}</Text>
                                </Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </Table.ScrollContainer>
                    )}
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="management">
                  <PrinterManagementTab
                    printer={printer}
                    status={status}
                    onRefresh={() => void refreshPrinter(printer.id)}
                  />
                </Tabs.Panel>

                <Tabs.Panel value="raw">
                  <Stack gap="md">
                    <Text size="sm" c="dimmed">
                      Yazıcıdan alınan ham yanıtlar. Destek ekibiyle paylaşmak veya sorunları
                      karşılaştırmak için kullanılabilir.
                    </Text>
                    <Accordion variant="separated" radius="md">
                      <RawBlock title="~HS — Host Status" value={status?.raw.hostStatus} />
                      <RawBlock title="~HQES — Hata / Uyarı" value={status?.raw.systemStatus} />
                      <RawBlock title="~HI — Kimlik" value={status?.raw.identification} />
                      <RawBlock title="~HM — Bellek" value={status?.raw.memory} />
                      <RawBlock title="SGD — Sayaç ve Ayarlar" value={status?.raw.settings} />
                    </Accordion>
                    {status?.raw.error ? (
                      <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Son bağlantı hatası">
                        <Code block className="mono">
                          {status.raw.error}
                        </Code>
                      </Alert>
                    ) : null}
                  </Stack>
                </Tabs.Panel>
              </Box>
            </ScrollArea.Autosize>
          </Tabs>
        </Stack>
      )}
    </Modal>
  )
}
