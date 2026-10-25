/**
 * 「今天吃什么」＝ 小食谱（recipe-nook）
 *
 * 它本身是一个独立的 Python/FastAPI 服务（本机 127.0.0.1:8790），自带菜谱库、
 * 吃什么转盘、按餐记饭、AI 饮食打分，原生支持 iframe 内嵌。这里只做三件事：
 *
 * 1. **套小蓝莓自己的壳**（2026-10-20）：以前这是一个裸 iframe 铺满整页，
 *    既没有顶栏也没有返回键——用户在这页里等于「进了别人的网站」，出不来只能按 Esc。
 *    现在统一走 `PageShell`：左返回键 + 标题「今天吃什么」+ 右侧操作区，
 *    下面才是 iframe。shell 的返回键就是**默认退出路径**，
 *    另外 iframe 右上角还钉了一颗高对比的「退出」（见 ExitButton），双保险。
 *
 * 2. **接消息**：recipe-nook 的「发给 AI 打分 / 教我做」通过 postMessage 过来，
 *    小蓝莓把它当用户消息发进当前对话并跳回聊天。
 *
 * 3. **离线时给一份能照着敲的启动说明**，而不是白屏——服务没起来时
 *    最容易让人困惑（之前用户就是这样卡住的）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Loader2, RefreshCw, Terminal } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { ExitButton } from '@/components/ExitButton';
import { cn } from '@/lib/utils';
import { sendToPartner } from '@/features/chat/sendToPartner';

// 跟随访问域名：本地开发走 127.0.0.1/localhost，VPS 远程访问自动用公网 IP。
// 这样小食谱在「手机开 VPS 地址」时也能正确连到侧车，而不是去连手机自己的 127.0.0.1。
const RECIPE_NOOK_HOST = window.location.hostname;
const RECIPE_NOOK_PORT = '8790';
const RECIPE_NOOK_BASE = `${window.location.protocol}//${RECIPE_NOOK_HOST}:${RECIPE_NOOK_PORT}/`;
const RECIPE_NOOK_ORIGIN = `${window.location.protocol}//${RECIPE_NOOK_HOST}:${RECIPE_NOOK_PORT}`;

const START_CMDS = `cd recipe-nook
python -m venv .venv
.venv\\Scripts\\python.exe -m pip install -r requirements.txt
.venv\\Scripts\\python.exe -m uvicorn server:app --host 0.0.0.0 --port 8790`;

export function FoodPage() {
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  /** null = 检测中；false = 在线；true = 没起来 */
  const [down, setDown] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const src = `${RECIPE_NOOK_BASE}?parent_origin=${encodeURIComponent(window.location.origin)}`;

  const probe = useCallback(() => {
    setChecking(true);
    fetch(RECIPE_NOOK_BASE, { mode: 'no-cors' })
      .then(() => {
        setDown(false);
        // 服务刚起来时把 iframe 重新指一遍，否则它会一直停在上一次的失败页
        if (iframeRef.current && iframeRef.current.src !== src) iframeRef.current.src = src;
      })
      .catch(() => setDown(true))
      .finally(() => setChecking(false));
  }, [src]);

  useEffect(() => {
    probe();
  }, [probe]);

  // 接住 recipe-nook 发来的「发给 AI」消息，送进当前对话
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== RECIPE_NOOK_ORIGIN) return;
      const d = e.data as { type?: string; text?: string } | null;
      if (d && d.type === 'recipe-nook:send' && typeof d.text === 'string' && d.text.trim()) {
        void sendToPartner(d.text.trim());
        navigate('/chat');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [navigate]);

  // 跟着全局深浅色切（recipe-nook 的 food.html 认 data-theme 消息）
  const syncTheme = useCallback(() => {
    const dark = document.documentElement.classList.contains('dark');
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'recipe-nook:theme', theme: dark ? 'dark' : 'light' },
      RECIPE_NOOK_ORIGIN,
    );
  }, []);
  useEffect(() => {
    syncTheme();
    const obs = new MutationObserver(syncTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [syncTheme]);

  // 和小蓝莓其它二级页一致：退出回聊天底座（抽屉里「生活小趣味」进来的也是这条路）
  const back = '/chat';

  return (
    <PageShell
      title="今天吃什么"
      eyebrow="KITCHEN"
      testId="food-page"
      backTo={back}
      bodyClassName="p-0"
      right={
        <div className="flex shrink-0 items-center gap-1">
          {down === false && (
            <a
              href={RECIPE_NOOK_BASE}
              target="_blank"
              rel="noreferrer"
              aria-label="在新窗口打开小食谱"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <ExternalLink size={15} />
            </a>
          )}
          <button
            type="button"
            onClick={probe}
            aria-label="重新连接小食谱"
            data-testid="food-reconnect"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <RefreshCw size={15} className={cn(checking && 'animate-spin')} />
          </button>
        </div>
      }
    >
      {down === null ? (
        <div className="flex items-center gap-2 px-4 py-10 text-[13px] text-muted-foreground">
          <Loader2 size={15} className="animate-spin" /> 正在打开小食谱…
        </div>
      ) : down ? (
        <div className="px-4 py-5">
          <div
            data-testid="food-setup"
            className="rounded-2xl border border-dashed border-border bg-muted/40 p-5"
          >
            <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
              <Terminal size={15} className="text-muted-foreground" /> 小食谱还没启动
            </div>
            <p className="mt-2 text-[12px] leading-6 text-muted-foreground">
              「今天吃什么」由本机的 <code className="rounded bg-muted px-1">recipe-nook</code>{' '}
              子服务提供（127.0.0.1:8790）。在本机终端跑一遍下面的命令，再点「重新连接」：
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-foreground/[0.06] px-3 py-2.5 text-[11px] leading-5 text-foreground/75">
              {START_CMDS}
            </pre>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              菜谱库需自行构建（<code className="rounded bg-muted px-1">recipe-nook/README.md</code>
              「数据从哪来」）：最小可用库是公有领域的 HowToCook，几秒入库。
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={probe}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground transition active:scale-95"
              >
                <RefreshCw size={12} className={cn(checking && 'animate-spin')} /> 重新连接
              </button>
              <button
                type="button"
                onClick={() => navigate(back)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[12px] text-muted-foreground transition hover:bg-muted"
              >
                先回去
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative">
          {/* iframe 铺满顶栏以下；退出键钉在 iframe 右上角，任何时候都能点到 */}
          <ExitButton
            variant="solid"
            label="退出"
            ariaLabel="退出今天吃什么"
            onExit={() => navigate(back)}
            testId="food-exit"
            className="top-[54px]"
          />
          <iframe
            ref={iframeRef}
            src={src}
            title="今天吃什么 · 小食谱"
            data-testid="food-iframe"
            className="h-[calc(100dvh-57px)] w-full border-0"
            onLoad={syncTheme}
          />
        </div>
      )}
    </PageShell>
  );
}
