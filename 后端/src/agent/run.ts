import { openaiCompatibleAdapter } from '../adapters/openaiCompatible.js';
import type { ChatMessage, ToolDef, Usage } from '../adapters/types.js';
import { runAgentLoop } from './loop.js';
import { listCodeTools, getCodeTool, codeToolDef } from './codeTools.js';
import { listBuiltinTools, builtinToolDef } from '../tools/registry.js';
import { runTool, logToolCall, isAllowed } from '../services/toolRunner.js';
import { requestConfirmation } from '../services/confirmations.js';
import { getModelConfig, getAdapterConfig } from '../routes/stations.js';
import { workspaceRoot } from './workspace.js';
import { newId, now } from '../utils/id.js';
import { db } from '../db/client.js';
import { tokenUsage } from '../db/schema.js';

/**
 * 智能编程 Agent（阶段 10）：把编码任务跑成「规划 → 调工具 → 执行 → 看结果 → 迭代」。
 * 写文件 / 执行命令 / git 提交需用户确认（走 confirmations 队列，SSE 透传 needs_confirm）。
 */

export type AgentEvent =
  | { type: 'start' }
  | { type: 'delta'; content: string }
  | { type: 'tool_call'; name: string; arguments: Record<string, unknown> }
  | { type: 'needs_confirm'; confirmId: string; toolName: string; summary: string }
  | { type: 'done'; usage?: Usage }
  | { type: 'error'; message: string };

const SYSTEM_PROMPT = (root: string) => `你是「小蓝莓」的智能编程助手，负责修改小蓝莓自身的代码（工作区：${root}）。
规则：
- 先 read_file / search_files / list_dir 理解现状，再动手，只做必要的最小改动。
- 写文件(write_file/edit_file)、执行命令(run_command)、git 提交(git_commit) 会自动弹确认，等用户批准后再执行。
- 改动后可用 run_command 跑类型检查或构建来验证（例如 npm run typecheck）。
- 不要碰 node_modules / dist / data / .git；不要泄露任何密钥。
- 每一步用中文简短说明你在做什么，最后总结改动。`;

function summarize(toolName: string, args: Record<string, unknown>): string {
  const p = String(args.path ?? '');
  if (toolName === 'run_command') return `执行命令：${String(args.command ?? '').slice(0, 200)}`;
  if (toolName === 'write_file') return `写入文件：${p}`;
  if (toolName === 'edit_file') return `修改文件：${p}`;
  if (toolName === 'git_commit') return `git 提交：${String(args.message ?? '').slice(0, 120)}`;
  return `调用工具：${toolName}`;
}

export interface CodingAgentOptions {
  taskId: string;
  prompt: string;
  conversationId?: string | null;
  signal?: AbortSignal;
  onEvent: (ev: AgentEvent) => void;
}

export async function runCodingAgent(opts: CodingAgentOptions): Promise<void> {
  const { taskId, prompt, conversationId, signal, onEvent } = opts;
  const { model, temperature } = getModelConfig();
  const adapter = openaiCompatibleAdapter(getAdapterConfig());
  const started = now();

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT(workspaceRoot()) },
    { role: 'user', content: prompt },
  ];

  const defs: ToolDef[] = [
    ...listCodeTools().map(codeToolDef),
    ...listBuiltinTools().map(builtinToolDef),
  ];

  const resolveTool = async (name: string, args: Record<string, unknown>): Promise<string> => {
    const code = getCodeTool(name);
    if (code) {
      // 写 / 命令类需确认（允许列表可免）
      if (code.requiresConfirm && !isAllowed('code', name)) {
        const req = requestConfirmation(name, summarize(name, args));
        onEvent({ type: 'needs_confirm', confirmId: req.id, toolName: name, summary: req.summary });
        const decision = await req.promise;
        if (decision === 'deny') return `用户拒绝了工具「${name}」的执行，请改用其它方式完成。`;
      }
      const started = now();
      try {
        const result = await code.execute(args);
        logToolCall({
          kind: 'code',
          toolName: name,
          args,
          result,
          status: 'success',
          latencyMs: now() - started,
          conversationId,
          agentTaskId: taskId,
        });
        return result;
      } catch (err) {
        const msg = (err as Error).message;
        logToolCall({
          kind: 'code',
          toolName: name,
          args,
          result: msg,
          status: 'error',
          latencyMs: now() - started,
          conversationId,
          agentTaskId: taskId,
        });
        return `工具执行出错：${msg}`;
      }
    }

    // 其余为内置联网工具（web_fetch / web_search）
    const r = await runTool({ kind: 'builtin', name, arguments: args, conversationId, agentTaskId: taskId });
    if (r.status === 'ok') return r.result;
    if (r.status === 'needs_confirm') return `工具「${name}」需要确认，已跳过。`;
    return `工具执行失败：${r.message}`;
  };

  onEvent({ type: 'start' });
  const result = await runAgentLoop({
    adapter,
    model,
    messages,
    tools: defs,
    resolveTool,
    temperature,
    maxIterations: 12,
    signal,
    handlers: {
      onDelta: (text) => onEvent({ type: 'delta', content: text }),
      onToolCall: (tc, args) => onEvent({ type: 'tool_call', name: tc.function.name, arguments: args }),
      onError: (message) => onEvent({ type: 'error', message }),
    },
  });
  const usage = result.usage;
  try {
    db.insert(tokenUsage)
      .values({
        id: newId(),
        timestamp: now(),
        conversationId: conversationId ?? null,
        messageId: null,
        featureType: 'agent',
        model,
        tokenInput: usage?.input ?? 0,
        tokenOutput: usage?.output ?? 0,
        tokenTotal: (usage?.input ?? 0) + (usage?.output ?? 0),
        latencyMs: now() - started,
        status: 'success',
        createdAt: now(),
        updatedAt: now(),
      })
      .run();
  } catch {
    /* token 落库失败不阻断 */
  }
  onEvent({ type: 'done', usage: result.usage });
}
