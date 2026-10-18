import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sleepAudio } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 晚安页音频（together → goodnight）：用户导入的哄睡 / 陪睡音频。
 *
 * 与 upload.ts（图片）平行：接收 base64 音频，落盘 data/sleep-audio，写 sleep_audio 行，
 * 返回可访问的 URL（`/api/sleep-audio/files/<name>`）。
 * 白噪音由前端 Web Audio 实时生成，不进这个通道。
 *
 * 软删：DELETE 只置 deleted_at，不删磁盘文件（同一文件可能被多个会话引用，留着无害）。
 */
const UPLOAD_DIR = path.resolve(process.cwd(), 'data', 'sleep-audio');

const AUDIO_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/flac': 'flac',
};
const MAX_BYTES = 50 * 1024 * 1024; // 50MB（音频普遍比图片大）

interface SleepAudioBody {
  name?: string;
  mime?: string;
  data?: string; // base64（可带 data:xxx;base64, 前缀）
  duration?: number;
}

function toDTO(r: typeof sleepAudio.$inferSelect) {
  return {
    id: r.id,
    title: r.title,
    url: r.url,
    mime: r.mime,
    duration: r.duration ?? null,
    size: r.size ?? null,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function liveRows() {
  return db
    .select()
    .from(sleepAudio)
    .all()
    .filter((r) => r.deletedAt == null)
    .sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt - a.createdAt);
}

export async function sleepAudioRoutes(app: FastifyInstance): Promise<void> {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  /** 列表：只读库，不含已软删项 */
  app.get('/sleep-audio', async () => liveRows().map(toDTO));

  /** 上传：接收 base64 音频，落盘 + 写库 */
  app.post('/sleep-audio', async (req, reply) => {
    const body = (req.body ?? {}) as SleepAudioBody;
    const mime = body.mime?.toLowerCase() ?? '';
    const ext = AUDIO_MIME[mime];
    if (!ext) {
      reply.code(400).send({ message: '仅支持 mp3 / wav / ogg / webm / aac / m4a / flac 音频' });
      return;
    }
    let data = body.data ?? '';
    const comma = data.indexOf(',');
    if (data.startsWith('data:') && comma !== -1) data = data.slice(comma + 1);

    if (!/^[A-Za-z0-9+/=\s-_]*$/.test(data)) {
      reply.code(400).send({ message: '音频数据不是合法的 base64' });
      return;
    }
    const buffer = Buffer.from(data, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_BYTES) {
      reply.code(400).send({ message: `音频大小需在 1B ~ ${MAX_BYTES / 1024 / 1024}MB 之间` });
      return;
    }

    const id = newId();
    const safeName = `${id}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, safeName), buffer);

    const ts = now();
    const maxRow = db
      .select({ max: sleepAudio.sortOrder })
      .from(sleepAudio)
      .all()
      .reduce((m, r) => Math.max(m, r.max ?? 0), 0);
    const title = (body.name ?? '').trim() || safeName;
    db.insert(sleepAudio)
      .values({
        id,
        title,
        url: `/api/sleep-audio/files/${safeName}`,
        mime,
        duration: typeof body.duration === 'number' ? Math.round(body.duration) : null,
        size: buffer.length,
        sortOrder: maxRow + 10,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    const row = db.select().from(sleepAudio).all().find((r) => r.id === id)!;
    reply.code(201).send(toDTO(row));
  });

  app.delete('/sleep-audio/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ts = now();
    const result = db
      .update(sleepAudio)
      .set({ deletedAt: ts, updatedAt: ts })
      .where(and(eq(sleepAudio.id, id), isNull(sleepAudio.deletedAt)))
      .run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '音频不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  /** 回读音频文件（供前端 <audio src> 播放） */
  app.get('/sleep-audio/files/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
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
      ext === 'mp3'
        ? 'audio/mpeg'
        : ext === 'wav'
          ? 'audio/wav'
          : ext === 'ogg'
            ? 'audio/ogg'
            : ext === 'webm'
              ? 'audio/webm'
              : ext === 'aac'
                ? 'audio/aac'
                : ext === 'm4a'
                  ? 'audio/mp4'
                  : ext === 'flac'
                    ? 'audio/flac'
                    : 'application/octet-stream';
    reply.type(mime).send(fs.readFileSync(full));
  });
}
