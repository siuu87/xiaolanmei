/**
 * 通讯录页（2026-10-22 新增）
 *
 * 左侧导轨新增的「通讯录」Tab：列出所有联系人，点一下直接发起会话。
 * 设计语言照用户参考图：居中标题 + 白色大圆角卡片列表 + 空态居中卡片。
 * 头像一律走 `AvatarContent`（项目硬规矩），配色走 phone 语义 token（深浅自适应）。
 */
import { useMemo, useState } from 'react';
import { Search, X, UsersRound } from 'lucide-react';
import { usePhoneStore } from './phoneStore';
import { PhoneNavBar } from './PhoneShell';
import { AvatarContent } from '@/components/AvatarContent';

export function ContactsPage({ onOpen }: { onOpen: (contactId: string) => void }) {
  const contacts = usePhoneStore((s) => s.contacts);
  const [query, setQuery] = useState('');

  const list = useMemo(() => {
    const kw = query.trim().toLowerCase();
    if (!kw) return contacts;
    return contacts.filter((c) => `${c.name} ${c.signature}`.toLowerCase().includes(kw));
  }, [contacts, query]);

  return (
    <div className="flex h-full flex-col bg-phone-bg">
      <div className="shrink-0 bg-phone-nav">
        <PhoneNavBar title="通讯录" />
        <div className="px-3 pb-2">
          <div className="flex h-9 items-center gap-1.5 rounded-[10px] bg-phone-grouped px-2.5">
            <Search className="h-4 w-4 shrink-0 text-phone-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索联系人"
              className="h-full flex-1 bg-transparent text-[16px] text-phone-ink outline-none placeholder:text-phone-muted"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="清空" className="text-phone-muted">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-1">
        {list.length === 0 ? (
          /* 空态：照参考图的居中白卡（图标 + 标题 + 说明） */
          <div className="mt-6 flex flex-col items-center rounded-[18px] bg-phone-surface px-6 py-10 text-center shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-phone-grouped text-phone-muted">
              <UsersRound className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <p className="mt-3 text-[15px] font-semibold text-phone-ink">
              {query ? '没有匹配的联系人' : '还没有联系人'}
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-phone-muted">
              {query ? '换个关键词试试' : '去「角色卡」里新建一张角色卡，TA 就会出现在这里。'}
            </p>
          </div>
        ) : (
          /* 联系人卡片：一整张白色圆角卡，行间细分隔线 */
          <div className="overflow-hidden rounded-[14px] bg-phone-surface shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
            {list.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onOpen(c.id)}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition active:bg-phone-grouped"
              >
                <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#dcdce0] to-[#c9c9cf] text-xl">
                  <AvatarContent value={c.avatar ?? ''} fallback="🙂" />
                </span>
                <span
                  className={`flex min-w-0 flex-1 flex-col justify-center py-1.5 ${
                    i < list.length - 1 ? 'border-b border-phone-sep' : ''
                  }`}
                >
                  <span className="truncate text-[15px] font-medium text-phone-ink">{c.name}</span>
                  {c.signature && (
                    <span className="mt-0.5 truncate text-[12px] text-phone-muted">{c.signature}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
