// 渲染场景判断器的回归测试（明轩 2026-10-30 定）
// 一句话总结：天气读数不许进公式字体，题目里的物理量必须连数字带单位一起进。
// 运行：node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

// blocks.js 会 import ui.js，ui.js 在模块顶层读 window —— Node 里先铺一层最小壳子
const noop = () => {};
globalThis.window = globalThis;
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: noop,
  createElement: () => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop } }),
  body: { appendChild: noop, classList: { add: noop, remove: noop } },
  documentElement: { style: {}, classList: { add: noop, remove: noop } },
};
Object.defineProperty(globalThis, 'navigator', {
  value: { language: 'zh-CN', languages: ['zh-CN'], userAgent: 'node' }, configurable: true,
});
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.matchMedia = () => ({ matches: false, addEventListener: noop, addListener: noop });
globalThis.location = { href: 'https://x.test/', search: '' };

const { renderMarkdown } = await import('../public/js/blocks.js');
const plain = (s) => renderMarkdown(s).replace(/<\/?p>/g, '');

test('天气读数不进公式字体', () => {
  const out = plain('今天抚顺天气晴，气温 23℃，北风 3 级，湿度 60%。');
  assert.ok(!out.includes('class="math"'), out);
  assert.ok(out.includes('23°C'), out);
});

test('零下温度也不会被当成算式', () => {
  const out = plain('明天最低气温零下5度，注意添衣。');
  assert.ok(!out.includes('class="math"'), out);
});

test('空气质量这类混合说法仍按天气处理', () => {
  const out = plain('空气质量指数 68，最高气温 18 度。');
  assert.ok(!out.includes('class="math"'), out);
});

test('日常聊天里的几秒不进公式字体', () => {
  const out = plain('等等我几秒就到');
  assert.ok(!out.includes('class="math"'), out);
});

test('题目里的数字连带单位整体进公式', () => {
  const out = plain('实验测得体积为 2 L，温度 25℃。');
  assert.ok(/<span class="math"><span class="m-num-r">2<\/span><span class="m-unit">L<\/span><\/span>/.test(out), out);
  assert.ok(/<span class="math"><span class="m-num-r">25<\/span><span class="m-unit">℃<\/span><\/span>/.test(out), out);
});

test('复合单位不会被拆成两半', () => {
  for (const [src, num, unit] of [
    ['风速 3 m/s', '3', 'm/s'],
    ['密度是 0.5 g/cm³', '0.5', 'g/cm³'],
    ['电阻 5 Ω', '5', 'Ω'],
    ['通电 2 s', '2', 's'],
  ]) {
    const out = plain(src);
    assert.ok(out.includes(`<span class="m-num-r">${num}</span><span class="m-unit">${unit}</span>`), `${src} → ${out}`);
  }
});

test('题目里第几秒的数字统一进公式，汉字不进', () => {
  const out = plain('求第3秒到第5秒的平均速度');
  assert.ok(out.includes('第<span class="math"><span class="m-num-r">3</span></span>秒'), out);
  assert.ok(out.includes('第<span class="math"><span class="m-num-r">5</span></span>秒'), out);
});

test('量词跟着日常数字一起放行', () => {
  const out = plain('这道题选 B，第3题答案是 5 个。');
  assert.ok(out.includes('5 个'), out);
  assert.ok(!out.includes('>5<'), out);
});

test('化学式后面的中文状态词并进同一个可点单元（所有渲染面一致）', () => {
  const a = plain('把 Na2O2粉末 加入水中');
  assert.ok(a.includes('data-s="粉末"') && a.includes('c-tail">粉末'), a);
  const b = plain('向 Ca(OH)2溶液中通入 CO2 气体');
  assert.ok(b.includes('data-s="溶液"'), b);
  assert.ok(b.includes('data-s="气体"'), b);
});

test('方程式里的系数和状态词互不干扰', () => {
  const out = plain('2Na2O2 + 2H2O = 4NaOH + O2↑');
  assert.ok(out.includes('c-coef">2'), out);
  assert.ok(!out.includes('data-s='), out);
});
