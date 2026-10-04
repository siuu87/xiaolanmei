import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, X, Sparkles, Dices, Heart, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDishStore } from './dishStore';
import { MangoKick } from './MangoKick';
import { AiImportDialog } from './AiImportDialog';
import { DISH_TABS, checkMango, tagClass, tagEmoji } from './foodData';
import type { Dish, DishType, DishIngredient, NewDishInput } from '@/lib/api/dishes';
import { randomDish } from '@/lib/api/dishes';

const inputCls =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';

const TAG_OPTIONS = ['多囊友好', '姨妈期推荐', '治愈指数'];

function containsMangoText(d: Dish): boolean {
  return checkMango([d.name, d.description ?? '', ...d.ingredients.map((i) => i.name)].join(' '));
}

function parseIngredients(s: string): DishIngredient[] {
  return s
    .split(/\n+/)
    .map((line) => {
      const parts = line.trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return null;
      return { name: parts[0], amount: parts[1] ?? '', unit: parts[2] ?? '' } as DishIngredient;
    })
    .filter((x): x is DishIngredient => !!x && !!x.name);
}
function formatIngredients(ings: DishIngredient[]): string {
  return ings.map((i) => [i.name, i.amount, i.unit].filter(Boolean).join(' ')).join('\n');
}

/** 拍立得风菜谱卡片 */
function DishCard({ dish, onOpen }: { dish: Dish; onOpen: () => void }) {
  return (
    <div
      onClick={onOpen}
      className="group cursor-pointer overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative">
        {dish.coverUrl ? (
          <img src={dish.coverUrl} alt={dish.name} className="aspect-[4/3] w-full object-cover" />
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center bg-gradient-to-br from-orange-100 via-amber-50 to-rose-100 text-6xl dark:from-zinc-800 dark:via-zinc-900 dark:to-rose-950">
            {dish.type === 'dessert' ? '🍰' : '🍚'}
          </div>
        )}
        {/* 难度（勺子） */}
        <div className="absolute left-2 top-2 rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white backdrop-blur">
          {'🥄'.repeat(dish.difficulty)}
        </div>
        {/* 治愈指数（甜品） */}
        {dish.type === 'dessert' && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs shadow backdrop-blur dark:bg-zinc-900/90">
            {'🍬'.repeat(dish.healingIndex)}
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold leading-snug">{dish.name}</h3>
          <Heart className="h-5 w-5 shrink-0 text-pink-500" />
        </div>
        {dish.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{dish.description}</p>}
        {dish.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {dish.tags.map((tag) => (
              <span key={tag} className={cn('rounded-full border px-2 py-0.5 text-[10px]', tagClass(tag))}>
                {tagEmoji(tag)}
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface FormState {
  id: string | null;
  name: string;
  type: DishType;
  coverUrl: string;
  description: string;
  ingredients: string;
  steps: string;
  tags: string[];
  difficulty: number;
  healingIndex: number;
}

const EMPTY_FORM: FormState = { id: null, name: '', type: 'meal', coverUrl: '', description: '', ingredients: '', steps: '', tags: [], difficulty: 1, healingIndex: 3 };

/** 今天吃什么：正餐/甜品 Tab + 抽签盲盒 + 卡片列表（合并食谱 & 甜品） */
export function FoodPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const dishes = useDishStore((s) => s.dishes);
  const load = useDishStore((s) => s.load);
  const addDish = useDishStore((s) => s.addDish);
  const updateDish = useDishStore((s) => s.updateDish);
  const removeDish = useDishStore((s) => s.removeDish);

  const tab: DishType = params.get('tab') === 'dessert' ? 'dessert' : 'meal';

  const [keyword, setKeyword] = useState('');
  const [shaking, setShaking] = useState(false);
  const [result, setResult] = useState<Dish | null>(null);
  const [recommendation, setRecommendation] = useState('');
  const [resultOpen, setResultOpen] = useState(false);
  const [kickTick, setKickTick] = useState(0);

  const [editing, setEditing] = useState<FormState | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTab = (t: DishType) => setParams({ tab: t });

  const list = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return dishes.filter((d) => {
      if (d.type !== tab) return false;
      if (!kw) return true;
      return (
        d.name.toLowerCase().includes(kw) ||
        d.description?.toLowerCase().includes(kw) ||
        d.ingredients.some((i) => i.name.toLowerCase().includes(kw))
      );
    });
  }, [dishes, tab, keyword]);

  const draw = async () => {
    if (shaking) return;
    setShaking(true);
    setTimeout(async () => {
      setShaking(false);
      try {
        const res = await randomDish(tab);
        if (res.dish) {
          setResult(res.dish);
          setRecommendation(res.recommendation);
          setResultOpen(true);
          if (containsMangoText(res.dish)) setKickTick((t) => t + 1);
        }
      } catch {
        /* ignore */
      }
    }, 500);
  };

  const onSearchEnter = () => {
    if (checkMango(keyword)) setKickTick((t) => t + 1);
  };

  const openNew = () => setEditing({ ...EMPTY_FORM, type: tab });
  const openEdit = (d: Dish) =>
    setEditing({
      id: d.id,
      name: d.name,
      type: d.type,
      coverUrl: d.coverUrl ?? '',
      description: d.description ?? '',
      ingredients: formatIngredients(d.ingredients),
      steps: d.steps.join('\n'),
      tags: d.tags,
      difficulty: d.difficulty,
      healingIndex: d.healingIndex,
    });
  const closeEditor = () => setEditing(null);

  const save = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;
    const payload: NewDishInput = {
      name,
      type: editing.type,
      coverUrl: editing.coverUrl.trim() || undefined,
      description: editing.description.trim() || undefined,
      ingredients: parseIngredients(editing.ingredients),
      steps: editing.steps.split(/\n+/).map((s) => s.trim()).filter(Boolean),
      tags: editing.tags,
      difficulty: editing.difficulty,
      healingIndex: editing.healingIndex,
    };
    if (editing.id) {
      await updateDish(editing.id, payload);
    } else {
      await addDish(payload);
    }
    closeEditor();
  };

  const onAiResult = async (data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const name = String(d.name ?? '').trim();
    if (!name) {
      setAiOpen(false);
      return;
    }
    const type: DishType = d.type === 'dessert' ? 'dessert' : 'meal';
    const ingredients: DishIngredient[] = Array.isArray(d.ingredients)
      ? d.ingredients
          .map((ing: unknown) =>
            typeof ing === 'string'
              ? { name: ing.trim(), amount: '', unit: '' }
              : { name: String((ing as any)?.name ?? '').trim(), amount: String((ing as any)?.amount ?? '').trim(), unit: String((ing as any)?.unit ?? '').trim() },
          )
          .filter((x) => x.name)
      : [];
    const steps = Array.isArray(d.steps) ? d.steps.map((x: unknown) => String(x ?? '').trim()).filter(Boolean) : [];
    const tags = Array.isArray(d.tags) ? d.tags.map((x: unknown) => String(x ?? '').trim()).filter((t: string) => TAG_OPTIONS.includes(t)) : [];
    await addDish({
      name,
      type,
      coverUrl: String(d.coverUrl ?? '').trim() || undefined,
      description: String(d.description ?? '').trim() || undefined,
      ingredients,
      steps,
      tags,
      difficulty: Number(d.difficulty) || 1,
      healingIndex: Number(d.healingIndex) || 3,
    });
    setAiOpen(false);
  };

  const aiSystem = `你是一个「今天吃什么」整理助手。根据用户提供的信息（菜名/链接/描述），整理出一道菜品，只输出一个 JSON 对象，不要任何其它文字或 markdown。字段：name(名称)、type(从 meal/dessert 选一个，正餐=meal、甜品/饮品=dessert)、coverUrl(图片链接，可为空字符串)、description(一句话描述)、ingredients(数组，每项 {"name":"食材","amount":"用量","unit":"单位"}，如 {"name":"牛腩","amount":"500","unit":"g"})、steps(做法步骤字符串数组)、tags(标签数组，从 多囊友好/姨妈期推荐/治愈指数 选)、difficulty(难度 1-3 整数)、healingIndex(治愈指数 1-5 整数)。`;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      {/* 顶栏 */}
      <div className="sticky top-0 z-20 -mx-4 border-b bg-background px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/sky')}
            aria-label="返回"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="flex-1 text-xl font-semibold">今天吃什么</h1>
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="flex items-center gap-1 rounded-xl bg-amber-500/15 px-3 py-1.5 text-sm text-amber-500 transition hover:bg-amber-500/25 dark:text-amber-300"
          >
            <Sparkles className="h-4 w-4" /> AI
          </button>
          <button
            type="button"
            onClick={openNew}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:opacity-90"
            aria-label="添加"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="mt-3 flex gap-1 rounded-full bg-muted p-1">
          {DISH_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                'flex-1 rounded-full px-3 py-1.5 text-sm transition',
                tab === t.value ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 搜索 */}
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted/60 px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearchEnter()}
            placeholder="搜一道菜…（含芒果会被拦下 🥭）"
            className="h-9 flex-1 bg-transparent text-sm outline-none"
          />
          {keyword && (
            <button type="button" onClick={() => setKeyword('')} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 抽签盲盒 */}
      <button
        type="button"
        onClick={draw}
        className={cn(
          'mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-2xl py-6 text-white shadow-lg transition-transform',
          'bg-gradient-to-br from-orange-400 via-pink-400 to-rose-400',
          shaking && 'animate-[shake_0.5s_ease-in-out]',
        )}
      >
        <Dices className={cn('h-8 w-8', shaking && 'animate-bounce')} />
        <span className="text-lg font-semibold">帮我选一个</span>
        <span className="text-xs opacity-90">今天吃什么？</span>
      </button>

      {/* 卡片列表 */}
      {list.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground/60">
          {keyword ? '没有搜到这道菜，换个关键词试试' : '还没有菜品，点右上角 + 记下第一道吧'}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3">
          {list.map((d) => (
            <div key={d.id} className="group relative">
              <DishCard dish={d} onOpen={() => navigate(`/food/${d.id}`)} />
              <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                <button type="button" onClick={() => openEdit(d)} aria-label="编辑" className="flex h-6 w-6 items-center justify-center rounded-md bg-black/45 text-white/90 hover:bg-black/70">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => removeDish(d.id)} aria-label="删除" className="flex h-6 w-6 items-center justify-center rounded-md bg-black/45 text-white/90 hover:bg-rose-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 盲盒结果弹窗 */}
      {resultOpen && result && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => setResultOpen(false)}>
          <div className="relative w-full max-w-xs overflow-hidden rounded-3xl bg-card p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-pink-100 via-orange-50 to-amber-100 dark:from-pink-950 dark:via-background dark:to-amber-950" />
            {result.coverUrl ? (
              <img src={result.coverUrl} alt={result.name} className="mx-auto h-32 w-32 -rotate-3 rounded-3xl object-cover shadow-lg" />
            ) : (
              <div className="mx-auto flex h-32 w-32 -rotate-3 items-center justify-center rounded-3xl bg-gradient-to-br from-rose-100 to-amber-100 text-6xl shadow-lg dark:from-zinc-800 dark:to-rose-950">
                {result.type === 'dessert' ? '🍰' : '🍚'}
              </div>
            )}
            <h3 className="mt-3 text-2xl font-bold">{result.name}</h3>
            <p className="mt-2 text-sm italic text-muted-foreground">「{recommendation}」</p>
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" onClick={() => setResultOpen(false)} className="h-10 flex-1 rounded-xl bg-muted text-sm font-medium transition hover:bg-muted/80">换一个</button>
              <button
                type="button"
                onClick={() => {
                  setResultOpen(false);
                  navigate(`/food/${result.id}`);
                }}
                className="h-10 flex-1 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                看做法
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
              <h3 className="text-sm font-medium">{editing.id ? '编辑菜品' : '添加菜品'}</h3>
              <button type="button" onClick={closeEditor} className="text-muted-foreground"><X className="h-4 w-4" /></button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">名称</label>
                <input value={editing.name} onChange={(e) => setEditing((f) => (f ? { ...f, name: e.target.value } : f))} placeholder="如 番茄牛腩" className={inputCls} autoFocus />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">分类</label>
                <div className="flex gap-1 rounded-full bg-muted p-1">
                  {DISH_TABS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setEditing((f) => (f ? { ...f, type: t.value } : f))}
                      className={cn('flex-1 rounded-full px-3 py-1 text-xs transition', editing.type === t.value ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground')}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">图片链接（可选）</label>
                <input value={editing.coverUrl} onChange={(e) => setEditing((f) => (f ? { ...f, coverUrl: e.target.value } : f))} placeholder="https://…" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">一句话描述</label>
                <input value={editing.description} onChange={(e) => setEditing((f) => (f ? { ...f, description: e.target.value } : f))} placeholder="这道菜的小心思…" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">食材 · 用量（每行：食材 用量 单位）</label>
                <textarea
                  value={editing.ingredients}
                  onChange={(e) => setEditing((f) => (f ? { ...f, ingredients: e.target.value } : f))}
                  rows={3}
                  placeholder={'番茄 2 个\n牛腩 500 g'}
                  className={cn(inputCls, 'resize-none')}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">做法步骤（每行一步）</label>
                <textarea
                  value={editing.steps}
                  onChange={(e) => setEditing((f) => (f ? { ...f, steps: e.target.value } : f))}
                  rows={4}
                  placeholder={'牛腩焯水\n番茄炒出沙\n炖 1 小时'}
                  className={cn(inputCls, 'resize-y')}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">标签</label>
                <div className="flex flex-wrap gap-1.5">
                  {TAG_OPTIONS.map((tag) => {
                    const active = editing.tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setEditing((f) => (f ? { ...f, tags: active ? f.tags.filter((t) => t !== tag) : [...f.tags, tag] } : f))
                        }
                        className={cn('rounded-full border px-3 py-1 text-xs transition', active ? tagClass(tag) : 'text-muted-foreground hover:bg-muted')}
                      >
                        {tagEmoji(tag)}
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-4">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">难度</label>
                  <div className="flex gap-1">
                    {[1, 2, 3].map((n) => (
                      <button key={n} type="button" onClick={() => setEditing((f) => (f ? { ...f, difficulty: n } : f))} className={cn('h-8 w-8 rounded-full text-sm transition', editing.difficulty === n ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground/70 hover:bg-muted/80')}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">治愈指数</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" onClick={() => setEditing((f) => (f ? { ...f, healingIndex: n } : f))} className={cn('h-8 w-8 rounded-full text-sm transition', editing.healingIndex === n ? 'bg-pink-500 text-white' : 'bg-muted text-foreground/70 hover:bg-muted/80')}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button type="button" onClick={closeEditor} className="h-10 flex-1 rounded-xl bg-muted/60 text-sm font-medium text-foreground/80 transition hover:bg-muted/80">取消</button>
              <button type="button" onClick={save} disabled={!editing.name.trim()} className="h-10 flex-1 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* AI 导入 */}
      {aiOpen && (
        <AiImportDialog
          title="AI 导入菜品"
          placeholder="粘贴菜名、做法描述，或一个菜谱链接…"
          systemPrompt={aiSystem}
          onResult={onAiResult}
          onClose={() => setAiOpen(false)}
        />
      )}

      <MangoKick trigger={kickTick} onClose={() => setKickTick(0)} />
    </div>
  );
}
