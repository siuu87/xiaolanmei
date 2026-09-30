import { useEffect, useState } from 'react';
import { Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 语音通话界面（占位）：呼出 → 2 秒后模拟接通 → 计时；实际通话后续接 WebRTC */
export function CallOverlay({ name, onClose }: { name: string; onClose: () => void }) {
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
    <div className="fixed inset-0 z-50 flex flex-col items-center bg-[#0b1220] text-white">
      <div className="mt-20 flex flex-col items-center">
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-primary/60 to-rose-400/60 text-5xl">
          🫐
        </div>
        <div className="mt-4 text-xl font-semibold">{name}</div>
        <div className="mt-1 text-sm text-white/60">{connected ? fmt(seconds) : '正在呼叫…'}</div>
      </div>

      <div className="mt-auto mb-20 flex items-center gap-6">
        <button
          type="button"
          onClick={() => setMuted((v) => !v)}
          aria-label="静音"
          className={cn(
            'flex h-14 w-14 items-center justify-center rounded-full transition',
            muted ? 'bg-white text-black' : 'bg-white/15 hover:bg-white/25',
          )}
        >
          {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="挂断"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 transition hover:bg-red-600"
        >
          <PhoneOff className="h-7 w-7" />
        </button>
        <button
          type="button"
          aria-label="扬声器"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"
        >
          <Volume2 className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
