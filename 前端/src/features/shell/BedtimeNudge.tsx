import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Moon, X } from 'lucide-react';
import { useLocalSwitch } from '@/lib/useLocalSwitch';

/** 本地日期（不能用 toISOString —— 那是 UTC，+8 时区晚上 22:00 会算成前一天） */
function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 22:00 – 02:59 算「该睡了」 */
function isBedtime(d = new Date()): boolean {
  const h = d.getHours();
  return h >= 22 || h < 3;
}

const LAST_KEY = 'blueberry.bedReminder.last';

/**
 * 睡前提醒（设置页「提醒与健康 → 睡前提醒」）。
 *
 * 这个开关 2026-10-18 之前是纯摆设：只写 localStorage，没有任何地方读。
 * 现在接上了 —— 开着的时候，22:00–02:59 在应用里弹一张小卡，点「去晚安页」
 * 直达 `/goodnight`（白噪音 + 哄睡音频），关掉后**当天不再出现**。
 *
 * 刻意做得克制：每天最多一次、只在夜间、纯应用内（不发系统通知、不申请权限）。
 */
export function BedtimeNudge() {
  const [enabled] = useLocalSwitch('blueberry.bedReminder', false);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const check = () => {
      if (!enabled) return setOpen(false);
      // 已经在晚安页 / 小手机里就别打扰了
      if (location.pathname.startsWith('/goodnight') || location.pathname.startsWith('/tavern')) {
        return setOpen(false);
      }
      let last = '';
      try {
        last = localStorage.getItem(LAST_KEY) ?? '';
      } catch {
        /* ignore */
      }
      setOpen(isBedtime() && last !== localDate());
    };

    check();
    const t = window.setInterval(check, 30_000);
    return () => window.clearInterval(t);
  }, [enabled, location.pathname]);

  const dismiss = () => {
    try {
      localStorage.setItem(LAST_KEY, localDate());
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      data-testid="bedtime-nudge"
      role="status"
      className="fixed bottom-24 left-1/2 z-[1400] w-[min(360px,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-border bg-card p-3 shadow-lg"
    >
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-500">
          <Moon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-foreground">该睡了</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            夜深了，要不要听点白噪音，把今晚交给我？
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                dismiss();
                navigate('/goodnight');
              }}
              className="rounded-full bg-foreground px-3 py-1 text-[12px] font-medium text-background transition active:scale-95"
            >
              去晚安页
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-full px-2.5 py-1 text-[12px] text-muted-foreground transition hover:bg-muted"
            >
              今天不提醒了
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="关闭提醒"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
