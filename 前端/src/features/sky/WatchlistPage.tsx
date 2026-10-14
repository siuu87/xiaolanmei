/**
 * 片单页面（电视机上那三个点点进来的地方）
 *
 * 这里管两件事：
 *   1. 自动检索的开关 / 频率 / 立刻跑一次——AI 平时自己在后台抽，不用来这儿操作；
 *   2. 片单本身的增删改：搜索、按分类状态筛、改分类状态备注、删。
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Search, Loader2, Pencil, Trash2, Check, X, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useWatchListStore,
  CATEGORIES,
  STATUSES,
  tintOf,
  type WatchCategory,
  type WatchStatus,
  type WatchItem,
} from './watchListStore';
import { useAutoScan, INTERVAL_OPTIONS, rememberDeleted } from './watchAutoScan';

type CatFilter = WatchCategory | 'all';
type StFilter = WatchStatus | 'all';

function hhmm(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function intervalLabel(m: number): string {
  return m < 60 ? `${m} 分钟` : `${m / 60} 小时`;
}

export function WatchlistPage({ onClose, inline = false }: { onClose?: () => void; inline?: boolean }) {
  const items = useWatchListStore((s) => s.items);
  const load = useWatchListStore((s) => s.load);
  const update = useWatchListStore((s) => s.update);
  const remove = useWatchListStore((s) => s.remove);

  const { settings, running, last, setEnabled, setIntervalMin, runNow } = useAutoScan();

  const [kw, setKw] = useState('');
  const [cat, setCat] = useState<CatFilter>('all');
  const [st, setSt] = useState<StFilter>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', category: 'movie' as WatchCategory, status: 'planned' as WatchStatus, note: '' });

  useEffect(() => {
    load();
  }, [load]);

  const list = useMemo(() => {
    const k = kw.trim().toLowerCase();
    return items
      .filter((x) => (cat === 'all' || x.category === cat) && (st === 'all' || x.status === st))
      .filter((x) => !k || x.title.toLowerCase().includes(k) || (x.note ?? '').toLowerCase().includes(k))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [items, cat, st, kw]);

  const startEdit = (it: WatchItem) => {
    setEditing(it.id);
    setForm({ title: it.title, category: it.category, status: it.status, note: it.note ?? '' });
  };

  const saveEdit = (id: string) => {
    const t = form.title.trim();
    if (t) update(id, { title: t, category: form.category, status: form.status, note: form.note.trim() });
    setEditing(null);
  };

  const drop = (it: WatchItem) => {
    remove(it.id);
    rememberDeleted(it.title); // 记进忽略名单，自动检索不会再把它加回来
    if (editing === it.id) setEditing(null);
  };

  const body = (
    <>
        {/* ---------------- 自动检索 ---------------- */}
        <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-slate-100">
              <Sparkles className="h-3.5 w-3.5 text-[#C9A96A]" /> 自动从聊天里检索
            </p>
            <button
              type="button"
              role="switch"
              aria-checked={settings.enabled}
              aria-label="自动检索开关"
              onClick={() => setEnabled(!settings.enabled)}
              className={cn(
                'relative h-6 w-11 shrink-0 rounded-full transition',
                settings.enabled ? 'bg-[#C9A96A]' : 'bg-white/15',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                  settings.enabled ? 'left-[22px]' : 'left-0.5',
                )}
              />
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            每隔一段时间去看一眼聊天记录，把新提到的作品自动加进来。删掉的不会再加回来。
          </p>

          {/* 频率 */}
          <p className="mb-1.5 mt-3 text-[11px] uppercase tracking-wide text-slate-500">多久看一次</p>
          <div className="flex gap-1.5">
            {INTERVAL_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setIntervalMin(m)}
                aria-pressed={settings.intervalMin === m}
                className={cn(
                  'flex-1 rounded-lg py-1.5 text-[11px] transition',
                  settings.intervalMin === m
                    ? 'bg-[#C9A96A]/20 text-[#C9A96A] ring-1 ring-[#C9A96A]/50'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10',
                )}
              >
                {intervalLabel(m)}
              </button>
            ))}
          </div>

          {/* 立刻跑一次 + 状态 */}
          <button
            type="button"
            onClick={runNow}
            disabled={running}
            aria-label="立即检索一次"
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/[0.07] py-2 text-[12px] text-slate-200 transition hover:bg-white/[0.12] disabled:opacity-40"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {running ? '正在检索…' : '立即检索一次'}
          </button>

          <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
            {last
              ? `上次 ${hhmm(last.ranAt)}：${last.added > 0 ? `自动加入 ${last.added} 条${last.titles.length ? `（${last.titles.join('、')}）` : ''}` : last.note || '没有变化'}${last.usedAi ? ' · AI 识别' : ''}`
              : '还没跑过。开启后到点会自动跑，也可以点上面立刻跑一次。'}
          </p>
        </section>

        {/* ---------------- 搜索 ---------------- */}
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="搜索片名或备注"
            aria-label="搜索片单"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-[13px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-white/25"
          />
        </div>

        {/* ---------------- 筛选 ---------------- */}
        <div className="mb-2 flex gap-1.5">
          {(['all', ...CATEGORIES.map((c) => c.key)] as CatFilter[]).map((k) => {
            const label = k === 'all' ? '全部' : CATEGORIES.find((c) => c.key === k)!.label;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setCat(k)}
                aria-pressed={cat === k}
                className={cn(
                  'rounded-full px-3 py-1 text-[11px] transition',
                  cat === k ? 'bg-[#C9A96A] font-medium text-[#2b1c0e]' : 'bg-white/5 text-slate-400 hover:bg-white/10',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="mb-3 flex gap-1.5">
          {(['all', ...STATUSES.map((s) => s.key)] as StFilter[]).map((k) => {
            const label = k === 'all' ? '全部' : STATUSES.find((s) => s.key === k)!.label;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setSt(k)}
                aria-pressed={st === k}
                className={cn(
                  'rounded-full px-3 py-1 text-[11px] transition',
                  st === k ? 'bg-[#C9A96A] font-medium text-[#2b1c0e]' : 'bg-white/5 text-slate-400 hover:bg-white/10',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ---------------- 列表 ---------------- */}
        {list.length === 0 ? (
          <p className="px-1 py-8 text-center text-[12px] text-slate-500">
            {items.length === 0 ? '片单还是空的。开启自动检索，聊天里提到片子就会自己进来。' : '没有符合条件的条目。'}
          </p>
        ) : (
          <ul className="space-y-2 pb-6">
            {list.map((it) => {
              const [c1, c2] = tintOf(it.title);
              const catLabel = CATEGORIES.find((c) => c.key === it.category)?.label ?? '';
              const on = editing === it.id;
              return (
                <li key={it.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
                  <div className="flex gap-2.5">
                    <div
                      className="h-[62px] w-[44px] shrink-0 overflow-hidden rounded-md ring-1 ring-white/10"
                      style={it.poster ? undefined : { background: `linear-gradient(158deg, ${c1}, ${c2})` }}
                    >
                      {it.poster && <img src={it.poster} alt={it.title} className="h-full w-full object-cover" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      {on ? (
                        <>
                          <input
                            value={form.title}
                            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                            aria-label="编辑片名"
                            className="w-full rounded-lg bg-black/25 px-2.5 py-1.5 text-[13px] text-slate-200 outline-none"
                          />
                          <div className="mt-1.5 flex gap-1.5">
                            {CATEGORIES.map((c) => (
                              <button
                                key={c.key}
                                type="button"
                                onClick={() => setForm((f) => ({ ...f, category: c.key }))}
                                className={cn(
                                  'flex-1 rounded-lg py-1.5 text-[11px] transition',
                                  form.category === c.key
                                    ? 'bg-[#C9A96A]/20 text-[#C9A96A] ring-1 ring-[#C9A96A]/50'
                                    : 'bg-white/5 text-slate-400 hover:bg-white/10',
                                )}
                              >
                                {c.label}
                              </button>
                            ))}
                          </div>
                          <div className="mt-1.5 flex gap-1.5">
                            {STATUSES.map((s) => (
                              <button
                                key={s.key}
                                type="button"
                                onClick={() => setForm((f) => ({ ...f, status: s.key }))}
                                className={cn(
                                  'flex-1 rounded-lg py-1.5 text-[11px] transition',
                                  form.status === s.key
                                    ? 'bg-[#C9A96A]/20 text-[#C9A96A] ring-1 ring-[#C9A96A]/50'
                                    : 'bg-white/5 text-slate-400 hover:bg-white/10',
                                )}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                          <input
                            value={form.note}
                            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                            placeholder="备注（可选）"
                            aria-label="编辑备注"
                            className="mt-1.5 w-full rounded-lg bg-black/25 px-2.5 py-1.5 text-[11px] text-slate-200 outline-none placeholder:text-slate-600"
                          />
                          <div className="mt-2 flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditing(null)}
                              aria-label="取消编辑"
                              className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-white/5 text-[12px] text-slate-300 transition hover:bg-white/10"
                            >
                              <X className="h-3.5 w-3.5" /> 取消
                            </button>
                            <button
                              type="button"
                              onClick={() => saveEdit(it.id)}
                              aria-label="保存修改"
                              className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-[#C9A96A] text-[12px] font-medium text-[#2b1c0e] transition hover:opacity-90"
                            >
                              <Check className="h-3.5 w-3.5" /> 保存
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="truncate text-[13px] text-slate-100">{it.title}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-slate-400">{catLabel}</span>
                            <button
                              type="button"
                              onClick={() => update(it.id, { status: it.status === 'planned' ? 'watched' : 'planned' })}
                              aria-label={`把 ${it.title} 切换为${it.status === 'planned' ? '看完的' : '准备看的'}`}
                              className={cn(
                                'rounded-full px-2 py-0.5 text-[10px] transition',
                                it.status === 'watched' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-[#C9A96A]/15 text-[#C9A96A]',
                              )}
                            >
                              {STATUSES.find((s) => s.key === it.status)?.label}
                            </button>
                            {it.source === 'ai' && (
                              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">自动加入</span>
                            )}
                          </div>
                          {it.note && <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{it.note}</p>}
                        </>
                      )}
                    </div>

                    {!on && (
                      <div className="flex shrink-0 flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(it)}
                          aria-label={`编辑 ${it.title}`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/10 hover:text-[#C9A96A]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => drop(it)}
                          aria-label={`删除 ${it.title}`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-500/15 hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
    </>
  );

  if (inline) {
    return <div className="flex flex-col">{body}</div>;
  }

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      className="fixed inset-0 z-[60] flex flex-col bg-[#0d1017]"
    >
      {/* 顶栏 */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 px-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="返回"
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-slate-100">片单</p>
          <p className="truncate text-[10px] text-slate-500">共 {items.length} 条 · 自动检索{settings.enabled ? '已开启' : '已关闭'}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{body}</div>
    </motion.div>
  );
}

export default WatchlistPage;
