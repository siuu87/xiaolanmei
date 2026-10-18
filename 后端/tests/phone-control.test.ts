/**
 * 手机控制中枢单测（临时库，不碰真库；用真实 HTTP + SSE 模拟原生客户端）。
 * 跑法：node node_modules/tsx/dist/cli.mjs --test tests/phone-control.test.ts
 *
 * 验证：离线状态、SSE 连接后状态、指令经 SSE 下发 → 回报 → 指令 Promise 解挂的全链路。
 */
import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { phoneControlRoutes } from '../src/routes/phoneControl.js';
import { phoneHub } from '../src/phoneControl/hub.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function startServer() {
  const app = Fastify();
  await app.register(phoneControlRoutes, { prefix: '/api' });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { app, base: `http://127.0.0.1:${port}` };
}

/** 连上 SSE 流，解析 command 事件，提供 nextCommand() 等待下一条指令 */
async function connectSSE(base: string, clientId: string) {
  const res = await fetch(`${base}/api/phone-control/stream?clientId=${clientId}`);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const queue: { reqId: string; tool: string; args: Record<string, unknown> }[] = [];
  const waiters: ((v: any) => void)[] = [];

  (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let ev = 'message';
        let data = '';
        for (const line of chunk.split('\n')) {
          if (line.startsWith('event:')) ev = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (ev === 'command' && data) {
          const parsed = JSON.parse(data);
          queue.push(parsed);
          if (waiters.length) waiters.shift()!(queue.shift());
        }
      }
    }
  })();

  return {
    nextCommand: () =>
      new Promise<{ reqId: string; tool: string; args: Record<string, unknown> }>((resolve) => {
        if (queue.length) return resolve(queue.shift()!);
        waiters.push(resolve);
      }),
    close: () => reader.cancel(),
  };
}

const status = async (base: string) => (await (await fetch(`${base}/api/phone-control/status`)).json()) as { connected: boolean };

test('离线：无客户端时 status 为 false，command 直接 503', async () => {
  const { app, base } = await startServer();
  try {
    assert.equal((await status(base)).connected, false);
    const res = await fetch(`${base}/api/phone-control/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tool: 'tap', args: { text: '设置' } }),
    });
    assert.equal(res.status, 503);
    const j = (await res.json()) as { message: string };
    assert.equal(j.message, 'PHONE_OFFLINE');
  } finally {
    await app.close();
  }
});

test('全链路：SSE 下发指令 → 回报 → 指令 Promise 解挂', async () => {
  const { app, base } = await startServer();
  const client = await connectSSE(base, 'test-1');
  try {
    // 连接后状态变在线
    await sleep(150);
    assert.equal((await status(base)).connected, true);
    assert.ok(phoneHub.listClients().includes('test-1'));

    // 并发：一边发指令，另一边收到后经 SSE 回报
    const cmdResp = fetch(`${base}/api/phone-control/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tool: 'tap', args: { text: '设置' } }),
    });

    const cmd = await client.nextCommand();
    assert.equal(cmd.tool, 'tap');
    assert.equal((cmd.args as any).text, '设置');

    // 原生端回报结果
    const r = await fetch(`${base}/api/phone-control/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reqId: cmd.reqId, ok: true, data: { tapped: true, found: true } }),
    });
    assert.equal((await r.json() as any).accepted, true);

    const resp = (await cmdResp) as Response;
    assert.equal(resp.status, 200);
    const json = (await resp.json()) as { ok: boolean; data: { tapped: boolean } };
    assert.equal(json.ok, true);
    assert.equal(json.data.tapped, true);
  } finally {
    await client.close();
    await app.close();
  }
});

test('断开后状态回落为离线', async () => {
  const { app, base } = await startServer();
  const client = await connectSSE(base, 'test-2');
  try {
    await sleep(150);
    assert.equal((await status(base)).connected, true);
  } finally {
    await client.close();
  }
  // 给服务端 close 事件一点时间解注册
  await sleep(300);
  assert.equal((await status(base)).connected, false);
  await app.close();
});

test('截图上传与回取：POST base64 → 落盘 → GET 可取回 PNG', async () => {
  const { app, base } = await startServer();
  try {
    // 1x1 透明 PNG 的 base64
    const pngB64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const up = await fetch(`${base}/api/phone-control/screenshot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: pngB64 }),
    });
    assert.equal(up.status, 200);
    const upJson = (await up.json()) as { ok: boolean; url: string };
    assert.equal(upJson.ok, true);
    assert.match(upJson.url, /\/api\/phone-control\/screenshot\/.+/);

    const id = upJson.url.split('/').pop();
    const get = await fetch(`${base}/api/phone-control/screenshot/${id}`);
    assert.equal(get.status, 200);
    assert.equal(get.headers.get('content-type'), 'image/png');
    const buf = Buffer.from(await get.arrayBuffer());
    assert.equal(buf.length > 0, true);
  } finally {
    await app.close();
  }
});
