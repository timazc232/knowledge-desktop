import { useCallback, useEffect, useState } from 'react'

type Item = {
  id: string
  title: string | null
  body: string
  source_type: string
  embed_status: string
  created_at: number
  source_url: string | null
}

export default function BrowsePage() {
  const [items, setItems] = useState<Item[]>([])
  const [selected, setSelected] = useState<Item | null>(null)

  const refresh = useCallback(async () => {
    const list = await window.api.knowledgeList({ limit: 100 })
    setItems(list as Item[])
  }, [])

  useEffect(() => {
    void refresh()
    const unsub = window.api.onIngestProgress(() => {
      void refresh()
    })
    return unsub
  }, [refresh])

  async function remove(id: string) {
    if (!confirm('确认删除这条知识？')) return
    await window.api.knowledgeDelete({ id })
    if (selected?.id === id) setSelected(null)
    await refresh()
  }

  return (
    <div className="flex h-full">
      <div className="w-80 shrink-0 overflow-auto border-r border-white/10">
        <div className="sticky top-0 flex items-center justify-between bg-[#0f1115]/95 px-3 py-2 backdrop-blur">
          <h2 className="text-sm font-semibold">全部知识</h2>
          <button
            type="button"
            className="text-xs text-emerald-400 hover:underline"
            onClick={() => void refresh()}
          >
            刷新
          </button>
        </div>
        <ul>
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => setSelected(it)}
                className={`block w-full border-b border-white/5 px-3 py-2.5 text-left text-sm hover:bg-white/5 ${
                  selected?.id === it.id ? 'bg-white/10' : ''
                }`}
              >
                <div className="truncate font-medium text-white/85">
                  {it.title || '无标题'}
                </div>
                <div className="mt-0.5 flex gap-2 text-[10px] text-white/35">
                  <span>{it.source_type}</span>
                  <span>{it.embed_status}</span>
                  <span>{new Date(it.created_at).toLocaleString()}</span>
                </div>
              </button>
            </li>
          ))}
          {items.length === 0 && (
            <li className="p-4 text-sm text-white/40">暂无条目</li>
          )}
        </ul>
      </div>
      <div className="flex flex-1 flex-col overflow-auto p-6">
        {selected ? (
          <>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">{selected.title}</h3>
                <p className="mt-1 text-xs text-white/40">
                  {selected.source_type} · {selected.embed_status}
                  {selected.source_url ? ` · ${selected.source_url}` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded border border-white/15 px-2 py-1 text-xs hover:bg-white/5"
                  onClick={() =>
                    void window.api.knowledgeRetryEmbed({ id: selected.id })
                  }
                >
                  重试嵌入
                </button>
                <button
                  type="button"
                  className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                  onClick={() => void remove(selected.id)}
                >
                  删除
                </button>
              </div>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-white/80">
              {selected.body}
            </pre>
          </>
        ) : (
          <p className="m-auto text-sm text-white/40">选择左侧条目查看详情</p>
        )}
      </div>
    </div>
  )
}
