/**
 * 统一的「返回上一级」语义（2026-11-23 用户定：所有页面退出回上一级，不再一律回 chat）。
 *
 * react-router v6 里 location.key 为 'default' 表示这是会话里第一条历史（深链直接打开），
 * 此时 navigate(-1) 会毫无反应甚至退回站外，所以回退到 /chat 兜底。
 *
 * 用法：在组件里 `const back = useBack();` 然后 `onClick={back}`。
 */
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function useBack(): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    // 有上一条应用内历史就退回去；深链直达（首条历史）才回聊天
    if (location.key && location.key !== 'default') navigate(-1);
    else navigate('/chat');
  }, [navigate, location.key]);
}
