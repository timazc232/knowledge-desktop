import { randomUUID } from 'node:crypto'
import { DEFAULT_BOOKMARKS } from '@knowledge-desktop/shared'
import type { Db } from '../db/index'

export type Bookmark = {
  id: string
  title: string
  url: string
  icon: string | null
  sort_order: number
  pinned: number
  created_at: number
}

export function seedBookmarksOnce(db: Db): void {
  const row = db.prepare(`SELECT value FROM settings WHERE key='bookmarks.seeded'`).get() as
    | { value: string }
    | undefined
  if (row?.value === '1') return
  const count = (db.prepare(`SELECT COUNT(*) AS c FROM bookmarks`).get() as { c: number }).c
  if (count === 0) {
    const now = Date.now()
    const stmt = db.prepare(
      `INSERT INTO bookmarks(id, title, url, icon, sort_order, pinned, created_at)
       VALUES (?, ?, ?, NULL, ?, 0, ?)`,
    )
    const tx = db.transaction(() => {
      DEFAULT_BOOKMARKS.forEach((b, i) => {
        stmt.run(randomUUID(), b.title, b.url, i, now)
      })
    })
    tx()
  }
  db.prepare(
    `INSERT INTO settings(key, value) VALUES('bookmarks.seeded', '1')
     ON CONFLICT(key) DO UPDATE SET value='1'`,
  ).run()
}

/** Seed default pinned browser_tabs whenever none are pinned (ignores stale seeded flag). */
export function seedPinnedTabsOnce(db: Db): void {
  const pinnedCount = (
    db.prepare(`SELECT COUNT(*) AS c FROM browser_tabs WHERE pinned=1`).get() as { c: number }
  ).c

  if (pinnedCount > 0) {
    db.prepare(
      `INSERT INTO settings(key, value) VALUES('tabs.pins.seeded', '1')
       ON CONFLICT(key) DO UPDATE SET value='1'`,
    ).run()
    return
  }

  const now = Date.now()
  const insert = db.prepare(
    `INSERT INTO browser_tabs(id, title, url, favicon, sort_order, active, pinned, sleeping, updated_at)
     VALUES (?, ?, ?, NULL, ?, 0, 1, 1, ?)`,
  )
  const update = db.prepare(
    `UPDATE browser_tabs SET pinned=1, sort_order=?, title=COALESCE(NULLIF(title, ''), ?), updated_at=? WHERE id=?`,
  )
  const findByUrl = db.prepare(`SELECT id FROM browser_tabs WHERE url=? LIMIT 1`)

  const tx = db.transaction(() => {
    DEFAULT_BOOKMARKS.slice(0, 6).forEach((b, i) => {
      const existing = findByUrl.get(b.url) as { id: string } | undefined
      if (existing) {
        update.run(i, b.title, now, existing.id)
      } else {
        insert.run(randomUUID(), b.title, b.url, i, now)
      }
    })
  })
  tx()

  db.prepare(
    `INSERT INTO settings(key, value) VALUES('tabs.pins.seeded', '1')
     ON CONFLICT(key) DO UPDATE SET value='1'`,
  ).run()
}

export function listBookmarks(db: Db): Bookmark[] {
  return db
    .prepare(`SELECT * FROM bookmarks ORDER BY sort_order ASC, created_at ASC`)
    .all() as Bookmark[]
}

export function createBookmark(
  db: Db,
  input: { title: string; url: string; icon?: string; pinned?: boolean },
): Bookmark {
  const id = randomUUID()
  const now = Date.now()
  const max = (
    db.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM bookmarks`).get() as {
      m: number
    }
  ).m
  db.prepare(
    `INSERT INTO bookmarks(id, title, url, icon, sort_order, pinned, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.title,
    input.url,
    input.icon ?? null,
    max + 1,
    input.pinned ? 1 : 0,
    now,
  )
  return db.prepare(`SELECT * FROM bookmarks WHERE id=?`).get(id) as Bookmark
}

export function updateBookmark(
  db: Db,
  id: string,
  patch: { title?: string; url?: string; icon?: string; pinned?: boolean },
): Bookmark | null {
  const cur = db.prepare(`SELECT * FROM bookmarks WHERE id=?`).get(id) as Bookmark | undefined
  if (!cur) return null
  db.prepare(
    `UPDATE bookmarks SET title=?, url=?, icon=?, pinned=? WHERE id=?`,
  ).run(
    patch.title ?? cur.title,
    patch.url ?? cur.url,
    patch.icon !== undefined ? patch.icon : cur.icon,
    patch.pinned !== undefined ? (patch.pinned ? 1 : 0) : cur.pinned,
    id,
  )
  return db.prepare(`SELECT * FROM bookmarks WHERE id=?`).get(id) as Bookmark
}

export function deleteBookmark(db: Db, id: string): boolean {
  return db.prepare(`DELETE FROM bookmarks WHERE id=?`).run(id).changes > 0
}

export function reorderBookmarks(db: Db, ids: string[]): void {
  const stmt = db.prepare(`UPDATE bookmarks SET sort_order=? WHERE id=?`)
  const tx = db.transaction(() => {
    ids.forEach((id, i) => stmt.run(i, id))
  })
  tx()
}
