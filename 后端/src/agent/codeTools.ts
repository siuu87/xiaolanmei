import type { ToolDef } from '../adapters/types.js';
import * as ws from './workspace.js';

/**
 * 智能编程内置工具（阶段 10）：文件读写 / 搜索 / 命令 / git。
 * 只读工具免确认；write/edit/run_command/git_commit 需要用户确认（在 agent/run.ts 走确认队列）。
 */

export interface CodeTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresConfirm: boolean;
  execute(args: Record<string, unknown>): Promise<string>;
}

function str(v: unknown): string {
  return String(v ?? '').trim();
}

const CODE_TOOLS: CodeTool[] = [
  {
    name: 'list_dir',
    description: '列出工作区某目录下的条目（跳过 node_modules/.git 等）',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: '相对工作区路径，根为 "."' } },
    },
    requiresConfirm: false,
    async execute(args) {
      return ws.listDir(str(args.path)).map((e) => `${e.type === 'dir' ? '📁' : '📄'} ${e.path}`).join('\n') || '(空目录)';
    },
  },
  {
    name: 'read_file',
    description: '读取工作区内某个文件的内容',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: '相对工作区路径' } },
      required: ['path'],
    },
    requiresConfirm: false,
    async execute(args) {
      return ws.readFile(str(args.path)).slice(0, 12000);
    },
  },
  {
    name: 'search_files',
    description: '在工作区内按正则搜索文本文件，返回匹配行',
    parameters: {
      type: 'object',
      properties: { pattern: { type: 'string', description: '正则表达式（忽略大小写）' } },
      required: ['pattern'],
    },
    requiresConfirm: false,
    async execute(args) {
      const hits = ws.searchFiles(str(args.pattern));
      if (hits.length === 0) return '没有匹配结果';
      return hits.map((h) => `${h.path}:${h.line}  ${h.text}`).join('\n');
    },
  },
  {
    name: 'write_file',
    description: '创建或整体覆盖一个文件',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string', description: '完整文件内容' },
      },
      required: ['path', 'content'],
    },
    requiresConfirm: true,
    async execute(args) {
      const p = str(args.path);
      if (!p) throw new Error('缺少 path');
      ws.writeFile(p, String(args.content ?? ''));
      return `已写入 ${p}`;
    },
  },
  {
    name: 'edit_file',
    description: '把文件中第一处匹配的原文替换为新内容（目标修改）',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_text: { type: 'string', description: '要替换的原文（需与文件一致）' },
        new_text: { type: 'string', description: '替换后的内容' },
      },
      required: ['path', 'old_text', 'new_text'],
    },
    requiresConfirm: true,
    async execute(args) {
      ws.editFile(str(args.path), String(args.old_text ?? ''), String(args.new_text ?? ''));
      return `已修改 ${str(args.path)}`;
    },
  },
  {
    name: 'run_command',
    description: '在工作区目录执行一条 shell 命令（有 30s 超时），用于构建/测试等',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command'],
    },
    requiresConfirm: true,
    async execute(args) {
      return ws.runCommand(str(args.command));
    },
  },
  {
    name: 'git_status',
    description: '查看工作区 git 状态',
    parameters: { type: 'object', properties: {} },
    requiresConfirm: false,
    async execute() {
      return ws.gitStatus();
    },
  },
  {
    name: 'git_diff',
    description: '查看工作区未暂存的改动摘要',
    parameters: { type: 'object', properties: {} },
    requiresConfirm: false,
    async execute() {
      return ws.gitDiff();
    },
  },
  {
    name: 'git_commit',
    description: '把当前所有改动提交为一个 commit',
    parameters: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
    requiresConfirm: true,
    async execute(args) {
      return ws.gitCommit(str(args.message));
    },
  },
];

const byName = new Map(CODE_TOOLS.map((t) => [t.name, t]));

export function listCodeTools(): CodeTool[] {
  return CODE_TOOLS;
}

export function getCodeTool(name: string): CodeTool | undefined {
  return byName.get(name);
}

export function hasCodeTool(name: string): boolean {
  return byName.has(name);
}

export function codeToolDef(t: CodeTool): ToolDef {
  return {
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  };
}
