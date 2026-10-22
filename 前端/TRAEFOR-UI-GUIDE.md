# 小蓝莓前端 · UI 大改交付包（给 Trae）

> 你是接手这个项目做界面美化的工程师。本文件是**唯一需要通读的交付说明**。读完再动手。

## 0. 开场白（复制整段，粘贴给 Trae 即可开工）
你是小蓝莓的前端美化工程师。小蓝莓是本地优先的 AI 陪伴应用，本次任务是对其**前端界面做一次较大幅度的视觉重构 / 美化（大改）**。工作目录就是当前项目根（React 18 + TypeScript + Vite + Tailwind CSS + Zustand + React Router）。请先完整阅读本目录下的 `TRAEFOR-UI-GUIDE.md`（即本文件），理解全部约束与设计方向后再动手。硬性要求：只做视觉层，不碰 API 契约 / 路由语义 / 后端；遵守「整页不透明」（禁止 `backdrop-blur` 与半透明黑遮罩）、深浅主题走 CSS token、复用 `PageShell` / `BottomSheet` / `ExitButton` / `AvatarContent` 等现成组件；改完必须保证 `npm run dev` 能起、`npm run build` 能通过（TS 0 错误）。开始吧。

## 1. 项目与技术栈
- React 18 + TypeScript + Vite + Tailwind CSS + Zustand + React Router。
- **本次只改前端**；后端（`后端/`，Fastify + SQLite）完全不碰。

## 2. 工作目录与关键文件速查（让你不迷路）
- 入口：`src/main.tsx`
- 主布局：`src/app/layout/AppLayout.tsx`
- 全局样式（设计 token 来源）：`src/index.css`（`:root` / `.dark` 变量）
- 主题 token 映射：`tailwind.config.js`（项目根）
- 页面壳（所有二级页用它）：`src/components/PageShell.tsx`
- 底部弹层（底部弹窗用它）：`src/components/BottomSheet.tsx`
- 退出键（整屏 iframe / 通话页用它）：`src/components/ExitButton.tsx`
- 头像（所有头像位用它）：`src/components/AvatarContent.tsx`
- 功能页面：`src/features/*`（chat / sky / xinchao / notes / library / goodnight …）
- API 封装与契约（**只读，别改请求/响应字段**）：`src/lib/api.ts`、`src/lib/api/`
- 状态管理（Zustand）：`src/stores/`
- 通用 hooks / 工具：`src/lib/`（如 `useAppHeight` 移动端视口）

## 3. 范围与边界
- **可以做**：整体布局、配色体系、间距节奏、动效、组件观感、页面结构重组、引入新视觉语言。
- **不能碰**：业务逻辑、状态数据流语义、API 请求/响应字段、路由跳转语义、数据库、后端目录。

## 4. 必须保留的硬约束（违反会被校验脚本拦下或破坏体验）
1. **整页不透明**：任何「打开新页面 / 弹层」必须是整页 + 纯色不透明背景。**禁止** `bg-black/xx` 这类半透明黑色遮罩，也**禁止** `backdrop-blur` 模糊遮罩（项目有自动化校验专门抓这类违规）。
2. **深浅主题走 token**：颜色优先用 `src/index.css` 的 `:root` / `.dark` 变量 + `tailwind.config.js` 映射。**新增配色请走 token，不要散落大量写死十六进制**。
3. **部分组件刻意保留固定配色 —— 大改时勿「顺手统一」，但用户要改就改**：播放器(sky 黑金)、信纸(notes)、StarrySky/Almanac、Appearance 色板、toggle 白旋钮、Health·Workspace·Device·Memory·Mcp·Skills 的语义色。这些是设计**故意**不走全局 token 的（品牌/语义色）。做整体自动重构时，不要无脑把它们统一成 token 或改写，否则会破坏刻意做的视觉（黑金变灰、信纸失质感、状态色失语义）。**但用户明确说「重做某个组件视觉 / 换个配色」时，尽管改** —— 那是有意为之，不是顺手统一。
4. **复用现成骨架，别重造**：二级页套 `PageShell`；底部弹窗用 `BottomSheet`；整屏 iframe / 通话页用 `ExitButton`；头像用 `AvatarContent`。

## 5. 设计方向
- 既有基调：深夜手账 / 微光留白，暖暗色调（暖棕、琥珀、微光米白），克制、温柔、有留白。
- 大改可强化并系统化这一方向，也可与用户确认新方向；但交付要**一套统一、有节制的视觉语言**，而不是每个页面各一套。
- 若引入新视觉体系，请用 token 系统化落地，避免 inline style 满天飞。

## 6. 工程纪律（交付前必须保证）
- 改动后 **`npm run dev` 能起、`npm run build` 能通过**（TypeScript 0 错误）。
- 若**新增 npm 依赖**（组件库、framer-motion 等动画库），请明确列出 —— 部署端需要 `npm i` 重装，否则缺包白屏。
- **小步提交**（git commit），方便回溯；不要一次巨量改动后无法 bisect。
- 基本可访问性：按钮/链接可聚焦、弹层可 Esc 关闭、移动端视口高度走 `--app-h`（**不要写死 `100dvh`**），避免软键盘顶飞布局。

## 7. 本地预览
```bash
npm install        # 首次，或依赖变了之后
npm run dev        # http://localhost:5173
```
后端不必须；空数据会走兜底 UI，界面壳也能渲染。移动端视口用浏览器设备模拟预览。

## 8. 交付清单
请一并说明：改了哪些页面 / 组件、是否新增依赖、是否动到了 token 体系、dev / build 是否通过。
