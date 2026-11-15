import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { StoredTry } from '../cases/tryFile';
import { loadFrameSet } from '../vision/frameSetStore';
import type { FrameSet } from '../vision/frameSet';
import { extractTryFrames } from '../vision/tryFramesClient';
import type { TryFrameProgress, TryFrameScene, TryFrameSelection, TryFrameSource } from '../vision/tryFramesTypes';
import { errorMessage } from '../utils/errorMessage';
import { frameSourceCameras, loadFrameLabelSources } from './frameLabelSources';
import { saveLabelEdits, saveLabelFrames } from './frameLabelStorage';
import type { ShowToast } from './types';
import { FrameLabelRequests } from './frameLabelRequests';

interface FrameLabelsOptions {
  sceneFor: (stored: StoredTry) => Promise<TryFrameScene>;
  showDataset: (id: string) => void;
  showToast: ShowToast;
}

export interface AddFrameSources {
  sources: TryFrameSource[];
  cameras: string[];
  frame: number;
}

export function useFrameLabels({ sceneFor, showDataset, showToast }: FrameLabelsOptions) {
  const [adding, setAdding] = useState<AddFrameSources | null>(null);
  const [editing, setEditing] = useState<{ set: FrameSet; frameId?: string; revision?: number } | null>(null);
  const [running, setRunning] = useState<TryFrameProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState('');
  const queue = useRef(Promise.resolve());
  const requests = useRef(new FrameLabelRequests());
  const failed = (error: unknown) => showToast(errorMessage(error), { tone: 'error' });
  const refreshFailed = useEffectEvent(failed);
  const refreshed = useEffectEvent(async (id: string) => {
    if (editing?.set.id !== id) return;

    const set = await requests.current.read(queue.current, () => loadFrameSet(id));

    if (set)
      setEditing((previous) =>
        previous?.set.id === id ? { ...previous, set, revision: (previous.revision ?? 0) + 1 } : previous,
      );
  });

  useEffect(() => {
    const changed = (event: Event) => {
      const id: unknown = (event as CustomEvent<{ id?: unknown }>).detail?.id;

      if (typeof id === 'string') void refreshed(id).catch(refreshFailed);
    };

    window.addEventListener('frame-set-labels-updated', changed);

    return () => window.removeEventListener('frame-set-labels-updated', changed);
  }, []);

  const start = async (ids: string[], frame = 0) => {
    if (!ids.length || running || loading) return;

    requests.current.invalidate();

    const valid = requests.current.capture();

    setLoading(true);
    setProblem('');

    try {
      const sources = await loadFrameLabelSources(ids, sceneFor);
      const cameras = await frameSourceCameras(sources);

      if (!cameras.length) throw new Error('Choose tries with a shared camera.');

      if (valid()) setAdding({ sources, cameras, frame });
    } catch (error) {
      failed(error);
    } finally {
      setLoading(false);
    }
  };

  const extract = async (selection: TryFrameSelection, cameras: string[]) => {
    if (!adding || running) return;

    setRunning({ done: 0, total: 0 });
    setProblem('');

    try {
      const set = await extractTryFrames(
        { name: `${adding.sources[0].stored.robot.name} frames`, tries: adding.sources, selection, cameras },
        setRunning,
      );
      const dataset = await saveLabelFrames(set);

      setAdding(null);
      showDataset(dataset.id);
      setEditing({ set });
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setRunning(null);
    }
  };

  return {
    adding,
    editing,
    loading,
    running,
    problem,
    start: (ids: string[], frame?: number) => void start(ids, frame),
    extract: (selection: TryFrameSelection, cameras: string[]) => void extract(selection, cameras),
    cancel: () => {
      if (running) return;

      requests.current.invalidate();
      setAdding(null);
    },
    close: () => {
      requests.current.invalidate();
      setEditing(null);
    },
    open: (id: string, frameId?: string) => {
      requests.current.invalidate();

      void requests.current
        .read(queue.current, () => loadFrameSet(id))
        .then((set) => {
          if (set === undefined) return;

          if (!set) throw new Error('The saved frames could not be opened.');

          setEditing({ set, frameId });
        })
        .catch(failed);
    },
    change: (set: FrameSet, previous: FrameSet) => {
      requests.current.invalidate();

      const valid = requests.current.capture();

      setEditing((current) => (current?.set.id === set.id ? { ...current, set } : current));
      queue.current = queue.current
        .then(async () => {
          const saved = await saveLabelEdits(previous, set);

          if (valid() && saved !== set)
            setEditing((current) =>
              current?.set.id === set.id ? { ...current, set: saved, revision: (current.revision ?? 0) + 1 } : current,
            );
        })
        .catch(failed);
    },
  };
}

export type FrameLabels = ReturnType<typeof useFrameLabels>;
