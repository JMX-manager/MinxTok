// MinxTok API —— Cloudflare Worker 入口
import { corsHeaders, json } from './util.js';
import { blockSchema } from './blocks.js';
import { handleChat, handleHistory, handleConversations, handleDeleteMessage } from './chat.js';
import {
  handleStatus, handleAdminState, handleAdminPause,
  handleAdminResume, handleAdminConfig, handleAdminStats, handleAdminTestMessage,
} from './admin.js';
import { handleOcr, handleStt, handleSttCheck, handleSttFix, handleAsset, handleAssetUpload, handleImageDescribe } from './media.js';
import { handleEmotionSummary, handleEmotionDetail } from './emotion.js';
import { handleToolOverview, handleGameLog, handleToolUsers } from './tool.js';
import { handleSearch } from './search.js';
import { handleDiaryList, handleDiarySave, handleDiaryDelete, handleDiaryAi, handleDiaryComment } from './diary.js';
import { handleAssistantGet, handleAssistantSave } from './assistant.js';
import { handleRegister, handleLogin, handleMe, handleLogout, handleRecover, handleVerifyPassword, currentUser } from './auth.js';
import { handleSmsSend } from './sms.js';
import {
  handleNewsHot, handleWeather, handleArticleGet, handleArticleCreate,
  handleArticleRewrite, handleAdminCard,
} from './cards.js';
import { handleGameSpend, handleGameReward, handleQuota, handleApply, handleRequests, handleDecide, handleRedeem, handleCreateCode } from './quota.js';
import { handleFeedbackCreate, handleFeedbackList } from './feedback.js';
import { handleGiftClaim, handleGiftPush, handleGiftCode, handleGiftCodeCreate } from './gift.js';
import { handleSurveyProxy, handleSurveyStatus } from './survey.js';
import { handleStudy, handleStudyStream, handleStudyList, handleStudySave, handleStudyUpdate, handleStudyDelete, handleStudySessionSave, handleStudySessionList, handleStudySessionGet, handleStudySessionDelete, handleSceneWrap } from './study.js';
import { handleDrill } from './drill.js';
import { handleCourseStream, handleCourseSections } from './course.js';
import { handleDict } from './dict.js';
import { handleChem } from './chem.js';
import { handleArchive } from './archive.js';
import { handlePayToken, handlePayQuote, handlePayGate, handlePayDo, handlePayWatch, handleAdminPayKey } from './pay.js';

// 块规范：前端据此渲染与分发点击行为，新增卡片类型只改 blocks.js
async function handleBlockSchema(request, env) {
  return json({ blocks: blockSchema() }, 200, corsHeaders(env));
}

const ROUTES = {
  'POST /api/chat': handleChat,
  'GET /api/history': handleHistory,
  'GET /api/conversations': handleConversations,
  'GET /api/status': handleStatus,
  'GET /api/admin/state': handleAdminState,
  'POST /api/admin/pause': handleAdminPause,
  'POST /api/admin/resume': handleAdminResume,
  'POST /api/admin/config': handleAdminConfig,
  'GET /api/admin/stats': handleAdminStats,
  'POST /api/admin/test/message': handleAdminTestMessage,
  'GET /api/blocks/schema': handleBlockSchema,
  'GET /api/news/hot': handleNewsHot,
  'GET /api/weather': handleWeather,
  'GET /api/quota': handleQuota,
  'POST /api/quota/redeem': handleRedeem,
  'GET /api/admin/tool/overview': handleToolOverview,
  'GET /api/admin/tool/users': handleToolUsers,
  'POST /api/game/log': handleGameLog,
  'POST /api/game/spend': handleGameSpend,
  'POST /api/game/reward': handleGameReward,
  'POST /api/admin/quota/code': handleCreateCode,
  'POST /api/quota/apply': handleApply,
  'GET /api/admin/quota/requests': handleRequests,
  'POST /api/admin/quota/decide': handleDecide,
  'GET /api/article': handleArticleGet,
  'POST /api/article': handleArticleCreate,
  'POST /api/article/rewrite': handleArticleRewrite,
  'POST /api/admin/card': handleAdminCard,
  'POST /api/study': handleStudy,
  'POST /api/study/drill': handleDrill,
  'POST /api/study/stream': handleStudyStream,
  'POST /api/study/scene/wrap': handleSceneWrap,
  'GET /api/survey/status': handleSurveyStatus,
  'GET /api/survey/proxy': handleSurveyProxy,
  'POST /api/survey/proxy': handleSurveyProxy,
  'POST /api/course/stream': handleCourseStream,
  'POST /api/course/sections': handleCourseSections,
  'GET /api/study/list': handleStudyList,
  'POST /api/study/save': handleStudySave,
  'POST /api/study/update': handleStudyUpdate,
  'POST /api/study/delete': handleStudyDelete,
  'POST /api/study/session/save': handleStudySessionSave,
  'GET /api/study/session/list': handleStudySessionList,
  'GET /api/study/session/get': handleStudySessionGet,
  'POST /api/study/session/delete': handleStudySessionDelete,
  'GET /api/dict': handleDict,
  'GET /api/chem': handleChem,
  'POST /api/gift/claim': handleGiftClaim,
  'POST /api/admin/gift/push': handleGiftPush,
  'POST /api/gift/code': handleGiftCode,
  'POST /api/admin/gift/code': handleGiftCodeCreate,
  'POST /api/feedback': handleFeedbackCreate,
  'GET /api/admin/feedback': handleFeedbackList,
  'POST /api/ocr': handleOcr,
  'POST /api/image/describe': handleImageDescribe,
  'POST /api/stt': handleStt,
  'GET /api/stt/check': handleSttCheck,
  'POST /api/stt/fix': handleSttFix,
  'POST /api/asset': handleAssetUpload,
  'POST /api/auth/register': handleRegister,
  'POST /api/auth/login': handleLogin,
  'GET /api/auth/me': handleMe,
  'POST /api/auth/verify': handleVerifyPassword,
  'POST /api/auth/logout': handleLogout,
  'POST /api/auth/sms/send': handleSmsSend,
  'POST /api/auth/recover': handleRecover,
  'GET /api/diary': handleDiaryList,
  'POST /api/diary': handleDiarySave,
  'POST /api/diary/ai': handleDiaryAi,
  'POST /api/diary/comment': handleDiaryComment,
  'GET /api/assistant': handleAssistantGet,
  'POST /api/assistant': handleAssistantSave,
  'GET /api/emotion/summary': handleEmotionSummary,
  'GET /api/emotion/detail': handleEmotionDetail,
  'GET /api/archive': handleArchive,
  'POST /api/pay/token': handlePayToken,
  'GET /api/pay/quote': handlePayQuote,
  'POST /api/pay/gate': handlePayGate,
  'POST /api/pay/do': handlePayDo,
  'GET /api/pay/watch': handlePayWatch,
  'GET /api/admin/pay/key': handleAdminPayKey,
  'GET /api/search': handleSearch,
  'GET /api/version': handleVersion,
};

// 前端靠这个判断有没有新版本可加载。BUILD_STAMP/BUILD_VER 由
// scripts/build-pages.mjs 在打包时写在文件末尾，每次部署都会变。
function handleVersion(req, env) {
  const cors = corsHeaders(env);
  const stamp = (typeof BUILD_STAMP === 'string' && BUILD_STAMP) || '0';
  const ver = (typeof BUILD_VER === 'string' && BUILD_VER) || '0.0.0';
  return json({ ok: true, v: ver, stamp }, 200, {
    ...cors,
    'Cache-Control': 'no-store, max-age=0',
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const key = `${request.method} ${url.pathname}`;
    const cors = corsHeaders(env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // 除了登录注册与管理端，所有 /api 都必须带有效会话；uid 不允许由客户端随意指定
    const openAuth = new Set([
      '/api', '/api/version', '/api/auth/register', '/api/auth/login', '/api/auth/sms/send', '/api/auth/recover',
      '/api/log/client', '/api/stt/check',
      // 扫码充值页在管理员手机上打开，没有用户会话，靠 token 自证
      '/api/pay/quote', '/api/pay/gate', '/api/pay/do',
    ]);
    if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/admin/') &&
        !url.pathname.startsWith('/api/asset/') && !openAuth.has(url.pathname)) {
      const user = await currentUser(request, env);
      if (!user) return json({ error: 'unauthorized' }, 401, cors);
      const asked = url.searchParams.get('uid');
      if (asked && asked !== user.id) return json({ error: 'forbidden' }, 403, cors);
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const ct = request.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          let body = {};
          try { body = await request.json(); } catch { body = {}; }
          if (body && typeof body === 'object' && body.uid && body.uid !== user.id) {
            return json({ error: 'forbidden' }, 403, cors);
          }
          request = new Request(request.url, {
            method: request.method, headers: request.headers,
            body: JSON.stringify({ ...body, uid: user.id }),
          });
        }
      }
      request.user = user;
    }

    if (request.method === 'DELETE' && url.pathname.startsWith('/api/diary/')) {
      return handleDiaryDelete(request, env);
    }

    if (request.method === 'DELETE' && url.pathname.startsWith('/api/message/')) {
      return handleDeleteMessage(request, env);
    }

    if (url.pathname.startsWith('/api/asset/')) {
      return handleAsset(request, env);
    }

    if (url.pathname === '/api/log/client' && request.method === 'POST') {
      try {
        const b = await request.json();
        await env.DB.prepare('INSERT INTO events (ts,kind,detail) VALUES (?,?,?)')
          .bind(Date.now(), 'client_error', JSON.stringify(b).slice(0, 1500)).run();
      } catch (_) {}
      return json({ ok: true }, 200, cors);
    }

    if (url.pathname === '/api') {
      return json({
        name: 'MinxTok API',
        version: '0.1.0',
        time: Date.now(),
        endpoints: Object.keys(ROUTES),
      }, 200, cors);
    }

    const handler = ROUTES[key];
    if (!handler) {
      // 静态资源回落：前端页面走 Pages 资源，SPA 路由统一回 index.html
      if (env.ASSETS) {
        const asset = await env.ASSETS.fetch(request);
        if (asset.status !== 404) return asset;
        return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
      }
      return json({ error: 'not_found', path: url.pathname, method: request.method }, 404, cors);
    }

    try {
      return await handler(request, env, ctx);
    } catch (e) {
      console.error('unhandled', e && e.stack || e);
      return json({ error: 'internal_error', message: String((e && e.message) || e).slice(0, 200) }, 500, cors);
    }
  },
};
