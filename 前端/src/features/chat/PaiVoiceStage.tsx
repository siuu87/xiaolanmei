/**
 * PaiVoice 语音通话界面（React 原生版，2026-11-10）
 *
 * 把原来独立的 `public/paivoice/index.html` + `voice-call.js` 整个搬进 React：
 * 语音通话现在是「通话」浮层的真实一部分，不再是挂在网址外的独立页面 / iframe。
 *
 * 星空背景走 `createStarfield`（voiceStarfield.ts），通话协议走 `VoiceCall`（voiceCall.ts，
 * AGPL-3.0 上游代码的移植）。本文件只负责把这两者接到 React 的 state 与 DOM 上。
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Mic, MicOff, PhoneOff } from 'lucide-react';
import { VoiceCall } from '@/lib/voiceCall';
import { createStarfield } from '@/lib/voiceStarfield';

export interface PaiVoiceStageHandle {
  /** 挂断：释放麦克风/摄像头、通知核心、结算通话。供浮层「退出」键与 Esc 调用。 */
  hangup: () => void;
}

interface PaiVoiceStageProps {
  wsUrl: string;
  name: string;
  /** 通话结束（挂断 / 核心关闭）时回调，带本次通话秒数。 */
  onEnd: (seconds: number) => void;
  /** 状态变化：idle / live / closed，用于浮层标题栏的小灯。 */
  onStateChange?: (state: 'idle' | 'live' | 'closed') => void;
}

const LABEL: Record<string, string> = {
  idle: '准备好了，点绿色按钮打给我',
  listening: '嗯，我在听',
  thinking: '等等，让我想想…',
  speaking: '我在说',
  reconnecting: '信号有点远，我等你一下…',
  closed: '这通先挂啦',
};

const BARS = Array.from({ length: 28 }, (_, i) => {
  const k = Math.sin((i / 27) * Math.PI); // 中间高、两端低，像一束光
  return {
    animationDelay: `${(i % 7) * -0.13}s`,
    animationDuration: `${0.7 + (i % 4) * 0.16}s`,
    maxHeight: `${28 + k * 72}%`,
  };
});

export const PaiVoiceStage = forwardRef<PaiVoiceStageHandle, PaiVoiceStageProps>(
  function PaiVoiceStage({ wsUrl, name, onEnd, onStateChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const skyRef = useRef<ReturnType<typeof createStarfield> | null>(null);
    const callRef = useRef<VoiceCall | null>(null);
    const transcriptRef = useRef<HTMLDivElement>(null);
    const startedAtRef = useRef(0);
    const bubbleId = useRef(0);
    const prevModeRef = useRef('');
    const flashTimer = useRef(0);

    const [mode, setMode] = useState('idle');
    const [meActive, setMeActive] = useState(false);
    const [aiActive, setAiActive] = useState(false);
    const [bubbles, setBubbles] = useState<{ id: number; kind: 'me' | 'ai' | 'sys'; text: string }[]>([]);
    const [error, setError] = useState('');
    const [latency, setLatency] = useState('');
    const [flash, setFlash] = useState('');
    const [callStarted, setCallStarted] = useState(false);
    const [booting, setBooting] = useState(true);
    const [muted, setMuted] = useState(false);

    const elapsed = useCallback(() => (startedAtRef.current ? (Date.now() - startedAtRef.current) / 1000 : 0), []);

    const end = useCallback(() => {
      try {
        callRef.current?.hangup();
      } catch {
        /* ignore */
      }
      skyRef.current?.stop();
      onEnd(elapsed());
    }, [onEnd, elapsed]);

    const addBubble = useCallback((kind: 'me' | 'ai' | 'sys', text?: string) => {
      const t = String(text || '').trim();
      if (!t) return;
      setBubbles((b) => [...b, { id: ++bubbleId.current, kind, text: t }]);
    }, []);

    const flashState = useCallback((text: string) => {
      setFlash(text);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => {
        setFlash('');
        flashTimer.current = 0;
      }, 1200);
    }, []);

    const attemptStart = useCallback(async () => {
      setBooting(true);
      setError('');
      try {
        const call = new VoiceCall({
          url: wsUrl,
          video: false,
          on: {
            state: (m: string) => {
              setMode(m);
              setAiActive(m === 'speaking' || !!callRef.current?.playing);
              if (skyRef.current) {
                if (m === 'speaking') skyRef.current.voice('him', true);
                else if (prevModeRef.current === 'speaking') skyRef.current.voice('him', false);
              }
              prevModeRef.current = m;
              if (m !== 'closed') onStateChange?.(m === 'idle' ? 'idle' : 'live');
            },
            speech: (v: boolean) => {
              setMeActive(!!v);
              if (v) setLatency('');
              skyRef.current?.voice('me', !!v);
            },
            playing: (v: boolean) => setAiActive(!!v),
            latency: (ms: number) => setLatency(`这一轮 ${(ms / 1000).toFixed(1)}s 接上`),
            transcript: (msg: { text?: string }) => addBubble('me', msg?.text),
            reply: (msg: { text?: string }) => addBubble('ai', msg?.text),
            interrupted: () => {
              setAiActive(false);
              setMeActive(false);
              setLatency('');
            },
            error: (e?: string) => setError(String(e || '')),
            reconnecting: () => setMode('reconnecting'),
            resumed: () => setMode('listening'),
            closed: () => {
              setMode('closed');
              skyRef.current?.voice('him', false);
              end();
            },
          },
        });
        callRef.current = call;
        await call.start();
        startedAtRef.current = Date.now();
        setCallStarted(true);
        setBooting(false);
        addBubble('sys', '音频不落盘');
      } catch (e) {
        setCallStarted(false);
        setBooting(false);
        setError((e as Error)?.message || String(e));
      }
    }, [wsUrl, addBubble, end, onStateChange]);

    useEffect(() => {
      if (canvasRef.current) {
        skyRef.current = createStarfield(canvasRef.current);
        try {
          skyRef.current.start();
        } catch {
          /* 星空初始化失败不影响通话 */
        }
      }
      void attemptStart();
      return () => {
        skyRef.current?.stop();
        try {
          callRef.current?.hangup();
        } catch {
          /* ignore */
        }
        callRef.current = null;
        skyRef.current = null;
        window.clearTimeout(flashTimer.current);
      };
    }, [attemptStart]);

    useEffect(() => {
      const el = transcriptRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, [bubbles]);

    const onBeamsTap = useCallback(() => {
      const did = callRef.current?.barge();
      flashState(did ? '嗯，你说' : '嗯，我听着呢');
    }, [flashState]);

    const toggleMute = useCallback(() => {
      const next = !muted;
      setMuted(next);
      void callRef.current?.setMuted(next);
    }, [muted]);

    useImperativeHandle(
      ref,
      () => ({ hangup: end }),
      [end],
    );

    const beamBars = useMemo(
      () => BARS.map((s, i) => <span key={i} style={s as CSSProperties} />),
      [],
    );

    const stateText = flash || LABEL[mode] || mode || '';

    return (
      <div className="pv-root relative h-full w-full overflow-hidden">
        <canvas ref={canvasRef} className="pv-sky" aria-hidden />
        <style>{CSS}</style>
        <div className="pv-content relative z-10 flex h-full flex-col px-4 pb-5 pt-2">
          <div className="pv-stage flex flex-1 flex-col items-center justify-center gap-4">
            <div
              className={`pv-beams ${aiActive ? 'interruptible' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`${name}说话时点一下光线打断`}
              onClick={onBeamsTap}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onBeamsTap();
                }
              }}
            >
              <div className={`pv-beam me ${meActive ? 'active' : ''}`}>{beamBars}</div>
              <div className={`pv-beam ai ${aiActive ? 'active' : ''}`}>{beamBars}</div>
            </div>
            <div className="pv-state min-h-5 text-[13px] tracking-[0.06em]">{stateText}</div>
            <div ref={transcriptRef} className="pv-transcript flex w-full flex-col gap-2 overflow-y-auto">
              {bubbles.map((b) => (
                <div key={b.id} className={`pv-bubble ${b.kind}`}>
                  {b.text}
                </div>
              ))}
            </div>
          </div>

          <div className="pv-error min-h-4 text-center text-[11px] text-[#e07b7b]">{error}</div>

          {!callStarted ? (
            <div className="pv-start flex flex-col items-center gap-2 pt-3">
              {booting ? (
                <p className="pv-hint">正在接通…</p>
              ) : (
                <>
                  <button type="button" className="pv-primary" onClick={() => void attemptStart()}>
                    接通
                  </button>
                  <p className="pv-hint">像打电话一样说话就行，停一下它就接话 · 麦克风只在通话期间开启</p>
                </>
              )}
            </div>
          ) : (
            <div className="pv-controls flex items-center justify-center gap-3.5 pt-3">
              <button
                type="button"
                className={`pv-round ${muted ? 'on' : ''}`}
                onClick={toggleMute}
                aria-label={muted ? '取消静音' : '静音'}
                aria-pressed={muted}
              >
                {muted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              <button type="button" className="pv-round hangup" onClick={end} aria-label={`挂断与${name}的通话`}>
                <PhoneOff size={20} />
              </button>
            </div>
          )}

          <div className="pv-latency min-h-4 pt-2 text-center text-[10px] tracking-[0.03em]">{latency}</div>
        </div>
      </div>
    );
  },
);

const CSS = `
.pv-root { color-scheme: dark; color: #f5ece2;
  background: radial-gradient(120% 80% at 50% 0%, #2a1c13 0%, #140e0a 48%, #0a0705 100%); }
.pv-sky { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; }
.pv-content { color: #f5ece2; }
.pv-stage { min-height: 0; }
.pv-beams { display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; width: 100%; max-width: 300px; height: 132px; border-radius: 18px; transition: background .2s ease; }
.pv-beam { display: flex; align-items: center; justify-content: center; gap: 3px;
  width: 100%; height: 36px; padding: 0 10px; border-radius: 999px; opacity: .28; transition: opacity .25s ease, background .2s ease; }
.pv-beam.active { opacity: 1; }
.pv-beam span { display: block; width: 3px; height: 12%; min-height: 2px; border-radius: 999px;
  background: currentColor; animation: pv-wave 1s ease-in-out infinite alternate; animation-play-state: paused; }
.pv-beam.active span { animation-play-state: running; }
.pv-beam.me { color: #e88a70; }
.pv-beam.ai { color: #f5ece2; }
.pv-beams.interruptible { cursor: pointer; background: rgba(255,255,255,0.04); }
@keyframes pv-wave { from { height: 12%; } to { height: 100%; } }
.pv-state { color: #9b8d80; }
.pv-transcript { max-height: 36vh; scrollbar-width: thin; }
.pv-bubble { max-width: 86%; padding: 8px 11px; border-radius: 14px; font-size: 13px; line-height: 1.55;
  white-space: pre-wrap; word-break: break-word; border: 1px solid rgba(255,255,255,0.09); }
.pv-bubble.me { align-self: flex-end; background: rgba(226,181,127,0.14); border-color: rgba(226,181,127,0.22); }
.pv-bubble.ai { align-self: flex-start; background: rgba(255,255,255,0.045); }
.pv-bubble.sys { align-self: center; background: transparent; border: 0; color: #9b8d80; font-size: 11px; padding: 0; }
.pv-controls { padding-top: 14px; }
.pv-round { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center;
  border: 1px solid rgba(255,255,255,0.09); background: rgba(255,255,255,0.045); color: #f5ece2;
  transition: transform .15s ease, background .15s ease; }
.pv-round:active { transform: scale(0.94); }
.pv-round.on { background: rgba(226,181,127,0.16); border-color: rgba(226,181,127,0.4); color: #e2b57f; }
.pv-round.hangup { background: rgba(224,123,123,0.16); border-color: rgba(224,123,123,0.35); color: #e07b7b; }
.pv-primary { width: 100%; padding: 14px 18px; border-radius: 999px; font-size: 15px; font-weight: 600;
  color: #0d2117; background: linear-gradient(180deg, #9ad9ac, #5cb884); box-shadow: 0 12px 30px rgba(92,184,132,0.2); }
.pv-primary:active { transform: scale(0.99); }
.pv-hint { font-size: 11px; line-height: 1.6; color: #9b8d80; text-align: center; }
.pv-latency { color: #9b8d80; }
@media (max-height: 520px) {
  .pv-beams { height: 78px; gap: 6px; }
  .pv-beam { height: 26px; }
  .pv-transcript { max-height: 30vh; }
  .pv-round { width: 44px; height: 44px; }
  .pv-primary { padding: 11px 16px; font-size: 14px; }
}
`;

export default PaiVoiceStage;
