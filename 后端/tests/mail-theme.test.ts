/**
 * 调度器给信挑信封主题（`pickLetterTheme`）单测：临时库，不碰真库。
 * 跑法：node node_modules/tsx/dist/cli.mjs --test tests/mail-theme.test.ts
 */
import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase, db } from '../src/db/client.js';
import { memorials } from '../src/db/schema.js';
import { pickLetterTheme } from '../src/services/mailScheduler.js';

/** 造一个本地时间戳：年月日 + 时分 */
function tsAt(y: number, m: number, d: number, hour: number): number {
  return new Date(y, m - 1, d, hour, 0, 0).getTime();
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function clearMemorials() {
  initDatabase();
  db.delete(memorials).run();
}

function addMemorial(date: string, repeat: string, deleted = false) {
  db.insert(memorials)
    .values({
      id: `m-${date}-${repeat}-${deleted}`,
      title: 't',
      date,
      repeat,
      pinned: false,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: deleted ? 1 : null,
    })
    .run();
}

test('白天 default，深夜 / 凌晨 night', () => {
  clearMemorials();
  assert.equal(pickLetterTheme(tsAt(2026, 10, 18, 14)), 'default', '下午 → default');
  assert.equal(pickLetterTheme(tsAt(2026, 10, 18, 9)), 'default');
  assert.equal(pickLetterTheme(tsAt(2026, 10, 18, 21)), 'default', '21 点还算白天');
  assert.equal(pickLetterTheme(tsAt(2026, 10, 18, 22)), 'night', '22 点起算深夜');
  assert.equal(pickLetterTheme(tsAt(2026, 10, 18, 23)), 'night');
  assert.equal(pickLetterTheme(tsAt(2026, 10, 19, 3)), 'night', '凌晨 3 点仍是 night');
  assert.equal(pickLetterTheme(tsAt(2026, 10, 19, 4)), 'night');
  assert.equal(pickLetterTheme(tsAt(2026, 10, 19, 5)), 'default', '5 点起回 default');
});

test('命中纪念日 → memorial，且优先于 night', () => {
  clearMemorials();
  addMemorial(iso(2026, 10, 18), 'none');
  assert.equal(pickLetterTheme(tsAt(2026, 10, 18, 14)), 'memorial');
  // 纪念日当天即使是深夜也走 memorial（纪念日比时段更具体）
  assert.equal(pickLetterTheme(tsAt(2026, 10, 18, 23)), 'memorial');
  // 换一天就不该命中
  assert.equal(pickLetterTheme(tsAt(2026, 10, 19, 14)), 'default');
});

test('重复规则：每年 / 每月 / 每天', () => {
  clearMemorials();
  addMemorial(iso(2020, 3, 9), 'year');
  assert.equal(pickLetterTheme(tsAt(2026, 3, 9, 12)), 'memorial', '每年重复看月日');
  assert.equal(pickLetterTheme(tsAt(2026, 3, 10, 12)), 'default');

  db.delete(memorials).run();
  addMemorial(iso(2020, 3, 9), 'month');
  assert.equal(pickLetterTheme(tsAt(2026, 7, 9, 12)), 'memorial', '每月重复看日');
  assert.equal(pickLetterTheme(tsAt(2026, 7, 10, 12)), 'default');

  db.delete(memorials).run();
  addMemorial(iso(2020, 3, 9), 'day');
  assert.equal(pickLetterTheme(tsAt(2026, 12, 31, 12)), 'memorial', '每天重复恒定命中');
});

test('软删的纪念日不算；日期非法也不算', () => {
  clearMemorials();
  addMemorial(iso(2026, 10, 18), 'none', true);
  assert.equal(pickLetterTheme(tsAt(2026, 10, 18, 14)), 'default', '已删除 → 不算');

  db.delete(memorials).run();
  addMemorial('bad-date', 'none');
  assert.equal(pickLetterTheme(tsAt(2026, 10, 18, 14)), 'default', '日期非法 → 跳过');
});
