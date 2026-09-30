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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-[#1b1626] p-5 shadow-xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-slate-100">
            <Sparkles className="h-4 w-4 text-amber-300" /> {title}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={5}
          autoFocus
          placeholder={placeholder}
          className="mt-3 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-white/30"
        />
        {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="h-10 flex-1 rounded-xl bg-white/5 text-sm font-medium text-slate-300 transition hover:bg-white/10">
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
