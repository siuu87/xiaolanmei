/**
 * 手机系统通知 / 安装到主屏幕（2026-11-23）。
 *
 * 两种使用场景：
 *  - `inline`：设置页里的一块，常驻，随时开关。
 *  - `banner`：聊天页顶部的一次性引导条，用户开完或划掉就不再出现。
 *
 * 只做引导与订阅，真正的推送由后端 pushService 发，点亮屏也收得到。
 */
import { useEffect, useState } from 'react';
import { Bell, BellOff, Download, Smartphone, X } from 'lucide-react';
import { IOSSettingGroup } from '@/components/ios/IOSSettingGroup';
import { IOSSettingItem } from '@/components/ios/IOSSettingItem';
import {
  checkNotifyState,
  disableNotifications,
  dismissInstallTip,
  enableNotifications,
  getNotifyState,
  isInstallTipDismissed,
  isIos,
  isStandalone,
  type NotifyState,
} from '@/lib/notifications';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function NotificationSection() {
  const [state, setState] = useState<NotifyState>(getNotifyState);
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState('');

  useEffect(() => {
    void checkNotifyState().then(setState);
  }, []);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setTip('');
    const r = state.subscribed ? await disableNotifications() : await enableNotifications();
    setTip(r.message);
    setState(await checkNotifyState());
    setBusy(false);
  };

  return (
    <IOSSettingGroup title="手机通知">
      <IOSSettingItem
        icon={state.subscribed ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        iconBg={state.subscribed ? 'bg-emerald-400' : 'bg-slate-400'}
        title={state.subscribed ? '系统通知已开启' : '开启系统通知'}
        subtitle={
          state.supported
            ? state.standalone
              ? '来电、礼物、任务会弹在手机上'
              : '建议先「添加到主屏幕」再开启'
            : '当前浏览器不支持，请用手机 Chrome / Safari'
        }
        value={busy ? '处理中…' : undefined}
        showChevron={state.supported}
        onClick={state.supported ? toggle : undefined}
      />
      {!state.standalone && (
        <IOSSettingItem
          icon={<Download className="h-4 w-4" />}
          iconBg="bg-violet-400"
          title="装成手机软件"
          subtitle={isIos() ? 'Safari 分享 → 添加到主屏幕' : '浏览器菜单 → 添加到主屏幕 / 安装应用'}
          showChevron
          onClick={() => setTip(isIos() ? '点底部「分享」按钮 → 往下找「添加到主屏幕」→ 完成。' : '点浏览器右上角菜单 → 「添加到主屏幕」或「安装应用」。')}
        />
      )}
      {tip && <p className="px-4 py-2 text-[12px] leading-relaxed text-muted-foreground">{tip}</p>}
    </IOSSettingGroup>
  );
}

/** 聊天页顶部的一次性引导条：没装成软件 / 没开通知时才出现 */
export function NotifyInstallBanner() {
  const [show, setShow] = useState(false);
  const [state, setState] = useState<NotifyState>(getNotifyState);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [tip, setTip] = useState('');

  useEffect(() => {
    void checkNotifyState().then(setState);
    if (isInstallTipDismissed()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    // 没有安装事件（尤其 iOS）也要给一条文字引导
    const t = window.setTimeout(() => {
      if (!isStandalone()) setShow(true);
    }, 1500);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.clearTimeout(t);
    };
  }, []);

  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    } else {
      setTip(isIos() ? '点底部「分享」→「添加到主屏幕」' : '点浏览器菜单 →「添加到主屏幕」');
    }
    void checkNotifyState().then(setState);
  };

  const enable = async () => {
    const r = await enableNotifications();
    setTip(r.message);
    setState(await checkNotifyState());
  };

  const close = () => {
    setShow(false);
    dismissInstallTip();
  };

  if (!show) return null;

  return (
    <div className="mx-3 mt-2 rounded-2xl border border-primary/25 bg-card/95 px-3.5 py-3 shadow-lg backdrop-blur-sm">
      <div className="flex items-start gap-2.5">
        <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-foreground">装到手机，像软件一样用</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            添加到主屏幕全屏打开，再开通知，他发消息、来电、送礼物时会直接弹在手机上。
          </p>
          {tip && <p className="mt-1 text-[11px] text-primary">{tip}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {!state.standalone && (
              <button onClick={install} className="rounded-full bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground">
                添加到主屏幕
              </button>
            )}
            {state.supported && !state.subscribed && (
              <button onClick={enable} className="rounded-full border border-border px-3 py-1.5 text-[11px] font-medium text-foreground">
                开启通知
              </button>
            )}
          </div>
        </div>
        <button onClick={close} aria-label="关闭引导" className="rounded-full p-1 text-muted-foreground hover:bg-muted">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
