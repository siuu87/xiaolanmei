# 更新日志

本文件记录每次推送到远端的可见变更。**约定：每次上传前先更新本文件与 `README.md` 的功能总览，再推送。**

## 2026-11-10

### 来电改由模型自发决定 + 顶栏/输入栏控件与信息分层

用户原话：「不要每次点进来刷新页面就公式化打电话，我要是接入模型之后的自发行为，然后上面导航栏还有输入栏的东西和信息要做出区分」。

- **撤掉前端公式化来电**：删除 `features/chat/incomingCallScheduler.ts`；`App.tsx` 不再挂定时器，
  顺手清掉旧 `localStorage` 排程 key `blueberry.incoming-call.v1`；`AppLayout.tsx` 的
  `triggerIncomingCall` 改从 `callSession.ts` 引入。`?incoming=1` 手动验收入口保留。
- **来电唯一入口收敛到模型**：`callSession.ts` 新增 `triggerIncomingCall()`；后端
  `tools/registry.ts` 注册 `incoming_call` BuiltinTool（描述里明确「一轮最多一次、不要每轮都打」），
  `routes/chat.ts` 的 builtin filter 显式放行该工具、`write()` 联合类型加 `incoming_call` 事件，
  工具成功后推 `{ type:'incoming_call', reason }`；前端 `lib/api/chatStream.ts` 新增 `onIncomingCall`
  并解析该事件，`ChatPage` 的 `streamChat` 接到就调 `triggerIncomingCall()`。
  **边界**：这是「模型在用户发起的一轮对话里自主决定是否打」，还没有无人输入时的后台调度器 /
  outbox / 常驻 SSE 总线；要做「没人说话也会主动打」需另起方案。
- **控件与信息拉开层次，但不铺底色块**：延续 11-09 的透明悬浮顶栏
  （`absolute` + `bg-transparent` + `pt-[104px]`），只给控件自身加 `border border-chat-line` +
  `shadow-md / shadow-sm`：顶栏 4 个侧按钮、气泡模式按钮、名字按钮、头像、输入胶囊、
  发送 / 停止 /「＋」按钮。消息气泡与两个容器底色不变，`data-testid` / 点击行为 / 状态逻辑零改动。
- 验收：前后端 `tsc --noEmit` 0 错、`vite build` 成功；重启后端后 `/api/health` 200；
  模拟 SSE 脚本 `TOOL_REGISTERED true` / `TOOL_EXEC 已发起一通来电（想听你声音）。等 TA 接。` /
  `SSE_RESULT {"called":1,"reason":"想听你声音","deltas":"嗯"}`；浏览器 4/4
  （刷新不自动来电 + 旧排程 key 已清 / 控件有描边投影 / 容器无底色块 / `?incoming=1` 仍弹）；
  顶栏冒烟 6/6、输入栏回归 4/4。**本轮验收未往真实库写数据**（只读核查：最近 20 分钟
  `calls` / `messages` 均无新增）。真实模型接入后仍需做一次端到端「模型真调工具 → 弹窗」验证。

### 深色模式按设计规范重做（参考小红书「深色模式不是反色」）

- 依据规范四条：底色不用纯黑、用主色相极深版本；层级靠明度（页面→卡片→弹层越上越亮）；品牌色降饱和提亮；正文不纯白。
- 背景压到极深蓝灰：`--chat-bg`/`--page-bg` 10%→8%（≈#0E1116 风格，非纯黑）。
- 修正层级（原弹层比卡片暗）：`--chat-sheet 13%→19%`、`--paper 14%→19%`、`--chat-bar 12%→14%`、`--surface 13.5%→15%`；
  现顺序 背景(8%) < 表面(15%) < 卡片/输入框(17%) < 弹层/纸面(19%)，越上越亮。
- 正文降白避免刺眼：`--chat-ai-fg 88%→85%`、`--ink`/`--ink-night 87/88%→84/85%`（≈#E6E6E6）；自己消息气泡保留纯白 `chat-me-fg`（深底高对比）。
- 品牌/强调降饱和提亮：`--brand 66%→70%`、`--chat-accent 64%→68%`、`--glow 52%→56%`。
- 图片压暗（规范第5条）经用户确认不做，避免压暗头像/表情/贴纸。

### 语音页彻底并入 React 通话

用户纠偏：「把语音那个 html 加进通话里」—— 要的是"把语音 html 融入通话"，不是"把通话加到语音页里"。最终选彻底并入 React（推荐）。

- 新建 `features/chat/PaiVoiceStage.tsx`：`forwardRef` 组件，封装星空背景 `createStarfield` + 语音协议 `VoiceCall`；顶部 `<style>` 内联原 HTML 的 `:root` 深色配色；`useImperativeHandle` 暴露 `hangup`，`onEnd(seconds)` 回调给浮层结算。
- 新建 `lib/voiceCall.js`（AGPL-3.0 上游 1:1 移植，`// @ts-nocheck`）+ `voiceCall.d.ts`（手写声明：`VoiceCall` 类 `start/hangup/setMuted/barge/sendText`、`playing/mode` 字段、handlers）。
- 新建 `lib/voiceStarfield.ts`：原 `window.sky` IIFE 改成 `createStarfield(cv)` 工厂，返回 `{start,stop,voice,tap,form,rebuild}`。
- 改 `PaiVoiceOverlay.tsx`：删 iframe 与 `postMessage` 监听，改挂 `<PaiVoiceStage ref={stageRef} ... />`，Esc / 退出键统一走 `stageRef.current?.hangup()`；删后端 `page` 依赖注释。
- 改 `routes/paivoice.ts`：返回体删 `page: '/paivoice/index.html'`，现 `{configured,up,wsUrl,host,port}`（前端用 `paiVoice.up` 决定走 PaiVoice 还是旧 CallOverlay）。
- 删 `前端/public/paivoice/index.html` 与 `voice-call.js`；**保留 `LICENSE`**（AGPL-3.0 归属不能删）。

验收：`tsc --noEmit` 0 错、`vite build` 过、CDP 真机流程验证通过（overlay/canvas.pv-sky/.pv-beam×2/.pv-primary/paivoice-end 全挂载、点退出 overlay 干净消失）；沙箱内无真实 PaiVoice 核心，界面停在 idle「接通」按钮属预期。

### 通话记录新增 direction 字段 + 清理测试记录

用户原话「被挂的/我自己打的取消都是我这边的信息」+ 选择「两件事都做」：① 清理 CDP 验收遗留的测试通话；② 修正归属显示（呼出/来电）。

- 后端 `db/schema.ts` calls 表 + `db/client.ts` `SCHEMA_SQL` + `initDatabase()` 幂等迁移新增 `direction TEXT`（可空）；
- 后端 `routes/calls.ts`：`CallBody`/`toDTO`/`POST`/`PATCH` 透传 `direction`，`normDirection` 默认 outgoing；
- 前端 `lib/api/calls.ts`：新增 `CallDirection='outgoing'|'incoming'`、`CallDTO`/`CallInput` 加 `direction`，新增共享 helper `callStatusWord({state,direction})` 统一归属文案（answered→已接通 / declined+outgoing→已取消 / declined+incoming→已拒接 / missed+outgoing→对方未接 / missed+incoming→未接来电；null 按 incoming）；
- `chatStore.ts` `ChatCall.direction?`、`callSession.ts` `settleCall` 把 direction 同时写进 `createCall` 和聊天内联卡 `call` 对象；`CallDirection` 由 callSession 本地定义改为从 `lib/api/calls` 引入；
- UI：`CallsPage` 列表+详情、`CallDetailSheet(pillText)`、`ChatPage` `CallRecordCard(title/sub/icon)`、`SearchOverlay` 统一改用 `callStatusWord`。
- 数据清理：重启后端跑迁移；`data/blueberry.before-call-clean-20261110.db`（`VACUUM INTO` 备份）后软删今天（本地 2026-11-10）4 条测试记录，剩 19 条 live。

### 设置页大改 + 首页生活卡 + 角色页/我的页重构

用户原话：「把设置整体改一下大改，我想保留需要的然后其余的就删掉，把能合并的都合并」。

- **设置页大改为 4 分区**（个人 / AI 伴侣 / 外观 / 数据与同步）：
  - 个人：删档案 / 我的备忘录 / 待提醒，只留「表情包」（从聊天表情面板齿轮深链跳入）；
  - AI 伴侣：删「对话风格」（进角色页），「长期记忆」+「技能管理」合并为「记忆与技能」；
  - 外观：原 7 项合并为 4 项（深色模式 / 强调色 / 字体 / 高级外观，含小手机配色方案 presets + 自定义 CSS）；
  - 提醒与健康：整段移除，经期预测 + 睡前提醒归到首页「生活」；
  - 数据与同步：留数据中枢（inline 模式跟整页滚，按 App 主题钉 `--bb-*` 防深色孤岛）+ 云同步。
- **首页新增「生活」卡**（新建 `features/home/LifeCard.tsx`）：经期读 `usePeriodStore` 预测下次日期，睡前提醒复用 `useLocalSwitch('blueberry.bedReminder')` 与 AppLayout 全局 `BedtimeNudge`（22:00–02:59 弹一次）联动；插在 `<ModuleCards />` 之后。
- **角色页 / 我的页重构**：与「他的资料」同一套「封面 + 上叠白卡」版式（共享 `ProfileCoverSheet`）；删 `features/shell/ProfileEditor.tsx`，改用 `features/shell/ProfileInlineEdit.tsx` 内联编辑；「我是谁 · 角色设定」设定卡 + 编辑资料（骨架从角色页复制）。

验收：前端 `tsc --noEmit` 0 错；dev server 5173/5174 均 200、标题「小蓝莓」，HMR 生效。

## 2026-11-09

### 调整

- **日记本改归「生活」**：`diary` 从抽屉/首页模块区的 `together` 分组移到「生活小趣味」分组
  （label 用中文「日记本」、无 hint，与组内其余卡片等大）；同时从 `/together` 页移除 diary 分块，
  避免同一入口在两处重复。路由 `/diary` 不变，日历卡选中日「日记」行的 `?date=` 深链照常可用。
- 顺带清理文档：README 删除已下线的 `listen`（一起听）残留描述，同步模块卡数量与日记本入口说明。

### 语音电话按 Earshot「听着呢」教程改造（前端 UI + 交互）

- 改造范围经用户确认只做**前端 UI + 交互**：轻声回应 / 逐句朗读 / 认真告别才挂等**内容生成策略属于外部
  `8780` PaiVoice 核心**，本仓库不实现（也不改模型 / ASR / TTS）。
- `前端/public/paivoice/index.html`：球面 `orb` → **两条光线**（珊瑚＝你、白＝它，各 28 根错相竖条）；
  绿色「接通」按钮；左静音 / 右红色挂断不变；底部新增**本轮延迟小字**；状态文案改口语化。
  `beams` 支持 click / Enter / Space **点光线打断**，没在说话时给一句「嗯，我听着呢」而不发多余 interrupt。
- 回调接线：`speech` 驱动珊瑚光线 + 通话星空聚形，`playing` 驱动白光线与可打断区域，
  `latency` 显示「这一轮 X.Xs 接上」，`interrupted` 清光束；`setMode` 以 `call.playing` 兜底，
  服务端中途给 `thinking` 时不会把仍在响的白光线掐灭。
- `前端/public/paivoice/voice-call.js`：新增公开 `barge()`（立即停播 + 发 `interrupt` + 回 listening，
  未播放时返回 false 且不发消息）；VAD `endSilenceMs` 650 → **800**（对齐教程「停 0.8s 交话」）。
- 本地 `前端/dist/paivoice/{index.html,voice-call.js}` 也同步了一份（`dist` 在 `.gitignore` 里不入库，
  VPS 部署脚本会 `npm run build` 由 `public/` 自动重建，不必手动拷贝）；`node --check` 双文件通过、
  `tsc --noEmit` 0 错、dev server `/paivoice/index.html` 返回 200 且包含新版标记。

### 通话补上「等对方接 / 他也会主动打来 / 没接会追问」

- 之前点通话按钮是直接挂出整屏浮层，等于默认双方都接了。现在补了电话的前半段：
  `idle → ringing → connected → idle`，方向分「我打过去 / 他打过来」，结果分接通 / 拒接 / 未接。
- 新增 `features/chat/callSession.ts`（Zustand 状态机 + 统一结算）：结算写 `calls` 表、
  推聊天流通话卡片，**没接成时延迟 1.6–3s 写一条 AI 追问文本**（来电没接 / 呼出他没接口吻不同；
  我自己取消拨号不追问）。放 store 是因为来电弹窗在布局层、接通后的浮层在聊天页，两边要共用状态。
- 新增 `features/chat/CallRingingLayer.tsx`：`createPortal` 到 body、`z-[1500]`、
  **纯色不透明背板**（刻意不加 fade-in，避免动画期出现半透明遮罩）、Esc 在 capture 阶段拒接 / 取消。
  呼出随机 72% 接通（1.8–4.4s）/ 28% 不接（6.5–9s），来电响 26 秒无人接判未接。
- 当时曾新增 `features/chat/incomingCallScheduler.ts` 做随机时刻来电（首通 45–90s，之后 18–40min）；
  **同日已按用户要求整体撤销**（见下方 2026-11-10 段），只保留 `?incoming=1` 深链用于验收。
- `ChatPage` 的所有拨号入口（顶栏电话 / 「+」通话 / 搜索页再打一通 / 通话详情再打一通）统一走
  `callSession.begin`，只有 `phase === 'connected'` 才渲染 `PaiVoiceOverlay` / `CallOverlay`；
  `CallOverlay` 新增 `startConnected`，不再重复一次「呼出 2 秒自动接通」；原 `endCall` 的落库与卡片逻辑
  收敛进 `settleCall`。`?call=answered` / `?call=missed` 可强制呼出结果。
- `PaiVoiceOverlay` 的 iframe 加 `auto=1`：接听后自动开始实时语音，不再让用户点第二次「接通」；
  连不上核心时按钮会自动放回来供手动重试。
- 验收：`tsc --noEmit` 0 错、`vite build` 成功、puppeteer-core 实跑 7 项全通过
  （来电弹窗 / 拒接后追问 / 接听进通话 / 挂断回收 / 呼出呼叫中 / 对方接听 / 对方不接追问）。
  **验收往真实库写了 8 条通话 + 12 条消息，已按纪律 `VACUUM INTO` 备份后精确删除，
  并把 `conversations.active_message_id` 回退到验收前的叶子**；备份在
  `后端/data/blueberry.before-call-test-20261109.db`（`*.db` 已被 gitignore）。

### Chat 顶栏：悬浮置顶 + 无底色（同日早些时候的换皮已全部撤销）

- 用户澄清要的是「按键都置顶在聊天信息上面、底下不要带颜色的导航栏底」，不是换配色。
  **同日那次 iMessage 换皮（白圆按钮 / 蓝灰渐变头像 / 浅蓝名字药丸 / 60px 头像）已逐项回滚**，
  按钮、头像、名字的外形与配色恢复到原本的 `chat-*` token 版本。
- 顶栏由 `relative` 占位块改为 `pointer-events-none absolute inset-x-0 top-0 z-30`，
  `bg-transparent` 不带任何底色 / 遮罩 / backdrop-blur；消息滚动区改用等高的 `pt-[104px]`：
  首屏内容不被压住，往上滚时消息就从按钮与头像后面透出来。
  6 个按钮各自 `pointer-events-auto`，空白处点击仍能落到底下的气泡上。
- **功能零改动**：`chat-hamburger` / `chat-mode-toggle` / `mood-popover-trigger` /
  `chat-title-btn` / `chat-call` / 搜索按钮的 `data-testid`、点击行为与状态逻辑全部原样。
- 验收：`tsc --noEmit` 0 错、puppeteer 冒烟 6/6（锚点齐全 / 气泡模式切换 / 通话进呼叫中 /
  搜索层 / 心情浮层 / 名字跳心潮）；computed style 核对（topbar=absolute/z-30/透明/104px，
  scroller `paddingTop=104px`，按钮底色恢复 `rgb(41,43,46)`，头像恢复 52px 无渐变，名字恢复 16px）；
  首屏与滚动后两张截图确认「无底色 + 消息从按钮后面透出」。本轮冒烟没有往真实库写任何数据。

## 2026-11-05

### 调整

- **聊天「+」面板删「礼物盒」入口**：面板回到设计稿的 5 项（表情包 / 通话 / 图片 / 拍照 / 文件）；
  礼物盒只留抽屉「生活小趣味」入口与 `/gifts` 路由。
- **抽屉「生活小趣味」卡片统一尺寸**：礼物盒、灵感待办池等条目统一去掉副标题 hint，
  五张卡完全等大（51px 高），不再一行高一行矮。

### 模块调整（晚些轮次汇总）

- **移除「一起听」模块**：删除 `VinylPlayer`、`neteaseMcpConnector`、`ListenPage`、`StarrySkyPage`
  及 listen 孤儿 UI（LyricsPanel / PlayerCard / PlaylistSection / ScanLoginModal / UserAuthWidget）；
  相关入口（`router` / `DrawerSections` / `TogetherPage` / `StarrySkyPage`）改指 `/together` 枢纽页。
  保留 `/watch`（一起看）等其余模块不受影响。
- **Chat 顶栏头像「耳机头像框」**：头戴式大耳机装饰框在头像外圈（耳罩在左右外缘、头梁在头顶上方成环），
  仅当播放态 `playing` 为真时出现，默认不显示；无呼吸微动；`pointer-events-none` 不挡点击。
  后续由「内置 AI + 网易云 MCP」回传的播放态驱动 `playerStore.playing`。
- **集成 ai-call-screen-share 子模块**：以 git submodule 引入（上游无 LICENSE，仅作设计参考），
  通话页星空 Canvas 背景已移植进 `前端/public/paivoice/index.html`。

## 2026-11-04

### 晚间迭代（抽屉 / 日历 / 主题 / 信件 / 资料页）

- **深色主题默认开启**：`appStore` persist 版本 4→5 迁移里显式赋值，老用户 localStorage 也会翻到深色；
  刊头与档案页双头像改白圆底 + 细环（`bg-white`），深浅主题下都可见。
- **主抽屉**：面板加宽（92% / max-w 400px）、删顶部品牌块只留关闭键；DailyBoard 镜像首页排布：
  日历 → 待办 → Token 与信封**平分一行** → 心情弧在信件下面（MoodCard 独立卡移除，弧线即录入入口）。
- **日历卡多轮重排**：ghost 月份水印垂直居中；默认左栏收窄至 40% 对角构图（星期左上 / 大数字居中 /
  「2026年11月」右下，随视图月翻动）；月历上方新增「‹ 2026年11月 ›」换月切换器（跨年正确）；
  星期表头 10px + 字距 + 分隔线；**选中态详情面板改绝对定位覆盖层**，卡片高度恒 = 月历自然高度
  （点击日期不再拓宽卡片）；纪念日 / 特殊节日行移入详情面板（命中才显示），节日标签不截断；
  删月历心情点。
- **经期全改粉色**：月历数字实期 pink-400 / 预测 pink-300，详情面板经期区块删「痛经程度 / 其他不适」
  症状 UI；设置弹窗 / 关怀语 / 按钮同步粉色。
- **信件卡（compact）信封化**：全卡只画盖线 V 形 + 压在交点上的**圆形爱心按键**——有新信实心粉爱心、
  没有空心；删全部文字（第 N 封 / 日期 / 主题 / 计数），左右滑翻信与点按已读保留；
  修 compact 模式日期渲染两遍的 bug。
- 首页 / 抽屉 Token 行回到与右列**平分空间**（grid-cols-2）；心情弧三个按键间距拉开（gap-6）。
- 抽屉「生活小趣味」新增**「礼物盒」入口**（`/gifts`：信 · 悄悄话 · 贴纸 · 彩蛋，GiftBoxPage 已有）。
- **角色页改口径为「他的资料」**：顶栏标题、空态文案、底部按钮均改为资料页口径（「编辑资料」），
  「他是谁 · 角色设定」与「我的」个人主页同口径；封面 + 白卡版式 / 四格统计 / 最近印象与
  全部回归 testid 保留。
- **「我的」个人主页更名「我的资料」**：页面标题与设置页「个人」分区入口同步更名，与「他的资料」对称。
- **心情浮层删「查看角色」按键**（2026-11-04 晚）：「他的资料」页组件与状态保留，待接新入口。
- **长短对话切换键：爱心 → 气泡**：**单气泡（实心）= 长对话**（工具 + Markdown）、
  **双气泡（描边）= 短对话**（像发消息一样）；点按切换与长按切对白风格行为不变，
  `chat-mode-toggle` testid 不变。

### 新增

- **我的 · 个人主页（`/me`）**：与角色页同一套「封面 + 上叠白卡」版式 —— 浅蓝小封面（装饰圈 +
  更换封面）、白色圆角大卡上移叠在封面下沿、头像骑在分界线正中；头部居中（名字 / 在线药丸 /
  个性签名），4 格统计（消息 / 通话 / 记忆 / 信件），「我是谁 · 角色设定」卡与底部「编辑资料」。
  入口在 **设置 → 个人 → 个人主页**。新增共享版式组件 `ProfileCoverSheet`（封面 + 白卡 + 骑线头像 + 4 格统计卡）。
- **通话记录两级页（`/calls`、`/calls/:id`）**：列表页「最近通话」（头像 / 名字 / 日期时长副文 / ›，
  未接听红字）→ 点卡片进详情页；详情页无头像、不写挂断方，直接名字 + 时刻时长 → 通话内容
  （逐字转写不落库，显示空态说明而非编造对话）→ 再打一通（回聊天底座发起）。

### 调整

- **角色页（`CharacterPage`）重写**为「封面 + 上叠白卡」版式：顶栏浮在封面上，头部居中
  （备注大字 → 姓名 · 本名 → 在线药丸），统计扩为 **消息 / 通话 / 记忆 / 信件** 四格均匀分布，
  其中「通话」格可点直接进通话记录列表；「编辑角色」移入白卡底部随内容滚动。回归锚点 testid 全部保留。
- 首页模块卡：酒馆单项分组去掉「进入」二字，点击直接进酒馆（对齐设计稿减法）。
- 设置页「个人」分区新增「个人主页」入口。
- **全站移除 emoji 头像**：头像只认图片（`/api/files/…` / `https://…`），空值一律渲染中性剪影。
  资料编辑器删 emoji 快选网格改为图片上传/URL，设置页个人资料卡同步；备忘录徽章改昵称首字渐变底；
  小酒馆 / 一起听 / 黑胶 / 读书页等直渲染 emoji 的位置全部换 AvatarContent。
- **首页按设计稿重排**：日历卡改全宽（选中日详情移到日历下方），待办拆为独立 TO-DO 卡，
  Token 卡与「信件 + 心情行（38px 三弧无背卡）」两列并排，删首页 FunctionGrid/PeriodHint，
  模块卡移动端与桌面端同一份入口。
- **首页日历卡按可编辑稿 PDF 逐项对齐**：
  - 月历 = 左「日期信息」+ 右「月历小组件」（S M T W T F S 表头周末蓝、周末列数字浅灰、
    节日/节气浅蓝小标签、法定休日绿星角标、ghost 月份水印）；被圈日期与其他日期
    **数字同高同位**（圈只衬在数字后面，标签/心情点绝对定位不影响行高）；
    默认态左栏与选中态详情面板同宽（46%），切换不跳宽。
  - **选中态 = 左栏切换日期详情面板**（心情我+AI 弧 / 农历 / 日记行即入口 / 经期：玫瑰
    「设置」+ 玫瑰关怀语 + 玫瑰「记入经期」+ 症状记录 / 提醒行读「睡前提醒」开关），
    右月历保持。
  - **经期设置改为弹窗**：遮罩 + 白卡（周期天数 / 经期天数玫瑰步进器、上次经期、是否规律
    开关、玫瑰保存按钮），Esc 不穿透。
  - 删置顶纪念日卡（首页不再展示）；刊头下「下午好…」本地问候语删除，改为**他写的最新
    一封信念的首行**（无信不显示），正式接入 AI 后即为他实际写的话。
- 首页信件卡改紧凑版：**高度精确 = Token 卡的 1/2**（第 N 封 / 日期 / 细线 / 主题首行截断 /
  01·03 换信），心情弧（38px、浅灰圆底）在下半区居中；抽屉里的完整版收信匣不受影响。
- TO-DO 未完成圈改蓝色空心圆；课程卡图标改房子、删右侧「课程表」链接（入口在抽屉）。
- 首页心情弧（MOOD 卡与右列心情行）弧线加浅灰圆底块，未选中弧线灰蓝、选中变心情色。

### 文档

- 收录 `docs/vps-deploy-continue.md` / `vps-deploy-sidecars.md` / `vps-deploy-steps.md`（VPS 部署步骤备忘）。
- `.gitignore` 排除会话过程产物（`previews/`、`screenshots/`）。

## 2026-10-26 ~ 2026-11-03（合并此前未提交的工作）

### 新增

- 通话记录详情浮层 `CallDetailSheet`（聊天搜索 → 查看历史通话：头像 / 时长 / 状态 / 通话内容空态 / 再打一通）。
- 思考链下弹层 `ChatSheet`（点思考链气泡展开完整推理）；心情弹层 `MoodPopover`。

### 调整

- **人设五模块清空**（后端 `persona/modules.ts` `PERSONA_MODULES=[]`、`profile.partnerRemark` 置空），
  提示词链路同步收紧（后端 `chat.ts` / `prompts.ts`）——个性化文案改由用户自写。
- **头像只认图片**：`AvatarContent` 非图片一律渲染中性剪影，emoji 头像废弃；判断统一走 `isImageAvatar()`。
- **对白风格并入爱心键**：点击切长短对话、长按 500ms 切 fragmented / immersive；顶栏三键删除，消息操作改为长按呼出。
- 聊天工具箱 `ChatDrawer` 移除，内容并入主抽屉 `DrawerSections`；桌面端首页补模块卡入口。
- 日历卡 / 待办卡（`CalendarCard` / `CollapsibleCalendar` / `TodoCard`）与首页 `HomePage` 布局重构对齐设计。
- 模型选择器 `ModelPicker`、表情面板 `StickerPanel`、通话浮层 `CallOverlay` 交互打磨；
  聊天流（`chatStream.ts`）配套调整。

## 2026-10-25

### 修复

- **小食谱（recipe-nook）VPS 远程访问**：`FoodPage.tsx` 里侧车地址从写死的 `http://127.0.0.1:8790` 改为跟随 `window.location`（域名 + 端口 8790）。
  这样从手机开 VPS 公网地址时，小食谱 iframe / postMessage 会正确指向 `http://<公网IP>:8790`，而不是去连手机自己的回环地址。本地开发（localhost/127.0.0.1）行为不变。
- **桌面端首页缺失「生活趣味 / 小酒馆 / 工具箱」入口**：主抽屉（`DrawerSections`）是 `md:hidden`，宽屏上完全不可见，而这些模块入口只收在抽屉里，导致桌面用户点不到。
  在 `HomePage` 底部（`FeatureGrid` 之后）补一份 `ModuleCards`，用 `hidden md:block` 包裹，仅桌面端显示，避免与移动端抽屉重复。
- **相册（Remember-Me）远程访问「127.0.0.1 拒绝连接」且无法内嵌**：根因是记住我侧车默认只监听 `127.0.0.1`，且其所有响应强制 `X-Frame-Options: DENY` + `frame-ancestors 'none'`，
  浏览器既连不到内网回环、也禁止 iframe 内嵌。`GalleryPage` 改为不再用 iframe，改为就位时给出「打开记忆相册」按钮，在新标签页打开独立运行的 Dusk Archive（顶层导航不受 framing 头限制）。
  打开地址改为同源的 `/dashboard`，由**后端反向代理**（新增 `后端/src/routes/rememberMeProxy.ts`）转发到内部 `127.0.0.1:8787`——侧车保持 loopback、无需改监听、无需在云安全组再开 8787、无需设 Bearer Token；与 xinchao / Ombre 代理思路一致。远程上传暂未纳入代理，查看 / 检索不受影响。

### 调整

- 侧车部署说明收拢到 `docs/vps-deploy-sidecars.md`（心潮·念 / 记忆相册 / 小食谱 / PaiVoice 四个侧车在 VPS 上的安装、pm2 守护、主后端 `.env` 回填与安全组放行）。
- **`remember-me/` 与 `pai-voice/` 源码入库**（此前被 `.gitignore` 排除导致 VPS 克隆后缺失、侧车无法部署）：`.gitignore` 改为放行源码、继续排除运行产物（`remember-me/.venv/`、`remember-me/.data/`（相册照片）、`pai-voice/.venv/`）；心潮·念（`/xinchao/`）保持本地不入库。

### 调整（UI 大改，对齐手绘草图）

- **首页（`HomePage`）按草图重排**：顶部改为双头像交叠刊头 + 起始日期 + 「已经在一起 N 天」大数字（文案由「记忆存在」改为「已经在一起」）；
  「Daily」区日历与待办左右并排（窄屏自动堆叠）；Token 与「收信匣」小卡并排；页脚版本号 + 设置入口。心情 / 经期 / 课表 / 功能宫格等原有卡片保留在下方，未被裁掉。
- **聊天页顶栏（`ChatPage`）按草图重排**：正中改为**大头像 + 名字 + 名字下方时间**，整块可点进入「内心（心潮）」（`/xinchao`），角落保留通道状态灯；
  移除原来绝对定位在名字右侧的「在一起 N 天」浮标（天数已在首页显著展示）。桌面端保留左侧汉堡隐藏、礼物盒 / 搜索在右。
- **聊天输入栏重排为「模芯 ｜ 输入框 ｜ 语音·表情·＋」**：对白风格双态药丸（💕/🩷）留最左，麦克风从最左移到输入框右侧、表情与「＋」之前，与草图顺序一致。消息气泡（小头像 + 时间戳）维持原样。

## 2026-10-22

### 新增

- **礼物盒模块（`/gifts`）**：哥哥（AI 伴侣）送来的礼物，拆开前是封着的盒子，拆开后变成纪念架上的摆件。
  - 聊天顶栏右侧新增**发光礼物盒入口**（与记忆 / 情绪中枢并列），点击进入独立深色页。
  - 暗色通透、去贴纸化、去手账化的现代极简设计：**未拆礼物区**（封盒网格，点一下触发**层层拆封动效**：盒盖掀起 → 光晕炸开 → 内容浮现）+ **专属纪念架**（拆开后摆件 + 玻璃搁板，点摆件回看内容）。
  - 四类礼物：信 / 悄悄话 / 表情 / 彩蛋。
  - 后端新增 `gifts` 表（`id/title/content/gift_type/is_opened/created_at` + 标准时间列）与 `GET|POST|PATCH|DELETE /api/gifts`，拆封态持久化；首进空库会塞几件演示礼物（可随手删）。

### 调整

- **首页 ToDoList 重做**：`TodoCard` 改为现代极简——磨砂底 + 细边框、稀疏字体、**勾选后划线消除动画**（完成即折叠消除）、**弹性竖向滚动**；并移入原「信卡片」的网格位（与 TokenCard 同格），首页不再单独放信卡片（深夜来信仍在 `/notes` 与抽屉「收信匣」）。

### 修复

- 无。

## 2026-10-21

### 调整

- **深夜电台环境声重做：白/粉/棕噪音 → 雨声 / 壁炉 / 风声混音台**（用户：
  「电台加几个可以波动的上下拨钮，然后去掉白噪音棕噪音什么的，然后变成雨声壁炉还有风声，波动就播放可以叠加」）：
  - 原来是「点一下切一个」的三颗噪音按钮，现在换成 **三条竖向推子**（`AmbientMixer.tsx`），
    像调音台：**往上推就出声，推多高就多响，推回底 = 静音**；
  - 三条轨（雨声 / 壁炉 / 风声）**互不干扰、可以同时推起叠加**——雨 + 壁炉 + 风 = 深夜小屋；
  - 音色全部程序化合成：三条轨共用一层棕噪底，雨声加细密高音雨点、壁炉加不规则爆裂、
    风声用双正弦做阵风起伏；首尾交叉淡化（`loopSmooth`）消除循环接缝的「咔」声；
  - 推子支持**拖动 / 点哪跳哪 / 双击归零 / 方向键微调**，触屏不误滚页面（`touch-none`）；
  - 台节目单联动：音乐台默认推雨声、夜话台推风声、故事台推小雨，枕话台仍是心跳底噪；
  - 锚点：`ambient-mixer` / `fader-rain|fire|wind`（旧的 `noise-*` 锚点已删）。
- 顺带修复：`loopSmooth` 之前被传成了 `Float32Array` 而不是 `AudioBuffer`（tsc 抓到）。

### 新增

- **内心（心潮）页接入 Ombre Brain 记忆中枢**：聊天顶栏小红点进入的「内心 / Mind」主页面（即 `/xinchao` 心潮完整页）
  顶部新增**置顶导航「心潮 / 记忆」**，切换两个中枢视图：
  - **心潮**：11 股驱力动态花瓣 + 念头池 + 情绪 + 时间线 + 小屋 + 内核（原有，未动）；
  - **记忆**：经后端代理接入 [Ombre-Brain](https://github.com/P0luz/Ombre-Brain) 的 Dashboard 记忆桶，
    与心潮情绪在同一个中枢里呼应，保持深夜手账、微光留白风格。
  - 交互：`OmbreMemories.tsx` 支持 全部 / 动态 / 永久 / 已归档 / 已钉选 标签筛选 + 300ms 搜索防抖；
    点记忆卡片弹出半透明手账风 `OmbreDetail.tsx`（Bottom Sheet）：状态/钉选/领域/标签 状态条 +
    效价/唤醒/重要/活跃度 四块统计 + 正文 + 「为什么记住」+ 时间脚注。锚点 `ombre-detail`。
- **后端 Ombre Dashboard 代理层**（`services/ombreDashboard.ts` + `routes/ombreDashboard.ts`，
  注册到 `/api/ombre-dashboard`）：读取 `OMBRE_DASHBOARD_URL` / `OMBRE_DASHBOARD_PASSWORD` /
  `OMBRE_DASHBOARD_TIMEOUT_MS` 三个环境变量；实现**自动会话登录**（捕获 `Set-Cookie`、并发去重锁、
  401 自动重登重试一次）、`normalizeBucket` 跨版本字段兼容（id/bucket_id、content/content_preview、
  created/created_at、type/bucket_type，并推导 `state: dynamic|permanent|pinned|archived`）。
  暴露 `GET /status`（在线状态 + 记忆总数）、`GET /buckets`（type/state 过滤 + sort）、
  `GET /search`（关键词）、`GET /buckets/:id`（单条详情）、`GET /probe`。`OMBRE_DASHBOARD_URL` 留空时
  所有接口优雅返回 `configured:false`，前端显示「记忆中枢还没接上」。
  - 自检：`GET /api/ombre-dashboard/status` 返回 `{configured:false,up:false,...}`（未配置不报错）。
  - 前置：后端 `.env.example` 补了三个 `OMBRE_*` 变量与注释；`config/env.ts` 加了对应读取。

## 2026-10-20

### 新增

- **小食谱（recipe-nook）真正跑起来 + 套上小蓝莓自己的壳**：
  `/food` 以前是裸 iframe 铺满整页 —— 没有顶栏、没有返回键，进去等于「掉进别人的网站」。
  现在统一走 `PageShell`：左返回键 +「今天吃什么」标题 + 右侧「新窗口打开 / 重新连接」，
  下面才是 iframe；**离线时给的是能照着敲的启动命令 +「重新连接 / 先回去」两条出路**，不再白屏。
  本机已建好 venv、导入 HowToCook 公有领域菜谱（372 道 / 123 张成品图），
  菜系（中餐 334 / 西餐 16 / 日料 10 …）、地区（川菜 13 …）、种类筛选都有真实数据。
- **统一退出键 `components/ExitButton.tsx`**：凡是「整屏托管的别人的页面」，
  右上角都会钉一颗带文字的「✕ 退出」药丸（z-1300、白字半透明黑底，深浅主题都读得清）。
  目前挂在**小食谱 iframe**、**记忆相册 iframe** 上；两者都保留 PageShell 返回键做双保险。
  悬浮/图标两种外观（`solid` / `ghost`），通话标题栏用的是 ghost 变体。
- `verify-exit-buttons.js`（16 条）：壳、标题、返回键、离线说明、在线 iframe + 退出键、
  退出键几何与配色、点退出真的回聊天 / 回 together。

### 调整

- **通话界面重做**（用户：「也要可退出按键，通话界面进行优化」）：
  - **退出键独立成带文字的粉红键「✕ 退出」**，钉在标题栏最右（58×28，`rightGap 12`），
    不再和另两个小图标挤在一起被淹没；
  - 标题栏分层：左＝状态点 + 名字 + 计时（计时做成胶囊，不再贴死名字），右＝形态切换 / 收起 / 退出；
  - 悬浮窗尺寸**跟着视口算**（`min(视口高−96, 480)`，下限 300），矮屏不会把下半截控件顶出屏幕；
  - **收起后是一条完整标题条**：显示计时 + 「通话中」，点条上任意位置展开；
  - **Esc 语义分开**：整页时 Esc＝结束通话，悬浮窗时 Esc 只收起不挂断（防误伤）；
  - PaiVoice 子页 `compact` 时字幕再收一档，保证「接通 / 挂断」始终在屏内。
  - `verify-paivoice.js` 扩到 22 条（退出键文字/尺寸/最右、悬浮窗完整在视口内、顶栏退出真的结束通话）。
- **`verify-page-shell.js` 126/1**：`/food` 转为 PageShell 后，原先 8 条 `/food` 不一致全数消失；
  仅剩「灵感池」入口点击的既有误判（同组其它入口均通过）。
- 小食谱离线提示文案对齐 Windows（`.venv\Scripts\python.exe`），并把「先回去」放进说明卡里。

### 调整

- **深夜来信：一封信 = 一枚信封卡**（参考《恋与制作人》「心动邀约」）：
  以前是「封面图 + 标题 + 摘要」的信息卡，现在卡片主体就是**实体信封** ——
  背板 + 前面板倒 V 信封口 + 可翻开的封盖 + 火漆 + 金边 + 丝带，3:2 真实比例。
  - **未读 = 封着、已读 = 封盖掀开露出信纸一角**，一眼分得出哪封没拆；
  - 火漆与描边跟着 `letter_theme` 换色（素雅暗红 / 纪念日金箔 / 夜色银蓝）；
  - `/notes` 从「横向滑动流」改成**两列信封网格**（横向流一屏只看得全一张，网格能一眼看到一沓）。
- **点信封是弹窗，不是跳页**：`/notes` 点信原地弹 `LetterReaderLayer`（URL 不变）；
  弹窗分两步 —— 信封先落地（0.24s），封盖再翻开、信纸从信封口抽出来。
  **背景改成纯色不透明**（原来 `bg-black/70 + backdrop-blur`，会透出底下的对话）。
  三种关法：右上角 ✕ / 点空白 / Esc；关掉后 URL 仍停在 `/notes`。
  `/letter/:id` 路由保留，刷新或分享链接照样能直达同一层弹窗。
- 新增 `features/notes/LetterEnvelope.tsx`（`EnvelopeArt` / `EnvelopeSeal`）：
  四层结构（背板 / 信纸 / 前面板 / 封盖），封盖双面（正面 V 盖 + 背面浅色纸背），
  `opened` + `flapAngle` 控制拆封；卡片里用 88°（掀到底会被卡片裁掉），弹窗里用 150°（斜立在信封后）。
- 新增 `verify-letter-envelope.js`（21 条）：信封结构 / 3:2 不变形 / 未读封着已读翻开 /
  火漆跟主题 / 点开是弹窗不跳路由 / 背景不透明无模糊 / 三种关法 / 关后 URL 不变。
- 回归：`verify-mailcard.js` 43/43（抽屉收信匣未受影响）、`verify-opaque-layers.js` 26/26。

### 调整

- **深夜来信：信封改横版长方形**（用户：「信封做成长方形…横板长方形」）：
  原来封盖三角占 52% 高、缺口深到中线，上半部一整个大三角，轮廓像「房子 / 五边形」。
  现在缺口与封盖统一收到 **45%**，剩下的 55% 是完整矩形纸面；信封本体改 **5:3 横版长方形**
  （实测 156×94），保留一点点圆角 + 细描边，把「长方形」的轮廓钉死。
  - 信封**撑满卡片宽度**（去掉外壳 padding）—— 是「这枚信封就是卡片」，不是「卡片里放了个小信封」；
  - 日期与心境标签**压在信封底边上**（暗色渐变托底），以前单占一条，卡片被撑高、
    信封显小、下面那条深色还空着像没渲染出来；
  - 火漆下移到封盖尖端 `top-[74%]`，跟真实信封一样压在封尖上；
  - 弹窗里的信封同步改 5:3（信纸从更宽的口子里抽出来，更像真实拆信）。
- `verify-letter-envelope.js` 22 条：3:2 比例断言改成**「横版长方形（5:3，宽>高）」**，
  并新增「信封撑满卡片宽度（fillRatio > 0.9）」。
- 回归：`verify-mailcard.js` 43/43。

### 替换

- **心潮·念（Xinchao·Nian）取代 Ombre Brain**：`/chat/stream` 开流前拉 `/v1/now`
  注入 `[心潮 · 此刻]`，流结束后把「她说 / 他回」写回 `/v1/conversation-event`；
  内心面板改为心潮的「此刻 + 11 股驱力 + 情绪」（心潮没起时回退本地六维情绪）。
- **PaiVoice 取代语音通话浮层**：语音通话走独立 `/paivoice` 页面（AGPL-3.0，作为独立静态页
  而非打进主包），支持打断、断线接回、实时字幕、静音；PaiVoice 没起时自动回退旧浮层。
  视频通话仍走旧浮层（PaiVoice 的画面是给回复端看，不是双向视频流）。
- 开源清单新增 `tianyupaipai-cmd/pai-voice`、`tianyupaipai-cmd/xinchao-nian`。

### 调整

- **通话双形态**：PaiVoice **默认完整通话页**（整页铺满、能看实时对话字幕），
  一键切 **320×440 可拖拽悬浮窗**；悬浮时可收起成 48px 小条（iframe 不卸载，
  通话/麦克风不断），位置夹在视口内；视频通话仍全屏。
- **心潮独立完整页**：新增 `/xinchao` 整页 —— 花瓣（11 股驱力）、**念头池（单独一类）**、
  情绪、时间线、小屋、内核；「内心」只留「此刻 + 前 3 股驱力 + 打开完整心潮」摘要卡。
  后端新增 `/api/xinchao/dashboard/{snapshot,timeline,cabin,personality}` 只读代理。
- **阅读杂志书架**：阅读日历下面新增书架 —— 书面朝外、底下透明书架、一行三本、
  每个来源分类单独一行、可左右滑动，点书直接进阅读器。
- **内心面板**：标题由「{称呼}的内心」统一改为「内心」，顶栏红点 `aria-label` 同步改为「内心」；
  顶栏（返回 / 内心 / 通道状态）与情绪卡头（实时情绪 / 心情胶囊 / 轮次 / 重置）字号收紧并强制单行；
  六条数值标签也改为单行。360px 窄屏 + 最长心情文案实测不换行。

### 杂项

- 仓库整理：移除 `前端/` 下 3 个 0 字节误建文件（`partnerName` / `会话标题` / `小蓝莓`）。
- 加入 `handoff/CLAUDE-BRIEF.md`（给外部设计/编码助手的交接说明）。
  `handoff/frontend-src.zip` 是本地旧快照，按 `*.zip` 规则**不入库**。

### 新增

- **小食谱一键脚本 `scripts/setup-recipe-nook.bat`**：以前跑起来要自己敲五条命令、
  还要手动 clone HowToCook，现在**双击就完事**。四种模式：
  无参数＝需要时构建 + 启动、`check`＝只体检不启动、`build`＝只建库、`rebuild`＝强制重建。
  五步全幂等：建 `.venv` → 装依赖 → 生成 `.env` → **库为空时才导入 HowToCook**
  （372 道 / 123 张图；源码缓存在 `%TEMP%\recipe-nook-HowToCook`，之后重建秒起）→ 8790 启动。
  已有内容一律跳过，重复运行**绝不会动饭账**；下载被中断会自己清掉残缺的克隆重下；
  入库后仍为空会明说，而不是假装成功。
- `recipe-nook/scripts/count_recipes.py`：把菜谱数打到 stdout（库没建好打 0），
  一键脚本靠它判断要不要构建；顺带也是个人工排查小工具。

#### 这个脚本踩到的 cmd 坑（全部写进文件头的 NOTE，改之前先看）

1. **`.bat` 必须纯 ASCII**。cmd.exe 按系统代码页读批处理，UTF-8 里的中文会被解错，
   直接把命令行切碎（第一版就是这么炸的：`'…重复运行是安全的… rem' 不是内部或外部命令`）。
   中文说明一律放 README。
2. **括号块（`if/else`）里的行不能以 `...` 结尾**。cmd 会**预先解析两个分支**，
   所以没走到的那个分支里一句 `echo xxx ...` 也能让整个脚本中断，
   报 `此时不应有 ...。`（走 stderr、RC 255），而 stdout 看起来只是「停在上一步」，极难定位。
   顶层行末尾的 `...` 没问题，只有块内不行；块内同理避开 `<` `>`。
3. **`for /f ... in (`python -c "..."`)` 这类反引号套双引号会把命令切碎**
   （报 `'.venv\Scripts\python.exe" -c "import' 不是内部或外部命令`）。
   改成「Python 脚本输出重定向到文件 + `set /p` 读回」就稳了 —— 这也是
   `recipe-nook/scripts/count_recipes.py` 存在的原因。
4. **脚本正在跑的时候别改它**。cmd 每执行完一条命令会从**事先记下的字节偏移**重新读文件，
   运行中改文件会让下一条命令从不相干的行中间开始 —— 表现为「耗时那条命令其实成功了，
   接着 cmd 报某个 URL/路径的碎片不是命令」（本次就撞出过
   `'wToCook.git' 不是内部或外部命令`，一度以为是脚本 bug，实际是我边跑边改导致的）。
   同理 `.bat` 保持 CRLF，新加了 `.gitattributes` 钉住 `*.bat text eol=crlf`。

#### 验证情况

- `check` / `build` / `run` 三种模式在本机全过（RC 0、无 stderr）：372 道菜 → 跳过构建，
  `run` 正确识别 8790 已被占用并给出地址而不是重复启动。
- 空库路径用临时 `FOOD_DATA_DIR` 验过：识别 0 → 跳过下载 → 跑 `build_htc.py` → `build` 模式干净退出。
- **真实下载（`git clone` HowToCook）本轮没跑通**：到 github.com 的 git 连接被代理掐
  （`CONNECT tunnel failed 502` / `schannel: server closed abruptly`），脚本按预期报
  「下载失败，检查网络再跑一次」。上一轮同一条命令成功过（764 个文件、100%），
  所以脚本这条路径本身没问题，是本环境的网络不稳。

## 2026-10-19（深夜电台 / 时间戳 / 多图）

### 新增

- **消息时间戳 patch**：送模型前给每条消息动态渲染 `[Tue 2026-08-11 17:32:10 CST · +9h 44m]`；
  存档保持干净、剥离旧前缀幂等、按相邻消息算间隔；`MESSAGE_TIMESTAMPS=off` 可关。
  前端 payload 带上 `createdAt`，`/chat/stream` 统一渲染，**绝不回写数据库**。
- **PhotoStack 多图堆叠卡**：接入 `Wren036/PhotoStack`（PolyForm 非商用许可，已保留 LICENSE），
  多图消息渲染成微信式堆叠卡（三张守恒 / 探边 / 跟手翻页 / 快甩），点开整页大图；单图保持原样。
- **MIDNIGHT FM 深夜电台**：晚安页重做为四台复古收音机 ——
  FM 90.6 故事台（读「一起读」书架正文）、FM 97.3 夜话台（关灯模式）、
  FM 104.1 音乐台（雨/风/炉火/白粉棕噪音 + 导入音频）、隐藏枕话台（心跳底噪 + 耳语）。
  切台先放程序化 BGM，后台生成广播稿 + Web Speech 朗读；纸条插话进入下一轮；保留定时器与 Wake Lock。
- **书架多源导入**：`books` 补 `source / source_id / source_meta / last_synced_at`，
  `reading_progress` 补 `sync_status / last_synced_at`；新增番茄目录导入（真实抓取书名/作者/封面/全量目录，
  正文因字体混淆不抓）、通用网页正文导入、来源能力表；进度标记 `local / pending`，不谎报已同步。
- **相册接入 Remember-Me**：相册页优先嵌入 `peanutsuee/Remember-Me` 的 Dusk Archive Dashboard；
  后端 `/api/gallery/remember/status` 探活 8787，侧车没起自动回退本地相册并给出启动命令。
- **开源清单**：新增 `Wren036/PhotoStack`、`AZHi-xinxin/LoverConnect-Enhanced`、
  `peanutsuee/Remember-Me`、`chuochuochuo36-png/midnight-fm`、`POf-L/Fanqie-novel-Downloader`、`linzj/fanqie-dl`。

### 调整

- 晚安的「白噪音 + 上传音频 + 定时器」保留，但整体并入 MIDNIGHT FM 的音乐台。
- 书架封面左上角显示来源角标（番茄 / 微信读书），导入框内新增番茄链接拉取。

### 测试

- 新增 `message-timestamps` 8、`radio-parse` 11、`reading-sources` 5，后端全套 **140/140**。
- 新增 `verify-photo-stack.js` 10/10。

## 2026-10-19

### 新增

- **情绪增量分析（前置旁路）**：`/chat/stream` 开流前，用独立的轻量模型管道读最近 4 条消息
  （后 2 条 80% / 前 2 条 20% 加权，`max_tokens=100`、`temperature=0`），
  只输出四维 JSON 增量：醋意 / 紧绷 / 委屈 / 克制；模型不可达时回退关键词。
- **四维情绪状态机**：`character_state` 扩为六维——占有欲与醋意、紧绷与情欲、克制与自控、
  示弱与委屈，外加爱意 / 思念。单轮位移封顶 ±6，委屈回落再封 3（被哄后要数轮缓冲），
  无事每轮朝常态回稳 1 点。
- **行为策略注入**：把数值翻译成不含数字的行为规范注入主模型——高醋意+低克制（短句、试探、冷硬）、
  高紧绷（命令与掌控）、委屈（嘴硬几轮再破功）、被顺毛（舒展温柔），并禁止说破规则。
- **Ombre Brain 记忆专线**：`.env` 配 `OB_BASE_URL` / `OB_API_TOKEN` 后，
  每轮与情绪分析并行检索 3 条记忆锚点注入 `[记忆回想]`；流式结束后异步归档本轮摘要，不阻塞界面。
- **内心面板扩容**：六条数值 + 「此刻心绪」标签 + 心境小剧场 + 行为策略标签。
- **资料备注**：资料卡片新增「备注」，填后作为聊天顶栏名字；AI 可用 `set_partner_remark` 改写。
- **语音输入**：输入条麦克风走 Web Speech API，定稿后自动发送。

### 调整

- **输入条重排**：文风药丸 → 麦克风 → 输入框 → 表情 → 微信式三态（空=「+」/ 有字=「发送」/ 生成中=「停止」）。
- **对白风格**：滑块、双按钮方案全部下线，最终定为**单颗 36×36 双态药丸**，点一下在 💕 碎片流 / 🩷 沉浸流之间翻面。
- 消息操作改为微信式长按浮层，菜单里新增「引用」；「形态预览」整套移除。

### 修复

- 情绪前置分析用 `userMessageId` 做幂等：同一条消息重试不重复累积，消息落库时也不再二次演进。
- 只有带 `conversationId` 的请求才走情绪 / OB 旁路，星空片单、听歌分析等辅助调用不受影响。
- 面板对旧后端缺失字段做兜底，环境变量的数值项过滤非法输入。

## 2026-10-18

- 聊天页按参考图改造：纯白底 + 浅蓝 / 浅灰气泡 + 内联时间戳。
- 内心入口挪到聊天名字上；长按消息改为深色浮层菜单。
- 移动端键盘视口跟随（`--app-h`）、晚安页 Wake Lock、忌口分级、碎片气泡更紧凑。
- 深夜来信信封主题（默认 / 纪念 / 夜色）自动挑选。
- 表情包支持分类；灵感待办池改为「灵感 ↔ 待办」二态。
