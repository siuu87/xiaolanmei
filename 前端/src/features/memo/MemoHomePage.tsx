import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { SegmentedControl } from '@/components/SegmentedControl';
import { listMemos } from '@/lib/api/memo';
import { UnfiledSection } from './UnfiledSection';
import { OwnerContent } from './OwnerContent';
import { AddMemoFab } from './AddMemoFab';
import { ArchivedSheet } from './ArchivedSheet';
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
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('unfiled');
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);

  const refresh = () => {
    listMemos({ status: 'archived' })
      .then((d) => setArchivedCount(d.length))
      .catch(() => {});
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="mx-auto w-full max-w-md pb-28 pt-6">
      <div className="flex items-center gap-2 px-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="返回"
          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-serif text-xs text-muted-foreground">MEMO · 备忘录</h1>
      </div>
      <div className="px-4 pb-2 pt-6">
        <h1 className="text-3xl font-bold">备忘录</h1>
      </div>

      {/* 三大分类滑块：未分类 / 我 / 他 */}
      <div className="px-4 pt-2">
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
    </div>
  );
}
