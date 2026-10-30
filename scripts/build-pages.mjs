// 构建 Pages Functions 单文件：把 src/*.js 按依赖顺序拼成 _worker.js
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ORDER = ['prompts.js', 'blocks.js', 'util.js', 'store.js', 'llm.js', 'assistant.js', 'music.js', 'article.js', 'gift.js', 'study.js', 'drill.js','course.js', 'chat.js', 'admin.js', 'cards.js', 'media.js', 'sms.js', 'auth.js', 'webauthn.js', 'diary.js', 'emotion.js', 'search.js', 'web.js', 'quota.js', 'pay.js', 'tool.js', 'feedback.js', 'dict.js','chem.js', 'archive.js', 'survey.js', 'index.js'];

let out = '// MinxTok — 由 scripts/build-pages.mjs 自动生成，勿手改\n';

for (const f of ORDER) {
  let code = await readFile(join(ROOT, 'src', f), 'utf8');
  // 去掉 import 语句
  code = code.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm, '');
  // export default 转成具名常量
  code = code.replace(/^export\s+default\s+/m, 'const __defaultExport = ');
  // 其余 export 去掉关键字
  code = code.replace(/^export\s+(async\s+function|function|const|let|class)/gm, '$1');
  out += `\n// ===== ${f} =====\n${code.trim()}\n`;
}

// 版本戳：前端拿 /api/version 的 stamp 判断"有没有新版本可加载"
let appVer = '0.0.0';
try {
  const appJs = await readFile(join(ROOT, 'public', 'js', 'app.js'), 'utf8');
  const m = appJs.match(/ver:\s*'(\d+\.\d+\.\d+)'/);
  if (m) appVer = m[1];
} catch (_) {}
const stamp = `${appVer}.${Date.now()}`;
out += `\nconst BUILD_STAMP = ${JSON.stringify(stamp)};\nconst BUILD_VER = ${JSON.stringify(appVer)};\n`;
out += '\nexport default __defaultExport;\n';

await mkdir(join(ROOT, 'dist'), { recursive: true });
await writeFile(join(ROOT, 'dist', '_worker.js'), out, 'utf8');

// 拷贝前端静态资源到 dist
const { cp, rm } = await import('node:fs/promises');
await rm(join(ROOT, 'dist', 'assets'), { recursive: true, force: true });
await rm(join(ROOT, 'dist', 'js'), { recursive: true, force: true });
await cp(join(ROOT, 'public', 'assets'), join(ROOT, 'dist', 'assets'), { recursive: true });
await cp(join(ROOT, 'public', 'js'), join(ROOT, 'dist', 'js'), { recursive: true });
await cp(join(ROOT, 'public', 'vendor'), join(ROOT, 'dist', 'vendor'), { recursive: true });
await cp(join(ROOT, 'public', 'index.html'), join(ROOT, 'dist', 'index.html'));
await cp(join(ROOT, 'public', 'pay.html'), join(ROOT, 'dist', 'pay.html'));

console.log('已生成 dist/_worker.js，', out.length, 'bytes；静态资源已拷贝');
