/**
 * 心潮 · 独立完整页面（2026-10-20）
 *
 * 不再把心潮塞进「内心」的页签里：这里按它本来的结构铺开——
 * 花瓣（11 股驱力 + 花蕊情绪）、念头池（单独一类）、情绪、时间线、小屋、内核。
 *
 * 数据全部来自本地心潮 `/v1/dashboard/*`，令牌在后端；页面只读。
 * 视觉走暖暗色（和 PaiVoice / 深夜电台同一套夜色调），并用 PageShell 的 token
 * 覆盖成深色，保证「点开 = 整页不透明」。
 */
import { useState } from 'react';
import {
  ChevronDown,
  Clock,
  Heart,
  Home,
  Loader2,
  RefreshCw,
  Sparkles,
  Star,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { PageShell } from '@/components/PageShell';
import { cn } from '@/lib/utils';
import { useXinchaoData } from './useXinchaoData';

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

const EVENT_LABEL: Record<string, string> = {
  settle: '结算',
  conversation_event: '对话',
  conversation_heartbeat: '心跳',
  drive_feedback: '反馈',
  heartbeat: '心跳',
  memory_resonance: '记忆共振',
};

const pct = (v: unknown): number => Math.round(Math.max(0, Math.min(1, Number(v) || 0)) * 100);

function fmtTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function Section({
  icon,
  title,
  eyebrow,
  extra,
  children,
  testid,
  open,
  onToggle,
}: {
  icon: ReactNode;
  title: string;
  eyebrow: string;
  extra?: string;
  children: ReactNode;
  testid: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section
      data-testid={testid}
      data-open={open ? '1' : '0'}
      className="rounded-2xl border border-amber-900/25 bg-[#120c08]"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        data-testid={`${testid}-toggle`}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition active:bg-white/[0.02]"
      >
        <span className="text-amber-300/80">{icon}</span>
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h2 className="whitespace-nowrap text-[13px] font-medium text-amber-50">{title}</h2>
          <span className="shrink-0 text-[9px] uppercase tracking-[0.2em] text-amber-200/30">
            {eyebrow}
          </span>
        </div>
        {extra && (
          <span className="shrink-0 whitespace-nowrap text-[10px] text-amber-200/40">{extra}</span>
        )}
        <ChevronDown
          size={14}
          className={cn('shrink-0 text-amber-200/40 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

function Bar({ label, value, tone = 'bg-[#c9a96a]' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[3.4rem] shrink-0 whitespace-nowrap text-[10px] text-amber-200/50">{label}</span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${value}%` }} />
      </div>
      <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-amber-200/50">{value}</span>
    </div>
  );
}

/** 花瓣：11 股驱力围绕花蕊；长度与透明度随数值。 */
function Flower({
  drives,
  emotionLabel,
  consciousness,
}: {
  drives: { key: string; value: number; short?: string; label?: string }[];
  emotionLabel?: string;
  consciousness?: string;
}) {
  const size = 300;
  const c = size / 2;
  const list = drives.length ? drives : [];
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[300px]" role="img" aria-label="心潮花瓣">
      <defs>
        <radialGradient id="xcp" cx="50%" cy="80%" r="80%">
          <stop offset="0%" stopColor="#f6d6a4" />
          <stop offset="55%" stopColor="#d29a5d" />
          <stop offset="100%" stopColor="#7a4c28" />
        </radialGradient>
        <radialGradient id="xcc" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#ffe6bd" />
          <stop offset="100%" stopColor="#c98d55" />
        </radialGradient>
        <filter id="xcg" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
      </defs>
      <circle cx={c} cy={c} r={124} fill="none" stroke="rgba(226,181,127,.08)" />
      <circle cx={c} cy={c} r={96} fill="none" stroke="rgba(226,181,127,.06)" />
      <circle cx={c} cy={c} r={58} fill="rgba(226,181,127,.05)" filter="url(#xcg)" />
      {list.map((d, i) => {
        const angle = (i / list.length) * Math.PI * 2 - Math.PI / 2;
        const v = Math.max(0.06, Math.min(1, d.value));
        const inner = 32;
        const outer = 46 + v * 84;
        const x1 = c + Math.cos(angle) * inner;
        const y1 = c + Math.sin(angle) * inner;
        const x2 = c + Math.cos(angle) * outer;
        const y2 = c + Math.sin(angle) * outer;
        const nx = Math.cos(angle + Math.PI / 2);
        const ny = Math.sin(angle + Math.PI / 2);
        const w = 9 + v * 11;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const path = `M${x1} ${y1} Q ${mx + nx * w} ${my + ny * w} ${x2} ${y2} Q ${mx - nx * w} ${my - ny * w} ${x1} ${y1}`;
        const lx = c + Math.cos(angle) * (outer + 16);
        const ly = c + Math.sin(angle) * (outer + 16);
        return (
          <g key={d.key}>
            <path d={path} fill="url(#xcp)" opacity={0.3 + v * 0.65} />
            <text x={lx} y={ly} textAnchor="middle" fontSize="9" fill="#c9b89e">
              {d.short ?? DRIVE_SHORT[d.key] ?? d.label ?? d.key}
            </text>
          </g>
        );
      })}
      <circle cx={c} cy={c} r={30} fill="url(#xcc)" />
      <text x={c} y={c - 1} textAnchor="middle" fontSize="11" fill="#2a1a10">
        {emotionLabel ?? '平静'}
      </text>
      <text x={c} y={c + 13} textAnchor="middle" fontSize="8" fill="rgba(42,26,16,.62)">
        {consciousness ?? ''}
      </text>
    </svg>
  );
}

export function XinchaoPage() {
  const { status, now, state, snap, timeline, cabin, persona, loading, err, reload } = useXinchaoData();
  /** 除花瓣外，下面五个页面都可折叠；默认全收起，页面更清爽 */
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const SECTION_KEYS = ['thoughts', 'emotion', 'timeline', 'cabin', 'personality'] as const;
  const allOpen = SECTION_KEYS.every((k) => open[k]);
  const toggle = (k: string) => setOpen((v) => ({ ...v, [k]: !v[k] }));
  const toggleAll = () =>
    setOpen(Object.fromEntries(SECTION_KEYS.map((k) => [k, !allOpen])) as Record<string, boolean>);

  type UiDrive = { key: string; value: number; short?: string; label?: string };
  const drives: UiDrive[] = (snap?.drives ?? state?.drives ?? []).map((d) => {
    const short =
      'short' in d && typeof (d as { short?: unknown }).short === 'string'
        ? (d as { short: string }).short
        : undefined;
    return { key: d.key, value: d.value, label: d.label, ...(short ? { short } : {}) };
  });
  const emotion = snap?.emotion ?? {
    label: state?.emotion?.label,
    valence: state?.emotion?.valence,
    arousal: state?.emotion?.arousal,
    journal: [] as { at: string; label: string; cause?: string | null; top?: string }[],
  };
  const journal = snap?.emotion?.journal ?? [];
  const nowText = (now?.text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('【'))
    .join('\n');
  const timelineItems = timeline?.items ?? [];
  const cabinNotes = cabin?.notes ?? [];
  const cabinLedger = cabin?.ledger ?? [];
  const thoughtLines = snap?.thoughts?.lines ?? [];
  const flashCount = snap?.thoughts?.flashCount ?? 0;
  const obsessionCount = snap?.thoughts?.obsessionCount ?? 0;

  return (
    <PageShell
      title="心潮"
      eyebrow="XINCHAO"
      testId="xinchao-page"
      backTo="/chat"
      className="bg-[#0b0805] [--page-bg:28_18%_5%] [--page-line:30_15%_14%] [--foreground:38_35%_90%] [--muted-foreground:35_10%_55%]"
      bodyClassName="px-4 py-5 pb-16"
      right={
        <button
          type="button"
          onClick={() => void reload()}
          aria-label="刷新心潮"
          data-testid="xinchao-page-refresh"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-amber-200/50 transition hover:bg-white/10 hover:text-amber-100"
        >
          <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
        </button>
      }
    >
      {loading && !status ? (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-900/25 bg-[#120c08] px-4 py-10 text-[13px] text-amber-200/40">
          <Loader2 size={15} className="animate-spin" /> 正在听心潮…
        </div>
      ) : !status?.up ? (
        <div data-testid="xinchao-page-setup" className="rounded-2xl border border-dashed border-amber-900/40 bg-[#120c08] p-5">
          <p className="text-[13px] text-amber-50">心潮还没启动</p>
          <p className="mt-1 text-[11px] leading-5 text-amber-200/40">
            {status?.configured ? '服务不可达。' : '没配置 XINCHAO_URL。'}
            启动后这边会显示花瓣、念头池、情绪、时间线、小屋和内核。
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-white/[0.04] px-3 py-2 text-[10px] leading-4 text-amber-200/50">
            {'cd xinchao\nnode --env-file=.env src/server.js'}
          </pre>
          <button
            type="button"
            onClick={() => void reload()}
            className="mt-3 rounded-full bg-amber-400 px-3 py-1.5 text-[11px] font-medium text-[#1a120b]"
          >
            重试
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 花瓣 + 此刻 */}
          <section
            data-testid="xinchao-flower"
            className="rounded-3xl border border-amber-900/30 bg-gradient-to-b from-[#1a120b] to-[#0f0a06] p-5"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[9px] uppercase tracking-[0.35em] text-amber-200/30">
                  {snap?.identity?.agentName ?? '心潮'} · 此刻
                </p>
                <p className="mt-1 text-[11px] text-amber-200/40">
                  {snap?.runtime?.consciousness ?? state?.consciousness ?? '—'} · 疲劳{' '}
                  {pct(snap?.runtime?.fatigue)}% · 静了 {snap?.runtime?.idleMinutes ?? 0} 分钟
                </p>
              </div>
              <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[10px] text-amber-200/60">
                rev {snap?.revision ?? state?.revision ?? 0}
              </span>
            </div>

            <div className="mt-2 flex justify-center">
              <Flower
                drives={drives}
                emotionLabel={emotion?.label}
                consciousness={snap?.runtime?.consciousness}
              />
            </div>

            <p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-amber-100/65">
              {nowText || '心潮暂时没有话说。'}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-1.5">
              {drives.map((d) => (
                <div key={d.key} className="flex items-baseline justify-between gap-2 text-[10px]">
                  <span className="truncate text-amber-200/50">
                    {d.short ?? DRIVE_SHORT[d.key] ?? d.label}
                  </span>
                  <span className="shrink-0 tabular-nums text-amber-300/60">{pct(d.value)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 除花瓣外都可折叠 */}
          <div data-testid="xinchao-fold-controls" className="flex items-center justify-between px-1">
            <p className="text-[10px] text-amber-200/30">
              花瓣下面 {SECTION_KEYS.length} 个页面，可单独展开
            </p>
            <button
              type="button"
              onClick={toggleAll}
              data-testid="xinchao-fold-all"
              className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] text-amber-200/60 transition hover:bg-white/[0.09]"
            >
              {allOpen ? '全部收起' : '全部展开'}
            </button>
          </div>

          {/* 念头池：单独一类 */}
          <Section
            icon={<Sparkles size={14} />}
            title="念头池"
            eyebrow="THOUGHTS"
            extra={`闪念 ${flashCount} · 执念 ${obsessionCount}`}
            testid="xinchao-thoughts"
            open={!!open.thoughts}
            onToggle={() => toggle('thoughts')}
          >
            {thoughtLines.length === 0 ? (
              <p className="text-[11px] leading-5 text-amber-200/35">
                念头池还是空的。等心潮自己长出念头，会落在这里。
              </p>
            ) : (
              <ul className="space-y-1.5">
                {thoughtLines.slice(0, 12).map((line, i) => (
                  <li
                    key={i}
                    className="rounded-xl bg-white/[0.035] px-3 py-2 text-[11px] leading-5 text-amber-100/70"
                  >
                    {typeof line === 'string' ? line : JSON.stringify(line).slice(0, 120)}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* 情绪 */}
          <Section
            icon={<Heart size={14} />}
            title="情绪"
            eyebrow="EMOTION"
            testid="xinchao-emotion"
            open={!!open.emotion}
            onToggle={() => toggle('emotion')}
          >
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-amber-200/80">{emotion?.label ?? '—'}</span>
              <span className="text-[10px] text-amber-200/35">
                最近 {journal.length} 次记录
              </span>
            </div>
            <div className="mt-2 space-y-2">
              <Bar label="效价" value={pct(emotion?.valence)} tone="bg-rose-400" />
              <Bar label="唤醒" value={pct(emotion?.arousal)} tone="bg-amber-400" />
            </div>
            {journal.length > 0 && (
              <ul className="mt-2 space-y-1">
                {journal
                  .slice(-8)
                  .reverse()
                  .map((j, i) => (
                    <li key={`${j.at}-${i}`} className="flex items-center gap-2 text-[10px] text-amber-200/45">
                      <span className="w-8 shrink-0 tabular-nums">{fmtTime(j.at)}</span>
                      <span className="shrink-0 text-amber-200/80">{j.label}</span>
                      <span className="min-w-0 truncate">
                        {j.cause || (j.top ? DRIVE_SHORT[j.top] ?? j.top : '')}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </Section>

          {/* 时间线 */}
          <Section
            icon={<Clock size={14} />}
            title="时间线"
            eyebrow="TIMELINE"
            extra={`${timelineItems.length} 条`}
            testid="xinchao-timeline"
            open={!!open.timeline}
            onToggle={() => toggle('timeline')}
          >
            {timelineItems.length === 0 ? (
              <p className="text-[11px] text-amber-200/35">还没有结算记录。</p>
            ) : (
              <ul className="space-y-1.5">
                {timelineItems.slice(0, 30).map((it) => {
                  const deltas = Object.entries(it.delta?.driveDeltas ?? {})
                    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                    .slice(0, 3);
                  return (
                    <li key={it.id} className="rounded-xl bg-white/[0.03] px-3 py-2">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-amber-200/60">{EVENT_LABEL[it.type] ?? it.type}</span>
                        <span className="tabular-nums text-amber-200/30">{fmtTime(it.at)}</span>
                      </div>
                      {deltas.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px]">
                          {deltas.map(([k, v]) => (
                            <span key={k} className={v >= 0 ? 'text-amber-300/80' : 'text-sky-300/80'}>
                              {DRIVE_SHORT[k] ?? k} {v >= 0 ? '+' : ''}
                              {v.toFixed(2)}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {/* 小屋 */}
          <Section
            icon={<Home size={14} />}
            title="小屋"
            eyebrow="CABIN"
            extra={`结余 ${cabin?.totals?.net ?? 0}`}
            testid="xinchao-cabin"
            open={!!open.cabin}
            onToggle={() => toggle('cabin')}
          >
            {cabinNotes.length === 0 ? (
              <p className="text-[11px] text-amber-200/35">小屋还没有信。</p>
            ) : (
              <ul className="space-y-1.5">
                {cabinNotes.slice(0, 10).map((n) => (
                  <li key={n.id} className="rounded-xl bg-white/[0.03] px-3 py-2">
                    <div className="flex items-center justify-between text-[10px] text-amber-200/30">
                      <span>{n.from ?? '—'}</span>
                      <span className="tabular-nums">{fmtTime(n.at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-amber-100/70">
                      {n.locked ? '（这封信上锁了）' : n.content || '（空）'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 rounded-xl bg-white/[0.03] px-3 py-2">
              <p className="text-[10px] text-amber-200/30">小账本</p>
              {cabinLedger.length === 0 ? (
                <p className="mt-1 text-[11px] text-amber-200/35">账本还是空的。</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {cabinLedger.slice(0, 8).map((l) => (
                    <li key={l.id} className="flex justify-between text-[10px] text-amber-200/50">
                      <span className="truncate">{l.note || '—'}</span>
                      <span className="tabular-nums">{l.amount ?? 0}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>

          {/* 内核 */}
          <Section
            icon={<Star size={14} />}
            title="内核"
            eyebrow="CORE"
            testid="xinchao-personality"
            open={!!open.personality}
            onToggle={() => toggle('personality')}
          >
            {persona?.available === false ? (
              <p className="text-[11px] leading-5 text-amber-200/35">
                这个月还没做回顾。心潮会在月度回顾时生成内核（18 维 + 锚点），
                平时先看花瓣、念头池和情绪就好。
              </p>
            ) : (
              <div className="space-y-1.5">
                {persona?.month && <p className="text-[10px] text-amber-200/30">{persona.month}</p>}
                {(persona?.dimensions ?? []).map((d, i) => (
                  <Bar
                    key={`${d.key ?? i}`}
                    label={d.label ?? d.key ?? `维度 ${i + 1}`}
                    value={pct(d.value)}
                  />
                ))}
                {(persona?.anchors ?? []).length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {(persona?.anchors ?? []).slice(0, 6).map((a, i) => (
                      <li key={i} className="rounded-xl bg-white/[0.03] px-3 py-2 text-[10px] leading-4 text-amber-100/60">
                        {typeof a === 'string' ? a : JSON.stringify(a).slice(0, 100)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Section>

          <p className="pb-2 text-center text-[10px] text-amber-200/25">
            {status.version ? `心潮 v${status.version}` : '心潮'}
            {status.mode ? ` · ${status.mode}` : ''} · 数据只读
          </p>
        </div>
      )}
      {err && <p className="mt-3 text-center text-[11px] text-rose-400/70">{err}</p>}
    </PageShell>
  );
}
