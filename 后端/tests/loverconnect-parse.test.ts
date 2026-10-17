/**
 * LoverConnect 返回值解析单测（纯函数，零 IO）。
 *
 * 跑法（在 `后端/` 下）：
 *   node node_modules/tsx/dist/cli.mjs --test tests/*.test.ts
 *
 * 所有期望值都来自 `McpService.kt` 里真实的字符串拼接格式，
 * 从那边改格式时这里必须同步改 —— 这就是这些用例存在的意义。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeConnectError,
  maskUrl,
  normalizeMcpUrl,
  parseAnniversary,
  parseBattery,
  parseContextEvents,
  parseDeviceContext,
  parseScreenTime,
  parseSteps,
  parseWeather,
} from '../src/device/parse.js';

const TOKEN = 'a1b2c3d4e5f6';

test('parseBattery：充电中 / 未充电 / 取不到电量', () => {
  const charging = parseBattery('电量：78%\n状态：充电中\n温度：31.2°C');
  assert.deepEqual(charging, { percent: 78, charging: true, temperature: 31.2 });

  const idle = parseBattery('电量：12%\n状态：未充电\n温度：29°C');
  assert.equal(idle?.percent, 12);
  // 「未充电」里也有「充电」两个字，先判反例才不会误判成充电中
  assert.equal(idle?.charging, false);

  // LC 在取不到时回 -1，不能当成 -1% 展示
  const unknown = parseBattery('电量：-1%\n状态：未充电\n温度：0°C');
  assert.equal(unknown?.percent, null);

  assert.equal(parseBattery('获取电池信息失败：boom'), null);
  assert.equal(parseBattery(''), null);
});

test('parseSteps：正常值与读不出的文本', () => {
  assert.equal(parseSteps('今日步数：1234步'), 1234);
  assert.equal(parseSteps('今日步数:0步'), 0);
  assert.equal(parseSteps('没有这个字段'), null);
});

test('parseWeather：六行完整格式 / 未设置城市', () => {
  const w = parseWeather(
    '杭州天气\n当前：晴 21°C\n体感：20°C\n湿度：55%\n风速：12km/h\n今日：15°C ~ 25°C',
  );
  assert.equal(w?.city, '杭州');
  assert.equal(w?.desc, '晴');
  assert.equal(w?.temp, 21);
  assert.equal(w?.feelsLike, 20);
  assert.equal(w?.humidity, 55);
  assert.equal(w?.windKmh, 12);
  assert.equal(w?.min, 15);
  assert.equal(w?.max, 25);

  // 负温度也要能解析
  const cold = parseWeather('哈尔滨天气\n当前：小雪 -8°C\n今日：-15°C ~ -3°C');
  assert.equal(cold?.temp, -8);
  assert.equal(cold?.min, -15);

  assert.equal(parseWeather('未设置城市，请在App中设置'), null);
  assert.equal(parseWeather('天气获取失败：timeout'), null);
});

test('parseAnniversary：正数与倒数混排 / 空库', () => {
  const list = parseAnniversary('纪念日\n---\n恋爱：第128天\n生日：还有3天');
  assert.deepEqual(list, [
    { name: '恋爱', kind: 'countup', days: 128 },
    { name: '生日', kind: 'countdown', days: 3 },
  ]);

  assert.deepEqual(parseAnniversary('暂无纪念日，请在App中添加'), []);
  assert.deepEqual(parseAnniversary(''), []);
});

test('parseScreenTime：总计换算与应用排行', () => {
  const st = parseScreenTime('屏幕使用时间报告\n总计：1小时23分钟\n---\n微信：40分钟\n浏览器：25分钟');
  assert.equal(st?.totalMinutes, 83);
  assert.deepEqual(st?.topApps, [
    { name: '微信', minutes: 40 },
    { name: '浏览器', minutes: 25 },
  ]);

  // 不足一小时时 LC 仍会输出「0小时X分钟」
  assert.equal(parseScreenTime('屏幕使用时间报告\n总计：0小时7分钟\n---')?.totalMinutes, 7);
  assert.equal(parseScreenTime('无数据（请确认已授予使用情况访问权限）'), null);
});

test('parseDeviceContext：默认关闭的信封', () => {
  const ctx = parseDeviceContext(
    JSON.stringify({
      schema_version: 1,
      generated_at_ms: 1792179294439,
      enabled: false,
      instruction_authority: 'none',
      status: 'disabled_by_user',
      hint: '设备情境默认关闭；可在 LoverConnect 内由用户主动开启。',
    }),
  );
  assert.equal(ctx?.enabled, false);
  assert.equal(ctx?.status, 'disabled_by_user');
  assert.equal(ctx?.generatedAt, 1792179294439);
  assert.deepEqual(ctx?.observations, []);
  assert.deepEqual(ctx?.unknown, []);
});

test('parseDeviceContext：观测拍平成中文行，数组与未知项一并带出', () => {
  const ctx = parseDeviceContext(
    JSON.stringify({
      enabled: true,
      generated_at_ms: 1792179294439,
      observations: {
        screen_live: { is_interactive: true },
        battery_live: { level_pct: 78, charging: true },
        steps_today: { count: 1234 },
        now_playing: { title: '晴天', artist: '周杰伦' },
      },
      inferences: ['屏幕亮着时更可能在用手机'],
      unknown: ['人的身体姿势', '人是否清醒或睡着'],
    }),
  );
  assert.equal(ctx?.enabled, true);
  assert.equal(ctx?.observations.length, 6);
  assert.deepEqual(
    ctx?.observations.map((r) => [r.label, r.value]),
    [
      ['屏幕亮着', '是'],
      ['电量', '78'],
      ['充电中', '是'],
      ['步数', '1234'],
      ['曲目', '晴天'],
      ['歌手', '周杰伦'],
    ],
  );
  // 未知项要如实带出：LC 的隐私边界就是「不猜姿势和睡眠」
  assert.deepEqual(ctx?.unknown, ['人的身体姿势', '人是否清醒或睡着']);
  assert.deepEqual(ctx?.inferences, ['屏幕亮着时更可能在用手机']);
});

test('parseDeviceContext：非 JSON 一律返回 null 而不是抛错', () => {
  assert.equal(parseDeviceContext('设备情境未开启'), null);
  assert.equal(parseDeviceContext(''), null);
  assert.equal(parseDeviceContext('[1,2,3]'), null);
});

test('parseContextEvents：数组与 {events} 两种形态都吃', () => {
  const asArray = parseContextEvents(
    JSON.stringify([{ type: 'screen_on', at_ms: 1792179294439, value: true }]),
  );
  assert.equal(asArray.length, 1);
  assert.equal(asArray[0].key, 'screen_on');
  assert.equal(asArray[0].label, 'screen_on');
  assert.match(asArray[0].value, /value=是/);

  const wrapped = parseContextEvents(
    JSON.stringify({ events: [{ type: 'battery_charging', at_ms: 1792179294439 }] }),
  );
  assert.equal(wrapped.length, 1);
  assert.equal(wrapped[0].key, 'battery_charging');

  assert.deepEqual(parseContextEvents('不是 JSON'), []);
  assert.deepEqual(parseContextEvents(''), []);
});

test('normalizeMcpUrl：补协议、去查询串', () => {
  assert.equal(
    normalizeMcpUrl(`127.0.0.1:5000/mcp/${TOKEN}`),
    `http://127.0.0.1:5000/mcp/${TOKEN}`,
  );
  assert.equal(
    normalizeMcpUrl(`http://localhost:5000/mcp/${TOKEN}?x=1#y`),
    `http://localhost:5000/mcp/${TOKEN}`,
  );
  assert.equal(
    normalizeMcpUrl(`  http://127.0.0.1:5000/mcp/${TOKEN}/  `),
    `http://127.0.0.1:5000/mcp/${TOKEN}`,
  );
});

test('normalizeMcpUrl：拒绝非回环地址（令牌不能外发）', () => {
  assert.throws(() => normalizeMcpUrl(`http://192.168.1.5:5000/mcp/${TOKEN}`), /回环/);
  assert.throws(() => normalizeMcpUrl(`https://example.com/mcp/${TOKEN}`), /回环/);
});

test('normalizeMcpUrl：拒绝不像 MCP 路径的地址', () => {
  assert.throws(() => normalizeMcpUrl('http://127.0.0.1:5000/mcp'), /\/mcp\//);
  assert.throws(() => normalizeMcpUrl('http://127.0.0.1:5000/'), /\/mcp\//);
  assert.throws(() => normalizeMcpUrl(''), /完整 MCP 地址/);
  // 「不是地址」会被补成 `http://不是地址`，主机名过不了回环校验 —— 拦下来就行，措辞不挑
  assert.throws(() => normalizeMcpUrl('不是地址'), /回环|格式不对|\/mcp\//);
});

test('maskUrl：不泄漏令牌明文', () => {
  const masked = maskUrl(`http://127.0.0.1:5000/mcp/${TOKEN}`);
  assert.ok(!masked.includes(TOKEN), `脱敏结果里不应出现令牌，实际：${masked}`);
  assert.match(masked, /127\.0\.0\.1:5000/);
  assert.match(masked, new RegExp(`${TOKEN.length} 位令牌`));
  assert.equal(maskUrl(''), '');
  assert.equal(maskUrl('???'), '（无法解析的地址）');
});

test('describeConnectError：把底层错误翻成可照做的说法', () => {
  assert.match(describeConnectError(new Error('HTTP 401')), /令牌不对/);
  assert.match(describeConnectError(new Error('HTTP 403')), /Origin/);
  assert.match(describeConnectError(new Error('fetch failed')), /adb reverse/);
  assert.match(describeConnectError(new Error('ECONNREFUSED')), /adb reverse/);
  assert.match(describeConnectError(new Error('手机没有回话 超时')), /超时/);
  assert.equal(describeConnectError(new Error('某个没见过的错')), '某个没见过的错');
});
