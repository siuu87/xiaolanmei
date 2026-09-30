import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Save, Loader2, Folder, FolderOpen, File, FileCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  listWorkspaceTree,
  readWorkspaceFile,
  saveWorkspaceFile,
  type WorkspaceEntry,
} from '@/lib/api/agent';

/** 工作区：文件树 + 代码编辑器（编程模式里查看 / 编辑小蓝莓自身代码） */
export function WorkspacePanel() {
  const [root, setRoot] = useState('');
  const [dirs, setDirs] = useState<Record<string, WorkspaceEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [openedPath, setOpenedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadTree = async (path: string) => {
    try {
      const r = await listWorkspaceTree(path);
      setRoot(r.root);
      setDirs((d) => ({ ...d, [path]: r.entries }));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    void loadTree('.');
  }, []);

  const toggleDir = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        if (!dirs[path]) void loadTree(path);
      }
      return next;
    });
  };

  const openFile = async (path: string) => {
    try {
      const r = await readWorkspaceFile(path);
      setOpenedPath(path);
      setFileContent(r.content);
      setDirty(false);
      setSaved(false);
    } catch (e) {
      console.error(e);
    }
  };

  const saveFile = async () => {
    if (!openedPath) return;
    setSaving(true);
    setSaved(false);
    try {
      await saveWorkspaceFile(openedPath, fileContent);
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const renderTree = (path: string, depth: number): ReactNode => {
    const entries = dirs[path] ?? [];
    return entries.map((e) => {
      const isDir = e.type === 'dir';
      const isOpen = expanded.has(e.path);
      return (
        <div key={e.path}>
          <button
            type="button"
            onClick={() => (isDir ? toggleDir(e.path) : void openFile(e.path))}
            className={cn(
              'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition hover:bg-muted',
              openedPath === e.path && 'bg-primary/10 text-primary',
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {isDir ? (
              isOpen ? (
                <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
              ) : (
                <Folder className="h-4 w-4 shrink-0 text-amber-500" />
              )
            ) : (
              <File className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{e.name}</span>
          </button>
          {isDir && isOpen && renderTree(e.path, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileCode className="h-4 w-4" />
        <span className="truncate">{root || '工作区加载中…'}</span>
      </div>

      <div className="grid gap-2">
        {/* 文件树 */}
        <div className="max-h-40 overflow-y-auto rounded-lg bg-muted/40 p-1">{renderTree('.', 0)}</div>

        {/* 编辑器 */}
        <div className="flex flex-col">
          <div className="mb-1 flex items-center gap-2">
            <span className="truncate text-xs text-muted-foreground">{openedPath ?? '未打开文件'}</span>
            <div className="flex-1" />
            {dirty && <span className="text-xs text-amber-500">未保存</span>}
            {saved && (
              <span className="flex items-center gap-1 text-xs text-primary">
                <Check className="h-3 w-3" /> 已保存
              </span>
            )}
            {openedPath && (
              <Button size="sm" variant="outline" onClick={() => void saveFile()} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                保存
              </Button>
            )}
          </div>
          <textarea
            value={fileContent}
            onChange={(e) => {
              setFileContent(e.target.value);
              setDirty(true);
            }}
            spellCheck={false}
            placeholder="从上方文件树选择一个文件"
            className="min-h-[240px] w-full resize-none rounded-lg bg-background p-3 font-mono text-xs leading-5 text-foreground outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
    </div>
  );
}
