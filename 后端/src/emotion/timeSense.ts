import { formatTimeInterval } from './rules.js';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 把小时映射到口语时段，给「时间感」信号用 */
export function describeTimeOfDay(d: Date): string {
  const h = d.getHours();
  if (h < 5) return '深夜';
  if (h < 8) return '凌晨';
  if (h < 11) return '上午';
  if (h < 13) return '中午';
  if (h < 17) return '下午';
  if (h < 19) return '傍晚';
  if (h < 23) return '晚上';
  return '深夜';
}

export function weekdayCN(d: Date): string {
  return WEEKDAYS[d.getDay()];
}

/**
 * 时间感信号：拼进系统提示词，让 AI 语气随「现在几点 / 周几 / 距上次对话多久」自适应。
 *
 * - `lastMessageAt` 为 `number`：补一句「距离 TA 上一条消息已经过了 X」，并按久不久给语气提示。
 * - 为 `null` / `undefined`：当作新对话，给一句开场提示（预览或拿不到历史时）。
 *
 * 复用 `emotion/rules.ts` 的 `formatTimeInterval` 做紧凑时长，保证和面板「距上次聊天」同一套措辞。
 */
export function buildTimeSense(now: Date, lastMessageAt?: number | null): string {
  const y = now.getFullYear();
  const mo = now.getMonth() + 1;
  const da = now.getDate();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const period = describeTimeOfDay(now);
  const lines = [
    `今天是 ${y} 年 ${mo} 月 ${da} 日 ${weekdayCN(now)}，现在 ${hh}:${mm}（${period}）。`,
  ];
  if (typeof lastMessageAt === 'number' && lastMessageAt > 0) {
    const gap = now.getTime() - lastMessageAt;
    if (gap >= 0) {
      const ago = formatTimeInterval(gap);
      const hint =
        gap >= 4 * 3_600_000
          ? '已经挺久没联系了，语气可以更想念、更主动一些。'
          : '若是刚聊过，就接着当下的节奏走。';
      lines.push(`距离 TA 上一条消息已经过了 ${ago}。${hint}`);
    } else {
      lines.push('这是一段新对话的开始。');
    }
  } else {
    lines.push('这是一段新对话的开始。');
  }
  return `【时间感】\n${lines.join('\n')}`;
}
