import { useEffect, useState } from 'react';
import type { CalibrationHistory } from '../../reality/history';
import { jointReplay, replayKey, type JointReplay } from '../../reality/jointReplay';

interface Settled {
  key: string;
  replay: JointReplay | null;
}

export function useJointReplay(history: CalibrationHistory, version: number | null): JointReplay | null | undefined {
  const key = replayKey(history, version);
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!key) return;

    let live = true;
    const settle = (replay: JointReplay | null) => live && setSettled({ key, replay });

    jointReplay(history, version).then(settle, () => settle(null));

    return () => {
      live = false;
    };
  }, [key, history, version]);

  if (!key) return null;

  return settled?.key === key ? settled.replay : undefined;
}
