/**
 * 一键启动开发环境：后端 3001 + 前端 5173，一个窗口看两边日志，Ctrl+C 一起停。
 *
 * 为什么要这个文件（而不是在 .bat 里直接写两条命令）：
 * 1. 项目目录是中文（`D:\小蓝莓`），.bat 里写中文字面量在 GBK/UTF-8 之间很容易乱码，
 *    这里靠 `%~dp0` 把路径在运行时传进来，.bat 本身保持纯 ASCII。
 * 2. 必须用**系统 Node 24**（better-sqlite3 是按 24 编译的，22 会 ERR_DLOPEN_FAILED）。
 *    所以不读 PATH，用 `process.execPath` —— 也就是被 .bat 拉起来的那一个。
 * 3. 端口已经在跑就跳过，不会起来就报 EADDRINUSE。
 */

import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;
const isWin = process.platform === 'win32';

console.log(`Node ${process.version}  ·  ${ROOT}`);

/** 端口上有没有人监听（800ms 超时，别让启动卡住） */
function portBusy(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: '127.0.0.1' });
    const done = (v) => {
      sock.destroy();
      resolve(v);
    };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.setTimeout(800, () => done(false));
  });
}

const SERVICES = [
  {
    name: '后端',
    port: 3001,
    cwd: path.join(ROOT, '后端'),
    args: ['node_modules/tsx/dist/cli.mjs', 'src/server.ts'],
    note: 'API + 真库',
  },
  {
    name: '前端',
    port: 5173,
    cwd: path.join(ROOT, '前端'),
    args: ['node_modules/vite/bin/vite.js', '--port', '5173'],
    note: 'Vite dev',
  },
];

const url = 'http://localhost:5173/chat';

/** 用系统默认浏览器打开（Windows 走 cmd start，不为这个引依赖） */
function openBrowser() {
  spawn(isWin ? 'cmd' : 'open', isWin ? ['/c', 'start', '', url] : [url], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

const children = [];
let stopping = false;

for (const svc of SERVICES) {
  if (await portBusy(svc.port)) {
    console.log(`[跳过] ${svc.name} :${svc.port} 已经在跑`);
    continue;
  }
  const cp = spawn(NODE, svc.args, {
    cwd: svc.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  children.push(cp);

  const tag = `[${svc.name}]`;
  const relay = (stream, out) =>
    stream.on('data', (buf) => {
      String(buf)
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .forEach((line) => out.write(`${tag} ${line}\n`));
    });
  relay(cp.stdout, process.stdout);
  relay(cp.stderr, process.stderr);

  cp.on('exit', (code, sig) => {
    if (stopping) return;
    console.log(`${tag} 退出了（code=${code} signal=${sig}）—— 看上面的日志`);
  });
  cp.on('error', (e) => console.error(`${tag} 起不来：${e.message}`));

  console.log(`[启动] ${svc.name} :${svc.port}  ${svc.note}`);
}

if (!children.length) {
  console.log('\n两个服务都已经在跑了，直接开页面。');
  openBrowser();
  process.exit(0);
}

/** 等前端编译好再把浏览器叫起来，不然会看到一半空页 */
async function waitUp(port, timeout = 40000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await portBusy(port)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

if (await waitUp(5173)) {
  console.log(`\n✅ 都起来了 → ${url}`);
  openBrowser();
} else {
  console.log('\n⚠️ 前端 40 秒还没起来，先看上面的报错。');
}

function stop() {
  if (stopping) return;
  stopping = true;
  console.log('\n正在停止两个服务…');
  for (const cp of children) {
    try {
      cp.kill();
    } catch {
      /* 已经没了 */
    }
  }
  setTimeout(() => process.exit(0), 900);
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
