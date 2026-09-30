import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  listMemories,
  createMemory,
  patchMemory,
  deleteMemory,
  listSummaries,
  generateSummary,
  deleteSummary,
  type MemoryDTO,
  type MemoryCategory,
  type SummaryDTO,
} from '@/lib/api/memories';
import { useChatStore, activePath } from '@/features/chat/chatStore';

const CATEGORY_LABEL: Record<MemoryCategory, string> = { fact: '事实', event: '事件', relation: '关系' };
const CATEGORY_CLS: Record<MemoryCategory, string> = {
  fact: 'bg-primary/15 text-primary',
  event: 'bg-amber-400/15 text-amber-300',
  relation: 'bg-rose-400/15 text-rose-300',
};
const CATEGORIES: MemoryCategory[] = ['fact', 'event', 'relation'];

const inputCls =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 记忆与摘要面板：手动记忆 CRUD + 模型自动记忆查看 + 滚动摘要（内嵌在「我的」页）。 */
export function MemoryPanel() {
  const conversation = useChatStore((s) => s.conversation);
  const chatLoaded = useChatStore((s) => s.loaded);
  const loadChat = useChatStore((s) => s.load);

  const [memories, setMemories] = useState<MemoryDTO[]>([]);
  const [summaries, setSummaries] = useState<SummaryDTO[]>([]);
  const [filter, setFilter] = useState<'all' | MemoryCategory>('all');
  const [editingId, setEditingId] = useState<string | null>(null); // 'new' = 新建
  const [form, setForm] = useState<{ category: MemoryCategory; content: string }>({
    category: 'fact',
    content: '',
  });
  const [genBusy, setGenBusy] = useState(false);

  const loadMemories = async () => {
    try {
      setMemories(await listMemories());
    } catch (e) {
      console.error(e);
    }
  };
  const loadSummaries = async () => {
    try {
      setSummaries(await listSummaries());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    void loadMemories();
    void loadSummaries();
    if (!chatLoaded) void loadChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCreate = () => {
    setForm({ category: 'fact', content: '' });
    setEditingId('new');
  };
  const startEdit = (m: MemoryDTO) => {
    setForm({ category: m.category, content: m.content });
    setEditingId(m.id);
  };
  const cancelEdit = () => setEditingId(null);

  const save = async () => {
    const content = form.content.trim();
    if (!content) return;
    try {
      if (editingId === 'new') {
        await createMemory({ category: form.category, content });
      } else if (editingId) {
        await patchMemory(editingId, { category: form.category, content });
      }
      setEditingId(null);
      await loadMemories();
    } catch (e) {
      console.error(e);
    }
  };

  const toggleActive = async (m: MemoryDTO) => {
    try {
      await patchMemory(m.id, { active: !m.active });
      await loadMemories();
    } catch (e) {
      console.error(e);
    }
  };

  const remove = async (m: MemoryDTO) => {
    try {
      await deleteMemory(m.id);
      await loadMemories();
    } catch (e) {
      console.error(e);
    }
  };

  const removeSummary = async (s: SummaryDTO) => {
    try {
      await deleteSummary(s.id);
      await loadSummaries();
    } catch (e) {
      console.error(e);
    }
  };

  const genSummary = async () => {
    if (!conversation) return;
    const msgs = activePath(conversation);
    if (msgs.length < 2) {
      window.alert('对话消息太少，暂不能生成摘要');
      return;
    }
    setGenBusy(true);
    try {
      await generateSummary(conversation.id, msgs[0].id, msgs[msgs.length - 1].id);
      await loadSummaries();
    } catch (e) {
      console.error(e);
    } finally {
      setGenBusy(false);
    }
  };

  const filtered = filter === 'all' ? memories : memories.filter((m) => m.category === filter);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>长期记忆</CardTitle>
              <CardDescription>小蓝莓会在聊天中引用这些内容</CardDescription>
            </div>
            <Button size="sm" onClick={startCreate}>
              <Plus className="h-4 w-4" /> 记一条
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 分类筛选 */}
          <div className="flex gap-2">
            {(['all', ...CATEGORIES] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFilter(c)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs transition',
                  filter === c
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-foreground/80 hover:bg-muted',
                )}
              >
                {c === 'all' ? '全部' : CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {memories.length === 0 ? '还没有记忆，点「记一条」开始吧。' : '该分类下没有记忆。'}
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'flex items-start gap-2 rounded-lg border p-3',
                    !m.active && 'opacity-50',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px]', CATEGORY_CLS[m.category])}>
                        {CATEGORY_LABEL[m.category]}
                      </span>
                      {m.source === 'model' && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          <Sparkles className="mr-0.5 inline h-2.5 w-2.5" />
                          自动
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-foreground/90">{m.content}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => toggleActive(m)}
                      aria-label={m.active ? '停用' : '启用'}
                      className={cn(
                        'h-5 w-9 shrink-0 rounded-full transition',
                        m.active ? 'bg-primary' : 'bg-muted',
                      )}
                    >
                      <span
                        className={cn(
                          'block h-4 w-4 rounded-full bg-white transition',
                          m.active ? 'translate-x-4' : 'translate-x-0.5',
                        )}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(m)}
                      aria-label="编辑"
                      className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(m)}
                      aria-label="删除"
                      className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {editingId && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, category: c }))}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-sm transition',
                      form.category === c
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/60 text-foreground/80 hover:bg-muted',
                    )}
                  >
                    {CATEGORY_LABEL[c]}
                  </button>
                ))}
              </div>
              <textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                rows={3}
                autoFocus
                placeholder="如：她的生日是 8 月 15 日 / 我们 2025 年去的厦门"
                className={cn(inputCls, 'resize-y')}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={cancelEdit}>
                  取消
                </Button>
                <Button onClick={() => void save()} disabled={!form.content.trim()}>
                  保存
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>对话摘要</CardTitle>
              <CardDescription>长对话自动滚动生成，也会在聊天时注入帮助接续上下文</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => void genSummary()} disabled={genBusy}>
              {genBusy ? '生成中…' : '立即生成'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {summaries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              还没有摘要。聊久一点会自动生成，或点「立即生成」。
            </p>
          ) : (
            <div className="space-y-3">
              {summaries.map((s) => (
                <div key={s.id} className="flex items-start gap-2 rounded-lg border p-3">
                  <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
                    {s.content}
                  </p>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[10px] text-muted-foreground">{fmtTime(s.createdAt)}</span>
                    <button
                      type="button"
                      onClick={() => removeSummary(s)}
                      aria-label="删除摘要"
                      className="rounded p-1 text-muted-foreground transition hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
