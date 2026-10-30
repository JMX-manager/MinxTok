-- MinxTok D1 初始化
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_uid ON conversations(uid, updated_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conv_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  role TEXT NOT NULL,
  blocks TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conv_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_uid ON messages(uid, created_at);

CREATE TABLE IF NOT EXISTS usage (
  uid TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (uid, day)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind, ts);
