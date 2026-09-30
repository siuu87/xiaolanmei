import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/client.js';
import { attachments } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/** 附件落盘目录（相对后端工作目录），与 data/blueberry.db 同级 */
const UPLOAD_DIR = path.resolve(process.cwd(), 'data', 'uploads');

// 允许的图片 mime（多模态发图用），其它类型暂拒绝
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};
const MAX_BYTES = 8 * 1024 * 1024; // 8MB

interface UploadBody {
  name?: string;
  mime?: string;
  data?: string; // base64（可带 data:xxx;base64, 前缀）
  messageId?: string | null;
}

/**
 * 附件上传与静态服务（阶段 7 发图）。
 * POST /api/upload —— 接收 base64 图片，落盘 data/uploads，写 attachments 行，返回 {id,url,name,mime,size}。
 * GET /api/files/:name —— 按文件名回读图片（供前端 <img> 展示）。
 */
export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  app.post('/upload', async (req, reply) => {
    const body = (req.body ?? {}) as UploadBody;
    const mime = body.mime?.toLowerCase() ?? '';
    if (!IMAGE_MIME.has(mime)) {
      reply.code(400).send({ message: '仅支持 png / jpeg / gif / webp 图片' });
      return;
    }
    let data = body.data ?? '';
    // 去掉可能的 data URL 前缀
    const comma = data.indexOf(',');
    if (data.startsWith('data:') && comma !== -1) data = data.slice(comma + 1);

    let buffer: Buffer;
    try {
      buffer = Buffer.from(data, 'base64');
    } catch {
      reply.code(400).send({ message: '图片数据不是合法的 base64' });
      return;
    }
    if (buffer.length === 0 || buffer.length > MAX_BYTES) {
      reply.code(400).send({ message: `图片大小需在 1B ~ ${MAX_BYTES / 1024 / 1024}MB 之间` });
      return;
    }

    const id = newId();
    const safeName = `${id}.${EXT[mime]}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, safeName), buffer);

    const ts = now();
    db.insert(attachments)
      .values({
        id,
        messageId: body.messageId ?? '', // 发图时前端会在建消息后补；空串表示待关联
        type: 'image',
        name: body.name ?? safeName,
        mime,
        path: safeName,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    return {
      id,
      url: `/api/files/${safeName}`,
      name: body.name ?? safeName,
      mime,
      size: buffer.length,
    };
  });

  app.get('/files/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    // 防路径穿越：只允许纯文件名（含我们生成的 id.扩展名），不含目录分隔符
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes('..')) {
      reply.code(400).send({ message: '非法文件名' });
      return;
    }
    const full = path.join(UPLOAD_DIR, name);
    if (!fs.existsSync(full)) {
      reply.code(404).send({ message: '文件不存在' });
      return;
    }
    const ext = path.extname(name).slice(1).toLowerCase();
    const mime =
      ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'application/octet-stream';
    reply.type(mime).send(fs.readFileSync(full));
  });
}
