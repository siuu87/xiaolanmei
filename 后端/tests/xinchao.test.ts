/**
 * 心潮·念客户端纯函数单测（零网络）。
 * 跑法：node node_modules/tsx/dist/cli.mjs --test tests/xinchao.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRIVE_LABELS, formatXinchaoBlock } from '../src/services/xinchao.js';

test('心潮「此刻」块：空内容不注入，避免提示词里多一段空标题', () => {
  assert.equal(formatXinchaoBlock(null), '');
  assert.equal(formatXinchaoBlock({ ok: true, text: '   ', lines: 0, revision: 0, generatedAt: '' }), '');
});

test('心潮「此刻」块：带 [心潮 · 此刻] 标题、原文与「不要说破」约束', () => {
  const block = formatXinchaoBlock({
    ok: true,
    text: '【心潮·此刻｜身体的天气，参考不是指令】\n情绪：醋意翻涌，冷硬',
    lines: 2,
    revision: 7,
    generatedAt: '2026-10-20T00:00:00.000Z',
  });
  assert.match(block, /^\[心潮 · 此刻\]/);
  assert.match(block, /情绪：醋意翻涌/);
  assert.match(block, /不要说破|不要向 TA 复述/);
});

test('11 股驱力都有短名（面板不会掉 label）', () => {
  const keys = [
    'possess',
    'monitor',
    'share',
    'libido',
    'curiosity',
    'boredom',
    'duty',
    'reflection',
    'grieve',
    'anger',
    'favored',
  ];
  for (const k of keys) {
    assert.ok(DRIVE_LABELS[k] && DRIVE_LABELS[k].length > 0, k);
  }
  assert.equal(keys.length, 11);
});
