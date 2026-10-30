CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  uid TEXT,
  account TEXT,
  type TEXT NOT NULL DEFAULT 'other',
  text TEXT NOT NULL,
  contact TEXT,
  ua TEXT,
  page TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fb_created ON feedback(created_at);
