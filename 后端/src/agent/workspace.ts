import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { env } from '../config/env.js';

/**
 * 智能编程工作区（阶段 10）：所有文件 / 命令 / git 操作都被限制在 workspacePath 内。
 * 越界路径直接报错；写操作与命令执行在调用方（agent/run.ts）走权限确认。
 */

const ROOT = path.resolve(env.workspacePath);
// 文件树与搜索时跳过的目录
const IGNORE_DIRS = new Set(['node_modules', 'dist', '.git', 'data', '.claude', 'uploads']);
const TEXT_EXT = /\.(ts|tsx|js|jsx|json|md|css|html|yml|yaml|env|txt|sql|sh)$/;

export function workspaceRoot(): string {
  return ROOT;
}

/** 把相对路径解析到工作区内，越界则抛错 */
function safeResolve(rel: string): string {
  const p = path.resolve(ROOT, rel || '.');
  if (p !== ROOT && !p.startsWith(ROOT + path.sep)) {
    throw new Error(`路径越界（不允许访问工作区之外）：${rel}`);
  }
  return p;
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

export function listDir(rel: string): { name: string; type: 'dir' | 'file'; path: string }[] {
  const p = safeResolve(rel);
  const entries = fs.readdirSync(p, { withFileTypes: true });
  return entries
    .filter((e) => !IGNORE_DIRS.has(e.name) && !e.name.startsWith('.'))
    .map((e) => ({
      name: e.name,
      type: e.isDirectory() ? ('dir' as const) : ('file' as const),
      path: toPosix(path.join(rel || '.', e.name)),
    }))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
}

export function readFile(rel: string): string {
  const p = safeResolve(rel);
  return fs.readFileSync(p, 'utf-8');
}

export function writeFile(rel: string, content: string): void {
  const p = safeResolve(rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf-8');
}

/** 目标替换：把第一处 oldText 替换为 newText（未找到则报错） */
export function editFile(rel: string, oldText: string, newText: string): { replaced: boolean } {
  const content = readFile(rel);
  if (!content.includes(oldText)) {
    throw new Error(`未找到要替换的原文，请用 read_file 确认内容后重试`);
  }
  writeFile(rel, content.replace(oldText, newText));
  return { replaced: true };
}

/** 递归 grep（仅文本文件），返回匹配行 */
export function searchFiles(pattern: string): { path: string; line: number; text: string }[] {
  let re: RegExp;
  try {
    re = new RegExp(pattern, 'i');
  } catch {
    return [];
  }
  const results: { path: string; line: number; text: string }[] = [];
  const walk = (dir: string, base: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (IGNORE_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      const rel = toPosix(path.join(base, e.name));
      if (e.isDirectory()) {
        walk(full, rel);
      } else if (e.isFile() && TEXT_EXT.test(e.name)) {
        const text = fs.readFileSync(full, 'utf-8');
        text.split('\n').forEach((line, i) => {
          if (re.test(line) && results.length < 200) {
            results.push({ path: rel, line: i + 1, text: line.trim() });
          }
        });
      }
    }
  };
  walk(ROOT, '.');
  return results;
}

/** 在工作区执行 shell 命令（写操作，需确认） */
export function runCommand(command: string): string {
  const r = spawnSync(command, {
    cwd: ROOT,
    shell: true,
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    encoding: 'utf-8',
  });
  const out = (r.stdout ?? '').trim();
  const err = (r.stderr ?? '').trim();
  if (r.status !== 0) throw new Error((err || out || `命令退出码 ${r.status}`).slice(0, 8000));
  return (out || err || '(无输出)').slice(0, 8000);
}

function git(args: string[]): string {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf-8', timeout: 30000 });
  const out = (r.stdout ?? '').trim();
  const err = (r.stderr ?? '').trim();
  if (r.status !== 0) throw new Error(err || out || `git ${args[0]} 失败`);
  return (out || err || '(无输出)').slice(0, 8000);
}

export function gitStatus(): string {
  return git(['status', '--short']) || '(工作区干净)';
}

export function gitDiff(): string {
  return git(['diff', '--stat']) || '(无未暂存改动)';
}

export function gitCommit(message: string): string {
  git(['add', '-A']);
  const r = spawnSync('git', ['commit', '-m', message], { cwd: ROOT, encoding: 'utf-8', timeout: 30000 });
  const out = (r.stdout ?? '').trim();
  if (r.status !== 0) {
    // 无改动时 commit 会失败，返回友好信息
    if (/nothing to commit/i.test(r.stderr ?? '') || /nothing added/i.test(r.stderr ?? '')) {
      return '(没有需要提交的改动)';
    }
    throw new Error((r.stderr ?? out).slice(0, 500));
  }
  return out.slice(0, 8000);
}
