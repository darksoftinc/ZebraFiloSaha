import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconBell,
  IconCircleCheck,
  IconPlus,
  IconPrinter,
  IconRadar,
  IconRefresh,
  IconSearch,
  IconWifi,
  IconWifiOff
} from '@tabler/icons-react'
import { useAppData } from '../store'
import { PrinterCard } from '../components/PrinterCard'
import { formatRelative } from '../lib/format'

interface Props {
  onOpenPrinter: (id: number) => void
  onAddPrinter: () => void
  onDiscover: () => void
}

function StatCard({
  label,
  value,
  color,
  icon
}: {
  label: string
  value: number
  color: string
  icon: React.ReactNode
}): React.ReactElement {
  return (
    <Paper withBorder radius="lg" p="md">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Box>
          <Text size="xs" c="dimmed">
            {label}
          </Text>
          <Text size="26px" fw={700} lh={1.15} className="metric-value" mt={4}>
            {value}
          </Text>
        </Box>
        <ThemeIcon size={42} radius="md" variant="light" color={color}>
          {icon}
        </ThemeIcon>
      </Group>
    </Paper>
  )
}

export function Dashboard({ onOpenPrinter, onAddPrinter, onDiscover }: Props): React.ReactElement {
  const {
    loading,
    printers,
    sortedPrinters,
    statuses,
    summary,
    refreshingAll,
    refreshingIds,
    testingIds,
    refreshAll,
    refreshPrinter,
    quickTestPrint
  } = useAppData()
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState<string>('all')
  const [siteFilter, setSiteFilter] = useState<string>('all')

  const sites = useMemo(
    () => [...new Set(printers.map((printer) => printer.site).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')),
    [printers]
  )

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('tr')
    return sortedPrinters.filter((printer) => {
      const status = statuses[printer.id]
      const state = status?.state
      const matchesQuery =
        query.length === 0 ||
        printer.name.toLocaleLowerCase('tr').includes(query) ||
        printer.host.toLocaleLowerCase('tr').includes(query) ||
        printer.site.toLocaleLowerCase('tr').includes(query) ||
        printer.location.toLocaleLowerCase('tr').includes(query)

      let matchesState = true
      if (stateFilter === 'error') matchesState = state === 'error'
      else if (stateFilter === 'warning') matchesState = state === 'warning' || state === 'paused'
      else if (stateFilter === 'offline')
        matchesState = !status || state === 'offline' || state === 'unknown'
      else if (stateFilter === 'ready') matchesState = state === 'ready'

      const matchesSite = siteFilter === 'all' || printer.site === siteFilter

      return matchesQuery && matchesState && matchesSite
    })
  }, [search, siteFilter, sortedPrinters, stateFilter, statuses])

  const lastUpdate = useMemo(() => {
    const values = Object.values(statuses)
      .map((status) => status.checkedAt)
      .filter(Boolean)
      .sort()
    return values.length > 0 ? values[values.length - 1] : undefined
  }, [statuses])

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Box>
          <Title order={2}>Genel Bakış</Title>
          <Text size="sm" c="dimmed" mt={2}>
            Tesisteki Zebra yazıcıların anlık durumu, sayaçları ve aktif sorunları.
          </Text>
        </Box>
        <Group gap="sm">
          <Text size="xs" c="dimmed">
            Son güncelleme: {lastUpdate ? formatRelative(lastUpdate) : '—'}
          </Text>
          <Button
            variant="default"
            leftSection={<IconRadar size={16} />}
            onClick={onDiscover}
          >
            Ağda Ara
          </Button>
          <Button
            variant="default"
            leftSection={<IconRefresh size={16} />}
            onClick={() => void refreshAll()}
            loading={refreshingAll}
          >
            Tümünü Yenile
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={onAddPrinter}>
            Yazıcı Ekle
          </Button>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <StatCard
          label="Toplam yazıcı"
          value={summary.total}
          color="blue"
          icon={<IconPrinter size={22} />}
        />
        <StatCard
          label="Çevrimiçi"
          value={summary.online}
          color="teal"
          icon={<IconWifi size={22} />}
        />
        <StatCard
          label="Uyarı"
          value={summary.warnings}
          color="yellow"
          icon={<IconBell size={22} />}
        />
        <StatCard
          label="Hata / çevrimdışı"
          value={summary.errors + summary.offline}
          color={summary.errors + summary.offline > 0 ? 'red' : 'teal'}
          icon={
            summary.errors + summary.offline > 0 ? (
              <IconAlertTriangle size={22} />
            ) : (
              <IconCircleCheck size={22} />
            )
          }
        />
      </SimpleGrid>

      {loading ? (
        <Center py="xl">
          <Stack align="center" gap="sm">
            <Loader />
            <Text size="sm" c="dimmed">
              Yazıcılar yükleniyor…
            </Text>
          </Stack>
        </Center>
      ) : printers.length === 0 ? (
        <Paper withBorder radius="lg" p="xl">
          <Stack align="center" gap="md" py="xl">
            <ThemeIcon size={72} radius={20} variant="light" color="teal">
              <IconPrinter size={38} />
            </ThemeIcon>
            <Title order={3}>Henüz yazıcı eklenmedi</Title>
            <Text c="dimmed" ta="center" maw={560}>
              ZT411 yazıcılarınızı IP adresiyle ekleyerek canlı durum, hata geçmişi, sayaçlar ve
              tanılama bilgilerini tek ekrandan izleyebilirsiniz.
            </Text>
            <Group>
              <Button leftSection={<IconRadar size={16} />} onClick={onDiscover} size="md" variant="light">
                Ağda Ara
              </Button>
              <Button leftSection={<IconPlus size={16} />} onClick={onAddPrinter} size="md">
                İlk Yazıcıyı Ekle
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              İpucu: Yazıcının ham baskı portu genellikle 9100'dür. Örnek: 192.168.1.102
            </Text>
          </Stack>
        </Paper>
      ) : (
        <>
          <Group justify="space-between" align="center">
            <Group gap="sm" style={{ flex: 1 }}>
              <TextInput
                placeholder="Ad, IP veya konum ara…"
                leftSection={<IconSearch size={16} />}
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                style={{ maxWidth: 340, width: '100%' }}
              />
              <Select
                value={stateFilter}
                onChange={(value) => setStateFilter(value ?? 'all')}
                data={[
                  { value: 'all', label: 'Tüm durumlar' },
                  { value: 'error', label: 'Hata' },
                  { value: 'warning', label: 'Uyarı / duraklatıldı' },
                  { value: 'offline', label: 'Çevrimdışı' },
                  { value: 'ready', label: 'Hazır' }
                ]}
                allowDeselect={false}
                w={210}
              />
              {sites.length > 0 ? (
                <Select
                  value={siteFilter}
                  onChange={(value) => setSiteFilter(value ?? 'all')}
                  data={[{ value: 'all', label: 'Tüm sahalar' }, ...sites.map((site) => ({ value: site, label: site }))]}
                  allowDeselect={false}
                  w={190}
                />
              ) : null}
            </Group>
            <Text size="xs" c="dimmed">
              {filtered.length} / {printers.length} yazıcı
            </Text>
          </Group>

          {filtered.length === 0 ? (
            <Alert color="gray" icon={<IconWifiOff size={18} />}>
              Arama veya durum filtresine uygun yazıcı bulunamadı.
            </Alert>
          ) : (
            <SimpleGrid cols={{ base: 1, lg: 2, xl: 3 }} spacing="lg">
              {filtered.map((printer) => (
                <PrinterCard
                  key={printer.id}
                  printer={printer}
                  status={statuses[printer.id]}
                  refreshing={refreshingIds.has(printer.id)}
                  testing={testingIds.has(printer.id)}
                  onOpen={onOpenPrinter}
                  onRefresh={(id) => void refreshPrinter(id)}
                  onTest={(id) => void quickTestPrint(id)}
                />
              ))}
            </SimpleGrid>
          )}
        </>
      )}
    </Stack>
  )
}
