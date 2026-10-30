# MinxTok 提示词汇总

这份清单只做一件事：以后改提示词，先在这里找到唯一入口，避免同一个意思散在多个 handler 里。
新提示词优先集中到 `src/prompts.js`，其余暂时留在原模块的常量里；改动时同步更新本表。

## 已经集中管理

| 用途 | 常量 | 文件 | 说明 |
| --- | --- | --- | --- |
| 日记代写 | `DIARY_WRITE_SYSTEM` | `src/prompts.js` | 第一人称、300 字内、只写对话里真实出现的事 |
| 日记回应 / 虾虾回答模型 | `DIARY_COMMENT_SYSTEM` | `src/prompts.js` | 先接住具体细节，再给轻建议；不提问、不复述、不说教 |
| 日记媒体说明 | `DIARY_MEDIA_NOTE` | `src/prompts.js` | 明确告诉模型不要识别图片/语音内容 |
| 图片 OCR | `OCR_PROMPT` | `src/prompts.js` | 描述画面 + 读出可见文字 |
| 转简体 | `SIMPLIFY_SYSTEM` | `src/prompts.js` | 只做简体转换，不改原意 |

## 主聊天与追问

| 用途 | 常量 / 位置 | 文件 | 说明 |
| --- | --- | --- | --- |
| 虾虾主系统提示词 | `systemPrompt()` | `src/llm.js` | 人格、能力边界、音乐标记、数学/化学/绘图格式 |
| 追问生成 | `FOLLOWUP_RULES` | `src/llm.js` | 锁定“我是用户、你是助手”；区分助手在提问 / 不在提问 |
| 追问清洗 | `cleanFollowups()` | `src/llm.js` | 去编号、去空话、限 18 字 |
| 追问二次清洗 | `sanitizeFollowups()` | `src/chat.js` | 拦助手口吻、去重复、限条数 |

## 学习中心

| 用途 | 常量 / 位置 | 文件 | 说明 |
| --- | --- | --- | --- |
| 学习助手总规则 | `BASE_RULES` | `src/study.js` | 中文回答、数学/化学排版、禁止代码块和字符画 |
| 各模式规则 | `MODES` | `src/study.js` | 翻译、解题、练习、错题、生词、场景、作文 |
| 绘图补充规则 | `DRAW_RULES` | `src/study.js` | `[[draw:...]]` JSON 结构、坐标范围、禁止代码 |
| 场景角色规则 | `sceneRules()` | `src/study.js` | 角色、语言、每次 1–3 句、不出戏不教学 |

## 业务功能

| 用途 | 位置 | 文件 | 说明 |
| --- | --- | --- | --- |
| 文章修改 | `handleArticleRewrite` | `src/cards.js` | 只输出修改后的完整正文 |
| 新闻短标题 | `handleNewsTitle` | `src/cards.js` | 14 字内、无标点 |
| 找歌 / 推荐歌 | `recommendSong()` / `lookupSong()` | `src/music.js` | 只输出“歌名\|歌手”，拒绝类型词当歌名 |
| 搜索关键词扩展 | `handleSearchKeywords` | `src/search.js` | 扩展 6 个中文关键词 |
| 情绪标签 | `TAG_SYSTEM` | `src/emotion.js` | 只有明显情绪才打标，否则 null |
| 词典释义 | `handleDictLookup` | `src/dict.js` | 结合句子选义，1–2 条，附短例句 |

## 改提示词的约定

1. 先改常量，不要在 handler 里临时拼一长段新提示词。
2. 日记和媒体相关优先放进 `src/prompts.js`；新增常量后记得同步构建顺序（`scripts/build-pages.mjs` 的 `ORDER`）。
3. 改完至少跑一次 `node scripts/build-pages.mjs`，确认单文件 Worker 没有重复顶层变量。
4. 面向用户的语气规则：中文、简洁、先接住再建议；不要客服腔，不要“作为 AI”，不要空喊加油。
