import { useCallback, useEffect, useState } from 'react'
import LibraryPage from './pages/LibraryPage'
import AllKnowledgePage from './pages/AllKnowledgePage'
import BrowserPage from './pages/BrowserPage'
import SettingsPage from './pages/SettingsPage'
import Favicon from './components/Favicon'
import KnowledgeEditModal, {
  parseTags,
  type KnowledgeEditDraft,
} from './components/KnowledgeEditModal'

type Page = 'library' | 'library-all' | 'browser' | 'settings'
type Theme = 'dark' | 'light'

type PinTab = {
  id: string
  title: string | null
  url: string
  favicon: string | null
  pinned: boolean
  active: boolean
}

const NAV: { id: 'library' | 'browser'; label: string; icon: string }[] = [
  { id: 'library', label: '知识', icon: '◆' },
  { id: 'browser', label: '浏览', icon: '◎' },
]

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

function isMod(e: KeyboardEvent) {
  return e.ctrlKey || e.metaKey
}

function focusKnowledgeSearch() {
  window.dispatchEvent(new CustomEvent('kd:focus-search'))
}

export default function App() {
  const [page, setPage] = useState<Page>('library')
  const [toast, setToast] = useState<string | null>(null)
  const [pins, setPins] = useState<PinTab[]>([])
  const [activePinId, setActivePinId] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>('dark')
  const [refreshSignal, setRefreshSignal] = useState(0)

  // Shared knowledge edit / clip modal (works on any page, incl. browser)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDraft, setModalDraft] = useState<KnowledgeEditDraft>({
    title: '',
    body: '',
    tags: '',
  })
  const [modalHeading, setModalHeading] = useState('快速录入')
  const [modalSaving, setModalSaving] = useState(false)

  // Pin context menu
  const [pinMenu, setPinMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2800)
  }, [])

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

  const openClipModal = useCallback(
    async (prefill?: { text?: string; title?: string; empty?: boolean }) => {
      if (prefill?.empty) {
        showToast('剪贴板为空')
        return
      }
      let text = prefill?.text
      if (text === undefined) {
        try {
          const res = await window.api?.clipReadText?.()
          text = res?.text ?? ''
        } catch {
          text = ''
        }
      }
      if (!text?.trim()) {
        showToast('剪贴板为空')
        return
      }
      setModalDraft({
        title: prefill?.title || '',
        body: text,
        tags: '',
      })
      setModalHeading('快速录入')
      setModalOpen(true)
    },
    [showToast],
  )

  useEffect(() => {
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

  // Clip dialog from main (globalShortcut / before-input / context-menu)
  useEffect(() => {
    if (!window.api?.onClipDialog) return
    return window.api.onClipDialog((ev) => {
      const e = ev as { saved?: boolean; empty?: boolean; text?: string; title?: string }
      if (e.empty) {
        showToast('剪贴板为空')
        return
      }
      if (e.saved) {
        showToast('已入库')
        setRefreshSignal((n) => n + 1)
        return
      }
      if (typeof e.text === 'string') {
        void openClipModal({ text: e.text, title: e.title })
      }
    })
  }, [showToast, openClipModal])

  // Toast if global shortcut registration failed
  useEffect(() => {
    if (!window.api?.onClipShortcutStatus) return
    return window.api.onClipShortcutStatus((ev) => {
      const e = ev as { registered?: boolean; message?: string }
      if (e.registered === false) {
        showToast(e.message || '全局快录快捷键注册失败，窗口内仍可用')
      }
    })
  }, [showToast])

  useEffect(() => {
    if (page !== 'browser') {
      void window.api?.tabsHide?.()
    }
  }, [page])

  // ⌘K / Ctrl+K → focus knowledge search (switch to library if needed)
  // Escape closes modal / pin menu
  // Renderer-local Ctrl+Shift+S as extra fallback
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isMod(e) && (e.key === 'k' || e.key === 'K') && !e.shiftKey) {
        e.preventDefault()
        if (page !== 'library' && page !== 'library-all') {
          setPage('library')
          requestAnimationFrame(() => focusKnowledgeSearch())
        } else if (page === 'library-all') {
          setPage('library')
          requestAnimationFrame(() => focusKnowledgeSearch())
        } else {
          focusKnowledgeSearch()
        }
        return
      }
      if (isMod(e) && e.shiftKey && (e.key === 's' || e.key === 'S')) {
        // Local fallback when before-input / globalShortcut miss (e.g. some focus states)
        e.preventDefault()
        void openClipModal()
        return
      }
      if (e.key === 'Escape') {
        if (modalOpen && !modalSaving) {
          setModalOpen(false)
          return
        }
        if (pinMenu) {
          setPinMenu(null)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [page, modalOpen, modalSaving, pinMenu, openClipModal])

  async function openPin(pin: PinTab) {
    setPage('browser')
    setActivePinId(pin.id)
    setPinMenu(null)
    await window.api.tabsActivate({ id: pin.id })
    await refreshPins()
  }

  async function unpin(id: string) {
    const res = await window.api.tabsSetPinned({ id, pinned: false })
    if (!res.ok) {
      showToast(res.error || '取消钉选失败')
      return
    }
    setPinMenu(null)
    await refreshPins()
  }

  async function saveModal() {
    if (!modalDraft.body.trim()) {
      showToast('内容为空')
      return
    }
    setModalSaving(true)
    try {
      const tags = parseTags(modalDraft.tags)
      if (modalDraft.id) {
        await window.api.knowledgeUpdate({
          id: modalDraft.id,
          title: modalDraft.title.trim() || undefined,
          body: modalDraft.body,
          tags,
        })
        showToast('已更新')
      } else {
        // Prefer clip API when heading is 快速录入 to keep source_type
        if (modalHeading === '快速录入') {
          const item = await window.api.clipFromSelection({
            text: modalDraft.body,
            title: modalDraft.title.trim() || undefined,
          })
          showToast(`已快录 ${(item as { id?: string }).id?.slice(0, 8) ?? ''}…`)
        } else {
          await window.api.knowledgeCreate({
            title: modalDraft.title.trim() || undefined,
            body: modalDraft.body,
            source_type: 'manual',
            tags,
          })
          showToast('已保存')
        }
      }
      setModalOpen(false)
      setModalDraft({ title: '', body: '', tags: '' })
      setRefreshSignal((n) => n + 1)
    } catch (err) {
      showToast(`保存失败: ${(err as Error).message || String(err)}`)
    } finally {
      setModalSaving(false)
    }
  }

  const knowledgeActive = page === 'library' || page === 'library-all'

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
        <div
          className="mb-4 flex h-9 w-9 items-center justify-center rounded-2xl text-sm font-bold"
          style={{ background: 'var(--accent-bg)', color: 'var(--accent-soft)' }}
          title="Knowledge Desktop"
        >
          K
        </div>

        <nav className="flex w-full flex-col items-center gap-1 px-2">
          {NAV.map((n) => {
            const on = n.id === 'library' ? knowledgeActive : page === n.id
            return (
              <div key={n.id} className="kd-tooltip w-full" data-tip={n.label}>
                <button
                  type="button"
                  title={n.label}
                  onClick={() => setPage(n.id)}
                  className="flex w-full flex-col items-center gap-0.5 rounded-xl px-1 py-2.5 transition"
                  style={{
                    background: on ? 'var(--accent-bg)' : 'transparent',
                    color: on ? 'var(--accent-soft)' : 'var(--text-muted)',
                  }}
                >
                  <span className="text-base leading-none opacity-90">{n.icon}</span>
                  <span className="text-[9px] font-medium tracking-wide opacity-70">{n.label}</span>
                </button>
              </div>
            )
          })}
        </nav>

        {pins.length > 0 && (
          <>
            <div className="my-3 h-px w-8" style={{ background: 'var(--border)' }} />
            <div className="flex w-full flex-1 flex-col items-center gap-1.5 overflow-y-auto px-2 pb-2">
              {pins.map((pin) => {
                const active = page === 'browser' && (activePinId === pin.id || pin.active)
                return (
                  <div
                    key={pin.id}
                    className="kd-tooltip relative w-full"
                    data-tip={pin.title || pin.url}
                  >
                    <button
                      type="button"
                      onClick={() => void openPin(pin)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setPinMenu({ id: pin.id, x: e.clientX, y: e.clientY })
                      }}
                      className="group relative mx-auto flex h-9 w-9 items-center justify-center rounded-[12px] transition"
                      style={{
                        background: active ? 'var(--accent-bg)' : 'var(--surface)',
                        boxShadow: active
                          ? '0 0 0 2px var(--accent)'
                          : '0 0 0 1px transparent',
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
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {pins.length === 0 && <div className="flex-1" />}

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
          <div className="kd-tooltip w-full" data-tip="设置">
            <button
              type="button"
              title="设置"
              onClick={() => setPage('settings')}
              className="flex w-full flex-col items-center gap-0.5 rounded-xl px-1 py-2 transition"
              style={{
                background: page === 'settings' ? 'var(--accent-bg)' : 'transparent',
                color: page === 'settings' ? 'var(--accent-soft)' : 'var(--text-muted)',
              }}
            >
              <span className="text-base leading-none">⚙</span>
              <span className="text-[9px] font-medium opacity-70">设置</span>
            </button>
          </div>
          <button
            type="button"
            title="从剪贴板快录 (Ctrl+Shift+S)"
            onClick={() => void openClipModal()}
            className="rounded-xl px-1 py-1.5 text-center transition hover:brightness-110"
            style={{ color: 'var(--text-muted)' }}
          >
            <p className="text-[9px] leading-tight opacity-80">
              ⌃⇧S
              <br />
              <span style={{ color: 'var(--accent-soft)' }}>快录</span>
            </p>
          </button>
        </div>
      </aside>

      <main className="relative min-w-0 flex-1 overflow-hidden" style={{ background: 'var(--bg)' }}>
        <div className="h-full overflow-hidden">
          {page === 'library' && (
            <LibraryPage
              refreshSignal={refreshSignal}
              onToast={showToast}
              onGoAll={() => setPage('library-all')}
            />
          )}
          {page === 'library-all' && (
            <AllKnowledgePage
              onBack={() => setPage('library')}
              onToast={showToast}
              refreshSignal={refreshSignal}
            />
          )}
          {page === 'browser' && (
            <BrowserPage
              onPinsChange={refreshPins}
              pinCount={pins.length}
              onToast={showToast}
            />
          )}
          {page === 'settings' && (
            <SettingsPage theme={theme} onThemeChange={(t) => void setThemePersist(t)} />
          )}
        </div>

        {/* Shared clip / quick-capture modal — stays on current page (incl. browser) */}
        <KnowledgeEditModal
          open={modalOpen}
          draft={modalDraft}
          saving={modalSaving}
          heading={modalHeading}
          onChange={setModalDraft}
          onSave={() => void saveModal()}
          onCancel={() => {
            if (!modalSaving) setModalOpen(false)
          }}
        />

        {/* Pin context menu */}
        {pinMenu && (
          <>
            <div
              className="fixed inset-0 z-[60]"
              onMouseDown={() => setPinMenu(null)}
            />
            <div
              className="kd-card fixed z-[61] min-w-[140px] overflow-hidden py-1 text-sm shadow-lg"
              style={{
                left: pinMenu.x,
                top: pinMenu.y,
                border: '1px solid var(--border)',
              }}
            >
              <button
                type="button"
                className="block w-full px-3 py-2 text-left hover:brightness-110"
                style={{ background: 'transparent' }}
                onClick={() => {
                  const pin = pins.find((p) => p.id === pinMenu.id)
                  if (pin) void openPin(pin)
                }}
              >
                打开
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left hover:brightness-110"
                style={{ background: 'transparent', color: 'var(--danger)' }}
                onClick={() => void unpin(pinMenu.id)}
              >
                取消钉选
              </button>
            </div>
          </>
        )}

        {toast && (
          <div
            className="absolute bottom-4 right-4 z-[70] rounded-xl px-3 py-2 text-xs shadow-lg"
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
