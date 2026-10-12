/**
 * 酒馆「小手机」模块 —— 入口编排
 *
 * 负责：Tab 切换（底部导航）/ 二级页面栈（推入、返回）+ 转场动效。
 * 只在酒馆页面内挂载，独立于 TavernPage 原有逻辑。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePhoneStore } from './phoneStore';
import { PhoneShell, tabTransition, type PhoneTab } from './PhoneShell';
import {
  ChatPage,
  ContactsPage,
  GroupEditSheet,
  GroupInfoPage,
  GroupSetupPage,
  SessionsPage,
} from './ChatViews';
import { DiscoverPage, PublishSheet } from './MomentsView';
import { CardsPage } from './CardsView';
import { DataCorePage } from './datacore/DataCorePage';
import { useThemeEngine } from './datacore/themeCore';

/** 二级页面栈条目 */
type StackEntry =
  | { name: 'chat'; sessionId: string }
  | { name: 'group-setup'; memberIds: string[] }
  | { name: 'group-info'; sessionId: string };

const TAB_ORDER: PhoneTab[] = ['sessions', 'contacts', 'discover', 'cards', 'core'];

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
  /** 退出小手机（顶部唯一的退出键） */
  onExit?: () => void;
  /** 进入配置台（角色卡 / 世界书 / 人设卡）：随外层标题栏一起收进卡片库里了 */
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
  const [buildMode, setBuildMode] = useState(false);
  /** 建群模式下通讯录勾选的成员（提升到编排层，供向导读取） */
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
      setBuildMode(false);
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

  /** 从会话列表发起群聊：切到通讯录并进入建群模式 */
  const startGroupFlow = useCallback(() => {
    setBuildMode(true);
    setCheckedIds([]);
    setTab('contacts');
    setStack([]);
    dirRef.current = 1;
  }, []);

  /** 通讯录「完成」：勾选 ≥2 人则进入建群向导 */
  const finishGroupPick = useCallback(() => {
    if (checkedIds.length >= 2) {
      push({ name: 'group-setup', memberIds: checkedIds });
      setBuildMode(false);
    } else {
      setBuildMode(false);
      setCheckedIds([]);
    }
  }, [checkedIds, push]);

  const badges = useMemo(
    () => ({ sessions: sessions.reduce((n, s) => n + (s.unread > 0 ? 1 : 0), 0) }),
    [sessions],
  );

  const top = stack[stack.length - 1];

  const mainPage = (() => {
    if (tab === 'sessions') {
      return <SessionsPage onOpen={openChat} onCreateGroup={startGroupFlow} />;
    }
    if (tab === 'contacts') {
      return (
        <ContactsPage
          onOpenChat={openContactChat}
          buildMode={buildMode}
          checkedIds={checkedIds}
          onCheckedChange={setCheckedIds}
          onToggleBuild={() => (buildMode ? finishGroupPick() : (setBuildMode(true), setCheckedIds([])))}
        />
      );
    }
    if (tab === 'discover') return <DiscoverPage onPublish={() => setPublishing(true)} />;
    if (tab === 'core') return <DataCorePage />;
    return <CardsPage onCreateChat={openContactChat} onOpenConfig={onOpenConfig} />;
  })();

  return (
    <PhoneShell
      tab={tab}
      onTabChange={changeTab}
      showTabBar={stack.length === 0 && !publishing}
      badges={badges}
      className={className}
      onExit={onExit}
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
          <motion.div key={`chat-${top.sessionId}`} className="absolute inset-0 z-20 bg-white" {...slide}>
            <ChatPage
              sessionId={top.sessionId}
              onBack={pop}
              onOpenInfo={() => push({ name: 'group-info', sessionId: top.sessionId })}
            />
          </motion.div>
        )}

        {top?.name === 'group-setup' && (
          <motion.div key="group-setup" className="absolute inset-0 z-20 bg-white" {...slide}>
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
          <motion.div key="group-info" className="absolute inset-0 z-30 bg-white" {...slide}>
            <GroupInfoPage sessionId={top.sessionId} onBack={pop} onEdit={() => setGroupEditId(top.sessionId)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 发表动态（从底部升起） */}
      <AnimatePresence>
        {publishing && (
          <motion.div
            key="publish"
            className="absolute inset-0 z-40 bg-white"
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
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#F2F2F7]">
          <div className="flex flex-col items-center gap-2 text-[13px] text-[#8e8e93]">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#C7C7CC] border-t-[#007AFF]" />
            正在打开小手机…
          </div>
        </div>
      )}
    </PhoneShell>
  );
}
