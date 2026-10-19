/**
 * PhotoStack 的 React 包装（2026-10-19）。
 *
 * 组件本体来自 Wren036/PhotoStack（微信式聊天合并照片卡：堆叠 / 探边 / 跟手翻页 / 快甩），
 * 原样放在 `src/vendor/photostack/`，这里是唯一改动的接入层：
 * - 原脚本是 UMD，浏览器里挂到 `window.PhotoStack`，所以只做副作用 import + 读全局；
 * - 图片数组变化时销毁重建（组件内部管理 DOM，不跟 React 抢节点）；
 * - `onTap` 用 ref 透传，避免父组件每次渲染都重建实例。
 *
 * 许可：PolyForm Noncommercial 1.0.0（个人/非商业可用，商用需作者授权），
 * 原文见 `src/vendor/photostack/LICENSE.md`，**不要删**。
 */
import { useEffect, useRef } from 'react';
// vendored UMD 脚本：副作用 import 后挂到 window.PhotoStack
import '../vendor/photostack/photo-stack.js';
import '../vendor/photostack/photo-stack.css';

interface PhotoStackInstance {
  index: number;
  next(): void;
  prev(): void;
  goto(i: number): void;
  destroy(): void;
}

interface PhotoStackOptions {
  width?: number;
  height?: number;
  peek?: number;
  peekStep?: number;
  rotStep?: number;
  scaleStep?: number;
  flingVel?: number;
  counter?: boolean;
  onTap?: (index: number) => void;
  onChange?: (index: number) => void;
}

type PhotoStackCtor = new (
  container: string | HTMLElement,
  images: string[],
  options?: PhotoStackOptions,
) => PhotoStackInstance;

declare global {
  interface Window {
    PhotoStack?: PhotoStackCtor;
  }
}

export function PhotoStack({
  images,
  width = 142,
  height = 190,
  onTap,
  className,
}: {
  images: string[];
  width?: number;
  height?: number;
  onTap?: (index: number) => void;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tapRef = useRef(onTap);
  tapRef.current = onTap;
  const key = images.join('\n');

  useEffect(() => {
    const host = hostRef.current;
    const Ctor = typeof window !== 'undefined' ? window.PhotoStack : undefined;
    if (!host || !Ctor || images.length < 2) return;
    const ps = new Ctor(host, images, {
      width,
      height,
      counter: images.length > 3,
      onTap: (i) => tapRef.current?.(i),
    });
    return () => ps.destroy();
    // key 已经代表图片内容；images 数组每次渲染都是新引用，不能进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, width, height]);

  return (
    <div
      ref={hostRef}
      data-testid="photo-stack"
      data-count={images.length}
      className={className}
      style={{ width, height }}
    />
  );
}
