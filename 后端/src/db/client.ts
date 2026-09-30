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
}
