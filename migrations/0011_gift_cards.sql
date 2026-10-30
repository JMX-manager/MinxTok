CREATE TABLE IF NOT EXISTS gift_cards (
  id TEXT PRIMARY KEY,
  uid TEXT,
  title TEXT NOT NULL,
  subtitle TEXT,
  amount INTEGER NOT NULL,
  unit TEXT DEFAULT '点',
  emoji TEXT,
  surprise TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  claimed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gc_uid ON gift_cards(uid, status, created_at);
