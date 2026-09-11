import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { openDatabase } from '../db/index'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kd-upgrade-'))
const dbPath = path.join(dir, 'old.sqlite')

// Simulate pre-Scheme-C DB (no open_count / last_opened_at / home_pin)
const old = new Database(dbPath)
old.exec(`
CREATE TABLE knowledge_items (
  id TEXT PRIMARY KEY,
  title TEXT,
  body TEXT NOT NULL,
  source_url TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_title TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  embed_status TEXT NOT NULL DEFAULT 'pending',
  embed_error TEXT,
  content_hash TEXT
);
INSERT INTO knowledge_items(id,title,body,created_at,updated_at)
VALUES ('x','t','body',1,1);
`)
old.close()

const db = openDatabase(dbPath)
const cols = (db.prepare(`PRAGMA table_info(knowledge_items)`).all() as { name: string }[]).map(
  (c) => c.name,
)
for (const need of ['open_count', 'last_opened_at', 'home_pin']) {
  if (!cols.includes(need)) throw new Error(`missing column ${need}`)
}
const row = db.prepare(`SELECT open_count, home_pin FROM knowledge_items WHERE id='x'`).get() as {
  open_count: number
  home_pin: number
}
if (row.open_count !== 0 || row.home_pin !== 0) throw new Error('defaults wrong')
db.close()
fs.rmSync(dir, { recursive: true, force: true })
console.log('[upgrade-smoke] OK')
