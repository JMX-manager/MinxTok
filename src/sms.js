// 阿里云 PNVS 号码认证：短信验证码（AK 只存在 Worker 后端，前端拿不到）
// 固定参数不要改动：cn-shanghai / dypnsapi.aliyuncs.com / SchemeName minxtok / +86
// 发送扣费、核验免费；发送前先落 60s 冷却，冷却期内绝不触达阿里云。

const ALIYUN = {
  endpoint: 'dypnsapi.aliyuncs.com',
  version: '2017-05-25',
  regionId: 'cn-shanghai',
  schemeName: 'minxtok',
  countryCode: '+86',
  signName: '速通互联验证平台',
  templateCode: '100001',
  templateParam: JSON.stringify({ code: '##code##', min: '5' }),
  returnVerifyCode: 'true',
};

export const phoneOk = (p) => /^1[3-9]\d{9}$/.test(String(p || '').trim());
export const normalizePhone = (raw) => String(raw || '').trim().replace(/[\s-]/g, '').replace(/^(\+86|86)/, '');

export function maskPhone(phone) {
  return String(phone).replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
}

// RFC3986；阿里云要求空格 %20、* %2A、%7E 还原 ~
function pe(str) {
  return encodeURIComponent(String(str))
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/\+/g, '%20')
    .replace(/%7E/g, '~');
}

function toBase64(buf) {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function hmacSha1Base64(secret, text) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret + '&'), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  return toBase64(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}

async function rpc(env, action, bizParams) {
  const params = {
    AccessKeyId: env.ALIYUN_AK_ID,
    Action: action,
    Format: 'JSON',
    RegionId: ALIYUN.regionId,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: '1.0',
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: ALIYUN.version,
    ...bizParams,
  };

  const canonical = Object.keys(params).sort()
    .map((k) => `${pe(k)}=${pe(params[k])}`).join('&');
  const stringToSign = `POST&${pe('/')}&${pe(canonical)}`;
  const signature = await hmacSha1Base64(env.ALIYUN_AK_SECRET, stringToSign);

  const res = await fetch(`https://${ALIYUN.endpoint}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `${canonical}&Signature=${pe(signature)}`,
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return null; }
}

/* 发送验证码：成功只回 ok，VerifyCode 绝不下发；失败统一文案 */
export async function sendSmsCode(env, phone) {
  if (!env.ALIYUN_AK_ID || !env.ALIYUN_AK_SECRET) {
    console.log('[sms] send skipped: AK missing');
    return { ok: false, msg: '发送失败' };
  }
  try {
    const data = await rpc(env, 'SendSmsVerifyCode', {
      PhoneNumber: phone,
      SignName: ALIYUN.signName,
      TemplateCode: ALIYUN.templateCode,
      TemplateParam: ALIYUN.templateParam,
      SchemeName: ALIYUN.schemeName,
      CountryCode: ALIYUN.countryCode,
      ReturnVerifyCode: ALIYUN.returnVerifyCode,
    });
    const pass = data && data.Code === 'OK';
    console.log('[sms] send', maskPhone(phone), pass ? 'ok' : `fail code=${(data && data.Code) || 'N/A'}`);
    return pass ? { ok: true } : { ok: false, msg: '发送失败' };
  } catch (e) {
    console.log('[sms] send', maskPhone(phone), 'error', e && e.name);
    return { ok: false, msg: '发送失败' };
  }
}

/* 核验验证码：PASS 才算过；错误码与阿里云错误都收敛成固定文案 */
export async function checkSmsCode(env, phone, code) {
  if (!env.ALIYUN_AK_ID || !env.ALIYUN_AK_SECRET) {
    console.log('[sms] check skipped: AK missing');
    return { ok: false, msg: '验证失败，请稍后再试' };
  }
  try {
    const data = await rpc(env, 'CheckSmsVerifyCode', {
      PhoneNumber: phone,
      VerifyCode: String(code || '').trim(),
      SchemeName: ALIYUN.schemeName,
      CountryCode: ALIYUN.countryCode,
    });
    const apiCode = data && data.Code;
    const result = data && data.Model && data.Model.VerifyResult;
    if (apiCode === 'OK' && result === 'PASS') {
      console.log('[sms] check', maskPhone(phone), 'pass');
      return { ok: true };
    }
    if (apiCode === 'isv.ValidateFail' || apiCode === 'OK') {
      console.log('[sms] check', maskPhone(phone), 'reject');
      return { ok: false, msg: '验证码错误或已失效' };
    }
    console.log('[sms] check', maskPhone(phone), 'fail code=', apiCode || 'N/A');
    return { ok: false, msg: '验证失败，请稍后再试' };
  } catch (e) {
    console.log('[sms] check', maskPhone(phone), 'error', e && e.name);
    return { ok: false, msg: '验证失败，请稍后再试' };
  }
}

/* POST /api/auth/sms/send  ——  60s 冷却在 KV，冷却期直接拦截 */
export async function handleSmsSend(req, env) {
  const cors = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': env.CORS_ORIGIN || '*' };
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

  let body = {};
  try { body = await req.json(); } catch { return reply({ ok: false, msg: '参数错误' }, 400); }

  const phone = normalizePhone(body.phone);
  if (!phoneOk(phone)) return reply({ ok: false, msg: '手机号格式不正确' }, 400);

  const cdKey = `sms:cd:${phone}`;
  if (await env.MINXTOK_KV.get(cdKey)) {
    console.log('[sms] send', maskPhone(phone), 'blocked cooldown');
    return reply({ ok: false, msg: '请求频繁，请稍后再试' });
  }
  // 先落冷却再调用，防连点/并发重复扣费
  await env.MINXTOK_KV.put(cdKey, String(Date.now()), { expirationTtl: 60 });

  const result = await sendSmsCode(env, phone);
  return reply(result);
}
