import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentTasks } from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import { runCodingAgent, type AgentEvent } from '../agent/run.js';
import { resolveConfirmation, listPendingConfirmations } from '../services/confirmations.js';
import { listDir, readFile, writeFile, workspaceRoot } from '../agent/workspace.js';

/**
 * 智能编程路由（阶段 10）：任务列表 / 运行（SSE）/ 权限确认 / 工作区文件浏览与保存。
 */
export async function agentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/agent/tasks', async () => {
    const rows = db
      .select()
      .from(agentTasks)
      .orderBy(desc(agentTasks.createdAt))
      .limit(30)
      .all()
      .filter((r) => r.deletedAt == null);
    return { tasks: rows };
  });

  app.get('/agent/pending-confirms', async () => ({ confirms: listPendingConfirmations() }));

  app.post('/agent/confirm', async (req, reply) => {
    const body = (req.body ?? {}) as { confirmId?: string; decision?: string };
    const id = (body.confirmId ?? '').trim();
    const decision = body.decision === 'allow' ? 'allow' : 'deny';
    if (!id) {
      reply.code(400).send({ code: 'invalid_request', message: '缺少 confirmId' });
      return;
    }
    const ok = resolveConfirmation(id, decision);
    if (!ok) {
      reply.code(404).send({ code: 'not_found', message: '确认请求不存在或已超时' });
      return;
    }
    return { ok: true, decision };
  });

  // 工作区文件树（供前端文件树展示）
  app.get('/agent/workspace/tree', async (req, reply) => {
    const { path } = (req.query ?? {}) as { path?: string };
    try {
      return { root: workspaceRoot(), entries: listDir(path ?? '.') };
    } catch (err) {
      reply.code(400).send({ code: 'invalid_request', message: (err as Error).message });
    }
  });

  // 读取工作区文件
  app.get('/agent/workspace/file', async (req, reply) => {
    const { path } = (req.query ?? {}) as { path?: string };
    if (!path) {
      reply.code(400).send({ code: 'invalid_request', message: '缺少 path' });
      return;
    }
    try {
      return { path, content: readFile(path) };
    } catch (err) {
      reply.code(400).send({ code: 'invalid_request', message: (err as Error).message });
    }
  });

  // 保存工作区文件（用户在编辑器里手动保存，无需确认）
  app.post('/agent/workspace/save', async (req, reply) => {
    const body = (req.body ?? {}) as { path?: string; content?: string };
    const p = (body.path ?? '').trim();
    if (!p) {
      reply.code(400).send({ code: 'invalid_request', message: '缺少 path' });
      return;
    }
    try {
      writeFile(p, String(body.content ?? ''));
      return { ok: true };
    } catch (err) {
      reply.code(400).send({ code: 'invalid_request', message: (err as Error).message });
    }
  });

  // 运行编码任务（SSE）
  app.post('/agent/run', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body ?? {}) as { title?: string; prompt?: string; conversationId?: string };
    const prompt = (body.prompt ?? '').trim();
    if (!prompt) {
      reply.code(400).send({ code: 'invalid_request', message: '缺少任务描述' });
      return;
    }
    const taskId = newId();
    const title = (body.title ?? '').trim() || (prompt.length > 30 ? prompt.slice(0, 30) + '…' : prompt);
    const ts = now();
    db.insert(agentTasks)
      .values({
        id: taskId,
        title,
        status: 'running',
        prompt,
        workspacePath: workspaceRoot(),
        plan: null,
        conversationId: body.conversationId ?? null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    const controller = new AbortController();
    const onClose = () => {
      if (!reply.raw.writableEnded) controller.abort();
    };

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.flushHeaders();
    reply.raw.on('close', onClose);

    const write = (ev: AgentEvent) => {
      reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
    };

    let finalStatus: 'done' | 'error' | 'stopped' = 'done';
    try {
      await runCodingAgent({
        taskId,
        prompt,
        conversationId: body.conversationId ?? null,
        signal: controller.signal,
        onEvent: (ev) => {
          write(ev);
          if (ev.type === 'error') finalStatus = 'error';
        },
      });
    } catch (err) {
      finalStatus = 'error';
      write({ type: 'error', message: (err as Error).message });
    }

    reply.raw.off('close', onClose);
    if (controller.signal.aborted) finalStatus = 'stopped';

    db.update(agentTasks).set({ status: finalStatus, updatedAt: now() }).where(eq(agentTasks.id, taskId)).run();
    reply.raw.end();
  });
}
