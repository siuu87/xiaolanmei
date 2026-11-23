import { request } from './conversations';

export interface TavernCharacter {
  id: string;
  name: string;
  avatar: string | null;
  description: string | null;
  personality: string | null;
  scenario: string | null;
  firstMessage: string | null;
  systemPrompt: string | null;
  tags: string[];
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface TavernWorldbookEntry {
  id: string;
  name: string;
  keywords: string[];
  content: string;
  priority: number;
  position: 'before' | 'after';
  enabled: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface TavernPersona {
  id: string;
  name: string;
  avatar: string | null;
  description: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface TavernCharacterInput {
  name?: string;
  avatar?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  firstMessage?: string;
  systemPrompt?: string;
  tags?: string[];
}

export interface TavernWorldbookInput {
  name?: string;
  keywords?: string[];
  content?: string;
  priority?: number;
  position?: 'before' | 'after';
  enabled?: boolean;
}

export interface TavernPersonaInput {
  name?: string;
  avatar?: string;
  description?: string;
}

/**
 * 酒馆数据源路由层（2026-11-20 ST 接管）。
 *
 * 角色卡 / 世界书 / 聊天：ST 在线走 /api/st/*（ST 是唯一数据源），
 * ST 离线自动回退 /api/tavern/*（本地数据）。人设卡 ST 无 REST API，永远走本地。
 *
 * 对上层（TavernPage 配置台、phoneStore 小手机）完全透明：
 * 函数签名与 DTO 形状不变，内部按 ST 在线状态切换端点。
 *
 * 两个适配细节：
 * 1. ST 角色卡 avatar 是 PNG 文件名（linmo.png），读出时映射成
 *    /api/st/avatar/<file> 代理 URL，前端 <AvatarContent> 直接可用；
 * 2. ST 创建/编辑角色卡需要头像二进制（avatarImage = base64 data URL），
 *    前端上传得到的是 URL，写 ST 时先 fetch 转成 data URL。
 */

/* --------------------------- ST 状态探测 --------------------------- */

let stUp: boolean | null = null;
let stProbedAt = 0;
const ST_PROBE_TTL = 30_000;

/** 探测 ST 是否在线（30s 内复用缓存）；后端不可达视为离线 */
export async function probeStStatus(force = false): Promise<boolean> {
  if (!force && stUp !== null && Date.now() - stProbedAt < ST_PROBE_TTL) return stUp;
  try {
    const s = await request<{ configured: boolean; up: boolean }>('/api/st/status');
    stUp = !!s.up;
  } catch {
    stUp = false;
  }
  stProbedAt = Date.now();
  return stUp;
}

/** ST 探活完整结果（含地址），酒馆直嵌 ST 时用来拼 iframe src */
export interface StStatusDTO {
  configured: boolean;
  up: boolean;
  url: string | null;
  version?: string;
}

/** 读取 ST 完整状态（不写探测缓存），用于取 iframe 源地址 */
export async function getStStatus(): Promise<StStatusDTO> {
  return request<StStatusDTO>('/api/st/status');
}

/** 供设置页展示：当前是否走了 ST 数据源 */
export function isStUpCached(): boolean {
  return stUp === true;
}

/** 清掉 ST 探测缓存（保存/改动连接配置后调用，下次读立即重探） */
export function invalidateStStatus(): void {
  stUp = null;
  stProbedAt = 0;
}

/* --------------------------- ST 连接配置（界面填写，存后端） --------------------------- */

export interface StConnConfigDTO {
  url: string;
  user: string;
  hasPassword: boolean;
  timeoutMs: number;
  configured: boolean;
}

export interface StConnTestResult {
  configured: boolean;
  up: boolean;
  url: string | null;
  version?: string;
}

/** 读取 ST 连接配置（脱敏：密码只回 hasPassword） */
export function getStConfig(): Promise<StConnConfigDTO> {
  return request<StConnConfigDTO>('/api/st/config');
}

/** 保存 ST 连接配置（改完当场生效）；password 留空=沿用，'__CLEAR__'=清空 */
export function saveStConfig(cfg: {
  url: string;
  user: string;
  password?: string;
  timeoutMs?: number;
}): Promise<StConnConfigDTO> {
  return request<StConnConfigDTO>('/api/st/config', {
    method: 'PUT',
    body: JSON.stringify(cfg),
  });
}

/** 测试连接（用传入配置现探 /version，不落库） */
export function testStConfig(cfg: {
  url: string;
  user: string;
  password: string;
  timeoutMs?: number;
}): Promise<StConnTestResult> {
  return request<StConnTestResult>('/api/st/config/test', {
    method: 'POST',
    body: JSON.stringify(cfg),
  });
}

/* --------------------------- 头像工具 --------------------------- */

function isStAvatarProxy(v: string | null | undefined): boolean {
  return !!v && v.startsWith('/api/st/avatar/');
}

/** ST 角色卡 avatar（PNG 文件名）→ 代理 URL */
function mapStAvatar(c: TavernCharacter): TavernCharacter {
  if (!c.avatar) return c;
  return { ...c, avatar: `/api/st/avatar/${encodeURIComponent(c.avatar)}` };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('头像读取失败'));
    reader.readAsDataURL(blob);
  });
}

/** 上传得到的头像 URL → base64 data URL（ST 创建/编辑需要二进制头像） */
async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('头像读取失败');
  return blobToDataUrl(await res.blob());
}

/* ===== 角色卡 ===== */

export async function listTavernCharacters(): Promise<TavernCharacter[]> {
  if (await probeStStatus()) {
    try {
      const list = await request<TavernCharacter[]>('/api/st/characters');
      return list.map(mapStAvatar);
    } catch {
      // ST 请求失败：降级本地，重置缓存下次重探
      stUp = false;
      stProbedAt = 0;
    }
  }
  return request<TavernCharacter[]>('/api/tavern/characters');
}

export async function createTavernCharacter(input: TavernCharacterInput): Promise<{ id: string }> {
  if (await probeStStatus()) {
    const body: Record<string, unknown> = {
      name: input.name,
      description: input.description ?? '',
      personality: input.personality ?? '',
      scenario: input.scenario ?? '',
      firstMessage: input.firstMessage ?? '',
      tags: input.tags ?? [],
    };
    if (input.avatar && /^(\/|https?:)/.test(input.avatar)) {
      body.avatarImage = await urlToDataUrl(input.avatar);
    }
    return request<{ id: string }>('/api/st/characters', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
  return request<{ id: string }>('/api/tavern/characters', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function patchTavernCharacter(id: string, patch: TavernCharacterInput): Promise<{ ok: true }> {
  if (await probeStStatus()) {
    const body: Record<string, unknown> = {
      name: patch.name,
      description: patch.description ?? '',
      personality: patch.personality ?? '',
      scenario: patch.scenario ?? '',
      firstMessage: patch.firstMessage ?? '',
      tags: patch.tags ?? [],
    };
    // 代理 URL = 没换头像，不传 avatarImage（ST 保留原头像）
    if (patch.avatar && !isStAvatarProxy(patch.avatar) && /^(\/|https?:)/.test(patch.avatar)) {
      body.avatarImage = await urlToDataUrl(patch.avatar);
    }
    return request<{ ok: true }>(`/api/st/characters/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }
  return request<{ ok: true }>(`/api/tavern/characters/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deleteTavernCharacter(id: string): Promise<{ ok: true }> {
  if (await probeStStatus()) {
    return request<{ ok: true }>(`/api/st/characters/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  return request<{ ok: true }>(`/api/tavern/characters/${id}`, { method: 'DELETE' });
}

/* ===== 世界书 ===== */

export async function listTavernWorldbook(): Promise<TavernWorldbookEntry[]> {
  if (await probeStStatus()) {
    try {
      return await request<TavernWorldbookEntry[]>('/api/st/worldbook');
    } catch {
      stUp = false;
      stProbedAt = 0;
    }
  }
  return request<TavernWorldbookEntry[]>('/api/tavern/worldbook');
}

export async function createTavernWorldbook(input: TavernWorldbookInput): Promise<{ id: string }> {
  if (await probeStStatus()) {
    return request<{ id: string }>('/api/st/worldbook', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  return request<{ id: string }>('/api/tavern/worldbook', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function patchTavernWorldbook(id: string, patch: TavernWorldbookInput): Promise<{ ok: true }> {
  if (await probeStStatus()) {
    return request<{ ok: true }>(`/api/st/worldbook/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }
  return request<{ ok: true }>(`/api/tavern/worldbook/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deleteTavernWorldbook(id: string): Promise<{ ok: true }> {
  if (await probeStStatus()) {
    return request<{ ok: true }>(`/api/st/worldbook/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  return request<{ ok: true }>(`/api/tavern/worldbook/${id}`, { method: 'DELETE' });
}

/* ===== 人设卡（ST 无 REST API，永远本地） ===== */

export const listTavernPersonas = () => request<TavernPersona[]>('/api/tavern/personas');
export const createTavernPersona = (input: TavernPersonaInput) =>
  request<{ id: string }>('/api/tavern/personas', { method: 'POST', body: JSON.stringify(input) });
export const patchTavernPersona = (id: string, patch: TavernPersonaInput) =>
  request<{ ok: true }>(`/api/tavern/personas/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteTavernPersona = (id: string) =>
  request<{ ok: true }>(`/api/tavern/personas/${id}`, { method: 'DELETE' });

/* ===== 流式角色扮演对话 ===== */

export type TavernChatEvent =
  | { type: 'start' }
  | { type: 'delta'; content: string }
  | { type: 'reasoning'; content: string }
  | { type: 'done' }
  | { type: 'error'; code: string; message: string };

export interface TavernChatInput {
  characterId: string;
  personaId?: string | null;
  messages: { role: 'user' | 'assistant'; content: string }[];
  model?: string;
  stationId?: string;
}

/**
 * 流式调用酒馆对话端点，逐事件回调；异常抛出。
 * ST 在线走 /api/st/chat（ST 代持 LLM 凭据），离线走 /api/tavern/chat。
 * 两端 SSE 事件格式一致，上层无感。
 */
export async function streamTavernChat(
  input: TavernChatInput,
  onEvent: (ev: TavernChatEvent) => void,
): Promise<void> {
  const url = (await probeStStatus()) ? '/api/st/chat' : '/api/tavern/chat';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok || !res.body) {
    let message = `请求失败 (${res.status})`;
    try {
      const data = (await res.json()) as { message?: string };
      if (data?.message) message = data.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).replace(/\r$/, '');
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        onEvent(JSON.parse(payload) as TavernChatEvent);
      } catch {
        /* ignore */
      }
    }
  }
}
