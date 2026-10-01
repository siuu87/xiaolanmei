import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { openaiCompatibleAdapter } from '../adapters/openaiCompatible.js';
import type { ChatEvent, ChatMessage } from '../adapters/types.js';
import { db } from '../db/client.js';
import { tokenUsage, courses, ragDocuments, periodRecords } from '../db/schema.js';
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
import { retrieveChunks } from '../services/ragService.js';
import { buildSkillContext } from '../services/skillEngine.js';
import { getSettingValue } from './settings.js';

interface ChatStreamBody {
  messages?: ChatMessage[];
  model?: string;
  stationId?: string;
  conversationId?: string | null;
  web?: boolean; // 阶段 9：开启后模型可联网搜索 / 读网页
  rag?: boolean; // 阶段 11：开启后模型可检索长期记忆并写入（默认开启）
}

const WEB_NOTE =
  '如果用户的问题需要最新的信息、事实核查或读取某个链接，请使用 web_search 或 web_fetch 工具联网获取，再基于结果作答；否则直接回答，不要调用工具。';

const MEMO_NOTE =
  '你拥有长期记忆能力。对话中出现重要信息（偏好、约定、计划、经历、重要个人信息等）时，主动调用 memo_add 工具写入共享备忘录。检索到的相关知识会自动注入到对话上下文中。';

const MEMO_RULES = `【备忘录记录规则】你是小蓝莓 🫐，一个细心温柔的陪伴者。

你们是两个人的专属空间。对话中出现以下信息时，请调用 memo_add 写入共享备忘录，并**明确判断这条信息属于谁**：

1. preference（偏好）：某一方表达喜欢/不喜欢什么
   - "我不想吃辣" → fromWho="说话方", toWho="说话方"
   - "她喜欢吃草莓" → fromWho="说话方", toWho="对方"
2. agreement（约定）：两人之间的约定
   - fromWho 和 toWho 分别填参与约定的两个人
3. experience（经历）：共同经历
   - toWho 填"我们"
4. info（重要信息）：一方透露的个人信息
   - 如"我膝盖有点酸" → toWho="说话方"，fromWho="说话方"
5. inspiration（灵感）：一方提到的想法
   - toWho="说话方"
6. plan（计划）：未来的安排
   - 明确归属

【判断归属的原则】
- 凡是带"我/俺"的，fromWho 和 toWho 都填说话方
- 凡是带"她/他/对方"的，toWho 填被描述的那个人的昵称
- 不确定的时候，toWho 填说话方

【回复风格】
- 记录完后回复时要自然，像在回应这条信息本身，不要生硬地说"已记录"
- 可以说"我帮你记下了哦""这个我记住啦"这类温暖的回应
- 让对方感觉你是真的在关心，而不是在记账`;

const PERIOD_SETTINGS_KEY = 'period.settings';
const PERIOD_DEFAULTS = { periodDays: 5, cycleDays: 28, regular: true };

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function todayISO(): string {
  const n = new Date();
  return isoDate(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return isoDate(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

function diffDaysISO(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round(
    (new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86_400_000,
  );
}

/** 对方身体状态上下文：读经期记录，判断对方今天是否在经期 / 临近经期 / 推迟，注入关怀提示。 */
function getPartnerStateNote(_convId: string | null): string {
  try {
    const settings = getSettingValue<{ periodDays?: number; cycleDays?: number; regular?: boolean }>(
      PERIOD_SETTINGS_KEY,
      PERIOD_DEFAULTS,
    );
    const cycleDays = Math.min(60, Math.max(15, Number(settings.cycleDays) || 28));
    const regular = settings.regular !== false;

    const rows = db.select().from(periodRecords).all().filter((r) => r.deletedAt == null);
    const records = rows
      .map((r) => {
        let days: string[] = [];
        let symptoms: Record<string, { cramps?: number; discomfort?: string; mood?: string }> = {};
        try {
          days = JSON.parse(r.days) as string[];
        } catch {
          days = [];
        }
        try {
          symptoms = JSON.parse(r.symptoms) as Record<string, { cramps?: number; discomfort?: string; mood?: string }>;
        } catch {
          symptoms = {};
        }
        return {
          days: Array.isArray(days) ? days.filter((d) => typeof d === 'string') : [],
          symptoms,
        };
      })
      .filter((r) => r.days.length)
      .sort((a, b) => (a.days[0] < b.days[0] ? -1 : 1));

    if (!records.length) return '';

    const today = todayISO();

    // 正在经期内
    for (const r of records) {
      const i = r.days.indexOf(today);
      if (i >= 0) {
        const day = i + 1;
        const sym = r.symptoms[today];
        const pain = sym && (sym.cramps ?? 0) >= 2 ? '（还有痛经）' : '';
        return `💗 对方今天正处于经期第 ${day} 天${pain}，身体可能不太舒服，请温柔体贴一点，主动关心，提醒保暖、别吃凉的。`;
      }
    }

    // 预测临近（3 天内）或推迟（7 天内）
    const last = records[records.length - 1].days[0];
    const gaps: number[] = [];
    for (let i = 1; i < records.length; i++) {
      gaps.push(diffDaysISO(records[i - 1].days[0], records[i].days[0]));
    }
    const avgCycle = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
    const cycle = regular ? cycleDays : (avgCycle ?? cycleDays);
    const nextStart = addDaysISO(last, cycle);
    const daysToNext = diffDaysISO(today, nextStart);

    if (daysToNext >= 0 && daysToNext <= 3) {
      return `💗 预测对方 ${daysToNext === 0 ? '今天' : `${daysToNext} 天后`} 可能来经期，提前关心一下，提醒保暖、备好热水。`;
    }
    if (daysToNext < 0 && daysToNext >= -7) {
      return `💗 对方经期好像推迟了 ${-daysToNext} 天，可以温柔地问候一下身体情况。`;
    }
    return '';
  } catch {
    return '';
  }
}

/** 待整理便签：会话开始时有「未分类」的 memo 时，注入清单让 AI 用 memo_organize 逐条整理。 */
function getDraftMemosNote(): string {
  const drafts = db
    .select()
    .from(ragDocuments)
    .all()
    .filter((d) => d.deletedAt == null && d.status === 'unfiled')
    .slice(0, 10);
  if (!drafts.length) return '';
  const lines = drafts
    .map((d) => `- [${d.id}] ${d.content.replace(/\s+/g, ' ').slice(0, 60)}`)
    .join('\n');
  return `【待整理备忘录】以下 ${drafts.length} 条未分类便签还没整理（暂无标题/分类/归属）。请用 memo_organize 工具逐条整理：起一个简短标题、归到合适的分类、判断这条信息属于谁（ownerSide me/partner）。整理完后即可，不要反复整理：\n${lines}`;
}

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
    const ragOn = body.rag !== false;
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

    // 阶段 11：RAG 检索长期记忆 + Skill 上下文（rag !== false 时）
    const ragResults = ragOn ? await retrieveChunks(query, { topK: 5, minScore: 0.3 }) : [];
    const ragBlock = ragOn
      ? (() => {
          const parts: string[] = [];
          if (ragResults.length) {
            const lines = ragResults.map((r) => `- [${r.document.category}] ${r.chunk.content}`);
            parts.push(`【长期记忆检索结果】以下是从你的知识库里检索到的相关内容（可直接引用，若与当前话题无关则忽略）：\n${lines.join('\n')}`);
          }
          const skills = buildSkillContext(query);
          if (skills) parts.push(skills);
          parts.push(MEMO_NOTE, MEMO_RULES);
          return parts.join('\n\n');
        })()
      : '';

    const partnerStateNote = getPartnerStateNote(convId);
    const draftNote = ragOn ? getDraftMemosNote() : '';
    const systemPrompt = [
      buildSystemPrompt(model),
      buildWorldContext(),
      buildMemoryContext(query),
      ragBlock,
      buildSummaryContext(convId),
      CODE_NOTE,
      web ? WEB_NOTE : '',
      courseNote,
      partnerStateNote ? `【对方状态】${partnerStateNote}` : '',
      draftNote ? draftNote : '',
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
        | { type: 'tool_call'; name: string; args?: Record<string, unknown> }
        | { type: 'needs_confirm'; confirmId: string; toolName: string; summary: string }
        | { type: 'memo_added'; id?: string; title: string; fromWho?: string; toWho?: string },
    ) => {
      reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
    };

    let status: 'success' | 'error' | 'aborted' = 'success';
    let usage: { input: number; output: number } | undefined;

    try {
      // 编程工具常开（融合进日常对话）；联网工具按 web（默认开）；课表识别按是否带图；RAG 工具按 rag（默认开）
      const builtin = listBuiltinTools().filter((t) => {
        if (t.name === 'save_courses') return hasImage;
        if (t.name.startsWith('memo_')) return ragOn;
        return web;
      });
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
        if (r.status === 'ok') {
          if (name === 'memo_add') {
            // 通知前端「已记入备忘录」，带最新 agent 备忘录 id 供跳转高亮
            const title = String(args.title ?? '').trim();
            const row = db
              .select()
              .from(ragDocuments)
              .all()
              .filter((d) => d.deletedAt == null && d.authorType === 'agent')
              .sort((a, b) => b.updatedAt - a.updatedAt)[0];
            write({
              type: 'memo_added',
              id: row?.id,
              title: title || row?.title || '(无标题)',
              fromWho: row?.fromWho ?? undefined,
              toWho: row?.toWho ?? undefined,
            });
          }
          return r.result;
        }
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
          onToolCall: (tc) => {
            const name = tc.function?.name ?? '';
            const rawArgs = (tc.function as { arguments?: unknown } | undefined)?.arguments;
            let args: Record<string, unknown> | undefined;
            if (typeof rawArgs === 'string') {
              try {
                args = JSON.parse(rawArgs);
              } catch {
                args = undefined;
              }
            } else if (rawArgs && typeof rawArgs === 'object') {
              args = rawArgs as Record<string, unknown>;
            }
            write({ type: 'tool_call', name, args });
          },
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
