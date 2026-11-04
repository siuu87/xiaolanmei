import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronUp,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Volume2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AvatarContent } from '@/components/AvatarContent';
import { fmtDuration, type CallKind } from '@/lib/api/calls';

/**
 * 通话整屏（对齐设计稿第 6 / 16 页）。
 *
 * 视觉：整屏纯深色（两种主题同一套 token，见 `--call-*`）。
 * - 顶栏：左「收起」药丸、右「端侧加密 · 不落地 / 视频 · 端侧加密」；
 * - 语音态：中间一束白色波形 + 名字 + 计时 + 对方最后一句话的引用气泡；
 * - 视频态（开了摄像头）：左上名字/计时/「他正在看着你」、右上对方白色圆形头像；
 * - 底部五颗圆钮：摄像头 / 屏幕 / 静音 / 免提 / 挂断（挂断是红钮）。
 * - 「收起」把整屏收成左上角一条深色药丸（计时继续走），点它展开。
 *
 * **能力边界（重要，别当成已实现的实时通话）**：
 * - 没有 WebRTC，也没接模型音频 —— 「接通」是本地状态机：呼出后自动接通、本地计时，
 *   **双方没有真实音频通路**。所以「静音 / 免提 / 屏幕」只是 UI 状态，不采集也不外放。
 * - **摄像头是真的**：`getUserMedia({video:true, audio:false})`，开了会弹系统权限，
 *   本地画面以画中画回显；关掉/卸载一律停轨。
 * - 挂断把时长交回 `onEnd`，由 ChatPage 落库 + 往聊天流推一张内联卡片。
 */

export interface CallResult {
  /** 接通过就是 answered；没接就挂断算 declined */
  state: 'answered' | 'declined';
  seconds: number;
}

/** 波形高度（px）：中间高、两侧收，照设计稿那束白条 */
const WAVE = [8, 14, 22, 32, 44, 34, 26, 40, 52, 42, 30, 22, 30, 20, 14, 10, 6];

export function CallOverlay({
  name,
  avatar,
  kind = 'voice',
  subtitle,
  onEnd,
}: {
  name: string;
  avatar?: string;
  /** 兼容旧参数：kind='video' 会一进来就请求摄像头；当前统一入口按 voice 进入 */
  kind?: CallKind;
  /** 对方最后一句话：语音态中间那颗引用气泡（没有就不渲染） */
  subtitle?: string;
  onEnd: (result: CallResult) => void;
}) {
  const [connected, setConnected] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
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

  const videoOn = !!stream;
  const encLabel = videoOn ? '视频 · 端侧加密' : '端侧加密 · 不落地';

  return (
    <div
      data-testid="call-overlay"
      data-state={connected ? 'connected' : 'calling'}
      data-kind={kind}
      data-camera={videoOn ? 'on' : 'off'}
      data-collapsed={collapsed ? '1' : '0'}
      className="fixed inset-0 z-[1400] flex flex-col bg-call-bg text-call-fg"
    >
      {/* 收起后只剩左上角一条药丸：计时继续走，点它展开 */}
      {collapsed ? (
        <button
          type="button"
          data-testid="call-expand"
          onClick={() => setCollapsed(false)}
          className="mt-[max(0.9rem,env(safe-area-inset-top))] ml-4 flex w-fit items-center gap-2 rounded-full bg-call-surface px-4 py-2.5 text-[12px] text-call-fg transition active:scale-95"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
          <span>通话中</span>
          <span className="tabular-nums text-call-meta">{fmtDuration(seconds)}</span>
          <ChevronUp size={14} className="text-call-meta" aria-hidden />
        </button>
      ) : (
        <>
          {/* 顶栏：左「收起」药丸，右「端侧加密」小字 */}
          <header className="flex shrink-0 items-center justify-between px-4 pt-[max(0.9rem,env(safe-area-inset-top))]">
            <button
              type="button"
              data-testid="call-collapse"
              onClick={() => setCollapsed(true)}
              className="flex h-9 items-center gap-1.5 rounded-full bg-call-surface px-3.5 text-[12px] text-call-fg transition active:scale-95"
            >
              <Minimize2 size={13} aria-hidden />
              收起
            </button>
            <span className="text-[11px] tracking-wide text-call-meta">{encLabel}</span>
          </header>

          {/* 中间：语音态 = 波形 / 视频态 = 名字 + 对方白色大圆头像 */}
          {connected ? (
            videoOn ? (
              <div className="flex flex-1 flex-col px-5 pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2
                      data-testid="call-name"
                      className="truncate text-[22px] font-semibold leading-tight text-call-fg"
                    >
                      {name}
                    </h2>
                    <p data-testid="call-status" className="mt-1.5 text-[12px] tabular-nums text-call-meta">
                      {fmtDuration(seconds)} · 他正在看着你
                    </p>
                  </div>
                  <span className="flex h-[92px] w-[92px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
                    <AvatarContent value={avatar ?? ''} fallback="🐰" className="text-[40px]" />
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-8">
                {/* 一束白色波形 */}
                <div className="flex items-center gap-[5px]" aria-hidden>
                  {WAVE.map((h, i) => (
                    <span
                      key={i}
                      className="call-wave-bar w-[3px] rounded-full bg-call-fg"
                      style={{ height: h, animationDelay: `${(i % 7) * 0.085}s` }}
                    />
                  ))}
                </div>
                <h2
                  data-testid="call-name"
                  className="mt-7 truncate text-[22px] font-semibold leading-tight text-call-fg"
                >
                  {name}
                </h2>
                <p data-testid="call-status" className="mt-2 text-[13px] tabular-nums text-call-meta">
                  {fmtDuration(seconds)}
                </p>
                {subtitle && (
                  <p className="mt-5 max-w-[280px] rounded-2xl bg-call-bubble px-4 py-2.5 text-center text-[13px] leading-5 text-call-fg">
                    「{subtitle}」
                  </p>
                )}
              </div>
            )
          ) : (
            /* 呼出中：深色底上仍然是「大头像 + 名字 + 两颗圆钮」 */
            <div className="flex flex-1 flex-col items-center justify-center px-8">
              <span className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-full bg-call-surface">
                <AvatarContent value={avatar ?? ''} fallback="🐰" className="text-[60px]" />
              </span>
              <h2
                data-testid="call-name"
                className="mt-7 truncate text-[22px] font-semibold leading-tight text-call-fg"
              >
                {name}
              </h2>
              <p data-testid="call-status" className="mt-2 text-[12px] text-call-meta">
                邀请你通话…
              </p>
            </div>
          )}

          {camErr && (
            <p
              data-testid="call-cam-error"
              className="mx-auto mt-2 max-w-[280px] shrink-0 text-center text-[11px] text-call-hang"
            >
              {camErr}
            </p>
          )}

          {/* 本地画面：右下角画中画，只在我方开摄像头时出现 */}
          {stream && (
            <div
              data-testid="call-pip"
              className="fixed bottom-40 right-4 z-10 h-40 w-28 overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/15"
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                data-testid="call-pip-video"
                className="h-full w-full object-cover"
              />
              <span className="absolute left-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[9px] text-white/90">
                我
              </span>
            </div>
          )}

          {/* 底部：五颗圆钮——挂断居中（2026-10-29）：媒体类在左、音频类在右 */}
          <div
            className={cn(
              'mb-[max(1.5rem,env(safe-area-inset-bottom))] mt-auto flex shrink-0 items-start px-6',
              connected ? 'justify-between' : 'justify-center gap-16',
            )}
          >
            {connected ? (
              <>
                <RoundBtn
                  label="摄像头"
                  testid="call-camera-toggle"
                  active={videoOn}
                  onClick={() => (videoOn ? stopCam() : void startCam())}
                >
                  {videoOn ? <Video className="h-[22px] w-[22px]" /> : <VideoOff className="h-[22px] w-[22px]" />}
                </RoundBtn>
                <RoundBtn
                  label="屏幕"
                  testid="call-share"
                  active={sharing}
                  onClick={() => setSharing((v) => !v)}
                >
                  <MonitorUp className="h-[22px] w-[22px]" />
                </RoundBtn>
                <RoundBtn label="挂断" testid="call-hangup" danger onClick={() => finish('answered')}>
                  <PhoneOff className="h-[22px] w-[22px]" />
                </RoundBtn>
                <RoundBtn
                  label="静音"
                  testid="call-mute"
                  active={muted}
                  onClick={() => setMuted((v) => !v)}
                >
                  {muted ? <MicOff className="h-[22px] w-[22px]" /> : <Mic className="h-[22px] w-[22px]" />}
                </RoundBtn>
                <RoundBtn
                  label="免提"
                  testid="call-speaker"
                  active={speaker}
                  onClick={() => setSpeaker((v) => !v)}
                >
                  <Volume2 className="h-[22px] w-[22px]" />
                </RoundBtn>
              </>
            ) : (
              <>
                <RoundBtn label="拒绝" testid="call-decline" danger big onClick={() => finish('declined')}>
                  <PhoneOff className="h-8 w-8" />
                </RoundBtn>
                <RoundBtn label="接听" testid="call-accept" big light onClick={() => setConnected(true)}>
                  <Phone className="h-8 w-8" />
                </RoundBtn>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** 圆形按钮 + 下方文字标签（设计稿里标签在按钮下面，而不是 aria-label） */
function RoundBtn({
  label,
  testid,
  onClick,
  active,
  danger,
  light,
  big,
  children,
}: {
  label: string;
  testid?: string;
  onClick?: () => void;
  /** 选中态：白底黑图标 */
  active?: boolean;
  /** 挂断 / 拒绝：红底白图标 */
  danger?: boolean;
  /** 接听：白底黑图标（呼出态专用） */
  light?: boolean;
  big?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-[62px] flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        title={label}
        data-testid={testid}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full transition active:scale-95',
          big ? 'h-[72px] w-[72px]' : 'h-14 w-14',
          danger
            ? 'bg-call-hang text-white'
            : active || light
              ? 'bg-call-fg text-call-bg'
              : 'bg-call-surface text-call-fg',
        )}
      >
        {children}
      </button>
      <span className="text-[11px] text-call-meta">{label}</span>
    </div>
  );
}
