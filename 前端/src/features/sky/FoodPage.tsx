import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendToPartner } from '@/features/chat/sendToPartner';

/**
 * 「今天吃什么」现在由 recipe-nook（小食谱）提供：一个独立的 Python/FastAPI 服务，
 * 自带菜谱库（28 万条）、吃什么转盘、按餐记饭、AI 饮食打分，原生支持 iframe 内嵌。
 *
 * 它跑在 http://127.0.0.1:8790/ （见项目里 recipe-nook/ 目录，README 有启动与建库说明）。
 * 这里只负责：用 iframe 把它嵌进来、把它的「发给 AI 打分 / 让 AI 教我做」通过 postMessage
 * 接进小蓝莓当前对话、并跟着全局深浅色切换。服务没起来时给一份启动说明而不是白屏。
 */
const RECIPE_NOOK_BASE = 'http://127.0.0.1:8790/';
const RECIPE_NOOK_ORIGIN = 'http://127.0.0.1:8790';

export function FoodPage() {
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // null = 检测中；false = 服务在线；true = 没起来
  const [down, setDown] = useState<boolean | null>(null);

  const src = `${RECIPE_NOOK_BASE}?parent_origin=${encodeURIComponent(window.location.origin)}`;

  const probe = () => {
    fetch(RECIPE_NOOK_BASE, { mode: 'no-cors' })
      .then(() => setDown(false))
      .catch(() => setDown(true));
  };

  useEffect(() => {
    probe();
  }, []);

  // 接住 recipe-nook 发来的「发给 AI」消息，送进当前对话
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== RECIPE_NOOK_ORIGIN) return;
      const d = e.data;
      if (d && d.type === 'recipe-nook:send' && typeof d.text === 'string' && d.text.trim()) {
        void sendToPartner(d.text.trim());
        navigate('/chat');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [navigate]);

  // 跟着全局深浅色切（recipe-nook 的 food.html 认 document.documentElement[data-theme]）
  const syncTheme = () => {
    const dark = document.documentElement.classList.contains('dark');
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'recipe-nook:theme', theme: dark ? 'dark' : 'light' },
      RECIPE_NOOK_ORIGIN,
    );
  };
  useEffect(() => {
    syncTheme();
    const obs = new MutationObserver(syncTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-full w-full bg-page-bg">
      {down && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-page-bg px-6 text-center">
          <div className="text-lg font-medium">小食谱（recipe-nook）还没启动</div>
          <p className="max-w-md text-sm text-muted-foreground">
            「今天吃什么」现在由 recipe-nook 提供。请在本机另开一个终端，进到项目里的{' '}
            <code className="rounded bg-muted px-1">recipe-nook/</code> 目录，装好依赖后运行：
          </p>
          <pre className="w-full max-w-md overflow-x-auto rounded-lg bg-muted px-4 py-3 text-left text-xs">{`cd recipe-nook
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # 估热量用的 LLM key 可不填
uvicorn server:app --port 8790`}</pre>
          <p className="max-w-md text-xs text-muted-foreground">
            菜谱数据需自行构建（见 recipe-nook/README.md「数据从哪来」）：最小库可 clone 公有领域的 HowToCook；
            28 万条下厨房语料需手动下载。本沙箱拉不到，请你在本机补。
          </p>
          <button
            onClick={probe}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            重试连接
          </button>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={src}
        title="今天吃什么 · 小食谱"
        className="h-full w-full border-0"
        onLoad={syncTheme}
      />
    </div>
  );
}
