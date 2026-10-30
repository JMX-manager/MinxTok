CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_articles_uid ON articles(uid, updated_at);
