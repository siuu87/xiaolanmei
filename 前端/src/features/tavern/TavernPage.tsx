import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Beer,
  Bot,
  BookMarked,
  UserRound,
  Plus,
  Pencil,
  Trash2,
  Send,
  Loader2,
  ChevronLeft,
  X,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StarBackdrop } from '@/features/sky/StarBackdrop';
import {
  listTavernCharacters,
  createTavernCharacter,
  patchTavernCharacter,
  deleteTavernCharacter,
  listTavernWorldbook,
  createTavernWorldbook,
  patchTavernWorldbook,
  deleteTavernWorldbook,
  listTavernPersonas,
  createTavernPersona,
  patchTavernPersona,
  deleteTavernPersona,
  streamTavernChat,
  type TavernCharacter,
  type TavernWorldbookEntry,
  type TavernPersona,
} from '@/lib/api/tavern';

type Tab = 'characters' | 'worldbook' | 'personas';

const inputCls =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-white/30';
const btnCls =
  'rounded-lg bg-white/10 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/15 disabled:opacity-40';

/** 酒馆（SillyTavern 风格 AI 角色扮演）：角色卡 / 世界书 / 人设卡 + 沉浸式聊天，数据走 /api/tavern */
export function TavernPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('characters');
  const [characters, setCharacters] = useState<TavernCharacter[]>([]);
  const [worldbook, setWorldbook] = useState<TavernWorldbookEntry[]>([]);
  const [personas, setPersonas] = useState<TavernPersona[]>([]);
  const [activePersonaId, setActivePersonaId] = useState<string | null>(null);
  const [chatChar, setChatChar] = useState<TavernCharacter | null>(null);

  const reload = useCallback(async () => {
    const [c, w, p] = await Promise.all([
      listTavernCharacters(),
      listTavernWorldbook(),
      listTavernPersonas(),
    ]);
    setCharacters(c);
    setWorldbook(w);
    setPersonas(p);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 当前使用的人设卡：持久化到本地
  useEffect(() => {
    setActivePersonaId(localStorage.getItem('tavern.activePersona'));
  }, []);
  const selectPersona = (id: string | null) => {
    setActivePersonaId(id);
    if (id) localStorage.setItem('tavern.activePersona', id);
    else localStorage.removeItem('tavern.activePersona');
  };

  if (chatChar) {
    return <TavernChat character={chatChar} personaId={activePersonaId} onExit={() => setChatChar(null)} />;
  }

  const TABS: { key: Tab; label: string; icon: typeof Bot }[] = [
    { key: 'characters', label: '角色卡', icon: Bot },
    { key: 'worldbook', label: '世界书', icon: BookMarked },
    { key: 'personas', label: '人设卡', icon: UserRound },
  ];

  return (
    <div className="relative min-h-full bg-[#070b1a] text-slate-200">
      <StarBackdrop />
      <div className="relative mx-auto w-full max-w-md px-4 py-8">
        <header className="mb-6 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/sky')}
            aria-label="返回"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex flex-1 items-center justify-center gap-2 text-center">
            <Beer className="h-4 w-4 text-amber-300" />
            <h1 className="text-xl font-bold text-slate-100">酒馆</h1>
          </div>
          <span className="w-8" />
        </header>

        <div className="mb-5 flex justify-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-4 py-2 text-sm transition',
                tab === t.key ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
              )}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'characters' && (
          <CharacterTab characters={characters} reload={reload} onChat={setChatChar} />
        )}
        {tab === 'worldbook' && <WorldbookTab entries={worldbook} reload={reload} />}
        {tab === 'personas' && (
          <PersonaTab personas={personas} activeId={activePersonaId} onSelect={selectPersona} reload={reload} />
        )}
      </div>
    </div>
  );
}

/* ============================= 角色卡 ============================= */

function CharacterTab({
  characters,
  reload,
  onChat,
}: {
  characters: TavernCharacter[];
  reload: () => Promise<void>;
  onChat: (c: TavernCharacter) => void;
}) {
  const [editing, setEditing] = useState<TavernCharacter | 'new' | null>(null);
  const [confirming, setConfirming] = useState<TavernCharacter | null>(null);

  const remove = async (c: TavernCharacter) => {
    await deleteTavernCharacter(c.id);
    setConfirming(null);
    await reload();
  };

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setEditing('new')} className={cn(btnCls, 'flex w-full items-center justify-center gap-1 py-2')}>
        <Plus className="h-4 w-4" /> 新建角色
      </button>

      {characters.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">还没有角色卡，点上面新建一个吧。</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {characters.map((c) => (
            <div key={c.id} className="group relative">
              <button
                type="button"
                onClick={() => onChat(c)}
                className="flex w-full flex-col items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left backdrop-blur-sm transition hover:border-white/20 hover:bg-white/[0.08]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl">
                  {c.avatar || '🤖'}
                </span>
                <span className="w-full">
                  <span className="block text-sm font-medium text-slate-100">{c.name}</span>
                  {c.description && (
                    <span className="mt-1 block text-[11px] leading-4 text-slate-400">{c.description}</span>
                  )}
                </span>
                {c.tags.length > 0 && (
                  <span className="mt-auto flex flex-wrap gap-1">
                    {c.tags.map((t) => (
                      <span key={t} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-400">
                        {t}
                      </span>
                    ))}
                  </span>
                )}
              </button>
              <span className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                <IconBtn title="编辑" onClick={() => setEditing(c)}>
                  <Pencil className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn title="删除" onClick={() => setConfirming(c)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </span>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <CharacterForm
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}

      {confirming && (
        <Confirm title="删除角色卡" text={`确定删除「${confirming.name}」？此操作不可恢复。`} onCancel={() => setConfirming(null)} onOk={() => void remove(confirming)} />
      )}
    </div>
  );
}

function CharacterForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: TavernCharacter | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    avatar: initial?.avatar ?? '',
    tags: (initial?.tags ?? []).join('，'),
    description: initial?.description ?? '',
    personality: initial?.personality ?? '',
    scenario: initial?.scenario ?? '',
    firstMessage: initial?.firstMessage ?? '',
    systemPrompt: initial?.systemPrompt ?? '',
  });
  const [busy, setBusy] = useState(false);

  const upd = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        avatar: form.avatar.trim(),
        tags: form.tags.split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
        description: form.description,
        personality: form.personality,
        scenario: form.scenario,
        firstMessage: form.firstMessage,
        systemPrompt: form.systemPrompt,
      };
      if (initial) await patchTavernCharacter(initial.id, payload);
      else await createTavernCharacter(payload);
      await onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={initial ? '编辑角色' : '新建角色'} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_72px] gap-2">
          <Field label="名字" value={form.name} onChange={upd('name')} placeholder="如 苏晚晴" />
          <Field label="头像" value={form.avatar} onChange={upd('avatar')} placeholder="🐰" />
        </div>
        <Field label="标签（逗号分隔）" value={form.tags} onChange={upd('tags')} placeholder="温柔，学姐" />
        <Area label="一句话人设" value={form.description} onChange={upd('description')} placeholder="温柔体贴的学姐…" rows={2} />
        <Area label="性格 / 详细设定" value={form.personality} onChange={upd('personality')} placeholder="性格、背景、说话方式…" rows={3} />
        <Area label="场景" value={form.scenario} onChange={upd('scenario')} placeholder="当前发生的场景…" rows={2} />
        <Area label="开场白" value={form.firstMessage} onChange={upd('firstMessage')} placeholder="进入对话时角色先说的话…" rows={2} />
        <Area label="附加指令（可选）" value={form.systemPrompt} onChange={upd('systemPrompt')} placeholder="额外的规则，如“不要使用颜文字”…" rows={2} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={btnCls}>取消</button>
          <button type="button" onClick={() => void save()} disabled={busy || !form.name.trim()} className={cn(btnCls, 'bg-amber-400/90 text-slate-900 hover:bg-amber-400')}>
            {busy && <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />} 保存
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ============================= 世界书 ============================= */

function WorldbookTab({ entries, reload }: { entries: TavernWorldbookEntry[]; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<TavernWorldbookEntry | 'new' | null>(null);
  const [confirming, setConfirming] = useState<TavernWorldbookEntry | null>(null);

  const toggle = async (w: TavernWorldbookEntry) => {
    await patchTavernWorldbook(w.id, { enabled: !w.enabled });
    await reload();
  };
  const remove = async (w: TavernWorldbookEntry) => {
    await deleteTavernWorldbook(w.id);
    setConfirming(null);
    await reload();
  };

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setEditing('new')} className={cn(btnCls, 'flex w-full items-center justify-center gap-1 py-2')}>
        <Plus className="h-4 w-4" /> 新建条目
      </button>

      {entries.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">还没有世界书条目。世界书会在对话命中关键词时自动注入设定。</p>
      ) : (
        <div className="space-y-2">
          {entries.map((w) => (
            <div key={w.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void toggle(w)}
                  className={cn('flex h-5 w-9 shrink-0 items-center rounded-full transition', w.enabled ? 'bg-amber-400/80' : 'bg-white/15')}
                  aria-label="开关"
                >
                  <span className={cn('block h-4 w-4 rounded-full bg-white transition-transform', w.enabled ? 'translate-x-4' : 'translate-x-0.5')} />
                </button>
                <span className="truncate text-sm font-medium text-slate-100">{w.name}</span>
                <span className="shrink-0 text-[10px] text-slate-500">优先级 {w.priority}</span>
                <span className="shrink-0 text-[10px] text-slate-500">{w.position === 'after' ? '后置' : '前置'}</span>
                <div className="flex-1" />
                <IconBtn title="编辑" onClick={() => setEditing(w)}>
                  <Pencil className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn title="删除" onClick={() => setConfirming(w)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
              {w.keywords.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {w.keywords.map((k) => (
                    <span key={k} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-400">
                      {k}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{w.content}</p>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <WorldbookForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />
      )}
      {confirming && (
        <Confirm title="删除世界书条目" text={`确定删除「${confirming.name}」？`} onCancel={() => setConfirming(null)} onOk={() => void remove(confirming)} />
      )}
    </div>
  );
}

function WorldbookForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: TavernWorldbookEntry | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    keywords: (initial?.keywords ?? []).join('，'),
    content: initial?.content ?? '',
    priority: String(initial?.priority ?? 0),
    position: initial?.position ?? 'before',
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.name.trim() || !form.content.trim()) return;
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        keywords: form.keywords.split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
        content: form.content,
        priority: Number(form.priority) || 0,
        position: form.position as 'before' | 'after',
      };
      if (initial) await patchTavernWorldbook(initial.id, payload);
      else await createTavernWorldbook(payload);
      await onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={initial ? '编辑世界书' : '新建世界书'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="名称" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="如 世界观" />
        <Field label="关键词（逗号分隔，命中即注入）" value={form.keywords} onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))} placeholder="如 星空，魔法" />
        <Area label="内容" value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} rows={4} placeholder="注入到对话里的设定…" />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">优先级（越大越靠前）</label>
            <input type="number" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">位置</label>
            <select value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value as 'before' | 'after' }))} className={inputCls}>
              <option value="before">角色设定前</option>
              <option value="after">角色设定后</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={btnCls}>取消</button>
          <button type="button" onClick={() => void save()} disabled={busy || !form.name.trim() || !form.content.trim()} className={cn(btnCls, 'bg-amber-400/90 text-slate-900 hover:bg-amber-400')}>
            {busy && <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />} 保存
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ============================= 人设卡 ============================= */

function PersonaTab({
  personas,
  activeId,
  onSelect,
  reload,
}: {
  personas: TavernPersona[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  reload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<TavernPersona | 'new' | null>(null);
  const [confirming, setConfirming] = useState<TavernPersona | null>(null);

  const remove = async (p: TavernPersona) => {
    await deleteTavernPersona(p.id);
    if (activeId === p.id) onSelect(null);
    setConfirming(null);
    await reload();
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">人设卡是「你」在剧情里扮演的角色，聊天时会告诉 AI 你是谁。</p>
      <button type="button" onClick={() => setEditing('new')} className={cn(btnCls, 'flex w-full items-center justify-center gap-1 py-2')}>
        <Plus className="h-4 w-4" /> 新建人设
      </button>

      {personas.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">还没有人设卡。先建一张「你」的人设吧。</p>
      ) : (
        <div className="space-y-2">
          {personas.map((p) => {
            const active = p.id === activeId;
            return (
              <div key={p.id} className={cn('flex items-center gap-3 rounded-xl border p-3', active ? 'border-amber-400/40 bg-amber-400/10' : 'border-white/10 bg-white/[0.04]')}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl">
                  {p.avatar || '🙂'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">{p.name}</p>
                  {p.description && <p className="truncate text-[11px] text-slate-400">{p.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => onSelect(active ? null : p.id)}
                  className={cn('flex items-center gap-1 rounded-full px-3 py-1 text-xs transition', active ? 'bg-amber-400/90 text-slate-900' : 'bg-white/10 text-slate-300 hover:bg-white/15')}
                >
                  {active && <Check className="h-3 w-3" />} {active ? '使用中' : '使用'}
                </button>
                <IconBtn title="编辑" onClick={() => setEditing(p)}>
                  <Pencil className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn title="删除" onClick={() => setConfirming(p)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <PersonaForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />
      )}
      {confirming && (
        <Confirm title="删除人设卡" text={`确定删除「${confirming.name}」？`} onCancel={() => setConfirming(null)} onOk={() => void remove(confirming)} />
      )}
    </div>
  );
}

function PersonaForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: TavernPersona | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    avatar: initial?.avatar ?? '',
    description: initial?.description ?? '',
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const payload = { name: form.name.trim(), avatar: form.avatar.trim(), description: form.description };
      if (initial) await patchTavernPersona(initial.id, payload);
      else await createTavernPersona(payload);
      await onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={initial ? '编辑人设' : '新建人设'} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_72px] gap-2">
          <Field label="名字" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="如 你" />
          <Field label="头像" value={form.avatar} onChange={(e) => setForm((f) => ({ ...f, avatar: e.target.value }))} placeholder="🫐" />
        </div>
        <Area label="人设描述" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} placeholder="你在剧情里是谁…" />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={btnCls}>取消</button>
          <button type="button" onClick={() => void save()} disabled={busy || !form.name.trim()} className={cn(btnCls, 'bg-amber-400/90 text-slate-900 hover:bg-amber-400')}>
            {busy && <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />} 保存
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ============================= 聊天 ============================= */

function TavernChat({
  character,
  personaId,
  onExit,
}: {
  character: TavernCharacter;
  personaId: string | null;
  onExit: () => void;
}) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>(() =>
    character.firstMessage ? [{ role: 'assistant', content: character.firstMessage }] : [],
  );
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    const history: { role: 'user' | 'assistant'; content: string }[] = [...messages, { role: 'user', content: text }];
    setMessages(history);
    setSending(true);
    setStreaming('');
    try {
      let acc = '';
      let errorMsg = '';
      await streamTavernChat({ characterId: character.id, personaId, messages: history }, (ev) => {
        if (ev.type === 'delta') {
          acc += ev.content;
          setStreaming(acc);
        } else if (ev.type === 'error') {
          errorMsg = ev.message;
        }
      });
      if (errorMsg) {
        setMessages((m) => [...m, { role: 'assistant', content: `（出错了）${errorMsg}` }]);
      } else if (acc) {
        setMessages((m) => [...m, { role: 'assistant', content: acc }]);
      }
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `（出错了）${(e as Error).message}` }]);
    } finally {
      setStreaming('');
      setSending(false);
    }
  };

  return (
    <div className="relative flex min-h-full flex-col bg-[#070b1a] text-slate-200">
      <StarBackdrop />
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-4">
        {/* 头部 */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <button
            type="button"
            onClick={onExit}
            aria-label="返回"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl">
            {character.avatar || '🤖'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-100">{character.name}</p>
            {character.description && <p className="truncate text-[11px] text-slate-500">{character.description}</p>}
          </div>
        </div>

        {/* 消息区 */}
        <div className="flex-1 space-y-3 overflow-y-auto py-4">
          {messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-6',
                  m.role === 'user' ? 'rounded-br-sm bg-amber-400/90 text-slate-900' : 'rounded-bl-sm bg-white/10 text-slate-200',
                )}
              >
                {m.content}
              </div>
            </div>
          ))}
          {streaming && (
            <div className="flex justify-start">
              <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-white/10 px-3 py-2 text-sm leading-6 text-slate-200">
                {streaming}
                <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-slate-400 align-middle" />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* 输入区 */}
        <div className="flex items-center gap-2 border-t border-white/10 pt-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && send()}
            placeholder={`和 ${character.name} 说点什么…`}
            className="h-10 flex-1 rounded-full border border-white/10 bg-white/5 px-4 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-white/30"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!draft.trim() || sending}
            aria-label="发送"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400/90 text-slate-900 transition hover:bg-amber-400 disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================= 通用小组件 ============================= */

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex h-6 w-6 items-center justify-center rounded-md bg-black/30 text-slate-300 transition hover:bg-black/50 hover:text-white"
    >
      {children}
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-[#0d1226] p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100">{title}</h2>
          <button type="button" onClick={onClose} aria-label="关闭" className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-400">{label}</label>
      <input value={value} onChange={onChange} placeholder={placeholder} className={inputCls} />
    </div>
  );
}

function Area({ label, value, onChange, placeholder, rows }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; placeholder?: string; rows?: number }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-400">{label}</label>
      <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows ?? 3} className={cn(inputCls, 'resize-none leading-6')} />
    </div>
  );
}

function Confirm({ title, text, onCancel, onOk }: { title: string; text: string; onCancel: () => void; onOk: () => void }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-slate-300">{text}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={btnCls}>取消</button>
        <button type="button" onClick={onOk} className={cn(btnCls, 'bg-rose-500/80 text-white hover:bg-rose-500')}>删除</button>
      </div>
    </Modal>
  );
}
