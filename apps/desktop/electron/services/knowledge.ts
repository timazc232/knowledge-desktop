import { createHash, randomUUID } from 'node:crypto'
import type { Db } from '../db/index'
import { searchFts } from '../db/index'
import type { SourceType } from '@knowledge-desktop/shared'

const MAX_BODY = 512 * 1024

export type KnowledgeItem = {
  id: string
  title: string | null
  body: string
  source_url: string | null
  source_type: string
  source_title: string | null
  tags_json: string
  created_at: number
  updated_at: number
  embed_status: string
  embed_error: string | null
  open_count: number
  last_opened_at: number | null
  home_pin: number
}

export function createItem(
  db: Db,
  input: {
    title?: string
    body: string
    source_url?: string
    source_type: SourceType
    source_title?: string
    tags?: string[]
  },
): KnowledgeItem {
  let body = input.body
  if (body.length > MAX_BODY) body = body.slice(0, MAX_BODY)
  const id = randomUUID()
  const now = Date.now()
  const title = input.title?.trim() || body.slice(0, 40).replace(/\s+/g, ' ')
  const tags_json = JSON.stringify(input.tags ?? [])
  const hash = createHash('sha256').update(body).digest('hex')
  db.prepare(
    `INSERT INTO knowledge_items
     (id, title, body, source_url, source_type, source_title, tags_json, created_at, updated_at, embed_status, content_hash, open_count, last_opened_at, home_pin)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, NULL, 0)`,
  ).run(
    id,
    title,
    body,
    input.source_url ?? null,
    input.source_type,
    input.source_title ?? null,
    tags_json,
    now,
    now,
    hash,
  )
  return getItem(db, id)!
}

export function getItem(db: Db, id: string): KnowledgeItem | null {
  return (
    (db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(id) as KnowledgeItem) ||
    null
  )
}

export function listItems(
  db: Db,
  opts: { limit?: number; cursor?: number; source_type?: string } = {},
) {
  const limit = opts.limit ?? 50
  const cursor = opts.cursor ?? Date.now() + 1
  let sql = `SELECT * FROM knowledge_items WHERE created_at < ?`
  const params: unknown[] = [cursor]
  if (opts.source_type) {
    sql += ` AND source_type = ?`
    params.push(opts.source_type)
  }
  sql += ` ORDER BY created_at DESC LIMIT ?`
  params.push(limit)
  return db.prepare(sql).all(...params) as KnowledgeItem[]
}

/** Top10 for knowledge home: home_pin (1..3) > open_count DESC > last_opened_at DESC > updated_at DESC */
export function listTop(db: Db, limit = 10): KnowledgeItem[] {
  const lim = Math.max(1, Math.min(limit, 50))
  return db
    .prepare(
      `SELECT * FROM knowledge_items
       ORDER BY
         CASE WHEN home_pin > 0 THEN 0 ELSE 1 END ASC,
         CASE WHEN home_pin > 0 THEN home_pin ELSE 999 END ASC,
         open_count DESC,
         COALESCE(last_opened_at, 0) DESC,
         updated_at DESC
       LIMIT ?`,
    )
    .all(lim) as KnowledgeItem[]
}

export function recordOpen(db: Db, id: string): KnowledgeItem | null {
  const cur = getItem(db, id)
  if (!cur) return null
  const now = Date.now()
  db.prepare(
    `UPDATE knowledge_items SET open_count = open_count + 1, last_opened_at = ? WHERE id = ?`,
  ).run(now, id)
  return getItem(db, id)
}

/** Set home pin order 1..3, or 0 to unpin. Max 3 pinned; reassigns colliding slots. */
export function setHomePin(db: Db, id: string, pin: number): KnowledgeItem | null {
  const cur = getItem(db, id)
  if (!cur) return null
  const next = Math.max(0, Math.min(3, Math.floor(pin)))
  if (next === 0) {
    db.prepare(`UPDATE knowledge_items SET home_pin = 0, updated_at = ? WHERE id = ?`).run(
      Date.now(),
      id,
    )
    return getItem(db, id)
  }
  // Clear this slot on other items
  db.prepare(`UPDATE knowledge_items SET home_pin = 0 WHERE home_pin = ? AND id != ?`).run(
    next,
    id,
  )
  // Enforce max 3: if already 3 distinct pins and this item is unpinned, drop highest pin elsewhere? Spec: max 3.
  const pinned = db
    .prepare(`SELECT id FROM knowledge_items WHERE home_pin > 0 AND id != ?`)
    .all(id) as { id: string }[]
  if (pinned.length >= 3) {
    // Remove the one with highest pin number to free a slot
    const drop = db
      .prepare(
        `SELECT id FROM knowledge_items WHERE home_pin > 0 AND id != ? ORDER BY home_pin DESC LIMIT 1`,
      )
      .get(id) as { id: string } | undefined
    if (drop) {
      db.prepare(`UPDATE knowledge_items SET home_pin = 0 WHERE id = ?`).run(drop.id)
    }
  }
  db.prepare(`UPDATE knowledge_items SET home_pin = ?, updated_at = ? WHERE id = ?`).run(
    next,
    Date.now(),
    id,
  )
  return getItem(db, id)
}

export function updateItem(
  db: Db,
  id: string,
  patch: { title?: string; body?: string; tags?: string[] },
): KnowledgeItem | null {
  const cur = getItem(db, id)
  if (!cur) return null
  const title = patch.title ?? cur.title
  let body = patch.body ?? cur.body
  if (body.length > MAX_BODY) body = body.slice(0, MAX_BODY)
  const tags_json = patch.tags ? JSON.stringify(patch.tags) : cur.tags_json
  const bodyChanged = body !== cur.body
  const now = Date.now()
  if (bodyChanged) {
    const hash = createHash('sha256').update(body).digest('hex')
    db.prepare(
      `UPDATE knowledge_items SET title=?, body=?, tags_json=?, updated_at=?, embed_status='pending', content_hash=?, embed_error=NULL WHERE id=?`,
    ).run(title, body, tags_json, now, hash, id)
    db.prepare('DELETE FROM knowledge_chunks WHERE item_id = ?').run(id)
  } else {
    db.prepare(
      `UPDATE knowledge_items SET title=?, tags_json=?, updated_at=? WHERE id=?`,
    ).run(title, tags_json, now, id)
  }
  return getItem(db, id)
}

export function deleteItem(db: Db, id: string): boolean {
  const info = db.prepare('DELETE FROM knowledge_items WHERE id = ?').run(id)
  return info.changes > 0
}

/** Prepare FTS5 query: keep CJK as individual tokens (default tokenizer). */
export function prepareFtsQuery(raw: string): string {
  const cleaned = raw.replace(/[^\w\u3400-\u9fff\s]+/g, ' ').trim()
  if (!cleaned) return ''
  const parts: string[] = []
  for (const token of cleaned.split(/\s+/)) {
    if (/[\u3400-\u9fff]/.test(token)) {
      // Split CJK runs into unigrams so FTS5 MATCH works without a CJK tokenizer
      for (const ch of token) {
        if (/[\u3400-\u9fff]/.test(ch)) parts.push(`"${ch}"`)
        else if (/\w/.test(ch)) parts.push(ch)
      }
    } else if (token) {
      parts.push(`"${token}"*`)
    }
  }
  return parts.join(' ')
}

export function ftsSearch(db: Db, query: string, topK = 20) {
  const q = prepareFtsQuery(query)
  let rows: KnowledgeItem[] = []
  if (q) {
    try {
      rows = searchFts(db, q, topK) as unknown as KnowledgeItem[]
    } catch (err) {
      console.warn('[fts] MATCH failed', q, err)
    }
  }
  if (rows.length) return rows
  // CJK-friendly fallback when default FTS tokenizer keeps CJK runs as one token
  const like = `%${query.replace(/[%_]/g, '').trim()}%`
  if (like === '%%') return []
  return db
    .prepare(
      `SELECT * FROM knowledge_items
       WHERE title LIKE ? OR body LIKE ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(like, like, topK) as KnowledgeItem[]
}
