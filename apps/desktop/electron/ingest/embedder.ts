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
    throw new Error(`embed HTTP ${res.status}: ${body.slice(0, 300)}`)
  }
  const json = (await res.json()) as {
    data: { embedding: number[]; index: number }[]
  }
  const sorted = [...json.data].sort((a, b) => a.index - b.index)
  return sorted.map((d) => d.embedding)
}
