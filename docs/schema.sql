-- Knowledge Desktop schema (SQLite)
-- format paired with knowledge-backup-v1

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_items (
  id TEXT PRIMARY KEY,
  title TEXT,
  body TEXT NOT NULL,
  source_url TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  -- manual | in_app_clip | extension | clipboard | import | file_import
  source_title TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  embed_status TEXT NOT NULL DEFAULT 'pending',
  -- pending | processing | done | failed | skipped_no_key
  embed_error TEXT,
  content_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_items_created ON knowledge_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_embed ON knowledge_items(embed_status);
CREATE INDEX IF NOT EXISTS idx_items_source_type ON knowledge_items(source_type);

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_items_fts USING fts5(
  title,
  body,
  content='knowledge_items',
  content_rowid='rowid'
);

-- FTS sync triggers
CREATE TRIGGER IF NOT EXISTS knowledge_items_ai AFTER INSERT ON knowledge_items BEGIN
  INSERT INTO knowledge_items_fts(rowid, title, body)
  VALUES (new.rowid, coalesce(new.title, ''), new.body);
END;

CREATE TRIGGER IF NOT EXISTS knowledge_items_ad AFTER DELETE ON knowledge_items BEGIN
  INSERT INTO knowledge_items_fts(knowledge_items_fts, rowid, title, body)
  VALUES ('delete', old.rowid, coalesce(old.title, ''), old.body);
END;

CREATE TRIGGER IF NOT EXISTS knowledge_items_au AFTER UPDATE ON knowledge_items BEGIN
  INSERT INTO knowledge_items_fts(knowledge_items_fts, rowid, title, body)
  VALUES ('delete', old.rowid, coalesce(old.title, ''), old.body);
  INSERT INTO knowledge_items_fts(rowid, title, body)
  VALUES (new.rowid, coalesce(new.title, ''), new.body);
END;

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  UNIQUE(item_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunks_item ON knowledge_chunks(item_id);

-- Vector backend metadata (actual vectors in sqlite-vec virtual table or Lance dir)
CREATE TABLE IF NOT EXISTS vector_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- keys: backend=sqlite-vec|lance, model=, dim=, lance_path=

-- Optional mapping if vectors live outside rowid alignment
CREATE TABLE IF NOT EXISTS chunk_vector_ref (
  chunk_id TEXT PRIMARY KEY REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
  backend_ref TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingest_jobs (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  -- queued | running | done | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON ingest_jobs(status, created_at);

CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmarks_url ON bookmarks(url);

CREATE TABLE IF NOT EXISTS browser_tabs (
  id TEXT PRIMARY KEY,
  title TEXT,
  url TEXT NOT NULL,
  favicon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  sleeping INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS export_history (
  id TEXT PRIMARY KEY,
  path TEXT,
  kind TEXT NOT NULL, -- full | text_only
  item_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, strftime('%s','now') * 1000);

-- Default bookmarks seeded by app, not SQL, so locales can vary.

-- Vector DDL is backend-specific (created in migration after smoke test):
-- sqlite-vec example:
--   CREATE VIRTUAL TABLE chunk_embeddings USING vec0(embedding float[1024]);
--   STORE chunk_id mapping via chunk_vector_ref.backend_ref = rowid or vec id
-- lance: vectors live under userData/lance/; chunk_vector_ref.backend_ref = lance row id
