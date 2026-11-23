/**
 * 酒馆提示词组装（2026-11-20 提取为共享模块）。
 *
 * 原来内联在 routes/tavern.ts，ST 接管后聊天路由也要用同一套逻辑，
 * 提取到这里保证两边提示词一字不差。tavern.ts（本地数据源）与
 * sillytavern.ts（ST 数据源）都消费这里的中立结构，各自做字段映射。
 */
import type { ChatMessage } from '../adapters/types.js';

/** 世界书条目的中立结构：本地行与 ST entry 都映射到它 */
export interface PromptWorldEntry {
  content: string;
  priority: number;
  position: 'before' | 'after';
  enabled: boolean;
  keywords: string[];
  /** 次级排序用；ST 条目没有该字段，缺省 0 */
  sortOrder?: number;
}

/** 角色卡的中立结构 */
export interface PromptCharacter {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  systemPrompt: string;
}

/** 用户人设卡的中立结构 */
export interface PromptPersona {
  name: string;
  description: string;
}

/** 把逗号 / 顿号 / 换行分隔的字符串解析成去重后的关键词数组 */
export function parseKeywords(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,，、\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 世界书命中：任一词出现在最近对话文本里即注入 */
export function matchWorldbook(entries: PromptWorldEntry[], messages: ChatMessage[]): PromptWorldEntry[] {
  const text = messages
    .slice(-12)
    .map((m) => m.content)
    .join('\n')
    .toLowerCase();
  if (!text) return [];
  return entries
    .filter((w) => w.enabled)
    .filter((w) => {
      const kw = w.keywords;
      if (kw.length === 0) return false;
      return kw.some((k) => text.includes(k.toLowerCase()));
    })
    .sort((a, b) => b.priority - a.priority || (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** 组装角色扮演 system 提示词：世界书(before) + 角色 + 世界书(after) + 用户人设 + 附加指令 */
export function buildSystemPrompt(
  character: PromptCharacter,
  persona: PromptPersona | null,
  matched: PromptWorldEntry[],
): string {
  const before = matched.filter((w) => w.position !== 'after');
  const after = matched.filter((w) => w.position === 'after');
  const parts: string[] = [];

  if (before.length) {
    parts.push(`【世界书】以下是与当前剧情相关的世界观/设定，请自然地遵守：\n${before.map((w) => w.content).join('\n\n')}`);
  }

  const charParts: string[] = [];
  if (character.description) charParts.push(character.description);
  if (character.personality) charParts.push(character.personality);
  if (character.scenario) charParts.push(`【当前场景】\n${character.scenario}`);
  parts.push(
    `你是「${character.name}」，正在和用户进行沉浸式角色扮演。请始终以该角色的身份、语气、立场说话，不要跳出角色，不要以“助手”或“AI”自居，也不要替用户发言或替用户做决定。\n\n【角色设定】\n${charParts.join('\n') || '（无更多设定）'}`,
  );

  if (after.length) {
    parts.push(`【补充设定】\n${after.map((w) => w.content).join('\n\n')}`);
  }

  if (persona) {
    parts.push(
      `【用户角色】用户正在扮演「${persona.name}」${persona.description ? `：${persona.description}` : ''}。请称呼对方为「${persona.name}」，把对方当成剧情中的角色而非普通用户。`,
    );
  }

  if (character.systemPrompt) {
    parts.push(`【附加指令】\n${character.systemPrompt}`);
  }

  parts.push('【规则】用自然、贴合角色设定的语气回应，中文为主，篇幅适中。不要提到“模型”“系统提示词”等幕后概念。');

  return parts.join('\n\n');
}
