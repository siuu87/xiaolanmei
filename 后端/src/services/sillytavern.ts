/**
 * SillyTavern（ST）客户端（2026-11-20）。
 *
 * 小蓝莓酒馆模块的数据源与生成引擎。ST 暴露一套 REST API：
 * - **角色卡**：`/api/characters/{all,get,create,edit,delete,chats}`，
 *   角色卡 = PNG 内嵌 JSON（Spec V2），以 PNG 文件名（`xxx.png`）为标识
 * - **世界书**：`/api/worldinfo/{list,get,edit,delete}`，一个文件含多个 entries
 * - **聊天**：`/api/chats/{save,get,delete}`，JSONL 消息数组
 * - **生成**：`/api/backends/chat-completions`，OpenAI 兼容流式，ST 代持 LLM 凭据
 *
 * 集成分工：
 * - 角色卡 / 世界书的 CRUD → 走 ST REST API（ST 是唯一数据源）
 * - 对话生成 → 走 ST 的 chat-completions（LLM 凭据由 ST 代持，小蓝莓后端只传 messages）
 * - 提示词组装 → 由小蓝莓后端做（复用 tavern.ts 的 buildSystemPrompt 逻辑，数据从 ST 拉）
 * - 人设卡 → ST 无 REST API，保留本地
 *
 * 三条纪律：
 * 1. ST 没配 / 没起 → 所有函数返回 null 或空数组，酒馆回退到本地数据，绝不抛；
 * 2. CSRF token + basic auth 只在后端；前端永远拿不到 ST 凭据；
 * 3. 字段映射双向对称：小蓝莓 DTO ↔ ST 字段，前端几乎不用改。
 */
import { env } from '../config/env.js';
import { getSettingValue, setSetting } from '../routes/settings.js';

/* ------------------------- 连接配置（数据库优先） ------------------------- */
/**
 * 2026-11-22：ST 连接信息改由界面填写、存 settings 表（key=sillytavern.config），
 * 改完当场生效，不再需要改 .env 重启后端。.env 仅作为「从没在界面存过」时的回退初始值。
 */
export interface StConnConfig {
  url: string;
  user: string;
  password: string;
  timeoutMs: number;
}

const ST_CONFIG_KEY = 'sillytavern.config';

function connConfig(): StConnConfig {
  const fallback: StConnConfig = {
    url: env.sillytavernUrl,
    user: env.sillytavernUser,
    password: env.sillytavernPassword,
    timeoutMs: env.sillytavernTimeoutMs,
  };
  const saved = getSettingValue<StConnConfig | null>(ST_CONFIG_KEY, null);
  return saved && typeof saved === 'object' ? { ...fallback, ...saved } : fallback;
}

/** 保存连接配置到数据库，并清掉 CSRF 缓存（地址/凭据可能变了） */
export function saveStConnConfig(next: StConnConfig): void {
  const clean: StConnConfig = {
    url: String(next.url ?? '').trim().replace(/\/+$/, ''),
    user: String(next.user ?? '').trim(),
    password: String(next.password ?? ''),
    timeoutMs: Number.isFinite(next.timeoutMs) ? Math.max(500, next.timeoutMs) : 5000,
  };
  setSetting(ST_CONFIG_KEY, clean);
  resetSession();
}

/** 供 /st/config 读取（脱敏：不带密码明文） */
export function readStConnConfig(): { url: string; user: string; hasPassword: boolean; timeoutMs: number; configured: boolean } {
  const c = connConfig();
  return { url: c.url, user: c.user, hasPassword: !!c.password, timeoutMs: c.timeoutMs, configured: !!c.url };
}

/** 完整配置（含明文密码）——仅供后端内部使用，绝不经过 /st/config 下发 */
export function readStConnConfigRaw(): StConnConfig {
  return connConfig();
}

/** 用指定配置探一次 /version（不落库），供「测试连接」按钮用 */
export async function probeStConfig(cfg: StConnConfig): Promise<StHealth> {
  const url = String(cfg.url ?? '').trim().replace(/\/+$/, '');
  if (!url) return { configured: false, up: false, url: null };
  const headers: Record<string, string> = {};
  if (cfg.user) headers.Authorization = `Basic ${Buffer.from(`${cfg.user}:${cfg.password}`).toString('base64')}`;
  try {
    const res = await fetch(`${url}/version`, {
      signal: AbortSignal.timeout(Number(cfg.timeoutMs) || 5000),
      headers,
    });
    if (!res.ok) return { configured: true, up: false, url };
    const j = (await res.json()) as { version?: string };
    return { configured: true, up: true, url, version: j.version };
  } catch {
    return { configured: true, up: false, url };
  }
}

/* ------------------------------ 类型 ------------------------------ */

export interface StCharacter {
  /** ST 角色卡标识 = PNG 文件名，如 `linmo.png` */
  avatar: string;
  ch_name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  talkativeness: number;
  fav: boolean;
  tags: string[];
  creator_notes: string;
  /** Spec V2 内嵌 JSON（含 data.book 内嵌世界书等） */
  data?: Record<string, unknown>;
  /** 创建时间（ST 返回的 create_date 字符串） */
  create_date?: string;
}

export interface StWorldEntry {
  /** entry 显示名（ST 的 comment 字段） */
  comment?: string;
  keys: string[];
  content: string;
  priority: number;
  /** ST 用数字：0 = 角色前，10 = 角色后 */
  position: number;
  enabled: boolean;
  constant: boolean;
  selective: boolean;
}

export interface StWorldInfo {
  name: string;
  entries: Record<string, StWorldEntry>;
  extensions?: Record<string, unknown>;
}

/** ST 原始 entry（1.19 字段：key/disable/order/comment/…）归一成 StWorldEntry */
function normalizeStEntry(raw: Record<string, unknown>): StWorldEntry {
  const key = raw.key;
  const keys = Array.isArray(key) ? (key as unknown[]).map(String) : key ? [String(key)] : [];
  return {
    comment: raw.comment ? String(raw.comment) : undefined,
    keys,
    content: raw.content ? String(raw.content) : '',
    priority: Number(raw.order ?? 0),
    position: Number(raw.position ?? 0),
    enabled: !raw.disable,
    constant: !!raw.constant,
    selective: !!raw.selective,
  };
}

/** StWorldEntry 反转回 ST 原始 entry（保存时用，保留 ST 字段语义） */
function denormalizeStEntry(e: StWorldEntry): Record<string, unknown> {
  return {
    key: e.keys,
    content: e.content,
    order: e.priority,
    position: e.position,
    disable: !e.enabled,
    constant: e.constant,
    selective: e.selective,
    comment: e.comment ?? '',
  };
}

export interface StChatMessage {
  role: 'user' | 'assistant';
  mes: string;
}

export interface StHealth {
  configured: boolean;
  up: boolean;
  url: string | null;
  version?: string;
}

/* --------------------------- CSRF 与请求 --------------------------- */

let csrfToken: string | null = null;

/**
 * 极简 cookie jar（2026-11-22）：ST 新版把 CSRF token 和会话 cookie 绑定，
 * 取 token 时下发的 cookie 必须在后续请求原样带回，否则一律 403 Invalid CSRF token。
 * Node 原生 fetch 不管理 cookie，这里手动存 name=value（忽略 path/expire，ST 本地够用）。
 */
let stCookies: Record<string, string> = {};
function saveCookies(res: Response): void {
  // Headers.getSetCookie 在 Node 20+ 可用；回退到 get('set-cookie')
  const list: string[] =
    typeof (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (res.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
      : (() => { const raw = res.headers.get('set-cookie'); return raw ? [raw] : []; })();
  for (const line of list) {
    const pair = line.split(';')[0];
    const idx = pair.indexOf('=');
    if (idx > 0) stCookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
}
function cookieHeader(): Record<string, string> {
  const items = Object.entries(stCookies).map(([k, v]) => `${k}=${v}`);
  return items.length ? { Cookie: items.join('; ') } : {};
}
function resetSession(): void {
  csrfToken = null;
  stCookies = {};
}

function stConfigured(): boolean {
  return !!connConfig().url;
}

function baseUrl(): string {
  return connConfig().url;
}

function basicAuthHeader(): Record<string, string> {
  const { user, password } = connConfig();
  if (!user) return {};
  const raw = `${user}:${password}`;
  return { Authorization: `Basic ${Buffer.from(raw).toString('base64')}` };
}

function timeoutMs(): number {
  return connConfig().timeoutMs;
}

/** 获取 CSRF token（带缓存；失败返回 null） */
async function fetchCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl()}/csrf-token`, {
      signal: AbortSignal.timeout(timeoutMs()),
      headers: { ...basicAuthHeader(), ...cookieHeader() },
    });
    saveCookies(res);
    if (!res.ok) return null;
    const j = (await res.json()) as { token?: string };
    return j?.token ?? null;
  } catch {
    return null;
  }
}

/** 确保有 CSRF token，没有就取一个 */
async function ensureCsrf(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  csrfToken = await fetchCsrfToken();
  return csrfToken;
}

interface StRequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  /** 是否允许在 403 时刷新 CSRF 重试（默认 true） */
  retryOnCsrf?: boolean;
}

/** 向 ST 发请求；返回解析后的 JSON。ST 不可达或出错返回 null */
async function stRequest<T = unknown>(path: string, opts: StRequestOptions = {}): Promise<T | null> {
  if (!stConfigured()) return null;
  const { method = 'POST', body, retryOnCsrf = true } = opts;

  const doFetch = async (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...basicAuthHeader(),
      ...cookieHeader(),
    };
    if (token) headers['X-CSRF-Token'] = token;
    return fetch(`${baseUrl()}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs()),
    });
  };

  try {
    const token = await ensureCsrf();
    let res = await doFetch(token);
    saveCookies(res);

    // CSRF 失效：清会话（token + cookie）重取一次
    if (res.status === 403 && retryOnCsrf) {
      resetSession();
      const fresh = await ensureCsrf();
      if (fresh && fresh !== token) {
        res = await doFetch(fresh);
        saveCookies(res);
      }
    }

    if (!res.ok) return null;
    if (res.status === 204) return null;
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/* ------------------------------ 健康检查 ------------------------------ */

/** `/version` 不带 CSRF，用来给面板显示「ST 在不在」 */
export async function getStHealth(): Promise<StHealth> {
  return probeStConfig(connConfig());
}

/* ------------------------------ 角色卡 ------------------------------ */

export async function listStCharacters(): Promise<StCharacter[]> {
  const data = await stRequest<Array<Record<string, unknown>>>('/api/characters/all');
  if (!Array.isArray(data)) return [];
  // ST 1.19 的 /characters/all 返回 name（不是 ch_name）；/characters/get 用 ch_name。
  // 统一归一到 StCharacter：名字取 name || ch_name，avatar 保留 PNG 文件名。
  return data
    .map((c) => ({
      ...c,
      ch_name: String(c.ch_name ?? c.name ?? ''),
      avatar: String(c.avatar ?? ''),
      tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
    }))
    .filter((c) => !!c.ch_name && !!c.avatar) as StCharacter[];
}

export async function getStCharacter(avatarUrl: string): Promise<StCharacter | null> {
  return stRequest<StCharacter>('/api/characters/get', { body: { avatar_url: avatarUrl } });
}

export interface StCreateCharacterInput {
  ch_name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  talkativeness?: number;
  fav?: boolean;
  tags?: string[];
  creator_notes?: string;
  /** 内部文件名（不含 .png）；不传则 ST 按名字生成 */
  file_name?: string;
}

/** 创建角色卡；返回新卡的 PNG 文件名（`xxx.png`），失败返回 null */
export async function createStCharacter(input: StCreateCharacterInput): Promise<string | null> {
  const avatar = await stRequest<string>('/api/characters/create', { body: input });
  return typeof avatar === 'string' && avatar ? avatar : null;
}

/**
 * 创建角色卡（带头像上传）。avatarImage 为图片二进制；为 null 时 ST 用默认头像。
 * ST 的 create 端点用 multer 接收 `file` 字段，需 multipart 提交。
 */
export async function createStCharacterMultipart(
  input: StCreateCharacterInput,
  avatarImage: Blob | null,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!stConfigured()) return null;
  try {
    const token = await ensureCsrf();
    const form = new FormData();
    form.set('ch_name', input.ch_name);
    if (input.description) form.set('description', input.description);
    if (input.personality) form.set('personality', input.personality);
    if (input.scenario) form.set('scenario', input.scenario);
    if (input.first_mes) form.set('first_mes', input.first_mes);
    if (input.mes_example) form.set('mes_example', input.mes_example);
    if (input.talkativeness !== undefined) form.set('talkativeness', String(input.talkativeness));
    if (input.fav !== undefined) form.set('fav', String(input.fav));
    if (input.tags) form.set('tags', JSON.stringify(input.tags));
    if (input.creator_notes) form.set('creator_notes', input.creator_notes);
    if (input.file_name) form.set('file_name', input.file_name);
    if (avatarImage) form.set('file', avatarImage, 'avatar.png');

    const headers: Record<string, string> = { ...basicAuthHeader(), ...cookieHeader() };
    if (token) headers['X-CSRF-Token'] = token;

    const res = await fetch(`${baseUrl()}/api/characters/create`, {
      method: 'POST',
      headers,
      body: form,
      signal: signal ?? AbortSignal.timeout(timeoutMs()),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text && text.endsWith('.png') ? text : null;
  } catch {
    return null;
  }
}

export interface StEditCharacterInput {
  avatar_url: string;
  ch_name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  talkativeness?: number;
  fav?: boolean;
  tags?: string[];
  creator_notes?: string;
}

/** 编辑角色卡；成功返回 true */
export async function editStCharacter(input: StEditCharacterInput): Promise<boolean> {
  const data = await stRequest<unknown>('/api/characters/edit', { body: input });
  return data !== null;
}

/**
 * 编辑角色卡（带头像替换）。avatarImage 为新头像二进制；为 null 时只改字段不换头像。
 * ST 的 edit 端点用 multer 接收 `file` 字段，需 multipart 提交。
 */
export async function editStCharacterMultipart(
  input: StEditCharacterInput,
  avatarImage: Blob | null,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!stConfigured()) return false;
  try {
    const token = await ensureCsrf();
    const form = new FormData();
    form.set('avatar_url', input.avatar_url);
    form.set('ch_name', input.ch_name);
    if (input.description) form.set('description', input.description);
    if (input.personality) form.set('personality', input.personality);
    if (input.scenario) form.set('scenario', input.scenario);
    if (input.first_mes) form.set('first_mes', input.first_mes);
    if (input.mes_example) form.set('mes_example', input.mes_example);
    if (input.talkativeness !== undefined) form.set('talkativeness', String(input.talkativeness));
    if (input.fav !== undefined) form.set('fav', String(input.fav));
    if (input.tags) form.set('tags', JSON.stringify(input.tags));
    if (input.creator_notes) form.set('creator_notes', input.creator_notes);
    if (avatarImage) form.set('file', avatarImage, 'avatar.png');

    const headers: Record<string, string> = { ...basicAuthHeader(), ...cookieHeader() };
    if (token) headers['X-CSRF-Token'] = token;

    const res = await fetch(`${baseUrl()}/api/characters/edit`, {
      method: 'POST',
      headers,
      body: form,
      signal: signal ?? AbortSignal.timeout(timeoutMs()),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 删除角色卡；delete_chats 控制是否连带删聊天 */
export async function deleteStCharacter(avatarUrl: string, deleteChats = true): Promise<boolean> {
  const data = await stRequest<unknown>('/api/characters/delete', {
    body: { avatar_url: avatarUrl, delete_chats: deleteChats },
  });
  return data !== null;
}

/** 列出某角色卡的所有聊天（简单模式：只返回文件名） */
export async function listStCharacterChats(avatarUrl: string): Promise<{ file_name: string; file_id: string }[]> {
  const data = await stRequest<{ file_name: string; file_id: string }[]>(
    '/api/characters/chats',
    { body: { avatar_url: avatarUrl, simple: true } },
  );
  return Array.isArray(data) ? data : [];
}

/* ------------------------------ 世界书 ------------------------------ */

export async function listStWorldInfo(): Promise<{ file_id: string; name: string }[]> {
  const data = await stRequest<{ file_id: string; name: string; extensions?: unknown }[]>(
    '/api/worldinfo/list',
  );
  return Array.isArray(data) ? data.map((w) => ({ file_id: w.file_id, name: w.name })) : [];
}

export async function getStWorldInfo(name: string): Promise<StWorldInfo | null> {
  const raw = await stRequest<{ entries?: Record<string, Record<string, unknown>>; extensions?: Record<string, unknown> }>(
    '/api/worldinfo/get',
    { body: { name } },
  );
  if (!raw) return null;
  const entries: Record<string, StWorldEntry> = {};
  for (const [key, e] of Object.entries(raw.entries ?? {})) {
    entries[key] = normalizeStEntry(e);
  }
  return { name, entries, extensions: raw.extensions };
}

/** 保存（新建或覆盖）世界书；data 为完整世界书对象（含 entries） */
export async function saveStWorldInfo(name: string, data: StWorldInfo): Promise<boolean> {
  // 归一后的 entry 反转回 ST 原始字段再提交
  const entries: Record<string, Record<string, unknown>> = {};
  for (const [key, e] of Object.entries(data.entries ?? {})) {
    entries[key] = denormalizeStEntry(e);
  }
  const res = await stRequest<unknown>('/api/worldinfo/edit', {
    body: { name, data: { entries, extensions: data.extensions ?? {} } },
  });
  return res !== null;
}

export async function deleteStWorldInfo(name: string): Promise<boolean> {
  const res = await stRequest<unknown>('/api/worldinfo/delete', { body: { name } });
  return res !== null;
}

/* ------------------------------ 聊天 ------------------------------ */

/** 保存聊天到 ST；chatfile = 文件名（不含扩展名） */
export async function saveStChat(chatfile: string, chat: StChatMessage[]): Promise<boolean> {
  const res = await stRequest<unknown>('/api/chats/save', { body: { chatfile, chat } });
  return res !== null;
}

export async function getStChat(chatfile: string): Promise<StChatMessage[] | null> {
  return stRequest<StChatMessage[]>('/api/chats/get', { body: { chatfile } });
}

export async function deleteStChat(chatfile: string): Promise<boolean> {
  const res = await stRequest<unknown>('/api/chats/delete', { body: { chatfile } });
  return res !== null;
}

/* ------------------------------ 生成 ------------------------------ */

/**
 * 走 ST 的 `/api/backends/chat-completions` 做流式生成。
 * ST 代持 LLM 凭据，小蓝莓后端只传 messages + model，ST 转发到它配置的后端。
 * 返回 ST 原始的 SSE Response，由路由层解析成小蓝莓的 ChatEvent 流。
 */
export async function streamStChatCompletion(
  body: {
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    model?: string;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
  },
  signal: AbortSignal,
): Promise<Response | null> {
  if (!stConfigured()) return null;
  try {
    const token = await ensureCsrf();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...basicAuthHeader(),
      ...cookieHeader(),
    };
    if (token) headers['X-CSRF-Token'] = token;

    const res = await fetch(`${baseUrl()}/api/backends/chat-completions/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}
