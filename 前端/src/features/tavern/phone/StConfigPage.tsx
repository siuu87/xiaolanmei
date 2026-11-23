/**
 * 小手机 · 连接 SillyTavern 设置页（2026-11-22）
 *
 * 酒馆的数据源可以从界面切换：填 ST 地址/账号/密码，测试连通，保存后当场生效。
 * 凭据只存后端数据库，前端拿不到明文（GET 只回 hasPassword）。
 */
import { useEffect, useState } from 'react';
import { Loader2, PlugZap, Check, X, Server, KeyRound, Clock, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PhoneNavBar } from './PhoneShell';
import {
  getStConfig,
  saveStConfig,
  testStConfig,
  probeStStatus,
  invalidateStStatus,
  type StConnConfigDTO,
  type StConnTestResult,
} from '@/lib/api/tavern';

type TestState = StConnTestResult | null;

const inputCls =
  'w-full rounded-lg border border-phone-sep bg-phone-bg px-3 py-2 text-[13px] text-phone-ink outline-none placeholder:text-phone-muted focus:border-phone-blue';

/** 一行设置项：左侧图标 + 标签，右侧输入 */
function FieldRow({
  icon: Icon,
  label,
  hint,
  children,
}: {
  icon: typeof Server;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3">
      <div className="mb-1.5 flex items-center gap-2">
        <Icon className="h-4 w-4 text-phone-blue" />
        <span className="text-[14px] font-medium text-phone-ink">{label}</span>
        {hint && <span className="ml-auto text-[11px] text-phone-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function StConfigPage({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [timeoutMs, setTimeoutMs] = useState('5000');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<TestState>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [liveUp, setLiveUp] = useState(false);

  const flash = (text: string, ok: boolean) => {
    setToast({ text, ok });
    window.setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const cfg: StConnConfigDTO = await getStConfig();
        if (!alive) return;
        setUrl(cfg.url ?? '');
        setUser(cfg.user ?? '');
        setHasPassword(!!cfg.hasPassword);
        setTimeoutMs(String(cfg.timeoutMs || 5000));
        const up = await probeStStatus(true);
        if (alive) setLiveUp(up);
      } catch {
        // 读不到就留空，让用户自己填
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const onTest = async () => {
    if (!url.trim()) {
      flash('请先填写 ST 地址', false);
      return;
    }
    setTesting(true);
    setTest(null);
    try {
      const r = await testStConfig({
        url: url.trim(),
        user,
        password,
        timeoutMs: Number(timeoutMs) || 5000,
      });
      setTest(r);
    } catch (e) {
      setTest({ configured: true, up: false, url: url.trim(), version: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const onSave = async () => {
    if (!url.trim()) {
      flash('请先填写 ST 地址', false);
      return;
    }
    setSaving(true);
    try {
      const cfg = await saveStConfig({
        url: url.trim(),
        user,
        // 密码框为空 = 沿用已存密码；用户可填新值覆盖
        password,
        timeoutMs: Number(timeoutMs) || 5000,
      });
      setHasPassword(cfg.hasPassword);
      setPassword('');
      invalidateStStatus();
      const up = await probeStStatus(true);
      setLiveUp(up);
      flash('已保存，酒馆立即切换到 ST 数据源', true);
    } catch (e) {
      flash(`保存失败：${(e as Error).message}`, false);
    } finally {
      setSaving(false);
    }
  };

  const onClear = async () => {
    setSaving(true);
    try {
      await saveStConfig({ url: '', user: '', password: '__CLEAR__', timeoutMs: 5000 });
      // 后端 url 为空 → 回退到 .env（一般是空），等于断开 ST
      setUrl('');
      setUser('');
      setPassword('');
      setHasPassword(false);
      setTest(null);
      setLiveUp(false);
      invalidateStStatus();
      await probeStStatus(true);
      flash('已清空连接，酒馆回到本地数据', true);
    } catch (e) {
      flash(`清空失败：${(e as Error).message}`, false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-phone-bg">
      <PhoneNavBar title="连接 SillyTavern" onBack={onBack} />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8">
        {/* 当前状态横幅 */}
        <div className="px-4 pt-2">
          <div
            className={cn(
              'flex items-center gap-3 rounded-xl px-4 py-3',
              liveUp ? 'bg-phone-blue/10' : 'bg-phone-surface',
            )}
          >
            <span
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                liveUp ? 'bg-phone-blue text-primary-foreground' : 'bg-phone-grouped text-phone-muted',
              )}
            >
              <PlugZap className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-phone-ink">
                {loading ? '正在检查连接…' : liveUp ? 'ST 已连接' : 'ST 未连接'}
              </p>
              <p className="truncate text-[11px] text-phone-muted">
                {url || '填下方地址连接 SillyTavern，酒馆将用它作数据源'}
              </p>
            </div>
            <span
              className={cn(
                'h-2.5 w-2.5 shrink-0 rounded-full',
                liveUp ? 'bg-[#34C759]' : 'bg-phone-sep',
              )}
            />
          </div>
          <p className="mt-2 px-1 text-[11px] leading-relaxed text-phone-muted">
            连接后，酒馆的角色卡 / 世界书 / 聊天将存到 SillyTavern，对话由它代持的模型生成。凭据只存在本机后端，不会上传。
          </p>
        </div>

        {/* 表单 */}
        <div className="mt-3">
          <div className="overflow-hidden rounded-xl bg-phone-surface">
            <FieldRow icon={Server} label="服务地址" hint="http://localhost:8000">
              <input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setTest(null);
                }}
                placeholder="http://localhost:8000"
                className={inputCls}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </FieldRow>
            <div className="ml-4 h-[1px] bg-phone-sep" />
            <FieldRow icon={KeyRound} label="账号" hint="可选">
              <input
                value={user}
                onChange={(e) => {
                  setUser(e.target.value);
                  setTest(null);
                }}
                placeholder="ST 开启了 basic auth 才需要"
                className={inputCls}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </FieldRow>
            <div className="ml-4 h-[1px] bg-phone-sep" />
            <FieldRow
              icon={KeyRound}
              label="密码"
              hint={hasPassword ? '已保存，留空即不变' : undefined}
            >
              <input
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setTest(null);
                }}
                type="password"
                placeholder={hasPassword ? '留空表示沿用已保存的密码' : '可选'}
                className={inputCls}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </FieldRow>
            <div className="ml-4 h-[1px] bg-phone-sep" />
            <FieldRow icon={Clock} label="超时" hint="毫秒">
              <input
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(e.target.value)}
                type="number"
                min={500}
                className={inputCls}
              />
            </FieldRow>
          </div>
        </div>

        {/* 测试结果 */}
        {test && (
          <div className="mt-3 px-4">
            <div
              className={cn(
                'flex items-start gap-2 rounded-xl px-4 py-3 text-[13px]',
                test.up ? 'bg-phone-blue/10 text-phone-ink' : 'bg-[#FF3B30]/10 text-[#FF3B30]',
              )}
            >
              {test.up ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <X className="mt-0.5 h-4 w-4 shrink-0" />}
              <div className="min-w-0">
                <p className="font-medium">{test.up ? '连接成功' : '连接失败'}</p>
                {test.version && <p className="mt-0.5 break-all text-[11px] opacity-80">ST 版本：{test.version}</p>}
                {!test.up && (
                  <p className="mt-0.5 text-[11px] opacity-80">检查地址是否正确、ST 是否已启动、账号密码是否匹配。</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="mt-4 space-y-2 px-4">
          <button
            type="button"
            onClick={() => void onTest()}
            disabled={testing || saving || !url.trim()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-phone-surface text-[14px] font-medium text-phone-ink transition active:scale-[0.99] disabled:opacity-40"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            测试连接
          </button>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving || testing || !url.trim()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-phone-blue text-[14px] font-semibold text-primary-foreground transition active:scale-[0.99] disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            保存并启用
          </button>
          {(url || hasPassword) && (
            <button
              type="button"
              onClick={() => void onClear()}
              disabled={saving || testing}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[13px] text-phone-muted transition active:scale-[0.99] disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              清空连接，改回本地数据
            </button>
          )}
        </div>
      </div>

      {/* toast */}
      {toast && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
          <div
            className={cn(
              'rounded-full px-4 py-2 text-[13px] shadow-lg',
              toast.ok ? 'bg-phone-ink text-phone-bg' : 'bg-[#FF3B30] text-white',
            )}
          >
            {toast.text}
          </div>
        </div>
      )}
    </div>
  );
}
