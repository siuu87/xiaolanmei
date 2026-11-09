import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Phone, PhoneOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AvatarContent } from '@/components/AvatarContent';
import { useProfileStore } from '@/stores/profileStore';
import { useCallSession } from './callSession';

/** 来电响这么久没人接 = 未接来电 */
const INCOMING_TIMEOUT_MS = 26_000;

/**
 * 呼叫中 / 来电弹窗（2026-11-09）
 *
 * 挂在 AppLayout 而不是 ChatPage：他会主动打过来，任何页面都该弹得出来。
 * 两层约定：背板是纯色不透明 token（--scrim），全站禁半透明遮罩 / backdrop-blur；
 * Esc 在 window capture 阶段处理并 stopPropagation，否则一次 Esc 会连底下抽屉一起关。
 *
 * 呼出：随机决定他接不接（可用 ?call=answered / ?call=missed 强制验收）；接了才进通话浮层。
 * 来电：绿色接听 / 红色拒接 / 响到超时算未接；没接成时由 callSession 在聊天里追问一句。
 */
export function CallRingingLayer() {
  const phase = useCallSession((s) => s.phase);
  const direction = useCallSession((s) => s.direction);
  const forced = useCallSession((s) => s.forcedOutcome);
  const answer = useCallSession((s) => s.answer);
  const finish = useCallSession((s) => s.finish);

  const navigate = useNavigate();
  const location = useLocation();
  const partnerAvatar = useProfileStore((s) => s.partnerAvatar);
  const partnerRemark = useProfileStore((s) => s.partnerRemark);
  const partnerName = useProfileStore((s) => s.partnerName);
  const name = (partnerRemark || partnerName || '小蓝莓').trim();
  const [secsLeft, setSecsLeft] = useState(Math.ceil(INCOMING_TIMEOUT_MS / 1000));

  const goChat = () => {
    if (location.pathname !== '/chat') navigate('/chat');
  };

  // 我打过去：他可能接，也可能这会儿不方便（响久一点再判未接）
  useEffect(() => {
    if (phase !== 'ringing' || direction !== 'outgoing') return;
    const outcome = forced ?? (Math.random() < 0.72 ? 'answered' : 'missed');
    const delay =
      outcome === 'answered' ? 1800 + Math.random() * 2600 : 6500 + Math.random() * 2500;
    const t = window.setTimeout(() => {
      if (outcome === 'answered') {
        answer();
        goChat();
      } else {
        finish('missed', 0);
      }
    }, delay);
    return () => window.clearTimeout(t);
    // goChat 只依赖当前路由，重渲染时闭包取最新值即可；这里不把它列进依赖避免路由变化重置响铃
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, direction, forced, answer, finish]);

  // 他打过来：倒计时，响到头还没接就是未接来电
  useEffect(() => {
    if (phase !== 'ringing' || direction !== 'incoming') return;
    const until = Date.now() + INCOMING_TIMEOUT_MS;
    setSecsLeft(Math.ceil(INCOMING_TIMEOUT_MS / 1000));
    const t = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setSecsLeft(left);
      if (left <= 0) {
        window.clearInterval(t);
        finish('missed', 0);
      }
    }, 250);
    return () => window.clearInterval(t);
  }, [phase, direction, finish]);

  // Esc：来电算拒接，呼出算取消
  useEffect(() => {
    if (phase !== 'ringing') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      finish('declined', 0);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [phase, finish]);

  if (phase !== 'ringing' || !direction) return null;
  const incoming = direction === 'incoming';

  return createPortal(
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center px-5"
      data-testid="call-ringing"
      data-direction={direction}
    >
      {/* 纯色不透明背板：底下的页面不穿透。刻意不加淡入，免得动画那 180ms 出现半透明遮罩 */}
      <div className="absolute inset-0 bg-scrim" aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={incoming ? `${name} 来电` : `正在呼叫 ${name}`}
        className="animate-bb-sheet-up relative flex w-full max-w-[340px] flex-col items-center rounded-[28px] bg-call-bg px-6 pb-8 pt-9 text-call-fg shadow-lift"
      >
        {/* 头像 + 两圈呼吸环（静态描边色，不用半透明遮罩） */}
        <div className="relative flex h-[104px] w-[104px] items-center justify-center">
          <span className="absolute h-[104px] w-[104px] animate-pulse rounded-full border border-call-surface" aria-hidden />
          <span className="absolute h-[128px] w-[128px] animate-pulse rounded-full border border-call-surface" aria-hidden />
          <span className="flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-full bg-call-surface">
            <AvatarContent value={partnerAvatar} className="text-[38px]" />
          </span>
        </div>

        <h2 className="mt-7 max-w-full truncate text-[22px] font-semibold leading-tight">{name}</h2>
        <p data-testid="call-ringing-status" className="mt-2 text-[13px] text-call-meta">
          {incoming ? '来电 · 语音通话' : '正在呼叫…'}
        </p>
        <p className="mt-1.5 text-center text-[11px] leading-5 text-call-meta">
          {incoming
            ? `还有 ${secsLeft} 秒，没接也没关系`
            : '等他接起来，也可能这会儿不方便'}
        </p>

        <div className={cn('mt-9 flex items-start', incoming ? 'w-full justify-center gap-14' : 'justify-center')}>
          {incoming ? (
            <>
              <RingButton label="拒接" testid="incoming-call-decline" tone="decline" onClick={() => finish('declined', 0)} />
              <RingButton
                label="接听"
                testid="incoming-call-accept"
                tone="accept"
                onClick={() => {
                  answer();
                  goChat();
                }}
              />
            </>
          ) : (
            <RingButton label="取消" testid="outgoing-call-cancel" tone="decline" onClick={() => finish('declined', 0)} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RingButton({
  label,
  testid,
  tone,
  onClick,
}: {
  label: string;
  testid: string;
  tone: 'accept' | 'decline';
  onClick: () => void;
}) {
  return (
    <div className="flex w-[64px] flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        data-testid={testid}
        className={cn(
          'flex h-[64px] w-[64px] items-center justify-center rounded-full text-white transition active:scale-95',
          tone === 'accept' ? 'bg-emerald-500' : 'bg-call-hang',
        )}
      >
        {tone === 'accept' ? <Phone className="h-7 w-7" /> : <PhoneOff className="h-7 w-7" />}
      </button>
      <span className="text-[11px] text-call-meta">{label}</span>
    </div>
  );
}
