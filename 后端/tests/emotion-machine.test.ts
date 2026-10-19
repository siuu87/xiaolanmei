/**
 * 情绪状态机 + 轻量分析器 + OB 工具的纯函数单测（零 IO，无网络）。
 *
 * 跑法（在 `后端/` 下）：
 *   node node_modules/tsx/dist/cli.mjs --test tests/emotion-machine.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CORE_DEFAULT,
  EMPTY_DELTA,
  PANEL_FIELDS,
  buildStrategyBlock,
  deriveMoodLabel,
  evolveTurn,
  pickStrategyTags,
  type CoreSnapshot,
  type EmotionDelta4,
  type TurnContext,
} from '../src/emotion/machine.js';
import {
  buildAnalyzerInput,
  heuristicDelta,
  normalizeDelta,
  parseDeltaJson,
} from '../src/emotion/analyzer.js';
import {
  composeTurnSummary,
  normalizeHits,
  obConfigured,
} from '../src/services/ombreBrain.js';

/** 下午两点，避开深夜加成 */
const NOW = new Date(2026, 9, 19, 14, 0, 0).getTime();

const snap = (over: Partial<CoreSnapshot> = {}): CoreSnapshot => ({
  jealousy: CORE_DEFAULT.jealousy,
  tension: CORE_DEFAULT.tension,
  restraint: CORE_DEFAULT.restraint,
  vulnerability: CORE_DEFAULT.vulnerability,
  affection: 100,
  longing: 30,
  ...over,
});

const ctx = (over: Partial<TurnContext> = {}): TurnContext => ({
  text: '',
  now: NOW,
  gapMs: 0,
  fromUser: true,
  turnCount: 0,
  ...over,
});

const delta = (over: Partial<EmotionDelta4> = {}): EmotionDelta4 => ({ ...EMPTY_DELTA, ...over });

// ── 状态机 ──────────────────────────────────────────────────

test('面板是六维：四维核心在前 + 爱意/思念在后', () => {
  assert.deepEqual(
    PANEL_FIELDS.map((f) => f.key),
    ['possessiveness', 'tension', 'restraint', 'vulnerability', 'affection', 'longing'],
  );
  assert.equal(PANEL_FIELDS.length, 6);
});

test('单轮位移封顶 ±6：delta 1.0 也不会骤变', () => {
  const r = evolveTurn(snap({ jealousy: 40 }), delta({ jealousy: 1 }), ctx());
  assert.equal(r.next.jealousy, 46);
  const down = evolveTurn(snap({ jealousy: 40 }), delta({ jealousy: -1 }), ctx());
  assert.equal(down.next.jealousy, 34);
});

test('委屈回落单独封顶 3：一句「对不起」清不了零', () => {
  const r = evolveTurn(snap({ vulnerability: 70 }), delta({ vulnerability: -1 }), ctx());
  assert.equal(r.next.vulnerability, 67);
});

test('被哄后要数轮缓冲：连续哄 10 轮仍高于常态', () => {
  let s = snap({ vulnerability: 70 });
  for (let i = 0; i < 10; i++) {
    s = evolveTurn(s, delta({ vulnerability: -1 }), ctx({ turnCount: i })).next;
  }
  assert.equal(s.vulnerability, 40);
  assert.ok(s.vulnerability > CORE_DEFAULT.vulnerability);
});

test('没有 delta 时朝基准缓慢回稳（每轮 1 点）', () => {
  const r = evolveTurn(snap({ jealousy: 70, tension: 60 }), delta(), ctx());
  assert.equal(r.next.jealousy, 69);
  assert.equal(r.next.tension, 59);
});

test('深夜长时间没聊 → 思念按时长涨、回来再落 1', () => {
  const r = evolveTurn(snap({ longing: 30 }), delta(), ctx({ gapMs: 9 * 3_600_000 }));
  const moves = r.moves.filter((m) => m.field === 'longing');
  // 9h → 涨 2，再因「你回来说话了」-1 → 净 +1
  assert.equal(r.next.longing, 31);
  assert.ok(moves.some((m) => m.delta === 2));
  assert.ok(moves.some((m) => m.delta === -1));
});

test('心情标签：醋意压不住 / 狂跳 / 隐忍 / 委屈 / 温存', () => {
  assert.equal(deriveMoodLabel(snap({ jealousy: 70, restraint: 45 })), '醋意翻涌，冷硬');
  assert.equal(deriveMoodLabel(snap({ jealousy: 72, restraint: 70 })), '醋意狂跳');
  assert.equal(deriveMoodLabel(snap({ tension: 75 })), '隐忍紧绷');
  assert.equal(deriveMoodLabel(snap({ vulnerability: 65, restraint: 60 })), '委屈撑着');
  assert.equal(deriveMoodLabel(snap({ vulnerability: 65, restraint: 45 })), '委屈求哄');
  assert.equal(deriveMoodLabel(snap({ tension: 30, restraint: 80, vulnerability: 20 })), '温存松弛');
});

test('行为策略标签：高醋意+低克制 → 冷硬；高紧绷 → 紧绷', () => {
  const cold = pickStrategyTags(
    snap({ jealousy: 60, restraint: 55 }),
    snap({ jealousy: 70, restraint: 45 }),
    delta({ jealousy: 0.6, restraint: -0.4 }),
  );
  assert.ok(cold.includes('jealous_cold'));

  const tense = pickStrategyTags(snap({ tension: 60 }), snap({ tension: 75 }), delta({ tension: 0.5 }));
  assert.ok(tense.includes('tense'));
});

test('被顺毛（委屈明显回落）→ aftercare 优先于 vulnerable', () => {
  const tags = pickStrategyTags(
    snap({ vulnerability: 62 }),
    snap({ vulnerability: 55 }),
    delta({ vulnerability: -0.3 }),
  );
  assert.ok(tags.includes('aftercare'));
  assert.ok(!tags.includes('vulnerable'));
});

test('被哄之后不因中性对话立刻退回委屈；再次被刺才退回', () => {
  const stay = pickStrategyTags(
    snap({ vulnerability: 60 }),
    snap({ vulnerability: 59 }),
    delta(),
    ['aftercare'],
  );
  assert.ok(stay.includes('aftercare'));

  const back = pickStrategyTags(
    snap({ vulnerability: 60 }),
    snap({ vulnerability: 62 }),
    delta({ vulnerability: 0.2 }),
    ['aftercare'],
  );
  assert.ok(!back.includes('aftercare'));
  assert.ok(back.includes('vulnerable'));
});

test('行为策略块不给数字、不说破规则', () => {
  const block = buildStrategyBlock(snap({ jealousy: 75, restraint: 40 }), '醋意翻涌，冷硬', ['jealous_cold']);
  assert.match(block, /内部参考/);
  assert.match(block, /禁止向 TA 提到/);
  assert.match(block, /单句更短/);
  // 不能把 0-100 的数值漏进提示词
  assert.doesNotMatch(block, /\b\d{1,3}\s*\/\s*100\b/);
});

// ── 轻量分析器（纯函数部分） ────────────────────────────────

test('最近 4 条按 80/20 加权：后两条各 40%，前两条各 10%', () => {
  const input = buildAnalyzerInput([
    { role: 'user', content: '第一条' },
    { role: 'assistant', content: '第二条' },
    { role: 'user', content: '第三条' },
    { role: 'assistant', content: '第四条' },
  ]);
  const weights = [...input.matchAll(/权重 (\d+)%/g)].map((m) => Number(m[1]));
  assert.deepEqual(weights, [10, 10, 40, 40]);
});

test('JSON 解析容忍代码围栏与前后废话', () => {
  const obj = parseDeltaJson('```json\n{"jealousy_delta":0.2}\n```');
  assert.deepEqual(obj, { jealousy_delta: 0.2 });
  assert.equal(parseDeltaJson('没有 JSON'), null);
});

test('delta 归一：snake_case / camelCase / 短名都能读，且夹在 -1~1', () => {
  const d = normalizeDelta({
    jealousy_delta: 0.2,
    tension: '0.1',
    vulnerabilityDelta: -3,
    restraint_delta: 0.5,
  });
  assert.deepEqual(d, { jealousy: 0.2, tension: 0.1, vulnerability: -1, restraint: 0.5 });
});

test('关键词兜底只认明确信号（同事 → 醋意）', () => {
  const d = heuristicDelta('刚跟同事吃完饭，在跟学长聊事情');
  assert.equal(d.jealousy, 0.3);
  assert.deepEqual(heuristicDelta('今天天气不错'), EMPTY_DELTA);
});

// ── OB 工具 ─────────────────────────────────────────────────

test('OB 没配时整条链路静默（不抛、不请求）', () => {
  assert.equal(obConfigured(), false);
});

test('OB 返回形状宽容：数组 / results / memories / data 都能归一', () => {
  assert.equal(normalizeHits(['a', 'b']).length, 2);
  assert.equal(normalizeHits({ results: [{ content: 'x' }, { text: 'y' }] }).length, 2);
  assert.equal(normalizeHits({ memories: [{ memory: 'z' }] }).length, 1);
  assert.equal(normalizeHits({ data: [{ summary: 'w' }] }).length, 1);
  // 去重
  assert.equal(normalizeHits([{ content: '同名' }, { content: '同名' }]).length, 1);
});

test('本轮摘要包含三方信息与情感波动', () => {
  const s = composeTurnSummary({
    userText: '刚跟同事吃饭',
    replyText: '哦。',
    moodLabel: '醋意狂跳',
    delta: delta({ jealousy: 0.3 }),
  });
  assert.match(s, /TA：刚跟同事吃饭/);
  assert.match(s, /白起：哦。/);
  assert.match(s, /心绪：醋意狂跳/);
  assert.match(s, /醋意\+0\.3/);
});
