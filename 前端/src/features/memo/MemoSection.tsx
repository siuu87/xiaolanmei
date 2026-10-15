import { useEffect, useState } from 'react';
import { Sparkles, Loader2, PenLine } from 'lucide-react';
import { listMemos, createMemo, type MemoDTO } from '@/lib/api/memo';
import { MemoBullet } from './MemoBullet';

/** 一次最多渲染这么多条，再多就提示去「备忘录」页看全部，免得折叠页里长到没边 */
const MAX_ROWS = 30;

/**
 * 备忘录折叠页（「他的资料 → 备忘录」）。
 *
 * **复用现有备忘录**（`/api/memo`，底层 rag_documents），不是另起一套：
 * - AI 在对话里用 `memo_add` / `memo_update` / `memo_delete` 工具写同一张表，
 *   所以「AI 也可以添加」是现成能力，这里不需要新接口；
 * - 点任意一条用 `MemoBullet` → `MemoDetailDialog`，可以改内容、归档、删除。
 * 这里只补两件现有页面没做的事：一个「记一笔」输入框（不用跳去备忘录页），
 * 以及把列表嵌进资料页。
 */
export function MemoSection() {
  const [memos, setMemos] = useState<MemoDTO[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    listMemos()
      .then(setMemos)
      .catch((e) => console.error(e));
  };

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true);
    setErr('');
    try {
      // 与 AddMemoFab 一致：只写内容，标题/分类/归属交给 AI 或后续整理
      await createMemo({
        content,
        title: content.length > 15 ? `${content.slice(0, 15)}…` : content,
        status: 'unfiled',
        ownerSide: 'me',
        category: 'general',
      });
      setDraft('');
      load();
    } catch (e) {
      // 后端对重复内容返回 409，这里原样显示，不要吞掉
      setErr((e as Error).message || '记入失败');
    } finally {
      setBusy(false);
    }
  };

  const shown = memos.slice(0, MAX_ROWS);
  const hidden = memos.length - shown.length;

  return (
    <div className="space-y-3" data-testid="memo-section">
      <div>
        <label htmlFor="memo-draft" className="mb-1 block text-sm font-medium">
          记一笔
        </label>
        <textarea
          id="memo-draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="想到什么就写下来；AI 在聊天里也会往里记"
          data-testid="memo-input"
          className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void add()}
            disabled={busy || !draft.trim()}
            data-testid="memo-add"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
            {busy ? '记录中…' : '记入备忘录'}
          </button>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            小蓝莓在对话里也会自己记
          </span>
        </div>
        {err && (
          <p data-testid="memo-error" className="mt-2 text-xs text-destructive">
            {err}
          </p>
        )}
      </div>

      <div className="border-t pt-2">
        <p className="mb-1 text-xs text-muted-foreground" data-testid="memo-count">
          共 {memos.length} 条（点任意一条可编辑 / 删除）
        </p>
        {memos.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">还没有记录。</p>
        ) : (
          <div data-testid="memo-list">
            {shown.map((m) => (
              <MemoBullet key={m.id} memo={m} onChanged={load} />
            ))}
          </div>
        )}
        {hidden > 0 && (
          <p className="pt-1 text-xs text-muted-foreground">还有 {hidden} 条，去「备忘录」页看全部</p>
        )}
      </div>
    </div>
  );
}
