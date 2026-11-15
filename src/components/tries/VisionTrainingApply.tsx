import { useState } from 'react';
import { Button, Select } from '../../design-system';
import type { VisionTrainingView } from './visionTrainingView';

interface VisionTrainingApplyProps {
  runId: string;
  targets: VisionTrainingView['targets'];
  onApply: VisionTrainingView['apply'];
}

export function VisionTrainingApply({ runId, targets, onApply }: VisionTrainingApplyProps) {
  const [selected, setSelected] = useState('');
  const target = targets.some((item) => item.id === selected) ? selected : (targets[0]?.id ?? '');

  if (!targets.length) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <Select
        aria-label="Apply model to"
        value={target}
        options={targets.map(({ id, name }) => ({ value: id, label: name }))}
        onChange={(event) => setSelected(event.target.value)}
      />
      <Button size="sm" onClick={() => onApply(runId, target)}>
        Apply Model
      </Button>
    </div>
  );
}
