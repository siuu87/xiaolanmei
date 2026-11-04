import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { MemoAvatar } from '@/components/MemoAvatar';
import { listProfiles, patchProfile, type ProfileDTO } from '@/lib/api/profiles';

const COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6', '#f97316'];

const inputCls =
  'w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary';

interface Form {
  nickname: string;
  emoji: string;
  avatarColor: string;
}

/** 设置页「我们的档案」：编辑我与对方的昵称/头像 emoji/徽章颜色，实时预览，保存到后端。 */
export function ProfilesSection() {
  const [profiles, setProfiles] = useState<ProfileDTO[]>([]);
  const [forms, setForms] = useState<Record<string, Form>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const load = async () => {
    try {
      const ps = await listProfiles();
      setProfiles(ps);
      setForms(
        Object.fromEntries(ps.map((p) => [p.id, { nickname: p.nickname, emoji: p.emoji ?? '', avatarColor: p.avatarColor }])),
      );
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const set = (id: string, key: keyof Form, value: string) =>
    setForms((f) => ({ ...f, [id]: { ...f[id], [key]: value } }));

  const save = async (p: ProfileDTO) => {
    const f = forms[p.id];
    if (!f || !f.nickname.trim()) return;
    setSaving(p.id);
    try {
      await patchProfile(p.id, {
        nickname: f.nickname.trim(),
        emoji: f.emoji.trim(),
        avatarColor: f.avatarColor,
      });
      setSavedId(p.id);
      setTimeout(() => setSavedId(null), 1500);
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>💞 我们的档案</CardTitle>
        <CardDescription>两个人的昵称与头像，备忘录里的「谁为谁记的」专属徽章会用它们。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {profiles.map((p) => {
          const f = forms[p.id] ?? { nickname: p.nickname, emoji: p.emoji ?? '', avatarColor: p.avatarColor };
          return (
            <div key={p.id} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-center gap-3">
                <MemoAvatar
                  seed={p.avatarSeed}
                  nickname={f.nickname || p.nickname}
                  color={f.avatarColor}
                  size={44}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{f.nickname || p.nickname}</span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {p.isMe ? '我' : '对方'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">会显示在备忘录的归属徽章上</div>
                </div>
              </div>

              <div className="mt-3 space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">昵称</label>
                  <input
                    value={f.nickname}
                    onChange={(e) => set(p.id, 'nickname', e.target.value)}
                    placeholder="昵称"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">徽章颜色</label>
                  <div className="flex flex-wrap items-center gap-2">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => set(p.id, 'avatarColor', c)}
                        aria-label={`颜色 ${c}`}
                        className={cn(
                          'h-7 w-7 rounded-full transition',
                          f.avatarColor === c ? 'ring-2 ring-primary ring-offset-2' : 'hover:scale-110',
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <input
                      type="color"
                      value={f.avatarColor}
                      onChange={(e) => set(p.id, 'avatarColor', e.target.value)}
                      aria-label="自定义颜色"
                      className="h-7 w-10 cursor-pointer rounded border border-border bg-surface-2"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  {savedId === p.id && (
                    <span className="flex items-center gap-1 text-xs text-primary">
                      <Check className="h-3.5 w-3.5" /> 已保存
                    </span>
                  )}
                  <Button size="sm" onClick={() => void save(p)} disabled={saving === p.id || !f.nickname.trim()}>
                    {saving === p.id && <Loader2 className="h-4 w-4 animate-spin" />} 保存
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
