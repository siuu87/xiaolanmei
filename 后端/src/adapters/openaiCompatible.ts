import type {
  ChatAdapter,
  ChatEvent,
  ChatMessage,
  ChatRequest,
  CompletionResult,
  StreamOptions,
  ToolCall,
  Usage,
} from './types.js';
import { mapHttpError } from '../utils/errors.js';

export interface OpenAIConfig {
  baseUrl: string;
  apiKey?: string;
}

/** 把统一消息转成 OpenAI API 格式（透传 tool_calls / tool_call_id / name；多模态图片转 content 数组） */
function toApiMessage(m: ChatMessage): Record<string, unknown> {
  const out: Record<string, unknown> = {
    role: m.role,
    // 多模态：有图片时把 content 转成 [text, image_url...] 数组（OpenAI 视觉格式）
    content:
      m.images && m.images.length > 0
        ? [
            { type: 'text', text: m.content },
            ...m.images.map((url) => ({
              type: 'image_url',
              image_url: { url },
            })),
          ]
        : m.content,
  };
  if (m.tool_calls && m.tool_calls.length > 0) out.tool_calls = m.tool_calls;
  if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
  if (m.name) out.name = m.name;
  return out;
}

/**
 * OpenAI 兼容适配器（阶段 1）：手写 fetch + SSE 解析。
 * 覆盖：流式（delta 逐字）、中断（AbortSignal）、错误映射、usage 提取；
 * 阶段 6 新增 complete（非流式，记忆提取 / 摘要生成）；
 * 阶段 9 新增 function calling：流式累计 tool_calls 并作为事件透出。
 */
export function openaiCompatibleAdapter(config: OpenAIConfig): ChatAdapter {
  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const headers = () => ({
    'Content-Type': 'application/json',
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
  });

  return {
    async *stream(req: ChatRequest, opts?: StreamOptions): AsyncGenerator<ChatEvent> {
      yield { type: 'start' };

      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            model: req.model,
            messages: req.messages.map(toApiMessage),
            stream: true,
            stream_options: { include_usage: true },
            ...(req.tools && req.tools.length > 0 ? { tools: req.tools } : {}),
            ...(req.temperature != null ? { temperature: req.temperature } : {}),
          }),
          signal: opts?.signal,
        });
      } catch (err) {
        if (opts?.signal?.aborted || (err as Error).name === 'AbortError') return;
        yield {
          type: 'error',
          code: 'server_error',
          message: `无法连接模型服务：${(err as Error).message}`,
        };
        return;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        yield {
          type: 'error',
          code: mapHttpError(res.status),
          message: `模型服务错误 (${res.status})：${text.slice(0, 300)}`,
        };
        return;
      }

      if (!res.body) {
        yield { type: 'error', code: 'server_error', message: '模型服务未返回响应流' };
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let usage: Usage | undefined;
      // 流式工具调用：按 index 累计 fragments
      const pendingToolCalls = new Map<number, ToolCall>();

      try {
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

            let obj: any;
            try {
              obj = JSON.parse(payload);
            } catch {
              continue;
            }

            const delta = obj.choices?.[0]?.delta;
            if (typeof delta?.content === 'string' && delta.content.length > 0) {
              yield { type: 'delta', content: delta.content };
            }

            // 累计 tool_calls fragments
            if (Array.isArray(delta?.tool_calls)) {
              for (const tc of delta.tool_calls as any[]) {
                const ti = typeof tc.index === 'number' ? tc.index : 0;
                const existing = pendingToolCalls.get(ti);
                if (!existing) {
                  pendingToolCalls.set(ti, {
                    id: tc.id ?? '',
                    type: 'function',
                    function: {
                      name: tc.function?.name ?? '',
                      arguments: tc.function?.arguments ?? '',
                    },
                  });
                } else {
                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) existing.function.name += tc.function.name;
                  if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                }
              }
            }

            // finish_reason === 'tool_calls' 时把累计结果作为事件透出一次
            if (obj.choices?.[0]?.finish_reason === 'tool_calls' && pendingToolCalls.size > 0) {
              yield { type: 'tool_calls', toolCalls: [...pendingToolCalls.values()] };
            }

            const u = obj.usage;
            if (u && (u.prompt_tokens != null || u.completion_tokens != null)) {
              usage = {
                input: u.prompt_tokens ?? 0,
                output: u.completion_tokens ?? 0,
              };
            }
          }
        }
      } catch (err) {
        if (opts?.signal?.aborted || (err as Error).name === 'AbortError') return;
        yield {
          type: 'error',
          code: 'server_error',
          message: `流式读取中断：${(err as Error).message}`,
        };
        return;
      }

      yield { type: 'done', usage };
    },

    async complete(req: ChatRequest, opts?: StreamOptions): Promise<CompletionResult> {
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            model: req.model,
            messages: req.messages.map(toApiMessage),
            ...(req.tools && req.tools.length > 0 ? { tools: req.tools } : {}),
            ...(req.temperature != null ? { temperature: req.temperature } : {}),
          }),
          signal: opts?.signal,
        });
      } catch (err) {
        throw new Error(`无法连接模型服务：${(err as Error).message}`);
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`模型服务错误 (${res.status})：${text.slice(0, 300)}`);
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string; tool_calls?: ToolCall[] } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const message = data.choices?.[0]?.message;
      const content = message?.content ?? '';
      const u = data.usage;
      return {
        content,
        usage: u ? { input: u.prompt_tokens ?? 0, output: u.completion_tokens ?? 0 } : undefined,
        toolCalls: message?.tool_calls ?? undefined,
      };
    },
  };
}
