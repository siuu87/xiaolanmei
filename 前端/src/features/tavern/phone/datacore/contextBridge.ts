/**
 * 数据中枢 · 主角可见桥接
 *
 * 回答需求里那句「里面的记录是主角 AI 可以看到的」：
 * 把散落在各个模块的记录收敛成一段**结构化上下文**，在发起对话时拼进 system prompt。
 *
 * 三条硬约束：
 * 1. **可控**——每个来源都能单独开关、单独设条数上限，并有总字符预算做兜底截断。
 * 2. **不污染**——上下文明确标注是「参考素材」而非当前对话，避免模型把朋友圈当成刚发生的事。
 * 3. **不脆断**——任何来源读不到就静默跳过，绝不因为某个模块没数据就让整段对话起不来。
 *
 * 未来【记忆区】【书库】落地后，只要在 SOURCES 里补一条采集函数即可，上层无需改动。
 */
import { sourceSessions, sourceMoments, sourceWatchlist, sourceMemory, sourceLibrary, type Gathered } from './sources';

/* ------------------------------ 配置 ------------------------------ */

export type SourceId = 'sessions' | 'moments' | 'memory' | 'library' | 'watchlist';

export interface SourceConfig {
  on: boolean;
  /** 该来源最多取几条 */
  limit: number;
}

export interface BridgeConfig {
  enabled: boolean;
  sources: Record<SourceId, SourceConfig>;
  /** 上下文总字符预算，超出后按来源优先级从低到高丢弃 */
  maxChars: number;
  /** 是否把群聊也纳入 */
  includeGroup: boolean;
  /** 是否附上免责说明（建议保持 true） */
  withDisclaimer: boolean;
}

const CFG_KEY = 'tavern.support.bridge.v1';

/**
 * 所有来源的元信息。
 *
 * 注意 `moments`（朋友圈）**保留采集能力但不在中枢里露出开关**——
 * 它只有在小手机里才有意义，主 App 用不到，所以默认关闭、也不进分组。
 */
export const SOURCE_META: { id: SourceId; label: string; desc: string; priority: number }[] = [
  { id: 'memory', label: '长期记忆', desc: '归纳过的分卷摘要与关系进展', priority: 0 },
  { id: 'sessions', label: '聊天记录', desc: '最近对话，含单聊与群聊', priority: 1 },
  { id: 'moments', label: '朋友圈', desc: '动态、点赞与评论', priority: 2 },
  { id: 'library', label: '书库', desc: '已整理成书的标题与简介', priority: 3 },
  { id: 'watchlist', label: '片单', desc: '准备看 / 没看的影视动漫演出', priority: 4 },
];

/**
 * 中枢里「记录来源」的分组。
 *
 * 之前是一锅端按优先级堆在一起，分不清哪个是哪个模块的；
 * 现在按**归属**分组：对话一类、生活记录一类。没列进来的来源不出现（如朋友圈）。
 */
export const SOURCE_GROUPS: { title: string; hint?: string; ids: SourceId[] }[] = [
  { title: '对话', hint: '主角能回头看到的聊天内容。', ids: ['sessions'] },
  { title: '生活记录', hint: '记忆、书库、片单这些日常沉淀。', ids: ['memory', 'library', 'watchlist'] },
];

export const DEFAULT_BRIDGE: BridgeConfig = {
  enabled: true,
  sources: {
    memory: { on: true, limit: 6 },
    sessions: { on: true, limit: 8 },
    moments: { on: false, limit: 6 },
    library: { on: true, limit: 4 },
    watchlist: { on: true, limit: 6 },
  },
  maxChars: 2400,
  includeGroup: true,
  withDisclaimer: true,
};

export function loadBridge(): BridgeConfig {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) return DEFAULT_BRIDGE;
    const d = JSON.parse(raw) as Partial<BridgeConfig>;
    return {
      ...DEFAULT_BRIDGE,
      ...d,
      sources: { ...DEFAULT_BRIDGE.sources, ...(d.sources ?? {}) },
    };
  } catch {
    return DEFAULT_BRIDGE;
  }
}

export function saveBridge(cfg: BridgeConfig): void {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  } catch {
    /* 配额不足时静默失败 */
  }
}

/* ------------------------------ 构建上下文 ------------------------------ */

const COLLECTORS: Record<SourceId, (cfg: BridgeConfig) => Gathered | null> = {
  sessions: sourceSessions,
  moments: sourceMoments,
  memory: sourceMemory,
  library: sourceLibrary,
  watchlist: sourceWatchlist,
};

export interface ContextStats {
  chars: number;
  sources: { id: SourceId; label: string; items: number; chars: number; dropped?: boolean }[];
  /** 因为超出预算被整体丢弃的来源 */
  droppedSources: SourceId[];
}

export interface BuiltContext {
  text: string;
  stats: ContextStats;
}

const DISCLAIMER =
  '以下【生活记录】取材于我与你在别处的互动痕迹，仅用于让你更贴近我的日常；' +
  '它们不是此刻正在发生的事，没有特别提到就不要主动复述或追问。';

/**
 * 汇总各来源 → 按优先级装填 → 超预算则从低优先级整段丢弃。
 * 返回可直接拼进 system prompt 的文本。
 */
export function buildSupportContext(cfg: BridgeConfig = loadBridge()): BuiltContext {
  if (!cfg.enabled) return { text: '', stats: { chars: 0, sources: [], droppedSources: [] } };

  // 采集：任何来源失败都不影响其余来源
  const gathered: { id: SourceId; data: Gathered }[] = [];
  for (const meta of SOURCE_META) {
    const sc = cfg.sources[meta.id];
    if (!sc?.on) continue;
    try {
      const d = COLLECTORS[meta.id](cfg);
      if (d && d.lines.length > 0) gathered.push({ id: meta.id, data: d });
    } catch {
      /* 单源异常不得阻断整体 */
    }
  }

  // 按优先级升序装填，超出预算就整段丢弃低优先级的
  gathered.sort((a, b) => prio(a.id) - prio(b.id));
  let used = 0;
  const kept: typeof gathered = [];
  const droppedSources: SourceId[] = [];
  for (const g of gathered) {
    const cost = g.data.lines.join('\n').length + g.data.title.length + 4;
    if (used + cost > cfg.maxChars) {
      droppedSources.push(g.id);
      continue;
    }
    used += cost;
    kept.push(g);
  }

  kept.sort((a, b) => prio(a.id) - prio(b.id));
  const blocks: string[] = [];
  const stats = { chars: 0, sources: [] as ContextStats['sources'], droppedSources };
  for (const g of kept) {
    const body = g.data.lines.join('\n');
    blocks.push(`【${g.data.title}】\n${body}`);
    stats.sources.push({
      id: g.id,
      label: SOURCE_META.find((m) => m.id === g.id)?.label ?? g.id,
      items: g.data.lines.length,
      chars: body.length,
    });
  }

  let text = blocks.join('\n\n');
  if (cfg.withDisclaimer) text = `${DISCLAIMER}\n\n${text}`;
  stats.chars = text.length;
  return { text, stats: stats as ContextStats };
}

function prio(id: SourceId): number {
  return SOURCE_META.find((m) => m.id === id)?.priority ?? 99;
}

/** 给 UI 预览用：不拼免责说明的原始分块 */
export function previewBlocks(cfg: BridgeConfig = loadBridge()): { title: string; lines: string[] }[] {
  const out: { title: string; lines: string[] }[] = [];
  for (const meta of SOURCE_META) {
    const sc = cfg.sources[meta.id];
    if (!sc?.on) continue;
    try {
      const d = COLLECTORS[meta.id](cfg);
      if (d && d.lines.length) out.push({ title: d.title, lines: d.lines });
    } catch {
      /* 忽略单源异常 */
    }
  }
  return out;
}
