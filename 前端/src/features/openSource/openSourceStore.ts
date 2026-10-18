import { create } from 'zustand';
import {
  ackOpenSource,
  addOpenSource,
  listOpenSource,
  refreshOpenSource,
  removeOpenSource,
  type OpenSourceProjectDTO,
  type OpenSourceSummary,
} from '@/lib/api/openSource';

/**
 * 开源项目关注清单。
 *
 * 2026-10-18 改版：**清单只放用户自己加的项目**，不再自动扫描 package.json 依赖
 * （以前大部分是用户根本不关心的传递依赖）。列表一开始是空的，加什么由用户决定。
 *
 * 「检查更新」= 后端去 GitHub 拉最新 release，比 `seenVersion` 新就标 `hasUpdate`。
 */
interface OpenSourceState {
  items: OpenSourceProjectDTO[];
  summary: OpenSourceSummary | null;
  /** 有更新的项目数，抽屉里的红点看它；localStorage 兜底，跨启动也能亮 */
  updatesCount: number;
  loading: boolean;
  /** 正在检查更新（按钮转圈 + 禁用，避免连点把 GitHub 限流打满） */
  refreshing: boolean;
  error: string | null;
  load: () => Promise<void>;
  add: (repoUrl: string, note?: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  ack: (id: string) => Promise<void>;
  refresh: (id?: string) => Promise<{ updated: number; failed: number }>;
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

export const useOpenSourceStore = create<OpenSourceState>((set, get) => ({
  items: [],
  summary: null,
  updatesCount: loadCachedUpdates(),
  loading: false,
  refreshing: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const data = await listOpenSource();
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

  add: async (repoUrl, note) => {
    await addOpenSource(repoUrl, note);
    await get().load();
  },

  remove: async (id) => {
    await removeOpenSource(id);
    await get().load();
  },

  ack: async (id) => {
    await ackOpenSource(id);
    await get().load();
  },

  /**
   * 检查更新（面板上那个按钮）。
   * 单个刷新时只局部更新那一条，不整表重载 —— 列表长的时候体验差很多。
   */
  refresh: async (id) => {
    if (get().refreshing) return { updated: 0, failed: 0 };
    set({ refreshing: true, error: null });
    try {
      const r = await refreshOpenSource(id);
      await get().load();
      set({ refreshing: false });
      if (r.failed.length) {
        set({ error: `${r.failed.length} 个项目没查到：${r.failed[0].error}` });
      }
      return { updated: r.updated, failed: r.failed.length };
    } catch (e) {
      set({ refreshing: false, error: (e as Error).message });
      return { updated: 0, failed: 0 };
    }
  },
}));
