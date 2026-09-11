export type EmbedSettings = {
  apiBase: string
  apiKey: string
  model: string
}

export async function embedTexts(
  texts: string[],
  settings: EmbedSettings,
): Promise<number[][]> {
  if (!texts.length) return []
  const base = settings.apiBase.replace(/\/$/, '')
  const url = `${base}/embeddings`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({ model: settings.model, input: texts }),
  })
  if (!res.ok) {
    const body = await res.text()
    let hint = ''
    if (res.status === 404 || res.status === 405) {
      hint =
        '。请确认 Base 以 /v1 结尾（不要带 /embeddings 或 /chat/completions），且模型为 Embedding 模型（如 BAAI/bge-m3），不是对话模型。'
    }
    throw new Error(`embed HTTP ${res.status}: ${body.slice(0, 300)}${hint}`)
  }
  const json = (await res.json()) as {
    data: { embedding: number[]; index: number }[]
  }
  const sorted = [...json.data].sort((a, b) => a.index - b.index)
  return sorted.map((d) => d.embedding)
}
