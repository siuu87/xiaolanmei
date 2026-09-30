import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { openaiCompatibleAdapter } from '../adapters/openaiCompatible.js';
import type { ChatEvent, ChatMessage } from '../adapters/types.js';
import { db } from '../db/client.js';
import { tokenUsage, courses } from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import { buildSystemPrompt } from './prompts.js';
import { buildWorldContext } from './worldbook.js';
import { buildMemoryContext } from './memories.js';
import { buildSummaryContext } from './summaries.js';
import { getModelConfig, getAdapterConfig, resolveStation, firstModel } from './stations.js';
import { runAgentLoop } from '../agent/loop.js';
import { listCodeTools, getCodeTool, codeToolDef } from '../agent/codeTools.js';
import { listBuiltinTools, builtinToolDef } from '../tools/registry.js';
import { runTool, isAllowed, logToolCall } from '../services/toolRunner.js';
import { requestConfirmation } from '../services/confirmations.js';

interface ChatStreamBody {
  messages?: ChatMessage[];
  model?: string;
  stationId?: string;
  conversationId?: string | null;
  web?: boolean; // 阶段 9：开启后模型可联网搜索 / 读网页
}

const WEB_NOTE =
  '如果用户的问题需要最新的信息、事实核查或读取某个链接，请使用 web_search 或 web_fetch 工具联网获取，再基于结果作答；否则直接回答，不要调用工具。';

const CODE_NOTE =
  '你也能编程：可以读写工作区的文件、运行命令、查看 git。仅当用户明确要求查看或修改小蓝莓的代码时才调用这些工具（read_file/list_dir/search_files/git_status/git_diff 只读免确认；write_file/edit_file/run_command/git_commit 会请求用户确认）。';

function summarizeTool(toolName: string, args: Record<string, unknown>): string {
  const p = String(args.path ?? '');
  if (toolName === 'run_command') return `执行命令：${String(args.command ?? '').slice(0, 200)}`;
  if (toolName === 'write_file') return `写入文件：${p}`;
  if (toolName === 'edit_file') return `修改文件：${p}`;
  if (toolName === 'git_commit') return `git 提交：${String(args.message ?? '').slice(0, 120)}`;
  return `调用工具：${toolName}`;
}

/**
 * POST /api/chat/stream —— SSE 流式代理（阶段 1；阶段 9 支持联网工具循环）。
 * 逐事件透传 delta/tool_call/done/error；结束时按结果写 token_usage 一行。
 */
export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.post('/chat/stream', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body ?? {}) as ChatStreamBody;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const { model: defaultModel, temperature } = getModelConfig();
    const station = resolveStation(body.stationId);
    const model = body.model?.trim() || firstModel(station) || defaultModel;
    const adapter = openaiCompatibleAdapter(getAdapterConfig(station?.id));
    const web = body.web === true;
    const convId = body.conversationId ?? null;

    // 阶段 5/6：注入 system 提示词（全局 + 该模型）+ 世界书 + 长期记忆 + 最近摘要
    // 记忆按「用户最后一条消息」做关键词检索，而非无脑塞全部
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const query = typeof lastUser?.content === 'string' ? lastUser.content : '';
    const hasImage = Array.isArray(lastUser?.images) && (lastUser?.images?.length ?? 0) > 0;

    // 图片识别：发截图时启用 save_courses 工具，并把当前课表喂给模型用于合并（replace 语义）
    const courseNote = hasImage
      ? (() => {
          const existing = db.select().from(courses).all().filter((c) => c.deletedAt == null);
          const summary = existing.length
            ? existing
                .map(
                  (c) =>
                    `- ${c.name} 周${c.day} 第${c.startPeriod}-${c.endPeriod}节 ${c.startWeek}-${c.endWeek}周${
                      c.parity !== 'all' ? (c.parity === 'odd' ? '单周' : '双周') : ''
                    }`,
                )
                .join('\n')
            : '（当前课表为空）';
          return `用户发来了一张截图。如果截图是课表，请识别出其中所有课程，调用 save_courses 工具保存（courses 传入识别出的完整课程列表，replace 语义）。day 取值 1=周一…7=周日；parity 取值 all/odd/even；节次按表格行、周次按列标题识别，缺省周次填 1-20 周。\n当前已有课程：\n${summary}`;
        })()
      : '';

    const systemPrompt = [
      buildSystemPrompt(model),
      buildWorldContext(),
      buildMemoryContext(query),
      buildSummaryContext(convId),
      CODE_NOTE,
      web ? WEB_NOTE : '',
      courseNote,
    ]
      .filter(Boolean)
      .join('\n\n');
    const finalMessages: ChatMessage[] = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages;

    if (messages.length === 0) {
      reply.code(400).send({ code: 'invalid_request', message: 'messages 不能为空' });
      return;
    }

    const started = now();
    const controller = new AbortController();
    // 客户端断开时才中止上游；正常 end 后 close 不算（writableEnded 已置 true）
    const onClose = () => {
      if (!reply.raw.writableEnded) controller.abort();
    };

    // 接管 raw response 做 SSE
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.flushHeaders();

    reply.raw.on('close', onClose);

    const write = (
      ev:
        | ChatEvent
        | { type: 'tool_call'; name: string }
        | { type: 'needs_confirm'; confirmId: string; toolName: string; summary: string },
    ) => {
      reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
    };

    let status: 'success' | 'error' | 'aborted' = 'success';
    let usage: { input: number; output: number } | undefined;

    try {
      // 编程工具常开（融合进日常对话）；联网工具按 web（默认开）；课表识别按是否带图
      const builtin = listBuiltinTools().filter((t) => (t.name === 'save_courses' ? hasImage : web));
      const defs = [...listCodeTools().map(codeToolDef), ...builtin.map(builtinToolDef)];
      const resolveTool = async (name: string, args: Record<string, unknown>): Promise<string> => {
        const code = getCodeTool(name);
        if (code) {
          if (code.requiresConfirm && !isAllowed('code', name)) {
            const req = requestConfirmation(name, summarizeTool(name, args));
            write({ type: 'needs_confirm', confirmId: req.id, toolName: name, summary: req.summary });
            const decision = await req.promise;
            if (decision === 'deny') return `用户拒绝了工具「${name}」的执行，请改用其它方式完成。`;
          }
          const codeStarted = now();
          try {
            const result = await code.execute(args);
            logToolCall({
              kind: 'code',
              toolName: name,
              args,
              result,
              status: 'success',
              latencyMs: now() - codeStarted,
              conversationId: convId,
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
              latencyMs: now() - codeStarted,
              conversationId: convId,
            });
            return `工具执行出错：${msg}`;
          }
        }

        const hit = listBuiltinTools().find((b) => b.name === name);
        if (!hit) return `未知工具：${name}`;
        const r = await runTool({ kind: 'builtin', name, arguments: args, conversationId: convId });
        if (r.status === 'ok') return r.result;
        if (r.status === 'needs_confirm') return `工具「${name}」需要用户确认，已跳过。`;
        return `工具执行失败：${r.message}`;
      };

      const result = await runAgentLoop({
        adapter,
        model,
        messages: finalMessages,
        tools: defs,
        resolveTool,
        temperature,
        signal: controller.signal,
        handlers: {
          onDelta: (text) => write({ type: 'delta', content: text }),
          onToolCall: (tc) => write({ type: 'tool_call', name: tc.function.name }),
          onError: (message) => {
            status = 'error';
            write({ type: 'error', code: 'server_error', message });
          },
        },
      });
      usage = result.usage;
    } catch (err) {
      status = 'error';
      write({ type: 'error', code: 'server_error', message: (err as Error).message });
    }

    reply.raw.off('close', onClose);
    if (controller.signal.aborted) status = 'aborted';

    const input = usage?.input ?? 0;
    const output = usage?.output ?? 0;

    try {
      db.insert(tokenUsage)
        .values({
          id: newId(),
          timestamp: now(),
          conversationId: convId,
          messageId: null,
          featureType: 'chat',
          model,
          stationId: station?.id ?? null,
          tokenInput: input,
          tokenOutput: output,
          tokenTotal: input + output,
          latencyMs: now() - started,
          status,
          createdAt: now(),
          updatedAt: now(),
        })
        .run();
    } catch {
      // token 落库失败不阻断流式响应
    }

    reply.raw.end();
  });
}
