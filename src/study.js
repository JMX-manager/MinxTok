// 学习中心：翻译 / 解题 / 练习 / 错题本 / 生词本 / 场景应答 / 作文指导
// 全部走同一个 LLM 通道；解题与练习会额外产出画图脚本（SVG），前端直接渲
import { corsHeaders, json, uidOk } from './util.js';
import { getUsage, bumpUsage } from './store.js';
import { consumeQuota } from './quota.js';
import { describeImage } from './media.js';

const STUDY_TIMEOUT = 90000;

const BASE_RULES = [
  '你是明叙（MinxTok）里的学习助手，说话像人，不像客服。',
  '只输出最终答案，不要开场白、不要"好的我来帮你"这类废话。',
  '中文回答，科技术语保留标准写法。',
  '',
  '【排版硬规则，违反即错】',
  '1) 任何数学式子——包括练习题的题目、选项、答案——都必须用 [[math:...]] 包裹，不许裸写。集合题也一样：{1,2,3}、A∩B、A⊆B、∁_U A 全都要裹进去。',
  '2) 数学里禁止出现 > 和 < 这两个字符，改写成 \\gt 和 \\lt（前端会渲染成规范的 > 和 <）；还有 \\geq \\leq \\neq \\approx。',
  '3) 根号一律把被开方式写全，用花括号或括号圈住范围：\\sqrt{x-1}、\\sqrt{x+1}、\\sqrt[3]{x}，绝对不许写 √x-1 这种看不出根号盖到哪的形式（√ 后面必须紧跟括号或花括号，模型不许偷懒）。',
  '3b) 分式写 \\frac{分子}{分母}，上下标写 ^{} 与 _{}；方程组用 \\begin{cases}...\\end{cases}，多行大括号用 \\left\\{...\\right.；积分、求和、极限写 \\int_{a}^{b}、\\sum_{i=1}^{n}、\\lim_{x\\to 0}；根号套分式、分式指数、幂塔用嵌套花括号，如 \\sqrt{\\frac{a}{b}}、x^{\\frac{1}{2}}、a^{b^{c}}；希腊字母写 \\pi \\alpha \\theta \\Delta 等，集合运算符写 \\cap \\cup \\subseteq \\varnothing \\in \\notin。',
  '4) 化学方程式一律用 [[chem:...]] 包裹，元素与下标直接写（H2O），电荷写 ^2-，',
  '   反应符号默认用等号 = ，不要用箭头！条件写在等号上方（氧化还原写"得/失"或"↑↓"，其余写点燃、加热、催化剂、高温高压）；',
  '   也可写在等号下方。写法：H2 + O2 =[点燃] 2H2O 表示条件在等号上方；H2 + O2 =[点燃|生成水] 2H2O 表示上方点燃、下方生成水。',
  '   只有可逆反应用 \\rightleftharpoons 或 == 表示双箭头，电离用 = 或 \\to。',
  '5) 不要输出任何 HTML 标签、不要输出代码块、不要写 Markdown 表格来"画"东西。也不要写 \\dots \\cdots 这类 LaTeX 标点，要写就写 … 这个符号。',
  '6) 物理单位必须正体，写在数值后面：5 m/s、10 m/s²、2 kg·m/s²、1 N·m、20 °C；单位里的斜杠不是分式，禁止把 m/s 写成 \\frac{m}{s}，公式里可用 \\text{m/s} 或 \\pu{5 m/s}。',
  '7) 不要输出 Python、Matplotlib、JavaScript、HTML canvas 或任何画图脚本；画图只走 [[draw:{...}]]。画不出来就用文字说明，绝不许贴脚本充数。',
  '',
  '【字体分工，别混】',
  '数学/物理变量、集合、函数、几何标号（A、B、C、P、M）→ 走 [[math:...]]，会渲染成衬线斜体；',
  '化学式与方程式 → 走 [[chem:...]]，会渲染成正体，字体跟随「数理字体」开关（衬线/无衬线）；',
  '普通中文叙述 → 直接写，用苹方。',
  '三者各管一块，不要在一个式子里混着写。',
];// 各模式专属约束
const MODES = {
  translate: [
    '任务是翻译。先把意思翻准，再按目标语言的表达习惯调顺。',
    '输出结构必须完整，按下面四段顺序，全部放在同一条回答里：',
    '1) 第一段只给译文本身，不要写“译文：”这样的前缀，也不要加引号；',
    '2) 另起一段，用 **翻译要点** 开头，给 2–4 条：语序调整、语气分寸、习语或文化差异，说清“为什么这么翻”；',
    '3) 另起一段，用 **重点词汇与短语** 开头，挑 3–5 个，每个写成「词/短语 · 词性 · 释义 · 在本句里的用法」；',
    '4) 另起一段，用 **句型** 开头，挑 1–3 个，每个写成「句型 · 结构 · 说明」，并指出本句哪里用到了它。',
    '译文要像目标语言里真人会说的话，不逐字硬译；成语和语气词换成真正对称的说法。',
    '用户没说目标语言时，中译英、英译中，其他语言译成中文。',
  ],
  solve: [
    '任务是解题。先判断题型，再给完整解法。',
    '输出结构：一行答案结论（可用加粗）→ 分步推导 → 最后一句点出这类题的通用套路。',
    '公式统一放进 [[math:...]]；里面可以写 Unicode，也可以写 \\frac{}{}、\\sqrt{}、^{}、_{} 等 LaTeX，前端会统一排版，不要裸写。',
    '涉及几何、函数、坐标系或化学实验装置时，额外给一段画图脚本（见下面的画图规则）。',
  ],
  practice: [
    '任务是出练习题。按用户说的知识点和难度出题，题量默认 5 道。',
    '输出结构：先是题干列表，编号 1.2.3.；然后空一行写「答案」，给答案和一句话思路。',
    '题目要有层次：前两道基础，中间两道变式，最后一道综合。',
    '涉及几何、函数、坐标系或化学实验装置时，给第一道配一段画图脚本（见下面的画图规则）。',
  ],
  word: [
    '任务是编写词典条目。用户可能给一个单词、一个短语，或一串用逗号/空格隔开的词。',
    '每个词独立成条；多个词之间用一条 Markdown 分割线（---）隔开。',
    '每个词严格按下面的结构输出，信息密度要像牛津学习者词典，但解释用中文：',
    '### 词头 /音标/（音标紧跟在词头同一行；有把握才写，没把握就省略，绝不硬编）',
    '音标规则：英式与美式发音相同就只写一个 /.../，不要标“英/美”；不同就写成 BrE /.../ · NAmE /.../，只用 BrE 与 NAmE，绝对不要写“英式音标”“美式音标”“英”“美”这些中文标签，也不要拆成两行。',
    '**词性**：把所有常见词性列全（如 n. / v. / adj. / adv. / prep.），再补不常见、专业、古旧或口语义项，每条标清楚。',
    '**释义**：按词性分组，常见义在前、生僻义在后；每条给中文释义 + 一句简短英文解释，必要时给一个中文近义词。',
    '**用法与短语**：给 4–8 条固定搭配、短语动词、介词搭配或句型，每条写「搭配 · 中文意思 · 一句话说明」。',
    '**例句**：每个主要词性至少 1 句，英文原句 + 中文翻译；例句要能体现该义项，不要只写 My name is... 这类空句。',
    '**衍生与派生**：名词/动词/形容词/副词形式、同根词、派生词；再给 2–3 组近义词辨析，说清差别。',
    '**易混提示**：有常见拼写、发音、搭配错误就点一句；没有就省略，不要凑字数。',
    '查不到或不确定的词源、音标、罕释义，直接省略，不许编造。',
  ],
  mistake: [
    '任务是分析一道错题，把这次错误变成下一次的分数。',
    '输出结构必须完整，按下面四段顺序：',
    '1) **错在哪**：一句话点出错误类型（概念不清 / 审题偏差 / 计算失误 / 步骤跳跃 / 单位或符号 / 方法选错），不要笼统说“粗心”。如果用户给了原题和答案，先复述关键条件再判断；信息不足就明确说还缺哪一步。',
    '2) **下次怎么做**：给 3 条可执行动作，每条以动词开头，具体到考场上的动作（例如“先圈出定义域再动笔”“写完代回原式验算一遍”），不要写“认真一点”这种空话。',
    '3) **可能连带的错误**：指出这个漏洞还会导致哪 2–3 类题出错；每类给一个简短例子，写成「题干 → 容易错的答案 → 正确答案」，并说明错因。',
    '4) **鼓励**：两句话，具体夸这次暴露问题的价值（例如“现在错，比考场上错值钱”），不要空喊加油。',
    '数学式子按排版规则用 [[math:...]] 包裹，禁止裸写 > 和 <。',
  ],
  scene: [
    '任务是场景应答训练。用户说的是一个生活场景，你要先给对方的角色设定，再示范应答。',
    '输出格式：第一行写「场景：」复述场景；接着「对方可能会说」给两句对方台词；然后「你可以这样回」给两三句不同语气的应答；最后一句点评为什么这样说合适。',
    '语言看场景：日常中文场景用中文，英语口语场景给英文加中文注。',
  ],
  writing: [
    '任务是作文指导。用户可能给题目、给草稿、或只给方向。',
    '输出结构：一、审题（一句话点出题目真正要什么）；二、立意与结构（列提纲，三到四段，每段一句话说明写什么）；三、可用素材（两三个具体的人或事，不要"比如某某"式的空话）；四、开头示范（写一段真正的开头）。',
    '如果用户给了草稿，先挑三个最该改的地方，说清为什么，再给改后的句子。',
    '不用华丽堆砌的形容词，写人话。',
  ],
};

// 画图规则：前端有 SVG 渲染器，模型只写结构化的图元，绝不能自己画 ASCII 图或吐代码
const DRAW_RULES = String.raw`
【画图规则 · 必须严格照做，违反就是交白卷】
需要配图时，在答案的最末尾插入且只插入一段 [[draw: 与 ]] 包裹的 JSON，前端会把它渲染成真正的 SVG 图。
每段 JSON 都必须有 "title"，写一句 10–24 字的图注（画的是什么、关键条件），前端会显示在图下方。
图前后必须有文字：先用 1–2 句说明画的是什么、标了哪些关键点或辅助线；图后再用 1–2 句读图结论。绝不能只甩一张图。
严禁用文字、ASCII、制表符、括号拼图；严禁输出 JavaScript / Python / 任何代码；严禁说"如图所示"。
必须直接输出 [[draw:...]] 本体，不能只给一段 JSON 代码块、不能给 Matplotlib / JavaScript 画图脚本、也不能只描述脚本；没有渲染成图就等于没画。

一、平面几何用 solid2d（不要用 grid）。
[[draw:{"type":"solid2d","title":"直角三角形 ABC","items":[{"type":"triangle","points":[[0,0],[5,0],[2,3.6]],"labels":["A","B","C"]}]}]]
可用图元：
- triangle：points 三个点，labels 三个顶点名，right:true 标直角（勾在第二个顶点），equal:true 标等长
- polygon：points + labels，任意多边形
- circle：x y r，可加 label
- point：x y label
- angle：x y a1 a2（角度制）label
- vector：from:[x,y] to:[x,y] label
坐标一律用真实算出的数值，单位一致，图形不要贴着边界。

二、立体几何用 solid。
[[draw:{"type":"solid","shape":"cube","size":[4,4,4],"title":"正方体 ABCD-A1B1C1D1","labels":["A","B","C","D","A1","B1","C1","D1"]}]]
[[draw:{"type":"solid","shape":"sphere","r":2,"title":"球 O，半径 2"}]]
[[draw:{"type":"solid","shape":"prism","n":3,"r":2,"h":4,"title":"正三棱柱 ABC-A1B1C1","labels":["A","B","C","A1","B1","C1"]}]]
shape 可选 cube / cuboid / prism / pyramid / cylinder / cone / sphere；尺寸写 size:[长,宽,高] 或 r 与 h；
labels 按顶点顺序给，会自动贴到顶点上；被挡住的棱自动画虚线。
自定义顶点用 custom:[[x,y,z],...] + edges:[[i,j],...]。

三、函数图像用 grid。
[[draw:{"type":"grid","x":[-6,6],"y":[-6,6],"step":1,"title":"抛物线 y=x²−2x−3","items":[{"type":"func","f":"x^2-2x-3"}]}]]
step 是单位长度，可写 0.5 / 1 / 2 / 4；按范围选 6–10 格，不要永远写 1；两轴单位不同可分别写 xstep / ystep。
可用图元：
- func：f 写表达式，支持 ^ * / sqrt() cbrt() abs() sin() cos() tan() asin() acos() atan() sinh() cosh() tanh() ln() log() log2() log10() exp() floor() ceil() round() sign() max() min() pow() pi e，x 是变量；
  可以直接写 x^2-2x-3、2(x+1)、|x-2|、x²，前端会自己转；不要写 y=、f(x)=，也不要把不等号写进 f
- 带根号、对数、分式的函数（如 f(x)=√(x²-3x-4)、ln(x-2)、1/(x-1)）一律用 type:"func"，f 写成 "sqrt(x^2-3x-4)"、"ln(x-2)"、"1/(x-1)"；前端会自动在定义域断点处分段，不会把两段硬连起来。
- 只有真正的一元二次函数才允许用 type:"parabola" + a/b/c；带根号、绝对值、反比例、分段函数绝不能用 parabola 冒充。拿不准就用 func。
- 双曲线直接用 {"type":"hyperbola","a":2,"b":1}（左右开口）；上下开口加 "orient":"v"；中心不在原点用 cx/cy。不要拆成两个 sqrt 函数硬拼，也不要拿 parabola 冒充。
- 画函数前先算定义域和关键点（零点、顶点、渐近线、断点），x、y 范围要覆盖这些点；定义域为空或整段无定义就不要画。
- func 可加 domain:[a,b] 只画这一段；定义域端点必须写 "endpoints":true，并用 "open":[左,右]（true 空心 / false 实心）或 "open":"both" 标清楚；再加 "guides":true 画端点向 x 轴的竖向虚线。示例：{"type":"func","f":"x^2","domain":[-2,2],"endpoints":true,"open":[true,false],"guides":true}
- 分段函数用 type:"piecewise" + pieces，每段写 f 和 domain，端点用 open 控制空心/实心；段与段之间不会连线。示例：{"type":"piecewise","pieces":[{"f":"x+1","domain":[-3,0],"open":[true,false]},{"f":"x^2","domain":[0,3],"open":[false,false]}]}
- 极坐标/螺线用 type:"polar"，r 写关于 t 的表达式，theta:[起,止] 或 turns:圈数；阿基米德螺线 r=t、玫瑰线 r=cos(3t)、心形线 r=1-cos(t) 都这样写。示例：{"type":"polar","r":"t","theta":[0,6],"title":"阿基米德螺线 r=θ"}
- 参数方程用 type:"parametric"，x/y 写关于 t 的表达式，t:[起,止]；圆、椭圆、利萨茹图、摆线都用它。示例：{"type":"parametric","x":"2cos(t)","y":"sin(t)","t":[0,6.283]}
- 三角函数（圆函数）直接 func：sin/cos/tan 都支持，tan 的渐近线会自动断开；周期取 1–2 个周期，别把整条 tan 硬连成一条线。
- 抽象函数/小众函数也用 func：floor、ceil、sign、max、min、分段、绝对值都支持；跳跃处用 "breaks":[...] 或 piecewise 断开，别让竖线把两段连起来。
- circle 图元可加 "dash":true 画虚线圆；需要圆弧/椭圆用 parametric 参数方程。
- func 可加 fill:"up" 表示曲线以上整个半平面，fill:"down" 表示曲线以下整个半平面（二元不等式用这个，不要只填曲线和 x 轴之间）
- region：二元不等式平面区域。y > f(x) 用 {"type":"region","f":"x^2-4x","op":">"}；y < f(x) 用 op "<"；x > f(y) 加 "axis":"x"；f < y < g 用 {"type":"region","f":"...","g":"...","op":"between"}
- region 会自动补边界曲线：严格不等式画虚线，含等号画实线；不要把边界函数再重复写一遍
- region 会自动在图上写解析式（如 y ≤ x³），不需要再额外加 label
- line：k 与 b（y=kx+b），或 through:[[x1,y1],[x2,y2]]
- parabola：a b c
- point：x y label
- area：解集填充，写 from:[x1,x2] op:"gt"|"lt"|"ge"|"le"|"between"，把 x 轴上的解集区间填成实心色带
- vline：竖直参考线 x
- label：x y text

物理图像（v-t、s-t、U-I、F-x 等）必须自己定义横纵轴：
加 "xlabel":"t/s"、"ylabel":"v/(m·s⁻¹)"，量纲不同时加 "aspect":"auto" 让两轴各自铺满。
x/y 跨度相差很大时（如 y=x³）前端会自动铺满，避免图被压窄；想强制等比就写 "aspect":"equal"。
[[draw:{"type":"grid","x":[0,6],"y":[0,12],"step":1,"xlabel":"t/s","ylabel":"v/(m·s⁻¹)","aspect":"auto","title":"匀加速直线运动的 v-t 图像","items":[{"type":"line","through":[[0,2],[5,12]]}]}]]

二元不等式画整片区域，不是只画曲线：
[[draw:{"type":"grid","x":[-2,6],"y":[-6,8],"step":1,"title":"不等式 y > x²−4x 表示的平面区域","items":[{"type":"region","f":"x^2-4x","op":">","x":[-2,6]}]}]]

四、物理题图（beta）：题目涉及斜面、小车、自行车、火车、货车、隧道、滑轮、弹簧、受力、电路、透镜、平面镜、折射时，用 type:"physics" + scene，前端画成真正的示意图。
[[draw:{"type":"physics","scene":"incline","angle":30,"m":"2 kg","show":{"f":true},"title":"质量 2 kg 的物块沿 30° 斜面上滑"}]]
scene 可选（写中文也行）：
- car 小车/汽车、truck 货车、bike 自行车、train 火车、tunnel 车过隧道（可写 L 隧道长 / l 车长）
- incline 斜面（angle 角度，m 物块质量，show.f/show.F 控制摩擦力与拉力箭头）
- forces 水平面受力分析（show.f / show.F 控制摩擦力和拉力）
- pulley 定滑轮（m1/m2、G1/G2）、spring 弹簧振子（m、A 振幅）
- circuit 电路（cond:"series"|"parallel"，E 电源、R1/R2 电阻、A 有电流表、V 有电压表）
- lens 凸透镜成像（uPx 物距像素，默认 74，uPx 越小像越大越远）
- mirror 平面镜成像、refraction 光的折射（i 入射角，n1/n2 介质折射率）
- person 人站在地面受力（show.f/show.F 控制摩擦力和推力，m 写体重）；人做受力分析一律用它，不要用 forces 画方块
- lever 杠杆（angle 倾角，G1/G2 两端重物，L1/L2 力臂）
- pendulum 单摆（angle 偏角，m 摆球）、ball 小球滚动（rPx 半径，v 速度，show.f）
- conveyor 传送带、elevator 电梯（dir:"up"|"down" 加速方向，a 加速度）
- stack 叠放木块（A 在上 B 在下，show.f 画 f₁/f₂）、float 漂浮与浮力（V 显示 F浮=G）
- magnet 磁铁（N/S 极，写成同名相斥就在 note 里写「同名磁极相互排斥」或加 "repel":true）
- charge 点电荷（q1/q2 电荷量，note 写同种/异种电荷，d 标距离）
- force2d 多力受力分析：surface:"ground"|"incline"，forces:[{"label":"G","angle":-90,"mag":1.2},{"label":"N","angle":90,"mag":1.0},{"label":"f","angle":180,"mag":0.8}]，angle 用数学角（0°向右、90°向上），mag 是相对长度；net 画合力虚线
- kinematics 运动学图像：mode:"vt"|"xt"，points:[[t,y],...]；不写 points 就用 u 初速度、a 加速度、T 总时间自动生成
- circuit 复杂电路：mode:"series"|"parallel"|"bridge"|"multi"；bridge 画惠斯通电桥（R1–R4 + 检流计 G），multi 画双回路（R1/R2/R3 + 电源 + 开关）
- projectile 抛体运动：angle 抛射角、v0 初速度、rangePx/hPx 控制射程与高度，虚线画轨迹
- prism 三棱镜色散；efield 点电荷电场线（q1/q2 写 +/−，note 写同种/异种）
physics 图只能放一段、不能再塞 items；需要标注数值就写进 title，别在图里堆文字。
同一题最多配一张物理图，多问分步时用文字说清。

五、化学实验装置用 type:"chem" + scene，前端会画成和考试卷一致的线稿装置图。
[[draw:{"type":"chem","scene":"o2_kmno4","title":"加热高锰酸钾制氧气"}]]
scene 可选：o2_kmno4（高锰酸钾制氧气）/ o2_h2o2（过氧化氢制氧气）/ co2（大理石与稀盐酸）/ h2（锌与稀硫酸）/ filtration（过滤）/ evaporation（蒸发）/ distillation（蒸馏）/ weighing（托盘天平称量）/ measure（量筒读数）/ heat_liquid（试管加热液体）/ gas_up（向上排空气）/ gas_down（向下排空气）/ titration（中和滴定）/ solution（配制溶液）/ reduce_cuo（氢气还原氧化铜）/ multi_tube（多试管实验，count、labels、heat）/ flask（烧瓶装置，reflux:true 加冷凝管）/ purify（洗气瓶+干燥管除杂，step1–step4）/ flame_test（焰色试验，ion、flame、color）/ electrolysis（电解，left/right 电极名）/ fountain（喷泉实验）/ silver_mirror（银镜反应）。
只想画几件仪器（认仪器、辨仪器）用 [[draw:{"type":"chem","scene":"gallery","items":["酒精灯","烧杯","试管","蒸发皿"]}]]，仪器名可写酒精灯/烧杯/试管/锥形瓶/量筒/集气瓶/水槽/漏斗/长颈漏斗/蒸发皿/玻璃棒/托盘天平/铁架台/圆底烧瓶/温度计/胶头滴管/药匙/冷凝管/滴定管/洗气瓶/干燥管/U形管/广口瓶/坩埚/研钵/试管架/坩埚钳/表面皿/分液漏斗/导气管。
化学题只要涉及制取气体、过滤、蒸发、蒸馏、称量、配制溶液、滴定、还原氧化铜、焰色试验、除杂干燥、多试管对比、电解、喷泉、银镜等实验操作，就必须配一张装置图；纯方程式计算不配。

六、解不等式、写解集时：先用 [[math:...]] 把解集写成集合或区间，再必须配一张 grid 图，用 area 或带 fill 的 func 把解集区域填成实心。
解集绝对不能是代码，不能出现 JavaScript、不能出现 {x|x>2} 之外的程序式写法。

七、硬规则：
- 一张图只放一个主图元；坐标系范围必须把所有关键点（零点、顶点、交点、边界）都包进去；
- 曲线要落在格线上或格点附近，范围宁大勿小；
- 解一元二次不等式时，图里必须同时有抛物线（func）和 x 轴上的解集色带（area），文字里写清零点与开口方向；
- 二元不等式（y > f(x)、y < f(x)）必须把曲线上方或下方整片半平面填满，不许只填曲线与 x 轴之间的窄条；
- 立体几何必须给顶点名；正方体默认写 ABCD-A1B1C1D1，别只画个空盒子；
- color 用十六进制，不写就用主题色；
- JSON 必须合法：双引号、不许注释、不许尾逗号、不许代码块包裹；
- 正文不要复述坐标，也不要描述 JSON。`;

function systemFor(mode, wantDraw) {
  const rules = MODES[mode] || [];
  return BASE_RULES.concat(rules).join('\n') + (wantDraw ? '\n' + DRAW_RULES : '');
}

// 场景应答：只做角色扮演，用户是说话的人，模型演对面的角色，不教学、不出戏
function sceneRules(scene) {
  const lang = scene && scene.lang === 'zh' ? '中文' : '英语';
  const desc = String((scene && (scene.prompt || scene.desc)) || '').slice(0, 120);
  const userFirst = !!(scene && (scene.first === 'user' || scene.userFirst));
  return [
    '【场景角色扮演】',
    `场景：${String((scene && scene.title) || '').slice(0, 80)}`,
    ...(desc ? [`情境说明：${desc}`] : []),
    `你演：${String((scene && scene.role) || '对话对象').slice(0, 80)}；用户演：${String((scene && scene.userRole) || '说话的人').slice(0, 80)}。`,
    ...(userFirst ? ['这一轮由用户先开口。用户还没说之前，不要抢话、不要替用户说、不要给示例台词。'] : [`你的第一句话：${String((scene && scene.opening) || '').slice(0, 300)}`]),
    `全程只用${lang}，只以你的角色说话，每次 1–3 句，像真人聊天一样自然。`,
    ...(lang === '英语' ? [
      '这是英语口语练习：无论用户用中文还是英文，你都只能用英语回应，一个中文字都不要出现。',
      '不要翻译、不要解释、不要加括号注释，除非用户明确要求讲解。',
    ] : []),
    '不要出戏，不要解释、不要教学、不要纠正语法，不要替用户回答，不要输出标签、标题或格式。',
    '对方表达不清时就像真人一样追问；对方说得好就自然接住，不要夸成老师。',
  ].join('\n');
}

// 判断这次是否要画图：几何、函数、坐标系、数轴相关
export function wantsDrawing(text, mode) {
  if (mode !== 'solve' && mode !== 'practice') return false;
  const t = String(text || '');
  if (/(函数|抛物线|坐标|数轴|几何|三角形|四边形|矩形|证明|作图|画图|图像|直线|圆|角|面积|体积|截面|立体|球|正方体|长方体|棱柱|棱锥|圆柱|圆锥|三棱柱|四棱锥|分段|极坐标|参数方程|螺线|螺旋|三角函数|抽象函数|定义域|值域|单调|奇偶|周期)/.test(t)) return true;
  // 化学实验题：装置、仪器、制取/收集/除杂等操作都要能配 chem 图
  if (/(化学|高锰酸钾|过氧化氢|氧气|二氧化碳|氢气|制取|制备|发生装置|收集装置|实验装置|酒精灯|试管|烧杯|锥形瓶|集气瓶|水槽|导管|漏斗|蒸发皿|玻璃棒|量筒|铁架台|托盘天平|过滤|蒸发|蒸馏|滴定|称量|配制溶液|还原氧化铜|焰色|铂丝|蓝色钴玻璃|多试管|试管架|洗气瓶|干燥管|U形管|坩埚|研钵|分液漏斗|表面皿|电解|烧瓶|除杂|喷泉|银镜)/.test(t)) return true;
  // 物理题：涉及运动/受力/电路/光学的，也要把作图规则塞进去，模型才知道能用 physics 图
  return /(物理|斜面|小车|汽车|自行车|火车|列车|货车|卡车|隧道|滑轮|弹簧|受力|摩擦力|电路|串联|并联|电阻|电源|电压|电流|透镜|凸透镜|平面镜|折射|反射|光路|加速度|匀加速|速度|位移|物块|轨道|电场|磁场|运动学|平抛|斜抛|抛体|电桥|复杂电路|棱镜|色散|电场线)/.test(t);
}

// 化学实验题：按题干猜一个最贴切的装置场景，直接把图脚本塞进提示里，
// 避免模型只写文字、忘记配图（前端 chem 渲染器支持这些 scene）。
export function chemSceneFor(text) {
  const t = String(text || '');
  // 只有真的在问实验/操作/装置时才配图，别给“二氧化碳的化学式”硬塞一张制取图
  if (!/(制取|制备|制法|制氧气|制气体|实验室|装置|收集|发生|除杂|净化|干燥|操作|实验|反应|仪器|图|过滤|蒸发|蒸馏|滴定|称量|配制|还原|焰色|灼烧|电解|多试管|试管架|洗气|分液|坩埚|研钵|喷泉|银镜)/.test(t)) return '';
  const hit = [
    [/(喷泉)/, 'fountain'],
    [/(银镜)/, 'silver_mirror'],
    [/(焰色|铂丝|蓝色钴玻璃)/, 'flame_test'],
    [/(电解)/, 'electrolysis'],
    [/(多试管|试管架|对比实验)/, 'multi_tube'],
    [/(除杂|洗气|干燥管|净化)/, 'purify'],
    [/高锰酸钾/, 'o2_kmno4'],
    [/(过氧化氢|双氧水)/, 'o2_h2o2'],
    [/(二氧化碳|大理石|石灰石|碳酸钙)/, 'co2'],
    [/(还原氧化铜|氧化铜)/, 'reduce_cuo'],
    [/(氢气|锌粒|锌和稀硫酸|稀硫酸)/, 'h2'],
    [/(过滤)/, 'filtration'],
    [/(蒸发)/, 'evaporation'],
    [/(蒸馏)/, 'distillation'],
    [/(烧瓶)/, 'flask'],
    [/(称量|托盘天平)/, 'weighing'],
    [/(量筒|读数)/, 'measure'],
    [/(加热液体|试管加热)/, 'heat_liquid'],
    [/(向上排空气)/, 'gas_up'],
    [/(向下排空气)/, 'gas_down'],
    [/(滴定|中和)/, 'titration'],
    [/(配制溶液|溶液配制)/, 'solution'],
  ];
  for (const [re, scene] of hit) if (re.test(t)) return scene;
  return '';
}

async function callLLM(env, messages, maxTokens = 6000) {
  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), STUDY_TIMEOUT);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({ model: env.LLM_MODEL || 'deepseek-chat', messages, temperature: 0.6, max_tokens: maxTokens }),
      signal: ctrl.signal,
    });
    const d = await res.json();
    return ((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '').trim();
  } catch (_) {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

// 历史列表只放一句轻量概括，不把整段提问当标题
function compactSessionTitle(value) {
  let s = String(value || '')
    .replace(/\[\[[\s\S]*?\]\]/g, ' ')
    .replace(/^(请|帮我|我想|想问|求|如何|怎么|已知|题目[:：]?)/, '')
    .replace(/[，。！？、；：,.!?:;'"“”‘’（）()【】\[\]\s]+/g, '')
    .trim();
  const chars = Array.from(s);
  if (chars.length > 10) return chars.slice(0, 10).join('') + '…';
  return s;
}

async function summarizeSession(env, messages) {
  if (!env.LLM_API_KEY) return '';
  const first = Array.isArray(messages) ? messages[0] : null;
  if (!first || !first.q) return '';
  const q = String(first.q || '').replace(/\[\[[\s\S]*?\]\]/g, ' ').slice(0, 600);
  const a = String(first.a || '').replace(/\[\[[\s\S]*?\]\]/g, ' ').slice(0, 1000);
  const out = await callLLM(env, [
    {
      role: 'system',
      content: '你是学习助教。请用10到14个汉字概括这段学习对话的主题。只输出概括本身，不要标点、引号、前缀或解释。',
    },
    { role: 'user', content: `学生问：${q}\n助手答：${a}` },
  ], 48);
  return compactSessionTitle(out).replace(/…$/, '');
}

// 主接口：mode + 用户输入
export async function handleStudy(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid, mode, text, extra, followup, history, scene, image, imageText } = body || {};
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  if (!MODES[mode]) return json({ error: 'invalid_mode' }, 400, cors);
  let input = String(text || '').trim();
  if (!input && !image) return json({ error: 'empty' }, 400, cors);
  if (!input) input = '请看看这张图片，并按当前模式帮我处理。';

  let imageNote = '';
  if (image && mode !== 'scene') {
    try {
      const desc = await describeImage(env, image);
      if (desc) imageNote = `\n\n【用户附了一张图片】${desc.slice(0, 2400)}。请只依据图片内容作答，不要拿上下文里的旧内容硬套。`;
      else imageNote = '\n\n【用户附了一张图片，但识别没有返回结果】不要猜图片内容，也不要拿上文旧题硬套；直接说明图片没看清，请用户重发清晰图片或描述图里有什么。';
      if (imageText) imageNote += `\n【图中文字】${String(imageText).slice(0, 800)}`;
    } catch (_) {
      imageNote = '\n\n【用户附了一张图片，但识别失败】不要猜图片内容，也不要拿上文旧题硬套。';
    }
  }

  const draw = wantsDrawing(input + ' ' + String(extra || '') + ' ' + imageNote, mode);
  const chemScene = (mode === 'solve' || mode === 'practice')
    ? chemSceneFor(input + ' ' + String(extra || '') + ' ' + imageNote)
    : '';
  const drawHint = chemScene
    ? `\n\n【必须配图】这道题涉及化学实验，回答里必须包含 [[draw:{"type":"chem","scene":"${chemScene}"}]]，不能只写文字，也不能省略。`
    : '';
  // 场景应答可能是英文，不能沿用 BASE_RULES 里“中文回答”的硬要求
  const sceneBase = BASE_RULES.filter(line => !line.includes('中文回答'));
  const system = mode === 'scene' && scene
    ? sceneBase.concat([sceneRules(scene)]).join('\n')
    : systemFor(mode, draw);
  const en = String(body.lang || '') === 'en';
  const messages = [{ role: 'system', content: en ? system + '\n\nReply entirely in English; keep proper nouns as-is.' : system }];
  // 接着问：把前面几轮问答带回去，保证它是"接着说"而不是重新来过
  if (!image && followup && Array.isArray(history)) {
    for (const turn of history.slice(-5)) {
      if (!turn || !turn.q) continue;
      messages.push({ role: 'user', content: String(turn.q).slice(0, 600) });
      if (turn.a) messages.push({ role: 'assistant', content: String(turn.a).slice(0, 1200) });
    }
  }
  messages.push({ role: 'user', content: `${input}${imageNote}${extra ? `\n\n【补充要求】${String(extra).slice(0, 400)}` : ''}${drawHint}` });
  { const q = await chargeStudy(env, uid, cors); if (q) return q; }
  let answer = await callLLM(env, messages);
  // 上游偶尔空手而归（推理档把预算全花在思考上），别让用户自己点第二次
  if (!answer) answer = await callLLM(env, messages, 6000);
  if (!answer) return json({ error: 'llm_failed', message: '这次没生成出来，再试一次' }, 502, cors);

  return json({ ok: true, mode, answer, drew: draw && /\[\[draw:/.test(answer) }, 200, cors);
}

// 流式版：把模型的 SSE 原样转给前端，首字更快，长答案不用干等
export async function handleStudyStream(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid, mode, text, extra, followup, history, scene, image, imageText } = body || {};
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  if (!MODES[mode]) return json({ error: 'invalid_mode' }, 400, cors);
  let input = String(text || '').trim();
  if (!input && !image) return json({ error: 'empty' }, 400, cors);
  if (!input) input = '请看看这张图片，并按当前模式帮我处理。';

  let imageNote = '';
  if (image && mode !== 'scene') {
    try {
      const desc = await describeImage(env, image);
      if (desc) imageNote = `\n\n【用户附了一张图片】${desc.slice(0, 2400)}`;
      if (imageText) imageNote += `\n【图中文字】${String(imageText).slice(0, 800)}`;
    } catch (_) {}
  }
  if (!env.LLM_API_KEY) return json({ error: 'llm_failed', message: '这次没生成出来，再试一次' }, 502, cors);

  const draw = wantsDrawing(input + ' ' + String(extra || '') + ' ' + imageNote, mode);
  const chemScene = (mode === 'solve' || mode === 'practice')
    ? chemSceneFor(input + ' ' + String(extra || '') + ' ' + imageNote)
    : '';
  const drawHint = chemScene
    ? `\n\n【必须配图】这道题涉及化学实验，回答里必须包含 [[draw:{"type":"chem","scene":"${chemScene}"}]]，不能只写文字，也不能省略。`
    : '';
  const sceneBase = BASE_RULES.filter(line => !line.includes('中文回答'));
  const system = mode === 'scene' && scene
    ? sceneBase.concat([sceneRules(scene)]).join('\n')
    : systemFor(mode, draw);
  const en = String(body.lang || '') === 'en';
  const messages = [{ role: 'system', content: en ? system + '\n\nReply entirely in English; keep proper nouns as-is.' : system }];
  if (!image && followup && Array.isArray(history)) {
    for (const turn of history.slice(-5)) {
      if (!turn || !turn.q) continue;
      messages.push({ role: 'user', content: String(turn.q).slice(0, 600) });
      if (turn.a) messages.push({ role: 'assistant', content: String(turn.a).slice(0, 1200) });
    }
  }
  messages.push({ role: 'user', content: `${input}${imageNote}${extra ? `\n\n【补充要求】${String(extra).slice(0, 400)}` : ''}${drawHint}` });

  const base = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  { const q = await chargeStudy(env, uid, cors); if (q) return q; }
  let upstream;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'deepseek-chat',
        messages,
        temperature: 0.6,
        // 难的化学综合题光解析就要两千多字，3000 会在关键处被截断，
        // 前端看着就是“生成不出来”。
        max_tokens: 6000,
        stream: true,
      }),
    });
  } catch (_) {
    return json({ error: 'llm_failed', message: '这次没生成出来，再试一次' }, 502, cors);
  }
  if (!upstream.ok || !upstream.body) {
    return json({ error: 'llm_failed', message: '这次没生成出来，再试一次' }, 502, cors);
  }
  // 额度已在调用前扣过，这里不再重复计次
  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

// 学习中心统一收费：对话、刷题、老师答疑都算一次，余额不够直接挡在模型前面
async function chargeStudy(env, uid, cors) {
  const res = await consumeQuota(env, uid, 1);
  if (res.ok) return null;
  return json({ error: 'quota_exceeded', left: res.quota ? res.quota.left : 0, need: 1, message: '额度已用完，请联系管理员发放' }, 402, cors);
}

// 错题本 / 生词本：存 D1
export async function handleStudyList(req, env) {
  const cors = corsHeaders(env);
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid');
  const kind = url.searchParams.get('kind') || 'mistake';
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  const res = await env.DB.prepare(
    'SELECT id,kind,title,content,note,created_at FROM study_items WHERE uid=? AND kind=? ORDER BY created_at DESC LIMIT 200'
  ).bind(uid, kind).all();
  return json({ items: res.results || [] }, 200, cors);
}

export async function handleStudySave(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid, kind = 'mistake', title, content = '', note = '' } = body || {};
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  if (!['mistake', 'word'].includes(kind)) return json({ error: 'invalid_kind' }, 400, cors);
  if (!title) return json({ error: 'empty_title' }, 400, cors);
  const id = `st_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36)}`;
  await env.DB.prepare('INSERT INTO study_items (id,uid,kind,title,content,note,created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(id, uid, kind, String(title).slice(0, 200), String(content).slice(0, 16000), String(note).slice(0, 500), Date.now()).run();
  return json({ ok: true, id }, 200, cors);
}

// 给已存条目补/改内容（错题本里外部存进来的题，补一份 AI 分析）
export async function handleStudyUpdate(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid, id, content, note, title } = body || {};
  if (!uidOk(uid) || !id) return json({ error: 'invalid_params' }, 400, cors);
  const sets = [];
  const vals = [];
  if (typeof content === 'string') { sets.push('content=?'); vals.push(content.slice(0, 16000)); }
  if (typeof note === 'string') { sets.push('note=?'); vals.push(note.slice(0, 500)); }
  if (typeof title === 'string' && title.trim()) { sets.push('title=?'); vals.push(title.trim().slice(0, 200)); }
  if (!sets.length) return json({ error: 'nothing_to_update' }, 400, cors);
  vals.push(id, uid);
  await env.DB.prepare(`UPDATE study_items SET ${sets.join(',')} WHERE id=? AND uid=?`).bind(...vals).run();
  return json({ ok: true }, 200, cors);
}

export async function handleStudyDelete(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid, id } = body || {};
  if (!uidOk(uid) || !id) return json({ error: 'invalid_params' }, 400, cors);
  await env.DB.prepare('DELETE FROM study_items WHERE id=? AND uid=?').bind(id, uid).run();
  return json({ ok: true }, 200, cors);
}


/* ---------- 学习历史（v0.9.5） ----------
   每个板块的整段对话按会话存进 study_items，kind = session:<mode>。
   同一会话重复保存走 UPSERT，只保留最近一次内容。 */
const SESSION_KINDS = new Set([...Object.keys(MODES), 'drill']);

function sessionKind(mode) { return `session:${mode}`; }
function modeFromKind(kind) { return String(kind || '').replace(/^session:/, ''); }

export async function handleStudySessionSave(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid, id, mode, title, messages } = body || {};
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  if (!SESSION_KINDS.has(mode)) return json({ error: 'invalid_mode' }, 400, cors);
  if (!id) return json({ error: 'empty_id' }, 400, cors);
  const content = JSON.stringify(Array.isArray(messages) ? messages.slice(-40) : []);
  if (content.length > 60000) return json({ error: 'too_long' }, 413, cors);
  const kind = sessionKind(mode);
  let t = String(title || '').trim().slice(0, 80) || '未命名对话';
  const prev = await env.DB.prepare(
    'SELECT title FROM study_items WHERE id=? AND uid=?'
  ).bind(String(id).slice(0, 80), uid).first();
  // 新会话生成一次 AI 概括；老会话标题过长时也顺手压短
  if (mode === 'drill') {
    t = String(title || '').trim().slice(0, 80) || '刷题记录';
  } else if (!prev || Array.from(String(prev.title || '')).length > 18) {
    const aiTitle = await summarizeSession(env, messages);
    if (aiTitle) t = aiTitle;
    else if (!prev) t = compactSessionTitle(t);
  }
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO study_items (id,uid,kind,title,content,note,created_at) VALUES (?,?,?,?,?,?,?) ' +
    'ON CONFLICT(id) DO UPDATE SET title=excluded.title, content=excluded.content, created_at=excluded.created_at ' +
    'WHERE study_items.uid=excluded.uid'
  ).bind(String(id).slice(0, 80), uid, kind, t, content, mode, now).run();
  return json({ ok: true, id, savedAt: now }, 200, cors);
}

export async function handleStudySessionList(req, env) {
  const cors = corsHeaders(env);
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid');
  const mode = url.searchParams.get('mode') || '';
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  if (!SESSION_KINDS.has(mode)) return json({ error: 'invalid_mode' }, 400, cors);
  const res = await env.DB.prepare(
    'SELECT id,title,created_at FROM study_items WHERE uid=? AND kind=? ORDER BY created_at DESC LIMIT 50'
  ).bind(uid, sessionKind(mode)).all();
  const items = (res.results || []).map(row => ({
    ...row,
    summary: compactSessionTitle(row.title) || '未命名对话',
  }));
  return json({ items }, 200, cors);
}

export async function handleStudySessionGet(req, env) {
  const cors = corsHeaders(env);
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid');
  const id = url.searchParams.get('id');
  if (!uidOk(uid) || !id) return json({ error: 'invalid_params' }, 400, cors);
  const row = await env.DB.prepare(
    'SELECT id,kind,title,content,created_at FROM study_items WHERE id=? AND uid=?'
  ).bind(String(id), uid).first();
  if (!row || !String(row.kind || '').startsWith('session:')) return json({ error: 'not_found' }, 404, cors);
  let messages = [];
  try { messages = JSON.parse(row.content || '[]'); } catch (_) { messages = []; }
  return json({ ok: true, id: row.id, mode: modeFromKind(row.kind), title: row.title, messages, createdAt: row.created_at }, 200, cors);
}

export async function handleStudySessionDelete(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid, id } = body || {};
  if (!uidOk(uid) || !id) return json({ error: 'invalid_params' }, 400, cors);
  await env.DB.prepare('DELETE FROM study_items WHERE id=? AND uid=? AND kind LIKE ?')
    .bind(String(id), uid, 'session:%').run();
  return json({ ok: true }, 200, cors);
}

/* ============================ 场景结算 ============================ */
// 场景聊到收尾（说再见/谢谢，或者用户主动点结束）时，回头把这轮对话拆开：
// 用过哪些句子、哪些说得不够地道、语法踩了哪些坑，再折算学分。
function sceneWrapPrompt(scene, turns) {
  const lang = scene && scene.lang === 'zh' ? '中文' : '英语';
  const lines = turns.map((t, i) => `${i + 1}. 用户：${String(t.q || '').slice(0, 300)}\n   对方：${String(t.a || '').slice(0, 300)}`).join('\n');
  return [
    '你是一位温和的' + lang + '口语教练，现在要给学生这一轮情景对话做结算。',
    `场景：${String((scene && scene.title) || '日常对话')}`,
    `对话记录：\n${lines}`,
    '只输出 JSON，不要解释，不要代码块，结构如下：',
    '{"score":0-100的整数,"used":["学生这句说得好的地方，5-20字，最多4条"],"better":[{"from":"学生原句（截到40字）","to":"更地道的说法","why":"为什么，12-30字"}],"grammar":[{"from":"学生原句里的错处","to":"改对的样子","why":"错误类型+一句解释，20字内"}],"tip":"一句总评，30-60字"}',
    '更好的说法可以有 1-5 条，语法问题有就写、没有就给空数组 []；不要编造学生没说过的话，不要点评对方（AI）的台词。',
    '全部用中文写点评，「to」里的英文/中文例句保持原来的语言。',
  ].join('\n');
}

function sceneParseWrap(txt) {
  let raw = String(txt || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = raw.indexOf('{');
  const b = raw.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  raw = raw.slice(a, b + 1);
  let o = null;
  try { o = JSON.parse(raw); } catch (_) {
    try { o = JSON.parse(raw.replace(/\\/g, '\\\\').replace(/\\\\"/g, '\\"')); } catch (_2) { return null; }
  }
  if (!o || typeof o !== 'object') return null;
  const arr = (v) => (Array.isArray(v) ? v : []).filter(x => x && typeof x === 'object');
  return {
    score: Math.max(0, Math.min(100, Number(o.score) || 0)),
    used: (Array.isArray(o.used) ? o.used : []).filter(x => typeof x === 'string' && x.trim()).slice(0, 4).map(x => x.trim().slice(0, 60)),
    better: arr(o.better).slice(0, 5).map(x => ({
      from: String(x.from || '').slice(0, 80), to: String(x.to || '').slice(0, 120), why: String(x.why || '').slice(0, 80),
    })).filter(x => x.from && x.to),
    grammar: arr(o.grammar).slice(0, 6).map(x => ({
      from: String(x.from || '').slice(0, 80), to: String(x.to || '').slice(0, 120), why: String(x.why || '').slice(0, 80),
    })).filter(x => x.from && x.to),
    tip: String(o.tip || '').slice(0, 160),
  };
}

// 学分：按说了几句 + 评分给，句数越多、分越高越划算，但不搞成刷分机器
function sceneCredits(turns, score) {
  const n = Math.max(0, Math.min(12, turns));
  const base = 40 + n * 15;
  const bonus = Math.round((Math.max(0, Math.min(100, score)) / 100) * 60);
  return Math.min(260, base + bonus);
}

export async function handleSceneWrap(req, env) {
  const cors = corsHeaders(env);
  let body = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
  const { uid, scene, turns } = body || {};
  if (!uidOk(uid)) return json({ error: 'invalid_uid' }, 400, cors);
  const list = (Array.isArray(turns) ? turns : []).filter(t => t && (t.q || t.a)).slice(-12);
  if (!list.length) return json({ error: 'empty' }, 400, cors);
  let summary = null;
  if (env.LLM_API_KEY) {
    { const q = await chargeStudy(env, uid, cors); if (q) return q; }
    const answer = await callLLM(env, [
      { role: 'system', content: sceneWrapPrompt(scene || {}, list) },
      { role: 'user', content: '请给这一轮对话出结算。' },
    ], 1200);
    summary = sceneParseWrap(answer);
  }
  const userTurns = list.filter(t => String(t.q || '').trim()).length || list.length;
  const score = summary ? summary.score : 70;
  const credits = sceneCredits(userTurns, score);
  if (!summary) {
    summary = {
      score,
      used: list.filter(t => t.q).slice(-3).map(t => `敢开口说：${String(t.q).slice(0, 24)}`),
      better: [], grammar: [],
      tip: '这轮没拿到完整点评，但对话次数是实的，继续练就有效果。',
    };
  }
  summary.turns = list.length;
  summary.userTurns = userTurns;
  summary.credits = credits;
  return json({ ok: true, summary }, 200, cors);
}
