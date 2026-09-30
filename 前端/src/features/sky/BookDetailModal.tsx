import { useNavigate } from 'react-router-dom';
import { BookOpen, ListOrdered } from 'lucide-react';
import type { Book } from './bookStore';

/** 书本详情弹窗：封面 + 进度 + 名称 + 详情 + 目录 + 进入阅读 */
export function BookDetailModal({ book, onClose }: { book: Book; onClose: () => void }) {
  const navigate = useNavigate();
  const pct = Math.round(book.progress * 100);

  const enter = () => {
    onClose();
    navigate(`/read/${book.id}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-[#16121f] p-5 shadow-2xl ring-1 ring-white/10 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 封面 */}
        <div className="flex items-center gap-4">
          {book.cover ? (
            <img src={book.cover} alt={book.title} className="h-28 w-[68px] shrink-0 rounded-md object-cover shadow-md" />
          ) : (
            <div
              className="flex h-24 w-[68px] shrink-0 items-center justify-center rounded-md px-2 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.3)]"
              style={{
                background: `linear-gradient(135deg, ${book.color}, ${book.color} 70%, rgba(0,0,0,0.25))`,
              }}
            >
              <span className="text-center text-sm font-semibold leading-snug text-[#f6efe6]" style={{ writingMode: 'vertical-rl' }}>
                {book.title}
              </span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-bold text-slate-100">{book.title}</h3>
            <p className="mt-0.5 text-xs text-slate-400">{book.author}</p>

            {/* 阅读进度 */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5" /> 阅读进度
                </span>
                <span className="text-slate-200">{pct}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-sky-400 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 详情 */}
        {book.desc && (
          <p className="mt-4 rounded-xl bg-white/5 px-3.5 py-3 text-sm leading-6 text-slate-300">{book.desc}</p>
        )}

        {/* 目录 */}
        {book.toc.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <ListOrdered className="h-3.5 w-3.5" /> 目录
            </div>
            <ol className="mt-2 space-y-1.5">
              {book.toc.map((t, i) => (
                <li key={i} className="flex items-baseline gap-2 text-sm text-slate-300">
                  <span className="text-xs text-slate-500">{String(i + 1).padStart(2, '0')}</span>
                  {t}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* 操作 */}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-xl bg-white/5 text-sm font-medium text-slate-300 transition hover:bg-white/10"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={enter}
            className="h-11 flex-[1.4] rounded-xl bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            {book.progress > 0 ? `继续阅读 · ${pct}%` : '开始阅读'}
          </button>
        </div>
      </div>
    </div>
  );
}
