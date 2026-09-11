import { createRequire } from 'node:module'
import type { Db } from '../db/index'

const require = createRequire(import.meta.url)

export function getSetting(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings(key, value) VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value)
}

type SafeStorageLike = {
  isEncryptionAvailable: () => boolean
  encryptString: (s: string) => Buffer
  decryptString: (b: Buffer) => string
}

function trySafeStorage(): SafeStorageLike | null {
  try {
    const { safeStorage } = require('electron') as { safeStorage: SafeStorageLike }
    return safeStorage
  } catch {
    return null
  }
}

export function setSecret(db: Db, key: string, plain: string): void {
  const safeStorage = trySafeStorage()
  if (!safeStorage?.isEncryptionAvailable()) {
    setSetting(db, key, plain)
    setSetting(db, `${key}__enc`, '0')
    return
  }
  const buf = safeStorage.encryptString(plain)
  setSetting(db, key, buf.toString('base64'))
  setSetting(db, `${key}__enc`, '1')
}

export function getSecret(db: Db, key: string): string | null {
  const raw = getSetting(db, key)
  if (!raw) return null
  const enc = getSetting(db, `${key}__enc`)
  if (enc !== '1') return raw
  const safeStorage = trySafeStorage()
  if (!safeStorage) return null
  try {
    return safeStorage.decryptString(Buffer.from(raw, 'base64'))
  } catch {
    return null
  }
}

/** Strip mistaken OpenAI path suffixes so Base is .../v1 (client appends /embeddings). */
export function normalizeEmbedApiBase(raw: string): string {
  let base = (raw || '').trim().replace(/\/+$/, '')
  let changed = true
  while (changed && base) {
    changed = false
    const lower = base.toLowerCase()
    // Longer suffixes first so /chat/completions beats /completions
    for (const suffix of ['/chat/completions', '/completions', '/embeddings'] as const) {
      if (lower.endsWith(suffix)) {
        base = base.slice(0, -suffix.length).replace(/\/+$/, '')
        changed = true
        break
      }
    }
  }
  return base
}

export type EmbedProvider = 'openai' | 'huggingface'

export const HF_INFERENCE_BASE = 'https://router.huggingface.co/hf-inference'

export function getEmbedSettings(db: Db) {
  const providerRaw = (getSetting(db, 'embed.provider') || 'openai').toLowerCase()
  const provider: EmbedProvider =
    providerRaw === 'huggingface' || providerRaw === 'hf' ? 'huggingface' : 'openai'
  const defaultBase =
    provider === 'huggingface' ? HF_INFERENCE_BASE : 'https://api.siliconflow.cn/v1'
  const defaultModel =
    provider === 'huggingface' ? 'BAAI/bge-small-zh-v1.5' : 'BAAI/bge-m3'
  const rawBase = getSetting(db, 'embed.apiBase') || defaultBase
  return {
    provider,
    apiBase:
      provider === 'huggingface'
        ? (rawBase || HF_INFERENCE_BASE).replace(/\/+$/, '')
        : normalizeEmbedApiBase(rawBase),
    apiKey: getSecret(db, 'embed.apiKey') || '',
    model: getSetting(db, 'embed.model') || defaultModel,
  }
}
