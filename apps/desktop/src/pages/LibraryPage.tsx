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

type Props = {
  openItemId?: string | null
  onOpenItemConsumed?: () => void
  expandComposeSignal?: number
}

export default function LibraryPage({
  openItemId,
  onOpenItemConsumed,
  expandComposeSignal = 0,
}: Props) {
  const [body, setBody] = useState('')
  const [title, setTitle] = useState('')
  const [showTitle, setShowTitle] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [selected, setSelected] = useState<Item | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const composeCardRef = useRef<HTMLDivElement>(null)

  const loadRecent = useCallback(async () => {
    setLoading(true)
    try {
      const list = (await window.api.knowledgeList({ limit: 40 })) as Item[]
      setItems(list)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRecent()
    const unsub = window.api.onIngestProgress(() => {
      void loadRecent()
    })
    return unsub
  }, [loadRecent])

  useEffect(() => {
    if (expandComposeSignal > 0) {
      setComposeOpen(true)
      requestAnimationFrame(() => bodyRef.current?.focus())
    }
  }, [expandComposeSignal])

  useEffect(() => {
    if (!openItemId) return
    void (async () => {
      const full = (await window.api.knowledgeGet({ id: openItemId })) as Item | null
      if (full) setSelected(full)
      onOpenItemConsumed?.()
    })()
  }, [openItemId, onOpenItemConsumed])

  useEffect(() => {
    if (!composeOpen) return
    function onDocMouseDown(e: MouseEvent) {
      const el = composeCardRef.current
      if (!el) return
      if (!el.contains(e.target as Node) && !body.trim() && !title.trim()) {
        setComposeOpen(false)
        setShowTitle(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [composeOpen, body, title])

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
      setComposeOpen(false)
      await loadRecent()
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
    await loadRecent()
  }

  async function copyItem(it: Item) {
    const text = [it.title, it.body].filter(Boolean).join('\n\n')
    try {
      await navigator.clipboard.writeText(text || it.body || '')
      setCopiedId(it.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      setStatus('复制失败')
      setTimeout(() => setStatus(''), 2000)
    }
  }

  function openCompose() {
    setComposeOpen(true)
    requestAnimationFrame(() => bodyRef.current?.focus())
  }

  return (
    <div className="relative mx-auto flex h-full max-w-3xl flex-col overflow-hidden px-6 pb-4 pt-5">
      {/* Recent list — default main area */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            最近{loading ? ' · …' : ''}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
            {items.length} 条
          </span>
        </div>
        <ul className="min-h-0 flex-1 space-y-2 overflow-auto pr-1 pb-20">
          {items.map((it) => (
            <li
              key={it.id}
              className="group relative"
              onMouseEnter={() => setHoverId(it.id)}
              onMouseLeave={() => setHoverId(null)}
            >
              <button
                type="button"
                onClick={() => void openDetail(it.id)}
                className="kd-card w-full px-3.5 py-3 text-left transition hover:brightness-110"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{it.title || '无标题'}</span>
                  <span className="shrink-0 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {it.source_type}
                  </span>
                </div>
                <p
                  className="mt-1 line-clamp-2 text-xs leading-relaxed"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {it.snippet || it.body}
                </p>
              </button>
              {(hoverId === it.id || copiedId === it.id) && (
                <div
                  className="absolute right-2 top-2 flex gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="kd-btn kd-btn-ghost !px-2 !py-1 text-[11px]"
                    onClick={() => void openDetail(it.id)}
                  >
                    打开
                  </button>
                  <button
                    type="button"
                    className="kd-btn kd-btn-ghost !px-2 !py-1 text-[11px]"
                    onClick={() => void copyItem(it)}
                  >
                    {copiedId === it.id ? '已复制' : '复制'}
                  </button>
                </div>
              )}
            </li>
          ))}
          {!loading && items.length === 0 && (
            <li
              className="kd-card flex flex-col items-center gap-3 px-6 py-10 text-center"
              style={{ color: 'var(--text-muted)' }}
            >
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                还没有知识条目
              </p>
              <p className="text-xs leading-relaxed">
                按{' '}
                <kbd className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'var(--surface)' }}>
                  Ctrl+N
                </kbd>{' '}
                快速录入，或{' '}
                <kbd className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'var(--surface)' }}>
                  Ctrl+Shift+S
                </kbd>{' '}
                从剪贴板快录。
                <br />
                用{' '}
                <kbd className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'var(--surface)' }}>
                  Ctrl+K
                </kbd>{' '}
                搜索知识与钉选。
              </p>
              <button type="button" className="kd-btn kd-btn-primary mt-1" onClick={openCompose}>
                + 快速录入
              </button>
            </li>
          )}
        </ul>
      </div>

      {/* Bottom compose bar / expanded card */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-4 pt-2" style={{ background: 'linear-gradient(transparent, var(--bg) 28%)' }}>
        {!composeOpen ? (
          <button
            type="button"
            onClick={openCompose}
            className="kd-card flex w-full items-center gap-2 px-4 py-3 text-left text-sm transition hover:brightness-110"
            style={{ color: 'var(--text-muted)' }}
          >
            <span
              className="flex h-6 w-6 items-center justify-center rounded-lg text-sm"
              style={{ background: 'var(--accent-bg)', color: 'var(--accent-soft)' }}
            >
              +
            </span>
            快速录入
            <span className="ml-auto text-[10px] opacity-60">Ctrl+N</span>
          </button>
        ) : (
          <div ref={composeCardRef} className="kd-card flex flex-col gap-3 p-4 shadow-lg">
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
              ref={bodyRef}
              className="kd-input min-h-[120px] resize-y leading-relaxed"
              placeholder="粘贴或输入内容，保存入库…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault()
                  void save()
                }
                if (e.key === 'Escape' && !body.trim() && !title.trim()) {
                  setComposeOpen(false)
                }
              }}
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
              <button
                type="button"
                className="kd-btn kd-btn-ghost"
                onClick={() => {
                  if (!body.trim() && !title.trim()) {
                    setComposeOpen(false)
                    setShowTitle(false)
                  } else if (confirm('放弃当前内容？')) {
                    setBody('')
                    setTitle('')
                    setShowTitle(false)
                    setComposeOpen(false)
                  }
                }}
              >
                取消
              </button>
              {status && (
                <span className="text-xs" style={{ color: 'var(--success)' }}>
                  {status}
                </span>
              )}
            </div>
          </div>
        )}
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
