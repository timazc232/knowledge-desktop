import { useCallback, useEffect, useRef, useState } from 'react'
import Favicon from '../components/Favicon'

type Tab = {
  id: string
  title: string | null
  url: string
  favicon: string | null
  active: boolean
  sleeping: boolean
  pinned: boolean
}

type Bookmark = { id: string; title: string; url: string }

type Props = {
  onPinsChange?: () => void | Promise<void>
  pinCount?: number
  onToast?: (msg: string) => void
  /** When true, keep WebContentsView hidden (e.g. clip modal open). */
  suspendView?: boolean
}

const MAX_PINS = 10

function shortTitle(t: Tab): string {
  const raw = (t.title || t.url || '').trim()
  if (raw.length <= 18) return raw
  return raw.slice(0, 16) + '…'
}

export default function BrowserPage({
  onPinsChange,
  pinCount = 0,
  onToast,
  suspendView = false,
}: Props) {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [address, setAddress] = useState('')
  const [pinMsg, setPinMsg] = useState('')
  const viewportRef = useRef<HTMLDivElement>(null)
  const suspendViewRef = useRef(suspendView)
  suspendViewRef.current = suspendView

  const refresh = useCallback(async () => {
    const list = (await window.api.tabsList()) as Tab[]
    setTabs(list)
    const active = list.find((t) => t.active)
    if (active) setAddress(active.url)
  }, [])

  const sendBounds = useCallback(() => {
    if (suspendViewRef.current) return
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
      // Never clear pinned tabs: only create a default tab when the session is empty
      let list = (await window.api.tabsList()) as Tab[]
      if (list.length === 0) {
        await window.api.tabsCreate({ url: 'https://www.google.com' })
        list = (await window.api.tabsList()) as Tab[]
      }
      setTabs(list)
      // Do not show native view while a modal (or other suspend) is active
      if (suspendViewRef.current) {
        void window.api.tabsHide()
      } else {
        void window.api.tabsShow()
        requestAnimationFrame(() => sendBounds())
      }
    })()

    const unsub = window.api.onTabUpdated((ev) => {
      const t = ev as Tab
      setTabs((prev) => {
        const i = prev.findIndex((x) => x.id === t.id)
        if (i < 0) return [...prev, t]
        const next = [...prev]
        next[i] = { ...next[i], ...t }
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

  // Suspend / resume WebContentsView when modal opens over browser
  useEffect(() => {
    if (suspendView) {
      void window.api.tabsHide()
      return
    }
    void window.api.tabsShow()
    requestAnimationFrame(() => sendBounds())
  }, [suspendView, sendBounds])

  useEffect(() => {
    sendBounds()
  }, [tabs, sendBounds])

  const active = tabs.find((t) => t.active)
  const pinnedCount =
    pinCount > 0 ? pinCount : tabs.filter((t) => t.pinned).length

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

  async function togglePin(tab: Tab) {
    if (!tab.pinned && pinnedCount >= MAX_PINS) {
      const msg = '最多钉选 10 个'
      setPinMsg(msg)
      onToast?.(msg)
      setTimeout(() => setPinMsg(''), 2500)
      return
    }
    const res = await window.api.tabsSetPinned({ id: tab.id, pinned: !tab.pinned })
    if (!res.ok) {
      const msg = res.error || '钉选失败'
      setPinMsg(msg)
      onToast?.(msg)
      setTimeout(() => setPinMsg(''), 2500)
      return
    }
    setPinMsg(tab.pinned ? '已取消钉选' : '已钉到侧栏')
    setTimeout(() => setPinMsg(''), 1800)
    await refresh()
    await onPinsChange?.()
  }

  return (
    <div className="flex h-full flex-col">
      {/* slim bookmark chips */}
      {bookmarks.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto px-3 py-1.5">
          {bookmarks.map((b) => (
            <button
              key={b.id}
              type="button"
              className="shrink-0 rounded-full px-2.5 py-1 text-[11px] transition"
              style={{
                background: 'var(--surface)',
                color: 'var(--text-muted)',
              }}
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
      )}

      {/* tab strip */}
      <div
        className="flex items-center gap-1 px-2 py-1"
        style={{ background: 'var(--surface)' }}
      >
        <div className="flex flex-1 gap-0.5 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => void activate(t.id)}
              className="group flex max-w-[160px] items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition"
              style={{
                background: t.active ? 'var(--card)' : 'transparent',
                color: t.active ? 'var(--text)' : 'var(--text-muted)',
              }}
            >
              <Favicon url={t.url} favicon={t.favicon} title={t.title} size={14} />
              <span className="truncate">
                {t.sleeping ? '· ' : ''}
                {shortTitle(t)}
              </span>
              <span
                role="button"
                tabIndex={0}
                title={t.pinned ? '取消钉选' : '钉到侧栏'}
                className="ml-0.5 rounded px-0.5 opacity-0 transition group-hover:opacity-100"
                style={{ color: t.pinned ? 'var(--accent-soft)' : 'var(--text-muted)' }}
                onClick={(e) => {
                  e.stopPropagation()
                  void togglePin(t)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation()
                    void togglePin(t)
                  }
                }}
              >
                ★
              </span>
              <span
                role="button"
                tabIndex={0}
                className="rounded px-1 opacity-0 group-hover:opacity-100"
                style={{ color: 'var(--text-muted)' }}
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
          className="kd-btn kd-btn-ghost !px-2 !py-1 text-sm"
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
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          className="kd-btn kd-btn-ghost !px-2 !py-1 text-xs"
          onClick={() => active && void window.api.tabsBack({ id: active.id })}
        >
          ←
        </button>
        <button
          type="button"
          className="kd-btn kd-btn-ghost !px-2 !py-1 text-xs"
          onClick={() => active && void window.api.tabsForward({ id: active.id })}
        >
          →
        </button>
        <button
          type="button"
          className="kd-btn kd-btn-ghost !px-2 !py-1 text-xs"
          onClick={() => active && void window.api.tabsReload({ id: active.id })}
        >
          ↻
        </button>
        <input
          className="kd-input flex-1 !py-1.5 font-mono text-xs"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void navigate()
          }}
        />
        {active && (
          <button
            type="button"
            title={active.pinned ? '取消钉选' : '钉到侧栏'}
            className="kd-btn kd-btn-ghost flex items-center gap-1.5 whitespace-nowrap !px-2.5 !py-1.5 text-xs"
            style={{
              color: active.pinned ? 'var(--accent-soft)' : undefined,
            }}
            onClick={() => void togglePin(active)}
          >
            <span style={{ fontSize: '14px', lineHeight: 1 }}>
              {active.pinned ? '★' : '☆'}
            </span>
            <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {pinnedCount}/{MAX_PINS}
            </span>
          </button>
        )}
        {pinMsg && (
          <span className="text-[11px]" style={{ color: 'var(--accent-soft)' }}>
            {pinMsg}
          </span>
        )}
      </div>

      <div
        id="browser-viewport"
        ref={viewportRef}
        className="relative min-h-0 flex-1"
        style={{ background: '#050506' }}
      >
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs"
          style={{ color: 'var(--text-muted)', opacity: 0.35 }}
        >
          浏览器视图由主进程 WebContentsView 渲染
        </div>
      </div>
    </div>
  )
}
