import { useCallback, useEffect, useRef, useState } from 'react'
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
  tags_json?: string
  open_count?: number
  last_opened_at?: number | null
  home_pin?: number
}

type Props = {
  onBack: () => void
  onToast?: (msg: string) => void
  refreshSignal?: number
}

export default function AllKnowledgePage({ onBack, onToast, refreshSignal = 0 }: Props) {
  const [items, setItems] = useState<Item[]>([])
  const [query, setQuery] = useState('')
  const [searchHits, setSearchHits] = useState<Item[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDraft, setModalDraft] = useState<KnowledgeEditDraft>({
    title: '',
    body: '',
    tags: '',
  })
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const list = (await window.api.knowledgeList({ limit: 100 })) as Item[]
      setItems(list)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    if (refreshSignal > 0) void loadList()
  }, [refreshSignal, loadList])

  useEffect(() => {
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
          const res = await window.api.knowledgeSearch({ query: q, topK: 40 })
          setSearchHits(
            res.items.map((h: any) => ({
              id: h.id,
              title: h.title,
              body: h.snippet || h.body || '',
              source_type: h.source_type || '',
              embed_status: h.embed_status || '',
              created_at: h.created_at || 0,
              updated_at: h.updated_at || 0,
              tags_json: h.tags_json,
            })),
          )
        } catch {
          setSearchHits([])
        } finally {
          setSearchLoading(false)
        }
      })()
    }, 180)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const showingSearch = query.trim().length > 0
  const rows = showingSearch ? searchHits : items

  function openEdit(it: Item) {
    setModalDraft({
      id: it.id,
      title: it.title || '',
      body: it.body || '',
      tags: tagsToString(it.tags_json),
    })
    // For search hits body may be snippet — load full
    if (showingSearch || !it.body || it.body.length < 40) {
      void (async () => {
        const full = (await window.api.knowledgeGet({ id: it.id })) as Item | null
        if (full) {
          setModalDraft({
            id: full.id,
            title: full.title || '',
            body: full.body || '',
            tags: tagsToString(full.tags_json),
          })
        }
      })()
    }
    setModalOpen(true)
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
      setModalOpen(false)
      await loadList()
    } catch (err) {
      onToast?.(`失败: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  async function openItem(id: string) {
    await window.api.knowledgeRecordOpen?.({ id })
    const full = (await window.api.knowledgeGet({ id })) as Item | null
    if (full) openEdit(full)
  }

  return (
    <div className="relative mx-auto flex h-full max-w-3xl flex-col overflow-hidden px-6 pb-4 pt-5">
      <div className="mb-4 flex items-center gap-2">
        <button type="button" className="kd-btn kd-btn-ghost shrink-0" onClick={onBack}>
          ← 返回
        </button>
        <h2 className="text-sm font-semibold">全部知识</h2>
        <div className="min-w-0 flex-1">
          <input
            className="kd-input w-full !py-2 text-sm"
            placeholder="在全部知识中搜索…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="kd-btn kd-btn-primary shrink-0"
          onClick={() => {
            setModalDraft({ title: '', body: '', tags: '' })
            setModalOpen(true)
          }}
        >
          + 新建
        </button>
      </div>

      <div className="mb-2 flex items-center justify-between px-0.5">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {showingSearch
            ? searchLoading
              ? '搜索中…'
              : `${rows.length} 条结果`
            : loading
              ? '加载中…'
              : `${items.length} 条`}
        </span>
      </div>

      <ul className="min-h-0 flex-1 space-y-1.5 overflow-auto pr-1">
        {showingSearch && searchLoading && rows.length === 0 && (
          <li className="px-3 py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            正在搜索…
          </li>
        )}
        {rows.map((it) => (
          <li
            key={it.id}
            className="group relative"
            onMouseEnter={() => setHoverId(it.id)}
            onMouseLeave={() => setHoverId(null)}
          >
            <button
              type="button"
              onClick={() => void openItem(it.id)}
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
                {(it.body || '').replace(/\s+/g, ' ').slice(0, 100)}
              </p>
            </button>
            {hoverId === it.id && (
              <div
                className="absolute right-2 top-2 flex gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="kd-btn kd-btn-ghost !px-2 !py-1 text-[11px]"
                  onClick={() => openEdit(it)}
                >
                  编辑
                </button>
              </div>
            )}
          </li>
        ))}
        {!loading && !searchLoading && rows.length === 0 && (
          <li className="px-3 py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            {showingSearch ? '无匹配结果' : '暂无知识'}
          </li>
        )}
      </ul>

      <KnowledgeEditModal
        open={modalOpen}
        draft={modalDraft}
        saving={saving}
        heading={modalDraft.id ? '编辑知识' : '新建知识'}
        onChange={setModalDraft}
        onSave={() => void saveModal()}
        onCancel={() => {
          if (!saving) setModalOpen(false)
        }}
      />
    </div>
  )
}
