// 测试专用：在任何 import 数据库模块之前，把 DATABASE_PATH 指到系统临时目录，
// 避免污染真实库（data/blueberry.db）。本文件不以 .test.ts 结尾，故不会被 glob 当作测试文件单独跑。
import os from 'node:os';
import path from 'node:path';

if (!process.env.DATABASE_PATH) {
  process.env.DATABASE_PATH = path.join(os.tmpdir(), `xiaolanmei-wl-test-${process.pid}.db`);
}
