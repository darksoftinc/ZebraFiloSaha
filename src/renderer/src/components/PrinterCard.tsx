import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Tooltip
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconBarcode,
  IconChevronRight,
  IconCircleCheck,
  IconClock,
  IconNetwork,
  IconPrinter,
  IconRefresh,
  IconUsb,
  IconWifiOff
} from '@tabler/icons-react'
import type { PrinterRecord, PrinterStatus } from '@shared/types'
import { formatKm, formatNumber, formatRelative, stateColor } from '../lib/format'
import { StatusBadge } from './StatusBadge'

interface Props {
  printer: PrinterRecord
  status?: PrinterStatus
  refreshing: boolean
  testing: boolean
  onOpen: (id: number) => void
  onRefresh: (id: number) => void
  onTest: (id: number) => void
}

function Metric({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <Box>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={600} className="metric-value">
        {value}
      </Text>
    </Box>
  )
}

export function PrinterCard({
  printer,
  status,
  refreshing,
  testing,
  onOpen,
  onRefresh,
  onTest
}: Props): React.ReactElement {
  const color = stateColor(status?.state)
  const issues = status?.issues ?? []
  const errorCount = status?.errors.length ?? 0
  const warningCount = status?.warnings.length ?? 0
  const lastSeen = status?.checkedAt ?? null

  return (
    <Paper
      className="printer-card"
      withBorder
      radius="lg"
      p="lg"
      style={{ borderTop: `3px solid var(--mantine-color-${color}-6)` }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon size={44} radius="md" variant="light" color={color}>
            <IconPrinter size={23} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text fw={650} size="md" lineClamp={1}>
              {printer.name}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {[printer.site, printer.location].filter(Boolean).join(' · ') ||
                (printer.connectionType === 'usb' ? 'Windows kuyruğu' : 'Konum belirtilmedi')}
            </Text>
          </Box>
        </Group>
        <StatusBadge state={status?.state} />
      </Group>

      <Group gap={6} mt="sm" wrap="nowrap">
        {printer.connectionType === 'usb' ? (
          <IconUsb size={14} color="var(--mantine-color-dimmed)" />
        ) : (
          <IconNetwork size={14} color="var(--mantine-color-dimmed)" />
        )}
        <Text size="xs" c="dimmed" className="mono" lineClamp={1}>
          {printer.connectionType === 'usb'
            ? printer.windowsPrinterName || 'Windows kuyruğu'
            : `${printer.host}:${printer.port}`}
        </Text>
        {status?.identity?.model ? (
          <Text size="xs" c="dimmed" lineClamp={1}>
            · {status.identity.model}
          </Text>
        ) : null}
      </Group>

      <SimpleGrid cols={3} spacing="sm" mt="md">
        <Metric label="Etiket" value={formatNumber(status?.counters.labels)} />
        <Metric label="Toplam uzunluk" value={formatKm(status?.counters.km)} />
        <Metric label="Son görülme" value={formatRelative(lastSeen)} />
      </SimpleGrid>

      <Divider my="md" />

      <Box style={{ minHeight: 42 }}>
        {!status ? (
          <Group gap={6}>
            <IconClock size={15} color="var(--mantine-color-dimmed)" />
            <Text size="xs" c="dimmed">
              İlk durum sorgusu bekleniyor…
            </Text>
          </Group>
        ) : issues.length === 0 ? (
          <Group gap={6}>
            <IconCircleCheck size={16} color="var(--mantine-color-teal-5)" />
            <Text size="xs" c="teal.4">
              Aktif sorun yok
            </Text>
          </Group>
        ) : (
          <Stack gap={6}>
            {issues.slice(0, 2).map((issue) => (
              <Group key={`${issue.code}-${issue.rawCode ?? ''}`} gap={8} wrap="nowrap">
                {issue.severity === 'error' ? (
                  <IconAlertTriangle size={15} color="var(--mantine-color-red-5)" />
                ) : (
                  <IconAlertTriangle size={15} color="var(--mantine-color-yellow-5)" />
                )}
                <Text size="xs" lineClamp={1}>
                  {issue.title}
                </Text>
              </Group>
            ))}
            {issues.length > 2 ? (
              <Text size="xs" c="dimmed">
                +{issues.length - 2} sorun daha
              </Text>
            ) : null}
            {errorCount === 0 && warningCount > 0 ? (
              <Text size="xs" c="dimmed">
                Uyarılar üretimi durdurabilir; detaydan kontrol edin.
              </Text>
            ) : null}
          </Stack>
        )}
        {status?.state === 'offline' ? (
          <Group gap={6} mt={6}>
            <IconWifiOff size={15} color="var(--mantine-color-gray-5)" />
            <Text size="xs" c="dimmed">
              Ağ bağlantısı yok
            </Text>
          </Group>
        ) : null}
      </Box>

      <Group justify="space-between" mt="md">
        <Text size="xs" c="dimmed">
          Sorgu: {printer.pollInterval} sn
        </Text>
        <Group gap={6}>
          <Tooltip label="Şimdi yenile">
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => onRefresh(printer.id)}
              loading={refreshing}
              aria-label="Yenile"
            >
              <IconRefresh size={17} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Tek tıkla test etiketi basar">
            <Button
              size="xs"
              variant="light"
              color="teal"
              leftSection={<IconBarcode size={14} />}
              onClick={() => onTest(printer.id)}
              loading={testing}
            >
              Test Baskı
            </Button>
          </Tooltip>
          <Button
            size="xs"
            variant="light"
            rightSection={<IconChevronRight size={14} />}
            onClick={() => onOpen(printer.id)}
          >
            Detay
          </Button>
        </Group>
      </Group>
    </Paper>
  )
}
