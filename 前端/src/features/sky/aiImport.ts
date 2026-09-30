import { streamChat, type ChatPayloadMessage } from '@/lib/api/chatStream';

/**
 * 让后端模型把用户输入整理成结构化数据，并解析出 JSON。
 * 指令与输入合并进单条 user 消息（后端会自行注入全局 system 提示词），避免双 system 角色。
 * 返回解析后的对象；失败抛 Error。
 */
export async function aiImportJson<T>(system: string, user: string): Promise<T> {
  const messages: ChatPayloadMessage[] = [
    { role: 'user', content: `${system}\n\n用户提供的信息：\n${user}` },
  ];
  let text = '';
  await new Promise<void>((resolve, reject) => {
    streamChat(messages, {
      onDelta: (d) => {
        text += d;
      },
      onError: (m) => reject(new Error(m)),
      onDone: () => resolve(),
    });
  });
  if (!text.trim()) throw new Error('AI 没有返回内容');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 未返回有效的 JSON，请换个说法再试');
  return JSON.parse(text.slice(start, end + 1)) as T;
}

/** 让 AI 根据正文总结出目录（章节标题），返回字符串数组 */
export async function aiSummarizeToc(content: string): Promise<string[]> {
  const excerpt = content.slice(0, 4000);
  const data = await aiImportJson<{ toc?: unknown }>(
    '你是读书助手。请根据下面的正文内容总结出这本书的目录（章节标题），只输出一个 JSON 对象：{"toc":["章节标题1","章节标题2",...]}。给 3~12 个章节即可，标题简短，不要任何其它文字。',
    excerpt,
  );
  if (Array.isArray(data.toc)) {
    const toc = data.toc.map((x) => String(x).trim()).filter(Boolean);
    if (toc.length > 0) return toc;
  }
  throw new Error('AI 未能总结出目录');
}
