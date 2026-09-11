import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

type CmdResult =
  | { kind: 'knowledge'; id: string; title: string; snippet: string }
  | { kind: 'pin'; id: string; title: string; url: string; favicon: string | null }

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'library', label: '知识', icon: '◆' },
  { id: 'browser', label: '浏览', icon: '◎' },
]

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

function isMod(e: KeyboardEvent) {
  return e.ctrlKey || e.metaKey
}

export default function App() {
  const [page, setPage] = useState<Page>('library')
  const [toast, setToast] = useState<string | null>(null)
  const [pins, setPins] = useState<PinTab[]>([])
  const [activePinId, setActivePinId] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>('dark')

  // Command palette
  const [cmdOpen, setCmdOpen] = useState(false)
  const [cmdQuery, setCmdQuery] = useState('')
  const [cmdResults, setCmdResults] = useState<CmdResult[]>([])
  const [cmdIndex, setCmdIndex] = useState(0)
  const [cmdLoading, setCmdLoading] = useState(false)
  const cmdInputRef = useRef<HTMLInputElement>(null)
  const cmdDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clip modal
  const [clipOpen, setClipOpen] = useState(false)
  const [clipText, setClipText] = useState('')
  const [clipTitle, setClipTitle] = useState('')
  const [clipSaving, setClipSaving] = useState(false)
  const clipBodyRef = useRef<HTMLTextAreaElement>(null)

  // Library bridges
  const [openItemId, setOpenItemId] = useState<string | null>(null)
  const [expandComposeSignal, setExpandComposeSignal] = useState(0)

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

  // Clip: show floating modal, do not auto-save / navigate
  useEffect(() => {
    if (!window.api?.onClipDialog) return
    return window.api.onClipDialog((ev) => {
      const e = ev as { saved?: boolean; empty?: boolean; text?: string; itemId?: string }
      if (e.empty) {
        showToast('剪贴板为空')
        return
      }
      if (e.saved) {
        // legacy path — ignore auto-saved; prefer modal
        showToast(`已从剪贴板入库 ${e.itemId?.slice(0, 8) ?? ''}…`)
        return
      }
      if (typeof e.text === 'string') {
        setClipText(e.text)
        setClipTitle('')
        setClipOpen(true)
        requestAnimationFrame(() => clipBodyRef.current?.focus())
      }
    })
  }, [showToast])

  useEffect(() => {
    if (page !== 'browser') {
      void window.api?.tabsHide?.()
    }
  }, [page])

  // Global shortcuts: Ctrl/Cmd+K command bar, Ctrl/Cmd+N compose
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isMod(e) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setCmdOpen(true)
        setCmdQuery('')
        setCmdResults([])
        setCmdIndex(0)
        requestAnimationFrame(() => cmdInputRef.current?.focus())
        return
      }
      if (isMod(e) && (e.key === 'n' || e.key === 'N') && !e.shiftKey) {
        // Don't steal when typing in inputs other than our overlays
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
          if (!cmdOpen && !clipOpen) return
        }
        e.preventDefault()
        setPage('library')
        setExpandComposeSignal((n) => n + 1)
        return
      }
      if (e.key === 'Escape') {
        if (cmdOpen) {
          setCmdOpen(false)
          return
        }
        if (clipOpen && !clipSaving) {
          setClipOpen(false)
          return
        }
        if (pinMenu) {
          setPinMenu(null)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cmdOpen, clipOpen, clipSaving, pinMenu])

  // Command bar search
  useEffect(() => {
    if (!cmdOpen) return
    if (cmdDebounceRef.current) clearTimeout(cmdDebounceRef.current)
    const q = cmdQuery.trim()
    cmdDebounceRef.current = setTimeout(() => {
      void (async () => {
        setCmdLoading(true)
        try {
          const results: CmdResult[] = []
          const qLower = q.toLowerCase()

          // Match pins by title / url / domain
          if (q) {
            for (const pin of pins) {
              const title = (pin.title || '').toLowerCase()
              const url = (pin.url || '').toLowerCase()
              let host = ''
              try {
                host = new URL(pin.url).hostname.toLowerCase()
              } catch {
                /* ignore */
              }
              if (
                title.includes(qLower) ||
                url.includes(qLower) ||
                host.includes(qLower)
              ) {
                results.push({
                  kind: 'pin',
                  id: pin.id,
                  title: pin.title || pin.url,
                  url: pin.url,
                  favicon: pin.favicon,
                })
              }
            }
          } else {
            for (const pin of pins.slice(0, 5)) {
              results.push({
                kind: 'pin',
                id: pin.id,
                title: pin.title || pin.url,
                url: pin.url,
                favicon: pin.favicon,
              })
            }
          }

          if (q) {
            const res = await window.api.knowledgeSearch({ query: q, topK: 12 })
            for (const h of res.items) {
              results.push({
                kind: 'knowledge',
                id: h.id,
                title: h.title || '无标题',
                snippet: h.snippet || '',
              })
            }
          } else {
            const list = (await window.api.knowledgeList({ limit: 8 })) as {
              id: string
              title: string | null
              body: string
            }[]
            for (const it of list) {
              results.push({
                kind: 'knowledge',
                id: it.id,
                title: it.title || '无标题',
                snippet: (it.body || '').slice(0, 80),
              })
            }
          }

          setCmdResults(results)
          setCmdIndex(0)
        } catch {
          setCmdResults([])
        } finally {
          setCmdLoading(false)
        }
      })()
    }, 180)
    return () => {
      if (cmdDebounceRef.current) clearTimeout(cmdDebounceRef.current)
    }
  }, [cmdQuery, cmdOpen, pins])

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

  async function runCmdResult(r: CmdResult) {
    setCmdOpen(false)
    setCmdQuery('')
    if (r.kind === 'pin') {
      await openPin({
        id: r.id,
        title: r.title,
        url: r.url,
        favicon: r.favicon,
        pinned: true,
        active: true,
      })
      return
    }
    setPage('library')
    setOpenItemId(r.id)
  }

  async function saveClip() {
    if (!clipText.trim()) {
      showToast('内容为空')
      return
    }
    setClipSaving(true)
    try {
      const item = await window.api.clipFromSelection({
        text: clipText,
        title: clipTitle.trim() || undefined,
      })
      setClipOpen(false)
      setClipText('')
      setClipTitle('')
      showToast(`已快录 ${(item as { id?: string }).id?.slice(0, 8) ?? ''}…`)
    } catch (err) {
      showToast(`快录失败: ${(err as Error).message || String(err)}`)
    } finally {
      setClipSaving(false)
    }
  }

  const cmdHint = useMemo(
    () => (typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘K' : 'Ctrl+K'),
    [],
  )

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
            const on = page === n.id
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
        {/* Top command trigger bar */}
        <div
          className="flex items-center gap-2 border-b px-4 py-2"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            type="button"
            onClick={() => {
              setCmdOpen(true)
              setCmdQuery('')
              setCmdResults([])
              setCmdIndex(0)
              requestAnimationFrame(() => cmdInputRef.current?.focus())
            }}
            className="kd-input flex flex-1 items-center gap-2 !py-2 text-left text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            <span className="opacity-70">⌕</span>
            <span className="flex-1">搜索知识或钉选…</span>
            <kbd
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{ background: 'var(--control-bg)', color: 'var(--text-muted)' }}
            >
              {cmdHint}
            </kbd>
          </button>
        </div>

        <div className="h-[calc(100%-49px)] overflow-hidden">
          {page === 'library' && (
            <LibraryPage
              openItemId={openItemId}
              onOpenItemConsumed={() => setOpenItemId(null)}
              expandComposeSignal={expandComposeSignal}
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

        {/* Command palette overlay */}
        {cmdOpen && (
          <div
            className="absolute inset-0 z-40 flex items-start justify-center bg-black/45 pt-[12vh] backdrop-blur-[2px]"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setCmdOpen(false)
            }}
          >
            <div
              className="kd-card w-full max-w-xl overflow-hidden shadow-2xl"
              style={{ border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2 border-b px-3" style={{ borderColor: 'var(--border)' }}>
                <span style={{ color: 'var(--text-muted)' }}>⌕</span>
                <input
                  ref={cmdInputRef}
                  className="flex-1 bg-transparent py-3.5 text-sm outline-none"
                  style={{ color: 'var(--text)' }}
                  placeholder="搜索知识 / 钉选标题或域名…"
                  value={cmdQuery}
                  onChange={(e) => setCmdQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setCmdIndex((i) => Math.min(i + 1, Math.max(cmdResults.length - 1, 0)))
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setCmdIndex((i) => Math.max(i - 1, 0))
                    } else if (e.key === 'Enter') {
                      e.preventDefault()
                      const r = cmdResults[cmdIndex] ?? cmdResults[0]
                      if (r) void runCmdResult(r)
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      setCmdOpen(false)
                    }
                  }}
                />
                {cmdLoading && (
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    …
                  </span>
                )}
              </div>
              <ul className="max-h-[min(420px,50vh)] overflow-auto py-1">
                {cmdResults.map((r, i) => {
                  const selected = i === cmdIndex
                  return (
                    <li key={`${r.kind}-${r.id}`}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition"
                        style={{
                          background: selected ? 'var(--accent-bg)' : 'transparent',
                          color: 'var(--text)',
                        }}
                        onMouseEnter={() => setCmdIndex(i)}
                        onClick={() => void runCmdResult(r)}
                      >
                        {r.kind === 'pin' ? (
                          <Favicon url={r.url} favicon={r.favicon} title={r.title} size={18} />
                        ) : (
                          <span
                            className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-[10px]"
                            style={{ background: 'var(--surface)', color: 'var(--accent-soft)' }}
                          >
                            ◆
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{r.title}</span>
                            <span
                              className="shrink-0 text-[10px]"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {r.kind === 'pin' ? '钉选' : '知识'}
                            </span>
                          </div>
                          <p
                            className="mt-0.5 truncate text-xs"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {r.kind === 'pin' ? r.url : r.snippet}
                          </p>
                        </div>
                      </button>
                    </li>
                  )
                })}
                {!cmdLoading && cmdResults.length === 0 && (
                  <li className="px-4 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    {cmdQuery.trim() ? '无匹配结果' : '输入关键词搜索知识或钉选'}
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}

        {/* Clip capture modal — stays on current page */}
        {clipOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
            <div
              className="kd-card flex w-full max-w-md flex-col gap-3 p-5 shadow-2xl"
              style={{ border: '1px solid var(--border)' }}
            >
              <h3 className="text-sm font-semibold">快速录入</h3>
              <input
                className="kd-input"
                placeholder="标题（可选）"
                value={clipTitle}
                onChange={(e) => setClipTitle(e.target.value)}
              />
              <textarea
                ref={clipBodyRef}
                className="kd-input min-h-[160px] resize-y leading-relaxed"
                placeholder="剪贴板内容…"
                value={clipText}
                onChange={(e) => setClipText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault()
                    void saveClip()
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="kd-btn kd-btn-ghost"
                  disabled={clipSaving}
                  onClick={() => {
                    setClipOpen(false)
                    setClipText('')
                    setClipTitle('')
                  }}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="kd-btn kd-btn-primary"
                  disabled={clipSaving}
                  onClick={() => void saveClip()}
                >
                  {clipSaving ? '保存中…' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}

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
