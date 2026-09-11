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

export function getEmbedSettings(db: Db) {
  return {
    apiBase: getSetting(db, 'embed.apiBase') || 'https://api.siliconflow.cn/v1',
    apiKey: getSecret(db, 'embed.apiKey') || '',
    model: getSetting(db, 'embed.model') || 'BAAI/bge-m3',
  }
}
