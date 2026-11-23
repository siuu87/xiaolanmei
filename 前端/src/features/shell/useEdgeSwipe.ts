/**
 * 从屏幕左半边向右滑：唤出主抽屉。
 *
 * 2026-11-23 先按 Operit AI 做成左侧 44px 起手，后来用户嫌面积太小，
 * 改成**屏幕左半边都能起手**。仍然不放到整屏：右半边留给文字选择、横向卡带
 * 和其他交互，避免到处抢手势。起手区按视口实时算，横竖屏切换自动跟着变。
 * pointer 与 touch 两套都监听，谁先成功算谁（去重），全程 passive、不 preventDefault。
 *
 * 起手点仍排掉：[data-no-drawer-swipe] 明确标记的块、输入框/文本域/可编辑区、
 * 以及自己能横向滚动的容器。
 */
import { useEffect } from 'react';

/** 左半屏起手区：每次按下时按当前视口宽度算，横竖屏切换不用重启页面 */
const edgeZone = () => (typeof window === 'undefined' ? 44 : window.innerWidth / 2);
/** 判定为「右滑唤出」的最小水平位移 */
const MIN_DX = 48;
/** 纵向漂移超过这个比例就不算横向手势（避免斜着划误触） */
const MAX_DY_RATIO = 0.7;

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
    let firedAt = 0;

    const begin = (x: number, y: number, target: EventTarget | null) => {
      // 只认屏幕左半边起手
      if (x > edgeZone()) {
        tracking = false;
        return;
      }
      const t = target as HTMLElement | null;
      if (t?.closest?.('[data-no-drawer-swipe], input, textarea, [contenteditable="true"]') || inHorizontalScroller(t)) {
        tracking = false;
        return;
      }
      tracking = true;
      startX = x;
      startY = y;
    };

    const move = (x: number, y: number) => {
      if (!tracking) return;
      const dx = x - startX;
      const dy = Math.abs(y - startY);
      if (dx >= MIN_DX && dy <= dx * MAX_DY_RATIO) {
        tracking = false;
        // 去重：pointer 与 touch 可能都报同一划，300ms 内只认一次
        const now = Date.now();
        if (now - firedAt < 300) return;
        firedAt = now;
        onSwipe();
      } else if (dx < -8 || dy > dx * MAX_DY_RATIO + 20) {
        // 往反方向划或明显纵向滚 → 放弃这一划
        tracking = false;
      }
    };

    const cancel = () => {
      tracking = false;
    };

    // pointer：桌面鼠标 / 支持 pointer 的浏览器
    const onPointerDown = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return;
      begin(e.clientX, e.clientY, e.target);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      move(e.clientX, e.clientY);
    };
    const onPointerUp = () => {
      tracking = false;
    };

    // touch：真机兜底（部分 WebView 里 touch 不会派发 pointer）
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || e.touches.length !== 1) return;
      begin(t.clientX, t.clientY, e.target);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) move(t.clientX, t.clientY);
    };
    const onTouchEnd = () => {
      tracking = false;
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', cancel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', cancel, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', cancel);
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
