import type { DishType, DishIngredient, NewDishInput } from '@/lib/api/dishes';

/** 特殊食材替代方案（小猫专属） */
export const SUBSTITUTE_MAP: Record<string, { reason: string; replace: string }> = {
  洋葱: { reason: '去腥增甜，温和替代', replace: '用番茄或彩椒代替，口感更清爽' },
  葱: { reason: '保留香气，降低刺激', replace: '用少量香葱油或韭菜花替代' },
  姜: { reason: '去腥提鲜', replace: '用柠檬皮屑或白胡椒替代' },
  蒜: { reason: '降低刺激', replace: '用蒜苗或韭菜替代，香气更柔和' },
  青椒: { reason: '减辣保脆', replace: '用彩椒（红黄）代替，甜脆不辣' },
  秋葵: { reason: '黏液敏感替代', replace: '用芦笋或荷兰豆代替，口感脆嫩' },
};

/** 宠溺推荐语（盲盒抽中随机） */
export const SWEET_WORDS = [
  '这个配你，刚刚好 🍓',
  '小猫今天要好好吃饭哦 🥣',
  '选好了，不许挑食～',
  '这道菜会替我抱抱你 🤗',
  '尝一口，是我对你的心意 💕',
  '辛苦啦，奖励你吃这个 🍰',
];

export function pickRecommendation(): string {
  return SWEET_WORDS[Math.floor(Math.random() * SWEET_WORDS.length)];
}

const MANGO_KEYWORDS = ['芒果', 'mango', 'Mango', 'MANGO'];

/** 判断文本是否含芒果过敏原 */
export function checkMango(text: string): boolean {
  return MANGO_KEYWORDS.some((k) => text.includes(k));
}

/** 标签配色：多囊友好=绿、治愈指数=粉、姨妈期推荐=玫红 */
export function tagClass(tag: string): string {
  switch (tag) {
    case '多囊友好':
      return 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800';
    case '治愈指数':
      return 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-400 dark:border-pink-800';
    case '姨妈期推荐':
      return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800';
    default:
      return 'bg-muted text-foreground/70 border-border';
  }
}

export function tagEmoji(tag: string): string {
  if (tag === '多囊友好') return '🫘 ';
  if (tag === '姨妈期推荐') return '🌸 ';
  return '';
}

export const DISH_TABS: { value: DishType; label: string }[] = [
  { value: 'meal', label: '🍚 日常正餐' },
  { value: 'dessert', label: '🍰 治愈甜品' },
];

/** 内置菜品（迁移自旧食谱 + 甜品，播种后端用） */
export function seedDishInputs(): NewDishInput[] {
  const ing = (list: [string, string, string?][]) =>
    list.map(([name, amount, unit]) => ({ name, amount, unit }) as DishIngredient);
  return [
    // ---- 正餐 ----
    {
      name: '番茄牛腩', type: 'meal',
      description: '小火慢炖更入味，配米饭刚刚好',
      ingredients: ing([['番茄', '2', '个'], ['牛腩', '500', 'g'], ['土豆', '1', '个'], ['洋葱', '半个', '']]),
      steps: ['牛腩切块冷水下锅焯水，撇去浮沫', '番茄去皮炒出沙，加洋葱增香', '下牛腩与土豆，加水没过，小火炖 1 小时至软烂', '加盐调味，撒葱花出锅'],
      tags: ['多囊友好'], difficulty: 2, healingIndex: 4,
    },
    {
      name: '清炒时蔬', type: 'meal',
      description: '清淡快手，一顿饭里最安心的绿',
      ingredients: ing([['时蔬', '300', 'g'], ['蒜', '2', '瓣'], ['盐', '少许', '']]),
      steps: ['时蔬洗净沥干', '热油爆香蒜末', '下时蔬大火快炒至断生', '加盐出锅'],
      tags: [], difficulty: 1, healingIndex: 3,
    },
    {
      name: '玉米排骨汤', type: 'meal',
      description: '清甜滋补，暖到心里',
      ingredients: ing([['玉米', '1', '根'], ['排骨', '500', 'g'], ['姜', '3', '片'], ['盐', '适量', '']]),
      steps: ['排骨冷水下锅焯水去腥', '玉米切段', '排骨、玉米、姜片同煮 1 小时', '加盐调味'],
      tags: ['姨妈期推荐'], difficulty: 1, healingIndex: 5,
    },
    {
      name: '番茄蛋花汤', type: 'meal',
      description: '十分钟搞定，酸甜开胃',
      ingredients: ing([['番茄', '2', '个'], ['鸡蛋', '2', '个'], ['葱花', '少许', '']]),
      steps: ['番茄炒软加水烧开', '淋入打散的蛋液成蛋花', '撒葱花，加盐出锅'],
      tags: [], difficulty: 1, healingIndex: 3,
    },
    {
      name: '扬州炒饭', type: 'meal',
      description: '隔夜饭的华丽变身',
      ingredients: ing([['米饭', '2', '碗'], ['鸡蛋', '2', '个'], ['火腿', '50', 'g'], ['青豆', '30', 'g']]),
      steps: ['鸡蛋炒散盛出', '下米饭翻炒至粒粒分明', '加火腿、青豆翻炒均匀', '回锅鸡蛋，调味出锅'],
      tags: [], difficulty: 1, healingIndex: 3,
    },
    // ---- 甜品 ----
    {
      name: '芒果西米露', type: 'dessert',
      description: '奶香浓郁，冷藏后更好吃',
      ingredients: ing([['芒果', '2', '个'], ['西米', '50', 'g'], ['椰浆', '200', 'ml'], ['糖', '适量', '']]),
      steps: ['西米煮至透明过冷水', '芒果切丁，留部分打泥', '西米加椰浆、糖与芒果丁拌匀', '冷藏后食用'],
      tags: ['治愈指数'], difficulty: 1, healingIndex: 5,
    },
    {
      name: '提拉米苏', type: 'dessert',
      description: '冷藏过夜口感更好，带我走吧',
      ingredients: ing([['手指饼干', '若干', ''], ['马斯卡彭', '250', 'g'], ['咖啡', '1', '杯'], ['可可粉', '适量', '']]),
      steps: ['手指饼干浸咖啡', '铺马斯卡彭奶酪糊', '重复叠加，冷藏过夜', '食用前撒可可粉'],
      tags: ['治愈指数'], difficulty: 2, healingIndex: 5,
    },
    {
      name: '草莓奶油蛋糕', type: 'dessert',
      description: '甜过初恋，软乎乎的',
      ingredients: ing([['低筋面粉', '100', 'g'], ['鸡蛋', '4', '个'], ['淡奶油', '300', 'ml'], ['草莓', '10', '颗']]),
      steps: ['烤戚风蛋糕底，放凉', '淡奶油打发抹面', '夹整颗草莓，装饰即可'],
      tags: ['治愈指数'], difficulty: 3, healingIndex: 5,
    },
    {
      name: '芒果奶昔', type: 'dessert',
      description: '熟芒果与牛奶搅打顺滑',
      ingredients: ing([['芒果', '1', '个'], ['牛奶', '200', 'ml'], ['酸奶', '100', 'g']]),
      steps: ['芒果去皮去核切块', '与牛奶、酸奶一起搅打至顺滑', '倒入杯中，冷藏更好喝'],
      tags: ['治愈指数'], difficulty: 1, healingIndex: 4,
    },
    {
      name: '冰美式', type: 'dessert',
      description: '清醒一点，继续想我',
      ingredients: ing([['咖啡豆', '18', 'g'], ['冰块', '适量', '']]),
      steps: ['萃取浓缩咖啡', '杯中加入冰块与凉水', '倒入浓缩，拌匀即可'],
      tags: [], difficulty: 1, healingIndex: 3,
    },
    {
      name: '香草冰淇淋', type: 'dessert',
      description: '慢慢搅拌，是耐心换来的甜',
      ingredients: ing([['淡奶油', '300', 'ml'], ['蛋黄', '3', '个'], ['香草荚', '1', '根'], ['糖', '60', 'g']]),
      steps: ['蛋黄加糖打发', '混合淡奶油与香草籽', '冷冻并多次搅拌，防冰渣'],
      tags: ['治愈指数'], difficulty: 2, healingIndex: 5,
    },
    {
      name: '蔓越莓司康', type: 'dessert',
      description: '外酥内软，配茶刚好',
      ingredients: ing([['低筋面粉', '200', 'g'], ['黄油', '50', 'g'], ['蔓越莓', '40', 'g'], ['泡打粉', '5', 'g']]),
      steps: ['黄油搓入面粉成粗砂状', '加蔓越莓与牛奶拌成团', '整形切块，刷蛋液', '烤箱烤至金黄'],
      tags: [], difficulty: 2, healingIndex: 4,
    },
  ];
}
