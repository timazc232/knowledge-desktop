import { useCallback, useEffect, useRef, useState } from 'react'

type Tab = {
  id: string
  title: string | null
  url: string
  active: boolean
  sleeping: boolean
  pinned: boolean
}

type Bookmark = { id: string; title: string; url: string }

export default function BrowserPage() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [address, setAddress] = useState('')
  const viewportRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    const list = (await window.api.tabsList()) as Tab[]
    setTabs(list)
    const active = list.find((t) => t.active)
    if (active) setAddress(active.url)
  }, [])

  const sendBounds = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    void window.api.tabsSetBounds({
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
    })
  }, [])

  useEffect(() => {
    void (async () => {
      await refresh()
      const bms = (await window.api.bookmarksList()) as Bookmark[]
      setBookmarks(bms)
      let list = (await window.api.tabsList()) as Tab[]
      if (list.length === 0) {
        await window.api.tabsCreate({ url: 'https://www.google.com' })
        list = (await window.api.tabsList()) as Tab[]
      }
      setTabs(list)
      void window.api.tabsShow()
      // delay for layout
      requestAnimationFrame(() => sendBounds())
    })()

    const unsub = window.api.onTabUpdated((ev) => {
      const t = ev as Tab
      setTabs((prev) => {
        const i = prev.findIndex((x) => x.id === t.id)
        if (i < 0) return prev
        const next = [...prev]
        next[i] = t
        return next
      })
      if (t.active) setAddress(t.url)
    })

    const onResize = () => sendBounds()
    window.addEventListener('resize', onResize)

    return () => {
      unsub()
      window.removeEventListener('resize', onResize)
      void window.api.tabsHide()
    }
  }, [refresh, sendBounds])

  useEffect(() => {
    sendBounds()
  }, [tabs, sendBounds])

  const active = tabs.find((t) => t.active)

  async function activate(id: string) {
    await window.api.tabsActivate({ id })
    await refresh()
    sendBounds()
  }

  async function navigate() {
    if (!active) return
    await window.api.tabsNavigate({ id: active.id, url: address })
    await refresh()
  }

  return (
    <div className="flex h-full flex-col">
      {/* bookmarks bar */}
      <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-2 py-1">
        {bookmarks.map((b) => (
          <button
            key={b.id}
            type="button"
            className="shrink-0 rounded px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
            onClick={() =>
              void (async () => {
                if (active) {
                  await window.api.tabsNavigate({ id: active.id, url: b.url })
                } else {
                  await window.api.tabsCreate({ url: b.url })
                }
                await refresh()
                sendBounds()
              })()
            }
          >
            {b.title}
          </button>
        ))}
      </div>

      {/* tab strip */}
      <div className="flex items-center gap-1 border-b border-white/10 bg-[#12151c] px-1 py-1">
        <div className="flex flex-1 gap-0.5 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => void activate(t.id)}
              className={`group flex max-w-[180px] items-center gap-1 rounded-t px-2 py-1.5 text-xs ${
                t.active ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5'
              }`}
            >
              <span className="truncate">
                {t.sleeping ? '💤 ' : ''}
                {t.title || t.url}
              </span>
              <span
                role="button"
                tabIndex={0}
                className="ml-1 hidden rounded px-1 text-white/40 hover:bg-white/20 group-hover:inline"
                onClick={(e) => {
                  e.stopPropagation()
                  void window.api.tabsClose({ id: t.id }).then(refresh)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation()
                    void window.api.tabsClose({ id: t.id }).then(refresh)
                  }
                }}
              >
                ×
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="rounded px-2 py-1 text-sm text-white/60 hover:bg-white/10"
          onClick={() =>
            void window.api.tabsCreate({}).then(() => {
              void refresh()
              sendBounds()
            })
          }
        >
          +
        </button>
      </div>

      {/* address bar */}
      <div className="flex items-center gap-1 border-b border-white/10 px-2 py-1.5">
        <button
          type="button"
          className="rounded px-2 py-1 text-xs text-white/50 hover:bg-white/10"
          onClick={() => active && void window.api.tabsBack({ id: active.id })}
        >
          ←
        </button>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs text-white/50 hover:bg-white/10"
          onClick={() => active && void window.api.tabsForward({ id: active.id })}
        >
          →
        </button>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs text-white/50 hover:bg-white/10"
          onClick={() => active && void window.api.tabsReload({ id: active.id })}
        >
          ↻
        </button>
        <input
          className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs outline-none focus:border-emerald-500/40"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void navigate()
          }}
        />
        <button
          type="button"
          className="rounded bg-emerald-700/80 px-3 py-1 text-xs text-white hover:bg-emerald-600"
          onClick={() => void navigate()}
        >
          前往
        </button>
      </div>

      {/* WebContentsView hosts here — leave empty placeholder */}
      <div
        id="browser-viewport"
        ref={viewportRef}
        className="relative min-h-0 flex-1 bg-[#0a0c10]"
      >
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-white/20">
          浏览器视图由主进程 WebContentsView 渲染
        </div>
      </div>
    </div>
  )
}
