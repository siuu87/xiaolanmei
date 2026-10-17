/**
 * 饮食与健康档案（忌口 / 过敏源）单测：临时库，不碰真库。
 * 跑法：node node_modules/tsx/dist/cli.mjs --test tests/diet-profile.test.ts
 */
import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDietProfile,
  cleanName,
  matchDietHits,
  parseMemoDiet,
  parsePersonaDiet,
  splitList,
  type MemoRow,
} from '../src/diet/profile.js';

const memo = (title: string, content = title, tags: string[] = []): MemoRow => ({
  title,
  content,
  tags,
  deletedAt: null,
});

test('未定义 → 空档案，绝不填充任何内置食物', () => {
  const p = parsePersonaDiet({});
  assert.deepEqual(p, { dislikes: [], allergies: [] }, '没给变量 → 全空');

  const m = parseMemoDiet([memo('今天吃了番茄牛腩', '很好吃')]);
  assert.deepEqual(m, { dislikes: [], allergies: [] }, '普通备忘不该被当成忌口');
});

test('cleanName 剥掉停用词，剩下食物名', () => {
  assert.equal(cleanName('她对花生'), '花生');
  assert.equal(cleanName('我芒果'), '芒果');
  assert.equal(cleanName('香菜'), '香菜');
  assert.equal(cleanName('「洋葱」'), '洋葱');
  assert.equal(cleanName(''), null);
  assert.equal(cleanName('   '), null);
  assert.equal(cleanName('3'), null, '纯数字不算食物名');
  assert.equal(cleanName('今天天气真好今天天气真好今天天气真好'), null, '超长句子不算食物名');
});

test('人设变量按顿号/逗号切分成列表', () => {
  assert.deepEqual(splitList('芒果、花生 冰的'), ['芒果', '花生', '冰的']);
  assert.deepEqual(splitList('芒果，花生；洋葱'), ['芒果', '花生', '洋葱']);
  assert.deepEqual(splitList(null), []);
  assert.deepEqual(splitList(''), []);
});

test('人设读取 diet_dislikes / diet_allergies', () => {
  const p = parsePersonaDiet({ diet_dislikes: '冰的、香菜', diet_allergies: '芒果' });
  assert.deepEqual(p.dislikes, ['冰的', '香菜']);
  assert.deepEqual(p.allergies, ['芒果']);
});

test('备忘录：前置型（过敏 / 忌口）—— 食物在标记前', () => {
  const p = parseMemoDiet([memo('她对花生严重过敏'), memo('芒果 忌口')]);
  assert.deepEqual(p.allergies, ['花生'], '「她对花生严重过敏」→ 花生');
  assert.deepEqual(p.dislikes, ['芒果'], '「芒果 忌口」→ 芒果');
});

test('备忘录：后置型（不吃 / 戒 / 避开）—— 食物在标记后', () => {
  const p = parseMemoDiet([memo('记录：小猫不吃香菜'), memo('戒酒了'), memo('买菜避开洋葱')]);
  assert.deepEqual(p.dislikes, ['香菜', '酒', '洋葱']);
});

test('备忘录：标签优先，且一条只定一个级别', () => {
  const p = parseMemoDiet([
    memo('花生', '吃了会肿', ['过敏']),
    memo('香菜', '闻着就不行', ['忌口']),
  ]);
  assert.deepEqual(p.allergies, ['花生']);
  assert.deepEqual(p.dislikes, ['香菜']);
});

test('软删的备忘录不参与解析', () => {
  const p = parseMemoDiet([{ title: '她对花生过敏', content: '她对花生过敏', tags: [], deletedAt: 123 }]);
  assert.deepEqual(p.allergies, []);
});

test('合并：过敏优先于忌口，同名只留过敏', () => {
  const p = buildDietProfile({
    personaVars: { diet_dislikes: '芒果、香菜', diet_allergies: '芒果' },
    memos: [memo('她对花生过敏')],
  });
  assert.deepEqual(p.allergies, ['芒果', '花生'], '人设在前，备忘录在后');
  assert.deepEqual(p.dislikes, ['香菜'], '芒果已是过敏，不再当忌口');
});

test('人设 + 备忘录两处都能喂进档案（去重保序）', () => {
  const p = buildDietProfile({
    personaVars: { diet_dislikes: '香菜' },
    memos: [memo('她对花生过敏'), memo('不吃香菜')],
  });
  assert.deepEqual(p.allergies, ['花生']);
  assert.deepEqual(p.dislikes, ['香菜'], '重复项只留一条');
});

test('命中检测：过敏排前面，大小写不敏感', () => {
  const profile = buildDietProfile({
    personaVars: { diet_dislikes: '香菜', diet_allergies: '芒果、Peanut' },
    memos: [],
  });
  const hits = matchDietHits('来一份芒果西米露，加 peanut 碎，别放香菜', profile);
  assert.deepEqual(
    hits.map((h) => `${h.name}:${h.level}`),
    ['芒果:allergy', 'Peanut:allergy', '香菜:dislike'],
  );

  assert.deepEqual(matchDietHits('', profile), [], '空文本不命中');
  assert.deepEqual(matchDietHits('番茄牛腩', profile), [], '没提到就不该命中');
});
