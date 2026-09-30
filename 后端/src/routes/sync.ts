import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  conversations,
  messages,
  attachments,
  prompts,
  worldbook,
  memories,
  summaries,
  agentTasks,
  diaries,
  todos,
  memorials,
  notes,
  periodRecords,
} from '../db/schema.js';
import { getSettingValue, setSetting } from './settings.js';

/**
 * 双端同步（阶段 14）：本地 ↔ VPS 增量同步。
 * - 只同步「用户数据」表；敏感配置（settings 的 Key、stations 的 Key、mcp_servers 的密钥）不同步。
 * - 冲突按 updated_at last-write-wins（平局时远端/新推入方胜）。
 * - 软删除通过 deleted_at 墓碑传播。
 * - 游标 = 毫秒 updated_at；客户端记住 lastPullCursor 增量拉取。
 */

// 同步范围（表名 -> 表对象）。刻意排除 token_usage / tool_calls（运行日志）、
// settings / stations / mcp_servers / sync_state（含密钥或本地状态）。
const SYNCABLE: Record<string, any> = {
  conversations,
  messages,
  attachments,
  prompts,
  worldbook,
  memories,
  summaries,
  agent_tasks: agentTasks,
  diaries,
  todos,
  memorials,
  notes,
  period_records: periodRecords,
};

const NODE_KEY = 'sync.nodeId';
const REMOTE_KEY = 'sync.remoteUrl';

function allRows(table: any): any[] {
  return db.select().from(table).all();
}

function tableById(table: any, id: string): any | undefined {
  return allRows(table).find((r) => r.id === id);
}

/** 把一批行应用到本地（LWW），返回冲突列表 */
function applyRows(table: any, rows: any[]): { conflicts: string[] } {
  const conflicts: string[] = [];
  for (const row of rows) {
    if (!row || typeof row.id !== 'string') continue;
    const existing = tableById(table, row.id);
    if (!existing || (existing.updatedAt ?? 0) <= (row.updatedAt ?? 0)) {
      // LWW：新数据（或平局时的推入方）覆盖
      try {
        db.delete(table).where(eq(table.id, row.id)).run();
        db.insert(table).values(row).run();
      } catch {
        /* 单行失败不影响整体 */
      }
    } else {
      conflicts.push(row.id);
    }
  }
  return { conflicts };
}

export async function syncRoutes(app: FastifyInstance): Promise<void> {
  // 本端同步配置（节点 id / 远端地址）
  app.get('/sync/config', async () => ({
    nodeId: getSettingValue<string>(NODE_KEY, 'local'),
    remoteUrl: getSettingValue<string>(REMOTE_KEY, ''),
  }));

  app.put('/sync/config', async (req) => {
    const body = (req.body ?? {}) as { nodeId?: string; remoteUrl?: string };
    if (body.nodeId !== undefined) setSetting(NODE_KEY, body.nodeId.trim() || 'local');
    if (body.remoteUrl !== undefined) setSetting(REMOTE_KEY, body.remoteUrl.trim());
    return { ok: true };
  });

  // 拉取：返回所有 (updated_at, id) > since 的行（含墓碑）。
  // 游标用复合形式 "updatedAt:id"，避免同一毫秒内多行被 `>` 漏掉（阶段 14 收尾修复）。
  app.get('/sync/pull', async (req) => {
    const { since } = (req.query ?? {}) as { since?: string };
    const raw = typeof since === 'string' && since ? since : '0:';
    const [tsPart, ...rest] = raw.split(':');
    let sinceTs = Number(tsPart) || 0;
    let sinceId = rest.join(':') || '';

    const changes: Record<string, any[]> = {};
    let cursorTs = sinceTs;
    let cursorId = sinceId;
    for (const [name, table] of Object.entries(SYNCABLE)) {
      const rows = allRows(table).filter((r) => {
        const t = r.updatedAt ?? 0;
        return t > sinceTs || (t === sinceTs && r.id > sinceId);
      });
      if (rows.length) changes[name] = rows;
      for (const r of rows) {
        const t = r.updatedAt ?? 0;
        if (t > cursorTs || (t === cursorTs && r.id > cursorId)) {
          cursorTs = t;
          cursorId = r.id;
        }
      }
    }
    const cursor = cursorTs === sinceTs && cursorId === sinceId ? raw : `${cursorTs}:${cursorId}`;
    return { cursor, changes };
  });

  // 推入：把远端（或另一端的）变更应用到本端
  app.post('/sync/push', async (req) => {
    const body = (req.body ?? {}) as { changes?: Record<string, any[]> };
    const changes = body.changes ?? {};
    const conflicts: { table: string; ids: string[] }[] = [];
    for (const [name, rows] of Object.entries(changes)) {
      const table = SYNCABLE[name];
      if (!table || !Array.isArray(rows)) continue;
      const { conflicts: c } = applyRows(table, rows);
      if (c.length) conflicts.push({ table: name, ids: c });
    }
    return { ok: true, conflicts };
  });
}
