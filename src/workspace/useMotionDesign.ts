import { useRef, useState } from 'react';
import { placeMotion } from '../fromMotion/motionBuild';
import { fitMotionInWorker } from '../fromMotion/motionFitClient';
import { errorMessage } from '../utils/errorMessage';
import { parseBvh, type Mocap } from '../utils/mocap';
import { pickFiles } from '../utils/pickFiles';
import type { WorkspaceCore } from './useWorkspaceCore';

export interface MotionClip {
  mocap: Mocap;
  text: string;
}

export async function readBvhFile(file: File, showToast: WorkspaceCore['showToast']): Promise<MotionClip | null> {
  const text = await file.text();

  try {
    return { mocap: parseBvh(text, file.name.replace(/\.bvh$/i, '')), text };
  } catch (err) {
    showToast(`Couldn’t read ${file.name}. ${errorMessage(err)}`, { tone: 'error' });

    return null;
  }
}

export function useMotionDesign(core: WorkspaceCore) {
  'use memo';

  const { docs, setSelectedIds, skeleton, tool, showToast } = core;
  const [clip, setClip] = useState<MotionClip | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const requestRef = useRef(0);

  const close = () => {
    requestRef.current += 1;
    setClip(null);
    setProblem(null);
    setBusy(false);
  };

  const openFile = async (file: File) => {
    const read = await readBvhFile(file, showToast);

    if (!read) return;

    requestRef.current += 1;
    setProblem(null);
    setBusy(false);
    setClip(read);
  };

  const design = async (heightMm: number) => {
    if (!clip) return;

    const request = ++requestRef.current;
    const name = clip.mocap.name;

    setBusy(true);

    const result = await fitMotionInWorker({ text: clip.text, name, heightMm }).catch((err: unknown) => ({
      problem: errorMessage(err),
    }));

    if (request !== requestRef.current) return;

    setBusy(false);

    if (!('fit' in result)) {
      setProblem(result.problem);

      return;
    }

    placeMotion(result.fit, name, {
      parts: () => docs.partsRef.current,
      skeleton: () => docs.projectRef.current.skeleton,
      place: docs.commitSkeleton,
    });
    setSelectedIds([]);
    close();
    skeleton.setEditing(true);
    tool.setMode('pose');
  };

  return {
    motion: clip?.mocap ?? null,
    busy,
    problem,
    close,
    openFile: (file: File) => void openFile(file),
    pick: async () => {
      const [file] = await pickFiles('.bvh');

      if (file) await openFile(file);
    },
    design: (heightMm: number) => void design(heightMm),
  };
}

export type MotionDesign = ReturnType<typeof useMotionDesign>;
