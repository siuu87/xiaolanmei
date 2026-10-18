import { useEffect, useState } from 'react';
import { Bell, ChevronRight } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { SegmentedControl } from '@/components/SegmentedControl';
import { listMemos } from '@/lib/api/memo';
import { useLocalSwitch } from '@/lib/useLocalSwitch';
import { UnfiledSection } from './UnfiledSection';
import { OwnerContent } from './OwnerContent';
import { AddMemoFab } from './AddMemoFab';
import { ArchivedSheet } from './ArchivedSheet';
import { NotifySheet } from './NotifySheet';
import type { OwnerSide } from './types';

type TabKey = 'unfiled' | OwnerSide;

/** 「我」/「他」滑块页：标题 = 分类名，副标题 = 细分类（可折叠）+ 圆点列表，类似 iOS 备忘录。 */
function OwnerTab({
  ownerSide,
  title,
  onChanged,
}: {
  ownerSide: OwnerSide;
  title: string;
  onChanged: () => void;
}) {
  return (
    <div className="pt-2">
      <div className="px-4 pb-2 pt-4">
        <h2 className="text-2xl font-bold">{title}</h2>
      </div>
      <OwnerContent ownerSide={ownerSide} onChanged={onChanged} />
    </div>
  );
}

/** 备忘录首页：滑块切换「未分类 / 我 / 他」，默认未分类。 */
export function MemoHomePage() {
  const [tab, setTab] = useState<TabKey>('unfiled');
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);
  /** 设置页「待提醒」开关：开着才在顶部显示提醒汇总条 */
  const [notifyOn] = useLocalSwitch('blueberry.memoNotify', false);
  const [notifyCount, setNotifyCount] = useState(0);
  const [notifyOpen, setNotifyOpen] = useState(false);

  const refresh = () => {
    listMemos({ status: 'archived' })
      .then((d) => setArchivedCount(d.length))
      .catch(() => {});
    listMemos()
      .then((all) => setNotifyCount(all.filter((m) => m.needNotify).length))
      .catch(() => {});
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <PageShell title="备忘录" eyebrow="MEMO" bodyClassName="px-0 pb-28 pt-0">
      {/* 待提醒汇总：受设置页那个开关控制，关掉就整条消失 */}
      {notifyOn && (
        <div className="px-4 pt-2">
          <button
            type="button"
            data-testid="memo-notify-banner"
            onClick={() => setNotifyOpen(true)}
            className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left transition active:bg-muted"
          >
            <Bell className="h-4 w-4 shrink-0 text-rose-400" />
            <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">
              {notifyCount ? `待提醒 · ${notifyCount} 条` : '待提醒 · 暂无'}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
          </button>
        </div>
      )}

      {/* 三大分类滑块：未分类 / 我 / 他 */}
      <div className="px-4 pt-1">
        <SegmentedControl<TabKey>
          segments={[
            { value: 'unfiled', label: '未分类' },
            { value: 'me', label: '我' },
            { value: 'partner', label: '他' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'unfiled' && (
        <UnfiledSection
          archivedCount={archivedCount}
          onOpenArchived={() => setArchivedOpen(true)}
          onArchivedChange={refresh}
        />
      )}
      {tab === 'me' && <OwnerTab ownerSide="me" title="我" onChanged={refresh} />}
      {tab === 'partner' && <OwnerTab ownerSide="partner" title="他" onChanged={refresh} />}

      {/* 浮动添加 */}
      <AddMemoFab onCreated={refresh} />

      {/* 已收录 Sheet（从文件夹小卡进入） */}
      <ArchivedSheet open={archivedOpen} onOpenChange={setArchivedOpen} />

      {/* 待提醒 Sheet（从顶部汇总条进入） */}
      <NotifySheet open={notifyOpen} onOpenChange={setNotifyOpen} onChanged={refresh} />
    </PageShell>
  );
}
