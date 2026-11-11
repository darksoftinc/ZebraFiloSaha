import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Code,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Title
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconBell,
  IconHistory,
  IconInfoCircle,
  IconRefresh,
  IconShieldCheck
} from '@tabler/icons-react'
import type { AlertRecord, AuditEntry, HistorySample } from '@shared/types'
import {
  formatDateTime,
  formatLatency,
  formatNumber,
  formatRelative,
  severityColor,
  severityLabel
} from '../lib/format'
import { StatusBadge } from '../components/StatusBadge'

export function History(): React.ReactElement {
  const [tab, setTab] = useState<string>('alerts')
  const [alerts, setAlerts] = useState<AlertRecord[]>([])
  const [samples, setSamples] = useState<HistorySample[]>([])
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [alertFilter, setAlertFilter] = useState<string>('active')

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const [alertResult, sampleResult, auditResult] = await Promise.all([
        window.api.alerts(300),
        window.api.recentSamples(300),
        window.api.audit(300)
      ])
      setAlerts(alertResult)
      setSamples(sampleResult)
      setAuditEntries(auditResult)
    } catch {
      setAlerts([])
      setSamples([])
      setAuditEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const activeAlerts = useMemo(() => alerts.filter((alert) => alert.resolvedAt === null), [alerts])
  const activeErrors = activeAlerts.filter((alert) => alert.severity === 'error').length
  const activeWarnings = activeAlerts.filter((alert) => alert.severity !== 'error').length

  const filteredAlerts = useMemo(() => {
    if (alertFilter === 'active') return alerts.filter((alert) => alert.resolvedAt === null)
    if (alertFilter === 'resolved') return alerts.filter((alert) => alert.resolvedAt !== null)
    return alerts
  }, [alertFilter, alerts])

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Box>
          <Title order={2}>Geçmiş ve Olaylar</Title>
          <Text size="sm" c="dimmed" mt={2}>
            Yazıcı durum kayıtları ve otomatik oluşturulan hata / uyarı olayları.
          </Text>
        </Box>
        <Button
          variant="default"
          leftSection={<IconRefresh size={16} />}
          onClick={() => void load()}
          loading={loading}
        >
          Yenile
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <Paper withBorder radius="lg" p="md">
          <Group justify="space-between">
            <Box>
              <Text size="xs" c="dimmed">
                Aktif hata
              </Text>
              <Text size="xl" fw={700} c={activeErrors > 0 ? 'red.4' : undefined}>
                {activeErrors}
              </Text>
            </Box>
            <IconAlertTriangle size={22} color="var(--mantine-color-red-5)" />
          </Group>
        </Paper>
        <Paper withBorder radius="lg" p="md">
          <Group justify="space-between">
            <Box>
              <Text size="xs" c="dimmed">
                Aktif uyarı
              </Text>
              <Text size="xl" fw={700} c={activeWarnings > 0 ? 'yellow.4' : undefined}>
                {activeWarnings}
              </Text>
            </Box>
            <IconBell size={22} color="var(--mantine-color-yellow-5)" />
          </Group>
        </Paper>
        <Paper withBorder radius="lg" p="md">
          <Group justify="space-between">
            <Box>
              <Text size="xs" c="dimmed">
                Toplam olay
              </Text>
              <Text size="xl" fw={700}>{alerts.length}</Text>
            </Box>
            <IconHistory size={22} color="var(--mantine-color-blue-5)" />
          </Group>
        </Paper>
      </SimpleGrid>

      <Tabs value={tab} onChange={(value) => setTab(value ?? 'alerts')}>
        <Tabs.List>
          <Tabs.Tab value="alerts" leftSection={<IconBell size={15} />}>
            Olaylar
          </Tabs.Tab>
          <Tabs.Tab value="samples" leftSection={<IconHistory size={15} />}>
            Durum Kayıtları
          </Tabs.Tab>
          <Tabs.Tab value="audit" leftSection={<IconShieldCheck size={15} />}>
            İşlem Geçmişi
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="alerts" pt="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Select
                value={alertFilter}
                onChange={(value) => setAlertFilter(value ?? 'active')}
                data={[
                  { value: 'active', label: 'Aktif olaylar' },
                  { value: 'resolved', label: 'Çözülen olaylar' },
                  { value: 'all', label: 'Tümü' }
                ]}
                allowDeselect={false}
                w={200}
              />
              <Text size="xs" c="dimmed">
                {filteredAlerts.length} kayıt
              </Text>
            </Group>

            {loading ? (
              <Center py="lg">
                <Loader size="sm" />
              </Center>
            ) : filteredAlerts.length === 0 ? (
              <Alert color="gray" icon={<IconInfoCircle size={18} />}>
                Bu filtreye uygun olay kaydı yok.
              </Alert>
            ) : (
              <Table.ScrollContainer minWidth={900}>
                <Table withTableBorder withColumnBorders striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Durum</Table.Th>
                      <Table.Th>Önem</Table.Th>
                      <Table.Th>Yazıcı</Table.Th>
                      <Table.Th>Kod</Table.Th>
                      <Table.Th>Başlık</Table.Th>
                      <Table.Th>İlk görülme</Table.Th>
                      <Table.Th>Son görülme</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {filteredAlerts.map((alert) => (
                      <Table.Tr key={alert.id}>
                        <Table.Td>
                          {alert.resolvedAt ? (
                            <Badge color="teal" variant="light" size="xs">
                              Çözüldü
                            </Badge>
                          ) : (
                            <Badge color="red" variant="light" size="xs">
                              Aktif
                            </Badge>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Badge color={severityColor(alert.severity)} variant="light" size="xs">
                            {severityLabel(alert.severity)}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs">{alert.printerName}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" className="mono">
                            {alert.code}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" lineClamp={2}>
                            {alert.title}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs">{formatDateTime(alert.firstSeen)}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs">{formatRelative(alert.lastSeen)}</Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="samples" pt="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                Son 300 durum kaydı
              </Text>
            </Group>
            {loading ? (
              <Center py="lg">
                <Loader size="sm" />
              </Center>
            ) : samples.length === 0 ? (
              <Alert color="gray" icon={<IconInfoCircle size={18} />}>
                Henüz durum kaydı yok. Yazıcılar sorgulandıkça kayıtlar burada birikecek.
              </Alert>
            ) : (
              <Table.ScrollContainer minWidth={900}>
                <Table withTableBorder withColumnBorders striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Zaman</Table.Th>
                      <Table.Th>Yazıcı</Table.Th>
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
                          <Text size="xs">{sample.printerName}</Text>
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

        <Tabs.Panel value="audit" pt="md">
          <Stack gap="md">
            <Text size="xs" c="dimmed">
              Yazdırma, ayar geri yükleme, firmware, bakım ve yazıcı değişikliklerinin denetim
              kaydı. Son 300 işlem.
            </Text>
            {loading ? (
              <Center py="lg"><Loader size="sm" /></Center>
            ) : auditEntries.length === 0 ? (
              <Alert color="gray" icon={<IconInfoCircle size={18} />}>
                Henüz işlem kaydı yok.
              </Alert>
            ) : (
              <Table.ScrollContainer minWidth={760}>
                <Table withTableBorder withColumnBorders striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Zaman</Table.Th>
                      <Table.Th>Yazıcı</Table.Th>
                      <Table.Th>İşlem</Table.Th>
                      <Table.Th>Ayrıntı</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {auditEntries.map((entry) => (
                      <Table.Tr key={entry.id}>
                        <Table.Td><Text size="xs">{formatDateTime(entry.createdAt)}</Text></Table.Td>
                        <Table.Td><Text size="xs">{entry.printerName ?? 'Sistem'}</Text></Table.Td>
                        <Table.Td><Code>{entry.action}</Code></Table.Td>
                        <Table.Td><Text size="xs">{entry.detail}</Text></Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}
