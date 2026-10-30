-- 新用户引导：称呼、性别、生日、兴趣与完成标记
-- 现有用户直接标记为已引导，避免升级后突然看到新手流程。
ALTER TABLE assistant_settings ADD COLUMN user_gender TEXT;
ALTER TABLE assistant_settings ADD COLUMN user_birthday TEXT;
ALTER TABLE assistant_settings ADD COLUMN user_interests TEXT;
ALTER TABLE assistant_settings ADD COLUMN onboarded INTEGER DEFAULT 0;
UPDATE assistant_settings SET onboarded = 1;
