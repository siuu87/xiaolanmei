/**
 * 黄历（老黄历）引擎 —— 小米日历风格详情页的数据层。
 *
 * 基础的农历 / 干支（丙午马年 戊戌月 甲子日）直接取 solarlunar，和小米日历对得上；
 * 下面这些是 solarlunar 没有的，按传统规则自己推：
 *   - 纳音五行：六十甲子纳音表（甲子乙丑海中金…）
 *   - 建除十二神：月建支起「建」，顺数到日支（甲子日在戌月 → 满）
 *   - 彭祖百忌：天干一句 + 地支一句
 *   - 胎神：六十甲子逐日占位表（流传通行版，个别条目各版本略有出入）
 *   - 二十八宿：28 天一轮，用 2026-10-17=氐 校准（那天星期六，土宿镇周六）
 *   - 冲煞：日柱隔 30 位对冲（甲子 → 戊午），煞方按三合局
 *   - 时辰吉凶：日支起青龙（子午日申上起），青龙/明堂/金匮/天德/玉堂/司命为吉
 *   - 宜忌：按建除十二神给常用清单（真正的通书逐日宜忌要看《协纪辨方书》，
 *     这里是合理的近似——陪伴 app 够用，别拿去择日子）
 */
import solarlunar from 'solarlunar';

const GAN = '甲乙丙丁戊己庚辛壬癸';
const ZHI = '子丑寅卯辰巳午未申酉戌亥';
const ZHI_ANIMAL = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];

/** 六十甲子序列（甲子…癸亥），干支字符串 → 序号 */
const GZ60: string[] = Array.from({ length: 60 }, (_, i) => GAN[i % 10] + ZHI[i % 12]);
const gz60Index = (gz: string) => GZ60.indexOf(gz);

/* ------------------------------ 纳音五行 ------------------------------ */

/** 六十甲子纳音（30 组，每组管两位） */
const NAYIN = [
  '海中金', '炉中火', '大林木', '路旁土', '剑锋金',
  '山头火', '涧下水', '城头土', '白蜡金', '杨柳木',
  '泉中水', '屋上土', '霹雳火', '松柏木', '长流水',
  '砂石金', '山下火', '平地木', '壁上土', '金箔金',
  '覆灯火', '天河水', '大驿土', '钗钏金', '桑柘木',
  '大溪水', '沙中土', '天上火', '石榴木', '大海水',
];
const nayinOf = (gzIdx: number) => NAYIN[Math.floor(gzIdx / 2)];

/* ------------------------------ 建除十二神 ------------------------------ */

const XII_SHEN = ['建', '除', '满', '平', '定', '执', '破', '危', '成', '收', '开', '闭'];
/** 月支（节后）起「建」，顺数到日支 */
function twelfthOf(gzDay: string, gzMonth: string): { shen: string; idx: number } {
  const dayZhi = ZHI.indexOf(gzDay[1]);
  const monthZhi = ZHI.indexOf(gzMonth[1]);
  const idx = (dayZhi - monthZhi + 12) % 12;
  return { shen: XII_SHEN[idx], idx };
}

/* ------------------------------ 彭祖百忌 ------------------------------ */

const PENGZU_GAN = [
  '甲不开仓', '乙不栽植', '丙不修灶', '丁不剃头', '戊不受田',
  '己不破券', '庚不经络', '辛不合酱', '壬不泱水', '癸不词讼',
];
const PENGZU_ZHI = [
  '子不问卜', '丑不冠带', '寅不祭祀', '卯不穿井', '辰不哭泣', '巳不远行',
  '午不苫盖', '未不服药', '申不安床', '酉不会客', '戌不吃犬', '亥不嫁娶',
];

/* ------------------------------ 胎神 ------------------------------ */

/** 六十甲子逐日胎神占位（通行版） */
const TAISHEN = [
  '占门碓 外东南', '碓磨厕 外东南', '厨灶炉 外正南', '仓库门 外正南', '房床栖 外正南',
  '占门床 外正南', '占碓磨 外正南', '厨灶厕 外西南', '仓库炉 外西南', '房床门 外西南',
  '门鸡栖 外西南', '碓磨床 外西南', '厨灶碓 外西南', '仓库厕 外西北', '房床炉 外西北',
  '占大门 外西北', '碓磨栖 外西北', '厨灶床 外西北', '仓库门 外西北', '房床厕 外西北',
  '占门炉 外西北', '碓磨门 外西北', '厨灶栖 外西北', '仓库床 外西北', '房床碓 外正北',
  '占门厕 外正北', '碓磨炉 外正北', '厨灶门 外正北', '仓库栖 外正北', '房床房 外正北',
  '占门碓 房内北', '碓磨厕 房内北', '厨灶炉 房内北', '仓库门 房内北', '房床栖 房内中',
  '占门床 房内中', '占碓磨 房内南', '厨灶厕 房内南', '仓库炉 房内南', '房床门 房内南',
  '门鸡栖 房内南', '碓磨床 房内南', '厨灶碓 房内南', '仓库厕 房内南', '房床炉 房内中',
  '占大门 外正南', '碓磨栖 外正南', '厨灶床 外正南', '仓库门 外正南', '房床厕 外正南',
  '占门炉 外正南', '碓磨门 外西南', '厨灶栖 外西南', '仓库床 外西南', '房床碓 外西南',
  '占门厕 外西南', '碓磨炉 外西南', '厨灶门 外正西', '仓库栖 外正西', '房床床 外正西',
];

/* ------------------------------ 二十八宿 ------------------------------ */

const SU_28: { name: string; animal: string; luck: '吉' | '凶'; xiang: string }[] = [
  { name: '角', animal: '蛟', luck: '吉', xiang: '东方' },
  { name: '亢', animal: '龙', luck: '凶', xiang: '东方' },
  { name: '氐', animal: '貉', luck: '凶', xiang: '东方' },
  { name: '房', animal: '兔', luck: '吉', xiang: '东方' },
  { name: '心', animal: '狐', luck: '凶', xiang: '东方' },
  { name: '尾', animal: '虎', luck: '吉', xiang: '东方' },
  { name: '箕', animal: '豹', luck: '吉', xiang: '东方' },
  { name: '斗', animal: '獬', luck: '吉', xiang: '北方' },
  { name: '牛', animal: '牛', luck: '凶', xiang: '北方' },
  { name: '女', animal: '蝠', luck: '凶', xiang: '北方' },
  { name: '虚', animal: '鼠', luck: '凶', xiang: '北方' },
  { name: '危', animal: '燕', luck: '吉', xiang: '北方' },
  { name: '室', animal: '猪', luck: '吉', xiang: '北方' },
  { name: '壁', animal: '貐', luck: '吉', xiang: '北方' },
  { name: '奎', animal: '狼', luck: '凶', xiang: '西方' },
  { name: '娄', animal: '狗', luck: '吉', xiang: '西方' },
  { name: '胃', animal: '雉', luck: '吉', xiang: '西方' },
  { name: '昴', animal: '鸡', luck: '凶', xiang: '西方' },
  { name: '毕', animal: '乌', luck: '吉', xiang: '西方' },
  { name: '觜', animal: '猴', luck: '凶', xiang: '西方' },
  { name: '参', animal: '猿', luck: '吉', xiang: '西方' },
  { name: '井', animal: '犴', luck: '吉', xiang: '南方' },
  { name: '鬼', animal: '羊', luck: '凶', xiang: '南方' },
  { name: '柳', animal: '獐', luck: '凶', xiang: '南方' },
  { name: '星', animal: '马', luck: '凶', xiang: '南方' },
  { name: '张', animal: '鹿', luck: '吉', xiang: '南方' },
  { name: '翼', animal: '蛇', luck: '凶', xiang: '南方' },
  { name: '轸', animal: '蚓', luck: '吉', xiang: '南方' },
];
/** 宿的五行按七曜轮：木金土日月火水 */
const SU_WUXING = ['木', '金', '土', '日', '月', '火', '水'];

/** 校准点：2026-10-17 = 氐（index 2）。小米日历同日同为氐宿。 */
const SU_BASE = { y: 2026, m: 10, d: 17, idx: 2 };

function xiuOf(y: number, m: number, d: number) {
  const base = Date.UTC(SU_BASE.y, SU_BASE.m - 1, SU_BASE.d);
  const cur = Date.UTC(y, m - 1, d);
  const diff = Math.round((cur - base) / 86400000);
  const idx = ((diff % 28) + 28 + SU_BASE.idx) % 28;
  return { ...SU_28[idx], idx };
}

/* ------------------------------ 冲煞 ------------------------------ */

/** 煞方按日支三合局：申子辰煞南、巳酉丑煞东、寅午戌煞北、亥卯未煞西 */
function shasOf(gzDay: string): { chong: string; chongAnimal: string; sha: string } {
  const gzIdx = gz60Index(gzDay);
  const cIdx = (gzIdx + 54) % 60; // 对冲的干支（甲子→戊午）
  const chong = GZ60[cIdx];
  const zhi = ZHI.indexOf(gzDay[1]);
  const shaMap: Record<number, string> = { 0: '南', 1: '东', 2: '北', 3: '西', 4: '南', 5: '东', 6: '北', 7: '西', 8: '南', 9: '东', 10: '北', 11: '西' };
  return { chong, chongAnimal: ZHI_ANIMAL[ZHI.indexOf(chong[1])], sha: shaMap[zhi] ?? '南' };
}

/* ------------------------------ 时辰吉凶 ------------------------------ */

const HOUR_GODS = ['青龙', '明堂', '天刑', '朱雀', '金匮', '天德', '白虎', '玉堂', '天牢', '玄武', '司命', '勾陈'];
const HOUR_LUCKY = new Set(['青龙', '明堂', '金匮', '天德', '玉堂', '司命']);

/**
 * 日支起青龙：子午日申上起、丑未日戌、寅申日子、卯酉日寅、辰戌日辰、巳亥日午。
 * 已用小米日历（甲子日）逐时核对：子吉丑吉寅凶卯吉辰凶巳凶午吉未凶申吉酉吉戌凶亥凶。
 */
function hourLuckOf(gzDay: string): { zhi: string; luck: '吉' | '凶'; god: string }[] {
  const dayZhi = ZHI.indexOf(gzDay[1]);
  const start = ((dayZhi % 6) * 2 + 8) % 12;
  return Array.from({ length: 12 }, (_, k) => {
    const zhiIdx = (start + k) % 12;
    const god = HOUR_GODS[k % 12];
    return { zhi: ZHI[zhiIdx], luck: HOUR_LUCKY.has(god) ? ('吉' as const) : ('凶' as const), god };
  })
    .sort((a, b) => ZHI.indexOf(a.zhi) - ZHI.indexOf(b.zhi));
}

/* ------------------------------ 宜忌（按建除十二神） ------------------------------ */

const YIJI: Record<string, { yi: string[]; ji: string[] }> = {
  建: { yi: ['出行', '上任', '会友', '上书'], ji: ['动土', '开仓', '嫁娶', '词讼'] },
  除: { yi: ['沐浴', '清洁', '治病', '求医'], ji: ['开业', '嫁娶', '出行', '签约'] },
  满: { yi: ['纳采', '订盟', '会亲友', '沐浴'], ji: ['开市', '出行', '嫁娶', '修坟'] },
  平: { yi: ['修饰', '平治道涂', '安床'], ji: ['祈福', '求嗣', '嫁娶', '开市'] },
  定: { yi: ['冠带', '安床', '会亲友', '立券'], ji: ['词讼', '出行', '搬移', '开市'] },
  执: { yi: ['捕捉', '结网', '立券', '交易'], ji: ['搬移', '出行', '开市', '安葬'] },
  破: { yi: ['破屋', '坏垣', '求医', '治病'], ji: ['嫁娶', '开市', '出行', '签约'] },
  危: { yi: ['安床', '祭祀', '沐浴'], ji: ['登高', '行船', '出行', '嫁娶'] },
  成: { yi: ['开业', '嫁娶', '入学', '签约'], ji: ['词讼', '出行', '安葬', '动土'] },
  收: { yi: ['纳财', '收债', '进人口'], ji: ['葬仪', '出行', '开市', '安床'] },
  开: { yi: ['开业', '开工', '出行', '立券'], ji: ['安葬', '破土', '伐木'] },
  闭: { yi: ['安葬', '修坟', '筑堤'], ji: ['开市', '出行', '嫁娶', '移徙'] },
};

/* ------------------------------ 汇总 ------------------------------ */

export interface Almanac {
  /** 公历标题：2026年10月17日星期六 */
  title: string;
  /** 大数字 17 */
  day: number;
  /** 农历：九月初八 */
  lunarText: string;
  /** 干支行：丙午马年 戊戌月 甲子日 */
  gzLine: string;
  /** 宜 / 忌 */
  yi: string[];
  ji: string[];
  /** 五行栏：纳音 + 建除执位 */
  wuxing: string;
  /** 建除十二神名（满 → 满执位） */
  twelfth: string;
  pengzu: string[];
  taishen: string;
  /** 星宿：东方氐土貉 · 凶 */
  xiu: string;
  chong: string;
  sha: string;
  hours: { zhi: string; luck: '吉' | '凶' }[];
}

export function almanacOf(y: number, m: number, d: number): Almanac | null {  let lz;
  try {
    lz = solarlunar.solar2lunar(y, m, d);
    if (lz === -1) return null;
  } catch {
    return null;
  }

  const gzDay = lz.gzDay;
  const gzIdx = gz60Index(gzDay);
  const twelfth = twelfthOf(gzDay, lz.gzMonth);
  const yiji = YIJI[twelfth.shen];
  const xiu = xiuOf(y, m, d);
  const { chong, chongAnimal, sha } = shasOf(gzDay);
  const suWuxing = SU_WUXING[xiu.idx % 7];

  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  return {
    title: `${y}年${m}月${d}日${weekdays[new Date(y, m - 1, d).getDay()]}`,
    day: d,
    lunarText: `${lz.monthCn}${lz.dayCn}`,
    gzLine: `${lz.gzYear}${lz.animal}年 ${lz.gzMonth}月 ${lz.gzDay}日`,
    yi: yiji.yi,
    ji: yiji.ji,
    wuxing: `${nayinOf(gzIdx)} ${twelfth.shen}执位`,
    twelfth: twelfth.shen,
    pengzu: [PENGZU_GAN[GAN.indexOf(gzDay[0])], PENGZU_ZHI[ZHI.indexOf(gzDay[1])], '自惹祸殃'],
    taishen: TAISHEN[gzIdx],
    xiu: `${xiu.xiang}${xiu.name}${suWuxing === '日' || suWuxing === '月' ? '' : suWuxing}${xiu.animal} · ${xiu.luck}`,
    chong: `${ZHI_ANIMAL[ZHI.indexOf(gzDay[1])]}日冲${chongAnimal}(${chong})`,
    sha,
    hours: hourLuckOf(gzDay).map(({ zhi, luck }) => ({ zhi, luck })),
  };
}

/** 只取农历月日：「九月初八」（拓展页心情下方那一行用） */
export function lunarTextOf(y: number, m: number, d: number): string | null {
  try {
    const lz = solarlunar.solar2lunar(y, m, d);
    return lz === -1 ? null : `${lz.monthCn}${lz.dayCn}`;
  } catch {
    return null;
  }
}
