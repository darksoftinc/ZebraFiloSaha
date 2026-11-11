import React from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './styles.css'
import App from './App'
import { theme } from './theme'
import { AppDataProvider } from './store'
import { ErrorBoundary } from './components/ErrorBoundary'

const root = document.getElementById('root')
if (!root) throw new Error('Kök eleman bulunamadı.')

createRoot(root).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications position="top-right" limit={4} />
      <ErrorBoundary>
        <AppDataProvider>
          <App />
        </AppDataProvider>
      </ErrorBoundary>
    </MantineProvider>
  </React.StrictMode>
)
