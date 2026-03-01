-- Mood Editor SQLite Schema
-- Notes, tags, context sets, FTS

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS notes (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL CHECK(type IN ('conversation','document','hybrid')),
  title         TEXT NOT NULL DEFAULT '',
  content       TEXT,
  pi_session    TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','dropped')),
  pinned        INTEGER NOT NULL DEFAULT 0,
  context_set   TEXT REFERENCES context_sets(id),
  inline_conversations TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  color         TEXT,
  template      TEXT
);

CREATE TABLE IF NOT EXISTS note_tags (
  note_id       TEXT REFERENCES notes(id) ON DELETE CASCADE,
  tag_id        TEXT REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE IF NOT EXISTS context_sets (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  trigger_tags  TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS context_items (
  id            TEXT PRIMARY KEY,
  context_set   TEXT REFERENCES context_sets(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK(type IN ('local','github','notion','note','url','clipboard')),
  reference     TEXT NOT NULL,
  label         TEXT NOT NULL,
  pinned        INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS note_context (
  id            TEXT PRIMARY KEY,
  note_id       TEXT REFERENCES notes(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  reference     TEXT NOT NULL,
  label         TEXT NOT NULL,
  content_cache TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS note_links (
  source_id     TEXT REFERENCES notes(id) ON DELETE CASCADE,
  target_id     TEXT REFERENCES notes(id) ON DELETE CASCADE,
  link_type     TEXT NOT NULL CHECK(link_type IN ('distilled_from','references','forked_from')),
  PRIMARY KEY (source_id, target_id)
);

-- Full-text search index
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title,
  content,
  content=notes,
  content_rowid=rowid
);

-- FTS triggers for auto-sync
CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, old.content);
  INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;

-- App settings (key-value)
CREATE TABLE IF NOT EXISTS settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(type);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(target_id);
