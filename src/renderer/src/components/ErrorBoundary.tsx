import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Alert, Button, Code, Container, Stack, Text, Title } from '@mantine/core'
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Arayüz hatası', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <Container size="sm" py="xl">
        <Stack gap="md">
          <Title order={2}>Beklenmeyen bir arayüz hatası oluştu</Title>
          <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Uygulama hatası">
            <Text size="sm">
              Verileriniz yerel veritabanında korunuyor. Aşağıdaki hata ayrıntısını not alıp
              uygulamayı yeniden başlatabilirsiniz.
            </Text>
          </Alert>
          <Code block className="mono">
            {this.state.error.message}
          </Code>
          <Button
            leftSection={<IconRefresh size={16} />}
            onClick={() => window.location.reload()}
            w="fit-content"
          >
            Arayüzü yenile
          </Button>
        </Stack>
      </Container>
    )
  }
}
