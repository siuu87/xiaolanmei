import type { ReactNode } from 'react';
import { BookOpen, FolderTree, Puzzle, Sparkles, User, type LucideIcon } from 'lucide-react';
import { McpPage } from '@/features/mcp/McpPage';
import { PromptsPanel } from '@/features/prompts/PromptsPanel';
import { WorldbookPanel } from '@/features/worldbook/WorldbookPanel';
import { WorkspacePanel } from '@/features/code/WorkspacePanel';
import { SkillsPanel } from '@/features/skills/SkillsPanel';

/** 工具箱的五个子项：主抽屉内展开与聊天页侧边抽屉共用这份清单，避免两处各自维护。 */
export interface ToolboxSection {
  key: string;
  label: string;
  icon: LucideIcon;
  render: () => ReactNode;
}

export const TOOLBOX_SECTIONS: ToolboxSection[] = [
  { key: 'plugins', label: '插件', icon: Puzzle, render: () => <McpPage /> },
  { key: 'role', label: '角色', icon: User, render: () => <PromptsPanel /> },
  { key: 'worldbook', label: '世界书', icon: BookOpen, render: () => <WorldbookPanel /> },
  { key: 'workspace', label: '工作区', icon: FolderTree, render: () => <WorkspacePanel /> },
  { key: 'skills', label: '技能', icon: Sparkles, render: () => <SkillsPanel collapsible={false} /> },
];
