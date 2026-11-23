/**
 * AI 可调整的「白名单式外观预设」（2026-11-23）。
 *
 * 只开放已经存在的外观开关（主题 / 强调色 / 数字字体 / 气泡色），
 * 不把源码或任意 CSS 暴露给模型。前端按 version 判断是否应用一次，
 * 用户之后手动改的设置不会被每次刷新覆盖。
 */
import { getSettingValue, setSetting } from '../routes/settings.js';

const KEY = 'ui.ai.preset';

export const ACCENTS = ['blue', 'violet', 'rose', 'teal', 'amber'] as const;
export const BUBBLES = ['classic', 'rose', 'peach', 'mint', 'lavender'] as const;

export interface UiPreset {
  version: number;
  theme?: 'light' | 'dark';
  accent?: typeof ACCENTS[number];
  numFont?: 'serif' | 'sans';
  bubble?: typeof BUBBLES[number];
}

export function readUiPreset(): UiPreset {
  const raw = getSettingValue<UiPreset | null>(KEY, null);
  return raw && typeof raw === 'object' ? raw : { version: 0 };
}

/** 只接受白名单键；返回最终预设，version 每次变更都推进。 */
export function patchUiPreset(patch: Record<string, unknown>): UiPreset {
  const next: UiPreset = { ...readUiPreset() };
  if (patch.theme === 'light' || patch.theme === 'dark') next.theme = patch.theme;
  if (typeof patch.accent === 'string' && (ACCENTS as readonly string[]).includes(patch.accent)) {
    next.accent = patch.accent as UiPreset['accent'];
  }
  if (patch.numFont === 'serif' || patch.numFont === 'sans') next.numFont = patch.numFont;
  if (typeof patch.bubble === 'string' && (BUBBLES as readonly string[]).includes(patch.bubble)) {
    next.bubble = patch.bubble as UiPreset['bubble'];
  }
  next.version = Date.now();
  setSetting(KEY, next);
  return next;
}
