import { useEffect, useState } from 'react';

/**
 * 过敏原「小猫飞踢」特效：trigger 变化时播放一次，2.4s 后自动关闭。
 * 全模块通用，任何命中忌口 / 过敏源的入口（搜索、菜品详情、盲盒）都可触发。
 *
 * **不写死任何食物名**：踢飞的是什么由 `name` 决定（来自动态档案），
 * 图标给不准（没有食物词典）就用通用的餐具图标兜底。
 */
export function AllergenKick({
  trigger,
  name,
  emoji = '🍽️',
  onClose,
}: {
  trigger: number;
  /** 被拦下的东西的名字（显示在提示文案里） */
  name?: string;
  /** 被踢飞的图标；调用方拿得到更贴切的就传，拿不到就用默认 */
  emoji?: string;
  onClose: () => void;
}) {
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
    <div
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
      data-testid="allergen-kick"
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-scrim" />
      {/* 被踢飞的过敏原 */}
      <div className="absolute text-7xl animate-[allergenFly_1.2s_ease-in_forwards]">{emoji}</div>
      {/* 小猫（飞踢） */}
      <div className="absolute -left-10 text-7xl animate-[catKick_1.2s_ease-out_forwards]">🐱💨</div>
      {/* 提示文字 */}
      <div className="relative mt-40 animate-[popIn_0.4s_ease-out_0.6s_both] rounded-2xl border-2 border-primary/30 bg-surface px-6 py-4 shadow-[0_10px_30px_-20px_hsl(var(--shadow-color)/0.3)]">
        <div className="text-2xl font-bold text-pink-500">🚫 已拦截过敏原！</div>
        <div className="mt-1 text-sm text-muted-foreground">
          {name ? `禁止投喂${name}！` : '这个碰不得！'}
        </div>
      </div>
      {/* 星星特效 */}
      <div className="absolute inset-0 animate-[sparkle_1s_ease-out_0.3s] text-2xl">✨💫⭐</div>
    </div>
  );
}
