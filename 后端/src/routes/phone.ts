import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { phoneContacts, phoneSessions, phoneMoments } from '../db/schema.js';
import { getSettingValue, setSetting } from './settings.js';

/**
 * 酒馆「小手机」快照（阶段 P2 数据单源化）。
 *
 * 手机模块的联系人 / 会话 / 朋友圈原本只落前端 localStorage；这里整体迁到 SQLite，
 * 语义与 period 一致：PUT 带全量快照，本次没出现的 id 打软删墓碑，
 * 双端同步（阶段 14）靠 deleted_at 传播删除。
 *
 * 角色卡 / 人设卡不在这里——它们已有 /api/tavern/characters|personas，
 * 手机端的卡片是那两张表的归一化视图。
 * activePersonaId 是单值本地偏好，借 settings 表存放（key = phone.activePersonaId）。
 */

const PERSONA_KEY = 'phone.activePersonaId';

interface SnapshotDTO {
  contacts: any[];
  sessions: any[];
  moments: any[];
  activePersonaId: string | null;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown): boolean {
  return v === true;
}

function jsonStr(v: unknown, fallback: string): string {
  if (v === undefined || v === null) return fallback;
  try {
    return JSON.stringify(v);
  } catch {
    return fallback;
  }
}

/** 快照入参清洗：三类数组各自过滤掉没有合法 id 的条目 */
function cleanSnapshot(body: unknown): SnapshotDTO {
  const b = (body ?? {}) as Record<string, unknown>;
  const arr = (v: unknown): any[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && typeof (x as any).id === 'string') : []);
  const activePersonaId = typeof b.activePersonaId === 'string' ? b.activePersonaId : null;
  return {
    contacts: arr(b.contacts),
    sessions: arr(b.sessions),
    moments: arr(b.moments),
    activePersonaId,
  };
}

export async function phoneRoutes(app: FastifyInstance): Promise<void> {
  app.get('/phone/snapshot', async (): Promise<SnapshotDTO> => {
    const contacts = db
      .select()
      .from(phoneContacts)
      .all()
      .filter((r) => r.deletedAt == null)
      .map((r) => ({
        id: r.id,
        name: r.name,
        avatar: r.avatar,
        characterId: r.characterId,
        signature: r.signature,
      }));

    const sessions = db
      .select()
      .from(phoneSessions)
      .all()
      .filter((r) => r.deletedAt == null)
      .map((r) => {
        let memberIds: string[] = [];
        let messages: unknown[] = [];
        try {
          memberIds = JSON.parse(r.memberIds) as string[];
        } catch {
          /* 损坏兜底 */
        }
        try {
          messages = JSON.parse(r.messages) as unknown[];
        } catch {
          /* 损坏兜底 */
        }
        return {
          id: r.id,
          kind: r.kind,
          targetId: r.targetId,
          title: r.title,
          avatar: r.avatar,
          memberIds,
          mode: r.mode,
          pinned: r.pinned,
          unread: r.unread,
          lastActiveAt: r.lastActiveAt,
          messages,
        };
      });

    const moments = db
      .select()
      .from(phoneMoments)
      .all()
      .filter((r) => r.deletedAt == null)
      .map((r) => {
        const parse = <T>(raw: string, fallback: T): T => {
          try {
            return JSON.parse(raw) as T;
          } catch {
            return fallback;
          }
        };
        return {
          id: r.id,
          authorName: r.authorName,
          authorAvatar: r.authorAvatar,
          content: r.content,
          images: parse<unknown[]>(r.images, []),
          likes: parse<string[]>(r.likes, []),
          comments: parse<unknown[]>(r.comments, []),
          mine: r.mine,
          location: r.location,
          createdAt: r.createdAt,
        };
      });

    return {
      contacts,
      sessions,
      moments,
      activePersonaId: getSettingValue<string | null>(PERSONA_KEY, null),
    };
  });

  app.put('/phone/snapshot', async (req) => {
    const snap = cleanSnapshot(req.body);
    const ts = Date.now();

    /* ---- 联系人 ---- */
    {
      const existing = db.select().from(phoneContacts).all();
      const live = existing.filter((r) => r.deletedAt == null);
      const ids = new Set(snap.contacts.map((c) => c.id));
      for (const c of snap.contacts) {
        const cur = existing.find((e) => e.id === c.id);
        const row = {
          name: str(c.name),
          avatar: typeof c.avatar === 'string' ? c.avatar : null,
          characterId: str(c.characterId),
          signature: str(c.signature),
          updatedAt: ts,
          deletedAt: null,
        };
        if (cur) {
          db.update(phoneContacts).set(row).where(eq(phoneContacts.id, c.id)).run();
        } else {
          db.insert(phoneContacts).values({ id: c.id, ...row, createdAt: num(c.createdAt) || ts }).run();
        }
      }
      for (const e of live) {
        if (!ids.has(e.id)) {
          db.update(phoneContacts).set({ deletedAt: ts, updatedAt: ts }).where(eq(phoneContacts.id, e.id)).run();
        }
      }
    }

    /* ---- 会话 ---- */
    {
      const existing = db.select().from(phoneSessions).all();
      const live = existing.filter((r) => r.deletedAt == null);
      const ids = new Set(snap.sessions.map((s) => s.id));
      for (const s of snap.sessions) {
        const cur = existing.find((e) => e.id === s.id);
        const row = {
          kind: str(s.kind, 'single'),
          targetId: str(s.targetId),
          title: str(s.title),
          avatar: typeof s.avatar === 'string' ? s.avatar : null,
          memberIds: jsonStr(s.memberIds, '[]'),
          mode: str(s.mode, 'online'),
          pinned: bool(s.pinned),
          unread: num(s.unread),
          lastActiveAt: num(s.lastActiveAt),
          messages: jsonStr(s.messages, '[]'),
          updatedAt: ts,
          deletedAt: null,
        };
        if (cur) {
          db.update(phoneSessions).set(row).where(eq(phoneSessions.id, s.id)).run();
        } else {
          db.insert(phoneSessions).values({ id: s.id, ...row, createdAt: num(s.createdAt) || ts }).run();
        }
      }
      for (const e of live) {
        if (!ids.has(e.id)) {
          db.update(phoneSessions).set({ deletedAt: ts, updatedAt: ts }).where(eq(phoneSessions.id, e.id)).run();
        }
      }
    }

    /* ---- 朋友圈 ---- */
    {
      const existing = db.select().from(phoneMoments).all();
      const live = existing.filter((r) => r.deletedAt == null);
      const ids = new Set(snap.moments.map((m) => m.id));
      for (const m of snap.moments) {
        const cur = existing.find((e) => e.id === m.id);
        const row = {
          authorName: str(m.authorName),
          authorAvatar: typeof m.authorAvatar === 'string' ? m.authorAvatar : null,
          content: str(m.content),
          images: jsonStr(m.images, '[]'),
          likes: jsonStr(m.likes, '[]'),
          comments: jsonStr(m.comments, '[]'),
          mine: bool(m.mine),
          location: typeof m.location === 'string' ? m.location : null,
          updatedAt: ts,
          deletedAt: null,
        };
        if (cur) {
          db.update(phoneMoments).set(row).where(eq(phoneMoments.id, m.id)).run();
        } else {
          db.insert(phoneMoments).values({ id: m.id, ...row, createdAt: num(m.createdAt) || ts }).run();
        }
      }
      for (const e of live) {
        if (!ids.has(e.id)) {
          db.update(phoneMoments).set({ deletedAt: ts, updatedAt: ts }).where(eq(phoneMoments.id, e.id)).run();
        }
      }
    }

    if (snap.activePersonaId) setSetting(PERSONA_KEY, snap.activePersonaId);
    else setSetting(PERSONA_KEY, null);

    return { ok: true };
  });
}
