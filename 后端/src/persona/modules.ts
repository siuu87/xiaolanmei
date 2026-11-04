/**
 * 人设系统（2026-10-29 起清空）。
 *
 * 原来这里定义了「小蓝莓」五模块人设（角色定位 / 语言风格 / 行为模式 / 事实备忘 /
 * 系统联动），随代码入库、由 `seedPersonaModules()` 幂等播种进 `prompts` 表。
 * 应用户要求，**预设的聊天对象信息全部清除**：
 * - 源头置空：`PERSONA_MODULES = []`，重启后端不会再把已删的模块种回来；
 * - 库里的五模块已软删（deleted_at），`profile.partnerRemark`（「哥哥」）已删；
 * - 前端称呼兜底「哥哥」改为中性「对方」。
 *
 * 之后想要人设，在「角色」面板自己写 global 提示词即可；变量渲染
 * （`renderVariables`）与 `/api/persona/seed` 接口保持原样不受影响。
 */

export interface PersonaModule {
  /** 面板里显示的名字，也是幂等判重的键 */
  name: string;
  /** 正文（system 提示词片段） */
  content: string;
  /**
   * 变量默认值，可在「角色」面板里改。
   * **跨模块共享**：同一个 key 只在这一个模块声明，但任何模块的正文都能引用它。
   */
  variables: Record<string, string>;
  /** 拼接顺序 */
  sortOrder: number;
}

/**
 * 人设变量的兜底默认值（优先级低于任何模块的 `variables`）。
 * 预设已清空，这里不再声明任何称呼 / 纪念日；未知 `{{key}}` 渲染为空字符串。
 */
export const PERSONA_DEFAULT_VARS: Record<string, string> = {};

/** 预设人设模块：空（2026-10-29 清除，见文件头注释） */
export const PERSONA_MODULES: PersonaModule[] = [];

/** 恋爱起点兜底：空串 = 未设置（`loveDaysSince` 对无效日期返回 0，不会产出 NaN） */
export const PERSONA_ANNIVERSARY_FALLBACK = '';
