import type { StateSnapshot } from '@/lib/api/state';

/** 单张角色状态卡：头像 emoji + 名称 + 心潮状态（先透传原始数据，等字段确认后美化）。 */
export function CharacterCard({
  name,
  avatar,
  snapshot,
}: {
  name: string;
  avatar: string;
  snapshot: StateSnapshot | null;
}) {
  const connected = !!snapshot && !snapshot.degraded;
  const raw =
    snapshot?.data == null
      ? null
      : typeof snapshot.data === 'string'
        ? snapshot.data
        : JSON.stringify(snapshot.data, null, 2);

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-lg">{avatar}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{name}</div>
          <div className="text-[10px] text-muted-foreground">{connected ? '心潮已连接' : '心潮未连接'}</div>
        </div>
      </div>

      {connected && raw ? (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {raw}
        </pre>
      ) : (
        <div className="py-3 text-center text-xs text-muted-foreground">等心潮跑起来后，这里会显示它的状态</div>
      )}
    </div>
  );
}
