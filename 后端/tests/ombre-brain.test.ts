/**
 * Ombre Brain 专线协议单测：用本地假 OB 服务验证请求形状。
 *
 * 关键点：`env` 是模块加载时快照的，所以必须**先设 process.env，再动态 import**。
 * Node 的 test runner 默认一个文件一个进程，不会污染别的测试。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

interface Call {
  url: string;
  method: string;
  auth: string | undefined;
  contentType: string | undefined;
  body: Record<string, unknown>;
}

test('OB 检索/归档：路径、Bearer 鉴权、body 与归一都符合约定', async () => {
  const calls: Call[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => {
      calls.push({
        url: req.url ?? '',
        method: req.method ?? '',
        auth: req.headers.authorization,
        contentType: req.headers['content-type'],
        body: raw ? JSON.parse(raw) : {},
      });
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/memory/query') {
        // 故意返回「重复 + 字段名不统一」的形状，验证归一
        res.end(
          JSON.stringify({
            results: [
              { content: '她怕黑，睡觉要留一盏灯', score: 0.72 },
              { text: '她怕黑，睡觉要留一盏灯', similarity: 0.7 },
              { memory: '她不吃芒果', score: 0.55 },
            ],
          }),
        );
      } else {
        res.end(JSON.stringify({ ok: true }));
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const port = (addr as { port: number }).port;

  process.env.OB_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.OB_API_TOKEN = 'test-token-123';
  process.env.OB_TIMEOUT_MS = '2000';

  try {
    const ob = await import('../src/services/ombreBrain.js');
    assert.equal(ob.obConfigured(), true);

    // ── 检索 ──────────────────────────────────────────────
    const hits = await ob.obQuery('她怕什么', { limit: 3, threshold: 0.4 });
    const q = calls.find((c) => c.url === '/api/memory/query');
    assert.ok(q, '请求打到了 /api/memory/query');
    assert.equal(q.method, 'POST');
    assert.equal(q.auth, 'Bearer test-token-123');
    assert.match(q.contentType ?? '', /application\/json/);
    assert.deepEqual(Object.keys(q.body).sort(), ['limit', 'query', 'threshold']);
    assert.equal(q.body.query, '她怕什么');
    assert.equal(q.body.limit, 3);
    assert.equal(q.body.threshold, 0.4);

    // 去重后两条（同一锚点的两个片段只留一条）
    assert.equal(hits.length, 2);
    assert.equal(hits[0].content, '她怕黑，睡觉要留一盏灯');
    assert.equal(hits[1].content, '她不吃芒果');

    // ── 归档 ──────────────────────────────────────────────
    const ts = 1792400000000;
    const ok = await ob.obAppend('TA：睡了\n白起：晚安\n心绪：温柔', ts);
    assert.equal(ok, true);
    const a = calls.find((c) => c.url === '/api/memory/append');
    assert.ok(a, '请求打到了 /api/memory/append');
    assert.equal(a.auth, 'Bearer test-token-123');
    assert.deepEqual(Object.keys(a.body).sort(), ['summary', 'timestamp']);
    assert.equal(a.body.timestamp, ts);
    assert.match(String(a.body.summary), /TA：睡了/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('OB 配了但服务挂了：检索返回空、归档返回 false，都不抛', async () => {
  // env 是模块加载时快照的，这里仍指向上面那个**已关闭**的假服务 —— 正好模拟「配了但不可达」
  process.env.OB_TIMEOUT_MS = '600';
  const ob = await import('../src/services/ombreBrain.js');
  assert.equal(ob.obConfigured(), true);
  assert.deepEqual(await ob.obQuery('随便'), []);
  assert.equal(await ob.obAppend('随便', Date.now()), false);
});
