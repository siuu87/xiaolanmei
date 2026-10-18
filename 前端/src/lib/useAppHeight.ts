import { useEffect } from 'react';

/**
 * 让根容器的高度跟着**可见视口**走（2026-10-18，移动端软键盘遮挡）。
 *
 * 问题：`100dvh` 只跟浏览器工具栏的收放走，**不跟软键盘走**。安卓 Chrome / 各家 WebView
 * 在键盘弹起时通常只改 `visualViewport.height`，布局视口不变 → 聊天页底部的输入框被顶到
 * 键盘下面，最后一条消息也看不全。
 *
 * 做法：把 `visualViewport.height` 写进 CSS 变量 `--app-h`，根容器用
 * `height: var(--app-h, 100dvh)`：
 * - 键盘弹起 → 容器变矮 → 输入栏自然被抬到键盘上方，聊天区自己滚动；
 * - 地址栏收起/展开 → 也跟手，不会留白边或溢出；
 * - 浏览器若已经把布局视口缩小（`interactive-widget=resizes-content`），
 *   两个值相等，不会二次压缩。
 *
 * 用 rAF 合并 resize 事件：键盘动画期间会连发几十次，逐次 setProperty 会抖。
 */
export function useAppHeight() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      document.documentElement.style.setProperty('--app-h', `${Math.round(vv.height)}px`);
    };
    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(apply);
    };
    apply();
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    return () => {
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      if (raf) window.cancelAnimationFrame(raf);
      document.documentElement.style.removeProperty('--app-h');
    };
  }, []);
}
