/**
 * 开源项目关注清单单测（临时库，不碰真库；不连 GitHub）。
 * 跑法：node node_modules/tsx/dist/cli.mjs --test tests/open-source.test.ts
 *
 * 重点验证「只放用户自己加的项目」这条新约定：
 * - GET 一开始是空的（后端不再自动扫 package.json 依赖）；
 * - 没有 release / 没点过检查更新，都不会凭空报「有更新」。
 */
import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { openSourceRoutes, parseRepo, isNewer } from '../src/routes/openSource.js';
import { initDatabase, db } from '../src/db/client.js';
import { openSourceProjects } from '../src/db/schema.js';
import { newId, now } from '../src/utils/id.js';

type App = Awaited<ReturnType<typeof buildApp>>;

async function buildApp() {
  initDatabase();
  db.delete(openSourceProjects).run();
  const app = Fastify();
  await app.register(openSourceRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

/** 直接插一条（绕过 GitHub，测纯库逻辑） */
function seed(p: Partial<typeof openSourceProjects.$inferInsert> = {}) {
  const ts = now();
  const id = p.id ?? newId();
  db.insert(openSourceProjects)
    .values({
      id,
      owner: 'acme',
      repo: 'widget',
      repoUrl: 'https://github.com/acme/widget',
      name: 'acme/widget',
      note: null,
      description: null,
      stars: null,
      language: null,
      homepage: null,
      latestVersion: null,
      latestPublishedAt: null,
      seenVersion: null,
      lastCheckedAt: null,
      hasUpdate: false,
      checkError: null,
      sortOrder: 0,
      createdAt: ts,
      updatedAt: ts,
      ...p,
    })
    .run();
  return id;
}

const list = async (app: App) =>
  (await app.inject({ url: '/api/open-source' })).json() as {
    items: { id: string; hasUpdate: boolean; latestVersion: string | null; seenVersion: string | null }[];
    summary: { total: number; updates: number; checkedAt: number | null };
  };

test('parseRepo 容忍各种写法', () => {
  assert.deepEqual(parseRepo('https://github.com/acme/widget'), { owner: 'acme', repo: 'widget' });
  assert.deepEqual(parseRepo('https://github.com/acme/widget.git'), { owner: 'acme', repo: 'widget' });
  assert.deepEqual(parseRepo('github.com/acme/widget/tree/main'), { owner: 'acme', repo: 'widget' });
  assert.deepEqual(parseRepo('acme/widget'), { owner: 'acme', repo: 'widget' });
  assert.deepEqual(parseRepo('  https://github.com/acme/widget  '), { owner: 'acme', repo: 'widget' });
  assert.equal(parseRepo(''), null);
  assert.equal(parseRepo('随便一段不是仓库地址的话'), null);
});

test('isNewer：容忍 v 前缀与预发后缀，只比三段数值', () => {
  assert.equal(isNewer('v1.2.3', 'v1.2.2'), true);
  assert.equal(isNewer('v1.3.0', 'v1.2.9'), true);
  assert.equal(isNewer('v2.0.0', 'v1.99.99'), true);
  assert.equal(isNewer('v1.2.3', 'v1.2.3'), false, '同版不算更新');
  assert.equal(isNewer('v1.2.2', 'v1.2.3'), false, '更旧不算更新');
  assert.equal(isNewer('1.2.3-rc.1', '1.2.3'), false, '预发版不算比正式版新');
});

test('新清单是空的 —— 后端不再自动扫依赖', async () => {
  const app = await buildApp();
  const r = await list(app);
  assert.deepEqual(r.items, []);
  assert.equal(r.summary.total, 0);
  assert.equal(r.summary.updates, 0);
  assert.equal(r.summary.checkedAt, null, '没检查过就没有检查时间');
  await app.close();
});

test('地址不合法 → 400，不会往清单里塞东西', async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/open-source',
    payload: { repoUrl: '这不是仓库地址' },
  });
  assert.equal(res.statusCode, 400);
  assert.equal((await list(app)).summary.total, 0);
  await app.close();
});

test('有更新数只数 hasUpdate 的条；ack 之后红点熄灭', async () => {
  const app = await buildApp();
  seed({ latestVersion: 'v2.0.0', seenVersion: 'v1.0.0', hasUpdate: true });
  const id2 = seed({ owner: 'x', repo: 'y', name: 'x/y', latestVersion: 'v1.0.0', seenVersion: 'v1.0.0' });

  let r = await list(app);
  assert.equal(r.summary.total, 2);
  assert.equal(r.summary.updates, 1);

  // 不存在的 id → 404
  assert.equal((await app.inject({ method: 'POST', url: '/api/open-source/nope/ack' })).statusCode, 404);

  await app.inject({ method: 'POST', url: `/api/open-source/${id2}/ack` });
  r = await list(app);
  assert.equal(r.summary.updates, 1, '本来就最新的那条 ack 完也不该变');
  await app.close();
});

test('ack 把当前版本记为已知 → hasUpdate 归零', async () => {
  const app = await buildApp();
  const id = seed({ latestVersion: 'v2.0.0', seenVersion: 'v1.0.0', hasUpdate: true });
  await app.inject({ method: 'POST', url: `/api/open-source/${id}/ack` });
  const r = await list(app);
  const row = r.items.find((i) => i.id === id)!;
  assert.equal(row.hasUpdate, false);
  assert.equal(row.seenVersion, 'v2.0.0', '已知版本跟到最新');
  assert.equal(r.summary.updates, 0);
  await app.close();
});

test('移除是软删：清单里看不到，但行还在', async () => {
  const app = await buildApp();
  const id = seed();
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/open-source/${id}` })).statusCode, 200);
  assert.equal((await list(app)).summary.total, 0);

  const still = db.select().from(openSourceProjects).all().find((p) => p.id === id);
  assert.ok(still && still.deletedAt != null, '软删：deleted_at 被写上但行还在');

  // 再删一次 → 404
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/open-source/${id}` })).statusCode, 404);
  await app.close();
});

test('刷新空清单不打网络、直接返回 0', async () => {
  const app = await buildApp();
  const r = (await app.inject({ method: 'POST', url: '/api/open-source/refresh', payload: {} }).then((x) => x.json())) as {
    updated: number;
    failed: unknown[];
  };
  assert.equal(r.updated, 0);
  assert.deepEqual(r.failed, []);
  await app.close();
});
