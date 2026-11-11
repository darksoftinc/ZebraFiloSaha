import { useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconAlertTriangle,
  IconBarcode,
  IconChartBar,
  IconClock,
  IconDownload,
  IconFileSpreadsheet,
  IconFileTypePdf,
  IconInfoCircle,
  IconRefresh
} from '@tabler/icons-react'
import type { ReportResult } from '@shared/types'
import { formatNumber } from '../lib/format'
import { readableError } from '../store'

function isoDate(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 86400000)
  return date.toISOString().slice(0, 10)
}

export function Reports(): React.ReactElement {
  const [from, setFrom] = useState(isoDate(-7))
  const [to, setTo] = useState(isoDate(0))
  const [report, setReport] = useState<ReportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null)
  const [siteFilter, setSiteFilter] = useState<string>('all')

  const build = async (): Promise<void> => {
    setLoading(true)
    try {
      setReport(await window.api.buildReport(from, to))
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Rapor oluşturulamadı',
        message: readableError(error)
      })
    } finally {
      setLoading(false)
    }
  }

  const exportFile = async (format: 'xlsx' | 'pdf'): Promise<void> => {
    setExporting(format)
    try {
      const result =
        format === 'xlsx'
          ? await window.api.exportReportXlsx(from, to)
          : await window.api.exportReportPdf(from, to)
      notifications.show({
        color: result.ok ? 'teal' : 'gray',
        title: result.ok ? 'Rapor kaydedildi' : 'Dışa aktarma',
        message: result.path ?? result.message,
        autoClose: result.ok ? 8000 : 4000
      })
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Rapor dışa aktarılamadı',
        message: readableError(error)
      })
    } finally {
      setExporting(null)
    }
  }

  const sites = useMemo(() => {
    if (!report) return []
    return [...new Set(report.rows.map((row) => row.site).filter(Boolean))]
  }, [report])

  const rows = useMemo(() => {
    if (!report) return []
    if (siteFilter === 'all') return report.rows
    return report.rows.filter((row) => row.site === siteFilter)
  }, [report, siteFilter])

  const filteredTotals = useMemo(() => {
    return rows.reduce(
      (accumulator, row) => {
        accumulator.labels += row.labelsPrinted ?? 0
        accumulator.errors += row.errorEvents
        accumulator.warnings += row.warningEvents
        accumulator.downtime += row.downtimeMinutes
        return accumulator
      },
      { labels: 0, errors: 0, warnings: 0, downtime: 0 }
    )
  }, [rows])

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Box>
          <Title order={2}>Raporlar</Title>
          <Text size="sm" c="dimmed" mt={2}>
            Etiket üretimi, hata sıklığı, duruş, MTBF/MTTR ve çevrimiçi kalma oranı.
          </Text>
        </Box>
        <Group gap="sm">
          <Button
            variant="default"
            leftSection={<IconFileSpreadsheet size={16} />}
            onClick={() => void exportFile('xlsx')}
            loading={exporting === 'xlsx'}
          >
            Excel
          </Button>
          <Button
            variant="default"
            leftSection={<IconFileTypePdf size={16} />}
            onClick={() => void exportFile('pdf')}
            loading={exporting === 'pdf'}
          >
            PDF
          </Button>
        </Group>
      </Group>

      <Paper withBorder radius="lg" p="lg">
        <Group align="flex-end" gap="md">
          <TextInput
            label="Başlangıç"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.currentTarget.value)}
            w={180}
          />
          <TextInput
            label="Bitiş"
            type="date"
            value={to}
            onChange={(event) => setTo(event.currentTarget.value)}
            w={180}
          />
          <Button
            leftSection={<IconRefresh size={16} />}
            onClick={() => void build()}
            loading={loading}
          >
            Raporu Oluştur
          </Button>
          {sites.length > 0 ? (
            <Select
              label="Saha"
              value={siteFilter}
              onChange={(value) => setSiteFilter(value ?? 'all')}
              data={[{ value: 'all', label: 'Tüm sahalar' }, ...sites.map((site) => ({ value: site, label: site }))]}
              allowDeselect={false}
              w={220}
            />
          ) : null}
        </Group>
      </Paper>

      {loading ? (
        <Center py="xl"><Loader /></Center>
      ) : !report ? (
        <Alert color="blue" icon={<IconInfoCircle size={18} />} title="Rapor hazır değil">
          <Text size="sm">
            Tarih aralığını seçip “Raporu Oluştur” düğmesine basın. Rapor, toplanan durum
            kayıtlarından ve olay geçmişinden üretilir.
          </Text>
        </Alert>
      ) : (
        <>
          <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
            <Paper withBorder radius="lg" p="md">
              <Group justify="space-between">
                <Box>
                  <Text size="xs" c="dimmed">Toplam etiket</Text>
                  <Text size="xl" fw={700}>{formatNumber(filteredTotals.labels)}</Text>
                </Box>
                <IconBarcode size={22} color="var(--mantine-color-teal-5)" />
              </Group>
            </Paper>
            <Paper withBorder radius="lg" p="md">
              <Group justify="space-between">
                <Box>
                  <Text size="xs" c="dimmed">Hata olayı</Text>
                  <Text size="xl" fw={700} c={filteredTotals.errors > 0 ? 'red.4' : undefined}>
                    {filteredTotals.errors}
                  </Text>
                </Box>
                <IconAlertTriangle size={22} color="var(--mantine-color-red-5)" />
              </Group>
            </Paper>
            <Paper withBorder radius="lg" p="md">
              <Group justify="space-between">
                <Box>
                  <Text size="xs" c="dimmed">Uyarı olayı</Text>
                  <Text size="xl" fw={700} c={filteredTotals.warnings > 0 ? 'yellow.4' : undefined}>
                    {filteredTotals.warnings}
                  </Text>
                </Box>
                <IconChartBar size={22} color="var(--mantine-color-yellow-5)" />
              </Group>
            </Paper>
            <Paper withBorder radius="lg" p="md">
              <Group justify="space-between">
                <Box>
                  <Text size="xs" c="dimmed">Toplam duruş</Text>
                  <Text size="xl" fw={700}>{formatNumber(filteredTotals.downtime)} dk</Text>
                </Box>
                <IconClock size={22} color="var(--mantine-color-violet-5)" />
              </Group>
            </Paper>
          </SimpleGrid>

          <Table.ScrollContainer minWidth={1080}>
            <Table withTableBorder withColumnBorders striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Yazıcı</Table.Th>
                  <Table.Th>Saha</Table.Th>
                  <Table.Th>Etiket</Table.Th>
                  <Table.Th>Hata</Table.Th>
                  <Table.Th>Uyarı</Table.Th>
                  <Table.Th>Duruş (dk)</Table.Th>
                  <Table.Th>MTBF (sa)</Table.Th>
                  <Table.Th>MTTR (dk)</Table.Th>
                  <Table.Th>Çevrimiçi</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => (
                  <Table.Tr key={row.printerId}>
                    <Table.Td><Text size="sm" fw={550}>{row.printerName}</Text></Table.Td>
                    <Table.Td><Text size="xs">{row.site || '—'}</Text></Table.Td>
                    <Table.Td><Text size="xs">{formatNumber(row.labelsPrinted ?? 0)}</Text></Table.Td>
                    <Table.Td>
                      <Text size="xs" c={row.errorEvents > 0 ? 'red.4' : 'dimmed'}>
                        {row.errorEvents}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c={row.warningEvents > 0 ? 'yellow.4' : 'dimmed'}>
                        {row.warningEvents}
                      </Text>
                    </Table.Td>
                    <Table.Td><Text size="xs">{formatNumber(row.downtimeMinutes)}</Text></Table.Td>
                    <Table.Td><Text size="xs">{row.mtbfHours ?? '—'}</Text></Table.Td>
                    <Table.Td><Text size="xs">{row.mttrMinutes ?? '—'}</Text></Table.Td>
                    <Table.Td>
                      <Stack gap={2} w={110}>
                        <Progress
                          value={row.onlinePercent}
                          color={row.onlinePercent >= 95 ? 'teal' : row.onlinePercent >= 80 ? 'yellow' : 'red'}
                          size="sm"
                        />
                        <Text size="xs" c="dimmed">{row.onlinePercent.toFixed(1)}%</Text>
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>

          <Alert color="gray" variant="light" icon={<IconInfoCircle size={18} />}>
            <Text size="sm">
              MTBF/MTTR değerleri, toplanan durum kayıtları ve olay sürelerinden tahmin edilir.
              Daha isabetli sonuç için uygulamanın düzenli çalışması ve sorgu aralığının kısa
              olması gerekir. Etiket üretimi, dönem başı ve sonu sayaç farkından hesaplanır.
            </Text>
          </Alert>
        </>
      )}
    </Stack>
  )
}
