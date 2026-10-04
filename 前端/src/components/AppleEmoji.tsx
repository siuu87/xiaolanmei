import rice from 'emoji-datasource-apple/img/apple/64/1f35a.png';
import cake from 'emoji-datasource-apple/img/apple/64/1f370.png';
import spoon from 'emoji-datasource-apple/img/apple/64/1f944.png';
import candy from 'emoji-datasource-apple/img/apple/64/1f36c.png';
import mango from 'emoji-datasource-apple/img/apple/64/1f96d.png';

const APPLE: Record<string, string> = {
  '🍚': rice,
  '🍰': cake,
  '🥄': spoon,
  '🍬': candy,
  '🥭': mango,
};

/**
 * 用 Apple 原生 emoji 图片渲染，避免在 Android/Windows 上回退成系统 emoji 的「安卓风」。
 * 未收录的 emoji 回退为原生字符。用 className 控制尺寸（如 h-4 w-4）。
 */
export function AppleEmoji({ emoji, className, alt }: { emoji: string; className?: string; alt?: string }) {
  const src = APPLE[emoji];
  if (!src) return <span className={className}>{emoji}</span>;
  return <img src={src} alt={alt ?? emoji} draggable={false} className={className} />;
}
