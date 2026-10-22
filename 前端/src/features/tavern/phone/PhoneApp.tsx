/**
 * 酒馆「小手机」模块 —— 入口编排
 *
 * 负责：导航切换（左侧导轨）/ 二级页面栈（推入、返回）+ 转场动效。
 * 只在酒馆页面内挂载，独立于 TavernPage 原有逻辑。
 *
 * 2026-10-22 重排：导航四项 = 信息 / 通讯录 / 发现 / 中枢（左侧竖排导轨，见 PhoneShell）。
 * 「卡片库（资产）」不再占导航位——降级为二级栈页，入口在导轨底部「角色卡」钮；
 * 「发起聊天」的选人流程同样改成栈页（原来靠切到卡片 Tab + pickMode，现在独立成页）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePhoneStore } from './phoneStore';
import { PhoneShell, tabTransition, type PhoneTab } from './PhoneShell';
import { ChatPage, GroupEditSheet, GroupInfoPage, GroupSetupPage, SessionsPage } from './ChatViews';
import { ContactsPage } from './ContactsPage';
import { DiscoverPage, PublishSheet } from './MomentsView';
import { CardsPage } from './CardsView';
import { DataCorePage } from './datacore/DataCorePage';
import { useThemeEngine } from './datacore/themeCore';

/** 二级页面栈条目 */
type StackEntry =
  | { name: 'chat'; sessionId: string }
  | { name: 'group-setup'; memberIds: string[] }
  | { name: 'group-info'; sessionId: string }
  /** 选人页（发起聊天：1 人私聊 / 2+ 建群） */
  | { name: 'picker' }
  /** 角色卡库（含配置台入口） */
  | { name: 'cards' };

const TAB_ORDER: PhoneTab[] = ['sessions', 'contacts', 'discover', 'core'];

/** 二级页面统一的进入 / 退出动效 */
const slide = {
  initial: { x: '100%' },
  animate: { x: 0 },
  exit: { x: '100%' },
  transition: { type: 'spring' as const, stiffness: 420, damping: 38, mass: 0.8 },
};

export function PhoneApp({
  className,
  onExit,
  onOpenConfig,
}: {
  className?: string;
  /** 退出小手机（导轨顶部的圆形返回键） */
  onExit?: () => void;
  /** 进入配置台（角色卡 / 世界书 / 人设卡）：入口在角色卡库页右上角 */
  onOpenConfig?: () => void;
}) {
  // 外观中枢：句柄在 App 层，保证切到任何 Tab 主题都持续生效
  useThemeEngine();

  const init = usePhoneStore((s) => s.init);
  const loaded = usePhoneStore((s) => s.loaded);
  const openSingleSession = usePhoneStore((s) => s.openSingleSession);
  const contacts = usePhoneStore((s) => s.contacts);
  const sessions = usePhoneStore((s) => s.sessions);

  const [tab, setTab] = useState<PhoneTab>('sessions');
  const [stack, setStack] = useState<StackEntry[]>([]);
  /** 选人页勾选的联系人 id（提升到编排层，供建群向导读取） */
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [groupEditId, setGroupEditId] = useState<string | null>(null);

  const dirRef = useRef<1 | -1>(1);

  useEffect(() => {
    void init();
  }, [init]);

  const changeTab = useCallback(
    (next: PhoneTab) => {
      dirRef.current = TAB_ORDER.indexOf(next) >= TAB_ORDER.indexOf(tab) ? 1 : -1;
      setTab(next);
      setStack([]);
      setCheckedIds([]);
      setPublishing(false);
    },
    [tab],
  );

  const push = useCallback((entry: StackEntry) => setStack((s) => [...s, entry]), []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);

  const openChat = useCallback((sessionId: string) => push({ name: 'chat', sessionId }), [push]);

  const openContactChat = useCallback(
    (contactId: string) => {
      const contact = contacts.find((c) => c.id === contactId);
      if (!contact) return;
      const id = openSingleSession(contact);
      push({ name: 'chat', sessionId: id });
    },
    [contacts, openSingleSession, push],
  );

  /** 发起聊天：进选人页（导轨底部「发起聊天」/ 信息页右上角 + 都走这里） */
  const startComposeFlow = useCallback(() => {
    setCheckedIds([]);
    push({ name: 'picker' });
  }, [push]);

  /** 选人页「完成」：勾选 1 人 → 私聊（选人页原地变聊天）；≥2 人 → 建群向导 */
  const finishCompose = useCallback(() => {
    if (checkedIds.length >= 2) {
      setStack((s) => [...s, { name: 'group-setup', memberIds: checkedIds }]);
      setCheckedIds([]);
    } else if (checkedIds.length === 1) {
      const contact = contacts.find((c) => c.id === checkedIds[0]);
      setCheckedIds([]);
      if (contact) {
        const id = openSingleSession(contact);
        // 选人页原地换成聊天页，不留一层空壳
        setStack((s) => [...s.slice(0, -1), { name: 'chat', sessionId: id }]);
      } else {
        setStack((s) => s.slice(0, -1));
      }
    } else {
      setStack((s) => s.slice(0, -1));
    }
  }, [checkedIds, contacts, openSingleSession]);

  const badges = useMemo(
    () => ({ sessions: sessions.reduce((n, s) => n + (s.unread > 0 ? 1 : 0), 0) }),
    [sessions],
  );

  const top = stack[stack.length - 1];

  const mainPage = (() => {
    if (tab === 'sessions') {
      return <SessionsPage onOpen={openChat} onCompose={startComposeFlow} />;
    }
    if (tab === 'contacts') return <ContactsPage onOpen={openContactChat} />;
    if (tab === 'discover') return <DiscoverPage onPublish={() => setPublishing(true)} />;
    return <DataCorePage />;
  })();

  return (
    <PhoneShell
      tab={tab}
      onTabChange={changeTab}
      badges={badges}
      className={className}
      onExit={onExit}
      onCompose={startComposeFlow}
      onOpenCards={() => push({ name: 'cards' })}
    >
      {/* Tab 主页面（左右轻移 + 淡入） */}
      <AnimatePresence mode="wait" initial={false}>
        {stack.length === 0 && !publishing && (
          <motion.div key={tab} className="absolute inset-0" {...tabTransition(dirRef.current)}>
            {mainPage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 二级页面（右侧滑入） */}
      <AnimatePresence initial={false}>
        {top?.name === 'chat' && (
          <motion.div key={`chat-${top.sessionId}`} className="absolute inset-0 z-20 bg-phone-bg" {...slide}>
            <ChatPage
              sessionId={top.sessionId}
              onBack={pop}
              onOpenInfo={() => push({ name: 'group-info', sessionId: top.sessionId })}
            />
          </motion.div>
        )}

        {top?.name === 'picker' && (
          <motion.div key="picker" className="absolute inset-0 z-20 bg-phone-bg" {...slide}>
            <CardsPage
              pickMode
              checkedIds={checkedIds}
              onCheckedChange={setCheckedIds}
              onTogglePick={finishCompose}
              onBack={pop}
            />
          </motion.div>
        )}

        {top?.name === 'cards' && (
          <motion.div key="cards" className="absolute inset-0 z-20 bg-phone-bg" {...slide}>
            <CardsPage
              onCreateChat={openContactChat}
              onOpenConfig={onOpenConfig}
              onTogglePick={() => {
                setCheckedIds([]);
                push({ name: 'picker' });
              }}
              onBack={pop}
            />
          </motion.div>
        )}

        {top?.name === 'group-setup' && (
          <motion.div key="group-setup" className="absolute inset-0 z-20 bg-phone-bg" {...slide}>
            <GroupSetupPage
              initialMemberIds={top.memberIds}
              onBack={pop}
              onCreated={(sessionId) => {
                setStack([{ name: 'chat', sessionId }]);
                setTab('sessions');
              }}
            />
          </motion.div>
        )}

        {top?.name === 'group-info' && (
          <motion.div key="group-info" className="absolute inset-0 z-30 bg-phone-bg" {...slide}>
            <GroupInfoPage sessionId={top.sessionId} onBack={pop} onEdit={() => setGroupEditId(top.sessionId)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 发表动态（从底部升起） */}
      <AnimatePresence>
        {publishing && (
          <motion.div
            key="publish"
            className="absolute inset-0 z-40 bg-phone-bg"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <PublishSheet onClose={() => setPublishing(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 编辑群聊浮层 */}
      <AnimatePresence>
        {groupEditId && (
          <GroupEditSheet key="group-edit" sessionId={groupEditId} onClose={() => setGroupEditId(null)} />
        )}
      </AnimatePresence>

      {/* 首次加载遮罩 */}
      {!loaded && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-phone-bg">
          <div className="flex flex-col items-center gap-2 text-[13px] text-phone-muted">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-phone-sep border-t-phone-blue" />
            正在打开小手机…
          </div>
        </div>
      )}
    </PhoneShell>
  );
}
