/**
 * 饮食忌口 / 过敏徽章单测（纯函数层）。
 * 跑法（前端没有 tsx，借后端的）：
 *   cd 前端 && node ../后端/node_modules/tsx/dist/cli.mjs --test tests/diet.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dietBadgeClass, dietBadgeText, matchDietHits, type DietProfile } from '@/features/diet/dietHits';

const profile: DietProfile = { dislikes: ['冰的', '香菜'], allergies: ['芒果', 'Peanut'] };

test('没配档案 → 不命中任何东西', () => {
  assert.deepEqual(matchDietHits('芒果西米露', { dislikes: [], allergies: [] }), []);
  assert.deepEqual(matchDietHits('', profile), [], '空文本也不命中');
});

test('过敏排前面，同一名字只报一次', () => {
  const hits = matchDietHits('来份芒果西米露，加 Peanut 碎，别放香菜', profile);
  assert.deepEqual(
    hits.map((h) => `${h.name}:${h.level}`),
    ['芒果:allergy', 'Peanut:allergy', '香菜:dislike'],
  );
});

test('英文命中大小写不敏感', () => {
  assert.deepEqual(matchDietHits('peanut butter', profile), [{ name: 'Peanut', level: 'allergy' }]);
});

test('同一条目同时是过敏和忌口时只报过敏（更重的级别）', () => {
  const p: DietProfile = { dislikes: ['芒果'], allergies: ['芒果'] };
  assert.deepEqual(matchDietHits('芒果蛋糕', p), [{ name: '芒果', level: 'allergy' }]);
});

test('胶囊文案与配色由级别决定', () => {
  assert.equal(dietBadgeText({ name: '芒果', level: 'allergy' }), '芒果 · 严重过敏');
  assert.equal(dietBadgeText({ name: '香菜', level: 'dislike' }), '香菜 · 忌口');

  assert.match(dietBadgeClass('allergy'), /bg-red-500\/25/);
  assert.match(dietBadgeClass('allergy'), /text-red-400/);
  assert.match(dietBadgeClass('allergy'), /border-red-500\/40/);
  assert.match(dietBadgeClass('dislike'), /bg-amber-500\/20/);
  assert.match(dietBadgeClass('dislike'), /text-amber-300/);
  assert.match(dietBadgeClass('dislike'), /border-amber-500\/30/);
});
