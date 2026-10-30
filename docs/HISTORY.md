# MinxTok 版本与变更史

> 最后整理：2026-10-30
> 对应线上：**6.1.6（最新稳定版）**（app `v410` / theme `v305` / dict `v31` / blocks `v172` / motion `v42` / study `v112` / games `v94` / i18n `v118` / dict `v30` / credits `v16` / course `v37` / ui `v150` / drill `v59` / course.css `v22` / drill.css `v24`）
> 来源：`public/js/app.js` 的 `CHANGELOG` 数组、`memory/2026-10-18.md` 至 `2026-10-27.md`、`docs/OPERATIONS.md`。
> 说明：下表是“一版一行”的速查；某一版到底改了几项、英文文案是什么，以 `app.js` 的 `CHANGELOG` 为准。
> 当前状态：**6.1.0 为最新稳定版**（5.0.0 起是充值制度改版：专属充值码/扫码支付页/实时到账）；大更新暂缓，只修明确影响使用的 bug；方向见 `ROADMAP.md`。

---

## 一、三个阶段

### 1. 雏形（2026-09-10 — 2026-09-28）

- **0.1.0（09-10）**：登录注册、对话、额度，MinxTok 第一次能跑。
- **0.2.0（09-28）**：对话支持流式输出，不再等整段返回。

这一阶段是“能聊天”的最小闭环，界面和功能都还很薄。

### 2. 重建与爆发（2026-10-18 — 2026-10-23）

旧站数据/代码在 10-18 前后丢失，之后是重建，不是平滑迭代。10-19 一天内从 0.3.x 冲到 0.8.x，属于边重建边加功能。

- **10-18**：重建工程、Cloudflare Pages/Worker 路线、助手人格与项目骨架。
- **10-19**：聊天界面大修（输入区、发送键、消息头、追问动画）；学习中心上线（0.8.0：翻译、解题、练习、错题、生词、场景、作文）；数学排版与几何绘图（0.8.8–0.9.4）；情绪中心、礼物卡、文章卡、搜索。
- **10-20**：学习/绘图/游戏继续修，重点是把“吐代码”改成真 SVG 坐标绘图。
- **10-21**：0.9.5x–0.9.74，性格滑块、助理页、七步引导、兴趣气泡、历史抽屉、近满屏抽屉。
- **10-22**：2.0.0，场景应答扩到 24 个并支持自定义场景；登录页重做；学习流式与骨架屏；搜索/情绪同义词；默认日额度 100。
- **10-23**：3.0.0 游戏大扩（勇往直前、疯狂虾虾、全部击毙、爆破能手、台球计分等）；额度模型从“赠送额度叠每日上限”改成“每日 + 独立总量池”；i18n 与页面说明重做；3.1.3 补丁记录在日记中。

### 3. 稳定与收口（2026-10-24 — 2026-10-27）

- **10-24**：没有留下独立版本记录，项目停留在 10-23 的 3.1.3 附近；这段缺口在日记里如实标注，不补编不存在的改动。
- **10-25**：额度重置、助理日记截断、识图慢/只识别一部分、图片下 AI 提示隐藏、图文绕排等修复；这批改动在日记中有详细记录，但 `CHANGELOG` 没有对应的 10-25 版本条目，属于记录缺口。
- **10-26**：4.0.0，刷题改成引导页；化学实验题开始自动配装置图。
- **10-27**：4.0.1 解题页化学装置图；4.0.2 函数绘图补分段/极坐标/参数方程；4.0.3 数理字体单开关、更新日志回顶、化学/物理标注与连线修复；4.0.4 把数理字体收窄到公式/化学式/图形字母数字，中文与普通英文说明恢复正文字体；4.0.5 自动识别正文里裸写的化学式与算式，只给这些片段用衬线；4.0.6 课程对话改用统一 Markdown 渲染，修小标题、分式偏小、中文误变衬线和气泡溢出，刷题解析同步加保护；4.0.7 补全情绪中心、搜索、充值、日记、档案五页说明，并重排说明抽屉的分段、列表和提示块；4.0.8 说明文档全量改写、化学方程式重排、全局字号适配、24 类心情、引导页 20 标签与刷题/课程入口、200 学分换 1 额度且每日上限 20。

---

## 二、功能演进摘要

### 聊天

从“发一条等一条”，到流式、追问、引用、删除、消息头、联网搜索提示、音乐/天气/新闻/文章卡、额度胶囊、失败兜底。核心原则：先让用户看到字，再让附属卡片慢慢补。

### 学习中心

从七个入口，到课程、教材/章节、刷题引导、错题本、生词本、场景应答、作文、解题画图。学习输出越来越像“试卷”：公式用衬线、图有坐标、化学有仪器名和方程式、物理有受力方向和图例。

### 绘图

- 0.8.8：函数/几何按真坐标画，不再吐代码；
- 0.9.0–0.9.4：三角形、立体几何、根号排版；
- 4.0.2：分段函数、极坐标/螺线、参数方程、定义域端点空心/实心；
- 4.0.3：化学装置指向标注、方程式、物理图角度弧/中文图例；数理字体统一。

### 日记与情绪

日记从纯文本到富文本、图片、语音、AI 代写/评论、图文绕排；情绪从简单标签到近义词合并、环形图、无数据完整版面。图片 AI 说明只留 `alt`，不再污染正文。

### 游戏

从零星小游戏到 18 款：跑酷、迷宫、台球、保龄球、射击、爆破、棋类、2048、俄罗斯方块、贪吃蛇、乒乓球、快问快答、蜘蛛纸牌、围棋、记忆翻牌、扫雷、数字华容道。游戏积分可兑额度，但服务端限次防刷。

### 账号与额度

手机号 + 短信验证码注册，老邮箱账号仍可密码登录；PBKDF2 密码哈希、30 天 KV 会话、恢复码、WebAuthn。额度从“每日 + 赠送混算”纠正为“每日额度 + 独立总量包”，先扣日再扣包。

---

## 三、版本速查（CHANGELOG 全量）

| 版本 | 日期 | 第一条变更 |
| --- | --- | --- |
| 5.6.4 | 2026-10-29 | 明轩实测 5.6.3 四条：额度卡弹窗文字看不清 / 模糊没生效 / 弹出有问题 / 自动下滑仍不灵（点追问不跟、打字发完收键盘停在上一条）。①**文字颜色**：卡片原来是 `rgba(255,255,255,.16)` 半透明白 + `#fff` 文字，5.6.2 把底下的黑遮罩撤了以后就变成白字糊在浅色聊天上。改成实底 `var(--bg-soft)` + `var(--text)`/`--text-2`/`--muted`，金额渐变换纯色（浅色主题下渐变金到粉对比度不够）。②**模糊失效（关键教训）**：`.gift-sheet` 带 `opacity:0 → 1` 淡入，父级 opacity < 1 会建立 group，子元素 `.gift-sheet-blur` 的 `backdrop-filter` 采样不到真正的背景 → 看着完全没糊。改法：父级去掉 opacity 动画，模糊挂回 `.gift-sheet-blur`（`blur(18px) saturate(104%)`），靠卡片 `translateY(100%→0)` 提供动效；`.pts-modal` 上自己带 opacity 的 `ptsMaskIn` 动画同理删掉。③**弹出叠层**：`openGiftSheet` 先 `document.querySelectorAll('.gift-sheet').forEach(remove)`，防自动弹与手点撞在一起叠两层。④**不自动下滑**：新增 `pinBottom()`（`stickBottom=true` + `lastGestureAt=0` + `jumpBottom()`），`sendMessage` 追加用户气泡与骨架两处都改调它；键盘**收起**时（`visualViewport` 由开到关）补 `[0,60,180]ms` 三次 `jumpBottom()`。部署 `f6890f76`，`/api/version` = 5.6.4。 |
| 6.1.6 | 2026-10-30 | 明轩：情绪中心还全是百分百困惑。真因不是渲染也不是 SQL，是**标签太稀**：`tagEmotion` 只给「看得出情绪」的消息打标，一周 151 条你自己的话里只有 1 条被标（confused），占比 1/1=100%。词频兜底又把「氯**气**」数成了「生**气**」。改法：①标签改成**每条都给最接近的一个 key**（中性→calm），不再返回 null；②新增 `tagBatch()` 批量打标（一次 24 条，max_tokens 给足 + 半截 JSON 抢救 + 空正文小批重试），开情绪中心时后台 `waitUntil` 补录一周；③汇总改成「有标签就用标签」，词频只留给零标签兜底，并删掉 `气` 这个必然误伤的同义词。实测：一周标签从 1 条补到 46 条，分布 calm 65% / confused 17%，不再 100%。④**分类视图**：24 个 key 聚成舒展/投入/平稳/低落/紧绷/杂项六组（`buildGroups()`），前端加 `.emo-groups` 堆叠条 + 每类明细 chips，饼图保留。⑤**新增三档 `focused` 专注 / `curious` 好奇 / `bored` 无聊**，把「平静」这一大块切开。⑥**真凶是 max_tokens 给太小**：模型现在会把预算花在推理上，返回 `finish_reason=length` 且正文为空——`tagEmotion` 40→400、`tagBatch` 1500+30n、建议 200→900、详情 260→900，顺手治好了「建议和情绪详情一直用兜底句」。重打一周标签后：好奇 29%/专注 18%/平静 6%/困惑 4%，平静不再一家独大。部署 `e7e54090` / `7151fe56` / `a05f4d84`。

### 6.1.7（app `v412` / 部署 `01e93247`）
- 专注/好奇/无聊换 Apple 黄脸（🤓/🧐/🥱），补三张 160px Apple 图（`/assets/emoji/<key>.png`），不再用靶子。
- 「分门别类」挪到「虾虾的话」后面。
- 饼图给小情绪视觉下限 `FLOOR`（>10 片 4.5%、否则 5.5%），弧长按权重重排、数字仍按真实占比，1% 的也不再细成发丝；扇形标注改为按实际弧长（≥0.30rad）决定是否画。

### 6.1.8（app `v413` / theme `v307` / 部署 `1374c41d`）
- 饼图只画「主情绪 + 八格」九种，互相归一到 100%，不再把 27 种全塞进圆环。
- 补 `.g-engaged`（投入组）颜色——之前只有五个分组有配色，投入那一行圆点和色条是空的、看着像一条灰线。
- 抽屉背景磨砂改设置项「抽屉背景模糊」，`localStorage['minxtok.csblur']` + `body.cs-blur`，**默认关**（`.cs-mask` 不再默认 `backdrop-filter`）。

### 6.1.9（app `v414` / theme `v308` / ui `v151` / 部署 `c050639a`）
- 情绪详情走的是通用 `.sheet-wrap`（自带 14px 模糊），6.1.8 的开关挂错了 `.cs-mask`，所以「开关没用」。
- 改：`openSheet()` 先清 `emo-sheet` 标记，情绪详情打开后再打上；`.sheet-wrap.emo-sheet` 默认**只压暗**（`rgba(12,12,14,.22)`，不磨砂），`body.cs-blur` 打开才 14px 模糊 + 淡压。其他抽屉不受影响。 |
| 6.1.5 | 2026-10-30 | 明轩四条：化学式还有查不到、抽屉加载动画要跟思考动画一样、情绪中心百分比乱跳（怀疑屎山）、气泡偏紫要纯灰。①**情绪乱跳**根因三条——`message_emotion` 里虾虾的回复也被打了标签（分析口吻偏「困惑」），占比按 `count/total` 算，样本只有一两条时一条困惑直接 100%；`saveMessageEmotion` 每落一条标签就删汇总缓存，导致建议文案每条消息重写一遍。改法：只统计 `role='user'`（老数据无 user 标签时退回全角色）、分母 `max(total,12)`、删掉缓存清空、`adviceSig` 只认前三名占比不再带 total；标签查询偶发失败时先用上次缓存，不中途切到词频算法。②**速查表扩容**：新增 57 条物质 + 5 个离子（Fe(OH)₂/Fe₃O₄/CuSO₄·5H₂O/明矾/尿素/K₂Cr₂O₇/NO₂/稀有气体/乙烯乙炔甲醇蔗糖苯等），表从 76 → 142 条；客户端 `chemInput()` 再统一全角括号、全角正负号、各种间隔点、去配平系数。③**抽屉加载**：`正在查这个式子…` 换成 `.m-thinking` + `.th-label` + `.th-dots`，文字在前、点在后、无省略号。④**气泡**：`--bubble-user` 深色 `#27272d→#2a2a2a`、浅色 `#e7e7ee→#e9e9e9`，去掉偏紫的蓝。部署 `e8a4f884` / `7e890129`。 |
| 6.1.4 | 2026-10-30 | 明轩说 6.1.3「主聊天感觉不出」，要求**生成快完了再慢慢演**，并指出「有的化学式没有打点线」。①**匀速显字**：新增 `shownChars`（已演出的字数，永远落后于 `textBuf`）；`paintStream()` 每帧先推进揭示进度 `step = clamp(ceil(backlog/8), 3, 24)`（64ms 一帧≈47–375 字/秒），再用 `liveSafe(textBuf.slice(0, shownChars))` 渲染，于是模型一口气吐两百字也匀速往外走，`freshWrap` 只给这一帧新增的字上浮现。②**模型停了自己演完**：每帧末尾若 `shownChars < textBuf.length` 就自我续泵，不依赖 `delta`；`finally` 不再掐掉泵（有剩余就 `paintStream()` 继续），`flushStream()` 直接 `shownChars = textBuf.length`（骨架卡前必须先落地）。③**点线补齐**：`.m-chem .c-mol` 改 `.c-mol` 全局生效，删掉 `:has(.c-eq)` 撤线规则——方程式里的式子也能点，之前主动撤掉是误判；透明度 48%→55% 更清楚。部署 `f0612962`。 |
| 6.1.3 | 2026-10-30 | 明轩说超喜欢逐字浮现，但情绪中心点开时「有内容 + 动画」会卡，问能不能用到主聊天流式。①**卡顿**：6.1.2 是 80 个字拆 80 个 `.tx-in` 各跑一条动画，还带 `translateY`（每个 span 各自拉合成层）——改成**分组**，`size = ceil(字数/22)`，节点数封顶 22 个；动画只动 `opacity`，去掉 transform；加 `prefers-reduced-motion` 直出。②**流式接入**：`paintStream()` 每帧重画尾巴时用 `plainLen(lEl)` 量出上一帧已显字数，`freshWrap(lEl, livePlainLen)` 只给这帧新到的文本节点套 `.tx-in`，老字保持纯文本节点 → 重画不重播；尾巴被重新切短（head 前移）时字数变小则跳过并重置；`flushStream()` 与新气泡起始都把 `livePlainLen` 归零。首帧不加动画（没有参照长度），从第二帧起一批批亮。部署 `a2cbe5d9`。 |
| 6.1.2 | 2026-10-30 | 明轩复测四条。①**情绪文案拉回原长**：6.1.1 把提示词改成两段 140–180 字，他明确反对（「现在的就挺好，一开始就不是九十字，是两行到三行，我要都生成三行」），改回一段到底、写满三行（65–85 字），tokens 520→260，缓存键 `emo4:`→`emo5:`。②**文字出现动画**：原来 `.a-text.reveal` 只有 `.dc-text.reveal` 有动画，`#sheetBody` 里那层根本没有 keyframes——新增 `typeIn()` 把文案按字拆成 `.tx-in` 逐个浮现（步长按总字数自适应 8–20ms），情绪页建议与详情抽屉都走它。③**等待时间长**：详情文案存 `localStorage['minxtok.emo.detail.v2:<key>']`（12 小时），再点瞬开；打开情绪页时把前 5 条在后台依次预热，点到哪条都不用等模型。④**二价铁离子查不到**：`data-f` 里是 `Fe²⁺` 这种上标 Unicode，速查表里又没有离子条目，只能走模型还常失败——客户端加 `chemInput()` 做上下标→ASCII 归一，`src/chem.js` 补 **26 个常见离子**（Fe²⁺/Fe³⁺/Cu²⁺/Al³⁺/Zn²⁺/Mg²⁺/Ca²⁺/Ba²⁺/Na⁺/K⁺/Ag⁺/H⁺/NH₄⁺/OH⁻/SO₄²⁻/CO₃²⁻/HCO₃⁻/NO₃⁻/PO₄³⁻/MnO₄⁻/Cl⁻/Br⁻/I⁻/F⁻/S²⁻/Cr₂O₇²⁻），速查表 53→79 条，离子全部秒回。⑤**设置开关**：新增「化学式点词」，关掉后 `body.no-chemtap` 撤掉点线、光标与点击响应，`dict.js` 的 pointerdown/click 也直接早退。部署 `fa315d2a`。 |
| 6.1.1 | 2026-10-30 | 明轩三条复测反馈。①情绪详情字太少 → `DETAIL_SYSTEM` 改成两段五六句 140–180 字（第一段讲情绪从哪来，第二段讲怎么相处），tokens 300→520、截取上限 220→460、KV 缓存键 `emo3:`→`emo4:` 让老短文案全部作废重写；前端按空行拆段，一段段 90ms 跟上来。②价态胶囊里 `SO4` 的 4 没下标 → 渲染时过 `chemPretty()`，「SO₄」「MnO₄」「CO₃」正常。③能点的化学式一条虚点线（`.m-chem .c-mol` 加 `text-decoration: underline dotted`，`text-decoration-skip-ink: none` 让线连续穿过下标，后缀 `.c-tail` 一起带上；方程式含 `.c-eq` 时用 `:has()` 撤掉，免得一串式子全画线）。④「还是有连不上」：后端 `askModel` 失败自动重问一次、超时 9s→11s；前端把 401 从「没收录」里分出来，直接提示刷新，不再给重试按钮。部署 `b5844041` / `0e597fde`。 |
| 6.1.0 | 2026-10-30 | 明轩：「不能发现一个修一个，要按场景统一适配」。①**渲染统一**：`foldChemState()` 放到 `renderMarkdown` 出口做，化学式后的「溶液/气体/粉末/晶体」在所有渲染面（聊天、历史、学习、课程、刷题）一次性合并成 `.c-mol`，不再依赖各处手调 `linkChem()`——「中文后缀不识别」的根因是这条只在学习中心跑过。②**点词弹层重做**：原来借用英文点词小气泡（`max-height:220px` + `overflow:hidden` 必裁、`scroll` 捕获一律 `closePop` 导致「点了就消失」、标题把式子和名字各写一遍），改为独立底部抽屉 `#chemSheet`：底部点线 `.cs-grip`、下滑 84px 收起（`pointerdown/move/up`，内容滚到顶才接管）、遮罩点击关闭、`max-height:82dvh` 内容自滚不裁、逐条 `csIn` 淡入；标题名字与式子相同时只留一个。③**价态**：`VALENCE` + `RADICAL` 两张表，点开先列原子团电量与各元素常见化合价（`OH −1`、`CO3 −2` 这类整体显示，不再把 O、H 拆开罗列）。④**查不到可重试**：错误态给 `cs-retry` 按钮原地重查，不再只是干等；后端 `src/chem.js` 同步修了「查不到」的两个真凶——`max_tokens` 520 装不下 260 字物理+320 字化学，JSON 被截断直接判失败（提到 900），以及截断后整条丢弃（新增 `looseFields()` 按字段硬抠兜底）；模型超时 14s→9s，正文短于 14 字视为没写。⑤情绪中心数据到位时 `hero/格子/饼图/建议` 按 34ms 阶梯 `emoIn` 淡入，不再整屏硬切。⑥`chemPretty()` 去掉 lookbehind（老 Safari 解析期直接报错会带崩整个模块），改手写扫描。新增 `tests/render.test.mjs` 两条状态词用例。部署 `75a003a2`。 |
| 6.0.7 | 2026-10-30 | 明轩：**衬线分不清场景、语音识别成别的语言**。①排版加**场景判断器** `detectScene()`（`blocks.js`）：整段先判 weather / exercise / daily，再定规则——天气读数（23℃、零下5度、风力3级、湿度60%）一律按正文排，题目里的物理量连数字带单位整体进公式（新增 `UNIT_LATIN`/`UNIT_CN` 两道 pass，「2 L」「3 m/s」「0.5 g/cm³」不再一半衬线一半黑体）；`completeMathContext` 改吃场景，中文旁的数字顺带放了「个/岁/元/年/题」这类量词。②语音：`initial_prompt` 只留术语不留指令（「请用简体中文转写」这句被 whisper 原样回吐成「请用简体中文字幕」），新增 `sttSuspect()` 体检——整段没汉字（冰岛语乱码）、命中「字幕由…提供」这类幻觉句，就换无提示词重试一次，仍不行返回空串让前端提示「没听清，再说一次」；`fixTranscript` 加闸门：改动与原文零共同字视为跑题，退回原文。新增 `tests/render.test.mjs` 8 条。 |
| 6.0.6 | 2026-10-29 | 明轩：**情绪中心加载不出、而且太慢**。根因两条：①`handleEmotionSummary` 的首屏要等模型（`fresh=1` 每次绕过缓存 + `ask` 9s 超时 + 最多 480ms 打标签等待），最坏十秒；②前端拿不到数据时 `renderEmotionPage` 只 `fillPage(emotionSkeleton(true))`，一屏不动的灰骨架，看着就是"加载不出"。改法：**统计与文案分离** —— `tallyFromTags()` 一次 D1 聚合同步出结果；文案 `advice` 若缓存里"指纹"（`adviceSig` = 总数 + 前三占比）没变就直接复用，变了先用 `quickAdvice()` 的兜底句顶上，再 `ctx.waitUntil(fillAdvice())` 后台让模型写好落 KV，下次打开就是模型的话。没有逐条标签的老数据新增 `localCounts()` 本地词频兜底，绝不再为统计去等模型。详情 `handleEmotionDetail` 有缓存秒回，无缓存最多等 5s，失败给 `fallbackFor()`；前端页面渲染后顺手预热主情绪的详情。空态/失败态新增 `.emo-empty` + 重试按钮（`emotionNotice()`），12s `AbortController` 兜底。部署 `3b119169`。 |
| 6.0.5 | 2026-10-29 | 明轩两条：**语音卡模糊位置还不对；键盘上升不跟手（再不行就回退 6.0.3 的键盘）**。①键盘按"回退 6.0.3 做法 + 更快"处理：`#app` 撤掉 `transition: height`（三处规则全撤），`index.html` 的视口同步从「24ms 防抖 + 一次 setTimeout」改成 **`requestAnimationFrame` 每帧跟一帧**（`raf` 合并，`sync()` 直落 `--app-height`）。不再补动画——键盘动画期间可视视口每帧都在变，页面就是跟着键盘走；补过渡等于叠第二段延迟，键盘到顶页面还在爬。②语音卡/模糊位置：`vhPlace()` 的遮罩 `cut` 从「输入条顶 +12px」改成**正好停在输入条上沿**（不再吃进输入条）；`.voice-veil` 羽化 110px→**48px**（羽化太长会让靠输入条那一段几乎没有模糊，看着就是"糊错了位置"）；`vhPlace(box, again)` 加**一次性** 220ms 复测（键盘收起动画没走完时量到的位置偏低），`again` 防自我续帧，`vhTeardown` 里 `clearTimeout(vh.repl)`。部署 `de4f14d4`。 |
| 6.0.4 | 2026-10-29 | 明轩四条：**负温度还衬线、℃ 要拆成 °C 且 C 用苹方、键盘没动画、语音卡更慢且模糊高度不对**。①`blocks.js` 天气护栏的正则加负号/零下（`TEMP_NUM = (?:零下\s*)?(?:[-−~～]\s*)?\d+(\.\d+)?`），`-5℃`、`零下 3 度` 不再让 `-5` 漏进数学排版；`WEATHER_CUE` 补 `零下`。②天气场景里 `℃→°C`、`℉→°F`，把单个全角字形拆成「度 + C」两个字符，C 走正文苹方。③**键盘动画的真凶**：`theme.css` 后面 `#app, #page { transition: transform 340ms … }` 与 `#app { transition: opacity 420ms … }` 把前面写的 `transition: height` 整条覆盖 → 键盘照样硬跳；两处都补上 `height 220ms`。④语音卡：`pointerdown` 即 `vhWarm()` 预握麦克风、70ms 立卡、`hold` 220→150ms；`vhStop()` 里 `held < 280` 视为轻点，静默收掉并 `focus()` 还光标（不弹「太短了」）；`vhPlace()` 加 `maxB` 防顶出屏幕，`LIFT` 34 保留。⑤`.voice-veil` 羽化 96→110px，`vhPlace` 里遮罩下压 `+6 → +12`。部署 `ebe10699`。 |
| 6.0.3 | 2026-10-29 | 明轩五条：**键盘落下去聚焦态要撤、键盘升起要动画、语音卡出得慢、卡往上抬且模糊要羽化、流式下滑还卡**。①`index.html` 视口同步的防抖 90ms→24ms，`#app` 改 `bottom:auto; height: var(--app-height,100dvh)` 并加 `transition: height 200ms` —— 键盘弹起时高度是「长」上去的，输入框不再被瞬移挤上去。②`app.js` 的 `onViewport()` 在键盘落下（`kb` 从 >80 回到 0）时把聚焦的 `input/textarea` `blur()` + `clearFocus()`，光标与聚焦高亮一起撤。③语音卡：`pointerdown` 后 120ms 先 `vhBuild()+vhPlace()+show`（tip「准备录音…」），`vhStart` 只负责接麦克风，之前要等 300ms 定时器 + `getUserMedia` 回来才见卡片；启动阈值 `hold` 300→220ms。④`vhPlace()` 抬高 `LIFT = 34`；`.voice-veil` 加 `mask-image: linear-gradient(to top, transparent 0, #000 96px)` 下缘羽化 + 180ms 过渡。⑤流式 `paintStream` 尾巴切分加第三级：没空行没换行时按 `。！？；` / `. ` 切句，已说完的句子一次定稿并缓存，每帧只排最后一句。部署 `4de94acd`。 |
| 6.0.2 | 2026-10-29 | 明轩四条：**天气里的℃被排成公式、语音说完弹键盘、卡顿**。①`blocks.js` 新增 `WEATHER_CUE`（天气/气温/晴/雨/风/雪/雾…）与 `PHY_CUE`（速度/压强/浮力/溶液量…）；`autoInlineFormulas` 里凡「整段在讲天气 + 没在讲化学或物理」就把 `23℃`／`降到 9 度`／`体感 30 摄氏度` 整段按住不排版（`hold` 成纯文本占位），所以天气回答里的温度是日常读数、不是 `.m-unit`。②`vhFinish()` 删掉 `target.focus()` —— 语音不再呼出键盘；`vhStart()` 里把 `(vh.target || input).blur()` + `document.activeElement.blur()` 补上，开录时主动收掉输入法。③流式卡顿另一半：以前每个 `delta` 都调 `scrollBottom()`（读 `scrollHeight` 强制布局）再改 DOM，来回拉扯；改成 `paintStream()` 画完 DOM 之后再滚一次。④长回答（>1600 字）重画间隔 64→110ms，`document.hidden` 时完全不画，回前台补一帧。部署 `fc416541`。 |
| 6.0.1 | 2026-10-29 | 明轩七条续：**流式卡顿、分数线偏短、话筒糊+不是红、上滑被页面吃掉、识别慢且不准、概括语太干**。①贴底 `followStep` 去掉自我续帧（原来 30% 缓动每帧读 `scrollHeight` 强制重排再写 `scrollTop`，内容一直长 = 无限循环）改成一帧跳到位；`paintStream` 加 `lastPaintSrc` 无变化跳过，长段落（>600 字无空行）降级按单 `
` 切；`.stream-caret` 改为复用同一元素；`.msg` 加 `contain: layout style` 把重排锁在单条消息内。②`.m-frac .m-num` 加 `align-self: stretch` + `text-align: center`，分数线长度由分母决定（`2/(1/A+1/B)` 的 `2` 不再短一截）。③话筒图标换描边 SVG（`rect` 胶囊 + 弧形 + 立杆，`stroke-width 2`，24px），`.vh-ring` 边框 `1.5→1px`；取消态颜色不再用 `--danger`（这套主题里它是 `#d9d9de` 灰）改死红 `#ff453a` + 红色投影/时间戳。④按住期间 `lockScroll()` 挂文档级 `touchmove{passive:false}` + `html.vh-hold`（`touch-action:none`/`overscroll-behavior:none`），松手 `unlockScroll()`，防「整页上滑抢走 + 卡死」。⑤识别提速：松手只拿 whisper 原话（不再 `fix=1` 双跑），落框后 `vhFixLater()` 异步 POST 新接口 `/api/stt/fix`（`handleSttFix`，纯文本纠错、7s 超时、长度暴涨拒收），回来只在输入框没被改过时原地替换。⑥`STAGE_INTENT` 重排为「领域优先」：music/news/video/ocr/translate/geo 提到通用意图前，`look` 补回、`why` 去裸「作用」加 `平衡力|受力|判断|是不是|吗$`；`STAGE_PHRASE` 按场景重写（正在搜索热门歌曲/调用QQ音乐歌曲数据库/浏览实时新闻资讯/浏览相关视频/解析歌词内容/调用OCR提取文字/翻译中/解析位置信息/理解这个概念…），`base` 首句改「正在理清思路」；`card` 阶段改「正在智能排版」。部署 `d2150fb0`。 |
| 6.0.0 | 2026-10-29 | 明轩七条：**灰字全撤、光标与语音打架、上滑无红灯、错题本露 `[[math:]]`、化学式可点查性质、麦克风音纹/识别、英文补齐**。①`.web-note`/`.img-note` 两种灰字彻底不落地（流式期也不建），搜索数量与图片兜底统一写进气泡三点前那句（`setThinkingLabel(dots,'按文字读图片')`）。②长按输入框期间 `touchstart` 也 `preventDefault`（iOS 上只掐 `pointerdown` 拦不住聚焦）＋按住时 `readOnly`、松手恢复；轻点 `<350ms && 移动<12px` 自己 `focus()` 还光标。③上滑取消阈值 `-40 → -30`，且取消态**先 `vhBuild()` 把卡片立起来再标红**（原先卡片要到 300ms 才建，滑早了完全没反馈），松手才真的 `vhStop(true)`。④`plainLatex()` 归一全角括号、允许未闭合 `[[math:` 吃到行尾、兜底再剥一层壳；`.study-item-note` 改走 `renderMarkdown(toMathTags())` + `linkChem`，CSS 抹掉 `<p>` 段距。⑤新增 `src/chem.js`（`GET /api/chem?f=&s=&lang=`，50 种常见物质速查表 → 模型兜底，`caches.default` 按式子+状态+语言缓存 30 天）＋前端 `molHtml()` 每个物质独立包 `.c-mol[data-f]`（加号处封口，不再整边一个壳），`linkChem()` 把紧跟其后的「溶液/气体/粉末/固体/晶体…」并进同一可点单元（`.c-tail` 用正文字体），`[[math:Na₂O₂]]` 这类整段纯式子改走化学排版（正体+下标），点 `.c-mol` 复用查词弹框壳（`.dp-crow`/`.dp-sec` 分段）。⑥音纹 `gap 2.5→4px`、线宽 `2.5→2px`，加中间高两边低的包络 `env`，`vhClean()` 增益上限 `10→22`＋20ms 帧噪声门（20% 分位底噪 ×1.5 以下压到 25%）；`vhFinish` 长句（>8s 且有草稿）只补尾巴 `vh.cut→total`，部分转写间隔 `2.2→1.8s`。⑦`STAGE`/弹框文案双语补齐，`/api/chem` 支持 `lang=en` 走英文提示词。部署 `05fdee09`。 |
| 5.10.5 | 2026-10-29 | 明轩三条：**搜索关键词数/资料数搬进气泡、三点前那句不要省略号、等号画得太粗**。①`stageLabel(q,'read',count,terms)` 直出「搜索 N 个关键词，参考 M 篇资料」，并撤掉流式期那条独立 `.web-note.searching`（「正在搜索中」/「搜索 N 个关键词」灰行），只留 `block` 落定后的记录行；流式文字改为插在 `.m-thinking` 之后。②`STAGE_PHRASE`/`STAGE_EN` 全部去尾部 `…`，`web`/`card`/`image` 三个固定文案同步去省略号（三点本身已是省略号）。③等号两横 `.c-eqbar::before/after` height `0.085em → 0.07em`、`border-radius 0.05em → 1px`；带条件版 `0.14em → 0.07em`，inset `0.16em → 0.25em`，两横间距与普通版对齐（0.28em），只有长度不同。部署 `5a3c09df`。 |
| 5.10.4 | 2026-10-29 | 明轩四条：**等号又太高 / 长按老变成光标然后录音被取消、取消该先变红松手才生效 / 转写慢且不准、离远听不清 / 三个点上方那句不许照搬问句，要「查找现有知识库」这种抽象短语**。①**等号落位**：空 inline-block 的基线就是它的下外边，`vertical-align` 直接决定双横线高度 —— `.c-eqbar` 0.18em → **0.06em**，`.c-cond .c-arrow.c-eqbar` 0.22em → **-0.05em**，两种等号的中线都压到离基线 0.34em（数字视觉中线）。②**长按不再是光标**：真因是长按输入框触发系统文本选择，系统接管指针后派发 `pointercancel`，老代码把它当作用户取消 → 录音白录。修法：触摸 `pointerdown` 直接 `preventDefault()`（不聚焦、不立光标、不弹选择手柄）；`pointerup` 里「<350ms 且位移 <12px」才 `focus()` 把键盘还回去；`pointercancel` 改成按当前红/不红状态收尾，不再强杀。③**取消要松手才生效**：上滑阈值 -64px → **-40px**，`pointermove` 在 `vh.held` 阶段就生效（没开始录就上滑直接撤掉 300ms 启动定时器），卡片先加 `.cancel` 变红并换提示「松开取消」，真正 `vhStop(true)` 只在 `pointerup`。④**转写提速 + 远场准确率**：`vhClean()` 去直流 + 80Hz 一阶高通 + 峰值归一到 0.9（最多 10 倍增益）+ 软限幅；`new AudioContext({sampleRate:16000})` 让浏览器自己做抗混叠重采样（原来按块平均降采样有混叠）；`initial_prompt` 加学科术语提示；松手瞬间先把已有草稿填进输入框（`vh.draft` 记 before/after），定稿回来若未被动过就原地替换 —— 字先到，等待感消失。⑤**概括行不照搬问句**：删掉 `stageTopic()` 回显，改成 `STAGE_PHRASE` 短语池（查找现有知识库／分析问题本质／列式计算／提炼关键结论…）+ 意图表 `STAGE_INTENT` 顺序修正（`look` 提到 `why` 前，避免「天气怎么样」被 怎么 抢走），短语按次轮换。部署 `642e0765` → `616338ce`。 |
| 5.10.3 | 2026-10-29 | 明轩三条：**方程式等号左右要留缝、条件文字把等号挤下去了 / 长按唤出光标会打断语音、输入框不该被模糊 / 语音识别出语义错乱要按原意纠（增强绿气→讲讲氯气、牛多→牛顿）/ 三个点上方要有一句随阶段变化的 AI 概括**。①**方程式排版**：`.c-eqbar` 左右 margin `.04em → .22em`；`.c-cond` 从「inline-flex 竖排」改成「inline-block + 条件文字绝对定位」（`.c-txt` 挂 `bottom:100%`、`.c-below` 挂 `top:100%`），等号不再被上方条件顶下去，有条件和没条件落在同一条基线上；`.m-chem` 行高 1.9 → 2.02 给条件留空。②**长按不再唤光标**：`attachVoiceHold` 加 `focus` 监听，触摸按住超过 170ms 就把输入框 `blur()` + `removeAllRanges()`（轻点 170ms 内照常聚焦，打字不受影响），松手且失焦时再 `focus()` 还回去；`vh.suppress` 只在触摸时置真，鼠标点击不受影响。③**背景模糊让开输入框**：`vhPlace()` 顺带算 `.composer` 的 `getBoundingClientRect().top`，给 `.voice-veil` 写内联 `bottom`，模糊只糊输入框以上那一块。④**语音语义纠错**：`/api/stt` 新增 `?fix=1`（只定稿走，草稿不走），`fixTranscript()` 用 deepseek 以 `STT_FIX_SYSTEM` 纠正同音字并补标点，7s 超时、长度暴涨（>2.2 倍+20）直接弃用改回原文；实测「增强绿气的化学性质」→「讲讲氯气的化学性质。」「西医说说牛多的定律」→「细细说说牛顿的定律。」，正常句只加标点不改写。⑤**三个点上方的 AI 概括**：`thinking(label)` + `setThinkingLabel()`（`.th-label` + `.th-dots`，换词时 `.th-out` 模糊淡出 → `.th-in` `thLabelIn` 弹入）；`stageLabel()` 先按问句关键词选意图（总结/归纳/梳理/理解/查找/计算/规划/起草）+ 去掉语气词的话题，再按 SSE 阶段切「调用网页搜索工具…」「查阅 N 篇资料，准备答案」「把结果整理成卡片…」「正在看这张图…」。部署 `75e0c48b` → `a1876d6e`（170ms 光标判定）。 |
| 5.10.2 | 2026-10-29 | 明轩三条：**语音老是识别成别的语言、也不准 / 样式要最初那版小卡、要音纹、卡片出来时背景模糊 / 偶有单个元素符号（N）没有衬线**。①**语种钉死 + 换大模型**：`handleStt` 改走 `@cf/openai/whisper-large-v3-turbo`，JSON 传 base64 音频 + `language`（前端按界面语言传 `?lang=zh|en`）+ `initial_prompt`（中文提示语）+ `vad_filter` + `condition_on_previous_text:false`；老 `@cf/openai/whisper` 只作兜底（`sttLegacy`，不支持语种）。②**不再让大模型改写转写结果**：新增 `TRAD_ONLY` 繁体检出表，只有命中繁体字才调 `toSimplified`，其余原样返回——以前每句都过一遍 LLM，既慢又会被改得不准。③**自检探针**：`GET /api/stt/check?probe=1` 用 0.3s 静音 wav 真打一次 turbo，回 `probe:ok`（实测通过，说明子令牌对 turbo 也有权限）。④**语音 UI 回到最初那版小卡**：`.voice-hud` 换成 `--surface-2` 实底 26px 圆角、84px `.vh-stage` + 56px `.vh-core` 圆话筒（内嵌 mic SVG）+ 三圈 `.vh-ring` 波纹；下面是 `.vh-tip`/`.vh-time`/`.vh-wave`（15 根 2.5px 音纹，`vhPaintWave()` 按 `vh.wave` 最近 15 帧音量滚）+ `.vh-live` 实时草稿。⑤**卡片出现时背景模糊**：新增 `.voice-veil`（fixed inset 0、`backdrop-filter: blur(18px) saturate(1.25)`、不铺底色、`display:none/block` 切换、z-index 129），开录/转写时亮起，结束或取消收起。⑥**裸元素补衬线**：`blocks.js` 新增 `CHEM_BARE_ELEM_RE`，在 `SCI_CUE` 语境下把夹在中文里的单元素符号（氮（N）、C 和 O₂）也包进 `chemHtml`；`SCI_CUE` 顺带补了 元素/单质/化合物/化合价/原子/分子/氧化物/氧化/还原。⑦**顺手修历史遗留**：`index.html` 里 `theme.css?v=` 一直停在 279，之前几版改的 CSS 都被浏览器缓存挡住看不到——这次提到 289。部署 `8122e2be` → `80239496` → `4573baf0`。 |
| 5.10.1 | 2026-10-29 | 明轩四条：**语音识别出了字底下还挂着三个点 / 现在这版不如最初那版、要背景模糊、能做实时转文字最好 / 设置里加「语音输入后自动发送」/ 历史要跟导航栏一起出来**。①语音 UI 从「输入框原地变成海」改回**浮层提示卡**：`.voice-hud` 挂在 body 上、`backdrop-filter: blur(26px)` 磨砂底，卡里三层 `.vh-ring` 波纹随 `--lvl` 扩散、五根 `.vh-bars` 电平条跟着涨；`vhPlace()` 按目标输入框位置算 `bottom`，主聊天和学习中心共用。②**实时转文字**：录音从 MediaRecorder 改成 `AudioContext + ScriptProcessorNode` 直接收 PCM（用 0 增益 GainNode 接到 destination 才出数据），按 `ac.sampleRate/16000` 降采样；每攒 2.2 秒 `vhFlushPartial()` 送一段到 `/api/stt`，草稿写进 `.vh-live`；松手 `vhFinish()` 用整段重转一遍做最终稿，直接填进输入框，多余的 loading 点全部删掉。③**自动发送**：设置新增 `data-toggle="voicesend"`，键 `minxtok.voice.autosend`；打开后 `vhFinish` 填完 120ms 触发 `#btnSend`（学习中心点它自己的 `.send`）。④**AudioContext 必须在 pointerdown 里建/唤醒**，晚 300ms 再建会被当自动播放拦掉。⑤**历史跟导航栏同步**：新增 `CHAT_CACHE_KEY='minxtok.chat.cache'` + `readChatCache()`/`writeChatCache()`，`restoreHistory()` 先用本地缓存落屏（不再先骨架），联网回来若消息 id 序列与缓存一致就直接留用不重画，只有内容变了才清空重绘；缓存只留最近 12 条、文本截 1200 字、data URL 图片降级成「[图片]」防止撑爆 5MB。⑥学习中心空答案不再整段消失：`ask()` 空答案视为失败 → 自动退 `streamInto()` 流式重试一次 → 还失败才显示红字 + 「重试这一次」。⑦**STT 真因**：`CF_AI_TOKEN` 这个 secret 值是坏的，`GET /api/stt/check` 自检回 `hasToken:false`；用账号令牌签发只含 Workers AI 读写的子令牌重写该 secret 并重新部署才发现（**Pages secret 改完必须重新 deploy 才生效**）。部署 `d62c3553` → `1ae37bb4` → `c2491612`，app v387 / theme v287 / study v109。 |
| 5.10.0 | 2026-10-29 | 明轩一批：**衬线要会看语境 / 化学题出不来 / mathrm 泄漏 / 学分太少 / 场景智能结算 / 长按语音 / 接 SurveyKing**。①`blocks.js` 新增 `SCI_CUE`（mol、浓度、溶液、滴定、质量分数…）并新增理科单位整体 pass `SCI_UNIT_RE`（数字+mol\/L、mL、g\/mol、℃、%整体进公式），日常“250毫升牛奶”仍走 `CN_MEASURE` 放行——**用语境判断代替死清单**；`stripTexWrappers()` 兜底拆裸 `\mathrm{X}` / `mathrm{X}`。②`study.js` 输出上限 3000→6000、`STUDY_TIMEOUT` 50s→90s、空手而归自动重试一次（难的化学综合题以前会在解析中途被截断）。③`drill.js`/`course.js` 提示词改成化学式用 Unicode 下标（H₂O、SO₄²⁻），禁止 `\mathrm`。④学分：刷题 18→30、课程单选 128→200。⑤场景应答新增 `POST /api/study/scene/wrap`（模型复盘 → 分数/用过的句子/更地道说法/语法提醒/学分），前端 `requestWrap`/`endChip`，说再见或谢谢自动出结算卡，聊满两轮可手动结束；`.scene-wrap`/`.sw-*`/`.scene-end-chip` 样式入库。⑥长按输入框录音转文字：`attachVoiceHold()`（pointer 事件、0.3s 触发、上滑取消、`/api/stt` + Whisper），`.voice-hud` 主题色三层波纹 + 电平波形，主聊天与学习中心都挂上。⑦新增 `src/survey.js` 薄代理 + `GET /api/survey/status`，`docs/SURVEY.md` 写清所需变量；`build-pages.mjs` 的 `ORDER` 补 `survey.js`（漏了会 ReferenceError）。⑧`chat.js` 的 `announced` 只在本来就在聊歌时才算，修「随口一句话多出一张虾虾推荐卡」。部署 `5566d8c8`，app v383 / blocks v165 / theme v284 / study v108 / course v35 / drill v57。 |
| 5.9.1 | 2026-10-29 | 明轩五条：**日常数字变衬线 / 模型不知当前时间 / 不等搜索完就答 / 天气要用真实定位 / 用户气泡靠色**。①`blocks.js` 的 `CN_MEASURE` 大幅扩容（年|月|日|号|点|级|步|周|期|届|辆|台|套|首|集|季|页|行|字|斤|两|升|卡|度|℃|℉|%|kg|km|ml|L…），并把「中文旁裸数字」加一道 `MATH_CUE` 闸门（得/等于/代入/函数/坐标/顶点/面积/区间…），没有数学线索就不进衬线；`/tmp/mt9.mjs` 12 例日常句全部零误包。②`src/chat.js` 新增 `nowNote()`，每轮把北京时间写进 system 上下文；`src/llm.js` 加两条硬规则：以【当前时间】为准、不许猜年份；看到【联网搜索结果】必须先读完再答，禁止"我查一下"式拖延。③`src/web.js` 的 `decideWebSearch` 从「LLM 分类器决定」改成**默认就搜**，只有寒暄 `CHAT_ONLY`、纯情绪 `EMOTION_ONLY`、学科题 `STUDY_ONLY` 跳过；新增 `cleanQuery()` 剥口语前缀当查询词。④`src/cards.js` 新增 `resolveCityByLatLon()`（和风 GeoAPI `geo/v2/city/lookup` + 经纬度），`getWeatherData` 在 city 为空时反查；`app.js` 新增 `ensureGeo()`（`navigator.geolocation` → `minxtok.geo`，12h 缓存、6s 兜底），只有天气类消息才等定位，天气卡弹层也改用真实经纬度。⑤`theme.css` 新增 `--bubble-user` / `--bubble-user-line`（深色 `#27272d`、浅色 `#e7e7ee` + 发丝边），用户气泡与底色拉开一档。部署 `f2966ff2`，`/api/version` = 5.9.1（app v382 / blocks v164 / theme v283）。 |
| 5.9.0 | 2026-10-29 | 明轩「刚进去被拖在底部的问题仍有」+ 要求跳到 5.9.0。**根因**：之前的 `stickEpoch` 只作废「延时补底」那一串，但 `chat` 的 `load`（图片）、`ResizeObserver`（公式/卡片长高）、`visibilitychange`/`resize` 三条自动贴底只要 `stickBottom` 还是 true 就照拽；而 `stickBottom` 只在「上滑超过 10px 且 900ms 内」才被松开，进场时手指刚放上去还没滑够、或斜着手势被判定不成立，就一直被拽回去。**修法**：新增 `userTookOver`（用户接管）——`releaseStick()` 置 true；`touchmove` 任一方向位移 >6px 或多指即判定接管；`scrollBottom()` 开头 `if (!stickBottom || userTookOver) return`；`scrollBottomSoon` 追加 `!userTookOver`；进场那串 `[60,160,320,600]` 外层加 `if (!userTookOver)`；`scroll` 里 `gap<=4` 才把 `userTookOver` 清回 false（滑回底部自动恢复跟随）；`pinBottom()`（发消息/点追问）清回 false；`restoreHistory` 开头清 `userTookOver` 并 `stickBottom=true`，保证换会话仍落在最新一条。CHANGELOG 升 5.9.0，部署 `3502617c`，`/api/version` = 5.9.0（app v381）。 |
| 5.6.8 | 2026-10-29 | 明轩第三轮：**箭头仍不统一 / `**` 被吞 / 裸字母 h、g、y 不衬线 / `-4` 不衬线**。①孤立箭头 `→←↑↓↔⇒⇐⇔⟶⟵⟹⟺` 进 `MATH_SOLO_SYM_RE`，正文里单蹦的箭头也换图形，不再混字体字形。②新增 `MATH_SATOM`（原子允许带前导正负号）并替换六条链式规则的右半，`x→+∞` 整条包住、`+` 不掉队。③`completeMathContext` 去掉 `if (n)` 门槛，中文旁边任何单字母都补衬线（`高度为 h`、`取 g`、`有的 y`），新增 `CN_PUNCT` 让顿号/逗号/括号也算“旁边是中文”（`a、b 为常数`），并新增负数字面量规则（`代入后得-4` → `-4` 一体）；数字规则补 `\s?(?:CN_MEASURE)` 前瞻，`价格 5 元` 不进公式。④`trimMathEdge` 两端额外剥 `*` `_` `~` 反引号，`**f(x)=1**` 不再把星号吸进公式。桩测 `/tmp/mt4.mjs` 9 例全干净（`3.14`/`9.8` 这类数值常量按预期进衬线）。部署 `6e8d04c7`，`/api/version` = 5.6.8（app v380 / blocks v163）。 |
| 5.6.7 | 2026-10-29 | 5.6.6 之后的第二轮：**根号含糊从源头治** —— `src/study.js` 第 3 条规则改写（根号一律把被开方式用花括号/括号圈住，禁止 `√x-1`），`src/llm.js` 同步加一句。**只有右半边/左半边的式子**：`MATH_OP_LEAD_RE`（`=1`、`≥2`、`代回得=1`）、`MATH_OP_TAIL_RE`（`x=`）。**标点归属**：`,` `:` 进 `MATH_SIGN` 让 `x:y=1:2`、`(−1,−1)` 成链，但新增 `trimMathEdge()` 把公式首尾的逗号冒号退回正文（`一般地,`、`时,y=2` 不再被吞），`mathTextHtml` 里这两字符单独走 `.m-sep`（`margin:0 .14em`）；`.m-sep` 样式加在 theme.css。**下标**：新增 `MATH_LOW`（`₀-₉₊₋ₙₓᵢ`），`MATH_ATOM` / `MATH_EQ_RE` / `MATH_IMPLICIT_RE` 都放行，`a₁+a₂=a₃`、`Sₙ=n(n+1)/2` 一次包完。**∛ ∜** 进 `MATH_SOLO_SYM_RE`。部署 `0f6fdcea`，`/api/version` = 5.6.7（app v379 / blocks v162 / theme v282），`/tmp/mt4.mjs` 9 例普通文本仍零误包。 |
| 5.6.6 | 2026-10-29 | 明轩逐条点名的渲染问题，全部在 `blocks.js` + `theme.css`。①**散件补衬线**：同段里已经有公式时，旁边单蹦的变量/数字也要进数理字体 —— 新增 `completeMathContext()`（中文旁单字母、运算符旁单字母、中文旁裸数字，量词/单位后的数字不动；靠 `mapPlain()` 每步重新切占位符，避免吃到大写 MATH 占位串），另加 `MATH_VAR_NOUN_RE`（x轴/y轴/…的）、`MATH_PAIR_RE`（xy/ab…）、`MATH_VALUE_RE`（最低点0、升到1，名词用捕获组保留）。②**箭头统一**：`→←↑↓↔⇒⇐⇔⇌↦…` 改为 `arrowSvg()` 画 SVG（`.m-arr` / `.m-arr-v`，`vertical-align:middle`），彻底解决“有的贴下划线、有的居中、换字体就变样”。③**全根号**：`mathParts()` 把 Unicode `√` 转成 `\\sqrt{}` 结构，才会画出盖住被开方式的横杠；`MATH_SQRT_RE` 提到等号规则之前（否则 `√x−1=1` 被等号先切走，√ 留黑体）。④**新识别**：`MATH_COORD_RE`（`(−1,−1)`、全角括号自动归一，排在链式规则之后）、`MATH_ARROW_LEAD_RE`（`⇒ x=1/2` 连箭头一起进公式）、`MATH_SIGN` 补 `∈∉∋∪∩⊂⊃⊆⊇∀∃∅∑∏∫∂∇∴∵≪≫∝⊥∠∥`、`MATH_SYM_ATOM` 补希腊字母/∞、`MATH_ATOM` 允许 `AB`/`CD` 这种大写双字母、`MATH_SOLO_SYM_RE` 兜孤立符号带上下标。⑤**误伤修复**：手机号/座机/时间/版本号在 `renderMarkdown` 里先 `hold` 住，不再被 `-` `:` 拆成公式。node 桩测：`/tmp/mt3.mjs` 15 例全部命中，`/tmp/mt4.mjs` 9 例普通文本零误包。部署 `bcfa9b3a`，`/api/version` = 5.6.6（app v378 / blocks v161 / theme v281）。 |
| 5.6.5 | 2026-10-29 | 明轩两个 bug。①**刚进页面被拽住**：恢复历史后有一串 `setTimeout(scrollBottom)` 补底（60/160/320/600ms），用户在这几百毫秒里上滑，下一次补底又把他拽回底部，表现就是“被固定在追问那块、要滑两次才解开”。修法：新增 `stickEpoch`，`releaseStick()` 递增；补底统一走 `scrollBottomSoon(ms)`（epoch 不符就作废）；`scrollBottom()` 里再加一条「刚 touch 过 260ms 内不跟随」；`visibilitychange`/`resize` 也走 `canAutoJump()`。②**公式漏衬线**：`MATH_INLINE_RE`/`MATH_EQ_RE`/`MATH_IMPLICIT_RE` 的运算符类只有 ASCII，模型写的 `−`（U+2212）、`→`、`±`、`≡`、`⇌` 都不认，于是 `x→0⁻`、`x<1.76`、`f=(x−1)²`、`x=−1`、`:x(x−1` 只能半截套上公式字体。改成共享 `MATH_SIGN`（含 U+2212/箭头/±/∓/≡/⇌/√）与 `MATH_UP`（`⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻`），原子后面允许跟上标；`isMathInline` 同步用新字符集；`mathTextHtml` 的 `OPS` 补 `−≡∓⟶⇌↑↓`；新增 `MATH_SQRT_RE` 认 `√2`/`√(x+1)`。node 桩测：5 个样例全部落进 `.math`。部署 `ca9bfc77`，`/api/version` = 5.6.5。 |
| 5.6.4 | 2026-10-29 | 明轩实测四条（额度卡弹窗文字颜色 / 模糊没生效 / 弹层叠两层 / 自动下滑）。①卡片原是半透明白底 + `#fff` 字，5.6.2 撤掉黑遮罩后白字糊在浅色聊天上 → 改实底 `var(--bg-soft)` + 主题文字色，金额渐变换纯色。②**模糊失效真因**：`.gift-sheet` 外层带 `opacity: 0 → 1`，父级 opacity < 1 会建立合成组，子层 `backdrop-filter` 采样不到真实背景 → 等于完全没糊；去掉外层透明度动画，模糊挂 `.gift-sheet-blur`（`blur(18px)`），动效交给卡片 `translateY`；`.pts-modal` 的 `ptsMaskIn` 同理删。③`openGiftSheet` 先清掉已有 `.gift-sheet`，防自动弹与手点叠两层。④新增 `pinBottom()`（`stickBottom=true; lastGestureAt=0; jumpBottom()`），`sendMessage` 两处改调；键盘**收起**补 `[0,60,180]ms` 的 `jumpBottom()`。部署 `f6890f76`，app v376 / theme v279。 |
| 5.6.3 | 2026-10-29 | 明轩问「偶有的不自动下滑修了么」。5.6.1 只修了缓动收尾不到底，这次补三处真凶：①**误判成翻旧账**——`touchmove` 一响就 `releaseStick()`，手指轻碰抖 1px、或者往下拖想看新消息都会断电。改成记 `touchStartY`，只有上移 >10px 才松手；`wheel` 只在 `deltaY < 0`（真往上滚）才松手。②**内容后长高不跟**——`load` 只覆盖 IMG，KaTeX 排版、卡片渲染、字体回流是尺寸变化没有事件。加 `ResizeObserver`（+ `MutationObserver` 给新子节点补 observe），任一子元素变高就 `scrollBottom()`。③**回前台/转屏/收键盘**——补 `visibilitychange` 与 `window.resize` 时的 `jumpBottom()`（键盘已由 `visualViewport` 处理）。部署 `58f0e51d`，`/api/version` = 5.6.3。 |
| 5.6.2 | 2026-10-29 | 明轩三条。①**节日 emoji 全部本地化**：`public/assets/apple/` 补 41 张 Apple 官方 PNG（emojipedia `em-content.zobj.net/source/apple/391/…`；jsDelivr / raw.githubusercontent 在这个网络里连不通），`blocks.js` `APPLE_EMOJI` 扩到 73 条，覆盖万圣节（🎃👻🦇🍬🧟🧛🧙🔮🦴🪦🎇）、圣诞（🎄🎅⛄🔔🎀🧦🦌🍾）、春节（🧨🏮🐉🐲🥟🍊🥳🪅）、情人节（🌹💐💝💌）、中秋/端午（🌾）、毕业季（🎓📚🧠💡🔥🏆🥂🍰🥇）；缺货的 🕷️🕸️💀🕯️🧹❄️🚣 在 CDN 上 404，不映射走系统字体兜底。②**万圣节卡改活动自动发**：`src/gift.js` 加 `HOLIDAY_EVENTS` + `ensureHolidayGift()`（`note='holiday:halloween2026'`，发过/领过不再建，活动期 10-29~11-02），`src/chat.js` 每轮先 ensure 再 `pendingGiftFor`；`giftBlock` 输出 `autoOpen`（note 以 `holiday:` 开头），`renderGiftCard` 未领时 480ms 后自动派发 `block:action`，`localStorage minxtok.gift.auto.<giftId>` 保证一张卡只自动弹一次；`pumpkin25` 仅留测试（autoOpen=false）。③**弹层只留模糊**：`.pts-modal` / `.gift-sheet-blur` / `.ns-wrap.show` / `.sheet-wrap` / `.scrim` 全部去掉白底黑底（含删掉 `.gift-sheet-blur::after` 暖色光晕），改用 `backdrop-filter` 纯模糊；礼物屏从居中改成**底部升起**（`align-items:flex-end`、卡片 `translate3d(0,100%,0)`→`0`、圆角只留上面、`env(safe-area-inset-bottom)`）。部署 `63197d77` → `5ab2121c`，`/api/version` = 5.6.2。 |
| 5.6.1 | 2026-10-29 | 明轩三条。①自动贴底偶有不到底：`followStep` 原来按 22% 缓动追，追到 `gap<=0.5` 就停，末尾那几像素永远差一口气；改成 `gap<=28` 直接 `scrollTop = max`，另外 `chat` 捕获阶段监听 `img` 的 `load`（后加载把内容顶高时补一次），流式 `done` 与 `finally` 各补一次贴底。②积分/学分兑换：滚轮改成 JS 接管手势（`ui.js` 新增 `bindWheel(el,itemH,onChange,buzz)`，`touch-action:none` + pointerdown/move/up + 抬手吸附 + wheel 事件兜桌面），关掉原生 `scroll-snap`（会和手写滚动打架），默认停在第 1 格（停在 0 让人以为点不动）；弹层遮罩去 `color-mix`（老 WebView 不认整条失效）改固定 `rgba(8,10,14,.58)`，浅色主题 `rgba(18,18,22,.34)`，不再白蒙蒙。③万圣节限定额度卡：`src/gift.js` 新增 `PROMO_CODES`（写死不进 KV，`expiresAt` 自动过期），口令 **`pumpkin25`** → 25 额度、🎃、`theme:'halloween'`；`giftBlock` 用 `theme` 或南瓜 emoji 识别主题，`renderGiftCard` 加 `.is-halloween` 与「🎃 万圣节限定」小标，`theme.css` 配南瓜灯配色。部署 `bfdf1fd3`，`/api/version` = 5.6.1。 |
| 5.6.0 | 2026-10-29 | 明轩反馈「流式输出时自动滑动会一直卡在底部，往上滑不动，得大滑一下才解除」。老逻辑只看 `gap < 140` 决定是否贴底：往上拖不到一百多像素仍算贴底，手指一松就被 `followStep` 拉回去。改法：①加 `lastGestureAt`，`touchmove`/`wheel` 一律 `releaseStick()`（`stickBottom=false` + 取消 `followRaf`），拖一点点就放手；②`touchstart` 只记时间不解除；③`GESTURE_HOLD=900ms`，手指抬起后的惯性仍算用户操作；④`gap<=4` 才重新吸附。部署 `4f2ee70a`，`/api/version` = 5.6.0。 |
| 5.5.1 | 2026-10-29 | 明轩说"偶有卡顿"，查下来主因是聊天历史一次性全渲染：`restoreHistory` 一次拉 50 条、每条都 `renderMessage`（markdown + KaTeX + 图片），DOM 很大，进场和滚动都抖。改法：①`CHAT_KEEP_MS=24h` / `CHAT_MAX_LIVE=16` / `CHAT_CHUNK=8`，一天以前的先折叠，首屏最多 16 条，顶部放 `.chat-more` 折叠条，上滑到 `scrollTop<=90` 或点它往前补 8 条（内存里没有就按 `before` 找服务端要），补完按 `prevTop + (scrollHeight-preH)` 钉回原位置；②`GET /api/history` 新增 `before` 时间戳分页，`listMessages(env,uid,convId,limit,before)` 走 `created_at < ?`；③两个 `chat` scroll 监听合并成一个 rAF（原来一个管贴底、一个管折叠，各读一次 `scrollHeight` 强制同步布局）；④到账/版本抽屉去掉圆形徽标，标题纯文字居中。部署 `a75c26b6`，`/api/version` = 5.5.1（顺便自测了版本检测）。 |
| 5.5.0 | 2026-10-29 | 明轩七条：①充值倒计时英文模式闪中文 → `i18n.js` 新增 `trText/setTrText`，倒计时与「重新生成（Ns）」写入时同步翻译并记 `__zh` 供切回中文还原；②日记页「今天」「今天想记点什么」漏翻 → 补 `ZH2EN` 词条与 `^YYYY-MM-DD · 今天$` 句式；③全局流畅度 → `games.js` 统一 `gRaf()`（27 处逐帧调用，离开游戏页即不再排帧，暂停仍走 `freezeFrames` 的拦截），`pollStatus()` 在 `document.hidden` 时直接返回；④新增 Apple 式底部抽屉 `.ns-*`（`openNotice/closeNotice/bindNotice`，抓手 + 28px 圆角 + 模糊对焦入场 + 底部「了解」+ 版本号），取代原来居中大叉弹窗；⑤充值到账改用它，列出充值账户/额度/时间/订单编号/支付状态，`src/pay.js` 通知带上手机号并把 TTL 1h→24h，前端 `payseen` 时间戳落盘（关掉应用期间到账，回来自动补弹、不重复）；⑥新版本检测：构建时写入 `BUILD_STAMP/BUILD_VER`，新增公开接口 `GET /api/version`，前端 5 分钟 + 切回前台各查一次，变化即用同一抽屉提示，点「了解」带 `?r=` 重新进入加载；⑦额度快用完/兑换成功也迁到新抽屉。部署 `aff490f7`/`b1212987`；随后按反馈修正同一版本：`handlePayWatch` 补旧通知缺失的 `phone`（充值账户不再显示横杠）、弹窗排版改 iOS 弹窗比例（标题居中 1.3333×/600，说明 13px 灰）、收起改 `transitionend` 驱动让抽屉边淡边完全降到底（`.ns-wrap` 过渡移到底类、`.sheet-wrap` 淡出 260→420ms），部署 `2c520e16`。 |
| 5.3.3 | 2026-10-29 | 明轩六条：①新增老师页「问题缩进对不齐 / 背景要纯色 / 样式要刷题引导那套」→ `customHtml()` 整体换成 `dw-*` 版式（`c-dw` 容器 + `dw-top` 步骤条 + `ob-progress` + `dw-step` + `dw-bar` 左右箭头），题面眉标/标题/说明/选项共用 2px 内边距对齐；`#pageBody.course-page:not(.course-custom)::before` 把渐变光圈只留给选课页，新增老师页纯色；`customBack()` 第一步退回即退出。②模糊过渡保留，并给刷题引导换步补实（`.dw-step` transition 200ms、`.leaving` blur 14px，`wizRender` 换场 200→195ms 对齐）。③导航栏磨砂被盖没 → 撤回 5.3.2 两条性能改动：`body.drawer-open .appbar/.composer { backdrop-filter:none }` 与 `#app { will-change/backface-visibility }`（后者让 #app 变成独立 backdrop root，压在它上面的 `#page` 再也糊不进顶栏）。④浅色主题骨架是黑的 → `body:not([data-theme="light"])` 恒真（data-theme 挂在 `<html>` 上），改 `html:not([data-theme="light"]) .pay-sk`。⑤充值页 + 管理员支付页文案全部改正式（「密钥校验未通过，请核对当日密钥后重试」「该充值码已完成支付」「有效期剩余 12 分 03 秒」「请将充值码截图发送给管理员，由其完成入账」），i18n 的 ZH2EN 与 ZH_PATTERNS 同步更新。⑥新增老师页题面文案补英文（含 `1 / 5 · 名字` 这类分步标题的句式）。部署 `936651c2`/`fe1b4d2c`。 |
| 5.3.2 | 2026-10-29 | 明轩四条：①自定义老师「做的不好看，改回去」→ 删掉 5.3.0 那整段 `.c-ob .ob-*` 缩小排版，恢复引导页材质。②老师底部动作条智能推荐：`actChipsHtml()` 按 `loadLog()[chapterKey()]` 的轮次/对错/是否考过给分——答错推 `simple`、连对两次推 `harder`、讲 6 轮后推 `summary`、3 轮没考推 `quiz`，最多 5 颗、推荐那颗 `.rec` 排第一、横向滑动；服务端 `src/course.js` 的 `ACTIONS` 新增 simple/summary/harder/exam 四类提示词；讲完一轮在 `finally` 里只刷新按钮不整页重绘。③英文模式充值页/兑换弹窗/到账弹窗补中文：新增 20 条 `ZH2EN` + 20 条 `ZH_PATTERNS`（可用额度 x/y、其中兑换额度 n、兑换额度·剩 n、剩 n 天 m 小时·date 到期、重新生成（ns）、已兑换 n 点额度、当前 n 分最多可换 m 点、n 学分→m 点额度、连击/波次/步数等 HUD 组合）。④英文排版：`html[lang=en]` 下 `--ls-body:0`、标题 `text-wrap:balance`、正文 `text-wrap:pretty`、`.row .v` 不再 `break-all`。⑤流畅度（只优化不改观感）：抽屉打开前给 `#app` 上 `will-change/backface-visibility` 提合成层，缩放不再整页重绘；`drawer-open/closing` 期间关掉顶栏与输入区被 scrim 遮住的 `backdrop-filter`；`openDrawer()` 去掉重复的 `void offsetHeight` 和二次 `placeDrawerInd()`；`watchI18nDom()` 从「每次整页 TreeWalker」改成只翻 MutationRecord 里的脏子树（流式打字时每秒十几次全量遍历是掉帧主因）。部署 `6965d68d`。 |
| 5.3.1 | 2026-10-29 | 明轩第二轮实测反馈：①错题本仍坏——`plainLatex()` 没剥 `[[math:…]]` 外壳，且 `\KCl`/`\HCl` 这类「反斜杠＋元素符号」被 `\\[A-Za-z]+` 整段删掉，反应式只剩 `_3+6= +3_2`；改成先剥壳、`\X` 保留字母、`\` 单独清掉。正文侧 `mathInner()` 加 `stripStraySlash()`，抹掉箭头前多写的反斜杠（`\↑`）。②场景应答顶部删掉「换场景」按钮及其绑定。③点词弹窗两次重排：量宽期间加 `.measuring`（`visibility:hidden`），量好一次成型；`sideFor` WeakMap 记住同一个词首次的上下朝向，不再因骨架→正文高度变化翻面；`.dp-body` 隐藏滚动条、`.dict-pop` `overflow:hidden`。④课程选择页光圈：原来吃 `--accent`，浅色主题 accent 是近黑色 → 「白里透黑」脏雾；改用固定色相（蓝/橙/紫）低透明度，浅色主题再降到 .45。⑤游戏积分 / 学习学分兑换弹窗共用样式重做：背板 `blur(20px) saturate(118%)`，卡片 `ptsSheetIn` 从 `blur(14px)+scale(.93)+translateY(20px)` 对焦弹出，退场 `ptsSheetOut` 散开；`credits.js` 补 `.closing`。⑥滚轮跟手：两个 wheel 的 `scroll` 从 70ms 防抖改成 rAF 逐帧，选中数字变化补 5ms 轻震，`scroll-behavior: auto` 不再抢手势。部署 `95dd3847`。 |
| 5.3.0 | 2026-10-29 | 明轩八项反馈一轮做完：①英文模式补齐 `i18n.js` 的 `ZH2EN` 从 165 条加到 ~380 条（练题/课程/小游戏/助理/充值/错题本），并加 `ZH_PATTERNS` 处理「得分 30」「已答 5 题」这类带数字的句子，`translateNode` 改成按原文比对，动态刷新的文本也会重译。②点词释义模糊浮现：`renderPop()` 每次换内容 `replayReveal()` 加 `.dp-swap`，CSS `dpLineIn` 词头先行、释义逐行 45/95/145/195ms 跟上。③查词提速：`fetchEntry()` 带 `INFLIGHT` 去重，`pointerdown`/`touchstart` 预取，服务端 LLM 润色 5.5s→2.2s、只有一条候选直接跳过、`max_tokens` 260→180，`Cache-Control` 按有无上下文分 `public`/`private` 七天。④错题本渲染：`blocks.js` 补 `$\ce{…}$` 整段当化学式、`looksLikeMath` 认 `%`，`study.js` 新增 `plainLatex()` 把标题/备注里的 LaTeX 还原成纯文本。⑤悬浮调试窗拖动重写：`pointermove/up` 挂到 `document`（捕获阶段）＋`touchmove` 兜底＋`touch-action:none`，滑出标题行不丢事件，位置存 `minxtok.debug.pos`。⑥震动：`games.js` 首次接入 `haptic`，结算按胜/负/平三种手感，全局 `pointerdown` 在游戏页给 6ms 轻触；练题、课程原有反馈保留。⑦课程选择页取引导页的动效：`#pageBody.course-page::before` 三层径向渐变光圈 `cAurora` 24s 漂移，`cPickIn` 加 `blur(6px)` 与 460ms/阶梯延迟。⑧自定义老师页对齐选课页排版：`.c-ob` 内 `ob-h2`/`ob-sub`/`ob-choice`/`ob-input` 改用 `var(--font)` 与 `--fs-md` 体系（原来套的是引导页超大标题）。部署 `7ebafb48`、`d529233d`。 |
| 5.2.1 | 2026-10-29 | 明轩实测反馈：①台球五星 AI 三杆不进 → 物理改成**先判进袋再撞库**（袋口半径 `POCKET_R + BR*0.96`，以前 9.5px 球心还没压到袋口就被库边弹走）；AI 重写：力度按 `v0 = λ·dCue + vTarget`（λ=0.906）分档，不再杆杆 770 满力；新增 `simShot()` 试打（克隆球台跑 6 秒）只挑「验得进且白球不摔袋」的候选，没有必进球再打安全球。本地模拟 30 局：AI 每杆进球率 0.34 → 0.72，单次决策中位 4ms / p90 36ms。②「导航栏占位」= 刷题 / 课程 / 和老师对话三页：`#pageBody.drill-page` 与 `.course-page` 用 padding 简写把 page-body 的 50px 让位覆盖掉了，第一张卡被压在浮层顶栏下面 → 都改成 `calc(50px + …)`；对话练习页把 `.study-top` 那行说明挪到顶栏右侧浮动（desc 隐藏、按钮缩小），消息区整页铺满。③**补丁（同日晚）**：上一版把 `.drill-page` 的让位补丁打在 theme.css 里（那条规则其实在 drill.css），静默失效；本次补上 `#pageBody.drill-page` padding-top `calc(50px + var(--s-4))`，并把上课页 `#pageBody.course-full` 从 `padding: 0` 改成 `padding: 50px 0 0`（班级头不再钻到导航栏底下）。版本链 app 361 / theme 264 / games 82 / drill 22 / course 14。部署 `b7d3ef60`、`b2e410f4`。 |
| 5.2.0 | 2026-10-29 | 内容批次：①乒乓球加黑色炸弹（球撞上即爆，最后触球方的对手加分）；②台球 AI 角度误差 0.09→0.022 起、力度加大，保龄球 AI 落点误差 26→12 起、旋转量减半；③贪吃蛇加 AI 对手（洪水填充选路 + 星级决定迷糊概率），撞自己/撞对手判负、头碰头平局、结算按长度给分（输了也有分）；④俄罗斯方块落底键改回同款材质（原来整块 `var(--accent)` 在深色盘下就是白条）；⑤课程小节加本地兜底拆法（按「与/和/、」拆章名），服务端补栏目型章节 prompt；⑥刷题正文拉丁字母/数字包 `.mrun`，仅数学/物理/化学走 `--math-font`；⑦GAMES 补 `nameEn/descEn`，英文版游戏名与简介可用。版本链：app 358 / theme 263 / games 81 / drill 46 / course 24 / study 96。部署 `26eb2451`。 |
| 5.1.25 | 2026-10-28 | **根治「键盘弹起整页上跳再掉回」**：诊断探针实测 `scrollY=0`、`vvTop=0`、`#app` 尺寸前后不变 → 说明页面在 CSS 坐标里没动过，是 WebView 自己推画面（X5 不报 `offsetTop`）。于是把 `#app` 改为 `position:fixed; top/right/bottom/left:0`，高度交给 inset、不再叠 `100dvh/var(--app-height)`，文档没有可滚余量 → 无从上拨。`theme.css?v=262`、`app.js?v=356`（探针已删，内容与 5.1.21 字节一致）。部署 `8d221e80`、`49d46f78`。明轩确认「整体逻辑完全没有问题」。 |
| 5.1.24（回滚） | 2026-10-28 | 明轩实测 5.1.22 / 5.1.23「以前的问题都回来了」→ **整文件回滚到 5.1.21**：从部署 `81cb8bba` 抓回 `app.js?v=351`、`theme.css?v=259` 原文件覆盖回去，只把引用版本改成 354 / 261 破缓存；部署 `ab0fbfe6`，`cmp` 校验线上与 5.1.21 原件**字节一致**。5.1.22（稳定后锚定一次）与 5.1.23（快照逐帧跟随）均判无效，别再试。 |
| 5.1.23 | 2026-10-28 | 按豆包第二份方案做「快照逐帧跟随」：过渡边缘取一次 `scrollHeight`，每帧 `chat.scrollTop = snapScrollHeight - chat.clientHeight`，连续 3 帧 vh 不变或 450ms 退出；`kbSnap` 窗口内 `followStep`/`scrollBottom` 直接 return。另加 `.appbar` 尺寸锁（min/max-height 50 + `flex: 0 0 50px`，`theme.css?v=260`）。部署 `9526c5c1`、`f1af1ce3`。**实测无效，已回滚。** |
| 5.1.22 | 2026-10-28 | 按外部评审（豆包）方案第 1、5 点落地：键盘升起期不再反复写 `scrollTop`（删掉 `[40,90,160,260,380]` 与 `[40,90,160,260]` 两组定时补滚），改为 `kbSettleAnchor()` —— 用 `visualViewport.height` 连续 3 帧不变（上限 450ms）判定动画结束，然后**只 `jumpBottom()` 一次**；`kbAnimating` 为真期间 `scrollBottom()` 直接返回，流式缓动跟随不抢滚动。未采纳：豆包的「顶栏静态渐变层让 backdrop-filter 只采样静态层」（技术上不成立，半透明层不会阻断采样下方的滚动内容）、`column-reverse` 改造（副作用大，押后）。`app.js?v=352`（theme 仍 259）。 |
| 5.1.21 | 2026-10-28 | 明轩：「今天最初提到键盘之前那版，导航栏不会动，也没这么卡」。做法：从 5.1.5 部署域 `4c2c89f7` 抓回 `app.js?v=332` / `theme.css?v=248`，把键盘块和 input focus 处理器**逐字复原**（`baseH` + `kb = baseH - min(innerHeight, vv.height) - offset` + `kb > 80` 单阈值 + 弹起时 `[40,90,160,260]` 连续补滚；focus 时 `[40,90,160,260,380]`），并用脚本 diff 验明 `KB IDENTICAL` / `FOCUS IDENTICAL`。另外删掉 5.1.7 高度接管方案的残留：`#app` 的 `top: var(--kb-top)`、`@property --app-height/--kb-top`、`:root` 的 260ms 变量过渡（这三样会让页面高度分步动画 = 导航栏看着上下动）。`app.js?v=351`、`theme.css?v=259`。 |
| 5.1.19 | 2026-10-28 | 明轩「感觉好笨好傻，改回到之前的键盘，不整了」→ 删掉 5.1.17 加的 `pinKbBottom` 逐帧钉底，键盘处理完全退回 5.1.12 那套（`resizes-content` + 视口变化同帧 `jumpBottom()` + `kb-anim` 停稳 240ms）。`app.js?v=348`。**键盘这条线到此封存，不再优化。** |
| 5.1.18 | 2026-10-28 | 微信里去掉顶栏模糊后**明轩实测该卡还是卡**（说明瓶颈不在磨砂，X5 合成只是其中一部分）→ 磨砂原样加回，`theme.css?v=256`；保留键盘 `pinKbBottom` 逐帧钉底。CHANGELOG 如实改写，不再写「微信里不卡」。 |
| 5.1.17 | 2026-10-28 | ①微信里掉帧的根因是内置 WebView（X5）合成 `backdrop-filter` 极慢，滚动时整层每帧重采样；`app.js` 按 UA 打 `body.wx`，CSS 侧微信里把 `.appbar`/`.scrim` 的模糊换成高不透明度同色底（其他浏览器不动）。②键盘弹起时"聊天区上移、不在底部"：`resizes-content` 下浏览器分几步收缩，只贴一次底会被后面几步又顶起来 → 新增 `pinKbBottom(420)`，动画期间逐帧钉底（同帧先贴一次，再 rAF 追），只在本就在底部时生效。`app.js?v=346`、`theme.css?v=255`。 |
| 5.1.14–5.1.16 | 2026-10-28 | **启动白屏事故**：5.1.13 的键盘块是用 Python 文本替换插进去的，`end` 锚点 `document.body.classList.remove('kb-anim');` 在 `kbMotion` 里也有一份，`index()` 命中前面那份 → 只替换了半截，旧代码残留在后面，`}, 240);` 裸露在顶层 → **整个 ES module 解析失败**（`Uncaught SyntaxError: Unexpected token ','`），`window.__minxBooted` 永远到不了，页面死死停在加载页。5.1.14/5.1.15 只清了一处重复，第二次 patch 又用同一个错误锚点，把旧的整块代码留着 → 5.1.15 那版解析通过但 5.1.16 又炸。最终以 5.1.12 的 `app.js`（v339，线上验证过可运行）为基线整文件重铺，只回填 CHANGELOG 条目 + `index.html` 加启动兜底（6 秒兜底提示 / 15 秒看门狗）。**线上 `app.js?v=345` 已用 `node --check` 验过 ESM 解析。** |
| 5.1.13 | 2026-10-28 | 按"别家怎么做的"重做键盘：**改用 VirtualKeyboard API** —— `navigator.virtualKeyboard.overlaysContent = true` 关掉浏览器自动缩视口，再监听 `geometrychange` 用 `boundingRect.height` 自己算键盘高度，写进注册过的 `--app-height`（260ms 过渡）。好处：布局只按键盘高度变一次，整个视口不再重排，`dvh` 也不再抖，掉帧大幅减少；`--kb-top` 继续兜 `visualViewport.offsetTop`（`top` 不用 `transform`，保磨砂采样）。高度过渡期间用 `followFor(320)` 每帧贴底（`chat.scrollTop = chat.scrollHeight`），一段连续动作，不会"先上一截再滚回来"。**没有 `navigator.virtualKeyboard` 的老内核自动退回** `resizes-content` + `visualViewport` 那套。参考：MDN VirtualKeyboard_API（overlaysContent / geometrychange / boundingRect） |
| 5.1.12 | 2026-10-28 | "键盘升起先升到键盘高度再往下滚"查清是**我们自己补滚造成的两段动作**：浏览器把聊天区缩掉时 `scrollTop` 不变 → 内容先被顶上去一截，我们下一帧再补滚 → 看到第二次位移。→ 视口一变就地 `jumpBottom()`（和浏览器重排同一帧完成），不再用缓动补；`kbMotion` 只负责 `kb-anim` 模糊降档；视口事件全部合并到 rAF，一帧内只量一次 `clientHeight`、只贴一次底（`visualViewport.scroll` 也接上了） |
| 5.1.11 | 2026-10-28 | 键盘逻辑通了但"帧率只有几十、先滚一段再突然掉下来、收起后不回底"：①键盘升起/收起都改回缓动跟随（`scrollBottom()`），去掉 jump+140ms 双段；②新增 `body.kb-anim`（`kbMotion()`：每次视口变化置位，停稳 240ms 后清除并 `jumpBottom()` 精确对底），期间 `.appbar` 模糊 24px→8px、底色加深，动画结束自动恢复；③聊天滚动监听合并到 rAF，`stickBottom` 每帧只判一次，不再每个 scroll 事件强制读 `scrollHeight` |
| 5.1.10 | 2026-10-28 | 键盘弹起"怪异地往上窜 + 很卡"：①删掉 5.1.6 加的 `.chat > .msg { content-visibility: auto; contain-intrinsic-size: auto 120px }` —— 聊天区高度一变，被跳过的消息重新参与布局，占位高度与真实高度不一致，表现为非线性的乱窜且非常卡；②`.chat` 加 `overflow-anchor: none`，浏览器滚动锚定会在内容高度变化时偷偷补偿 `scrollTop`，和流式跟随打架；③键盘弹起时改成 `jumpBottom()` 直接落底 + 140ms 防抖再对齐一次，不用缓动跟随（视口是分步缩的，缓动会一路追一路重启） |
| 5.1.9 | 2026-10-28 | 键盘升起时"窜一下 + 偶发闪"：①删掉 `body.kb-open .composer { padding-bottom: 22px }` —— 键盘动画期间视口高度分几步变，内边距跟着变一次聊天区就窜一下；②键盘开合判定改双阈值（开 120 / 关 60），原来 80 单阈值在越线时反复切 `kb-open`，看起来就是闪；③删掉键盘/聚焦里补的 `setTimeout(scrollBottom, 320)`，缓动跟随自己会追到稳定，定时补刀只会多一次位移 |
| 5.1.8 | 2026-10-28 | **键盘回退**：5.1.7 的 `resizes-visual` + 自驱 `--app-height` 实测两个问题——①键盘升起后页面不缩，输入区被键盘直接盖住（遮罩上方不是聊天页底部）；②`visualViewport.height` 抖动时每次 `resize` 都重启 260ms 过渡，出现闪动。→ meta 回 `resizes-content`（浏览器改布局视口，页面是被顶上去而不是被盖住），`--app-height` 交回 `100dvh`，`--kb-top` 归零（CSS 保留但不再写入）；**保留** 5.1.7 的两点收益：键盘开合只贴一次底、不再连发四个强制滚动，`body.kb-open` 去掉安全区空白 |
| 5.1.7 | 2026-10-28 | ①流式贴底改「缓动跟随」：`scrollBottom` 不再每段硬跳 `scrollTop=scrollHeight`，改成每帧吃掉剩余距离 22%（`followStep`），内容是连续滑上去的；②键盘大改：viewport meta `resizes-content` → `resizes-visual`，应用自己用 `visualViewport.height` 驱动注册过的 `--app-height`（`@property --app-height: <length>` + `:root` 260ms 过渡），键盘开合变成高度平滑生长/收回；`--kb-top`（`vv.offsetTop`，用 `top` 不用 transform 以保磨砂）兜住键盘顶起内容的情况；焦点/键盘事件里那串 `[40,90,160,260,380]` 定时强制滚动删掉，改成过渡结束后补一次；`body.kb-open` 去掉输入区安全区空白 |
| 5.1.6 | 2026-10-28 | 流式性能一批（不改观感）：①`paintStream` 32→64ms，且以最后空行切「定稿区 `.tz-settled` / 尾巴 `.tz-live`」，定稿区 markdown 只算一次并缓存，每帧只重画尾巴（原来每 32ms 全量重排 = O(n²)）；②`scrollBottom` 收进 rAF，每帧最多一次（原来每个 SSE 分片读写 scrollHeight/scrollTop 各一次强制布局）；③去掉落字 `filter: blur` 动画；④`.chat > .msg` 加 `content-visibility:auto` + `contain-intrinsic-size:auto 120px`；⑤顺手修 `liveSafe` 围栏裁剪把「已闭合代码块后面的正文」一起吞掉的 bug |
| 5.1.5 | 2026-10-28 | 缩进退回 `scale(.985)`（0.94 太靠后、且整层重绘卡）→ 去掉 26px 圆角 + 大投影 + `overflow:hidden` 裁剪（大投影是卡顿主因），遮罩 blur 6→3px；只留最便宜的一条 transform |
| 5.1.4 | 2026-10-28 | 缩进改「整块后退」：`#app` / `#page` 一起 `scale(.94)`（顶栏也缩）+ 26px 圆角 + 投影（露出来的边缘变成卡片纵深，不再像裂缝）+ 遮罩 blur 6px 兜住顶栏失去的磨砂；`closePage` 的 `appRise` 在抽屉收回时跳过（两条 transform 会打架）；**情绪中心恢复 `{closeOnly:true}`**（5.1.3 误改，明轩要的是日记）；`openPage` 不再靠 `wasOpen` 猜返回动作 → 没显式 `back` 一律当菜单键（日记骨架页点顶栏键直接回聊天的根因） |
| 5.1.3 | 2026-10-28 | 缩进退得太干净被否 → 换「更软的量级」：`.chat` + `.composer` 一起 `scale(.95)`、480ms `cubic-bezier(.32,.72,0,1)`、收回 320ms（0.99 那种小量级看着像抖一下，反而更生硬）；**情绪中心**去掉 `{closeOnly:true}` → 骨架页顶栏按钮回到菜单语义（点它开抽屉，不再直接退回主对话） |
| 5.1.2 | 2026-10-28 | 抽屉不再缩进内容（5.1.1 的 `scale(.99)` 观感生硬）→ 只留遮罩 `blur(3px)`+压暗；抽屉滑入 460ms 软尾、收回 280ms 跟手；修「点菜单没反应」——`openDrawer`/`openModal` 记 `S.overlayAt`，遮罩 click 在 340ms 内直接忽略，避免开门那一瞬间 rAF 让遮罩变可点、紧随的 click 把它自己关掉 |
| 5.1.1 | 2026-10-28 | 抽屉打开不再对 `#app`/`#page` 整层 `transform: scale()`（祖先 transform 会让 `.appbar` 的 `backdrop-filter` 失采样→磨砂消失，缩小后四周还露一条 `--bg` 与 `#app::before` 渐变不一致的边）→ 改缩 `.chat` / `.page-body` 内容层；条形码 `displayValue:false`，只留页面里那串可复制短码并改苹方；设置页 9 组压成 4 组（外观/聊天与交互/账号/支持），字号三行收紧为「当前档位 + 分段 + 预览」 |
| 5.1.0 | 2026-10-28 | 导航修复：`ui.js` 曾被 `?v=133`/`134` 加载成两个模块实例，`pageBack`/`activeNav` 各存一份 → 状态改挂 `window.__uiState` 共用，并把所有模块的内联 import 版本对齐（ui 137，study 95、games 80、course 23、drill 45、blocks 147、credits 4、assistant 15、archive 10）；抽屉去掉触屏残留 hover 底色；档案滑块删中间日期标签 + accent-color 轨道；二维码/条形码 `payCodeIn` 模糊入场、深色反相黑底白码、切主题重画、短码改 tabular 粗体；额度横幅 blur 出入场；用户气泡 `bubbleIn` 浮入；流式渲染 html 去重 + 3 字轻模糊上浮 + 光标呼吸 |
| 5.0.4 | 2026-10-28 | 修密码 7 格/密钥首字母重复（隐藏 input 被 paint 改了 className，丢了 `.ghost` 变成第 7 格 → 改用 cells 数组）；格子选中态去白底；骨架去白框描边（`.pay-stage.is-loading`）；遮罩换成 `.veil-glass` 磨砂层 transform 下滑 |
| 5.0.3 | 2026-10-28 | 充值码加载骨架（`.pay-sk` 流光）；支付页遮罩改 clip-path 自上而下铺开；密钥/密码格去阴影 + 绿色描边点击态 + 实体圆点 + pointerdown 强制聚焦；充值页 ⓘ 说明重写（去掉申请额度） |
| 5.0.2 | 2026-10-28 | 支付页重做（静态卡片 + 底部抽屉、只用绿、苹方）；密钥关卡回归 `/api/pay/gate`；充值码一次性化（付完 `payused` + 删 token，刷新即 used）；输入框去光标、不自动聚焦；额度单位统一「额度」 |
| 5.0.1 | 2026-10-28 | 充值页改版：先填数量 → 点支付整页模糊 → 底部抽屉确认金额 → 输密码即完成；去掉每日密钥输入（后端改可选，PAY_REQUIRE_KEY=1 才强制）；重新生成加 60 秒冷却；额度页删重复说明 |
| 5.0.0 | 2026-10-28 | 充值制度改版：每人专属充值码（二维码+条形码，30 分钟）、独立微信风支付页、每日轮换密钥 + 支付密码校验、充值进兑换池、到账实时弹窗；额度页下线「申请额度」 |
| 4.1.13 | 2026-10-28 | 额度模型改版：学分/积分兑换进永久 `stock` 池，扣费顺序 兑换池→限时池→每日额度，废弃 `bonus` 永久加成并全量清零；徽标与充值页统一显示总可用 |
| 4.1.12 | 2026-10-28 | 化学多条件上下分栏、等号再加长抬高；情绪中心小情绪固定 4×2 八格、无数据用静态骨架；二级页顶栏统一磨砂玻璃、返回键 Q 弹；迷宫三样道具真正生效 |
| 4.1.11 | 2026-10-28 | 化学方程式等号改课本双横线、加热条件排成 △、正文里用 = 写的反应式也按化学排版 |
| 4.1.10 | 2026-10-27 | 修复化学图 LaboBib 导入死循环 |
| 4.1.9 | 2026-10-27 | 化学装置图改用 LaboBib 仪器线稿拼装 |
| 4.1.8 | 2026-10-27 | 化学方程式等号加长、反应条件压低 |
| 4.1.7 | 2026-10-27 | 快问快答历史换行、俄罗斯方块操作键重做、单位符号字体、化学导气管缩短 |
| 4.1.6 | 2026-10-27 | 勇往直前斜坡金币位随机最多两个换成炸弹，帮助文案同步 |
| 4.1.5 | 2026-10-27 | 勇往直前达标线上调：一至五星 400/800/1200/1600/2000 米 |
| 4.1.4 | 2026-10-27 | 勇往直前达标只提示不暂停；修复高台提前消失导致角色瞬移；游戏退出回列表恢复菜单键 |
| 4.1.3 | 2026-10-27 | 勇往直前达标后新增“继续跑/结算”面板；高台降低、斜坡与平台加长、炸药方块后移 |
| 4.1.2 | 2026-10-27 | 勇往直前未达标死亡按距离结算积分、达标不再弹空结算弹窗、高台改为右侧斜坡；全部击毙默认第一波开始，上次进度单独提供继续入口 |
| 4.1.1 | 2026-10-27 | 商店购买后改为底部横幅提示、下调定价并取消重播弹窗动画；爆破能手关卡卡片去空白、20 颗难度星两行各 10 颗；勇往直前新增横杆高台与爆炸方块 |
| 4.1.0 | 2026-10-27 | 游戏结算改为按表现计分；勇往直前增加难度达标线与三星后继续跑；全部击毙重做手雷、商店滚动、新技能和 Boss/精英技能；爆破能手扩至 20 关并更新倒地物理；修复暂停模糊遮罩 |
| 4.0.10 | 2026-10-27 | 2048 按星级调整目标：一星 512、二星 1024 判胜，三至五星 2048/4096/8192；结算星级按最大数字块计算 |
| 4.0.9 | 2026-10-27 | 欢迎页去掉多余展示表情并收紧逗号间距；课程按老师隔离课堂记录、修复衬线公式基线漂移与流式美元符号；场景应答移除输入框上方小字 |
| 4.0.8 | 2026-10-27 | 说明文档统一为书面表述并修正事实错误；化学方程式重排；全部正文、按钮与图示标注跟随字号档位；引导页补刷题/课程与 20 个兴趣标签；心情扩至 24 类；学分兑换改为 200 学分换 1 额度、每日上限 20 |
| 4.0.7 | 2026-10-27 | 首页说明抽屉补全情绪中心、搜索、充值、日记、档案五个页面的用法，说明文字改为分段、列表和提示块排版 |
| 4.0.6 | 2026-10-27 | 课程对话改用统一 Markdown 渲染：独占一行的 **小标题** 正常显示，分式不再被 KaTeX 压小，中文说明不再误变衬线，长公式和长文本不再顶出气泡 |
| 4.0.5 | 2026-10-27 | 正文里裸写的化学式和算式会自动识别成数理片段：H₂O、CO₂、NaOH、Ca(OH)₂、SO₄²⁻、2H₂O₂ → 2H₂O + O₂、2+2=4、pH=7、E=mc² 都能用衬线 |
| 4.0.4 | 2026-10-27 | 数理字体只作用于公式、化学式、图形里的字母数字和方程式；中文说明、普通英文句子恢复正文字体，不再整段变衬线 |
| 4.0.3 | 2026-10-27 | 数理字体改成单个开关：开启后公式、化学式和它们下面的说明文字统一用衬线，关闭统一用无衬线，不再出现一半衬线一半黑体 |
| 4.0.2 | 2026-10-27 | 函数绘图补齐分段函数、极坐标/螺线、参数方程，定义域端点会自动画空心/实心圈和竖向虚线 |
| 4.0.1 | 2026-10-27 | 高锰酸钾制氧气这类化学实验题，解题页也会自动配装置图了，和课程、刷题、主聊天保持一致 |
| 4.0.0 | 2026-10-26 | 刷题改用引导页：学段、年级、科目、题型、难度、题量、教材范围、节奏一屏一步，教材和章节可以多选，放不下才分两列 |
| 3.1.2 | 2026-10-23 | 游戏区字体跟全站统一：iOS 走系统苹方，Android 和鸿蒙用站内改名字体，canvas 里的字也不再写死 system-ui |
| 3.1.1 | 2026-10-23 | 爆破能手整体降难度：每关预算提高、炸药威力与范围加大、炸药和导火线降价，新增「大型聚能」和花钱降尘，第一关目标从 62% 降到 45% |
| 3.1.0 | 2026-10-23 | 台球加了计分板：谁打全色谁打花色、各自还剩几颗球一眼看清；8 号提前落袋、清台后打进 8 号都会写清谁赢谁输、为什么 |
| 3.0.0 | 2026-10-23 | 新增游戏「勇往直前」：横版跑酷，跳过地刺与方块，下滑躲子弹，距离越快分越高，五档难度对应不同生命与出怪节奏 |
| 2.0.0 | 2026-10-22 | 场景应答扩充到 24 个生活与进阶场景，并支持自定义场景：5–50 字描述情境，保存后随时再练 |
| 0.9.74 | 2026-10-21 | 历史抽屉打开时不再让卡片和骨架屏一起动，先渲染再滑动，低端机更稳 |
| 0.9.73 | 2026-10-21 | 学习历史改成近满屏抽屉，顶部小条可以下滑关闭，点空白处也会降下 |
| 0.9.65 | 2026-10-21 | 兴趣页改为大分类气泡，点一个分类会破裂成对应子分类 |
| 0.9.64 | 2026-10-21 | 拖动气泡时跟手移动，不再等松手才动 |
| 0.9.63 | 2026-10-21 | 首屏 emoji 先预加载再切换，不再闪回旧图或停在原图 |
| 0.9.62 | 2026-10-21 | 兴趣气泡改成点一下就破，气泡铺满整屏，不再只是小框里挪动 |
| 0.9.61 | 2026-10-21 | 新用户注册后进入七步引导：介绍、助理名、称呼、性别、生日、兴趣、欢迎 |
| 0.9.60 | 2026-10-21 | 预览里的表情会跟着名字走，不叫虾虾就不再出现🦞 |
| 0.9.59 | 2026-10-21 | 句子长度滑块真正控制整句话的长短，低档短、高档长 |
| 0.9.58 | 2026-10-21 | 七个滑块各拆成六档，每档换一种说法，至少能看到五次变化 |
| 0.9.57 | 2026-10-21 | 性格预览改成一句真正会说的日常话，标签不再露在外面 |
| 0.9.56 | 2026-10-21 | 性格预览改成正常说话的句子，并加一个两字标签 |
| 0.9.55 | 2026-10-21 | 助理页去掉左侧表情块，名字改成跟着输入框实时变 |
| 0.9.54 | 2026-10-21 | 抽屉里新增「助理」页：名字、你的名字、简介、形象、记忆都能自己改 |
| 0.9.53 | 2026-10-21 | 空日记里先点格式按钮会真正亮起，再点一次就灭，不用先去点空白处 |
| 0.9.52 | 2026-10-21 | 字色/高亮面板改成贴底固定面板，不再被手机系统的复制粘贴浮层挡住 |
| 0.9.4 | 2026-10-20 | 根号不再露出标签文字：数学排版改为先挖出来占位、正文单独渲染、最后塞回 |
| 0.9.3 | 2026-10-19 | 平面几何、立体几何真的能画了，主聊天里也会把图渲染出来 |
| 0.9.2 | 2026-10-19 | 修好了解题点「开始」没反应 |
| 0.9.1 | 2026-10-19 | 解题和翻译后面可以接着问了，答案是接着聊不是重新来过 |
| 0.9.0 | 2026-10-19 | 能画三角形和立体几何了（正方体、棱锥、圆柱、圆锥，藏住的棱用虚线） |
| 0.8.9 | 2026-10-19 | 几何图的 A B C D 改成数学衬线斜体加粗 |
| 0.8.8 | 2026-10-19 | 学习画图重做：函数曲线、几何图全部按真坐标画，不再吐代码 |
| 0.8.7 | 2026-10-19 | 修好学习页点击报错 |
| 0.8.6 | 2026-10-19 | 修好二级页返回键点不动的问题 |
| 0.8.5 | 2026-10-19 | 额度改成发送即扣，点停止也算用掉一次 |
| 0.8.4 | 2026-10-19 | 每条消息自动打情绪标签，情绪中心按真实分布统计 |
| 0.8.3 | 2026-10-19 | 修好情绪中心退不出去的问题 |
| 0.8.2 | 2026-10-19 | 学习首页去掉图标，只留文字大块 |
| 0.8.1 | 2026-10-19 | 学习改成大块入口，点进去是二级页 |
| 0.8.0 | 2026-10-19 | 学习中心上线：翻译、解题、练习、错题本、生词本、场景应答、作文指导 |
| 0.7.2 | 2026-10-19 | 礼物卡点击真正打开礼物屏（之前被旧额度逻辑拦掉了） |
| 0.7.1 | 2026-10-19 | 礼物卡背景改成预烘焙遮罩，安卓上不再掉帧 |
| 0.7.0 | 2026-10-19 | 额度礼物卡上线：聊天里出一张卡，点开是模糊背景的礼物屏，领取有彩蛋 |
| 0.6.1 | 2026-10-19 | 文章卡是纯本地卡，不会再失败：生成不出来就是可编辑的草稿骨架 |
| 0.6.0 | 2026-10-19 | 新增文章卡：写完直接在聊天里出一张卡，点开就能读全文 |
| 0.5.11 | 2026-10-19 | 追问动画放慢，节奏更从容 |
| 0.5.10 | 2026-10-19 | 追问入场幅度收敛到比原来稍大一点，力度更自然 |
| 0.5.9 | 2026-10-19 | 追问入场动画更足：位移更大、缩放更明显、带回弹 |
| 0.5.8 | 2026-10-19 | 追问入场改为 CSS 强制回流驱动，不再依赖 WAAPI，任何环境都能播放 |
| 0.5.7 | 2026-10-19 | 追问入场动画改为挂载后触发，流式与历史两种路径都能看到 |
| 0.5.6 | 2026-10-19 | 追问入场改用 Web Animations API 驱动，任何系统设置下都能看到 |
| 0.5.5 | 2026-10-19 | 修复追问入场动画完全不播放的问题 |
| 0.5.4 | 2026-10-19 | 追问入场改为 Apple 风格：轻微上浮、极短缩放，弹簧收口，去掉模糊与斜切 |
| 0.5.3 | 2026-10-19 | 追问入场改成一次性弹到位，劲更足，去掉多余回弹 |
| 0.5.2 | 2026-10-19 | 追问跟着回复同时出现，不再二次等待 |
| 0.5.1 | 2026-10-19 | 修复追问动画被通用动效覆盖、看起来没变化 |
| 0.5.0 | 2026-10-19 | 追问系统重做：口吻改为用户本人，会学用户的说话方式 |
| 0.4.4 | 2026-10-19 | 修复字号调节点了没反应 |
| 0.4.3 | 2026-10-19 | 扇区百分比文字统一朝向圆心，小扇区也标得下 |
| 0.4.2 | 2026-10-19 | 扇形图恢复百分比标注在扇区内，点击放大照旧 |
| 0.4.1 | 2026-10-19 | 百分比改为点击后折线引出显示 |
| 0.4.0 | 2026-10-19 | 情绪中心新增环形扇形图，入场带运动模糊 |
| 0.3.23 | 2026-10-19 | 三个点回到它该在的位置：只在虾虾还没开口时转，文字一出就收起 |
| 0.3.22 | 2026-10-19 | 虾虾、时间、引用、删除改为居左，用间隔点分开 |
| 0.3.21 | 2026-10-19 | 虾虾、时间、引用、删除回到虾虾气泡上方 |
| 0.3.20 | 2026-10-19 | 音乐回复按场景分别处理：点名、点类型、随便放、换一首 |
| 0.3.19 | 2026-10-19 | 时间、引用、删除改为每条消息强制渲染 |
| 0.3.18 | 2026-10-19 | 消息头恢复虾虾、时间、引用、删除四项，固定全部显示 |
| 0.3.17 | 2026-10-19 | 输入框与发送键彻底分离：框是框，按钮是旁边的独立圆钮 |
| 0.3.16 | 2026-10-19 | 发送键回到输入框内原位 |
| 0.3.15 | 2026-10-19 | 发送键保持在右侧原位独立 |
| 0.3.14 | 2026-10-19 | 发送与停止键独立成圆形按钮，脱离输入框 |
| 0.3.13 | 2026-10-19 | 输入区上下内边距统一为 22px |
| 0.3.12 | 2026-10-19 | 输入框左边距提升到 20px 并强制生效 |
| 0.3.11 | 2026-10-19 | 去掉输入区渐变羽化，不再糊掉额度胶囊 |
| 0.3.10 | 2026-10-19 | 抽屉打开时背后内容虚化，磨砂玻璃真正生效 |
| 0.3.9 | 2026-10-19 | 输入区上方遮罩收窄到极窄并柔化 |
| 0.3.8 | 2026-10-19 | 额度胶囊缩小并贴近输入条 |
| 0.3.7 | 2026-10-19 | 修复输入框左内边距未生效 |
| 0.3.6 | 2026-10-19 | 发送箭头与停止方块加粗 |
| 0.3.5 | 2026-10-19 | 抽屉导航栏改为磨砂玻璃 |
| 0.3.4 | 2026-10-19 | 输入框收窄并重调内边距与占位文字比重 |
| 0.3.3 | 2026-10-19 | 追问恢复左对齐，胶囊收小 |
| 0.3.2 | 2026-10-19 | 发送键与停止键统一为一套材质，深色模式白色、浅色模式黑色 |
| 0.3.1 | 2026-10-19 | 发送与停止按钮重做立体质感，按下回弹 |
| 0.3.0 | 2026-10-19 | 设置里新增字号调整，小/标准/大/特大四档 |
| 0.2.0 | 2026-09-28 | 对话支持流式输出 |
| 0.1.0 | 2026-09-10 | 首个版本上线：登录注册、对话、额度 |

---

## 四、记录缺口与教训

1. **10-24 没有独立日记**：不编造当天工作；以 10-23 末尾的 3.1.3 和 10-25 开头为衔接。
2. **10-25 有功能、缺 CHANGELOG 版本号**：日记里的额度/助理日记/识图/图文绕排修复是真实发生的，但主数组没有对应条目。以后发布时至少补一条版本记录，否则历史只能靠日记还原。
3. **3.1.3 只在日记里**：说明“代码版本、CHANGELOG、日记”三处曾不同步；以后以 `index.html` 实际版本为准，发布后三处对齐。
4. **缓存版本链是最大暗坑**：改子模块不升父模块 query，线上就像没改；版本链必须从被改文件一路升到 `index.html`。
5. **摊平打包禁止通用变量名**：`strip`/`json`/`clamp` 这类名字在单文件 Worker 里会撞声明；新模块必须进 `scripts/build-pages.mjs` 的 `ORDER`。
6. **额度类问题先看模型再看页面**：显示“越用越多”多半是每日额度与赠送池混算，不是前端数字画错。

---

## 五、怎么继续写历史

每次发布后，按这个顺序补：

1. `public/js/app.js` 的 `CHANGELOG` 顶部加一条：版本、日期、中文 2–5 条、英文 2–5 条；
2. `index.html` 升 `app.js` / `theme.css` query；
3. 本文件“三个阶段”补一句，版本速查由 CHANGELOG 重新生成；
4. `memory/YYYY-MM-DD.md` 记：改了什么、为什么、验证命令、线上版本、踩坑；
5. 如果改了部署/配置/数据结构，同步 `docs/OPERATIONS.md`。

历史不是写给外人看的，是给下一次上下文被压缩后的自己留的路标。

## 6.2.1（2026-10-30，app `v416`）

- **管理端防爆破**：新增 `adminGate()`，`ADMIN_TOKEN` 校验失败按 IP 记数，十分钟错 10 次即锁，替换所有 `isAdmin` 直调点。
- **短信防刷**：`/api/auth/sms/send` 在原有 60 秒手机号冷却之外，增加单 IP 每小时 5 条上限，防有人轮换手机号刷短信账单。
- 起因：项目开源后，`/api/admin/*` 路径与接口形状变成公开信息，必须假设会有人拿脚本试。

## 6.3.0（2026-10-30，app `v417` / games `v95`）—— 额度改余额制

- **不再每天自动补额度**：`quotaState()` 去掉每日额度与日重置，余额 = 兑换池 + 限时包，只减不增；`dailyLimit/dailyLeft` 恒为 0，只为兼容老前端。
- **注册礼 20**：`grantSignupQuota()`，注册成功即入余额。
- **用完即停**：聊天、学习中心（对话/刷题/老师答疑/场景结算）、课程、游戏全部走 `consumeQuota`，余额不足直接 402 `quota_exceeded`，挡在模型调用之前，不浪费 token。
- **积分兑换额度、礼物卡照常**：`/api/game/reward`（每天最多 20）保留，节日礼物卡照发；变的只是「不再每天自动补额度」这一件事。
- **游戏按次收费**：进游戏先扣 1 额度。
- **管理端发额度**：`/api/admin/quota/decide` 不填有效期即永久入余额（之前一律 30 天限时包）。
- 顺带修掉一个旧隐患：聊天流结束时 `chargedUsed == null` 会再调一次 `consumeQuota`（等于重复扣一次），改成只读用量。
