/**
 * 外壳状态：主抽屉与外观浮层的开合。（独立的「聊天工具箱抽屉」已于 2026-10-17 移除，
 * 工具箱内容并入主抽屉。）
 *
 * 单独抽成 store 而不是塞在 AppLayout 里，是因为触发点分散：
 * 聊天页顶栏的汉堡、屏幕左边缘手势、抽屉内部的入口都要能开同一个抽屉，
 * 而聊天组件本身不能被这些开关动作带着重渲染/重建（主聊天流必须常驻）。
 *
 * 注意：这里只存「开/关」，不存任何聊天数据——抽屉开合绝不影响对话上下文。
 *
 * 2026-11-12：抽屉内二级下钻。工具箱原来把 5 个整页组件（各有自己的大标题）
 * 塞进「工具箱 → 子项 → 面板」两层折叠里，卡中卡、九条相似行堆一起，很难看。
 * 现在抽屉里的工具箱子项是与其他分组一致的 2 列图标格，点开后走
 * `drawerSection` 下钻一层（铺满抽屉、顶栏带返回），内容全宽渲染。
 * 下钻状态放在这里而不是组件里，是因为退出键、抽屉关闭都要能清掉它。
 */
import { create } from 'zustand';

interface ShellState {
  drawerOpen: boolean; // 主抽屉（伴侣档案 / 日常看板 / 模块卡；工具箱入口也在这里）
  drawerSection: string | null; // 抽屉内正在下钻的工具箱子项 key（null = 抽屉主视图）
  appearanceOpen: boolean; // 外观自定义浮层
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  openDrawerSection: (key: string) => void;
  closeDrawerSection: () => void;
  openAppearance: () => void;
  closeAppearance: () => void;
}

export const useShellStore = create<ShellState>((set) => ({
  drawerOpen: false,
  drawerSection: null,
  appearanceOpen: false,
  openDrawer: () => set({ drawerOpen: true }),
  // 关抽屉连下钻一起清，下次打开回到抽屉主视图
  closeDrawer: () => set({ drawerOpen: false, drawerSection: null }),
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen, drawerSection: null })),
  openDrawerSection: (key) => set({ drawerSection: key }),
  closeDrawerSection: () => set({ drawerSection: null }),
  openAppearance: () => set({ appearanceOpen: true, drawerOpen: false, drawerSection: null }),
  closeAppearance: () => set({ appearanceOpen: false }),
}));
