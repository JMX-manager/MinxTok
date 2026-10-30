// SurveyKing 接入层（问卷/表单）
// 设计成薄代理：Worker 里不落业务数据，只做鉴权 + 转发，
// 问卷本身还是存在 SurveyKing。没有配置时统一返回 not_configured，
// 不会把站内聊天链路带崩。
//
// 需要在 Cloudflare Pages 里配的环境变量：
//   SURVEYKING_BASE   例如 https://survey.example.com
//   SURVEYKING_TOKEN  SurveyKing 后台的个人访问令牌 / API Key
//   SURVEYKING_MODE   可选，proxy（默认）或 link（只生成链接，不减权限）
import { corsHeaders, json } from './util.js';

const ALLOW_PREFIX = ['/api/', '/survey/', '/s/', '/js/'];

function baseOf(env) {
  return String(env.SURVEYKING_BASE || '').replace(/\/+$/, '');
}

export function surveyConfigured(env) {
  return !!(baseOf(env) && env.SURVEYKING_TOKEN);
}

// 通用代理：前端把 path 放在 ?path= 里，只允许白名单前缀，且只能是站内相对路径
export async function handleSurveyProxy(req, env) {
  const cors = corsHeaders(env);
  if (!surveyConfigured(env)) return json({ error: 'not_configured' }, 200, cors);
  const url = new URL(req.url);
  const path = String(url.searchParams.get('path') || '');
  if (!path.startsWith('/') || path.startsWith('//') || !ALLOW_PREFIX.some(p => path.startsWith(p))) {
    return json({ error: 'bad_path' }, 400, cors);
  }
  const target = baseOf(env) + path;
  const init = {
    method: req.method,
    headers: {
      'X-Access-Token': String(env.SURVEYKING_TOKEN),
      'Content-Type': req.headers.get('content-type') || 'application/json',
    },
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') init.body = await req.text();
  try {
    const res = await fetch(target, init);
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { ...cors, 'Content-Type': res.headers.get('content-type') || 'application/json; charset=utf-8' },
    });
  } catch (e) {
    return json({ error: 'survey_unreachable', message: String((e && e.message) || e) }, 502, cors);
  }
}

// 站点自己用的状态接口：前端据此决定是显示“问卷”入口还是提示未配置
export async function handleSurveyStatus(req, env) {
  const cors = corsHeaders(env);
  return json({
    ok: true,
    configured: surveyConfigured(env),
    base: surveyConfigured(env) ? baseOf(env) : '',
  }, 200, cors);
}
