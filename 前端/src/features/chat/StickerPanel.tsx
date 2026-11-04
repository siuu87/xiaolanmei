import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STICKERS } from './stickers';
import { useStickerStore } from '@/stores/stickerStore';

/**
 * 表情包面板（微信式）。
 *
 * 和原来那个全屏 bottom-sheet 的区别：
 * - **不是浮层**，就是输入栏下面那块面板区的内容，跟着面板一起**往下**长；
 * - 高度由外层 `BottomPanel` 给定（和「+」面板同高），所以两个面板来回切不会跳；
 * - **顶部**是分类栏（内置 + 你建的各个分类）+ 管理齿轮，下面是表情格。
 *
 * 2026-10-18 加分类：分类来自 `stickerStore.categories`（设置页里维护），
 * 每个分类只显示归到它名下的自定义表情；「内置」那一栏永远是那套系统贴图。
 */
export function StickerPanel({ onPick }: { onPick: (key: string) => void }) {
  const categories = useStickerStore((s) => s.categories);
  const custom = useStickerStore((s) => s.stickers);
  const load = useStickerStore((s) => s.load);
  /** 'builtin' 或某个分类 id */
  const [tab, setTab] = useState<string>('builtin');
  const navigate = useNavigate();

  useEffect(() => {
    // 面板打开时刷新一次：设置页里刚建/刚删的分类能立刻看到
    void load();
  }, [load]);

  // 当前分类被删掉时回到「内置」，否则会停在一个不存在的 id 上、永远空列表
  useEffect(() => {
    if (tab === 'builtin') return;
    if (categories.length && !categories.some((c) => c.id === tab)) setTab('builtin');
  }, [categories, tab]);

  const list =
    tab === 'builtin'
      ? STICKERS.map((s) => ({ key: s.emoji, img: s.img, label: s.emoji }))
      : custom
          .filter((s) => s.categoryId === tab)
          .map((s) => ({ key: s.url, img: s.url, label: s.name }));

  const activeName = categories.find((c) => c.id === tab)?.name;

  return (
    <div className="flex h-full flex-col" data-testid="sticker-panel">
      {/* 顶栏：分类（纯文字，选中加粗）+ 右「＋ 导入」（设计稿样式） */}
      <div
        className="flex h-[52px] shrink-0 items-center gap-1 px-4"
        data-testid="sticker-tabs"
      >
        {/* 分类多了要能横滑，所以这层单独 overflow，导入入口留在外面不跟着滚 */}
        <div className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto scrollbar-thin">
          <TabBtn active={tab === 'builtin'} onClick={() => setTab('builtin')}>
            全部
          </TabBtn>
          {categories.map((c) => (
            <TabBtn key={c.id} active={tab === c.id} onClick={() => setTab(c.id)}>
              {c.name}
              {c.count > 0 ? ` ${c.count}` : ''}
            </TabBtn>
          ))}
        </div>
        <button
          type="button"
          onClick={() => navigate('/settings?open=stickers')}
          aria-label="导入 / 管理表情包"
          title="导入 / 管理表情包"
          data-testid="sticker-manage"
          className="flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-[13px] text-chat-meta transition hover:text-chat-pill-fg"
        >
          <Plus className="h-4 w-4" />
          导入
        </button>
      </div>

      {/* 内容区：6 列 × 56px 大格子，可滚 */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 pb-4 pt-1">
        {list.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-chat-meta">
            <span>「{activeName ?? '我的'}」里还没有表情包</span>
            <button
              type="button"
              onClick={() => navigate('/settings?open=stickers')}
              className="rounded-full bg-chat-pill px-3 py-1 text-chat-pill-fg"
            >
              去设置里添加
            </button>
          </div>
        ) : (
          <div className="grid w-fit grid-cols-6 gap-1">
            {list.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => onPick(s.key)}
                aria-label={s.label}
                title={s.label}
                data-sticker-cell
                className="flex h-14 w-14 items-center justify-center rounded-2xl p-1 transition hover:bg-chat-pill active:scale-95"
              >
                <img src={s.img} alt={s.label} draggable={false} className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full py-1 text-[13px] transition',
        active ? 'font-semibold text-foreground' : 'text-chat-meta hover:text-chat-pill-fg',
      )}
    >
      {children}
    </button>
  );
}
