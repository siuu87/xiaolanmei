import { useEffect, useState } from 'react';
import { RefreshCw, Loader2, Check, Server, CloudOff } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  getSyncConfig,
  updateSyncConfig,
  pullChanges,
  pushChanges,
  pullFromRemote,
  pushToRemote,
} from '@/lib/api/sync';

const inputCls =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';

const LS_PULL = 'blueberry.sync.lastPullCursor';
const LS_PUSH = 'blueberry.sync.lastPushCursor';

/** 双端同步面板：配置远端地址，手动双向同步（内嵌在「我的」页） */
export function SyncPanel() {
  const [nodeId, setNodeId] = useState('local');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    void getSyncConfig().then((c) => {
      setNodeId(c.nodeId);
      setRemoteUrl(c.remoteUrl);
    });
  }, []);

  const saveConfig = async () => {
    await updateSyncConfig({ nodeId, remoteUrl: remoteUrl.trim() });
    setResult('配置已保存');
    setTimeout(() => setResult(null), 2000);
  };

  const syncNow = async () => {
    const remote = remoteUrl.trim();
    if (!remote) {
      setResult('请先填写远端地址（VPS 上的小蓝莓后端地址）');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const lastPull = localStorage.getItem(LS_PULL) ?? '0:';
      const lastPush = localStorage.getItem(LS_PUSH) ?? '0:';

      // 1. 拉远端 → 应用到本地
      const rp = await pullFromRemote(remote, lastPull);
      if (Object.keys(rp.changes).length) {
        await pushChanges(rp.changes);
      }
      localStorage.setItem(LS_PULL, rp.cursor);

      // 2. 推本地 → 应用到远端
      const lp = await pullChanges(lastPush);
      if (Object.keys(lp.changes).length) {
        await pushToRemote(remote, lp.changes);
      }
      localStorage.setItem(LS_PUSH, lp.cursor);

      setResult(`同步完成：拉取 ${Object.keys(rp.changes).length} 表、推送 ${Object.keys(lp.changes).length} 表`);
    } catch (e) {
      setResult(`同步失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" /> 同步配置
          </CardTitle>
          <CardDescription>本端节点与远端地址</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">本端节点 ID</label>
            <input value={nodeId} onChange={(e) => setNodeId(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">远端地址</label>
            <input
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="如 https://blueberry.example.com"
              className={inputCls}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void saveConfig()}>
              <Check className="h-4 w-4" /> 保存配置
            </Button>
            <Button onClick={() => void syncNow()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              立即同步
            </Button>
          </div>
          {result && <div className="text-sm text-muted-foreground">{result}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudOff className="h-5 w-5" /> 说明
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>· 同步采用「游标增量 + updated_at 最后写入胜出（LWW）+ 墓碑删除」。</p>
          <p>· 远端是另一台跑着「小蓝莓」后端的小蓝莓实例（阶段 13 部署到 VPS 后填它的地址）。</p>
          <p>· 敏感数据（API Key、MCP 密钥）只留本端，不会进入同步范围。</p>
        </CardContent>
      </Card>
    </div>
  );
}
