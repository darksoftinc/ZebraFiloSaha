import { app, BrowserWindow, Menu, nativeTheme, shell } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { restartApiServer, stopApiServer } from './api-server'
import { cleanupSamples, getSettings, initDatabase, pruneOldAlerts } from './db'
import { registerIpc } from './ipc'
import { initLog, log } from './log'
import { poller } from './poller'

app.setName('Zebra Saha')
app.setAppUserModelId('com.zebra.saha')

let mainWindow: BrowserWindow | null = null

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    backgroundColor: '#0b0f14',
    title: 'Zebra Saha',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL() ?? ''
    if (url !== current) {
      event.preventDefault()
      if (url.startsWith('http://') || url.startsWith('https://')) {
        void shell.openExternal(url)
      }
    }
  })

  const screenshotPath = process.env.ZEBRA_SCREENSHOT
  if (screenshotPath) {
    let captured = false
    const captureAndQuit = (): void => {
      if (captured) return
      captured = true
      setTimeout(async () => {
        try {
          const image = await mainWindow?.webContents.capturePage()
          if (image) writeFileSync(screenshotPath, image.toPNG())
        } catch (error) {
          writeFileSync(`${screenshotPath}.error.txt`, String(error))
        } finally {
          app.quit()
        }
      }, 1200)
    }
    mainWindow.webContents.once('did-finish-load', () => setTimeout(captureAndQuit, 6000))
    mainWindow.webContents.once('did-fail-load', (_event, code, description, url) => {
      writeFileSync(`${screenshotPath}.fail.txt`, `${code} ${description} ${url}`)
      captureAndQuit()
    })
    setTimeout(captureAndQuit, 20000)
  }

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (gotLock) {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    initLog()
    initDatabase()
    log('veritabanı hazır')
    const settings = getSettings()
    nativeTheme.themeSource = settings.theme
    cleanupSamples(settings.retentionDays)
    pruneOldAlerts(settings.retentionDays)
    registerIpc()
    log('IPC hazır')
    void restartApiServer()

    poller.setUpdateHandler((status) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('printer:update', status)
      }
    })

    createWindow()
    log('pencere oluşturuldu')
    poller.start()
    log('poller başlatıldı')

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    poller.stop()
    void stopApiServer()
  })
}
