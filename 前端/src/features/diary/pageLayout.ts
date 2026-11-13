import { useEffect, useRef, useState } from 'react';

/**
 * 纸页几何（2026-11-13 定稿）：
 * 之前每页是「整屏长条」（360×796，宽高比 0.45），看着根本不是一本本子。
 * 现在纸页按接近 A5 的固定比例算大小，书壳再套在外面 —— 页大小永远不变，
 * 内容长了就自动排到下一面（见 DiaryPageFace 的分栏）。
 */
export const PAGE_RATIO = 0.7;

/** 纸页最宽多少（再宽就不像一张纸了） */
export const PAGE_MAX_W = 392;

/** 书壳比纸页多出来的部分：左边书脊、上边封皮压边、右边/下边留出页块厚度 */
export const BOOK_PAD = { left: 12, top: 10, right: 26, bottom: 22 };

/** 页块厚度：三层纸边各偏移多少（画在纸页后面，露出右侧和底部） */
export const PAGE_EDGES = [9, 6, 3];

export interface PageBox {
  w: number;
  h: number;
}

/** 在给定可用空间里算出纸页尺寸（固定比例，永不随内容变化） */
export function fitPage(availW: number, availH: number): PageBox {
  const maxW = Math.max(160, availW - BOOK_PAD.left - BOOK_PAD.right - 6);
  const maxH = Math.max(200, availH - BOOK_PAD.top - BOOK_PAD.bottom - PAGE_EDGES[0]);
  const w = Math.min(maxW, PAGE_MAX_W, maxH * PAGE_RATIO);
  return { w: Math.round(w), h: Math.round(w / PAGE_RATIO) };
}

/** 量一个元素的内容区尺寸（书页大小跟着容器走，但比例不变） */
export function useElementSize<T extends HTMLElement>() {  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<PageBox>({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setSize((s) =>
        Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1 ? s : { w: r.width, h: r.height },
      );
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, size };
}

/** 视口尺寸：纸页按视口算（不用量容器，翻页 / 编写 / 放大阅读才能是同一张纸） */
export function useViewport(): PageBox {
  const [vp, setVp] = useState<PageBox>(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vp;
}

/**
 * 一本书的纸页尺寸：全站同一套留白。
 * 上面给顶栏 + 页码，下面给翻页按钮 + 提示行，剩下的才是书。
 */
export function bookPageBox(vp: PageBox): PageBox {
  return fitPage(Math.min(vp.w, 438) - 24, vp.h - 210);
}
