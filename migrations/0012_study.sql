CREATE TABLE IF NOT EXISTS study_items (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_study_uid ON study_items(uid, kind, created_at);
