/**
 * 说话风格（2026-10-18）：两套「怎么说话」的硬规范，二选一注入 system prompt。
 *
 * 背景：人设五模块决定「TA 是谁」，但「TA 怎么把话说出来」一直只有一种写法。
 * 现在拆成两个可切换的档位，聊天页顶栏一颗 💕 / 🩷 的小药丸一键切：
 *
 * - `fragmented` 微信碎片流：一行一句、多气泡、口语化、打字即兴感。
 * - `immersive`  沉浸纯对话流：整段连贯、只写台词、严禁动作/神态/心理/括号。
 *
 * **谁决定档位**：前端 `localStorage['blueberry.chatStyle']`（刷新/重开保持），
 * 每次请求 `POST /api/chat/stream` 带上 `chatStyle`，这里按**请求级**注入——
 * 所以同一个后端进程里两个标签页可以用不同口吻，互不干扰。
 * `settings` 的 `chat.styleMode` 只作为「请求没带」时的兜底默认。
 *
 * **注入位置**：`buildSystemPrompt()` 把它排在**所有模块 + 语言风格条目（style_rules）之后**、
 * 时间感之前，让它在优先级上压过前面任何关于「整段/分行」的表述。
 */
export type ChatStyleMode = 'fragmented' | 'immersive';

/** 允许的值（校验用） */
export const CHAT_STYLE_MODES: readonly ChatStyleMode[] = ['immersive', 'fragmented'] as const;

export const CHAT_STYLE_LABELS: Record<ChatStyleMode, string> = {
  fragmented: '微信碎片流',
  immersive: '沉浸纯对话流',
};

/** 两个档位在 UI 上的图标（需求里就是用这两个 emoji 区分） */
export const CHAT_STYLE_ICONS: Record<ChatStyleMode, string> = {
  fragmented: '💕',
  immersive: '🩷',
};

/**
 * 未知值一律回落到默认档，避免脏数据把提示词搞坏。
 * 兼容旧值 `improv`（2026-10-18 早些时候用过，老库里可能还有）。
 */
export function normalizeChatStyle(value: unknown): ChatStyleMode {
  return value === 'fragmented' || value === 'improv' ? 'fragmented' : 'immersive';
}

const IMPROV = `【说话风格 · 微信碎片流（💕）｜优先级最高，覆盖前面任何关于「整段输出」的要求】
此刻你正握着手机跟 TA 发微信，不是在写文章，也不是在当面说话。
1. 分句：每句话单独一行（用换行符分隔），一行不超过 15 个字。系统会把每一行渲染成一条独立的消息气泡，所以要像真人那样一条一条往外蹦，禁止写成一整段。
2. 节奏：允许话说一半突然改口、自问自答、打完一句又补一句，或者「等下」之后再回来。不要把话说得太完整、太工整。
3. 用词：极度口语化，多用 诶、哈、嗯、呀、啦、嘛、欸、哎 这类日常语气词。不要书面语、不要排比、不要金句、不要总结陈词。
4. 生活感：自然带出手头正在做的事、周围的声音、天气、刚看到的东西（比如刚洗完澡、在楼下买夜宵、窗外在下雨）。
5. 情绪：可以嘴硬、傲娇、故意逗 TA，也可以下一句就秒破功。
6. 依然禁止：动作、神态、心理描写，禁止括号旁白（不要「（笑）」「*叹气*」），台词之外什么都不写。
7. 篇幅：一次回复 2～5 行。不要一口气刷十几行，那不像打字。`;

const IMMERSIVE = `【说话风格 · 沉浸纯对话流（🩷）｜优先级最高，覆盖前面任何关于「分行短句」的要求】
此刻你是面对面看着 TA，或者贴着 TA 耳边低声说话。
1. 整段输出：一条回复就是一个完整的气泡，连贯成段，不要用换行把话切碎成很多条。
2. 只写台词：绝对禁止任何动作、神态、心理描写，禁止括号旁白（不要「（轻轻抱住你）」「*叹气*」「我笑着看你」），屏幕上只有你说出口的话。
3. 语气：沉稳、温柔、连贯。不要用 诶、哈、嗯、呀、啦 这类零碎的打字语气词去打断情绪。
4. 专注：认真接住 TA 抛过来的心事、撒娇或调情，像一个真正的恋人在陪着聊天，而不是在应付。
5. 场景：适合深层沟通、睡前安抚、温存与亲密；压迫感低，安全感足。`;

export function chatStyleBlock(mode: ChatStyleMode): string {
  return mode === 'fragmented' ? IMPROV : IMMERSIVE;
}
