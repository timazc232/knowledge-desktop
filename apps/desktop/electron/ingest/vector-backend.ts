import { createRequire } from 'node:module'
import type { Db } from '../db/index'

export type VectorBackendName = 'sqlite-vec' | 'lance' | 'memory'

export interface VectorUpsert {
  id: string
  embedding: number[]
  metadata?: Record<string, string>
}

export interface VectorHit {
  id: string
  score: number
}

export interface VectorBackend {
  readonly name: VectorBackendName
  readonly dim: number
  upsert(rows: VectorUpsert[]): Promise<void>
  knn(query: number[], k: number): Promise<VectorHit[]>
  remove(ids: string[]): Promise<void>
  close(): Promise<void>
}

/** In-process cosine backend for smoke / fallback when native modules fail. */
export class MemoryVectorBackend implements VectorBackend {
  readonly name = 'memory' as const
  private store = new Map<string, number[]>()

  constructor(readonly dim: number) {}

  async upsert(rows: VectorUpsert[]): Promise<void> {
    for (const row of rows) {
      if (row.embedding.length !== this.dim) {
        throw new Error(`dim mismatch: expected ${this.dim}, got ${row.embedding.length}`)
      }
      this.store.set(row.id, row.embedding)
    }
  }

  async knn(query: number[], k: number): Promise<VectorHit[]> {
    const scored: VectorHit[] = []
    for (const [id, vec] of this.store) {
      scored.push({ id, score: cosine(query, vec) })
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, k)
  }

  async remove(ids: string[]): Promise<void> {
    for (const id of ids) this.store.delete(id)
  }

  async close(): Promise<void> {
    this.store.clear()
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12)
}

/**
 * Load sqlite-vec onto an existing better-sqlite3 connection (shared with app DB).
 */
export class SqliteVecOnDb implements VectorBackend {
  readonly name = 'sqlite-vec' as const

  constructor(
    private db: Db,
    readonly dim: number,
  ) {
    this.ensureTable()
  }

  private ensureTable(): void {
    this.db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS chunk_embeddings USING vec0(
        id TEXT PRIMARY KEY,
        embedding FLOAT[${this.dim}]
      )`,
    )
  }

  static async tryLoad(db: Db, dim: number): Promise<SqliteVecOnDb | null> {
    try {
      const sqliteVec = await import('sqlite-vec')
      sqliteVec.load(db)
      console.log('[vector] sqlite-vec loaded on shared Db, dim=', dim)
      return new SqliteVecOnDb(db, dim)
    } catch (err) {
      console.warn('[vector] SqliteVecOnDb unavailable:', (err as Error).message)
      return null
    }
  }

  async upsert(rows: VectorUpsert[]): Promise<void> {
    const del = this.db.prepare(`DELETE FROM chunk_embeddings WHERE id = ?`)
    const ins = this.db.prepare(
      `INSERT INTO chunk_embeddings(id, embedding) VALUES (?, ?)`,
    )
    const tx = this.db.transaction((items: VectorUpsert[]) => {
      for (const row of items) {
        if (row.embedding.length !== this.dim) {
          throw new Error(`dim mismatch: expected ${this.dim}, got ${row.embedding.length}`)
        }
        del.run(row.id)
        ins.run(row.id, JSON.stringify(row.embedding))
      }
    })
    tx(rows)
  }

  async knn(query: number[], k: number): Promise<VectorHit[]> {
    if (query.length !== this.dim) {
      throw new Error(`query dim mismatch: expected ${this.dim}, got ${query.length}`)
    }
    const rows = this.db
      .prepare(
        `SELECT id, distance FROM chunk_embeddings
         WHERE embedding MATCH ?
         ORDER BY distance
         LIMIT ?`,
      )
      .all(JSON.stringify(query), k) as { id: string; distance: number }[]
    return rows.map((r) => ({
      id: r.id,
      score: 1 / (1 + r.distance),
    }))
  }

  async remove(ids: string[]): Promise<void> {
    const stmt = this.db.prepare(`DELETE FROM chunk_embeddings WHERE id = ?`)
    const tx = this.db.transaction((list: string[]) => {
      for (const id of list) stmt.run(id)
    })
    tx(ids)
  }

  async close(): Promise<void> {
    /* shared db — do not close */
  }
}

class SqliteVecBackend implements VectorBackend {
  readonly name = 'sqlite-vec' as const
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(
    private db: any,
    readonly dim: number,
  ) {}

  async upsert(rows: VectorUpsert[]): Promise<void> {
    const del = this.db.prepare(`DELETE FROM chunk_embeddings WHERE id = ?`)
    const stmt = this.db.prepare(
      `INSERT INTO chunk_embeddings(id, embedding) VALUES (?, ?)`,
    )
    const tx = this.db.transaction((items: VectorUpsert[]) => {
      for (const row of items) {
        del.run(row.id)
        stmt.run(row.id, JSON.stringify(row.embedding))
      }
    })
    tx(rows)
  }

  async knn(query: number[], k: number): Promise<VectorHit[]> {
    const rows = this.db
      .prepare(
        `SELECT id, distance FROM chunk_embeddings
         WHERE embedding MATCH ?
         ORDER BY distance
         LIMIT ?`,
      )
      .all(JSON.stringify(query), k)
    return rows.map((r: { id: string; distance: number }) => ({
      id: r.id,
      score: 1 / (1 + r.distance),
    }))
  }

  async remove(ids: string[]): Promise<void> {
    const stmt = this.db.prepare(`DELETE FROM chunk_embeddings WHERE id = ?`)
    const tx = this.db.transaction((list: string[]) => {
      for (const id of list) stmt.run(id)
    })
    tx(ids)
  }

  async close(): Promise<void> {
    this.db.close()
  }
}

class LanceBackend implements VectorBackend {
  readonly name = 'lance' as const
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private constructor(
    private table: any,
    readonly dim: number,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async create(db: any, dim: number): Promise<LanceBackend> {
    const names = await db.tableNames()
    let table
    if (names.includes('chunk_embeddings')) {
      table = await db.openTable('chunk_embeddings')
    } else {
      table = await db.createTable('chunk_embeddings', [
        { id: '__init__', vector: Array(dim).fill(0) },
      ])
      await table.delete('id = "__init__"')
    }
    return new LanceBackend(table, dim)
  }

  async upsert(rows: VectorUpsert[]): Promise<void> {
    await this.table.add(rows.map((r) => ({ id: r.id, vector: r.embedding })))
  }

  async knn(query: number[], k: number): Promise<VectorHit[]> {
    const res = await this.table.vectorSearch(query).limit(k).toArray()
    return res.map((r: { id: string; _distance?: number }) => ({
      id: r.id,
      score: 1 / (1 + (r._distance ?? 0)),
    }))
  }

  async remove(_ids: string[]): Promise<void> {
    /* lance delete optional for MVP */
  }

  async close(): Promise<void> {
    /* lance connection GC */
  }
}

/**
 * Prefer loading sqlite-vec on the shared app Db when `db` is provided.
 * Otherwise open a separate connection (smoke / legacy).
 */
export async function createVectorBackend(opts: {
  dim: number
  dbPath?: string
  lanceDir?: string
  /** Existing better-sqlite3 connection — preferred for MVP */
  db?: Db
}): Promise<VectorBackend> {
  if (opts.db) {
    const shared = await SqliteVecOnDb.tryLoad(opts.db, opts.dim)
    if (shared) return shared
  }

  try {
    const sqliteVec = await import('sqlite-vec')
    const Database = (await import('better-sqlite3')).default
    if (!opts.dbPath) throw new Error('dbPath required for sqlite-vec')
    const db = new Database(opts.dbPath)
    sqliteVec.load(db)
    db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS chunk_embeddings USING vec0(
        id TEXT PRIMARY KEY,
        embedding FLOAT[${opts.dim}]
      )`,
    )
    console.log('[vector] using sqlite-vec (own connection)')
    return new SqliteVecBackend(db, opts.dim)
  } catch (err) {
    console.warn('[vector] sqlite-vec unavailable:', (err as Error).message)
  }

  try {
    const req = createRequire(import.meta.url)
    const lancedb = req('@lancedb/lancedb') as { connect: (dir: string) => Promise<any> }
    if (!opts.lanceDir) throw new Error('lanceDir required')
    const db = await lancedb.connect(opts.lanceDir)
    console.log('[vector] using lance')
    return await LanceBackend.create(db, opts.dim)
  } catch (err) {
    console.warn('[vector] lance unavailable:', (err as Error).message)
  }

  console.warn('[vector] falling back to memory backend')
  return new MemoryVectorBackend(opts.dim)
}
