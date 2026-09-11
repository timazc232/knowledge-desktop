import { useState } from 'react'

type Hit = {
  id: string
  title: string | null
  snippet: string
  score: number
  source_type: string
  embed_status: string
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [mode, setMode] = useState('')
  const [loading, setLoading] = useState(false)

  async function run() {
    if (!query.trim()) return
    setLoading(true)
    try {
      const res = await window.api.knowledgeSearch({ query, topK: 20 })
      setHits(res.items)
      setMode(res.mode)
    } catch (err) {
      setMode(`error: ${(err as Error).message}`)
      setHits([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 p-6">
      <h2 className="text-lg font-semibold">搜索</h2>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-500/50"
          placeholder="关键词或语义查询…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void run()
          }}
        />
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? '检索中…' : '搜索'}
        </button>
      </div>
      {mode && (
        <p className="text-xs text-white/40">
          模式: {mode === 'hybrid' ? '混合（FTS + 向量 RRF）' : mode === 'fts_only' ? '仅全文（未配置 Key 或向量不可用）' : mode}
        </p>
      )}
      <ul className="space-y-3 overflow-auto">
        {hits.map((h) => (
          <li
            key={h.id}
            className="rounded-lg border border-white/10 bg-white/[0.03] p-3"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-white/90">{h.title || '无标题'}</span>
              <span className="font-mono text-[10px] text-white/30">
                {h.score.toFixed(4)} · {h.source_type}
              </span>
            </div>
            <p className="mt-1 text-sm text-white/55">{h.snippet}</p>
          </li>
        ))}
        {!loading && hits.length === 0 && query && (
          <li className="text-sm text-white/40">无结果</li>
        )}
      </ul>
    </div>
  )
}
