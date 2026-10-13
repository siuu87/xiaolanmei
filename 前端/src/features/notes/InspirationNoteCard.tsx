import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useShellStore } from '@/stores/shellStore';
import { useNotesStore } from './notesStore';
import { LetterEnvelope } from './LetterArt';

/** 抽屉里一次摆几封 */
const VISIBLE = 3;

/**
 * 蓝莓信箱卡片（独立组件，不依赖首页布局）。
 * - 每日首次打开自动生成一条（幂等、静默）；
 * - 卡片里是**一摞压扁的朴素信封**（只露日期，内容不显示）；
 * - 点某一封 → 进它自己的阅读页 `/letter/:id`（叠在抽屉之上，点空白收起）；
 * - 点头部「全部」→ 全部来信页。
 */
export function InspirationNoteCard() {
  const navigate = useNavigate();
  const closeDrawer = useShellStore((s) => s.closeDrawer);
  const notes = useNotesStore((s) => s.notes);
  const generateToday = useNotesStore((s) => s.generateToday);

  // 每日首次打开触发（store 内幂等，不会重复生成）
  useEffect(() => {
    generateToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = notes.slice(0, VISIBLE);
  const rest = notes.length - list.length;

  return (
    <div className="glass relative z-10 flex flex-col p-2">
      {/* 头部：标题 + 全部入口（抽屉会盖住覆盖层，进列表前必须先收起它） */}
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

      {/* 一摞信封：高度压缩，内容不显示 */}
      <div className="mt-2.5 flex flex-col gap-1.5" data-testid="envelope-stack">
        {list.length === 0 ? (
          <div className="flex h-10 items-center justify-center rounded-[3px] border border-dashed border-white/10 text-[10px] text-muted-foreground/50">
            还没有来信
          </div>
        ) : (
          list.map((n) => (
            <LetterEnvelope key={n.id} note={n} onClick={() => navigate(`/letter/${n.id}`)} />
          ))
        )}
      </div>

      {rest > 0 && (
        <p className="mt-1.5 text-center text-[9px] text-muted-foreground/50">还有 {rest} 封</p>
      )}
    </div>
  );
}
