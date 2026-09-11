import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import type { Db } from '../db/index'
import type { VectorBackend } from './vector-backend'
import { chunkText, estimateTokens } from './chunker'
import { embedTexts } from './embedder'
import { getEmbedSettings } from '../services/settings'
import { getItem } from '../services/knowledge'

export type IngestProgress = {
  jobId: string
  itemId: string
  status: 'queued' | 'processing' | 'done' | 'failed' | 'skipped_no_key'
  error?: string
}

export class IngestQueue {
  private running = false
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private db: Db,
    private getVectors: () => VectorBackend | null,
    private setVectors?: (backend: VectorBackend) => void,
  ) {}

  enqueue(itemId: string): string {
    const id = randomUUID()
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO ingest_jobs(id, item_id, status, attempts, created_at, updated_at)
         VALUES (?, ?, 'queued', 0, ?, ?)`,
      )
      .run(id, itemId, now, now)
    this.db
      .prepare(
        `UPDATE knowledge_items SET embed_status='pending', embed_error=NULL WHERE id=?`,
      )
      .run(itemId)
    this.emit({ jobId: id, itemId, status: 'queued' })
    this.kick()
    return id
  }

  /** Re-queue failed / skipped / pending items */
  retry(itemId?: string, allPending = false): number {
    let ids: string[] = []
    if (allPending) {
      ids = (
        this.db
          .prepare(
            `SELECT id FROM knowledge_items WHERE embed_status IN ('pending','failed','skipped_no_key')`,
          )
          .all() as { id: string }[]
      ).map((r) => r.id)
    } else if (itemId) {
      ids = [itemId]
    }
    for (const id of ids) this.enqueue(id)
    return ids.length
  }

  kick(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.processNext()
    }, 50)
  }

  private emit(ev: IngestProgress): void {
    try {
      const req = createRequire(import.meta.url)
      const { BrowserWindow } = req('electron') as typeof import('electron')
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('knowledge:onIngestProgress', ev)
      }
    } catch {
      /* no electron (smoke) */
    }
  }

  private async processNext(): Promise<void> {
    if (this.running) return
    const job = this.db
      .prepare(
        `SELECT id, item_id, attempts FROM ingest_jobs WHERE status='queued' ORDER BY created_at ASC LIMIT 1`,
      )
      .get() as { id: string; item_id: string; attempts: number } | undefined
    if (!job) return

    this.running = true
    const now = Date.now()
    this.db
      .prepare(
        `UPDATE ingest_jobs SET status='running', attempts=attempts+1, updated_at=? WHERE id=?`,
      )
      .run(now, job.id)
    this.db
      .prepare(`UPDATE knowledge_items SET embed_status='processing' WHERE id=?`)
      .run(job.item_id)
    this.emit({ jobId: job.id, itemId: job.item_id, status: 'processing' })

    try {
      await this.processItem(job.id, job.item_id)
    } catch (err) {
      const msg = (err as Error).message?.slice(0, 500) || String(err)
      this.db
        .prepare(
          `UPDATE ingest_jobs SET status='failed', last_error=?, updated_at=? WHERE id=?`,
        )
        .run(msg, Date.now(), job.id)
      this.db
        .prepare(
          `UPDATE knowledge_items SET embed_status='failed', embed_error=? WHERE id=?`,
        )
        .run(msg, job.item_id)
      this.emit({
        jobId: job.id,
        itemId: job.item_id,
        status: 'failed',
        error: msg,
      })
    } finally {
      this.running = false
      this.kick()
    }
  }

  private async processItem(jobId: string, itemId: string): Promise<void> {
    const item = getItem(this.db, itemId)
    if (!item) {
      this.db
        .prepare(`UPDATE ingest_jobs SET status='failed', last_error=?, updated_at=? WHERE id=?`)
        .run('item missing', Date.now(), jobId)
      return
    }

    const settings = getEmbedSettings(this.db)
    if (!settings.apiKey) {
      this.db
        .prepare(
          `UPDATE knowledge_items SET embed_status='skipped_no_key' WHERE id=?`,
        )
        .run(itemId)
      this.db
        .prepare(
          `UPDATE ingest_jobs SET status='done', updated_at=? WHERE id=?`,
        )
        .run(Date.now(), jobId)
      this.emit({ jobId, itemId, status: 'skipped_no_key' })
      return
    }

    // Clear old chunks (+ vectors via cascade / explicit)
    const oldChunks = this.db
      .prepare(`SELECT id FROM knowledge_chunks WHERE item_id = ?`)
      .all(itemId) as { id: string }[]
    const vectors = this.getVectors()
    if (vectors && oldChunks.length) {
      await vectors.remove(oldChunks.map((c) => c.id))
    }
    this.db.prepare(`DELETE FROM knowledge_chunks WHERE item_id = ?`).run(itemId)

    const texts = chunkText(item.body)
    if (!texts.length) {
      this.db
        .prepare(`UPDATE knowledge_items SET embed_status='done' WHERE id=?`)
        .run(itemId)
      this.db
        .prepare(`UPDATE ingest_jobs SET status='done', updated_at=? WHERE id=?`)
        .run(Date.now(), jobId)
      this.emit({ jobId, itemId, status: 'done' })
      return
    }

    const embeddings = await embedTexts(texts, settings)
    const dim = embeddings[0]?.length ?? 1024

    // Ensure vector backend dim matches
    let backend = this.getVectors()
    if (!backend || backend.dim !== dim) {
      const { createVectorBackend } = await import('./vector-backend')
      backend = await createVectorBackend({ dim, db: this.db })
      this.setVectors?.(backend)
      this.db
        .prepare(
          `INSERT INTO vector_meta(key, value) VALUES('dim', ?)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        )
        .run(String(dim))
      this.db
        .prepare(
          `INSERT INTO vector_meta(key, value) VALUES('backend', ?)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        )
        .run(backend.name)
      this.db
        .prepare(
          `INSERT INTO vector_meta(key, value) VALUES('model', ?)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        )
        .run(settings.model)
    }

    const upsertRows: { id: string; embedding: number[] }[] = []
    const insertChunk = this.db.prepare(
      `INSERT INTO knowledge_chunks(id, item_id, chunk_index, content, token_estimate)
       VALUES (?, ?, ?, ?, ?)`,
    )
    const tx = this.db.transaction(() => {
      for (let i = 0; i < texts.length; i++) {
        const chunkId = randomUUID()
        insertChunk.run(
          chunkId,
          itemId,
          i,
          texts[i]!,
          estimateTokens(texts[i]!),
        )
        upsertRows.push({ id: chunkId, embedding: embeddings[i]! })
      }
    })
    tx()

    await backend.upsert(upsertRows)

    this.db
      .prepare(`UPDATE knowledge_items SET embed_status='done', embed_error=NULL WHERE id=?`)
      .run(itemId)
    this.db
      .prepare(`UPDATE ingest_jobs SET status='done', updated_at=? WHERE id=?`)
      .run(Date.now(), jobId)
    this.emit({ jobId, itemId, status: 'done' })
  }
}
