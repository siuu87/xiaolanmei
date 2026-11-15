import { Check, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fullTime, groupByMonth, lookOf, type Entry } from './inspiration';

/**
 * 灵感流的四种排布（2026-11-14，照 flomoplus 的四档：列表 / 时间线 / 网格 / 画廊）。
 *
 * 共同点：一行里「来源 → 时间 → 标题 → 摘要 → 标签」的层级是固定的，
 * 变的只是图片占多大、要不要按月份切段、要不要画时间轴。
 * 四种形态都用同一份 `Entry`，所以切换时不会丢筛选、不会重新拉数据。
 */

/** 来源那一小行：色点 + 平台名 + 时间（flomoplus 是「品牌图标 + 2026年08月01日 09:00」） */
function SourceLine({ e, compact }: { e: Entry; compact?: boolean }) {
  const p = lookOf(e.platform);
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
      <span
        aria-hidden
        className="h-[7px] w-[7px] shrink-0 rounded-full"
        style={{ background: p.color }}
      />
      <span className="shrink-0">{p.label}</span>
      <span className="truncate opacity-70">{fullTime(e.createdAt)}</span>
      {e.completed && (
        <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary/12 px-1.5 text-[9.5px] text-primary">
          <Check className="h-2.5 w-2.5" />
          完成
        </span>
      )}
      {!compact && e.author && <span className="truncate opacity-60">· {e.author}</span>}
    </span>
  );
}

function TagRow({ tags, className }: { tags: string[]; className?: string }) {
  if (!tags.length) return null;
  return (
    <span className={cn('flex flex-wrap gap-1', className)}>
      {tags.slice(0, 4).map((t) => (
        <span
          key={t}
          className="rounded-full bg-muted px-1.5 py-px text-[10px] leading-4 text-muted-foreground"
        >
          #{t}
        </span>
      ))}
    </span>
  );
}

function Thumb({ e, size }: { e: Entry; size: number }) {
  return (
    <span
      className="relative shrink-0 overflow-hidden rounded-[10px] bg-muted/60"
      style={{ width: size, height: size }}
    >
      <img
        src={e.cover}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={(ev) => {
          ev.currentTarget.style.display = 'none';
        }}
        className="h-full w-full object-cover"
      />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* ① 列表：分隔线 + 左文右缩略图（flomoplus 的默认形态）                 */
/* ------------------------------------------------------------------ */

export function ListView({ entries, onOpen }: { entries: Entry[]; onOpen: (e: Entry) => void }) {
  return (
    <div className="divide-y divide-border/70" data-testid="insp-list">
      {entries.map((e) => (
        <button
          key={e.key}
          type="button"
          onClick={() => onOpen(e)}
          data-testid="insp-entry"
          data-kind={e.kind}
          className="flex w-full items-start gap-3 py-3 text-left transition active:opacity-70"
        >
          <span className="min-w-0 flex-1">
            <SourceLine e={e} />
            <span className="mt-1 line-clamp-1 block text-[15px] font-semibold leading-[21px] tracking-tight text-foreground">
              {e.title}
            </span>
            {e.summary && (
              <span className="mt-0.5 line-clamp-2 block text-[13px] leading-[19px] text-muted-foreground">
                {e.summary}
              </span>
            )}
            <TagRow tags={e.tags} className="mt-1.5" />
          </span>
          {e.cover && <Thumb e={e} size={62} />}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ② 时间线：月份吸顶 + 左侧连续轴线 + 每天一个点                        */
/* ------------------------------------------------------------------ */

export function TimelineView({ entries, onOpen }: { entries: Entry[]; onOpen: (e: Entry) => void }) {
  const groups = groupByMonth(entries);
  return (
    <div data-testid="insp-timeline">
      {groups.map((g) => (
        <section key={g.key}>
          {/* 月份头吸顶：滚到哪儿都知道现在是哪个月 */}
          <h2 className="sticky top-[var(--insp-head-h,132px)] z-10 -mx-4 flex items-center gap-2 bg-page-bg px-4 py-1.5 text-[11.5px] font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
            {g.label}
            <span className="opacity-60">{g.items.length} 条</span>
          </h2>
          <div className="relative ml-[3px] border-l border-border/80 pl-4">
            {g.items.map((e) => (
              <button
                key={e.key}
                type="button"
                onClick={() => onOpen(e)}
                data-testid="insp-entry"
                data-kind={e.kind}
                className="relative flex w-full items-start gap-2.5 py-2.5 text-left transition active:opacity-70"
              >
                <span
                  aria-hidden
                  className="absolute -left-[21px] top-[15px] h-[7px] w-[7px] rounded-full border-2 border-page-bg"
                  style={{ background: lookOf(e.platform).color }}
                />
                <span className="min-w-0 flex-1">
                  <SourceLine e={e} compact />
                  <span className="mt-0.5 line-clamp-2 block text-[14px] font-medium leading-[20px] text-foreground">
                    {e.title}
                  </span>
                  <TagRow tags={e.tags} className="mt-1" />
                </span>
                {e.cover && <Thumb e={e} size={46} />}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ③ 网格：两列封面卡                                                   */
/* ------------------------------------------------------------------ */

export function GridView({ entries, onOpen }: { entries: Entry[]; onOpen: (e: Entry) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5" data-testid="insp-grid">
      {entries.map((e) => (
        <button
          key={e.key}
          type="button"
          onClick={() => onOpen(e)}
          data-testid="insp-entry"
          className="flex flex-col overflow-hidden rounded-[14px] border border-border bg-card text-left transition active:opacity-80"
        >
          {e.cover ? (
            <span className="relative block aspect-[16/9] overflow-hidden bg-muted/50">
              <img
                src={e.cover}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(ev) => {
                  ev.currentTarget.style.display = 'none';
                }}
                className="h-full w-full object-cover"
              />
            </span>
          ) : e.summary ? (
            /* 没图但有多行内容：把摘要铺进这块当「引文」，比一块灰底值钱。
               注意别回退用标题 —— 标题就在下面，重复一遍等于同一句话说两遍。 */
            <span
              className="flex aspect-[16/9] w-full flex-col justify-center px-2.5 py-2"
              style={{ background: `linear-gradient(150deg, ${lookOf(e.platform).tint}, transparent 80%)` }}
            >
              <span className="line-clamp-4 text-[11.5px] leading-[17px] text-foreground/70">
                {e.summary}
              </span>
            </span>
          ) : null}
          <span className="flex flex-1 flex-col gap-1 px-2 py-1.5">
            <span className="line-clamp-2 block text-[12.5px] font-medium leading-[17px] text-foreground">
              {e.title}
            </span>
            <span className="mt-auto flex items-center gap-1 text-[10px] text-muted-foreground">
              <span
                className="h-[6px] w-[6px] shrink-0 rounded-full"
                style={{ background: lookOf(e.platform).color }}
              />
              <span className="truncate">{lookOf(e.platform).label}</span>
              <span className="ml-auto shrink-0 opacity-60">
                {new Date(e.createdAt).getMonth() + 1}/{new Date(e.createdAt).getDate()}
              </span>
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ④ 画廊：一行一条大图，像翻相册                                         */
/* ------------------------------------------------------------------ */

export function GalleryView({ entries, onOpen }: { entries: Entry[]; onOpen: (e: Entry) => void }) {
  return (
    <div className="space-y-3" data-testid="insp-gallery">
      {entries.map((e) => (
        <button
          key={e.key}
          type="button"
          onClick={() => onOpen(e)}
          data-testid="insp-entry"
          className="block w-full overflow-hidden rounded-[18px] border border-border bg-card text-left transition active:opacity-85"
        >
          {/* 大图在上、文字在下。**不把标题压到图上** —— GitHub 的预览图本身就是
              一张带仓库名的卡片，再压一遍标题等于同一句话写两遍，还糊。 */}
          {e.cover && (
            <span className="relative block aspect-[16/9] overflow-hidden bg-muted/50">
              <img
                src={e.cover}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(ev) => {
                  ev.currentTarget.style.display = 'none';
                }}
                className="h-full w-full object-cover"
              />
            </span>
          )}
          <span className="block px-3.5 py-3">
            <SourceLine e={e} />
            <span className="mt-1 line-clamp-2 block text-[15px] font-semibold leading-[21px] text-foreground">
              {e.title}
            </span>
            {e.summary && (
              <span className="mt-1 line-clamp-3 block text-[12.5px] leading-[19px] text-muted-foreground">
                {e.summary}
              </span>
            )}
            <TagRow tags={e.tags} className="mt-2" />
          </span>
        </button>
      ))}
    </div>
  );
}

/** 小图标的来源角标，详情页头部用 */
export function PlatformChip({ e }: { e: Entry }) {
  const p = lookOf(e.platform);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[10px] font-medium"
      style={{ background: p.tint, color: p.color }}
    >
      {e.kind === 'clip' ? <Link2 className="h-2.5 w-2.5" /> : null}
      {p.label}
    </span>
  );
}
