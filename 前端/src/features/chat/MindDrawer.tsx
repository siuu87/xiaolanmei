/**
 * 「白起的内心与记忆中枢」—— 点聊天顶栏那颗小红点打开。
 *
 * 两件事在这里合流：
 *   ① **实时情绪状态面板**：爱意 / 占有欲 / 克制 / 思念 四条，加上「上一轮为什么这样变」。
 *      数值由后端每聊完一轮按规则演进（`后端/src/emotion/rules.ts`），这里只读 + 手动微调。
 *   ② **OB 记忆卡片流**：ANCHOR 记忆锚点（`/api/memories`）与渡口念头（`/api/thoughts`）
 *      合成一条时间倒序的流，可筛选、可检索；念头可以点掉（`isResolved`）或删掉。
 *
 * 层级与形态遵守项目硬规则（见 `.workbuddy/memory/MEMORY.md`）：
 *   - **「点开 = 开新页面」**：整页 + 纯色不透明，**不用 `bg-black/xx` / `backdrop-blur` 遮罩**；
 *   - 抽屉是 z-[1200]，这里 `createPortal` 到 body 并压到 z-[1350]；
 *   - Esc 在 window 的 **capture** 阶段拦下来并 `stopPropagation()`，否则一次 Esc 连抽屉一起关。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronLeft,
  Heart,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatSince, formatTimeInterval } from '@/lib/timeAgo';
import { useProfileStore } from '@/stores/profileStore';
import {
  getCharacterMeta,
  getCharacterState,
  listThoughts,
  patchCharacterState,
  patchThought,
  deleteThought,
  createThought,
  type CharacterStateDTO,
  type EmotionField,
  type EmotionFieldMeta,
  type StrategyTag,
  type ThoughtDTO,
} from '@/lib/api/character';
import {
  listMemories,
  deleteMemory,
  type MemoryCategory,
  type MemoryDTO,
} from '@/lib/api/memories';
import { HEALTH_TEXT, probeModelHealth, useModelHealth } from './modelHealth';

export function MindDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>{open && <Sheet onClose={onClose} />}</AnimatePresence>,
    document.body,
  );
}

/** 六条数值的配色（暖→冷，不带「好坏」含义，纯为可读性） */
const FIELD_STYLE: Record<EmotionField, { bar: string; text: string }> = {
  possessiveness: { bar: 'bg-violet-400', text: 'text-violet-200' },
  tension: { bar: 'bg-orange-400', text: 'text-orange-200' },
  restraint: { bar: 'bg-sky-400', text: 'text-sky-200' },
  vulnerability: { bar: 'bg-fuchsia-400', text: 'text-fuchsia-200' },
  affection: { bar: 'bg-rose-400', text: 'text-rose-200' },
  longing: { bar: 'bg-amber-400', text: 'text-amber-200' },
};

/** 行为策略标签 → 面板上的中文短名（只暗示，不把规则正文摊给用户看） */
const STRATEGY_LABEL: Record<StrategyTag, string> = {
  jealous_cold: '吃醋·冷硬',
  jealous_silent: '压着醋意',
  tense: '隐忍紧绷',
  vulnerable: '委屈求哄',
  aftercare: '被顺毛了',
};

const CATEGORY_LABEL: Record<MemoryCategory, string> = {
  anchor: '记忆锚点',
  fact: '事实',
  event: '事件',
  relation: '关系',
};

const CATEGORY_CLS: Record<MemoryCategory, string> = {
  anchor: 'bg-rose-400/15 text-rose-200',
  fact: 'bg-sky-400/15 text-sky-200',
  event: 'bg-amber-400/15 text-amber-200',
  relation: 'bg-violet-400/15 text-violet-200',
};

/** 卡片流筛选项：全部 / 只要锚点 / 只要念头 / 除锚点外的其它记忆 */
type StreamFilter = 'all' | 'anchor' | 'thought' | 'memory';
const FILTERS: { key: StreamFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'anchor', label: '记忆锚点' },
  { key: 'thought', label: '渡口念头' },
  { key: 'memory', label: '其它记忆' },
];

type StreamCard =
  | { kind: 'memory'; id: string; at: number; data: MemoryDTO }
  | { kind: 'thought'; id: string; at: number; data: ThoughtDTO };

function Sheet({ onClose }: { onClose: () => void }) {
  const partnerName = useProfileStore((s) => s.partnerName);
  const title = `${partnerName || '白起'}的内心`;

  const health = useModelHealth();
  const [probing, setProbing] = useState(false);

  const [state, setState] = useState<CharacterStateDTO | null>(null);
  const [meta, setMeta] = useState<EmotionFieldMeta[]>([]);
  const [defaultMood, setDefaultMood] = useState('温柔');
  const [memories, setMemories] = useState<MemoryDTO[]>([]);
  const [thoughts, setThoughts] = useState<ThoughtDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<StreamFilter>('all');

  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState('');

  // 检索用防抖值（服务端检索，见 load 的注释）
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    const wantMemories = filter !== 'thought';
    const wantThoughts = filter !== 'anchor' && filter !== 'memory';
    setLoading(true);
    try {
      const [s, m, mem, th] = await Promise.all([
        getCharacterState(),
        getCharacterMeta(),
        // 检索直接落到服务端（/api/memories?q= / /api/thoughts?q=），
        // 这样以后记忆多到几千条也不用把整表拉到浏览器里过滤。
        wantMemories
          ? listMemories({
              q: debouncedQ,
              category: filter === 'anchor' ? 'anchor' : undefined,
              sort: 'time',
            })
          : Promise.resolve([] as MemoryDTO[]),
        wantThoughts ? listThoughts({ q: debouncedQ }) : Promise.resolve([] as ThoughtDTO[]),
      ]);
      setState(s);
      setMeta(m.fields);
      setDefaultMood(m.defaultMood);
      // 「其它记忆」= 全部记忆去掉锚点（服务端只按单值筛分类，这一步在本地补）
      setMemories(filter === 'memory' ? mem.filter((x) => x.category !== 'anchor') : mem);
      setThoughts(th);
    } catch (err) {
      console.error('加载内心面板失败', err);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // capture 阶段抢在抽屉之前，一次 Esc 只关这一层
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const cards = useMemo<StreamCard[]>(
    () =>
      [
        ...memories.map<StreamCard>((m) => ({ kind: 'memory', id: m.id, at: m.createdAt, data: m })),
        ...thoughts.map<StreamCard>((t) => ({ kind: 'thought', id: t.id, at: t.createdAt, data: t })),
      ].sort((a, b) => b.at - a.at),
    [memories, thoughts],
  );

  const retry = async () => {
    setProbing(true);
    await probeModelHealth();
    setProbing(false);
  };

  const resolveThought = async (t: ThoughtDTO) => {
    await patchThought(t.id, { isResolved: !t.isResolved });
    void load();
  };

  const removeThought = async (id: string) => {
    await deleteThought(id);
    void load();
  };

  const removeMemory = async (id: string) => {
    await deleteMemory(id);
    void load();
  };

  const saveThought = async () => {
    const text = draft.trim();
    if (!text) return;
    await createThought({ thought: text });
    setDraft('');
    setComposerOpen(false);
    void load();
  };

  /**
   * 手动校准：把四项和心情一次性按回 `GET /character/meta` 给的默认值。
   * 自动演进是主路径（每轮按规则微调），但关键词偶尔会误伤（一句「今天好累」也会让占有欲 +2），
   * 给一个一键回到起点的出口，比让用户手动一格格调省事。
   */
  const resetState = async () => {
    const patch: Record<string, unknown> = { currentMood: defaultMood };
    for (const f of meta) patch[f.key] = f.default;
    await patchCharacterState(patch);
    void load();
  };

  const valueOf = (key: EmotionField): number => (state ? state[key] : 0);

  return (
    <motion.div
      data-testid="mind-drawer"
      className="fixed inset-0 z-[1350] flex flex-col bg-[#0f1424]"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 320 }}
    >
      {/* ── 标题栏 ─────────────────────────────────────────── */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.07] px-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="返回"
          data-testid="mind-back"
          className="flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-[14px] text-[#9aa4bb] transition hover:bg-white/[0.06] hover:text-[#e8ecf6]"
        >
          <ChevronLeft size={18} />
          返回
        </button>
        <div
          className="flex-1 truncate text-center text-[15px] font-medium text-[#e8ecf6]"
          data-testid="mind-title"
        >
          {title}
        </div>
        <button
          type="button"
          onClick={() => void retry()}
          aria-label="重探模型通道"
          data-testid="model-health"
          data-health={health}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-[#9aa4bb] transition hover:bg-white/[0.06] hover:text-[#e8ecf6]"
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              health === 'ok'
                ? 'bg-emerald-400'
                : health === 'probing'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-rose-500',
            )}
          />
          {probing ? '重探中…' : HEALTH_TEXT[health]}
        </button>
      </div>

      {/* ── 正文 ───────────────────────────────────────────── */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-4 md:px-6">
        <EmotionPanel state={state} meta={meta} valueOf={valueOf} onReset={() => void resetState()} />

        <section className="mt-6" data-testid="mind-stream">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-[14px] font-medium text-[#e8ecf6]">记忆卡片流</h3>
            <span className="text-[12px] text-[#6b7488]">{cards.length} 张</span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setComposerOpen((v) => !v)}
              aria-label="写一条念头"
              data-testid="mind-composer-open"
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] text-[#9aa4bb] transition hover:bg-white/[0.06] hover:text-[#e8ecf6]"
            >
              {composerOpen ? <X size={14} /> : <Plus size={14} />}
              写一条念头
            </button>
            <button
              type="button"
              onClick={() => void load()}
              aria-label="刷新"
              data-testid="mind-refresh"
              className="rounded-lg p-1.5 text-[#9aa4bb] transition hover:bg-white/[0.06] hover:text-[#e8ecf6]"
            >
              <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
            </button>
          </div>

          {composerOpen && (
            <div className="mb-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                placeholder="他心里闪过的一句话……"
                data-testid="mind-composer-input"
                className="w-full resize-none bg-transparent text-[13px] text-[#e8ecf6] outline-none placeholder:text-[#6b7488]"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setComposerOpen(false);
                    setDraft('');
                  }}
                  className="rounded-lg px-3 py-1.5 text-[12px] text-[#9aa4bb] hover:bg-white/[0.06]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void saveThought()}
                  disabled={!draft.trim()}
                  data-testid="mind-composer-save"
                  className="rounded-lg bg-rose-400/90 px-3 py-1.5 text-[12px] font-medium text-[#1b1205] transition hover:bg-rose-300 disabled:opacity-40"
                >
                  记下
                </button>
              </div>
            </div>
          )}

          {/* 检索 + 筛选 */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="flex min-w-[10rem] flex-1 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 focus-within:border-[#7aa2ff]/60">
              <Search size={14} className="shrink-0 text-[#6b7488]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="检索记忆与念头…"
                data-testid="mind-search"
                className="w-full bg-transparent text-[13px] text-[#e8ecf6] outline-none placeholder:text-[#6b7488]"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ('')}
                  aria-label="清空检索"
                  className="shrink-0 text-[#6b7488] hover:text-[#e8ecf6]"
                >
                  <X size={13} />
                </button>
              )}
            </label>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                data-testid={`mind-filter-${f.key}`}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[12px] transition',
                  filter === f.key
                    ? 'border-rose-300/40 bg-rose-400/15 text-rose-100'
                    : 'border-white/[0.08] text-[#9aa4bb] hover:bg-white/[0.06]',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* 卡片 */}
          {cards.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/[0.1] px-4 py-8 text-center text-[13px] text-[#6b7488]">
              {debouncedQ ? `没有找到和「${debouncedQ}」有关的记忆或念头` : '这里还是空的'}
            </p>
          ) : (
            <ul className="space-y-2">
              {cards.map((c) => (
                <li key={`${c.kind}-${c.id}`}>
                  {c.kind === 'memory' ? (
                    <MemoryCard m={c.data} onDelete={() => void removeMemory(c.id)} />
                  ) : (
                    <ThoughtCard
                      t={c.data}
                      onResolve={() => void resolveThought(c.data)}
                      onDelete={() => void removeThought(c.id)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// ① 情绪面板
// ─────────────────────────────────────────────────────────────

function EmotionPanel({
  state,
  meta,
  valueOf,
  onReset,
}: {
  state: CharacterStateDTO | null;
  meta: EmotionFieldMeta[];
  valueOf: (k: EmotionField) => number;
  onReset: () => void;
}) {
  if (!state) {
    return (
      <section
        data-testid="emotion-panel"
        className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-6 text-[13px] text-[#6b7488]"
      >
        <Loader2 size={15} className="animate-spin" />
        正在读取他的状态…
      </section>
    );
  }

  const evo = state.lastEvolution;

  return (
    <section
      data-testid="emotion-panel"
      className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4"
    >
      <div className="flex items-center gap-2">
        <Heart size={15} className="text-rose-300" />
        <h2 className="text-[14px] font-medium text-[#e8ecf6]">实时情绪</h2>
        <span
          data-testid="emotion-mood"
          className="rounded-full bg-rose-400/15 px-2.5 py-0.5 text-[12px] text-rose-100"
        >
          {state.currentMood}
        </span>
        <div className="flex-1" />
        <span className="text-[11px] text-[#6b7488]">
          {state.turnCount > 0 ? `第 ${state.turnCount} 轮 · ${formatSince(state.updatedAt)}前` : '还没聊过'}
        </span>
        <button
          type="button"
          onClick={onReset}
          aria-label="把数值重置为初始值"
          data-testid="emotion-reset"
          className="rounded-md px-1.5 py-1 text-[11px] text-[#6b7488] transition hover:bg-white/[0.06] hover:text-[#e8ecf6]"
        >
          重置
        </button>
      </div>

      {/* 此刻心绪小剧场 + 命中的行为策略（只给模糊暗示，不把规则正文摊给用户） */}
      {(state.moodTheater || state.strategyTags.length > 0) && (
        <div className="mt-3 space-y-2">
          {state.moodTheater && (
            <p
              data-testid="emotion-theater"
              className="rounded-xl bg-white/[0.04] px-3 py-2 text-[12px] leading-5 text-[#9aa4bb]"
            >
              「{state.moodTheater}」
            </p>
          )}
          {state.strategyTags.length > 0 && (
            <div data-testid="emotion-strategy" className="flex flex-wrap gap-1.5">
              {state.strategyTags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] text-[#9aa4bb]"
                >
                  {STRATEGY_LABEL[t]}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 space-y-2.5">
        {meta.map((f) => {
          const v = valueOf(f.key);
          const style = FIELD_STYLE[f.key];
          return (
            <div key={f.key} className="flex items-center gap-3">
              <span className="w-12 shrink-0 text-[12px] text-[#9aa4bb]">{f.label}</span>
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className={cn('h-full rounded-full transition-all', style.bar)}
                  style={{ width: `${v}%` }}
                />
              </div>
              <span
                data-testid={`emotion-bar-${f.key}`}
                data-value={v}
                className={cn('w-8 shrink-0 text-right text-[13px] tabular-nums', style.text)}
              >
                {v}
              </span>
            </div>
          );
        })}
      </div>

      {/* 为什么 */}
      <div className="mt-4 border-t border-white/[0.07] pt-3" data-testid="emotion-reasons">
        {evo ? (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-[#6b7488]">上一轮（{formatSince(evo.at)}前）：</span>
              {evo.signals.length > 0 ? (
                evo.signals.map((s) => (
                  <span
                    key={s.id}
                    className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] text-[#9aa4bb]"
                  >
                    {s.label}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-[#6b7488]">没有特别的事</span>
              )}
              {evo.gapMs >= 4 * 3600_000 && (
                <span
                  data-testid="emotion-gap"
                  className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] text-[#9aa4bb]"
                >
                  隔了 {formatTimeInterval(evo.gapMs)}
                </span>
              )}
            </div>
            {evo.deltas.length === 0 ? (
              <p className="text-[12px] text-[#6b7488]">这一轮什么都没变。</p>
            ) : (
              <ul className="space-y-1.5">
                {evo.deltas.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px]">
                    <span className="w-12 shrink-0 text-[#9aa4bb]">{d.label}</span>
                    <span className="w-20 shrink-0 tabular-nums text-[#6b7488]">
                      {d.before} → {d.after}
                    </span>
                    <span
                      className={cn(
                        'w-8 shrink-0 tabular-nums',
                        d.delta > 0 ? 'text-amber-300' : 'text-sky-300',
                      )}
                    >
                      {d.delta > 0 ? `+${d.delta}` : d.delta}
                    </span>
                    <span className="min-w-0 flex-1 text-[#9aa4bb]">{d.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-[12px] text-[#6b7488]">
            还没开始演进 —— 每聊完一轮，他会按你说的话悄悄变一点。
          </p>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// ② 卡片
// ─────────────────────────────────────────────────────────────

function MemoryCard({ m, onDelete }: { m: MemoryDTO; onDelete: () => void }) {
  return (
    <article
      data-testid="mind-card"
      data-kind="memory"
      data-card-id={m.id}
      data-category={m.category}
      className="group rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3"
    >
      <div className="flex items-center gap-2">
        <span
          className={cn('rounded-full px-2 py-0.5 text-[11px]', CATEGORY_CLS[m.category] ?? CATEGORY_CLS.fact)}
        >
          {CATEGORY_LABEL[m.category] ?? m.category}
        </span>
        <span className="text-[11px] text-[#6b7488]">{formatSince(m.createdAt)}前</span>
        {m.importance > 0 && (
          <span className="text-[11px] text-[#6b7488]">重要度 {m.importance}</span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={onDelete}
          aria-label="删除这条记忆"
          className="rounded-md p-1 text-[#6b7488] opacity-0 transition group-hover:opacity-100 hover:text-rose-300"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-6 text-[#dbe2f0]">
        {m.content}
      </p>
    </article>
  );
}

function ThoughtCard({
  t,
  onResolve,
  onDelete,
}: {
  t: ThoughtDTO;
  onResolve: () => void;
  onDelete: () => void;
}) {
  const done = t.isResolved;
  return (
    <article
      data-testid="mind-card"
      data-kind="thought"
      data-card-id={t.id}
      data-resolved={done ? '1' : '0'}
      className={cn(
        'group rounded-2xl border px-3.5 py-3 transition',
        done ? 'border-white/[0.05] bg-white/[0.015]' : 'border-amber-300/15 bg-amber-400/[0.06]',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px]',
            done ? 'bg-white/[0.06] text-[#6b7488]' : 'bg-amber-400/15 text-amber-200',
          )}
        >
          {done ? '已消化' : '渡口念头'}
        </span>
        <span className="text-[11px] text-[#6b7488]">{formatSince(t.createdAt)}前</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onResolve}
          aria-label={done ? '重新拾起' : '点掉这条念头'}
          data-testid="thought-resolve"
          className={cn(
            'flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] transition',
            done ? 'text-[#6b7488] hover:text-[#e8ecf6]' : 'text-amber-200 hover:bg-white/[0.06]',
          )}
        >
          <Check size={12} />
          {done ? '拾起' : '点掉'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="删除这条念头"
          className="rounded-md p-1 text-[#6b7488] opacity-0 transition group-hover:opacity-100 hover:text-rose-300"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <p
        className={cn(
          'mt-2 whitespace-pre-wrap break-words text-[13px] leading-6',
          done ? 'text-[#6b7488] line-through decoration-white/20' : 'text-[#e8ecf6]',
        )}
      >
        {t.thought}
      </p>
      {t.context && <p className="mt-1 text-[11px] text-[#6b7488]">（{t.context}）</p>}
    </article>
  );
}
