import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { HomePage } from '@/features/home/HomePage';
import { ChatPage } from '@/features/chat/ChatPage';
import { StarrySkyPage } from '@/features/sky/StarrySkyPage';
import { CookbookPage } from '@/features/sky/CookbookPage';
import { DessertHousePage } from '@/features/sky/DessertHousePage';
import { ListenPage } from '@/features/sky/ListenPage';
import { ReadPage } from '@/features/sky/ReadPage';
import { LibraryPage } from '@/features/sky/LibraryPage';
import { BookReaderPage } from '@/features/sky/BookReaderPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { DiaryPage } from '@/features/diary/DiaryPage';
import { MemorialPage } from '@/features/memorial/MemorialPage';
import { NotesPage } from '@/features/notes/NotesPage';
import { SchedulePage } from '@/features/schedule/SchedulePage';

/**
 * 路由表：底部 4 个 Tab = 首页 / 聊天 / 星空 / 我。
 * 星空是「一起听」黑胶唱片 +「一起读」书架的组合主页，食谱 / 甜品小屋收成小入口。
 * 其余（日记本 / 纪念日 / 蓝莓信箱）作为详情子页，从首页进入，不进底部导航。
 * MCP / 世界书 / 编程 / 同步 / 记忆 已并入聊天抽屉或「我」页。
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'chat', element: <ChatPage /> },
      { path: 'sky', element: <StarrySkyPage /> },
      // 星空里的功能星（非 Tab）
      { path: 'cookbook', element: <CookbookPage /> },
      { path: 'dessert', element: <DessertHousePage /> },
      { path: 'listen', element: <ListenPage /> },
      { path: 'read', element: <ReadPage /> },
      { path: 'library', element: <LibraryPage /> },
      { path: 'read/:id', element: <BookReaderPage /> },
      { path: 'settings', element: <SettingsPage /> },
      // 详情子页（非 Tab）
      { path: 'diary', element: <DiaryPage /> },
      { path: 'memorial', element: <MemorialPage /> },
      { path: 'notes', element: <NotesPage /> },
      { path: 'schedule', element: <SchedulePage /> },
      // 兜底：未知路径（含已移除的旧路由）回到首页，避免客户端 404
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
