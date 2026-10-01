export interface ChatPayloadMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** 多模态图片（阶段 7）：base64 data URL，仅 user 消息发给模型 */
  images?: string[];
}

export interface StreamChatOptions {
  signal?: AbortSignal;
  conversationId?: string;
  model?: string;
  stationId?: string;
  web?: boolean;
  onDelta?: (text: string) => void;
  onToolCall?: (name: string) => void;
  onNeedsConfirm?: (confirmId: string, toolName: string, summary: string) => void;
  onMemoAdded?: (id: string | undefined, title: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

/**
 * 流式调用后端 /api/chat/stream（阶段 2；阶段 9 支持联网工具调用）。
 * fetch + ReadableStream 解析 SSE；AbortController 中断；结束回调。
 */
export async function streamChat(
  messages: ChatPayloadMessage[],
  { signal, conversationId, model, stationId, web, onDelta, onToolCall, onNeedsConfirm, onMemoAdded, onDone, onError }: StreamChatOptions = {},
): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        ...(conversationId ? { conversationId } : {}),
        ...(model ? { model } : {}),
        ...(stationId ? { stationId } : {}),
        ...(web ? { web: true } : {}),
      }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    onError?.(`网络错误：${(err as Error).message}`);
    return;
  }

  if (!res.ok) {
    let message = `请求失败 (${res.status})`;
    try {
      const data = (await res.json()) as { message?: string };
      if (data?.message) message = data.message;
    } catch {
      /* ignore */
    }
    onError?.(message);
    return;
  }

  if (!res.body) {
    onError?.('未收到响应流');
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;

  try {
    for (;;) {
      const { done: eof, value } = await reader.read();
      if (eof) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;

        let ev: {
          type?: string;
          content?: string;
          message?: string;
          name?: string;
          confirmId?: string;
          toolName?: string;
          summary?: string;
          id?: string;
          title?: string;
        };
        try {
          ev = JSON.parse(payload);
        } catch {
          continue;
        }

        if (ev.type === 'delta' && typeof ev.content === 'string') {
          onDelta?.(ev.content);
        } else if (ev.type === 'tool_call' && typeof ev.name === 'string') {
          onToolCall?.(ev.name);
        } else if (ev.type === 'needs_confirm' && ev.confirmId) {
          onNeedsConfirm?.(ev.confirmId, ev.toolName ?? '', ev.summary ?? '');
        } else if (ev.type === 'memo_added') {
          onMemoAdded?.(ev.id, ev.title ?? '');
        } else if (ev.type === 'done') {
          done = true;
          onDone?.();
        } else if (ev.type === 'error') {
          onError?.(ev.message ?? '模型服务错误');
          return;
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    onError?.(`网络错误：${(err as Error).message}`);
    return;
  }

  if (!done) onDone?.();
}
