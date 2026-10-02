import { useEffect, useState } from 'react';
import { Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { getArchive, saveArchive, type PrivateArchiveDTO, type BoundaryItem } from '@/lib/api/archive';

const inputCls =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';

function newBoundary(): BoundaryItem {
  return { id: `b${Date.now()}`, label: '', level: 'soft', enabled: true };
}

/** 设置页「私密档案」：专属偏好标签 + 边界（软/硬）+ 安全词，本地保存。 */
export function PrivateArchiveSection() {
  const [data, setData] = useState<PrivateArchiveDTO>({
    preferences: [],
    boundaries: [],
    safeword: { word: '', pauseWord: '' },
  });
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getArchive()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    setTagInput('');
    if (data.preferences.includes(t)) return;
    setData((d) => ({ ...d, preferences: [...d.preferences, t] }));
  };

  const removeTag = (t: string) =>
    setData((d) => ({ ...d, preferences: d.preferences.filter((x) => x !== t) }));

  const setBoundary = (id: string, patch: Partial<BoundaryItem>) =>
    setData((d) => ({
      ...d,
      boundaries: d.boundaries.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));

  const removeBoundary = (id: string) =>
    setData((d) => ({ ...d, boundaries: d.boundaries.filter((b) => b.id !== id) }));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveArchive({
        preferences: data.preferences,
        boundaries: data.boundaries.filter((b) => b.label.trim()),
        safeword: data.safeword,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      console.error(e);
      window.alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="px-3 py-6 text-center text-sm text-muted-foreground">加载中…</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>🔒 私密档案</CardTitle>
        <CardDescription>偏好、边界与安全词。安全词属高敏感，仅在本地保存。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 专属偏好 */}
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">专属偏好</label>
          <div className="flex gap-2">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="例如：不吃香菜、喜欢被摸头"
              className={inputCls}
            />
            <Button size="sm" variant="outline" onClick={addTag} disabled={!tagInput.trim()}>
              <Plus className="h-4 w-4" /> 添加
            </Button>
          </div>
          {data.preferences.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.preferences.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    aria-label={`删除 ${t}`}
                    className="opacity-60 hover:opacity-100"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 边界 */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs text-muted-foreground">边界（软 / 硬）</label>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setData((d) => ({ ...d, boundaries: [...d.boundaries, newBoundary()] }))}
            >
              <Plus className="h-4 w-4" /> 新增
            </Button>
          </div>
          <div className="space-y-2">
            {data.boundaries.map((b) => (
              <div key={b.id} className="flex items-center gap-2 rounded-lg border p-2">
                <input
                  value={b.label}
                  onChange={(e) => setBoundary(b.id, { label: e.target.value })}
                  placeholder="边界内容"
                  className={cn(inputCls, 'flex-1')}
                />
                <div className="flex shrink-0 overflow-hidden rounded-full bg-muted p-0.5 text-[11px]">
                  {(['soft', 'hard'] as const).map((lv) => (
                    <button
                      key={lv}
                      type="button"
                      onClick={() => setBoundary(b.id, { level: lv })}
                      className={cn(
                        'rounded-full px-2 py-0.5 transition',
                        b.level === lv
                          ? 'bg-white text-foreground shadow dark:bg-zinc-700'
                          : 'text-muted-foreground',
                      )}
                    >
                      {lv === 'soft' ? '软' : '硬'}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setBoundary(b.id, { enabled: !b.enabled })}
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] transition',
                    b.enabled
                      ? 'bg-emerald-500/15 text-emerald-600'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {b.enabled ? '启用' : '停用'}
                </button>
                <button
                  type="button"
                  onClick={() => removeBoundary(b.id)}
                  aria-label="删除边界"
                  className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {data.boundaries.length === 0 && (
              <p className="text-xs text-muted-foreground">还没有边界，点「新增」添加一条软/硬边界</p>
            )}
          </div>
        </div>

        {/* 安全词 */}
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">安全词</label>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={data.safeword.word}
              onChange={(e) => setData((d) => ({ ...d, safeword: { ...d.safeword, word: e.target.value } }))}
              placeholder="安全词（如 刷牙亲亲）"
              className={inputCls}
            />
            <input
              value={data.safeword.pauseWord}
              onChange={(e) => setData((d) => ({ ...d, safeword: { ...d.safeword, pauseWord: e.target.value } }))}
              placeholder="暂停词（如 喊停）"
              className={inputCls}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-xs text-primary">
              <Check className="h-3.5 w-3.5" /> 已保存
            </span>
          )}
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} 保存
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
