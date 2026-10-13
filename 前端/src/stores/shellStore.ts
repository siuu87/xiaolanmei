/**
 * 外壳状态：主抽屉与工具箱的开合。
 *
 * 单独抽成 store 而不是塞在 AppLayout 里，是因为触发点分散：
 * 聊天页顶栏的汉堡、屏幕左边缘手势、抽屉内部的入口都要能开同一个抽屉，
 * 而聊天组件本身不能被这些开关动作带着重渲染/重建（主聊天流必须常驻）。
 *
 * 注意：这里只存「开/关」，不存任何聊天数据——抽屉开合绝不影响对话上下文。
 */
import { create } from 'zustand';

interface ShellState {
  drawerOpen: boolean; // 主抽屉（伴侣档案 / 日常看板 / 模块卡）
  toolboxOpen: boolean; // 原聊天「工具箱」（插件/角色/世界书/工作区/技能）
  appearanceOpen: boolean; // 外观自定义浮层
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  openToolbox: () => void;
  closeToolbox: () => void;
  openAppearance: () => void;
  closeAppearance: () => void;
}

export const useShellStore = create<ShellState>((set) => ({
  drawerOpen: false,
  toolboxOpen: false,
  appearanceOpen: false,
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  openToolbox: () => set({ toolboxOpen: true, drawerOpen: false }),
  closeToolbox: () => set({ toolboxOpen: false }),
  openAppearance: () => set({ appearanceOpen: true, drawerOpen: false }),
  closeAppearance: () => set({ appearanceOpen: false }),
}));
