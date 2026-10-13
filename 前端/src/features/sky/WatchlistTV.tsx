/**
 * 片单（WATCH）—— 一台复古电视机
 *
 * 造型：天线 + 木质外壳 + 内嵌 CRT 屏幕（扫描线/辉光）+ 频道按钮 + 旋钮 + 扬声器格栅 + 支脚。
 * 屏幕里是片单内容：一级分类（频道按钮）→ 二级状态切换 → 海报横向滑动。
 * 录入：手动表单 / AI 对话整理（AI 结果需逐条确认、可改分类与状态）。
 * 数据：watchListStore（localStorage 持久化）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Film, Plus, Trash2, Pencil, Upload, X, ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useWatchListStore,
  CATEGORIES,
  STATUSES,
  selectItems,
  countByCategory,
  tintOf,
  type WatchCategory,
  type WatchStatus,
  type WatchItem,
} from './watchListStore';
import { WatchlistPage } from './WatchlistPage';

/* --------------------------------- 造型零件 --------------------------------- */

/** 天线：两根斜杆（顶端不再有小球）+ 底座 */
function Antenna() {
  return (
    <div className="relative mx-auto h-10 w-40" aria-hidden>
      <span className="absolute left-[38%] top-0 h-9 w-[2px] origin-bottom rotate-[-22deg] rounded-full bg-gradient-to-t from-[#6b6b6b] to-[#9a9a9a]" />
      <span className="absolute left-[60%] top-0 h-10 w-[2px] origin-bottom rotate-[20deg] rounded-full bg-gradient-to-t from-[#6b6b6b] to-[#9a9a9a]" />
      <span className="absolute bottom-0 left-1/2 h-2.5 w-7 -translate-x-1/2 rounded-sm bg-[#7a5a3a] shadow-inner" />
    </div>
  );
}

/** 旋钮：外圈刻度 + 中心指示线（angle 决定指针角度） */
function Knob({ size = 30, angle = 0, label }: { size?: number; angle?: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className="relative rounded-full bg-gradient-to-b from-[#e4c98d] to-[#a9803c] shadow-[0_2px_4px_rgba(0,0,0,.5),inset_0_1px_0_rgba(255,255,255,.5)]"
        style={{ width: size, height: size }}
        title={label}
      >
        {/* 刻度点 */}
        <span className="absolute inset-[3px] rounded-full bg-gradient-to-b from-[#c9a96a] to-[#8a6228]" />
        {/* 指针 */}
        <span
          className="absolute left-1/2 top-1/2 h-[38%] w-[2px] origin-bottom rounded-full bg-[#3b2416]/80"
          style={{ transform: `translate(-50%, -100%) rotate(${angle}deg)`, transformOrigin: '50% 100%' }}
        />
      </div>
      <span className="text-[8px] tracking-wide text-amber-100/50">{label}</span>
    </div>
  );
}

/** 扬声器格栅：一组细横条 */
function Speaker({ bars = 5 }: { bars?: number }) {
  return (
    <div className="flex flex-col gap-[3px]" aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <span key={i} className="block h-[2px] rounded-full bg-black/45" style={{ width: 34 - i * 2 }} />
      ))}
    </div>
  );
}

/* --------------------------------- 海报卡片 --------------------------------- */

function PosterCard({ item, onOpen, onEdit }: { item: WatchItem; onOpen: () => void; onEdit: () => void }) {
  const [c1, c2] = tintOf(item.title);
  return (
    <div className="group relative shrink-0 snap-start">
      <motion.button
        type="button"
        onClick={onOpen}
        whileHover={{ y: -3 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 26 }}
        className="block w-[86px] overflow-hidden rounded-md text-left shadow-[0_6px_14px_rgba(0,0,0,.6)] ring-1 ring-white/10"
      >
        {item.poster ? (
          <img src={item.poster} alt={item.title} draggable={false} className="h-[124px] w-full object-cover" />
        ) : (
          /* 无海报：色块 + 胶片图标（名称只在下方显示，避免重复） */
          <div
            className="flex h-[124px] w-full items-center justify-center"
            style={{ background: `linear-gradient(158deg, ${c1}, ${c2})` }}
          >
            <Film className="h-6 w-6 text-white/50" />
          </div>
        )}
      </motion.button>
      <p className="mt-1 w-[86px] truncate text-[9px] leading-tight text-slate-300/90">{item.title}</p>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`编辑 ${item.title}`}
        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-black/60 text-white/90 opacity-0 transition group-hover:opacity-100 hover:bg-black/80"
      >
        <Pencil className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

/* --------------------------------- 详情弹窗 --------------------------------- */

function DetailModal({ item, onClose, onEdit, onRemove }: { item: WatchItem; onClose: () => void; onEdit: () => void; onRemove: () => void }) {
  const cat = CATEGORIES.find((c) => c.key === item.category);
  const st = STATUSES.find((s) => s.key === item.status);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-xs overflow-hidden rounded-2xl bg-[#171717] shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {item.poster ? (
          <img src={item.poster} alt={item.title} className="h-52 w-full object-cover" />
        ) : (
          <div
            className="flex h-52 w-full items-center justify-center"
            style={{ background: `linear-gradient(158deg, ${tintOf(item.title)[0]}, ${tintOf(item.title)[1]})` }}
          >
            <Film className="h-10 w-10 text-white/50" />
          </div>
        )}
        <div className="p-4">
          <h3 className="font-serif text-base font-semibold text-[#E0E0E0]">{item.title}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-[#C9A96A]/15 px-2 py-0.5 text-[11px] text-[#C9A96A]">{cat?.label}</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">{st?.label}</span>
            {item.source === 'ai' && (
              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-300">AI 整理</span>
            )}
          </div>
          {item.note && <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-400">{item.note}</p>}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onRemove}
              className="flex h-9 items-center justify-center gap-1 rounded-lg bg-white/5 px-3 text-xs text-rose-300 transition hover:bg-rose-500/15"
            >
              <Trash2 className="h-3.5 w-3.5" /> 删除
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="flex h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-[#C9A96A] px-3 text-xs font-medium text-[#2b1c0e] transition hover:opacity-90"
            >
              <Pencil className="h-3.5 w-3.5" /> 编辑
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* --------------------------------- 录入表单 --------------------------------- */

interface Draft {
  id: string | null;
  title: string;
  category: WatchCategory;
  status: WatchStatus;
  poster: string;
  note: string;
  source: 'manual' | 'ai';
}

const EMPTY_DRAFT: Draft = { id: null, title: '', category: 'movie', status: 'planned', poster: '', note: '', source: 'manual' };

const fieldCls =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-white/30';

/** 记住上次停在哪个频道 / 状态，刷新后不再跳回默认 */
const PREF_KEY = 'blueberry.watchlist.pref';

function readPref(): { category: WatchCategory; status: WatchStatus } {
  const fallback = { category: 'movie' as WatchCategory, status: 'planned' as WatchStatus };
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return fallback;
    const d = JSON.parse(raw) as Record<string, unknown>;
    return {
      category: CATEGORIES.some((c) => c.key === d.category) ? (d.category as WatchCategory) : fallback.category,
      status: STATUSES.some((s) => s.key === d.status) ? (d.status as WatchStatus) : fallback.status,
    };
  } catch {
    return fallback;
  }
}

function writePref(category: WatchCategory, status: WatchStatus) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({ category, status }));
  } catch {
    /* 忽略写入失败 */
  }
}

/** AI 整理已交给 watchAutoScan 后台自动跑，这里不再保留任何手动整理指令 */

function ItemForm({
  draft,
  onChange,
  onSave,
  onCancel,
  title,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  onSave: () => void;
  onCancel: () => void;
  title: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => onChange({ poster: String(reader.result ?? '') });
    reader.readAsDataURL(f);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4" onClick={onCancel}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-[#171717] p-5 shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-100">{title}</h3>
          <button type="button" onClick={onCancel} aria-label="关闭" className="text-slate-400 hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative h-[112px] w-[76px] shrink-0 overflow-hidden rounded-md ring-1 ring-white/15"
            title="上传海报"
          >
            {draft.poster ? (
              <img src={draft.poster} alt="海报" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-b from-[#2a3550] to-[#121a2b] text-center">
                <Upload className="h-4 w-4 text-amber-200/70" />
                <span className="px-1 text-[9px] text-amber-100/70">上传海报</span>
              </div>
            )}
          </button>
          <div className="min-w-0 flex-1 space-y-2.5">
            <div>
              <label className="mb-1 block text-xs text-slate-400">名称</label>
              <input
                value={draft.title}
                onChange={(e) => onChange({ title: e.target.value })}
                placeholder="如 千与千寻"
                className={fieldCls}
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">海报图片链接（可选）</label>
              <input
                value={draft.poster.startsWith('data:') ? '' : draft.poster}
                onChange={(e) => onChange({ poster: e.target.value })}
                placeholder="也可直接粘贴图片链接"
                className={fieldCls}
              />
            </div>
          </div>
        </div>

        <div className="mt-3">
          <label className="mb-1.5 block text-xs text-slate-400">分类</label>
          <div className="flex gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => onChange({ category: c.key })}
                className={cn(
                  'flex-1 rounded-lg px-2 py-2 text-xs transition',
                  draft.category === c.key
                    ? 'bg-[#C9A96A]/20 text-[#C9A96A] ring-1 ring-[#C9A96A]/50'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <label className="mb-1.5 block text-xs text-slate-400">状态</label>
          <div className="flex gap-2">
            {STATUSES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => onChange({ status: s.key })}
                className={cn(
                  'flex-1 rounded-lg px-2 py-2 text-xs transition',
                  draft.status === s.key
                    ? 'bg-[#C9A96A]/20 text-[#C9A96A] ring-1 ring-[#C9A96A]/50'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <label className="mb-1 block text-xs text-slate-400">备注</label>
          <textarea
            value={draft.note}
            onChange={(e) => onChange({ note: e.target.value })}
            rows={2}
            placeholder="想看的原因、和谁一起、档期…"
            className={cn(fieldCls, 'resize-none')}
          />
        </div>

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onCancel} className="h-10 flex-1 rounded-xl bg-white/5 text-sm font-medium text-slate-300 transition hover:bg-white/10">
            取消
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!draft.title.trim()}
            className="h-10 flex-1 rounded-xl bg-[#C9A96A] text-sm font-medium text-[#2b1c0e] transition hover:opacity-90 disabled:opacity-40"
          >
            保存
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </motion.div>
    </div>
  );
}

/* --------------------------------- 电视机主体 --------------------------------- */

export function WatchlistTV({ hidePageButton = false }: { hidePageButton?: boolean }) {
  const items = useWatchListStore((s) => s.items);
  const load = useWatchListStore((s) => s.load);
  const add = useWatchListStore((s) => s.add);
  const update = useWatchListStore((s) => s.update);
  const remove = useWatchListStore((s) => s.remove);

  useEffect(() => {
    load();
  }, [load]);

  const [pref] = useState(readPref);
  const [category, setCategory] = useState<WatchCategory>(pref.category);
  const [status, setStatus] = useState<WatchStatus>(pref.status);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  /** 三个点 → 片单页面（全屏，不是弹窗）：自动检索的开关在这里，条目管理也在这里 */
  const [pageOpen, setPageOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // 频道 / 状态变化时记住，刷新后停在同一处
  useEffect(() => {
    writePref(category, status);
  }, [category, status]);

  /** 海报区是否真的能横向滚动：只有溢出时才显示左右箭头，避免点了没反应 */
  const list = useMemo(() => selectItems(items, category, status), [items, category, status]);
  const counts = useMemo(() => countByCategory(items), [items]);

  /** 海报区是否真的能横向滚动：只有溢出时才显示左右箭头，避免点了没反应 */
  const [canScroll, setCanScroll] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      setCanScroll(false);
      return;
    }
    const check = () => setCanScroll(el.scrollWidth > el.clientWidth + 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [list.length, category, status]);

  const detail = items.find((x) => x.id === detailId) ?? null;

  /** 左右滑动：按一屏的三分之一步进 */
  const slide = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.6), behavior: 'smooth' });
  };

  const openNew = () => setDraft({ ...EMPTY_DRAFT, category, status });

  const openEdit = (it: WatchItem) =>
    setDraft({
      id: it.id,
      title: it.title,
      category: it.category,
      status: it.status,
      poster: it.poster ?? '',
      note: it.note ?? '',
      source: it.source,
    });

  const saveDraft = () => {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) return;
    const payload = {
      title,
      category: draft.category,
      status: draft.status,
      poster: draft.poster.trim() || undefined,
      note: draft.note.trim(),
      source: draft.source,
    };
    if (draft.id) {
      update(draft.id, payload);
      setDetailId(null);
    } else {
      add(payload);
      // 新建后跳到它所在的分类/状态，保证用户能看到结果
      setCategory(payload.category);
      setStatus(payload.status);
    }
    setDraft(null);
  };

  const catInfo = CATEGORIES.find((c) => c.key === category);

  return (
    <div className="relative select-none">
      <Antenna />

      {/* 机身 */}
      <div
        className="relative overflow-hidden rounded-[26px] p-3 shadow-[0_18px_40px_-8px_rgba(0,0,0,.75)] ring-1 ring-black/50"
        style={{
          background:
            'linear-gradient(180deg,#5c3a22 0%,#43291a 46%,#331e12 100%), repeating-linear-gradient(92deg,rgba(255,255,255,.045) 0 2px,transparent 2px 7px)',
        }}
      >
        {/* 顶部铭牌 */}
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="rounded-sm bg-black/35 px-1.5 py-0.5 text-[8px] tracking-[0.22em] text-amber-100/60">WATCHLIST</span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,.9)]" />
            <span className="text-[8px] text-amber-100/40">POWER</span>
          </span>
        </div>

        {/* 屏幕外框 */}
        <div className="rounded-[18px] bg-[#1d1108] p-[7px] shadow-[inset_0_2px_8px_rgba(0,0,0,.85)]">
          {/* CRT 屏 */}
          <div className="relative overflow-hidden rounded-[13px] bg-[#080b12] shadow-[inset_0_0_22px_rgba(0,0,0,.95)]">
            {/* 扫描线 + 辉光 */}
            <div
              className="pointer-events-none absolute inset-0 z-10"
              aria-hidden
              style={{
                background:
                  'repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 1px,transparent 1px 3px), radial-gradient(ellipse at 50% 45%,rgba(120,170,255,.07),transparent 72%)',
              }}
            />

            {/* 屏内顶部：二级状态切换 */}
            <div className="relative z-20 flex items-center gap-1.5 px-2.5 pt-2.5">
              <div className="flex overflow-hidden rounded-full bg-white/[0.07] p-0.5">
                {STATUSES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setStatus(s.key)}
                    aria-pressed={status === s.key}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[10px] transition-all duration-200',
                      status === s.key ? 'bg-[#C9A96A] font-medium text-[#2b1c0e]' : 'text-slate-300/80 hover:text-white',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <span className="ml-auto text-[9px] text-slate-500">{catInfo?.hint}</span>
            </div>

            {/* 海报滑动区 */}
            <div className="relative z-20">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${category}-${status}`}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                >
                  {list.length === 0 ? (
                    /* 空状态：雪花屏 + NO SIGNAL */
                    <div className="relative flex h-[152px] flex-col items-center justify-center">
                      <div
                        className="pointer-events-none absolute inset-0 opacity-[0.16]"
                        aria-hidden
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 2px), repeating-linear-gradient(90deg,#fff 0 1px,transparent 1px 3px)',
                        }}
                      />
                      <p className="relative font-mono text-[10px] tracking-[0.3em] text-slate-400">NO SIGNAL</p>
                      <p className="relative mt-1.5 text-[10px] text-slate-500">
                        「{catInfo?.label} · {STATUSES.find((s) => s.key === status)?.label}」还是空的
                      </p>
                      <button
                        type="button"
                        onClick={openNew}
                        className="relative mt-2.5 flex items-center gap-1 rounded-full bg-[#C9A96A]/20 px-2.5 py-1 text-[10px] text-[#C9A96A] transition hover:bg-[#C9A96A]/30"
                      >
                        <Plus className="h-3 w-3" /> 加一部
                      </button>
                    </div>
                  ) : (
                    <div
                      ref={scrollRef}
                      className="flex gap-2.5 overflow-x-auto overscroll-x-contain px-2.5 pb-2 pt-2.5 [scroll-behavior:smooth] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      style={{ scrollSnapType: 'x mandatory' }}
                    >
                      {list.map((it) => (
                        <PosterCard key={it.id} item={it} onOpen={() => setDetailId(it.id)} onEdit={() => openEdit(it)} />
                      ))}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* 左右滑动按钮（仅在海报溢出时出现） */}
              {canScroll && (
                <>
                  <button
                    type="button"
                    onClick={() => slide(-1)}
                    aria-label="向左滑动"
                    className="absolute left-0.5 top-1/2 z-30 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white/85 transition hover:bg-black/80"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => slide(1)}
                    aria-label="向右滑动"
                    className="absolute right-0.5 top-1/2 z-30 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white/85 transition hover:bg-black/80"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 控制面板 */}
        <div className="mt-2.5 flex items-center justify-between gap-2 px-0.5">
          {/* 频道按钮 = 一级分类 */}
          <div className="flex items-center gap-1">
            {CATEGORIES.map((c, i) => {
              const on = category === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  aria-pressed={on}
                  title={c.hint}
                  className={cn(
                    'relative flex flex-col items-center rounded-md px-2 py-1 transition-all duration-200',
                    on ? 'bg-black/45 shadow-[inset_0_1px_3px_rgba(0,0,0,.7)]' : 'bg-black/25 hover:bg-black/35',
                  )}
                >
                  <span className="flex items-center gap-1">
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full transition-all duration-200',
                        on ? 'bg-[#C9A96A] shadow-[0_0_6px_rgba(201,169,106,.95)]' : 'bg-amber-100/25',
                      )}
                    />
                    <span className={cn('text-[10px]', on ? 'text-[#C9A96A]' : 'text-amber-100/60')}>{c.label}</span>
                  </span>
                  <span className="mt-0.5 font-mono text-[7px] text-amber-100/35">CH{i + 1}</span>
                  {counts[c.key] > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-3 min-w-3 items-center justify-center rounded-full bg-[#C9A96A] px-[3px] text-[7px] font-bold text-[#2b1c0e]">
                      {counts[c.key]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {/* 手动 / AI 录入 */}
            <button
              type="button"
              onClick={openNew}
              aria-label="手动添加"
              title="手动添加"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/35 text-amber-100/80 ring-1 ring-white/10 transition hover:bg-black/55 hover:text-[#C9A96A]"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            {/* 三个点：点进片单页面（自动检索开关 + 条目管理）；结合页已把片单平铺在下方，这里收起 */}
            {!hidePageButton && (
              <button
                type="button"
                onClick={() => setPageOpen(true)}
                aria-label="更多"
                title="片单"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-black/35 text-amber-100/80 ring-1 ring-white/10 transition hover:bg-black/55 hover:text-[#C9A96A]"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            )}
            <Speaker />
            <Knob size={26} angle={-30} label="CH" />
            <Knob size={22} angle={40} label="VOL" />
          </div>
        </div>
      </div>

      {/* 支脚 */}
      <div className="mx-auto flex w-40 justify-between" aria-hidden>
        <span className="h-2.5 w-3 rounded-b-sm bg-[#3b2416]" />
        <span className="h-2.5 w-3 rounded-b-sm bg-[#3b2416]" />
      </div>

      {detail && (
        <DetailModal
          item={detail}
          onClose={() => setDetailId(null)}
          onEdit={() => openEdit(detail)}
          onRemove={() => {
            remove(detail.id);
            setDetailId(null);
          }}
        />
      )}

      {draft && (
        <ItemForm
          draft={draft}
          onChange={(p) => setDraft((d) => (d ? { ...d, ...p } : d))}
          onSave={saveDraft}
          onCancel={() => setDraft(null)}
          title={draft.id ? '编辑这一条' : '加入片单'}
        />
      )}

      {/* 三个点点开的片单页面：全屏推入，返回即回到电视机 */}
      <AnimatePresence>
        {pageOpen && <WatchlistPage key="watch-page" onClose={() => setPageOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}

export default WatchlistTV;
