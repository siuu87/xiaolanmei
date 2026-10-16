/**
 * 情绪演进规则单测（纯函数，零 IO）。
 *
 * 跑法（在 `后端/` 下）：
 *   node node_modules/tsx/dist/cli.mjs --test tests/*.test.ts
 *
 * 所有用例都显式传 `now` —— `deriveMood` / 深夜加成会看本地钟点，
 * 不固定时间就会「白天绿、晚上红」。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMOTION_DEFAULT,
  EMOTION_LABELS,
  evolveEmotion,
  formatDurationCN,
  formatTimeInterval,
  type EmotionState,
} from '../src/emotion/rules.js';

/** 下午两点（本地）—— 避开 23:00–04:00 的深夜加成 */
const DAY = new Date(2026, 9, 17, 14, 0, 0).getTime();
const NIGHT = new Date(2026, 9, 17, 23, 30, 0).getTime();

const base = (over: Partial<EmotionState> = {}): EmotionState => ({
  affection: EMOTION_DEFAULT.affection,
  possessiveness: EMOTION_DEFAULT.possessiveness,
  restraint: EMOTION_DEFAULT.restraint,
  longing: EMOTION_DEFAULT.longing,
  currentMood: EMOTION_DEFAULT.currentMood,
  ...over,
});

/** 演进一轮（默认：用户刚说完话、没有沉默间隔） */
const run = (prev: EmotionState, text: string, now = DAY, lastAt = now) =>
  evolveEmotion(prev, { text, fromUser: true, now, lastAt });

/** 取某一维的 delta（没有就返回 0） */
const d = (r: ReturnType<typeof evolveEmotion>, field: keyof EmotionState): number =>
  r.deltas.filter((x) => x.field === field).reduce((s, x) => s + x.delta, 0);

// ─────────────────────────────────────────────────────────────
test('默认值与 character_state 表的列默认值一致', () => {
  assert.deepEqual(
    {
      affection: EMOTION_DEFAULT.affection,
      possessiveness: EMOTION_DEFAULT.possessiveness,
      restraint: EMOTION_DEFAULT.restraint,
      longing: EMOTION_DEFAULT.longing,
      currentMood: EMOTION_DEFAULT.currentMood,
    },
    { affection: 100, possessiveness: 50, restraint: 80, longing: 30, currentMood: '温柔' },
  );
});

test('中文维度名齐全（面板直接用 delta.label）', () => {
  assert.deepEqual(EMOTION_LABELS, {
    affection: '爱意',
    possessiveness: '占有欲',
    restraint: '克制',
    longing: '思念',
  });
});

test('默认状态 + 什么都没说 → 心情仍是温柔，且不产生任何 delta', () => {
  const r = run(base(), '嗯。');
  assert.equal(r.moodAfter, '温柔');
  assert.equal(r.deltas.length, 0);
  assert.deepEqual(r.state.affection, 100);
});

test('纯函数：不修改传入的 state 对象', () => {
  const prev = base();
  const snapshot = { ...prev };
  run(prev, '好想你呀，抱抱');
  assert.deepEqual(prev, snapshot);
});

// ── 七类信号 ────────────────────────────────────────────────
const CASES: { name: string; text: string; want: Partial<Record<keyof EmotionState, number>>; mood?: string }[] = [
  { name: '撒娇亲昵', text: '好想你，抱抱我', want: { affection: 2, longing: -2, possessiveness: 1 }, mood: '心动' },
  { name: '夸奖感谢', text: '谢谢你，你真厉害', want: { affection: 2, longing: -1 } },
  { name: '示弱求安慰', text: '今天好累，头也疼', want: { affection: 1, possessiveness: 2, restraint: -1 }, mood: '心疼' },
  { name: '闹脾气', text: '你别管我了', want: { affection: -3, possessiveness: 2, restraint: -2 }, mood: '低落' },
  { name: '吃醋触发', text: '今天有个同事一直找我说话', want: { possessiveness: 2, longing: 1 }, mood: '吃醋' },
  { name: '亲密暗示', text: '想靠着你', want: { affection: 1, possessiveness: 1, restraint: -1, longing: -1 } },
  { name: '日常报备', text: '我下班了，在路上', want: { affection: 1, restraint: 1 } },
];

/** 起点远离 0/100 两端 —— 否则 +2 会被夹住，测不出规则本身给的 delta */
const mid = (over: Partial<EmotionState> = {}): EmotionState => base({ affection: 60, ...over });

for (const c of CASES) {
  test(`信号「${c.name}」→ 各维 delta 与预期一致`, () => {
    const r = run(mid(), c.text);
    // 起点远离边界，delta 不会被 0/100 截断
    assert.deepEqual(
      {
        affection: d(r, 'affection'),
        possessiveness: d(r, 'possessiveness'),
        restraint: d(r, 'restraint'),
        longing: d(r, 'longing'),
      },
      {
        affection: c.want.affection ?? 0,
        possessiveness: c.want.possessiveness ?? 0,
        restraint: c.want.restraint ?? 0,
        longing: c.want.longing ?? 0,
      },
      `文本：${c.text}`,
    );
    assert.ok(r.signals.some((s) => s.label === c.name), `应命中「${c.name}」，实际 ${JSON.stringify(r.signals)}`);
    if (c.mood) assert.equal(r.moodAfter, c.mood);
  });
}

test('每条 delta 都带可读理由，且 before/after 自洽', () => {
  const r = run(base(), '好想你，抱抱我');
  assert.ok(r.deltas.length > 0);
  for (const x of r.deltas) {
    assert.ok(x.reason.length > 0, '理由不能为空');
    assert.equal(x.after, x.before + x.delta);
    assert.equal(x.label, EMOTION_LABELS[x.field]);
  }
});

// ── 边界与封顶 ──────────────────────────────────────────────
test('事件 delta 每维封顶 ±3（撒娇 + 夸奖同时命中，爱意只 +3 不是 +4）', () => {
  const r = run(base({ affection: 50 }), '好想你，谢谢你真厉害');
  assert.equal(d(r, 'affection'), 3);
});

test('数值夹在 0-100：爱意 99 + 2 → 100', () => {
  const r = run(base({ affection: 99 }), '抱抱');
  assert.equal(r.state.affection, 100);
});

test('已经到上限且只会涨 → 不记一条 delta=0 的噪音', () => {
  const r = run(base({ affection: 100 }), '抱抱');
  assert.equal(r.deltas.filter((x) => x.field === 'affection').length, 0);
});

test('夹到下限：爱意 2 挨骂 → 停在 0，delta 记实际变化量', () => {
  const r = run(base({ affection: 2 }), '你别管我了');
  assert.equal(r.state.affection, 0);
  const x = r.deltas.find((y) => y.field === 'affection');
  assert.ok(x);
  assert.equal(x.delta, -2); // 不是 -3
  assert.equal(x.before, 2);
  assert.equal(x.after, 0);
});

// ── 思念的时间驱动 ──────────────────────────────────────────
test('沉默不到 4 小时 → 思念不动', () => {
  const r = run(base(), '在干嘛', DAY, DAY - 3 * 3600_000);
  assert.equal(d(r, 'longing'), 0);
  assert.equal(r.gapMs, 3 * 3600_000);
});

test('沉默 8 小时 → 思念 +2 再 -1 = +1，理由带中文时长', () => {
  const r = run(base(), '我回来啦', DAY, DAY - 8 * 3600_000);
  assert.equal(d(r, 'longing'), 1);
  const reasons = r.deltas.map((x) => x.reason).join(' | ');
  assert.match(reasons, /已经有 8 小时 没听到你的声音了/);
  assert.match(reasons, /你终于回来说话了/);
});

test('沉默封顶 +4：隔了一周也只涨 4（再 -1）', () => {
  const r = run(base(), '在吗', DAY, DAY - 7 * 24 * 3600_000);
  assert.equal(d(r, 'longing'), 3);
  assert.match(r.deltas.map((x) => x.reason).join(' | '), /已经有 7 天/);
});

test('非用户触发的演进没有「你回来了」减免', () => {
  const r = evolveEmotion(base(), { text: '在吗', fromUser: false, now: DAY, lastAt: DAY - 8 * 3600_000 });
  assert.equal(d(r, 'longing'), 2);
});

// ── 心情优先级与派生 ────────────────────────────────────────
test('闹脾气压过撒娇（同一句里两种信号都有，取更强烈的那个）', () => {
  const r = run(base(), '好想你……但是你讨厌，别管我了');
  assert.ok(r.signals.some((s) => s.id === 'sweet'));
  assert.ok(r.signals.some((s) => s.id === 'hurt'));
  assert.equal(r.moodAfter, '低落');
});

test('连续被骂到爱意 ≤70 → 心情低落', () => {
  let s = base();
  for (let i = 0; i < 10; i++) s = run(s, '你别管我了').state;
  assert.ok(s.affection <= 70, `爱意应低于 70，实际 ${s.affection}`);
  assert.equal(run(s, '嗯。').moodAfter, '低落');
});

test('占有欲推高 + 思念中等 → 黏人；只有占有欲 → 吃醋', () => {
  assert.equal(run(base({ possessiveness: 75, longing: 56 }), '嗯。').moodAfter, '黏人');
  assert.equal(run(base({ possessiveness: 75, longing: 30 }), '嗯。').moodAfter, '吃醋');
});

test('思念推高 → 想念', () => {
  assert.equal(run(base({ longing: 65 }), '嗯。').moodAfter, '想念');
});

test('克制掉到 ≤45 → 忍不住', () => {
  assert.equal(run(base({ restraint: 40 }), '嗯。').moodAfter, '忍不住');
});

// ── 回稳（drift） ───────────────────────────────────────────
test('没事发生时克制往默认 80 回升一格', () => {
  const r = run(base({ restraint: 70 }), '嗯。');
  assert.equal(d(r, 'restraint'), 1);
  assert.match(r.deltas[0].reason, /稳了下去/);
});

test('克制高于默认值时不往下拽', () => {
  assert.equal(d(run(base({ restraint: 85 }), '嗯。'), 'restraint'), 0);
});

test('占有欲离开 50±20 的带子才回收；带内不动', () => {
  assert.equal(d(run(base({ possessiveness: 75 }), '嗯。'), 'possessiveness'), -1);
  assert.equal(d(run(base({ possessiveness: 25 }), '嗯。'), 'possessiveness'), 1);
  assert.equal(d(run(base({ possessiveness: 60 }), '嗯。'), 'possessiveness'), 0);
});

test('有事件时**不**叠加回稳（一维只有一条 delta）', () => {
  const r = run(base({ restraint: 70 }), '我下班了');
  const list = r.deltas.filter((x) => x.field === 'restraint');
  assert.equal(list.length, 1);
  assert.equal(list[0].delta, 1); // report 给的 +1，不是回稳的 +1
  assert.match(list[0].reason, /报备/);
});

// ── 深夜 ────────────────────────────────────────────────────
test('深夜（本地 23 点后）没事发生也会心软一格、克制松一格', () => {
  const r = run(base({ affection: 90 }), '嗯。', NIGHT);
  assert.equal(d(r, 'affection'), 1);
  assert.equal(d(r, 'restraint'), -1);
  assert.match(r.deltas.map((x) => x.reason).join(' | '), /夜深了/);
});

test('深夜 + 一切平稳 → 温柔', () => {
  assert.equal(run(base(), '嗯。', NIGHT).moodAfter, '温柔');
});

test('深夜不会压过事件信号（该心疼还是心疼）', () => {
  assert.equal(run(base(), '今天好累', NIGHT).moodAfter, '心疼');
});

// ── 时间格式 ────────────────────────────────────────────────
test('formatTimeInterval 的边界', () => {
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

test('formatDurationCN 的边界', () => {
  assert.equal(formatDurationCN(0), '刚刚');
  assert.equal(formatDurationCN(20 * 60_000), '20 分钟');
  assert.equal(formatDurationCN(5 * 3600_000), '5 小时');
  assert.equal(formatDurationCN(2 * 24 * 3600_000), '2 天');
});

// ── 结构稳定 ────────────────────────────────────────────────
test('返回结构字段齐全（面板/接口依赖）', () => {
  const r = run(base(), '抱抱');
  for (const k of ['state', 'deltas', 'signals', 'moodBefore', 'moodAfter', 'gapMs']) {
    assert.ok(k in r, `缺字段 ${k}`);
  }
  for (const k of ['affection', 'possessiveness', 'restraint', 'longing', 'currentMood']) {
    assert.ok(k in r.state, `state 缺字段 ${k}`);
  }
  assert.equal(r.moodBefore, '温柔');
});

test('四维恒为 0-100 的整数（反复演进也不会溢出）', () => {
  let s = base();
  const things = ['抱抱', '你别管我了', '今天好累', '我下班了', '想靠着你', '谢谢你真厉害', '和同事吃饭'];
  for (let i = 0; i < 200; i++) {
    s = run(s, things[i % things.length]).state;
    for (const k of ['affection', 'possessiveness', 'restraint', 'longing'] as const) {
      assert.ok(Number.isInteger(s[k]), `${k} 应为整数，实际 ${s[k]}`);
      assert.ok(s[k] >= 0 && s[k] <= 100, `${k} 越界：${s[k]}`);
    }
  }
});
