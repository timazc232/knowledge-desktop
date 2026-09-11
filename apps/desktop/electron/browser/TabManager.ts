import {
  BrowserWindow,
  WebContentsView,
} from 'electron'
import { randomUUID } from 'node:crypto'
import type { Db } from '../db/index'

export type TabDto = {
  id: string
  title: string | null
  url: string
  favicon: string | null
  sort_order: number
  active: boolean
  pinned: boolean
  sleeping: boolean
  updated_at: number
}

type LiveTab = {
  view: WebContentsView
  lastActive: number
}

const MAX_AWAKE = 6
const SLEEP_MS = 5 * 60 * 1000
const PARTITION = 'persist:workbench'

export class TabManager {
  private live = new Map<string, LiveTab>()
  private bounds = { x: 0, y: 0, width: 800, height: 600 }
  private win: BrowserWindow | null = null

  constructor(private db: Db) {}

  attachWindow(win: BrowserWindow): void {
    this.win = win
    // Restore active tab view if any
    const active = this.db
      .prepare(`SELECT id FROM browser_tabs WHERE active=1 LIMIT 1`)
      .get() as { id: string } | undefined
    if (active) {
      void this.activate(active.id)
    }
  }

  setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    this.bounds = bounds
    for (const [id, live] of this.live) {
      const row = this.getRow(id)
      if (row?.active) {
        live.view.setBounds(bounds)
      }
    }
  }

  list(): TabDto[] {
    return (this.db.prepare(`SELECT * FROM browser_tabs ORDER BY sort_order ASC`).all() as any[]).map(
      mapRow,
    )
  }

  create(input: { url?: string; pinned?: boolean } = {}): TabDto {
    const id = randomUUID()
    const url = normalizeUrl(input.url || 'https://www.google.com')
    const now = Date.now()
    const max = (
      this.db.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM browser_tabs`).get() as {
        m: number
      }
    ).m
    this.db.prepare(`UPDATE browser_tabs SET active=0`).run()
    this.db
      .prepare(
        `INSERT INTO browser_tabs(id, title, url, favicon, sort_order, active, pinned, sleeping, updated_at)
         VALUES (?, ?, ?, NULL, ?, 1, ?, 0, ?)`,
      )
      .run(id, url, url, max + 1, input.pinned ? 1 : 0, now)
    void this.wake(id, url)
    this.emitUpdated(id)
    return this.get(id)!
  }

  get(id: string): TabDto | null {
    const row = this.getRow(id)
    return row ? mapRow(row) : null
  }

  close(id: string): boolean {
    this.sleep(id, true)
    const info = this.db.prepare(`DELETE FROM browser_tabs WHERE id=?`).run(id)
    if (info.changes === 0) return false
    const next = this.db
      .prepare(`SELECT id FROM browser_tabs ORDER BY sort_order DESC LIMIT 1`)
      .get() as { id: string } | undefined
    if (next) void this.activate(next.id)
    return true
  }

  async activate(id: string): Promise<TabDto | null> {
    const row = this.getRow(id)
    if (!row) return null
    this.db.prepare(`UPDATE browser_tabs SET active=0`).run()
    this.db
      .prepare(`UPDATE browser_tabs SET active=1, sleeping=0, updated_at=? WHERE id=?`)
      .run(Date.now(), id)
    // Hide other views
    for (const [tid, live] of this.live) {
      if (tid !== id) {
        live.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      }
    }
    await this.wake(id, row.url)
    const live = this.live.get(id)
    if (live) {
      live.view.setBounds(this.bounds)
      live.lastActive = Date.now()
    }
    this.maybeSleepOthers()
    this.emitUpdated(id)
    return this.get(id)
  }

  navigate(id: string, url: string): TabDto | null {
    const u = normalizeUrl(url)
    this.db
      .prepare(`UPDATE browser_tabs SET url=?, updated_at=? WHERE id=?`)
      .run(u, Date.now(), id)
    const live = this.live.get(id)
    if (live) {
      void live.view.webContents.loadURL(u)
    } else {
      void this.wake(id, u)
    }
    this.emitUpdated(id)
    return this.get(id)
  }

  back(id: string): void {
    const live = this.live.get(id)
    if (live?.view.webContents.canGoBack()) live.view.webContents.goBack()
  }

  forward(id: string): void {
    const live = this.live.get(id)
    if (live?.view.webContents.canGoForward()) live.view.webContents.goForward()
  }

  reload(id: string): void {
    const live = this.live.get(id)
    live?.view.webContents.reload()
  }

  /** Hide all browser views (when leaving Browser page) */
  hideAll(): void {
    for (const live of this.live.values()) {
      live.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    }
  }

  showActive(): void {
    const active = this.db
      .prepare(`SELECT id FROM browser_tabs WHERE active=1 LIMIT 1`)
      .get() as { id: string } | undefined
    if (active) {
      const live = this.live.get(active.id)
      if (live) live.view.setBounds(this.bounds)
    }
  }

  destroyAll(): void {
    for (const id of [...this.live.keys()]) this.sleep(id, true)
  }

  private getRow(id: string) {
    return this.db.prepare(`SELECT * FROM browser_tabs WHERE id=?`).get(id) as
      | {
          id: string
          title: string | null
          url: string
          favicon: string | null
          sort_order: number
          active: number
          pinned: number
          sleeping: number
          updated_at: number
        }
      | undefined
  }

  private async wake(id: string, url: string): Promise<void> {
    if (this.live.has(id) || !this.win) return
    const view = new WebContentsView({
      webPreferences: {
        partition: PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    this.win.contentView.addChildView(view)
    view.setBounds(this.bounds)

    view.webContents.on('page-title-updated', (_e, title) => {
      this.db
        .prepare(`UPDATE browser_tabs SET title=?, updated_at=? WHERE id=?`)
        .run(title, Date.now(), id)
      this.emitUpdated(id)
    })
    view.webContents.on('did-navigate', (_e, navigatedUrl) => {
      this.db
        .prepare(`UPDATE browser_tabs SET url=?, updated_at=? WHERE id=?`)
        .run(navigatedUrl, Date.now(), id)
      this.emitUpdated(id)
    })
    view.webContents.on('did-navigate-in-page', (_e, navigatedUrl) => {
      this.db
        .prepare(`UPDATE browser_tabs SET url=?, updated_at=? WHERE id=?`)
        .run(navigatedUrl, Date.now(), id)
      this.emitUpdated(id)
    })
    view.webContents.on('context-menu', (_e, params) => {
      if (params.selectionText?.trim()) {
        this.win?.webContents.send('clip:showDialog', {
          text: params.selectionText,
          url: params.pageURL || url,
          title: view.webContents.getTitle(),
        })
      }
    })

    this.live.set(id, { view, lastActive: Date.now() })
    this.db
      .prepare(`UPDATE browser_tabs SET sleeping=0, updated_at=? WHERE id=?`)
      .run(Date.now(), id)
    try {
      await view.webContents.loadURL(url)
    } catch (err) {
      console.warn('[tabs] loadURL failed', url, err)
    }
  }

  private sleep(id: string, force = false): void {
    const live = this.live.get(id)
    if (!live) return
    const row = this.getRow(id)
    if (!force && row?.pinned) return
    if (this.win) {
      try {
        this.win.contentView.removeChildView(live.view)
      } catch {
        /* ignore */
      }
    }
    try {
      live.view.webContents.close()
    } catch {
      /* ignore */
    }
    this.live.delete(id)
    this.db
      .prepare(`UPDATE browser_tabs SET sleeping=1, updated_at=? WHERE id=?`)
      .run(Date.now(), id)
    this.emitUpdated(id)
  }

  private maybeSleepOthers(): void {
    const awake = [...this.live.entries()].sort(
      (a, b) => a[1].lastActive - b[1].lastActive,
    )
    const now = Date.now()
    for (const [id, live] of awake) {
      const row = this.getRow(id)
      if (row?.active || row?.pinned) continue
      if (now - live.lastActive > SLEEP_MS || this.live.size > MAX_AWAKE) {
        this.sleep(id)
      }
    }
    while (this.live.size > MAX_AWAKE) {
      const candidate = awake.find(([id]) => {
        const r = this.getRow(id)
        return r && !r.active && !r.pinned && this.live.has(id)
      })
      if (!candidate) break
      this.sleep(candidate[0])
    }
  }

  private emitUpdated(id: string): void {
    const dto = this.get(id)
    if (!dto || !this.win) return
    this.win.webContents.send('tabs:onUpdated', dto)
  }
}

function mapRow(row: {
  id: string
  title: string | null
  url: string
  favicon: string | null
  sort_order: number
  active: number
  pinned: number
  sleeping: number
  updated_at: number
}): TabDto {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    favicon: row.favicon,
    sort_order: row.sort_order,
    active: !!row.active,
    pinned: !!row.pinned,
    sleeping: !!row.sleeping,
    updated_at: row.updated_at,
  }
}

function normalizeUrl(raw: string): string {
  const t = raw.trim()
  if (!t) return 'https://www.google.com'
  if (/^https?:\/\//i.test(t)) return t
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(t)) return `https://${t}`
  return `https://www.google.com/search?q=${encodeURIComponent(t)}`
}

