import { useEffect, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AvatarContent } from '@/components/AvatarContent';

/**
 * 语音通话界面（占位）。
 *
 * 视觉照参考图那屏来：磨砂底 + 「● INCOMING CALL」字距拉开的小标 + 带光晕的大圆头像
 * + 衬线大名字 + 「邀请你语音通话…」+ 一红一绿两颗圆钮（拒绝 / 接听）。
 *
 * 仍然只是**占位**：2 秒后自动「接通」并开始计时，不涉及任何 WebRTC / 麦克风权限。
 */
export function CallOverlay({
  name,
  avatar,
  onClose,
}: {
  name: string;
  avatar?: string;
  onClose: () => void;
}) {
  const [connected, setConnected] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);

  // 占位：模拟呼出后自动接通
  useEffect(() => {
    const t = window.setTimeout(() => setConnected(true), 2000);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!connected) return;
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [connected]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div
      data-testid="call-overlay"
      data-state={connected ? 'connected' : 'calling'}
      className="fixed inset-0 z-50 flex flex-col items-center bg-chat-bg/85 backdrop-blur-2xl"
    >
      {/* 「● INCOMING CALL」 */}
      <div className="mt-[max(4rem,env(safe-area-inset-top))] flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-foreground" aria-hidden />
        <span className="text-[11px] uppercase tracking-[0.28em] text-foreground/80">
          {connected ? 'Connected' : 'Incoming Call'}
        </span>
      </div>

      {/* 大头像 + 一圈光晕 */}
      <div className="relative mt-12 flex items-center justify-center">
        <span className="absolute h-56 w-56 rounded-full bg-chat-pill/70" aria-hidden />
        <span className="relative flex h-48 w-48 items-center justify-center overflow-hidden rounded-full bg-chat-pill shadow-xl">
          <AvatarContent value={avatar ?? ''} fallback="🐰" className="text-[76px]" />
        </span>
      </div>

      {/* 衬线大名字 + 状态 */}
      <div className="mt-8 flex flex-col items-center px-8">
        <h2 data-testid="call-name" className="font-serif text-[30px] font-semibold leading-tight text-foreground">
          {name}
        </h2>
        <p className="mt-2 text-sm text-chat-meta">
          {connected ? fmt(seconds) : '邀请你语音通话…'}
        </p>
      </div>

      {/* 未接通：拒绝 / 接听（参考图那两颗）；已接通：静音 / 挂断 / 扬声器 */}
      <div className="mb-[max(4rem,env(safe-area-inset-bottom))] mt-auto flex items-start gap-12">
        {connected ? (
          <>
            <RoundBtn
              label="静音"
              onClick={() => setMuted((v) => !v)}
              className={muted ? 'bg-foreground text-background' : 'bg-chat-pill text-chat-pill-fg shadow-md'}
            >
              {muted ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
            </RoundBtn>
            <RoundBtn label="挂断" onClick={onClose} className="bg-chat-call-out text-white shadow-lg">
              <PhoneOff className="h-7 w-7" />
            </RoundBtn>
            <RoundBtn label="扬声器" className="bg-chat-pill text-chat-pill-fg shadow-md">
              <Volume2 className="h-7 w-7" />
            </RoundBtn>
          </>
        ) : (
          <>
            <RoundBtn label="拒绝" onClick={onClose} className="bg-chat-call-out text-white shadow-lg" big>
              <PhoneOff className="h-8 w-8" />
            </RoundBtn>
            <RoundBtn
              label="接听"
              onClick={() => setConnected(true)}
              className="animate-pulse bg-chat-call-in text-white shadow-lg"
              big
            >
              <Phone className="h-8 w-8" />
            </RoundBtn>
          </>
        )}
      </div>
    </div>
  );
}

/** 圆形按钮 + 下方文字标签（参考图里标签在按钮下面，而不是 aria-label） */
function RoundBtn({
  label,
  onClick,
  className,
  big,
  children,
}: {
  label: string;
  onClick?: () => void;
  className?: string;
  big?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full transition active:scale-95',
          big ? 'h-[72px] w-[72px]' : 'h-14 w-14',
          className,
        )}
      >
        {children}
      </button>
      <span className="text-xs text-foreground/70">{label}</span>
    </div>
  );
}
