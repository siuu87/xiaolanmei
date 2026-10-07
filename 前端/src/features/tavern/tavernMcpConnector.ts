// ===== 酒馆（SillyTavern）MCP 接入点 =====
// 真实酒馆数据需在「MCP 管理」页配置 SillyTavern 的 MCP 服务器后接入；
// 当前为占位数据，组件层按真实接口形态调用，接入真实 MCP 时替换本文件实现即可。
// 不涉及真实账号与密钥。

export interface TavernCharacter {
  id: string;
  name: string;
  avatar: string; // emoji 头像
  description: string; // 人设一句话简介
  tags: string[];
  greeting: string; // 开场白
}

export interface TavernStatus {
  connected: boolean;
  source: string;
  serverUrl: string;
}

/** 模拟网络延迟，让占位接口更像真实的异步 MCP 调用 */
function mock<T>(data: T, delay = 200): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), delay));
}

// MCP 接入点：连接状态
export function getTavernStatus(): Promise<TavernStatus> {
  return mock({ connected: false, source: 'sillytavern-mcp', serverUrl: 'http://localhost:8000' });
}

// MCP 接入点：角色卡列表（对应 MCP 工具 list_characters）
export function listCharacters(): Promise<TavernCharacter[]> {
  return mock([
    {
      id: 'su-wanqing',
      name: '苏晚晴',
      avatar: '🐰',
      description: '温柔体贴的学姐，总是把你照顾得很好。',
      tags: ['温柔', '学姐', '日常'],
      greeting: '你来啦～今天过得怎么样？我给你留了杯奶茶。',
    },
    {
      id: 'lu-chen',
      name: '陆沉',
      avatar: '🖤',
      description: '冷峻霸总，嘴上不饶人，其实很在意你。',
      tags: ['霸总', '都市'],
      greeting: '回来了？过来。',
    },
    {
      id: 'xing-ye',
      name: '星野',
      avatar: '🌠',
      description: '元气满满的旅行少女，下一站永远在路上。',
      tags: ['元气', '冒险'],
      greeting: '嘿！下一站你想去哪儿？我都有攻略！',
    },
    {
      id: 'bai-qi',
      name: '白起',
      avatar: '⚔️',
      description: '沉默寡言的古风剑客，剑比话多。',
      tags: ['古风', '武侠'],
      greeting: '……你来了。',
    },
  ]);
}

// MCP 接入点：发送消息（真实实现由酒馆 MCP 驱动角色回复）
export function sendMessage(character: TavernCharacter, _text: string): Promise<string> {
  return mock(`（占位回复）${character.name} 想回你，但还没接上真正的酒馆～ 接入 SillyTavern MCP 后就能真聊了 🍺`);
}
