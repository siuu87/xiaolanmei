import { create } from 'zustand';
import { getCurrentTrack, getPlayQueue, type Track } from '@/features/sky/listen/neteaseMcpConnector';

interface PlayerState {
  track: Track | null;
  queue: Track[];
  index: number;
  playing: boolean;
  progressMs: number;
  load: () => Promise<void>;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  seek: (ms: number) => void;
  next: () => void;
  prev: () => void;
  playTrack: (t: Track) => void;
}

/**
 * 全局播放器状态：曲目 / 播放队列 / 播放状态 / 进度。
 * 状态存于 store，播放引擎在模块级计时器推进，因此切换页面不会打断播放，
 * 「一起听」黑胶（星空页）与 LISTEN 播放页共享同一份状态，任何一处播放/切歌都同步。
 */
export const usePlayerStore = create<PlayerState>((set, get) => ({
  track: null,
  queue: [],
  index: 0,
  playing: false,
  progressMs: 0,

  // 首次挂载时加载当前曲目与队列；已加载则不重复（避免切页重置进度）
  load: async () => {
    if (didLoad || get().track) return;
    didLoad = true;
    try {
      const [current, queue] = await Promise.all([getCurrentTrack(), getPlayQueue()]);
      const merged = [current, ...queue.filter((q) => q.id !== current.id)];
      set({ track: current, queue: merged, index: 0, progressMs: 0 });
    } catch {
      didLoad = false;
    }
  },

  toggle: () => set((s) => ({ playing: !s.playing })),
  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  seek: (ms) => set({ progressMs: ms }),

  next: () => {
    const { queue, index } = get();
    if (queue.length === 0) return;
    const ni = (index + 1) % queue.length;
    set({ index: ni, track: queue[ni], progressMs: 0 });
  },

  prev: () => {
    const { queue, index } = get();
    if (queue.length === 0) return;
    const ni = (index - 1 + queue.length) % queue.length;
    set({ index: ni, track: queue[ni], progressMs: 0 });
  },

  playTrack: (t) => {
    const { queue } = get();
    const idx = queue.findIndex((q) => q.id === t.id);
    set({ track: t, index: idx >= 0 ? idx : 0, progressMs: 0, playing: true });
  },
}));

let didLoad = false;

// 模块级播放引擎：全局推进进度（与页面无关，切页不断）
const g = globalThis as unknown as { __playerEngine?: boolean };
if (!g.__playerEngine) {
  g.__playerEngine = true;
  setInterval(() => {
    const s = usePlayerStore.getState();
    if (!s.playing || !s.track) return;
    const dur = s.track.durationMs || 0;
    if (dur <= 0) return;
    const nextMs = s.progressMs + 250;
    if (nextMs >= dur) {
      usePlayerStore.getState().next();
    } else {
      usePlayerStore.setState({ progressMs: nextMs });
    }
  }, 250);
}
