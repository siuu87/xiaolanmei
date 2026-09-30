import type { FastifyInstance } from 'fastify';
import { and, eq, like, gte, lt, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { messages, attachments, conversations } from '../db/schema.js';

interface SearchQuery {
  q?: string;
  date?: string; // yyyy-mm-dd（本地时区当天）
  hasImage?: string; // 'true' | '1' 视为开启
  conversationId?: string;
}

/**
 * 聊天记录查询（阶段 4）：按日期 / 图片 / 关键词 三合一，条件 AND 组合。
 * 图片条件查 attachments 表（阶段 7 发图后自然生效，当前为空表 → 空结果）。
 */
export async function searchRoutes(app: FastifyInstance): Promise<void> {
  // 每日活跃度（日历热力图用）：返回某月每天的消息条数（本地时区，仅非零天）
  app.get('/search/activity', async (req) => {
    const { year, month } = (req.query ?? {}) as { year?: string; month?: string };
    const y = Number(year);
    const m = Number(month);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return { year: y, month: m, days: [] };

    const start = new Date(y, m - 1, 1).getTime();
    const end = new Date(y, m, 1).getTime();
    const rows = db
      .select()
      .from(messages)
      .where(and(gte(messages.createdAt, start), lt(messages.createdAt, end)))
      .all();

    const countByDay = new Map<number, number>();
    for (const r of rows) {
      if (r.deletedAt != null) continue;
      const d = new Date(r.createdAt).getDate();
      countByDay.set(d, (countByDay.get(d) ?? 0) + 1);
    }
    const days = [...countByDay.entries()]
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day - b.day);
    return { year: y, month: m, days };
  });

  app.get('/search/messages', async (req) => {
    const { q, date, hasImage, conversationId } = (req.query ?? {}) as SearchQuery;

    // 图片过滤：找出有图片附件（未删除）的消息 id；无任何图片附件时直接返回空。
    let imageIds: string[] | null = null;
    if (hasImage === 'true' || hasImage === '1') {
      const imgRows = db
        .select({ messageId: attachments.messageId, deletedAt: attachments.deletedAt })
        .from(attachments)
        .where(eq(attachments.type, 'image'))
        .all();
      imageIds = imgRows.filter((r) => r.deletedAt == null).map((r) => r.messageId);
      if (imageIds.length === 0) return { results: [] };
    }

    const conds = [];
    if (conversationId) conds.push(eq(messages.conversationId, conversationId));
    if (q && q.trim()) conds.push(like(messages.content, `%${q.trim()}%`));
    if (date) {
      const parts = date.split('-').map(Number);
      if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
        const [y, m, d] = parts;
        const start = new Date(y, m - 1, d).getTime();
        const end = new Date(y, m - 1, d + 1).getTime();
        conds.push(gte(messages.createdAt, start));
        conds.push(lt(messages.createdAt, end));
      }
    }
    if (imageIds) conds.push(inArray(messages.id, imageIds));

    const rows = conds.length
      ? db.select().from(messages).where(and(...conds)).all()
      : db.select().from(messages).all();

    const convRows = db.select().from(conversations).all();
    const titleById = new Map(convRows.map((c) => [c.id, c.title]));

    const results = rows
      .filter((r) => r.deletedAt == null)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        id: r.id,
        conversationId: r.conversationId,
        conversationTitle: titleById.get(r.conversationId) ?? '（已删除会话）',
        role: r.role,
        content: r.content,
        createdAt: r.createdAt,
      }));

    return { results };
  });
}
