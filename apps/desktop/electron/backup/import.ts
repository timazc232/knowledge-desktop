import fs from 'node:fs'
import JSZip from 'jszip'
import { randomUUID } from 'node:crypto'
import { BACKUP_FORMAT } from '@knowledge-desktop/shared'
import type { Db } from '../db/index'
import type { IngestQueue } from '../ingest/queue'

export type ConflictMode = 'skip' | 'overwrite' | 'copy'

export async function importBackup(
  db: Db,
  queue: IngestQueue,
  opts: { filePath: string; conflict: ConflictMode },
): Promise<{ imported: number; skipped: number; format: string }> {
  const buf = fs.readFileSync(opts.filePath)
  const zip = await JSZip.loadAsync(buf)
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) throw new Error('missing manifest.json')
  const manifest = JSON.parse(await manifestFile.async('string')) as {
    format?: string
  }
  if (manifest.format !== BACKUP_FORMAT) {
    throw new Error(`unsupported format: ${manifest.format}`)
  }

  const itemsFile = zip.file('items.jsonl')
  if (!itemsFile) throw new Error('missing items.jsonl')
  const itemsText = await itemsFile.async('string')
  const lines = itemsText.split('\n').filter((l) => l.trim())

  let imported = 0
  let skipped = 0

  const insert = db.prepare(
    `INSERT INTO knowledge_items
     (id, title, body, source_url, source_type, source_title, tags_json, created_at, updated_at, embed_status, embed_error, content_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?)`,
  )
  const update = db.prepare(
    `UPDATE knowledge_items SET title=?, body=?, source_url=?, source_type=?, source_title=?, tags_json=?, updated_at=?, embed_status='pending', content_hash=?, embed_error=NULL WHERE id=?`,
  )
  const exists = db.prepare(`SELECT id FROM knowledge_items WHERE id=?`)

  const toEnqueue: string[] = []

  const tx = db.transaction(() => {
    for (const line of lines) {
      const item = JSON.parse(line) as {
        id: string
        title?: string | null
        body: string
        source_url?: string | null
        source_type?: string
        source_title?: string | null
        tags_json?: string
        created_at?: number
        updated_at?: number
        content_hash?: string | null
      }
      const existing = exists.get(item.id)
      if (existing) {
        if (opts.conflict === 'skip') {
          skipped++
          continue
        }
        if (opts.conflict === 'overwrite') {
          db.prepare(`DELETE FROM knowledge_chunks WHERE item_id=?`).run(item.id)
          update.run(
            item.title ?? null,
            item.body,
            item.source_url ?? null,
            item.source_type ?? 'import',
            item.source_title ?? null,
            item.tags_json ?? '[]',
            Date.now(),
            item.content_hash ?? null,
            item.id,
          )
          toEnqueue.push(item.id)
          imported++
          continue
        }
        // copy — new id
        const newId = randomUUID()
        insert.run(
          newId,
          item.title ?? null,
          item.body,
          item.source_url ?? null,
          'import',
          item.source_title ?? null,
          item.tags_json ?? '[]',
          item.created_at ?? Date.now(),
          Date.now(),
          item.content_hash ?? null,
        )
        toEnqueue.push(newId)
        imported++
        continue
      }
      insert.run(
        item.id,
        item.title ?? null,
        item.body,
        item.source_url ?? null,
        item.source_type ?? 'import',
        item.source_title ?? null,
        item.tags_json ?? '[]',
        item.created_at ?? Date.now(),
        item.updated_at ?? Date.now(),
        item.content_hash ?? null,
      )
      toEnqueue.push(item.id)
      imported++
    }
  })
  tx()

  // Optional bookmarks
  const bmFile = zip.file('bookmarks.jsonl')
  if (bmFile) {
    const bmText = await bmFile.async('string')
    const bmInsert = db.prepare(
      `INSERT OR IGNORE INTO bookmarks(id, title, url, icon, sort_order, pinned, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const line of bmText.split('\n').filter((l) => l.trim())) {
      const b = JSON.parse(line) as {
        id: string
        title: string
        url: string
        icon?: string | null
        sort_order?: number
        pinned?: number
        created_at?: number
      }
      bmInsert.run(
        b.id || randomUUID(),
        b.title,
        b.url,
        b.icon ?? null,
        b.sort_order ?? 0,
        b.pinned ?? 0,
        b.created_at ?? Date.now(),
      )
    }
  }

  for (const id of toEnqueue) queue.enqueue(id)

  return { imported, skipped, format: BACKUP_FORMAT }
}
