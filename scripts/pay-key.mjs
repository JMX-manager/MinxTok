#!/usr/bin/env node
// 打印当天（以及前一天）的充值密钥。
// 密钥 = HMAC-SHA256(PAY_KEY_SECRET, "minxtok-pay:<北京日期>") 取前 8 位，字符集去掉 0/O/1/I。
// 用法： set -a; . $HOME/secrets/minxtok-pay.env; set +a; node scripts/pay-key.mjs [YYYY-MM-DD]
import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const secret = process.env.PAY_KEY_SECRET;
if (!secret) {
  console.error('缺少 PAY_KEY_SECRET：先 source $HOME/secrets/minxtok-pay.env');
  process.exit(1);
}

const cnDay = (d = new Date()) => new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);

function keyOf(day) {
  const sig = crypto.createHmac('sha256', secret).update(`minxtok-pay:${day}`).digest();
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHABET[sig[i] % ALPHABET.length];
  return out;
}

const args = process.argv.slice(2).filter(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
if (args.length) {
  for (const d of args) console.log(d, keyOf(d));
} else {
  const today = cnDay();
  const yest = cnDay(new Date(Date.now() - 86400000));
  console.log(`今天 ${today}  ${keyOf(today)}`);
  console.log(`昨天 ${yest}  ${keyOf(yest)}  （0:00–0:30 仍可用）`);
}
