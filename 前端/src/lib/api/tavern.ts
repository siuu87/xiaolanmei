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

// ===== 角色卡 =====
export const listTavernCharacters = () => request<TavernCharacter[]>('/api/tavern/characters');
export const createTavernCharacter = (input: TavernCharacterInput) =>
  request<{ id: string }>('/api/tavern/characters', { method: 'POST', body: JSON.stringify(input) });
export const patchTavernCharacter = (id: string, patch: TavernCharacterInput) =>
  request<{ ok: true }>(`/api/tavern/characters/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteTavernCharacter = (id: string) =>
  request<{ ok: true }>(`/api/tavern/characters/${id}`, { method: 'DELETE' });

// ===== 世界书 =====
export const listTavernWorldbook = () => request<TavernWorldbookEntry[]>('/api/tavern/worldbook');
export const createTavernWorldbook = (input: TavernWorldbookInput) =>
  request<{ id: string }>('/api/tavern/worldbook', { method: 'POST', body: JSON.stringify(input) });
export const patchTavernWorldbook = (id: string, patch: TavernWorldbookInput) =>
  request<{ ok: true }>(`/api/tavern/worldbook/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteTavernWorldbook = (id: string) =>
  request<{ ok: true }>(`/api/tavern/worldbook/${id}`, { method: 'DELETE' });

// ===== 人设卡 =====
export const listTavernPersonas = () => request<TavernPersona[]>('/api/tavern/personas');
export const createTavernPersona = (input: TavernPersonaInput) =>
  request<{ id: string }>('/api/tavern/personas', { method: 'POST', body: JSON.stringify(input) });
export const patchTavernPersona = (id: string, patch: TavernPersonaInput) =>
  request<{ ok: true }>(`/api/tavern/personas/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteTavernPersona = (id: string) =>
  request<{ ok: true }>(`/api/tavern/personas/${id}`, { method: 'DELETE' });

// ===== 流式角色扮演对话 =====
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

/** 流式调用 /api/tavern/chat，逐事件回调；异常抛出 */
export async function streamTavernChat(
  input: TavernChatInput,
  onEvent: (ev: TavernChatEvent) => void,
): Promise<void> {
  const res = await fetch('/api/tavern/chat', {
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
