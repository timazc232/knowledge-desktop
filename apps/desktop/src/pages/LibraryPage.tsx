import { useCallback, useEffect, useRef, useState } from 'react'

type Item = {
  id: string
  title: string | null
  body: string
  source_type: string
  embed_status: string
  created_at: number
  source_url: string | null
  snippet?: string
  score?: number
}

export default function LibraryPage() {
  const [query, setQuery] = useState('')
  const [body, setBody] = useState('')
  const [title, setTitle] = useState('')
  const [showTitle, setShowTitle] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [mode, setMode] = useState('')
  const [selected, setSelected] = useState<Item | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadRecent = useCallback(async () => {
    setLoading(true)
    try {
      const list = (await window.api.knowledgeList({ limit: 40 })) as Item[]
      setItems(list)
      setMode('recent')
    } finally {
      setLoading(false)
    }
  }, [])

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      await loadRecent()
      return
    }
    setLoading(true)
    try {
      const res = await window.api.knowledgeSearch({ query: q, topK: 30 })
      setItems(
        res.items.map((h: any) => ({
          id: h.id,
          title: h.title,
          body: h.snippet || '',
          snippet: h.snippet,
          source_type: h.source_type,
          embed_status: h.embed_status,
          created_at: h.created_at ?? 0,
          source_url: h.source_url ?? null,
          score: h.score,
        })),
      )
      setMode(res.mode)
    } catch (err) {
      setMode(`error: ${(err as Error).message}`)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [loadRecent])

  useEffect(() => {
    void loadRecent()
    const unsub = window.api.onIngestProgress(() => {
      if (!query.trim()) void loadRecent()
    })
    return unsub
  }, [loadRecent, query])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void runSearch(query)
    }, 280)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, runSearch])

  async function save() {
    if (!body.trim()) {
      setStatus('请输入内容')
      return
    }
    setSaving(true)
    try {
      const item = await window.api.knowledgeCreate({
        title: title.trim() || undefined,
        body,
        source_type: 'manual',
      })
      setStatus(`已保存 · ${item.id.slice(0, 8)}…`)
      setBody('')
      setTitle('')
      setShowTitle(false)
      if (!query.trim()) await loadRecent()
    } catch (err) {
      setStatus(`失败: ${(err as Error).message}`)
    } finally {
      setSaving(false)
      setTimeout(() => setStatus(''), 2500)
    }
  }

  async function openDetail(id: string) {
    const full = (await window.api.knowledgeGet({ id })) as Item | null
    if (full) setSelected(full)
  }

  async function remove(id: string) {
    if (!confirm('确认删除这条知识？')) return
    await window.api.knowledgeDelete({ id })
    if (selected?.id === id) setSelected(null)
    await runSearch(query)
  }

  return (
    <div className="relative mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-hidden p-6">
      {/* Search */}
      <input
        className="kd-input"
        placeholder="搜索知识…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {/* Compose */}
      <div className="kd-card flex flex-col gap-3 p-4">
        {showTitle ? (
          <input
            className="kd-input"
            placeholder="标题（可选）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="self-start text-xs"
            style={{ color: 'var(--text-muted)' }}
            onClick={() => setShowTitle(true)}
          >
            + 添加标题
          </button>
        )}
        <textarea
          className="kd-input min-h-[140px] resize-y leading-relaxed"
          placeholder="粘贴或输入内容，保存入库…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="kd-btn kd-btn-primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? '保存中…' : '保存'}
          </button>
          {status && (
            <span className="text-xs" style={{ color: 'var(--success)' }}>
              {status}
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            {query.trim()
              ? mode === 'hybrid'
                ? '混合检索'
                : mode === 'fts_only'
                  ? '关键词'
                  : '搜索结果'
              : '最近'}
            {loading ? ' · …' : ''}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
            {items.length} 条
          </span>
        </div>
        <ul className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => void openDetail(it.id)}
                className="kd-card w-full px-3.5 py-3 text-left transition hover:brightness-110"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{it.title || '无标题'}</span>
                  <span className="shrink-0 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {it.score != null ? it.score.toFixed(3) : it.source_type}
                  </span>
                </div>
                <p
                  className="mt-1 line-clamp-2 text-xs leading-relaxed"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {it.snippet || it.body}
                </p>
              </button>
            </li>
          ))}
          {!loading && items.length === 0 && (
            <li className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              {query.trim() ? '无结果' : '暂无条目，先写一条吧'}
            </li>
          )}
        </ul>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="absolute inset-0 z-20 flex justify-end bg-black/40 backdrop-blur-[2px]">
          <div
            className="flex h-full w-full max-w-lg flex-col overflow-hidden p-5"
            style={{ background: 'var(--surface)' }}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold">{selected.title || '无标题'}</h3>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {selected.source_type} · {selected.embed_status}
                  {selected.source_url ? ` · ${selected.source_url}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="kd-btn kd-btn-ghost"
                onClick={() => setSelected(null)}
              >
                关闭
              </button>
            </div>
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                className="kd-btn kd-btn-ghost"
                onClick={() => void window.api.knowledgeRetryEmbed({ id: selected.id })}
              >
                重试嵌入
              </button>
              <button
                type="button"
                className="kd-btn kd-btn-danger"
                onClick={() => void remove(selected.id)}
              >
                删除
              </button>
            </div>
            <pre
              className="kd-card min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 text-sm leading-relaxed"
              style={{ color: 'var(--text)' }}
            >
              {selected.body}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
