import { useEffect, useState } from 'react'

export default function SettingsPage() {
  const [apiBase, setApiBase] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [msg, setMsg] = useState('')
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    void window.api.settingsGet().then((s) => {
      setApiBase(s.embed.apiBase)
      setModel(s.embed.model)
      setHasKey(!!s.embed.hasApiKey)
      setApiKey(s.embed.apiKey || '')
    })
  }, [])

  async function save() {
    await window.api.settingsSet({
      embed: {
        apiBase,
        model,
        apiKey: apiKey.startsWith('••') ? undefined : apiKey,
      },
    })
    setMsg('已保存')
    const s = await window.api.settingsGet()
    setHasKey(!!s.embed.hasApiKey)
    setApiKey(s.embed.apiKey || '')
  }

  async function test() {
    setTesting(true)
    setMsg('')
    try {
      await save()
      const res = await window.api.settingsTestEmbedding()
      if (res.ok) {
        setMsg(`嵌入成功 · dim=${res.dim}`)
        await window.api.knowledgeRetryEmbed({ allPending: true })
      } else {
        setMsg(`失败: ${res.error}`)
      }
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col gap-5 p-6">
      <div>
        <h2 className="text-lg font-semibold">设置</h2>
        <p className="mt-1 text-sm text-white/50">
          Embedding API（OpenAI 兼容）。Key 经 Electron safeStorage 加密存储。
        </p>
      </div>

      {!hasKey && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200/90">
          向量检索未启用，当前仅关键词搜索；配置嵌入模型后可自动补齐向量。
        </div>
      )}

      <label className="block space-y-1 text-sm">
        <span className="text-white/60">API Base</span>
        <input
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 outline-none focus:border-emerald-500/40"
          value={apiBase}
          onChange={(e) => setApiBase(e.target.value)}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-white/60">API Key</span>
        <input
          type="password"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 outline-none focus:border-emerald-500/40"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={hasKey ? '已保存（输入新值可覆盖）' : 'sk-…'}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-white/60">模型</span>
        <input
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 outline-none focus:border-emerald-500/40"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
        >
          保存
        </button>
        <button
          type="button"
          disabled={testing}
          onClick={() => void test()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {testing ? '测试中…' : '测试嵌入'}
        </button>
        <button
          type="button"
          onClick={() => void window.api.knowledgeRetryEmbed({ allPending: true })}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
        >
          补齐待嵌入
        </button>
      </div>

      <hr className="border-white/10" />

      <div>
        <h3 className="mb-2 text-sm font-medium text-white/80">备份</h3>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/5"
            onClick={() =>
              void window.api.backupExport({ kind: 'full' }).then((r) => {
                setMsg(r.canceled ? '已取消' : `已导出 ${r.itemCount} 条 → ${r.path}`)
              })
            }
          >
            导出完整备份
          </button>
          <button
            type="button"
            className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/5"
            onClick={() =>
              void window.api.backupExport({ kind: 'text_only' }).then((r) => {
                setMsg(r.canceled ? '已取消' : `已导出文本 ${r.itemCount} 条`)
              })
            }
          >
            仅文本导出
          </button>
          <button
            type="button"
            className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/5"
            onClick={() =>
              void window.api
                .backupImport({ conflict: 'skip' })
                .then((r) => {
                  setMsg(
                    r.canceled
                      ? '已取消'
                      : `导入 ${r.imported}，跳过 ${r.skipped}`,
                  )
                })
            }
          >
            导入备份
          </button>
        </div>
      </div>

      {msg && <p className="text-xs text-emerald-400/80">{msg}</p>}
      <p className="mt-auto text-[10px] text-white/30">api {window.api?.version}</p>
    </div>
  )
}
