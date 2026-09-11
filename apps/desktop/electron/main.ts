import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDatabase } from './db/index'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'knowledge.sqlite')
  try {
    const db = openDatabase(dbPath)
    db.prepare(
      `INSERT OR REPLACE INTO vector_meta(key, value) VALUES ('schema_ok', ?)`,
    ).run('1')
    console.log('[main] db ready at', dbPath)
  } catch (err) {
    console.error('[main] db migrate failed', err)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
