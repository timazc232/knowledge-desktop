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
export const MAX_SIDEBAR_PINS = 10

const HIDDEN_BOUNDS = { x: 0, y: 0, width: 0, height: 0 }

export class TabManager {
  private live = new Map<string, LiveTab>()
  private bounds = { x: 0, y: 0, width: 800, height: 600 }
  private win: BrowserWindow | null = null
  /** Only true while Browser page is mounted; keeps WebContentsViews off Library/Settings. */
  private browserVisible = false
  private clipShortcutHandler: (() => void) | null = null

  constructor(private db: Db) {}

  setClipShortcutHandler(handler: () => void): void {
    this.clipShortcutHandler = handler
  }

  attachWindow(win: BrowserWindow): void {
    this.win = win
    this.browserVisible = false
    // Restore session (pinned kept; active or first pinned/first tab) until Browser showActive
    this.restoreSession()
  }

  /**
   * After DB migrate/seed: keep all pinned tabs; if none active, activate first pinned
   * or first tab. Does not delete or reseed tabs.
   */
  restoreSession(): void {
    const active = this.db
      .prepare(`SELECT id FROM browser_tabs WHERE active=1 LIMIT 1`)
      .get() as { id: string } | undefined
    if (active) {
      void this.activate(active.id)
      return
    }

    const firstPinned = this.db
      .prepare(
        `SELECT id FROM browser_tabs WHERE pinned=1 ORDER BY sort_order ASC, updated_at DESC LIMIT 1`,
      )
      .get() as { id: string } | undefined
    if (firstPinned) {
      void this.activate(firstPinned.id)
      return
    }

    const first = this.db
      .prepare(
        `SELECT id FROM browser_tabs ORDER BY pinned DESC, sort_order ASC, updated_at DESC LIMIT 1`,
      )
      .get() as { id: string } | undefined
    if (first) {
      void this.activate(first.id)
    }
  }

  setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    this.bounds = bounds
    if (!this.browserVisible) return
    for (const [id, live] of this.live) {
      const row = this.getRow(id)
      if (row?.active) {
        live.view.setBounds(bounds)
      }
    }
  }

  list(): TabDto[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM browser_tabs ORDER BY pinned DESC, sort_order ASC, updated_at DESC`,
        )
        .all() as any[]
    ).map(mapRow)
  }

  listPinned(): TabDto[] {
    return (
      this.db
        .prepare(`SELECT * FROM browser_tabs WHERE pinned=1 ORDER BY sort_order ASC`)
        .all() as any[]
    ).map(mapRow)
  }

  create(input: { url?: string; pinned?: boolean; title?: string } = {}): TabDto {
    const id = randomUUID()
    const url = normalizeUrl(input.url || 'https://www.google.com')
    const now = Date.now()
    const wantPin = !!input.pinned

    if (wantPin) {
      const count = (
        this.db.prepare(`SELECT COUNT(*) AS c FROM browser_tabs WHERE pinned=1`).get() as {
          c: number
        }
      ).c
      if (count >= MAX_SIDEBAR_PINS) {
        throw new Error('最多钉选 10 个')
      }
    }

    const max = (
      this.db.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM browser_tabs`).get() as {
        m: number
      }
    ).m
    const pinMax = (
      this.db
        .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM browser_tabs WHERE pinned=1`)
        .get() as { m: number }
    ).m
    const sortOrder = wantPin ? pinMax + 1 : max + 1

    this.db.prepare(`UPDATE browser_tabs SET active=0`).run()
    this.db
      .prepare(
        `INSERT INTO browser_tabs(id, title, url, favicon, sort_order, active, pinned, sleeping, updated_at)
         VALUES (?, ?, ?, NULL, ?, 1, ?, 0, ?)`,
      )
      .run(id, input.title ?? url, url, sortOrder, wantPin ? 1 : 0, now)
    void this.wake(id, url)
    this.emitUpdated(id)
    return this.get(id)!
  }

  get(id: string): TabDto | null {
    const row = this.getRow(id)
    return row ? mapRow(row) : null
  }

  setPinned(id: string, pinned: boolean): TabDto {
    const row = this.getRow(id)
    if (!row) throw new Error('标签不存在')

    if (pinned) {
      if (row.pinned) return mapRow(row)
      const count = (
        this.db.prepare(`SELECT COUNT(*) AS c FROM browser_tabs WHERE pinned=1`).get() as {
          c: number
        }
      ).c
      if (count >= MAX_SIDEBAR_PINS) {
        throw new Error('最多钉选 10 个')
      }
      const pinMax = (
        this.db
          .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM browser_tabs WHERE pinned=1`)
          .get() as { m: number }
      ).m
      this.db
        .prepare(`UPDATE browser_tabs SET pinned=1, sort_order=?, updated_at=? WHERE id=?`)
        .run(pinMax + 1, Date.now(), id)
    } else {
      if (!row.pinned) return mapRow(row)
      this.db
        .prepare(`UPDATE browser_tabs SET pinned=0, updated_at=? WHERE id=?`)
        .run(Date.now(), id)
    }
    this.emitUpdated(id)
    return this.get(id)!
  }

  close(id: string): boolean {
    this.sleep(id, true)
    const info = this.db.prepare(`DELETE FROM browser_tabs WHERE id=?`).run(id)
    if (info.changes === 0) return false
    const next = this.db
      .prepare(`SELECT id FROM browser_tabs ORDER BY pinned DESC, sort_order DESC LIMIT 1`)
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
      live.view.setBounds(this.browserVisible ? this.bounds : HIDDEN_BOUNDS)
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

  /** Hide all browser views (when leaving Browser page / before Browser mounts) */
  hideAll(): void {
    this.browserVisible = false
    for (const live of this.live.values()) {
      live.view.setBounds(HIDDEN_BOUNDS)
    }
  }

  showActive(): void {
    this.browserVisible = true
    const active = this.db
      .prepare(`SELECT id FROM browser_tabs WHERE active=1 LIMIT 1`)
      .get() as { id: string } | undefined
    if (active) {
      const live = this.live.get(active.id)
      if (live) live.view.setBounds(this.bounds)
    }
  }

  destroyAll(): void {
    for (const id of [...this.live.keys()]) this.sleep(id, true, true)
    this.win = null
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
    view.setBounds(this.browserVisible ? this.bounds : HIDDEN_BOUNDS)

    view.webContents.on('page-title-updated', (_e, title) => {
      this.db
        .prepare(`UPDATE browser_tabs SET title=?, updated_at=? WHERE id=?`)
        .run(title, Date.now(), id)
      this.emitUpdated(id)
    })
    view.webContents.on('page-favicon-updated', (_e, favicons) => {
      const fav = favicons?.[0]
      if (!fav) return
      this.db
        .prepare(`UPDATE browser_tabs SET favicon=?, updated_at=? WHERE id=?`)
        .run(fav, Date.now(), id)
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
    view.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const key = (input.key || '').toLowerCase()
      if (key !== 's') return
      if (!((input.control || input.meta) && input.shift && !input.alt)) return
      event.preventDefault()
      this.clipShortcutHandler?.()
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

  private sleep(id: string, force = false, silent = false): void {
    const live = this.live.get(id)
    if (!live) return
    const row = this.getRow(id)
    if (!force && row?.pinned) return
    if (this.win && !this.win.isDestroyed()) {
      try {
        this.win.contentView.removeChildView(live.view)
      } catch {
        /* ignore */
      }
    }
    try {
      if (!live.view.webContents.isDestroyed()) {
        live.view.webContents.close()
      }
    } catch {
      /* ignore */
    }
    this.live.delete(id)
    this.db
      .prepare(`UPDATE browser_tabs SET sleeping=1, updated_at=? WHERE id=?`)
      .run(Date.now(), id)
    if (!silent) this.emitUpdated(id)
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
    const win = this.win
    if (!dto || !win || win.isDestroyed() || win.webContents.isDestroyed()) return
    try {
      win.webContents.send('tabs:onUpdated', dto)
    } catch {
      /* window may be mid-destroy */
    }
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
