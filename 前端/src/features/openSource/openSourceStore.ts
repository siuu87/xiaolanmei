import { create } from 'zustand';
import { listOpenSource, type OpenSourceDepDTO, type OpenSourceSummary } from '@/lib/api/openSource';

interface OpenSourceState {
  items: OpenSourceDepDTO[];
  summary: OpenSourceSummary | null;
  /** 有更新的依赖数，抽屉/聊天抽屉的红点就看它；localStorage 兜底，跨启动也能亮 */
  updatesCount: number;
  loading: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
}

const UPDATES_KEY = 'blueberry.opensource.updates';

function loadCachedUpdates(): number {
  try {
    const n = Number(localStorage.getItem(UPDATES_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function saveCachedUpdates(n: number) {
  try {
    localStorage.setItem(UPDATES_KEY, String(n));
  } catch {
    /* 隐私模式下写不了就算了 */
  }
}

export const useOpenSourceStore = create<OpenSourceState>((set) => ({
  items: [],
  summary: null,
  updatesCount: loadCachedUpdates(),
  loading: false,
  error: null,

  load: async (force = false) => {
    set({ loading: true, error: null });
    try {
      const data = await listOpenSource(force);
      set({
        items: data.items,
        summary: data.summary,
        updatesCount: data.summary.updates,
        loading: false,
      });
      saveCachedUpdates(data.summary.updates);
    } catch (e) {
      // 查失败就保留上次的 updatesCount（红点不至于凭空消失）
      set({ loading: false, error: (e as Error).message });
    }
  },
}));
