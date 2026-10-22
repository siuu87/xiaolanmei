import { useState } from 'react';
import { Sparkles, X, Loader2 } from 'lucide-react';
import { aiImportJson } from './aiImport';

interface Props {
  title: string;
  placeholder: string;
  systemPrompt: string;
  onResult: (data: unknown) => void;
  onClose: () => void;
}

/** 通用 AI 导入弹窗：粘贴链接/描述 → 模型整理成结构化 JSON → 回调给页面入库 */
export function AiImportDialog({ title, placeholder, systemPrompt, onResult, onClose }: Props) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    if (!input.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const data = await aiImportJson<unknown>(systemPrompt, input.trim());
      onResult(data);
    } catch (e) {
      setError((e as Error).message || 'AI 导入失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4" onClick={onClose}>
      <div className="paper-card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Sparkles className="h-4 w-4 text-gold" /> {title}
          </h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={5}
          autoFocus
          placeholder={placeholder}
          className="mt-3 w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-gold/40"
        />
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="h-10 flex-1 rounded-xl bg-surface-2 text-sm font-medium text-muted-foreground transition hover:bg-surface-3 hover:text-foreground">
            取消
          </button>
          <button
            type="button"
            onClick={run}
            disabled={busy || !input.trim()}
            className="flex h-10 flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? '整理中…' : 'AI 导入'}
          </button>
        </div>
      </div>
    </div>
  );
}
