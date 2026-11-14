import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import { basePathOf } from '../cases/mat/realTry';
import { isGenerated, isReal, passedTry, type TryRecord } from '../cases/tries';
import { loadRecording } from '../cases/tryStore';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import type { Simulation } from '../sim/useSimulation';
import type { Rig } from '../utils/kinematics';

interface RealReplayOptions {
  sim: Simulation;
  rig: Rig;
  tries: TryRecord[];
  viewportRef: RefObject<Viewport3DHandle | null>;
}

export interface RealReplay {
  shown: string | null;
  show: (record: TryRecord) => Promise<void>;
  close: () => void;
}

const bestSimTry = (tries: TryRecord[]) =>
  tries
    .filter((t) => passedTry(t) && !isReal(t) && !isGenerated(t))
    .reduce<TryRecord | null>((best, t) => (!best || t.outcome.margin > best.outcome.margin ? t : best), null);

function pathOf(recording: Recording | null | undefined, scene: { model: SimModel; rig: Rig }) {
  if (!recording || recording.nbody !== scene.model.bodies.length) return [];

  return basePathOf(recording, scene);
}

export function useRealReplay({ sim, rig, tries, viewportRef }: RealReplayOptions): RealReplay {
  const [shown, setShown] = useState<string | null>(null);
  const ticket = useRef(0);

  const close = () => {
    ticket.current++;
    setShown(null);
    viewportRef.current?.setMatTrack(null);
  };

  const show = async (record: TryRecord) => {
    const mine = ++ticket.current;
    const best = bestSimTry(tries);
    const model = sim.modelNow() ?? (await sim.buildModel());
    const [real, simmed] = await Promise.all([loadRecording(record.id), best && loadRecording(best.id)]);

    if (mine !== ticket.current) return;

    viewportRef.current?.setMatTrack({
      marker: null,
      real: pathOf(real, { model, rig }),
      sim: pathOf(simmed, { model, rig }),
    });
    setShown(record.id);
  };

  const gone = !!shown && !tries.some((t) => t.id === shown);
  const closeFromEffect = useEffectEvent(close);

  useEffect(() => {
    if (!gone) return;

    const soon = setTimeout(closeFromEffect, 0);

    return () => clearTimeout(soon);
  }, [gone]);

  useEffect(() => {
    if (!shown) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeFromEffect();
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [shown]);

  return { shown, show, close };
}
