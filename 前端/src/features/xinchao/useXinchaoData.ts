/**
 * 心潮数据 hook（2026-10-20）：内心摘要页与独立 `/xinchao` 页共用。
 * 一次拉 status/now/state + dashboard 四页（snapshot/timeline/cabin/personality）。
 */
import { useCallback, useEffect, useState } from 'react';
import {
  getXinchaoDashboard,
  getXinchaoNow,
  getXinchaoState,
  getXinchaoStatus,
  type XinchaoCabin,
  type XinchaoNow,
  type XinchaoPersonality,
  type XinchaoSnapshot,
  type XinchaoState,
  type XinchaoStatus,
  type XinchaoTimeline,
} from '@/lib/api/xinchao';

export interface XinchaoData {
  status: XinchaoStatus | null;
  now: XinchaoNow | null;
  state: XinchaoState | null;
  snap: XinchaoSnapshot | null;
  timeline: XinchaoTimeline | null;
  cabin: XinchaoCabin | null;
  persona: XinchaoPersonality | null;
  loading: boolean;
  err: string;
  reload: () => Promise<void>;
}

export function useXinchaoData(): XinchaoData {
  const [status, setStatus] = useState<XinchaoStatus | null>(null);
  const [now, setNow] = useState<XinchaoNow | null>(null);
  const [state, setState] = useState<XinchaoState | null>(null);
  const [snap, setSnap] = useState<XinchaoSnapshot | null>(null);
  const [timeline, setTimeline] = useState<XinchaoTimeline | null>(null);
  const [cabin, setCabin] = useState<XinchaoCabin | null>(null);
  const [persona, setPersona] = useState<XinchaoPersonality | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const s = await getXinchaoStatus();
      setStatus(s);
      if (!s.up) {
        setNow(null);
        setState(null);
        setSnap(null);
        setTimeline(null);
        setCabin(null);
        setPersona(null);
        return;
      }
      const [n, st, sn, tl, cb, ps] = await Promise.allSettled([
        getXinchaoNow(),
        getXinchaoState(),
        getXinchaoDashboard<XinchaoSnapshot>('snapshot'),
        getXinchaoDashboard<XinchaoTimeline>('timeline', 'limit=40'),
        getXinchaoDashboard<XinchaoCabin>('cabin'),
        getXinchaoDashboard<XinchaoPersonality>('personality'),
      ]);
      setNow(n.status === 'fulfilled' ? n.value : null);
      setState(st.status === 'fulfilled' ? st.value : null);
      setSnap(sn.status === 'fulfilled' ? sn.value : null);
      setTimeline(tl.status === 'fulfilled' ? tl.value : null);
      setCabin(cb.status === 'fulfilled' ? cb.value : null);
      setPersona(ps.status === 'fulfilled' ? ps.value : null);
    } catch (e) {
      setErr((e as Error).message || '读取心潮失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { status, now, state, snap, timeline, cabin, persona, loading, err, reload };
}
