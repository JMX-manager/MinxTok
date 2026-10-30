CREATE TABLE IF NOT EXISTS diaries (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  day TEXT NOT NULL,
  content TEXT NOT NULL,
  mood TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_diaries_uid_day ON diaries(uid, day);
