import type { Dataset } from '../../datasets/datasetFile';
import { DatasetVisionRequirements } from './DatasetVisionRequirements';
import { FieldRow, NumberInput, Select } from '../../design-system';
import { VISION_TASK_OPTIONS, type TrainingTask, type VisionTrainingView } from './visionTrainingView';

export function DatasetVisionFields({ vision, dataset }: { vision: VisionTrainingView; dataset: Dataset }) {
  return (
    <div className="flex flex-col gap-2">
      <Select
        aria-label="Vision task"
        value={vision.task}
        options={VISION_TASK_OPTIONS}
        disabled={vision.running}
        onChange={(event) => vision.setTask(event.target.value as TrainingTask)}
      />
      <FieldRow label="Latency limit">
        <NumberInput
          aria-label="Latency limit"
          value={vision.maxInferenceMs}
          min={1}
          max={60000}
          unit="ms"
          disabled={vision.running}
          onChange={vision.setMaxInferenceMs}
        />
      </FieldRow>
      <FieldRow label="Size limit">
        <NumberInput
          aria-label="Size limit"
          value={vision.maxModelBytes / 1048576}
          min={1}
          max={256}
          unit="MB"
          disabled={vision.running}
          onChange={(value) => vision.setMaxModelBytes(Math.round(value * 1048576))}
        />
      </FieldRow>
      <DatasetVisionRequirements key={dataset.id} dataset={dataset} vision={vision} />
    </div>
  );
}
