CREATE TABLE IF NOT EXISTS recovery_codes (
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recovery_user ON recovery_codes(user_id);
