/**
 * import-to-xinchao.mjs — 一键把小蓝莓的对话记忆导入心潮（Ombre Brain）。
 *
 * 全流程自动，无需手动拖文件：
 *   1. 调 export-conversation.mjs 导出对话 Markdown
 *   2. POST {OMBRE_DASHBOARD_URL}/auth/login 拿 ombre_session cookie
 *   3. POST /api/import/upload 上传对话文件，启动导入
 *   4. 轮询 /api/import/status 直到完成
 *   5. 打印导入统计与前几条结果
 *
 * 前置：在 后端/.env 里配好——
 *   OMBRE_DASHBOARD_URL=https://你的心潮地址
 *   OMBRE_DASHBOARD_PASSWORD=你的Dashboard密码
 *
 * 用法（cwd 必须在 后端/）：
 *   node scripts/import-to-xinchao.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '..');

// 显式加载后端 .env（不依赖 cwd）
dotenv.config({ path: path.join(BACKEND_DIR, '.env') });

const DASH_URL = (process.env.OMBRE_DASHBOARD_URL ?? '').trim().replace(/\/+$/, '');
const DASH_PASSWORD = (process.env.OMBRE_DASHBOARD_PASSWORD ?? '').trim();

/* ─────────────── 配置检查 ─────────────── */
if (!DASH_URL || !DASH_PASSWORD) {
  console.error('✗ 缺少心潮 Dashboard 配置。请在 后端/.env 里填：');
  console.error('    OMBRE_DASHBOARD_URL=https://你的心潮地址');
  console.error('    OMBRE_DASHBOARD_PASSWORD=你的Dashboard密码');
  process.exit(1);
}
if (!/^https?:\/\//i.test(DASH_URL)) {
  console.error('✗ OMBRE_DASHBOARD_URL 格式不对，应以 http:// 或 https:// 开头');
  process.exit(1);
}

/* ─────────────── 1. 导出对话 ─────────────── */
const EXPORT_SCRIPT = path.join(__dirname, 'export-conversation.mjs');
const MD_PATH = path.resolve(BACKEND_DIR, '..', '导出', '心潮记忆导入-对话.md');

console.log('▶ 第 1 步：导出对话…');
execFileSync(process.execPath, [EXPORT_SCRIPT, MD_PATH], {
  cwd: BACKEND_DIR,
  stdio: 'inherit',
});
if (!fs.existsSync(MD_PATH)) {
  console.error('✗ 导出失败，文件未生成');
  process.exit(1);
}
const mdContent = fs.readFileSync(MD_PATH, 'utf8');
console.log(`  已读取 ${MD_PATH}`);

/* ─────────────── 2. 登录拿会话 ─────────────── */
console.log('▶ 第 2 步：登录心潮 Dashboard…');
const loginRes = await fetch(`${DASH_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: DASH_PASSWORD }),
});
if (loginRes.status === 401) {
  console.error('✗ 登录失败：密码错误 (401)');
  process.exit(1);
}
if (!loginRes.ok) {
  console.error(`✗ 登录失败：HTTP ${loginRes.status}`);
  process.exit(1);
}

const setCookies =
  typeof loginRes.headers.getSetCookie === 'function'
    ? loginRes.headers.getSetCookie()
    : [loginRes.headers.get('set-cookie') ?? ''];
let sessionToken = null;
for (const raw of setCookies) {
  const m = /(?:^|;\s*)ombre_session=([^;]+)/.exec(raw);
  if (m && m[1]) {
    sessionToken = m[1];
    break;
  }
}
if (!sessionToken) {
  console.error('✗ 登录成功但未拿到 ombre_session cookie');
  process.exit(1);
}
console.log('  ✔ 会话已建立');

/* ─────────────── 3. 上传启动导入 ─────────────── */
console.log('▶ 第 3 步：上传对话文件，启动导入…');
const form = new FormData();
form.append(
  'file',
  new Blob([mdContent], { type: 'text/markdown' }),
  'blueberry-conversation.md'
);

const uploadRes = await fetch(`${DASH_URL}/api/import/upload`, {
  method: 'POST',
  headers: { Cookie: `ombre_session=${sessionToken}` },
  body: form,
});
if (uploadRes.status === 409) {
  console.error('✗ 心潮已有导入任务在跑，请等它结束或先暂停');
  process.exit(1);
}
if (!uploadRes.ok) {
  const errText = await uploadRes.text().catch(() => '');
  console.error(`✗ 上传失败：HTTP ${uploadRes.status} ${errText}`);
  process.exit(1);
}
console.log('  ✔ 导入任务已启动');

/* ─────────────── 4. 轮询进度 ─────────────── */
console.log('▶ 第 4 步：等待导入完成…');
const POLL_MS = 3000;
const TIMEOUT_MS = 10 * 60 * 1000; // 最长 10 分钟
const start = Date.now();
let last = null;

while (Date.now() - start < TIMEOUT_MS) {
  await new Promise((r) => setTimeout(r, POLL_MS));
  const statusRes = await fetch(`${DASH_URL}/api/import/status`, {
    headers: { Cookie: `ombre_session=${sessionToken}` },
  });
  if (!statusRes.ok) {
    console.error(`✗ 查询进度失败：HTTP ${statusRes.status}`);
    process.exit(1);
  }
  const st = await statusRes.json();
  const pct = st.total_chunks
    ? Math.round((st.processed / st.total_chunks) * 100)
    : 0;
  last = st;
  if (st.status === 'completed') {
    console.log(`  ✔ 导入完成（${st.processed}/${st.total_chunks} 块，100%）`);
    break;
  }
  if (st.status === 'error') {
    console.error('✗ 导入出错：', st.errors?.[0] ?? '未知错误');
    process.exit(1);
  }
  if (st.status === 'paused') {
    console.error('✗ 导入被暂停（可能是手动暂停或出错）');
    process.exit(1);
  }
  console.log(
    `  … 进行中 ${st.processed}/${st.total_chunks} 块（${pct}%），已创建 ${st.memories_created} 条`
  );
}

if (last && last.status !== 'completed') {
  console.error('✗ 超时（10 分钟）仍未完成，可稍后用 Dashboard 查看进度');
  process.exit(1);
}

/* ─────────────── 5. 打印结果 ─────────────── */
console.log('▶ 第 5 步：导入结果');
console.log(`  新建记忆：${last.memories_created} 条`);
console.log(`  合并进已有：${last.memories_merged} 条`);
console.log(`  保留原文（raw）：${last.memories_raw} 条`);
if (last.errors && last.errors.length) {
  console.log(`  错误记录：${last.errors.length} 条（首条：${last.errors[0]}）`);
}

// 拉取导入结果，展示前几条
const resultsRes = await fetch(`${DASH_URL}/api/import/results?limit=5`, {
  headers: { Cookie: `ombre_session=${sessionToken}` },
});
if (resultsRes.ok) {
  const data = await resultsRes.json();
  const buckets = data.buckets ?? [];
  if (buckets.length) {
    console.log('\n  导入的记忆条目（前 5 条）：');
    for (const b of buckets) {
      const name = b.name || '(未命名)';
      const preview = (b.content || '').slice(0, 60).replace(/\n/g, ' ');
      console.log(`  · [${name}] ${preview}${b.content.length > 60 ? '…' : ''}`);
    }
  }
}

console.log('\n✅ 全部完成。可打开心潮 Dashboard 的「记忆」页查看。');
