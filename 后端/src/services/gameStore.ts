/**
 * AI 生成的小游戏仓库（2026-11-23）。
 *
 * 模型不直接改前端源码，只产出一个**自包含 HTML**：落盘到 后端/data/games/，
 * 由 /api/games/:id/file 带 CSP 提供，前端用 sandbox iframe 打开。
 * 这样既能「说一声就多一个游戏」，又不会让模型碰到项目代码或用户数据。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newId } from '../utils/id.js';

const DIR = fileURLToPath(new URL('../../data/games/', import.meta.url));
const MAX_HTML = 200_000;

export interface AiGame {
  id: string;
  title: string;
  description: string;
  createdAt: number;
}

const SAFE_ID = /^[a-zA-Z0-9_-]{6,64}$/;
function metaPath(id: string) { return path.join(DIR, `${id}.json`); }
function htmlPath(id: string) { return path.join(DIR, `${id}.html`); }

async function ensureDir(): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
}

/** 去掉明显的整页跳转 / 外链脚本标签；真正的隔离靠 iframe sandbox + CSP。 */
function sanitizeHtml(raw: string): string {
  let s = String(raw ?? '').trim();
  s = s.replace(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '');
  s = s.replace(/\b(?:window\.)?(?:top|parent|opener)\s*\.\s*location\b/gi, 'void 0');
  return s;
}

export async function saveAiGame(input: { title: string; description?: string; html: string }): Promise<AiGame> {
  const title = String(input.title ?? '').trim().slice(0, 40);
  const html = sanitizeHtml(input.html ?? '');
  if (!title) throw new Error('title 不能为空');
  if (!html || html.length < 20) throw new Error('html 太短，不像一个游戏');
  if (html.length > MAX_HTML) throw new Error(`html 太大（上限 ${MAX_HTML / 1000}KB）`);
  await ensureDir();
  const id = newId();
  const meta: AiGame = {
    id,
    title,
    description: String(input.description ?? '').trim().slice(0, 160),
    createdAt: Date.now(),
  };
  await fs.writeFile(htmlPath(id), html, 'utf-8');
  await fs.writeFile(metaPath(id), JSON.stringify(meta), 'utf-8');
  return meta;
}

export async function listAiGames(): Promise<AiGame[]> {
  await ensureDir();
  const files = await fs.readdir(DIR).catch(() => [] as string[]);
  const out: AiGame[] = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(DIR, f), 'utf-8');
      const meta = JSON.parse(raw) as AiGame;
      if (meta && SAFE_ID.test(meta.id)) out.push(meta);
    } catch { /* 坏文件跳过 */ }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt).slice(0, 60);
}

export async function getAiGameHtml(id: string): Promise<string | null> {
  if (!SAFE_ID.test(id)) return null;
  try {
    return await fs.readFile(htmlPath(id), 'utf-8');
  } catch {
    return null;
  }
}
