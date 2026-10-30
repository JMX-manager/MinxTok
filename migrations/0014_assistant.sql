-- 助理设置与助理日记
CREATE TABLE IF NOT EXISTS assistant_settings (
  uid TEXT PRIMARY KEY,
  name TEXT,
  user_name TEXT,
  user_bio TEXT,
  memory TEXT,
  persona TEXT,
  traits TEXT,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS assistant_diaries (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  period TEXT,
  content TEXT,
  created_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_assistant_diaries_uid_created
  ON assistant_diaries (uid, created_at DESC);
