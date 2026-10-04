import { useEffect, useState } from 'react';

/**
 * 芒果过敏原「小猫飞踢」特效：trigger 变化时播放一次，2.4s 后自动关闭。
 * 全模块通用，任何含芒果的入口（搜索、详情、盲盒）都可触发。
 */
export function MangoKick({ trigger, onClose }: { trigger: number; onClose: () => void }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (trigger > 0) {
      setShow(true);
      const t = setTimeout(() => {
        setShow(false);
        onClose();
      }, 2400);
      return () => clearTimeout(t);
    }
  }, [trigger, onClose]);

  if (!show) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      {/* 芒果（被踢飞） */}
      <div className="absolute text-7xl animate-[mangoFly_1.2s_ease-in_forwards]">🥭</div>
      {/* 小猫（飞踢） */}
      <div className="absolute -left-10 text-7xl animate-[catKick_1.2s_ease-out_forwards]">🐱💨</div>
      {/* 提示文字 */}
      <div className="relative mt-40 animate-[popIn_0.4s_ease-out_0.6s_both] rounded-2xl border-2 border-pink-300 bg-white px-6 py-4 shadow-2xl dark:bg-zinc-900">
        <div className="text-2xl font-bold text-pink-500">🚫 已拦截过敏原！</div>
        <div className="mt-1 text-sm text-muted-foreground">禁止投喂芒果！</div>
      </div>
      {/* 星星特效 */}
      <div className="absolute inset-0 animate-[sparkle_1s_ease-out_0.3s] text-2xl">✨💫⭐</div>
    </div>
  );
}
