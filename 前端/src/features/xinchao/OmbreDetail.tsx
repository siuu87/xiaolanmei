/**
 * OmbreDetail —— 单条记忆的手账风详情面板（2026-10-21）。
 *
 * 复用 `components/BottomSheet`：下半屏、无模糊遮罩、Esc 在 capture 阶段关闭。
 * 这里只做「手账纸面」的皮肤：token 纸面底 + 极淡横格纹理 + 手写感排版，深浅主题自动换档。
 */
import { BottomSheet } from '@/components/BottomSheet';
import type { OmbreBucket } from '@/lib/api/ombreDashboard';
import { cn } from '@/lib/utils';

function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATE_LABEL: Record<string, string> = {
  dynamic: '动态',
  permanent: '永久',
  pinned: '已钉选',
  archived: '已归档',
};

export function OmbreDetail({
  bucket,
  open,
  onClose,
}: {
  bucket: OmbreBucket | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={bucket?.name}
      testid="ombre-detail"
      maxHeight="max-h-[80vh]"
    >
      {bucket && (
        <div
          className={cn(
            'px-5 pb-8 pt-1 text-foreground',
            // 手账纸面：纯色 token 底 + 极淡横格纹理（不糊、纯色叠加）
            'bg-surface',
          )}
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent, transparent 27px, hsl(var(--border) / 0.45) 28px)',
          }}
        >
          {/* 状态行 */}
          <div className="flex flex-wrap items-center gap-2 pb-3">
            <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-[11px] text-foreground">
              {STATE_LABEL[bucket.state] ?? bucket.type}
            </span>
            {bucket.pinned && (
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] text-primary">★ 钉住</span>
            )}
            {bucket.domain.map((d) => (
              <span key={d} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] text-muted-foreground">
                #{d}
              </span>
            ))}
            {bucket.tags.map((t) => (
              <span key={t} className="rounded-full bg-surface-3 px-2.5 py-0.5 text-[10px] text-muted-foreground">
                {t}
              </span>
            ))}
          </div>

          {/* 情绪坐标 */}
          <div className="grid grid-cols-4 gap-2 pb-4 text-center">
            <Stat label="效价" value={bucket.valence} />
            <Stat label="唤醒" value={bucket.arousal} />
            <Stat label="重要" value={bucket.importance} max={10} />
            <Stat label="活跃度" value={bucket.score} />
          </div>

          {/* 正文 */}
          <p className="whitespace-pre-wrap text-[13px] leading-[28px] tracking-wide text-foreground">
            {String(bucket.raw.content ?? bucket.contentPreview ?? '（这条记忆没有正文）')}
          </p>

          {bucket.whyRemembered && (
            <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2 text-[12px] leading-5 text-muted-foreground">
              <span className="text-foreground">为什么记住：</span> {bucket.whyRemembered}
            </p>
          )}

          {/* 时间脚注 */}
          <div className="mt-4 flex justify-between border-t border-border pt-2 text-[10px] text-muted-foreground">
            <span>{bucket.created ? `种下于 ${fmtDate(bucket.created)}` : ''}</span>
            <span>{bucket.lastActive ? `最近 ${fmtDate(bucket.lastActive)}` : ''}</span>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function Stat({ label, value, max = 1 }: { label: string; value: number; max?: number }) {
  const pct = Math.round((Math.max(0, Math.min(max, value)) / max) * 100);
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-2">
      <div className="text-[14px] font-medium tabular-nums text-foreground">{value}</div>
      <div className="mt-0.5 text-[9px] text-muted-foreground">{label}</div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
