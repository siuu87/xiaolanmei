# 给 Claude 的美化交接说明

把下面「提示词」整段复制给 Claude；如果用的是 Claude Code，直接把项目文件夹打开即可，
它会自己读文件。网页版则同时上传 `frontend-src.zip` + 若干张页面截图。

---

## 提示词（可直接粘贴）

你是资深 UI 设计师 + 前端工程师。项目是一个叫「小蓝莓」的双人 AI 陪伴应用，
前端在 `前端/`（React 18 + TypeScript + Vite + Tailwind CSS + Zustand + React Router）。

**这次只做视觉美化，不改任何业务逻辑、接口请求、路由、状态管理、`data-testid`。**

### 设计体系（必须遵守）

- 双主题 token 定义在 `前端/src/index.css`（`:root` / `.dark`）与 `前端/tailwind.config.js`。
- 常规页面一律用 token 类：`bg-page-bg` / `bg-surface` / `text-foreground` / `text-muted-foreground` /
  `border-border` / `bg-muted` 等，**不要写死十六进制颜色**。
- 例外：沉浸式深色页（together / listen / watch / tavern / goodnight）保留写死的星空深色
  `#070b1a`、`#0b1020` 这类品牌底色，不要统一成 token。
- 移动优先：内容宽度 `max-w-md`（少数宽表 `max-w-2xl`）。
- **「点开 = 整页不透明」**：任何点开后出现的层都要铺满整页、纯色底，
  **禁止 `bg-black/40`、`backdrop-blur` 之类的透明遮罩**（小弹窗除外）。
- 圆角、阴影、字号在现有体系内微调，不要引入新的 UI 库或图标库（现有 lucide-react）。

### 需要美化的页面（按优先级）

1. **together 主页** — `前端/src/features/sky/TogetherPage.tsx`
   （深色星空底 + 六个分块卡片：watch / listen / read / gallery / diary / goodnight）
2. **晚安页** — `前端/src/features/sky/GoodnightPage.tsx`
   （导入音频列表、白噪音三种、音量、睡眠定时器；深色沉浸）
3. **主抽屉日常看板** — `前端/src/features/shell/DrawerSections.tsx`
   （纪念日块、日历、心情、待办、Token、收信匣、模块手风琴）
4. **首页两张卡** — `前端/src/features/home/MoodCard.tsx`、`TodoCard.tsx`

### 风格方向

温柔、克制、留白多、细发丝线、轻微微光。像深夜里的手账，不像后台管理系统。
不要堆叠花哨渐变，不要滥用玻璃拟态，不要高饱和撞色。

### 工作方式

1. 先给 2～3 个视觉方案（文字描述 + 关键配色/间距/层级差异）让我选；
2. 选定后**一次只改一个页面**，改完说明：动了哪些文件、哪些类名、为什么；
3. 保持响应式（手机 375px / 桌面 768px 都不破版）；
4. 不要顺手改无关文件，不要重命名组件。

如果某个效果需要新依赖，先问我，不要直接安装。

---

## 交接方式

### 方式 A：Claude Code（推荐，能直接改文件）

```bash
cd D:/小蓝莓
claude
```

然后把上面的提示词粘进去。它可以自己读 `前端/src`，也能直接改文件。

### 方式 B：Claude 网页版 / 桌面版

上传这些东西：

- `handoff/frontend-src.zip`（只含前端源码与配置，不含后端、数据库、私人设定）
- 3～5 张页面截图（together、晚安页、抽屉、首页）
- 上面那段提示词

Claude 会返回改好的文件，覆盖回 `前端/src` 对应路径即可；也可以让它输出 unified diff。

### 方式 C：直接给 GitHub 链接

仓库已推送：`https://github.com/siuu87/xiaolanmei`
Claude Code 可直接 `git clone` 后修改。

> ⚠️ 仓库是 public，里面有比较私人的角色设定 / 健康备忘 / 纪念日。
> 如果只想美化界面，**只给 `前端/src` 就够了**，不必把整个仓库交出去。

---

## 给完之后的验收

```bash
cd 前端 && npm run build     # 含 tsc --noEmit
```

页面改动后刷新 http://localhost:5173 即可看到（Vite HMR）。
如果 Claude 改了 `tailwind.config.js`，需要重启 Vite。
