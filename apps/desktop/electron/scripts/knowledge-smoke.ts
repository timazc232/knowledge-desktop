/**
 * Smoke: knowledge CRUD + chunk enqueue path without Electron UI.
 * Run: pnpm --filter @knowledge-desktop/desktop knowledge:smoke
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openDatabase } from '../db/index.js'
import { createItem, listItems, deleteItem, getItem, listTop, recordOpen, setHomePin } from '../services/knowledge.js'
import { chunkText } from '../ingest/chunker.js'
import { createVectorBackend } from '../ingest/vector-backend.js'
import { hybridSearch } from '../services/search.js'
import { seedBookmarksOnce, listBookmarks } from '../services/bookmarks.js'
import { exportBackup } from '../backup/export.js'
import { importBackup } from '../backup/import.js'
import { IngestQueue } from '../ingest/queue.js'

async function main() {
  const tmp = path.join(os.tmpdir(), `kd-smoke-${Date.now()}`)
  fs.mkdirSync(tmp, { recursive: true })
  const dbPath = path.join(tmp, 't.sqlite')
  const db = openDatabase(dbPath)

  seedBookmarksOnce(db)
  const bms = listBookmarks(db)
  console.log('[smoke] bookmarks', bms.length)

  let vectors = await createVectorBackend({ dim: 8, db })
  const queue = new IngestQueue(db, () => vectors, (v) => { vectors = v })

  const item = createItem(db, {
    body: '知识桌面冒烟测试：向量检索与全文检索。Knowledge Desktop smoke.',
    source_type: 'manual',
    title: 'smoke',
  })
  console.log('[smoke] created', item.id)

  // Manually chunk (no API key → queue will skip)
  const chunks = chunkText(item.body)
  console.log('[smoke] chunks', chunks.length)
  queue.enqueue(item.id)
  // give queue a tick
  await new Promise((r) => setTimeout(r, 200))
  const after = getItem(db, item.id)!
  console.log('[smoke] embed_status', after.embed_status)

  const fts = await hybridSearch(db, vectors, '冒烟', 5)
  console.log('[smoke] search mode', fts.mode, 'hits', fts.items.length)

  const zipPath = path.join(tmp, 'b.zip')
  await exportBackup(db, vectors, { kind: 'text_only', filePath: zipPath })
  const imp = await importBackup(db, queue, { filePath: zipPath, conflict: 'skip' })
  console.log('[smoke] import', imp)

  console.log('[smoke] list', listItems(db).length)

  const opened = recordOpen(db, item.id)
  console.log('[smoke] recordOpen count', opened?.open_count, 'last', opened?.last_opened_at)
  setHomePin(db, item.id, 1)
  const top = listTop(db, 10)
  console.log('[smoke] listTop', top.length, 'pin', top[0]?.home_pin, 'opens', top[0]?.open_count)
  if (!top.length || top[0].id !== item.id) throw new Error('listTop did not return pinned item first')
  if ((opened?.open_count ?? 0) < 1) throw new Error('recordOpen did not increment')

  deleteItem(db, item.id)
  await vectors.close()
  db.close()
  fs.rmSync(tmp, { recursive: true, force: true })
  console.log('[smoke] OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
