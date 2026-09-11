import { useEffect, useRef } from 'react'

export type KnowledgeEditDraft = {
  id?: string
  title: string
  body: string
  tags: string
}

type Props = {
  open: boolean
  draft: KnowledgeEditDraft
  saving?: boolean
  heading?: string
  onChange: (next: KnowledgeEditDraft) => void
  onSave: () => void
  onCancel: () => void
}

export default function KnowledgeEditModal({
  open,
  draft,
  saving = false,
  heading = '编辑知识',
  onChange,
  onSave,
  onCancel,
}: Props) {
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => bodyRef.current?.focus())
    }
  }, [open, draft.id])

  if (!open) return null

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
      <div
        className="kd-card flex w-full max-w-md flex-col gap-3 p-5 shadow-2xl"
        style={{ border: '1px solid var(--border)' }}
        role="dialog"
        aria-modal="true"
      >
        <h3 className="text-sm font-semibold">{heading}</h3>
        <input
          className="kd-input"
          placeholder="标题（可选）"
          value={draft.title}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
        />
        <textarea
          ref={bodyRef}
          className="kd-input min-h-[160px] resize-y leading-relaxed"
          placeholder="正文…"
          value={draft.body}
          onChange={(e) => onChange({ ...draft, body: e.target.value })}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              onSave()
            }
            if (e.key === 'Escape' && !saving) {
              e.preventDefault()
              onCancel()
            }
          }}
        />
        <input
          className="kd-input"
          placeholder="标签（可选，逗号分隔）"
          value={draft.tags}
          onChange={(e) => onChange({ ...draft, tags: e.target.value })}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="kd-btn kd-btn-ghost"
            disabled={saving}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="kd-btn kd-btn-primary"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function parseTags(raw: string): string[] {
  return raw
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean)
}

export function tagsToString(tagsJson: string | null | undefined): string {
  try {
    const arr = JSON.parse(tagsJson || '[]') as unknown
    if (Array.isArray(arr)) return arr.map(String).join(', ')
  } catch {
    /* ignore */
  }
  return ''
}
