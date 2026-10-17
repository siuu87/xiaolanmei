/**
 * 灵感与待办池路由单测（2026-10-18 重构：is_todo + completed 二态统一模型）。
 * 用临时库跑 CRUD + 重排 + 清理，不碰真实库。
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

type Item = {
  id: string;
  content: string;
  isTodo: boolean;
  completed: boolean;
  completedAt: number | null;
  sortOrder: number;
};

type App = Awaited<ReturnType<typeof buildApp>>;

async function buildApp() {
  initDatabase();
  // db 是模块级单例，多个 test() 共享同一个临时库 → 每个用例前清空，保证隔离
  db.delete(pluginWishlist).run();
  const app = Fastify();
  await app.register(pluginWishlistRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

const list = async (app: App) =>
  (await app.inject({ url: '/api/plugin-wishlist' })).json() as Item[];

const create = async (app: App, payload: Record<string, unknown>) =>
  (await app.inject({ method: 'POST', url: '/api/plugin-wishlist', payload }).then((r) => r.json()) as { id: string })
    .id;

test('新增：默认是灵感，isTodo:true 才是待办；content 必填', async () => {
  const app = await buildApp();
  const id1 = await create(app, { content: '写首诗' });
  assert.match(id1, /\S+/);
  const id2 = await create(app, { content: '交电费', isTodo: true });

  const bad = await app.inject({ method: 'POST', url: '/api/plugin-wishlist', payload: { content: '   ' } });
  assert.equal(bad.statusCode, 400);

  const items = await list(app);
  assert.equal(items.length, 2);
  const a = items.find((x) => x.id === id1)!;
  const b = items.find((x) => x.id === id2)!;
  assert.equal(a.isTodo, false, '不传 isTodo → 灵感（Inbox）');
  assert.equal(a.completed, false);
  assert.equal(a.completedAt, null);
  assert.equal(b.isTodo, true, 'isTodo:true → 待办（Todo）');
  await app.close();
});

test('PATCH：灵感↔待办切换，完成态自动写/清 completed_at', async () => {
  const app = await buildApp();
  const id = await create(app, { content: 'x' });

  await app.inject({ method: 'PATCH', url: `/api/plugin-wishlist/${id}`, payload: { isTodo: true } });
  assert.equal((await list(app)).find((x) => x.id === id)!.isTodo, true);

  await app.inject({ method: 'PATCH', url: `/api/plugin-wishlist/${id}`, payload: { completed: true } });
  let it = (await list(app)).find((x) => x.id === id)!;
  assert.equal(it.completed, true);
  assert.equal(typeof it.completedAt, 'number', '完成时应写入 completed_at');

  await app.inject({ method: 'PATCH', url: `/api/plugin-wishlist/${id}`, payload: { completed: false } });
  it = (await list(app)).find((x) => x.id === id)!;
  assert.equal(it.completed, false);
  assert.equal(it.completedAt, null, '取消完成应清空 completed_at');

  const miss = await app.inject({ method: 'PATCH', url: '/api/plugin-wishlist/nope', payload: { completed: true } });
  assert.equal(miss.statusCode, 404);
  await app.close();
});

test('已完成项沉底', async () => {
  const app = await buildApp();
  const a = await create(app, { content: 'A' });
  const b = await create(app, { content: 'B' });
  await app.inject({ method: 'PATCH', url: `/api/plugin-wishlist/${a}`, payload: { completed: true } });
  assert.deepEqual(
    (await list(app)).map((x) => x.id),
    [b, a],
    '未完成在前，已完成沉底',
  );
  await app.close();
});

test('reorder 改变顺序', async () => {
  const app = await buildApp();
  const a = await create(app, { content: 'A' });
  const b = await create(app, { content: 'B' });
  const c = await create(app, { content: 'C' });

  await app.inject({ method: 'POST', url: '/api/plugin-wishlist/reorder', payload: { ids: [c, b, a] } });
  assert.deepEqual(
    (await list(app)).map((x) => x.id),
    [c, b, a],
  );

  const bad = await app.inject({ method: 'POST', url: '/api/plugin-wishlist/reorder', payload: { ids: 'notarray' } });
  assert.equal(bad.statusCode, 400);
  await app.close();
});

test('DELETE 软删，列表不再出现', async () => {
  const app = await buildApp();
  const id = await create(app, { content: 'del' });
  await app.inject({ method: 'DELETE', url: `/api/plugin-wishlist/${id}` });
  assert.equal((await list(app)).length, 0);
  await app.close();
});

test('clear-completed 只清已完成项', async () => {
  const app = await buildApp();
  const done = await create(app, { content: '已完成' });
  const alive = await create(app, { content: '未完成' });
  await app.inject({ method: 'PATCH', url: `/api/plugin-wishlist/${done}`, payload: { completed: true } });

  const res = await app.inject({ method: 'POST', url: '/api/plugin-wishlist/clear-completed' });
  assert.equal(res.statusCode, 200);
  assert.equal((res.json() as { cleared: number }).cleared, 1);

  assert.deepEqual(
    (await list(app)).map((x) => x.id),
    [alive],
    '只清已完成，未完成保留',
  );
  await app.close();
});
