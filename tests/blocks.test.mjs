// 块模型单元测试：把旧站踩过的坑逐条钉死
// 运行：node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBlocks, buildMessageBlocks, BLOCK_TYPES } from '../src/blocks.js';

test('追问和音乐卡可以共存，且追问永远排最后', () => {
  const blocks = normalizeBlocks([
    { type: 'followups', items: ['再聊点', '换一首', '睡了'] },
    { type: 'text', text: '给你放了首歌' },
    { type: 'music', title: '晴天', artist: '周杰伦' },
  ]);
  assert.deepEqual(blocks.map(b => b.type), ['text', 'music', 'followups']);
});

test('两组追问只保留一组，不会闪两次', () => {
  const blocks = normalizeBlocks([
    { type: 'text', text: 'a' },
    { type: 'followups', items: ['一', '二'] },
    { type: 'followups', items: ['三', '四'] },
  ]);
  assert.equal(blocks.filter(b => b.type === 'followups').length, 1);
  assert.deepEqual(blocks.at(-1).items, ['一', '二']);
});

test('两张卡片只保留第一张', () => {
  const blocks = normalizeBlocks([
    { type: 'text', text: 'a' },
    { type: 'music', title: '歌一' },
    { type: 'news', title: '新闻二' },
  ]);
  assert.equal(blocks.filter(b => b.type === 'music' || b.type === 'news').length, 1);
});

test('重复 id 只保留第一次，杜绝重复渲染', () => {
  const blocks = normalizeBlocks([
    { id: 'blk_text_x1', type: 'text', text: '第一次' },
    { id: 'blk_text_x1', type: 'text', text: '第二次' },
  ]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].text, '第一次');
});

test('不同块类型的点击行为是显式的', () => {
  assert.equal(BLOCK_TYPES.followups.action, 'send');
  assert.equal(BLOCK_TYPES.music.action, 'play');
  assert.equal(BLOCK_TYPES.news.action, 'open');
  assert.equal(BLOCK_TYPES.image.action, 'view');
  assert.equal(BLOCK_TYPES.text.action, 'none');
});

test('未知类型直接丢弃，不会把界面搞崩', () => {
  const blocks = normalizeBlocks([
    { type: 'text', text: 'a' },
    { type: 'video', url: 'https://x.test/a.mp4' },
  ]);
  assert.deepEqual(blocks.map(b => b.type), ['text']);
});

test('非法 URL 不会被带进卡片', () => {
  const blocks = normalizeBlocks([{ type: 'image', url: 'javascript:alert(1)' }]);
  assert.equal(blocks.length, 0);
});

test('追问条目：去编号、限长、最多三条', () => {
  const blocks = normalizeBlocks([{
    type: 'followups',
    items: ['1. 第一个问题', '2、第二个问题', '3) 第三个问题', '4. 第四个问题'],
  }]);
  assert.equal(blocks[0].items.length, 3);
  assert.equal(blocks[0].items[0], '第一个问题');
});

test('buildMessageBlocks：正文→卡片→额度→追问', () => {
  const blocks = buildMessageBlocks({
    text: '正文',
    card: { type: 'music', title: '歌' },
    quota: { used: 3, limit: 200 },
    followups: ['q1'],
  });
  assert.deepEqual(blocks.map(b => b.type), ['text', 'music', 'quota', 'followups']);
});

test('每个 block 都有稳定 id', () => {
  const blocks = normalizeBlocks([{ type: 'text', text: 'a' }, { type: 'music', title: 'b' }]);
  for (const b of blocks) assert.match(b.id, /^blk_[a-z]+_[A-Za-z0-9]+$/);
  assert.notEqual(blocks[0].id, blocks[1].id);
});
