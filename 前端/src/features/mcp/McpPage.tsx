import { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  Play,
  Pencil,
  Check,
  X,
  Shield,
  Server,
  Globe,
  Terminal,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  listMcpServers,
  createMcpServer,
  patchMcpServer,
  deleteMcpServer,
  listServerTools,
  listToolCalls,
  getAllowList,
  setAllow,
  runTool,
  type McpServerDTO,
  type McpToolInfo,
  type ToolCallDTO,
} from '@/lib/api/mcp';

const inputCls =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';

const TYPE_ICON = { stdio: Terminal, sse: Globe, http: Globe } as const;

function TypeBadge({ type }: { type: string }) {
  const Icon = TYPE_ICON[type as keyof typeof TYPE_ICON] ?? Globe;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" />
      {type}
    </span>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, string> = {
    ok: 'text-emerald-500',
    error: 'text-destructive',
    unknown: 'text-muted-foreground',
  };
  return <span className={cn('text-xs font-medium', map[status ?? 'unknown'])}>{status ?? '未知'}</span>;
}

/** MCP 管理页（阶段 9）：多 MCP 的开关/配置/工具测试/调用记录 + 工具允许列表 */
export function McpPage() {
  const [servers, setServers] = useState<McpServerDTO[]>([]);
  const [calls, setCalls] = useState<ToolCallDTO[]>([]);
  const [allowList, setAllowList] = useState<string[]>([]);
  const [editing, setEditing] = useState<McpServerDTO | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', type: 'http', config: '{}' });
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [serverTools, setServerTools] = useState<Record<string, McpToolInfo[]>>({});
  const [toolResults, setToolResults] = useState<Record<string, string>>({});
  const [toolBusy, setToolBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [argsText, setArgsText] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    try {
      const [s, c, a] = await Promise.all([listMcpServers(), listToolCalls(), getAllowList()]);
      setServers(s.servers);
      setCalls(c.calls);
      setAllowList(a.allowList);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const startNew = () => {
    setForm({ name: '', type: 'http', config: JSON.stringify({ url: 'http://localhost:9000/mcp' }, null, 2) });
    setEditing('new');
  };

  const startEdit = (s: McpServerDTO) => {
    setForm({ name: s.name, type: s.type, config: JSON.stringify(s.config ?? {}, null, 2) });
    setEditing(s);
  };

  const save = async () => {
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(form.config);
    } catch {
      alert('配置不是合法 JSON');
      return;
    }
    setBusy(true);
    try {
      const input = { name: form.name.trim(), type: form.type, config };
      if (editing === 'new') await createMcpServer(input);
      else if (editing) await patchMcpServer(editing.id, input);
      setEditing(null);
      await reload();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (s: McpServerDTO) => {
    await patchMcpServer(s.id, { enabled: !s.enabled });
    await reload();
  };

  const remove = async (s: McpServerDTO) => {
    if (!confirm(`删除 MCP 服务器「${s.name}」？`)) return;
    await deleteMcpServer(s.id);
    await reload();
  };

  const detectTools = async (id: string) => {
    setToolBusy(id);
    try {
      const r = await listServerTools(id);
      setServerTools((m) => ({ ...m, [id]: r.tools }));
      setExpandedId(id);
    } catch (e) {
      setServerTools((m) => ({ ...m, [id]: [] }));
      alert((e as Error).message);
    } finally {
      setToolBusy(null);
      await reload(); // 刷新 status/lastError
    }
  };

  const run = async (id: string, tool: McpToolInfo, confirmArg = false) => {
    const key = `${id}:${tool.name}`;
    setToolBusy(key);
    setConfirming(null);
    let args: Record<string, unknown> = {};
    try {
      args = argsText[key] ? JSON.parse(argsText[key]) : {};
    } catch {
      setToolResults((m) => ({ ...m, [key]: '参数不是合法 JSON' }));
      setToolBusy(null);
      return;
    }
    try {
      const r = await runTool({ name: tool.name, serverId: id, arguments: args, confirm: confirmArg });
      if ('needsConfirm' in r) {
        setConfirming(key);
        setToolResults((m) => ({ ...m, [key]: r.message }));
      } else {
        setToolResults((m) => ({ ...m, [key]: r.result }));
        await reload();
      }
    } catch (e) {
      setToolResults((m) => ({ ...m, [key]: (e as Error).message }));
    } finally {
      setToolBusy(null);
    }
  };

  const allow = async (id: string, tool: string) => {
    await setAllow(`mcp:${id}:${tool}`);
    await reload();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">MCP 插件</h1>
          <p className="mt-1 text-muted-foreground">统一插件机制：接入第三方能力（小游戏、工具等）。</p>
        </div>
        <Button onClick={startNew} size="sm">
          <Plus className="h-4 w-4" /> 添加服务器
        </Button>
      </div>

      {/* 服务器列表 */}
      <Card>
        <CardHeader>
          <CardTitle>服务器</CardTitle>
          <CardDescription>开关、配置与工具测试</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {servers.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              还没有接入 MCP 服务器。点击右上角「添加服务器」开始。
            </div>
          )}
          {servers.map((s) => {
            const tools = serverTools[s.id] ?? [];
            return (
              <div key={s.id} className="rounded-xl border p-3">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{s.name}</span>
                  <TypeBadge type={s.type} />
                  <StatusBadge status={s.status} />
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => void toggle(s)}
                    className={cn(
                      'h-5 w-9 rounded-full transition',
                      s.enabled ? 'bg-primary' : 'bg-muted',
                    )}
                    aria-label="开关"
                  >
                    <span
                      className={cn(
                        'block h-4 w-4 rounded-full bg-white transition-transform',
                        s.enabled ? 'translate-x-4' : 'translate-x-0.5',
                      )}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => (expandedId === s.id ? setExpandedId(null) : void detectTools(s.id))}
                    aria-label="测试工具"
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  >
                    <ChevronDown
                      className={cn('h-4 w-4 transition', expandedId === s.id && 'rotate-180')}
                    />
                    工具
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(s)}
                    aria-label="编辑"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(s)}
                    aria-label="删除"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-destructive hover:bg-muted"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {s.lastError && (
                  <div className="mt-2 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                    {s.lastError}
                  </div>
                )}

                {expandedId === s.id && (
                  <div className="mt-3 space-y-2 border-t pt-2">
                    {toolBusy === s.id && <Loader2 className="h-4 w-4 animate-spin" />}
                    {tools.length === 0 && toolBusy !== s.id && (
                      <div className="text-xs text-muted-foreground">该服务器没有暴露工具。</div>
                    )}
                    {tools.map((t) => {
                      const key = `${s.id}:${t.name}`;
                      const busy = toolBusy === key;
                      const res = toolResults[key];
                      return (
                        <div key={t.name} className="rounded-lg bg-muted/40 p-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{t.name}</span>
                            {t.description && (
                              <span className="truncate text-xs text-muted-foreground">
                                {t.description}
                              </span>
                            )}
                            <div className="flex-1" />
                            <button
                              type="button"
                              onClick={() => void allow(s.id, t.name)}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                              <Shield className="h-3 w-3" /> 允许
                            </button>
                            <button
                              type="button"
                              onClick={() => void run(s.id, t, false)}
                              disabled={busy}
                              className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90"
                            >
                              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                              运行
                            </button>
                          </div>
                          <input
                            value={argsText[key] ?? '{}'}
                            onChange={(e) => setArgsText((m) => ({ ...m, [key]: e.target.value }))}
                            placeholder='参数 JSON，如 {"q":"你好"}'
                            className={cn(inputCls, 'mt-2 font-mono text-xs')}
                          />
                          {res && (
                            <div className="mt-1 whitespace-pre-wrap break-words rounded bg-background/60 px-2 py-1 text-xs">
                              {res}
                            </div>
                          )}
                          {confirming === key && (
                            <div className="mt-1 flex items-center gap-2">
                              <span className="text-xs text-amber-500">该工具需要确认才能执行</span>
                              <Button size="sm" onClick={() => void run(s.id, t, true)}>
                                <Check className="h-3 w-3" /> 确认运行
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => void allow(s.id, t.name)}>
                                <Shield className="h-3 w-3" /> 加入允许列表
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* 添加 / 编辑表单 */}
      {editing && (
        <Card>
          <CardHeader>
            <CardTitle>{editing === 'new' ? '添加服务器' : '编辑服务器'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">名称</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="如 小游戏"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">类型</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className={inputCls}
                >
                  <option value="http">http</option>
                  <option value="sse">sse</option>
                  <option value="stdio">stdio</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">配置（JSON）</label>
              <textarea
                value={form.config}
                onChange={(e) => setForm((f) => ({ ...f, config: e.target.value }))}
                rows={6}
                placeholder='http/sse: {"url":"...","headers":{}}  stdio: {"command":"node","args":["..."]}'
                className={cn(inputCls, 'font-mono text-xs')}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                <X className="h-4 w-4" /> 取消
              </Button>
              <Button onClick={() => void save()} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                <Check className="h-4 w-4" /> 保存
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 允许列表 */}
      <Card>
        <CardHeader>
          <CardTitle>免确认允许列表</CardTitle>
          <CardDescription>列在此处的工具调用不再弹确认</CardDescription>
        </CardHeader>
        <CardContent>
          {allowList.length === 0 ? (
            <div className="text-sm text-muted-foreground">空（内置只读工具默认免确认）。</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allowList.map((k) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs"
                >
                  <Shield className="h-3 w-3" />
                  {k}
                  <button
                    type="button"
                    onClick={() => void setAllow(k, true).then(reload)}
                    aria-label="移除"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 调用记录 */}
      <Card>
        <CardHeader>
          <CardTitle>调用记录</CardTitle>
          <CardDescription>最近 50 条工具调用（MCP 与内置共用）</CardDescription>
        </CardHeader>
        <CardContent>
          {calls.length === 0 ? (
            <div className="text-sm text-muted-foreground">还没有调用记录。</div>
          ) : (
            <div className="space-y-1.5">
              {calls.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs"
                >
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5',
                      c.status === 'success'
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : c.status === 'denied'
                          ? 'bg-amber-500/15 text-amber-500'
                          : 'bg-destructive/15 text-destructive',
                    )}
                  >
                    {c.status}
                  </span>
                  <span className="font-mono">{c.toolName}</span>
                  <span className="text-muted-foreground">{c.kind}</span>
                  {c.latencyMs != null && (
                    <span className="text-muted-foreground">{c.latencyMs}ms</span>
                  )}
                  <div className="flex-1" />
                  <span className="text-muted-foreground">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
