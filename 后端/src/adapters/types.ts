/**
 * 统一 AI 适配层类型（阶段 1）。
 *
 * 从设计上就含 tools（function calling），为后续 MCP / 智能编程铺路；
 * 阶段 2 只用到 messages + 流式 delta / done / error；
 * 阶段 6 新增 complete（非流式），供记忆提取 / 摘要生成用。
 */

/** 统一错误码（错误映射产物，前后端共用同一套语义） */
export type ErrorCode =
  | 'auth'
  | 'rate_limit'
  | 'timeout'
  | 'invalid_request'
  | 'server_error';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** 多模态图片（阶段 7）：base64 data URL，仅 user 消息使用；存在时 content 会转成 OpenAI 多模态数组 */
  images?: string[];
  /** assistant 消息可携带工具调用（OpenAI 格式） */
  tool_calls?: ToolCall[];
  /** tool 角色消息回传结果时用，对应 tool_calls[].id */
  tool_call_id?: string;
  /** tool 角色消息的工具名 */
  name?: string;
}

/** 一次函数调用（OpenAI 格式） */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON 字符串
  };
}

/** function calling 工具定义（OpenAI 格式） */
export interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  temperature?: number;
}

export interface Usage {
  input: number;
  output: number;
}

export type ChatEvent =
  | { type: 'start' }
  | { type: 'delta'; content: string }
  | { type: 'reasoning'; content: string } // 思考链：模型推理内容（DeepSeek reasoning_content / OpenAI reasoning）
  | { type: 'tool_calls'; toolCalls: ToolCall[] }
  | { type: 'done'; usage?: Usage }
  | { type: 'error'; code: ErrorCode; message: string };

export interface StreamOptions {
  signal?: AbortSignal;
}

/** 非流式补全结果（阶段 6：记忆提取 / 摘要生成；阶段 10：工具调用） */
export interface CompletionResult {
  content: string;
  usage?: Usage;
  toolCalls?: ToolCall[];
}

export interface ChatAdapter {
  stream(req: ChatRequest, opts?: StreamOptions): AsyncIterable<ChatEvent>;
  complete(req: ChatRequest, opts?: StreamOptions): Promise<CompletionResult>;
}
