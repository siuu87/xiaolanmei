/**
 * 时间感信号单测（纯函数，零 IO）。
 * 跑法（在 `后端/` 下）：node node_modules/tsx/dist/cli.mjs --test tests/time-sense.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeSense, describeTimeOfDay, weekdayCN } from '../src/emotion/timeSense.js';

test('describeTimeOfDay 覆盖各时段边界', () => {
  const h = (hr: number) => describeTimeOfDay(new Date(2026, 9, 17, hr, 0, 0));
  assert.equal(h(0), '深夜');
  assert.equal(h(3), '深夜');
  assert.equal(h(5), '凌晨');
  assert.equal(h(7), '凌晨');
  assert.equal(h(9), '上午');
  assert.equal(h(11), '中午');
  assert.equal(h(14), '下午');
  assert.equal(h(18), '傍晚');
  assert.equal(h(20), '晚上');
  assert.equal(h(22), '晚上');
  assert.equal(h(23), '深夜');
});

test('weekdayCN 正确映射', () => {
  // 2026-10-17 是周六
  assert.equal(weekdayCN(new Date(2026, 9, 17)), '周六');
  // 2026-10-18 周日
  assert.equal(weekdayCN(new Date(2026, 9, 18)), '周日');
});

test('buildTimeSense 新对话（无 lastMessageAt）提示开场', () => {
  const now = new Date(2026, 9, 17, 20, 13, 0);
  const out = buildTimeSense(now, null);
  assert.match(out, /【时间感】/);
  assert.match(out, /2026 年 10 月 17 日 周六/);
  assert.match(out, /20:13（晚上）/);
  assert.match(out, /这是一段新对话的开始/);
});

test('buildTimeSense 距上次 3 小时：刚聊过口径', () => {
  const now = new Date(2026, 9, 17, 20, 13, 0).getTime();
  const out = buildTimeSense(new Date(now), now - 3 * 3_600_000);
  assert.match(out, /距离 TA 上一条消息已经过了 3h/);
  assert.match(out, /接着当下的节奏走/);
});

test('buildTimeSense 距上次 6 小时：想念口径', () => {
  const now = new Date(2026, 9, 17, 20, 13, 0).getTime();
  const out = buildTimeSense(new Date(now), now - 6 * 3_600_000);
  assert.match(out, /距离 TA 上一条消息已经过了 6h/);
  assert.match(out, /已经挺久没联系了/);
});

test('buildTimeSense 非法 lastMessageAt 退化为新对话', () => {
  const now = new Date(2026, 9, 17, 20, 13, 0).getTime();
  const out = buildTimeSense(new Date(now), 0); // 0 视为无效
  assert.match(out, /这是一段新对话的开始/);
});
