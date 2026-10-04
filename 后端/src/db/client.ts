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

CREATE TABLE IF NOT EXISTS worldbook (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
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
}
