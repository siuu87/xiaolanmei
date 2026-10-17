import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

/**
 * 开源项目清单：列出本项目用到、且能在 GitHub 上找到源码的 npm 依赖（前端 + 后端）。
 *
 * **只提醒、不执行**：这里只读 package.json / node_modules 的实际版本，再去 npm registry
 * 查最新版与 GitHub 仓库地址，算出「有没有更新」下发前端。真正更新由用户自己去 GitHub/npm
 * 手动做——本路由**不**跑 npm install，不碰任何写操作。
 *
 * 范围：只保留 npm 元数据里能解析出 GitHub 仓库地址的包（其余丢进 node_modules 但列不出来）。
 */

type Side = 'frontend' | 'backend';
type DepKind = 'dependency' | 'devDependency';

interface OpenSourceDep {
  name: string;
  side: Side;
  kind: DepKind;
  declared: string; // package.json 里声明的范围，如 "^18.3.1"
  installed: string | null; // node_modules 里实际装到的版本
  latest: string | null; // npm registry 的最新版（查不到为 null）
  hasUpdate: boolean;
  repoUrl: string; // 解析出的 GitHub 仓库地址
  homepage: string | null;
  description: string | null;
}

interface OpenSourceResponse {
  items: OpenSourceDep[];
  summary: { total: number; updates: number; checkedAt: number };
}

interface PkgJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** 前端 / 后端各自的工作目录（相对仓库根 env.workspacePath = d:\小蓝莓） */
const SIDES: { side: Side; dir: string }[] = [
  { side: 'frontend', dir: '前端' },
  { side: 'backend', dir: '后端' },
];

const REGISTRY = 'https://registry.npmjs.org';
// 上游版本变动慢，10 分钟内复用同一份结果，避免每次打开面板都连打 30 个请求
const CACHE_TTL = 10 * 60_000;
let cache: { at: number; result: OpenSourceResponse } | null = null;

function readJson<T>(...segments: string[]): T | null {
  try {
    const p = path.join(env.workspacePath, ...segments);
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** 实际安装版本：直接读 node_modules/<name>/package.json 的 version，比解析 ^ 范围准 */
function readInstalled(dir: string, name: string): string | null {
  const pkg = readJson<{ version?: string }>(dir, 'node_modules', name, 'package.json');
  return pkg?.version ?? null;
}

/**
 * 从 npm 元数据的 repository 字段解析 GitHub 仓库地址。
 * 容忍 `git+https://github.com/u/r.git` / `https://github.com/u/r` / `github:u/r` 等写法。
 */
function parseRepoUrl(repo: unknown): string | null {
  let raw: string | null = null;
  if (typeof repo === 'string') raw = repo;
  else if (repo && typeof repo === 'object') {
    const u = (repo as { url?: unknown }).url;
    if (typeof u === 'string') raw = u;
  }
  if (!raw) return null;
  const cleaned = raw.replace(/\.git$/, '').replace(/\/$/, '').replace(/#.*$/, '');
  const m =
    cleaned.match(/github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/i) ??
    cleaned.match(/^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/i);
  if (!m) return null;
  return `https://github.com/${m[1]}/${m[2]}`;
}

/** 版本比较：只比 major.minor.patch 的数值，忽略 prerelease/build（本项目依赖没用到预发版） */
function versionParts(v: string): [number, number, number] {
  const [a, b, c] = v.split('.');
  const toN = (s: string | undefined) => {
    if (!s) return 0;
    const m = /^\d+/.exec(s);
    return m ? Number(m[0]) : 0;
  };
  return [toN(a), toN(b), toN(c)];
}

function isNewer(latest: string, installed: string): boolean {
  const l = versionParts(latest);
  const i = versionParts(installed);
  for (let k = 0; k < 3; k++) {
    if (l[k] !== i[k]) return l[k] > i[k];
  }
  return false;
}

interface LatestManifest {
  version?: string;
  repository?: unknown;
  homepage?: unknown;
  description?: unknown;
}

async function fetchMeta(name: string): Promise<{
  latest: string | null;
  repoUrl: string | null;
  homepage: string | null;
  description: string | null;
}> {
  // scoped 包（@fastify/cors）的 / 要编码成 %2F
  const encoded = name.replace('/', '%2F');
  // 用 /latest（单个版本 manifest，很小）：带 repository/homepage/description，
  // 而不是整包 packument（几十 MB）或精简 packument（会把 repository 裁掉）
  const res = await fetch(`${REGISTRY}/${encoded}/latest`, {
    headers: { 'User-Agent': 'blueberry-open-source' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`registry ${res.status}`);
  const data = (await res.json()) as LatestManifest;
  return {
    latest: typeof data.version === 'string' ? data.version : null,
    repoUrl: parseRepoUrl(data.repository),
    homepage: typeof data.homepage === 'string' ? data.homepage : null,
    description: typeof data.description === 'string' ? data.description : null,
  };
}

async function buildList(): Promise<OpenSourceResponse> {
  const entries: { name: string; side: Side; dir: string; kind: DepKind; declared: string }[] = [];
  for (const { side, dir } of SIDES) {
    const pkg = readJson<PkgJson>(dir, 'package.json');
    if (!pkg) continue;
    for (const [name, declared] of Object.entries(pkg.dependencies ?? {})) {
      entries.push({ name, side, dir, kind: 'dependency', declared });
    }
    for (const [name, declared] of Object.entries(pkg.devDependencies ?? {})) {
      entries.push({ name, side, dir, kind: 'devDependency', declared });
    }
  }

  const items: OpenSourceDep[] = [];
  await Promise.all(
    entries.map(async (e) => {
      const installed = readInstalled(e.dir, e.name);
      let meta: Awaited<ReturnType<typeof fetchMeta>>;
      try {
        meta = await fetchMeta(e.name);
      } catch {
        return; // 单个包查不到就跳过，别因为一个包拖垮整张列表
      }
      if (!meta.repoUrl) return; // 只保留 GitHub 上找得到源码的
      items.push({
        name: e.name,
        side: e.side,
        kind: e.kind,
        declared: e.declared,
        installed,
        latest: meta.latest,
        hasUpdate: !!(meta.latest && installed && isNewer(meta.latest, installed)),
        repoUrl: meta.repoUrl,
        homepage: meta.homepage,
        description: meta.description,
      });
    }),
  );

  items.sort((a, b) =>
    a.side === b.side ? a.name.localeCompare(b.name) : a.side === 'frontend' ? -1 : 1,
  );

  return {
    items,
    summary: {
      total: items.length,
      updates: items.filter((i) => i.hasUpdate).length,
      checkedAt: Date.now(),
    },
  };
}

export async function openSourceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/open-source', async (req) => {
    const { force } = (req.query ?? {}) as { force?: string };
    if (!force && cache && Date.now() - cache.at < CACHE_TTL) return cache.result;

    const result = await buildList();
    cache = { at: Date.now(), result };
    return result;
  });
}
