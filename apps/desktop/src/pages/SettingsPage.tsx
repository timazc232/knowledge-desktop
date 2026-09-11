import { useEffect, useState } from 'react'

type Theme = 'dark' | 'light'
type EmbedProvider = 'openai' | 'huggingface'

type Props = {
  theme: Theme
  onThemeChange: (theme: Theme) => void
}

const HF_BASE = 'https://router.huggingface.co/hf-inference'

export default function SettingsPage({ theme, onThemeChange }: Props) {
  const [provider, setProvider] = useState<EmbedProvider>('openai')
  const [apiBase, setApiBase] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [msg, setMsg] = useState('')
  const [embedWarning, setEmbedWarning] = useState('')
  const [testing, setTesting] = useState(false)
  const [vectorReady, setVectorReady] = useState(false)
  const [lastDim, setLastDim] = useState(0)

  useEffect(() => {
    void window.api.settingsGet().then((s) => {
      const p = (s.embed.provider === 'huggingface' ? 'huggingface' : 'openai') as EmbedProvider
      setProvider(p)
      setApiBase(s.embed.apiBase)
      setModel(s.embed.model)
      setHasKey(!!s.embed.hasApiKey)
      setApiKey(s.embed.apiKey || '')
      const dim = Number(s.embed.lastTestDim || 0)
      setLastDim(dim)
      setVectorReady(dim > 0)
    })
  }, [])

  function switchProvider(next: EmbedProvider) {
    setProvider(next)
    if (next === 'huggingface') {
      setApiBase(HF_BASE)
      if (!model || /siliconflow|bge-m3|gpt-|glm-|qwen/i.test(model)) {
        setModel('BAAI/bge-small-zh-v1.5')
      }
    } else if (!apiBase || apiBase.includes('huggingface')) {
      setApiBase('https://api.siliconflow.cn/v1')
      if (!model || /bge-small/i.test(model)) setModel('BAAI/bge-m3')
    }
  }

  async function save() {
    const res = (await window.api.settingsSet({
      embed: {
        provider,
        apiBase,
        model,
        apiKey: apiKey.startsWith('••') ? undefined : apiKey,
      },
    })) as { ok?: boolean; embedWarning?: string }
    setMsg('已保存')
    setEmbedWarning(res?.embedWarning || '')
    const s = await window.api.settingsGet()
    setProvider(s.embed.provider === 'huggingface' ? 'huggingface' : 'openai')
    setApiBase(s.embed.apiBase)
    setModel(s.embed.model)
    setHasKey(!!s.embed.hasApiKey)
    setApiKey(s.embed.apiKey || '')
  }

  async function test() {
    setTesting(true)
    setMsg('')
    setEmbedWarning('')
    try {
      await save()
      const res = await window.api.settingsTestEmbedding()
      if (res.ok) {
        setMsg(`嵌入成功 · dim=${res.dim}`)
        setLastDim(Number(res.dim) || 0)
        setVectorReady(true)
        await window.api.knowledgeRetryEmbed({ allPending: true })
      } else {
        setMsg(`失败: ${res.error}`)
        setVectorReady(false)
        setLastDim(0)
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
          外观与 Embedding。支持 OpenAI 兼容网关或 Hugging Face Inference。Key 经
          Electron safeStorage 加密存储。
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
        <div className="space-y-1.5 text-sm">
          <span style={{ color: 'var(--text-muted)' }}>提供商</span>
          <div className="kd-seg self-start" role="group" aria-label="嵌入提供商">
            <button
              type="button"
              aria-pressed={provider === 'openai'}
              onClick={() => switchProvider('openai')}
            >
              OpenAI 兼容
            </button>
            <button
              type="button"
              aria-pressed={provider === 'huggingface'}
              onClick={() => switchProvider('huggingface')}
            >
              Hugging Face
            </button>
          </div>
        </div>

        <label className="block space-y-1.5 text-sm">
          <span style={{ color: 'var(--text-muted)' }}>API Base</span>
          <input
            className="kd-input"
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
            placeholder={
              provider === 'huggingface' ? HF_BASE : 'https://api.siliconflow.cn/v1'
            }
            disabled={provider === 'huggingface'}
          />
          <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
            {provider === 'huggingface'
              ? 'Hugging Face 使用固定推理路由（feature-extraction），无需改 Base。'
              : '填写 OpenAI 兼容根路径，例如 https://api.siliconflow.cn/v1（不要带 /chat/completions）。'}
          </span>
        </label>
        <label className="block space-y-1.5 text-sm">
          <span style={{ color: 'var(--text-muted)' }}>
            {provider === 'huggingface' ? 'HF Token' : 'API Key'}
          </span>
          <input
            type="password"
            className="kd-input"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasKey ? '已保存（输入新值可覆盖）' : provider === 'huggingface' ? 'hf_…' : 'sk-…'}
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span style={{ color: 'var(--text-muted)' }}>模型</span>
          <input
            className="kd-input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={
              provider === 'huggingface' ? 'BAAI/bge-small-zh-v1.5' : 'BAAI/bge-m3'
            }
          />
          <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
            {provider === 'huggingface'
              ? '推荐 BAAI/bge-small-zh-v1.5（中文）或 BAAI/bge-small-en-v1.5（英文），dim≈384。'
              : '须填 embedding 模型 ID（常含 embed / bge），不要填对话模型。'}
          </span>
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
        {vectorReady ? (
          <div
            className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
            style={{
              background: 'color-mix(in srgb, var(--success) 14%, transparent)',
              color: 'var(--success)',
            }}
          >
            <span aria-hidden>●</span>
            <span>嵌入已通 · dim={lastDim}，向量检索可用</span>
          </div>
        ) : (
          <div
            className="mt-1 rounded-xl px-3 py-2 text-xs"
            style={{
              background: 'color-mix(in srgb, #eab308 16%, transparent)',
              color: '#ca8a04',
            }}
          >
            当前未通过嵌入自检（或网关无 embedding 模型），向量检索暂不可用，全文搜索仍可用。
          </div>
        )}
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
                setEmbedWarning('')
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
                setEmbedWarning('')
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
                setMsg(r.canceled ? '已取消' : `导入 ${r.imported}，跳过 ${r.skipped}`)
                setEmbedWarning('')
              })
            }
          >
            导入备份
          </button>
        </div>
      </div>

      {embedWarning && (
        <p className="text-xs" style={{ color: 'var(--accent-soft)' }}>
          {embedWarning}
        </p>
      )}
      {msg && (
        <p
          className="text-xs"
          style={{
            color: /失败|错误|error|HTTP\s*\d/i.test(msg) ? 'var(--danger)' : 'var(--success)',
          }}
        >
          {msg}
        </p>
      )}
      <p className="mt-auto text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
        api {window.api?.version}
      </p>
    </div>
  )
}
