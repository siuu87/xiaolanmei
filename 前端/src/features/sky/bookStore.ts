import { create } from 'zustand';
import {
  listReadingBooks,
  createReadingBook,
  updateReadingBook,
  deleteReadingBook,
  saveProgress,
  type ReadingBook,
} from '@/lib/api/reading';

export interface Book {
  id: string;
  title: string;
  author: string;
  /** 书脊底色 */
  color: string;
  /** 书头/书脚带颜色 */
  band: string;
  /** 书脊高度（px），错落更自然 */
  height: number;
  /** 封面图片（URL 或 dataURL），用于平铺封面 */
  cover?: string;
  /** 一句话详情 */
  desc: string;
  /** 正文（文章），\n\n 分段 */
  content: string;
  /** 目录（章节标题） */
  toc: string[];
  /** 我的阅读进度 0~1 */
  progress: number;
  /** 最近一次阅读时间戳 */
  lastReadAt?: number;
}

const PALETTE = [
  { color: '#9f3b3b', band: '#d4a24c' },
  { color: '#2f5d50', band: '#b98a3f' },
  { color: '#2f3e63', band: '#6b8bb8' },
  { color: '#7a2e3a', band: '#c98a3f' },
  { color: '#6b4a2f', band: '#d0a050' },
  { color: '#3f6f6b', band: '#c9a24c' },
  { color: '#5b3a6e', band: '#c99b4c' },
  { color: '#3e5a7a', band: '#9ab8d8' },
];

const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/** 由书名确定性地生成书脊高度（120~152px） */
function heightOf(title: string): number {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return 120 + (h % 33);
}

// 各书的试读正文（占位内容，可在详情里编辑替换）
const CONTENT: Record<string, { desc: string; toc: string[]; content: string }> = {
  小王子: {
    desc: '一本写给大人的童话，关于爱、驯养与告别。',
    toc: ['一 · 那顶帽子', '二 · 遇见飞行员', '三 · 玫瑰与狐狸'],
    content: '我在六岁那年，画过一幅蟒蛇吞大象的画，大人们却总说那只是一顶帽子。\n\n后来我长大了，成了一名飞行员，飞过许多荒凉的沙漠。\n\n在一次迫降中，我遇见了一个金发的小男孩，他请我为他画一只绵羊。\n\n我们聊起了玫瑰、狐狸，还有一颗很小很小的星球。',
  },
  月亮与六便士: {
    desc: '满地都是六便士，他却抬头看见了月亮。',
    toc: ['一 · 证券经纪人', '二 · 出逃', '三 · 塔希提'],
    content: '斯特里克兰德是个再普通不过的证券经纪人，忽然有一天，他抛下一切去了巴黎。\n\n人们都说他疯了，只有他自己知道，他必须画画。\n\n在遥远的塔希提，他画出了惊世的作品，也燃尽了自己的生命。',
  },
  三体: {
    desc: '宇宙是一座黑暗森林，每个文明都是带枪的猎人。',
    toc: ['一 · 科学边界', '二 · 红岸基地', '三 · 黑暗森林'],
    content: '物理学家接连自杀，留下了一句令人不安的遗言：物理学不存在了。\n\n一场跨越星际的博弈，从一封信开始，缓缓拉开帷幕。\n\n在黑暗森林里，任何文明都必须保持沉默，否则就会被猎杀。',
  },
  百年孤独: {
    desc: '布恩迪亚家族七代人的传奇，与一个村庄的兴衰。',
    toc: ['一 · 马孔多', '二 · 冰块', '三 · 羊皮卷'],
    content: '多年以后，面对行刑队，奥雷里亚诺·布恩迪亚上校将会回想起父亲带他去见识冰块的那个下午。\n\n那时的马孔多，还是一座只有二十户人家的小村庄。',
  },
  活着: {
    desc: '一个人的一生，见证时代的风浪与微光。',
    toc: ['一 · 少年', '二 · 动荡', '三 · 归宿'],
    content: '福贵年轻时输光了家产，气死了父亲，从此跌进了命运的漩涡。\n\n他送走了一个又一个亲人，最后只剩下一头老牛陪着他。\n\n他坐在田埂上，平静地说：活着，就是为了活着本身。',
  },
  海边的卡夫卡: {
    desc: '一个少年出走的故事，现实与梦境交错。',
    toc: ['一 · 离家', '二 · 图书馆', '三 · 入口的石'],
    content: '十五岁的田村卡夫卡在生日那天收拾好行囊，离家出走。\n\n他要去四国的一座图书馆，寻找一个连他自己也说不清的答案。\n\n路上，他遇到了一位会说话的猫，和一座会让人迷失的森林。',
  },
  红楼梦: {
    desc: '大观园里的悲欢离合，一部家族的挽歌。',
    toc: ['一 · 石头记', '二 · 大观园', '三 · 曲终'],
    content: '女娲补天剩下的一块石头，被带入凡尘，历尽了离合悲欢。\n\n大观园里，宝玉与黛玉的诗句还留在纸上，人却已各奔东西。',
  },
  局外人: {
    desc: '母亲的葬礼上，他没有流泪。',
    toc: ['一 · 母亲', '二 · 阳光', '三 · 审判'],
    content: '今天，妈妈死了。也许是昨天，我不清楚。\n\n默尔索只是在葬礼上没有哭，却在后来被当作一件罪行。\n\n在灼热的阳光下，他扣动了扳机。',
  },
  动物农场: {
    desc: '一群动物推翻农场主后，建立了一个新的庄园。',
    toc: ['一 · 造反', '二 · 七诫', '三 · 猪的庄园'],
    content: '动物们赶走了农场主，把庄园改名为「动物农场」。\n\n他们立下了七条诫命：所有动物一律平等。\n\n多年以后，猪学会了用两条腿走路，和人类坐在一起喝酒。',
  },
};

/** 内置占位书（后端为空时播种） */
function seedBooks(): Book[] {
  return [
    '小王子',
    '月亮与六便士',
    '三体',
    '百年孤独',
    '活着',
    '海边的卡夫卡',
    '红楼梦',
    '局外人',
    '动物农场',
  ].map((title, i) => {
    const p = PALETTE[i % PALETTE.length];
    const c = CONTENT[title];
    return {
      id: newId(),
      title,
      author: ['圣埃克苏佩里', '毛姆', '刘慈欣', '马尔克斯', '余华', '村上春树', '曹雪芹', '加缪', '奥威尔'][i],
      color: p.color,
      band: p.band,
      height: heightOf(title),
      desc: c.desc,
      content: c.content,
      toc: c.toc,
      progress: 0,
      lastReadAt: undefined,
    };
  });
}

/** 迁移旧 localStorage 数据（blueberry.bookhouse.books.v2） */
function readLocalBooks(): Book[] | null {
  try {
    const raw = localStorage.getItem('blueberry.bookhouse.books.v2');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { books?: unknown }; books?: unknown };
    const list = parsed?.state?.books ?? parsed?.books;
    if (!Array.isArray(list)) return null;
    return list
      .map((b) => b as Partial<Book>)
      .filter((b) => b?.title)
      .map((b) => ({
        id: b.id ?? newId(),
        title: String(b.title),
        author: b.author ?? '佚名',
        color: b.color ?? PALETTE[0].color,
        band: b.band ?? PALETTE[0].band,
        height: b.height ?? heightOf(String(b.title)),
        cover: b.cover ?? undefined,
        desc: b.desc ?? '',
        content: b.content ?? '',
        toc: b.toc ?? [],
        progress: b.progress ?? 0,
        lastReadAt: b.lastReadAt,
      }));
  } catch {
    return null;
  }
}

function fromDTO(d: ReadingBook): Book {
  return {
    id: d.id,
    title: d.title,
    author: d.author ?? '佚名',
    color: d.color ?? PALETTE[0].color,
    band: d.band ?? PALETTE[0].band,
    height: d.height ?? heightOf(d.title),
    cover: d.coverUrl || undefined,
    desc: d.desc ?? '',
    content: d.content ?? '',
    toc: d.toc ?? [],
    progress: 0,
    lastReadAt: undefined,
  };
}

interface BookState {
  books: Book[];
  loaded: boolean;
  load: () => Promise<void>;
  addBook: (input: {
    title: string;
    author: string;
    paletteIdx: number;
    cover?: string;
    desc?: string;
    content?: string;
    toc?: string[];
  }) => Promise<void>;
  updateBook: (id: string, patch: Partial<Omit<Book, 'id'>>) => Promise<void>;
  removeBook: (id: string) => Promise<void>;
  setProgress: (id: string, progress: number) => void;
}

/** 一起读共享 store：读后端 books 表，本地乐观更新 + 写穿；我的进度落 reading_progress */
export const useBookStore = create<BookState>((set, get) => ({
  books: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      let list = await listReadingBooks();
      if (list.length === 0) {
        // 后端为空：优先迁移旧 localStorage，其次播种内置书
        const local = readLocalBooks();
        const seed = local && local.length ? local : seedBooks();
        for (const b of seed) {
          const created = await createReadingBook({
            title: b.title,
            author: b.author,
            coverUrl: b.cover,
            content: b.content,
            desc: b.desc,
            toc: b.toc,
            color: b.color,
            band: b.band,
            height: b.height,
          });
          if (b.progress > 0) {
            void saveProgress({
              bookId: created.id,
              reader: 'me',
              currentChapter: 1,
              currentPosition: Math.round(b.progress * 100),
              percent: Math.round(b.progress * 100),
            });
          }
        }
        list = await listReadingBooks();
      }
      set({ books: list.map(fromDTO), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  addBook: async ({ title, author, paletteIdx, cover, desc, content, toc }) => {
    const p = PALETTE[((paletteIdx % PALETTE.length) + PALETTE.length) % PALETTE.length];
    const book: Book = {
      id: newId(),
      title: title.trim(),
      author: author.trim() || '佚名',
      color: p.color,
      band: p.band,
      height: heightOf(title),
      cover: cover ?? undefined,
      desc: desc ?? '',
      content: content ?? '',
      toc: toc ?? [],
      progress: 0,
    };
    set((s) => ({ books: [book, ...s.books] }));
    try {
      const r = await createReadingBook({
        title: book.title,
        author: book.author,
        coverUrl: book.cover,
        content: book.content,
        desc: book.desc,
        toc: book.toc,
        color: book.color,
        band: book.band,
        height: book.height,
      });
      set((s) => ({ books: s.books.map((b) => (b.id === book.id ? { ...b, id: r.id } : b)) }));
    } catch {
      /* 保持本地乐观数据 */
    }
  },

  updateBook: async (id, patch) => {
    set((s) => ({ books: s.books.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
    try {
      await updateReadingBook(id, {
        title: patch.title,
        author: patch.author,
        coverUrl: patch.cover,
        content: patch.content,
        desc: patch.desc,
        toc: patch.toc,
        color: patch.color,
        band: patch.band,
        height: patch.height,
      });
    } catch {
      /* ignore */
    }
  },

  removeBook: async (id) => {
    set((s) => ({ books: s.books.filter((b) => b.id !== id) }));
    try {
      await deleteReadingBook(id);
    } catch {
      /* ignore */
    }
  },

  setProgress: (id, progress) =>
    set((s) => ({
      books: s.books.map((b) => (b.id === id ? { ...b, progress, lastReadAt: Date.now() } : b)),
    })),
}));
