/**
 * 酒馆「小手机」模块 —— 数据类型定义
 *
 * 该模块完全自包含：所有类型只服务于手机模块内部，
 * 不修改 TavernPage 原有类型（TavernCharacter / TavernPersona）。
 */

/** 卡片种类：角色卡（AI 扮演的角色）/ 人设卡（"你"在剧情里扮演的人） */
export type CardKind = 'character' | 'persona';

/** 统一卡片模型：由 TavernCharacter 与 TavernPersona 归一化而来 */
export interface PhoneCard {
  id: string;
  kind: CardKind;
  name: string;
  avatar: string | null;
  /** 一句话简介（角色的 description / 人设的描述） */
  intro: string | null;
  description: string | null;
  personality: string | null;
  scenario: string | null;
  firstMessage: string | null;
  systemPrompt: string | null;
  tags: string[];
  /** 是否正在使用（人设卡专用） */
  active?: boolean;
}

/** 联系人：一个人 = 一张角色卡（群里 @ 的对象） */
export interface Contact {
  id: string;
  name: string;
  avatar: string | null;
  /** 对应后端角色卡 id，用于发起真实流式对话 */
  characterId: string;
  signature: string;
}

/** 消息发送者类型 */
export type MessageSender = 'me' | 'system' | string; // string = 联系人 id

export interface ChatMessage {
  id: string;
  /** 'me' = 我；'system' = 系统提示；其余为联系人 id */
  sender: MessageSender;
  /** 群聊里用于显示的发送者名字（快照，联系人改名后历史消息不受影响） */
  senderName?: string;
  senderAvatar?: string | null;
  content: string;
  createdAt: number;
  /** 该条消息正在流式生成中 */
  streaming?: boolean;
  /** 生成出错时的提示 */
  error?: boolean;
}

/** 会话：单聊与群聊统一模型 */
export interface Session {
  id: string;
  kind: 'single' | 'group';
  /** 单聊 = 联系人 id；群聊 = 群 id（同 id） */
  targetId: string;
  title: string;
  avatar: string | null;
  /** 群聊成员（联系人 id 列表），单聊为空 */
  memberIds: string[];
  messages: ChatMessage[];
  unread: number;
  lastActiveAt: number;
  /** 是否置顶 */
  pinned?: boolean;
  /**
   * 线上 / 线下模式。两种模式的记忆完全隔离、互不污染，
   * 也就是同一角色可以有一条"面对面相处"的线和一条"线上聊天"的线。
   */
  mode?: 'online' | 'offline';
}

/** 朋友圈图片 */
export interface MomentImage {
  /** 纯色占位块的色相，用于生成渐变占位图（不依赖外部图片） */
  hue: number;
  label: string;
}

/** 朋友圈评论 */
export interface MomentComment {
  id: string;
  /** 评论者名字 */
  author: string;
  authorAvatar: string | null;
  content: string;
  createdAt: number;
  /** 是否是"我"发的评论 */
  mine?: boolean;
}

/** 朋友圈动态 */
export interface Moment {
  id: string;
  authorName: string;
  authorAvatar: string | null;
  content: string;
  images: MomentImage[];
  createdAt: number;
  likes: string[];
  comments: MomentComment[];
  /** 是否是"我"发布的 */
  mine?: boolean;
  /** 发布地点 */
  location?: string;
}

/** 卡片分类筛选：全部 / 角色卡 / 人设卡 / 指定标签 / 指定分组 */
export type CardFilter =
  | { type: 'all' }
  | { type: 'kind'; kind: CardKind }
  | { type: 'tag'; tag: string };

/** 手机模块内的页面栈条目 */
export interface PhoneRoute {
  /** 页面 key */
  name: 'home' | 'sessions' | 'discover' | 'cards' | 'chat' | 'group-setup' | 'group-info';
  /** 页面参数（如 chat 的会话 id、group-setup 的成员列表） */
  params?: Record<string, unknown>;
}
