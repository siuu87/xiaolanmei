import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

/**
 * 数据表定义（Drizzle 类型安全层）。
 *
 * 同步就绪约定（所有表通用）：
 *   - id: nanoid 文本主键（全局唯一，跨端不冲突）
 *   - created_at / updated_at: 毫秒时间戳（整数）
 *   - deleted_at: 软删除墓碑（可空，删除时打标，便于同步传播删除）
 *   冲突裁决：按 updated_at last-write-wins。
 *
 * 注意：阶段 0 用 client.ts 里的 SQL 直接建表（见 initDatabase），
 * 此 schema 是类型安全查询的「单一事实来源」，后续用 drizzle-kit 迁移替代手写 SQL。
 */

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  model: text('model'),
  systemPromptOverride: text('system_prompt_override'),
  activeMessageId: text('active_message_id'),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  role: text('role').notNull(), // user | assistant | system | tool
  content: text('content').notNull(),
  parentId: text('parent_id'), // 树形分支：指向上一跳
  model: text('model'),
  status: text('status').notNull().default('done'), // pending | streaming | done | error | aborted
  tokenInput: integer('token_input'),
  tokenOutput: integer('token_output'),
  meta: text('meta'), // JSON：附件引用、tool calls 等
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  messageId: text('message_id').notNull(),
  type: text('type').notNull(), // image | file
  name: text('name'),
  mime: text('mime'),
  path: text('path'), // 相对后端 data/uploads 的路径
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export const prompts = sqliteTable('prompts', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // global | model
  model: text('model'), // 仅 type=model 时用
  name: text('name').notNull(),
  content: text('content').notNull(),
  variables: text('variables'), // JSON
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/**
 * 语言风格条目（「他的资料 → 语言风格与输出」里的可增删列表）。
 *
 * 原全局「世界书」已并入这里：世界设定与说话方式都写成条目，
 * 由 `buildSystemPrompt()` 按 `position` 插进五模块拼成的角色设定正文里（前 / 中 / 后）。
 */
export const styleRules = sqliteTable('style_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  content: text('content').notNull(),
  position: text('position').notNull().default('after'), // before | middle | after
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),
  category: text('category').notNull(), // fact | event | relation
  content: text('content').notNull(),
  source: text('source').notNull().default('manual'), // manual | model
  relatedEntity: text('related_entity'),
  importance: integer('importance').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export const summaries = sqliteTable('summaries', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  fromMessageId: text('from_message_id'),
  toMessageId: text('to_message_id'),
  content: text('content').notNull(),
  model: text('model'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export const tokenUsage = sqliteTable('token_usage', {
  id: text('id').primaryKey(),
  timestamp: integer('timestamp').notNull(),
  conversationId: text('conversation_id'),
  messageId: text('message_id'),
  featureType: text('feature_type').notNull(), // chat | summary | memory | mcp | agent
  model: text('model'),
  stationId: text('station_id'),
  tokenInput: integer('token_input').notNull().default(0),
  tokenOutput: integer('token_output').notNull().default(0),
  tokenTotal: integer('token_total').notNull().default(0),
  estimatedCost: real('estimated_cost'),
  latencyMs: integer('latency_ms'),
  status: text('status').notNull().default('success'), // success | error | aborted
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export const syncState = sqliteTable('sync_state', {
  id: text('id').primaryKey(),
  nodeId: text('node_id').notNull().unique(), // local | vps
  lastPullCursor: integer('last_pull_cursor'),
  lastPushCursor: integer('last_push_cursor'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value'), // JSON
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** API 站子（供应商）：每个站子 = 名称 + Base URL + Key + 自己的模型列表。Key 仅存本端，不同步。 */
export const stations = sqliteTable('stations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  apiKey: text('api_key'), // 仅存后端，绝不下发
  models: text('models').notNull(), // JSON：模型名数组
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** MCP 服务器（阶段 9）：统一插件机制，第三方能力都通过 MCP 接入 */
export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // stdio | sse | http
  config: text('config'), // JSON：command/args/env（stdio）或 url/headers（sse/http）
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  permissions: text('permissions'), // JSON：该服务器工具的允许/拒绝规则
  status: text('status'), // unknown | ok | error
  lastError: text('last_error'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 统一工具调用记录（阶段 9，MCP 与内置工具共用） */
export const toolCalls = sqliteTable('tool_calls', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(), // builtin | mcp
  serverId: text('server_id'),
  toolName: text('tool_name').notNull(),
  arguments: text('arguments'), // JSON
  result: text('result'), // 文本 / JSON
  status: text('status').notNull().default('success'), // success | error | denied
  latencyMs: integer('latency_ms'),
  conversationId: text('conversation_id'),
  agentTaskId: text('agent_task_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 智能编程任务（阶段 10）：Agent 循环的一次任务 */
export const agentTasks = sqliteTable('agent_tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull().default('running'), // running | done | error | stopped
  prompt: text('prompt').notNull(),
  workspacePath: text('workspace_path'), // 默认 d:\小蓝莓
  plan: text('plan'), // JSON：模型输出的规划步骤
  conversationId: text('conversation_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 日记（阶段 7 收尾）：情侣双方各自的日记，date 为 YYYY-MM-DD */
export const diaries = sqliteTable('diaries', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  author: text('author').notNull(), // me | partner
  content: text('content').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 待办（阶段 7 收尾）：repeat 为 none/daily/weekly/monthly；重复待办用 done_on 记最近完成日 */
export const todos = sqliteTable('todos', {
  id: text('id').primaryKey(),
  text: text('text').notNull(),
  note: text('note'),
  date: text('date'),
  repeat: text('repeat').notNull().default('none'),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  doneOn: text('done_on'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/**
 * 灵感与待办池（Inbox & Todo 统一模块 / plugin_wishlist）。
 *
 * 2026-10-18 重构：原三态 `kind`（idea/wish/todo）+ `done` 收敛为二态统一模型：
 * - `isTodo`  false = 灵感（Inbox）｜true = 待办任务（Todo）
 * - `completed` 完成状态，`completedAt` 记完成时刻（未完成为 null）
 * - `sortOrder` 手动排序，越小越靠前
 *
 * `kind` / `done` 降级为**遗留列**：只用于旧库一次性回填，业务代码不再读写。
 */
export const pluginWishlist = sqliteTable('plugin_wishlist', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  isTodo: integer('is_todo', { mode: 'boolean' }).notNull().default(false),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  completedAt: integer('completed_at'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/**
 * ⚠️ 库里还有 `kind` / `done` 两列（旧三态模型的遗留列），但**故意不声明在 drizzle schema 里**。
 *
 * 原因：drizzle 生成 INSERT 时会为「已声明但未提供」的列显式写 NULL；真库的
 * `kind` 是 `NOT NULL DEFAULT 'idea'`，一旦声明就会被写成 NULL → NOT NULL 约束报错。
 * 不声明 → drizzle 完全不碰这两列，插入时由 SQLite 套用自己的 DEFAULT，相安无事。
 * 它们只由 client.ts 里的一次性回填 SQL 读取，业务代码一律不读写。
 */

/** 纪念日（阶段 7 收尾）：repeat 为 none/year/month/day */
export const memorials = sqliteTable('memorials', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  date: text('date').notNull(),
  repeat: text('repeat').notNull().default('none'),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/**
 * 灵感便签 / 深夜来信（阶段 7 收尾）：AI 每日一签，created_at 即生成时间戳(ms)。
 *
 * `letterTheme` = 信封主题（`default` 极简素雅 | `memorial` 纪念日 | `night` 深色磨砂星空），
 * 前端信箱按它渲染不同样式的信封与拆信视觉。
 * ⚠️ 必须带 `.default('default')`：drizzle 对「已声明但未提供」的列会显式写 NULL，
 * 没有默认值就会撞 NOT NULL（见 MEMORY.md 硬规则 §10）。
 */
export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  letterTheme: text('letter_theme').notNull().default('default'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 经期记录（阶段 7 收尾）：days/symptoms 存 JSON，整体替换式同步 */
export const periodRecords = sqliteTable('period_records', {
  id: text('id').primaryKey(),
  days: text('days').notNull(), // JSON：升序 ISO 日期数组
  symptoms: text('symptoms').notNull(), // JSON：{ [ISO]: { cramps, discomfort, mood? } }
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 每日心情（阶段 P2 数据单源化）：id 即日期 key（非补零 YYYY-M-D，与前端 moodStore 的 dateKeyOf 一致）；me/ai 为两人当天心情，可空 */
export const moods = sqliteTable('moods', {
  id: text('id').primaryKey(),
  me: text('me'),
  ai: text('ai'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 追剧片单（阶段 P2 数据单源化）：一级分类 × 二级状态；poster 可能是 data URL */
export const watchItems = sqliteTable('watch_items', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  category: text('category').notNull(), // movie 影视 | anime 动漫 | show 演出
  status: text('status').notNull().default('planned'), // planned 准备看的 | watched 看完的
  poster: text('poster'),
  note: text('note'),
  source: text('source').notNull().default('manual'), // manual | ai
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 酒馆小手机 · 联系人（阶段 P2 数据单源化）：character_id 指向角色卡 */
export const phoneContacts = sqliteTable('phone_contacts', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default(''),
  avatar: text('avatar'),
  characterId: text('character_id').notNull().default(''),
  signature: text('signature').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 酒馆小手机 · 会话（单聊/群聊统一模型；member_ids/messages 存 JSON） */
export const phoneSessions = sqliteTable('phone_sessions', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull().default('single'), // single | group
  targetId: text('target_id').notNull().default(''),
  title: text('title').notNull().default(''),
  avatar: text('avatar'),
  memberIds: text('member_ids').notNull().default('[]'), // JSON: string[]
  mode: text('mode').notNull().default('online'), // online | offline
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  unread: integer('unread').notNull().default(0),
  lastActiveAt: integer('last_active_at').notNull().default(0),
  messages: text('messages').notNull().default('[]'), // JSON: ChatMessage[]
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 酒馆小手机 · 朋友圈动态（images/likes/comments 存 JSON） */
export const phoneMoments = sqliteTable('phone_moments', {
  id: text('id').primaryKey(),
  authorName: text('author_name').notNull().default(''),
  authorAvatar: text('author_avatar'),
  content: text('content').notNull().default(''),
  images: text('images').notNull().default('[]'), // JSON
  likes: text('likes').notNull().default('[]'), // JSON: string[]
  comments: text('comments').notNull().default('[]'), // JSON
  mine: integer('mine', { mode: 'boolean' }).notNull().default(false),
  location: text('location'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 课程表（阶段 7 收尾）：单人课表，WakeUp 风格。day 1=周一…7=周日；节次+周次（时间不固定）；parity all/odd/even */
export const courses = sqliteTable('courses', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  teacher: text('teacher'),
  location: text('location'),
  day: integer('day').notNull(), // 1=周一 ... 7=周日
  startPeriod: integer('start_period').notNull(), // 起始节次（1 起）
  endPeriod: integer('end_period').notNull(), // 结束节次（含）
  startWeek: integer('start_week').notNull(), // 起始周
  endWeek: integer('end_week').notNull(), // 结束周
  parity: text('parity').notNull().default('all'), // all | odd | even
  color: text('color').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 课程表配置（单行 id='default'）：总周数 + 每节课上下课时间（period_times 存 JSON） */
export const timetableConfig = sqliteTable('timetable_config', {
  id: text('id').primaryKey(),
  totalWeeks: integer('total_weeks').notNull().default(20),
  periodTimes: text('period_times').notNull(), // JSON: [{ start, end } x 12]
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/**
 * 表情包分类（2026-10-18）：设置页里可以建多个分类，把表情包分门别类归拢。
 * 固定有一条 `id='default'` 的「默认」分类（client.ts 里幂等插入），
 * 不允许删除 —— 老数据与「没选分类」的新增都落在它上面。
 */
export const stickerCategories = sqliteTable('sticker_categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 自定义表情包（阶段 7 收尾）：用户上传的贴图，url 指向 /api/files/xxx，聊天表情包面板里可用 */
export const stickers = sqliteTable('stickers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  /** 所属分类 id；老数据由 client.ts 的 ALTER 回填成 'default' */
  categoryId: text('category_id').notNull().default('default'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** RAG 知识库（阶段 11）：文档分组，向量存本地 SQLite（JSON 数组） */
export const ragCollections = sqliteTable('rag_collections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color'),
  embeddingModel: text('embedding_model'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** RAG 文档（阶段 11）：一条长期记忆 / 知识，正文 content，按 chunk 向量化 */
export const ragDocuments = sqliteTable('rag_documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  chunkCount: integer('chunk_count').notNull().default(0),
  source: text('source').notNull().default('manual'), // manual | agent | import | file
  fileType: text('file_type'),
  tags: text('tags'),
  category: text('category').notNull().default('general'),
  importance: integer('importance').notNull().default(3),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false), // 置顶
  order: integer('order').notNull().default(0), // 手动排序权重
  authorType: text('author_type').notNull().default('user'), // user | agent（备忘录作者）
  fromWho: text('from_who'), // 谁记的（昵称，如「白起」）
  toWho: text('to_who'), // 为谁记的（昵称，如「肆佑」）
  avatarSeed: text('avatar_seed'), // 头像标识（用于生成专属徽章，取自 toWho 的档案）
  needNotify: integer('need_notify', { mode: 'boolean' }).notNull().default(false), // 是否提醒对方
  ownerSide: text('owner_side').notNull().default('me'), // 归属方：me 我记 TA / partner TA 记我
  status: text('status').notNull().default('unfiled'), // 备忘录状态：unfiled 未分类（小卡片便签）/ archived 已收录
  embeddingModel: text('embedding_model'),
  meta: text('meta'), // JSON
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 双人档案（阶段 11）：两个人的昵称与头像配置，用于备忘录归属徽章。id 固定 'me' | 'partner'。 */
export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(), // 'me' | 'partner'
  nickname: text('nickname').notNull(), // 昵称
  avatarSeed: text('avatar_seed').notNull(), // 头像种子（确定性徽章用）
  avatarColor: text('avatar_color').notNull().default('#8b5cf6'),
  emoji: text('emoji'), // 头像 emoji，如 "🐱"
  isMe: integer('is_me', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** RAG 分块（阶段 11）：文档切分后的片段，embedding 存 JSON 数组字符串 */
export const ragChunks = sqliteTable('rag_chunks', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  tokenCount: integer('token_count').notNull().default(0),
  embedding: text('embedding'), // JSON 数组字符串
  embeddingDim: integer('embedding_dim'),
  hash: text('hash'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** RAG 文档↔知识库关联（阶段 11）：多对多，物理删除（随文档/知识库软删时清理） */
export const ragDocumentCollections = sqliteTable('rag_document_collections', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull(),
  collectionId: text('collection_id').notNull(),
  createdAt: integer('created_at').notNull(),
});

/** Skill 技能（阶段 11）：条件触发的系统提示词片段 */
export const skills = sqliteTable('skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description').notNull(),
  instruction: text('instruction').notNull(),
  triggerKeywords: text('trigger_keywords'),
  triggerMode: text('trigger_mode').notNull().default('keyword'), // keyword | always | manual
  icon: text('icon'),
  color: text('color'),
  category: text('category').notNull().default('custom'), // builtin | custom
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  priority: integer('priority').notNull().default(0),
  version: integer('version').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** Skill 触发记录（阶段 11）：审计/调试用，记录每次自动/手动触发的技能 */
export const skillExecutions = sqliteTable('skill_executions', {
  id: text('id').primaryKey(),
  skillId: text('skill_id').notNull(),
  skillName: text('skill_name').notNull(),
  conversationId: text('conversation_id'),
  triggerType: text('trigger_type').notNull(), // auto | manual
  input: text('input'),
  output: text('output'),
  status: text('status').notNull().default('success'),
  latencyMs: integer('latency_ms'),
  createdAt: integer('created_at').notNull(),
});

/** 阅读书目（一起读 / 书房）：content 全文按 \\n\\n 分段，toc 存 JSON 目录，进度与标画分表 */
export const books = sqliteTable('books', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  author: text('author'),
  coverUrl: text('cover_url'), // 封面（URL 或 dataURL）
  totalChapters: integer('total_chapters').notNull().default(1),
  content: text('content'),
  desc: text('desc'), // 一句话详情
  toc: text('toc'), // JSON：目录章节标题数组
  color: text('color'), // 书脊底色
  band: text('band'), // 书头/书脚带颜色
  height: integer('height'), // 书脊高度 px
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 阅读进度（双人各有进度）：reader = me | partner */
export const readingProgress = sqliteTable('reading_progress', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  reader: text('reader').notNull(), // me | partner
  currentChapter: integer('current_chapter').notNull().default(1),
  currentPosition: integer('current_position').notNull().default(0), // 段落/字符偏移
  percent: integer('percent').notNull().default(0), // 0-100
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 划线 + 批注：chapter 为段落索引（0 起），offset 为段内字符偏移 */
export const annotations = sqliteTable('annotations', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  chapter: integer('chapter').notNull(),
  startOffset: integer('start_offset').notNull(),
  endOffset: integer('end_offset').notNull(),
  selectedText: text('selected_text').notNull(),
  color: text('color').notNull().default('yellow'), // yellow | green | blue | pink
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 批注留言（关联划线，双人气泡）：author = me | partner */
export const annotationNotes = sqliteTable('annotation_notes', {
  id: text('id').primaryKey(),
  annotationId: text('annotation_id').notNull(),
  author: text('author').notNull(), // me | partner
  content: text('content').notNull(),
  createdAt: integer('created_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 阅读时长（分钟，按天累计）：day = YYYY-MM-DD，reader = me | partner */
export const readingLogs = sqliteTable('reading_logs', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  reader: text('reader').notNull(), // me | partner
  day: text('day').notNull(), // YYYY-MM-DD
  minutes: integer('minutes').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 食材项（今天吃什么）：name 必填，amount / unit 可选 */
export interface Ingredient {
  name: string;
  amount?: string;
  unit?: string;
}

/** 菜谱（今天吃什么，合并食谱 + 甜品）：type = meal | dessert；ingredients/steps/tags 存 JSON */
export const dishes = sqliteTable('dishes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // meal 日常正餐 | dessert 治愈甜品
  coverUrl: text('cover_url'),
  description: text('description'),
  ingredients: text('ingredients'), // JSON: Ingredient[]
  steps: text('steps'), // JSON: string[]
  tags: text('tags'), // JSON: string[]，如 多囊友好 / 治愈指数 / 姨妈期推荐
  difficulty: integer('difficulty').notNull().default(1), // 1-3
  healingIndex: integer('healing_index').notNull().default(3), // 治愈指数 1-5
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/**
 * 开源项目关注清单（工具箱 → 开源项目）。
 *
 * **只放用户自己加的项目** —— 后端不再自动扫描 package.json 依赖，
 * 列表里出现什么完全由用户在面板里添加/删除决定。
 *
 * 「有没有更新」的判定：`seen_version` 是用户**已知**的版本（添加时写入、
 * 点过「知道了」再更新），刷新拉到的 `latest_version` 比它新 → `has_update = 1`。
 */
export const openSourceProjects = sqliteTable('open_source_projects', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(), // GitHub owner
  repo: text('repo').notNull(), // GitHub repo
  repoUrl: text('repo_url').notNull(),
  name: text('name').notNull(), // 展示名，默认 full_name，可改
  note: text('note'), // 用户备注
  description: text('description'), // GitHub 仓库描述（刷新时同步）
  stars: integer('stars'),
  language: text('language'),
  homepage: text('homepage'),
  latestVersion: text('latest_version'), // 最新 release tag（没有 release 则为 null）
  latestPublishedAt: integer('latest_published_at'), // release 发布时间（ms）
  /** 用户已经知道的版本：比它新才算「有更新」 */
  seenVersion: text('seen_version'),
  lastCheckedAt: integer('last_checked_at'),
  hasUpdate: integer('has_update', { mode: 'boolean' }).notNull().default(false),
  checkError: text('check_error'), // 上一次刷新失败的原因（成功则清空）
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/**
 * 晚安页音频（together → goodnight）：用户导入的哄睡/陪睡音频。
 *
 * 音频本体落盘 `data/sleep-audio/`，这里只存 URL + 元数据（标题 / 时长 / 大小）。
 * 白噪音不入库（前端 Web Audio 实时生成，无需存储）。
 * `sort_order` 越小越靠前。
 */
export const sleepAudio = sqliteTable('sleep_audio', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  mime: text('mime'),
  duration: integer('duration'), // 秒（可选，前端上传时尽量带上）
  size: integer('size'), // 字节
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 酒馆角色卡（SillyTavern 风格 AI 角色扮演）：tags 存 JSON */
export const tavernCharacters = sqliteTable('tavern_characters', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  avatar: text('avatar'), // emoji 头像
  description: text('description'), // 一句话人设
  personality: text('personality'), // 详细性格 / 设定
  scenario: text('scenario'), // 当前场景
  firstMessage: text('first_message'), // 开场白
  systemPrompt: text('system_prompt'), // 自定义系统提示（可选，覆盖默认模板）
  tags: text('tags'), // JSON: string[]
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 酒馆世界书条目：关键词命中时按优先级注入上下文；keywords 存 JSON */
export const tavernWorldbook = sqliteTable('tavern_worldbook', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  keywords: text('keywords'), // JSON: string[]，逗号/换行分隔后存入
  content: text('content').notNull(),
  priority: integer('priority').notNull().default(0), // 数值越大越靠前
  position: text('position').notNull().default('before'), // before 角色前 | after 角色后
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/** 酒馆人设卡（用户扮演的角色） */
export const tavernPersonas = sqliteTable('tavern_personas', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  avatar: text('avatar'), // emoji 头像
  description: text('description'), // 用户自己的人设
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/**
 * 通话记录：每次挂断写一行，同时前端会往聊天流推一条内联卡片消息。
 *
 * 两个地方都留痕是有意的：消息卡负责「在对话里看得见、能跟上下文并排」，
 * 这张表负责「可统计」（时长合计、最近一次通话、按类型分组）。
 * 数据单源仍是 SQLite。
 */
export const calls = sqliteTable('calls', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id'), // 归属会话（单会话模型下可空）
  kind: text('kind').notNull().default('voice'), // voice | video
  state: text('state').notNull().default('answered'), // answered | declined | missed
  seconds: integer('seconds').notNull().default(0), // 接通时长（秒）
  startedAt: integer('started_at'), // 呼出时刻
  endedAt: integer('ended_at'), // 挂断时刻
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/**
 * 相册条目（together → gallery）：本地优先的图片墙。
 *
 * `url` 指向 `POST /api/upload` 落盘的文件（`/api/files/<name>`），
 * **不重复存图片本体**——上传通道只有一条。
 * 标签存 JSON 字符串数组，跟其它表的 JSON 列一样。
 */
export const galleryItems = sqliteTable('gallery_items', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  name: text('name'),
  mime: text('mime'),
  note: text('note'), // 一句话说明（用户可以写，AI 以后也能写）
  tags: text('tags'), // JSON: string[]
  takenAt: integer('taken_at'), // 拍摄/记录时间，缺省用 createdAt
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/**
 * 「白起的内心」情绪状态：**单例行**（id 恒为 `'default'`，同 `timetable_config` 的约定）。
 *
 * 四个数值都是 0-100 的整数，默认值就是「刚在一起时的稳态」。
 * 每聊完一轮（助手消息落库 / 流式收尾）由 `emotion/rules.ts` 按关键词规则微调一档，
 * **每次调整都把可读的理由写进 `lastReason`** —— 面板要回答「为什么涨了」。
 *
 * `lastMessageId` 是幂等键：同一条消息触发的重复演进直接跳过
 * （`POST /conversations/:id/messages` 与 `PATCH /messages/:id` 都可能是「一轮结束」信号）。
 */
export const characterState = sqliteTable('character_state', {
  id: text('id').primaryKey(), // 恒为 'default'
  affection: integer('affection').notNull().default(100), // 爱意
  possessiveness: integer('possessiveness').notNull().default(50), // 占有欲
  restraint: integer('restraint').notNull().default(80), // 克制
  longing: integer('longing').notNull().default(30), // 思念
  currentMood: text('current_mood').notNull().default('温柔'),
  lastReason: text('last_reason'), // 上一次调整的可读理由（JSON 数组或短句）
  lastMessageId: text('last_message_id'), // 幂等：同一轮不重复演进
  turnCount: integer('turn_count').notNull().default(0), // 累计演进轮次
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/**
 * 渡口念头（Thought Notes）：角色内心一闪而过的独白。
 *
 * 与 `memories`（记忆锚点）**同流不同表** —— 念头是「当下的碎碎念」，会过期、可点掉；
 * 记忆是「沉淀下来的事实」，长期有效。面板里合成一条卡片流按时间倒序混排。
 * `context` 记「在什么情况下冒出来的」，`isResolved` 供用户点掉（表示已经看见/消化）。
 */
export const thoughtNotes = sqliteTable('thought_notes', {
  id: text('id').primaryKey(),
  thought: text('thought').notNull(),
  context: text('context'),
  isResolved: integer('is_resolved', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});
