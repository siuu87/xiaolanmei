import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { tokenUsage, conversations, stations } from '../db/schema.js';

/**
 * Token 统计（阶段 7 收尾）：按模型 / 站子 / 会话 / 日期聚合，含估算费用，支持 CSV 导出。
 * 数据源是 token_usage 表（每次 chat/summary/memory/mcp/agent 调用都写一行）。
 */

/** 每百万 token 单价（美元）。未知模型（本地 Ollama 等）按 0 计费。 */
const PRICE_PER_M: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-opus-4': { input: 15, output: 75 },
  'deepseek-chat': { input: 0.27, output: 1.1 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
  'qwen-max': { input: 1.6, output: 6.4 },
  'qwen-plus': { input: 0.4, output: 1.2 },
};

function costOf(model: string | null, input: number, output: number): number {
  const p = (model && PRICE_PER_M[model]) || undefined;
  if (!p) return 0;
  return (input / 1_000_000) * p.input + (output / 1_000_000) * p.output;
}

/** 站子映射：id→名称、模型→站子（用于把 token 行归到真实站子） */
function stationMaps(): {
  nameById: Map<string, string>;
  modelToStation: Map<string, { id: string; name: string }>;
} {
  const nameById = new Map<string, string>();
  const modelToStation = new Map<string, { id: string; name: string }>();
  for (const s of db.select().from(stations).all()) {
    if (s.deletedAt != null) continue;
    nameById.set(s.id, s.name);
    let models: string[] = [];
    try {
      const v = JSON.parse(s.models);
      if (Array.isArray(v)) models = v.filter((x): x is string => typeof x === 'string');
    } catch {
      /* ignore */
    }
    for (const m of models) {
      if (!modelToStation.has(m)) modelToStation.set(m, { id: s.id, name: s.name });
    }
  }
  return { nameById, modelToStation };
}

/** 一行 token 归到站子：有 stationId 直接用；否则按模型匹配站子模型列表；再否则「其他」。 */
function stationOf(
  row: { stationId: string | null; model: string | null },
  maps: ReturnType<typeof stationMaps>,
): { id: string | null; name: string } {
  if (row.stationId) return { id: row.stationId, name: maps.nameById.get(row.stationId) ?? '其他' };
  if (row.model) {
    const hit = maps.modelToStation.get(row.model);
    if (hit) return { id: hit.id, name: hit.name };
  }
  return { id: null, name: '其他' };
}

interface UsageRow {
  timestamp: number;
  conversationId: string | null;
  featureType: string;
  model: string | null;
  stationId: string | null;
  tokenInput: number;
  tokenOutput: number;
  tokenTotal: number;
  estimatedCost: number | null;
  latencyMs: number | null;
  status: string;
}

function rows(since: number): UsageRow[] {
  return db
    .select()
    .from(tokenUsage)
    .all()
    .filter((r) => r.deletedAt == null && r.timestamp >= since)
    .map((r) => ({
      timestamp: r.timestamp,
      conversationId: r.conversationId,
      featureType: r.featureType,
      model: r.model,
      stationId: r.stationId,
      tokenInput: r.tokenInput,
      tokenOutput: r.tokenOutput,
      tokenTotal: r.tokenTotal,
      estimatedCost: r.estimatedCost,
      latencyMs: r.latencyMs,
      status: r.status,
    }));
}

function localDay(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 聚合一份 usage 列表为 {totals, byModel, byStation, byDay, byFeature} */
function aggregate(list: UsageRow[]) {
  const maps = stationMaps();
  const totals = { input: 0, output: 0, total: 0, cost: 0, calls: list.length };
  const byModel = new Map<string, { model: string; stationName: string; input: number; output: number; total: number; cost: number; calls: number }>();
  const byStation = new Map<string, { stationId: string | null; name: string; input: number; output: number; total: number; cost: number; calls: number }>();
  const byDay = new Map<string, { date: string; input: number; output: number; total: number; cost: number; calls: number }>();
  const byFeature = new Map<string, { featureType: string; input: number; output: number; total: number; cost: number; calls: number }>();

  for (const r of list) {
    totals.input += r.tokenInput;
    totals.output += r.tokenOutput;
    totals.total += r.tokenTotal;
    const cost = r.estimatedCost ?? costOf(r.model, r.tokenInput, r.tokenOutput);
    totals.cost += cost;

    const st = stationOf(r, maps);

    const mk = r.model ?? '未知';
    const md = byModel.get(mk) ?? { model: mk, stationName: st.name, input: 0, output: 0, total: 0, cost: 0, calls: 0 };
    md.input += r.tokenInput;
    md.output += r.tokenOutput;
    md.total += r.tokenTotal;
    md.cost += cost;
    md.calls += 1;
    byModel.set(mk, md);

    const sk = st.id ?? '其他';
    const sd = byStation.get(sk) ?? { stationId: st.id, name: st.name, input: 0, output: 0, total: 0, cost: 0, calls: 0 };
    sd.input += r.tokenInput;
    sd.output += r.tokenOutput;
    sd.total += r.tokenTotal;
    sd.cost += cost;
    sd.calls += 1;
    byStation.set(sk, sd);

    const dk = localDay(r.timestamp);
    const dd = byDay.get(dk) ?? { date: dk, input: 0, output: 0, total: 0, cost: 0, calls: 0 };
    dd.input += r.tokenInput;
    dd.output += r.tokenOutput;
    dd.total += r.tokenTotal;
    dd.cost += cost;
    dd.calls += 1;
    byDay.set(dk, dd);

    const fk = r.featureType;
    const fd = byFeature.get(fk) ?? { featureType: fk, input: 0, output: 0, total: 0, cost: 0, calls: 0 };
    fd.input += r.tokenInput;
    fd.output += r.tokenOutput;
    fd.total += r.tokenTotal;
    fd.cost += cost;
    fd.calls += 1;
    byFeature.set(fk, fd);
  }

  const roundCost = (v: number) => Math.round(v * 10000) / 10000;

  return {
    totals: { ...totals, cost: roundCost(totals.cost) },
    byModel: [...byModel.values()]
      .sort((a, b) => b.total - a.total)
      .map((m) => ({ ...m, cost: roundCost(m.cost) })),
    byStation: [...byStation.values()]
      .sort((a, b) => b.cost - a.cost)
      .map((s) => ({ ...s, cost: roundCost(s.cost) })),
    byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byFeature: [...byFeature.values()]
      .sort((a, b) => b.total - a.total)
      .map((f) => ({ ...f, cost: roundCost(f.cost) })),
  };
}

export async function tokenStatsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/token/stats', async (req) => {
    const { days } = req.query as { days?: string };
    const n = Math.max(0, Number(days ?? 30) || 30);
    const since = n === 0 ? 0 : Date.now() - n * 24 * 60 * 60 * 1000;
    const list = rows(since);

    // 按会话聚合（补会话标题）
    const convTitles = new Map(
      db
        .select()
        .from(conversations)
        .all()
        .filter((c) => c.deletedAt == null)
        .map((c) => [c.id, c.title]),
    );
    const byConversation = new Map<string, { conversationId: string; title: string; total: number; calls: number; cost: number }>();
    for (const r of list) {
      if (!r.conversationId) continue;
      const title = convTitles.get(r.conversationId) ?? '已删除会话';
      const c = byConversation.get(r.conversationId) ?? { conversationId: r.conversationId, title, total: 0, calls: 0, cost: 0 };
      c.total += r.tokenTotal;
      c.calls += 1;
      c.cost += r.estimatedCost ?? costOf(r.model, r.tokenInput, r.tokenOutput);
      byConversation.set(r.conversationId, c);
    }

    return {
      ...aggregate(list),
      byConversation: [...byConversation.values()]
        .sort((a, b) => b.total - a.total)
        .map((c) => ({ ...c, cost: Math.round(c.cost * 10000) / 10000 })),
    };
  });

  app.get('/token/usage', async (req) => {
    const { limit } = req.query as { limit?: string };
    const n = Math.min(500, Math.max(1, Number(limit ?? 50) || 50));
    const convTitles = new Map(
      db
        .select()
        .from(conversations)
        .all()
        .filter((c) => c.deletedAt == null)
        .map((c) => [c.id, c.title]),
    );
    const maps = stationMaps();
    return db
      .select()
      .from(tokenUsage)
      .all()
      .filter((r) => r.deletedAt == null)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, n)
      .map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        conversationId: r.conversationId,
        conversationTitle: r.conversationId ? convTitles.get(r.conversationId) ?? null : null,
        featureType: r.featureType,
        model: r.model,
        stationName: stationOf(r, maps).name,
        tokenInput: r.tokenInput,
        tokenOutput: r.tokenOutput,
        tokenTotal: r.tokenTotal,
        estimatedCost: r.estimatedCost ?? costOf(r.model, r.tokenInput, r.tokenOutput),
        latencyMs: r.latencyMs,
        status: r.status,
      }));
  });

  app.get('/token/export', async (_req, reply) => {
    const convTitles = new Map(
      db
        .select()
        .from(conversations)
        .all()
        .filter((c) => c.deletedAt == null)
        .map((c) => [c.id, c.title]),
    );
    const maps = stationMaps();
    const all = db
      .select()
      .from(tokenUsage)
      .all()
      .filter((r) => r.deletedAt == null)
      .sort((a, b) => a.timestamp - b.timestamp);

    const header = '时间,站子,模型,功能,会话,输入token,输出token,总token,估算费用(USD),耗时(ms),状态';
    const lines = all.map((r) => {
      const when = new Date(r.timestamp).toISOString();
      const conv = r.conversationId ? (convTitles.get(r.conversationId) ?? '') : '';
      const cost = (r.estimatedCost ?? costOf(r.model, r.tokenInput, r.tokenOutput)).toFixed(4);
      return [
        when,
        stationOf(r, maps).name,
        r.model ?? '',
        r.featureType,
        conv,
        r.tokenInput,
        r.tokenOutput,
        r.tokenTotal,
        cost,
        r.latencyMs ?? '',
        r.status,
      ].join(',');
    });

    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="token-usage.csv"')
      .send('﻿' + [header, ...lines].join('\n'));
  });
}
