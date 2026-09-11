import { useCallback, useEffect, useState } from 'react'
import LibraryPage from './pages/LibraryPage'
import BrowserPage from './pages/BrowserPage'
import SettingsPage from './pages/SettingsPage'
import Favicon from './components/Favicon'

type Page = 'library' | 'browser' | 'settings'
type Theme = 'dark' | 'light'

type PinTab = {
  id: string
  title: string | null
  url: string
  favicon: string | null
  pinned: boolean
  active: boolean
}

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'library', label: '知识', icon: '◆' },
  { id: 'browser', label: '浏览', icon: '◎' },
]

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

export default function App() {
  const [page, setPage] = useState<Page>('library')
  const [toast, setToast] = useState<string | null>(null)
  const [pins, setPins] = useState<PinTab[]>([])
  const [activePinId, setActivePinId] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>('dark')

  const refreshPins = useCallback(async () => {
    if (!window.api?.tabsListPinned && !window.api?.tabsList) return
    const list = window.api.tabsListPinned
      ? ((await window.api.tabsListPinned()) as PinTab[])
      : ((await window.api.tabsList()) as PinTab[]).filter((t) => t.pinned)
    setPins(list.filter((t) => t.pinned).slice(0, 10))
    const active = list.find((t) => t.active && t.pinned)
    setActivePinId(active?.id ?? null)
  }, [])

  const setThemePersist = useCallback(async (next: Theme) => {
    setTheme(next)
    applyTheme(next)
    await window.api?.settingsSet?.({ theme: next })
  }, [])

  useEffect(() => {
    // Hide any restored WebContentsViews until Browser page mounts
    void window.api?.tabsHide?.()
  }, [])

  useEffect(() => {
    void (async () => {
      if (!window.api?.settingsGet) return
      const s = await window.api.settingsGet()
      const t: Theme = s?.theme === 'light' ? 'light' : 'dark'
      setTheme(t)
      applyTheme(t)
    })()
  }, [])

  useEffect(() => {
    void refreshPins()
  }, [refreshPins])

  useEffect(() => {
    if (!window.api?.onTabUpdated) return
    return window.api.onTabUpdated(() => {
      void refreshPins()
    })
  }, [refreshPins])

  useEffect(() => {
    if (!window.api?.onClipDialog) return
    return window.api.onClipDialog((ev) => {
      const e = ev as { saved?: boolean; empty?: boolean; text?: string; itemId?: string }
      if (e.empty) setToast('剪贴板为空')
      else if (e.saved) setToast(`已从剪贴板入库 ${e.itemId?.slice(0, 8) ?? ''}…`)
      else if (e.text) {
        void window.api
          .clipFromSelection({ text: e.text, url: (e as any).url, title: (e as any).title })
          .then((item) => setToast(`已快录 ${(item as any).id?.slice(0, 8)}…`))
          .catch((err) => setToast(`快录失败: ${(err as Error).message || String(err)}`))
      }
      setTimeout(() => setToast(null), 3000)
    })
  }, [])

  useEffect(() => {
    if (page !== 'browser') {
      void window.api?.tabsHide?.()
    }
  }, [page])

  async function openPin(pin: PinTab) {
    setPage('browser')
    setActivePinId(pin.id)
    await window.api.tabsActivate({ id: pin.id })
    await refreshPins()
  }

  async function unpin(id: string) {
    const res = await window.api.tabsSetPinned({ id, pinned: false })
    if (!res.ok) {
      setToast(res.error || '取消钉选失败')
      setTimeout(() => setToast(null), 2500)
      return
    }
    await refreshPins()
  }

  return (
    <div className="flex h-full" style={{ background: 'var(--bg)' }}>
      <aside
        className="flex shrink-0 flex-col items-center py-3"
        style={{
          width: 'var(--sidebar-w)',
          background: 'var(--sidebar)',
          borderRight: '1px solid var(--border)',
        }}
      >
        {/* App mark */}
        <div
          className="mb-4 flex h-9 w-9 items-center justify-center rounded-2xl text-sm font-bold"
          style={{ background: 'var(--accent-bg)', color: 'var(--accent-soft)' }}
          title="Knowledge Desktop"
        >
          K
        </div>

        {/* Core nav */}
        <nav className="flex w-full flex-col items-center gap-1 px-2">
          {NAV.map((n) => {
            const on = page === n.id
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setPage(n.id)}
                className="group flex w-full flex-col items-center gap-0.5 rounded-xl px-1 py-2 transition"
                style={{
                  background: on ? 'var(--accent-bg)' : 'transparent',
                  color: on ? 'var(--accent-soft)' : 'var(--text-muted)',
                }}
              >
                <span className="text-base leading-none opacity-90">{n.icon}</span>
                <span className="text-[10px] font-medium tracking-wide">{n.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Pins */}
        {pins.length > 0 && (
          <>
            <div
              className="my-3 h-px w-8"
              style={{ background: 'var(--border)' }}
            />
            <div className="flex w-full flex-1 flex-col items-center gap-1.5 overflow-y-auto px-2 pb-2">
              {pins.map((pin) => {
                const active = page === 'browser' && (activePinId === pin.id || pin.active)
                return (
                  <div key={pin.id} className="kd-tooltip relative w-full" data-tip={pin.title || pin.url}>
                    <button
                      type="button"
                      onClick={() => void openPin(pin)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        void unpin(pin.id)
                      }}
                      className="group relative mx-auto flex h-9 w-9 items-center justify-center rounded-[12px] transition"
                      style={{
                        background: active ? 'var(--accent-bg)' : 'var(--surface)',
                      }}
                    >
                      {active && (
                        <span
                          className="absolute left-[-6px] top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full"
                          style={{ background: 'var(--accent)' }}
                        />
                      )}
                      <Favicon
                        url={pin.url}
                        favicon={pin.favicon}
                        title={pin.title}
                        size={20}
                      />
                      <span
                        role="button"
                        tabIndex={0}
                        title="取消钉选"
                        className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full text-[10px] leading-none group-hover:flex"
                        style={{ background: 'var(--card)', color: 'var(--text-muted)' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          void unpin(pin.id)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.stopPropagation()
                            void unpin(pin.id)
                          }
                        }}
                      >
                        ×
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {pins.length === 0 && <div className="flex-1" />}

        {/* Bottom: theme + Settings + hint */}
        <div className="mt-auto flex w-full flex-col items-center gap-2 px-2 pb-1">
          <button
            type="button"
            title={theme === 'dark' ? '切换浅色' : '切换深色'}
            onClick={() => void setThemePersist(theme === 'dark' ? 'light' : 'dark')}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-sm transition"
            style={{
              background: 'var(--surface)',
              color: 'var(--text-muted)',
            }}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <button
            type="button"
            onClick={() => setPage('settings')}
            className="flex w-full flex-col items-center gap-0.5 rounded-xl px-1 py-2 transition"
            style={{
              background: page === 'settings' ? 'var(--accent-bg)' : 'transparent',
              color: page === 'settings' ? 'var(--accent-soft)' : 'var(--text-muted)',
            }}
          >
            <span className="text-base leading-none">⚙</span>
            <span className="text-[10px] font-medium">设置</span>
          </button>
          <p
            className="px-1 text-center text-[9px] leading-tight"
            style={{ color: 'var(--text-muted)', opacity: 0.55 }}
          >
            ⌃⇧S
            <br />
            快录
          </p>
        </div>
      </aside>

      <main className="relative min-w-0 flex-1 overflow-hidden" style={{ background: 'var(--bg)' }}>
        {page === 'library' && <LibraryPage />}
        {page === 'browser' && <BrowserPage onPinsChange={refreshPins} />}
        {page === 'settings' && (
          <SettingsPage theme={theme} onThemeChange={(t) => void setThemePersist(t)} />
        )}
        {toast && (
          <div
            className="absolute bottom-4 right-4 rounded-xl px-3 py-2 text-xs shadow-lg"
            style={{
              background: 'var(--card)',
              color: 'var(--text)',
              boxShadow: 'var(--tooltip-shadow)',
              border: '1px solid var(--border)',
            }}
          >
            {toast}
          </div>
        )}
      </main>
    </div>
  )
}
