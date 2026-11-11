import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Title
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconCircleCheck,
  IconInfoCircle,
  IconPlus,
  IconRadar,
  IconSearch
} from '@tabler/icons-react'
import type { DiscoveredPrinter, DiscoveryResult, LocalSubnet } from '@shared/types'
import { useAppData, readableError } from '../store'

interface Props {
  opened: boolean
  onClose: () => void
}

export function DiscoveryModal({ opened, onClose }: Props): React.ReactElement {
  const { printers, createPrinter } = useAppData()
  const [subnets, setSubnets] = useState<LocalSubnet[]>([])
  const [subnet, setSubnet] = useState('')
  const [site, setSite] = useState('')
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<DiscoveryResult | null>(null)
  const [addedHosts, setAddedHosts] = useState<Set<string>>(new Set())
  const [addingHost, setAddingHost] = useState<string | null>(null)

  useEffect(() => {
    if (!opened) return
    setResult(null)
    setAddedHosts(new Set())
    void window.api
      .localSubnets()
      .then((items) => {
        setSubnets(items)
        setSubnet(items[0]?.cidr ?? '')
      })
      .catch(() => {
        setSubnets([])
        setSubnet('')
      })
  }, [opened])

  const existingHosts = useMemo(
    () =>
      new Set(
        printers
          .filter((printer) => printer.connectionType === 'network')
          .map((printer) => `${printer.host}:${printer.port}`)
      ),
    [printers]
  )

  const scan = async (): Promise<void> => {
    setScanning(true)
    setResult(null)
    try {
      const found = await window.api.discoverPrinters(subnet || undefined)
      setResult(found)
      if (found.found.length === 0) {
        notifications.show({
          color: 'gray',
          title: 'Yazıcı bulunamadı',
          message: `${found.subnet} ağında 9100 portu açık Zebra yazıcı bulunamadı.`
        })
      }
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Tarama başarısız',
        message: readableError(error)
      })
    } finally {
      setScanning(false)
    }
  }

  const addPrinter = async (item: DiscoveredPrinter): Promise<void> => {
    setAddingHost(item.host)
    try {
      const suffix = item.host.split('.').pop() ?? item.host
      await createPrinter({
        name: item.model ? `${item.model} ${suffix}` : `Zebra ${item.host}`,
        host: item.host,
        port: item.port,
        connectionType: 'network',
        windowsPrinterName: '',
        site: site.trim(),
        location: '',
        notes: `Otomatik keşifle eklendi (${new Date().toLocaleString('tr-TR')})`,
        enabled: true
      })
      setAddedHosts((previous) => new Set(previous).add(item.host))
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Yazıcı eklenemedi',
        message: readableError(error)
      })
    } finally {
      setAddingHost(null)
    }
  }

  const addAll = async (): Promise<void> => {
    if (!result) return
    for (const item of result.found) {
      if (existingHosts.has(`${item.host}:${item.port}`) || addedHosts.has(item.host)) continue
      await addPrinter(item)
    }
  }

  const pendingCount = result
    ? result.found.filter(
        (item) => !existingHosts.has(`${item.host}:${item.port}`) && !addedHosts.has(item.host)
      ).length
    : 0

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="xl"
      title={
        <Group gap="sm">
          <IconRadar size={20} />
          <Text fw={650}>Ağda Zebra Yazıcı Ara</Text>
        </Group>
      }
    >
      <Stack gap="md">
        <Alert color="blue" variant="light" icon={<IconInfoCircle size={18} />}>
          <Text size="sm">
            Yerel ağdaki 254 adres, 9100 portu üzerinden taranır. Bulunan cihazların Zebra
            olduğu model ve web arayüzü ile doğrulanır. Tarama birkaç saniye sürebilir.
          </Text>
        </Alert>

        <Group align="flex-end">
          <TextInput
            label="Taranacak alt ağ"
            placeholder="192.168.1.0/24"
            value={subnet}
            onChange={(event) => setSubnet(event.currentTarget.value)}
            className="mono"
            style={{ flex: 1 }}
          />
          <TextInput
            label="Saha (isteğe bağlı)"
            placeholder="Örn. Merkez Tesis"
            value={site}
            onChange={(event) => setSite(event.currentTarget.value)}
            w={220}
          />
          <Button
            leftSection={<IconSearch size={16} />}
            onClick={() => void scan()}
            loading={scanning}
          >
            Taramayı Başlat
          </Button>
        </Group>

        {subnets.length > 0 ? (
          <Group gap="xs">
            <Text size="xs" c="dimmed">
              Yerel ağlar:
            </Text>
            {subnets.map((item) => (
              <Badge
                key={item.cidr}
                variant={subnet === item.cidr ? 'filled' : 'light'}
                color="teal"
                style={{ cursor: 'pointer' }}
                onClick={() => setSubnet(item.cidr)}
              >
                {item.cidr} · {item.interfaceName}
              </Badge>
            ))}
          </Group>
        ) : null}

        {scanning ? (
          <Center py="xl">
            <Stack align="center" gap="sm">
              <Loader />
              <Text size="sm" c="dimmed">
                {subnet || 'Yerel ağ'} taranıyor…
              </Text>
            </Stack>
          </Center>
        ) : result ? (
          <Stack gap="md">
            <Group justify="space-between">
              <Text size="sm">
                <b>{result.subnet}</b> · {result.scanned} adres tarandı ·{' '}
                <b>{result.found.length}</b> Zebra yazıcı · {(result.durationMs / 1000).toFixed(1)} sn
              </Text>
              {pendingCount > 0 ? (
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => void addAll()}
                >
                  Kalan {pendingCount} yazıcıyı ekle
                </Button>
              ) : null}
            </Group>

            {result.found.length === 0 ? (
              <Alert color="gray" icon={<IconInfoCircle size={18} />} title="Zebra yazıcı bulunamadı">
                <Text size="sm">
                  Yazıcının açık olduğundan, aynı alt ağda olduğundan ve 9100 portunun güvenlik
                  duvarı tarafından engellenmediğinden emin olun. Gerekirse alt ağ adresini elle
                  girin.
                </Text>
              </Alert>
            ) : (
              <ScrollArea.Autosize mah={400} type="auto" offsetScrollbars>
                <Table withTableBorder withColumnBorders striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>IP</Table.Th>
                      <Table.Th>Model</Table.Th>
                      <Table.Th>Seri</Table.Th>
                      <Table.Th>Firmware</Table.Th>
                      <Table.Th>Durum</Table.Th>
                      <Table.Th>İşlem</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {result.found.map((item) => {
                      const added =
                        existingHosts.has(`${item.host}:${item.port}`) || addedHosts.has(item.host)
                      return (
                        <Table.Tr key={`${item.host}:${item.port}`}>
                          <Table.Td>
                            <Text size="sm" className="mono">
                              {item.host}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{item.model ?? 'Zebra'}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="xs" className="mono">
                              {item.serial ?? '—'}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="xs">{item.firmware ?? '—'}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Badge size="xs" variant="light" color="gray">
                              {item.status ?? 'Bilinmiyor'}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            {added ? (
                              <Badge
                                color="teal"
                                variant="light"
                                size="sm"
                                leftSection={<IconCircleCheck size={12} />}
                              >
                                Eklendi
                              </Badge>
                            ) : (
                              <Button
                                size="compact-sm"
                                leftSection={<IconPlus size={13} />}
                                onClick={() => void addPrinter(item)}
                                loading={addingHost === item.host}
                              >
                                Ekle
                              </Button>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      )
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea.Autosize>
            )}
          </Stack>
        ) : (
          <Paper withBorder radius="md" p="lg">
            <Stack align="center" gap="xs">
              <IconRadar size={36} color="var(--mantine-color-teal-5)" />
              <Title order={4}>Taramaya hazır</Title>
              <Text size="sm" c="dimmed" ta="center">
                Alt ağı seçip “Taramayı Başlat” düğmesine basın. Bulunan yazıcıları tek tek veya
                topluca ekleyebilirsiniz.
              </Text>
            </Stack>
          </Paper>
        )}
      </Stack>
    </Modal>
  )
}
