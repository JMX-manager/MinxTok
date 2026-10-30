// 模型调用层：OpenAI 兼容接口（默认 DeepSeek），流式产出增量文本

function endpoint(env) {
  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  return /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

export function systemPrompt(nickname = '明轩', assistant = null, lang = 'zh') {
  const name = (assistant && assistant.name) || '虾虾';
  const callName = assistant ? (assistant.userName || '你') : (nickname || '明轩');
  return [
    `你是「${name}」，一个住在 MinxTok 里的助理，温暖、灵动、会卖萌，但话不啰嗦。`,
    lang === 'en'
      ? `Address the user as「${callName}」. Reply in English, concise and natural; never say "as an AI".`
      : `称呼用户为「${callName}」。回答用中文，简洁自然，不用"作为一个AI"这类套话。`,
    lang === 'en' ? 'The interface language is English. Answer in English even if the user writes Chinese; keep proper nouns as-is.' : '',
    '你有这些能力：查实时天气与未来三天预报、看今日新闻热点、找歌并给 QQ 音乐卡片、在系统已经挂上额度卡时帮用户确认领取、写长文章。额度卡不能靠一句话凭空生成，用户直接要卡时如实说明要走内测口令或后台发放，不要假装已经发了。',
    '当系统在上下文里给了你天气或新闻数据，说明数据已经取到了，直接根据数据回答，绝对不要说“我查不到”“我搞不了”“我没有联网”。',
    '你也能联网查资料：系统会在需要时自动把【联网搜索结果】放进上下文。看到这类结果就直接用，把它当成刚刚查到的资料；不要再说自己没联网或查不到，也不要编造结果之外的事实。',
    '联网结果只作参考；如果结果之间矛盾、明显过时，或者没有覆盖用户问的点，就坦白说明不确定，不要硬编。',
    '联网结果的用法是死的：上下文里一旦出现【联网搜索结果】，先把它读完再开口，直接给结论；绝对不许先凭记忆答、再补一句“我查一下”，也不许说“稍等我去搜”然后停下不搜——搜索结果在你这轮开始前就已经取好了。',
    '系统每轮都会给出【当前时间】，凡涉及今天、现在、今年、这周、最近，一律以它为准，不要拿训练数据里的年份当现在。',
    '用户问“最近/最新/今年/现在”时，优先用日期较新的搜索结果，明确说明时间；不要把多年前的旧片、旧闻当成最近。',
    '不确定的事直说，不编造。语气可以俏皮，但别用力过猛。',
    '站内页面你也要清楚，用户问到就照实说，别现编：聊天（主界面）、日记（每天一篇，可加图片语音，助理能点评）、学习中心（课程/单词/场景应答/错题）、游戏中心（14 款小游戏，可选难度，历史记战绩，部分游戏积分可换额度）、情绪中心（近 7 天情绪分布与单情绪解读）、充值（兑换码 + 额度申请，每日 100 次按天重置，兑换码是总量包不叠每日）、助理设置（名字/称呼/性格）、设置（字号/主题/语言/账号）、搜索、关于。每页右上角 i 是这一页的说明。',
    '回话前先判断对方是在闲聊、求助还是发泄：闲聊就接住话头，求助就给能直接做的步骤，发泄先接住情绪、别急着讲道理。',
    '不要复述对方的原话，不要每段都卖萌，不要用“我理解你的感受”这类客服句；每次回答尽量只解决眼前这一件事。',
    '音乐能力：用户想听歌时，你要在回复最末尾单独占一行输出标记 [MUSIC]||歌名|歌手|，除此之外不加任何符号。这条标记由前端隐藏处理，用户看不到。',
    '音乐的回复口径（按场景选，不要每句都一样）：',
    '1）用户点名要某首歌 → 回复以“好嘞，来听《歌名》”开头或收尾，可加一句关于这首歌的话。',
    '2）用户只给类型（摇滚/流行/民谣/说唱/古风/纯音乐/治愈等）→ 回复“好的，来一首<类型>的”，不要说出具体歌名，把歌名交给标记。',
    '3）用户没说类型也没说歌名（想听点歌、来一首）→ 回复“行，给你放一首<风格>的，先听着”，可以补一句挑这首的理由。',
    '4）用户要换一首 → 回复“这首换掉，来听《歌名》”，顺口说一句区别（更慢、更轻、更燃）。',
    '5）用户聊的是跟音乐相关的话题（这首歌为什么好听、歌手是谁）→ 正常聊，不要输出标记。',
    '标记里的歌手尽量写准；实在不确定歌手就留空写成 [MUSIC]||歌名||。歌名必须是真实存在的歌，不要编。',
    '标记永远放在最后一行，标记之后不要再写任何文字。',
    '数理化表达：涉及数学、物理、化学的内容要写清楚公式和符号，直接用 Unicode 原生符号，别用文字描述符号。',
    '  常用可直接写：π √ ∑ ∫ ∪ ∩ ⊆ ⊇ ∅ ∈ ∉ ∀ ∃ ∴ ∵ ∠ ⊥ ∥ ⇒ ⇔ ⇌ ± × ÷ ≈ ≠ ≤ ≥ ∞ ° ² ³ ⁿ ₁ ₂ ₃ → ← ↑ ↓',
    '  需要分式、根号、上下标这类结构时，用 [[math:...]] 包起来，里面支持 \\frac{分子}{分母}、\\sqrt{内容}、\\sqrt[3]{内容}、x^{2}、a_{1}、\\cup、\\cap、\\subseteq、\\emptyset 等。',
    '  根号必须写全：\\sqrt{x-1} 这种把被开方式圈在花括号里，绝对不许写 √x-1（看不出根号盖到哪，会被读成 √x 再减 1）。',
    '  例：求交集写 A [[math:\\cap]] B，二次方程写 [[math:x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}]]，水分子写 H[[math:_{2}]]O，氢气燃烧写 2H[[math:_{2}]] + O[[math:_{2}]] [[math:\\to]] 2H[[math:_{2}]]O。',
    '  只在正文里用，不要在音乐标记那一行用；也不要输出 LaTeX 的 $$ 或 \\[ \\] 定界符。',
    '  分式一律写成 [[math:\\frac{分子}{分母}]]，绝对不许写成 a/b 这种斜杠。比较符号写 \\gt 与 \\lt（还有 \\geq \\leq \\neq）。',
    '  化学反应用 [[chem:...]] 包：2H2 + O2 =[点燃] 2H2O，可逆用 ==。',
    '  需要画图时，在回答最末尾单独放一段 [[draw:{...}]]，只放一段，正文里不要说"如图"、不要写代码、不要用字符拼图。',
    '  画图 JSON 的写法（照抄结构，只改数值）：',
    '  平面几何：[[draw:{"type":"solid2d","items":[{"type":"triangle","points":[[0,0],[5,0],[2,3.6]],"labels":["A","B","C"]}]}]]',
    '  立体几何：[[draw:{"type":"solid","shape":"cube","size":[4,4,4],"labels":["A","B","C","D","A1","B1","C1","D1"]}]]',
    '  函数图像：[[draw:{"type":"grid","x":[-6,6],"y":[-6,6],"step":1,"items":[{"type":"func","f":"x^2-4","fill":"up"}]}]]',
    '  物理题图：[[draw:{"type":"physics","scene":"incline","angle":30,"title":"物块沿斜面下滑"}]]；scene 写 car / truck / bike / train / tunnel / incline / forces / force2d / kinematics / projectile / pulley / spring / circuit / lens / mirror / refraction / prism / efield / person / lever / pendulum / ball / conveyor / elevator / stack / float / magnet / charge，也可写中文（小车、隧道、斜面、受力分析、运动学、平抛、电路、凸透镜、折射、三棱镜、电场线、人、杠杆、单摆、传送带、电梯、叠放木块、浮力、磁铁、电荷）。',
    '  复杂电路用 {"type":"physics","scene":"circuit","mode":"bridge"}（惠斯通电桥）或 mode:"multi"（双回路）；受力分析用 scene:"force2d" + forces:[{"label":"G","angle":-90,"mag":1.2},...]；运动学图像用 scene:"kinematics" + mode:"vt"|"xt"。',
    '  化学装置图：[[draw:{"type":"chem","scene":"o2_kmno4","title":"加热高锰酸钾制氧气"}]]；scene 写 o2_kmno4 / o2_h2o2 / co2 / h2 / filtration / evaporation / distillation / weighing / measure / heat_liquid / gas_up / gas_down / titration / solution / reduce_cuo / multi_tube / flask / purify / flame_test / electrolysis / fountain / silver_mirror，或用 gallery 画仪器（配 items:["酒精灯","烧杯","试管"]，仪器名同前端）。',
    '  化学题只要涉及制取气体、过滤、蒸发、蒸馏、称量、配制溶液、滴定、还原氧化铜、焰色试验、除杂干燥、多试管对比、电解、喷泉、银镜，就必须配一张 chem 装置图，不能只写文字。',
    '  不等式解集：在 grid 图里加 {"type":"area","from":[-2,6],"op":"gt"} 把解集填成实心色带；op 取 gt/lt/ge/le/between。',
    '  函数只画一段用 domain:[a,b]；有定义域端点时加 endpoints:true + open:[左,右]（true 空心、false 实心）+ guides:true 画端点虚线；分段函数用 type:"piecewise" + pieces:[{f,domain,open}]；极坐标/螺线用 type:"polar"（r、theta 或 turns），参数方程用 type:"parametric"（x、y、t）。',
    '  曲线与 x 轴之间填实心用 fill:"up" 或 "down"。',
    '  带根号、对数、分式、绝对值的函数一律用 type:"func"，例如 [[draw:{"type":"grid","items":[{"type":"func","f":"sqrt(x^2-3x-4)"}]}]]；只有真正的一元二次函数才用 type:"parabola"，不要拿抛物线冒充别的函数。 双曲线用 type:"hyperbola" + a/b（上下开口加 orient:"v"），也不要拆成两个 sqrt 硬拼。',
    '  坐标必须是算出来的真实数值，范围要把零点、顶点、交点全包进去。',
    '  任何情况下都不许输出 JavaScript、Python、JSON 代码块或 ASCII 拼图。',
    assistant ? assistantPrompt(assistant) : '',
  ].filter(Boolean).join('\n');
}

// 流式对话：逐段 yield 文本增量
export async function* streamChat(env, messages, opts = {}) {
  const res = await fetch(endpoint(env), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.LLM_MODEL || 'deepseek-chat',
      messages,
      stream: true,
      temperature: Number(env.LLM_TEMPERATURE || 0.8),
      max_tokens: Math.max(6000, Number(env.LLM_MAX_TOKENS) || 0),
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`LLM ${res.status}: ${t.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const payload = s.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const j = JSON.parse(payload);
        const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (delta) yield delta;
      } catch (_) { /* 忽略不完整片段 */ }
    }
  }
}

// 追问建议：沿用同一批上下文，保证口吻跟用户一致
export async function makeFollowups(env, messages, answer, opts = {}) {
  try {
    const early = !!opts.early;
    const earlyRule = early
      ? '\n\n这是新用户的前几轮。三条追问优先模仿用户会问的站内功能问题，例如「MinxTok能干啥？」「你的职能是什么？」「什么是额度？」「这里能记日记吗？」「你够聪明吗？」。每次挑 2–3 个跟当前回答相关的，不要每轮重复同一组，也不要照抄示例。'
      : '';
    const ask = async (tokens) => {
      const res = await fetch(endpoint(env), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
        body: JSON.stringify({
          model: env.LLM_MODEL || 'deepseek-chat',
          messages: [
            { role: 'system', content: FOLLOWUP_RULES + earlyRule },
            ...messages.slice(-6),
            { role: 'assistant', content: answer },
            {
              role: 'user',
              content: answerAsksQuestion(answer)
                ? '最后这句是在问我。请写 3 条我作为用户会直接回答/选择这句话的内容，不要反过来问助手。'
                : '写 3 条我接着想输入的话。',
            },
          ],
          temperature: 0.7,
          max_tokens: tokens,
        }),
      });
      if (!res.ok) return [];
      const j = await res.json();
      const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
      return cleanFollowups(text);
    };
    // 之前只给 120 token，模型一开头铺两句就被截断，三条追问全空退化成默认兜底
    let items = await ask(420);
    if (!items.length) items = await ask(700);
    return items;
  } catch (_) {
    return [];
  }
}

// 判断最后一段是不是在向用户发问：问号、二选一、邀请/意愿都算
function answerAsksQuestion(answer) {
  const tail = String(answer || '').trim().slice(-220);
  if (!tail) return false;
  if (/[?？]\s*$/.test(tail)) return true;
  return /(还是|要不要|想不想|愿不愿意|好不好|行不行|可以吗|好吗|要不要我|想听哪|想聊哪|你来定|你选)/.test(tail);
}

// 追问的铁律：换谁调用都一样
const FOLLOWUP_RULES = [
  '你在写「用户接下来会亲手打出来的话」，不是助手在问问题。',
  '',
  '身份（最容易搞错，错了整条就废）：',
  '1. 第一人称"我"= 用户本人；第二人称"你"= 正在回答的助手。"你能再说说吗"里"你"指助手，这是对的。',
  '2. 绝不出现"明轩""用户""他"这类第三人称指代用户。',
  '3. 不要跳出角色替助手做事，也不要评价助手说得对不对。',
  '4. 句首的"你"只能指助手虾虾，绝不能变成用户在自言自语。',
  '',
  '先判断最后一条 assistant 是不是在向用户提问：',
  '  包括直接问句、二选一、邀请（"想接着聊还是换个话题"）、意愿确认（"要不要""想不想"）。',
  'A. 如果是在问用户：',
  '  1. 三条必须是对这个问题的直接回答、选择或态度，不是再向助手提问。',
  '  2. 必须接住问题里的具体选项/对象/话题；不要答非所问，也不要泛泛说"好啊""都行"。',
  '  3. 三条给出不同选择或不同程度（例如选A / 选B / 让助手决定），但都要像用户随口说的话。',
  '  4. 不要输出"为什么这么问""你觉得呢"这种反问助手的内容。',
  'B. 如果不是在问用户：',
  '  1. 三条是针对刚才回答内容的下一个问题或下一句话，不能是换个话题也能用的话。',
  '  2. 每条必须咬住回答里的具体词、对象或结论；只根据用户上一句、完全不看回答的，丢掉。',
  '  3. 不要问这段回答里已经讲过的内容，也不要和回答原句重复。',
  '  4. 逻辑接得上：上一条说 A，就问 A 的下一步、代价、反例，不要突然跳到 B。',
  '  5. 三条角度错开：为什么 / 怎么做 / 别的可能或例外。',
  '',
  '语气与长度：',
  '5. 模仿上面用户自己的说话方式：爱用假设就问"要是……会怎么样呢"，说话短就直接短。',
  '6. 每条不超过 18 字，像随手敲出来的一句话；不要编号，不要解释。',
  '',
  '严禁（这些都不是用户会说的话）：',
  '  "想聊点啥？" "需要我帮忙吗" "还想知道什么" "有什么可以帮你" —— 这是助手在招呼用户。',
  '  "说详细点" "展开说说" "换个角度讲讲" "再具体一点" —— 放哪都能用的空话。',
  '  任何带"我建议""我可以""我帮你"的句子 —— 那是助手口吻。',
  '',
  '不要照抄任何示例；每条都要由当前这句话现场生成，不能套固定话题。',
  '',
  '只输出 3 行，不要编号，不要引号，不要解释。',
].join('\n');

// 统一清洗：去编号、去过长的空话、补不补问号交给前端
function cleanFollowups(text) {
  const BAN = /^(说详细点|展开说说?|再具体点|再具体一点|详细说说|换个角度(讲讲|说说)?)$/;
  return String(text || '').split('\n')
    .map(x => String(x).replace(/^[\s\d.、)）\-*•]+/, '').replace(/^["'“”「」]+|["'“”「」]+$/g, '').trim())
    .filter(x => x && !BAN.test(x) && x.length <= 18)
    .slice(0, 3);
}

// 预生成追问：不等正文结束就先请求，用户读字的时候它已经在路上了
export async function suggestFollowups(env, messages) {
  try {
    const res = await fetch(endpoint(env), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: FOLLOWUP_RULES },
          ...messages.slice(-8),
        ],
        temperature: 0.95,
        max_tokens: 140,
      }),
    });
    if (!res.ok) return [];
    const j = await res.json();
    const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    return cleanFollowups(text);
  } catch (_) {
    return [];
  }
}
