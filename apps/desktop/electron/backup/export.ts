import fs from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import { BACKUP_FORMAT } from '@knowledge-desktop/shared'
import type { Db } from '../db/index'
import type { VectorBackend } from '../ingest/vector-backend'

export type ExportKind = 'full' | 'text_only'

export async function exportBackup(
  db: Db,
  vectors: VectorBackend | null,
  opts: { kind: ExportKind; filePath: string; appVersion?: string },
): Promise<{ path: string; itemCount: number }> {
  const items = db.prepare(`SELECT * FROM knowledge_items ORDER BY created_at ASC`).all() as Record<
    string,
    unknown
  >[]
  const chunks = db.prepare(`SELECT * FROM knowledge_chunks ORDER BY item_id, chunk_index`).all() as Record<
    string,
    unknown
  >[]
  const bookmarks = db.prepare(`SELECT * FROM bookmarks ORDER BY sort_order`).all() as Record<
    string,
    unknown
  >[]

  const dimRow = db.prepare(`SELECT value FROM vector_meta WHERE key='dim'`).get() as
    | { value: string }
    | undefined
  const modelRow = db.prepare(`SELECT value FROM vector_meta WHERE key='model'`).get() as
    | { value: string }
    | undefined
  const backendRow = db.prepare(`SELECT value FROM vector_meta WHERE key='backend'`).get() as
    | { value: string }
    | undefined

  const includeEmbeddings = opts.kind === 'full'
  let embeddingsLines: string[] = []

  if (includeEmbeddings && vectors && chunks.length) {
    // We cannot dump from sqlite-vec easily without a SELECT *; try reading via knn won't work.
    // For full export of embeddings stored in sqlite-vec, attempt raw SQL if table exists.
    try {
      const rows = db
        .prepare(`SELECT id, embedding FROM chunk_embeddings`)
        .all() as { id: string; embedding: Buffer | string }[]
      for (const r of rows) {
        let vector: number[]
        if (typeof r.embedding === 'string') {
          vector = JSON.parse(r.embedding)
        } else if (Buffer.isBuffer(r.embedding)) {
          // float32 blob
          const f32 = new Float32Array(
            r.embedding.buffer,
            r.embedding.byteOffset,
            r.embedding.byteLength / 4,
          )
          vector = Array.from(f32)
        } else {
          continue
        }
        embeddingsLines.push(JSON.stringify({ chunk_id: r.id, vector }))
      }
    } catch (err) {
      console.warn('[backup] embeddings dump skipped:', (err as Error).message)
    }
  }

  const manifest = {
    format: BACKUP_FORMAT,
    exported_at: new Date().toISOString(),
    app_version: opts.appVersion ?? '0.1.0',
    item_count: items.length,
    chunk_count: chunks.length,
    has_embeddings: embeddingsLines.length > 0,
    embedding_model: modelRow?.value ?? null,
    vector_dim: dimRow ? Number(dimRow.value) : null,
    vector_backend_hint: backendRow?.value ?? vectors?.name ?? null,
    includes_secrets: false,
  }

  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  zip.file('items.jsonl', items.map((i) => JSON.stringify(i)).join('\n') + (items.length ? '\n' : ''))
  if (opts.kind === 'full') {
    zip.file(
      'chunks.jsonl',
      chunks.map((c) => JSON.stringify(c)).join('\n') + (chunks.length ? '\n' : ''),
    )
    if (embeddingsLines.length) {
      zip.file('embeddings.jsonl', embeddingsLines.join('\n') + '\n')
    }
  }
  zip.file(
    'bookmarks.jsonl',
    bookmarks.map((b) => JSON.stringify(b)).join('\n') + (bookmarks.length ? '\n' : ''),
  )
  zip.file(
    'README.txt',
    `Knowledge Desktop backup (${BACKUP_FORMAT})\nExported: ${manifest.exported_at}\nItems: ${items.length}\n`,
  )

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  fs.mkdirSync(path.dirname(opts.filePath), { recursive: true })
  fs.writeFileSync(opts.filePath, buf)

  const histId = cryptoRandom()
  db.prepare(
    `INSERT INTO export_history(id, path, kind, item_count, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(histId, opts.filePath, opts.kind, items.length, Date.now())

  return { path: opts.filePath, itemCount: items.length }
}

function cryptoRandom(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
