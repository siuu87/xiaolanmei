/**
 * 灵感待办池路由单测：用临时库跑 CRUD + 重排，不碰真实库。
 * 跑法：node node_modules/tsx/dist/cli.mjs --test tests/plugin-wishlist.test.ts
 */
import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { pluginWishlistRoutes } from '../src/routes/pluginWishlist.js';
import { initDatabase } from '../src/db/client.js';
import { db } from '../src/db/client.js';
import { pluginWishlist } from '../src/db/schema.js';

async function buildApp() {
  initDatabase();
  // db 是模块级单例，多个 test() 共享同一个临时库 → 每个用例前清空，保证隔离
  db.delete(pluginWishlist).run();
  const app = Fastify();
  await app.register(pluginWishlistRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

test('新增 + 列表 + 校验', async () => {
  const app = await buildApp();
  const c1 = await app.inject({ method: 'POST', url: '/api/plugin-wishlist', payload: { content: '写首诗', kind: 'idea' } });
  assert.equal(c1.statusCode, 201);
  const id1 = (c1.json() as { id: string }).id;
  assert.match(id1, /\S+/);

  const c2 = await app.inject({ method: 'POST', url: '/api/plugin-wishlist', payload: { content: '去冰岛', kind: 'wish' } });
  const id2 = (c2.json() as { id: string }).id;

  const bad = await app.inject({ method: 'POST', url: '/api/plugin-wishlist', payload: { content: '   ' } });
  assert.equal(bad.statusCode, 400);

  const list = (await app.inject({ url: '/api/plugin-wishlist' })).json() as Array<{ id: string; kind: string; done: boolean }>;
  assert.equal(list.length, 2);
  assert.ok(list.find((x) => x.id === id1 && x.kind === 'idea'));
  assert.ok(list.find((x) => x.id === id2 && x.kind === 'wish'));
  await app.close();
});

test('PATCH 完成态 + 非法 kind 归 idea', async () => {
  const app = await buildApp();
  const id = (await app.inject({ method: 'POST', url: '/api/plugin-wishlist', payload: { content: 'x' } }).then((r) => r.json()) as { id: string }).id;

  await app.inject({ method: 'PATCH', url: `/api/plugin-wishlist/${id}`, payload: { done: true } });
  let item = ((await app.inject({ url: '/api/plugin-wishlist' })).json() as Array<{ id: string; done: boolean }>).find((x) => x.id === id)!;
  assert.equal(item.done, true);

  await app.inject({ method: 'PATCH', url: `/api/plugin-wishlist/${id}`, payload: { kind: 'bogus' } });
  item = ((await app.inject({ url: '/api/plugin-wishlist' })).json() as Array<{ id: string; kind: string }>).find((x) => x.id === id)!;
  assert.equal(item.kind, 'idea');

  // 不存在的 id → 404
  const miss = await app.inject({ method: 'PATCH', url: '/api/plugin-wishlist/nope', payload: { done: true } });
  assert.equal(miss.statusCode, 404);
  await app.close();
});

test('reorder 改变顺序', async () => {
  const app = await buildApp();
  const mk = async (content: string) =>
    (await app.inject({ method: 'POST', url: '/api/plugin-wishlist', payload: { content } }).then((r) => r.json()) as { id: string }).id;
  const a = await mk('A');
  const b = await mk('B');
  const c = await mk('C');

  await app.inject({ method: 'POST', url: '/api/plugin-wishlist/reorder', payload: { ids: [c, b, a] } });
  const order = ((await app.inject({ url: '/api/plugin-wishlist' })).json() as Array<{ id: string }>).map((x) => x.id);
  assert.deepEqual(order, [c, b, a]);

  const bad = await app.inject({ method: 'POST', url: '/api/plugin-wishlist/reorder', payload: { ids: 'notarray' } });
  assert.equal(bad.statusCode, 400);
  await app.close();
});

test('DELETE 软删，列表不再出现', async () => {
  const app = await buildApp();
  const id = (await app.inject({ method: 'POST', url: '/api/plugin-wishlist', payload: { content: 'del' } }).then((r) => r.json()) as { id: string }).id;
  await app.inject({ method: 'DELETE', url: `/api/plugin-wishlist/${id}` });
  const list = (await app.inject({ url: '/api/plugin-wishlist' })).json() as unknown[];
  assert.equal(list.length, 0);
  await app.close();
});
