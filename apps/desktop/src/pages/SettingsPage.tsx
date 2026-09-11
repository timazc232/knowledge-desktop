import { useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

type Props = {
  theme: Theme
  onThemeChange: (theme: Theme) => void
}

export default function SettingsPage({ theme, onThemeChange }: Props) {
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
    <div className="mx-auto flex h-full max-w-xl flex-col gap-5 overflow-auto p-6">
      <div>
        <h2 className="text-lg font-semibold">设置</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          外观与 Embedding API（OpenAI 兼容）。Key 经 Electron safeStorage 加密存储。
        </p>
      </div>

      <div className="kd-card flex flex-col gap-3 p-4">
        <h3 className="text-sm font-medium">外观</h3>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          主题保存在本地设置（ui.theme），默认深色。
        </p>
        <div className="kd-seg self-start" role="group" aria-label="主题">
          <button
            type="button"
            aria-pressed={theme === 'dark'}
            onClick={() => onThemeChange('dark')}
          >
            深色
          </button>
          <button
            type="button"
            aria-pressed={theme === 'light'}
            onClick={() => onThemeChange('light')}
          >
            浅色
          </button>
        </div>
      </div>

      {!hasKey && (
        <div
          className="rounded-xl px-3 py-2.5 text-sm"
          style={{
            background: 'var(--accent-bg)',
            color: 'var(--accent-soft)',
          }}
        >
          向量检索未启用，当前仅关键词搜索；配置嵌入模型后可自动补齐向量。
        </div>
      )}

      <div className="kd-card flex flex-col gap-4 p-4">
        <label className="block space-y-1.5 text-sm">
          <span style={{ color: 'var(--text-muted)' }}>API Base</span>
          <input
            className="kd-input"
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span style={{ color: 'var(--text-muted)' }}>API Key</span>
          <input
            type="password"
            className="kd-input"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasKey ? '已保存（输入新值可覆盖）' : 'sk-…'}
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span style={{ color: 'var(--text-muted)' }}>模型</span>
          <input
            className="kd-input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void save()} className="kd-btn kd-btn-ghost">
            保存
          </button>
          <button
            type="button"
            disabled={testing}
            onClick={() => void test()}
            className="kd-btn kd-btn-primary"
          >
            {testing ? '测试中…' : '测试嵌入'}
          </button>
          <button
            type="button"
            onClick={() => void window.api.knowledgeRetryEmbed({ allPending: true })}
            className="kd-btn kd-btn-ghost"
          >
            补齐待嵌入
          </button>
        </div>
      </div>

      <div className="kd-card p-4">
        <h3 className="mb-3 text-sm font-medium">备份</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="kd-btn kd-btn-ghost"
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
            className="kd-btn kd-btn-ghost"
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
            className="kd-btn kd-btn-ghost"
            onClick={() =>
              void window.api.backupImport({ conflict: 'skip' }).then((r) => {
                setMsg(
                  r.canceled ? '已取消' : `导入 ${r.imported}，跳过 ${r.skipped}`,
                )
              })
            }
          >
            导入备份
          </button>
        </div>
      </div>

      {msg && (
        <p className="text-xs" style={{ color: 'var(--success)' }}>
          {msg}
        </p>
      )}
      <p className="mt-auto text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
        api {window.api?.version}
      </p>
    </div>
  )
}
