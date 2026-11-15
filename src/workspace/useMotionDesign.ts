import { useRef, useState } from 'react';
import { motionBuild } from '../motion/motionBuild';
import { designMotionInWorker } from '../motion/motionSkeletonClient';
import { errorMessage } from '../utils/errorMessage';
import type { WorkspaceCore } from './useWorkspaceCore';

interface MotionSource {
  text: string;
  name: string;
}

export function useMotionDesign({ docs, setSelectedIds, skeleton, tool }: WorkspaceCore) {
  const [source, setSource] = useState<MotionSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const requestRef = useRef(0);

  const close = () => {
    requestRef.current += 1;
    setSource(null);
    setProblem(null);
    setBusy(false);
  };

  const design = async (heightMm: number) => {
    if (!source || busy) return;

    const request = ++requestRef.current;

    setBusy(true);
    setProblem(null);

    const result = await designMotionInWorker({ ...source, heightMm, toleranceMm: 2 }).catch((err: unknown) => ({
      problem: errorMessage(err),
    }));

    if (request !== requestRef.current) return;

    setBusy(false);

    if ('problem' in result) {
      setProblem(result.problem);

      return;
    }

    try {
      const parts = docs.partsRef.current;
      const built = motionBuild(
        result.skeleton,
        new Set(parts.map((part) => part.id)),
        docs.projectRef.current.skeleton,
      );

      docs.commitSkeleton([...parts, ...built.parts], built.skeleton);
    } catch (err) {
      setProblem(errorMessage(err));

      return;
    }

    setSelectedIds([]);
    close();
    skeleton.setEditing(true);
    tool.setMode('pose');
  };

  return {
    source,
    busy,
    problem,
    close,
    open: (next: MotionSource) => {
      requestRef.current += 1;
      setSource(next);
      setBusy(false);
      setProblem(null);
    },
    design: (heightMm: number) => void design(heightMm),
  };
}
