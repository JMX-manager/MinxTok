#!/usr/bin/env node
// 部署脚本：直接用 Cloudflare API 上传 Worker（不依赖 wrangler）
// 用法：node scripts/deploy.mjs
import { readFile, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

// 读密钥文件
const envText = await readFile('$HOME/secrets/cloudflare.env', 'utf8');
const env = Object.fromEntries(
  envText.split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);

const ACCOUNT = env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = env.CLOUDFLARE_API_TOKEN;
const SCRIPT = 'minxtok';
const KV_ID = 'YOUR_KV_NAMESPACE_ID';
const D1_ID = 'YOUR_D1_DATABASE_ID';
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;

const bindings = [
  { type: 'kv_namespace', name: 'MINXTOK_KV', namespace_id: KV_ID },
  { type: 'd1', name: 'DB', id: D1_ID },
  { type: 'plain_text', name: 'LLM_BASE_URL', text: 'https://api.deepseek.com' },
  { type: 'plain_text', name: 'LLM_MODEL', text: 'deepseek-chat' },
  { type: 'plain_text', name: 'LLM_MAX_TOKENS', text: '1200' },
  { type: 'plain_text', name: 'DAILY_QUOTA', text: '200' },
  { type: 'plain_text', name: 'RATE_PER_MIN', text: '15' },
  { type: 'plain_text', name: 'CORS_ORIGIN', text: '*' },
  { type: 'plain_text', name: 'FOLLOWUPS', text: '1' },
];

const metadata = {
  main_module: 'index.js',
  compatibility_date: '2026-10-01',
  bindings,
  observability: { enabled: true },
};

// 组装 multipart：metadata + 所有模块
const form = new FormData();
form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata');

const files = (await readdir(SRC)).filter(f => f.endsWith('.js'));
for (const f of files) {
  const code = await readFile(join(SRC, f), 'utf8');
  form.append(f, new Blob([code], { type: 'application/javascript+module' }), f);
}

console.log('上传模块:', files.join(', '));
const res = await fetch(`${API}/workers/scripts/${SCRIPT}`, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${TOKEN}` },
  body: form,
});
const out = await res.json();
console.log('部署:', res.status, out.success ? 'OK' : JSON.stringify(out.errors));
if (!out.success) process.exit(1);

// 打开 workers.dev 子域
const sub = await fetch(`${API}/workers/scripts/${SCRIPT}/subdomain`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ enabled: true, previews_enabled: false }),
});
const subOut = await sub.json();
console.log('子域:', subOut.success ? 'enabled' : JSON.stringify(subOut.errors));
console.log('地址: https://minxtok.' + 'workers.dev');
