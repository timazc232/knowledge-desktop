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

export function getEmbedSettings(db: Db) {
  return {
    apiBase: normalizeEmbedApiBase(
      getSetting(db, 'embed.apiBase') || 'https://api.siliconflow.cn/v1',
    ),
    apiKey: getSecret(db, 'embed.apiKey') || '',
    model: getSetting(db, 'embed.model') || 'BAAI/bge-m3',
  }
}
