/**
 * 沉浸式模式：某些界面（目前只有酒馆的小手机）要占满整个视口，
 * 把 App 的侧边栏和底部导航都收起来，只留界面自己的退出键。
 *
 * 用 store 而不是路由判断，是因为「什么时候算进入小手机」由页面自己说了算
 * （酒馆里还有配置台形态，那个要保留导航）。
 */
import { create } from 'zustand';

interface ImmersiveState {
  immersive: boolean;
  setImmersive: (v: boolean) => void;
}

export const useImmersiveStore = create<ImmersiveState>((set) => ({
  immersive: false,
  setImmersive: (v) => set({ immersive: v }),
}));
