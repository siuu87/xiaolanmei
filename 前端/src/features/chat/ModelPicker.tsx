import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStationStore } from '@/stores/stationStore';
import { ChatSheet } from './ChatSheet';

interface Props {
  stationId: string | null;
  model: string | null;
  onChange: (stationId: string | null, model: string | null) => void;
  /** 打开弹窗前先关掉「+」/表情包面板，避免两层底栏叠在一起 */
  onBeforeOpen?: () => void;
}

/**
 * 模型选择（对齐设计稿：输入条左侧「模型 ▾」→ 底部「模型切换」弹窗）。
 *
 * 弹窗里先选站子（一颗颗 chip，选中变黑），再选该站子下的模型；选中行是
 * 浅灰底 + 实心单选点。写回逻辑跟旧的下拉菜单完全一致（`onChange(sid, model)`），
 * 只是把入口和展示换成了原稿的样子。
 */
export function ModelPicker({ stationId, model, onChange, onBeforeOpen }: Props) {
  const stations = useStationStore((s) => s.stations);
  const [open, setOpen] = useState(false);
  const enabled = stations.filter((s) => s.enabled);

  // 打开时默认停在「当前站子」，没选过就落在第一个可用站子
  const [activeId, setActiveId] = useState<string | null>(stationId ?? enabled[0]?.id ?? null);

  const openSheet = () => {
    onBeforeOpen?.();
    setActiveId(stationId ?? enabled[0]?.id ?? null);
    setOpen(true);
  };

  const pick = (sid: string | null, m: string | null) => {
    onChange(sid, m);
    setOpen(false);
  };

  const activeStation = enabled.find((s) => s.id === activeId) ?? null;
  const models = activeStation?.models ?? [];

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        title={model ? `当前模型：${model}` : '选择模型'}
        aria-label="选择模型"
        data-testid="model-picker"
        className="flex h-9 shrink-0 items-center gap-0.5 rounded-full pl-1 pr-1.5 text-[13px] text-chat-pill-fg transition hover:bg-chat-line active:scale-95"
      >
        <span className="whitespace-nowrap">模型</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </button>

      <ChatSheet open={open} onOpenChange={setOpen} title="模型切换" testid="model-sheet" maxHeight="max-h-[70vh]">
        {/* 站子 chip 行（横滑） */}
        <div className="scrollbar-thin -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
          <Chip active={!activeId} onClick={() => setActiveId(null)}>
            默认
          </Chip>
          {enabled.map((s) => (
            <Chip key={s.id} active={activeId === s.id} onClick={() => setActiveId(s.id)}>
              {s.name}
            </Chip>
          ))}
        </div>

        {/* 模型列表 */}
        {!activeId ? (
          <ModelRow
            name="默认模型"
            sub="不指定站子，走服务端默认"
            selected={!stationId && !model}
            onClick={() => pick(null, null)}
          />
        ) : models.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-chat-meta">这个站子还没配置模型</p>
        ) : (
          <div className="flex flex-col gap-2">
            {models.map((m) => (
              <ModelRow
                key={m}
                name={m}
                sub={stationId === activeId && model === m ? '当前使用' : activeStation?.name}
                selected={stationId === activeId && model === m}
                onClick={() => pick(activeId, m)}
              />
            ))}
          </div>
        )}

        {enabled.length === 0 && (
          <p className="mt-4 text-center text-[13px] text-chat-meta">还没有可用站子，去设置里添加</p>
        )}
      </ChatSheet>
    </>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3.5 text-[13px] transition active:scale-95',
        active ? 'bg-chat-me font-medium text-chat-me-fg' : 'bg-chat-pill text-chat-pill-fg hover:bg-chat-line',
      )}
    >
      {children}
      <ChevronDown className="h-3 w-3 opacity-60" />
    </button>
  );
}

function ModelRow({
  name,
  sub,
  selected,
  onClick,
}: {
  name: string;
  sub?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition active:scale-[0.99]',
        selected ? 'bg-chat-pill' : 'bg-transparent hover:bg-chat-pill/60',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[15px] text-foreground', selected && 'font-medium')}>{name}</span>
        {sub && <span className="mt-0.5 block truncate text-[12px] text-chat-meta">{sub}</span>}
      </span>
      <span
        aria-hidden
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-chat-me bg-chat-me text-chat-me-fg' : 'border-chat-line',
        )}
      >
        {selected && <Check className="h-3 w-3" />}
      </span>
    </button>
  );
}
