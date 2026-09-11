/**
 * Smoke: open temp DB, migrate, insert item, FTS hit.
 * Run: pnpm db:smoke
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openDatabase, searchFts } from './index.js'

const tmp = path.join(os.tmpdir(), `kd-db-smoke-${Date.now()}.sqlite`)
const db = openDatabase(tmp)

const id = 'smoke-item-1'
const now = Date.now()
db.prepare(
  `INSERT INTO knowledge_items
   (id, title, body, source_type, tags_json, created_at, updated_at, embed_status)
   VALUES (?, ?, ?, 'manual', '[]', ?, ?, 'pending')`,
).run(id, 'Hello KB', '知识库脚手架冒烟测试 knowledge desktop', now, now)

const hits = searchFts(db, '知识库 OR knowledge', 5)
console.log('[db:smoke] fts hits', hits.length, hits.map((h: { id: string }) => h.id))
if (!hits.length) {
  console.error('[db:smoke] FAIL: no FTS hits')
  process.exit(1)
}

db.close()
fs.unlinkSync(tmp)
try {
  fs.unlinkSync(`${tmp}-wal`)
  fs.unlinkSync(`${tmp}-shm`)
} catch {
  /* ignore */
}
console.log('[db:smoke] OK')
