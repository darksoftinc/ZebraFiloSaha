import { useEffect, useState } from 'react'
import {
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  NumberInput,
  Paper,
  PasswordInput,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconAlertTriangle,
  IconBell,
  IconBrandTelegram,
  IconDeviceFloppy,
  IconInfoCircle,
  IconMail,
  IconSend,
  IconShieldCheck,
  IconWebhook
} from '@tabler/icons-react'
import { useAppData, readableError } from '../store'

export function Notifications(): React.ReactElement {
  const { settings, saveSettings } = useAppData()
  const [cooldown, setCooldown] = useState<number | string>(settings.alertCooldownMinutes)
  const [notifyOnError, setNotifyOnError] = useState(settings.notifyOnError)
  const [notifyOnWarning, setNotifyOnWarning] = useState(settings.notifyOnWarning)
  const [notifyOnOffline, setNotifyOnOffline] = useState(settings.notifyOnOffline)
  const [notifyOnRecovery, setNotifyOnRecovery] = useState(settings.notifyOnRecovery)

  const [telegramEnabled, setTelegramEnabled] = useState(settings.telegramEnabled)
  const [telegramToken, setTelegramToken] = useState('')
  const [telegramChatId, setTelegramChatId] = useState(settings.telegramChatId)
  const [testingTelegram, setTestingTelegram] = useState(false)

  const [emailEnabled, setEmailEnabled] = useState(settings.emailEnabled)
  const [smtpHost, setSmtpHost] = useState(settings.smtpHost)
  const [smtpPort, setSmtpPort] = useState<number | string>(settings.smtpPort)
  const [smtpSecure, setSmtpSecure] = useState(settings.smtpSecure)
  const [smtpUser, setSmtpUser] = useState(settings.smtpUser)
  const [smtpPassword, setSmtpPassword] = useState('')
  const [emailFrom, setEmailFrom] = useState(settings.emailFrom)
  const [emailTo, setEmailTo] = useState(settings.emailTo)
  const [testingEmail, setTestingEmail] = useState(false)

  const [webhookEnabled, setWebhookEnabled] = useState(settings.webhookEnabled)
  const [webhookUrl, setWebhookUrl] = useState(settings.webhookUrl)
  const [testingWebhook, setTestingWebhook] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setCooldown(settings.alertCooldownMinutes)
    setNotifyOnError(settings.notifyOnError)
    setNotifyOnWarning(settings.notifyOnWarning)
    setNotifyOnOffline(settings.notifyOnOffline)
    setNotifyOnRecovery(settings.notifyOnRecovery)
    setTelegramEnabled(settings.telegramEnabled)
    setTelegramChatId(settings.telegramChatId)
    setEmailEnabled(settings.emailEnabled)
    setSmtpHost(settings.smtpHost)
    setSmtpPort(settings.smtpPort)
    setSmtpSecure(settings.smtpSecure)
    setSmtpUser(settings.smtpUser)
    setEmailFrom(settings.emailFrom)
    setEmailTo(settings.emailTo)
    setWebhookEnabled(settings.webhookEnabled)
    setWebhookUrl(settings.webhookUrl)
    setTelegramToken('')
    setSmtpPassword('')
  }, [settings])

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await saveSettings({
        alertCooldownMinutes: typeof cooldown === 'number' ? cooldown : Number(cooldown),
        notifyOnError,
        notifyOnWarning,
        notifyOnOffline,
        notifyOnRecovery,
        telegramEnabled,
        telegramChatId: telegramChatId.trim(),
        telegramBotToken: telegramToken.trim() || undefined,
        emailEnabled,
        smtpHost: smtpHost.trim(),
        smtpPort: typeof smtpPort === 'number' ? smtpPort : Number(smtpPort),
        smtpSecure,
        smtpUser: smtpUser.trim(),
        smtpPassword: smtpPassword || undefined,
        emailFrom: emailFrom.trim(),
        emailTo: emailTo.trim(),
        webhookEnabled,
        webhookUrl: webhookUrl.trim()
      })
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Bildirim ayarları kaydedilemedi',
        message: readableError(error)
      })
    } finally {
      setSaving(false)
    }
  }

  const testTelegram = async (): Promise<void> => {
    setTestingTelegram(true)
    try {
      const result = await window.api.testTelegram({
        token: telegramToken.trim() || undefined,
        chatId: telegramChatId.trim() || undefined
      })
      notifications.show({
        color: result.ok ? 'teal' : 'red',
        title: result.ok ? 'Telegram testi başarılı' : 'Telegram testi başarısız',
        message: result.message,
        autoClose: result.ok ? 4000 : 8000
      })
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Telegram testi başarısız',
        message: readableError(error)
      })
    } finally {
      setTestingTelegram(false)
    }
  }

  const testEmail = async (): Promise<void> => {
    setTestingEmail(true)
    try {
      const result = await window.api.testEmail({
        smtpHost: smtpHost.trim(),
        smtpPort: typeof smtpPort === 'number' ? smtpPort : Number(smtpPort),
        smtpSecure,
        smtpUser: smtpUser.trim(),
        smtpPassword: smtpPassword || undefined,
        emailFrom: emailFrom.trim(),
        emailTo: emailTo.trim()
      })
      notifications.show({
        color: result.ok ? 'teal' : 'red',
        title: result.ok ? 'E-posta testi başarılı' : 'E-posta testi başarısız',
        message: result.message,
        autoClose: result.ok ? 4000 : 8000
      })
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'E-posta testi başarısız',
        message: readableError(error)
      })
    } finally {
      setTestingEmail(false)
    }
  }

  const testWebhook = async (): Promise<void> => {
    setTestingWebhook(true)
    try {
      const result = await window.api.testWebhook(webhookUrl.trim() || undefined)
      notifications.show({
        color: result.ok ? 'teal' : 'red',
        title: result.ok ? 'Webhook testi başarılı' : 'Webhook testi başarısız',
        message: result.message,
        autoClose: result.ok ? 4000 : 8000
      })
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Webhook testi başarısız',
        message: readableError(error)
      })
    } finally {
      setTestingWebhook(false)
    }
  }

  const clearTelegramToken = async (): Promise<void> => {
    if (!window.confirm('Kayıtlı Telegram bot token silinsin mi?')) return
    try {
      await saveSettings({ telegramBotToken: null })
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Token silinemedi',
        message: readableError(error)
      })
    }
  }

  const clearSmtpPassword = async (): Promise<void> => {
    if (!window.confirm('Kayıtlı SMTP şifresi silinsin mi?')) return
    try {
      await saveSettings({ smtpPassword: null })
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Şifre silinemedi',
        message: readableError(error)
      })
    }
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Box>
          <Title order={2}>Bildirimler</Title>
          <Text size="sm" c="dimmed" mt={2}>
            Telegram, e-posta ve webhook uyarı altyapısı. Anahtarları siz girersiniz; uygulama
            hiçbir hazır anahtar içermez.
          </Text>
        </Box>
        <Badge color="teal" variant="light" leftSection={<IconShieldCheck size={12} />}>
          Anahtarlar DPAPI ile şifreli
        </Badge>
      </Group>

      <Paper withBorder radius="lg" p="lg">
        <Group gap="sm" mb="md">
          <IconBell size={20} color="var(--mantine-color-teal-5)" />
          <Text fw={650}>Uyarı kuralları</Text>
        </Group>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Stack gap="sm">
            <Switch
              label="Hatalarda bildir"
              checked={notifyOnError}
              onChange={(event) => setNotifyOnError(event.currentTarget.checked)}
            />
            <Switch
              label="Uyarılarda bildir"
              checked={notifyOnWarning}
              onChange={(event) => setNotifyOnWarning(event.currentTarget.checked)}
            />
            <Switch
              label="Çevrimdışı olduğunda bildir"
              checked={notifyOnOffline}
              onChange={(event) => setNotifyOnOffline(event.currentTarget.checked)}
            />
            <Switch
              label="Sorun giderildiğinde bildir"
              checked={notifyOnRecovery}
              onChange={(event) => setNotifyOnRecovery(event.currentTarget.checked)}
            />
          </Stack>
          <NumberInput
            label="Tekrar bildirim aralığı (dakika)"
            description="Aynı yazıcı ve aynı sorun için art arda mesaj gönderilmesini engeller."
            value={cooldown}
            onChange={setCooldown}
            min={1}
            max={1440}
          />
        </SimpleGrid>
        <Alert color="blue" variant="light" icon={<IconInfoCircle size={18} />} mt="md">
          <Text size="sm">
            Bildirimler yalnızca sorun ilk ortaya çıktığında ve çözüldüğünde gönderilir. Her
            sorguda tekrar mesaj gitmez.
          </Text>
        </Alert>
      </Paper>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Paper withBorder radius="lg" p="lg">
          <Group justify="space-between" mb="md">
            <Group gap="sm">
              <IconBrandTelegram size={20} color="var(--mantine-color-blue-5)" />
              <Text fw={650}>Telegram</Text>
            </Group>
            <Badge color={settings.telegramTokenConfigured ? 'teal' : 'gray'} variant="light">
              {settings.telegramTokenConfigured ? 'Token kayıtlı' : 'Yapılandırılmadı'}
            </Badge>
          </Group>
          <Stack gap="md">
            <Switch
              label="Telegram bildirimlerini etkinleştir"
              checked={telegramEnabled}
              onChange={(event) => setTelegramEnabled(event.currentTarget.checked)}
            />
            <PasswordInput
              label="Bot token"
              description={
                settings.telegramTokenConfigured
                  ? 'Kayıtlı token var. Değiştirmek için yeni token girin.'
                  : 'BotFather üzerinden aldığınız bot token.'
              }
              placeholder={settings.telegramTokenConfigured ? '••••••••' : '123456789:AA...'}
              value={telegramToken}
              onChange={(event) => setTelegramToken(event.currentTarget.value)}
            />
            <TextInput
              label="Chat ID"
              description="Mesajın gönderileceği kullanıcı, grup veya kanal ID'si."
              placeholder="-1001234567890"
              value={telegramChatId}
              onChange={(event) => setTelegramChatId(event.currentTarget.value)}
              className="mono"
            />
            <Group justify="space-between">
              <Group gap="xs">
                <Button
                  variant="light"
                  leftSection={<IconSend size={16} />}
                  onClick={() => void testTelegram()}
                  loading={testingTelegram}
                >
                  Test Gönder
                </Button>
                {settings.telegramTokenConfigured ? (
                  <Button variant="subtle" color="red" size="xs" onClick={() => void clearTelegramToken()}>
                    Tokenı Temizle
                  </Button>
                ) : null}
              </Group>
              <Text size="xs" c="dimmed">
                Test, kayıtlı token yoksa formdaki tokenı kullanır.
              </Text>
            </Group>
          </Stack>
        </Paper>

        <Paper withBorder radius="lg" p="lg">
          <Group justify="space-between" mb="md">
            <Group gap="sm">
              <IconMail size={20} color="var(--mantine-color-violet-5)" />
              <Text fw={650}>E-posta (SMTP)</Text>
            </Group>
            <Badge color={settings.smtpPasswordConfigured ? 'teal' : 'gray'} variant="light">
              {settings.smtpPasswordConfigured ? 'Şifre kayıtlı' : 'Yapılandırılmadı'}
            </Badge>
          </Group>
          <Stack gap="md">
            <Switch
              label="E-posta bildirimlerini etkinleştir"
              checked={emailEnabled}
              onChange={(event) => setEmailEnabled(event.currentTarget.checked)}
            />
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <TextInput
                label="SMTP sunucusu"
                placeholder="smtp.gmail.com"
                value={smtpHost}
                onChange={(event) => setSmtpHost(event.currentTarget.value)}
              />
              <NumberInput
                label="Port"
                value={smtpPort}
                onChange={setSmtpPort}
                min={1}
                max={65535}
              />
            </SimpleGrid>
            <Switch
              label="SSL/TLS (genellikle 465 portu)"
              description="587 portu için kapalı bırakın; STARTTLS otomatik denenir."
              checked={smtpSecure}
              onChange={(event) => setSmtpSecure(event.currentTarget.checked)}
            />
            <TextInput
              label="Kullanıcı adı"
              placeholder="ornek@firma.com"
              value={smtpUser}
              onChange={(event) => setSmtpUser(event.currentTarget.value)}
            />
            <PasswordInput
              label="Şifre / uygulama şifresi"
              placeholder={settings.smtpPasswordConfigured ? '••••••••' : ''}
              value={smtpPassword}
              onChange={(event) => setSmtpPassword(event.currentTarget.value)}
            />
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <TextInput
                label="Gönderen"
                placeholder="zebra@firma.com"
                value={emailFrom}
                onChange={(event) => setEmailFrom(event.currentTarget.value)}
              />
              <TextInput
                label="Alıcı(lar)"
                placeholder="bakim@firma.com, üretim@firma.com"
                value={emailTo}
                onChange={(event) => setEmailTo(event.currentTarget.value)}
              />
            </SimpleGrid>
            <Group justify="space-between">
              <Group gap="xs">
                <Button
                  variant="light"
                  leftSection={<IconSend size={16} />}
                  onClick={() => void testEmail()}
                  loading={testingEmail}
                >
                  Test Gönder
                </Button>
                {settings.smtpPasswordConfigured ? (
                  <Button variant="subtle" color="red" size="xs" onClick={() => void clearSmtpPassword()}>
                    Şifreyi Temizle
                  </Button>
                ) : null}
              </Group>
              <Text size="xs" c="dimmed">
                Gmail için uygulama şifresi kullanın.
              </Text>
            </Group>
          </Stack>
        </Paper>
      </SimpleGrid>

      <Paper withBorder radius="lg" p="lg">
        <Group justify="space-between" mb="md">
          <Group gap="sm">
            <IconWebhook size={20} color="var(--mantine-color-orange-5)" />
            <Text fw={650}>Webhook</Text>
          </Group>
          <Badge color={webhookUrl ? 'teal' : 'gray'} variant="light">
            {webhookUrl ? 'Adres tanımlı' : 'Yapılandırılmadı'}
          </Badge>
        </Group>
        <Stack gap="md">
          <Switch
            label="Webhook bildirimlerini etkinleştir"
            checked={webhookEnabled}
            onChange={(event) => setWebhookEnabled(event.currentTarget.checked)}
          />
          <TextInput
            label="Webhook URL"
            description="Olaylar JSON olarak POST edilir. ERP, Slack, Teams veya kendi servisiniz olabilir."
            placeholder="https://erp.firma.local/hooks/zebra"
            value={webhookUrl}
            onChange={(event) => setWebhookUrl(event.currentTarget.value)}
            className="mono"
          />
          <Group>
            <Button
              variant="light"
              leftSection={<IconSend size={16} />}
              onClick={() => void testWebhook()}
              loading={testingWebhook}
            >
              Test Gönder
            </Button>
            <Text size="xs" c="dimmed">
              Test gövdesi: {'{"event":"test","app":"Zebra Saha"}'}
            </Text>
          </Group>
        </Stack>
      </Paper>

      <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} />}>
        <Text size="sm">
          Anahtarlar yalnızca bu bilgisayarda, Windows DPAPI ile şifrelenmiş olarak saklanır.
          Formda boş bırakılan token/şifre alanları mevcut kaydı korur. Uygulama hiçbir mesajı
          kendi sunucusuna göndermez; tüm trafik sizin seçtiğiniz Telegram/SMTP/webhook
          adreslerine gider.
        </Text>
      </Alert>

      <Group justify="flex-end">
        <Button
          leftSection={<IconDeviceFloppy size={16} />}
          onClick={() => void save()}
          loading={saving}
        >
          Bildirim Ayarlarını Kaydet
        </Button>
      </Group>

      <Divider />
      <Text size="xs" c="dimmed">
        Telegram mesajları için bot token ve chat ID; e-posta için SMTP hesabı; webhook için
        HTTPS adresi gerekir. Kurumsal e-posta sunucularında port ve TLS ayarlarını BT
        ekibinizden doğrulayın.
      </Text>
    </Stack>
  )
}
