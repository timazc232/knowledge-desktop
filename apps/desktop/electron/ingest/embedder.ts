export type EmbedSettings = {
  apiBase: string
  apiKey: string
  model: string
}

function looksLikeChatModel(model: string): boolean {
  const m = (model || '').toLowerCase()
  if (!m) return false
  if (/embed|bge|e5|gte-|text-embedding|embedding/i.test(m)) return false
  return /chat|flash|instruct|gpt-|claude|qwen.*max|glm-|deepseek|gemini|turbo/i.test(m)
}

export async function embedTexts(
  texts: string[],
  settings: EmbedSettings,
): Promise<number[][]> {
  const cleaned = texts.map((t) => (t ?? '').trim()).filter((t) => t.length > 0)
  if (!cleaned.length) return []
  const base = settings.apiBase.replace(/\/$/, '')
  const url = `${base}/embeddings`
  // Many gateways accept string for single input; arrays can be rejected as empty.
  const input: string | string[] = cleaned.length === 1 ? cleaned[0]! : cleaned
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({ model: settings.model, input }),
  })
  if (!res.ok) {
    const body = await res.text()
    let hint = ''
    if (res.status === 404 || res.status === 405) {
      hint =
        '。请确认 Base 以 /v1 结尾（不要带 /embeddings 或 /chat/completions），且模型为 Embedding 模型（如 BAAI/bge-m3），不是对话模型。'
    } else if (res.status === 400 && /empty|input/i.test(body)) {
      hint =
        '。请检查 embedding 接口的 input 格式（单条应为字符串）；并确认模型为 embedding 而非 chat。'
    } else if (
      res.status === 400 &&
      (/invalid|bad.?request|not valid|unknown.?model|model/i.test(body) ||
        looksLikeChatModel(settings.model))
    ) {
      hint =
        '。请使用 embedding 模型 ID（名称常含 embed / bge / embedding），不要填对话模型（如 glm-*-flash、qwen*-chat）。'
    }
    throw new Error(`embed HTTP ${res.status}: ${body.slice(0, 180)}${hint}`)
  }
  const json = (await res.json()) as {
    data: { embedding: number[]; index: number }[]
  }
  const sorted = [...json.data].sort((a, b) => a.index - b.index)
  return sorted.map((d) => d.embedding)
}
