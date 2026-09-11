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
 * Try sqlite-vec, then @lancedb/lancedb, else memory.
 * Native modules may fail on some CI/Windows toolchains — memory keeps M0 unblocked.
 */
export async function createVectorBackend(opts: {
  dim: number
  dbPath?: string
  lanceDir?: string
}): Promise<VectorBackend> {
  // Attempt sqlite-vec dynamically
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sqliteVec = (await import('sqlite-vec')) as any
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
    console.log('[vector] using sqlite-vec')
    return new SqliteVecBackend(db, opts.dim)
  } catch (err) {
    console.warn('[vector] sqlite-vec unavailable:', (err as Error).message)
  }

  try {
    const lancedb = await import('@lancedb/lancedb')
    if (!opts.lanceDir) throw new Error('lanceDir required')
    const db = await lancedb.connect(opts.lanceDir)
    console.log('[vector] using lance')
    return await LanceBackend.create(db, opts.dim)
  } catch (err) {
    console.warn('[vector] lance unavailable:', (err as Error).message)
  }

  console.warn('[vector] falling back to memory backend (M0 smoke only)')
  return new MemoryVectorBackend(opts.dim)
}

class SqliteVecBackend implements VectorBackend {
  readonly name = 'sqlite-vec' as const
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(
    private db: any,
    readonly dim: number,
  ) {}

  async upsert(rows: VectorUpsert[]): Promise<void> {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO chunk_embeddings(id, embedding) VALUES (?, ?)`,
    )
    const tx = this.db.transaction((items: VectorUpsert[]) => {
      for (const row of items) {
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

  async close(): Promise<void> {
    /* lance connection GC */
  }
}
