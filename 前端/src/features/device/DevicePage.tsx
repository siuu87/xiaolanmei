import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BatteryCharging,
  CalendarHeart,
  Check,
  CloudSun,
  Footprints,
  Loader2,
  Plug,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Unplug,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  deleteDeviceLink,
  getDeviceLink,
  getDeviceSnapshot,
  probeDeviceLink,
  saveDeviceLink,
  type DeviceLinkDTO,
  type DeviceSnapshotDTO,
  type ProbeResultDTO,
} from '@/lib/api/device';

/**
 * 手机感知：把 LoverConnect（手机端 Android MCP）读到的设备事实接进来。
 *
 * 三条要守住的：
 *   1. **令牌只在后端**。这里只拿 `urlMasked`，页面不存明文，也不拼地址。
 *   2. **没连通是常态**，不是错误。LC 只监听手机回环，PC 要靠 USB `adb reverse`
 *      才通；手机没插着就必然连不上，界面得如实说「没连上」而不是报错弹窗。
 *   3. **不推断人的状态**。LC 的边界是「只给设备事实」，这里也照抄：
 *      `unknown` 里那几条（姿势、睡没睡着、操作者是谁）原样展示，不替它猜。
 */

const inputCls =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';

const PART_LABEL: Record<string, string> = {
  battery: '电量',
  steps: '步数',
  anniversary: '纪念日',
  context: '设备情境',
  weather: '天气',
  screenTime: '屏幕时间',
  events: '最近事件',
};

function StatCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Smartphone;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border p-3" data-testid="device-stat">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export function DevicePage() {
  const [link, setLink] = useState<DeviceLinkDTO | null>(null);
  const [snap, setSnap] = useState<DeviceSnapshotDTO | null>(null);
  const [url, setUrl] = useState('');
  const [probe, setProbe] = useState<ProbeResultDTO | null>(null);
  const [busy, setBusy] = useState<'probe' | 'save' | 'snapshot' | 'unlink' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [canForce, setCanForce] = useState(false);
  /** 刚进页面时做一次，之后只在手动刷新 / 定时器里做 */
  const mounted = useRef(false);

  const loadSnapshot = useCallback(async (refresh = false) => {
    try {
      const r = await getDeviceSnapshot({ full: true, refresh });
      setSnap(r.snapshot);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  const load = useCallback(
    async (refresh = false) => {
      try {
        const l = await getDeviceLink();
        setLink(l);
        await loadSnapshot(refresh);
      } catch (e) {
        setErr((e as Error).message);
      }
    },
    [loadSnapshot],
  );

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    void load(true);
  }, [load]);

  // 接了且没暂停时才定时刷：手机那边本来就有 45 秒缓存，这里 60 秒够用
  useEffect(() => {
    if (!link?.configured || !link.enabled) return;
    const timer = setInterval(() => void loadSnapshot(false), 60000);
    return () => clearInterval(timer);
  }, [link?.configured, link?.enabled, loadSnapshot]);

  const doProbe = async () => {
    setBusy('probe');
    setErr(null);
    setCanForce(false);
    try {
      const r = await probeDeviceLink(url.trim());
      setProbe(r.probe);
    } catch (e) {
      setErr((e as Error).message);
      setProbe(null);
    } finally {
      setBusy(null);
    }
  };

  const doSave = async (force = false) => {
    setBusy('save');
    setErr(null);
    try {
      const r = await saveDeviceLink({ url: url.trim(), force });
      setLink(r.link);
      setProbe(r.probe);
      setCanForce(false);
      setUrl('');
      await loadSnapshot(true);
    } catch (e) {
      setErr((e as Error).message);
      // 探测失败时后端不落库；给一个「仍然保存」的出口（手机现在不在手边的情况）
      setCanForce(true);
    } finally {
      setBusy(null);
    }
  };

  const doToggle = async (enabled: boolean) => {
    setErr(null);
    try {
      const r = await saveDeviceLink({ enabled });
      setLink(r.link);
      await loadSnapshot(true);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const doUnlink = async () => {
    if (!confirm('解绑手机感知？已保存的令牌会一并清掉，需要重新从 App 首页复制地址。')) return;
    setBusy('unlink');
    setErr(null);
    try {
      const r = await deleteDeviceLink();
      setLink(r);
      setProbe(null);
      await loadSnapshot(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const configured = !!link?.configured;
  const reached = !!snap?.reached;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Smartphone className="h-5 w-5" /> 手机感知
        </h1>
        <p className="mt-1 text-muted-foreground">
          接入 LoverConnect，让白起知道你手机的电量、步数、天气和纪念日。
          只读、只走本机回环，令牌不会离开这台电脑。
        </p>
      </div>

      {err && (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          data-testid="device-error"
        >
          {err}
        </div>
      )}

      {/* ── 接入 ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-4 w-4" /> 接入
          </CardTitle>
          <CardDescription>
            {configured ? '已接入。地址里的令牌只存在后端，这里只显示脱敏结果。' : '把 App 首页那条私密地址完整粘贴进来。'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {configured ? (
            <>
              <div className="rounded-lg bg-muted/40 px-3 py-2">
                <div className="text-xs text-muted-foreground">当前地址</div>
                <div className="mt-0.5 break-all font-mono text-xs" data-testid="device-url-masked">
                  {link?.urlMasked}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('text-xs font-medium', link?.enabled ? 'text-emerald-500' : 'text-muted-foreground')}>
                  {link?.enabled ? '已启用' : '已暂停'}
                </span>
                <div className="flex-1" />
                <Button size="sm" variant="outline" onClick={() => void doToggle(!link?.enabled)}>
                  {link?.enabled ? '暂停' : '启用'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => void doProbe()} disabled={busy === 'probe'}>
                  {busy === 'probe' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  重新测试
                </Button>
                <Button size="sm" variant="outline" onClick={() => void doUnlink()} disabled={busy === 'unlink'}>
                  <Unplug className="h-3.5 w-3.5" /> 解绑
                </Button>
              </div>
            </>
          ) : (
            <>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://127.0.0.1:5000/mcp/<令牌>"
                className={cn(inputCls, 'font-mono text-xs')}
                data-testid="device-url-input"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => void doProbe()} disabled={busy === 'probe' || !url.trim()}>
                  {busy === 'probe' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  测试连接
                </Button>
                <Button size="sm" onClick={() => void doSave(false)} disabled={busy === 'save' || !url.trim()}>
                  {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  保存
                </Button>
                {canForce && (
                  <Button size="sm" variant="outline" onClick={() => void doSave(true)} disabled={busy === 'save'}>
                    仍然保存
                  </Button>
                )}
              </div>
            </>
          )}

          {probe && (
            <div
              className={cn(
                'rounded-lg border px-3 py-2 text-xs',
                probe.ok ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10',
              )}
              data-testid="device-probe"
            >
              {probe.ok ? (
                <>
                  <div className="font-medium text-emerald-600 dark:text-emerald-400">
                    连通：{probe.serverName ?? '未知服务'} {probe.serverVersion ? `v${probe.serverVersion}` : ''}
                    {probe.isLoverConnect ? '（已识别为 LoverConnect）' : '（工具列表不像 LoverConnect）'}
                  </div>
                  <div className="mt-1 text-muted-foreground">共 {probe.toolCount} 个工具</div>
                  {probe.missing.length > 0 && (
                    <div className="mt-1 text-amber-600 dark:text-amber-400">
                      缺少：{probe.missing.join('、')}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-amber-600 dark:text-amber-400">{probe.error ?? '连不上'}</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 现在 ── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>现在</CardTitle>
              <CardDescription>
                {reached ? `读取于 ${new Date(snap?.fetchedAt ?? 0).toLocaleTimeString('zh-CN')}` : '还没有数据'}
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setBusy('snapshot');
                void loadSnapshot(true).finally(() => setBusy(null));
              }}
              disabled={busy === 'snapshot' || !configured}
            >
              {busy === 'snapshot' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!configured && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              先在上面粘贴地址完成接入。
            </div>
          )}

          {configured && !reached && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm" data-testid="device-offline">
              <div className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                <ShieldAlert className="h-4 w-4" /> 手机没连上
              </div>
              <div className="mt-1 text-muted-foreground">{snap?.hint ?? '没有拿到任何一项数据'}</div>
            </div>
          )}

          {reached && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <StatCard icon={BatteryCharging} title="电量">
                  <div className="text-lg font-medium">
                    {snap?.battery?.percent != null ? `${snap.battery.percent}%` : '—'}
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        (snap?.battery?.percent ?? 0) <= 20 ? 'bg-destructive' : 'bg-emerald-500',
                      )}
                      style={{ width: `${snap?.battery?.percent ?? 0}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {snap?.battery?.charging ? '充电中' : '未充电'}
                    {snap?.battery?.temperature != null ? ` · ${snap.battery.temperature}°C` : ''}
                  </div>
                </StatCard>

                <StatCard icon={Footprints} title="今日步数">
                  <div className="text-lg font-medium">
                    {snap?.steps != null ? snap.steps.toLocaleString('zh-CN') : '—'}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">步</div>
                </StatCard>

                <StatCard icon={CloudSun} title="天气">
                  {snap?.weather ? (
                    <>
                      <div className="text-lg font-medium">
                        {snap.weather.desc || '—'} {snap.weather.temp != null ? `${snap.weather.temp}°C` : ''}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {snap.weather.city}
                        {snap.weather.min != null && snap.weather.max != null
                          ? ` · ${snap.weather.min}~${snap.weather.max}°C`
                          : ''}
                        {snap.weather.humidity != null ? ` · 湿度 ${snap.weather.humidity}%` : ''}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">未设置城市</div>
                  )}
                </StatCard>
              </div>

              {snap && snap.anniversaries.length > 0 && (
                <div className="rounded-xl border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarHeart className="h-3.5 w-3.5" /> 纪念日
                  </div>
                  <div className="mt-2 space-y-1">
                    {snap.anniversaries.map((a) => (
                      <div key={`${a.name}-${a.kind}`} className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{a.name}</span>
                        <div className="flex-1 border-b border-dashed" />
                        <span className="text-muted-foreground">
                          {a.kind === 'countup' ? `第 ${a.days} 天` : `还有 ${a.days} 天`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {snap?.context && (
                <div className="rounded-xl border p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    设备情境
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5',
                        snap.context.enabled ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted',
                      )}
                    >
                      {snap.context.enabled ? '已开启' : snap.context.status ?? '未开启'}
                    </span>
                  </div>

                  {snap.context.observations.length > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                      {snap.context.observations.map((row) => (
                        <div key={row.key} className="flex items-baseline gap-2 text-xs">
                          <span className="shrink-0 text-muted-foreground">{row.label}</span>
                          <span className="truncate">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {snap.context.unknown.length > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      不推断：{snap.context.unknown.join('、')}
                    </div>
                  )}
                </div>
              )}

              {snap && snap.events.length > 0 && (
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-muted-foreground">最近变化</div>
                  <div className="mt-1.5 space-y-0.5">
                    {snap.events.map((e) => (
                      <div key={`${e.key}-${e.value}`} className="text-xs">
                        <span className="font-medium">{e.label}</span>
                        <span className="ml-2 text-muted-foreground">{e.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {snap && snap.errors.length > 0 && (
            <div className="rounded-lg bg-muted/40 px-3 py-2" data-testid="device-part-errors">
              <div className="text-xs text-muted-foreground">部分项没取到</div>
              <div className="mt-1 space-y-0.5">
                {snap.errors.map((e) => (
                  <div key={e.part} className="text-xs">
                    <span className="font-medium">{PART_LABEL[e.part] ?? e.part}</span>
                    <span className="ml-2 text-muted-foreground">{e.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 为什么连不上 ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> 为什么通常需要 USB
          </CardTitle>
          <CardDescription>这不是配置错了，是 LoverConnect 的设计如此。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            LC 的 MCP 只监听<strong className="text-foreground">手机本机回环</strong>，
            并且会拒绝带浏览器 Origin 的请求 —— 这样同一 Wi-Fi 上的设备和网页都读不到你的手机状态。
            所以从这台电脑直接连是连不上的，需要在 USB 上开一条转发：
          </p>
          <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-xs text-foreground">
            adb reverse tcp:5000 tcp:5000
          </pre>
          <p>
            执行后，电脑上的 <code className="font-mono">127.0.0.1:5000</code> 就等于手机的
            <code className="font-mono"> 127.0.0.1:5000</code>，把 App 首页那条地址原样粘进来即可。
            拔掉 USB 就会断，重新插上要再执行一次。
          </p>
          <p>
            LC 只提供「设备事实」，不判断姿势、睡眠和情绪；这里也照旧展示它列出的「不推断」项，不做补全。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
