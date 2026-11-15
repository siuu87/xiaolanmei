import { useMemo, useState } from 'react';
import { BookmarkPlus, Check, Copy } from 'lucide-react';
import { BottomSheet } from '@/components/BottomSheet';
import { buildBookmarklet } from './clips';

/**
 * 书签抓取（2026-11-14 从旧剪藏墙搬过来）。
 *
 * 为什么还需要它：小红书笔记页有设备指纹校验，服务端拿不到正文和配图（300031），
 * 只有「你自己登录着的浏览器」能读全。书签是这个能力唯一的入口，
 * 所以在 flomoplus 的「设置 › 收集」那个位置给它留一格。
 */
export function BookmarkSheet({
  open,
  onOpenChange,
  onToast,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onToast: (msg: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const bookmarklet = useMemo(
    () => (typeof window === 'undefined' ? '' : buildBookmarklet(window.location.origin)),
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(bookmarklet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      onToast('复制失败，长按书签按钮手动复制');
    }
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="书签抓取" testid="insp-bookmark-sheet">
      <div className="px-4 pb-7 pt-2">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          小红书笔记页有设备指纹校验，服务端读不到正文和配图 —— 但你的浏览器是登录着的。
          把下面这个按钮拖到书签栏，以后在小红书页面点它一下，正文和配图就一起进来了。
        </p>

        <a
          href={bookmarklet}
          draggable
          data-testid="insp-bookmarklet"
          onClick={(e) => {
            e.preventDefault();
            copy();
          }}
          className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5 text-[12.5px] font-medium text-primary"
        >
          <BookmarkPlus className="h-4 w-4" />
          拖我到书签栏（点一下也能复制）
        </a>

        <button
          type="button"
          onClick={copy}
          className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-card text-[12px] text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? '已复制，去浏览器新建一个书签粘贴' : '复制书签代码'}
        </button>

        <p className="mt-3 border-t border-dashed border-border/70 pt-3 text-[11px] leading-relaxed text-muted-foreground/70">
          用法：电脑上打开小红书笔记 → 点书签栏里这个按钮 → 会弹一个小窗自动收下。
          手机上还是把「分享 → 复制链接」的整段文字贴进「记录灵感」。
        </p>
      </div>
    </BottomSheet>
  );
}
