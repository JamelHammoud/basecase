import { Button } from '../../design-system';
import { confirmAction } from '../../design-system/confirmStore';
import type { Dataset } from '../../datasets/datasetFile';
import { defaultTrainingMetric } from '../../vision/training/metrics';
import { MAX_REQUIREMENTS } from '../../vision/training/requirements';
import type { VisionTrainingView } from './visionTrainingView';
import { useRequirementChoices } from './useRequirementChoices';
import { VisionRequirementFields } from './VisionRequirementFields';

export function DatasetVisionRequirements({ dataset, vision }: { dataset: Dataset; vision: VisionTrainingView }) {
  const choices = useRequirementChoices(dataset);
  const requirements = vision.requirements ?? [];
  const change = vision.setRequirements;

  if (!change || !choices) return null;

  return (
    <section className="flex flex-col gap-2" data-testid="vision-requirements">
      {requirements.map((requirement, index) => (
        <VisionRequirementFields
          key={index}
          requirement={requirement}
          groups={choices.groups}
          classes={choices.classes}
          disabled={vision.running}
          onChange={(next) => change(requirements.map((value, at) => (at === index ? next : value)))}
          onDelete={() =>
            confirmAction({
              title: `Delete ${requirement.group.name}?`,
              onConfirm: () => change(requirements.filter((_, at) => at !== index)),
            })
          }
        />
      ))}
      <Button
        disabled={vision.running || !choices.groups.length || requirements.length >= MAX_REQUIREMENTS}
        onClick={() =>
          change([
            ...requirements,
            {
              group: choices.groups[0],
              metric: defaultTrainingMetric(vision.task),
              minScore: 0.5,
              minRealTest: 1,
              maxRegression: 0,
            },
          ])
        }
      >
        Add Requirement
      </Button>
    </section>
  );
}
