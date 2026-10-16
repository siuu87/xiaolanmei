/**
 * `lib/timeAgo.ts` 的边界单测。
 *
 * 它跟后端 `后端/src/emotion/rules.ts` 的 `formatTimeInterval` / `formatDurationCN`
 * 是**等价实现**（那边把中文时长拼进 delta 理由，这边显示卡片「多久以前」）。
 * 两侧各锁一份**同样的边界表**：谁改了谁挂，防止悄悄跑偏。
 *
 * 跑法（在 `前端/` 下）：
 *   node ../后端/node_modules/tsx/dist/cli.mjs --test tests/*.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDurationCN, formatSince, formatTimeInterval } from '../src/lib/timeAgo.js';

test('formatTimeInterval 的边界（与后端同一张表）', () => {
  assert.equal(formatTimeInterval(0), '刚刚');
  assert.equal(formatTimeInterval(59_000), '刚刚');
  assert.equal(formatTimeInterval(60_000), '1m');
  assert.equal(formatTimeInterval(45 * 60_000), '45m');
  assert.equal(formatTimeInterval(2 * 3600_000 + 15 * 60_000), '2h 15m');
  assert.equal(formatTimeInterval(3 * 3600_000), '3h');
  assert.equal(formatTimeInterval(3 * 24 * 3600_000), '3d');
  assert.equal(formatTimeInterval(70 * 24 * 3600_000), '2mo');
  assert.equal(formatTimeInterval(400 * 24 * 3600_000), '1y');
  assert.equal(formatTimeInterval(-5000), '刚刚', '负数按刚刚处理');
});

test('formatDurationCN 的边界（与后端同一张表）', () => {
  assert.equal(formatDurationCN(0), '刚刚');
  assert.equal(formatDurationCN(20 * 60_000), '20 分钟');
  assert.equal(formatDurationCN(5 * 3600_000), '5 小时');
  assert.equal(formatDurationCN(2 * 24 * 3600_000), '2 天');
});

test('formatSince：给时间戳算「距今多久」，时钟漂移不显示负数', () => {
  const now = new Date(2026, 9, 17, 14, 0, 0).getTime();
  assert.equal(formatSince(now - 30_000, now), '刚刚');
  assert.equal(formatSince(now - 2 * 3600_000, now), '2h');
  // 时间戳比 now 还晚（客户端时钟比服务端慢）→ 不能出现 -3m 这种
  assert.equal(formatSince(now + 10 * 60_000, now), '刚刚');
});
