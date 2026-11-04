import { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useProfileStore } from '@/stores/profileStore';
import { AvatarContent } from '@/components/AvatarContent';

const inputCls =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';

/** 个人资料卡：昵称 / 头像 / 签名（localStorage 持久化）。头像只认图片 URL，空则显示中性剪影。 */
export function ProfileCard() {
  const name = useProfileStore((s) => s.name);
  const avatar = useProfileStore((s) => s.avatar);
  const signature = useProfileStore((s) => s.signature);
  const setName = useProfileStore((s) => s.setName);
  const setAvatar = useProfileStore((s) => s.setAvatar);
  const partnerAvatar = useProfileStore((s) => s.partnerAvatar);
  const setPartnerAvatar = useProfileStore((s) => s.setPartnerAvatar);
  const setSignature = useProfileStore((s) => s.setSignature);

  const [editing, setEditing] = useState(false);
  const [dName, setDName] = useState(name);
  const [dAvatar, setDAvatar] = useState(avatar);
  const [dPartnerAvatar, setDPartnerAvatar] = useState(partnerAvatar);
  const [dSig, setDSig] = useState(signature);

  const start = () => {
    setDName(name);
    setDAvatar(avatar);
    setDPartnerAvatar(partnerAvatar);
    setDSig(signature);
    setEditing(true);
  };
  const save = () => {
    setName(dName.trim());
    setAvatar(dAvatar.trim());
    setPartnerAvatar(dPartnerAvatar.trim());
    setSignature(dSig.trim());
    setEditing(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>个人资料</CardTitle>
        <CardDescription>昵称、头像与签名</CardDescription>
      </CardHeader>
      <CardContent>
        {!editing ? (
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
              <AvatarContent value={avatar} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-bold">{name || '未命名'}</div>
              <div className="truncate text-sm text-muted-foreground">{signature || '还没有签名'}</div>
            </div>
            <Button variant="outline" size="icon" onClick={start} aria-label="编辑资料">
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">我的头像图片地址</label>
              <input
                value={dAvatar}
                onChange={(e) => setDAvatar(e.target.value)}
                placeholder="留空显示剪影；可填 /api/files/… 或 https://…"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">TA 的头像图片地址</label>
              <input
                value={dPartnerAvatar}
                onChange={(e) => setDPartnerAvatar(e.target.value)}
                placeholder="留空显示剪影；可填 /api/files/… 或 https://…"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">昵称</label>
              <input value={dName} onChange={(e) => setDName(e.target.value)} placeholder="你的昵称" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">签名</label>
              <input value={dSig} onChange={(e) => setDSig(e.target.value)} placeholder="一句话介绍自己" className={inputCls} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(false)}>
                <X className="h-4 w-4" /> 取消
              </Button>
              <Button onClick={save}>
                <Check className="h-4 w-4" /> 保存
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
