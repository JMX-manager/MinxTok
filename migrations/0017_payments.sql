-- 2026-10-28 人工代充流水（每一笔充值都留档，便于对账）
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,          -- 流水号 MX + 北京时间 yyyyMMddHHmmss + 4 位随机
  uid TEXT NOT NULL,            -- 被充值用户
  amount INTEGER NOT NULL,      -- 次数（1~999）
  key_day TEXT NOT NULL,        -- 当天充值密钥对应的日期（北京时区）
  ip TEXT,
  ua TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_uid ON payments(uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_day ON payments(key_day);
