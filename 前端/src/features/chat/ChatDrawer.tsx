import { useEffect, useState } from 'react';
import { X, Puzzle, User, BookOpen, FolderTree, ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { McpPage } from '@/features/mcp/McpPage';
import { PromptsPanel } from '@/features/prompts/PromptsPanel';
import { WorldbookPanel } from '@/features/worldbook/WorldbookPanel';
import { WorkspacePanel } from '@/features/code/WorkspacePanel';
import { SkillsPanel } from '@/features/skills/SkillsPanel';

type SectionKey = 'plugins' | 'role' | 'worldbook' | 'workspace' | 'skills';

const SECTIONS: { key: SectionKey; label: string; icon: typeof Puzzle }[] = [
  { key: 'plugins', label: '插件', icon: Puzzle },
  { key: 'role', label: '角色', icon: User },
  { key: 'worldbook', label: '世界书', icon: BookOpen },
  { key: 'workspace', label: '工作区', icon: FolderTree },
  { key: 'skills', label: '技能', icon: Sparkles },
];

/** 聊天页左侧抽屉：插件 / 角色 / 世界书 / 工作区，点击展开折叠菜单 */
export function ChatDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [expanded, setExpanded] = useState<SectionKey | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" data-testid="chat-drawer">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 flex w-full max-w-lg flex-col border-r border-white/10 bg-background/70 shadow-2xl backdrop-blur-2xl dark:border-white/10">
        <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-4 py-3">
          <span className="text-sm font-semibold">工具箱</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {SECTIONS.map((s) => {
            const isOpen = expanded === s.key;
            return (
              <div key={s.key} className="overflow-hidden rounded-xl border border-border/60 bg-white/[0.03] backdrop-blur-sm dark:bg-white/[0.03]">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : s.key)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium transition hover:bg-muted/40"
                >
                  <s.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{s.label}</span>
                  <ChevronDown
                    className={cn(
                      'ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                      isOpen && 'rotate-180',
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-border/60 p-3">
                    {s.key === 'plugins' && <McpPage />}
                    {s.key === 'role' && <PromptsPanel />}
                    {s.key === 'worldbook' && <WorldbookPanel />}
                    {s.key === 'workspace' && <WorkspacePanel />}
                    {s.key === 'skills' && <SkillsPanel collapsible={false} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
