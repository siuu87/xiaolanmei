import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Tv } from 'lucide-react';
import { WatchlistTV } from './WatchlistTV';
import { WatchlistPage } from './WatchlistPage';

/**
 * WATCH：放映厅 = 电视。
 * 新页面 = 原星空里的「电视机」+「片单」结合体：上面是电视机，下面是片单管理。
 */
export function WatchTogetherPage() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-full bg-page-bg text-foreground">
      <div className="relative mx-auto w-full max-w-md px-4 py-6">
        <header className="mb-5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/chat')}
            aria-label="返回"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex flex-1 items-center justify-center gap-2">
            <Tv className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-[12px] tracking-[0.35em] text-foreground">WATCH</h1>
          </div>
          <span className="w-8" />
        </header>

        {/* 电视机 */}
        <WatchlistTV hidePageButton />

        {/* 片单管理（平铺在电视下方） */}
        <div className="mt-8">
          <p className="mb-3 text-center text-[10px] tracking-[0.35em] text-muted-foreground">片单</p>
          <WatchlistPage inline />
        </div>
      </div>
    </div>
  );
}
