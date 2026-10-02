import { useEffect, useState } from 'react';
import { listProfiles } from '@/lib/api/profiles';
import { fetchState, type StateSnapshot } from '@/lib/api/state';
import { CharacterCard } from './CharacterCard';

/** 状态监视器：单卡展示「对方」（心潮 AI）的实时状态，15s 刷新。 */
export function StateMonitor() {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [persona, setPersona] = useState<{ name: string; emoji: string }>({ name: '对方', emoji: '🐺' });

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        const s = await fetchState();
        if (alive) setSnapshot(s);
      } catch {
        /* 忽略，保持上次状态 */
      }
    };

    listProfiles()
      .then((ps) => {
        if (!alive) return;
        const partner = ps.find((p) => !p.isMe);
        if (partner) {
          setPersona({ name: partner.nickname ?? '对方', emoji: partner.emoji ?? '🐺' });
        }
      })
      .catch(() => {});

    void tick();
    const timer = setInterval(() => void tick(), 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <section className="rounded-xl border bg-card/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">对方状态</h3>
        <span className="text-[10px] text-muted-foreground">心潮 · 15s</span>
      </div>
      <CharacterCard name={persona.name} avatar={persona.emoji} snapshot={snapshot} />
    </section>
  );
}
