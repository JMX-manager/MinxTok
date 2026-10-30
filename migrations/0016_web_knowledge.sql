-- 主聊天联网学习：把查到的公开网页资料按用户存下来，下一次相近问题先翻旧资料
CREATE TABLE IF NOT EXISTS web_knowledge (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  query TEXT NOT NULL,
  title TEXT,
  url TEXT NOT NULL,
  snippet TEXT,
  site TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webknow_uid_url ON web_knowledge(uid, url);
CREATE INDEX IF NOT EXISTS idx_webknow_uid_time ON web_knowledge(uid, created_at);
