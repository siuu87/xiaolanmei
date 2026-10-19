/**
 * 深夜电台 radio_parse + 纯台词规范 单测（零 IO）。
 *
 * 跑法：node node_modules/tsx/dist/cli.mjs --test tests/radio-parse.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRadioScript, sanitizeSpoken } from '../src/radio/parse.js';
import {
  RADIO_CHANNELS,
  fallbackRadioScript,
  radioChannelPrompt,
  radioUserContext,
} from '../src/radio/prompt.js';

test('纯台词：一行一句，拆成 speak 片段', () => {
  const r = parseRadioScript('灯关了吗。\n那就别动了，听我说两句。');
  assert.equal(r.segments.length, 2);
  assert.deepEqual(r.segments[0], { type: 'speak', text: '灯关了吗。' });
  assert.equal(r.segments[1].type, 'speak');
});

test('记号：song / bgm / se 单独成行，不混进台词', () => {
  const r = parseRadioScript(
    '[song:夜曲|周杰伦]\n[bgm:雨]\n[se:心跳]\n先放一首歌。',
  );
  assert.deepEqual(r.segments[0], { type: 'song', name: '夜曲', artist: '周杰伦' });
  assert.deepEqual(r.segments[1], { type: 'bgm', mood: '雨' });
  assert.deepEqual(r.segments[2], { type: 'se', name: '心跳' });
  assert.equal(r.segments[3].type, 'speak');
});

test('语气只管紧跟着的一句；停顿单独成片段', () => {
  const r = parseRadioScript('[耳语]\n别怕。\n下一句就正常了。\n[停顿]\n过来一点。');
  assert.deepEqual(r.segments[0], { type: 'speak', text: '别怕。', tone: '耳语' });
  assert.equal((r.segments[1] as { tone?: string }).tone, undefined);
  assert.deepEqual(r.segments[2], { type: 'pause', ms: 900 });
  assert.equal(r.segments[3].type, 'speak');
});

test('左右耳提示跟着下一句；不念出来', () => {
  const r = parseRadioScript('[左耳]\n我在。');
  assert.deepEqual(r.segments[0], { type: 'speak', text: '我在。', ear: 'left' });
});

test('行内语气记号也认：[低声] 台词 —— 不会把「低声」念出来', () => {
  const r = parseRadioScript('[低声] 你的纸条我看见了。');
  assert.deepEqual(r.segments, [
    { type: 'speak', text: '你的纸条我看见了。', tone: '低声' },
  ]);
});

test('括号旁白 / 星号动作被洗掉（TTS 绝不该念出来）', () => {
  assert.equal(sanitizeSpoken('（轻轻抱住你）过来一点。'), '过来一点。');
  assert.equal(sanitizeSpoken('*叹气* 算了。'), '算了。');
  assert.equal(sanitizeSpoken('（笑）'), '');
  const r = parseRadioScript('（把被子往上拉）别踢被子。');
  assert.deepEqual(r.segments, [{ type: 'speak', text: '别踢被子。' }]);
});

test('块级内容不念：本子 / 轨道 / 摘要单独存', () => {
  const r = parseRadioScript(
    '<本子>第一夜：雨，旧车站。</本子>\n<轨道>左耳-雨声\n右耳-呼吸</轨道>\n<摘要>今晚讲了一个车站的故事。</摘要>\n开播。',
  );
  assert.equal(r.outline, '第一夜：雨，旧车站。');
  assert.equal(r.tracks, '左耳-雨声\n右耳-呼吸');
  assert.equal(r.summary, '今晚讲了一个车站的故事。');
  assert.equal(r.segments.length, 1);
  assert.equal(r.segments[0].type, 'speak');
});

test('未知记号行不念，当语气提示', () => {
  const r = parseRadioScript('[笑]\n你啊。');
  assert.deepEqual(r.segments, [{ type: 'speak', text: '你啊。', tone: '笑' }]);
});

test('四个台的提示词都带纯台词铁律', () => {
  for (const c of RADIO_CHANNELS) {
    const p = radioChannelPrompt(c.id);
    assert.match(p, /只写说出口的话/);
    assert.match(p, /严禁动作、神态、心理描写/);
  }
  assert.equal(RADIO_CHANNELS.length, 4);
  assert.ok(RADIO_CHANNELS[3].hidden);
});

test('本地兜底稿：没有括号旁白，纸条会被回应', () => {
  for (const id of ['talk', 'music', 'pillow'] as const) {
    const script = fallbackRadioScript(id, '今天有点累');
    assert.ok(script.trim().length > 0, id);
    assert.doesNotMatch(script, /（[^）]*）|\([^)]*\)|\*[^*]*\*/);
  }
  const talk = fallbackRadioScript('talk', '今天有点累');
  assert.match(talk, /纸条/);
  assert.match(talk, /今天有点累/);
});

test('上下文：书 / 纸条 / 上一段都会进 user content', () => {
  const ctx = radioUserContext({
    channel: 'talk',
    bookTitle: '小王子',
    note: '睡不着',
    history: '刚才说到玫瑰。',
  });
  assert.match(ctx, /《小王子》/);
  assert.match(ctx, /睡不着/);
  assert.match(ctx, /刚才说到玫瑰/);
});
