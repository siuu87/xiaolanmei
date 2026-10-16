/**
 * caption-core 移植回归测试。
 *
 * 用例外 1–11 **逐条对照上游 `caption-core.test.mjs`**（nonchaiovo/nest-voice-captions），
 * 用来保证「移植只做类型化、没改语义」。改动 core.ts 后必须重跑，任何一条对不上都说明移植跑偏了。
 *
 * 跑法（前端没有 tsx/@types，借后端的）：
 *   cd 前端 && node ../后端/node_modules/tsx/dist/cli.mjs --test tests/caption-core.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alignRecognizedWords,
  normalizeAlignment,
  normalizeVoiceMp3Seek,
  readCountAt,
  voiceRevealTimes,
  voiceTextUnits,
  withDefaultConfidence,
  type Cue,
} from '../src/lib/caption/core.ts';

/* ================= 上游用例 1–7：文本对齐 ================= */

test('graphemes preserve a combined accent and a family emoji', () => {
  assert.deepEqual(voiceTextUnits('e\u0301👨‍👩‍👧‍👦'), [{ char: 'e\u0301' }, { char: '👨‍👩‍👧‍👦' }]);
});

test('forced alignment preserves introductory and internal audio gaps', () => {
  const cues = normalizeAlignment('你好，回来。', {
    characters: [
      { text: '你', start: 2, end: 2.4 },
      { text: '好', start: 2.4, end: 2.8 },
      { text: '回', start: 5, end: 5.4 },
      { text: '来', start: 5.4, end: 5.8 },
    ],
  });
  assert.deepEqual(
    cues?.map((c) => c.start),
    [2, 2.4, 2.8, 5, 5.4, 5.8],
  );
});

test('mismatched or reversed alignment is rejected', () => {
  assert.equal(normalizeAlignment('你好', { characters: [{ text: '你错', start: 1, end: 2 }] }), null);
  assert.equal(
    normalizeAlignment('你好', {
      characters: [
        { text: '你', start: 2, end: 3 },
        { text: '好', start: 1, end: 2 },
      ],
    }),
    null,
  );
  assert.equal(normalizeAlignment('你好', {}), null);
});

test('word timing remains measured while visual reveal subdivides the word', () => {
  const cues = alignRecognizedWords('你好，回来。', [
    { word: '你好', start: 2, end: 2.8, confidence: 0.99 },
    { word: '回来', start: 5, end: 5.8, confidence: 0.99 },
  ]);
  assert.deepEqual(cues?.map((c) => c.start), [2, 2, null, 5, 5, null]);
  assert.deepEqual(voiceRevealTimes(cues as Cue[], 'deepgram-word-timestamps'), [2, 2.4, null, 5, 5.4, null]);
  // 关键：voiceRevealTimes **不能**改到 cues 本身（跳播时间必须保持词的起点）
  assert.deepEqual(cues?.map((c) => c.start), [2, 2, null, 5, 5, null]);
  assert.deepEqual(voiceRevealTimes(cues as Cue[], 'elevenlabs-forced-alignment'), [2, 2, null, 5, 5, null]);
});

test('low-confidence recognition does not produce seek times', () => {
  assert.equal(alignRecognizedWords('你好', [{ word: '你好', start: 0, end: 1, confidence: 0.3 }]), null);
});

test('saved partial alignment keeps an anchored phrase and leaves the rest untimed', () => {
  const text = '这是一段测试文字example未对齐部分';
  const words = [{ word: '这是一段测试文字', start: 0.2, end: 2, confidence: 0.99 }];
  assert.equal(alignRecognizedWords(text, words), null);
  const cues = alignRecognizedWords(text, words, { allowPartial: true });
  assert.equal(cues?.[0].start, 0.2);
  assert.equal(cues?.at(-1)?.start, null);
});

test('sparse coincidental matches do not satisfy partial alignment', () => {
  const words = ['甲', '丙', '戊', '庚'].map((word, i) => ({ word, start: i * 2, end: i * 2 + 1, confidence: 0.99 }));
  assert.equal(alignRecognizedWords('甲乙丙丁戊己庚辛壬癸', words, { allowPartial: true }), null);
});

/* ================= 上游用例 8–11：MP3 索引兼容 ================= */

const frame = (marker?: string): Uint8Array => {
  const b = new Uint8Array(576);
  b.set([255, 251, 152, 192]);
  if (marker) b.set(new TextEncoder().encode(marker), 21);
  return b;
};
const join = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

test('multiple MP3 indexes are disabled without moving or changing speech frames', () => {
  const bytes = join(frame('Info'), frame(), frame('Info'), frame(), frame('Xing'), frame());
  const fixed = normalizeVoiceMp3Seek(bytes);
  const expected = new Uint8Array(bytes);
  for (const at of [21, 1173, 2325]) expected.fill(0, at, at + 4);
  assert.notEqual(fixed, bytes);
  assert.deepEqual(fixed, expected);
  assert.equal(new TextDecoder().decode(bytes.slice(21, 25)), 'Info');
});

test('single MP3 indexes and marker-like speech bytes remain unchanged', () => {
  const bytes = join(frame('Info'), frame());
  bytes.set(new TextEncoder().encode('Info'), 650);
  assert.equal(normalizeVoiceMp3Seek(bytes), bytes);
});

test('malformed and truncated MP3 data remain unchanged', () => {
  const bytes = join(frame('Info'), frame('Info'), new Uint8Array([1, 2, 3]));
  assert.equal(normalizeVoiceMp3Seek(bytes), bytes);
  const fake = new TextEncoder().encode('Info fake Info');
  assert.equal(normalizeVoiceMp3Seek(fake), fake);
});

test('ID3-prefixed segments keep tag bytes and offsets intact', () => {
  const id3 = new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]);
  const bytes = join(id3, frame('Info'), frame(), id3, frame('Xing'), frame());
  const fixed = normalizeVoiceMp3Seek(bytes);
  assert.notEqual(fixed, bytes);
  assert.deepEqual(fixed.slice(0, 10), id3);
  assert.deepEqual(Array.from(fixed.slice(31, 35)), [0, 0, 0, 0]);
});

// 移植时加的护栏：Node 的 Buffer 覆盖了 slice()（subarray 语义、共享内存）。
// 如果实现里用 bytes.slice() 复制，传 Buffer 进来会把调用方的原始字节改掉。
test('a Node Buffer input is never mutated in place', () => {
  const buf = Buffer.from(join(frame('Info'), frame(), frame('Info'), frame()));
  const before = Buffer.from(buf);
  const fixed = normalizeVoiceMp3Seek(new Uint8Array(buf));
  assert.deepEqual(buf, before, 'Buffer 入参被就地改写了');
  assert.notDeepEqual(fixed, new Uint8Array(buf));
});

/* ================= 移植时补的用例：输入适配 + 已读前缀 ================= */

test('groq words without confidence are dropped unless defaulted', () => {
  const words = [
    { word: '你好', start: 2, end: 2.8 },
    { word: '回来', start: 5, end: 5.8 },
  ];
  // 上游语义：缺 confidence 一律丢弃（undefined >= 0.7 为 false）
  assert.equal(alignRecognizedWords('你好，回来。', words), null);
  // 补上默认置信度后可用
  const cues = alignRecognizedWords('你好，回来。', withDefaultConfidence(words));
  assert.deepEqual(cues?.map((c) => c.start), [2, 2, null, 5, 5, null]);
});

test('readCountAt: no measured timing falls back to a display-only estimate', () => {
  const cues: Cue[] = voiceTextUnits('一二三四').map((u) => ({ text: u.char, start: null, end: null }));
  const reveal = voiceRevealTimes(cues, 'deepgram-word-timestamps');
  assert.equal(readCountAt(0, 10, cues, reveal, 4), 0);
  assert.equal(readCountAt(5, 10, cues, reveal, 4), 2); // 估算：只用于显示
  assert.equal(readCountAt(10, 10, cues, reveal, 4), 4);
});

test('readCountAt: measured timing keeps real gaps and completes at the end', () => {
  const cues: Cue[] = [
    { text: '你', start: 2, end: 2.8 },
    { text: '好', start: 2, end: 2.8 },
    { text: '，', start: 2.8, end: 2.8 },
    { text: '回', start: 5, end: 5.8 },
    { text: '来', start: 5, end: 5.8 },
    { text: '。', start: 5.8, end: 5.8 },
  ];
  const reveal = voiceRevealTimes(cues, 'deepgram-word-timestamps');
  assert.equal(readCountAt(1.5, 6, cues, reveal, 6), 0);
  assert.equal(readCountAt(2.5, 6, cues, reveal, 6), 2); // 「你」已读
  assert.equal(readCountAt(3.0, 6, cues, reveal, 6), 3); // 标点跟着变深
  assert.equal(readCountAt(4.9, 6, cues, reveal, 6), 3); // 2.8→5 的停顿没被摊平
  assert.equal(readCountAt(5.1, 6, cues, reveal, 6), 4);
  assert.equal(readCountAt(5.99, 6, cues, reveal, 6), 6); // 自然结束补齐末尾标点
});

test('readCountAt: invalid duration yields zero', () => {
  assert.equal(readCountAt(3, 0, [], [], 0), 0);
  assert.equal(readCountAt(3, Number.NaN, [], [], 5), 0);
});
