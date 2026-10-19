import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import * as schema from './schema.js';

// 确保数据库文件所在目录存在
const dataDir = path.dirname(env.databasePath);
fs.mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(env.databasePath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

/** Drizzle 实例（类型安全查询入口，阶段 1 起使用） */
export const db = drizzle(sqlite, { schema });

/**
 * 阶段 0 建表 SQL：与 schema.ts 保持一致。
 * 后续用 drizzle-kit 迁移替代这段手写 SQL。
 */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  model TEXT,
  system_prompt_override TEXT,
  active_message_id TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  parent_id TEXT,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'done',
  token_input INTEGER,
  token_output INTEGER,
  meta TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT,
  mime TEXT,
  path TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);

CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  model TEXT,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  variables TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

-- 语言风格条目：「他的资料 → 语言风格与输出」里的可增删列表。
-- position 决定它插进角色设定正文的位置（before 前 / middle 中 / after 后）。
-- 原全局「世界书」已并入此处：世界设定与说话方式都写成条目。
CREATE TABLE IF NOT EXISTS style_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  position TEXT NOT NULL DEFAULT 'after',
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

-- 通话记录：每次挂断写一行。前端同时会往聊天流推一条内联卡片消息；
-- 消息卡负责「在对话里看得见」，这张表负责「可统计」（时长合计 / 最近一次 / 按类型分组）。
CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  kind TEXT NOT NULL DEFAULT 'voice',
  state TEXT NOT NULL DEFAULT 'answered',
  seconds INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER,
  ended_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

-- 相册（together → gallery）：本地优先的图片墙。
-- url 指向 POST /api/upload 落盘的文件，**不重复存图片本体**；tags 存 JSON 数组。
CREATE TABLE IF NOT EXISTS gallery_items (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  name TEXT,
  mime TEXT,
  note TEXT,
  tags TEXT,
  taken_at INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  related_entity TEXT,
  importance INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS summaries (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  from_message_id TEXT,
  to_message_id TEXT,
  content TEXT NOT NULL,
  model TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS token_usage (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  conversation_id TEXT,
  message_id TEXT,
  feature_type TEXT NOT NULL,
  model TEXT,
  station_id TEXT,
  token_input INTEGER NOT NULL DEFAULT 0,
  token_output INTEGER NOT NULL DEFAULT 0,
  token_total INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL,
  latency_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'success',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp);

CREATE TABLE IF NOT EXISTS sync_state (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL UNIQUE,
  last_pull_cursor INTEGER,
  last_push_cursor INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS stations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT,
  models TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  permissions TEXT,
  status TEXT,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  server_id TEXT,
  tool_name TEXT NOT NULL,
  arguments TEXT,
  result TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  latency_ms INTEGER,
  conversation_id TEXT,
  agent_task_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tool_calls_created ON tool_calls(created_at);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  prompt TEXT NOT NULL,
  workspace_path TEXT,
  plan TEXT,
  conversation_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS diaries (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_diaries_date ON diaries(date);

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  note TEXT,
  date TEXT,
  repeat TEXT NOT NULL DEFAULT 'none',
  done INTEGER NOT NULL DEFAULT 0,
  done_on TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS plugin_wishlist (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  is_todo INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  -- ↓ 遗留列：仅旧数据回填用（三态 kind + done），新代码读写 is_todo / completed
  kind TEXT,
  done INTEGER
);

CREATE TABLE IF NOT EXISTS memorials (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  repeat TEXT NOT NULL DEFAULT 'none',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  letter_theme TEXT NOT NULL DEFAULT 'default',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS period_records (
  id TEXT PRIMARY KEY,
  days TEXT NOT NULL,
  symptoms TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

/** 每日心情（阶段 P2 数据单源化）：id 即日期 key（非补零 YYYY-M-D，与前端 moodStore 一致），me/ai 为两人当天心情 */
CREATE TABLE IF NOT EXISTS moods (
  id TEXT PRIMARY KEY,
  me TEXT,
  ai TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

/** 追剧片单（阶段 P2 数据单源化）：一级分类 movie/anime/show × 二级状态 planned/watched */
CREATE TABLE IF NOT EXISTS watch_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  poster TEXT,
  note TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

/** 酒馆小手机 · 联系人（阶段 P2 数据单源化）：基本由角色卡派生，仍整体持久化防规则变化丢数据 */
CREATE TABLE IF NOT EXISTS phone_contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  avatar TEXT,
  character_id TEXT NOT NULL DEFAULT '',
  signature TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

/** 酒馆小手机 · 会话（单聊/群聊统一模型；messages 存 JSON 数组） */
CREATE TABLE IF NOT EXISTS phone_sessions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'single',
  target_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  avatar TEXT,
  member_ids TEXT NOT NULL DEFAULT '[]',
  mode TEXT NOT NULL DEFAULT 'online',
  pinned INTEGER NOT NULL DEFAULT 0,
  unread INTEGER NOT NULL DEFAULT 0,
  last_active_at INTEGER NOT NULL DEFAULT 0,
  messages TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

/** 酒馆小手机 · 朋友圈动态（images/likes/comments 存 JSON） */
CREATE TABLE IF NOT EXISTS phone_moments (
  id TEXT PRIMARY KEY,
  author_name TEXT NOT NULL DEFAULT '',
  author_avatar TEXT,
  content TEXT NOT NULL DEFAULT '',
  images TEXT NOT NULL DEFAULT '[]',
  likes TEXT NOT NULL DEFAULT '[]',
  comments TEXT NOT NULL DEFAULT '[]',
  mine INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  teacher TEXT,
  location TEXT,
  day INTEGER NOT NULL,
  start_period INTEGER NOT NULL,
  end_period INTEGER NOT NULL,
  start_week INTEGER NOT NULL,
  end_week INTEGER NOT NULL,
  parity TEXT NOT NULL DEFAULT 'all',
  color TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS timetable_config (
  id TEXT PRIMARY KEY,
  total_weeks INTEGER NOT NULL DEFAULT 20,
  period_times TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS stickers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  category_id TEXT NOT NULL DEFAULT 'default',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS sticker_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS rag_collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  embedding_model TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS rag_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  file_type TEXT,
  tags TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  importance INTEGER NOT NULL DEFAULT 3,
  pinned INTEGER NOT NULL DEFAULT 0,
  "order" INTEGER NOT NULL DEFAULT 0,
  author_type TEXT NOT NULL DEFAULT 'user',
  from_who TEXT,
  to_who TEXT,
  avatar_seed TEXT,
  need_notify INTEGER NOT NULL DEFAULT 0,
  owner_side TEXT NOT NULL DEFAULT 'me',
  status TEXT NOT NULL DEFAULT 'unfiled',
  embedding_model TEXT,
  meta TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_rag_documents_updated ON rag_documents(updated_at);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  avatar_seed TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT '#8b5cf6',
  emoji TEXT,
  is_me INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rag_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  embedding TEXT,
  embedding_dim INTEGER,
  hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_document ON rag_chunks(document_id);

CREATE TABLE IF NOT EXISTS rag_document_collections (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rag_doc_coll_collection ON rag_document_collections(collection_id);
CREATE INDEX IF NOT EXISTS idx_rag_doc_coll_document ON rag_document_collections(document_id);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL,
  instruction TEXT NOT NULL,
  trigger_keywords TEXT,
  trigger_mode TEXT NOT NULL DEFAULT 'keyword',
  icon TEXT,
  color TEXT,
  category TEXT NOT NULL DEFAULT 'custom',
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_skills_slug ON skills(slug);

CREATE TABLE IF NOT EXISTS skill_executions (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  conversation_id TEXT,
  trigger_type TEXT NOT NULL,
  input TEXT,
  output TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  latency_ms INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_skill_executions_created ON skill_executions(created_at);

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  cover_url TEXT,
  total_chapters INTEGER NOT NULL DEFAULT 1,
  content TEXT,
  desc TEXT,
  toc TEXT,
  color TEXT,
  band TEXT,
  height INTEGER,
  source TEXT NOT NULL DEFAULT 'local',
  source_id TEXT,
  source_meta TEXT,
  last_synced_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS reading_progress (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  reader TEXT NOT NULL,
  current_chapter INTEGER NOT NULL DEFAULT 1,
  current_position INTEGER NOT NULL DEFAULT 0,
  percent INTEGER NOT NULL DEFAULT 0,
  sync_status TEXT NOT NULL DEFAULT 'local',
  last_synced_at INTEGER,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_reading_progress_book ON reading_progress(book_id);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  selected_text TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'yellow',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_annotations_book ON annotations(book_id);

CREATE TABLE IF NOT EXISTS annotation_notes (
  id TEXT PRIMARY KEY,
  annotation_id TEXT NOT NULL,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_annotation_notes_annotation ON annotation_notes(annotation_id);

CREATE TABLE IF NOT EXISTS reading_logs (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  reader TEXT NOT NULL,
  day TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_reading_logs_reader_day ON reading_logs(reader, day);

-- 深夜电台素材（2026-10-19）：开场 / BGM / 音效 / 隐藏台 drama 切片
CREATE TABLE IF NOT EXISTS radio_assets (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  meta TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_radio_assets_channel ON radio_assets(channel, kind);

CREATE TABLE IF NOT EXISTS dishes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  cover_url TEXT,
  description TEXT,
  ingredients TEXT,
  steps TEXT,
  tags TEXT,
  difficulty INTEGER NOT NULL DEFAULT 1,
  healing_index INTEGER NOT NULL DEFAULT 3,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_dishes_type ON dishes(type);

-- 开源项目关注清单：只放用户自己加的项目（后端不再自动扫描依赖）
CREATE TABLE IF NOT EXISTS open_source_projects (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  name TEXT NOT NULL,
  note TEXT,
  description TEXT,
  stars INTEGER,
  language TEXT,
  homepage TEXT,
  latest_version TEXT,
  latest_published_at INTEGER,
  seen_version TEXT,
  last_checked_at INTEGER,
  has_update INTEGER NOT NULL DEFAULT 0,
  check_error TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

-- 晚安页音频（together → goodnight）：用户导入的哄睡/陪睡音频。本体落盘 data/sleep-audio/，这里只存 URL + 元数据。
CREATE TABLE IF NOT EXISTS sleep_audio (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  mime TEXT,
  duration INTEGER,
  size INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS tavern_characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT,
  description TEXT,
  personality TEXT,
  scenario TEXT,
  first_message TEXT,
  system_prompt TEXT,
  tags TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS tavern_worldbook (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  keywords TEXT,
  content TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  position TEXT NOT NULL DEFAULT 'before',
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS tavern_personas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

-- 「白起的内心」情绪状态：**单例行**，id 恒为 'default'（同 timetable_config 的约定）。
-- 数值都是 0-100 的整数，每聊完一轮由后端按规则微调（每条 delta 都写进 last_reason 供面板解释）。
-- last_message_id 是幂等键：同一条消息触发的重复演进要跳过。
CREATE TABLE IF NOT EXISTS character_state (
  id TEXT PRIMARY KEY,
  affection INTEGER NOT NULL DEFAULT 100,
  possessiveness INTEGER NOT NULL DEFAULT 50,
  restraint INTEGER NOT NULL DEFAULT 80,
  longing INTEGER NOT NULL DEFAULT 30,
  tension INTEGER NOT NULL DEFAULT 25,
  vulnerability INTEGER NOT NULL DEFAULT 20,
  current_mood TEXT NOT NULL DEFAULT '温柔',
  last_reason TEXT,
  last_message_id TEXT,
  last_user_message_id TEXT,
  turn_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

-- 渡口念头（Thought Notes）：角色内心一闪而过的独白，与 memories（记忆锚点）在同一个卡片流里展示。
-- context 记「什么情况下冒出来的」，is_resolved 供用户点掉（表示这条念头已经被看见/消化）。
CREATE TABLE IF NOT EXISTS thought_notes (
  id TEXT PRIMARY KEY,
  thought TEXT NOT NULL,
  context TEXT,
  is_resolved INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
`;

/**
 * 初始化数据库：启动时建表（幂等，CREATE TABLE IF NOT EXISTS）。
 */
export function initDatabase(): void {
  sqlite.exec(SCHEMA_SQL);

  // 幂等迁移：老库的 token_usage 缺 station_id 列时补上（新库已含该列）
  const cols = sqlite.prepare(`PRAGMA table_info(token_usage)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === 'station_id')) {
    sqlite.exec(`ALTER TABLE token_usage ADD COLUMN station_id TEXT`);
  }

  // 幂等迁移：老库的 rag_documents 补 memo 三列（pinned / order / author_type），并回填 AI 归档作者
  const ragCols = sqlite.prepare(`PRAGMA table_info(rag_documents)`).all() as { name: string }[];
  if (!ragCols.some((c) => c.name === 'pinned')) {
    sqlite.exec(`ALTER TABLE rag_documents ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`);
  }
  if (!ragCols.some((c) => c.name === 'order')) {
    sqlite.exec(`ALTER TABLE rag_documents ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0`);
  }
  if (!ragCols.some((c) => c.name === 'author_type')) {
    sqlite.exec(`ALTER TABLE rag_documents ADD COLUMN author_type TEXT NOT NULL DEFAULT 'user'`);
    sqlite.exec(`UPDATE rag_documents SET author_type = 'agent' WHERE source = 'agent'`);
  }
  // 幂等迁移：老库的 rag_documents 补归属四列（from_who / to_who / avatar_seed / need_notify）
  if (!ragCols.some((c) => c.name === 'from_who')) {
    sqlite.exec(`ALTER TABLE rag_documents ADD COLUMN from_who TEXT`);
  }
  if (!ragCols.some((c) => c.name === 'to_who')) {
    sqlite.exec(`ALTER TABLE rag_documents ADD COLUMN to_who TEXT`);
  }
  if (!ragCols.some((c) => c.name === 'avatar_seed')) {
    sqlite.exec(`ALTER TABLE rag_documents ADD COLUMN avatar_seed TEXT`);
  }
  if (!ragCols.some((c) => c.name === 'need_notify')) {
    sqlite.exec(`ALTER TABLE rag_documents ADD COLUMN need_notify INTEGER NOT NULL DEFAULT 0`);
  }
  // 幂等迁移：老库的 rag_documents 补 owner_side 列（归属方 me/partner）
  if (!ragCols.some((c) => c.name === 'owner_side')) {
    sqlite.exec(`ALTER TABLE rag_documents ADD COLUMN owner_side TEXT NOT NULL DEFAULT 'me'`);
  }
  // 幂等迁移：老库的 rag_documents 补 status 列（unfiled 未分类 / archived 已收录），并把旧语义值转换过来
  if (!ragCols.some((c) => c.name === 'status')) {
    sqlite.exec(`ALTER TABLE rag_documents ADD COLUMN status TEXT NOT NULL DEFAULT 'unfiled'`);
  } else {
    sqlite.exec(`UPDATE rag_documents SET status = 'archived' WHERE status = 'organized'`);
    sqlite.exec(`UPDATE rag_documents SET status = 'unfiled' WHERE status = 'draft'`);
  }

  /**
   * 幂等迁移（2026-10-18）：灵感待办池由「三态 kind + done」重构为「二态 is_todo + completed」。
   * 顺序不能反：回填的 UPDATE 会引用 completed / completed_at，必须先补齐三列。
   */
  const wishCols = sqlite.prepare(`PRAGMA table_info(plugin_wishlist)`).all() as { name: string }[];
  const wishMigrated = wishCols.some((c) => c.name === 'is_todo');
  if (!wishMigrated) {
    sqlite.exec(`ALTER TABLE plugin_wishlist ADD COLUMN is_todo INTEGER NOT NULL DEFAULT 0`);
  }
  if (!wishCols.some((c) => c.name === 'completed')) {
    sqlite.exec(`ALTER TABLE plugin_wishlist ADD COLUMN completed INTEGER NOT NULL DEFAULT 0`);
  }
  if (!wishCols.some((c) => c.name === 'completed_at')) {
    sqlite.exec(`ALTER TABLE plugin_wishlist ADD COLUMN completed_at INTEGER`);
  }
  // 幂等迁移（2026-10-18）：信件（notes）补信封主题列 letter_theme
  const noteCols = sqlite.prepare(`PRAGMA table_info(notes)`).all() as { name: string }[];
  if (!noteCols.some((c) => c.name === 'letter_theme')) {
    sqlite.exec(`ALTER TABLE notes ADD COLUMN letter_theme TEXT NOT NULL DEFAULT 'default'`);
  }

  /**
   * 幂等迁移（2026-10-18）：表情包分分类。
   * - 老库 stickers 补 `category_id`，已有行统一回填 'default'（NOT NULL + DEFAULT 一次搞定）；
   * - 保证固定存在一条 `id='default'` 的「默认」分类，后端不让删 ——
   *   否则删掉分类后，未指定分类的新增表情就会指向一个不存在的 id。
   */
  const stickerCols = sqlite.prepare(`PRAGMA table_info(stickers)`).all() as { name: string }[];
  if (!stickerCols.some((c) => c.name === 'category_id')) {
    sqlite.exec(`ALTER TABLE stickers ADD COLUMN category_id TEXT NOT NULL DEFAULT 'default'`);
  }
  const seedTs = Date.now();
  sqlite
    .prepare(
      `INSERT INTO sticker_categories (id, name, sort_order, created_at, updated_at)
       VALUES ('default', '默认', 0, ?, ?)
       ON CONFLICT(id) DO UPDATE SET deleted_at = NULL`,
    )
    .run(seedTs, seedTs);

  // 只在「首次新增 is_todo」时回填一次 —— 否则每次启动都会把用户之后的改动覆盖回旧值
  if (!wishMigrated) {
    sqlite.exec(`
      UPDATE plugin_wishlist SET
        is_todo = CASE WHEN kind = 'todo' THEN 1 ELSE 0 END,
        completed = CASE WHEN COALESCE(done, 0) = 1 THEN 1 ELSE 0 END,
        completed_at = CASE WHEN COALESCE(done, 0) = 1 THEN updated_at ELSE NULL END
    `);
  }

  /**
   * 幂等迁移（2026-10-19）：情绪状态机新增两维 + 前置分析幂等键。
   * - `tension`（紧绷与情欲）默认 25、`vulnerability`（示弱与委屈）默认 20 —— 即常态基准；
   * - `last_user_message_id` 记住「哪条用户消息已经在 /chat/stream 前置分析过」，
   *   消息落库时的 `evolveForMessage` 据此跳过，避免同一轮演进两次。
   */
  const charCols = sqlite.prepare(`PRAGMA table_info(character_state)`).all() as { name: string }[];
  if (!charCols.some((c) => c.name === 'tension')) {
    sqlite.exec(`ALTER TABLE character_state ADD COLUMN tension INTEGER NOT NULL DEFAULT 25`);
  }
  if (!charCols.some((c) => c.name === 'vulnerability')) {
    sqlite.exec(`ALTER TABLE character_state ADD COLUMN vulnerability INTEGER NOT NULL DEFAULT 20`);
  }
  if (!charCols.some((c) => c.name === 'last_user_message_id')) {
    sqlite.exec(`ALTER TABLE character_state ADD COLUMN last_user_message_id TEXT`);
  }

  /**
   * 幂等迁移（2026-10-19）：书架多源 + 双向进度。
   * books 补 source / source_id / source_meta / last_synced_at；
   * reading_progress 补 sync_status / last_synced_at。
   */
  const bookCols = sqlite.prepare(`PRAGMA table_info(books)`).all() as { name: string }[];
  if (!bookCols.some((c) => c.name === 'source')) {
    sqlite.exec(`ALTER TABLE books ADD COLUMN source TEXT NOT NULL DEFAULT 'local'`);
  }
  if (!bookCols.some((c) => c.name === 'source_id')) {
    sqlite.exec(`ALTER TABLE books ADD COLUMN source_id TEXT`);
  }
  if (!bookCols.some((c) => c.name === 'source_meta')) {
    sqlite.exec(`ALTER TABLE books ADD COLUMN source_meta TEXT`);
  }
  if (!bookCols.some((c) => c.name === 'last_synced_at')) {
    sqlite.exec(`ALTER TABLE books ADD COLUMN last_synced_at INTEGER`);
  }
  const progCols = sqlite.prepare(`PRAGMA table_info(reading_progress)`).all() as { name: string }[];
  if (!progCols.some((c) => c.name === 'sync_status')) {
    sqlite.exec(`ALTER TABLE reading_progress ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'local'`);
  }
  if (!progCols.some((c) => c.name === 'last_synced_at')) {
    sqlite.exec(`ALTER TABLE reading_progress ADD COLUMN last_synced_at INTEGER`);
  }

  migrateDietPersonaVars(sqlite);
}

/**
 * 幂等迁移（2026-10-18）：人设模块四补**结构化的饮食变量**。
 *
 * 为什么不能直接改 `PERSONA_MODULES` 就完事：`seedPersonaModules()` 默认**只补缺失**，
 * 已经装过的库里模块四早就存在，新变量根本不会被写进去 —— 于是
 * `{{diet_dislikes}}` / `{{diet_allergies}}` 会渲染成空字符串，徽章也永远是空的。
 * 所以老库要靠这条迁移补键。
 *
 * 规矩：
 * - **只补缺失的键**，已经存在的（用户自己改过的）一律不动；
 * - 旧变量 `diet_taboos` 那句自由文本当作 `diet_dislikes` 的初值（里面就写着忌口）；
 * - 正文只在**仍是旧版原样**时才替换，用户改过就不碰。
 */
function migrateDietPersonaVars(conn: Database.Database): void {
  const MODULE4 = '模块四 · 用户专属事实备忘库';
  const OLD_BLOCK = `- **绝对忌口与强过敏源：芒果。这是硬拦截，不是偏好。**
  · 不推荐、不提及、不做芒果相关的东西（芒果西米露、芒果奶昔在库里但对她不可用）。
  · 她想吃甜品时自动排除芒果类，换成草莓／香草／可可方向。
  · 她坚持要吃时，先提醒一句风险，再把话说软，**不训她**。
- **其他忌口**：{{diet_taboos}}`;
  const NEW_BLOCK = `- **忌口（不想吃 / 要避开，不是过敏）**：{{diet_dislikes}}
  · 推荐菜、买食材、点外卖时主动避开这些，不主动提及。
  · 她坚持要吃时提醒一句就好，**不训她**。
- **过敏源（硬拦截，不是偏好）**：{{diet_allergies}}
  · 不推荐、不提及、不做含这些食材的东西。
  · 命中时**必须明确提醒风险**，再把话说软。
  · 下面两项为空 = 她没有忌口 / 没有过敏源，不要自己编一个出来。`;

  const rows = conn
    .prepare(`SELECT id, content, variables FROM prompts WHERE name = ? AND deleted_at IS NULL`)
    .all(MODULE4) as { id: string; content: string; variables: string | null }[];

  for (const row of rows) {
    let vars: Record<string, unknown> = {};
    try {
      const parsed = row.variables ? JSON.parse(row.variables) : null;
      if (parsed && typeof parsed === 'object') vars = parsed as Record<string, unknown>;
    } catch {
      vars = {};
    }

    let dirty = false;
    if (!('diet_dislikes' in vars)) {
      // 旧版只有一句 diet_taboos 自由文本，拿它当忌口初值
      const legacy = typeof vars.diet_taboos === 'string' ? vars.diet_taboos : '';
      // 旧值形如「冰的少喝，尤其经期前后；不碰芒果。」——「不碰 X」那段已经归到过敏源了，
      // 这里只留前半句忌口，并把结尾残留的分隔符一并削掉。
      vars.diet_dislikes = legacy
        .replace(/[；;、]\s*不碰[^，。；、]*/g, '')
        .replace(/[，。；、;,.]\s*$/g, '')
        .trim();
      dirty = true;
    }
    if (!('diet_allergies' in vars)) {
      // 旧正文里明写着过敏源，挑出来；挑不到就留空（空 = 没有，绝不猜）
      const m = /绝对忌口与强过敏源[：:]\s*([^。\n]+)/.exec(row.content ?? '');
      vars.diet_allergies = m ? m[1].replace(/。这是硬拦截.*$/, '').trim() : '';
      dirty = true;
    }
    if (dirty) {
      conn
        .prepare(`UPDATE prompts SET variables = ?, updated_at = ? WHERE id = ?`)
        .run(JSON.stringify(vars), Date.now(), row.id);
    }

    // 正文只在「原样是旧版」时换，避免覆盖用户的手工编辑
    if ((row.content ?? '').includes(OLD_BLOCK)) {
      conn
        .prepare(`UPDATE prompts SET content = ?, updated_at = ? WHERE id = ?`)
        .run((row.content as string).replace(OLD_BLOCK, NEW_BLOCK), Date.now(), row.id);
    }
  }
}
