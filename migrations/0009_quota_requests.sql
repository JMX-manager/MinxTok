CREATE TABLE IF NOT EXISTS quota_requests (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_qr_status ON quota_requests(status, created_at);
