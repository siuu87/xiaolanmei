/**
 * OmbreDetail —— 单条记忆的手账风详情面板（2026-10-21）。
 *
 * 复用 `components/BottomSheet`：下半屏、无模糊遮罩、Esc 在 capture 阶段关闭。
 * 这里只做「半透明深夜手账」的皮肤：暖色暗纸 + 极淡横格纹理 + 手写感排版。
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
            'px-5 pb-8 pt-1 text-amber-100/85',
            // 半透明深夜手账：暗纸 + 极淡横格纹理（不糊、纯色叠加）
            'bg-[#100b07]/85',
          )}
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent, transparent 27px, rgba(226,181,127,.05) 28px)',
          }}
        >
          {/* 状态行 */}
          <div className="flex flex-wrap items-center gap-2 pb-3">
            <span className="rounded-full bg-amber-400/15 px-2.5 py-0.5 text-[11px] text-amber-200">
              {STATE_LABEL[bucket.state] ?? bucket.type}
            </span>
            {bucket.pinned && (
              <span className="rounded-full bg-rose-400/15 px-2.5 py-0.5 text-[11px] text-rose-200/80">★ 钉住</span>
            )}
            {bucket.domain.map((d) => (
              <span key={d} className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11px] text-amber-200/60">
                #{d}
              </span>
            ))}
            {bucket.tags.map((t) => (
              <span key={t} className="rounded-full bg-white/[0.04] px-2.5 py-0.5 text-[10px] text-amber-200/40">
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
          <p className="whitespace-pre-wrap text-[13px] leading-[28px] tracking-wide text-amber-50/85">
            {String(bucket.raw.content ?? bucket.contentPreview ?? '（这条记忆没有正文）')}
          </p>

          {bucket.whyRemembered && (
            <p className="mt-4 rounded-xl bg-amber-400/[0.06] px-3 py-2 text-[12px] leading-5 text-amber-200/55">
              <span className="text-amber-300/60">为什么记住：</span> {bucket.whyRemembered}
            </p>
          )}

          {/* 时间脚注 */}
          <div className="mt-4 flex justify-between border-t border-amber-900/30 pt-2 text-[10px] text-amber-200/35">
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
    <div className="rounded-xl bg-white/[0.04] px-2 py-2">
      <div className="text-[14px] font-medium tabular-nums text-amber-100/90">{value}</div>
      <div className="mt-0.5 text-[9px] text-amber-200/40">{label}</div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.07]">
        <div className="h-full rounded-full bg-amber-400/70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
