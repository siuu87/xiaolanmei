/**
 * SillyTavern 代理路由（2026-11-20）。
 *
 * 把 ST 客户端（services/sillytavern.ts）的能力暴露成 /api/st/* 给前端：
 * ST 是唯一数据源，小蓝莓后端代持凭据，前端永远拿不到 ST 地址与账号。
 *
 * 端点设计（DTO 与小蓝莓酒馆模块对称，前端几乎不用改）：
 * - GET  /st/status              探活
 * - GET  /st/avatar/:file        头像二进制代理（前端不直连 ST）
 * - GET/POST       /st/characters  角色卡列表 / 新建（支持 base64 头像 → multipart）
 * - PATCH/DELETE   /st/characters/:id  编辑 / 删除（:id = ST 的 PNG 文件名）
 * - GET/POST       /st/worldbook   世界书列表（ST 文件摊平成条目）/ 新建条目
 * - PATCH/DELETE   /st/worldbook/:id    编辑 / 删除条目（:id = 文件名#entry键）
 * - POST /st/chat                流式对话（提示词组装走共享模块，生成走 ST chat-completions）
 * - GET  /st/chats/:avatar       某角色卡的聊天列表
 * - GET/DELETE     /st/chat/:chatfile  读 / 删聊天
 * - POST /st/chat/save           保存聊天
 *
 * 人设卡 ST 无 REST API，保留本地 /api/tavern/personas，聊天路由直接查本地表。
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tavernPersonas } from '../db/schema.js';
import {
  getStHealth,
  listStCharacters,
  createStCharacter,
  createStCharacterMultipart,
  editStCharacter,
  editStCharacterMultipart,
  deleteStCharacter,
  listStCharacterChats,
  listStWorldInfo,
  getStWorldInfo,
  saveStWorldInfo,
  deleteStWorldInfo,
  getStChat,
  saveStChat,
  deleteStChat,
  streamStChatCompletion,
  readStConnConfig,
  readStConnConfigRaw,
  saveStConnConfig,
  probeStConfig,
  type StCharacter,
  type StWorldEntry,
} from '../services/sillytavern.js';
import { matchWorldbook, buildSystemPrompt, type PromptWorldEntry } from '../services/tavernPrompt.js';
import type { ChatMessage } from '../adapters/types.js';

/* ------------------------------ DTO 映射 ------------------------------ */

/** ST 角色卡 → 小蓝莓 DTO（id = PNG 文件名） */
function toCharacterDTO(c: StCharacter) {
  return {
    id: c.avatar,
    name: c.ch_name,
    avatar: c.avatar,
    description: c.description ?? null,
    personality: c.personality ?? null,
    scenario: c.scenario ?? null,
    firstMessage: c.first_mes ?? null,
    systemPrompt: null as string | null,
    tags: Array.isArray(c.tags) ? c.tags : [],
    sortOrder: 0,
    createdAt: Date.parse(c.create_date ?? '') || 0,
    updatedAt: Date.parse(c.create_date ?? '') || 0,
  };
}

/** ST 世界书条目 → 中立结构（position: 0→before, 10→after） */
function toPromptWorldEntry(fileName: string, key: string, e: StWorldEntry): PromptWorldEntry {
  return {
    content: e.content,
    priority: e.priority,
    position: e.position === 10 ? 'after' : 'before',
    enabled: e.enabled,
    keywords: Array.isArray(e.keys) ? e.keys : [],
  };
}

/** 世界书条目 id = 文件名#entry键（前端需 encodeURIComponent） */
function entryId(fileName: string, key: string): string {
  return `${fileName}#${key}`;
}

function parseEntryId(id: string): { file: string; key: string } | null {
  const idx = id.indexOf('#');
  if (idx <= 0 || idx === id.length - 1) return null;
  return { file: id.slice(0, idx), key: id.slice(idx + 1) };
}

/** base64 data URL → Blob（供 multipart 上传） */
function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl.trim());
  if (!m) return null;
  const mime = m[1] || 'image/png';
  const isBase64 = !!m[2];
  const body = isBase64 ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8');
  return new Blob([body], { type: mime });
}

/* ------------------------------ 世界书读写 ------------------------------ */

/** 读一个世界书文件，不存在则返回 null */
async function readWorldFile(name: string) {
  return getStWorldInfo(name);
}

/** 写一个世界书文件；失败返回 false */
async function writeWorldFile(name: string, data: { name: string; entries: Record<string, StWorldEntry> }): Promise<boolean> {
  return saveStWorldInfo(name, data);
}

/* ------------------------------ 路由 ------------------------------ */

export async function sillytavernRoutes(app: FastifyInstance): Promise<void> {
  // ===== 连接配置（界面填写，存 settings 表，改完当场生效）=====
  // GET 脱敏：密码只回 hasPassword，永不回明文。
  app.get('/st/config', async () => readStConnConfig());

  app.put('/st/config', async (req) => {
    const body = (req.body ?? {}) as { url?: unknown; user?: unknown; password?: unknown; timeoutMs?: unknown };
    // url 留空是合法的「断开 ST」操作：存空地址 → 酒馆回退本地数据。
    const url = String(body.url ?? '').trim().replace(/\/+$/, '');
    // 密码规则：传新值 = 覆盖；留空/不传 = 沿用已存；传 '__CLEAR__' = 清空。
    // （脱敏 GET 拿不到明文，故留空时后端内部读回原密码，避免编辑地址时误清密码）
    const savedPassword = readStConnConfigRaw().password;
    const pass = body.password === undefined ? savedPassword : String(body.password);
    const password = pass === '' ? savedPassword : pass === '__CLEAR__' ? '' : pass;
    saveStConnConfig({
      url,
      user: String(body.user ?? ''),
      password,
      timeoutMs: Number(body.timeoutMs) || 5000,
    });
    return readStConnConfig();
  });

  // 连通性测试：用刚提交（或已保存）的配置现探一次 /version，不落库。
  app.post('/st/config/test', async (req) => {
    const body = (req.body ?? {}) as { url?: unknown; user?: unknown; password?: unknown; timeoutMs?: unknown };
    const testCfg = {
      url: String(body.url ?? '').trim().replace(/\/+$/, ''),
      user: String(body.user ?? ''),
      password: String(body.password ?? ''),
      timeoutMs: Number(body.timeoutMs) || 5000,
    };
    return probeStConfig(testCfg);
  });

  // ===== 探活 =====
  app.get('/st/status', async () => getStHealth());

  // ===== 头像二进制代理 =====
  // ST 角色头像走 /thumbnail?file=<png>&type=avatar（1.19 真实端点），前端拿代理 URL 不接触 ST 地址。
  app.get('/st/avatar/:file', async (req, reply) => {
    const { file } = req.params as { file: string };
    const health = await getStHealth();
    if (!health.up || !health.url) {
      reply.code(502).send({ message: 'ST 未连接' });
      return;
    }
    try {
      const avatarUrl = `${health.url}/thumbnail?file=${encodeURIComponent(file)}&type=avatar&animated=true`;
      const res = await fetch(avatarUrl, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok || !res.body) {
        reply.code(404).send({ message: '头像不存在' });
        return;
      }
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': res.headers.get('content-type') ?? 'image/png',
        'Cache-Control': 'public, max-age=3600',
      });
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!reply.raw.writableEnded) reply.raw.write(value);
      }
      reply.raw.end();
    } catch {
      reply.code(502).send({ message: 'ST 请求失败' });
    }
  });

  // ===== 角色卡 =====
  app.get('/st/characters', async () => {
    const chars = await listStCharacters();
    return chars.map(toCharacterDTO);
  });

  app.post('/st/characters', async (req, reply) => {
    const body = (req.body ?? {}) as {
      name?: string;
      avatar?: string;
      description?: string;
      personality?: string;
      scenario?: string;
      firstMessage?: string;
      tags?: string[];
      /** base64 data URL；传了则走 multipart 上传真实头像 */
      avatarImage?: string;
    };
    const name = body.name?.trim();
    if (!name) {
      reply.code(400).send({ message: 'name 必填' });
      return;
    }
    const health = await getStHealth();
    if (!health.up) {
      reply.code(502).send({ message: 'ST 未连接，无法创建角色卡' });
      return;
    }

    const input = {
      ch_name: name,
      description: body.description ?? '',
      personality: body.personality ?? '',
      scenario: body.scenario ?? '',
      first_mes: body.firstMessage ?? '',
      tags: Array.isArray(body.tags) ? body.tags : [],
    };

    const avatarImage = body.avatarImage?.trim() ? dataUrlToBlob(body.avatarImage) : null;
    const avatar = avatarImage
      ? await createStCharacterMultipart(input, avatarImage)
      : await createStCharacter(input);
    if (!avatar) {
      reply.code(502).send({ message: 'ST 创建角色卡失败' });
      return;
    }
    reply.code(201).send({ id: avatar, avatar, createdAt: Date.now() });
  });

  app.patch('/st/characters/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!id.endsWith('.png')) {
      reply.code(400).send({ message: '角色卡 id 应为 PNG 文件名' });
      return;
    }
    const body = (req.body ?? {}) as {
      name?: string;
      description?: string;
      personality?: string;
      scenario?: string;
      firstMessage?: string;
      tags?: string[];
      avatarImage?: string;
    };
    const health = await getStHealth();
    if (!health.up) {
      reply.code(502).send({ message: 'ST 未连接' });
      return;
    }
    const ch = await listStCharacters().then((all) => all.find((c) => c.avatar === id));
    const input = {
      avatar_url: id,
      ch_name: body.name?.trim() || ch?.ch_name || id.replace(/\.png$/, ''),
      description: body.description ?? ch?.description ?? '',
      personality: body.personality ?? ch?.personality ?? '',
      scenario: body.scenario ?? ch?.scenario ?? '',
      first_mes: body.firstMessage ?? ch?.first_mes ?? '',
      tags: Array.isArray(body.tags) ? body.tags : ch?.tags ?? [],
    };
    const avatarImage = body.avatarImage?.trim() ? dataUrlToBlob(body.avatarImage) : null;
    const ok = avatarImage
      ? await editStCharacterMultipart(input, avatarImage)
      : await editStCharacter(input);
    if (!ok) {
      reply.code(502).send({ message: 'ST 编辑角色卡失败' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/st/characters/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!id.endsWith('.png')) {
      reply.code(400).send({ message: '角色卡 id 应为 PNG 文件名' });
      return;
    }
    const health = await getStHealth();
    if (!health.up) {
      reply.code(502).send({ message: 'ST 未连接' });
      return;
    }
    const ok = await deleteStCharacter(id, true);
    if (!ok) {
      reply.code(502).send({ message: 'ST 删除角色卡失败' });
      return;
    }
    reply.send({ ok: true });
  });

  // ===== 世界书 =====
  // ST 一个文件含多条 entries；小蓝莓前端按「一条一条」管理，这里摊平。
  app.get('/st/worldbook', async () => {
    const files = await listStWorldInfo();
    const rows: Array<{
      id: string;
      name: string;
      keywords: string[];
      content: string;
      priority: number;
      position: 'before' | 'after';
      enabled: boolean;
      sortOrder: number;
    }> = [];
    for (const f of files) {
      const data = await getStWorldInfo(f.name);
      if (!data || !data.entries) continue;
      for (const [key, e] of Object.entries(data.entries)) {
        rows.push({
          id: entryId(f.name, key),
          name: e.comment || f.name,
          keywords: Array.isArray(e.keys) ? e.keys : [],
          content: e.content ?? '',
          priority: e.priority ?? 0,
          position: (e.position ?? 0) === 10 ? 'after' : 'before',
          enabled: e.enabled ?? true,
          sortOrder: 0,
        });
      }
    }
    return rows;
  });

  app.post('/st/worldbook', async (req, reply) => {
    const body = (req.body ?? {}) as {
      name?: string;
      keywords?: string[];
      content?: string;
      priority?: number;
      position?: 'before' | 'after';
      enabled?: boolean;
    };
    const name = body.name?.trim();
    const content = body.content?.trim();
    if (!name || !content) {
      reply.code(400).send({ message: 'name 与 content 必填' });
      return;
    }
    const health = await getStHealth();
    if (!health.up) {
      reply.code(502).send({ message: 'ST 未连接' });
      return;
    }
    const data = (await readWorldFile(name)) ?? { name, entries: {} as Record<string, StWorldEntry> };
    const key = `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const entry: StWorldEntry = {
      keys: Array.isArray(body.keywords) ? body.keywords : [],
      content: content,
      priority: body.priority ?? 0,
      position: body.position === 'after' ? 10 : 0,
      enabled: body.enabled ?? true,
      constant: false,
      selective: false,
    };
    data.entries[key] = entry;
    const ok = await writeWorldFile(name, data);
    if (!ok) {
      reply.code(502).send({ message: 'ST 保存世界书失败' });
      return;
    }
    reply.code(201).send({ id: entryId(name, key), createdAt: Date.now() });
  });

  app.patch('/st/worldbook/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parts = parseEntryId(id);
    if (!parts) {
      reply.code(400).send({ message: '世界书条目 id 格式应为 文件名#键' });
      return;
    }
    const body = (req.body ?? {}) as {
      name?: string;
      keywords?: string[];
      content?: string;
      priority?: number;
      position?: 'before' | 'after';
      enabled?: boolean;
    };
    const health = await getStHealth();
    if (!health.up) {
      reply.code(502).send({ message: 'ST 未连接' });
      return;
    }
    const data = await readWorldFile(parts.file);
    const entry = data?.entries?.[parts.key];
    if (!data || !entry) {
      reply.code(404).send({ message: '世界书条目不存在' });
      return;
    }
    if (body.keywords !== undefined) entry.keys = Array.isArray(body.keywords) ? body.keywords : [];
    if (body.content !== undefined) entry.content = body.content;
    if (body.priority !== undefined) entry.priority = body.priority;
    if (body.position !== undefined) entry.position = body.position === 'after' ? 10 : 0;
    if (body.enabled !== undefined) entry.enabled = body.enabled;
    const ok = await writeWorldFile(parts.file, data);
    if (!ok) {
      reply.code(502).send({ message: 'ST 保存世界书失败' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/st/worldbook/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parts = parseEntryId(id);
    if (!parts) {
      reply.code(400).send({ message: '世界书条目 id 格式应为 文件名#键' });
      return;
    }
    const health = await getStHealth();
    if (!health.up) {
      reply.code(502).send({ message: 'ST 未连接' });
      return;
    }
    const data = await readWorldFile(parts.file);
    if (!data?.entries?.[parts.key]) {
      reply.code(404).send({ message: '世界书条目不存在' });
      return;
    }
    delete data.entries[parts.key];
    // 文件空了就整份删掉，不留空壳
    if (Object.keys(data.entries).length === 0) {
      await deleteStWorldInfo(parts.file);
    } else {
      await writeWorldFile(parts.file, data);
    }
    reply.send({ ok: true });
  });

  // ===== 流式对话 =====
  app.post('/st/chat', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body ?? {}) as {
      characterId?: string;
      personaId?: string;
      messages?: ChatMessage[];
      model?: string;
      temperature?: number;
    };
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      reply.code(400).send({ message: 'messages 不能为空' });
      return;
    }
    const characterId = body.characterId?.trim();
    if (!characterId) {
      reply.code(400).send({ message: 'characterId 必填' });
      return;
    }

    const health = await getStHealth();
    if (!health.up) {
      reply.code(502).send({ message: 'ST 未连接，无法对话' });
      return;
    }

    // 数据从 ST 拉：角色卡 + 世界书；人设卡保留本地
    const characters = await listStCharacters();
    const character = characters.find((c) => c.avatar === characterId);
    if (!character) {
      reply.code(400).send({ message: '角色卡不存在' });
      return;
    }

    const personaRow = body.personaId
      ? db.select().from(tavernPersonas).where(eq(tavernPersonas.id, body.personaId)).get()
      : null;
    const persona = personaRow ? { name: personaRow.name, description: personaRow.description ?? '' } : null;

    // 世界书：ST 所有文件摊平后做命中
    const worldEntries: PromptWorldEntry[] = [];
    for (const f of await listStWorldInfo()) {
      const data = await getStWorldInfo(f.name);
      if (!data?.entries) continue;
      for (const [key, e] of Object.entries(data.entries)) {
        const entry = toPromptWorldEntry(f.name, key, e);
        if (e.constant) entry.enabled = true; // constant 条目始终注入
        worldEntries.push(entry);
      }
    }
    const matched = matchWorldbook(worldEntries, messages);
    const systemPrompt = buildSystemPrompt(
      {
        name: character.ch_name,
        description: character.description ?? '',
        personality: character.personality ?? '',
        scenario: character.scenario ?? '',
        systemPrompt: character.data?.system_prompt as string ?? '',
      },
      persona,
      matched,
    );
    const finalMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m): { role: 'user' | 'assistant'; content: string } => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    ];

    const controller = new AbortController();
    let closed = false;
    const onClose = () => {
      closed = true;
      if (!reply.raw.writableEnded) controller.abort();
    };

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.flushHeaders();
    reply.raw.on('close', onClose);

    const write = (ev: unknown) => {
      if (closed) return;
      reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
    };

    try {
      const res = await streamStChatCompletion(
        {
          messages: finalMessages,
          model: body.model?.trim() || undefined,
          temperature: body.temperature,
          stream: true,
        },
        controller.signal,
      );
      if (!res || !res.body) {
        write({ type: 'error', code: 'server_error', message: 'ST 生成请求失败' });
        reply.raw.end();
        return;
      }

      write({ type: 'start' });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx).replace(/\r$/, '');
          buffer = buffer.slice(idx + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const j = JSON.parse(payload) as {
              choices?: { delta?: { content?: string; reasoning_content?: string } }[];
              error?: { message?: string };
            };
            if (j.error) {
              write({ type: 'error', code: 'server_error', message: j.error.message ?? 'ST 生成出错' });
              continue;
            }
            const delta = j.choices?.[0]?.delta;
            if (!delta) continue;
            if (delta.reasoning_content) {
              write({ type: 'reasoning', content: delta.reasoning_content });
            }
            if (delta.content) {
              write({ type: 'delta', content: delta.content });
            }
          } catch {
            /* 非 JSON 行，忽略 */
          }
        }
      }
      write({ type: 'done' });
    } catch (err) {
      if (!closed) write({ type: 'error', code: 'server_error', message: (err as Error).message });
    }

    reply.raw.off('close', onClose);
    reply.raw.end();
  });

  // ===== 聊天存档（ST 为唯一数据源） =====
  app.get('/st/chats/:avatar', async (req, reply) => {
    const { avatar } = req.params as { avatar: string };
    const chats = await listStCharacterChats(avatar);
    if (!chats) {
      reply.code(502).send({ message: 'ST 未连接' });
      return;
    }
    reply.send(chats);
  });

  app.get('/st/chat/:chatfile', async (req, reply) => {
    const { chatfile } = req.params as { chatfile: string };
    const chat = await getStChat(chatfile);
    if (chat === null) {
      reply.code(502).send({ message: 'ST 未连接或聊天不存在' });
      return;
    }
    reply.send(chat);
  });

  app.post('/st/chat/save', async (req, reply) => {
    const body = (req.body ?? {}) as { chatfile?: string; chat?: { role: 'user' | 'assistant'; mes: string }[] };
    const chatfile = body.chatfile?.trim();
    if (!chatfile || !Array.isArray(body.chat)) {
      reply.code(400).send({ message: 'chatfile 与 chat 必填' });
      return;
    }
    const health = await getStHealth();
    if (!health.up) {
      reply.code(502).send({ message: 'ST 未连接' });
      return;
    }
    const ok = await saveStChat(chatfile, body.chat);
    if (!ok) {
      reply.code(502).send({ message: 'ST 保存聊天失败' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/st/chat/:chatfile', async (req, reply) => {
    const { chatfile } = req.params as { chatfile: string };
    const health = await getStHealth();
    if (!health.up) {
      reply.code(502).send({ message: 'ST 未连接' });
      return;
    }
    const ok = await deleteStChat(chatfile);
    if (!ok) {
      reply.code(502).send({ message: 'ST 删除聊天失败' });
      return;
    }
    reply.send({ ok: true });
  });
}
