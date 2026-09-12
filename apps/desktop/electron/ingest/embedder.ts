export type EmbedProvider = 'openai' | 'huggingface'

export type EmbedSettings = {
  provider: EmbedProvider
  apiBase: string
  apiKey: string
  model: string
}

async function postJson(url: string, body: unknown, apiKey: string): Promise<Response> {
  // Electron's Chromium network stack follows the desktop proxy/network setup
  // more reliably than Node/undici on Windows (especially for HF endpoints).
  try {
    const electron = await import('electron')
    if (electron.net?.fetch) {
      return electron.net.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      })
    }
  } catch {
    // Smoke scripts run outside Electron; use the normal Node fetch there.
  }
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })
}

function looksLikeChatModel(model: string): boolean {
  const m = (model || '').toLowerCase()
  if (!m) return false
  if (/embed|bge|e5|gte-|text-embedding|embedding/i.test(m)) return false
  return /chat|flash|instruct|gpt-|claude|qwen.*max|glm-|deepseek|gemini|turbo/i.test(m)
}

function flattenHfEmbedding(raw: unknown): number[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  // feature-extraction may return number[] or number[][] (token vectors)
  if (typeof raw[0] === 'number') return raw as number[]
  const rows = raw as number[][]
  const dim = rows[0]?.length ?? 0
  if (!dim) return []
  const out = new Array(dim).fill(0)
  for (const row of rows) {
    for (let i = 0; i < dim; i++) out[i] += row[i] || 0
  }
  for (let i = 0; i < dim; i++) out[i] /= rows.length
  return out
}

function parseHfEmbeddings(raw: unknown, count: number): number[][] {
  if (count === 1) {
    const vector = flattenHfEmbedding(raw)
    return vector.length ? [vector] : []
  }
  if (!Array.isArray(raw) || raw.length !== count) return []
  return raw.map((item) => flattenHfEmbedding(item)).filter((vector) => vector.length > 0)
}

async function embedViaHuggingFace(
  texts: string[],
  settings: EmbedSettings,
): Promise<number[][]> {
  const root = (settings.apiBase || 'https://router.huggingface.co/hf-inference').replace(
    /\/+$/,
    '',
  )
  const model = settings.model || 'BAAI/bge-small-zh-v1.5'
  // The hf-inference provider currently accepts feature extraction through
  // this pipeline route (and this is the route verified by the app smoke test).
  const url = `${root}/models/${model}/pipeline/feature-extraction`
  const res = await postJson(url, { inputs: texts }, settings.apiKey)
  if (!res.ok) {
    const body = await res.text()
    let hint = ''
    if (res.status === 401 || res.status === 403) {
      hint = '。请确认 Hugging Face Read Token 有效。'
    } else if (res.status === 404) {
      hint = '。请确认模型 ID（如 BAAI/bge-small-zh-v1.5）支持 feature-extraction。'
    } else if (res.status === 503) {
      hint = '。模型正在加载，稍后重试。'
    }
    throw new Error(`embed HF HTTP ${res.status}: ${body.slice(0, 180)}${hint}`)
  }
  const embeddings = parseHfEmbeddings(await res.json(), texts.length)
  if (embeddings.length !== texts.length) {
    throw new Error(`embed HF: response count mismatch (expected ${texts.length}, got ${embeddings.length})`)
  }
  return embeddings
}

export async function embedTexts(
  texts: string[],
  settings: EmbedSettings,
): Promise<number[][]> {
  const cleaned = texts.map((t) => (t ?? '').trim()).filter((t) => t.length > 0)
  if (!cleaned.length) return []

  if ((settings.provider || 'openai') === 'huggingface') {
    return embedViaHuggingFace(cleaned, settings)
  }

  const base = settings.apiBase.replace(/\/$/, '')
  const url = `${base}/embeddings`
  const input: string | string[] = cleaned.length === 1 ? cleaned[0]! : cleaned
  const res = await postJson(url, { model: settings.model, input }, settings.apiKey)
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
