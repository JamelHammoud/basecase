import { useEffect, useRef, useState } from 'react';
import type { InspectionNavigation } from '../../workspace/visionInspectionNavigation';
import type { FrozenImageSample } from '../../datasets/snapshotImages';
import type { ImageClass, TrainingFrame } from '../../vision/frameSet';

export function useInspectionNavigation(input: { navigation?: InspectionNavigation; onClose: () => void }) {
  const ticket = useRef(0);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      ticket.current++;
    },
    [],
  );

  const open = async (
    action: 'original' | 'source',
    value: FrozenImageSample | TrainingFrame,
    classes?: ImageClass[],
  ) => {
    const version = ++ticket.current;
    const current = () => version === ticket.current;

    setBusy(true);
    setProblem('');

    try {
      if (action === 'original') await input.navigation?.original(value as FrozenImageSample, current, classes);
      else await input.navigation?.source(value as TrainingFrame, current);

      if (current()) input.onClose();
    } catch {
      if (current()) setProblem(action === 'original' ? 'Original image is unavailable' : 'Source try is unavailable');
    } finally {
      if (current()) setBusy(false);
    }
  };

  return { problem, busy, open };
}
