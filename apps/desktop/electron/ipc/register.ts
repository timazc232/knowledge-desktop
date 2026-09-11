import { ipcMain, clipboard, dialog, BrowserWindow } from 'electron'
import type { Db } from '../db/index'
import type { VectorBackend } from '../ingest/vector-backend'
import type { IngestQueue } from '../ingest/queue'
import type { TabManager } from '../browser/TabManager'
import {
  createItem,
  updateItem,
  deleteItem,
  getItem,
  listItems,
} from '../services/knowledge'
import { hybridSearch } from '../services/search'
import {
  getEmbedSettings,
  getSetting,
  setSetting,
  setSecret,
  getSecret,
} from '../services/settings'
import {
  listBookmarks,
  createBookmark,
  updateBookmark,
  deleteBookmark,
  reorderBookmarks,
} from '../services/bookmarks'
import { embedTexts } from '../ingest/embedder'
import { exportBackup } from '../backup/export'
import { importBackup } from '../backup/import'
import type { SourceType } from '@knowledge-desktop/shared'

export type AppContext = {
  db: Db
  getVectors: () => VectorBackend | null
  setVectors: (v: VectorBackend) => void
  queue: IngestQueue
  tabs: TabManager
  getMainWindow: () => BrowserWindow | null
}

export function registerIpc(ctx: AppContext): void {
  const { db, queue, tabs } = ctx

  // --- Knowledge ---
  ipcMain.handle('knowledge:create', async (_e, payload) => {
    const item = createItem(db, {
      title: payload?.title,
      body: payload?.body ?? '',
      source_url: payload?.source_url,
      source_type: (payload?.source_type as SourceType) || 'manual',
      source_title: payload?.source_title,
      tags: payload?.tags,
    })
    queue.enqueue(item.id)
    return item
  })

  ipcMain.handle('knowledge:update', async (_e, payload) => {
    const before = getItem(db, payload.id)
    const item = updateItem(db, payload.id, {
      title: payload.title,
      body: payload.body,
      tags: payload.tags,
    })
    if (item && before && payload.body !== undefined && payload.body !== before.body) {
      queue.enqueue(item.id)
    }
    return item
  })

  ipcMain.handle('knowledge:delete', async (_e, payload) => {
    const chunks = db
      .prepare(`SELECT id FROM knowledge_chunks WHERE item_id=?`)
      .all(payload.id) as { id: string }[]
    const vectors = ctx.getVectors()
    if (vectors && chunks.length) {
      await vectors.remove(chunks.map((c) => c.id))
    }
    return deleteItem(db, payload.id)
  })

  ipcMain.handle('knowledge:get', async (_e, payload) => getItem(db, payload.id))

  ipcMain.handle('knowledge:list', async (_e, payload) =>
    listItems(db, {
      cursor: payload?.cursor,
      limit: payload?.limit,
      source_type: payload?.source_type,
    }),
  )

  ipcMain.handle('knowledge:search', async (_e, payload) => {
    return hybridSearch(db, ctx.getVectors(), payload?.query ?? '', payload?.topK ?? 20)
  })

  ipcMain.handle('knowledge:retryEmbed', async (_e, payload) => {
    if (payload?.allPending) return queue.retry(undefined, true)
    return queue.retry(payload?.id)
  })

  // --- Clip ---
  ipcMain.handle('clip:fromSelection', async (_e, payload) => {
    const item = createItem(db, {
      title: payload?.title,
      body: payload?.text ?? '',
      source_url: payload?.url,
      source_type: 'in_app_clip',
      source_title: payload?.title,
    })
    queue.enqueue(item.id)
    return item
  })

  ipcMain.handle('clip:fromClipboard', async () => {
    const text = clipboard.readText()
    if (!text?.trim()) return { ok: false, error: 'clipboard empty' }
    const item = createItem(db, {
      body: text,
      source_type: 'clipboard',
    })
    queue.enqueue(item.id)
    return { ok: true, item }
  })

  // --- Tabs ---
  ipcMain.handle('tabs:list', async () => tabs.list())
  ipcMain.handle('tabs:create', async (_e, payload) => tabs.create(payload ?? {}))
  ipcMain.handle('tabs:close', async (_e, payload) => tabs.close(payload.id))
  ipcMain.handle('tabs:activate', async (_e, payload) => tabs.activate(payload.id))
  ipcMain.handle('tabs:navigate', async (_e, payload) =>
    tabs.navigate(payload.id, payload.url),
  )
  ipcMain.handle('tabs:back', async (_e, payload) => {
    tabs.back(payload.id)
  })
  ipcMain.handle('tabs:forward', async (_e, payload) => {
    tabs.forward(payload.id)
  })
  ipcMain.handle('tabs:reload', async (_e, payload) => {
    tabs.reload(payload.id)
  })
  ipcMain.handle('tabs:setBounds', async (_e, payload) => {
    tabs.setBounds(payload)
  })
  ipcMain.handle('tabs:hide', async () => {
    tabs.hideAll()
  })
  ipcMain.handle('tabs:show', async () => {
    tabs.showActive()
  })
  ipcMain.handle('tabs:setPinned', async (_e, payload) => {
    try {
      const tab = tabs.setPinned(payload.id, !!payload.pinned)
      return { ok: true as const, tab }
    } catch (err) {
      return { ok: false as const, error: (err as Error).message || String(err) }
    }
  })
  ipcMain.handle('tabs:listPinned', async () => tabs.listPinned())

  // --- Bookmarks ---
  ipcMain.handle('bookmarks:list', async () => listBookmarks(db))
  ipcMain.handle('bookmarks:create', async (_e, payload) => createBookmark(db, payload))
  ipcMain.handle('bookmarks:update', async (_e, payload) =>
    updateBookmark(db, payload.id, payload),
  )
  ipcMain.handle('bookmarks:delete', async (_e, payload) => deleteBookmark(db, payload.id))
  ipcMain.handle('bookmarks:reorder', async (_e, payload) => {
    reorderBookmarks(db, payload.ids ?? [])
    return listBookmarks(db)
  })

  // --- Backup ---
  ipcMain.handle('backup:export', async (_e, payload) => {
    const win = ctx.getMainWindow()
    let filePath = payload?.path as string | undefined
    if (!filePath) {
      const res = await dialog.showSaveDialog(win ?? undefined!, {
        title: '导出知识库备份',
        defaultPath: `knowledge-backup-${Date.now()}.zip`,
        filters: [{ name: 'Zip', extensions: ['zip'] }],
      })
      if (res.canceled || !res.filePath) return { canceled: true }
      filePath = res.filePath
    }
    const result = await exportBackup(db, ctx.getVectors(), {
      kind: payload?.kind === 'text_only' ? 'text_only' : 'full',
      filePath,
    })
    return { canceled: false, ...result }
  })

  ipcMain.handle('backup:import', async (_e, payload) => {
    const win = ctx.getMainWindow()
    let filePath = payload?.path as string | undefined
    if (!filePath) {
      const res = await dialog.showOpenDialog(win ?? undefined!, {
        title: '导入知识库备份',
        filters: [{ name: 'Zip', extensions: ['zip'] }],
        properties: ['openFile'],
      })
      if (res.canceled || !res.filePaths[0]) return { canceled: true }
      filePath = res.filePaths[0]
    }
    const result = await importBackup(db, queue, {
      filePath,
      conflict: payload?.conflict ?? 'skip',
    })
    return { canceled: false, ...result }
  })

  // --- Settings ---
  ipcMain.handle('settings:get', async () => {
    const embed = getEmbedSettings(db)
    const themeRaw = getSetting(db, 'ui.theme')
    const theme = themeRaw === 'light' ? 'light' : 'dark'
    return {
      theme,
      embed: {
        apiBase: embed.apiBase,
        model: embed.model,
        hasApiKey: !!embed.apiKey,
        // never return raw key; UI can set new one
        apiKey: embed.apiKey ? '••••••••' : '',
      },
    }
  })

  ipcMain.handle('settings:set', async (_e, payload) => {
    if (payload?.theme === 'light' || payload?.theme === 'dark') {
      setSetting(db, 'ui.theme', payload.theme)
    }
    if (payload?.embed) {
      if (typeof payload.embed.apiBase === 'string') {
        setSetting(db, 'embed.apiBase', payload.embed.apiBase)
      }
      if (typeof payload.embed.model === 'string') {
        setSetting(db, 'embed.model', payload.embed.model)
      }
      if (typeof payload.embed.apiKey === 'string' && !payload.embed.apiKey.startsWith('••')) {
        setSecret(db, 'embed.apiKey', payload.embed.apiKey)
      }
    }
    return { ok: true }
  })

  ipcMain.handle('settings:testEmbedding', async () => {
    const settings = getEmbedSettings(db)
    if (!settings.apiKey) {
      return { ok: false, error: '未配置 API Key' }
    }
    try {
      const [vec] = await embedTexts(['知识库嵌入冒烟测试'], settings)
      const dim = vec?.length ?? 0
      setSetting(db, 'embed.lastTestDim', String(dim))
      // Ensure vector backend for this dim
      if (dim && (!ctx.getVectors() || ctx.getVectors()!.dim !== dim)) {
        const { createVectorBackend } = await import('../ingest/vector-backend')
        const backend = await createVectorBackend({ dim, db })
        ctx.setVectors(backend)
        db.prepare(
          `INSERT INTO vector_meta(key, value) VALUES('dim', ?)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        ).run(String(dim))
        db.prepare(
          `INSERT INTO vector_meta(key, value) VALUES('backend', ?)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        ).run(backend.name)
        db.prepare(
          `INSERT INTO vector_meta(key, value) VALUES('model', ?)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        ).run(settings.model)
      }
      return { ok: true, dim }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // silence unused
  void getSetting
  void getSecret
}
