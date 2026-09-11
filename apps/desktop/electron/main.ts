import {
  app,
  BrowserWindow,
  globalShortcut,
  clipboard,
} from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDatabase, type Db } from './db/index'
import { createVectorBackend, type VectorBackend } from './ingest/vector-backend'
import { IngestQueue } from './ingest/queue'
import { TabManager } from './browser/TabManager'
import { registerIpc } from './ipc/register'
import { seedBookmarksOnce, seedPinnedTabsOnce } from './services/bookmarks'
import { getSetting } from './services/settings'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let db: Db
let vectors: VectorBackend | null = null
let queue: IngestQueue
let tabs: TabManager
let clipShortcutRegistered = false

function openClipDialogFromClipboard() {
  const text = clipboard.readText()
  if (!text?.trim()) {
    mainWindow?.webContents.send('clip:showDialog', { text: '', empty: true })
    return
  }
  mainWindow?.webContents.send('clip:showDialog', { text })
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
}

function isClipShortcut(input: Electron.Input): boolean {
  if (input.type !== 'keyDown') return false
  const key = (input.key || '').toLowerCase()
  if (key !== 's') return false
  // Ctrl+Shift+S or Cmd+Shift+S
  const mod = input.control || input.meta
  return !!(mod && input.shift && !input.alt)
}

function attachLocalClipShortcut(win: BrowserWindow) {
  win.webContents.on('before-input-event', (event, input) => {
    if (!isClipShortcut(input)) return
    event.preventDefault()
    openClipDialogFromClipboard()
  })
}

function createWindow() {
  const theme = getSetting(db, 'ui.theme') === 'light' ? 'light' : 'dark'
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: theme === 'light' ? '#F7F7F8' : '#0b0b0d',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow = win
  tabs.attachWindow(win)
  // Keep WebContentsViews hidden until Browser page mounts and calls tabsShow
  tabs.hideAll()
  // Ensure pinned tabs survive restart; activate first pinned/first if no active
  tabs.restoreSession()
  attachLocalClipShortcut(win)

  win.webContents.on('did-finish-load', () => {
    if (!clipShortcutRegistered) {
      win.webContents.send('clip:shortcutStatus', {
        registered: false,
        message: '全局快录快捷键注册失败，窗口内 Ctrl+Shift+S 与侧栏「快录」仍可用',
      })
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  win.on('closed', () => {
    tabs.destroyAll()
    if (mainWindow === win) mainWindow = null
  })
}

app.whenReady().then(async () => {
  const dbPath = path.join(app.getPath('userData'), 'knowledge.sqlite')
  db = openDatabase(dbPath)
  console.log('[main] db ready at', dbPath)

  seedBookmarksOnce(db)
  seedPinnedTabsOnce(db)

  const dimRow = db.prepare(`SELECT value FROM vector_meta WHERE key='dim'`).get() as
    | { value: string }
    | undefined
  const dim = dimRow ? Number(dimRow.value) : 1024

  try {
    vectors = await createVectorBackend({ dim, db, dbPath })
    db.prepare(
      `INSERT INTO vector_meta(key, value) VALUES('backend', ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    ).run(vectors.name)
    db.prepare(
      `INSERT INTO vector_meta(key, value) VALUES('dim', ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    ).run(String(vectors.dim))
    console.log('[main] vector backend=', vectors.name, 'dim=', vectors.dim)
  } catch (err) {
    console.error('[main] vector init failed', err)
  }

  queue = new IngestQueue(
    db,
    () => vectors,
    (v) => {
      vectors = v
    },
  )
  tabs = new TabManager(db)
  // Tab views: local shortcut when browser page focused
  tabs.setClipShortcutHandler(openClipDialogFromClipboard)

  registerIpc({
    db,
    getVectors: () => vectors,
    setVectors: (v) => {
      vectors = v
    },
    queue,
    tabs,
    getMainWindow: () => mainWindow,
  })

  // Global clip shortcut: show in-app dialog only (do not auto-save)
  clipShortcutRegistered = globalShortcut.register('CommandOrControl+Shift+S', () => {
    openClipDialogFromClipboard()
  })
  if (!clipShortcutRegistered) {
    console.warn('[main] failed to register Ctrl+Shift+S — local before-input-event still active')
  }

  createWindow()

  // Resume pending ingest
  queue.retry(undefined, true)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((err) => {
  console.error('[main] startup failed', err)
  app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
