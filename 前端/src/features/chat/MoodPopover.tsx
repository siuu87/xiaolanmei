/**
 * 心情浮层（MoodPopover，2026-10-28）：
 * 点击聊天页顶栏**头像**蹦出的「ta 的心情/状态」最简卡片（设计稿：小蓝莓-心情状态浮层）。
 *
 * - 数据全部来自心潮 `/api/xinchao/state`：`emotion.label` = 心情词，`consciousness` = 心声一句。
 *   前端不算、也不显示任何数值（情绪面板的老规矩：不准出现原始数值 / 说破规则）。
 * - 内容刻意只有三块：身份行 / 当前心情 / 心声一句。没有「想做什么」「看内心」入口。
 * - 无遮罩；**点空白处 / 再点头像 / Esc** 关闭（Esc 在 capture 阶段拦下，避免连带抽屉链）。
 * - 心潮不可达时优雅降级成一句占位，绝不弹错误。
 */
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { AvatarContent } from '@/components/AvatarContent';
import { getXinchaoState, type XinchaoState } from '@/lib/api/xinchao';

/** emotion.updatedAt → 「刚刚 / N 分钟前 / N 小时前」；解析不了给 null */
function relativeTime(iso?: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

export function MoodPopover({
  open,
  onClose,
  partnerName,
  partnerAvatar,
  onOpenCharacter,
}: {
  open: boolean;
  onClose: () => void;
  partnerName: string;
  partnerAvatar: string;
  /** 底部那一行「查看角色 ›」：打开角色页（设计稿第 11 页） */
  onOpenCharacter?: () => void;
}) {
  const [state, setState] = useState<XinchaoState | null>(null);
  const [loaded, setLoaded] = useState(false);

  // 打开时拉一次心潮状态；关掉再开会重新取（「此刻」就该是新的，不缓存）
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoaded(false);
    getXinchaoState()
      .then((s) => {
        if (!alive) return;
        setState(s);
        setLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setState(null);
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  // 点空白关闭：点在卡片外、且不是点头像触发键时才算「空白」
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest('[data-mood-popover-keep]')) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onClose]);

  // Esc 关闭：capture 阶段拦下，别让下面的抽屉 / 底部弹层一起响应
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

  if (!open) return null;

  const emotion = state?.emotion ?? null;
  const moodWord = (emotion?.label || '').trim() || '此刻很安静';
  const innerVoice = (state?.consciousness || '').trim();
  const updated = relativeTime(emotion?.updatedAt);

  return (
    <div
      data-testid="mood-popover"
      className="absolute left-1/2 top-[104px] z-[800] w-60 -translate-x-1/2"
    >
      {/* 尖角：压在卡片上边框上的小方块，指回头像 */}
      <span
        aria-hidden
        className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-l border-t border-chat-line bg-chat-pill"
      />
      <div
        className={cn(
          'relative rounded-2xl border border-chat-line bg-chat-pill p-3.5 shadow-lg',
          'origin-top transition duration-150 ease-out',
          loaded ? 'scale-100 opacity-100' : 'scale-[0.97] opacity-0',
        )}
      >
        {/* 身份行：小头像 + 名字 + 情绪更新时间 */}
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-chat-line bg-chat-bar text-[10px] leading-none">
            <AvatarContent value={partnerAvatar} />
          </span>
          <span className="min-w-0 truncate text-xs font-medium text-foreground">{partnerName}</span>
          <span className="h-1 w-1 shrink-0 rounded-full bg-foreground/60" aria-hidden />
          <span className="min-w-0 truncate text-[9px] text-chat-meta">
            {updated ? `情绪更新于 ${updated}` : '此刻'}
          </span>
        </div>

        {/* 当前心情：只有词，不给数值 */}
        <div className="mt-2.5 text-lg font-medium leading-snug text-foreground">
          {loaded ? moodWord : '…'}
        </div>

        {/* 心声：一句完整的话（心潮 consciousness，前端不改写不裁切） */}
        <div className="mt-1 text-[11px] leading-relaxed text-chat-meta">
          {loaded ? innerVoice || '这一刻没有留下心声。' : '正在看 ta 心里…'}
        </div>

        {/* 角色页入口（设计稿 11 页）：这一行是唯一的动作，别再加别的 */}
        {onOpenCharacter && (
          <button
            type="button"
            data-mood-popover-keep
            onClick={onOpenCharacter}
            className="mt-2.5 flex w-full items-center justify-between rounded-xl bg-chat-line/30 px-2.5 py-2 text-[11px] text-chat-meta transition hover:text-foreground active:scale-[0.99]"
          >
            <span>查看角色</span>
            <span aria-hidden>›</span>
          </button>
        )}
      </div>
    </div>
  );
}
