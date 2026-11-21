import { VisionInspectionLinks } from './VisionInspectionLinks';
import { useState } from 'react';
import { MetaLine, Select, Spinner } from '../../design-system';
import { plural } from '../../../electron/plural.mjs';
import { FrozenComparisonImage } from '../visionLabels/FrozenComparisonImage';
import type { ComparisonImage } from '../../vision/training/inspection';
import type { TrainingTask } from '../../vision/training/types';
import type { useInspectionNavigation } from './useInspectionNavigation';
import type { useVisionInspection } from './useVisionInspection';

interface Props {
  selected: ComparisonImage | null;
  loaded: ReturnType<typeof useVisionInspection>['loaded'];
  task: TrainingTask;
  classId: number | null;
  actions?: ReturnType<typeof useInspectionNavigation>;
}

export function VisionInspectionDetail({ selected, loaded, task, classId, actions }: Props) {
  const [overlay, setOverlay] = useState<'candidate' | 'incumbent'>('candidate');

  return (
    <div className="flex flex-col gap-2 min-w-0">
      {selected && <MetaLine items={[selected.candidate.sample.frameSetId, selected.candidate.sample.source]} />}
      {selected && (
        <Select
          aria-label="Prediction overlay"
          value={overlay}
          options={[
            { value: 'candidate', label: 'Candidate' },
            { value: 'incumbent', label: 'Incumbent' },
          ]}
          onChange={(event) => setOverlay(event.target.value as typeof overlay)}
        />
      )}
      {selected && !loaded && <Spinner />}
      {loaded?.problem && <p role="status">{loaded.problem}</p>}
      {loaded?.image && (
        <FrozenComparisonImage image={loaded.image} overlay={overlay} classification={task.kind === 'classify'} />
      )}
      <VisionInspectionLinks selected={selected} loaded={loaded} actions={actions} />
      {selected &&
        selected[overlay].classes
          .filter((category) => classId === null || category.classId === classId)
          .map((category) => (
            <MetaLine
              key={category.classId}
              items={[
                task.classes.find((entry) => entry.id === category.classId)?.name,
                plural(category.falseNegative, 'miss', 'misses'),
                plural(category.falsePositive, 'false positive'),
                category.keypoints &&
                  `${category.keypoints.correct}/${plural(category.keypoints.visible, 'visible keypoint')}`,
              ]}
            />
          ))}
    </div>
  );
}
