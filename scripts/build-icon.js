const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

app.disableHardwareAcceleration()

function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  const directory = Buffer.alloc(16 * entries.length)
  let offset = 6 + directory.length

  entries.forEach((entry, index) => {
    const pointer = index * 16
    const dimension = entry.size >= 256 ? 0 : entry.size
    directory.writeUInt8(dimension, pointer)
    directory.writeUInt8(dimension, pointer + 1)
    directory.writeUInt8(0, pointer + 2)
    directory.writeUInt8(0, pointer + 3)
    directory.writeUInt16LE(1, pointer + 4)
    directory.writeUInt16LE(32, pointer + 6)
    directory.writeUInt32LE(entry.data.length, pointer + 8)
    directory.writeUInt32LE(offset, pointer + 12)
    offset += entry.data.length
  })

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.data)])
}

app.whenReady().then(async () => {
  const svgPath = path.join(process.cwd(), 'build', 'icon.svg')
  const window = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  await window.loadFile(svgPath)
  await new Promise((resolve) => setTimeout(resolve, 700))
  const image = await window.webContents.capturePage()

  const sizes = [16, 32, 48, 64, 128, 256, 512]
  const entries = []
  for (const size of sizes) {
    const resized = image.resize({ width: size, height: size, quality: 'best' })
    const png = resized.toPNG()
    fs.writeFileSync(path.join(process.cwd(), 'build', `icon-${size}.png`), png)
    if (size <= 256) {
      entries.push({ size, data: png })
    }
  }

  fs.writeFileSync(path.join(process.cwd(), 'build', 'icon.png'), image.toPNG())
  fs.writeFileSync(path.join(process.cwd(), 'build', 'icon.ico'), buildIco(entries))
  console.log('icon.png ve icon.ico oluşturuldu')
  app.quit()
})
