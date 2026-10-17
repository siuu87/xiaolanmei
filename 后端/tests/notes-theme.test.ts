/**
 * 信件（notes）信封主题 `letter_theme` 单测：临时库，不碰真库。
 * 跑法：node node_modules/tsx/dist/cli.mjs --test tests/notes-theme.test.ts
 */
import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { noteRoutes } from '../src/routes/notes.js';
import { initDatabase } from '../src/db/client.js';
import { db } from '../src/db/client.js';
import { notes } from '../src/db/schema.js';

type NoteDTO = { id: string; content: string; letterTheme: string; createdAt: number };
type App = Awaited<ReturnType<typeof buildApp>>;

async function buildApp() {
  initDatabase();
  // db 是模块级单例，多个 test() 共享同一个临时库 → 每个用例前清空，保证隔离
  db.delete(notes).run();
  const app = Fastify();
  await app.register(noteRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

const listNotes = async (app: App) =>
  (await app.inject({ url: '/api/notes' })).json() as NoteDTO[];

const createNote = async (app: App, payload: Record<string, unknown>) =>
  (await app.inject({ method: 'POST', url: '/api/notes', payload }).then((r) => r.json()) as { id: string })
    .id;

test('默认主题是 default，可指定 memorial / night', async () => {
  const app = await buildApp();
  const a = await createNote(app, { content: '普通信' });
  const b = await createNote(app, { content: '纪念日信', letterTheme: 'memorial' });
  const c = await createNote(app, { content: '深夜信', letterTheme: 'night' });

  const all = await listNotes(app);
  assert.equal(all.find((n) => n.id === a)!.letterTheme, 'default', '不传 → default');
  assert.equal(all.find((n) => n.id === b)!.letterTheme, 'memorial');
  assert.equal(all.find((n) => n.id === c)!.letterTheme, 'night');
  await app.close();
});

test('非法主题兜底回 default（不让前端拿到枚举外的值）', async () => {
  const app = await buildApp();
  const id = await createNote(app, { content: 'x', letterTheme: 'bogus' });
  const all = await listNotes(app);
  assert.equal(all.find((n) => n.id === id)!.letterTheme, 'default');
  await app.close();
});

test('PATCH 可改主题，不存在的信 404', async () => {
  const app = await buildApp();
  const id = await createNote(app, { content: 'x' });

  await app.inject({ method: 'PATCH', url: `/api/notes/${id}`, payload: { letterTheme: 'night' } });
  assert.equal((await listNotes(app)).find((n) => n.id === id)!.letterTheme, 'night');

  // 非法值同样兜底
  await app.inject({ method: 'PATCH', url: `/api/notes/${id}`, payload: { letterTheme: 'nope' } });
  assert.equal((await listNotes(app)).find((n) => n.id === id)!.letterTheme, 'default');

  const miss = await app.inject({ method: 'PATCH', url: '/api/notes/nope', payload: { letterTheme: 'night' } });
  assert.equal(miss.statusCode, 404);
  await app.close();
});
