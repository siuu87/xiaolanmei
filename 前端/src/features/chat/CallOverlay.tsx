import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AvatarContent } from '@/components/AvatarContent';
import { fmtDuration, type CallKind } from '@/lib/api/calls';

/**
 * 通话浮层（统一入口：默认语音，进去后可点摄像头升级视频）。
 *
 * 视觉照参考图那屏来：磨砂底 + 「● INCOMING CALL」字距拉开的小标 + 带光晕的大圆头像
 * + 衬线大名字 + 一红一绿两颗圆钮（拒绝 / 接听）。
 *
 * **能力边界（重要，别当成已实现的实时通话）**：
 * - 没有 WebRTC，也没接模型音频 —— 本机还没有可用的模型 Key，
 *   所以「接通」是本地状态机：呼出后自动接通、本地计时，**双方没有真实音频通路**。
 * - **麦克风故意不采集**：没有音频通路时开麦只是白白占用设备并点亮系统指示灯，
 *   静音键做成 UI 状态就够了。
 * - **摄像头是真的**：`getUserMedia({video:true, audio:false})`，开了会弹系统权限，
 *   本地画面以画中画悬浮窗回显；关掉/卸载一律停轨。默认不开摄像头，可随时点「摄像头」升级。
 * - 挂断把时长交回 `onEnd`，由 ChatPage 落库 + 往聊天流推一张内联卡片。
 */

export interface CallResult {
  /** 接通过就是 answered；没接就挂断算 declined */
  state: 'answered' | 'declined';
  seconds: number;
}

export function CallOverlay({
  name,
  avatar,
  kind = 'voice',
  onEnd,
}: {
  name: string;
  avatar?: string;
  /** 兼容旧参数：kind='video' 会一进来就请求摄像头；当前统一入口按 voice 进入 */
  kind?: CallKind;
  onEnd: (result: CallResult) => void;
}) {
  const [connected, setConnected] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [camErr, setCamErr] = useState('');
  const [camBusy, setCamBusy] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** 结束只上报一次（挂断键 / Esc / 卸载可能重复触发） */
  const reportedRef = useRef(false);

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const startCam = useCallback(async () => {
    if (streamRef.current || camBusy) return;
    // 非安全上下文（http + 非 localhost）或老浏览器里没有 mediaDevices
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCamErr('当前环境不支持调用摄像头');
      return;
    }
    setCamBusy(true);
    setCamErr('');
    try {
      // audio:false —— 只取画面。没有音频通路时不开麦（见文件头说明）。
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      streamRef.current = s;
      setStream(s);
    } catch (e) {
      const err = e as DOMException;
      setCamErr(
        err?.name === 'NotAllowedError'
          ? '摄像头权限被拒绝，可在浏览器地址栏重新授权'
          : err?.name === 'NotFoundError'
            ? '没有找到摄像头设备'
            : '摄像头打开失败',
      );
    } finally {
      setCamBusy(false);
    }
  }, [camBusy]);

  // 兼容旧参数：kind='video' 时接通后自动请求摄像头
  useEffect(() => {
    if (kind === 'video' && connected) void startCam();
  }, [kind, connected, startCam]);

  // 卸载一律停轨，别让摄像头指示灯一直亮着
  useEffect(() => stopCam, [stopCam]);

  // 把流挂到 <video>（元素只在有流时才渲染，所以要等这一拍）
  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

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

  /** 结束通话：停摄像头 + 上报一次结果 */
  const finish = useCallback(
    (state: 'answered' | 'declined') => {
      if (reportedRef.current) return;
      reportedRef.current = true;
      stopCam();
      onEnd({ state, seconds: state === 'answered' ? seconds : 0 });
    },
    [onEnd, seconds, stopCam],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      finish(connected ? 'answered' : 'declined');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [connected, finish]);

  return (
    <div
      data-testid="call-overlay"
      data-state={connected ? 'connected' : 'calling'}
      data-kind={kind}
      data-camera={stream ? 'on' : 'off'}
      className="fixed inset-0 z-50 flex flex-col items-center bg-chat-bg/85 backdrop-blur-2xl"
    >
      {/* 「● INCOMING CALL」 */}
      <div className="mt-[max(4rem,env(safe-area-inset-top))] flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-foreground" aria-hidden />
        <span className="text-[11px] uppercase tracking-[0.28em] text-foreground/80">
          {connected ? 'In Call' : 'Incoming Call'}
        </span>
      </div>

      {/* 大头像 + 一圈光晕（没有远端视频，所以头像始终是主视觉） */}
      <div className="relative mt-12 flex items-center justify-center">
        <span className="absolute h-56 w-56 rounded-full bg-chat-pill/70" aria-hidden />
        <span className="relative flex h-48 w-48 items-center justify-center overflow-hidden rounded-full bg-chat-pill shadow-xl">
          <AvatarContent value={avatar ?? ''} fallback="🐰" className="text-[76px]" />
        </span>
      </div>

      {/* 衬线大名字 + 状态 / 计时 */}
      <div className="mt-8 flex flex-col items-center px-8">
        <h2
          data-testid="call-name"
          className="font-serif text-[30px] font-semibold leading-tight text-foreground"
        >
          {name}
        </h2>
        <p data-testid="call-status" className="mt-2 text-sm text-chat-meta">
          {connected ? fmtDuration(seconds) : '邀请你通话…'}
        </p>
        {camErr && (
          <p data-testid="call-cam-error" className="mt-2 max-w-[260px] text-center text-xs text-destructive">
            {camErr}
          </p>
        )}
      </div>

      {/* 本地画面：画中画悬浮窗（右下角），只在我方开摄像头时出现 */}
      {stream && (
        <div
          data-testid="call-pip"
          className="fixed bottom-40 right-4 z-10 h-44 w-32 overflow-hidden rounded-2xl border border-white/20 bg-black/60 shadow-2xl"
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            data-testid="call-pip-video"
            className="h-full w-full object-cover"
          />
          <span className="absolute left-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[9px] tracking-wide text-white/90">
            我
          </span>
        </div>
      )}

      {/* 未接通：拒绝 / 接听；已接通：静音 / 摄像头 / 挂断 / 扬声器 */}
      <div className="mb-[max(4rem,env(safe-area-inset-bottom))] mt-auto flex items-start gap-6 px-4">
        {connected ? (
          <>
            <RoundBtn
              label="静音"
              testid="call-mute"
              onClick={() => setMuted((v) => !v)}
              className={muted ? 'bg-foreground text-background' : 'bg-chat-pill text-chat-pill-fg shadow-md'}
            >
              {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </RoundBtn>

            {/* 摄像头开关：开了就出画中画；再点关掉并停轨 */}
            <RoundBtn
              label={stream ? '关摄像头' : '摄像头'}
              testid="call-camera-toggle"
              onClick={() => (stream ? stopCam() : void startCam())}
              className={stream ? 'bg-chat-call-in text-white shadow-md' : 'bg-chat-pill text-chat-pill-fg shadow-md'}
            >
              {stream ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
            </RoundBtn>

            <RoundBtn
              label="挂断"
              testid="call-hangup"
              onClick={() => finish('answered')}
              className="bg-chat-call-out text-white shadow-lg"
            >
              <PhoneOff className="h-6 w-6" />
            </RoundBtn>

            <RoundBtn label="扬声器" testid="call-speaker" className="bg-chat-pill text-chat-pill-fg shadow-md">
              <Volume2 className="h-6 w-6" />
            </RoundBtn>
          </>
        ) : (
          <>
            <RoundBtn
              label="拒绝"
              testid="call-decline"
              onClick={() => finish('declined')}
              className="bg-chat-call-out text-white shadow-lg"
              big
            >
              <PhoneOff className="h-8 w-8" />
            </RoundBtn>
            <RoundBtn
              label="接听"
              testid="call-accept"
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
  testid,
  onClick,
  className,
  big,
  children,
}: {
  label: string;
  testid?: string;
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
        data-testid={testid}
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
