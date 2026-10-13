/**
 * 屏幕左边缘右滑手势：唤出主抽屉。
 *
 * 只在「起点贴着左边缘」且「横向位移明显大于纵向」时才触发，
 * 避免和页面里的横向滚动（抽屉内的日期胶囊、片单卡片）打架。
 *
 * 用 pointer 事件而不是 touch，桌面用鼠标拖也能触发，调试更方便；
 * 全程 passive 监听，不 preventDefault，不干扰页面本身的手势。
 */
import { useEffect } from 'react';

/** 触发区宽度：左边缘 28px 内按下才算 */
const EDGE_WIDTH = 28;
/** 判定为「右滑唤出」的最小水平位移 */
const MIN_DX = 56;
/** 纵向漂移超过这个比例就不算横向手势（避免斜着划误触） */
const MAX_DY_RATIO = 0.6;

export function useEdgeSwipe(onSwipe: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    let tracking = false;
    let startX = 0;
    let startY = 0;

    const onDown = (e: PointerEvent) => {
      // 多指 / 非主键不参与
      if (!e.isPrimary || e.button !== 0) return;
      tracking = e.clientX <= EDGE_WIDTH;
      if (tracking) {
        startX = e.clientX;
        startY = e.clientY;
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.clientX - startX;
      const dy = Math.abs(e.clientY - startY);
      if (dx >= MIN_DX && dy <= Math.abs(dx) * MAX_DY_RATIO) onSwipe();
    };

    const onCancel = () => {
      tracking = false;
    };

    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onCancel, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [onSwipe, enabled]);
}

/** 抽屉打开后，在遮罩上右滑（或任意方向滑动）关闭 */
export function useSwipeToClose(onClose: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return;
      // 页面里有自己的横向滑动（比如信箱里的信件堆叠）时，把手势让给它
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('[data-no-drawer-swipe]')) {
        tracking = false;
        return;
      }
      tracking = true;
      startX = e.clientX;
      startY = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      // 左滑（收回）为主手势；右滑/上下大幅滑动不关，避免误触
      if (dx <= -MIN_DX && Math.abs(dy) <= Math.abs(dx) * MAX_DY_RATIO) onClose();
    };

    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [onClose, enabled]);
}
