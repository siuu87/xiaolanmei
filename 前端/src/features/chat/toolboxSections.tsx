import type { ReactNode } from 'react';
import { FolderTree, Github, Puzzle, Smartphone, Sparkles, type LucideIcon } from 'lucide-react';
import { McpPage } from '@/features/mcp/McpPage';
import { DevicePage } from '@/features/device/DevicePage';
import { WorkspacePanel } from '@/features/code/WorkspacePanel';
import { SkillsPanel } from '@/features/skills/SkillsPanel';
import { OpenSourcePanel } from '@/features/openSource/OpenSourcePanel';

/**
 * 工具箱的子项：主抽屉内展开与聊天页侧边抽屉共用这份清单，避免两处各自维护。
 *
 * 「角色」（人设提示词 `PromptsPanel`）**2026-10-15 搬走了** —— 它跟「改角色」是同一件事，
 * 却分在工具箱里，跟姓名/人设/语音割裂。现在挂在点头像打开的 `ProfileEditor`
 * 的「角色设定」页签下（`features/shell/ProfileEditor.tsx`）。
 * **不要往这里加回来**：同一个编辑器只留一个入口。
 */
export interface ToolboxSection {
  key: string;
  label: string;
  icon: LucideIcon;
  render: () => ReactNode;
}

export const TOOLBOX_SECTIONS: ToolboxSection[] = [
  { key: 'plugins', label: '插件', icon: Puzzle, render: () => <McpPage /> },
  { key: 'device', label: '手机感知', icon: Smartphone, render: () => <DevicePage /> },
  { key: 'workspace', label: '工作区', icon: FolderTree, render: () => <WorkspacePanel /> },
  { key: 'skills', label: '技能', icon: Sparkles, render: () => <SkillsPanel collapsible={false} /> },
  { key: 'opensource', label: '开源项目', icon: Github, render: () => <OpenSourcePanel /> },
];
