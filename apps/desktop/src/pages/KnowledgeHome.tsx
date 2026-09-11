import { useState } from 'react'

export default function KnowledgeHome() {
  const [body, setBody] = useState('')
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!body.trim()) {
      setStatus('请输入内容')
      return
    }
    setSaving(true)
    try {
      const item = await window.api.knowledgeCreate({
        title: title.trim() || undefined,
        body,
        source_type: 'manual',
      })
      setStatus(`已保存 · ${item.id.slice(0, 8)}… · 向量状态: ${item.embed_status}`)
      setBody('')
      setTitle('')
    } catch (err) {
      setStatus(`失败: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 p-6">
      <div>
        <h2 className="text-lg font-semibold text-white">新建知识</h2>
        <p className="mt-1 text-sm text-white/50">
          粘贴笔记或划词内容。保存后自动切块并排队嵌入。快捷键 Ctrl+Shift+S 可从剪贴板入库。
        </p>
      </div>
      <input
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-500/50"
        placeholder="标题（可选，默认取正文前 40 字）"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="min-h-[280px] flex-1 resize-y rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm leading-relaxed outline-none focus:border-emerald-500/50"
        placeholder="在此粘贴或输入…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {saving ? '保存中…' : '存入知识库'}
        </button>
        {status && <span className="text-xs text-white/50">{status}</span>}
      </div>
    </div>
  )
}
