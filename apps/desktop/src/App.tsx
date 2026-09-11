import { useEffect, useState } from 'react'
import KnowledgeHome from './pages/KnowledgeHome'
import SearchPage from './pages/SearchPage'
import BrowsePage from './pages/BrowsePage'
import BrowserPage from './pages/BrowserPage'
import SettingsPage from './pages/SettingsPage'

type Page = 'home' | 'search' | 'browse' | 'browser' | 'settings'

const NAV: { id: Page; label: string }[] = [
  { id: 'home', label: '知识库' },
  { id: 'search', label: '搜索' },
  { id: 'browse', label: '全部知识' },
  { id: 'browser', label: '浏览器' },
  { id: 'settings', label: '设置' },
]

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [toast, setToast] = useState<string | null>(null)

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

  return (
    <div className="flex h-full">
      <aside className="flex w-52 shrink-0 flex-col border-r border-white/10 bg-[#161a22] p-3">
        <h1 className="mb-4 px-2 text-sm font-semibold tracking-wide text-white/90">
          Knowledge Desktop
        </h1>
        <nav className="space-y-0.5 text-sm text-white/60">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setPage(n.id)}
              className={`block w-full rounded-md px-3 py-2 text-left transition ${
                page === n.id
                  ? 'bg-white/10 text-white'
                  : 'hover:bg-white/5 hover:text-white/80'
              }`}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <p className="mt-auto px-2 pt-4 text-[10px] leading-relaxed text-white/25">
          MVP · Ctrl+Shift+S 剪贴板入库
        </p>
      </aside>
      <main className="relative min-w-0 flex-1 overflow-hidden">
        {page === 'home' && <KnowledgeHome />}
        {page === 'search' && <SearchPage />}
        {page === 'browse' && <BrowsePage />}
        {page === 'browser' && <BrowserPage />}
        {page === 'settings' && <SettingsPage />}
        {toast && (
          <div className="absolute bottom-4 right-4 rounded-lg bg-emerald-700/90 px-3 py-2 text-xs text-white shadow-lg">
            {toast}
          </div>
        )}
      </main>
    </div>
  )
}
