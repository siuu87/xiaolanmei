import { useNavigate } from 'react-router-dom';
import { useShellStore } from '@/stores/shellStore';
import { useNotesStore } from './notesStore';
import { normalizeLetterTheme, parseLook } from './notesData';
import { FoldedLetter } from './FoldedLetter';
import { cn } from '@/lib/utils';

/**
 * 深夜来信 · 小组件（2026-11-18 晚重做）
 *
 * 用户这次把三件事说死了，别再往回改：
 *   ① **点它 = 去「全部来信」那一页**（不再弹某一封信的弹窗）；
 *   ② 信封**永远合着**，组件上不出现「掀开 / 撕开」的样子；
 *   ③ 有信没信、有没有新信，**只看右上有没有邮票**（`stamped`）。
 *
 * 所以这里没有翻页、没有左右滑、没有爱心键 —— 一整块就是个去 /notes 的按钮，
 * 里头就是一张信封。宽度交给外面（`WidgetRow` 给它一个「正常比例」的宽度并居中）。
 *
 * 邮票取哪一封的状态：组件展示的是**最新一封**，它没看过就贴邮票。
 * 一封信都没有 → 一张空信封，什么都不贴（也不写字：这格只有七十来像素高）。
 */
export function LetterInboxCard({ className }: { className?: string }) {
  const navigate = useNavigate();
  const closeDrawer = useShellStore((s) => s.closeDrawer);

  const notes = useNotesStore((s) => s.notes);
  const readIds = useNotesStore((s) => s.readIds);

  const note = notes[0] ?? null;
  const unseen = note ? !readIds.includes(note.id) : false;
  /** 小组件只露一封（最新那封），包装跟着它走 —— 每收到一封新信，这一格就换个样子 */
  const look = parseLook(note?.letterLook, normalizeLetterTheme(note?.letterTheme), note?.id);

  const goAll = () => {
    closeDrawer();
    navigate('/notes');
  };

  return (
    <button
      type="button"
      data-testid="letter-inbox"
      data-has-letter={note ? '1' : '0'}
      data-unseen={unseen ? '1' : '0'}
      onClick={goAll}
      aria-label={unseen ? '有新信，去全部来信' : '全部来信'}
      title="全部来信"
      className={cn(
        'group relative block overflow-visible rounded-[4px] text-left transition-transform duration-300',
        'hover:-translate-y-[2px] active:translate-y-0 active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
        className,
      )}
    >
      <FoldedLetter
        look={look}
        stamped={unseen}
        lite
        className={cn(
          /* 阴影走 `FoldedLetter` 的 inline style（class 压不过 inline，别在这儿写 shadow） */
          'absolute inset-0',
          // 一封都没有：信封还在（总不能凭空画个别的），但压暗压灰 ——
          // 不然浅色主题那封米白信封在深色首页上就是一块亮斑，还会被读成「有信」
          !note && 'opacity-40 saturate-50',
        )}
      />
    </button>
  );
}

export default LetterInboxCard;
