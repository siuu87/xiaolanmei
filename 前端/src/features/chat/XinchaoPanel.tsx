/**
 * 内心 · 心潮摘要卡（2026-10-20）
 *
 * 心潮本身是一个独立完整页面（`/xinchao`：花瓣/念头池/情绪/时间线/小屋/内核）。
 * 这里只放「此刻 + 前 3 股驱力 + 打开完整心潮」，不再把六个页面塞进抽屉。
 * 心潮没起时显示启动说明，并把旧的本地六维面板作为 fallback。
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Heart, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useXinchaoData } from '@/features/xinchao/useXinchaoData';

const DRIVE_SHORT: Record<string, string> = {
  possess: '想她',
  monitor: '牵挂',
  share: '分享',
  libido: '情欲',
  curiosity: '好奇',
  boredom: '无聊',
  duty: '野心',
  reflection: '反思',
  grieve: '难过',
  grief: '难过',
  anger: '生气',
  favored: '偏爱',
};

const pct = (v: unknown): number => Math.round(Math.max(0, Math.min(1, Number(v) || 0)) * 100);

export function XinchaoPanel({ fallback }: { fallback: ReactNode }) {
  const navigate = useNavigate();
  const { status, now, state, snap, loading, err, reload } = useXinchaoData();

  if (loading && !status) {
    return (
      <section
        data-testid="xinchao-panel"
        className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-6 text-[13px] text-[#6b7488]"
      >
        <Loader2 size={15} className="animate-spin" /> 正在听心潮…
      </section>
    );
  }

  if (!status?.up) {
    return (
      <div className="space-y-3">
        <div data-testid="xinchao-setup" className="rounded-2xl border border-dashed border-white/[0.1] px-3.5 py-3">
          <div className="flex items-center gap-2 text-[12px] text-[#e8ecf6]">
            <Heart size={13} className="text-rose-300" /> 心潮还没启动
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-[#6b7488]">
            {status?.configured ? '服务不可达。' : '没配置 XINCHAO_URL。'} 当前先显示本地情绪。
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[10px] leading-4 text-[#9aa4bb]">
            {'cd xinchao\nnode --env-file=.env src/server.js'}
          </pre>
          <button
            type="button"
            onClick={() => void reload()}
            className="mt-2 rounded-lg bg-white/[0.07] px-2.5 py-1 text-[11px] text-[#e8ecf6] transition hover:bg-white/[0.1]"
          >
            重试
          </button>
        </div>
        {fallback}
      </div>
    );
  }

  const emotion = snap?.emotion ?? {
    label: state?.emotion?.label,
    valence: state?.emotion?.valence,
    arousal: state?.emotion?.arousal,
  };
  const drives = state?.drives ?? [];
  const topDrives =
    snap?.topDrives?.map((d) => ({ key: d.key, label: d.label, value: d.value })) ??
    drives.slice(0, 3).map((d) => ({ key: d.key, label: d.label, value: d.value }));
  const nowText = (now?.text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('【'))
    .join('\n');

  return (
    <section
      data-testid="xinchao-panel"
      className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4"
    >
      <div data-testid="xinchao-head" className="flex flex-nowrap items-center gap-1.5">
        <Heart size={13} className="shrink-0 text-rose-300" />
        <h2 className="shrink-0 whitespace-nowrap text-[12px] font-medium text-[#e8ecf6]">心潮 · 此刻</h2>
        <span
          data-testid="xinchao-mood"
          className="shrink-0 whitespace-nowrap rounded-full bg-[#c9a96a]/15 px-2 py-0.5 text-[11px] text-[#e8d3a5]"
        >
          {emotion?.label ?? '—'}
        </span>
        <div className="min-w-0 flex-1" />
        <span className="shrink-0 whitespace-nowrap text-[10px] text-[#6b7488]">
          rev {snap?.revision ?? state?.revision ?? 0}
        </span>
        <button
          type="button"
          onClick={() => void reload()}
          aria-label="刷新心潮"
          data-testid="xinchao-refresh"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#6b7488] transition hover:bg-white/[0.06] hover:text-[#e8ecf6]"
        >
          <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
        </button>
      </div>

      <p
        data-testid="xinchao-now"
        className="mt-3 whitespace-pre-wrap rounded-xl bg-white/[0.04] px-3 py-2 text-[12px] leading-5 text-[#9aa4bb]"
      >
        {nowText || '心潮暂时没有话说。'}
      </p>

      <div className="mt-3 space-y-1.5">
        {topDrives.slice(0, 3).map((d) => (
          <div key={d.key} data-testid={`xinchao-drive-${d.key}`} data-value={pct(d.value)} className="flex items-center gap-2">
            <span className="w-[3.4rem] shrink-0 whitespace-nowrap text-[10px] text-[#9aa4bb]">
              {DRIVE_SHORT[d.key] ?? d.label}
            </span>
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
              <div className="h-full rounded-full bg-[#c9a96a]" style={{ width: `${pct(d.value)}%` }} />
            </div>
            <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-[#c9a96a]">
              {pct(d.value)}
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => navigate('/xinchao')}
        data-testid="xinchao-open-full"
        className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl bg-[#c9a96a]/15 py-2 text-[11px] font-medium text-[#e8d3a5] transition hover:bg-[#c9a96a]/25"
      >
        打开完整心潮 <ArrowUpRight size={12} />
      </button>
      <p className="mt-1.5 text-center text-[10px] text-[#6b7488]">
        花瓣 · 念头池 · 情绪 · 时间线 · 小屋 · 内核
      </p>

      <div className="mt-3 flex items-center justify-between border-t border-white/[0.07] pt-2 text-[10px] text-[#6b7488]">
        <span>心潮念 · {drives.length} 股驱力</span>
        <span>
          {status.version ? `v${status.version}` : ''}
          {status.mode ? ` · ${status.mode}` : ''}
        </span>
      </div>
      {err && <p className="mt-1 text-[10px] text-rose-400/70">{err}</p>}
    </section>
  );
}
