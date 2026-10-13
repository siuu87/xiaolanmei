import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useShellStore } from '@/stores/shellStore';
import { useNotesStore } from './notesStore';
import { LetterFolders } from './LetterFolder';

/**
 * 蓝莓信箱卡片（独立组件，不依赖首页布局）。
 * - 每日首次打开自动生成一条（幂等、静默）；
 * - 卡片里是按月份归档的**仿文件夹列表**，点文件夹平滑展开，里面是 AI 写的小纸条；
 * - 点某张纸条 → 进它自己的阅读页 `/letter/:id`（叠在抽屉之上，点空白收起）；
 * - 点头部「全部」→ 全部来信页（抽屉会盖住覆盖层，进列表前必须先收起它）。
 */
export function InspirationNoteCard() {
  const navigate = useNavigate();
  const closeDrawer = useShellStore((s) => s.closeDrawer);
  const notes = useNotesStore((s) => s.notes);
  const readIds = useNotesStore((s) => s.readIds);
  const generateToday = useNotesStore((s) => s.generateToday);

  // 每日首次打开触发（store 内幂等，不会重复生成）
  useEffect(() => {
    generateToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="glass relative z-10 flex flex-col p-2">
      {/* 头部：标题 + 全部入口 */}
      <button
        type="button"
        onClick={() => {
          closeDrawer();
          navigate('/notes');
        }}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 className="font-serif text-xs text-muted-foreground">蓝莓信箱</h2>
        <span className="flex items-center gap-0.5 text-xs text-primary transition hover:opacity-80">
          全部
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </button>

      {/* 抽屉里地方小：只放最近两个月的文件夹，每个文件夹也只露 5 张 */}
      <div className="mt-2.5">
        <LetterFolders
          notes={notes}
          readIds={readIds}
          onOpenNote={(id) => navigate(`/letter/${id}`)}
          maxFolders={2}
          maxSlips={5}
          emptyHint="还没有来信"
        />
      </div>
    </div>
  );
}
