/**
 * 饮食档案路由单测（临时库，不碰真库）：
 * GET /diet/profile 与 POST /diet/check 真的从「人设变量 + 备忘录」里读。
 * 跑法：node node_modules/tsx/dist/cli.mjs --test tests/diet-route.test.ts
 */
import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { dietRoutes } from '../src/routes/diet.js';
import { initDatabase, db } from '../src/db/client.js';
import { prompts, ragDocuments } from '../src/db/schema.js';
import { newId, now } from '../src/utils/id.js';

type App = Awaited<ReturnType<typeof buildApp>>;

async function buildApp() {
  initDatabase();
  // db 是模块级单例，多个 test() 共享同一个临时库 → 每个用例前清空，保证隔离
  db.delete(prompts).run();
  db.delete(ragDocuments).run();
  const app = Fastify();
  await app.register(dietRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

function seedPersona(variables: Record<string, string>) {
  const ts = now();
  db.insert(prompts)
    .values({
      id: newId(),
      type: 'global',
      model: null,
      name: '模块四 · 用户专属事实备忘库',
      content: '忌口：{{diet_dislikes}}｜过敏：{{diet_allergies}}',
      variables: JSON.stringify(variables),
      enabled: true,
      sortOrder: 40,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
}

function seedMemo(title: string, content: string, tags: string[] = []) {
  const ts = now();
  db.insert(ragDocuments)
    .values({
      id: newId(),
      title,
      content,
      chunkCount: 0,
      source: 'manual',
      category: 'general',
      tags: tags.length ? JSON.stringify(tags) : null,
      importance: 3,
      pinned: false,
      order: 0,
      authorType: 'user',
      ownerSide: 'me',
      status: 'unfiled',
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
}

const profile = async (app: App) =>
  (await app.inject({ url: '/api/diet/profile' })).json() as {
    dislikes: string[];
    allergies: string[];
  };

const check = async (app: App, text: string) =>
  (await app.inject({ method: 'POST', url: '/api/diet/check', payload: { text } }).then((r) => r.json()) as {
    hits: { name: string; level: string }[];
    hasAllergy: boolean;
  });

test('什么都没配 → 空档案，绝不填充内置食物', async () => {
  const app = await buildApp();
  assert.deepEqual(await profile(app), { dislikes: [], allergies: [] });
  assert.deepEqual((await check(app, '来份芒果西米露')).hits, []);
  await app.close();
});

test('人设变量进档案，命中检测分级别', async () => {
  const app = await buildApp();
  seedPersona({ diet_dislikes: '冰的、香菜', diet_allergies: '芒果' });

  assert.deepEqual(await profile(app), { dislikes: ['冰的', '香菜'], allergies: ['芒果'] });

  const hit1 = await check(app, '给你点了芒果西米露');
  assert.deepEqual(hit1.hits, [{ name: '芒果', level: 'allergy' }]);
  assert.equal(hit1.hasAllergy, true, '命中过敏源 → hasAllergy');

  const hit2 = await check(app, '这碗面别放香菜');
  assert.deepEqual(hit2.hits, [{ name: '香菜', level: 'dislike' }]);
  assert.equal(hit2.hasAllergy, false, '只命中忌口不算硬拦截');
  await app.close();
});

test('备忘录里记一笔也能进档案（两条来源合并）', async () => {
  const app = await buildApp();
  seedPersona({ diet_dislikes: '香菜', diet_allergies: '芒果' });
  seedMemo('她对花生过敏', '她对花生过敏');
  seedMemo('小猫不吃洋葱', '小猫不吃洋葱');

  const p = await profile(app);
  assert.deepEqual(p.allergies, ['芒果', '花生'], '人设在前、备忘录在后');
  assert.deepEqual(p.dislikes, ['香菜', '洋葱']);

  const hit = await check(app, '花生过敏，洋葱也不吃');
  assert.deepEqual(
    hit.hits.map((h) => `${h.name}:${h.level}`),
    ['花生:allergy', '洋葱:dislike'],
    '过敏排前面',
  );
  await app.close();
});

test('停用（enabled=0）的人设模块不参与解析', async () => {
  const app = await buildApp();
  const ts = now();
  db.insert(prompts)
    .values({
      id: newId(),
      type: 'global',
      model: null,
      name: '模块四 · 用户专属事实备忘库',
      content: 'x',
      variables: JSON.stringify({ diet_allergies: '芒果' }),
      enabled: false,
      sortOrder: 40,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  assert.deepEqual(await profile(app), { dislikes: [], allergies: [] });
  await app.close();
});
