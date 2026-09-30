import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, Star, X, Eye, ChefHat, Sparkles, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDietStore, matchDislikes } from './dietStore';
import { AiImportDialog } from './AiImportDialog';

interface Ingredient {
  name: string;
  amount: string;
}

interface Recipe {
  id: string;
  name: string;
  image: string;
  category: string;
  ingredients: Ingredient[];
  steps: string;
  note: string;
  rating: number;
  viewCount: number;
  madeCount: number;
  createdAt: number;
}

const LS_RECIPES = 'blueberry.cookbook.recipes';

const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const CATEGORIES = ['家常菜', '汤羹', '主食', '甜品', '饮品'];
const CATEGORY_EMOJI: Record<string, string> = {
  家常菜: '🍲',
  汤羹: '🥣',
  主食: '🍚',
  甜品: '🍰',
  饮品: '🧋',
};
const NOTE_COLORS = ['#fef3c7', '#fde68a', '#fbcfe8', '#c7d2fe', '#bbf7d0', '#fed7aa'];

function parseIngredients(s: string): Ingredient[] {
  return s
    .split(/\n+/)
    .map((line) => {
      const m = line.trim().match(/^(\S+)\s*(.*)$/);
      return m ? { name: m[1], amount: m[2].trim() } : { name: line.trim(), amount: '' };
    })
    .filter((x) => x.name);
}
function formatIngredients(ings: Ingredient[]): string {
  return ings.map((i) => `${i.name} ${i.amount}`.trim()).join('\n');
}

/** 兼容旧数据结构（食材为 string[]）并补全新字段 */
function migrate(r: any): Recipe {
  const ingredients = Array.isArray(r.ingredients)
    ? r.ingredients.map((ing: any) =>
        typeof ing === 'string' ? { name: ing, amount: '' } : { name: ing?.name ?? '', amount: ing?.amount ?? '' },
      )
    : [];
  return {
    id: r.id ?? newId(),
    name: r.name ?? '',
    image: r.image ?? '',
    category: r.category && CATEGORIES.includes(r.category) ? r.category : '家常菜',
    ingredients,
    steps: r.steps ?? '',
    note: r.note ?? '',
    rating: r.rating ?? 0,
    viewCount: r.viewCount ?? 0,
    madeCount: r.madeCount ?? 0,
    createdAt: r.createdAt ?? Date.now(),
  };
}

function seedRecipes(): Recipe[] {
  const mk = (name: string, category: string, ings: [string, string][], steps: string, note = ''): Recipe => ({
    id: newId(),
    name,
    image: '',
    category,
    ingredients: ings.map(([name, amount]) => ({ name, amount })),
    steps,
    note,
    rating: 0,
    viewCount: 0,
    madeCount: 0,
    createdAt: Date.now(),
  });
  return [
    mk('番茄牛腩', '家常菜', [['番茄', '2 个'], ['牛腩', '500g'], ['土豆', '1 个'], ['洋葱', '半个']], '牛腩焯水；番茄炒出沙；加土豆炖 1 小时至软烂。', '小火慢炖更入味'),
    mk('清炒时蔬', '家常菜', [['时蔬', '300g'], ['蒜', '2 瓣'], ['盐', '少许']], '热油爆香蒜末，下时蔬大火快炒，加盐出锅。'),
    mk('玉米排骨汤', '汤羹', [['玉米', '1 根'], ['排骨', '500g'], ['姜', '3 片'], ['盐', '适量']], '排骨焯水后与玉米、姜片同煮 1 小时，加盐调味。'),
    mk('番茄蛋花汤', '汤羹', [['番茄', '2 个'], ['鸡蛋', '2 个'], ['葱花', '少许']], '番茄炒软加水烧开，淋入蛋液成蛋花，撒葱花。'),
    mk('扬州炒饭', '主食', [['米饭', '2 碗'], ['鸡蛋', '2 个'], ['火腿', '50g'], ['青豆', '30g']], '炒散鸡蛋，下米饭、火腿、青豆翻炒均匀。'),
    mk('芒果西米露', '甜品', [['芒果', '2 个'], ['西米', '50g'], ['椰浆', '200ml'], ['糖', '适量']], '西米煮至透明，加椰浆与芒果丁拌匀，冷藏更好吃。'),
  ];
}

function loadRecipes(): Recipe[] {
  try {
    const raw = localStorage.getItem(LS_RECIPES);
    if (raw) {
      const arr = JSON.parse(raw) as any[];
      if (Array.isArray(arr)) return arr.map(migrate);
    }
  } catch {
    /* ignore */
  }
  return seedRecipes();
}

interface FormState {
  name: string;
  image: string;
  category: string;
  ingredients: string;
  steps: string;
  note: string;
  rating: number;
}
const EMPTY_FORM: FormState = { name: '', image: '', category: '家常菜', ingredients: '', steps: '', note: '', rating: 0 };

const inputCls =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';

/** 食谱：菜单式（按菜品分类，每类可滑动）+ 便签卡片，共享忌口并标注，AI 导入归纳 */
export function CookbookPage() {
  const navigate = useNavigate();

  // 进入本页回到顶部（主内容滚动容器是 <main>）
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 });
  }, []);

  const [recipes, setRecipes] = useState<Recipe[]>(loadRecipes);
  const dislikes = useDietStore((s) => s.dislikes);
  const addDislike = useDietStore((s) => s.addDislike);
  const removeDislike = useDietStore((s) => s.removeDislike);
  const [dislikeDraft, setDislikeDraft] = useState('');
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [openId, setOpenId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  const persist = (next: Recipe[]) => {
    setRecipes(next);
    localStorage.setItem(LS_RECIPES, JSON.stringify(next));
  };

  // 按分类分组（保留出现顺序）
  const cats: string[] = [];
  recipes.forEach((r) => {
    if (!cats.includes(r.category)) cats.push(r.category);
  });

  const dislikedOf = (r: Recipe) => matchDislikes(r.ingredients.map((i) => i.name), dislikes);

  const open = (r: Recipe) => {
    setOpenId(r.id);
    persist(recipes.map((x) => (x.id === r.id ? { ...x, viewCount: x.viewCount + 1 } : x)));
  };
  const markMade = (r: Recipe) => persist(recipes.map((x) => (x.id === r.id ? { ...x, madeCount: x.madeCount + 1 } : x)));

  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditing('new');
  };
  const openEdit = (r: Recipe) => {
    setForm({
      name: r.name,
      image: r.image,
      category: r.category,
      ingredients: formatIngredients(r.ingredients),
      steps: r.steps,
      note: r.note,
      rating: r.rating,
    });
    setEditing(r);
  };
  const closeEditor = () => setEditing(null);

  const save = () => {
    const name = form.name.trim();
    if (!name) return;
    const payload: Recipe = {
      id: editing !== 'new' && editing ? editing.id : newId(),
      name,
      image: form.image.trim(),
      category: form.category.trim() || '家常菜',
      ingredients: parseIngredients(form.ingredients),
      steps: form.steps.trim(),
      note: form.note.trim(),
      rating: form.rating,
      viewCount: editing !== 'new' && editing ? editing.viewCount : 0,
      madeCount: editing !== 'new' && editing ? editing.madeCount : 0,
      createdAt: editing !== 'new' && editing ? editing.createdAt : Date.now(),
    };
    persist(editing !== 'new' && editing ? recipes.map((r) => (r.id === payload.id ? payload : r)) : [payload, ...recipes]);
    closeEditor();
  };

  const remove = (id: string) => {
    persist(recipes.filter((r) => r.id !== id));
    setOpenId(null);
  };

  const addDislikeLocal = () => {
    const t = dislikeDraft.trim();
    if (!t) return;
    addDislike(t);
    setDislikeDraft('');
  };

  // AI 导入：把模型返回的 JSON 归一化成菜谱
  const onAiResult = (data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const name = String(d.name ?? '').trim();
    if (!name) {
      setAiOpen(false);
      return;
    }
    const ingredients: Ingredient[] = Array.isArray(d.ingredients)
      ? d.ingredients
          .map((ing: unknown) =>
            typeof ing === 'string'
              ? { name: ing.trim(), amount: '' }
              : { name: String((ing as any)?.name ?? '').trim(), amount: String((ing as any)?.amount ?? '').trim() },
          )
          .filter((x) => x.name)
      : [];
    const payload: Recipe = {
      id: newId(),
      name,
      image: String(d.image ?? '').trim(),
      category: typeof d.category === 'string' && CATEGORIES.includes(d.category) ? d.category : '家常菜',
      ingredients,
      steps: String(d.steps ?? '').trim(),
      note: String(d.note ?? '').trim(),
      rating: Number(d.rating) || 0,
      viewCount: 0,
      madeCount: 0,
      createdAt: Date.now(),
    };
    persist([payload, ...recipes]);
    setAiOpen(false);
  };

  const aiSystem = `你是一个菜谱整理助手。根据用户提供的信息（菜名/链接/描述），整理出一道菜谱，只输出一个 JSON 对象，不要任何其它文字或 markdown。字段：name(菜名)、category(从 家常菜/汤羹/主食/甜品/饮品 选一个)、ingredients(数组，每项 {"name":"食材","amount":"用量"}，如 {"name":"牛腩","amount":"500g"})、steps(具体做法步骤，可换行)、note(备注/小贴士)。忌口食材：${dislikes.join('、')}。请尽量避免这些食材；若菜品本身含忌口食材，在 note 末尾标注「含忌口：xxx」。`;

  const openRecipe = openId ? recipes.find((r) => r.id === openId) : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:max-w-4xl lg:max-w-6xl">
      {/* 顶栏 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/sky')}
          className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> 返回
        </button>
        <h1 className="text-lg font-bold">食谱</h1>
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
          <Plus className="h-4 w-4" /> 添加
        </button>
      </div>

      {/* 忌口（共享） */}
      <div className="glass mt-4 flex flex-wrap items-center gap-2 p-3">
        <span className="text-xs font-medium text-muted-foreground">忌口</span>
        {dislikes.map((d) => (
          <span key={d} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs text-destructive">
            {d}
            <button type="button" onClick={() => removeDislike(d)} aria-label={`移除 ${d}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={dislikeDraft}
          onChange={(e) => setDislikeDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addDislikeLocal()}
          placeholder="加一种…"
          className="h-7 w-20 rounded-full bg-muted/60 px-3 text-xs outline-none focus:bg-muted"
        />
        <button type="button" onClick={addDislikeLocal} className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/60 text-xs text-foreground/70 hover:bg-muted">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 菜单：按菜品分类，每类横向滑动（含忌口会标注而非隐藏） */}
      {recipes.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground/60">还没有菜谱，点「添加」或「AI 导入」记下第一道吧。</div>
      ) : (
        <div className="mt-5 space-y-6">
          {cats.map((cat, ci) => {
            const list = recipes.filter((r) => r.category === cat);
            return (
              <section key={cat}>
                <div className="mb-2.5 flex items-center gap-2 px-1">
                  <span className="text-lg leading-none">{CATEGORY_EMOJI[cat] ?? '🍽️'}</span>
                  <h2 className="text-sm font-semibold">{cat}</h2>
                  <span className="text-xs text-muted-foreground">{list.length} 道</span>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {list.map((r, i) => {
                    const color = NOTE_COLORS[(ci * 7 + i) % NOTE_COLORS.length];
                    const tilt = ((i % 3) - 1) * 1.6;
                    const hits = dislikedOf(r);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => open(r)}
                        className="relative h-32 w-28 shrink-0 rounded-md px-3 py-3 text-left shadow-md transition hover:-translate-y-1 hover:rotate-0"
                        style={{ background: color, color: '#3a2a18', transform: `rotate(${tilt}deg)` }}
                      >
                        <span className="text-lg leading-none">{CATEGORY_EMOJI[r.category] ?? '🍽️'}</span>
                        <span className="mt-1.5 block truncate text-sm font-semibold">{r.name}</span>
                        {r.rating > 0 && (
                          <span className="mt-1 flex items-center gap-0.5 text-xs text-amber-600">
                            <Star className="h-3 w-3 fill-current" /> {r.rating}
                          </span>
                        )}
                        {hits.length > 0 && (
                          <span className="absolute left-2 top-2 flex items-center gap-0.5 rounded-full bg-rose-500/90 px-1.5 py-0.5 text-[9px] font-medium text-white">
                            <AlertTriangle className="h-2.5 w-2.5" /> 含忌口
                          </span>
                        )}
                        <span className="absolute bottom-2 right-2.5 text-[10px] opacity-60">查看 {r.viewCount}</span>
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
      {openRecipe && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpenId(null)}>
          <div
            className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-[#fef3c7] p-5 text-[#3a2a18] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs text-amber-700/70">{CATEGORY_EMOJI[openRecipe.category] ?? '🍽️'} {openRecipe.category}</span>
                <h3 className="mt-0.5 text-lg font-bold">{openRecipe.name}</h3>
              </div>
              <button type="button" onClick={() => setOpenId(null)} className="text-amber-800/60 hover:text-amber-900"><X className="h-4 w-4" /></button>
            </div>

            {dislikedOf(openRecipe).length > 0 && (
              <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-rose-500/15 px-3 py-2 text-xs font-medium text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5" /> 含忌口：{dislikedOf(openRecipe).join('、')}
              </div>
            )}

            {openRecipe.image && <img src={openRecipe.image} alt={openRecipe.name} className="mt-3 h-36 w-full rounded-lg object-cover" />}

            {openRecipe.ingredients.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-semibold text-amber-800/80">食材 · 用量</div>
                <ul className="mt-2 space-y-1.5">
                  {openRecipe.ingredients.map((ing) => (
                    <li key={ing.name} className="flex items-baseline justify-between gap-3 border-b border-amber-900/10 pb-1 text-sm">
                      <span className="font-medium">{ing.name}</span>
                      <span className="text-amber-800/70">{ing.amount || '适量'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {openRecipe.steps && (
              <div className="mt-4">
                <div className="text-xs font-semibold text-amber-800/80">做法</div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6">{openRecipe.steps}</p>
              </div>
            )}

            {openRecipe.note && <p className="mt-4 rounded-lg bg-amber-900/5 px-3 py-2 text-sm leading-6">{openRecipe.note}</p>}

            {/* 查看 / 做过次数 */}
            <div className="mt-4 flex items-center justify-between rounded-xl bg-amber-900/10 px-3 py-2.5 text-xs">
              <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> 查看 {openRecipe.viewCount} 次</span>
              <span className="flex items-center gap-1"><ChefHat className="h-3.5 w-3.5" /> 做过 {openRecipe.madeCount} 次</span>
            </div>

            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => markMade(openRecipe)} className="h-10 flex-1 rounded-xl bg-amber-600 text-sm font-medium text-white transition hover:bg-amber-700">
                我做了一次
              </button>
              <button type="button" onClick={() => openEdit(openRecipe)} aria-label="编辑" className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-900/10 text-amber-900 transition hover:bg-amber-900/20">
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => remove(openRecipe.id)} aria-label="删除" className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-900/10 text-amber-900 transition hover:bg-rose-500/20 hover:text-rose-700">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 添加/编辑弹窗 */}
      {editing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-2 sm:p-4" onClick={closeEditor}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-background p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">{editing === 'new' ? '添加菜谱' : '编辑菜谱'}</h3>
              <button type="button" onClick={closeEditor} className="text-muted-foreground"><X className="h-4 w-4" /></button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">名称</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="如 番茄牛腩" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">分类</label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, category: c }))}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs transition',
                        form.category === c ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-foreground/70 hover:bg-muted',
                      )}
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
                <label className="mb-1 block text-xs text-muted-foreground">食材 · 用量（每行：食材 用量）</label>
                <textarea
                  value={form.ingredients}
                  onChange={(e) => setForm((f) => ({ ...f, ingredients: e.target.value }))}
                  rows={3}
                  placeholder={'番茄 2个\n牛腩 500g'}
                  className={cn(inputCls, 'resize-none')}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">做法步骤</label>
                <textarea value={form.steps} onChange={(e) => setForm((f) => ({ ...f, steps: e.target.value }))} rows={4} placeholder="1. 切块焯水；2. …" className={cn(inputCls, 'resize-y')} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">备注</label>
                <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="火候、口感…（可选）" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">评分</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setForm((f) => ({ ...f, rating: n }))} aria-label={`${n} 分`}>
                      <Star className={cn('h-6 w-6 transition', form.rating >= n ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button type="button" onClick={closeEditor} className="h-10 flex-1 rounded-xl bg-muted/60 text-sm font-medium text-foreground/80 transition hover:bg-muted/80">取消</button>
              <button type="button" onClick={save} className="h-10 flex-1 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* AI 导入 */}
      {aiOpen && (
        <AiImportDialog
          title="AI 导入菜谱"
          placeholder="粘贴菜名、做法描述，或一个菜谱链接…"
          systemPrompt={aiSystem}
          onResult={onAiResult}
          onClose={() => setAiOpen(false)}
        />
      )}
    </div>
  );
}
