-- 每条消息的情绪标签：只存情绪 key + 强度，不存任何原文，控制存储成本
CREATE TABLE IF NOT EXISTS message_emotion (
  message_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  conv_id TEXT,
  role TEXT NOT NULL,
  emo TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msgemo_uid ON message_emotion(uid, created_at);
CREATE INDEX IF NOT EXISTS idx_msgemo_uid_emo ON message_emotion(uid, emo, created_at);
