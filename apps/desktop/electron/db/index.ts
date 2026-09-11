import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export type Db = Database.Database

export function openDatabase(dbPath: string): Db {
  const dir = path.dirname(dbPath)
  fs.mkdirSync(dir, { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

export function migrate(db: Db): void {
  const schemaPath = path.join(__dirname, 'schema.sql')
  // In packaged app, schema may sit next to compiled js — also try cwd-relative
  const candidates = [
    schemaPath,
    path.join(__dirname, 'schema.sql'),
    path.join(__dirname, 'db', 'schema.sql'),
    path.join((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath || '', 'schema.sql'),
    path.join(process.cwd(), 'electron/db/schema.sql'),
    path.join(process.cwd(), 'apps/desktop/electron/db/schema.sql'),
  ]
  const file = candidates.find((p) => fs.existsSync(p))
  if (!file) {
    throw new Error(`schema.sql not found. Tried: ${candidates.join(', ')}`)
  }
  const sql = fs.readFileSync(file, 'utf8')
  // Strip pure comment-only guidance lines that are not executable? Keep as-is;
  // better-sqlite3 exec ignores line comments.
  db.exec(sql)
}

/** FTS retrieval joins via knowledge_items.rowid = fts.rowid (see tech review). */
export function searchFts(
  db: Db,
  query: string,
  limit = 20,
): { id: string; title: string | null; body: string; source_url: string | null; created_at: number; rank: number }[] {
  const stmt = db.prepare(`
    SELECT ki.id, ki.title, ki.body, ki.source_url, ki.created_at,
           bm25(knowledge_items_fts) AS rank
    FROM knowledge_items_fts
    JOIN knowledge_items ki ON ki.rowid = knowledge_items_fts.rowid
    WHERE knowledge_items_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `)
  return stmt.all(query, limit) as {
    id: string
    title: string | null
    body: string
    source_url: string | null
    created_at: number
    rank: number
  }[]
}
