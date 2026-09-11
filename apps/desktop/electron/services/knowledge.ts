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
     (id, title, body, source_url, source_type, source_title, tags_json, created_at, updated_at, embed_status, content_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
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
