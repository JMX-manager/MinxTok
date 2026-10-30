// 中文界面里的全局英文点词：单词下划点线，点开是词性 + 中文释义 + 短例句。
// 查词走后端 /api/dict（代理有道，并按句子挑选义项），前端 localStorage 缓存。
import { getLang } from './i18n.js?v=118';
import { chemHtml } from './blocks.js?v=174';

const CACHE = new Map();
const LS_PREFIX = 'minxtok.dict.v4.';
let pop = null;
let popWord = null;
let popPhon = null;
let popBody = null;
let activeEl = null;
let seq = 0;
let closeTimer = 0;

// 最常用的基础词直接本地出结果，不走网络；其余词再由词典接口按句意收敛。
const BASIC_WORDS = {
  the: ['ðə', 'art.', '这个；那个（定冠词）', 'The book is on the table.'],
  a: ['ə', 'art.', '一个（不定冠词）', 'I saw a bird.'],
  an: ['ən', 'art.', '一个（用于元音音素前）'],
  and: ['ænd', 'conj.', '和；并且', 'You and I.'],
  or: ['ɔːr', 'conj.', '或者；否则'],
  but: ['bʌt', 'conj.', '但是'],
  if: ['ɪf', 'conj.', '如果'],
  because: ['bɪˈkɔːz', 'conj.', '因为'],
  so: ['soʊ', 'adv./conj.', '所以；如此'],
  of: ['əv', 'prep.', '……的；属于'],
  to: ['tuː', 'prep.', '到；向；用于不定式', 'I want to go.'],
  in: ['ɪn', 'prep.', '在……里面；在（某地）'],
  on: ['ɑːn', 'prep.', '在……上面；关于'],
  at: ['æt', 'prep.', '在（某地/某时）'],
  for: ['fɔːr', 'prep.', '为了；给'],
  with: ['wɪð', 'prep.', '和……一起；用'],
  from: ['frʌm', 'prep.', '从；来自'],
  by: ['baɪ', 'prep.', '由；通过；在……旁边'],
  about: ['əˈbaʊt', 'prep./adv.', '关于；大约'],
  as: ['æz', 'conj./prep.', '作为；像；当……时'],
  into: ['ˈɪntuː', 'prep.', '进入；变成'],
  over: ['ˈoʊvər', 'prep./adv.', '在……上方；超过'],
  after: ['ˈæftər', 'prep./conj.', '在……之后'],
  before: ['bɪˈfɔːr', 'prep./conj.', '在……之前'],
  under: ['ˈʌndər', 'prep.', '在……下面'],
  between: ['bɪˈtwiːn', 'prep.', '在……之间'],
  you: ['juː', 'pron.', '你；你们', 'You can do it.'],
  i: ['aɪ', 'pron.', '我'],
  he: ['hiː', 'pron.', '他'],
  she: ['ʃiː', 'pron.', '她'],
  it: ['ɪt', 'pron.', '它'],
  we: ['wiː', 'pron.', '我们'],
  they: ['ðeɪ', 'pron.', '他们；她们；它们'],
  me: ['miː', 'pron.', '我（宾格）'],
  him: ['hɪm', 'pron.', '他（宾格）'],
  her: ['hɜːr', 'pron.', '她；她的'],
  us: ['ʌs', 'pron.', '我们（宾格）'],
  them: ['ðem', 'pron.', '他们；她们；它们（宾格）'],
  my: ['maɪ', 'det.', '我的'],
  your: ['jʊr', 'det.', '你的；你们的'],
  his: ['hɪz', 'det.', '他的'],
  its: ['ɪts', 'det.', '它的'],
  our: ['ˈaʊər', 'det.', '我们的'],
  their: ['ðer', 'det.', '他们的；她们的；它们的'],
  this: ['ðɪs', 'det./pron.', '这个'],
  that: ['ðæt', 'det./pron.', '那个；那'],
  these: ['ðiːz', 'det./pron.', '这些'],
  those: ['ðoʊz', 'det./pron.', '那些'],
  who: ['huː', 'pron.', '谁'],
  what: ['wʌt', 'pron.', '什么'],
  which: ['wɪtʃ', 'pron.', '哪一个；哪些'],
  when: ['wen', 'adv./conj.', '什么时候；当……时'],
  where: ['wer', 'adv.', '哪里'],
  why: ['waɪ', 'adv.', '为什么'],
  how: ['haʊ', 'adv.', '怎样；如何'],
  be: ['biː', 'v.', '是；存在', 'Be careful.'],
  am: ['æm', 'v.', '是（用于 I）'],
  is: ['ɪz', 'v.', '是（第三人称单数）'],
  are: ['ɑːr', 'v.', '是（复数/第二人称）'],
  was: ['wʌz', 'v.', '是（过去式单数）'],
  were: ['wɜːr', 'v.', '是（过去式复数）'],
  have: ['hæv', 'v.', '有；已经', 'I have a pen.'],
  has: ['hæz', 'v.', '有（第三人称单数）'],
  had: ['hæd', 'v.', '有（过去式）；已经'],
  do: ['duː', 'v.', '做；助动词', 'What do you do?'],
  does: ['dʌz', 'v.', '做（第三人称单数）；助动词'],
  did: ['dɪd', 'v.', '做（过去式）；助动词'],
  can: ['kæn', 'modal v.', '能；可以', 'I can swim.'],
  could: ['kʊd', 'modal v.', '能（过去式）；可以（委婉）'],
  will: ['wɪl', 'modal v.', '将；会'],
  would: ['wʊd', 'modal v.', '会；愿意（委婉）'],
  should: ['ʃʊd', 'modal v.', '应该'],
  may: ['meɪ', 'modal v.', '可以；可能'],
  might: ['maɪt', 'modal v.', '可能'],
  must: ['mʌst', 'modal v.', '必须'],
  know: ['noʊ', 'v.', '知道；认识', 'I know the answer.'],
  think: ['θɪŋk', 'v.', '想；认为'],
  say: ['seɪ', 'v.', '说'],
  tell: ['tel', 'v.', '告诉'],
  see: ['siː', 'v.', '看见；明白'],
  look: ['lʊk', 'v.', '看；看起来'],
  hear: ['hɪr', 'v.', '听见'],
  listen: ['ˈlɪsən', 'v.', '听'],
  come: ['kʌm', 'v.', '来'],
  go: ['ɡoʊ', 'v.', '去'],
  get: ['ɡet', 'v.', '得到；变得'],
  give: ['ɡɪv', 'v.', '给'],
  take: ['teɪk', 'v.', '拿；带走'],
  make: ['meɪk', 'v.', '做；使'],
  want: ['wɑːnt', 'v.', '想要'],
  need: ['niːd', 'v.', '需要'],
  like: ['laɪk', 'v./prep.', '喜欢；像'],
  love: ['lʌv', 'v.', '爱'],
  eat: ['iːt', 'v.', '吃'],
  drink: ['drɪŋk', 'v.', '喝'],
  sleep: ['sliːp', 'v.', '睡觉'],
  work: ['wɜːrk', 'v./n.', '工作；起作用'],
  play: ['pleɪ', 'v.', '玩；播放'],
  learn: ['lɜːrn', 'v.', '学习'],
  read: ['riːd', 'v.', '读'],
  write: ['raɪt', 'v.', '写'],
  buy: ['baɪ', 'v.', '买'],
  find: ['faɪnd', 'v.', '找到'],
  help: ['help', 'v./n.', '帮助'],
  wait: ['weɪt', 'v.', '等待'],
  try: ['traɪ', 'v.', '尝试'],
  ask: ['æsk', 'v.', '问；请求'],
  answer: ['ˈænsər', 'v./n.', '回答；答案'],
  call: ['kɔːl', 'v.', '打电话；称呼'],
  meet: ['miːt', 'v.', '遇见；会面'],
  live: ['lɪv', 'v.', '居住；生活'],
  run: ['rʌn', 'v.', '跑；运行'],
  walk: ['wɔːk', 'v.', '走'],
  sit: ['sɪt', 'v.', '坐'],
  stand: ['stænd', 'v.', '站；忍受'],
  turn: ['tɜːrn', 'v.', '转；变成'],
  move: ['muːv', 'v.', '移动；感动'],
  bring: ['brɪŋ', 'v.', '带来'],
  show: ['ʃoʊ', 'v.', '展示；表明'],
  feel: ['fiːl', 'v.', '感觉'],
  become: ['bɪˈkʌm', 'v.', '成为'],
  leave: ['liːv', 'v.', '离开；留下'],
  start: ['stɑːrt', 'v.', '开始'],
  stop: ['stɑːp', 'v.', '停止'],
  open: ['ˈoʊpən', 'v./adj.', '打开；开放的'],
  close: ['kloʊz', 'v./adj.', '关闭；接近的'],
  use: ['juːz', 'v.', '使用'],
  put: ['pʊt', 'v.', '放'],
  keep: ['kiːp', 'v.', '保持；保留'],
  let: ['let', 'v.', '让'],
  seem: ['siːm', 'v.', '似乎'],
  talk: ['tɔːk', 'v.', '谈话'],
  speak: ['spiːk', 'v.', '说话'],
  watch: ['wɑːtʃ', 'v./n.', '观看；手表'],
  remember: ['rɪˈmembər', 'v.', '记得'],
  forget: ['fərˈɡet', 'v.', '忘记'],
  understand: ['ˌʌndərˈstænd', 'v.', '理解'],
  mean: ['miːn', 'v.', '意思是；意味着'],
  happen: ['ˈhæpən', 'v.', '发生'],
  change: ['tʃeɪndʒ', 'v./n.', '改变'],
  grow: ['ɡroʊ', 'v.', '生长；变得'],
  good: ['ɡʊd', 'adj.', '好的', "That's a good idea."],
  bad: ['bæd', 'adj.', '坏的'],
  big: ['bɪɡ', 'adj.', '大的'],
  small: ['smɔːl', 'adj.', '小的'],
  new: ['nuː', 'adj.', '新的'],
  old: ['oʊld', 'adj.', '旧的；年老的'],
  easy: ['ˈiːzi', 'adj.', '容易的'],
  hard: ['hɑːrd', 'adj.', '难的；坚硬的'],
  happy: ['ˈhæpi', 'adj.', '开心的'],
  sad: ['sæd', 'adj.', '难过的'],
  enough: ['ɪˈnʌf', 'adj./adv.', '足够的；足够地', 'We have enough time.'],
  very: ['ˈveri', 'adv.', '非常'],
  too: ['tuː', 'adv.', '太；也'],
  also: ['ˈɔːlsoʊ', 'adv.', '也'],
  only: ['ˈoʊnli', 'adv.', '只有；仅仅'],
  just: ['dʒʌst', 'adv.', '刚刚；只是'],
  still: ['stɪl', 'adv.', '仍然；静止的'],
  well: ['wel', 'adv./adj.', '好；健康的'],
  again: ['əˈɡen', 'adv.', '再次'],
  always: ['ˈɔːlweɪz', 'adv.', '总是'],
  never: ['ˈnevər', 'adv.', '从不'],
  often: ['ˈɔːfən', 'adv.', '经常'],
  usually: ['ˈjuːʒuəli', 'adv.', '通常'],
  really: ['ˈriːəli', 'adv.', '真正地；确实'],
  quite: ['kwaɪt', 'adv.', '相当'],
  maybe: ['ˈmeɪbi', 'adv.', '也许'],
  please: ['pliːz', 'adv.', '请', 'Please sit down.'],
  sorry: ['ˈsɑːri', 'adj.', '抱歉的', 'I am sorry.'],
  thanks: ['θæŋks', 'n.', '谢谢'],
  hello: ['həˈloʊ', 'int.', '你好'],
  goodbye: ['ˌɡʊdˈbaɪ', 'int.', '再见'],
  yes: ['jes', 'adv.', '是；是的'],
  no: ['noʊ', 'adv.', '不；没有'],
  not: ['nɑːt', 'adv.', '不'],
  // 缩写、缩略形式与固定简称：点得到，也查得出
  "don't": ['doʊnt', 'contraction', '不；不要（do not 的缩写）'],
  "doesn't": ['ˈdʌzənt', 'contraction', '不（does not 的缩写）'],
  "didn't": ['ˈdɪdənt', 'contraction', '没有；没做（did not 的缩写）'],
  "can't": ['kænt', 'contraction', '不能（cannot 的缩写）'],
  "couldn't": ['ˈkʊdənt', 'contraction', '不能；没能（could not 的缩写）'],
  "won't": ['woʊnt', 'contraction', '不会（will not 的缩写）'],
  "wouldn't": ['ˈwʊdənt', 'contraction', '不会；不愿（would not 的缩写）'],
  "shouldn't": ['ˈʃʊdənt', 'contraction', '不应该（should not 的缩写）'],
  "isn't": ['ˈɪzənt', 'contraction', '不是（is not 的缩写）'],
  "aren't": ['ɑːrnt', 'contraction', '不是（are not 的缩写）'],
  "wasn't": ['ˈwʌzənt', 'contraction', '不是（was not 的缩写）'],
  "weren't": ['wɜːrnt', 'contraction', '不是（were not 的缩写）'],
  "haven't": ['ˈhævənt', 'contraction', '还没有（have not 的缩写）'],
  "hasn't": ['ˈhæzənt', 'contraction', '还没有（has not 的缩写）'],
  "hadn't": ['ˈhædənt', 'contraction', '还没有（had not 的缩写）'],
  "i'm": ['aɪm', 'contraction', '我是（I am 的缩写）'],
  "i've": ['aɪv', 'contraction', '我已经（I have 的缩写）'],
  "i'll": ['aɪl', 'contraction', '我将（I will 的缩写）'],
  "i'd": ['aɪd', 'contraction', '我会；我想（I would / I had 的缩写）'],
  "you're": ['jʊr', 'contraction', '你是（you are 的缩写）'],
  "you've": ['juːv', 'contraction', '你已经（you have 的缩写）'],
  "you'll": ['juːl', 'contraction', '你将（you will 的缩写）'],
  "you'd": ['juːd', 'contraction', '你会（you would 的缩写）'],
  "he's": ['hiːz', 'contraction', '他是；他有（he is / he has 的缩写）'],
  "she's": ['ʃiːz', 'contraction', '她是；她有（she is / she has 的缩写）'],
  "it's": ['ɪts', 'contraction', '它是；它已经（it is / it has 的缩写）'],
  "that's": ['ðæts', 'contraction', '那是（that is 的缩写）'],
  "there's": ['ðerz', 'contraction', '有；那儿是（there is 的缩写）'],
  "we're": ['wɪr', 'contraction', '我们是（we are 的缩写）'],
  "we've": ['wiːv', 'contraction', '我们已经（we have 的缩写）'],
  "we'll": ['wiːl', 'contraction', '我们将（we will 的缩写）'],
  "they're": ['ðer', 'contraction', '他们是（they are 的缩写）'],
  "they've": ['ðeɪv', 'contraction', '他们已经（they have 的缩写）'],
  "they'll": ['ðeɪl', 'contraction', '他们将会（they will 的缩写）'],
  "let's": ['lets', 'contraction', '让我们（let us 的缩写）'],
  "who's": ['huːz', 'contraction', '谁是（who is 的缩写）'],
  "what's": ['wʌts', 'contraction', '什么是（what is 的缩写）'],
  "where's": ['werz', 'contraction', '哪里是（where is 的缩写）'],
  "how's": ['haʊz', 'contraction', '怎么样（how is 的缩写）'],
  "here's": ['hɪrz', 'contraction', '这里是（here is 的缩写）'],
  'mr': ['ˈmɪstər', 'abbr.', '先生（Mister 的缩写）'],
  'mrs': ['ˈmɪsɪz', 'abbr.', '夫人；太太（Missus 的缩写）'],
  'ms': ['mɪz', 'abbr.', '女士（不指明婚否）'],
  'dr': ['ˈdɑːktər', 'abbr.', '博士；医生（Doctor 的缩写）'],
  'st': ['striːt', 'abbr.', '街（Street 的缩写）'],
  'etc': ['etˈsetərə', 'abbr.', '等等（et cetera 的缩写）'],
  'e.g.': ['ˌiːˈdʒiː', 'abbr.', '例如（for example）'],
  'i.e.': ['ˌaɪˈiː', 'abbr.', '也就是说（that is）'],
  'vs': ['ˈvɜːrsəs', 'abbr.', '对；与……相比（versus 的缩写）'],
  'aka': ['ˌeɪkeɪˈeɪ', 'abbr.', '又名（also known as 的缩写）'],
  'asap': ['ˌeɪes eɪˈpiː', 'abbr.', '尽快（as soon as possible 的缩写）'],
  'u.s.': ['ˌjuːˈes', 'abbr.', '美国（United States 的缩写）'],
  'u.k.': ['ˌjuːˈkeɪ', 'abbr.', '英国（United Kingdom 的缩写）'],
  'uk': ['ˌjuːˈkeɪ', 'abbr.', '英国（United Kingdom 的缩写）'],
  'usa': ['ˌjuːesˈeɪ', 'abbr.', '美国（United States of America 的缩写）'],
  'ai': ['ˌeɪˈaɪ', 'abbr.', '人工智能（artificial intelligence 的缩写）'],
  'app': ['æp', 'n.', '应用程序（application 的缩写）'],
  'tv': ['ˌtiːˈviː', 'abbr.', '电视（television 的缩写）'],
  'ok': ['ˌoʊˈkeɪ', 'adj./adv.', '好；可以（okay 的缩写）'],
  'faq': ['ˌef eɪ ˈkjuː', 'abbr.', '常见问题（frequently asked questions）'],
  'gps': ['ˌdʒiː piː ˈes', 'abbr.', '全球定位系统'],
  'pdf': ['ˌpiː diː ˈef', 'abbr.', '便携式文档格式'],
  'id': ['ˌaɪˈdiː', 'abbr.', '身份；标识号（identification 的缩写）'],
};

// 每个预存词都配一句很短、能独立看懂的例句，避免本地词条点开没有例句。
const BASIC_EXAMPLES = {
  the: 'The book is on the table.',
  a: 'I saw a bird.',
  an: 'She ate an apple.',
  and: 'You and I.',
  or: 'Tea or coffee?',
  but: 'I am tired, but happy.',
  if: 'If it rains, we will stay.',
  because: 'I stayed because it rained.',
  so: 'It was late, so we went home.',
  of: 'A cup of tea.',
  to: 'I want to go.',
  in: 'She is in the room.',
  on: 'The book is on the desk.',
  at: 'Meet me at the station.',
  for: 'This gift is for you.',
  with: 'Come with me.',
  from: 'I am from China.',
  by: 'I go to school by bus.',
  about: 'We talked about the film.',
  as: 'She works as a teacher.',
  into: 'He walked into the room.',
  over: 'The plane flew over the city.',
  after: 'We left after lunch.',
  before: 'Wash your hands before dinner.',
  under: 'The cat is under the table.',
  between: 'Sit between us.',
  you: 'You can do it.',
  i: 'I am ready.',
  he: 'He is my friend.',
  she: 'She likes music.',
  it: 'It is cold today.',
  we: 'We are ready.',
  they: 'They are at home.',
  me: 'Please call me.',
  him: 'I saw him yesterday.',
  her: 'I gave her a book.',
  us: 'Come with us.',
  them: 'I know them.',
  my: 'This is my book.',
  your: 'Your bag is here.',
  his: 'His car is new.',
  its: 'The dog moved its tail.',
  our: 'Our class is small.',
  their: 'Their house is big.',
  this: 'This is my seat.',
  that: 'That is a good idea.',
  these: 'These are my books.',
  those: 'Those are my friends.',
  who: 'Who is at the door?',
  what: 'What do you want?',
  which: 'Which one do you like?',
  when: 'When does it start?',
  where: 'Where are you?',
  why: 'Why are you late?',
  how: 'How does it work?',
  be: 'Be careful.',
  am: 'I am a student.',
  is: 'She is happy.',
  are: 'They are here.',
  was: 'It was cold yesterday.',
  were: 'We were late.',
  have: 'I have a pen.',
  has: 'She has a cat.',
  had: 'We had lunch.',
  do: 'What do you do?',
  does: 'Does he know?',
  did: 'I did my homework.',
  can: 'I can swim.',
  could: 'Could you help me?',
  will: 'I will call you.',
  would: 'Would you like tea?',
  should: 'You should rest.',
  may: 'May I come in?',
  might: 'It might rain.',
  must: 'You must be careful.',
  know: 'I know the answer.',
  think: 'I think you are right.',
  say: 'Say it again.',
  tell: 'Tell me the truth.',
  see: 'I can see the sea.',
  look: 'Look at the sky.',
  hear: 'I hear a bird.',
  listen: 'Listen to me.',
  come: 'Come here.',
  go: 'Let us go home.',
  get: 'Get some water.',
  give: 'Give me a pen.',
  take: 'Take your time.',
  make: 'Make a wish.',
  want: 'I want some water.',
  need: 'We need your help.',
  like: 'I like this song.',
  love: 'I love my family.',
  eat: 'We eat at noon.',
  drink: 'Drink some water.',
  sleep: 'I sleep at ten.',
  work: 'They work here.',
  play: 'The kids play outside.',
  learn: 'We learn English.',
  read: 'I read every day.',
  write: 'Write your name.',
  buy: 'I want to buy a book.',
  find: 'I cannot find my key.',
  help: 'Can you help me?',
  wait: 'Wait for me.',
  try: 'Try again.',
  ask: 'Ask the teacher.',
  answer: 'Answer the question.',
  call: 'Call me later.',
  meet: 'Nice to meet you.',
  live: 'I live in Fushun.',
  run: 'Do not run here.',
  walk: 'We walk to school.',
  sit: 'Please sit down.',
  stand: 'Stand up, please.',
  turn: 'Turn left here.',
  move: 'Move the chair.',
  bring: 'Bring your book.',
  show: 'Show me the way.',
  feel: 'I feel happy.',
  become: 'She wants to become a doctor.',
  leave: 'Leave the door open.',
  start: 'Start the car.',
  stop: 'Stop talking.',
  open: 'Open the window.',
  close: 'Close the door.',
  use: 'Use this pen.',
  put: 'Put it on the desk.',
  keep: 'Keep the change.',
  let: 'Let me help.',
  seem: 'You seem tired.',
  talk: 'We talk every day.',
  speak: 'She can speak English.',
  watch: 'We watch a film.',
  remember: 'Remember my name.',
  forget: 'Do not forget your keys.',
  understand: 'I understand you.',
  mean: 'What does it mean?',
  happen: 'What happened here?',
  change: 'Change your clothes.',
  grow: 'Plants grow fast.',
  good: 'That is a good idea.',
  bad: 'The weather is bad.',
  big: 'This room is big.',
  small: 'The box is small.',
  new: 'I have a new phone.',
  old: 'This is an old book.',
  easy: 'The test was easy.',
  hard: 'The work is hard.',
  happy: 'I am happy today.',
  sad: 'She looks sad.',
  enough: 'We have enough time.',
  very: 'It is very cold.',
  too: 'It is too hot.',
  also: 'She also likes tea.',
  only: 'I only have one.',
  just: 'I just arrived.',
  still: 'He is still here.',
  well: 'She sings well.',
  again: 'Say it again.',
  always: 'He is always late.',
  never: 'I never smoke.',
  often: 'We often meet.',
  usually: 'I usually walk.',
  really: 'I really like it.',
  quite: 'It is quite late.',
  maybe: 'Maybe he knows.',
  please: 'Please sit down.',
  sorry: 'I am sorry.',
  thanks: 'Thanks for your help.',
  hello: 'Hello, how are you?',
  goodbye: 'Goodbye, see you.',
  yes: 'Yes, I agree.',
  no: 'No, thank you.',
  not: 'I am not ready.',
};

function basicEntry(word) {
  const row = Object.prototype.hasOwnProperty.call(BASIC_WORDS, word) ? BASIC_WORDS[word] : null;
  if (!row) return null;
  return {
    word,
    phonetic: row[0],
    entries: [{ pos: row[1], def: row[2] }],
    example: row[3] || BASIC_EXAMPLES[word] || '',
  };
}

const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function cacheKey(word, ctx) {
  return `${word}|${String(ctx || '').slice(0, 90)}`;
}

function readCache(key) {
  if (CACHE.has(key)) return CACHE.get(key);
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.word) { CACHE.set(key, d); return d; }
    }
  } catch (_) {}
  return null;
}

function writeCache(key, data) {
  CACHE.set(key, data);
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(data)); } catch (_) {}
}

function ensurePop() {
  if (pop) return;
  const old = document.getElementById('dictPop');
  if (old) old.remove();
  pop = document.createElement('div');
  pop.id = 'dictPop';
  pop.className = 'dict-pop';
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  pop.innerHTML = `
    <div class="dp-head">
      <span class="dp-word"></span>
      <span class="dp-phon"></span>
    </div>
    <div class="dp-body"></div>`;
  document.body.appendChild(pop);
  popWord = pop.querySelector('.dp-word');
  popPhon = pop.querySelector('.dp-phon');
  popBody = pop.querySelector('.dp-body');

  // 点空白处关闭；点另一个单词时直接换内容，不叠第二个框。
  document.addEventListener('click', (e) => {
    if (pop.hidden) return;
    if (e.target.closest('#dictPop') || e.target.closest('.dict-word') || e.target.closest('.c-mol')) return;
    closePop();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePop();
  });
  window.addEventListener('scroll', () => { if (!pop.hidden) closePop(); }, true);
  window.addEventListener('resize', () => { if (!pop.hidden) closePop(); });
}

function closePop() {
  if (!pop || pop.hidden) return;
  clearTimeout(closeTimer);
  pop.classList.remove('show');
  pop.classList.add('closing');
  closeTimer = setTimeout(() => {
    if (!pop || !pop.classList.contains('closing')) return;
    pop.hidden = true;
    pop.classList.remove('closing');
  }, 180);
  activeEl = null;
  seq++;
}

const sideFor = new WeakMap();

function positionPop(el, animate = true) {
  const r = el.getBoundingClientRect();
  // 词被折叠/临时隐藏时 rect 会变成 0，以前会照着 0 算，
  // 弹窗就飞到屏幕左上角。这时保持原位，等元素重新可见再跟。
  if (!r.width || !r.height) return;
  const pad = 10;
  clearTimeout(closeTimer);
  pop.classList.remove('closing');
  pop.style.left = '0px';
  pop.style.top = '0px';
  pop.style.width = '176px';
  pop.hidden = false;
  pop.classList.add('measuring');
  if (animate) pop.classList.remove('show');
  void pop.offsetWidth;
  const maxW = Math.min(244, window.innerWidth - pad * 2);
  const w = chooseWidth(maxW);
  pop.style.width = `${w}px`;
  const ph = pop.offsetHeight;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(pad, Math.min(window.innerWidth - w - pad, left));
  // 同一个词先出骨架再出释义，两次高度不同就会「翻面」弹到上方，看着像重排了一次。
  // 记住第一次定下的朝向，同一个词后面不再改。
  let side = sideFor.get(el);
  if (!side) {
    side = r.bottom + 8 + ph > window.innerHeight - pad ? 'bottom' : 'top';
    sideFor.set(el, side);
  }
  let top = side === 'bottom' ? r.top - ph - 8 : r.bottom + 8;
  top = Math.max(pad, Math.min(window.innerHeight - ph - pad, top));
  const wordCenter = r.left + r.width / 2;
  const arrowX = Math.max(14, Math.min(w - 14, wordCenter - left));
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
  pop.style.setProperty('--arrow-x', `${Math.round(arrowX)}px`);
  pop.dataset.side = side;
  pop.style.transformOrigin = `${Math.round(arrowX)}px ${side === 'bottom' ? 'bottom' : 'top'}`;
  pop.classList.remove('measuring');
  void pop.offsetWidth;
  pop.classList.add('show');
}

function lineRects(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  return Array.from(range.getClientRects()).filter(r => r.width > 0.5 && r.height > 0.5);
}

// 在可用宽度里找一个不出现“末行只剩一个字”的排版，同时避免气泡过窄。
function chooseWidth(maxW) {
  const minW = Math.min(176, maxW);
  let best = { w: minW, score: Infinity };
  for (let w = minW; w <= maxW; w += 2) {
    pop.style.width = `${w}px`;
    let orphan = 0;
    let lines = 0;
    pop.querySelectorAll('.dp-def').forEach((el) => {
      const rects = lineRects(el);
      const n = Math.max(1, rects.length);
      lines += n;
      if (n > 1) {
        const fs = parseFloat(getComputedStyle(el).fontSize) || 15;
        const last = rects[rects.length - 1].width / fs;
        if (last < 1.35) orphan += 2;
        else if (last < 2.1) orphan += 0.35;
      }
    });
    const score = orphan * 100 + lines * 2 + w * 0.03;
    if (score < best.score) best = { w, score };
  }
  pop.style.width = `${best.w}px`;
  return pop.offsetWidth || best.w;
}

// 内容换上去时重放一次模糊浮现：词头先清，释义逐行跟上
function replayReveal() {
  if (!pop) return;
  pop.classList.remove('dp-swap');
  void pop.offsetWidth;
  pop.classList.add('dp-swap');
}

function renderPop(data, error) {
  if (pop) pop.classList.remove('chem');
  popWord.textContent = data && data.word ? data.word : '';
  const phon = data && data.phonetic ? String(data.phonetic).trim() : '';
  popPhon.textContent = phon ? `/${phon.replace(/^\/|\/$/g, '')}/` : '';
  popBody.innerHTML = '';
  if (error) {
    const p = document.createElement('div');
    p.className = 'dp-empty';
    p.textContent = '词库暂时没连上，等会儿再点一次。';
    popBody.appendChild(p);
    replayReveal();
    return;
  }
  const entries = (data && Array.isArray(data.entries)) ? data.entries : [];
  if (!entries.length) {
    const p = document.createElement('div');
    p.className = 'dp-empty';
    p.textContent = '没查到释义，换一个词试试。';
    popBody.appendChild(p);
    replayReveal();
    return;
  }
  // 同词性的两条短释义合成一行；短义不上下堆两行，避免框里空一块。
  const compact = [];
  for (const it of entries.slice(0, 3)) {
    const pos = String(it.pos || '');
    const def = String(it.def || '').trim();
    if (!def) continue;
    const prev = compact[compact.length - 1];
    if (prev && (prev.pos === pos || (prev.def.length + def.length) <= 16) && (prev.def.length + def.length) <= 18) {
      prev.def += `；${def}`;
      if (pos && prev.pos !== pos) prev.pos = prev.pos ? `${prev.pos}/${pos}` : pos;
    } else {
      compact.push({ pos, def });
    }
  }
  compact.slice(0, 2).forEach((it) => {
    const row = document.createElement('div');
    row.className = 'dp-row';
    if (it.pos) {
      const pos = document.createElement('span');
      pos.className = 'dp-pos';
      pos.textContent = it.pos;
      row.appendChild(pos);
    }
    const def = document.createElement('span');
    def.className = 'dp-def';
    def.textContent = it.def || '';
    row.appendChild(def);
    popBody.appendChild(row);
  });
  const example = data && data.example ? String(data.example).trim() : '';
  if (example) {
    const ex = document.createElement('div');
    ex.className = 'dp-ex';
    ex.textContent = example;
    popBody.appendChild(ex);
  }
  replayReveal();
}

function contextOf(el, word) {
  const block = el.closest('p,li,blockquote,td,.text,.body,.msg') || el.parentElement;
  let text = block ? String(block.textContent || '') : '';
  text = text.replace(/\s+/g, ' ').trim();
  const idx = text.toLowerCase().indexOf(String(word || '').toLowerCase());
  if (idx < 0) return text.slice(0, 180);
  return text.slice(Math.max(0, idx - 72), Math.min(text.length, idx + String(word).length + 96));
}

// 同一个词+同一句话只发一次请求：预取和点击共用这份 promise
const INFLIGHT = new Map();

function fetchEntry(word, ctx) {
  const key = `${word}\u0000${ctx || ''}`;
  const hit = INFLIGHT.get(key);
  if (hit) return hit;
  const p = (async () => {
    const r = await fetch(`/api/dict?word=${encodeURIComponent(word)}&ctx=${encodeURIComponent(ctx || '')}`);
    const d = await r.json();
    if (!r.ok) throw new Error('dict_failed');
    return d;
  })();
  INFLIGHT.set(key, p);
  // 成功才写缓存；无论成败都清掉在飞记录，失败可以重试
  p.then((d) => { writeCache(cacheKey(word, ctx), d); }, () => {}).then(() => {
    setTimeout(() => INFLIGHT.delete(key), 4000);
  });
  return p;
}

// 手指一碰单词就先发请求，等 click 真正触发时结果基本已经到了
export function prefetchWord(raw, el) {
  const w = normWord(String(raw || ''));
  if (!w || basicEntry(w) || readCache(cacheKey(w, contextOf(el, w)))) return;
  try { fetchEntry(w, contextOf(el, w)); } catch (_) {}
}

async function lookup(word, el, ctx) {
  const my = ++seq;
  const key = cacheKey(word, ctx);
  const basic = basicEntry(word);
  if (basic) {
    if (activeEl !== el) return;
    renderPop(basic);
    positionPop(el);
    return;
  }
  const cached = readCache(key);
  if (cached) {
    if (activeEl !== el) return;
    renderPop(cached);
    positionPop(el);
    return;
  }
  renderPop({ word, entries: [] });
  popBody.innerHTML = '<div class="dp-loading"><i></i><i></i><i></i></div>';
  positionPop(el);
  try {
    const d = await fetchEntry(word, ctx);
    if (my !== seq || activeEl !== el) return;
    renderPop(d);
  } catch (_) {
    if (my !== seq || activeEl !== el) return;
    renderPop({ word, entries: [] }, true);
  }
  positionPop(el, false);
}

function showFor(el, word) {
  ensurePop();
  activeEl = el;
  const w = normWord(String(word || ''));
  lookup(w, el, contextOf(el, w));
}

// 统一词形：弯引号拉直、句末句点去掉，但保留 U.S. / e.g. 这种内部缩略点
function normWord(raw) {
  let w = String(raw || '').replace(/[’‘]/g, "'");
  if (w.endsWith('.') && !/\./.test(w.slice(0, -1))) w = w.slice(0, -1);
  return w.toLowerCase();
}

function wrapText(node) {
  const s = node.nodeValue || '';
  // 允许词内点号：U.S. / e.g. / i.e. 也能整体成词
  const re = /[A-Za-z]+(?:[.'’\-][A-Za-z]+)*\.?/g;
  let m;
  let last = 0;
  let frag = null;
  while ((m = re.exec(s))) {
    let token = normWord(m[0]);
    // 不要把 URL/邮箱里的片段、结尾连字符当词
    const before = s[m.index - 1] || '';
    const after = s[m.index + m[0].length] || '';
    if (/[/@]/.test(before) || /[/@]/.test(after)) continue;
    token = token.replace(/['\-]+$/, '');
    if (token.length < 2 && token !== 'I' && token !== 'a') continue;
    const start = m.index;
    // 高亮范围跟着原词走，不要吃掉后面独立的一句句号
    const rawLen = /\.$/.test(m[0]) && !/\./.test(m[0].slice(0, -1)) ? m[0].length - 1 : m[0].length;
    const end = start + rawLen;
    if (!frag) frag = document.createDocumentFragment();
    if (start > last) frag.appendChild(document.createTextNode(s.slice(last, start)));
    const span = document.createElement('span');
    span.className = 'dict-word';
    span.dataset.w = token;
    span.textContent = s.slice(start, end);
    span.setAttribute('role', 'button');
    span.setAttribute('tabindex', '0');
    frag.appendChild(span);
    last = end;
  }
  if (!frag) return;
  if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
  node.replaceWith(frag);
}

export function annotateEnglish(root) {
  if (!root || getLang() !== 'zh') return root;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (p.closest('script,style,code,pre,textarea,input,select,option,button,a,label,svg,.dict-word,.dict-pop,.m-math,.m-chem,[data-no-dict]')) {
        return NodeFilter.FILTER_REJECT;
      }
      return /[A-Za-z]/.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  let count = 0;
  for (const node of nodes) {
    if (count >= 600) break;
    const before = node.nodeValue || '';
    wrapText(node);
    count += Math.max(1, (before.match(/[A-Za-z]+(?:[.'’\-][A-Za-z]+)*/g) || []).length);
  }
  return root;
}

/* ---------- 化学式点词：底部抽屉（明轩 2026-10-30 重做） ----------
   以前借用英文点词的小气泡，问题一串：max-height 220px 装不下性质就被裁、任何 scroll 都关窗（点了就消失）、
   标题把化学式和名字并排显示（同一个式子念两遍）、没有关闭手势、也没有动画。
   现在单独做一块底部抽屉：底部点线 + 下滑收起 + 内容自己滚 + 逐条淡入，查不到还能原地重试。 */
const CHEMQ = new Map();
const chemKey = (f, st) => `${f}|${st || ''}`;

function chemCacheGet(key) {
  if (CHEMQ.has(key)) return CHEMQ.get(key);
  try {
    const raw = localStorage.getItem('minxtok.chem.v1:' + key);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.formula && (d.phys || d.chem)) { CHEMQ.set(key, d); return d; }
    }
  } catch (_) {}
  return null;
}

function chemCacheSet(key, d) {
  CHEMQ.set(key, d);
  try { localStorage.setItem('minxtok.chem.v1:' + key, JSON.stringify(d)); } catch (_) {}
}

const chemEn = () => getLang() === 'en';

/* 上/下标转 ASCII：正文里写的是 Fe²⁺、SO₄²⁻，后端只认 Fe2+、SO42-。
   以前直接把这串 unicode 塞给 /api/chem，正则不认，回 400，看着就是「查不到」。 */
const SUP2ASCII = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-', '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
// 上下标归一成 ASCII（服务端速查表的 key 是 Na2CO3 这种写法）；
// 顺带收拾全角括号、全角加减号、各种间隔点和配平系数，别让一个字符对不上就查不到
const chemInput = (raw) => String(raw || '')
  .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻₀₁₂₃₄₅₆₇₈₉]/g, c => SUP2ASCII[c] || c)
  .replace(/[（）]/g, c => (c === '（' ? '(' : ')'))
  .replace(/[＋]/g, '+').replace(/[－−–—]/g, '-')
  .replace(/[•‧∙⋅∙]/g, '·')
  .replace(/[↑↓\s"]/g, '')
  .replace(/^\d+(?=[A-Z(])/, '');

/* 设置里可以整体关掉化学式点词（明轩 2026-10-30） */
const chemTapOn = () => localStorage.getItem('minxtok.chemtap') !== '0';

/* 常见元素的常见化合价：中学够用了。点开一个式子，先把「谁几价」摆出来，
   总纲写清楚，比让学生自己猜强。 */
const VALENCE = {
  H: '+1（与活泼金属成盐时 −1）', Li: '+1', Na: '+1', K: '+1', Ag: '+1',
  Mg: '+2', Ca: '+2', Ba: '+2', Zn: '+2', Cu: '+1、+2', Fe: '+2、+3',
  Al: '+3', Mn: '+2、+4、+6、+7', Cr: '+3、+6', Si: '+4',
  C: '−4、+2、+4', N: '−3、+1、+2、+3、+4、+5', P: '−3、+3、+5',
  O: '−2（过氧化物中 −1）', S: '−2、+4、+6',
  F: '−1', Cl: '−1、+1、+3、+5、+7', Br: '−1', I: '−1',
};
// 原子团整体带电量
const RADICAL = {
  OH: '−1', NO3: '−1', HCO3: '−1', MnO4: '−1', ClO4: '−1', HSO4: '−1',
  SO4: '−2', CO3: '−2', SiO3: '−2', MnO4_2: '−2', CrO4: '−2', Cr2O7: '−2',
  PO4: '−3', NH4: '+1',
};

function elementsOf(formula) {
  const f = String(formula || '').replace(/[↑↓\s"]/g, '');
  const out = [];
  const re = /([A-Z][a-z]?)/g;
  let m;
  while ((m = re.exec(f))) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

function valenceRows(formula) {
  const f = String(formula || '');
  const rows = [];
  // 先看有没有原子团：整体带电量比拆开写更好懂，拆开反而罗嗦（OH⁻ 比 O、H 各列一遍清楚）
  let rad = null;
  for (const key of Object.keys(RADICAL)) {
    const name = key.replace('_2', '');
    if (f.includes(name)) { rad = { name, v: RADICAL[key], els: elementsOf(name) }; break; }
  }
  if (rad) rows.push([rad.name, rad.v]);
  for (const el of elementsOf(f)) {
    if (rad && rad.els.includes(el)) continue;
    if (VALENCE[el]) rows.push([el, VALENCE[el]]);
  }
  return rows;
}

let sheet = null, csBody = null, csHead = null, csTags = null, csRetry = null, csTimer = 0;
let csAt = 0, csDrag = null;

function ensureChemSheet() {
  if (sheet) return sheet;
  const old = document.getElementById('chemSheet');
  if (old) old.remove();
  sheet = document.createElement('div');
  sheet.id = 'chemSheet';
  sheet.className = 'chem-sheet';
  sheet.hidden = true;
  sheet.innerHTML = `
    <div class="cs-mask"></div>
    <div class="cs-card" role="dialog" aria-modal="true">
      <div class="cs-grip"><i></i></div>
      <div class="cs-head">
        <div class="cs-title"><span class="cs-formula"></span><span class="cs-name"></span></div>
      </div>
      <div class="cs-tags"></div>
      <div class="cs-body"></div>
    </div>`;
  document.body.appendChild(sheet);
  csHead = sheet.querySelector('.cs-head');
  csBody = sheet.querySelector('.cs-body');
  csTags = sheet.querySelector('.cs-tags');
  csRetry = null;
  const card = sheet.querySelector('.cs-card');

  sheet.querySelector('.cs-mask').addEventListener('click', () => closeChemSheet());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeChemSheet(); });

  // 下滑收起：只在内容滚到顶部时接管，否则跟正常滚动打架
  let dy = 0, dragging = false;
  card.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.cs-body') && csBody.scrollTop > 0) return;
    dragging = true; dy = 0; csDrag = { y: e.clientY };
    card.style.transition = 'none';
  });
  card.addEventListener('pointermove', (e) => {
    if (!dragging || !csDrag) return;
    dy = e.clientY - csDrag.y;
    if (dy > 0) {
      if (dy > 4) e.preventDefault();
      card.style.transform = `translateY(${dy * 0.9}px)`;
      // 往下拖时遮罩跟着变淡，松手没拖够就弹回去
      const mask = sheet.querySelector('.cs-mask');
      if (mask) mask.style.opacity = String(Math.max(0, 1 - dy / 260));
    }
  });
  const up = () => {
    if (!dragging) return;
    dragging = false; csDrag = null;
    card.style.transition = '';
    card.style.transform = '';
    const mask = sheet.querySelector('.cs-mask');
    if (mask) mask.style.opacity = '';
    if (dy > 84) closeChemSheet();
    dy = 0;
  };
  card.addEventListener('pointerup', up);
  card.addEventListener('pointercancel', up);
  return sheet;
}

function closeChemSheet() {
  if (!sheet || sheet.hidden) return;
  sheet.classList.remove('show');
  csAt = 0;
  clearTimeout(csTimer);
  csTimer = setTimeout(() => { if (sheet && !sheet.classList.contains('show')) sheet.hidden = true; }, 300);
}

function openChemSheet() {
  ensureChemSheet();
  clearTimeout(csTimer);
  sheet.hidden = false;
  sheet.classList.remove('show');
  void sheet.offsetWidth;
  sheet.classList.add('show');
  csAt = Date.now();
}

function csRow(label) {
  const row = document.createElement('div');
  row.className = 'cs-row';
  if (label) {
    const l = document.createElement('div');
    l.className = 'cs-sec';
    l.textContent = label;
    row.appendChild(l);
  }
  const t = document.createElement('div');
  t.className = 'cs-text';
  row.appendChild(t);
  return { row, text: t };
}

// 标题只出现一次：名字和式子一样时，就别把式子再念一遍
function setChemHead(d) {
  const formula = String((d && (d.display || d.formula)) || '');
  let name = String((d && d.name) || '').trim();
  if (name === formula) name = '';
  sheet.querySelector('.cs-formula').textContent = formula;
  const nm = sheet.querySelector('.cs-name');
  nm.textContent = name;
  nm.hidden = !name;
}

function renderChemSheet(data, error) {
  openChemSheet();
  const d = data || {};
  setChemHead(d);
  csTags.innerHTML = '';
  csBody.innerHTML = '';
  csRetry = null;

  const f = String(d.formula || '').replace(/[↑↓\s"]/g, '');
  if (d.state) {
    const chip = document.createElement('span');
    chip.className = 'cs-chip';
    chip.textContent = d.state;
    csTags.appendChild(chip);
  }
  // 价态：元素 + 原子团，点开式子就能顺手看见
  for (const [k, v] of valenceRows(f)) {
    const chip = document.createElement('span');
    chip.className = 'cs-chip cs-chip-v';
    // 原子团的名字也要下标：SO4 显示成 SO₄，不然「有的 4 没变下标」（明轩 2026-10-30）
    chip.innerHTML = `<b>${chemPretty(k)}</b>${escHtml(v)}`;
    csTags.appendChild(chip);
  }
  csTags.hidden = !csTags.children.length;

  if (error) {
    const box = document.createElement('div');
    box.className = 'cs-empty';
    box.textContent = error === 'auth'
      ? (chemEn() ? 'Your session expired. Reload the page and tap again.' : '登录状态过期了，刷新一下页面再点。')
      : (chemEn() ? 'Could not reach the lookup. Tap to try again.' : '这次没连上，点一下重试。');
    csBody.appendChild(box);
    if (error === 'auth') { replayChemIn(); return; }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cs-retry';
    btn.textContent = chemEn() ? 'Try again' : '重新查一次';
    btn.addEventListener('click', () => {
      const el = activeChem;
      if (el) lookupChem(el, true);
    });
    csBody.appendChild(btn);
    csRetry = btn;
    replayChemIn();
    return;
  }

  if (d.phys) { const r = csRow(chemEn() ? 'Physical' : '物理性质'); r.text.textContent = d.phys; csBody.appendChild(r.row); }
  if (d.chem) {
    const r = csRow(chemEn() ? 'Chemical' : '化学性质');
    r.text.innerHTML = chemTextHtml(d.chem);
    csBody.appendChild(r.row);
  }
  if (d.note) { const r = csRow(chemEn() ? 'Note' : '补充'); r.text.textContent = d.note; csBody.appendChild(r.row); }
  if (!d.phys && !d.chem) {
    const box = document.createElement('div');
    box.className = 'cs-empty';
    box.textContent = chemEn() ? 'Nothing found for this one yet.' : '这个式子还没收录，换个写法试试。';
    csBody.appendChild(box);
  }
  replayChemIn();
}

// 化学式也用查词那套小对话框（明轩 2026-10-30 要求回到英语同款，不再另开底部抽屉）
function chemRow(label, text, asHtml) {
  const row = document.createElement('div');
  row.className = 'dp-crow';
  if (label) {
    const p = document.createElement('div');
    p.className = 'dp-pos';
    p.textContent = label;
    row.appendChild(p);
  }
  const d = document.createElement('div');
  d.className = 'dp-def';
  if (asHtml) d.innerHTML = text;
  else d.textContent = text;
  row.appendChild(d);
  return row;
}

function renderChemPop(data, error) {
  ensurePop();
  const d = data || {};
  const zh = getLang() !== 'en';
  const f = String(d.formula || '').replace(/[↑↓\s"]/g, '');
  const display = d.display || chemPretty(f);
  pop.classList.add('chem');
  popWord.textContent = display || '';
  let name = String(d.name || '').trim();
  if (!name || name === f || name === display) name = '';
  const st = String(d.state || '').trim();
  popPhon.textContent = [name, st].filter(Boolean).join(' · ');
  popBody.innerHTML = '';

  if (error) {
    const box = document.createElement('div');
    box.className = 'dp-empty';
    box.textContent = error === 'auth'
      ? (zh ? '登录状态过期了，刷新一下再点。' : 'Session expired. Reload and tap again.')
      : (zh ? '这次没连上，点这里重试。' : 'Could not reach the lookup. Tap to retry.');
    box.setAttribute('role', 'button');
    if (error !== 'auth') {
      box.addEventListener('click', () => { const el = activeChem; if (el) lookupChem(el, true); });
    }
    popBody.appendChild(box);
    replayReveal();
    return;
  }

  // 一段话说完：不分物理化学、不带方程式，整块展开不滚动
  const desc = String(d.desc || d.phys || '').trim();
  if (desc) {
    const row = document.createElement('div');
    row.className = 'dp-row';
    const def = document.createElement('div');
    def.className = 'dp-def';
    def.textContent = desc;
    row.appendChild(def);
    popBody.appendChild(row);
  } else {
    const box = document.createElement('div');
    box.className = 'dp-empty';
    box.innerHTML = `<span class="m-thinking"><span class="th-label">${zh ? '正在查这个式子' : 'Looking this one up'}</span><span class="th-dots"><i></i><i></i><i></i></span></span>`;
    popBody.appendChild(box);
  }
  replayReveal();
}

// 性质里的方程式走一遍渲染（下标、等号、箭头都排好），其余文字照原样
function chemTextHtml(text) {
  const src = String(text || '');
  if (!/(=|→)/.test(src)) return escHtml(src);
  return src.split(/([^\s，。；、]{0,40}(?:=|→)[^\s，。；、]{0,60})/).map((part) => {
    if (!/=|→/.test(part)) return escHtml(part);
    try { return chemHtml(part); } catch (_) { return escHtml(part); }
  }).join('');
}

function escHtml(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 逐条淡入：抽屉滑上来时，内容一条条跟上来，不再是一整块硬切
function replayChemIn() {
  const items = [sheet.querySelector('.cs-title'), csTags, ...Array.from(csBody.children)];
  items.forEach((el, i) => {
    if (!el) return;
    el.classList.remove('cs-in');
    void el.offsetWidth;
    el.style.animationDelay = `${i * 46}ms`;
    el.classList.add('cs-in');
  });
}

let activeChem = null;

async function lookupChem(el, force) {
  ensurePop();
  activeChem = el;
  const f = chemInput(el.dataset.f);
  if (!f) return;
  const st = String(el.dataset.s || '').replace(/^的/, '');
  const key = chemKey(f, st);
  const my = ++seq;
  const cached = force ? null : chemCacheGet(key);
  if (cached) { renderChemPop(cached); positionPop(el, true); return; }
  // 先把框立起来（标题先出、正文放动画），别让人对着空白等
  renderChemPop({ formula: f, display: chemPretty(f), state: st });
  positionPop(el, true);
  try {
    const r = await fetch(`/api/chem?f=${encodeURIComponent(f)}&s=${encodeURIComponent(st)}&lang=${getLang() === 'en' ? 'en' : 'zh'}`);
    const d = await r.json().catch(() => null);
    if (my !== seq || activeChem !== el) return;
    if (r.status === 401) { renderChemPop({ formula: f, display: chemPretty(f), state: st }, 'auth'); positionPop(el, false); return; }
    if (!d || !d.formula || d.ok === false) {
      renderChemPop({ formula: f, display: chemPretty(f), state: st }, true);
    } else {
      chemCacheSet(key, d);
      renderChemPop(d);
    }
    positionPop(el, false);
  } catch (_) {
    if (my !== seq || activeChem !== el) return;
    renderChemPop({ formula: f, display: chemPretty(f), state: st }, true);
    positionPop(el, false);
  }
}

// 式子排成 Na₂O₂ 这种样子：点词内容里只有纯文本，这里自己补下标/上标。
// 不用 lookbehind：老 Safari 会在解析阶段就报错，整个缓存词表模块会一起挂掉。
function chemPretty(f) {
  const s = String(f || '');
  const supMap = '⁰¹²³⁴⁵⁶⁷⁸⁹', subMap = '₀₁₂₃₄₅₆₇₈₉';
  const m = s.match(/^(.*?)(\d*)([+-])$/);
  let head = s, sup = '';
  if (m && m[3]) {
    head = m[1];
    sup = (m[2] ? m[2].replace(/\d/g, d => supMap[Number(d)]) : '') + (m[3] === '+' ? '⁺' : '⁻');
  }
  return head.replace(/\d/g, d => subMap[Number(d)]) + sup;
}

const earlyChem = (e) => {
  if (!chemTapOn()) return;
  const el = e.target && e.target.closest && e.target.closest('.c-mol');
  if (!el) return;
  const f = chemInput(el.dataset.f);
  if (!f) return;
  const st = String(el.dataset.s || '').replace(/^的/, '');
  if (chemCacheGet(chemKey(f, st))) return;
  const lg = getLang() === 'en' ? 'en' : 'zh';
  fetch(`/api/chem?f=${encodeURIComponent(f)}&s=${encodeURIComponent(st)}&lang=${lg}`)
    .then(r => r.json()).then(d => { if (d && d.ok) chemCacheSet(chemKey(f, st), d); }).catch(() => {});
};
document.addEventListener('pointerdown', earlyChem, { passive: true });

document.addEventListener('click', (e) => {
  if (!chemTapOn()) return;
  const el = e.target.closest && e.target.closest('.c-mol');
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  lookupChem(el);
});

// 手指一碰到词就先预取，click 真正落地时结果通常已经到了
const earlyPrefetch = (e) => {
  const el = e.target && e.target.closest && e.target.closest('.dict-word');
  if (!el) return;
  prefetchWord(el.dataset.w || el.textContent, el);
};
document.addEventListener('pointerdown', earlyPrefetch, { passive: true });
document.addEventListener('touchstart', earlyPrefetch, { passive: true });

// 点词/键盘打开；事件委托，不给每个 span 单独挂 listener
document.addEventListener('click', (e) => {
  const el = e.target.closest('.dict-word');
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  showFor(el, el.dataset.w || el.textContent);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest && e.target.closest('.dict-word');
  if (!el) return;
  e.preventDefault();
  showFor(el, el.dataset.w || el.textContent);
});

// 英文界面不展示点线；切回中文时重新标注当前可见内容
document.documentElement.addEventListener('langchange', (e) => {
  if (e.detail === 'zh') {
    document.querySelectorAll('#studyMsgs, .study-nb-item .study-item-body, .study-ai-card').forEach(annotateEnglish);
  } else {
    document.querySelectorAll('.dict-word').forEach((el) => el.replaceWith(document.createTextNode(el.textContent)));
    closePop();
  }
});
