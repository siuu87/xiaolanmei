import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PLATFORM, parseLink, saveClip, type ParsedClip } from './clips';
import { createWish } from './inspiration';

/**
 * 记录灵感（2026-11-14，照 flomoplus 的「添加」页）。
 *
 * 一条灵感 = 想法 + 可选的来源。所以这里只有两块输入：
 *   ① 此刻的想法（必填之一）
 *   ② 来源链接（贴进去自动解析，下面立刻显示「已提取内容」）
 * 两者至少有一个，就能保存 —— 纯想法落 `plugin_wishlist`，带链接的落 `wish_clips`。
 *
 * 和 flomoplus 一样，认出链接后**不用点按钮**就自动解析（它那个「自动识别剪贴板」的体感），
 * 但解析失败不影响保存：链接照样存下来，正文以后用书签补。
 */

const URL_RE = /https?:\/\/[^\s）)」】"']+/;

export function ComposeSheet({
  open,
  onClose,
  onSaved,
  allTags,
  defaultIntro,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
  allTags: string[];
  /** 从某个标签筛选中进来的话，默认把标签带上 */
  defaultIntro?: string;
}) {
  const [idea, setIdea] = useState('');
  const [link, setLink] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [parsed, setParsed] = useState<ParsedClip | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseErr, setParseErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const ideaRef = useRef<HTMLTextAreaElement>(null);

  // 每次打开都从干净状态开始（不然上次的残稿会串到这一次）
  useEffect(() => {
    if (!open) return;
    setIdea(defaultIntro ?? '');
    setLink('');
    setTags([]);
    setTagDraft('');
    setParsed(null);
    setParseErr('');
    setErr('');
    const t = window.setTimeout(() => ideaRef.current?.focus(), 120);
    return () => window.clearTimeout(t);
  }, [open, defaultIntro]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  /** 想法里粘了一整段分享文案时，把链接那一段拎出来当来源 */
  const detected = useMemo(() => {
    const inLink = link.match(URL_RE)?.[0];
    if (inLink) return inLink;
    return idea.match(URL_RE)?.[0] ?? '';
  }, [link, idea]);

  // 认出链接就自动解析：等 700ms 手停下来再发，避免边打边请求
  useEffect(() => {
    if (!detected) {
      setParsed(null);
      setParseErr('');
      return;
    }
    if (parsed && parsed.url === detected) return;
    let alive = true;
    setParsing(true);
    setParseErr('');
    const t = window.setTimeout(() => {
      parseLink(detected)
        .then((r) => {
          if (!alive) return;
          setParsed(r);
          // 小红书分享文案里带标题和作者 —— 顺手把「想法」补成标题，省得用户再打一遍
          if (!idea.trim() && r.title) setIdea(r.title);
        })
        .catch((e: unknown) => {
          if (!alive) return;
          setParsed(null);
          setParseErr(e instanceof Error ? e.message : '这个链接没认出来');
        })
        .finally(() => alive && setParsing(false));
    }, 700);
    return () => {
      alive = false;
      window.clearTimeout(t);
      setParsing(false);
    };
  }, [detected, parsed, idea]);

  const commitTag = (raw: string) => {
    const t = raw.trim().replace(/^#/, '').slice(0, 24);
    if (!t || tags.includes(t)) return;
    setTags((prev) => [...prev, t]);
    setTagDraft('');
  };

  const canSave = (idea.trim() || detected) && !saving;

  const doSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setErr('');
    try {
      const text = idea.trim();
      if (detected) {
        // 带链接：整段文字都交给后端，它自己抽链接；想法写进 note
        const r = await saveClip({
          text: idea.trim() || detected,
          note: text && text !== detected ? text : '',
          tags,
        });
        onSaved(r.updated ? '这条本来是有的，顺手更新了' : '收进灵感库了');
      } else {
        await createWish({ content: text, tags });
        onSaved('记下了');
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '没存上');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const p = parsed ? PLATFORM[parsed.platform] : null;
  const quickTags = allTags.filter((t) => !tags.includes(t)).slice(0, 8);

  return createPortal(
    <div className="insp-page fixed inset-0 z-[1350] flex flex-col bg-page-bg" data-testid="insp-compose">
      {/* 顶栏：取消 / 标题 / 保存 */}
      <header className="flex shrink-0 items-center gap-2 border-b border-page-line px-3 py-2.5">
        <button
          type="button"
          onClick={onClose}
          data-testid="insp-compose-cancel"
          className="h-8 rounded-full border border-border px-3.5 text-[12.5px] text-foreground"
        >
          取消
        </button>
        <span className="flex-1 text-center text-[13.5px] font-semibold text-foreground">记录灵感</span>
        <button
          type="button"
          onClick={doSave}
          disabled={!canSave}
          data-testid="insp-compose-save"
          className="flex h-8 min-w-[56px] items-center justify-center gap-1 rounded-full bg-primary px-3.5 text-[12.5px] font-medium text-primary-foreground transition disabled:opacity-35"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          保存
        </button>
      </header>

      <div className="mx-auto w-full max-w-md flex-1 overflow-y-auto px-4 pb-10 pt-3">
        {/* ① 想法 */}
        <label className="pl-1 text-[11px] font-medium text-muted-foreground">此刻的想法</label>
        <div className="mt-1.5 rounded-[18px] border border-border/60 bg-card px-3.5 py-3">
          <textarea
            ref={ideaRef}
            value={idea}
            onChange={(e) => {
              setIdea(e.target.value);
              e.currentTarget.style.height = 'auto';
              e.currentTarget.style.height = `${Math.max(e.currentTarget.scrollHeight, 96)}px`;
            }}
            rows={4}
            data-testid="insp-compose-text"
            placeholder="看到什么、想到什么，随手记一句…"
            className="w-full resize-none bg-transparent text-[14px] leading-[22px] text-foreground outline-none placeholder:text-muted-foreground/55"
          />
        </div>

        {/* ② 来源链接 */}
        <label className="mt-4 block pl-1 text-[11px] font-medium text-muted-foreground">
          来源链接
          <span className="ml-1 font-normal text-muted-foreground/60">（可选，贴了会自己解析）</span>
        </label>
        <div className="mt-1.5 flex items-center gap-2 rounded-[18px] border border-border/60 bg-card px-3 py-2.5">
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…（小红书可以贴整段分享文案）"
            aria-label="来源链接"
            data-testid="insp-compose-link"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/55"
          />
          {link && (
            <button
              type="button"
              onClick={() => {
                setLink('');
                setParsed(null);
              }}
              aria-label="清空链接"
              className="shrink-0 text-muted-foreground/70"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* ③ 已提取内容 */}
        {(parsing || parsed || parseErr) && (
          <>
            <label className="mt-4 flex items-center gap-1.5 pl-1 text-[11px] font-medium text-muted-foreground">
              已提取内容
              {parsing && <Loader2 className="h-3 w-3 animate-spin" />}
            </label>
            <div className="mt-1.5 rounded-[18px] border border-border/60 bg-card px-3.5 py-3">
              {parseErr && !parsed ? (
                <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                  这个链接没解析出来（{parseErr}）。不耽误保存 —— 链接会先存下，正文以后能补。
                </p>
              ) : parsed ? (
                <div data-testid="insp-compose-preview">
                  <div className="flex gap-2.5">
                    {parsed.cover ? (
                      <img
                        src={parsed.cover}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-[52px] w-[78px] shrink-0 rounded-[10px] bg-muted/60 object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <span
                        className="flex h-[52px] w-[68px] shrink-0 items-center justify-center rounded-[10px] text-[17px] font-semibold"
                        style={{ background: p?.tint, color: p?.color, opacity: 0.9 }}
                      >
                        {p?.label.slice(0, 1)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-medium" style={{ color: p?.color }}>
                        {p?.label}
                      </span>
                      <p className="mt-0.5 line-clamp-2 text-[12.5px] font-medium leading-snug text-foreground">
                        {parsed.title || parsed.url}
                      </p>
                      {parsed.author && (
                        <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground/70">
                          {parsed.author}
                        </p>
                      )}
                    </div>
                  </div>
                  {parsed.excerpt && (
                    <p className="mt-2 line-clamp-3 whitespace-pre-line border-t border-dashed border-border/70 pt-2 text-[11.5px] leading-relaxed text-muted-foreground">
                      {parsed.excerpt}
                    </p>
                  )}
                  {parsed.warnings.length > 0 && (
                    <ul className="mt-2 space-y-0.5 border-t border-dashed border-border/70 pt-2">
                      {parsed.warnings.map((w, i) => (
                        <li
                          key={i}
                          className="text-[10.5px] leading-relaxed text-amber-700 dark:text-amber-500/85"
                        >
                          · {w}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  正在读这个链接…
                </p>
              )}
            </div>
          </>
        )}

        {/* ④ 标签 */}
        <label className="mt-4 block pl-1 text-[11px] font-medium text-muted-foreground">标签</label>
        <div className="mt-1.5 rounded-[18px] border border-border/60 bg-card px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11.5px] text-foreground"
              >
                #{t}
                <button
                  type="button"
                  onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                  aria-label={`去掉标签 ${t}`}
                  className="text-muted-foreground/70"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitTag(tagDraft);
                }
              }}
              placeholder={tags.length ? '再加一个…' : '打个标签，回车确认'}
              aria-label="新标签"
              data-testid="insp-compose-tag"
              className="min-w-[104px] flex-1 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/55"
            />
          </div>
          {quickTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-dashed border-border/70 pt-2">
              <span className="text-[10.5px] text-muted-foreground/60">常用</span>
              {quickTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => commitTag(t)}
                  className="rounded-full border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 存的是什么，说清楚 */}
        <p className="mt-4 px-1 text-[11px] leading-relaxed text-muted-foreground/60">
          {detected
            ? '这条会存成一条「来源 + 你的想法」。原文能读到就一起存，读不到就只留链接。'
            : '只有文字的话，会存成一条纯想法。想剪网页/小红书，把链接贴到上面那一栏。'}
        </p>

        {err && <p className={cn('mt-2 px-1 text-[11.5px] text-destructive')}>{err}</p>}
      </div>
    </div>,
    document.body,
  );
}
