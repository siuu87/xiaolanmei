/**
 * 书架多源解析单测（纯函数，零网络）。
 * 跑法：node node_modules/tsx/dist/cli.mjs --test tests/reading-sources.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractInitialState,
  extractReadable,
  isObfuscatedText,
  parseFanqiePage,
  parseFanqieUrl,
} from '../src/reading/sources.js';

test('番茄链接：page / book / 纯数字都能取到 bookId', () => {
  assert.equal(parseFanqieUrl('https://fanqienovel.com/page/7143038691944959011'), '7143038691944959011');
  assert.equal(parseFanqieUrl('https://fanqienovel.com/book/7143038691944959011?x=1'), '7143038691944959011');
  assert.equal(parseFanqieUrl('7143038691944959011'), '7143038691944959011');
  assert.equal(parseFanqieUrl('https://example.com/page/123'), null);
});

test('extractInitialState：JSON 后面还有代码也能正确配对', () => {
  const html = `<script>window.__INITIAL_STATE__={"page":{"bookName":"十日终焉","chapterListWithVolume":{"0":[{"title":"第1章","itemId":"a"}]}}};(function(){console.log("x")})()</script>`;
  const state = extractInitialState(html) as { page?: { bookName?: string } };
  assert.equal(state.page?.bookName, '十日终焉');
  assert.equal(extractInitialState('<html>no state</html>'), null);
});

test('parseFanqiePage：书名/作者/封面/目录拍平', () => {
  const state = {
    page: {
      bookId: '7143038691944959011',
      bookName: '十日终焉',
      authorName: '杀虫队队员',
      abstract: '一句话简介',
      thumbUri: '//p3-novel.byteimg.com/x.jpg',
      chapterTotal: 1496,
      chapterListWithVolume: {
        0: [
          { title: '第1章 空屋', itemId: '7173216089122439711' },
          { title: '第2章 回声', itemId: '7173216089122439712' },
        ],
        1: [{ title: '第3章 门', itemId: '7173216089122439713' }],
      },
    },
  };
  const html = `<script>window.__INITIAL_STATE__=${JSON.stringify(state)};trailing()</script>`;
  const meta = parseFanqiePage(html);
  assert.ok(meta);
  assert.equal(meta.title, '十日终焉');
  assert.equal(meta.author, '杀虫队队员');
  assert.equal(meta.coverUrl, 'https://p3-novel.byteimg.com/x.jpg');
  assert.deepEqual(meta.toc, ['第1章 空屋', '第2章 回声', '第3章 门']);
  assert.deepEqual(meta.itemIds, ['7173216089122439711', '7173216089122439712', '7173216089122439713']);
  assert.equal(parseFanqiePage('<html>no state</html>'), null);
});

test('番茄正文的 PUA 混淆能被识别（不该写进书架）', () => {
  assert.equal(isObfuscatedText('正常文字'), false);
  assert.equal(isObfuscatedText('\uE012\uE034姐办\uE056简单'), true);
});

test('extractReadable：去脚本/样式，段落保留，实体解码', () => {
  const html = `
    <html><head><title>测试 &amp; 文章</title>
    <style>.x{color:red}</style><script>alert(1)</script></head>
    <body><h1>标题</h1><p>第一段&nbsp;文字。</p><p>第二段 &lt;不是标签&gt;。</p></body></html>`;
  const r = extractReadable(html);
  assert.equal(r.title, '测试 & 文章');
  assert.match(r.content, /第一段 文字。/);
  assert.match(r.content, /第二段 <不是标签>。/);
  assert.doesNotMatch(r.content, /alert/);
  assert.doesNotMatch(r.content, /color:red/);
  assert.match(r.content, /第一段/);
  assert.match(r.content, /第二段/);
});
