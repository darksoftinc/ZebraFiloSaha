import { useState } from 'react'
import {
  AppShell,
  Badge,
  Box,
  Burger,
  Button,
  Container,
  Group,
  NavLink,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconAlertTriangle,
  IconBell,
  IconChartBar,
  IconHistory,
  IconLayoutDashboard,
  IconPlus,
  IconRadar,
  IconRefresh,
  IconSettings,
  IconShieldCheck,
  IconTool
} from '@tabler/icons-react'
import type { PrinterRecord } from '@shared/types'
import logo from './assets/logo.png'
import { useAppData } from './store'
import { Dashboard } from './pages/Dashboard'
import { History } from './pages/History'
import { Maintenance } from './pages/Maintenance'
import { Notifications } from './pages/Notifications'
import { Reports } from './pages/Reports'
import { Settings } from './pages/Settings'
import { DiscoveryModal } from './components/DiscoveryModal'
import { PrinterFormModal } from './components/PrinterFormModal'
import { PrinterDetailModal } from './components/PrinterDetailModal'

type Page = 'dashboard' | 'maintenance' | 'reports' | 'history' | 'notifications' | 'settings'

const NAV_ITEMS: Array<{ id: Page; label: string; icon: React.ReactNode }> = [
  { id: 'dashboard', label: 'Genel Bakış', icon: <IconLayoutDashboard size={18} /> },
  { id: 'maintenance', label: 'Bakım', icon: <IconTool size={18} /> },
  { id: 'reports', label: 'Raporlar', icon: <IconChartBar size={18} /> },
  { id: 'history', label: 'Geçmiş ve Olaylar', icon: <IconHistory size={18} /> },
  { id: 'notifications', label: 'Bildirimler', icon: <IconBell size={18} /> },
  { id: 'settings', label: 'Ayarlar', icon: <IconSettings size={18} /> }
]

export default function App(): React.ReactElement {
  const { summary, refreshingAll, refreshAll } = useAppData()
  const [page, setPage] = useState<Page>('dashboard')
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false)
  const [formOpened, setFormOpened] = useState(false)
  const [editingPrinter, setEditingPrinter] = useState<PrinterRecord | null>(null)
  const [detailOpened, setDetailOpened] = useState(false)
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null)
  const [discoveryOpened, setDiscoveryOpened] = useState(false)

  const openAdd = (): void => {
    setEditingPrinter(null)
    setFormOpened(true)
  }

  const openEdit = (printer: PrinterRecord): void => {
    setEditingPrinter(printer)
    setFormOpened(true)
  }

  const openDetail = (id: number): void => {
    setSelectedPrinterId(id)
    setDetailOpened(true)
  }

  return (
    <>
      <AppShell
        header={{ height: 72 }}
        navbar={{ width: 236, breakpoint: 'sm', collapsed: { mobile: !mobileOpened } }}
        padding={0}
      >
        <AppShell.Header className="app-header">
          <Group h="100%" px="lg" justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" color="gray" />
              <img
                src={logo}
                alt="Zebra Saha"
                width={42}
                height={42}
                style={{
                  borderRadius: 12,
                  boxShadow: '0 0 26px rgba(20, 184, 166, 0.18)'
                }}
              />
              <Box>
                <Text fw={700} size="lg" lh={1.2}>Zebra Saha</Text>
                <Text size="xs" className="app-header-subtitle">Filo Konsolu</Text>
              </Box>
            </Group>

            <Group gap="sm" wrap="nowrap">
              <Badge color="teal" variant="light" size="lg">
                {summary.online}/{summary.total} çevrimiçi
              </Badge>
              {summary.errors > 0 ? (
                <Badge color="red" variant="light" size="lg" leftSection={<IconAlertTriangle size={12} />}>
                  {summary.errors} hata
                </Badge>
              ) : null}
              <Tooltip label="Ağda Zebra yazıcı ara">
                <Button
                  variant="default"
                  leftSection={<IconRadar size={16} />}
                  onClick={() => setDiscoveryOpened(true)}
                  visibleFrom="lg"
                >
                  Ağda Ara
                </Button>
              </Tooltip>
              <Tooltip label="Tüm yazıcıları yenile">
                <Button
                  variant="default"
                  leftSection={<IconRefresh size={16} />}
                  onClick={() => void refreshAll()}
                  loading={refreshingAll}
                  visibleFrom="md"
                >
                  Yenile
                </Button>
              </Tooltip>
              <Button leftSection={<IconPlus size={16} />} onClick={openAdd}>
                Yazıcı Ekle
              </Button>
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar p="md">
          <Stack gap={4} style={{ flex: 1 }}>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase" px={6} mb={4}>Menü</Text>
            {NAV_ITEMS.map((item) => (
              <UnstyledButton
                key={item.id}
                className="nav-item"
                data-active={page === item.id}
                onClick={() => {
                  setPage(item.id)
                  closeMobile()
                }}
                p="xs"
              >
                <Group gap="sm">
                  <ThemeIcon
                    variant={page === item.id ? 'light' : 'transparent'}
                    color={page === item.id ? 'teal' : 'gray'}
                    size={30}
                    radius="md"
                  >
                    {item.icon}
                  </ThemeIcon>
                  <Text size="sm" fw={page === item.id ? 600 : 500}>{item.label}</Text>
                </Group>
              </UnstyledButton>
            ))}

            <Box mt="auto">
              <NavLink
                label="Yetkili işlemler"
                description="Yazdırma ve ayar işlemleri onay ister"
                leftSection={<IconShieldCheck size={17} />}
                color="teal"
                variant="subtle"
                style={{ pointerEvents: 'none' }}
              />
              <Text size="xs" c="dimmed" ta="center" mt="sm">
                v0.2.1 · Yerel veritabanı
              </Text>
            </Box>
          </Stack>
        </AppShell.Navbar>

        <AppShell.Main>
          <Container fluid p="xl" maw={1720}>
            {page === 'dashboard' ? (
              <Dashboard onOpenPrinter={openDetail} onAddPrinter={openAdd} onDiscover={() => setDiscoveryOpened(true)} />
            ) : page === 'maintenance' ? (
              <Maintenance />
            ) : page === 'reports' ? (
              <Reports />
            ) : page === 'history' ? (
              <History />
            ) : page === 'notifications' ? (
              <Notifications />
            ) : (
              <Settings />
            )}
          </Container>
        </AppShell.Main>
      </AppShell>

      <PrinterFormModal
        opened={formOpened}
        onClose={() => {
          setFormOpened(false)
          setEditingPrinter(null)
        }}
        printer={editingPrinter}
      />

      <PrinterDetailModal
        opened={detailOpened}
        printerId={selectedPrinterId}
        onClose={() => setDetailOpened(false)}
        onEdit={(printer) => openEdit(printer)}
      />

      <DiscoveryModal opened={discoveryOpened} onClose={() => setDiscoveryOpened(false)} />
    </>
  )
}
