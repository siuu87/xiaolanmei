import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { Markdown } from '@/components/Markdown';
import { cn } from '@/lib/utils';
import { fixGithubMarkdown } from './clips';
import { fullTime, lookOf, type Entry } from './inspiration';
import { PlatformChip } from './EntryViews';

/**
 * 灵感详情（2026-11-14 按 flomoplus 的详情页重排）。
 *
 * flomoplus 的细节值得抄：正文不是一坨，而是**分段的白色圆角卡**，
 * 每段左上角一个 11px 灰标签（笔记 / 正文 / 图片 / 来源链接），
 * 原文和自己写的东西永远分开。
 *
 * 整屏纯色不透明（全站规矩），z 1300，Esc 关闭。
 */

function Section({
  label,
  action,
  children,
  className,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-[18px] border border-border/60 bg-card p-3.5', className)}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        {action && <span className="ml-auto flex items-center gap-1">{action}</span>}
      </div>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

export function InspirationDetail({
  entry,
  allTags,
  onClose,
  onPatch,
  onDelete,
  onToggleDone,
}: {
  entry: Entry;
  allTags: string[];
  onClose: () => void;
  onPatch: (p: { title?: string; note?: string; content?: string; tags?: string[] }) => void;
  onDelete: () => void;
  onToggleDone: () => void;
}) {
  const p = lookOf(entry.platform);
  const [noteOpen, setNoteOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const body = entry.clip
    ? entry.clip.platform === 'github'
      ? fixGithubMarkdown(entry.clip.content, entry.clip.url)
      : entry.clip.content
    : '';
  const ownText = entry.kind === 'clip' ? (entry.clip?.note ?? '') : (entry.wish?.content ?? '');

  return createPortal(
    <div
      className="insp-page fixed inset-0 z-[1300] overflow-y-auto bg-page-bg"
      data-testid="insp-detail"
      data-kind={entry.kind}
    >
      <div className="mx-auto w-full max-w-md">
        {/* 顶栏：返回 + 来源 + 更多 */}
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-page-line bg-page-bg px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            aria-label="返回"
            data-testid="insp-detail-back"
            className="icon-btn h-8 w-8 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <PlatformChip e={entry} />
          <span className="truncate text-[11px] text-muted-foreground">
            {fullTime(entry.createdAt)}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {entry.kind === 'note' && (
              <button
                type="button"
                onClick={onToggleDone}
                aria-label={entry.completed ? '标为未完成' : '标为已完成'}
                className={cn(
                  'flex h-8 items-center gap-1 rounded-full px-2.5 text-[11px] transition',
                  entry.completed
                    ? 'bg-primary/12 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Check className="h-3.5 w-3.5" />
                {entry.completed ? '已完成' : '完成'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmDel(true)}
              aria-label="更多"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="px-4 pb-12 pt-3">
          {/* 标题：点一下就能改 */}
          <TitleLine entry={entry} onPatch={onPatch} />

          <div className="mt-5 space-y-2.5">
            {/* 笔记：自己的想法，永远排在最上面 */}
            <Section
              label={entry.kind === 'clip' ? '笔记' : '这条灵感'}
              action={
                entry.kind === 'clip' && !noteOpen ? (
                  <button
                    type="button"
                    onClick={() => setNoteOpen(true)}
                    className="text-[11px] text-primary"
                  >
                    {ownText ? '修改' : '写两句'}
                  </button>
                ) : undefined
              }
            >
              {entry.kind === 'clip' && !noteOpen ? (
                ownText ? (
                  <p className="whitespace-pre-wrap text-[14px] leading-[22px] text-foreground">
                    {ownText}
                  </p>
                ) : (
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground/70">
                    还没写。记一句「为什么想留它」，过几个月回看时才认得出当时的自己。
                  </p>
                )
              ) : (
                <NoteEditor
                  entry={entry}
                  initial={ownText}
                  autoFocus={entry.kind === 'note'}
                  onSave={(v) => {
                    if (v !== ownText) {
                      onPatch(entry.kind === 'clip' ? { note: v } : { content: v });
                    }
                  }}
                  onClose={entry.kind === 'clip' ? () => setNoteOpen(false) : undefined}
                />
              )}
            </Section>

            {/* 正文：抓回来的原文 */}
            {entry.kind === 'clip' && (
              <Section
                label="正文"
                action={
                  body ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(body);
                          setCopied(true);
                          window.setTimeout(() => setCopied(false), 1600);
                        } catch {
                          /* 剪贴板被拒就什么也不做 */
                        }
                      }}
                      className="flex items-center gap-1 text-[11px] text-primary"
                    >
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied ? '已复制' : '复制原文'}
                    </button>
                  ) : undefined
                }
              >
                {body ? (
                  <div className="clip-md" data-testid="insp-body">
                    <Markdown>{body}</Markdown>
                  </div>
                ) : (
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground/70">
                    这条没抓到正文。
                    {entry.platform === 'xiaohongshu'
                      ? '小红书要登录才读得到，用「更多 › 书签抓取」在你自己浏览器里点一下就有了。'
                      : '可能撞上登录墙，点下面的来源链接回原页面看。'}
                  </p>
                )}
              </Section>
            )}

            {/* 图片：目前只有封图一张，点开看大图 */}
            {entry.cover && (
              <Section label="图片">
                <a
                  href={entry.cover}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-[12px]"
                >
                  <img
                    src={entry.cover}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="max-h-[46vh] w-full object-cover"
                    onError={(ev) => {
                      ev.currentTarget.style.display = 'none';
                    }}
                  />
                </a>
              </Section>
            )}

            {/* 来源链接 */}
            {entry.kind === 'clip' && entry.url && (
              <Section label="来源链接">
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
                    style={{ background: p.tint, color: p.color }}
                  >
                    {p.label.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-foreground">{p.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground/80">
                      {entry.url}
                    </span>
                  </span>
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="打开原文"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </Section>
            )}

            {/* 标签 */}
            <Section
              label="标签"
              action={
                <button
                  type="button"
                  onClick={() => setTagOpen((v) => !v)}
                  className="flex items-center gap-0.5 text-[11px] text-primary"
                >
                  <Plus className="h-3 w-3" />
                  添加
                </button>
              }
            >
              <div className="flex flex-wrap items-center gap-1.5">
                {entry.tags.length === 0 && !tagOpen && (
                  <span className="text-[12px] text-muted-foreground/60">
                    还没打标签。标签是这一版最重要的分类方式 —— 以后就靠它找东西。
                  </span>
                )}
                {entry.tags.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11.5px] text-foreground"
                  >
                    #{t}
                    <button
                      type="button"
                      aria-label={`去掉标签 ${t}`}
                      onClick={() => onPatch({ tags: entry.tags.filter((x) => x !== t) })}
                      className="text-muted-foreground/70 transition hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              {tagOpen && (
                <TagAdder
                  current={entry.tags}
                  allTags={allTags}
                  onAdd={(t) => onPatch({ tags: [...entry.tags, t] })}
                />
              )}
            </Section>
          </div>

          {confirmDel && (
            <div className="mt-4 rounded-[14px] border border-destructive/30 bg-destructive/8 p-3">
              <p className="text-[12px] text-foreground">删掉这条之后找不回来了，确定？</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDel(false)}
                  className="h-8 flex-1 rounded-full border border-border text-[12px] text-foreground"
                >
                  算了
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  data-testid="insp-delete"
                  className="flex h-8 flex-1 items-center justify-center gap-1 rounded-full bg-destructive text-[12px] font-medium text-white"
                >
                  <Trash2 className="h-3 w-3" />
                  删除
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */

/** 标题行：平时是标题，点一下变成可改的输入框（剪藏取错标题时能救） */
function TitleLine({
  entry,
  onPatch,
}: {
  entry: Entry;
  onPatch: (p: { title?: string; note?: string; content?: string; tags?: string[] }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(entry.title);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setVal(entry.title);
  }, [entry.title]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.selectionStart = el.value.length;
    el.style.height = `${el.scrollHeight}px`;
  }, [editing]);

  // 纯想法没有独立标题，改标题就是改正文第一行 → 这里只允许给剪藏改标题
  if (entry.kind === 'note' || !entry.clip) {
    return (
      <h1 className="text-[19px] font-semibold leading-[27px] tracking-tight text-foreground">
        {entry.title}
      </h1>
    );
  }

  if (editing) {
    return (
      <textarea
        ref={inputRef}
        value={val}
        rows={2}
        onChange={(e) => {
          setVal(e.target.value);
          e.currentTarget.style.height = 'auto';
          e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
        }}
        onBlur={() => {
          setEditing(false);
          const next = val.trim();
          if (next && next !== entry.title) onPatch({ title: next });
        }}
        className="w-full resize-none rounded-xl border border-primary/40 bg-card px-2.5 py-1.5 text-[19px] font-semibold leading-[27px] tracking-tight text-foreground outline-none"
      />
    );
  }

  return (
    <h1
      onClick={() => setEditing(true)}
      className="cursor-text text-[19px] font-semibold leading-[27px] tracking-tight text-foreground"
    >
      {entry.title}
    </h1>
  );
}

/**
 * 笔记编辑：**边打边存**。
 *
 * 一开始是「失焦才存」，试的时候发现一个真实的丢字路径：
 * 打完字直接点左上角返回 —— 详情层被卸载，blur 不一定赶得上，写的东西就没了。
 * 现在停手 600ms 就存一次，卸载前再兜一次；点空白处（blur）只负责收起编辑态。
 */
function NoteEditor({
  entry,
  initial,
  autoFocus,
  onSave,
  onClose,
}: {
  entry: Entry;
  initial: string;
  autoFocus?: boolean;
  onSave: (v: string) => void;
  /** 收起编辑态（纯想法的编辑框一直开着，不传） */
  onClose?: () => void;
}) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  /** 已经交给上层的值，避免重复提交；也用它在卸载时判断有没有漏存 */
  const savedRef = useRef(initial);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  useEffect(() => {
    if (!autoFocus) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 96)}px`;
  }, [autoFocus]);

  // 停手 600ms 自动存（不收起编辑态，不然打字打到一半框就没了）
  useEffect(() => {
    if (v === savedRef.current) return;
    const t = window.setTimeout(() => {
      savedRef.current = v;
      saveRef.current(v);
    }, 600);
    return () => window.clearTimeout(t);
  }, [v]);

  // 卸载时补一次：直接按返回也不会丢
  useEffect(
    () => () => {
      if (v !== savedRef.current) {
        savedRef.current = v;
        saveRef.current(v);
      }
    },
    [v],
  );

  return (
    <textarea
      ref={ref}
      value={v}
      onChange={(e) => {
        setV(e.target.value);
        e.currentTarget.style.height = 'auto';
        e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
      }}
      onBlur={() => {
        if (v !== savedRef.current) {
          savedRef.current = v;
          saveRef.current(v);
        }
        onClose?.();
      }}
      placeholder={
        entry.kind === 'clip' ? '为什么想留它？' : '写点什么…（边打边存，不用点保存）'
      }
      data-testid="insp-note"
      className="min-h-[88px] w-full resize-none bg-transparent text-[14px] leading-[22px] text-foreground outline-none placeholder:text-muted-foreground/60"
    />
  );
}

/** 加标签：已有标签一点就加，也可以现打一个 */
function TagAdder({
  current,
  allTags,
  onAdd,
}: {
  current: string[];
  allTags: string[];
  onAdd: (t: string) => void;
}) {
  const [v, setV] = useState('');
  const suggest = useMemo(
    () => allTags.filter((t) => !current.includes(t)).slice(0, 12),
    [allTags, current],
  );

  const commit = (raw: string) => {
    const t = raw.trim().replace(/^#/, '');
    if (!t || current.includes(t)) return;
    onAdd(t.slice(0, 24));
    setV('');
  };

  return (
    <div className="mt-2">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(v);
          }
        }}
        placeholder="输入标签，回车加上"
        aria-label="新标签"
        className="h-8 w-full rounded-full border border-border bg-background px-3 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
      />
      {suggest.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {suggest.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => commit(t)}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              #{t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
