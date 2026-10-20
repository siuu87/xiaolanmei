/**
 * PaiVoice 通话浮层（2026-10-20）—— 替代原来的 CallOverlay（语音）。
 *
 * PaiVoice 是独立静态页（`public/paivoice/`，AGPL），这里只负责：
 * - iframe 挂载 + 麦克风/摄像头权限委托；
 * - 接收页面 postMessage 的 `paivoice:end`，把秒数交回 ChatPage 落库 + 推通话卡片；
 * - 右上角一个「结束」兜底（页面自己的挂断键挂了也能退出）。
 *
 * 视频通话仍走旧浮层：PaiVoice 的「视频」是把画面帧送给回复端看，
 * 不是双向视频流，语义和原来的视频通话不同。
 */
import { useCallback, useEffect, useRef } from 'react';

export function PaiVoiceOverlay({
  wsUrl,
  name,
  onEnd,
}: {
  wsUrl: string;
  name: string;
  onEnd: (seconds: number) => void;
}) {
  const started = useRef(Date.now());
  const reported = useRef(false);

  const finish = useCallback(
    (seconds?: number) => {
      if (reported.current) return;
      reported.current = true;
      onEnd(seconds ?? Math.round((Date.now() - started.current) / 1000));
    },
    [onEnd],
  );

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { type?: string } | null;
      if (data?.type === 'paivoice:end') finish();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [finish]);

  const src = `/paivoice/index.html?ws=${encodeURIComponent(wsUrl)}&name=${encodeURIComponent(name)}`;

  return (
    <div data-testid="paivoice-overlay" className="fixed inset-0 z-[1400] bg-[#0a0705]">
      <iframe
        title="PaiVoice"
        src={src}
        data-testid="paivoice-iframe"
        allow="microphone; camera; autoplay"
        className="h-full w-full border-0"
      />
      <button
        type="button"
        onClick={() => finish()}
        aria-label="结束通话"
        data-testid="paivoice-end"
        className="absolute right-3 top-3 z-10 rounded-full bg-black/45 px-2.5 py-1 text-[11px] text-white/70 transition hover:bg-black/65"
      >
        结束
      </button>
    </div>
  );
}
