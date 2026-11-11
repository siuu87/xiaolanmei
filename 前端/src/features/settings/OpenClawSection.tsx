import { useState } from 'react';
import { Bot, Copy, Check, Terminal, QrCode, Info } from 'lucide-react';

/**
 * OpenClaw 微信接入（2026-11-11）。
 *
 * OpenClaw（昵称「龙虾」）是一款开源 AI 智能体，可以在微信里通过
 * 「微信 ClawBot」插件接入——扫码绑定后，在微信里就能跟你的龙虾聊天、
 * 让它干活。本板块把接入步骤收进设置页，附一键复制的安装命令。
 *
 * 接入流程（三步）：
 *   1. 微信 → 我 → 设置 → 插件 → 开启「微信 ClawBot」
 *   2. 在本机终端执行下面的安装命令（会弹出二维码）
 *   3. 用微信扫码授权 → 微信通讯录出现「微信 ClawBot」即成功
 */

const INSTALL_CMD = 'npx -y @tencent-weixin/openclaw-weixin-cli@latest install';

const STEPS = [
  {
    icon: QrCode,
    title: '开启微信 ClawBot 插件',
    desc: '打开微信 → 我 → 设置 → 插件，找到「微信 ClawBot」并开启。\n若看不到说明尚未放量，先把微信更新到最新版。',
  },
  {
    icon: Terminal,
    title: '执行安装命令',
    desc: '在运行 OpenClaw 的设备上打开终端，粘贴下面的命令执行。\n终端会显示二维码和有效期提示。',
  },
  {
    icon: Bot,
    title: '扫码绑定',
    desc: '用手机微信扫描终端里的二维码，点「连接」授权。\n完成后微信聊天列表会出现「微信 ClawBot」窗口，发条消息验证即可。',
  },
];

export function OpenClawSection() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板失败时退化为选中提示
      setCopied(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* 说明卡 */}
      <div className="flex items-start gap-3 rounded-2xl bg-primary/8 p-3.5">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium leading-relaxed text-foreground">OpenClaw · 龙虾</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            开源 AI 智能体，通过微信 ClawBot 插件接入后，在微信里就能跟它聊天、让它干活。
            接入全程在你自己的设备上跑，不经过第三方。
          </p>
        </div>
      </div>

      {/* 三步流程 */}
      <ol className="space-y-2.5">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                {i < STEPS.length - 1 && <span className="mt-1 w-px flex-1 bg-border" aria-hidden />}
              </div>
              <div className="min-w-0 pb-1">
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {s.title}
                </p>
                <p className="mt-0.5 whitespace-pre-line text-[12px] leading-relaxed text-muted-foreground">
                  {s.desc}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {/* 安装命令 */}
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">安装命令（点击复制）</p>
        <div className="flex items-center gap-2 rounded-xl bg-surface-2 p-2.5">
          <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground">
            {INSTALL_CMD}
          </code>
          <button
            type="button"
            onClick={() => void copy()}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground transition active:scale-95"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      </div>

      {/* 备注 */}
      <div className="flex items-start gap-1.5 rounded-xl bg-surface-2/50 p-3">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          需要先装好 OpenClaw 并让网关处于运行状态（<code className="font-mono">openclaw gateway status</code>
          显示 running）。若扫码后首次对话无响应，先确认网关和模型配置正常，再排查微信插件。
        </p>
      </div>
    </div>
  );
}
