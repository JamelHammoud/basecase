import { useRef, useState } from 'react';
import { placeMotionDesign } from '../motion/motionBuild';
import { designInWorker } from '../motion/motionDesignClient';
import { errorMessage } from '../utils/errorMessage';
import { clipOf } from '../utils/motionClip';
import type { PoseActions } from './usePoseActions';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useMotionDesign(core: WorkspaceCore, pose: PoseActions) {
  'use memo';

  const { docs, setSelectedIds, skeleton, tool } = core;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const requestRef = useRef(0);

  const close = () => {
    requestRef.current += 1;
    setBusy(false);
    setProblem(null);
    pose.closeMotion();
  };

  const design = async (heightMm: number) => {
    const motion = pose.motion;

    if (!motion) return;

    const request = ++requestRef.current;

    setBusy(true);
    setProblem(null);

    const result = await designInWorker({ clip: clipOf(motion), request: { heightMm } }).catch((err: unknown) => ({
      problem: errorMessage(err),
    }));

    if (request !== requestRef.current) return;

    setBusy(false);

    if (!('design' in result)) {
      setProblem(result.problem);

      return;
    }

    placeMotionDesign(result.design, motion.name, {
      parts: () => docs.partsRef.current,
      skeleton: () => docs.projectRef.current.skeleton,
      place: docs.commitSkeleton,
    });
    setSelectedIds([]);
    close();
    skeleton.setEditing(true);
    tool.setMode('pose');
  };

  return { busy, problem, close, design: (heightMm: number) => void design(heightMm) };
}

export type MotionDesignState = ReturnType<typeof useMotionDesign>;
