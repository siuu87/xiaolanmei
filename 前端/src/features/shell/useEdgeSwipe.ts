/**
 * 屏幕右滑手势：唤出主抽屉。
 *
 * 2026-11-16 改成**整屏任意位置**起手（原来只认左边缘 28px，手机上基本划不中）。
 * 为了不跟页面里的东西抢手势，起手点会先排掉三类目标：
 *   1. 能横向滚动的容器（片单卡带、日期条…，scrollWidth 超出才认）；
 *   2. 输入框 / 文本域 / 可编辑区（那里左右划是在选字）；
 *   3. [data-no-drawer-swipe] 明确标记的块。
 *
 * 用 pointer 事件而不是 touch，桌面用鼠标拖也能触发，调试更方便；
 * 全程 passive 监听，不 preventDefault，不干扰页面本身的手势。
 */
import { useEffect } from 'react';

/** 判定为「右滑唤出」的最小水平位移 */
const MIN_DX = 56;
/** 纵向漂移超过这个比例就不算横向手势（避免斜着划误触） */
const MAX_DY_RATIO = 0.6;

/** 起手点是不是落在「自己能横着滚」的容器里——是的话这个手势归它 */
function inHorizontalScroller(el: Element | null): boolean {
  let n = el as HTMLElement | null;
  while (n && n !== document.body && n !== document.documentElement) {
    const s = getComputedStyle(n);
    if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 4) return true;
    n = n.parentElement;
  }
  return false;
}

export function useEdgeSwipe(onSwipe: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    let tracking = false;
    let startX = 0;
    let startY = 0;

    const onDown = (e: PointerEvent) => {
      // 多指 / 非主键不参与
      if (!e.isPrimary || e.button !== 0) return;
      const t = e.target as HTMLElement | null;
      if (
        t?.closest?.('[data-no-drawer-swipe], input, textarea, [contenteditable="true"]') ||
        inHorizontalScroller(t)
      ) {
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
