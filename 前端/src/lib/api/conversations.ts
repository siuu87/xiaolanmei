export interface ConversationDTO {
  id: string;
  title: string;
  model?: string | null;
  activeMessageId?: string | null;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MessageDTO {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  parentId: string | null;
  status: string;
  model?: string | null;
  meta?: string | null; // JSON：发图附件引用等（阶段 7）
  createdAt: number;
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    // 仅当有 body 时带 Content-Type，否则无 body 的请求（如 DELETE）会被后端拒绝
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!res.ok) {
    let message = `请求失败 (${res.status})`;
    try {
      const data = (await res.json()) as { message?: string };
      if (data?.message) message = data.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const listConversations = () => request<ConversationDTO[]>('/api/conversations');

export const createConversation = (id: string, title: string) =>
  request<ConversationDTO>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ id, title }),
  });

export const patchConversation = (
  id: string,
  patch: { title?: string; activeMessageId?: string | null; pinned?: boolean },
) =>
  request<{ ok: true }>(`/api/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

export const deleteConversation = (id: string) =>
  request<{ ok: true }>(`/api/conversations/${id}`, { method: 'DELETE' });

export const listMessages = (conversationId: string) =>
  request<MessageDTO[]>(`/api/conversations/${conversationId}/messages`);

export const createMessage = (
  conversationId: string,
  msg: {
    id: string;
    role: string;
    content: string;
    parentId: string | null;
    status?: string;
    meta?: string | null;
  },
) =>
  request<{ id: string }>(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify(msg),
  });

export const patchMessage = (id: string, patch: { content?: string; status?: string }) =>
  request<{ ok: true }>(`/api/messages/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const batchDeleteMessages = (ids: string[]) =>
  request<{ ok: true; count: number }>('/api/messages/batch-delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });

export interface SearchResultDTO {
  id: string;
  conversationId: string;
  conversationTitle: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: number;
}

export const searchMessages = (params: {
  q?: string;
  date?: string;
  hasImage?: boolean;
  conversationId?: string;
}) => {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.date) qs.set('date', params.date);
  if (params.hasImage) qs.set('hasImage', 'true');
  if (params.conversationId) qs.set('conversationId', params.conversationId);
  return request<{ results: SearchResultDTO[] }>(`/api/search/messages?${qs.toString()}`);
};

export const searchActivity = (year: number, month: number) =>
  request<{ year: number; month: number; days: { day: number; count: number }[] }>(
    `/api/search/activity?year=${year}&month=${month}`,
  );
