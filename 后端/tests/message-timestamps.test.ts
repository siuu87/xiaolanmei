/**
 * 消息时间戳 patch 单测（纯函数、零 IO）。
 *
 * 跑法（在 `后端/` 下）：
 *   node node_modules/tsx/dist/cli.mjs --test tests/message-timestamps.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decorateMessages,
  formatGap,
  formatMessagePrefix,
  formatTimestampBody,
  stripTimestamps,
} from '../src/chat/messageTimestamps.js';

/** 2026-08-11 09:32:10 UTC = 17:32:10 CST（周二） */
const T0 = Date.UTC(2026, 7, 11, 9, 32, 10);

test('时间按 CST（UTC+8）渲染：Tue 2026-08-11 17:32:10 CST', () => {
  assert.equal(formatTimestampBody(T0), 'Tue 2026-08-11 17:32:10 CST');
});

test('间隔尾巴：+9h 44m / +12m / +2d 3h；不足 1 分钟不出现', () => {
  assert.equal(formatGap((9 * 60 + 44) * 60_000), '+9h 44m');
  assert.equal(formatGap(12 * 60_000), '+12m');
  assert.equal(formatGap((2 * 1440 + 3 * 60) * 60_000), '+2d 3h');
  assert.equal(formatGap(30_000), '');
});

test('前缀格式：带间隔时是 [时间 · 间隔]', () => {
  assert.equal(
    formatMessagePrefix(T0, (9 * 60 + 44) * 60_000),
    '[Tue 2026-08-11 17:32:10 CST · +9h 44m] ',
  );
  assert.equal(formatMessagePrefix(T0), '[Tue 2026-08-11 17:32:10 CST] ');
});

test('剥离前缀幂等：多层也只剥干净，普通方括号不误伤', () => {
  const dirty =
    '[Tue 2026-08-11 17:32:10 CST · +9h 44m] [Tue 2026-08-11 17:32:10 CST] 盒盖啦，回家见';
  assert.equal(stripTimestamps(dirty), '盒盖啦，回家见');
  assert.equal(stripTimestamps('[图片] 普通方括号'), '[图片] 普通方括号');
  assert.equal(stripTimestamps('盒盖啦'), '盒盖啦');
});

test('渲染整段：第一条无间隔，后续按相邻消息算 +9h 44m / +12m', () => {
  const msgs = [
    { role: 'user', content: '盒盖啦，回家见', createdAt: T0 },
    { role: 'assistant', content: '路上慢点。', createdAt: T0 + (9 * 60 + 44) * 60_000 },
    { role: 'user', content: '到了。', createdAt: T0 + (9 * 60 + 44 + 12) * 60_000 },
  ];
  const out = decorateMessages(msgs);
  assert.equal(out[0].content, '[Tue 2026-08-11 17:32:10 CST] 盒盖啦，回家见');
  assert.equal(
    out[1].content,
    '[Wed 2026-08-12 03:16:10 CST · +9h 44m] 路上慢点。',
  );
  assert.equal(
    out[2].content,
    '[Wed 2026-08-12 03:28:10 CST · +12m] 到了。',
  );
});

test('重复渲染幂等：不会叠成 [时间][时间]', () => {
  const once = decorateMessages([{ role: 'user', content: '晚安', createdAt: T0 }]);
  const twice = decorateMessages(once);
  assert.equal(twice[0].content, once[0].content);
  assert.equal((twice[0].content.match(/CST/g) ?? []).length, 1);
});

test('不修改入参：存档里的 content 必须保持干净', () => {
  const msgs = [{ role: 'user', content: '盒盖啦，回家见', createdAt: T0 }];
  const before = JSON.stringify(msgs);
  const out = decorateMessages(msgs);
  assert.equal(JSON.stringify(msgs), before);
  assert.notEqual(out[0].content, msgs[0].content);
});

test('system / tool 不加时间戳；enabled=false 原样返回', () => {
  const msgs = [
    { role: 'system', content: '你是…', createdAt: T0 },
    { role: 'tool', content: '结果', createdAt: T0 },
    { role: 'user', content: '嗨', createdAt: T0 },
  ];
  const out = decorateMessages(msgs);
  assert.equal(out[0].content, '你是…');
  assert.equal(out[1].content, '结果');
  assert.match(out[2].content, /^\[Tue 2026-08-11 17:32:10 CST\] 嗨$/);

  assert.equal(decorateMessages(msgs, { enabled: false }), msgs);
});

test('缺 createdAt 时用 now，且不产生假间隔', () => {
  const out = decorateMessages(
    [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ],
    { now: T0 },
  );
  assert.equal(out[0].content, '[Tue 2026-08-11 17:32:10 CST] a');
  assert.equal(out[1].content, '[Tue 2026-08-11 17:32:10 CST] b');
});
