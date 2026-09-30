import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, X, Eye, Cake, Sparkles, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDietStore, matchDislikes } from './dietStore';
import { AiImportDialog } from './AiImportDialog';

interface Dessert {
  id: string;
  name: string;
  image: string;
  category: string;
  ingredients: string[];
  steps: string;
  note: string;
  viewCount: number;
  madeCount: number;
  createdAt: number;
}

const LS_DESSERTS = 'blueberry.dessert.desserts';
const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const CATEGORIES = ['蛋糕', '饮品', '冰淇淋', '烘焙小点'];
const CATEGORY_EMOJI: Record<string, string> = {
  蛋糕: '🍰',
  饮品: '🧋',
  冰淇淋: '🍦',
  烘焙小点: '🥐',
};
const NOTE_COLORS = ['#fce7f3', '#e0e7ff', '#d1fae5', '#ffedd5', '#fef9c3', '#f5d0fe'];

function migrate(d: any): Dessert {
  return {
    id: d.id ?? newId(),
    name: d.name ?? '',
    image: d.image ?? '',
    category: d.category && CATEGORIES.includes(d.category) ? d.category : '蛋糕',
    ingredients: Array.isArray(d.ingredients) ? d.ingredients.map((x: unknown) => String(x ?? '').trim()).filter(Boolean) : [],
    steps: d.steps ?? '',
    note: d.note ?? '',
    viewCount: d.viewCount ?? 0,
    madeCount: d.madeCount ?? 0,
    createdAt: d.createdAt ?? Date.now(),
  };
}

function seedDesserts(): Dessert[] {
  const mk = (name: string, category: string, ings: string[], steps: string, note: string): Dessert => ({
    id: newId(),
    name,
    image: '',
    category,
    ingredients: ings,
    steps,
    note,
    viewCount: 0,
    madeCount: 0,
    createdAt: Date.now(),
  });
  return [
    mk('提拉米苏', '蛋糕', ['手指饼干', '马斯卡彭', '咖啡', '可可粉'], '手指饼干浸咖啡，铺马斯卡彭奶酪，冷藏后撒可可粉。', '冷藏过夜口感更好'),
    mk('草莓奶油蛋糕', '蛋糕', ['低筋面粉', '鸡蛋', '淡奶油', '草莓'], '烤戚风蛋糕底，抹奶油夹整颗草莓，装饰即可。', ''),
    mk('芒果奶昔', '饮品', ['芒果', '牛奶', '酸奶'], '熟芒果与牛奶、酸奶一起搅打至顺滑。', ''),
    mk('冰美式', '饮品', ['咖啡豆', '冰块'], '萃取浓缩，加冰块与凉水即可。', ''),
    mk('香草冰淇淋', '冰淇淋', ['淡奶油', '蛋黄', '香草荚', '糖'], '蛋黄加糖打发，混合奶油与香草，冷冻并搅拌数次。', ''),
    mk('蔓越莓司康', '烘焙小点', ['低筋面粉', '黄油', '蔓越莓', '泡打粉'], '黄油搓入面粉，加蔓越莓，整形成团烤制。', '外酥内软，配茶刚好'),
  ];
}

function loadDesserts(): Dessert[] {
  try {
    const raw = localStorage.getItem(LS_DESSERTS);
    if (raw) {
      const arr = JSON.parse(raw) as any[];
      if (Array.isArray(arr)) return arr.map(migrate);
    }
  } catch {
    /* ignore */
  }
  return seedDesserts();
}

const inputCls =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';

/** 甜品小屋：菜单式（按品类，每类可滑动）+ 便签卡片，共享忌口并标注，AI 导入归纳 */
export function DessertHousePage() {
  const navigate = useNavigate();

  // 进入本页回到顶部（主内容滚动容器是 <main>）
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 });
  }, []);

  const [desserts, setDesserts] = useState<Dessert[]>(loadDesserts);
  const dislikes = useDietStore((s) => s.dislikes);
  const [editing, setEditing] = useState<Dessert | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', image: '', category: '蛋糕', ingredients: '', steps: '', note: '' });
  const [openId, setOpenId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  const persist = (next: Dessert[]) => {
    setDesserts(next);
    localStorage.setItem(LS_DESSERTS, JSON.stringify(next));
  };

  const cats: string[] = [];
  desserts.forEach((d) => {
    if (!cats.includes(d.category)) cats.push(d.category);
  });

  const dislikedOf = (d: Dessert) => matchDislikes(d.ingredients, dislikes);

  const open = (d: Dessert) => {
    setOpenId(d.id);
    persist(desserts.map((x) => (x.id === d.id ? { ...x, viewCount: x.viewCount + 1 } : x)));
  };
  const markMade = (d: Dessert) => persist(desserts.map((x) => (x.id === d.id ? { ...x, madeCount: x.madeCount + 1 } : x)));

  const openNew = () => {
    setForm({ name: '', image: '', category: '蛋糕', ingredients: '', steps: '', note: '' });
    setEditing('new');
  };
  const openEdit = (d: Dessert) => {
    setForm({ name: d.name, image: d.image, category: d.category, ingredients: d.ingredients.join('\n'), steps: d.steps, note: d.note });
    setEditing(d);
  };
  const close = () => setEditing(null);

  const save = () => {
    const name = form.name.trim();
    if (!name) return;
    const ingredients = form.ingredients.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    const payload: Dessert = {
      id: editing !== 'new' && editing ? editing.id : newId(),
      name,
      image: form.image.trim(),
      category: form.category.trim() || '蛋糕',
      ingredients,
      steps: form.steps.trim(),
      note: form.note.trim(),
      viewCount: editing !== 'new' && editing ? editing.viewCount : 0,
      madeCount: editing !== 'new' && editing ? editing.madeCount : 0,
      createdAt: editing !== 'new' && editing ? editing.createdAt : Date.now(),
    };
    persist(editing !== 'new' && editing ? desserts.map((d) => (d.id === payload.id ? payload : d)) : [payload, ...desserts]);
    close();
  };

  const remove = (id: string) => {
    persist(desserts.filter((d) => d.id !== id));
    setOpenId(null);
  };

  // AI 导入
  const onAiResult = (data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const name = String(d.name ?? '').trim();
    if (!name) {
      setAiOpen(false);
      return;
    }
    const payload: Dessert = {
      id: newId(),
      name,
      image: String(d.image ?? '').trim(),
      category: typeof d.category === 'string' && CATEGORIES.includes(d.category) ? d.category : '蛋糕',
      ingredients: Array.isArray(d.ingredients) ? d.ingredients.map((x: unknown) => String(x ?? '').trim()).filter(Boolean) : [],
      steps: String(d.steps ?? '').trim(),
      note: String(d.note ?? '').trim(),
      viewCount: 0,
      madeCount: 0,
      createdAt: Date.now(),
    };
    persist([payload, ...desserts]);
    setAiOpen(false);
  };

  const aiSystem = `你是一个甜品整理助手。根据用户提供的信息（甜品名/链接/描述），整理出一款甜品，只输出一个 JSON 对象，不要任何其它文字或 markdown。字段：name(名称)、category(从 蛋糕/饮品/冰淇淋/烘焙小点 选一个)、ingredients(食材名数组，如 ["低筋面粉","鸡蛋"])、steps(具体做法步骤，可换行)、note(备注)。忌口食材：${dislikes.join('、')}。请尽量避免这些食材；若甜品本身含忌口食材，在 note 末尾标注「含忌口：xxx」。`;

  const openDessert = openId ? desserts.find((d) => d.id === openId) : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:max-w-4xl lg:max-w-6xl">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/sky')}
          className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> 返回
        </button>
        <h1 className="text-lg font-bold">甜品小屋</h1>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setAiOpen(true)}
          className="flex items-center gap-1 rounded-xl bg-amber-500/15 px-3 py-1.5 text-sm text-amber-300 transition hover:bg-amber-500/25"
        >
          <Sparkles className="h-4 w-4" /> AI 导入
        </button>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-sm text-primary-foreground transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> 收藏
        </button>
      </div>

      {/* 忌口（共享，只读提示） */}
      {dislikes.length > 0 && (
        <div className="glass mt-4 flex flex-wrap items-center gap-2 p-3">
          <span className="text-xs font-medium text-muted-foreground">忌口</span>
          {dislikes.map((d) => (
            <span key={d} className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs text-destructive">{d}</span>
          ))}
          <span className="text-[11px] text-muted-foreground">含这些食材的甜品会标注出来</span>
        </div>
      )}

      {desserts.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground/60">还没有收藏的甜品，点「收藏」或「AI 导入」记下第一个吧 🍰</div>
      ) : (
        <div className="mt-5 space-y-6">
          {cats.map((cat, ci) => {
            const list = desserts.filter((d) => d.category === cat);
            return (
              <section key={cat}>
                <div className="mb-2.5 flex items-center gap-2 px-1">
                  <span className="text-lg leading-none">{CATEGORY_EMOJI[cat] ?? '🍰'}</span>
                  <h2 className="text-sm font-semibold">{cat}</h2>
                  <span className="text-xs text-muted-foreground">{list.length} 个</span>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {list.map((d, i) => {
                    const color = NOTE_COLORS[(ci * 7 + i) % NOTE_COLORS.length];
                    const tilt = ((i % 3) - 1) * 1.6;
                    const hits = dislikedOf(d);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => open(d)}
                        className="relative h-32 w-28 shrink-0 rounded-md px-3 py-3 text-left shadow-md transition hover:-translate-y-1 hover:rotate-0"
                        style={{ background: color, color: '#3a2a18', transform: `rotate(${tilt}deg)` }}
                      >
                        <span className="text-lg leading-none">{CATEGORY_EMOJI[d.category] ?? '🍰'}</span>
                        <span className="mt-1.5 block truncate text-sm font-semibold">{d.name}</span>
                        {d.note && <span className="mt-1 line-clamp-2 block text-[11px] leading-4 opacity-70">{d.note}</span>}
                        {hits.length > 0 && (
                          <span className="absolute left-2 top-2 flex items-center gap-0.5 rounded-full bg-rose-500/90 px-1.5 py-0.5 text-[9px] font-medium text-white">
                            <AlertTriangle className="h-2.5 w-2.5" /> 含忌口
                          </span>
                        )}
                        <span className="absolute bottom-2 right-2.5 text-[10px] opacity-60">查看 {d.viewCount}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* 便签详情弹窗 */}
      {openDessert && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpenId(null)}>
          <div className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-[#fce7f3] p-5 text-[#3a2a18] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs text-rose-700/70">{CATEGORY_EMOJI[openDessert.category] ?? '🍰'} {openDessert.category}</span>
                <h3 className="mt-0.5 text-lg font-bold">{openDessert.name}</h3>
              </div>
              <button type="button" onClick={() => setOpenId(null)} className="text-rose-800/60 hover:text-rose-900"><X className="h-4 w-4" /></button>
            </div>

            {dislikedOf(openDessert).length > 0 && (
              <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-rose-500/15 px-3 py-2 text-xs font-medium text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5" /> 含忌口：{dislikedOf(openDessert).join('、')}
              </div>
            )}

            {openDessert.image ? (
              <img src={openDessert.image} alt={openDessert.name} className="mt-3 h-36 w-full rounded-lg object-cover" />
            ) : (
              <div className="mt-3 flex h-36 w-full items-center justify-center rounded-lg bg-gradient-to-br from-rose-100 to-amber-100 text-5xl">
                {CATEGORY_EMOJI[openDessert.category] ?? '🍰'}
              </div>
            )}

            {openDessert.ingredients.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-semibold text-rose-800/70">食材</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {openDessert.ingredients.map((ing) => (
                    <span key={ing} className="rounded-full bg-rose-900/10 px-2.5 py-1 text-xs">{ing}</span>
                  ))}
                </div>
              </div>
            )}

            {openDessert.steps && (
              <div className="mt-4">
                <div className="text-xs font-semibold text-rose-800/70">做法</div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6">{openDessert.steps}</p>
              </div>
            )}

            {openDessert.note && <p className="mt-4 rounded-lg bg-rose-900/5 px-3 py-2 text-sm leading-6">{openDessert.note}</p>}

            <div className="mt-4 flex items-center justify-between rounded-xl bg-rose-900/10 px-3 py-2.5 text-xs">
              <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> 查看 {openDessert.viewCount} 次</span>
              <span className="flex items-center gap-1"><Cake className="h-3.5 w-3.5" /> 做了 {openDessert.madeCount} 次</span>
            </div>

            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => markMade(openDessert)} className="h-10 flex-1 rounded-xl bg-rose-600 text-sm font-medium text-white transition hover:bg-rose-700">
                我做了一次
              </button>
              <button type="button" onClick={() => openEdit(openDessert)} aria-label="编辑" className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-900/10 text-rose-900 transition hover:bg-rose-900/20">
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => remove(openDessert.id)} aria-label="删除" className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-900/10 text-rose-900 transition hover:bg-rose-500/20 hover:text-rose-700">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 添加/编辑弹窗 */}
      {editing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-2 sm:p-4" onClick={close}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-background p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">{editing === 'new' ? '收藏甜品' : '编辑甜品'}</h3>
              <button type="button" onClick={close} className="text-muted-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">名称</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="如 提拉米苏" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">品类</label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, category: c }))}
                      className={cn('rounded-full px-3 py-1 text-xs transition', form.category === c ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-foreground/70 hover:bg-muted')}
                    >
                      {CATEGORY_EMOJI[c]} {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">图片（可选，图片链接）</label>
                <input value={form.image} onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))} placeholder="https://…" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">食材（每行一种）</label>
                <textarea value={form.ingredients} onChange={(e) => setForm((f) => ({ ...f, ingredients: e.target.value }))} rows={3} placeholder={'低筋面粉\n鸡蛋\n草莓'} className={cn(inputCls, 'resize-none')} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">做法</label>
                <textarea value={form.steps} onChange={(e) => setForm((f) => ({ ...f, steps: e.target.value }))} rows={4} placeholder="1. 打发；2. 烘烤…" className={cn(inputCls, 'resize-y')} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">备注</label>
                <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="在哪吃的、什么味道…（可选）" className={inputCls} />
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={close} className="h-10 flex-1 rounded-xl bg-muted/60 text-sm font-medium text-foreground/80 transition hover:bg-muted/80">取消</button>
              <button type="button" onClick={save} className="h-10 flex-1 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* AI 导入 */}
      {aiOpen && (
        <AiImportDialog
          title="AI 导入甜品"
          placeholder="粘贴甜品名、做法描述，或一个链接…"
          systemPrompt={aiSystem}
          onResult={onAiResult}
          onClose={() => setAiOpen(false)}
        />
      )}
    </div>
  );
}
