import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Library, Settings2 } from 'lucide-react';
import { useBookStore, type Book } from './bookStore';
import { BookDetailModal } from './BookDetailModal';

/** 单本书：书脊冲外，竖排书名；点击打开详情 */
function BookSpine({ book, onOpen }: { book: Book; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${book.title} · ${book.author}`}
      className="group relative flex shrink-0 cursor-pointer flex-col items-center rounded-[3px] transition-transform duration-200 hover:-translate-y-1.5 hover:shadow-[0_8px_16px_rgba(0,0,0,0.45)]"
      style={{
        width: 34,
        height: book.height,
        background: `linear-gradient(90deg, ${book.color} 0%, ${book.color} 78%, rgba(0,0,0,0.25) 100%)`,
        boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.14), inset -2px 0 0 rgba(0,0,0,0.18)',
      }}
    >
      {/* 书头带 */}
      <span className="h-2 w-full shrink-0 rounded-t-[3px]" style={{ background: book.band }} />
      {/* 书名（竖排） */}
      <span className="mt-1 min-h-0 flex-1 px-1 text-[11px] font-semibold leading-snug tracking-wide" style={{ writingMode: 'vertical-rl', color: '#f6efe6' }}>
        {book.title}
      </span>
      {/* 作者（竖排，淡） */}
      <span className="mb-0.5 shrink-0 text-[8px] opacity-70" style={{ writingMode: 'vertical-rl', color: '#f6efe6' }}>
        {book.author}
      </span>
      {/* 书脚带 */}
      <span className="h-2 w-full shrink-0 rounded-b-[3px]" style={{ background: book.band }} />
      {/* 已读小圆点 */}
      {book.progress > 0 && (
        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#2a1a10]" />
      )}
    </button>
  );
}

/** 一起读：单层可滑动书架（书脊冲外），点书脊看详情，点「管理」进入平铺管理页 */
export function Bookshelf() {
  const navigate = useNavigate();
  const books = useBookStore((s) => s.books);
  const load = useBookStore((s) => s.load);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = books.find((b) => b.id === detailId) ?? null;

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
      {/* 书架顶板 + 标题 */}
      <div className="flex items-center justify-between border-b border-black/30 bg-[#3b2416] px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-100/90">
          <Library className="h-4 w-4" /> 书架
        </div>
        <button
          type="button"
          onClick={() => navigate('/library')}
          className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs text-amber-100/80 transition hover:bg-white/20"
        >
          <Settings2 className="h-3.5 w-3.5" /> 管理
        </button>
      </div>

      {/* 单层书架：横向滑动 */}
      <div className="px-3 pb-4 pt-3" style={{ background: 'linear-gradient(to bottom, #3b2416, #2a1a10)' }}>
        {books.length === 0 ? (
          <p className="py-10 text-center text-sm text-amber-100/60">书架还空着，点「管理」放上第一本书吧。</p>
        ) : (
          <div className="flex items-end gap-1.5 overflow-x-auto px-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {books.map((b) => (
              <BookSpine key={b.id} book={b} onOpen={() => setDetailId(b.id)} />
            ))}
          </div>
        )}
        <div
          className="mt-1 h-2.5 rounded-sm"
          style={{
            background: 'linear-gradient(to bottom, #8a6338, #5a3d20)',
            boxShadow: '0 3px 7px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.18)',
          }}
        />
      </div>

      {detail && <BookDetailModal book={detail} onClose={() => setDetailId(null)} />}
    </div>
  );
}
