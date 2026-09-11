export default function App() {
  return (
    <div className="flex h-full">
      <aside className="w-56 border-r border-white/10 bg-[#161a22] p-4">
        <h1 className="mb-4 text-sm font-semibold tracking-wide text-white/90">
          Knowledge Desktop
        </h1>
        <nav className="space-y-1 text-sm text-white/60">
          <div className="rounded-md bg-white/10 px-3 py-2 text-white">知识库</div>
          <div className="rounded-md px-3 py-2 hover:bg-white/5">搜索</div>
          <div className="rounded-md px-3 py-2 hover:bg-white/5">全部知识</div>
          <div className="rounded-md px-3 py-2 hover:bg-white/5">书签</div>
          <div className="rounded-md px-3 py-2 hover:bg-white/5">设置</div>
        </nav>
      </aside>
      <main className="flex flex-1 flex-col">
        <header className="border-b border-white/10 px-4 py-3 text-sm text-white/50">
          M0 脚手架就绪 · 浏览器工作台与快录将在 M2 接入
        </header>
        <section className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-lg space-y-3 text-center">
            <p className="text-lg font-medium text-white">本地知识库工作台</p>
            <p className="text-sm leading-relaxed text-white/55">
              地基已搭好：SQLite / FTS、向量后端冒烟、Electron 窗口。接下来按 Issue 做知识 CRUD
              与标签浏览器。
            </p>
            <p className="font-mono text-xs text-emerald-400/80">
              db + vector smoke: pnpm db:smoke && pnpm vector:smoke
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
