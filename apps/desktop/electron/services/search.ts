import type { Db } from '../db/index'
import type { VectorBackend } from '../ingest/vector-backend'
import { embedTexts } from '../ingest/embedder'
import { getEmbedSettings } from './settings'
import { ftsSearch, getItem, type KnowledgeItem } from './knowledge'

export type SearchHit = {
  id: string
  title: string | null
  body: string
  source_url: string | null
  source_type: string
  score: number
  snippet: string
  embed_status: string
}

function snippet(body: string, query: string, max = 160): string {
  const q = query.trim().slice(0, 40)
  const idx = q ? body.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (idx < 0) {
    return body.slice(0, max) + (body.length > max ? '…' : '')
  }
  const start = Math.max(0, idx - 40)
  const end = Math.min(body.length, idx + q.length + 80)
  return (
    (start > 0 ? '…' : '') +
    body.slice(start, end) +
    (end < body.length ? '…' : '')
  )
}

/** Reciprocal Rank Fusion merge */
function rrfMerge(
  rankedLists: { id: string; rank: number }[][],
  k = 60,
): Map<string, number> {
  const scores = new Map<string, number>()
  for (const list of rankedLists) {
    for (const { id, rank } of list) {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank))
    }
  }
  return scores
}

export async function hybridSearch(
  db: Db,
  vectors: VectorBackend | null,
  query: string,
  topK = 20,
): Promise<{ items: SearchHit[]; mode: 'hybrid' | 'fts_only' }> {
  const q = query.trim()
  if (!q) return { items: [], mode: 'fts_only' }

  const ftsRows = ftsSearch(db, q, topK) as (KnowledgeItem & { rank?: number })[]
  const ftsRanked = ftsRows.map((r, i) => ({ id: r.id, rank: i + 1 }))

  const settings = getEmbedSettings(db)
  let mode: 'hybrid' | 'fts_only' = 'fts_only'
  let vecRanked: { id: string; rank: number }[] = []

  if (vectors && settings.apiKey) {
    try {
      const [emb] = await embedTexts([q], settings)
      if (emb) {
        const hits = await vectors.knn(emb, topK)
        // Map chunk ids → item ids
        const chunkIds = hits.map((h) => h.id)
        const itemByChunk = new Map<string, string>()
        if (chunkIds.length) {
          const placeholders = chunkIds.map(() => '?').join(',')
          const rows = db
            .prepare(
              `SELECT id, item_id FROM knowledge_chunks WHERE id IN (${placeholders})`,
            )
            .all(...chunkIds) as { id: string; item_id: string }[]
          for (const r of rows) itemByChunk.set(r.id, r.item_id)
        }
        const seen = new Set<string>()
        let rank = 0
        for (const h of hits) {
          const itemId = itemByChunk.get(h.id)
          if (!itemId || seen.has(itemId)) continue
          seen.add(itemId)
          rank += 1
          vecRanked.push({ id: itemId, rank })
        }
        mode = 'hybrid'
      }
    } catch (err) {
      console.warn('[search] vector path failed, FTS only:', (err as Error).message)
    }
  }

  const lists = [ftsRanked]
  if (vecRanked.length) lists.push(vecRanked)
  const merged = rrfMerge(lists)
  const sorted = [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK)

  const items: SearchHit[] = []
  for (const [id, score] of sorted) {
    const item = getItem(db, id)
    if (!item) continue
    items.push({
      id: item.id,
      title: item.title,
      body: item.body,
      source_url: item.source_url,
      source_type: item.source_type,
      score,
      snippet: snippet(item.body, q),
      embed_status: item.embed_status,
    })
  }
  return { items, mode }
}
