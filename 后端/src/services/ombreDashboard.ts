/**
 * Ombre Brain Dashboard（OB 记忆中枢）代理（2026-10-21）。
 *
 * 与心潮·念同源的 VPS 上，Ombre Brain 另开了一套「记忆桶 Dashboard」。
 * 它**不像心潮那样用 Bearer Token**，而是：
 *   - `POST {URL}/auth/login`  `{ password }` → 在 `Set-Cookie` 里回 `ombre_session=<token>`；
 *   - 之后所有 `/api/*` 都要带 `Cookie: ombre_session=<token>`；
 *   - 密码错回 `401 {"error":"密码错误"}`。
 *
 * 所以这里做**反向代理 + 代持会话**：小蓝莓后端去登录、缓存会话、自动续期，
 * 前端只调本地 `/api/ombre-dashboard/*`，永远拿不到 Dashboard 密码。
 *
 * 三条纪律：
 * 1. **没配置就整条消失**：`OMBRE_DASHBOARD_URL` / 密码为空 → 全部函数返回 null/空，
 *    「内心」页的「记忆」页签自动隐藏，其它功能不受影响。
 * 2. **会话并发锁**：登录用 `loginInFlight` 去重——多个请求同时发现没会话，只真打一次
 *    `/auth/login`；其余共享同一次结果，避免把 Dashboard 的登录限流（429）打爆。
 * 3. **401 自动重登一次**：任意 `/api/*` 回 401 说明会话失效，清掉旧 token 重登一次再试；
 *    仍失败就当不可用，绝不抛给调用方。
 */
import { env } from '../config/env.js';

/* ───────────────────────── 配置 ───────────────────────── */

export function ombrdConfigured(): boolean {
  const url = env.ombreDashboardUrl;
  if (!url || !env.ombreDashboardPassword) return false;
  return /^https?:\/\//i.test(url);
}

function baseUrl(): string {
  return env.ombreDashboardUrl;
}

const PLACEHOLDER = /<[^>]+>/;
function isRealUrl(): boolean {
  const u = env.ombreDashboardUrl;
  if (!u || PLACEHOLDER.test(u)) return false;
  return /^https?:\/\//i.test(u);
}

/* ───────────────────────── 会话管理 ───────────────────────── */

let sessionToken: string | null = null;
/** 进行中的登录 Promise：并发去重锁 */
let loginInFlight: Promise<string | null> | null = null;

function parseSessionCookie(res: Response): string | null {
  // Node 20+ undici 提供 getSetCookie()；老版本回退到 get('set-cookie')
  const list: string[] =
    typeof (res.headers as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (res.headers as { getSetCookie: () => string[] }).getSetCookie()
      : [res.headers.get('set-cookie') ?? ''];
  for (const raw of list) {
    const m = /(?:^|;\s*)ombre_session=([^;]+)/.exec(raw);
    if (m && m[1]) return m[1];
  }
  return null;
}

async function doLogin(): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: env.ombreDashboardPassword }),
      signal: AbortSignal.timeout(env.ombreDashboardTimeoutMs),
    });
    if (res.status === 401) {
      console.warn('[OB-Dash] 登录失败：密码错误 (401)');
      return null;
    }
    if (!res.ok) {
      console.warn(`[OB-Dash] 登录失败：HTTP ${res.status}`);
      return null;
    }
    const token = parseSessionCookie(res);
    if (!token) {
      console.warn('[OB-Dash] 登录成功但未拿到 ombre_session cookie');
      return null;
    }
    return token;
  } catch (err) {
    console.warn('[OB-Dash] 登录不可达：', (err as Error).message);
    return null;
  }
}

/** 取一个有效会话；没有就登录（并发去重）。返回 null = 无法登录。 */
async function getToken(): Promise<string | null> {
  if (sessionToken) return sessionToken;
  if (loginInFlight) return loginInFlight;
  loginInFlight = doLogin().finally(() => {
    // 不论成功失败，清空在飞标记，让下次能重试
    loginInFlight = null;
  });
  const tok = await loginInFlight;
  sessionToken = tok;
  return tok;
}

function clearToken(): void {
  sessionToken = null;
}

/** 带会话的 fetch；401 自动重登一次后重试。返回 null = 认证/网络不可用。 */
async function authedFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  const token = await getToken();
  if (!token) return null;
  const tryOnce = async () => {
    const res = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Cookie: `ombre_session=${token}`, ...((init.headers as Record<string, string>) ?? {}) },
      signal: AbortSignal.timeout(env.ombreDashboardTimeoutMs),
    });
    return res;
  };
  try {
    let res = await tryOnce();
    if (res.status === 401) {
      clearToken();
      const tok2 = await getToken();
      if (!tok2) return null;
      res = await tryOnce();
    }
    return res;
  } catch (err) {
    console.warn('[OB-Dash] 请求失败：', (err as Error).message);
    return null;
  }
}

/* ───────────────────────── 数据归一 ───────────────────────── */

export type OmbreBucketState = 'dynamic' | 'permanent' | 'pinned' | 'archived';

export interface OmbreBucket {
  id: string;
  name: string;
  type: string;
  pinned: boolean;
  resolved: boolean;
  archived: boolean;
  domain: string[];
  tags: string[];
  valence: number;
  arousal: number;
  importance: number;
  score: number;
  created?: string;
  lastActive?: string;
  contentPreview: string;
  whyRemembered?: string;
  /** 用于前端页签筛选的派生状态 */
  state: OmbreBucketState;
  /** 透传原始字段，详情页可展示更多 */
  raw: Record<string, unknown>;
}

const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : str(v) ? [str(v)] : [];

function deriveState(b: {
  type: string;
  pinned: boolean;
  resolved: boolean;
}): OmbreBucketState {
  if (b.pinned) return 'pinned';
  if (b.type === 'permanent') return 'permanent';
  if (b.resolved) return 'archived';
  return 'dynamic';
}

/** 把 OB 不同版本/字段命名归一成统一结构（兼容 content/content_preview、
 *  created/created_at、id/bucket_id、type/bucket_type 等差异）。 */
export function normalizeBucket(raw: Record<string, unknown>): OmbreBucket {
  const id = str(raw.id ?? raw.bucket_id ?? raw._id) || `b_${Math.random().toString(36).slice(2, 10)}`;
  const type = str(raw.type ?? raw.bucket_type ?? 'dynamic');
  const pinned = !!raw.pinned;
  const resolved = !!raw.resolved;
  const archived = !!raw.deletion_request || !!raw.deleted_at;
  const content = str(raw.content ?? raw.content_preview ?? raw.summary ?? raw.text);
  const preview =
    str(raw.content_preview ?? raw.content ?? raw.summary ?? raw.text).slice(0, 200) || content.slice(0, 200);
  const bucket: Omit<OmbreBucket, 'raw'> = {
    id,
    name: str(raw.name ?? raw.title ?? raw.label) || '（无标题）',
    type,
    pinned,
    resolved,
    archived,
    domain: arr(raw.domain),
    tags: arr(raw.tags),
    valence: num(raw.valence, 0.5),
    arousal: num(raw.arousal, 0.3),
    importance: num(raw.importance, 5),
    score: num(raw.score, 0),
    created: str(raw.created ?? raw.created_at ?? raw.createdAt),
    lastActive: str(raw.last_active ?? raw.lastActive ?? raw.last_active_at),
    contentPreview: preview,
    whyRemembered: str(raw.why_remembered ?? raw.why),
    state: deriveState({ type, pinned, resolved }),
  };
  return { ...bucket, raw: raw };
}

/* ───────────────────────── 对外接口 ───────────────────────── */

export interface OmbreStatus {
  configured: boolean;
  up: boolean;
  url: string | null;
  total: number;
  dynamic: number;
  permanent: number;
  pinned: number;
  resolved: number;
  error?: string;
}

/** 在线状态 + 记忆总数（从 /health 探活，从 /api/buckets 点总数）。 */
export async function getOmbreStatus(): Promise<OmbreStatus> {
  if (!ombrdConfigured() || !isRealUrl()) {
    return { configured: false, up: false, url: baseUrl() || null, total: 0, dynamic: 0, permanent: 0, pinned: 0, resolved: 0 };
  }
  // 探活不需要鉴权
  let up = false;
  try {
    const h = await fetch(`${baseUrl()}/health`, { signal: AbortSignal.timeout(env.ombreDashboardTimeoutMs) });
    up = h.ok;
  } catch {
    up = false;
  }
  if (!up) {
    return { configured: true, up: false, url: baseUrl(), total: 0, dynamic: 0, permanent: 0, pinned: 0, resolved: 0 };
  }
  // 计数：拉一页 bucket 列表（已裁剪，不含正文）
  const res = await authedFetch('/api/buckets?sort=score');
  if (!res || !res.ok) {
    return { configured: true, up: true, url: baseUrl(), total: 0, dynamic: 0, permanent: 0, pinned: 0, resolved: 0, error: '列表拉取失败' };
  }
  try {
    const list = (await res.json()) as unknown[];
    const buckets = Array.isArray(list) ? list.map((b) => normalizeBucket(b as Record<string, unknown>)) : [];
    return {
      configured: true,
      up: true,
      url: baseUrl(),
      total: buckets.length,
      dynamic: buckets.filter((b) => b.type === 'dynamic').length,
      permanent: buckets.filter((b) => b.type === 'permanent').length,
      pinned: buckets.filter((b) => b.pinned).length,
      resolved: buckets.filter((b) => b.resolved).length,
    };
  } catch (err) {
    return { configured: true, up: true, url: baseUrl(), total: 0, dynamic: 0, permanent: 0, pinned: 0, resolved: 0, error: (err as Error).message };
  }
}

/** 桶状态 → 前端页签的过滤谓词 */
function matchesState(b: OmbreBucket, state: string): boolean {
  switch (state) {
    case 'all':
      return true;
    case 'dynamic':
      return b.type === 'dynamic' && !b.pinned;
    case 'permanent':
      return b.type === 'permanent';
    case 'pinned':
      return b.pinned;
    case 'archived':
      // OB 的 archive 走软删除、不在 /api/buckets 列表返回；这里用 resolved 近似「已了结」记忆
      return b.resolved;
    default:
      return true;
  }
}

export interface BucketQuery {
  type?: 'dynamic' | 'permanent';
  state?: 'all' | 'dynamic' | 'permanent' | 'pinned' | 'archived';
  sort?: 'score' | 'created_desc' | 'created_asc';
}

/** 桶列表（支持 type / state 过滤与排序）。过滤在服务端代理层做，
 * 这样即使 OB 版本不带这些 query 参数也能用。 */
export async function getBuckets(q: BucketQuery = {}): Promise<OmbreBucket[]> {
  if (!ombrdConfigured()) return [];
  const sort = q.sort && ['score', 'created_desc', 'created_asc'].includes(q.sort) ? q.sort : 'score';
  const res = await authedFetch(`/api/buckets?sort=${sort}`);
  if (!res || !res.ok) return [];
  try {
    const list = (await res.json()) as unknown[];
    let buckets = Array.isArray(list) ? list.map((b) => normalizeBucket(b as Record<string, unknown>)) : [];
    if (q.type) buckets = buckets.filter((b) => b.type === q.type);
    if (q.state && q.state !== 'all') buckets = buckets.filter((b) => matchesState(b, q.state!));
    return buckets;
  } catch {
    return [];
  }
}

/** 关键词检索（OB 的 /api/search?q=）。 */
export async function searchBuckets(query: string): Promise<OmbreBucket[]> {
  const q = (query ?? '').trim();
  if (!ombrdConfigured() || !q) return [];
  const res = await authedFetch(`/api/search?q=${encodeURIComponent(q)}`);
  if (!res || !res.ok) return [];
  try {
    const list = (await res.json()) as unknown[];
    // /api/search 返回的是纯数组，字段与列表略有出入，归一即可
    return Array.isArray(list) ? list.map((b) => normalizeBucket(b as Record<string, unknown>)) : [];
  } catch {
    return [];
  }
}

/** 单条记忆详情（GET /api/bucket/{id}，注意是单数 bucket）。 */
export async function getBucket(id: string): Promise<OmbreBucket | null> {
  if (!ombrdConfigured() || !id) return null;
  const res = await authedFetch(`/api/bucket/${encodeURIComponent(id)}`);
  if (!res || !res.ok) return null;
  try {
    const raw = (await res.json()) as Record<string, unknown>;
    return normalizeBucket(raw);
  } catch {
    return null;
  }
}

/** 给前端 / 排查用的配置信息（不吐密码）。 */
export function ombrdProbe(): { configured: boolean; url: string | null; timeoutMs: number } {
  return { configured: ombrdConfigured(), url: baseUrl() || null, timeoutMs: env.ombreDashboardTimeoutMs };
}
