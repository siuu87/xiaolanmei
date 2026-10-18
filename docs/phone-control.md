# 小蓝莓 · 真·控手机（参考 Operit AI）

让小蓝莓从「动嘴」变「动手」：伴侣 AI 可以真正操作你的 Android 手机（点按、输入、开 App、读屏幕、截图）。
架构直接借鉴 Operit AI 的「三明治」思想：**模型只做推理，设备操作走确定性的工具层**（无障碍 / ADB / Root），模型从不直接碰 UI。

> 参考来源：Operit AI（github.com/AAswordman/Operit）—— 开源 Android AI Agent，三通道自动化（无障碍 / Shizuku / Root）+ 内置 Ubuntu + 本地模型 + MCP。

---

## 1. 为什么是这套架构

小蓝莓本体是 **Web 应用（React + Vite + Fastify）**，跑在浏览器 / Node 里，**无法直接操作真机**。
手机自动化必须走 Android 原生能力。所以「真·控手机」必然要加一层**原生 Android 桥**：

```
┌─────────────────────── 手机（真机） ───────────────────────┐
│  WebView 承载小蓝莓 Web 应用（聊天/酒馆/工具，同一套界面）      │
│                                                              │
│  PhoneAgentService（前台服务）                                │
│    └─ OkHttp SSE → 连后端 /api/phone-control/stream          │
│    └─ 收到 command 事件 → AccessibilityAgent 执行              │
│         ├─ tap / swipe / input（dispatchGesture）            │
│         ├─ open_app（PackageManager）                        │
│         ├─ home / back（performGlobalAction）                │
│         ├─ ui_tree（读当前界面节点树）                       │
│         └─ screenshot（takeScreenshot → 上传后端）           │
│    └─ POST /api/phone-control/result 回报 reqId 结果         │
│                                                              │
│  PhoneAccessibilityService（无障碍服务，执行底座）             │
└──────────────────────────────────────────────────────────────┘
        ▲ 指令下发（SSE）           ▼ 结果回报（POST）
┌──────────────────────── 后端（Fastify + SQLite） ────────────────────────┐
│  routes/phoneControl.ts                                                │
│    GET  /api/phone-control/status     当前是否有原生端在线               │
│    GET  /api/phone-control/stream     SSE 长连接（原生端连这里）         │
│    POST /api/phone-control/result     原生端回报结果                     │
│    POST /api/phone-control/command    直发一条指令（手动/脚本）           │
│    POST /api/phone-control/screenshot 原生端上传截图 → 返回可访问 URL    │
│    GET  /api/phone-control/screenshot/:id  回取截图                      │
│  phoneControl/hub.ts  —— 指令/结果关联中枢（reqId ↔ Promise）           │
│  tools/registry.ts —— phone_* 内置工具（LLM 可直接调用，见 §3）         │
└──────────────────────────────────────────────────────────────────────────┘
        ▲ tool_call（LLM 自动发起）
┌──────────────────────── 聊天 / Agent ────────────────────────┐
│  小蓝莓 LLM：用户说「帮我打开微信给TA发句早安」                      │
│   → 调 phone_ui_tree 看屏幕 → phone_open_app → phone_tap → ...   │
└───────────────────────────────────────────────────────────────┘
```

**通道选择**：原生端 ↔ 后端用 **SSE（指令下发）+ POST（结果回报）**，零新依赖（没引入 ws 库）。
请求/响应靠 `reqId` 关联：每次指令生成一个 reqId，挂一个 Promise，原生端回报对应 reqId 时解挂。

---

## 2. 后端工具清单（LLM 可直接调用）

注册在 `tools/registry.ts`，作为 **builtin 工具**。`buildToolContext()` 已自动把它们纳入 LLM 的 function-calling 列表，**无需改动聊天循环**即可被 Agent 调用。

| 工具 | 作用 | 需确认 |
|---|---|---|
| `phone_ui_tree` | 读当前界面节点树（文本/描述/位置），让 AI「看见」屏幕 | 否（只读）|
| `phone_screenshot` | 截屏，上传后端并返回可访问 URL（仅本地/内网） | 否（只读）|
| `phone_tap` | 点击元素（text 或 x,y 比例坐标） | **是** |
| `phone_swipe` | 滑动（direction 或起止坐标） | **是** |
| `phone_input` | 在聚焦输入框输入文字 | **是** |
| `phone_open_app` | 打开 App（packageName 或 appName 模糊匹配） | **是** |
| `phone_home` | 按 Home | 否 |
| `phone_back` | 按返回 | 否 |
| `phone_scroll` | 滚动（up/down/left/right） | 否 |

动作类工具默认 `requiresConfirm: true` —— 模型第一次真要去点真机时，会先弹出确认，避免误触。

---

## 3. 本地端到端验证（已通过）

后端部分在本机完整可跑可验证：

- **单测** `tests/phone-control.test.ts`（4 条）：离线状态、SSE 全链路（指令下发→回报→Promise 解挂）、断开回落、截图上传回取。后端全量 **96/96**。
- **实时冒烟**（重启后端后）：
  - `GET /api/phone-control/status` → `{"connected":false}`（无原生端时）。
  - 模拟原生端连 SSE → `status` 变 `connected:true`；`POST /command {tool:"tap"}` 经 SSE 下发、原生端回报后返回 `200 {ok:true}`。
  - `POST /api/phone-control/screenshot`（base64 PNG）→ 落盘 → `GET /screenshot/:id` 取回 `image/png`。
  - `GET /api/tools` 能看到 9 个 `phone_*` 工具。

---

## 4. Android 原生前端（`android/`）

> ⚠️ 本目录是**完整可构建的 Android 工程源码**，但本开发环境没有 Android SDK，**未能在此编译/运行**。
> 请用 **Android Studio** 打开 `android/` 构建并装到真机联调。

关键文件：

| 文件 | 职责 |
|---|---|
| `app/src/main/java/com/blueberry/phone/Config.kt` | 后端地址（`10.0.2.2:3001` 模拟器 / 局域网 IP 真机） |
| `PhoneAccessibilityService.kt` | 无障碍服务，暴露静态实例给执行层 |
| `AccessibilityAgent.kt` | 9 个工具的具体执行（手势/输入/读界面/截屏/开 App） |
| `PhoneAgentService.kt` | 前台服务，持 SSE 长连接，分发指令并回报 |
| `MainActivity.kt` | WebView 承载 Web 应用 + 「启动手机代理」入口 |
| `AndroidManifest.xml` / `res/xml/accessibility_service_config.xml` | 权限与服务声明 |

### 构建与联调步骤

1. **准备后端地址**：打开 `Config.kt`，把 `BACKEND_BASE_URL` 改成电脑局域网 IP，例如
   `http://192.168.0.200:3001`（手机需与电脑同一 Wi-Fi；模拟器用 `10.0.2.2:3001`）。
2. **构建**：Android Studio 打开 `android/`。首次会提示生成 `gradle-wrapper.jar`（自动），
   或自行执行 `gradle wrapper`。`Build → Make Project` 生成 APK。
3. **安装到真机**：`adb install app/build/outputs/apk/debug/app-debug.apk`（需开发者选项 + USB 调试）。
4. **开无障碍**：系统设置 → 无障碍 → 已下载的服务 → 找到「小蓝莓手机代理」→ 开启。
   （也可在 App 内点「启动手机代理」，会自动跳到该设置页。）
5. **启动代理**：回到 App，点「启动手机代理」。通知栏出现「小蓝莓 · 手机代理」即表示已连上后端。
6. **对话操作**：在小蓝莓聊天里说「打开微信」「截个图」「把亮度调一下（视 App 而定）」。
   Agent 会先 `phone_ui_tree` 观察屏幕，再 `phone_open_app` / `phone_tap` 等执行；动作类会先向你确认。

### 权限说明

- **无障碍服务**：实现点击/输入/读界面的核心权限，必须用户手动授予（Android 强制）。
- **前台服务 + 通知**：保持 SSE 长连接不被系统回收。
- **截图（API 30+）**：`takeScreenshot` 需 Android 11+；低版本会返回 `SCREENSHOT_NEEDS_API30` 错误。

---

## 5. 安全边界

- **动作类需确认**：`tap/swipe/input/open_app` 默认 `requiresConfirm: true`，模型真要动真机前会先让你确认。
- **数据不出本地**：截图仅存于后端 `data/phone-shots/`（本地/内网），不会上传任何外部服务；UI 树只在一次工具调用内使用，不持久化。
- **可选鉴权**：设置环境变量 `PHONE_CONTROL_TOKEN` 后，所有 `/api/phone-control/*` 端点都要求 `?token=` 匹配；不设则开放（仅限本地/内网）。
- **与 Operit 的差异**：Operit 还支持 Shizuku/Root 深层系统操作与内置 Ubuntu，本方案当前只走**无障碍通道**（覆盖面已含绝大多数「帮忙操作 App」场景），后续可再加 ADB/Root 通道。

---

## 6. 已知限制 / 后续

- 本环境无法编译 Android，原生端为**源码交付**，需你在 Android Studio 实机构验。
- `takeScreenshot` 仅 API 30+；`dispatchGesture` 仅 API 24+（已满足 minSdk 26）。
- 后续可加：ADB/Root 通道（更深系统操作）、把 UI 树/截图接入视觉理解、工具调用前的「预览将要点的元素」二次确认 UI。
- 后端 `phone_* 工具` 已自动进入 LLM function-calling；如需默认关闭，可在 `registry.ts` 把对应 `requiresConfirm` 置为需要、或移出 `BUILTIN_TOOLS` 数组。
