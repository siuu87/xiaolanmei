/**
 * export-conversation.mjs — 把小蓝莓的聊天对话导出成心潮（Ombre Brain）
 * 「历史对话导入」能直接吃的 Markdown 对话文件。
 *
 * 用法（cwd 必须在 后端/，否则 DATABASE_PATH 会指错）：
 *   node scripts/export-conversation.mjs [输出路径]
 *
 * 心潮 import_memory.py 的 _parse_markdown 认的行首前缀：
 *   用户侧：human: / user: / 你: / 我:
 *   AI 侧：assistant: / claude: / ai: / gpt: / bot: / deepseek:
 * 注意「我:」在心潮里被归到**用户侧**，而小蓝莓的 AI 是「我」侧，
 * 所以这里用户写「你:」、AI 写「AI:」，避免角色被反。
 *
 * 内容里若出现行首带角色前缀的行，把半角冒号转成全角，
 * 防止心潮解析器把它误切成新一轮对话。
 *
 * 导出前会过滤无记忆价值的系统产物（模型报错、通话占位、拍戳动作、
 * 测试消息），并对完全重复的对话段去重，避免浪费心潮的 LLM 提取调用。
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DATABASE_PATH ?? './data/blueberry.db';
const OUT_PATH =
  process.argv[2] ??
  path.resolve(process.cwd(), '..', '导出', '心潮记忆导入-对话.md');

const db = new Database(DB_PATH, { readonly: true });

/** 心潮解析器认的角色前缀（行首、半角冒号） */
const ROLE_PREFIXES = [
  'human:', 'user:', '你:', '我:',
  'assistant:', 'claude:', 'ai:', 'gpt:', 'bot:', 'deepseek:',
];

/** 把一行里行首的角色前缀冒号转全角，避免被心潮误切成新对话轮 */
function guardLine(line) {
  const lower = line.toLowerCase();
  for (const prefix of ROLE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      // 只把紧跟前缀的那个半角冒号换成全角
      return line.slice(0, prefix.length - 1) + '：' + line.slice(prefix.length);
    }
  }
  return line;
}

/** 角色映射：小蓝莓 → 心潮对话行前缀 */
function rolePrefix(role) {
  if (role === 'user') return '你:';
  if (role === 'assistant') return 'AI:';
  return null; // system / tool 不进对话文件
}

/**
 * 无记忆价值的系统产物：报错、通话占位、拍戳动作、测试消息。
 * 这些喂给心潮只会浪费 LLM 提取调用，还可能提炼出垃圾记忆。
 */
const NOISE_PATTERNS = [
  /^⚠️\s*无法连接模型服务/,
  /^⚠️/,
  /^（(视频|语音)?通话[^）]*）$/,
  /^（通话未接通）$/,
  /^拍了拍\s/,
  /^TA\s*戳了戳你$/,
  /^测试消息$/,
];

/** 是否为无记忆价值的噪音消息 */
function isNoise(role, content) {
  const text = content.trim();
  if (!text) return true;
  return NOISE_PATTERNS.some((re) => re.test(text));
}

// 按对话分组，组内按时间排序
const convRows = db
  .prepare(
    `SELECT id, title, created_at FROM conversations
     WHERE deleted_at IS NULL ORDER BY created_at ASC`
  )
  .all();

const msgStmt = db.prepare(
  `SELECT role, content, created_at FROM messages
   WHERE conversation_id = ? AND deleted_at IS NULL
   ORDER BY created_at ASC, rowid ASC`
);

const parts = [];
parts.push('# 小蓝莓 · 对话历史导出');
parts.push('');
parts.push(
  `> 导出时间：${new Date().toLocaleString('zh-CN')}`
);
parts.push('');

let totalMsgs = 0;
let totalConvs = 0;
const seenConv = new Set(); // 对话段签名，用于去掉完全重复的对话

for (const conv of convRows) {
  const msgs = msgStmt.all(conv.id);
  const usable = msgs
    .filter((m) => rolePrefix(m.role) !== null)
    .filter((m) => !isNoise(m.role, m.content));
  if (usable.length === 0) continue;

  // 对话段签名：标题 + 全部消息内容。完全相同的段只留第一段
  const signature =
    (conv.title || '未命名对话') +
    '\n' +
    usable.map((m) => `${rolePrefix(m.role)} ${m.content.trim()}`).join('\n');
  if (seenConv.has(signature)) continue;
  seenConv.add(signature);

  parts.push(`## ${conv.title || '未命名对话'}`);
  parts.push('');
  totalConvs += 1;

  for (const m of usable) {
    const prefix = rolePrefix(m.role);
    const content = m.content.replace(/\r\n/g, '\n').trim();
    if (!content) continue;
    const lines = content.split('\n').map(guardLine);
    // 首行直接带前缀，后续行原样（已 guard）
    parts.push(`${prefix} ${lines[0]}`);
    for (const line of lines.slice(1)) {
      parts.push(line);
    }
    parts.push('');
    totalMsgs += 1;
  }
}

db.close();

const output = parts.join('\n');
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, output, 'utf8');

const kb = (Buffer.byteLength(output, 'utf8') / 1024).toFixed(1);
console.log(`✔ 已导出 ${totalConvs} 段对话 / ${totalMsgs} 条消息 → ${OUT_PATH}`);
console.log(`  文件大小 ${kb} KB`);
