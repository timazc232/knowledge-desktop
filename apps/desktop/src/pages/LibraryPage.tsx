import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import KnowledgeEditModal, {
  parseTags,
  tagsToString,
  type KnowledgeEditDraft,
} from '../components/KnowledgeEditModal'

type Item = {
  id: string
  title: string | null
  body: string
  source_type: string
  embed_status: string
  created_at: number
  updated_at: number
  source_url: string | null
  tags_json?: string
  snippet?: string
  score?: number
  open_count?: number
  last_opened_at?: number | null
  home_pin?: number
}

type SearchHit = {
  id: string
  title: string | null
  snippet: string
  score?: number
}

type Props = {
  refreshSignal?: number
  onToast?: (msg: string) => void
  onGoAll?: () => void
  modalExternal?: KnowledgeEditDraft | null
  onModalExternalConsumed?: () => void
}

function formatRelative(ts: number | null | undefined): string {
  if (!ts) return '未打开'
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return new Date(ts).toLocaleDateString()
}

function snippetOf(it: Item): string {
  if (it.snippet) return it.snippet
  try {
    const tags = JSON.parse(it.tags_json || '[]') as string[]
    if (Array.isArray(tags) && tags.length) return tags.join(' · ')
  } catch {
    /* ignore */
  }
  return (it.body || '').replace(/\s+/g, ' ').slice(0, 80)
}

export default function LibraryPage({
  refreshSignal = 0,
  onToast,
  onGoAll,
  modalExternal,
  onModalExternalConsumed,
}: Props) {
  const [query, setQuery] = useState('')
  const [topItems, setTopItems] = useState<Item[]>([])
  const [searchHits, setSearchHits] = useState<SearchHit[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Item | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDraft, setModalDraft] = useState<KnowledgeEditDraft>({
    title: '',
    body: '',
    tags: '',
  })
  const [saving, setSaving] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadTop = useCallback(async () => {
    setLoading(true)
    try {
      const list = (await window.api.knowledgeListTop({ limit: 10 })) as Item[]
      setTopItems(list)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTop()
    const unsub = window.api.onIngestProgress(() => {
      void loadTop()
    })
    return unsub
  }, [loadTop])

  useEffect(() => {
    if (refreshSignal > 0) void loadTop()
  }, [refreshSignal, loadTop])

  // ⌘K / Ctrl+K focuses THIS search bar
  useEffect(() => {
    function onFocusSearch() {
      searchRef.current?.focus()
      searchRef.current?.select()
    }
    window.addEventListener('kd:focus-search', onFocusSearch)
    return () => window.removeEventListener('kd:focus-search', onFocusSearch)
  }, [])

  // External modal (clip / App-level new) — if parent routes clip here
  useEffect(() => {
    if (!modalExternal) return
    setModalDraft(modalExternal)
    setModalOpen(true)
    onModalExternalConsumed?.()
  }, [modalExternal, onModalExternalConsumed])

  // Esc closes detail (not while edit modal open)
  useEffect(() => {
    if (!selected || modalOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, modalOpen])

  // Search while typing
  useEffect(() => {
    let cancelled = false
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (!q) {
      setSearchHits([])
      setSearchLoading(false)
      return
    }
    setSearchLoading(true)
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const res = await window.api.knowledgeSearch({ query: q, topK: 20 })
          if (cancelled) return
          setSearchHits(
            res.items.map((h: any) => ({
              id: h.id,
              title: h.title,
              snippet: h.snippet || '',
              score: h.score,
            })),
          )
        } catch {
          if (!cancelled) setSearchHits([])
        } finally {
          if (!cancelled) setSearchLoading(false)
        }
      })()
    }, 300)
    return () => {
      cancelled = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const showingSearch = query.trim().length > 0
  const cmdHint = useMemo(
    () => (typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘K' : 'Ctrl+K'),
    [],
  )

  function openCreate() {
    setModalDraft({ title: '', body: '', tags: '' })
    setModalOpen(true)
  }

  function openEdit(it: Item) {
    setModalDraft({
      id: it.id,
      title: it.title || '',
      body: it.body || '',
      tags: tagsToString(it.tags_json),
    })
    setModalOpen(true)
  }

  async function openDetail(id: string) {
    await window.api.knowledgeRecordOpen?.({ id })
    const full = (await window.api.knowledgeGet({ id })) as Item | null
    if (full) setSelected(full)
    void loadTop()
  }

  async function saveModal() {
    if (!modalDraft.body.trim()) {
      onToast?.('请输入内容')
      return
    }
    setSaving(true)
    try {
      const tags = parseTags(modalDraft.tags)
      if (modalDraft.id) {
        await window.api.knowledgeUpdate({
          id: modalDraft.id,
          title: modalDraft.title.trim() || undefined,
          body: modalDraft.body,
          tags,
        })
        onToast?.('已更新')
      } else {
        await window.api.knowledgeCreate({
          title: modalDraft.title.trim() || undefined,
          body: modalDraft.body,
          source_type: 'manual',
          tags,
        })
        onToast?.('已保存')
      }
      const editedId = modalDraft.id
      setModalOpen(false)
      setModalDraft({ title: '', body: '', tags: '' })
      await loadTop()
      if (editedId && selected?.id === editedId) {
        const full = (await window.api.knowledgeGet({ id: editedId })) as Item | null
        if (full) setSelected(full)
      }
      if (showingSearch) {
        const q = query.trim()
        if (q) {
          try {
            const res = await window.api.knowledgeSearch({ query: q, topK: 20 })
            setSearchHits(
              res.items.map((h: any) => ({
                id: h.id,
                title: h.title,
                snippet: h.snippet || '',
                score: h.score,
              })),
            )
          } catch {
            /* keep old hits */
          }
        }
      }
    } catch (err) {
      onToast?.(`失败: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('确认删除这条知识？')) return
    await window.api.knowledgeDelete({ id })
    if (selected?.id === id) setSelected(null)
    await loadTop()
  }

  async function copyItem(it: Item) {
    const text = [it.title, it.body].filter(Boolean).join('\n\n')
    try {
      await navigator.clipboard.writeText(text || it.body || '')
      onToast?.('已复制')
    } catch {
      onToast?.('复制失败')
    }
  }

  async function togglePin(it: Item) {
    const cur = it.home_pin || 0
    if (cur > 0) {
      await window.api.knowledgeSetHomePin({ id: it.id, pin: 0 })
      onToast?.('已取消常用置顶')
    } else {
      // assign next free slot 1..3
      const used = new Set(topItems.filter((x) => (x.home_pin || 0) > 0).map((x) => x.home_pin!))
      let slot = 1
      while (slot <= 3 && used.has(slot)) slot++
      if (slot > 3) slot = 1
      await window.api.knowledgeSetHomePin({ id: it.id, pin: slot })
      onToast?.(`已置顶 #${slot}`)
    }
    await loadTop()
    if (selected?.id === it.id) {
      const full = (await window.api.knowledgeGet({ id: it.id })) as Item | null
      if (full) setSelected(full)
    }
  }

  return (
    <div className="relative mx-auto flex h-full max-w-3xl flex-col overflow-hidden px-6 pb-4 pt-5">
      {/* Top: search + actions */}
      <div className="mb-4 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            ⌕
          </span>
          <input
            ref={searchRef}
            className="kd-input kd-search-input w-full !py-2.5 text-sm"
            placeholder="搜索知识…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.preventDefault()
                setQuery('')
              }
            }}
          />
          <kbd
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[10px]"
            style={{ background: 'var(--control-bg)', color: 'var(--text-muted)' }}
          >
            {cmdHint}
          </kbd>
        </div>
        <button type="button" className="kd-btn kd-btn-primary shrink-0" onClick={openCreate}>
          + 新建
        </button>
        <button
          type="button"
          className="kd-btn kd-btn-ghost shrink-0"
          onClick={() => onGoAll?.()}
        >
          全部知识
        </button>
      </div>

      {/* Main: Top10 or search results */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            {showingSearch
              ? searchLoading
                ? '搜索中…'
                : `搜索结果 · ${searchHits.length}`
              : `常用 Top10${loading ? ' · …' : ''}`}
          </span>
          {!showingSearch && (
            <span className="text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
              置顶 &gt; 打开次数 &gt; 最近打开
            </span>
          )}
        </div>

        <ul className="min-h-0 flex-1 space-y-1.5 overflow-auto pr-1">
          {showingSearch && searchLoading && searchHits.length === 0 && (
            <li className="px-3 py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              正在搜索…
            </li>
          )}
          {!showingSearch &&
            topItems.map((it, idx) => (
              <li
                key={it.id}
                className="group relative"
                onMouseEnter={() => setHoverId(it.id)}
                onMouseLeave={() => setHoverId(null)}
              >
                <button
                  type="button"
                  onClick={() => void openDetail(it.id)}
                  className="kd-card flex w-full items-start gap-2 px-3.5 py-3 text-left transition hover:brightness-110"
                >
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold"
                    style={{
                      background: (it.home_pin || 0) > 0 ? 'var(--accent-bg)' : 'var(--surface)',
                      color: (it.home_pin || 0) > 0 ? 'var(--accent-soft)' : 'var(--text-muted)',
                    }}
                  >
                    {(it.home_pin || 0) > 0 ? '📌' : idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{it.title || '无标题'}</span>
                      <span className="shrink-0 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {it.open_count ?? 0} 次 · {formatRelative(it.last_opened_at)}
                      </span>
                    </div>
                    <p
                      className="mt-1 line-clamp-2 text-xs leading-relaxed"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {snippetOf(it)}
                    </p>
                  </div>
                </button>
                {hoverId === it.id && (
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
                      onClick={() => void openEdit(it)}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="kd-btn kd-btn-ghost !px-2 !py-1 text-[11px]"
                      onClick={() => void copyItem(it)}
                    >
                      复制
                    </button>
                  </div>
                )}
              </li>
            ))}

          {showingSearch &&
            searchHits.map((h) => (
              <li
                key={h.id}
                className="group relative"
                onMouseEnter={() => setHoverId(h.id)}
                onMouseLeave={() => setHoverId(null)}
              >
                <button
                  type="button"
                  onClick={() => void openDetail(h.id)}
                  className="kd-card flex w-full items-start gap-2 px-3.5 py-3 text-left transition hover:brightness-110"
                >
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px]"
                    style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}
                    aria-hidden
                  >
                    ⌕
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{h.title || '无标题'}</span>
                    </div>
                    <p
                      className="mt-1 line-clamp-2 text-xs leading-relaxed"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {h.snippet}
                    </p>
                  </div>
                </button>
                {hoverId === h.id && (
                  <div
                    className="absolute right-2 top-2 flex gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="kd-btn kd-btn-ghost !px-2 !py-1 text-[11px]"
                      onClick={() => void openDetail(h.id)}
                    >
                      打开
                    </button>
                    <button
                      type="button"
                      className="kd-btn kd-btn-ghost !px-2 !py-1 text-[11px]"
                      onClick={() => {
                        void (async () => {
                          const full = (await window.api.knowledgeGet({ id: h.id })) as Item | null
                          if (full) openEdit(full)
                        })()
                      }}
                    >
                      编辑
                    </button>
                  </div>
                )}
              </li>
            ))}

          {!loading && !showingSearch && topItems.length === 0 && (
            <li
              className="kd-card flex flex-col items-center gap-3 px-6 py-10 text-center"
              style={{ color: 'var(--text-muted)' }}
            >
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                还没有知识条目
              </p>
              <p className="text-xs leading-relaxed">
                点击「+ 新建」，或用{' '}
                <kbd
                  className="rounded px-1.5 py-0.5 text-[10px]"
                  style={{ background: 'var(--surface)' }}
                >
                  Ctrl+Shift+S
                </kbd>{' '}
                从剪贴板快录。
              </p>
              <button type="button" className="kd-btn kd-btn-primary mt-1" onClick={openCreate}>
                + 新建
              </button>
            </li>
          )}

          {showingSearch && !searchLoading && searchHits.length === 0 && (
            <li className="px-3 py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              无匹配结果
            </li>
          )}
        </ul>
      </div>

      <KnowledgeEditModal
        open={modalOpen}
        draft={modalDraft}
        saving={saving}
        heading={modalDraft.id ? '编辑知识' : '新建知识'}
        onChange={setModalDraft}
        onSave={() => void saveModal()}
        onCancel={() => {
          if (saving) return
          setModalOpen(false)
        }}
      />

      {/* Detail drawer: right rail + clickable mask */}
      {selected && (
        <div className="absolute inset-0 z-20 flex">
          <button
            type="button"
            className="min-w-0 flex-1 cursor-default border-0 bg-black/40 backdrop-blur-[2px]"
            aria-label="关闭详情"
            onClick={() => setSelected(null)}
          />
          <div
            className="flex h-full w-full max-w-[460px] flex-col overflow-hidden p-5 shadow-xl"
            style={{ background: 'var(--surface)', width: 'min(100%, 460px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold">{selected.title || '无标题'}</h3>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {selected.source_type} · {selected.embed_status}
                  {(selected.open_count ?? 0) > 0
                    ? ` · ${selected.open_count} 次打开`
                    : ''}
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
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="kd-btn kd-btn-ghost"
                onClick={() => {
                  openEdit(selected)
                }}
              >
                编辑
              </button>
              <button
                type="button"
                className="kd-btn kd-btn-ghost"
                onClick={() => void togglePin(selected)}
              >
                {(selected.home_pin || 0) > 0 ? '取消置顶' : '常用置顶'}
              </button>
              <button
                type="button"
                className="kd-btn kd-btn-ghost"
                onClick={() => void copyItem(selected)}
              >
                复制
              </button>
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
