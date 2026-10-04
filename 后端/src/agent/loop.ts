import type { ChatAdapter, ChatMessage, ToolCall, ToolDef, Usage } from '../adapters/types.js';

/**
 * Agent 循环（阶段 9 联网 / 阶段 10 智能编程共用）：
 *   规划 → 调工具 → 执行 → 回传结果 → 迭代，直到模型不再请求工具或达到上限。
 * 工具执行交给外部 resolveTool（内部统一走 toolRunner 的权限 + 记录）。
 */

export interface AgentLoopHandlers {
  onDelta?: (text: string) => void;
  onReasoning?: (text: string) => void;
  onToolCall?: (tc: ToolCall, args: Record<string, unknown>) => void;
  onError?: (message: string) => void;
}

export interface AgentLoopOptions {
  adapter: ChatAdapter;
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  resolveTool: (name: string, args: Record<string, unknown>) => Promise<string>;
  temperature?: number;
  maxIterations?: number;
  signal?: AbortSignal;
  handlers?: AgentLoopHandlers;
}

export interface AgentLoopResult {
  usage?: Usage;
  iterations: number;
  toolCallsMade: number;
  messages: ChatMessage[];
}

export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  const { adapter, model, resolveTool, handlers } = opts;
  const tools = opts.tools && opts.tools.length > 0 ? opts.tools : undefined;
  const maxIterations = opts.maxIterations ?? 6;
  const messages: ChatMessage[] = [...opts.messages];

  let usage: Usage | undefined;
  let iterations = 0;
  let toolCallsMade = 0;

  for (;;) {
    iterations += 1;
    let toolCalls: ToolCall[] = [];
    let sawToolCalls = false;
    let errored = false;

    for await (const ev of adapter.stream(
      { model, messages, tools, temperature: opts.temperature },
      { signal: opts.signal },
    )) {
      if (ev.type === 'delta') {
        handlers?.onDelta?.(ev.content);
      } else if (ev.type === 'reasoning') {
        handlers?.onReasoning?.(ev.content);
      } else if (ev.type === 'tool_calls') {
        toolCalls = ev.toolCalls;
        sawToolCalls = true;
      } else if (ev.type === 'done') {
        usage = ev.usage;
      } else if (ev.type === 'error') {
        handlers?.onError?.(ev.message);
        errored = true;
      }
    }

    if (errored || !sawToolCalls || toolCalls.length === 0) break;

    // 把 assistant 的 tool_calls 消息写回历史，再逐条回传工具结果
    messages.push({ role: 'assistant', content: '', tool_calls: toolCalls });

    for (const tc of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || '{}');
      } catch {
        args = {};
      }
      handlers?.onToolCall?.(tc, args);

      let result: string;
      try {
        result = await resolveTool(tc.function.name, args);
      } catch (err) {
        result = `工具执行出错：${(err as Error).message}`;
      }
      toolCallsMade += 1;
      messages.push({ role: 'tool', content: result, tool_call_id: tc.id, name: tc.function.name });
    }

    if (iterations >= maxIterations) break;
  }

  return { usage, iterations, toolCallsMade, messages };
}
