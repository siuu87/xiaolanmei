import { create } from 'zustand';

/**
 * 极简播放状态：只承载「是否正在播放」一个布尔，供 Chat 顶栏头像的「耳机头像框」显隐使用。
 *
 * 原 listen-together 模块（VinylPlayer / neteaseMcpConnector / 播放页）已删除，此 store
 * 不回到那套完整播放器，只保留耳机装饰需要的播放标志。后续由「内置 AI + 网易云 MCP」
 * 回传的播放态驱动本 flag —— 接 MCP 后，playing 直接被真实播放态覆盖即可。
 *
 * 默认 false（默认不戴耳机）；接 MCP 后由真实播放态设置：有播放置 true 显示耳机头像框，
 * 无播放置 false 自动隐藏。
 */
interface PlayerState {
  playing: boolean;
  setPlaying: (v: boolean) => void;
  togglePlaying: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  playing: false, // 默认不戴耳机；接 MCP 后由真实播放态覆盖
  setPlaying: (v) => set({ playing: v }),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
}));
