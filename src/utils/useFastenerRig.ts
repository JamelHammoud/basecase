import { useEffect, useMemo, useState, type RefObject } from 'react';
import { knownClamps, rememberClamps } from '../assembly/clampCache';
import { clampsOf, withFastenerFollowers, type Clamps } from '../assembly/followers';
import { needsClamps } from '../assembly/rigJoints';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { buildRig, resolveJoints, type Rig } from './kinematics';

const TRACE_DELAY_MS = 700;

interface Traced {
  parts: ScenePart[];
  clamps: Clamps;
}

export function useFastenerRig(
  joints: RobotJoint[] | undefined,
  parts: ScenePart[],
  viewportRef: RefObject<Viewport3DHandle | null>,
): Rig {
  const [traced, setTraced] = useState<Traced | null>(null);
  const rig = useMemo(() => {
    const clamps = traced?.parts === parts ? traced.clamps : knownClamps(parts);

    return buildRig(withFastenerFollowers(resolveJoints(joints ?? [], parts), clamps), parts);
  }, [joints, parts, traced]);

  useEffect(() => {
    if (!needsClamps(joints, parts)) return;

    let live = true;
    const timer = setTimeout(() => {
      viewportRef.current
        ?.fastenerChains()
        .then((chains) => {
          const clamps = clampsOf(chains);

          rememberClamps(parts, clamps);

          if (live) setTraced({ parts, clamps });
        })
        .catch(() => {});
    }, TRACE_DELAY_MS);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [joints, parts, viewportRef]);

  return rig;
}
