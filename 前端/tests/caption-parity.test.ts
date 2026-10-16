/**
 * 前后端两份 `caption-core` 的**一致性测试**。
 *
 * 为什么会有两份：前后端是两个独立部署单元（各自的 Dockerfile / 镜像），
 * 跨目录引用会让后端的镜像依赖前端的源码树，所以后端放了一份等价实现。
 * 代价是可能漂移 —— 这个测试就是防漂移的闸门：
 * **同一批输入喂给两份实现，输出必须逐字相等**（含 null 的"不可用"结论也要一样）。
 *
 * 改了任意一份都要跑它：
 *   cd 前端 && node ../后端/node_modules/tsx/dist/cli.mjs --test tests/caption-parity.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fe from '../src/lib/caption/core.ts';
import * as be from '../../后端/src/captions/core.ts';

/** 上游用例里的那批输入，外加边界与畸形输入 */
const ALIGNMENT_CASES: Array<{ text: string; characters?: Array<{ text: string; start: number; end: number }> }> = [
  { text: '你好，回来。', characters: [
    { text: '你', start: 2, end: 2.4 },
    { text: '好', start: 2.4, end: 2.8 },
    { text: '回', start: 5, end: 5.4 },
    { text: '来', start: 5.4, end: 5.8 },
  ] },
  { text: '你好', characters: [{ text: '你错', start: 1, end: 2 }] }, // 文本对不上
  { text: '你好', characters: [
    { text: '你', start: 2, end: 3 },
    { text: '好', start: 1, end: 2 }, // 起点逆序
  ] },
  { text: '你好', characters: [] }, // 空
  { text: '你好' }, // 形状全无
  { text: 'a b，c！', characters: [
    { text: 'a', start: 0, end: 0.5 },
    { text: 'b', start: 1, end: 1.5 }, // 标点/空格必须继承前一个 end
    { text: 'c', start: 2, end: 2.5 },
  ] },
  { text: '超范围', characters: [{ text: '超范围', start: 0, end: 3601 }] }, // end > 3600
  { text: '负数', characters: [{ text: '负数', start: -1, end: 1 }] }, // start < 0
  { text: 'emoji👨‍👩‍👧‍👦', characters: [{ text: 'emoji', start: 0, end: 1 }, { text: '👨‍👩‍👧‍👦', start: 1, end: 2 }] },
];

const WORD_CASES: Array<{ text: string; words: Array<{ word: string; start: number; end: number; confidence?: number }>; allowPartial?: boolean }> = [
  { text: '你好，回来。', words: [
    { word: '你好', start: 2, end: 2.8, confidence: 0.99 },
    { word: '回来', start: 5, end: 5.8, confidence: 0.99 },
  ] },
  { text: '你好', words: [{ word: '你好', start: 0, end: 1, confidence: 0.3 }] }, // 低置信
  { text: '你好', words: [{ word: '你好', start: 0, end: 1 }] }, // 缺 confidence
  { text: '这是一段测试文字example未对齐部分', words: [{ word: '这是一段测试文字', start: 0.2, end: 2, confidence: 0.99 }] },
  { text: '这是一段测试文字example未对齐部分', words: [{ word: '这是一段测试文字', start: 0.2, end: 2, confidence: 0.99 }], allowPartial: true },
  { text: '甲乙丙丁戊己庚辛壬癸', words: ['甲', '丙', '戊', '庚'].map((word, i) => ({ word, start: i * 2, end: i * 2 + 1, confidence: 0.99 })), allowPartial: true },
  { text: '前半段对上了后半段没有', words: [{ word: '前半段对上了', start: 0.5, end: 2.5, confidence: 0.95 }], allowPartial: true },
  { text: '时间逆序', words: [
    { word: '时间', start: 3, end: 4, confidence: 0.9 },
    { word: '逆序', start: 1, end: 2, confidence: 0.9 },
  ] },
  { text: '空词表', words: [] },
  { text: '超时长', words: [{ word: '超时长', start: 0, end: 3601, confidence: 0.9 }] },
];

test('parity: normalizeAlignment 两份输出完全一致', () => {
  for (const c of ALIGNMENT_CASES) {
    const a = fe.normalizeAlignment(c.text, c.characters ? { characters: c.characters } : {});
    const b = be.normalizeAlignment(c.text, c.characters ? { characters: c.characters } : {});
    assert.deepEqual(a, b, `不一致：${JSON.stringify(c)}`);
  }
});

test('parity: alignRecognizedWords 两份输出完全一致', () => {
  for (const c of WORD_CASES) {
    const a = fe.alignRecognizedWords(c.text, c.words, { allowPartial: c.allowPartial });
    const b = be.alignRecognizedWords(c.text, c.words, { allowPartial: c.allowPartial });
    assert.deepEqual(a, b, `不一致：${JSON.stringify(c)}`);
  }
});

test('parity: withDefaultConfidence 两份输出完全一致', () => {
  const words = [{ word: '你好', start: 1, end: 2 }, { word: '回来', start: 3, end: 4 }];
  assert.deepEqual(fe.withDefaultConfidence(words), be.withDefaultConfidence(words));
});

/** 随机化：手写用例容易漏掉那些"两边都写错但错得不一样"的角落 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

test('parity: 随机输入下两份输出仍然一致', () => {
  const rand = rng(20261017);
  const pool = '你好回来这是一段测试文字abc，。！?123 ';
  for (let round = 0; round < 300; round++) {
    const len = 1 + Math.floor(rand() * 24);
    let text = '';
    for (let i = 0; i < len; i++) text += pool[Math.floor(rand() * pool.length)];

    // 一半走词级、一半走字符级
    if (rand() < 0.5) {
      const n = Math.floor(rand() * 5);
      const words = [];
      let t = 0;
      for (let i = 0; i < n; i++) {
        const w = pool.slice(Math.floor(rand() * 8), Math.floor(rand() * 8) + 1 + Math.floor(rand() * 3));
        if (!w.trim()) continue;
        const dur = 0.2 + rand() * 1.5;
        words.push({ word: w, start: t, end: t + dur, confidence: rand() < 0.85 ? 0.7 + rand() * 0.3 : rand() * 0.6 });
        t += dur + rand() * 1.5;
      }
      const allowPartial = rand() < 0.5;
      assert.deepEqual(
        fe.alignRecognizedWords(text, words, { allowPartial }),
        be.alignRecognizedWords(text, words, { allowPartial }),
        `词级不一致 round=${round} text=${JSON.stringify(text)}`,
      );
    } else {
      const n = Math.floor(rand() * 8);
      const characters = [];
      let t = 0;
      for (let i = 0; i < n; i++) {
        const ch = pool[Math.floor(rand() * pool.length)];
        const dur = rand() * 1.2;
        characters.push({ text: ch, start: t, end: t + dur });
        t += dur + rand() * 0.8;
      }
      assert.deepEqual(
        fe.normalizeAlignment(text, { characters }),
        be.normalizeAlignment(text, { characters }),
        `字符级不一致 round=${round} text=${JSON.stringify(text)}`,
      );
    }
  }
});
