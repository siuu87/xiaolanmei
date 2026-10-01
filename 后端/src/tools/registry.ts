import type { ToolDef } from '../adapters/types.js';
import { eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { courses, ragDocuments, ragChunks, ragDocumentCollections } from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import { indexDocument, updateDocument } from '../services/ragService.js';

/**
 * 内置工具（阶段 9 自主联网）：读网页 / 联网搜索 / 保存课程表。
 * 读网页与搜索只读、无副作用 → 默认免确认；save_courses 写课程表（用户主动发起，免确认）。
 * 统一经 toolRunner 执行并落 tool_calls 记录。
 * MCP 工具在 mcp/client.ts 里以同样形状注册，走同一套执行/权限层。
 */

export interface BuiltinTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  /** 是否需要用户确认（内置只读工具均为 false） */
  requiresConfirm: boolean;
  execute(args: Record<string, unknown>): Promise<string>;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&nbsp;/gi, ' ')
    .trim();
}

const webFetch: BuiltinTool = {
  name: 'web_fetch',
  description: '读取一个网页的正文文本。当用户询问某个链接的内容、或需要阅读某篇网页时使用。',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '要读取的网页 URL（http/https）' },
    },
    required: ['url'],
  },
  requiresConfirm: false,
  async execute(args) {
    const url = String(args.url ?? '').trim();
    if (!/^https?:\/\//i.test(url)) return '错误：url 必须以 http:// 或 https:// 开头';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LittleBlueberry/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return `读取失败：HTTP ${res.status}`;
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json') || ct.includes('text/')) {
      const text = await res.text();
      return ct.includes('json') ? text.slice(0, 8000) : htmlToText(text).slice(0, 8000);
    }
    return htmlToText(await res.text()).slice(0, 8000);
  },
};

const webSearch: BuiltinTool = {
  name: 'web_search',
  description:
    '联网搜索。当需要最新信息、事实核查、或回答超出模型知识截止日期的问题时使用。返回若干条标题+摘要+链接。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词' },
    },
    required: ['query'],
  },
  requiresConfirm: false,
  async execute(args) {
    const query = String(args.query ?? '').trim();
    if (!query) return '错误：query 不能为空';
    // 用 DuckDuckGo 静态 HTML 端点（免 Key，尽力而为）
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LittleBlueberry/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return `搜索失败：HTTP ${res.status}`;
    const html = await res.text();

    // 抓结果块：每条含标题链接 + 摘要
    const results: { title: string; url: string; snippet: string }[] = [];
    const blockRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(html)) !== null && results.length < 8) {
      const rawUrl = m[1];
      // DuckDuckGo 的 href 是跳转链接，真正的 URL 在 uddg 参数里
      let url = rawUrl;
      const uddg = rawUrl.match(/uddg=([^&]+)/);
      if (uddg) {
        try {
          url = decodeURIComponent(uddg[1]);
        } catch {
          url = uddg[1];
        }
      }
      results.push({ title: decodeEntities(m[2].replace(/<[^>]+>/g, '')), url, snippet: '' });
    }
    let si = 0;
    while ((m = snippetRe.exec(html)) !== null && si < results.length) {
      results[si].snippet = decodeEntities(m[1].replace(/<[^>]+>/g, ''));
      si += 1;
    }

    if (results.length === 0) return '没有搜到结果（可能是网络受限或被限流），建议换关键词或稍后再试。';
    return results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
      .join('\n');
  },
};

const COURSE_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];

function toInt(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

const saveCourses: BuiltinTool = {
  name: 'save_courses',
  description:
    '保存课程表：用识别/整理出的课程列表整体替换当前课表。当用户发课表截图、或口头新增/修改课程时调用。',
  parameters: {
    type: 'object',
    properties: {
      courses: {
        type: 'array',
        description: '完整的课程列表（replace 语义：传入当前应存在的全部课程）',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '课程名' },
            day: { type: 'integer', description: '周几，1=周一 … 7=周日' },
            startPeriod: { type: 'integer', description: '起始节次（1 起）' },
            endPeriod: { type: 'integer', description: '结束节次（含）' },
            startWeek: { type: 'integer', description: '起始周' },
            endWeek: { type: 'integer', description: '结束周' },
            parity: { type: 'string', enum: ['all', 'odd', 'even'], description: '每周/单周/双周' },
            teacher: { type: 'string', description: '老师（可选）' },
            location: { type: 'string', description: '教室/地点（可选）' },
            color: { type: 'string', description: '十六进制颜色（可选）' },
          },
          required: ['name', 'day', 'startPeriod', 'endPeriod', 'startWeek', 'endWeek'],
        },
      },
    },
    required: ['courses'],
  },
  requiresConfirm: false,
  async execute(args) {
    const list = (Array.isArray(args.courses) ? args.courses : []) as Array<Record<string, unknown>>;
    const ts = now();
    const rows = list
      .map((raw, i) => {
        const name = String(raw.name ?? '').trim();
        if (!name) return null;
        const startPeriod = toInt(raw.startPeriod, 1, 20, 1);
        const endPeriod = toInt(raw.endPeriod, 1, 20, startPeriod);
        const startWeek = toInt(raw.startWeek, 1, 52, 1);
        const endWeek = toInt(raw.endWeek, 1, 52, startWeek);
        const parity = raw.parity === 'odd' || raw.parity === 'even' ? raw.parity : 'all';
        return {
          id: newId(),
          name,
          teacher: raw.teacher ? String(raw.teacher).trim() : null,
          location: raw.location ? String(raw.location).trim() : null,
          day: toInt(raw.day, 1, 7, 1),
          startPeriod,
          endPeriod,
          startWeek,
          endWeek,
          parity,
          color:
            typeof raw.color === 'string' && raw.color ? raw.color : COURSE_COLORS[i % COURSE_COLORS.length],
          createdAt: ts,
          updatedAt: ts,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);

    db.transaction((tx) => {
      tx.update(courses).set({ deletedAt: ts, updatedAt: ts }).where(isNull(courses.deletedAt)).run();
      for (const r of rows) tx.insert(courses).values(r).run();
    });

    return `已保存 ${rows.length} 门课程。`;
  },
};

const RAG_CATEGORIES = ['preference', 'agreement', 'experience', 'info', 'inspiration', 'plan', 'general'] as const;

const ragImport: BuiltinTool = {
  name: 'rag_import',
  description:
    '把一条值得长期记住的内容写入双向记忆（RAG）。当用户透露了偏好、约定、经历、计划、灵感等重要信息，或需要你记住某件事时调用。默认归档到系统默认知识库。',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '记忆标题，简短概括（如「TA 喜欢喝美式」）' },
      content: { type: 'string', description: '要记住的完整内容（一句话到一段）' },
      category: {
        type: 'string',
        enum: ['preference', 'agreement', 'experience', 'info', 'inspiration', 'plan'],
        description: '记忆分类：preference 喜好/忌口、agreement 约定/承诺、experience 共同经历、info 事实信息、inspiration 灵感、plan 计划',
      },
      tags: { type: 'array', items: { type: 'string' }, description: '标签（可选）' },
      importance: { type: 'integer', description: '重要程度 1-5，默认 3' },
    },
    required: ['title', 'content'],
  },
  requiresConfirm: false,
  async execute(args) {
    const content = String(args.content ?? '').trim();
    if (!content) return '错误：content 不能为空';
    const category = String(args.category ?? 'info');
    const cat = RAG_CATEGORIES.includes(category as never) ? category : 'info';
    const importance = Math.min(5, Math.max(1, Math.round(Number(args.importance) || 3)));
    const tags = Array.isArray(args.tags) ? args.tags.map((t) => String(t)).filter(Boolean) : [];
    const result = await indexDocument({
      title: String(args.title ?? '').trim() || '(无标题)',
      content,
      source: 'agent',
      category: cat,
      tags: tags.length ? tags : undefined,
      importance,
    });
    return `已记住：${String(args.title ?? '').trim() || '(无标题)'}（${cat}，${result.chunkCount} 块）。`;
  },
};

const ragUpdate: BuiltinTool = {
  name: 'rag_update',
  description:
    '更新一条已存在的长期记忆。当用户纠正、补充或推翻之前记下的信息时调用（如「其实我不吃香菜」）。需要用户确认。',
  parameters: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: '要更新的记忆文档 id' },
      newContent: { type: 'string', description: '更新后的完整内容' },
      reason: { type: 'string', description: '更新原因（可选）' },
    },
    required: ['documentId', 'newContent'],
  },
  requiresConfirm: true,
  async execute(args) {
    const documentId = String(args.documentId ?? '').trim();
    const newContent = String(args.newContent ?? '').trim();
    if (!documentId || !newContent) return '错误：documentId 与 newContent 不能为空';
    const reason = args.reason ? String(args.reason).trim() : undefined;
    try {
      const result = await updateDocument(documentId, newContent, reason);
      return `已更新记忆 ${documentId}（${result.chunkCount} 块）。`;
    } catch (err) {
      return `更新失败：${(err as Error).message}`;
    }
  },
};

const ragDelete: BuiltinTool = {
  name: 'rag_delete',
  description: '删除一条长期记忆（软删除）。当用户明确表示某条记忆不再适用、或记错了要求删除时调用。需要用户确认。',
  parameters: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: '要删除的记忆文档 id' },
      reason: { type: 'string', description: '删除原因（可选）' },
    },
    required: ['documentId'],
  },
  requiresConfirm: true,
  async execute(args) {
    const documentId = String(args.documentId ?? '').trim();
    if (!documentId) return '错误：documentId 不能为空';
    const ts = now();
    const result = db.update(ragDocuments).set({ deletedAt: ts, updatedAt: ts }).where(eq(ragDocuments.id, documentId)).run();
    if (result.changes === 0) return '删除失败：文档不存在';
    db.update(ragChunks).set({ deletedAt: ts, updatedAt: ts }).where(eq(ragChunks.documentId, documentId)).run();
    db.delete(ragDocumentCollections).where(eq(ragDocumentCollections.documentId, documentId)).run();
    return `已删除记忆 ${documentId}。`;
  },
};

const BUILTIN_TOOLS: BuiltinTool[] = [webFetch, webSearch, saveCourses, ragImport, ragUpdate, ragDelete];
const byName = new Map(BUILTIN_TOOLS.map((t) => [t.name, t]));

export function listBuiltinTools(): BuiltinTool[] {
  return BUILTIN_TOOLS;
}

export function getBuiltinTool(name: string): BuiltinTool | undefined {
  return byName.get(name);
}

export function hasBuiltinTool(name: string): boolean {
  return byName.has(name);
}

/** 转成 OpenAI function calling 的 ToolDef 格式 */
export function builtinToolDef(t: BuiltinTool): ToolDef {
  return {
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  };
}
