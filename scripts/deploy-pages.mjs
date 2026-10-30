// 部署到 Cloudflare Pages（Direct Upload），不依赖 wrangler
// 用法：node scripts/deploy-pages.mjs
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');

const envText = await readFile('$HOME/secrets/cloudflare.env', 'utf8');
const env = Object.fromEntries(
  envText.split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const minx = Object.fromEntries(
  (await readFile('$HOME/secrets/minxtok.env', 'utf8'))
    .split('\n').filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const ACCOUNT = env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = env.CLOUDFLARE_API_TOKEN;
const PROJECT = 'minxtok';
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;
const AUTH = { Authorization: `Bearer ${TOKEN}` };

// 读取本地 OpenAI 兼容模型 Key（复用 OpenClaw 已有的 DeepSeek 配置）
const cfg = JSON.parse(await readFile('/root/.openclaw/openclaw.json', 'utf8'));
const provider = cfg.models.providers.deepseek || cfg.models.providers.openai;
const LLM_KEY = provider && provider.apiKey;
if (!LLM_KEY) throw new Error('LLM API key not found in openclaw config');

// 阿里云短信 AK：只放在 Pages 环境变量（secret_text），前端拿不到
const smsEnv = {};
if (minx.ALIYUN_AK_ID && minx.ALIYUN_AK_SECRET) {
  smsEnv.ALIYUN_AK_ID = { type: 'secret_text', value: minx.ALIYUN_AK_ID };
  smsEnv.ALIYUN_AK_SECRET = { type: 'secret_text', value: minx.ALIYUN_AK_SECRET };
}

// 1) 绑定 KV / D1 / 环境变量
const patchBody = {
  deployment_configs: {
    production: {
      compatibility_date: '2026-10-01',
      kv_namespaces: { MINXTOK_KV: { namespace_id: 'YOUR_KV_NAMESPACE_ID' } },
      d1_databases: { DB: { id: 'YOUR_D1_DATABASE_ID' } },
      env_vars: {
        LLM_BASE_URL: { type: 'plain_text', value: 'https://api.deepseek.com' },
        LLM_MODEL: { type: 'plain_text', value: 'deepseek-chat' },
        LLM_MAX_TOKENS: { type: 'plain_text', value: '1200' },
        DAILY_QUOTA: { type: 'plain_text', value: '200' },
        RATE_PER_MIN: { type: 'plain_text', value: '15' },
        CORS_ORIGIN: { type: 'plain_text', value: '*' },
        FOLLOWUPS: { type: 'plain_text', value: '1' },
        LLM_API_KEY: { type: 'secret_text', value: LLM_KEY },
        ADMIN_TOKEN: { type: 'secret_text', value: minx.ADMIN_TOKEN },
        ...smsEnv,
      },
    },
  },
};
// 2) 计算文件哈希并上传静态资源（递归目录）
async function walkFiles(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...await walkFiles(join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}
const files = await walkFiles(DIST);
const manifest = {};
const buffers = [];
for (const f of files) {
  const buf = await readFile(join(DIST, f));
  manifest['/' + f] = createHash('sha256').update(buf).digest('hex');
  buffers.push([f, buf]);
}
// Pages 的资源仓库要先换上传 JWT，再用 JSON（base64）写入，不是 multipart
const typeOf = (f) => {
  if (f.endsWith('.html')) return 'text/html; charset=utf-8';
  if (f.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (f.endsWith('.css')) return 'text/css; charset=utf-8';
  if (f.endsWith('.json')) return 'application/json; charset=utf-8';
  if (f.endsWith('.svg')) return 'image/svg+xml';
  if (f.endsWith('.png')) return 'image/png';
  if (f.endsWith('.jpg') || f.endsWith('.jpeg')) return 'image/jpeg';
  if (f.endsWith('.webp')) return 'image/webp';
  if (f.endsWith('.woff2')) return 'font/woff2';
  if (f.endsWith('.woff')) return 'font/woff';
  if (f.endsWith('.mp3')) return 'audio/mpeg';
  return 'application/octet-stream';
};
const tokenRes = await fetch(`${API}/pages/projects/${PROJECT}/upload-token`, { headers: AUTH });
const tokenOut = await tokenRes.json();
const jwt = tokenOut.result && tokenOut.result.jwt;
if (!jwt) throw new Error('上传令牌获取失败: ' + JSON.stringify(tokenOut.errors || tokenOut));
// 一次把所有资源塞进请求体会超过 Pages 的上传体积上限（表现为 400 Authentication failed），
// 按体积和文件数分批上传。
const batches = [];
let batch = [];
let batchBytes = 0;
for (const [f, buf] of buffers) {
  const size = buf.length;
  if (batch.length && (batch.length >= 40 || batchBytes + size > 4 * 1024 * 1024)) {
    batches.push(batch);
    batch = [];
    batchBytes = 0;
  }
  batch.push([f, buf]);
  batchBytes += size;
}
if (batch.length) batches.push(batch);

let uploaded = 0;
for (let i = 0; i < batches.length; i++) {
  const payload = batches[i].map(([f, buf]) => ({
    key: manifest['/' + f],
    value: buf.toString('base64'),
    base64: true,
    metadata: { contentType: typeOf(f) },
  }));
  const uRes = await fetch(`${API}/pages/assets/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const uOut = await uRes.json();
  if (!uRes.ok || !uOut.success) {
    console.error(`上传资源失败（第 ${i + 1}/${batches.length} 批）:`, uRes.status, JSON.stringify(uOut.errors || uOut));
    console.error('可改用：wrangler pages deploy dist --project-name minxtok --branch main');
    process.exit(1);
  }
  uploaded += (uOut.result && uOut.result.successful_key_count) || payload.length;
  console.log(`上传资源 ${i + 1}/${batches.length}:`, payload.length, '个文件');
}
console.log('上传资源: OK，共', uploaded, '个文件');

// 3) 绑定 KV / D1 / 环境变量
// 注意：这一步必须放在资源上传之后。PATCH 项目配置会让刚换到的上传 JWT 失效，
// 先绑定再上传会报 400 Authentication failed（9106）。
const pRes = await fetch(`${API}/pages/projects/${PROJECT}`, {
  method: 'PATCH', headers: { ...AUTH, 'Content-Type': 'application/json' },
  body: JSON.stringify(patchBody),
});
const pOut = await pRes.json();
console.log('绑定:', pRes.status, pOut.success ? 'OK' : JSON.stringify(pOut.errors));

// 4) 创建部署
const dRes = await fetch(`${API}/pages/projects/${PROJECT}/deployments`, {
  method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' },
  body: JSON.stringify({ manifest, branch: 'main' }),
});
const dOut = await dRes.json();
console.log('部署:', dRes.status, dOut.success ? 'OK' : JSON.stringify(dOut.errors));
if (dOut.success) console.log('地址:', dOut.result.url, '| 别名: https://' + PROJECT + '.pages.dev');
