import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconAlertTriangle,
  IconBarcode,
  IconCalendar,
  IconCheck,
  IconCircleCheck,
  IconInfoCircle,
  IconPlus,
  IconRefresh,
  IconTool,
  IconTrash
} from '@tabler/icons-react'
import type { MaintenanceTask } from '@shared/types'
import { useAppData, readableError } from '../store'
import { formatDateTime, formatNumber } from '../lib/format'

const TYPE_LABELS: Record<string, string> = {
  cleaning: 'Kafa temizliği',
  platen: 'Platen / silindir',
  printhead: 'Printhead değişimi',
  media: 'Media / rulo',
  firmware: 'Firmware',
  other: 'Diğer'
}

function statusBadge(status: MaintenanceTask['status']): React.ReactElement {
  switch (status) {
    case 'overdue':
      return <Badge color="red" variant="light">Gecikmiş</Badge>
    case 'due-soon':
      return <Badge color="yellow" variant="light">Yaklaşıyor</Badge>
    case 'done':
      return <Badge color="teal" variant="light">Tamamlandı</Badge>
    default:
      return <Badge color="blue" variant="light">Açık</Badge>
  }
}

export function Maintenance(): React.ReactElement {
  const { printers } = useAppData()
  const [tasks, setTasks] = useState<MaintenanceTask[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpened, setModalOpened] = useState(false)
  const [saving, setSaving] = useState(false)
  const [printerId, setPrinterId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [type, setType] = useState('cleaning')
  const [dueDate, setDueDate] = useState('')
  const [dueLabels, setDueLabels] = useState<number | string>('')
  const [notes, setNotes] = useState('')

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setTasks(await window.api.maintenanceTasks())
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Bakım görevleri yüklenemedi',
        message: readableError(error)
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const summary = useMemo(() => {
    return {
      overdue: tasks.filter((task) => task.status === 'overdue').length,
      dueSoon: tasks.filter((task) => task.status === 'due-soon').length,
      open: tasks.filter((task) => task.status === 'open').length,
      done: tasks.filter((task) => task.status === 'done').length
    }
  }, [tasks])

  const openCreate = (): void => {
    setPrinterId(printers[0] ? String(printers[0].id) : null)
    setTitle('')
    setType('cleaning')
    setDueDate('')
    setDueLabels('')
    setNotes('')
    setModalOpened(true)
  }

  const create = async (): Promise<void> => {
    if (!printerId) {
      notifications.show({ color: 'red', title: 'Yazıcı seçin', message: 'Bakım görevi için yazıcı gerekli.' })
      return
    }
    if (!title.trim()) {
      notifications.show({ color: 'red', title: 'Başlık gerekli', message: 'Görev başlığını girin.' })
      return
    }
    setSaving(true)
    try {
      await window.api.createMaintenanceTask({
        printerId: Number(printerId),
        title: title.trim(),
        type,
        dueDate: dueDate || null,
        dueLabels: dueLabels === '' ? null : Number(dueLabels),
        notes: notes.trim()
      })
      setModalOpened(false)
      notifications.show({ color: 'teal', title: 'Bakım görevi eklendi', message: title.trim() })
      await load()
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Görev eklenemedi',
        message: readableError(error)
      })
    } finally {
      setSaving(false)
    }
  }

  const complete = async (task: MaintenanceTask): Promise<void> => {
    try {
      await window.api.completeMaintenanceTask(task.id)
      notifications.show({ color: 'teal', title: 'Görev tamamlandı', message: task.title })
      await load()
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Görev tamamlanamadı',
        message: readableError(error)
      })
    }
  }

  const remove = async (task: MaintenanceTask): Promise<void> => {
    if (!window.confirm(`"${task.title}" bakım görevi silinsin mi?`)) return
    try {
      await window.api.deleteMaintenanceTask(task.id)
      await load()
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Görev silinemedi',
        message: readableError(error)
      })
    }
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Box>
          <Title order={2}>Bakım</Title>
          <Text size="sm" c="dimmed" mt={2}>
            Kafa temizliği, platen, media ve printhead bakım görevleri; tarih veya etiket
            sayısına göre hatırlatma.
          </Text>
        </Box>
        <Group gap="sm">
          <Button
            variant="default"
            leftSection={<IconRefresh size={16} />}
            onClick={() => void load()}
            loading={loading}
          >
            Yenile
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
            Görev Ekle
          </Button>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <Paper withBorder radius="lg" p="md">
          <Group justify="space-between">
            <Box>
              <Text size="xs" c="dimmed">Gecikmiş</Text>
              <Text size="xl" fw={700} c={summary.overdue > 0 ? 'red.4' : undefined}>
                {summary.overdue}
              </Text>
            </Box>
            <IconAlertTriangle size={22} color="var(--mantine-color-red-5)" />
          </Group>
        </Paper>
        <Paper withBorder radius="lg" p="md">
          <Group justify="space-between">
            <Box>
              <Text size="xs" c="dimmed">Yaklaşan</Text>
              <Text size="xl" fw={700} c={summary.dueSoon > 0 ? 'yellow.4' : undefined}>
                {summary.dueSoon}
              </Text>
            </Box>
            <IconCalendar size={22} color="var(--mantine-color-yellow-5)" />
          </Group>
        </Paper>
        <Paper withBorder radius="lg" p="md">
          <Group justify="space-between">
            <Box>
              <Text size="xs" c="dimmed">Açık</Text>
              <Text size="xl" fw={700}>{summary.open}</Text>
            </Box>
            <IconTool size={22} color="var(--mantine-color-blue-5)" />
          </Group>
        </Paper>
        <Paper withBorder radius="lg" p="md">
          <Group justify="space-between">
            <Box>
              <Text size="xs" c="dimmed">Tamamlanan</Text>
              <Text size="xl" fw={700}>{summary.done}</Text>
            </Box>
            <IconCircleCheck size={22} color="var(--mantine-color-teal-5)" />
          </Group>
        </Paper>
      </SimpleGrid>

      {loading ? (
        <Center py="xl"><Loader /></Center>
      ) : tasks.length === 0 ? (
        <Alert color="gray" icon={<IconInfoCircle size={18} />} title="Henüz bakım görevi yok">
          <Text size="sm">
            “Görev Ekle” ile kafa temizliği, platen değişimi veya etiket eşiğine bağlı
            hatırlatmalar oluşturabilirsiniz.
          </Text>
        </Alert>
      ) : (
        <Table.ScrollContainer minWidth={980}>
          <Table withTableBorder withColumnBorders striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Yazıcı</Table.Th>
                <Table.Th>Görev</Table.Th>
                <Table.Th>Tür</Table.Th>
                <Table.Th>Bitiş tarihi</Table.Th>
                <Table.Th>Etiket eşiği</Table.Th>
                <Table.Th>Mevcut etiket</Table.Th>
                <Table.Th>Durum</Table.Th>
                <Table.Th>İşlem</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tasks.map((task) => (
                <Table.Tr key={task.id}>
                  <Table.Td><Text size="xs">{task.printerName}</Text></Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={550}>{task.title}</Text>
                    {task.notes ? <Text size="xs" c="dimmed">{task.notes}</Text> : null}
                  </Table.Td>
                  <Table.Td><Text size="xs">{TYPE_LABELS[task.type] ?? task.type}</Text></Table.Td>
                  <Table.Td>
                    <Text size="xs">{task.dueDate ?? '—'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      <IconBarcode size={14} color="var(--mantine-color-dimmed)" />
                      <Text size="xs">{task.dueLabels !== null ? formatNumber(task.dueLabels) : '—'}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td><Text size="xs">{formatNumber(task.currentLabels ?? undefined)}</Text></Table.Td>
                  <Table.Td>{statusBadge(task.status)}</Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      {task.completedAt ? (
                        <Text size="xs" c="dimmed">{formatDateTime(task.completedAt)}</Text>
                      ) : (
                        <Button
                          size="compact-xs"
                          variant="light"
                          leftSection={<IconCheck size={12} />}
                          onClick={() => void complete(task)}
                        >
                          Tamamla
                        </Button>
                      )}
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="red"
                        onClick={() => void remove(task)}
                      >
                        <IconTrash size={13} />
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <Modal opened={modalOpened} onClose={() => setModalOpened(false)} title="Bakım Görevi Ekle" size="lg">
        <Stack gap="md">
          <Select
            label="Yazıcı"
            value={printerId}
            onChange={setPrinterId}
            data={printers.map((printer) => ({ value: String(printer.id), label: printer.name }))}
            searchable
            required
          />
          <TextInput
            label="Görev başlığı"
            placeholder="Örn. Printhead temizliği"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            required
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Select
              label="Tür"
              value={type}
              onChange={(value) => setType(value ?? 'cleaning')}
              data={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
              allowDeselect={false}
            />
            <TextInput
              label="Bitiş tarihi"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.currentTarget.value)}
            />
            <NumberInput
              label="Etiket eşiği"
              description="Mevcut sayaç bu değere ulaşınca görev gecikmiş sayılır."
              value={dueLabels}
              onChange={setDueLabels}
              min={0}
              thousandSeparator="."
              decimalSeparator=","
            />
          </SimpleGrid>
          <Textarea
            label="Notlar"
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
            minRows={2}
            autosize
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setModalOpened(false)}>Vazgeç</Button>
            <Button onClick={() => void create()} loading={saving}>Kaydet</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
