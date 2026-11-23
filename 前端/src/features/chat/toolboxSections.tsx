import type { ReactNode } from 'react';
import { Github, Puzzle, Sparkles, type LucideIcon } from 'lucide-react';
import { McpPage } from '@/features/mcp/McpPage';
import { SkillsPanel } from '@/features/skills/SkillsPanel';
import { OpenSourcePanel } from '@/features/openSource/OpenSourcePanel';

/**
 * 工具箱的子项：抽屉里的 2 列图标格（与其他分组同一套样式），
 * 点开后由 `Drawer.tsx` 在抽屉内下钻一层、全宽渲染。
 *
 * 「角色」（人设提示词 `PromptsPanel`）**2026-10-15 搬走了** —— 它跟「改角色」是同一件事，
 * 却分在工具箱里，跟姓名/人设/语音割裂。现在挂在点头像打开的 `ProfileEditor`
 * 的「角色设定」页签下（`features/shell/ProfileEditor.tsx`）。
 * **不要往这里加回来**：同一个编辑器只留一个入口。
 *
 * 2026-11-12 改版：原来这里是抽屉内两层手风琴（工具箱 → 子项 → 整页面板），
 * 整页组件各有自己的 h1 与内边距，卡中卡、九条相似行堆在一起，很难看。
 * 现在一律改成「图标格 + 下钻」，下钻层的标题由 Drawer 统一提供，
 * 所以 `McpPage` 传 `headless` 隐掉它自带的那个 24px 大标题。
 *
 * 2026-11-23 起「手机感知」「工作区」已内置，不再放任何可点击入口；
 * 这里只保留插件 / 技能 / 开源项目三项。
 */
export interface ToolboxSection {
  key: string;
  label: string;
  /** 图标格第二行的小字，说明这一项是干什么的 */
  hint?: string;
  icon: LucideIcon;
  render: () => ReactNode;
}

export const TOOLBOX_SECTIONS: ToolboxSection[] = [
  {
    key: 'plugins',
    label: '插件',
    hint: '连接器 · 工具',
    icon: Puzzle,
    render: () => <McpPage headless />,
  },
  {
    key: 'skills',
    label: '技能',
    hint: '扩展能力',
    icon: Sparkles,
    render: () => <SkillsPanel collapsible={false} />,
  },
  {
    key: 'opensource',
    label: '开源项目',
    hint: '依赖 · 更新',
    icon: Github,
    render: () => <OpenSourcePanel />,
  },
];
