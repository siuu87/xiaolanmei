/**
 * 内心 · 心潮多页签面板（2026-10-20）
 *
 * 把心潮本地 Dashboard 的几页搬进「内心」：
 *   此刻 / 驱力 / 情绪 / 时间线 / 小屋 / 内核
 * 数据来自 `/api/xinchao/{now,state,dashboard/*}`，令牌在后端，前端只读。
 * 心潮没起时显示启动说明，并把旧的本地六维面板作为 fallback。
 */
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Heart, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getXinchaoDashboard,
  getXinchaoNow,
  getXinchaoState,
  getXinchaoStatus,
  type XinchaoCabin,
  type XinchaoNow,
  type XinchaoPersonality,
  type XinchaoSnapshot,
  type XinchaoState,
  type XinchaoStatus,
  type XinchaoTimeline,
} from '@/lib/api/xinchao';

type Tab = 'now' | 'drives' | 'emotion' | 'timeline' | 'cabin' | 'personality';

const TABS: { key: Tab; label: string }[] = [
  { key: 'now', label: '此刻' },
  { key: 'drives', label: '驱力' },
  { key: 'emotion', label: '情绪' },
  { key: 'timeline', label: '时间线' },
  { key: 'cabin', label: '小屋' },
  { key: 'personality', label: '内核' },
];

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

function Bar({ label, value, tone = 'bg-[#c9a96a]' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[3.4rem] shrink-0 whitespace-nowrap text-[10px] text-[#9aa4bb]">{label}</span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${value}%` }} />
      </div>
      <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-[#c9a96a]">{value}</span>
    </div>
  );
}

export function XinchaoPanel({ fallback }: { fallback: ReactNode }) {
  const [status, setStatus] = useState<XinchaoStatus | null>(null);
  const [now, setNow] = useState<XinchaoNow | null>(null);
  const [state, setState] = useState<XinchaoState | null>(null);
  const [snap, setSnap] = useState<XinchaoSnapshot | null>(null);
  const [timeline, setTimeline] = useState<XinchaoTimeline | null>(null);
  const [cabin, setCabin] = useState<XinchaoCabin | null>(null);
  const [persona, setPersona] = useState<XinchaoPersonality | null>(null);
  const [tab, setTab] = useState<Tab>('now');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const s = await getXinchaoStatus();
      setStatus(s);
      if (!s.up) {
        setNow(null);
        setState(null);
        setSnap(null);
        setTimeline(null);
        setCabin(null);
        setPersona(null);
        return;
      }
      const [n, st, sn, tl, cb, ps] = await Promise.allSettled([
        getXinchaoNow(),
        getXinchaoState(),
        getXinchaoDashboard<XinchaoSnapshot>('snapshot'),
        getXinchaoDashboard<XinchaoTimeline>('timeline', 'limit=30'),
        getXinchaoDashboard<XinchaoCabin>('cabin'),
        getXinchaoDashboard<XinchaoPersonality>('personality'),
      ]);
      setNow(n.status === 'fulfilled' ? n.value : null);
      setState(st.status === 'fulfilled' ? st.value : null);
      setSnap(sn.status === 'fulfilled' ? sn.value : null);
      setTimeline(tl.status === 'fulfilled' ? tl.value : null);
      setCabin(cb.status === 'fulfilled' ? cb.value : null);
      setPersona(ps.status === 'fulfilled' ? ps.value : null);
    } catch (e) {
      setErr((e as Error).message || '读取心潮失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
            onClick={() => void load()}
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
  const snapDrives = snap?.drives ?? [];
  const nowText = (now?.text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('【'))
    .join('\n');
  const topDrives =
    snap?.topDrives?.map((d) => ({ key: d.key, label: d.label, value: d.value })) ??
    drives.slice(0, 3).map((d) => ({ key: d.key, label: d.label, value: d.value }));
  const journal = snap?.emotion?.journal ?? [];
  const timelineItems = timeline?.items ?? [];
  const cabinNotes = cabin?.notes ?? [];
  const cabinLedger = cabin?.ledger ?? [];

  return (
    <section
      data-testid="xinchao-panel"
      className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4"
    >
      {/* 卡头 */}
      <div data-testid="xinchao-head" className="flex flex-nowrap items-center gap-1.5">
        <Heart size={13} className="shrink-0 text-rose-300" />
        <h2 className="shrink-0 whitespace-nowrap text-[12px] font-medium text-[#e8ecf6]">心潮</h2>
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
          onClick={() => void load()}
          aria-label="刷新心潮"
          data-testid="xinchao-refresh"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#6b7488] transition hover:bg-white/[0.06] hover:text-[#e8ecf6]"
        >
          <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
        </button>
      </div>

      {/* 页签 */}
      <div data-testid="xinchao-tabs" className="scrollbar-thin mt-3 flex gap-1 overflow-x-auto pb-0.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            data-testid={`xinchao-tab-${t.key}`}
            aria-pressed={tab === t.key}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] transition',
              tab === t.key
                ? 'bg-[#c9a96a] text-[#1a120b]'
                : 'bg-white/[0.04] text-[#9aa4bb] hover:bg-white/[0.08]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div data-testid={`xinchao-page-${tab}`} className="mt-2.5">
        {tab === 'now' && (
          <div className="space-y-2.5">
            <p
              data-testid="xinchao-now"
              className="whitespace-pre-wrap rounded-xl bg-white/[0.04] px-3 py-2 text-[12px] leading-5 text-[#9aa4bb]"
            >
              {nowText || '心潮暂时没有话说。'}
            </p>
            <div className="flex flex-wrap gap-1.5 text-[10px] text-[#6b7488]">
              <span className="rounded-full bg-white/[0.05] px-2 py-0.5">
                意识 {snap?.runtime?.consciousness ?? state?.consciousness ?? '—'}
              </span>
              <span className="rounded-full bg-white/[0.05] px-2 py-0.5">
                疲劳 {pct(snap?.runtime?.fatigue)}%
              </span>
              <span className="rounded-full bg-white/[0.05] px-2 py-0.5">
                静了 {snap?.runtime?.idleMinutes ?? 0} 分钟
              </span>
            </div>
            <div className="space-y-1.5">
              {topDrives.slice(0, 3).map((d) => (
                <Bar key={d.key} label={DRIVE_SHORT[d.key] ?? d.label} value={pct(d.value)} />
              ))}
            </div>
          </div>
        )}

        {tab === 'drives' && (
          <div data-testid="xinchao-drives" className="space-y-1.5">
            {(snapDrives.length
              ? snapDrives.map((d) => ({
                  key: d.key,
                  label: d.short ?? DRIVE_SHORT[d.key] ?? d.label,
                  value: d.value,
                }))
              : drives.map((d) => ({ key: d.key, label: d.label, value: d.value }))
            ).map((d) => (
              <div key={d.key} data-testid={`xinchao-drive-${d.key}`} data-value={pct(d.value)}>
                <Bar label={d.label} value={pct(d.value)} />
              </div>
            ))}
          </div>
        )}

        {tab === 'emotion' && (
          <div data-testid="xinchao-emotion" className="space-y-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#e8d3a5]">{emotion?.label ?? '—'}</span>
              <span className="text-[10px] text-[#6b7488]">
                效价 {pct(emotion?.valence)} · 唤醒 {pct(emotion?.arousal)}
              </span>
            </div>
            <Bar label="效价" value={pct(emotion?.valence)} tone="bg-rose-400" />
            <Bar label="唤醒" value={pct(emotion?.arousal)} tone="bg-amber-400" />
            <p className="text-[10px] text-[#6b7488]">最近 {journal.length} 次情绪记录</p>
            {journal.length === 0 ? (
              <p className="text-[11px] text-[#6b7488]">还没有情绪记录。</p>
            ) : (
              <ul className="space-y-1">
                {journal
                  .slice(-6)
                  .reverse()
                  .map((j, i) => (
                    <li key={`${j.at}-${i}`} className="flex items-center gap-2 text-[10px] text-[#9aa4bb]">
                      <span className="w-8 shrink-0 tabular-nums text-[#6b7488]">{fmtTime(j.at)}</span>
                      <span className="shrink-0 text-[#e8d3a5]">{j.label}</span>
                      <span className="min-w-0 truncate text-[#6b7488]">
                        {j.cause || (j.top ? DRIVE_SHORT[j.top] ?? j.top : '')}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'timeline' && (
          <div data-testid="xinchao-timeline">
            {timelineItems.length === 0 ? (
              <p className="text-[11px] text-[#6b7488]">还没有结算记录。</p>
            ) : (
              <ul className="space-y-1.5">
                {timelineItems.slice(0, 20).map((it) => {
                  const deltas = Object.entries(it.delta?.driveDeltas ?? {})
                    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                    .slice(0, 3);
                  return (
                    <li key={it.id} className="rounded-lg bg-white/[0.035] px-2.5 py-1.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-[#9aa4bb]">{EVENT_LABEL[it.type] ?? it.type}</span>
                        <span className="tabular-nums text-[#6b7488]">{fmtTime(it.at)}</span>
                      </div>
                      {deltas.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px]">
                          {deltas.map(([k, v]) => (
                            <span key={k} className={v >= 0 ? 'text-amber-300' : 'text-sky-300'}>
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
          </div>
        )}

        {tab === 'cabin' && (
          <div data-testid="xinchao-cabin" className="space-y-2.5">
            {cabinNotes.length === 0 ? (
              <p className="text-[11px] text-[#6b7488]">小屋还没有信。</p>
            ) : (
              <ul className="space-y-1.5">
                {cabinNotes.slice(0, 8).map((n) => (
                  <li key={n.id} className="rounded-lg bg-white/[0.035] px-2.5 py-1.5">
                    <div className="flex items-center justify-between text-[10px] text-[#6b7488]">
                      <span>{n.from ?? '—'}</span>
                      <span className="tabular-nums">{fmtTime(n.at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[11px] leading-4 text-[#dbe2f0]">
                      {n.locked ? '（这封信上锁了）' : n.content || '（空）'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="rounded-lg bg-white/[0.035] px-2.5 py-1.5">
              <p className="text-[10px] text-[#6b7488]">小账本</p>
              {cabinLedger.length === 0 ? (
                <p className="mt-1 text-[11px] text-[#6b7488]">账本还是空的。</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {cabinLedger.slice(0, 6).map((l) => (
                    <li key={l.id} className="flex justify-between text-[10px] text-[#9aa4bb]">
                      <span className="truncate">{l.note || '—'}</span>
                      <span className="tabular-nums">{l.amount ?? 0}</span>
                    </li>
                  ))}
                </ul>
              )}
              {cabin?.totals && (
                <p className="mt-1.5 text-[10px] text-[#6b7488]">
                  支出 {cabin.totals.expense ?? 0} · 收入 {cabin.totals.income ?? 0} · 结余{' '}
                  {cabin.totals.net ?? 0}
                </p>
              )}
            </div>
          </div>
        )}

        {tab === 'personality' && (
          <div data-testid="xinchao-personality" className="space-y-2.5">
            {persona?.available === false ? (
              <p className="text-[11px] leading-5 text-[#6b7488]">
                这个月还没做回顾。心潮会在月度回顾时生成内核（18 维 + 锚点），
                平时先看「此刻 / 驱力 / 情绪」就好。
              </p>
            ) : (
              <>
                {persona?.month && (
                  <p className="text-[10px] text-[#6b7488]">{persona.month} 的内核</p>
                )}
                {(persona?.dimensions ?? []).map((d, i) => (
                  <Bar
                    key={`${d.key ?? i}`}
                    label={d.label ?? d.key ?? `维度 ${i + 1}`}
                    value={pct(d.value)}
                  />
                ))}
                {(persona?.anchors ?? []).length > 0 && (
                  <ul className="space-y-1">
                    {(persona?.anchors ?? []).slice(0, 6).map((a, i) => (
                      <li key={i} className="rounded-lg bg-white/[0.035] px-2.5 py-1.5 text-[10px] leading-4 text-[#9aa4bb]">
                        {typeof a === 'string' ? a : JSON.stringify(a).slice(0, 80)}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-white/[0.07] pt-2 text-[10px] text-[#6b7488]">
        <span>
          心潮念 · {drives.length} 股驱力
          {snap?.thoughts
            ? ` · 念头 ${(snap.thoughts.flashCount ?? 0) + (snap.thoughts.obsessionCount ?? 0)}`
            : ''}
        </span>
        <span>
          {status.version ? `v${status.version}` : ''}
          {status.mode ? ` · ${status.mode}` : ''}
        </span>
      </div>
      {err && <p className="mt-1 text-[10px] text-rose-400/70">{err}</p>}
    </section>
  );
}
