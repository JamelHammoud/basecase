import { useEffect, useRef, useState } from 'react';
import type { Dataset } from '../../datasets/datasetFile';
import { errorMessage } from '../../utils/errorMessage';
import { IS_WEB_DEMO } from '../../utils/platform/webDemo';
import type { ShowToast } from '../../workspace/types';
import { applyVisionRun, loadVisionRuns, trainVisionDataset } from './service';
import type { TrainingRun } from './serviceTypes';
import type { TrainingKind } from './types';

interface VisionTrainingOptions {
  datasetId: string | null;
  showToast: ShowToast;
}

export function useVisionTraining({ datasetId, showToast }: VisionTrainingOptions) {
  const [task, setTask] = useState<TrainingKind>('detect');
  const [maxInferenceMs, setMaxInferenceMs] = useState(100);
  const [maxModelBytes, setMaxModelBytes] = useState(256 * 1024 * 1024);
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [training, setTraining] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const active = useRef<AbortController | null>(null);
  const failed = (error: unknown) => showToast(errorMessage(error), { tone: 'error' });

  useEffect(() => {
    let live = true;

    if (datasetId)
      loadVisionRuns(datasetId).then(
        (loaded) => {
          if (!live) return;

          const ids = new Set(loaded.map((run) => run.id));

          setRuns((previous) => [...loaded, ...previous.filter((run) => !ids.has(run.id))]);
        },
        () => {},
      );

    return () => {
      live = false;
    };
  }, [datasetId]);
  useEffect(() => () => active.current?.abort(), []);

  const train = (dataset: Dataset) => {
    if (active.current || IS_WEB_DEMO) return;

    const controller = new AbortController();

    active.current = controller;
    setTraining(dataset.id);
    setProgress('Preparing images');
    trainVisionDataset(dataset, task, {
      signal: controller.signal,
      limits: { maxInferenceMs, maxModelBytes },
      onProgress: setProgress,
    })
      .then(
        (run) => {
          if (controller.signal.aborted) return;

          setRuns((previous) => [...previous.filter((entry) => entry.id !== run.id), run]);
        },
        (error: unknown) => {
          if (!controller.signal.aborted) failed(error);
        },
      )
      .finally(() => {
        if (active.current !== controller) return;

        active.current = null;
        setTraining(null);
        setProgress('');
      });
  };

  return {
    canTrain: !IS_WEB_DEMO,
    task,
    setTask,
    maxInferenceMs,
    setMaxInferenceMs,
    maxModelBytes,
    setMaxModelBytes,
    runs: runs.filter((run) => run.datasetId === datasetId),
    busy: training !== null,
    datasetId: training,
    progress,
    train,
    stop: () => {
      active.current?.abort();
      setProgress('Stopping training');
    },
    apply: (run: TrainingRun, target: { scene: string; camera: string; node: string }) => {
      applyVisionRun(run, target).then(() => showToast('Applied model'), failed);
    },
  };
}

export type VisionTraining = ReturnType<typeof useVisionTraining>;
