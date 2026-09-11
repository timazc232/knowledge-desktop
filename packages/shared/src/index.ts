export type EmbedStatus =
  | 'pending'
  | 'processing'
  | 'done'
  | 'failed'
  | 'skipped_no_key'

export type SourceType =
  | 'manual'
  | 'in_app_clip'
  | 'extension'
  | 'clipboard'
  | 'import'
  | 'file_import'

export const DEFAULT_BOOKMARKS = [
  { title: 'ChatGPT', url: 'https://chatgpt.com' },
  { title: 'Grok', url: 'https://grok.com' },
  { title: 'Gemini', url: 'https://gemini.google.com' },
  { title: 'Google', url: 'https://www.google.com' },
  { title: 'X', url: 'https://x.com' },
  { title: 'Telegram', url: 'https://web.telegram.org' },
] as const

export const BACKUP_FORMAT = 'knowledge-backup-v1' as const
