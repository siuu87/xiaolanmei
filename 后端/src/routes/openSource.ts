import type { FastifyInstance } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { openSourceProjects } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 开源项目关注清单（工具箱 → 开源项目）。
 *
 * 2026-10-18 改版：
 * - **列表只放用户自己加的项目**。以前是自动扫 package.json 依赖，
 *   里面大部分是用户根本不关心的传递依赖；现在改成空白清单，加什么由用户说了算。
 * - **「检查更新」按钮**：点一下后端去 GitHub 拉每个项目的最新 release，
 *   比 `seen_version`（用户已知的版本）新就标「有更新」。这是**只读的更新检查**，
 *   不会去动本地依赖——真要升级依赖得用户自己决定。
 *
 * 网络：只有 `api.github.com` 在这台机器上可达（`github.com` 连不上），
 * 所以一律走 API，不抓网页。未鉴权 GitHub API 限流 60 次/小时，
 * 每个项目 2 个请求 → 30 个项目以内一次刷完，超了会把失败原因回给前端。
 */

const API = 'https://api.github.com';

interface ProjectDTO {
  id: string;
  owner: string;
  repo: string;
  repoUrl: string;
  name: string;
  note: string | null;
  description: string | null;
  stars: number | null;
  language: string | null;
  homepage: string | null;
  latestVersion: string | null;
  latestPublishedAt: number | null;
  seenVersion: string | null;
  lastCheckedAt: number | null;
  hasUpdate: boolean;
  checkError: string | null;
  sortOrder: number;
  createdAt: number;
}

function toDTO(p: typeof openSourceProjects.$inferSelect): ProjectDTO {
  return {
    id: p.id,
    owner: p.owner,
    repo: p.repo,
    repoUrl: p.repoUrl,
    name: p.name,
    note: p.note,
    description: p.description,
    stars: p.stars,
    language: p.language,
    homepage: p.homepage,
    latestVersion: p.latestVersion,
    latestPublishedAt: p.latestPublishedAt,
    seenVersion: p.seenVersion,
    lastCheckedAt: p.lastCheckedAt,
    hasUpdate: p.hasUpdate,
    checkError: p.checkError,
    sortOrder: p.sortOrder,
    createdAt: p.createdAt,
  };
}

function listRows() {
  return db
    .select()
    .from(openSourceProjects)
    .all()
    .filter((p) => p.deletedAt == null)
    .sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt - a.createdAt);
}

/* --------------------------- GitHub 地址解析 --------------------------- */

/**
 * 从用户输入里解析 owner/repo。
 * 容忍这些写法：
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   github.com/owner/repo/tree/main
 *   owner/repo
 */
export function parseRepo(input: string): { owner: string; repo: string } | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  // 去掉协议与域名，剩下 path 部分
  const m = raw.match(/github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i) ?? raw.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2].replace(/\.git$/i, '');
  if (!owner || !repo) return null;
  return { owner, repo };
}

/* ------------------------------ GitHub 拉取 ------------------------------ */

interface RepoMeta {
  fullName: string;
  description: string | null;
  stars: number | null;
  language: string | null;
  homepage: string | null;
}

interface ReleaseMeta {
  tag: string | null;
  publishedAt: number | null;
}

async function ghGet<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'blueberry-open-source' },
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 404) throw new Error('仓库不存在（或没有权限访问）');
  if (res.status === 403 || res.status === 429) throw new Error('GitHub API 限流了，稍后再试');
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return (await res.json()) as T;
}

async function fetchRepo(owner: string, repo: string): Promise<RepoMeta> {
  const j = await ghGet<{
    full_name?: string;
    description?: string | null;
    stargazers_count?: number;
    language?: string | null;
    homepage?: string | null;
  }>(`${API}/repos/${owner}/${repo}`);
  return {
    fullName: j.full_name ?? `${owner}/${repo}`,
    description: j.description ?? null,
    stars: typeof j.stargazers_count === 'number' ? j.stargazers_count : null,
    language: j.language ?? null,
    homepage: j.homepage ?? null,
  };
}

/** 最新 release；仓库没发过 release 时返回 null（不算错误） */
async function fetchLatestRelease(owner: string, repo: string): Promise<ReleaseMeta> {
  try {
    const j = await ghGet<{ tag_name?: string; published_at?: string }>(
      `${API}/repos/${owner}/${repo}/releases/latest`,
    );
    return {
      tag: typeof j.tag_name === 'string' ? j.tag_name : null,
      publishedAt: j.published_at ? Date.parse(j.published_at) : null,
    };
  } catch (e) {
    // 「没有 release」是正常状态（404），不当成失败
    if ((e as Error).message.startsWith('仓库不存在')) return { tag: null, publishedAt: null };
    throw e;
  }
}

/** 比 version 新才算更新：只比 major.minor.patch 数值，容忍 v 前缀与预发后缀 */
export function isNewer(latest: string, seen: string): boolean {
  const parts = (v: string) =>
    v.replace(/^v/i, '').split(/[.-]/).slice(0, 3).map((s) => {
      const m = /^\d+/.exec(s);
      return m ? Number(m[0]) : 0;
    });
  const l = parts(latest);
  const s = parts(seen);
  for (let i = 0; i < 3; i++) {
    const a = l[i] ?? 0;
    const b = s[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

/** 拉一次 GitHub，算出这一条该写回什么（纯计算，不落库） */
async function probeProject(owner: string, repo: string) {
  const [meta, rel] = await Promise.all([fetchRepo(owner, repo), fetchLatestRelease(owner, repo)]);
  return { meta, rel };
}

/* -------------------------------- 路由 -------------------------------- */

/**
 * 添加一个项目（供 HTTP 路由与内置 AI 工具共用）：传 GitHub 链接或 owner/repo，
 * 立刻拉一次详情并落库。返回新行 id。
 * 已在清单（含软删复活）则抛「已经在清单里」；地址无法解析抛「请填…」；GitHub 出错抛原始错误。
 */
export async function addOpenSourceProject(repoUrl: string, note?: string): Promise<string> {
  const parsed = parseRepo(repoUrl);
  if (!parsed) throw new Error('请填 GitHub 仓库地址，如 https://github.com/owner/repo');
  const { owner, repo } = parsed;

  const existing = db
    .select()
    .from(openSourceProjects)
    .all()
    .find(
      (p) =>
        p.owner.toLowerCase() === owner.toLowerCase() && p.repo.toLowerCase() === repo.toLowerCase(),
    );
  if (existing && existing.deletedAt == null) {
    throw new Error(`已经在清单里了（${existing.name}）`);
  }

  const { meta, rel } = await probeProject(owner, repo);
  const ts = now();

  if (existing) {
    db.update(openSourceProjects)
      .set({
        deletedAt: null,
        name: meta.fullName,
        description: meta.description,
        stars: meta.stars,
        language: meta.language,
        homepage: meta.homepage,
        latestVersion: rel.tag,
        latestPublishedAt: rel.publishedAt,
        seenVersion: rel.tag,
        lastCheckedAt: ts,
        hasUpdate: false,
        checkError: null,
        updatedAt: ts,
      })
      .where(eq(openSourceProjects.id, existing.id))
      .run();
    return existing.id;
  }

  const id = newId();
  db.insert(openSourceProjects)
    .values({
      id,
      owner,
      repo,
      repoUrl: `https://github.com/${owner}/${repo}`,
      name: meta.fullName,
      note: note?.trim() || null,
      description: meta.description,
      stars: meta.stars,
      language: meta.language,
      homepage: meta.homepage,
      latestVersion: rel.tag,
      latestPublishedAt: rel.publishedAt,
      seenVersion: rel.tag,
      lastCheckedAt: ts,
      hasUpdate: false,
      checkError: null,
      sortOrder: 0,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  return id;
}

/** 检查更新（供 HTTP 路由与内置 AI 工具共用）。id 为空 = 全部，否则只刷这一个。 */
export async function refreshOpenSource(id?: string): Promise<{
  updated: number;
  failed: { id: string; name: string; error: string }[];
  checkedAt: number;
}> {
  const rows = listRows().filter((p) => !id || p.id === id);
  const ts = now();
  const failed: { id: string; name: string; error: string }[] = [];
  let updated = 0;

  // 并发 4 个：GitHub 未鉴权限流很紧，别一次打几十个请求
  const queue = [...rows];
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      try {
        const { meta, rel } = await probeProject(row.owner, row.repo);
        const hasUpdate = !!(rel.tag && row.seenVersion && isNewer(rel.tag, row.seenVersion));
        if (hasUpdate) updated += 1;
        db.update(openSourceProjects)
          .set({
            name: meta.fullName,
            description: meta.description,
            stars: meta.stars,
            language: meta.language,
            homepage: meta.homepage,
            latestVersion: rel.tag,
            latestPublishedAt: rel.publishedAt,
            lastCheckedAt: ts,
            hasUpdate,
            checkError: null,
            updatedAt: ts,
          })
          .where(eq(openSourceProjects.id, row.id))
          .run();
      } catch (e) {
        const msg = (e as Error).message;
        failed.push({ id: row.id, name: row.name, error: msg });
        // 失败也要记 lastCheckedAt，免得界面上永远显示「从未检查」
        db.update(openSourceProjects)
          .set({ lastCheckedAt: ts, checkError: msg, updatedAt: ts })
          .where(eq(openSourceProjects.id, row.id))
          .run();
      }
    }
  });
  await Promise.all(workers);

  return { updated, failed, checkedAt: ts };
}

export async function openSourceRoutes(app: FastifyInstance): Promise<void> {
  /** 清单：只读库，不发网络请求（打开面板要快） */
  app.get('/open-source', async () => {
    const items = listRows();
    return {
      items: items.map(toDTO),
      summary: {
        total: items.length,
        updates: items.filter((i) => i.hasUpdate).length,
        checkedAt: items.reduce((max, i) => Math.max(max, i.lastCheckedAt ?? 0), 0) || null,
      },
    };
  });

  /** 添加一个项目：传 GitHub 链接或 owner/repo，立刻拉一次详情 */
  app.post('/open-source', async (req, reply) => {
    const body = (req.body ?? {}) as { repoUrl?: string; note?: string };
    try {
      const id = await addOpenSourceProject(body.repoUrl ?? '', body.note);
      reply.code(201).send({ id });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.startsWith('已经在清单里')) reply.code(409).send({ message: msg });
      else if (msg.startsWith('请填')) reply.code(400).send({ message: msg });
      else reply.code(502).send({ message: msg });
    }
  });

  /** 改备注 / 改名 */
  app.patch('/open-source/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { note?: string; name?: string };
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.note !== undefined) set.note = body.note.trim() || null;
    if (body.name !== undefined) set.name = body.name.trim() || undefined;

    const result = db
      .update(openSourceProjects)
      .set(set)
      .where(and(eq(openSourceProjects.id, id), isNull(openSourceProjects.deletedAt)))
      .run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '项目不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  /** 移出清单（软删） */
  app.delete('/open-source/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ts = now();
    const result = db
      .update(openSourceProjects)
      .set({ deletedAt: ts, updatedAt: ts })
      .where(and(eq(openSourceProjects.id, id), isNull(openSourceProjects.deletedAt)))
      .run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '项目不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  /** 「知道了」：把当前最新版本记为已知，红点熄灭 */
  app.post('/open-source/:id/ack', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = listRows().find((p) => p.id === id);
    if (!row) {
      reply.code(404).send({ message: '项目不存在' });
      return;
    }
    db.update(openSourceProjects)
      .set({ seenVersion: row.latestVersion, hasUpdate: false, updatedAt: now() })
      .where(eq(openSourceProjects.id, id))
      .run();
    reply.send({ ok: true });
  });

  /**
   * **一键检查更新**（面板上那个按钮）：逐个去 GitHub 拉最新 release，
   * 比 `seen_version` 新就标「有更新」。只更新清单里的元信息，不动本地依赖。
   * `id` 为空 = 全部；给了 id 就只刷这一个。
   */
  app.post('/open-source/refresh', async (req) => {
    const body = (req.body ?? {}) as { id?: string };
    return refreshOpenSource(body.id);
  });
}
